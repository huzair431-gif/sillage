import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  json,
  static as serveStatic,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { AppModule } from './app.js';
import { Errors } from './common.js';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });
export async function bootstrap() {
  if (!process.env.DATABASE_URL || !process.env.WEB_ORIGIN) {
    const missing = ['DATABASE_URL', 'WEB_ORIGIN'].filter((name) => !process.env[name]);
    throw new Error(`Variables d’environnement obligatoires absentes ou vides : ${missing.join(', ')}.`);
  }
  if (process.env.NODE_ENV === 'production' && !process.env.WEB_ORIGIN.startsWith('https://'))
    throw new Error('WEB_ORIGIN doit utiliser HTTPS en production.');
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ['error', 'warn', 'log'],
    forceCloseConnections: true,
  });
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  express.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          ...(process.env.NODE_ENV !== 'production' ? { upgradeInsecureRequests: null } : {}),
        },
      },
    }),
  );
  app.use(json({ limit: '32mb' }));
  app.use(cookieParser());
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
  app.useGlobalFilters(new Errors());
  if (process.env.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Sillage API')
        .setDescription(
          'API privée. Cookies de session et en-tête X-CSRF-Token pour toute mutation. Voir docs/API.md pour les contrats.',
        )
        .setVersion('1.0')
        .addCookieAuth(process.env.NODE_ENV === 'production' ? '__Host-sillage' : 'sillage')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }
  const web = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(resolve(web, 'index.html'))) {
    express.use(serveStatic(web));
    express.get('/{*path}', (req: Request, res: Response, next: NextFunction) =>
      req.path.startsWith('/api/') ? next() : res.sendFile(resolve(web, 'index.html')),
    );
  }
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.PORT ?? 3001),
    '127.0.0.1' === process.env.HOST ? '127.0.0.1' : '0.0.0.0',
  );
  return app;
}
if (process.env.SILLAGE_NO_LISTEN !== '1') await bootstrap();
