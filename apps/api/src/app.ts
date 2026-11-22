import { Controller, Get, Global, Inject, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Db } from './common.js';
import { AuthController, AuthGuard, Public } from './auth.js';
import { Library, LibraryController } from './library.js';
import { ImportController, Imports } from './imports.js';
import { Quiz, QuizController } from './quiz.js';
import { BackupController } from './backups.js';
import { QuestionsController } from './questions.js';
@Global()
@Module({ providers: [Db], exports: [Db] })
class DatabaseModule {}
@Module({ controllers: [AuthController], providers: [{ provide: APP_GUARD, useClass: AuthGuard }] })
class AuthModule {}
@Global()
@Module({ controllers: [LibraryController], providers: [Library], exports: [Library] })
class LibraryModule {}
@Global()
@Module({
  controllers: [ImportController, QuestionsController],
  providers: [Imports],
  exports: [Imports],
})
class ImportsModule {}
@Module({ controllers: [QuizController], providers: [Quiz] })
class QuizModule {}
@Module({ controllers: [BackupController] })
class BackupsModule {}
@Controller()
class HealthController {
  constructor(@Inject(Db) private db: Db) {}
  @Public() @Get('health') async health() {
    // Validate the authentication schema without reading any account or session data.
    await this.db.$queryRaw`
      SELECT u."id", p."userId", s."id"
      FROM "User" AS u, "UserPreferences" AS p, "AuthSession" AS s
      LIMIT 0
    `;
    return { status: 'ok' };
  }
}
@Module({
  imports: [DatabaseModule, AuthModule, LibraryModule, ImportsModule, QuizModule, BackupsModule],
  controllers: [HealthController],
})
export class AppModule {}
