import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { preferencesSchema, questionImageSchema, questionSchema } from '@sillage/shared';
import { randomBytes, randomUUID } from 'node:crypto';
import { Db, hash, validate, type AuthRequest } from './common.js';
import { contentHash } from './imports.js';
const id = z.string().uuid(),
  dt = z.iso.datetime(),
  date = z.iso.date(),
  nullableDate = z.union([dt, date]).nullable();
const position = z.number().int().min(0),
  counter = z.number().int().min(0),
  str = z.string().max(50000);
const snapshot = questionSchema.safeExtend({
  options: z
    .array(z.object({ id, text: z.string().min(1).max(15000), isCorrect: z.boolean() }).strict())
    .min(2)
    .max(12),
});
export const backupSchema = z
  .object({
    format: z.literal('sillage'),
    version: z.literal(1),
    exportedAt: dt,
    preferences: preferencesSchema,
    subjects: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(160),
            description: str,
            color: z.string().max(30),
            examDate: nullableDate,
            createdAt: dt,
            updatedAt: dt,
            deletedAt: dt.nullable(),
          })
          .strict(),
      )
      .max(500),
    chapters: z
      .array(
        z
          .object({
            id,
            subjectId: id,
            title: z.string().min(1).max(200),
            position,
            revision: counter,
            createdAt: dt,
            updatedAt: dt,
            deletedAt: dt.nullable(),
          })
          .strict(),
      )
      .max(10000),
    questions: z
      .array(
        z
          .object({
            id,
            chapterId: id,
            externalId: z.string().max(150).nullable(),
            type: z.enum(['SINGLE', 'MULTIPLE', 'TRUE_FALSE']),
            notion: z.string().max(200),
            difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
            statement: str,
            image: questionImageSchema.nullish(),
            explanation: str,
            contentHash: z.string().length(64),
            currentVersion: z.number().int().positive(),
            position,
            createdAt: dt,
            updatedAt: dt,
            deletedAt: dt.nullable(),
          })
          .strict(),
      )
      .max(100000),
    options: z
      .array(z.object({ id, questionId: id, text: str, position, isCorrect: z.boolean() }).strict())
      .max(1000000),
    versions: z
      .array(
        z
          .object({
            id,
            questionId: id,
            version: z.number().int().positive(),
            contentHash: z.string().length(64),
            snapshot,
            createdAt: dt,
          })
          .strict(),
      )
      .max(1000000),
    sessions: z
      .array(
        z
          .object({
            id,
            subjectId: id,
            chapterId: id.nullable(),
            mode: z.enum(['DISCOVERY', 'REVISION', 'EXAM']),
            status: z.enum(['ACTIVE', 'COMPLETED']),
            seed: z.number().int(),
            initialCount: counter,
            startedAt: dt,
            deadlineAt: dt.nullable(),
            completedAt: dt.nullable(),
            durationSeconds: counter.nullable(),
            score: z.number().min(0).max(100).nullable(),
          })
          .strict(),
      )
      .max(100000),
    sessionQuestions: z
      .array(
        z
          .object({
            id,
            sessionId: id,
            questionId: id,
            questionVersionId: id,
            position,
            shuffledOptionIds: z.array(id).min(2).max(12),
            isReinforcement: z.boolean(),
          })
          .strict(),
      )
      .max(1000000),
    attempts: z
      .array(
        z
          .object({
            id,
            sessionId: id,
            sessionQuestionId: id,
            questionId: id,
            selectedOptionIds: z.array(id).max(12),
            isCorrect: z.boolean(),
            isGuessed: z.boolean(),
            isReinforcement: z.boolean(),
            idempotencyKey: id,
            answeredAt: dt,
            correctionAcknowledgedAt: dt.nullable(),
            responseTimeSeconds: counter,
          })
          .strict(),
      )
      .max(1000000),
    memories: z
      .array(
        z
          .object({
            id,
            questionId: id,
            version: z.number().int().positive(),
            status: z.enum(['NEW', 'FRAGILE', 'CONSOLIDATING', 'MASTERED']),
            successCount: counter,
            failureCount: counter,
            reliableStreak: counter,
            lastReviewedAt: dt.nullable(),
            lastReliableSuccessDate: nullableDate,
            nextReviewAt: nullableDate,
            lastFailureAt: dt.nullable(),
          })
          .strict(),
      )
      .max(100000),
    imports: z
      .array(
        z
          .object({
            id,
            chapterId: id,
            mode: z.enum(['append', 'replace']),
            questionCount: counter,
            summary: z
              .object({ added: counter, changed: counter, kept: counter, removed: counter })
              .strict(),
            createdAt: dt,
          })
          .strict(),
      )
      .max(100000),
  })
  .strict();
