import {
  Body,
  CanActivate,
  Controller,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Get,
  Patch,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTags, ApiBody } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { registrationSchema } from '@sillage/shared';
import { z } from 'zod';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Response } from 'express';
import { Db, hash, validate, type AuthRequest } from './common.js';
export const Public = () => SetMetadata('public', true);
const production = () => process.env.NODE_ENV === 'production';
const cookieName = () => (production() ? '__Host-sillage' : 'sillage');
const loginSchema = z
  .object({
    email: registrationSchema.shape.email,
    password: z.string().min(1).max(1024),
  })
  .strict();
function newSession() {
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  return {
    token,
    csrf,
    expiresAt,
    data: { tokenHash: hash(token), csrfHash: hash(csrf), expiresAt },
  };
}
function authenticate(
  res: Response,
  user: { id: string; name: string; email: string },
  session: ReturnType<typeof newSession>,
) {
  const options = {
    secure: production(),
    sameSite: 'lax' as const,
    path: '/',
    expires: session.expiresAt,
  };
  res.cookie(cookieName(), session.token, { ...options, httpOnly: true });
  res.cookie('sillage_csrf', session.csrf, { ...options, httpOnly: false });
  return { id: user.id, name: user.name, email: user.email, csrf: session.csrf };
}
const limits = new Map<string, { count: number; reset: number }>();
function rateLimit(key: string, max: number) {
  const now = Date.now();
  if (limits.size > 10000) for (const [k, v] of limits) if (v.reset < now) limits.delete(k);
  const record = limits.get(key);
  if (!record || record.reset < now) {
    limits.set(key, { count: 1, reset: now + 60000 });
    return;
  }
  record.count++;
  if (record.count > max)
    throw new HttpException('Trop de tentatives. Réessayez dans une minute.', 429);
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Reflector) private reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    rateLimit(`ip:${req.ip}`, 240);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== process.env.WEB_ORIGIN)
        throw new ForbiddenException('Origine non autorisée.');
    }
    if (this.reflector.getAllAndOverride<boolean>('public', [ctx.getHandler(), ctx.getClass()]))
      return true;
    const raw = req.cookies[cookieName()] as string | undefined;
    if (!raw) throw new UnauthorizedException('Connectez-vous pour continuer.');
    const session = await this.db.authSession.findUnique({ where: { tokenHash: hash(raw) } });
    if (!session || session.expiresAt.getTime() < Date.now())
      throw new UnauthorizedException('Votre session a expiré. Reconnectez-vous.');
    req.userId = session.userId;
    req.authSessionId = session.id;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = req.headers['x-csrf-token'];
      const actual = typeof csrf === 'string' ? hash(csrf) : '';
      if (
        actual.length !== session.csrfHash.length ||
        !timingSafeEqual(Buffer.from(actual), Buffer.from(session.csrfHash))
      )
        throw new ForbiddenException('Jeton de sécurité invalide. Rechargez la page.');
    }
    return true;
  }
}
@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(@Inject(Db) private db: Db) {}
  @Public()
  @Post('register')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'email', 'password'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 100 },
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 12, maxLength: 1024 },
      },
    },
  })
  async register(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = validate(registrationSchema, body);
    rateLimit(`register:${req.ip}`, 5);
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    const session = newSession();
    try {
      const user = await this.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          preferences: { create: {} },
          authSessions: { create: session.data },
        },
        select: { id: true, name: true, email: true },
      });
      return authenticate(res, user, session);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Cette adresse e-mail est déjà utilisée. Connectez-vous.');
      throw error;
    }
  }
  @Public()
  @Post('login')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', format: 'password' },
      },
    },
  })
  async login(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = validate(loginSchema, body);
    rateLimit(`login:${req.ip}`, 8);
    rateLimit(`email:${input.email}`, 8);
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    const fallback =
      '$argon2id$v=19$m=65536,t=3,p=4$MDAwMDAwMDAwMDAwMDAwMA$27HG49PFijPkYjtJ9WArpI4uKjrXXNsQGdbq9uhb3VI';
    const valid = await argon2
      .verify(user?.passwordHash ?? fallback, input.password)
      .catch(() => false);
    if (!user || !valid)
      throw new UnauthorizedException('Adresse e-mail ou mot de passe incorrect.');
    const session = newSession();
    await this.db.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.db.authSession.create({
      data: { userId: user.id, ...session.data },
    });
    return authenticate(res, user, session);
  }
  @Get('me') async me(@Req() req: AuthRequest) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, preferences: true },
    });
    const { userId: ignored, ...preferences } = user.preferences!;
    return { ...user, preferences, csrf: req.cookies.sillage_csrf };
  }
  @Patch('password') async changePassword(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = validate(
      z
        .object({
          currentPassword: z.string().min(1).max(1024),
          newPassword: z.string().min(12).max(1024),
        })
        .strict(),
      body,
    );
    rateLimit(`password:${req.userId}`, 5);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: req.userId } });
    if (!(await argon2.verify(user.passwordHash, input.currentPassword)))
      throw new UnauthorizedException('Le mot de passe actuel est incorrect.');
    const passwordHash = await argon2.hash(input.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    await this.db.$transaction([
      this.db.user.update({ where: { id: req.userId }, data: { passwordHash } }),
      this.db.authSession.deleteMany({
        where: { userId: req.userId, id: { not: req.authSessionId } },
      }),
    ]);
    return { ok: true };
  }
  @Post('logout') async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.db.authSession.deleteMany({ where: { id: req.authSessionId } });
    res.clearCookie(cookieName(), {
      path: '/',
      secure: production(),
      httpOnly: true,
      sameSite: 'lax',
    });
    res.clearCookie('sillage_csrf', { path: '/', secure: production(), sameSite: 'lax' });
    return { ok: true };
  }
}
