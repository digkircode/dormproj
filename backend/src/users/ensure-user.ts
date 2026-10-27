import { Prisma } from '../../generated/prisma/client.js';
import type { SessionUser } from '../auth/types';

export async function ensureUserRecord(prisma: Prisma.TransactionClient, sessionUser: SessionUser): Promise<number> {
  await prisma.user.upsert({
    where: { id: sessionUser.id },
    create: { id: sessionUser.id, fullName: sessionUser.fullName },
    update: {},
  });
  return sessionUser.id;
}
