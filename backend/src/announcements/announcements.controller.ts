import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { zodErrorMessage } from '../i18n/zod-error-message';

// Тот же максимум, что MAX_BODY_LENGTH в chats.controller.ts, для согласованности —
// объявления не длиннее одного сообщения чата.
const announcementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
});

function parseId(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('announcements.errors.invalidId');
  }
  return id;
}

// Управление объявлениями — секция на "Главной" сотрудника (StaffHomeDashboard.vue).
// Без markdown/HTML (см. обсуждение с пользователем) — body хранится и рендерится как
// обычный текст, тот же принцип, что и у остального сайта (v-html нигде не используется).
@Controller('announcements')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AnnouncementsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const rows = await this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { fullName: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      authorFullName: row.author.fullName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: Request) {
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const parsed = announcementSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const userId = await ensureUserRecord(tx, req.user!);
      return tx.announcement.create({
        data: { title: parsed.data.title, body: parsed.data.body, authorUserId: userId },
      });
    });
    return { id: created.id, createdAt: created.createdAt };
  }

  @Patch(':id')
  async update(@Param('id') idParam: string, @Body() body: unknown) {
    const id = parseId(idParam);
    const parsed = announcementSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('announcements.errors.notFound');
    }
    // updatedAt (авто через @updatedAt) — единственный сигнал "непрочитано после правки"
    // для AnnouncementRead ниже, отдельного флага/события специально не заводили.
    await this.prisma.announcement.update({
      where: { id },
      data: { title: parsed.data.title, body: parsed.data.body },
    });
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id') idParam: string) {
    const id = parseId(idParam);
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('announcements.errors.notFound');
    }
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }
}
