import { BadRequestException, Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Prisma, ContractStatus } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnly, addDays, startOfMonth } from '../billing/period-utils';
import { computePenaltyBalance, sumPenaltyLog } from '../billing/penalty-balance';
import { fromStoredValue } from '../rooms/characteristic-value';
import { parseListOptions, paginateInMemory, facetsFromValues, type FacetOption } from './list-helpers';

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
        const unpaidAsOf = principal.minus(paidAsOf);
        if (unpaidAsOf.greaterThan(0)) principalDebtAsOf = principalDebtAsOf.plus(unpaidAsOf);
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
      totalDebt: rows.reduce((sum, r) => sum + r.totalBalance, 0),
      totalPenalty: rows.reduce((sum, r) => sum + r.penaltyBalance, 0),
      totalPaid: rows.reduce((sum, r) => sum + r.totalPaid, 0),
    };
  }

  @Get('debtors/facets/:field')
  debtorsFacets(@Param('field') field: string): FacetOption[] {
    if (field !== 'status') return [];
    return (Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((value) => ({ value, label: CONTRACT_STATUS_LABELS[value] }));
  }

  // Структура долга одного договора по периодам (клик на договор в реестре) — на дату asOf:
  // показывает только НАСТУПИВШИЕ начисления (dueDate<=asOf, по прямой просьбе 2026-08-22 —
  // "только долги", будущие ещё не выставленные месяцы сюда не попадают), "Оплачено"/"Долг"
  // считаются только по платежам ДО asOf. Пеня — единая на договор и по дням (см.
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

    const periods = contract.accruals
      .filter((accrual) => accrual.dueDate <= asOf)
      .map((accrual) => {
        const total = accrual.rentAmount.plus(accrual.utilitiesAmount).plus(accrual.adjustmentAmount);
        const paid = accrual.allocations
          .filter((al) => !al.payment.reversedAt && al.payment.paidAt <= asOf)
          .reduce((sum, al) => sum.plus(al.amount), new Decimal(0));
        const balance = total.minus(paid);
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

  // ===== Отчёт "Заселение / выселение / переселение" =====
  // События — не хранимая сущность, а производная от истории RoomAssignment одного
  // договора: первая запись = заселение, разрыв между соседними (toDate одной ==
  // fromDate следующей) = переселение одним событием (а не выселение+заселение по
  // отдельности), незакрытый хвост последней записи (toDate задан, следующей нет) = выселение.
  private async buildMovementEvents(from: Date, to: Date): Promise<MovementEvent[]> {
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

    return events.filter((e) => e.date >= from && e.date <= to).sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private resolveMovementsRange(fromParam?: string, toParam?: string): { from: Date; to: Date } {
    const today = dateOnly(new Date());
    const from = fromParam ? dateOnly(new Date(fromParam)) : startOfMonth(today);
    const to = toParam ? dateOnly(new Date(toParam)) : today;
    return { from, to };
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
    const { from, to } = this.resolveMovementsRange(fromParam, toParam);
    const events = await this.buildMovementEvents(from, to);
    const options = parseListOptions(pageParam, pageSizeParam, searchParam, sortByParam, sortDirParam, filtersParam, 'date');
    return paginateInMemory(events, options, {
      searchFields: ['contractNumber', 'residentFullName', 'from', 'to'],
      sortableFields: ['date', 'contractNumber', 'residentFullName', 'operation', 'from', 'to'],
      filterFields: ['operation'],
    });
  }

  @Get('movements/summary')
  async movementsSummary(@Query('from') fromParam?: string, @Query('to') toParam?: string) {
    const { from, to } = this.resolveMovementsRange(fromParam, toParam);
    const events = await this.buildMovementEvents(from, to);
    return {
      movedIn: events.filter((e) => e.operation === 'IN').length,
      movedOut: events.filter((e) => e.operation === 'OUT').length,
      relocated: events.filter((e) => e.operation === 'MOVE').length,
    };
  }

  @Get('movements/facets/:field')
  movementsFacets(@Param('field') field: string): FacetOption[] {
    if (field !== 'operation') return [];
    return [
      { value: 'IN', label: 'Заселение' },
      { value: 'OUT', label: 'Выселение' },
      { value: 'MOVE', label: 'Переселение' },
    ];
  }
}
