import { randomBytes } from 'node:crypto';
import { BadRequestException, Controller, Get, Logger, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { OAUTH_STATE_COOKIE_NAME, OAUTH_STATE_MAX_AGE_MS } from './auth.constants';
import { RosnouIdService } from './rosnou-id.service';
import { SessionService } from './session.service';
import type { RoleName, SessionUser } from './types';

const STATE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  path: '/',
  maxAge: OAUTH_STATE_MAX_AGE_MS,
};

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly rosnouId: RosnouIdService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  // Автопрописка/обновление users при каждом логине — без своего UI (см. известные
  // проблемы проекта), но именно это и есть точка входа под будущую users_roles:
  // если строки с этим id ещё нет, роли назначить некому. email/fullName берём из
  // фолбека rosnou-id (SessionUser) — другого источника личных данных сотрудника
  // (не физлица из 1С) в проекте нет. Ошибку апсёрта не даём завалить сам логин —
  // это вспомогательная прописка, не критичный для входа шаг.
  private async upsertUser(sessionUser: Omit<SessionUser, 'roles'>): Promise<void> {
    try {
      await this.prisma.user.upsert({
        where: { id: sessionUser.id },
        create: { id: sessionUser.id, fullName: sessionUser.fullName, email: sessionUser.email },
        update: { email: sessionUser.email },
      });
    } catch (error) {
      this.logger.error(`Не удалось прописать/обновить users при логине (id=${sessionUser.id})`, error instanceof Error ? error.stack : error);
    }
  }

  // Роли — снимок на момент логина, зашивается в JWT (см. types.ts) и не читается
  // из БД повторно до следующего входа. Ошибку тоже не даём завалить логин — просто
  // человек временно останется без ролей до следующего успешного запроса/логина.
  private async fetchRoles(userId: number): Promise<RoleName[]> {
    try {
      const rows = await this.prisma.userRole.findMany({ where: { userId }, include: { role: true } });
      return rows.map((row) => row.role.name as RoleName);
    } catch (error) {
      this.logger.error(`Не удалось получить роли пользователя (id=${userId})`, error instanceof Error ? error.stack : error);
      return [];
    }
  }

  @Get('rosnou/login')
  login(@Res() res: Response): void {
    const state = randomBytes(24).toString('hex');
    res.cookie(OAUTH_STATE_COOKIE_NAME, state, STATE_COOKIE_OPTIONS);
    res.redirect(this.rosnouId.buildAuthorizeUrl(state));
  }

  @Get('rosnou/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const expectedState: unknown = req.cookies?.[OAUTH_STATE_COOKIE_NAME];
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, STATE_COOKIE_OPTIONS);

    if (!code || !state || !expectedState || state !== expectedState) {
      throw new BadRequestException('Некорректный OAuth-запрос (state не совпадает)');
    }

    const accessToken = await this.rosnouId.exchangeCodeForToken(code);
    const rosnouUser = await this.rosnouId.fetchUser(accessToken);
    const sessionUser = this.sessions.toSessionUser(rosnouUser);
    await this.upsertUser(sessionUser);
    const roles = await this.fetchRoles(sessionUser.id);
    const sessionToken = await this.sessions.sign({ ...sessionUser, roles });
    this.sessions.setCookie(res, sessionToken);

    res.redirect(this.config.get('FRONTEND_URL', { infer: true }));
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }

  // Чистим только куку dormproj недостаточно — сессия на rosnou-id остаётся живой,
  // и следующий /auth/rosnou/login тут же залогинит обратно без формы входа (уже
  // одобренный клиент + активная сессия там). rosnou-id сам даёт для этого выход
  // с редиректом обратно (см. routes/web.php: logout-portal).
  @Get('rosnou/logout')
  logout(@Res() res: Response): void {
    this.sessions.clearCookie(res);
    const rosnouIdBaseUrl = this.config.get('ROSNOU_ID_BASE_URL', { infer: true });
    const redirect = encodeURIComponent(this.config.get('FRONTEND_URL', { infer: true }));
    res.redirect(`${rosnouIdBaseUrl}/logout-portal?redirect=${redirect}`);
  }
}
