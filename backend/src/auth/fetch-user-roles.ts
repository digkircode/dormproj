import type { PrismaService } from '../prisma/prisma.service';
import type { RoleName } from './types';

export async function fetchUserRoles(prisma: PrismaService, userId: number): Promise<RoleName[]> {
  const rows = await prisma.userRole.findMany({ where: { userId }, include: { role: true } });
  return rows.map((row) => row.role.name as RoleName);
}
