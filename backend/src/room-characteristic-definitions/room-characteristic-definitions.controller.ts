import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, RoomCharacteristicValueType } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const createSchema = z.object({
  name: z.string().trim().min(1),
  valueType: z.enum(RoomCharacteristicValueType),
  unit: z.string().trim().min(1).nullish(),
});
// valueType сознательно нельзя поменять после создания — уже записанные значения лежат
// в конкретной типизированной колонке (см. characteristic-value.ts), смена типа задним
// числом рассинхронизирует историю с новым valueType без пересчёта всех старых записей.
const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1).nullish(),
});

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('Некорректный id');
  }
  return id;
}

@Controller('room-characteristic-definitions')
@UseGuards(AuthGuard)
export class RoomCharacteristicDefinitionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.roomCharacteristicDefinition.findMany({ orderBy: { name: 'asc' } });
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    try {
      return await this.prisma.roomCharacteristicDefinition.create({
        data: { name: parsed.data.name, valueType: parsed.data.valueType, unit: parsed.data.unit ?? null },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Характеристика с таким названием уже существует');
      }
      throw error;
    }
  }

  @Patch(':id')
  async update(@Param('id') idParam: string, @Body() body: unknown) {
    const id = parseIdParam(idParam);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    try {
      return await this.prisma.roomCharacteristicDefinition.update({
        where: { id },
        data: { ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), ...(parsed.data.unit !== undefined ? { unit: parsed.data.unit } : {}) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Характеристика не найдена');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Характеристика с таким названием уже существует');
      }
      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id') idParam: string) {
    const id = parseIdParam(idParam);
    const existing = await this.prisma.roomCharacteristicDefinition.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Характеристика не найдена');
    }
    if (existing.isProtected) {
      throw new ConflictException('Эту характеристику нельзя удалить');
    }
    try {
      return await this.prisma.roomCharacteristicDefinition.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Характеристика не найдена');
      }
      // FK RESTRICT — у характеристики ещё есть значения, вручную сформулированная ошибка
      // понятнее сотруднику, чем сырой код ограничения БД.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('Нельзя удалить характеристику, пока у неё есть значения у комнат');
      }
      throw error;
    }
  }
}
