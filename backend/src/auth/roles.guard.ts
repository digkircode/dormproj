import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import type { RoleName } from './types';

// Ставится ПОСЛЕ AuthGuard (см. индивидуальные @UseGuards(AuthGuard, RolesGuard)) —
// полагается на то, что request.user уже проверен и заполнен. Пока применён только
// на individuals/contracts (самые чувствительные по ПДн эндпоинты, см. промпт проекта) —
// остальные контроллеры пока без ролевой проверки, это сознательно не полное покрытие.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    // Старые сессии, выпущенные до появления ролей в JWT (см. types.ts), roles не несут —
    // ?? [] трактует это как "роли нет", тот же принцип, что и на фронте (router guard).
    const roles = request.user?.roles ?? [];
    if (roles.includes('ADMIN') || required.some((role) => roles.includes(role))) {
      return true;
    }
    throw new ForbiddenException('auth.insufficientPermissions');
  }
}
