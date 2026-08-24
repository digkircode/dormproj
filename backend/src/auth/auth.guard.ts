import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { SessionService } from './session.service';
import { PrismaService } from '../prisma/prisma.service';
import { fetchUserRoles } from './fetch-user-roles';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token: unknown = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('Не авторизован');
    }
    let sessionUser;
    try {
      sessionUser = await this.sessions.verify(token);
    } catch {
      throw new UnauthorizedException('Сессия недействительна или истекла');
    }
    // Роли — больше НЕ снимок из JWT (2026-08-24, по прямой просьбе, закрывает известную
    // проблему проекта "роль применяется только после перелогина/до 24ч") — живой SELECT
    // на каждый запрос, тот же приём, что и при логине (см. fetchUserRoles). JWT из куки
    // по-прежнему несёт roles на момент подписи (auth.controller.ts#callback), но это
    // значение больше нигде не читается для авторизации — только identity (id/email/ФИО)
    // из токена остаётся достоверным без пересчёта. RolesGuard ничего не знает про эту
    // подмену, читает request.user.roles как раньше. Один лишний SELECT на каждый
    // авторизованный запрос — при масштабе проекта (внутренний инструмент) не требует
    // кеша; если нагрузка когда-то вырастет — см. вариант с версией ролей, обсуждали и
    // сознательно не стали делать сразу.
    const roles = await fetchUserRoles(this.prisma, sessionUser.id);
    request.user = { ...sessionUser, roles };
    return true;
  }
}
