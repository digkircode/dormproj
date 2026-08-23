import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma, ContractStatus } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnly, addDays } from '../billing/period-utils';
import { computePenaltyBalance, sumPenaltyLog } from '../billing/penalty-balance';
import { fromStoredValue } from '../rooms/characteristic-value';
import { parseListOptions, paginateInMemory, filterAndSortInMemory, facetsFromValues, type FacetOption } from './list-helpers';
import { sendExcelReport, type ExcelColumn } from './excel-export';

const { Decimal } = Prisma;

type ContractRegistryBucket = 'ACTIVE' | 'EXPIRING' | 'OVERDUE' | 'TERMINATED';

const BUCKET_LABELS: Record<ContractRegistryBucket, string> = {
  ACTIVE: 'Действует',
  EXPIRING: 'Истекает',
  OVERDUE: 'Просрочен',
  TERMINATED: 'Расторгнут',
};

// Та же подпись, что и на карточке договора/в "Реестре договоров" (ContractStatusPill.vue) —
// не переиспользуем напрямую из contracts.controller.ts (не экспортирован), но значения
// синхронизированы, менять в обоих местах разом.
const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  ACTIVE: 'Действует',
  TERMINATED: 'Расторгнут',
  EXPIRED: 'Истёк',
};

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

interface DebtorRow {
  contractId: number;
  contractNumber: string;
  residentIndividualUid: string;
  residentFullName: string;
  room: string | null;
  status: ContractStatus;
  createdAt: Date;
  // Начислено/Оплачено — по ВСЕМУ сроку договора (весь срок целиком, не зависит от asOf) —
  // справочные итоги, не то же самое, что "Долг" ниже.
  totalAccrued: number;
  totalPaid: number;
  // Долг НА ДАТУ asOf: тело долга только по уже НАСТУПИВШИМ начислениям (dueDate<=asOf),
  // погашённое только теми платежами, что были ДО asOf (см. buildDebtorRows), плюс пеня
  // на asOf (сумма журнала PenaltyAccrualLog по эту дату, см. penalty-balance.ts). Именно
  // эта пара figures даёт "долг по договору на дату", а не по всему сроку.
  principalDebt: number;
  penaltyBalance: number;
  totalBalance: number;
}

interface ContingentRow {
  contractId: number;
  contractNumber: string;
  residentIndividualUid: string;
  residentFullName: string;
  room: string;
  facultet: string | null;
  kursNumber: number | null;
  birthDate: Date | null;
  citizenship: string | null;
  // Производные поля для фиксированных фильтров (тот же принцип, что bucket/agingBucket/
  // operation в остальных отчётах) — не отдельные хранимые поля.
  citizenshipGroup: 'RU' | 'FOREIGN';
  isOwnUniversity: 'OWN' | 'OTHER';
  movedInDate: Date;
}

interface ContractRegistryRow {
  contractId: number;
  contractNumber: string;
  residentIndividualUid: string;
  residentFullName: string;
  room: string | null;
  createdAt: Date;
  startDate: Date;
  endDate: Date;
  actualEndDate: Date | null;
  daysUntilEnd: number;
  bucket: ContractRegistryBucket;
}

type MovementOperationType = 'IN' | 'OUT' | 'MOVE' | 'RENEWAL';

interface MovementEvent {
  date: Date;
  contractId: number;
  contractNumber: string;
  residentIndividualUid: string;
  residentFullName: string;
  operation: MovementOperationType;
  from: string | null;
  to: string | null;
}

const MOVEMENT_GAP_DAYS = 30;

const MOVEMENT_LABELS: Record<MovementOperationType, string> = {
  IN: 'Заселение',
  OUT: 'Выселение',
  MOVE: 'Переселение',
  RENEWAL: 'Продление',
};

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('Некорректный id');
  }
  return id;
}

function resolveAsOf(asOfParam?: string): Date {
  return asOfParam ? dateOnly(new Date(asOfParam)) : dateOnly(new Date());
}