type Backup = z.infer<typeof backupSchema>;
function check(b: Backup) {
  const map = <T extends { id: string }>(items: T[]) => {
    const m = new Map(items.map((x) => [x.id, x]));
    if (m.size !== items.length)
      throw new BadRequestException('Identifiants dupliqués dans la sauvegarde.');
    return m;
  };
  const subjects = map(b.subjects),
    chapters = map(b.chapters),
    questions = map(b.questions),
    versions = map(b.versions),
    sessions = map(b.sessions),
    sq = map(b.sessionQuestions);
  map(b.options);
  map(b.attempts);
  map(b.memories);
  map(b.imports);
  const assert = (condition: unknown) => {
    if (!condition)
      throw new BadRequestException(
        'La sauvegarde contient des relations ou des résultats incohérents.',
      );
  };
  for (const c of b.chapters) assert(subjects.has(c.subjectId));
  for (const q of b.questions) {
    assert(chapters.has(q.chapterId));
    const current = b.versions.find((v) => v.questionId === q.id && v.version === q.currentVersion);
    assert(current && current.contentHash === q.contentHash);
  }
  for (const v of b.versions) {
    assert(questions.has(v.questionId));
    assert(contentHash(v.snapshot) === v.contentHash);
  }
  for (const o of b.options) assert(questions.has(o.questionId));
  for (const s of b.sessions)
    assert(
      subjects.has(s.subjectId) &&
        (!s.chapterId || chapters.get(s.chapterId)?.subjectId === s.subjectId),
    );
  for (const item of b.sessionQuestions) {
    const v = versions.get(item.questionVersionId);
    assert(
      sessions.has(item.sessionId) &&
        v?.questionId === item.questionId &&
        questions.has(item.questionId),
    );
    assert(
      v &&
        new Set(item.shuffledOptionIds).size === v.snapshot.options.length &&
        v.snapshot.options.every((o) => item.shuffledOptionIds.includes(o.id)),
    );
  }
  for (const a of b.attempts) {
    const item = sq.get(a.sessionQuestionId);
    const data = item ? versions.get(item.questionVersionId)?.snapshot : null;
    assert(
      item?.sessionId === a.sessionId &&
        item.questionId === a.questionId &&
        item.isReinforcement === a.isReinforcement,
    );
    assert(data && a.selectedOptionIds.every((id) => data.options.some((o) => o.id === id)));
    const correct = data?.options.filter((o) => o.isCorrect).map((o) => o.id) ?? [];
    assert(
      a.isCorrect ===
        (correct.length === a.selectedOptionIds.length &&
          correct.every((id) => a.selectedOptionIds.includes(id))),
    );
  }
  for (const m of b.memories) assert(questions.get(m.questionId)?.currentVersion === m.version);
  for (const i of b.imports) assert(chapters.has(i.chapterId));
}
@ApiTags('Sauvegardes')
@Controller('backups')
export class BackupController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('export') async export(@Req() r: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const userId = r.userId;
    const data = await this.db.$transaction(
      async (tx) => {
        const [
          preferences,
          subjects,
          chapters,
          questions,
          options,
          versions,
          sessions,
          sessionQuestions,
          attempts,
          memories,
          imports,
        ] = await Promise.all([
          tx.userPreferences.findUniqueOrThrow({ where: { userId } }),
          tx.subject.findMany({ where: { userId } }),
          tx.chapter.findMany({ where: { subject: { userId } } }),
          tx.question.findMany({ where: { chapter: { subject: { userId } } } }),
          tx.questionOption.findMany({ where: { question: { chapter: { subject: { userId } } } } }),
          tx.questionVersion.findMany({
            where: { question: { chapter: { subject: { userId } } } },
          }),
          tx.quizSession.findMany({ where: { userId } }),
          tx.sessionQuestion.findMany({ where: { session: { userId } } }),
          tx.answerAttempt.findMany({ where: { session: { userId } } }),
          tx.memoryState.findMany({ where: { userId } }),
          tx.importBatch.findMany({ where: { userId } }),
        ]);
        const omitUser = <T extends { userId: string }>(v: T) => {
          const { userId, ...rest } = v;
          return rest;
        };
        return {
          format: 'sillage',
          version: 1,
          exportedAt: new Date().toISOString(),
          preferences: omitUser(preferences),
          subjects: subjects.map(omitUser),
          chapters,
          questions,
          options,
          versions,
          sessions: sessions.map(omitUser),
          sessionQuestions,
          attempts,
          memories: memories.map(omitUser),
          imports: imports.map(omitUser),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sillage-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    return data;
  }
  @Post('validate') async validateBackup(@Req() r: AuthRequest, @Body() body: unknown) {
    const data = validate(backupSchema, body);
    check(data);
    const token = randomBytes(32).toString('hex');
    await this.db.restoreToken.deleteMany({ where: { userId: r.userId } });
    await this.db.restoreToken.create({
      data: {
        userId: r.userId,
        tokenHash: hash(token),
        dataHash: hash(JSON.stringify(data)),
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });
    return {
      token,
      subjects: data.subjects.length,
      chapters: data.chapters.length,
      questions: data.questions.length,
      sessions: data.sessions.length,
      message:
        'La restauration remplacera toutes vos données. Votre compte et votre mot de passe seront conservés.',
    };
  }
  @Post('restore') async restore(@Req() r: AuthRequest, @Body() body: unknown) {
    const input = validate(
      z
        .object({
          data: backupSchema,
          token: z.string().length(64),
          confirmation: z.literal('REMPLACER MES DONNÉES'),
        })
        .strict(),
      body,
    );
    check(input.data);
    const b = input.data;
    const map = new Map<string, string>();
    const remap = (old: string) => {
      let value = map.get(old);
      if (!value) {
        value = randomUUID();
        map.set(old, value);
      }
      return value;
    };
    const dates = <T extends object>(record: T): T =>
      Object.fromEntries(
        Object.entries(record).map(([k, v]) => [
          k,
          (k.endsWith('At') || k === 'examDate' || k === 'lastReliableSuccessDate') &&
          typeof v === 'string'
            ? new Date(v)
            : v,
        ]),
      ) as T;
    await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "User" WHERE id=${r.userId}::uuid FOR UPDATE`;
        const token = await tx.restoreToken.findUnique({ where: { tokenHash: hash(input.token) } });
        if (
          !token ||
          token.userId !== r.userId ||
          token.expiresAt.getTime() < Date.now() ||
          token.dataHash !== hash(JSON.stringify(b))
        )
          throw new ConflictException(
            'La validation de restauration a expiré. Validez à nouveau le fichier.',
          );
        await tx.quizSession.deleteMany({ where: { userId: r.userId } });
        await tx.subject.deleteMany({ where: { userId: r.userId } });
        await tx.subject.createMany({
          data: b.subjects.map((s) => ({ ...dates(s), id: remap(s.id), userId: r.userId })),
        });
        await tx.chapter.createMany({
          data: b.chapters.map((c) => ({
            ...dates(c),
            id: remap(c.id),
            subjectId: remap(c.subjectId),
          })),
        });
        await tx.question.createMany({
          data: b.questions.map((q) => ({
            ...dates(q),
            image: q.image ? (q.image as Prisma.InputJsonValue) : Prisma.DbNull,
            id: remap(q.id),
            chapterId: remap(q.chapterId),
          })),
        });
        await tx.questionOption.createMany({
          data: b.options.map((o) => ({ ...o, id: remap(o.id), questionId: remap(o.questionId) })),
        });
        await tx.questionVersion.createMany({
          data: b.versions.map((v) => ({
            ...dates(v),
            id: remap(v.id),
            questionId: remap(v.questionId),
            snapshot: {
              ...v.snapshot,
              options: v.snapshot.options.map((o) => ({ ...o, id: remap(o.id) })),
            } as Prisma.InputJsonValue,
          })),
        });
        await tx.quizSession.createMany({
          data: b.sessions.map((s) => ({
            ...dates(s),
            id: remap(s.id),
            userId: r.userId,
            subjectId: remap(s.subjectId),
            chapterId: s.chapterId ? remap(s.chapterId) : null,
          })),
        });
        await tx.sessionQuestion.createMany({
          data: b.sessionQuestions.map((q) => ({
            ...q,
            id: remap(q.id),
            sessionId: remap(q.sessionId),
            questionId: remap(q.questionId),
            questionVersionId: remap(q.questionVersionId),
            shuffledOptionIds: q.shuffledOptionIds.map(remap),
          })),
        });
        await tx.answerAttempt.createMany({
          data: b.attempts.map((a) => ({
            ...dates(a),
            id: remap(a.id),
            sessionId: remap(a.sessionId),
            sessionQuestionId: remap(a.sessionQuestionId),
            questionId: remap(a.questionId),
            selectedOptionIds: a.selectedOptionIds.map(remap),
            idempotencyKey: remap(a.idempotencyKey),
          })),
        });
        await tx.memoryState.createMany({
          data: b.memories.map((m) => ({
            ...dates(m),
            id: remap(m.id),
            userId: r.userId,
            questionId: remap(m.questionId),
          })),
        });
        await tx.importBatch.createMany({
          data: b.imports.map((i) => ({
            ...dates(i),
            id: remap(i.id),
            chapterId: remap(i.chapterId),
            userId: r.userId,
            summary: i.summary,
          })),
        });
        await tx.userPreferences.update({ where: { userId: r.userId }, data: b.preferences });
        await tx.restoreToken.deleteMany({ where: { userId: r.userId } });
      },
      { timeout: 120000 },
    );
    return { ok: true };
  }
}
