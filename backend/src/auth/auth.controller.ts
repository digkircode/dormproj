import { randomBytes } from 'node:crypto';
import { BadRequestException, Controller, Get, Logger, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { OAUTH_STATE_COOKIE_NAME, OAUTH_STATE_MAX_AGE_MS, SESSION_COOKIE_NAME } from './auth.constants';
import { RosnouIdService } from './rosnou-id.service';
import { SessionService } from './session.service';
import type { RoleName, SessionUser } from './types';
import { syncResidentRoles } from '../users/resident-role-sync';
import { fetchUserRoles } from './fetch-user-roles';

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

  private async upsertUser(sessionUser: Omit<SessionUser, 'roles'>): Promise<void> {
    try {
      await this.prisma.user.upsert({
        where: { id: sessionUser.id },
        create: { id: sessionUser.id, fullName: sessionUser.fullName, email: sessionUser.email },
        update: { fullName: sessionUser.fullName, email: sessionUser.email },
      });
      await syncResidentRoles(this.prisma, { userId: sessionUser.id });
    } catch (error) {
      this.logger.error(`Не удалось прописать/обновить users при логине (id=${sessionUser.id})`, error instanceof Error ? error.stack : error);
    }
  }

  private async fetchRoles(userId: number): Promise<RoleName[]> {
    try {
      return await fetchUserRoles(this.prisma, userId);
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
      throw new BadRequestException('auth.invalidOAuthState');
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

  @Get('rosnou/logout')
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.sessions.revoke(req.cookies?.[SESSION_COOKIE_NAME]);
    this.sessions.clearCookie(res);
    const rosnouIdBaseUrl = this.config.get('ROSNOU_ID_BASE_URL', { infer: true });
    const redirect = encodeURIComponent(this.config.get('FRONTEND_URL', { infer: true }));
    res.redirect(`${rosnouIdBaseUrl}/logout-portal?redirect=${redirect}`);
  }
}
