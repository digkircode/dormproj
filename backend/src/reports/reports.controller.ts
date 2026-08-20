import { BadRequestException, Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Prisma, ContractStatus } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { daysBetweenInclusive, dateOnly, addDays, startOfMonth } from '../billing/period-utils';
import { fromStoredValue } from '../rooms/characteristic-value';
import { serializeAccrual } from '../contracts/serializers';

const { Decimal } = Prisma;

type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';

function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return 'D1_30';
  if (daysOverdue <= 60) return 'D31_60';
  if (daysOverdue <= 90) return 'D61_90';
  return 'D90_PLUS';
}

// Название характеристик комнаты, от которых зависят отчёты "Занятость" — заведены сидом
// 1С-выгрузки (см. миграции seed_room_characteristics/floor_as_characteristic), не менялись.
const CAPACITY_DEFINITION_NAME = 'Количество мест';
const FLOOR_DEFINITION_NAME = 'Этаж';

interface OccupancyRoomRow {
  id: number;
  room: string;
  floor: number | null;
  capacity: number | null;
  occupied: number;
  free: number | null;
  occupants: { contractId: number; contractNumber: string; residentFullName: string }[];
}

interface MovementEvent {
  date: Date;
  contractId: number;
  contractNumber: string;
  residentIndividualUid: string;
  residentFullName: string;
  operation: 'IN' | 'OUT' | 'MOVE';
  from: string | null;
  to: string | null;
}

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('Некорректный id');
  }
  return id;
}

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  // ===== Отчёт "Задолженность" =====
  // Должники на дату asOf (по умолчанию сегодня) — по каждому договору с непогашенным
  // остатком: основной долг отдельно от пени (платежи по начислению считаем сначала
  // гасящими тело долга, остаток сверху — пеню, тот же принцип, что в billing/penalty.scheduler.ts),
  // плюс totalAccrued/totalPaid — накопленные суммы по ВСЕМ наступившим начислениям (не
  // только неоплаченным), для колонок "Начислено"/"Оплачено" в реестре.
  @Get('debtors')
  async debtors(@Query('asOf') asOfParam?: string) {
    const asOf = asOfParam ? dateOnly(new Date(asOfParam)) : dateOnly(new Date());

    const accruals = await this.prisma.accrual.findMany({
      where: { voidedAt: null, dueDate: { lte: asOf } },
      include: {
        allocations: true,
        contract: {
          include: {
            resident: { select: { fullName: true, fizicheskoyeLitsoUid: true } },
            roomAssignments: { where: { toDate: null }, include: { room: { select: { room: true } } } },
          },
        },
      },
    });

    interface Row {
      contractId: number;
      contractNumber: string;
      residentIndividualUid: string;
      residentFullName: string;
      room: string | null;
      principalBalance: Prisma.Decimal;
      penaltyBalance: Prisma.Decimal;
      totalAccrued: Prisma.Decimal;
      totalPaid: Prisma.Decimal;
      maxDaysOverdue: number;
    }
    const byContract = new Map<number, Row>();

    for (const accrual of accruals) {
      const principal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
      const periodTotal = principal.plus(accrual.penaltyAmount);
      const paid = accrual.allocations.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
      const unpaidPrincipal = principal.minus(paid).lessThan(0) ? new Decimal(0) : principal.minus(paid);
      const paidTowardPenalty = paid.minus(principal).lessThan(0) ? new Decimal(0) : paid.minus(principal);
      const unpaidPenalty = accrual.penaltyAmount.minus(paidTowardPenalty).lessThan(0)
        ? new Decimal(0)
        : accrual.penaltyAmount.minus(paidTowardPenalty);
      // На отдельное начисление FIFO-разнесение не может выделить больше, чем в нём
      // осталось долга (см. allocatePaymentFifo) — cap здесь чисто защитный.
      const paidCapped = paid.greaterThan(periodTotal) ? periodTotal : paid;

      const daysOverdue = Math.max(0, daysBetweenInclusive(accrual.dueDate, asOf) - 1);
      const { contract } = accrual;

      const existing = byContract.get(contract.id);
      if (existing) {
        existing.principalBalance = existing.principalBalance.plus(unpaidPrincipal);
        existing.penaltyBalance = existing.penaltyBalance.plus(unpaidPenalty);
        existing.totalAccrued = existing.totalAccrued.plus(periodTotal);
        existing.totalPaid = existing.totalPaid.plus(paidCapped);
        existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, daysOverdue);
      } else {
        byContract.set(contract.id, {
          contractId: contract.id,
          contractNumber: contract.number,
          residentIndividualUid: contract.residentIndividualUid,
          residentFullName: contract.resident.fullName,
          room: contract.roomAssignments[0]?.room.room ?? null,
          principalBalance: unpaidPrincipal,
          penaltyBalance: unpaidPenalty,
          totalAccrued: periodTotal,
          totalPaid: paidCapped,
          maxDaysOverdue: daysOverdue,
        });
      }
    }

    return Array.from(byContract.values())
      .filter((row) => row.principalBalance.plus(row.penaltyBalance).greaterThan(0))
      .map((row) => ({
        contractId: row.contractId,
        contractNumber: row.contractNumber,
        residentIndividualUid: row.residentIndividualUid,
        residentFullName: row.residentFullName,
        room: row.room,
        totalAccrued: Number(row.totalAccrued),
        totalPaid: Number(row.totalPaid),
        principalBalance: Number(row.principalBalance),
        penaltyBalance: Number(row.penaltyBalance),
        totalBalance: Number(row.principalBalance.plus(row.penaltyBalance)),
        daysOverdue: row.maxDaysOverdue,
        agingBucket: agingBucket(row.maxDaysOverdue),
      }))
      .sort((a, b) => b.totalBalance - a.totalBalance);
  }

  // Структура долга одного договора по периодам (клик на должника в реестре) — те же
  // цифры, что уже показывает карточка договора (см. ContractDetail.vue), но без ПДн
  // (без родителя/паспорта) и с добавленным daysOverdue на каждый период.
  @Get('debtors/:contractId/breakdown')
  async debtorBreakdown(@Param('contractId') contractIdParam: string, @Query('asOf') asOfParam?: string) {
    const contractId = parseIdParam(contractIdParam);
    const asOf = asOfParam ? dateOnly(new Date(asOfParam)) : dateOnly(new Date());

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        number: true,
        resident: { select: { fullName: true } },
        roomAssignments: { where: { toDate: null }, include: { room: { select: { room: true } } } },
      },
    });
    if (!contract) {
      throw new NotFoundException('Договор не найден');
    }

    const accruals = await this.prisma.accrual.findMany({
      where: { contractId, voidedAt: null },
      include: { allocations: true },
      orderBy: { periodStart: 'asc' },
    });

    const periods = accruals.map((accrual) => {
      const serialized = serializeAccrual(accrual);
      const daysOverdue =
        serialized.balance > 0 ? Math.max(0, daysBetweenInclusive(accrual.dueDate, asOf) - 1) : 0;
      return { ...serialized, daysOverdue };
    });

    return {
      contractId: contract.id,
      contractNumber: contract.number,
      residentFullName: contract.resident.fullName,
      room: contract.roomAssignments[0]?.room.room ?? null,
      periods,
      totalDebt: periods.reduce((sum, p) => sum + p.balance, 0),
    };
  }

  // Начисления со сроком оплаты в ближайшие N дней (по умолчанию 7), ещё не закрытые —
  // для точечных напоминаний.
  @Get('upcoming-payments')
  async upcomingPayments(@Query('days') daysParam?: string) {
    const days = Math.max(1, Number.parseInt(daysParam ?? '', 10) || 7);
    const today = dateOnly(new Date());
    const until = addDays(today, days);

    const accruals = await this.prisma.accrual.findMany({
      where: { voidedAt: null, dueDate: { gte: today, lte: until } },
      include: {
        allocations: true,
        contract: { select: { id: true, number: true, resident: { select: { fullName: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return accruals
      .map((accrual) => {
        const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.penaltyAmount).plus(accrual.adjustmentAmount);
        const paid = accrual.allocations.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
        return {
          contractId: accrual.contract.id,
          contractNumber: accrual.contract.number,
          residentFullName: accrual.contract.resident.fullName,
          dueDate: accrual.dueDate,
          balance: Number(total.minus(paid)),
        };
      })
      .filter((row) => row.balance > 0);
  }

  // ===== Отчёт "Занятость и свободные места" =====
  // Вместимость/этаж — характеристики комнаты (см. CAPACITY_DEFINITION_NAME/FLOOR_DEFINITION_NAME),
  // "занято" — число активных на asOf RoomAssignment (тот же признак "текущего" проживания,
  // что и everywhere в проекте: fromDate<=asOf и (toDate null или >=asOf)).
  @Get('occupancy')
  async occupancy(@Query('asOf') asOfParam?: string) {
    const asOf = asOfParam ? dateOnly(new Date(asOfParam)) : dateOnly(new Date());

    const [floorDef, capacityDef] = await Promise.all([
      this.prisma.roomCharacteristicDefinition.findUnique({ where: { name: FLOOR_DEFINITION_NAME } }),
      this.prisma.roomCharacteristicDefinition.findUnique({ where: { name: CAPACITY_DEFINITION_NAME } }),
    ]);
    const defIds = [floorDef?.id, capacityDef?.id].filter((id): id is number => id != null);

    const rooms = await this.prisma.room.findMany({
      orderBy: { room: 'asc' },
      include: {
        characteristicValues: { where: { definitionId: { in: defIds } }, orderBy: { period: 'desc' } },
        roomAssignments: {
          where: { fromDate: { lte: asOf }, OR: [{ toDate: null }, { toDate: { gte: asOf } }] },
          include: { contract: { select: { id: true, number: true, resident: { select: { fullName: true } } } } },
        },
      },
    });

    const roomRows: OccupancyRoomRow[] = rooms.map((r) => {
      let floor: number | null = null;
      let capacity: number | null = null;
      // characteristicValues отсортированы period desc — первое попавшееся значение на
      // каждый definitionId и есть "текущее" (тот же принцип, что pickCurrentCharacteristics).
      for (const cv of r.characteristicValues) {
        if (floorDef && cv.definitionId === floorDef.id && floor === null) {
          floor = fromStoredValue('NUMBER', cv) as number | null;
        }
        if (capacityDef && cv.definitionId === capacityDef.id && capacity === null) {
          capacity = fromStoredValue('NUMBER', cv) as number | null;
        }
      }
      const occupied = r.roomAssignments.length;
      return {
        id: r.id,
        room: r.room,
        floor,
        capacity,
        occupied,
        free: capacity !== null ? Math.max(0, capacity - occupied) : null,
        occupants: r.roomAssignments.map((a) => ({
          contractId: a.contract.id,
          contractNumber: a.contract.number,
          residentFullName: a.contract.resident.fullName,
        })),
      };
    });

    const floorsMap = new Map<number | null, OccupancyRoomRow[]>();
    for (const row of roomRows) {
      const list = floorsMap.get(row.floor) ?? [];
      list.push(row);
      floorsMap.set(row.floor, list);
    }
    const floors = [...floorsMap.entries()]
      .sort((a, b) => (a[0] ?? Number.MAX_SAFE_INTEGER) - (b[0] ?? Number.MAX_SAFE_INTEGER))
      .map(([floor, floorRooms]) => ({ floor, rooms: floorRooms }));

    const totalPlaces = roomRows.reduce((sum, r) => sum + (r.capacity ?? 0), 0);
    const occupied = roomRows.reduce((sum, r) => sum + r.occupied, 0);

    return {
      totalPlaces,
      occupied,
      free: totalPlaces - occupied,
      occupancyRate: totalPlaces > 0 ? occupied / totalPlaces : 0,
      floors,
    };
  }

  // ===== Отчёт "Реестр проживающих" =====
  // Кто проживает на дату asOf, с привязкой к Контингенту (факультет/курс) — если у
  // физлица несколько зачёток (Student.fizicheskoyeLitsoUid не уникален), берём любую
  // первую попавшуюся, отдельного правила выбора "главной" зачётки в проекте нет.
  @Get('contingent')
  async contingent(@Query('asOf') asOfParam?: string) {
    const asOf = asOfParam ? dateOnly(new Date(asOfParam)) : dateOnly(new Date());

    const assignments = await this.prisma.roomAssignment.findMany({
      where: { fromDate: { lte: asOf }, OR: [{ toDate: null }, { toDate: { gte: asOf } }] },
      include: {
        room: { select: { room: true } },
        contract: {
          select: {
            id: true,
            number: true,
            residentIndividualUid: true,
            resident: {
              select: {
                fullName: true,
                birthDate: true,
                // "Текущее" гражданство — та же эвристика, что в individuals.controller.ts:
                // просто последняя запись по period, без спецобработки 1С-сентинелов
                // (та нужна только contactInfos, см. pickLatestContactInfo).
                citizenships: { orderBy: { period: 'desc' }, take: 1, select: { country: true } },
              },
            },
          },
        },
      },
      orderBy: { fromDate: 'desc' },
    });

    const uids = [...new Set(assignments.map((a) => a.contract.residentIndividualUid))];
    const students = await this.prisma.student.findMany({
      where: { fizicheskoyeLitsoUid: { in: uids } },
      select: { fizicheskoyeLitsoUid: true, facultet: true, kursNumber: true },
    });
    const studentByUid = new Map<string, { facultet: string; kursNumber: number }>();
    for (const s of students) {
      if (!studentByUid.has(s.fizicheskoyeLitsoUid)) studentByUid.set(s.fizicheskoyeLitsoUid, s);
    }

    return assignments.map((a) => {
      const student = studentByUid.get(a.contract.residentIndividualUid);
      return {
        contractId: a.contract.id,
        contractNumber: a.contract.number,
        residentIndividualUid: a.contract.residentIndividualUid,
        residentFullName: a.contract.resident.fullName,
        room: a.room.room,
        facultet: student?.facultet ?? null,
        kursNumber: student?.kursNumber ?? null,
        birthDate: a.contract.resident.birthDate,
        citizenship: a.contract.resident.citizenships[0]?.country ?? null,
        movedInDate: a.fromDate,
      };
    });
  }

  // ===== Отчёт "Реестр договоров" =====
  // bucket — не хранимое поле, а классификация на лету по датам: EXPIRED здесь
  // возникает для договоров, у которых endDate уже прошёл, а сотрудник ещё не расторг
  // (см. известный гэп "автоматического перехода в EXPIRED нет" в промпте проекта) —
  // этот отчёт как раз и есть способ его увидеть, ничего в БД при этом не меняя.
  @Get('contracts-registry')
  async contractsRegistry(@Query('asOf') asOfParam?: string) {
    const asOf = asOfParam ? dateOnly(new Date(asOfParam)) : dateOnly(new Date());

    const contracts = await this.prisma.contract.findMany({
      orderBy: { endDate: 'asc' },
      include: {
        resident: { select: { fullName: true } },
        roomAssignments: { where: { toDate: null }, include: { room: { select: { room: true } } } },
      },
    });

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const rows = contracts.map((c) => {
      const daysUntilEnd = Math.round((c.endDate.getTime() - asOf.getTime()) / MS_PER_DAY);
      let bucket: 'ACTIVE' | 'EXPIRING' | 'OVERDUE' | 'TERMINATED';
      if (c.status === ContractStatus.TERMINATED) bucket = 'TERMINATED';
      else if (daysUntilEnd < 0) bucket = 'OVERDUE';
      else if (daysUntilEnd <= 30) bucket = 'EXPIRING';
      else bucket = 'ACTIVE';

      return {
        contractId: c.id,
        contractNumber: c.number,
        residentIndividualUid: c.residentIndividualUid,
        residentFullName: c.resident.fullName,
        room: c.roomAssignments[0]?.room.room ?? null,
        createdAt: c.createdAt,
        startDate: c.startDate,
        endDate: c.endDate,
        actualEndDate: c.actualEndDate,
        daysUntilEnd,
        bucket,
      };
    });

    return {
      summary: {
        active: rows.filter((r) => r.bucket === 'ACTIVE').length,
        expiring30: rows.filter((r) => r.bucket === 'EXPIRING').length,
        ended: rows.filter((r) => r.bucket === 'OVERDUE' || r.bucket === 'TERMINATED').length,
      },
      contracts: rows,
    };
  }

  // ===== Отчёт "Заселение / выселение / переселение" =====
  // События — не хранимая сущность, а производная от истории RoomAssignment одного
  // договора: первая запись = заселение, разрыв между соседними (toDate одной ==
  // fromDate следующей) = переселение одним событием (а не выселение+заселение по
  // отдельности), незакрытый хвост последней записи (toDate задан, следующей нет) = выселение.
  @Get('movements')
  async movements(@Query('from') fromParam?: string, @Query('to') toParam?: string) {
    const today = dateOnly(new Date());
    const from = fromParam ? dateOnly(new Date(fromParam)) : startOfMonth(today);
    const to = toParam ? dateOnly(new Date(toParam)) : today;

    const assignments = await this.prisma.roomAssignment.findMany({
      include: {
        room: { select: { room: true } },
        contract: {
          select: { id: true, number: true, residentIndividualUid: true, resident: { select: { fullName: true } } },
        },
      },
      orderBy: [{ contractId: 'asc' }, { fromDate: 'asc' }],
    });

    const events: MovementEvent[] = [];

    let i = 0;
    while (i < assignments.length) {
      const contractId = assignments[i].contractId;
      const group: typeof assignments = [];
      while (i < assignments.length && assignments[i].contractId === contractId) {
        group.push(assignments[i]);
        i++;
      }
      group.forEach((a, idx) => {
        const meta = {
          contractId: a.contract.id,
          contractNumber: a.contract.number,
          residentIndividualUid: a.contract.residentIndividualUid,
          residentFullName: a.contract.resident.fullName,
        };
        if (idx === 0) {
          events.push({ date: a.fromDate, operation: 'IN', from: null, to: a.room.room, ...meta });
        } else {
          events.push({ date: a.fromDate, operation: 'MOVE', from: group[idx - 1].room.room, to: a.room.room, ...meta });
        }
        if (idx === group.length - 1 && a.toDate) {
          events.push({ date: a.toDate, operation: 'OUT', from: a.room.room, to: null, ...meta });
        }
      });
    }

    const filtered = events.filter((e) => e.date >= from && e.date <= to).sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      summary: {
        movedIn: filtered.filter((e) => e.operation === 'IN').length,
        movedOut: filtered.filter((e) => e.operation === 'OUT').length,
        relocated: filtered.filter((e) => e.operation === 'MOVE').length,
      },
      events: filtered,
    };
  }
}
