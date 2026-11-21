import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ConflictException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { chapterSchema, preferencesSchema, subjectSchema, type Stats } from '@sillage/shared';
import { Db, pageSchema, uuid, validate, type AuthRequest } from './common.js';
import { localDay, dateOnly, addDays } from './memory.js';
type ScoreRow = {
  chapterId: string;
  subjectId: string;
  sessionId: string;
  at: Date;
  correct: number;
  total: number;
};
type MemoryRow = { status: string; lastReviewedAt: Date | null; nextReviewAt: Date | null };
type StatQuestion = { id: string; notion: string; memories: MemoryRow[] };
export function summarize(
  questions: StatQuestion[],
  today: string,
  scores: { correct: number; total: number; at: Date }[],
): Stats {
  const states = questions.map((q) => q.memories[0]);
  const total = questions.length;
  const seen = states.filter((m) => m?.lastReviewedAt).length;
  const mastered = states.filter((m) => m?.status === 'MASTERED').length;
  const evaluated = scores
    .filter((s) => s.total > 0)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    total,
    seen,
    mastered,
    fragile: states.filter((m) => m?.status === 'FRAGILE').length,
    consolidating: states.filter((m) => m?.status === 'CONSOLIDATING').length,
    fresh: states.filter((m) => !m || m.status === 'NEW').length,
    due: states.filter((m) => m?.nextReviewAt && dateOnly(m.nextReviewAt) <= today).length,
    coverage: total ? Math.round((seen / total) * 100) : 0,
    mastery: total ? Math.round((mastered / total) * 100) : 0,
    lastScore: evaluated[0] ? Math.round((evaluated[0].correct / evaluated[0].total) * 100) : null,
    bestScore: evaluated.length
      ? Math.round(Math.max(...evaluated.map((s) => (s.correct / s.total) * 100)))
      : null,
  };
}
@Injectable()
export class Library {
  constructor(@Inject(Db) readonly db: Db) {}
  async subject(userId: string, id: string) {
    const value = await this.db.subject.findFirst({
      where: { id: uuid(id), userId, deletedAt: null },
    });
    if (!value) throw new NotFoundException('Matière introuvable.');
    return value;
  }
  async chapter(userId: string, id: string) {
    const value = await this.db.chapter.findFirst({
      where: { id: uuid(id), deletedAt: null, subject: { userId, deletedAt: null } },
      include: { subject: true },
    });
    if (!value) throw new NotFoundException('Chapitre introuvable.');
    return value;
  }
  async overview(userId: string) {
    const [subjects, prefs, scores] = await Promise.all([
      this.db.subject.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: {
          chapters: {
            where: { deletedAt: null },
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            include: {
              questions: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  notion: true,
                  memories: {
                    where: { userId },
                    select: { status: true, lastReviewedAt: true, nextReviewAt: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.db.userPreferences.findUniqueOrThrow({ where: { userId } }),
      this.db.$queryRaw<
        ScoreRow[]
      >`SELECT q."chapterId",c."subjectId",a."sessionId",max(s."startedAt") as at, sum(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END)::int as correct,count(*)::int as total FROM "AnswerAttempt" a JOIN "QuizSession" s ON s.id=a."sessionId" JOIN "Question" q ON q.id=a."questionId" JOIN "Chapter" c ON c.id=q."chapterId" JOIN "Subject" sub ON sub.id=c."subjectId" JOIN "SessionQuestion" sq ON sq.id=a."sessionQuestionId" JOIN "QuestionVersion" v ON v.id=sq."questionVersionId" WHERE s."userId"=${userId}::uuid AND s.status='COMPLETED' AND NOT a."isReinforcement" AND q."deletedAt" IS NULL AND c."deletedAt" IS NULL AND sub."deletedAt" IS NULL AND v.version=q."currentVersion" GROUP BY q."chapterId",c."subjectId",a."sessionId"`,
    ]);
    const today = localDay(new Date(), prefs.timezone);
    const combine = (rows: ScoreRow[]) => {
      const map = new Map<string, { correct: number; total: number; at: Date }>();
      for (const row of rows) {
        const old = map.get(row.sessionId);
        map.set(row.sessionId, {
          correct: (old?.correct ?? 0) + row.correct,
          total: (old?.total ?? 0) + row.total,
          at: row.at,
        });
      }
      return [...map.values()];
    };
    const data = subjects.map((s) => ({
      ...s,
      chaptersCount: s.chapters.length,
      stats: summarize(
        s.chapters.flatMap((c) => c.questions),
        today,
        combine(scores.filter((r) => r.subjectId === s.id)),
      ),
      chapters: s.chapters.map((c) => ({
        ...c,
        questions: undefined,
        stats: summarize(
          c.questions,
          today,
          scores.filter((r) => r.chapterId === c.id),
        ),
      })),
    }));
    const all = subjects.flatMap((s) => s.chapters.flatMap((c) => c.questions));
    const notions = [...Map.groupBy(all, (q) => q.notion || 'Sans notion')]
      .map(([name, qs]) => ({ name, stats: summarize(qs, today, []) }))
      .sort((a, b) => b.stats.fragile - a.stats.fragile);
    return { subjects: data, stats: summarize(all, today, combine(scores)), notions, today };
  }
  async recent(userId: string, page = 1, limit = 20, chapterId?: string) {
    const where = {
      userId,
      ...(chapterId ? { questions: { some: { question: { chapterId } } } } : {}),
    };
    const [sessions, total] = await Promise.all([
      this.db.quizSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          subject: { select: { name: true } },
          chapter: { select: { title: true } },
          attempts: { where: { isReinforcement: false }, select: { isCorrect: true } },
        },
      }),
      this.db.quizSession.count({ where }),
    ]);
    return {
      total,
      page,
      items: sessions.map((s) => ({
        id: s.id,
        mode: s.mode,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        score: s.score,
        subjectName: s.subject.name,
        chapterTitle: s.chapter?.title ?? null,
        total: s.initialCount,
        correct: s.status === 'COMPLETED' ? s.attempts.filter((a) => a.isCorrect).length : 0,
        errors: s.status === 'COMPLETED' ? s.attempts.filter((a) => !a.isCorrect).length : 0,
        durationSeconds: s.durationSeconds,
      })),
    };
  }
}
@ApiTags('Bibliothèque')
@Controller()
export class LibraryController {
  constructor(
    @Inject(Library) private library: Library,
    @Inject(Db) private db: Db,
  ) {}
  @Get('subjects') async subjects(@Req() r: AuthRequest) {
    return (await this.library.overview(r.userId)).subjects;
  }
  @Post('subjects') async createSubject(@Req() r: AuthRequest, @Body() body: unknown) {
    const input = validate(subjectSchema, body);
    return this.db.subject.create({
      data: {
        ...input,
        examDate: input.examDate ? new Date(input.examDate) : null,
        userId: r.userId,
      },
    });
  }
  @Get('subjects/:id') async getSubject(@Req() r: AuthRequest, @Param('id') id: string) {
    await this.library.subject(r.userId, id);
    return (await this.library.overview(r.userId)).subjects.find((s) => s.id === id);
  }
  @Patch('subjects/:id') async editSubject(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.library.subject(r.userId, id);
    const input = validate(subjectSchema, body);
    return this.db.subject.update({
      where: { id },
      data: { ...input, examDate: input.examDate ? new Date(input.examDate) : null },
    });
  }
  @Delete('subjects/:id') async deleteSubject(@Req() r: AuthRequest, @Param('id') id: string) {
    await this.library.subject(r.userId, id);
    await this.db.subject.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
  @Get('subjects/:id/chapters') async chapters(@Req() r: AuthRequest, @Param('id') id: string) {
    await this.library.subject(r.userId, id);
    return (await this.library.overview(r.userId)).subjects.find((s) => s.id === id)!.chapters;
  }
  @Post('subjects/:id/chapters') async createChapter(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.library.subject(r.userId, id);
    const input = validate(chapterSchema, body);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Subject" WHERE id=${id}::uuid FOR UPDATE`;
      const last = await tx.chapter.aggregate({
        where: { subjectId: id },
        _max: { position: true },
      });
      return tx.chapter.create({
        data: { ...input, subjectId: id, position: (last._max.position ?? -1) + 1 },
      });
    });
  }
  @Patch('subjects/:id/chapters/order') async reorder(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.library.subject(r.userId, id);
    const { ids } = validate(
      z.object({ ids: z.array(z.string().uuid()).max(1000) }).strict(),
      body,
    );
    const chapters = await this.db.chapter.findMany({
      where: { subjectId: id, deletedAt: null },
      select: { id: true },
    });
    if (
      ids.length !== chapters.length ||
      new Set(ids).size !== ids.length ||
      chapters.some((c) => !ids.includes(c.id))
    )
      throw new ConflictException('La liste des chapitres a changé.');
    await this.db.$transaction(
      ids.map((c, position) => this.db.chapter.update({ where: { id: c }, data: { position } })),
    );
    return { ok: true };
  }
  @Get('chapters/:id') async getChapter(@Req() r: AuthRequest, @Param('id') id: string) {
    const c = await this.library.chapter(r.userId, id);
    const s = (await this.library.overview(r.userId)).subjects.find((s) => s.id === c.subjectId)!;
    return {
      ...s.chapters.find((ch) => ch.id === id),
      subject: { id: s.id, name: s.name, color: s.color },
    };
  }
  @Patch('chapters/:id') async editChapter(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.library.chapter(r.userId, id);
    return this.db.chapter.update({ where: { id }, data: validate(chapterSchema, body) });
  }
  @Delete('chapters/:id') async deleteChapter(@Req() r: AuthRequest, @Param('id') id: string) {
    await this.library.chapter(r.userId, id);
    await this.db.chapter.update({
      where: { id },
      data: { deletedAt: new Date(), revision: { increment: 1 } },
    });
    return { ok: true };
  }
  @Get('chapters/:id/questions') async questions(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    await this.library.chapter(r.userId, id);
    const { page, limit } = validate(pageSchema, query);
    const where = { chapterId: id, deletedAt: null };
    const [items, total] = await Promise.all([
      this.db.question.findMany({
        where,
        orderBy: { position: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          options: { orderBy: { position: 'asc' } },
          memories: { where: { userId: r.userId } },
        },
      }),
      this.db.question.count({ where }),
    ]);
    return {
      page,
      total,
      items: items.map((q) => ({
        ...q,
        memories: undefined,
        memoryStatus: q.memories[0]?.status ?? 'NEW',
        nextReviewAt: q.memories[0]?.nextReviewAt ?? null,
        options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
      })),
    };
  }
  @Get('questions/:id/history') async questionHistory(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    const q = await this.db.question.findFirst({
      where: { id: uuid(id), chapter: { subject: { userId: r.userId } } },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!q) throw new NotFoundException('Question introuvable.');
    const attempts = await this.db.answerAttempt.findMany({
      where: { questionId: id, session: { userId: r.userId, status: 'COMPLETED' } },
      orderBy: { answeredAt: 'desc' },
      take: 100,
      include: { sessionQuestion: { select: { questionVersionId: true } } },
    });
    return { versions: q.versions, attempts };
  }
  @Get('dashboard') async dashboard(@Req() r: AuthRequest) {
    const [overview, recent] = await Promise.all([
      this.library.overview(r.userId),
      this.library.recent(r.userId, 1, 6),
    ]);
    return { ...overview, recent: recent.items };
  }
  @Get('statistics') async statistics(@Req() r: AuthRequest) {
    const overview = await this.library.overview(r.userId);
    const prefs = await this.db.userPreferences.findUniqueOrThrow({ where: { userId: r.userId } });
    const since = dateOnly(addDays(localDay(new Date(), prefs.timezone), -27));
    const activity = await this.db.$queryRaw<
      { day: string; answers: number; correct: number }[]
    >`SELECT to_char((a."answeredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${prefs.timezone},'YYYY-MM-DD') as day,count(*)::int as answers,sum(CASE WHEN a."isCorrect" THEN 1 ELSE 0 END)::int as correct FROM "AnswerAttempt" a JOIN "QuizSession" s ON s.id=a."sessionId" WHERE s."userId"=${r.userId}::uuid AND NOT a."isReinforcement" AND s.status='COMPLETED' AND a."answeredAt">=((${since}::timestamp AT TIME ZONE ${prefs.timezone}) AT TIME ZONE 'UTC') GROUP BY day ORDER BY day`;
    return { ...overview, activity };
  }
  @Get('sessions') async sessions(@Req() r: AuthRequest, @Query() query: unknown) {
    const { page, limit, chapterId } = validate(
      pageSchema.extend({ chapterId: z.string().uuid().optional() }),
      query,
    );
    if (chapterId) await this.library.chapter(r.userId, chapterId);
    return this.library.recent(r.userId, page, limit, chapterId);
  }
  @Get('preferences') async preferences(@Req() r: AuthRequest) {
    const { userId, ...p } = await this.db.userPreferences.findUniqueOrThrow({
      where: { userId: r.userId },
    });
    return p;
  }
  @Patch('preferences') async updatePreferences(@Req() r: AuthRequest, @Body() body: unknown) {
    return this.db.userPreferences.update({
      where: { userId: r.userId },
      data: validate(preferencesSchema, body),
    });
  }
}
