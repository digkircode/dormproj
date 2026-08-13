import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { SessionService } from './session.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token: unknown = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('Не авторизован');
    }
    try {
      request.user = await this.sessions.verify(token);
    } catch {
      throw new UnauthorizedException('Сессия недействительна или истекла');
    }
    return true;
  }
}
