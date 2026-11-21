import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { answerSchema, quizSchema } from '@sillage/shared';
import { randomInt, randomUUID } from 'node:crypto';
import { Db, uuid, validate, type AuthRequest } from './common.js';
import { Library } from './library.js';
import { emptyMemory, localDay, review, seeded, selectQuestions, shuffle } from './memory.js';
import type { Snapshot } from './imports.js';
const include = {
  subject: { select: { name: true } },
  chapter: { select: { title: true } },
  questions: {
    orderBy: { position: 'asc' as const },
    include: { questionVersion: true, attempt: true },
  },
} satisfies Prisma.QuizSessionInclude;
type Loaded = Prisma.QuizSessionGetPayload<{ include: typeof include }>;
type Tx = Prisma.TransactionClient;

@Injectable()
export class Quiz {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Library) private library: Library,
  ) {}
  async start(userId: string, body: unknown) {
    const input = validate(quizSchema, body);
    const chapter = input.chapterId ? await this.library.chapter(userId, input.chapterId) : null;
    const subjectId = chapter?.subjectId ?? input.subjectId!;
    await this.library.subject(userId, subjectId);
    if (input.subjectId && input.subjectId !== subjectId)
      throw new BadRequestException('Le chapitre n’appartient pas à cette matière.');
    let errors: string[] | undefined;
    if (input.onlyErrorsFrom) {
      const previous = await this.db.quizSession.findFirst({
        where: { id: input.onlyErrorsFrom, userId, status: 'COMPLETED' },
        include: {
          attempts: {
            where: { isCorrect: false, isReinforcement: false },
            select: { questionId: true },
          },
        },
      });
      if (!previous) throw new NotFoundException('Session précédente introuvable.');
      errors = previous.attempts.map((a) => a.questionId);
    }
    const questions = await this.db.question.findMany({
      where: {
        deletedAt: null,
        ...(errors ? { id: { in: errors } } : {}),
        chapter: { deletedAt: null, subjectId, ...(chapter ? { id: chapter.id } : {}) },
      },
      include: {
        memories: { where: { userId } },
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!questions.length)
      throw new BadRequestException('Ajoutez des questions avant de commencer cette session.');
    const prefs = await this.db.userPreferences.findUniqueOrThrow({ where: { userId } });
    const seed = randomInt(1, 2147483647),
      random = seeded(seed);
    const selected = selectQuestions(
      questions.map((q) => ({ ...q, memory: q.memories[0] ?? null })),
      input.count === 'all' ? questions.length : Math.min(input.count, questions.length),
      input.mode,
      localDay(new Date(), prefs.timezone),
      random,
    );
    const session = await this.db.quizSession.create({
      data: {
        userId,
        subjectId,
        chapterId: chapter?.id,
        mode: input.mode,
        seed,
        initialCount: selected.length,
        deadlineAt:
          input.mode === 'EXAM' && input.timeLimitMinutes
            ? new Date(Date.now() + input.timeLimitMinutes * 60000)
            : null,
        questions: {
          create: selected.map((q, position) => {
            const version = q.versions[0]!;
            const snapshot = version.snapshot as unknown as Snapshot;
            return {
              questionId: q.id,
              questionVersionId: version.id,
              position,
              shuffledOptionIds: shuffle(
                snapshot.options.map((o) => o.id),
                random,
              ),
            };
          }),
        },
      },
      select: { id: true },
    });
    return this.get(userId, session.id);
  }
  private dto(s: Loaded) {
    const closed = s.status === 'COMPLETED';
    const attempts = s.questions.flatMap((q) =>
      q.attempt && !q.isReinforcement ? [q.attempt] : [],
    );
    return {
      id: s.id,
      subjectId: s.subjectId,
      chapterId: s.chapterId,
      mode: s.mode,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      deadlineAt: s.deadlineAt,
      durationSeconds: s.durationSeconds,
      score: s.score,
      subjectName: s.subject.name,
      chapterTitle: s.chapter?.title ?? null,
      total: s.initialCount,
      correct: closed ? attempts.filter((a) => a.isCorrect).length : 0,
      errors: closed ? attempts.filter((a) => !a.isCorrect).length : 0,
      weakNotions: closed
        ? [
            ...new Set(
              s.questions
                .filter(
                  (q) =>
                    q.attempt &&
                    !q.isReinforcement &&
                    (!q.attempt.isCorrect || q.attempt.isGuessed),
                )
                .map((q) => (q.questionVersion.snapshot as unknown as Snapshot).notion)
                .filter(Boolean),
            ),
          ]
        : [],
      questions: s.questions.map((q) => {
        const data = q.questionVersion.snapshot as unknown as Snapshot;
        const options = q.shuffledOptionIds.map((id) => {
          const o = data.options.find((o) => o.id === id)!;
          return { id: o.id, text: o.text };
        });
        return {
          id: q.id,
          questionId: q.questionId,
          statement: data.statement,
          ...(data.image ? { image: data.image } : {}),
          type: data.type,
          notion: data.notion,
          difficulty: data.difficulty,
          options,
          isReinforcement: q.isReinforcement,
          answered: Boolean(q.attempt),
          selectedOptionIds: q.attempt?.selectedOptionIds ?? [],
          ...(q.attempt && (s.mode !== 'EXAM' || closed)
            ? {
                feedback: {
                  isCorrect: q.attempt.isCorrect,
                  selectedOptionIds: q.attempt.selectedOptionIds,
                  correctOptionIds: data.options.filter((o) => o.isCorrect).map((o) => o.id),
                  explanation: data.explanation,
                  options,
                  isGuessed: q.attempt.isGuessed,
                  acknowledged: q.attempt.isCorrect || Boolean(q.attempt.correctionAcknowledgedAt),
                },
              }
            : {}),
        };
      }),
    };
  }
  async get(userId: string, id: string, expire = true): Promise<ReturnType<Quiz['dto']>> {
    const s = await this.db.quizSession.findFirst({ where: { id: uuid(id), userId }, include });
    if (!s) throw new NotFoundException('Session introuvable.');
    if (expire && s.status === 'ACTIVE' && s.deadlineAt && s.deadlineAt.getTime() <= Date.now())
      return this.finish(userId, id);
    return this.dto(s);
  }
  private async updateMemory(
    tx: Tx,
    userId: string,
    item: Loaded['questions'][number],
    correct: boolean,
    guessed: boolean,
    now: Date,
    timezone: string,
  ) {
    if (item.isReinforcement) return;
    await tx.$executeRaw`SELECT 1 FROM "Question" WHERE id=${item.questionId}::uuid FOR UPDATE`;
    const current = await tx.question.findUniqueOrThrow({
      where: { id: item.questionId },
      select: { currentVersion: true, deletedAt: true },
    });
    // Une réponse à un ancien snapshot reste dans l'historique sans modifier la nouvelle version.
    if (current.currentVersion !== item.questionVersion.version || current.deletedAt) return;
    const previous = await tx.memoryState.findUnique({
      where: { userId_questionId: { userId, questionId: item.questionId } },
    });
    const state = review(
      previous ?? emptyMemory(),
      { correct, guessed, reinforcement: false },
      now,
      timezone,
    );
    await tx.memoryState.upsert({
      where: { userId_questionId: { userId, questionId: item.questionId } },
      create: { ...state, userId, questionId: item.questionId, version: current.currentVersion },
      update: state,
    });
  }
  async answer(userId: string, id: string, body: unknown) {
    uuid(id);
    const input = validate(answerSchema, body);
    await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "QuizSession" WHERE id=${id}::uuid AND "userId"=${userId}::uuid FOR UPDATE`;
        const session = await tx.quizSession.findFirst({ where: { id, userId }, include });
        if (!session) throw new NotFoundException('Session introuvable.');
        const replay = await tx.answerAttempt.findUnique({
          where: {
            sessionId_idempotencyKey: { sessionId: id, idempotencyKey: input.idempotencyKey },
          },
        });
        if (replay) {
          if (
            replay.sessionQuestionId !== input.sessionQuestionId ||
            replay.isGuessed !== input.isGuessed ||
            [...replay.selectedOptionIds].sort().join() !==
              [...input.selectedOptionIds].sort().join()
          )
            throw new ConflictException(
              'Cette clé d’idempotence a déjà servi pour une autre réponse.',
            );
          return;
        }
        if (
          session.mode !== 'EXAM' &&
          session.questions.some(
            (q) => q.attempt && !q.attempt.isCorrect && !q.attempt.correctionAcknowledgedAt,
          )
        )
          throw new ConflictException('Lisez et confirmez la correction avant de continuer.');
        if (session.status !== 'ACTIVE') throw new ConflictException('Cette session est terminée.');
        if (session.deadlineAt && session.deadlineAt.getTime() <= Date.now())
          throw new ConflictException({
            code: 'EXAM_EXPIRED',
            message: 'Le temps est écoulé. Terminez l’examen pour consulter les résultats.',
          });
        const item = session.questions.find((q) => q.id === input.sessionQuestionId);
        if (!item) throw new BadRequestException('Cette question n’appartient pas à la session.');
        if (item.attempt) throw new ConflictException('Cette réponse est déjà enregistrée.');
        if (session.questions.find((q) => !q.attempt)?.id !== item.id)
          throw new ConflictException('Répondez aux questions dans l’ordre de la session.');
        const data = item.questionVersion.snapshot as unknown as Snapshot;
        const ids = new Set(data.options.map((o) => o.id));
        if (
          input.selectedOptionIds.some((id) => !ids.has(id)) ||
          (data.type !== 'MULTIPLE' && input.selectedOptionIds.length > 1)
        )
          throw new BadRequestException('Choix de réponse invalides.');
        const correctIds = data.options.filter((o) => o.isCorrect).map((o) => o.id);
        const correct =
          correctIds.length === input.selectedOptionIds.length &&
          correctIds.every((id) => input.selectedOptionIds.includes(id));
        const now = new Date();
        const previousTime = Math.max(
          session.startedAt.getTime(),
          ...session.questions.flatMap((q) => (q.attempt ? [q.attempt.answeredAt.getTime()] : [])),
        );
        await tx.answerAttempt.create({
          data: {
            sessionId: id,
            sessionQuestionId: item.id,
            questionId: item.questionId,
            selectedOptionIds: input.selectedOptionIds,
            isCorrect: correct,
            isGuessed: input.isGuessed,
            isReinforcement: item.isReinforcement,
            idempotencyKey: input.idempotencyKey,
            responseTimeSeconds: Math.max(0, Math.round((now.getTime() - previousTime) / 1000)),
          },
        });
        if (session.mode !== 'EXAM') {
          const prefs = await tx.userPreferences.findUniqueOrThrow({ where: { userId } });
          await this.updateMemory(tx, userId, item, correct, input.isGuessed, now, prefs.timezone);
          if (!correct && !item.isReinforcement)
            await tx.sessionQuestion.create({
              data: {
                sessionId: id,
                questionId: item.questionId,
                questionVersionId: item.questionVersionId,
                position: session.questions.length,
                shuffledOptionIds: shuffle(
                  data.options.map((o) => o.id),
                  seeded(session.seed + session.questions.length),
                ),
                isReinforcement: true,
              },
            });
        }
      },
      { timeout: 30000 },
    );
    return this.get(userId, id, false);
  }
  async acknowledge(userId: string, id: string, itemId: string) {
    uuid(id);
    uuid(itemId);
    const attempt = await this.db.answerAttempt.findFirst({
      where: {
        sessionId: id,
        sessionQuestionId: itemId,
        session: { userId, mode: { not: 'EXAM' } },
        isCorrect: false,
      },
    });
    if (!attempt) throw new NotFoundException('Correction introuvable.');
    await this.db.answerAttempt.update({
      where: { id: attempt.id },
      data: { correctionAcknowledgedAt: new Date() },
    });
    return this.get(userId, id);
  }
  async finish(userId: string, id: string): Promise<ReturnType<Quiz['dto']>> {
    uuid(id);
    await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "QuizSession" WHERE id=${id}::uuid AND "userId"=${userId}::uuid FOR UPDATE`;
        const s = await tx.quizSession.findFirst({ where: { id, userId }, include });
        if (!s) throw new NotFoundException('Session introuvable.');
        if (s.status === 'COMPLETED') return;
        if (
          s.mode !== 'EXAM' &&
          s.questions.some(
            (q) => q.attempt && !q.attempt.isCorrect && !q.attempt.correctionAcknowledgedAt,
          )
        )
          throw new ConflictException('Confirmez la correction avant de terminer.');
        const now = new Date();
        const end = s.deadlineAt && s.deadlineAt < now ? s.deadlineAt : now;
        const prefs = await tx.userPreferences.findUniqueOrThrow({ where: { userId } });
        if (s.mode === 'EXAM')
          for (const item of s.questions) {
            let attempt = item.attempt;
            if (!attempt)
              attempt = await tx.answerAttempt.create({
                data: {
                  sessionId: id,
                  sessionQuestionId: item.id,
                  questionId: item.questionId,
                  selectedOptionIds: [],
                  isCorrect: false,
                  isGuessed: false,
                  isReinforcement: false,
                  idempotencyKey: randomUUID(),
                  answeredAt: end,
                  responseTimeSeconds: 0,
                },
              });
            await this.updateMemory(
              tx,
              userId,
              item,
              attempt.isCorrect,
              attempt.isGuessed,
              attempt.answeredAt,
              prefs.timezone,
            );
          }
        const initial = await tx.answerAttempt.findMany({
          where: { sessionId: id, isReinforcement: false },
          select: { isCorrect: true },
        });
        await tx.quizSession.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completedAt: now,
            durationSeconds: Math.max(
              0,
              Math.round((end.getTime() - s.startedAt.getTime()) / 1000),
            ),
            score: initial.length
              ? (initial.filter((a) => a.isCorrect).length / initial.length) * 100
              : null,
          },
        });
      },
      { timeout: 60000 },
    );
    return this.get(userId, id, false);
  }
}
@ApiTags('Quiz')
@Controller('quiz/sessions')
export class QuizController {
  constructor(@Inject(Quiz) private quiz: Quiz) {}
  @Post() start(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.quiz.start(r.userId, b);
  }
  @Get(':id') get(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.quiz.get(r.userId, id);
  }
  @Post(':id/answers') answer(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.quiz.answer(r.userId, id, b);
  }
  @Post(':id/corrections/:itemId/ack') acknowledge(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.quiz.acknowledge(r.userId, id, itemId);
  }
  @Post(':id/finish') finish(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.quiz.finish(r.userId, id);
  }
}
