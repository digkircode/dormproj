import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS, SESSION_TTL } from './auth.constants';
import type { RosnouIdUser, SessionUser } from './types';

// Secure: false — пока dormproj живёт по http:// на голом IP, без домена/TLS
// (см. CONTEXT_HANDOFF). Переключить на true, когда появится настоящий HTTPS.
const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  path: '/',
};

@Injectable()
export class SessionService {
  constructor(private readonly jwt: JwtService) {}

  toSessionUser(user: RosnouIdUser): SessionUser {
    return {
      id: user.id,
      surname: user.surname,
      name: user.name,
      patronymic: user.patronymic,
      email: user.email,
      fullName: user.full_name,
    };
  }

  async sign(user: SessionUser): Promise<string> {
    return this.jwt.signAsync(user, { expiresIn: SESSION_TTL });
  }

  async verify(token: string): Promise<SessionUser> {
    return this.jwt.verifyAsync<SessionUser>(token);
  }

  setCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE_NAME, token, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_MS });
  }

  clearCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, COOKIE_OPTIONS);
  }
}
