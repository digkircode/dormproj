import { randomBytes } from 'node:crypto';
import { BadRequestException, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env.schema';
import { AuthGuard } from './auth.guard';
import { OAUTH_STATE_COOKIE_NAME, OAUTH_STATE_MAX_AGE_MS } from './auth.constants';
import { RosnouIdService } from './rosnou-id.service';
import { SessionService } from './session.service';

const STATE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  path: '/',
  maxAge: OAUTH_STATE_MAX_AGE_MS,
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly rosnouId: RosnouIdService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

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
    const sessionToken = await this.sessions.sign(sessionUser);
    this.sessions.setCookie(res, sessionToken);

    res.redirect(this.config.get('FRONTEND_URL', { infer: true }));
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }

  @Post('logout')
  logout(@Res() res: Response): void {
    this.sessions.clearCookie(res);
    res.status(204).send();
  }
}
