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

// Лента объявлений для проживающего (ResidentHomeDashboard.vue) — видна ВСЕМ с ролью
// RESIDENT без таргетинга (не как рассылка в чате с фильтрами по этажу/корпусу — по
// прямой просьбе пользователя 2026-08-30, "у всех проживающих").
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
      this.prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } }),
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
        // Отредактированное после последнего прочтения объявление снова непрочитано —
        // readAt сравнивается с updatedAt, не с createdAt (см. схему/AnnouncementsController#update).
        unread: !readAt || readAt < row.updatedAt,
      };
    });
  }

  // Отмечается кликом по конкретному объявлению (открытием модалки на фронте), НЕ
  // автоматически при загрузке списка выше — в отличие от GET /my-chat, где открытие
  // диалога само по себе и есть прочтение. Здесь на одной "Главной" сразу несколько
  // объявлений, открыть модалку с текстом — осознанное действие по каждому отдельно.
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
