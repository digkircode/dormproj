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
      throw new UnauthorizedException('auth.notAuthorized');
    }
    let sessionUser;
    try {
      sessionUser = await this.sessions.verify(token);
    } catch {
      throw new UnauthorizedException('auth.sessionExpired');
    }
    const roles = await fetchUserRoles(this.prisma, sessionUser.id);
    request.user = { ...sessionUser, roles };
    return true;
  }
}
