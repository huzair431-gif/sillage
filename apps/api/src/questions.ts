import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { questionSchema } from '@sillage/shared';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Db, uuid, validate, type AuthRequest } from './common.js';
import { Library } from './library.js';
import { contentHash, Imports } from './imports.js';
@ApiTags('Questions')
@Controller()
export class QuestionsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Library) private library: Library,
    @Inject(Imports) private imports: Imports,
  ) {}
  @Post('chapters/:id/questions') async create(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { question, expectedRevision } = validate(
      z.object({ question: questionSchema, expectedRevision: z.number().int().min(0) }).strict(),
      body,
    );
    return this.imports.apply(r.userId, id, {
      questions: [question],
      mode: 'append',
      expectedRevision,
    });
  }
  @Patch('questions/:id') async update(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = validate(
      z.object({ question: questionSchema, expectedVersion: z.number().int().positive() }).strict(),
      body,
    );
    const old = await this.db.question.findFirst({
      where: {
        id: uuid(id),
        deletedAt: null,
        chapter: { deletedAt: null, subject: { userId: r.userId, deletedAt: null } },
      },
    });
    if (!old) throw new NotFoundException('Question introuvable.');
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Chapter" WHERE id=${old.chapterId}::uuid FOR UPDATE`;
      const current = await tx.question.findUniqueOrThrow({ where: { id } });
      if (current.currentVersion !== input.expectedVersion || current.deletedAt)
        throw new ConflictException('La question a été modifiée. Rechargez-la.');
      const h = contentHash(input.question);
      if (h === current.contentHash) {
        if ((input.question.externalId ?? null) !== current.externalId) {
          await tx.question.update({
            where: { id },
            data: { externalId: input.question.externalId ?? null },
          });
          await tx.chapter.update({
            where: { id: old.chapterId },
            data: { revision: { increment: 1 } },
          });
        }
        return;
      }
      const { options, image, ...fields } = input.question;
      const version = current.currentVersion + 1;
      const nextOptions = options.map((o, position) => ({ ...o, id: randomUUID(), position }));
      await tx.questionOption.deleteMany({ where: { questionId: id } });
      await tx.question.update({
        where: { id },
        data: {
          ...fields,
          image: image ? (image as Prisma.InputJsonValue) : Prisma.DbNull,
          externalId: fields.externalId ?? null,
          contentHash: h,
          currentVersion: version,
          options: { create: nextOptions },
        },
      });
      await tx.questionVersion.create({
        data: {
          questionId: id,
          version,
          contentHash: h,
          snapshot: {
            ...fields,
            ...(image ? { image } : {}),
            options: nextOptions.map(({ position, ...o }) => o),
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.memoryState.deleteMany({ where: { questionId: id } });
      await tx.chapter.update({
        where: { id: old.chapterId },
        data: { revision: { increment: 1 } },
      });
    });
    return { ok: true };
  }
  @Delete('questions/:id') async remove(@Req() r: AuthRequest, @Param('id') id: string) {
    const old = await this.db.question.findFirst({
      where: {
        id: uuid(id),
        deletedAt: null,
        chapter: { deletedAt: null, subject: { userId: r.userId, deletedAt: null } },
      },
    });
    if (!old) throw new NotFoundException('Question introuvable.');
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "Chapter" WHERE id=${old.chapterId}::uuid FOR UPDATE`;
      await tx.question.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.chapter.update({
        where: { id: old.chapterId },
        data: { revision: { increment: 1 } },
      });
    });
    return { ok: true };
  }
}