@Controller('reports')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  // ===== Финансовый отчёт (бывшая "Задолженность") =====
  // Показывает ВСЕ договоры (по прямой просьбе 2026-08-22, не только должников), на дату
  // asOf (по умолчанию сегодня): "Долг" — тело долга только по уже НАСТУПИВШИМ начислениям
  // (dueDate<=asOf), погашённое только платежами ДО asOf (позже — не считается, иначе
  // "долг на дату X" включал бы деньги, внесённые уже после X), плюс пеня на asOf (сумма
  // журнала PenaltyAccrualLog по эту дату, см. penalty-balance.ts). Начислено/Оплачено —
  // по ВСЕМУ сроку договора целиком (не зависят от asOf) — справочные итоги.
  private async buildDebtorRows(asOf: Date): Promise<DebtorRow[]> {
    const contracts = await this.prisma.contract.findMany({
      include: {
        resident: { select: { fullName: true, fizicheskoyeLitsoUid: true } },
        roomAssignments: { where: { toDate: null }, include: { room: { select: { room: true } } } },
        accruals: {
          where: { voidedAt: null },
          include: { allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } } },
        },
        payments: true,
        penaltyLogs: true,
      },
    });

    const rows: DebtorRow[] = [];
    for (const contract of contracts) {
      let totalAccrued = new Decimal(0);
      let principalDebtAsOf = new Decimal(0);

      for (const accrual of contract.accruals) {
        const principal = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
        totalAccrued = totalAccrued.plus(principal);
        if (accrual.dueDate > asOf) continue;

        const paidAsOf = accrual.allocations
          .filter((al) => !al.payment.reversedAt && al.payment.paidAt <= asOf)
          .reduce((sum, al) => sum.plus(al.amount), new Decimal(0));
        // НЕ ограничиваем снизу нулём — переплата по одному начислению должна гасить долг
        // по другому в сумме по договору (не просто исчезать), это и даёт отрицательный
        // "Долг" = переплата (см. DebtBalanceCell.vue на фронте, зелёная подсветка).
        principalDebtAsOf = principalDebtAsOf.plus(principal.minus(paidAsOf));
      }

      const { penaltyBalance } = computePenaltyBalance({
        asOf,
        penaltyLogs: contract.penaltyLogs,
        accruals: contract.accruals,
        payments: contract.payments,
      });
      const totalPaid = contract.payments.filter((p) => !p.reversedAt).reduce((sum, p) => sum.plus(p.amount), new Decimal(0));

      rows.push({
        contractId: contract.id,
        contractNumber: contract.number,
        residentIndividualUid: contract.residentIndividualUid,
        residentFullName: contract.resident.fullName,
        room: contract.roomAssignments[0]?.room.room ?? null,
        status: contract.status,
        createdAt: contract.createdAt,
        totalAccrued: Number(totalAccrued),
        totalPaid: Number(totalPaid),
        principalDebt: Number(principalDebtAsOf),
        penaltyBalance: Number(penaltyBalance),
        totalBalance: Number(principalDebtAsOf.plus(penaltyBalance)),
      });
    }

    return rows;
  }

  @Get('debtors')
  async debtors(
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('asOf') asOfParam?: string,
  ) {
    const rows = await this.buildDebtorRows(resolveAsOf(asOfParam));
    const options = parseListOptions(pageParam, pageSizeParam, searchParam, sortByParam, sortDirParam, filtersParam, 'totalBalance');
    return paginateInMemory(rows, options, {
      searchFields: ['contractNumber', 'residentFullName', 'room'],
      sortableFields: ['contractNumber', 'residentFullName', 'room', 'createdAt', 'status', 'totalAccrued', 'totalPaid', 'penaltyBalance', 'totalBalance'],
      filterFields: ['status'],
    });
  }

  @Get('debtors/summary')
  async debtorsSummary(@Query('asOf') asOfParam?: string) {
    const rows = await this.buildDebtorRows(resolveAsOf(asOfParam));
    return {
      debtorsCount: rows.filter((r) => r.totalBalance > 0).length,
      totalAccrued: rows.reduce((sum, r) => sum + r.totalAccrued, 0),
      // Переплата по одному договору не должна маскировать реальный долг по другому —
      // в сумме учитываем только положительные "Долг" (см. totalBalance выше), сама
      // строка при этом всё равно показывает истинный (возможно отрицательный) баланс.
      totalDebt: rows.reduce((sum, r) => sum + Math.max(0, r.totalBalance), 0),
      totalPenalty: rows.reduce((sum, r) => sum + r.penaltyBalance, 0),
      totalPaid: rows.reduce((sum, r) => sum + r.totalPaid, 0),
    };
  }

  @Get('debtors/facets/:field')
  debtorsFacets(@Param('field') field: string): FacetOption[] {
    if (field !== 'status') return [];
    return (Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((value) => ({ value, label: CONTRACT_STATUS_LABELS[value] }));
  }

  // Экспорт — та же фильтрация/сортировка, что и у обычного списка (debtors() выше), но
  // без пагинации: весь отфильтрованный набор целиком, не только текущая страница таблицы.
  @Get('debtors/export')
  async debtorsExport(
    @Res() res: Response,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('asOf') asOfParam?: string,
  ) {
    const rows = await this.buildDebtorRows(resolveAsOf(asOfParam));
    const options = parseListOptions(undefined, undefined, searchParam, sortByParam, sortDirParam, filtersParam, 'totalBalance');
    const sorted = filterAndSortInMemory(rows, options, {
      searchFields: ['contractNumber', 'residentFullName', 'room'],
      sortableFields: ['contractNumber', 'residentFullName', 'room', 'createdAt', 'status', 'totalAccrued', 'totalPaid', 'penaltyBalance', 'totalBalance'],
      filterFields: ['status'],
    });

    const columns: ExcelColumn<DebtorRow>[] = [
      { header: '№ договора', value: (r) => r.contractNumber, width: 16 },
      { header: 'ФИО', value: (r) => r.residentFullName, width: 32 },
      { header: 'Комната', value: (r) => r.room ?? '', width: 12 },
      { header: 'Статус', value: (r) => CONTRACT_STATUS_LABELS[r.status], width: 14 },
      { header: 'Дата создания', value: (r) => r.createdAt, format: 'date', width: 14 },
      { header: 'Начислено', value: (r) => r.totalAccrued, format: 'money', width: 16 },
      { header: 'Оплачено', value: (r) => r.totalPaid, format: 'money', width: 16 },
      { header: 'Пеня', value: (r) => r.penaltyBalance, format: 'money', width: 14 },
      { header: 'Долг', value: (r) => r.totalBalance, format: 'money', width: 14 },
    ];
    await sendExcelReport(res, 'financial-report', 'Финансовый отчёт', columns, sorted);
  }

  // Структура долга одного договора по периодам (клик на договор в реестре) — ВСЕ
  // начисления по договору (весь срок, по прямой просьбе 2026-08-22 — не только
  // наступившие), но "Долг" по каждому периоду — по аналогии с главной таблицей: для ещё
  // не наступивших (dueDate>asOf) всегда 0 (не в счёт, см. DebtBalanceCell.vue — 0 без
  // подсветки), для наступивших — реальный остаток на asOf (может быть отрицательным при
  // переплате, тогда подсвечивается зелёным). Пеня — единая на договор и по дням (см.
  // PenaltyAccrualLog), поэтому отдаётся отдельно от periods, не как их колонка.
  @Get('debtors/:contractId/breakdown')
  async debtorBreakdown(@Param('contractId') contractIdParam: string, @Query('asOf') asOfParam?: string) {
    const contractId = parseIdParam(contractIdParam);
    const asOf = resolveAsOf(asOfParam);

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        resident: { select: { fullName: true } },
        roomAssignments: { where: { toDate: null }, include: { room: { select: { room: true } } } },
        accruals: {
          where: { voidedAt: null },
          orderBy: { periodStart: 'asc' },
          include: { allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } } },
        },
        payments: true,
        penaltyLogs: true,
      },
    });
    if (!contract) {
      throw new NotFoundException('Договор не найден');
    }

    const periods = contract.accruals.map((accrual) => {
      const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
      const paid = accrual.allocations
        .filter((al) => !al.payment.reversedAt && al.payment.paidAt <= asOf)
        .reduce((sum, al) => sum.plus(al.amount), new Decimal(0));
      const balance = accrual.dueDate <= asOf ? total.minus(paid) : new Decimal(0);
      return {
        id: accrual.id,
        periodStart: accrual.periodStart,
        periodEnd: accrual.periodEnd,
        dueDate: accrual.dueDate,
        adjustmentAmount: Number(accrual.adjustmentAmount),
        adjustmentReason: accrual.adjustmentReason,
        voidedAt: accrual.voidedAt,
        total: Number(total),
        paid: Number(paid),
        balance: Number(balance),
      };
    });
    const { penaltyBalance } = computePenaltyBalance({
      asOf,
      penaltyLogs: contract.penaltyLogs,
      accruals: contract.accruals,
      payments: contract.payments,
    });
    const principalDebt = periods.reduce((sum, p) => sum + p.balance, 0);

    return {
      contractId: contract.id,
      contractNumber: contract.number,
      residentFullName: contract.resident.fullName,
      room: contract.roomAssignments[0]?.room.room ?? null,
      periods,
      totalAccrued: periods.reduce((sum, p) => sum + p.total, 0),
      totalPaid: periods.reduce((sum, p) => sum + p.paid, 0),
      penaltyBalance: Number(penaltyBalance),
      totalDebt: principalDebt + Number(penaltyBalance),
    };
  }

  // Расшифровка пени по дням (клик на "Пеня" в реестре) — сырые строки журнала до asOf
  // включительно, чтобы ответить "откуда взялась сумма" (по прямой просьбе 2026-08-22):
  // каждая строка — один день, добавленная за него сумма и база расчёта на тот момент.
  @Get('debtors/:contractId/penalty-log')
  async debtorPenaltyLog(@Param('contractId') contractIdParam: string, @Query('asOf') asOfParam?: string) {
    const contractId = parseIdParam(contractIdParam);
    const asOf = resolveAsOf(asOfParam);

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        number: true,
        resident: { select: { fullName: true } },
        roomAssignments: { where: { toDate: null }, include: { room: { select: { room: true } } } },
        penaltyLogs: { orderBy: { date: 'asc' } },
      },
    });
    if (!contract) {
      throw new NotFoundException('Договор не найден');
    }

    const entries = contract.penaltyLogs
      .filter((l) => l.date <= asOf)
      .map((l) => ({ date: l.date, amount: Number(l.amount), overdueBase: Number(l.overdueBase) }));

    return {
      contractId: contract.id,
      contractNumber: contract.number,
      residentFullName: contract.resident.fullName,
      room: contract.roomAssignments[0]?.room.room ?? null,
      entries,
      total: entries.reduce((sum, e) => sum + e.amount, 0),
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
        const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
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
  // что и everywhere в проекте: fromDate<=asOf и (toDate null или >=asOf)). Карта комнат —
  // не список/таблица, а сетка карточек, поэтому под общий вид таблиц (поиск/фильтры/
  // сортировка) не подпадает — этот эндпоинт как был, так и остался нестраничным.
  @Get('occupancy')
  async occupancy(@Query('asOf') asOfParam?: string) {
    const asOf = resolveAsOf(asOfParam);

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
  private async buildContingentRows(asOf: Date): Promise<ContingentRow[]> {
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

    // Дата заселения — не fromDate текущего RoomAssignment (это дата последнего
    // переезда/начала ТЕКУЩЕГО договора), а старт самого первого по времени договора
    // этого физлица — по прямой просьбе, вне зависимости от того, сколько у него
    // договоров было всего.
    const allContractsOfResidents = await this.prisma.contract.findMany({
      where: { residentIndividualUid: { in: uids } },
      select: { residentIndividualUid: true, startDate: true },
    });
    const firstContractStartByUid = new Map<string, Date>();
    for (const c of allContractsOfResidents) {
      const existing = firstContractStartByUid.get(c.residentIndividualUid);
      if (!existing || c.startDate < existing) firstContractStartByUid.set(c.residentIndividualUid, c.startDate);
    }

    return assignments.map((a) => {
      const student = studentByUid.get(a.contract.residentIndividualUid);
      const citizenship = a.contract.resident.citizenships[0]?.country ?? null;
      return {
        contractId: a.contract.id,
        contractNumber: a.contract.number,
        residentIndividualUid: a.contract.residentIndividualUid,
        residentFullName: a.contract.resident.fullName,
        room: a.room.room,
        facultet: student?.facultet ?? null,
        kursNumber: student?.kursNumber ?? null,
        birthDate: a.contract.resident.birthDate,
        citizenship,
        // В БД значение хранится капсом ("РОССИЯ", см. citizenships.country из 1С) —
        // сравнение регистронезависимое, чтобы не зависеть от регистра источника.
        citizenshipGroup: citizenship?.toUpperCase() === 'РОССИЯ' ? 'RU' : 'FOREIGN',
        isOwnUniversity: student ? 'OWN' : 'OTHER',
        movedInDate: firstContractStartByUid.get(a.contract.residentIndividualUid) ?? a.fromDate,
      };
    });
  }

  @Get('contingent')
  async contingent(
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('asOf') asOfParam?: string,
  ) {
    const rows = await this.buildContingentRows(resolveAsOf(asOfParam));
    const options = parseListOptions(pageParam, pageSizeParam, searchParam, sortByParam, sortDirParam, filtersParam, 'movedInDate');
    return paginateInMemory(rows, options, {
      searchFields: ['residentFullName', 'contractNumber', 'room', 'facultet', 'citizenship'],
      sortableFields: ['movedInDate', 'residentFullName', 'contractNumber', 'room', 'facultet', 'kursNumber', 'birthDate', 'citizenship'],
      filterFields: ['facultet', 'kursNumber', 'citizenshipGroup', 'isOwnUniversity'],
    });
  }

  @Get('contingent/facets/:field')
  async contingentFacets(@Param('field') field: string): Promise<FacetOption[]> {
    if (field === 'citizenshipGroup') {
      return [
        { value: 'RU', label: 'Россия' },
        { value: 'FOREIGN', label: 'Иностранный гражданин' },
      ];
    }
    if (field === 'isOwnUniversity') {
      return [
        { value: 'OWN', label: 'Студент РосНОУ' },
        { value: 'OTHER', label: 'Не студент РосНОУ' },
      ];
    }
    if (field !== 'facultet' && field !== 'kursNumber') return [];
    const rows = await this.buildContingentRows(dateOnly(new Date()));
    return facetsFromValues(rows.map((r) => r[field]));
  }

  @Get('contingent/export')
  async contingentExport(
    @Res() res: Response,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('asOf') asOfParam?: string,
  ) {
    const rows = await this.buildContingentRows(resolveAsOf(asOfParam));
    const options = parseListOptions(undefined, undefined, searchParam, sortByParam, sortDirParam, filtersParam, 'movedInDate');
    const sorted = filterAndSortInMemory(rows, options, {
      searchFields: ['residentFullName', 'contractNumber', 'room', 'facultet', 'citizenship'],
      sortableFields: ['movedInDate', 'residentFullName', 'contractNumber', 'room', 'facultet', 'kursNumber', 'birthDate', 'citizenship'],
      filterFields: ['facultet', 'kursNumber', 'citizenshipGroup', 'isOwnUniversity'],
    });

    const columns: ExcelColumn<ContingentRow>[] = [
      { header: 'Дата заселения', value: (r) => r.movedInDate, format: 'date', width: 14 },
      { header: 'Проживающий', value: (r) => r.residentFullName, width: 32 },
      { header: '№ договора', value: (r) => r.contractNumber, width: 16 },
      { header: 'Комната', value: (r) => r.room, width: 12 },
      { header: 'Факультет', value: (r) => r.facultet ?? '', width: 24 },
      { header: 'Курс', value: (r) => r.kursNumber ?? '', width: 8 },
      { header: 'Дата рождения', value: (r) => r.birthDate, format: 'date', width: 14 },
      { header: 'Гражданство', value: (r) => r.citizenship ?? '', width: 18 },
    ];
    await sendExcelReport(res, 'residents-registry', 'Реестр проживающих', columns, sorted);
  }

  // ===== Отчёт "Реестр договоров" =====
  // bucket — не хранимое поле, а классификация на лету по датам: OVERDUE здесь
  // возникает для договоров, у которых endDate уже прошёл, а сотрудник ещё не расторг
  // (см. известный гэп "автоматического перехода в EXPIRED нет" в промпте проекта) —
  // этот отчёт как раз и есть способ его увидеть, ничего в БД при этом не меняя.
  private async buildContractRegistryRows(asOf: Date): Promise<ContractRegistryRow[]> {
    const contracts = await this.prisma.contract.findMany({
      include: {
        resident: { select: { fullName: true } },
        roomAssignments: { where: { toDate: null }, include: { room: { select: { room: true } } } },
      },
    });

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return contracts.map((c) => {
      const daysUntilEnd = Math.round((c.endDate.getTime() - asOf.getTime()) / MS_PER_DAY);
      let bucket: ContractRegistryBucket;
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
  }

  @Get('contracts-registry')
  async contractsRegistry(
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('asOf') asOfParam?: string,
  ) {
    const rows = await this.buildContractRegistryRows(resolveAsOf(asOfParam));
    const options = parseListOptions(pageParam, pageSizeParam, searchParam, sortByParam, sortDirParam, filtersParam, 'endDate');
    return paginateInMemory(rows, options, {
      searchFields: ['contractNumber', 'residentFullName', 'room'],
      sortableFields: ['contractNumber', 'residentFullName', 'room', 'createdAt', 'startDate', 'endDate', 'bucket'],
      filterFields: ['bucket'],
    });
  }

  @Get('contracts-registry/summary')
  async contractsRegistrySummary(@Query('asOf') asOfParam?: string) {
    const rows = await this.buildContractRegistryRows(resolveAsOf(asOfParam));
    return {
      active: rows.filter((r) => r.bucket === 'ACTIVE').length,
      expiring30: rows.filter((r) => r.bucket === 'EXPIRING').length,
      ended: rows.filter((r) => r.bucket === 'OVERDUE' || r.bucket === 'TERMINATED').length,
    };
  }

  @Get('contracts-registry/facets/:field')
  contractsRegistryFacets(@Param('field') field: string): FacetOption[] {
    if (field !== 'bucket') return [];
    return (Object.keys(BUCKET_LABELS) as ContractRegistryBucket[]).map((value) => ({ value, label: BUCKET_LABELS[value] }));
  }

  @Get('contracts-registry/export')
  async contractsRegistryExport(
    @Res() res: Response,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('asOf') asOfParam?: string,
  ) {
    const rows = await this.buildContractRegistryRows(resolveAsOf(asOfParam));
    const options = parseListOptions(undefined, undefined, searchParam, sortByParam, sortDirParam, filtersParam, 'endDate');
    const sorted = filterAndSortInMemory(rows, options, {
      searchFields: ['contractNumber', 'residentFullName', 'room'],
      sortableFields: ['contractNumber', 'residentFullName', 'room', 'createdAt', 'startDate', 'endDate', 'bucket'],
      filterFields: ['bucket'],
    });

    const columns: ExcelColumn<ContractRegistryRow>[] = [
      { header: '№ договора', value: (r) => r.contractNumber, width: 16 },
      { header: 'ФИО', value: (r) => r.residentFullName, width: 32 },
      { header: 'Комната', value: (r) => r.room ?? '', width: 12 },
      { header: 'Статус', value: (r) => BUCKET_LABELS[r.bucket], width: 14 },
      { header: 'Дата создания', value: (r) => r.createdAt, format: 'date', width: 14 },
      { header: 'Дата начала', value: (r) => r.startDate, format: 'date', width: 14 },
      { header: 'Дата окончания', value: (r) => r.endDate, format: 'date', width: 14 },
      { header: 'Дней до окончания', value: (r) => r.daysUntilEnd, width: 16 },
    ];
    await sendExcelReport(res, 'contracts-registry', 'Реестр договоров', columns, sorted);
  }

  // ===== Отчёт "Движение проживающих" (бывшее "Заселение / выселение") =====
  // События — не хранимая сущность, а производная от истории ДОГОВОРОВ одного физлица
  // (не RoomAssignment, как было раньше) — по прямой просьбе 2026-08-22, правило "разрыв
  // 30 дней": для каждого договора C смотрим предыдущий/следующий договор ТОГО ЖЕ физлица
  // по хронологии.
  // - Старт C: если нет предыдущего договора ИЛИ разрыв (C.startDate - prev.endEffective)
  //   больше 30 дней -> ЗАСЕЛЕНИЕ. Иначе (разрыв <=30 дней) -> та же комната, что у
  //   предыдущего -> ПРОДЛЕНИЕ; другая комната -> ПЕРЕСЕЛЕНИЕ. Дата события — startDate.
  // - Конец C: если нет следующего договора ИЛИ разрыв (next.startDate - C.endEffective)
  //   больше 30 дней -> ВЫСЕЛЕНИЕ, дата события — endEffective (actualEndDate ?? endDate).
  //   Если следующий договор укладывается в 30 дней — отдельного события выселения нет,
  //   переход уже описан стартовым событием следующего договора (продление/переселение).
  // endEffective — actualEndDate, если было досрочное расторжение, иначе endDate.
  private async buildMovementEvents(): Promise<MovementEvent[]> {
    const contracts = await this.prisma.contract.findMany({
      select: {
        id: true,
        number: true,
        residentIndividualUid: true,
        startDate: true,
        endDate: true,
        actualEndDate: true,
        resident: { select: { fullName: true } },
        roomAssignments: { orderBy: { fromDate: 'asc' }, take: 1, select: { room: { select: { room: true } } } },
      },
    });

    const byResident = new Map<string, typeof contracts>();
    for (const c of contracts) {
      const list = byResident.get(c.residentIndividualUid);
      if (list) list.push(c);
      else byResident.set(c.residentIndividualUid, [c]);
    }

    const events: MovementEvent[] = [];
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const gapDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);

    for (const list of byResident.values()) {
      list.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const prev = i > 0 ? list[i - 1] : null;
        const next = i < list.length - 1 ? list[i + 1] : null;
        const room = c.roomAssignments[0]?.room.room ?? null;
        const endEffective = c.actualEndDate ?? c.endDate;
        const meta = {
          contractId: c.id,
          contractNumber: c.number,
          residentIndividualUid: c.residentIndividualUid,
          residentFullName: c.resident.fullName,
        };

        const prevEndEffective = prev ? (prev.actualEndDate ?? prev.endDate) : null;
        const prevRoom = prev ? (prev.roomAssignments[0]?.room.room ?? null) : null;
        if (!prev || !prevEndEffective || gapDays(prevEndEffective, c.startDate) > MOVEMENT_GAP_DAYS) {
          events.push({ date: c.startDate, operation: 'IN', from: null, to: room, ...meta });
        } else if (prevRoom === room) {
          events.push({ date: c.startDate, operation: 'RENEWAL', from: room, to: room, ...meta });
        } else {
          events.push({ date: c.startDate, operation: 'MOVE', from: prevRoom, to: room, ...meta });
        }

        if (!next || gapDays(endEffective, next.startDate) > MOVEMENT_GAP_DAYS) {
          events.push({ date: endEffective, operation: 'OUT', from: room, to: null, ...meta });
        }
      }
    }

    return events;
  }

  @Get('movements')
  async movements(
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('from') fromParam?: string,
    @Query('to') toParam?: string,
  ) {
    const to = resolveAsOf(toParam);
    // from пустой -> отчёт "на дату to" целиком (нижней границы нет), от начала времён.
    // from задан -> строго ПОСЛЕ from и по to включительно — разница между "на дату to" и
    // "на дату from" (см. комментарий к buildMovementEvents), не просто диапазон дат:
    // события считаются один раз глобально по истории договоров, а не пересчитываются
    // отдельно на каждую границу, поэтому разница снапшотов эквивалентна фильтру по дате.
    const from = fromParam ? dateOnly(new Date(fromParam)) : null;
    const allEvents = await this.buildMovementEvents();
    const events = allEvents
      .filter((e) => e.date <= to && (!from || e.date > from))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const options = parseListOptions(pageParam, pageSizeParam, searchParam, sortByParam, sortDirParam, filtersParam, 'date');
    return paginateInMemory(events, options, {
      searchFields: ['contractNumber', 'residentFullName', 'from', 'to'],
      sortableFields: ['date', 'contractNumber', 'residentFullName', 'operation', 'from', 'to'],
      filterFields: ['operation'],
    });
  }

  @Get('movements/summary')
  async movementsSummary(@Query('from') fromParam?: string, @Query('to') toParam?: string) {
    const to = resolveAsOf(toParam);
    const from = fromParam ? dateOnly(new Date(fromParam)) : null;
    const allEvents = await this.buildMovementEvents();
    const events = allEvents.filter((e) => e.date <= to && (!from || e.date > from));
    return {
      movedIn: events.filter((e) => e.operation === 'IN').length,
      movedOut: events.filter((e) => e.operation === 'OUT').length,
      relocated: events.filter((e) => e.operation === 'MOVE').length,
      renewed: events.filter((e) => e.operation === 'RENEWAL').length,
    };
  }

  @Get('movements/facets/:field')
  movementsFacets(@Param('field') field: string): FacetOption[] {
    if (field !== 'operation') return [];
    return (Object.keys(MOVEMENT_LABELS) as MovementOperationType[]).map((value) => ({ value, label: MOVEMENT_LABELS[value] }));
  }

  @Get('movements/export')
  async movementsExport(
    @Res() res: Response,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('from') fromParam?: string,
    @Query('to') toParam?: string,
  ) {
    const to = resolveAsOf(toParam);
    const from = fromParam ? dateOnly(new Date(fromParam)) : null;
    const allEvents = await this.buildMovementEvents();
    const events = allEvents.filter((e) => e.date <= to && (!from || e.date > from));
    const options = parseListOptions(undefined, undefined, searchParam, sortByParam, sortDirParam, filtersParam, 'date');
    const sorted = filterAndSortInMemory(events, options, {
      searchFields: ['contractNumber', 'residentFullName', 'from', 'to'],
      sortableFields: ['date', 'contractNumber', 'residentFullName', 'operation', 'from', 'to'],
      filterFields: ['operation'],
    });

    const columns: ExcelColumn<MovementEvent>[] = [
      { header: 'Дата операции', value: (r) => r.date, format: 'date', width: 14 },
      { header: '№ договора', value: (r) => r.contractNumber, width: 16 },
      { header: 'ФИО', value: (r) => r.residentFullName, width: 32 },
      { header: 'Операция', value: (r) => MOVEMENT_LABELS[r.operation], width: 14 },
      { header: 'Откуда', value: (r) => r.from ?? '', width: 12 },
      { header: 'Куда', value: (r) => r.to ?? '', width: 12 },
    ];
    await sendExcelReport(res, 'movements', 'Движение проживающих', columns, sorted);
  }
}
