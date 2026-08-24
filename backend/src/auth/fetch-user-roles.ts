import type { PrismaService } from '../prisma/prisma.service';
import type { RoleName } from './types';

// Общий для auth.guard.ts (живая проверка на каждый запрос) и auth.controller.ts
// (снимок на момент логина, кладётся в JWT) — одна и та же выборка, чтобы не разойтись.
export async function fetchUserRoles(prisma: PrismaService, userId: number): Promise<RoleName[]> {
  const rows = await prisma.userRole.findMany({ where: { userId }, include: { role: true } });
  return rows.map((row) => row.role.name as RoleName);
}
