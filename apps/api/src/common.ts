import {
  Catch,
  HttpException,
  Injectable,
  type ArgumentsHost,
  type ExceptionFilter,
  type OnModuleDestroy,
  type OnModuleInit,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
@Injectable()
export class Db extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 10 }) });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
export function validate<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'VALIDATION',
      message: 'Vérifiez les informations saisies.',
      details: result.error.issues,
    });
  return result.data;
}
export const uuid = (id: string) => validate(z.string().uuid(), id);
export type AuthRequest = Request & { userId: string; authSessionId: string };
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
@Catch()
export class Errors implements ExceptionFilter {
  private logger = new Logger('API');
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const requestId = randomUUID();
    let status = 500;
    let payload: Record<string, unknown> = {
      code: 'INTERNAL',
      message: 'Une erreur est survenue. Réessayez dans quelques instants.',
    };
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      payload = typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
    } else if (error instanceof Error && 'code' in error) {
      const code = (error as { code: string }).code;
      if (code === 'P2002' || code === 'P2034') {
        status = 409;
        payload = {
          code: 'CONFLICT',
          message: 'Ces données ont changé. Rechargez la page puis réessayez.',
        };
      }
    }
    if (status === 500 && typeof error === 'object' && error && 'status' in error) {
      const parserStatus = (error as { status: number }).status;
      if (parserStatus === 400 || parserStatus === 413) {
        status = parserStatus;
        payload = {
          code: parserStatus === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
          message:
            parserStatus === 413
              ? 'Le fichier dépasse la taille maximale autorisée.'
              : 'Le corps de la requête doit être un document JSON valide.',
        };
      }
    }
    if (status >= 500)
      this.logger.error({
        requestId,
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.name : 'Unknown',
        ...(error instanceof Prisma.PrismaClientKnownRequestError
          ? { databaseCode: error.code }
          : {}),
      });
    res
      .status(status)
      .json({
        error: {
          code: payload.code ?? `HTTP_${status}`,
          message: payload.message,
          details: payload.details,
          requestId,
        },
      });
  }
}
