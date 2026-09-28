import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  // roles сюда не входят — RosnouIdUser их не знает, они добавляются отдельно
  // (см. auth.controller.ts callback: fetchRoles() из БД) перед sign().
  toSessionUser(user: RosnouIdUser): Omit<SessionUser, 'roles'> {
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
    const id = randomUUID();
    const token = await this.jwt.signAsync(user, { expiresIn: SESSION_TTL, jwtid: id });
    await this.prisma.userSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.userSession.create({
      data: { id, userId: user.id, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) },
    });
    return token;
  }

  async verify(token: string): Promise<SessionUser> {
    const claims = await this.jwt.verifyAsync<SessionUser & { jti?: string }>(token);
    if (!claims.jti) throw new Error('Сессия не найдена');
    const session = await this.prisma.userSession.findUnique({ where: { id: claims.jti } });
    if (!session || session.userId !== claims.id || session.revokedAt || session.expiresAt <= new Date()) {
      throw new Error('Сессия завершена');
    }
    const { jti: _jti, ...user } = claims;
    return user;
  }

  async revoke(token: string | undefined): Promise<void> {
    if (!token) return;
    let claims: SessionUser & { jti?: string };
    try {
      claims = await this.jwt.verifyAsync<SessionUser & { jti?: string }>(token, { ignoreExpiration: true });
    } catch {
      return;
    }
    if (!claims.jti) return;
    await this.prisma.userSession.updateMany({
      where: { id: claims.jti, userId: claims.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  setCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE_NAME, token, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_MS });
  }

  clearCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, COOKIE_OPTIONS);
  }
}
