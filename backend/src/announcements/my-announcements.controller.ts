import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';

function parseId(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('announcements.errors.invalidId');
  }
  return id;
}

@Controller('my-announcements')
@UseGuards(AuthGuard, RolesGuard)
@Roles('RESIDENT')
export class MyAnnouncementsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const userId = req.user.id;
    const [rows, reads] = await Promise.all([
      this.prisma.announcement.findMany({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.announcementRead.findMany({ where: { userId }, select: { announcementId: true, readAt: true } }),
    ]);
    const readByAnnouncementId = new Map(reads.map((r) => [r.announcementId, r.readAt]));

    return rows.map((row) => {
      const readAt = readByAnnouncementId.get(row.id);
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        unread: !readAt || readAt < row.updatedAt,
      };
    });
  }

  @Post(':id/read')
  async markRead(@Param('id') idParam: string, @Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const id = parseId(idParam);
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) {
      throw new NotFoundException('announcements.errors.notFound');
    }

    await this.prisma.$transaction(async (tx) => {
      const userId = await ensureUserRecord(tx, req.user!);
      await tx.announcementRead.upsert({
        where: { announcementId_userId: { announcementId: id, userId } },
        create: { announcementId: id, userId, readAt: new Date() },
        update: { readAt: new Date() },
      });
    });
    return { ok: true };
  }
}
