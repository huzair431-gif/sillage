import {
  Body,
  ConflictException,
  Controller,
  Inject,
  Injectable,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma, type Question } from '@prisma/client';
import { importSchema, questionSchema, type QuestionInput } from '@sillage/shared';
import { parseQuestions } from '@sillage/quiz-parser';
import { randomUUID } from 'node:crypto';
import { Db, hash, validate, type AuthRequest } from './common.js';
import { Library } from './library.js';
export type Snapshot = Omit<QuestionInput, 'options'> & {
  options: { id: string; text: string; isCorrect: boolean }[];
};
export const contentHash = (q: QuestionInput) =>
  hash(
    JSON.stringify({
      statement: q.statement.trim(),
      ...(q.image ? { image: { src: q.image.src, alt: q.image.alt } } : {}),
      type: q.type,
      notion: q.notion,
      difficulty: q.difficulty,
      explanation: q.explanation.trim(),
      options: q.options.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
    }),
  );
function readInput(body: unknown) {
  const input = validate(importSchema, body);
  const parsed = input.text !== undefined ? parseQuestions(input.text) : null;
  if (parsed?.issues.length)
    throw new UnprocessableEntityException({
      code: 'IMPORT_INVALID',
      message: 'Corrigez les erreurs du lot avant l’importation.',
      details: parsed.issues,
    });
  const questions = input.questions ?? parsed!.questions;
  if (!questions.length || questions.length > 5000)
    throw new UnprocessableEntityException('Le lot doit contenir entre 1 et 5 000 questions.');
  const ids = new Set<string>(),
    hashes = new Set<string>();
  for (const q of questions) {
    const h = contentHash(q);
    if ((q.externalId && ids.has(q.externalId)) || hashes.has(h))
      throw new UnprocessableEntityException(
        'Le lot contient un identifiant ou un contenu dupliqué.',
      );
    if (q.externalId) ids.add(q.externalId);
    hashes.add(h);
  }
  return { ...input, questions };
}
type Match = {
  input: QuestionInput;
  existing: Question | undefined;
  action: 'added' | 'changed' | 'kept';
};
function diff(questions: QuestionInput[], existing: Question[], mode: string) {
  const matched = new Set<string>();
  const entries: Match[] = questions.map((input) => {
    const h = contentHash(input);
    let candidates = input.externalId
      ? existing.filter((e) => e.externalId === input.externalId)
      : existing.filter((e) => e.contentHash === h && !e.deletedAt);
    if (candidates.length > 1)
      throw new ConflictException(
        'Rapprochement ambigu : attribuez des identifiants ID: aux questions concernées.',
      );
    const old = candidates[0];
    if (old && matched.has(old.id))
      throw new ConflictException('Deux questions correspondent à la même question existante.');
    if (old) matched.add(old.id);
    return {
      input,
      existing: old,
      action: !old || old.deletedAt ? 'added' : old.contentHash === h ? 'kept' : 'changed',
    };
  });
  const removed =
    mode === 'replace' ? existing.filter((e) => !e.deletedAt && !matched.has(e.id)) : [];
  if (mode === 'append' && entries.some((e) => e.action === 'changed'))
    throw new ConflictException(
      'Un identifiant existe avec un contenu différent. Utilisez « Remplacer le lot » pour modifier les questions existantes.',
    );
  return {
    entries,
    removed,
    summary: {
      added: entries.filter((e) => e.action === 'added').length,
      changed: entries.filter((e) => e.action === 'changed').length,
      kept: entries.filter((e) => e.action === 'kept').length,
      removed: removed.length,
    },
  };
}
@Injectable()
export class Imports {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Library) private library: Library,
  ) {}
  async preview(userId: string, id: string, body: unknown) {
    const chapter = await this.library.chapter(userId, id);
    const input = readInput(body);
    const existing = await this.db.question.findMany({ where: { chapterId: id } });
    const result = diff(input.questions, existing, input.mode);
    return {
      revision: chapter.revision,
      questions: input.questions,
      summary: result.summary,
      changes: [
        ...result.entries.map((e) => ({ statement: e.input.statement, action: e.action })),
        ...result.removed.map((e) => ({ statement: e.statement, action: 'removed' })),
      ],
    };
  }
  async apply(userId: string, id: string, body: unknown) {
    await this.library.chapter(userId, id);
    const input = readInput(body);
    if (input.expectedRevision === undefined)
      throw new ConflictException('Prévisualisez le lot avant de le confirmer.');
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "Chapter" WHERE id=${id}::uuid FOR UPDATE`;
        const chapter = await tx.chapter.findFirst({
          where: { id, deletedAt: null, subject: { userId, deletedAt: null } },
        });
        if (!chapter || chapter.revision !== input.expectedRevision)
          throw new ConflictException(
            'Le chapitre a changé depuis la prévisualisation. Prévisualisez à nouveau.',
          );
        const existing = await tx.question.findMany({ where: { chapterId: id } });
        const result = diff(input.questions, existing, input.mode);
        let position =
          input.mode === 'replace' ? 0 : Math.max(-1, ...existing.map((e) => e.position)) + 1;
        for (const entry of result.entries) {
          const q = entry.input;
          const old = entry.existing;
          const h = contentHash(q);
          if (entry.action === 'kept') {
            if (input.mode === 'replace')
              await tx.question.update({ where: { id: old!.id }, data: { position: position++ } });
            continue;
          }
          const questionId = old?.id ?? randomUUID();
          const version = (old?.currentVersion ?? 0) + 1;
          const options = q.options.map((o, i) => ({ ...o, id: randomUUID(), position: i }));
          const { options: ignored, image, ...fields } = q;
          const storedImage = image ? (image as Prisma.InputJsonValue) : Prisma.DbNull;
          if (old) {
            await tx.questionOption.deleteMany({ where: { questionId } });
            await tx.question.update({
              where: { id: questionId },
              data: {
                ...fields,
                image: storedImage,
                contentHash: h,
                currentVersion: version,
                deletedAt: null,
                position: input.mode === 'replace' ? position++ : old.position,
                options: { create: options },
              },
            });
            await tx.memoryState.deleteMany({ where: { questionId } });
          } else
            await tx.question.create({
              data: {
                id: questionId,
                ...fields,
                image: storedImage,
                chapterId: id,
                contentHash: h,
                currentVersion: version,
                position: position++,
                options: { create: options },
              },
            });
          const snapshot: Snapshot = {
            ...fields,
            ...(image ? { image } : {}),
            options: options.map(({ position, ...o }) => o),
          };
          await tx.questionVersion.create({
            data: {
              questionId,
              version,
              contentHash: h,
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
            },
          });
        }
        if (result.removed.length)
          await tx.question.updateMany({
            where: { id: { in: result.removed.map((q) => q.id) } },
            data: { deletedAt: new Date() },
          });
        await tx.chapter.update({ where: { id }, data: { revision: { increment: 1 } } });
        const batch = await tx.importBatch.create({
          data: {
            userId,
            chapterId: id,
            mode: input.mode,
            questionCount: input.questions.length,
            summary: result.summary,
          },
        });
        return { id: batch.id, summary: result.summary, revision: chapter.revision + 1 };
      },
      { timeout: 60000, maxWait: 10000 },
    );
  }
}
@ApiTags('Importation')
@Controller('chapters/:id/imports')
export class ImportController {
  constructor(@Inject(Imports) private imports: Imports) {}
  @Post('preview') preview(@Req() r: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.imports.preview(r.userId, id, body);
  }
  @Post('commit') apply(@Req() r: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.imports.apply(r.userId, id, body);
  }
}
