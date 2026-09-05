import { BadRequestException, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import { AuditLogService } from '../audit-log/audit-log.service';
import { sortPassportsByPriority } from './passport-priority';
import { pickLatestContactInfo } from './contact-info-priority';
import { IndividualSyncService, type IndividualSyncResult } from '../individual-sync/individual-sync.service';
import { SyncAlreadyRunningError } from '../sync/sync.errors';
import {
  BIRTH_PLACE_TYPE,
  REGISTRATION_ADDRESS_TYPE,
  RESIDENCE_ADDRESS_TYPE,
  PHONE_TYPE,
  EMAIL_TYPE,
  upsertContactInfo,
  deleteContactInfoIfExists,
  upsertPassport,
  upsertCitizenship,
  buildEditableSnapshot,
} from './individual-edit';
import { OKSM_COUNTRIES, isRussianCitizenship } from './citizenship-list';
import { zodErrorMessage } from '../i18n/zod-error-message';

// Поля, участвующие в diff'е истории изменений (AuditLogService) — служебные (createdAt/
// updatedAt/isManual/deleteMark/code/photoCode) намеренно не отслеживаются.
const AUDITED_INDIVIDUAL_FIELDS = [
  'fullName',
  'surname',
  'name',
  'otchestvo',
  'birthDate',
  'gender',
  'citizenship',
  'phone',
  'email',
  'address',
  'snils',
  'inn',
  'passportSeries',
  'passportNumber',
  'passportIssuedBy',
  'passportIssuedCode',
  'passportIssuedAt',
];

// "Критическая правка" уже существующего физлица (STAFF/ADMIN, IndividualDetail.vue,
// кнопка "Редактировать") — по прямой просьбе 2026-08-23, закрывает известный пробел
// "нет эндпоинта на изменение физлица". В отличие от AUDITED_INDIVIDUAL_FIELDS (создание
// вручную, всё на самом Individual) — здесь адрес разбит на регистрацию/проживание (у
// них разные ContactInfo.type), добавлено место рождения, см. individual-edit.ts.
const AUDITED_INDIVIDUAL_UPDATE_FIELDS = [
  'fullName',
  'birthDate',
  'gender',
  'citizenship',
  'birthPlace',
  'registrationAddress',
  'residenceAddress',
  'phone',
  'email',
  'snils',
  'inn',
  'passportSeries',
  'passportNumber',
  'passportIssuedBy',
  'passportIssuedCode',
  'passportIssuedAt',
];

// Пустая строка/undefined/null — "поле очищено". Форма правки всегда шлёт целиком
// текущее+изменённое состояние (как и форма создания), не частичный PATCH — поэтому
// именно "пусто = очистить". nullish() (не optional()) обязателен — фронт для пустых
// полей шлёт буквально null (см. EditIndividualDialog.vue: `field.value.trim() || null`),
// а не undefined — optional() такое null отклоняет, из-за чего почти любое сохранение
// с хотя бы одним пустым необязательным полем падало на валидации ("Проверьте
// правильность данных" на любую правку, баг 2026-08-23).
const clearableText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

// СНИЛС/код подразделения — раньше формат (000-000-000 00 и т.п.) проверяла только
// фронтовая маска (formatSnils/formatSubdivisionCode в lib/utils.ts), сервер принимал
// любую непустую строку — прямой запрос мимо формы мог записать в БД произвольный мусор.
// Поле по-прежнему необязательное, но если указано — должно совпадать с форматом.
// Серия/номер паспорта — тот же принцип, НО только для граждан РФ (см. superRefine ниже
// и isRussianCitizenship в citizenship-list.ts) — формат "4+6 цифр" специфичен для
// внутреннего паспорта РФ, у иностранных граждан (см. новое закрытое поле "Гражданство")
// документ устроен иначе, поэтому regex не может быть безусловным. Добавлено по прямой
// просьбе 2026-08-26 при разборе уязвимостей проекта.
const SNILS_PATTERN = /^\d{3}-\d{3}-\d{3} \d{2}$/;
const SUBDIVISION_CODE_PATTERN = /^\d{3}-\d{3}$/;
const PASSPORT_SERIES_PATTERN = /^\d{2}\s?\d{2}$/;
const PASSPORT_NUMBER_PATTERN = /^\d{6}$/;
const RF_PASSPORT_SERIES_MESSAGE = 'individuals.errors.rfPassportSeriesFormat';
const RF_PASSPORT_NUMBER_MESSAGE = 'individuals.errors.rfPassportNumberFormat';

function clearableFormattedText(pattern: RegExp, message: string) {
  return z
    .string()
    .trim()
    .nullish()
    .refine((v) => !v || pattern.test(v), message)
    .transform((v) => (v && v.length > 0 ? v : null));
}

// Закрытый список — см. citizenship-list.ts (ОКСМ). z.enum ожидает readonly-кортеж не
// короче одного элемента, OKSM_COUNTRIES заведомо непустой, приведение типа тут безопасно.
const citizenshipField = z.enum(OKSM_COUNTRIES as unknown as [string, ...string[]], {
  message: 'individuals.errors.citizenshipRequired',
});

const updateIndividualSchema = z
  .object({
    surname: z.string().trim().min(1),
    name: z.string().trim().min(1),
    otchestvo: clearableText,
    birthDate: z.coerce.date(),
    // Пол и гражданство раньше были nullish (можно сохранить критическую правку вообще без
    // них) — по прямой просьбе 2026-08-26 стали обязательными полями. Для физлиц, у которых
    // они сейчас пусты (неполная выгрузка 1С) — критическую правку не сохранить, пока их не
    // заполнят, это осознанное следствие решения, не побочный баг.
    gender: z.enum(['Мужской', 'Женский']),
    citizenship: citizenshipField,
    birthPlace: clearableText,
    registrationAddress: clearableText,
    residenceAddress: clearableText,
    phone: clearableText,
    // Необязательное поле без проверки формата (по прямой просьбе 2026-08-23) — раньше
    // строгий z.string().email() отклонял правку, если email не похож на почту.
    email: clearableText,
    snils: clearableFormattedText(SNILS_PATTERN, 'individuals.errors.snilsFormat'),
    inn: clearableText,
    passportSeries: clearableText,
    passportNumber: clearableText,
    passportIssuedBy: clearableText,
    passportIssuedCode: clearableFormattedText(SUBDIVISION_CODE_PATTERN, 'individuals.errors.subdivisionCodeFormat'),
    passportIssuedAt: z.coerce.date().nullish(),
  })
  .superRefine((data, ctx) => {
    if (!isRussianCitizenship(data.citizenship)) return;
    if (data.passportSeries && !PASSPORT_SERIES_PATTERN.test(data.passportSeries)) {
      ctx.addIssue({ code: 'custom', message: RF_PASSPORT_SERIES_MESSAGE, path: ['passportSeries'] });
    }
    if (data.passportNumber && !PASSPORT_NUMBER_PATTERN.test(data.passportNumber)) {
      ctx.addIssue({ code: 'custom', message: RF_PASSPORT_NUMBER_MESSAGE, path: ['passportNumber'] });
    }
  });

// Форма "Новое физическое лицо" (Individuals.vue) — заводит физлицо руками, не через
// синхрон 1С. Детерминированного uid тут нет (в отличие от manual-parent-* в
// contracts.controller.ts, где он один на резидента) — просто случайный per вызов.
const createIndividualSchema = z
  .object({
    surname: z.string().trim().min(1),
    name: z.string().trim().min(1),
    otchestvo: z.string().trim().min(1).nullish(),
    birthDate: z.coerce.date(),
    // Обязательны с 2026-08-26 (см. комментарий у updateIndividualSchema выше) — раньше
    // можно было завести физлицо вообще без пола/гражданства.
    gender: z.enum(['Мужской', 'Женский']),
    citizenship: citizenshipField,
    phone: z.string().trim().min(1),
    email: z.string().trim().email().nullish(),
    address: z.string().trim().min(1),
    snils: z.string().trim().regex(SNILS_PATTERN, 'individuals.errors.snilsFormat').nullish(),
    inn: z.string().trim().min(1).nullish(),
    passportSeries: z.string().trim().min(1).nullish(),
    passportNumber: z.string().trim().min(1),
    passportIssuedBy: z.string().trim().min(1).nullish(),
    passportIssuedCode: z.string().trim().regex(SUBDIVISION_CODE_PATTERN, 'individuals.errors.subdivisionCodeFormat').nullish(),
    passportIssuedAt: z.coerce.date(),
  })
  .superRefine((data, ctx) => {
    if (!isRussianCitizenship(data.citizenship)) return;
    if (data.passportSeries && !PASSPORT_SERIES_PATTERN.test(data.passportSeries)) {
      ctx.addIssue({ code: 'custom', message: RF_PASSPORT_SERIES_MESSAGE, path: ['passportSeries'] });
    }
    if (!PASSPORT_NUMBER_PATTERN.test(data.passportNumber)) {
      ctx.addIssue({ code: 'custom', message: RF_PASSPORT_NUMBER_MESSAGE, path: ['passportNumber'] });
    }
  });

const mergeIndividualSchema = z.object({
  targetUid: z.string().trim().min(1),
});

// Точный слепок того, что было перенесено с источника на цель при слиянии — только так
// unmerge() (ниже) может надёжно понять, какие ИЗ ТЕКУЩИХ данных цели принадлежали именно
// источнику на момент слияния, а не появились у цели независимо (до или после слияния).
interface IndividualMergeSnapshot {
  contractResidentIds: number[];
  contractLegalRepIds: number[];
  citizenshipIds: number[];
  passportIds: number[];
  contactInfoIds: number[];
  userId: number | null;
  chatConversationId: number | null;
  accountingContractorUidCopied: boolean;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// birthDateText — сгенерированная БД колонка (DD.MM.YYYY от birth_date), чтобы дату
// рождения можно было искать тем же ILIKE, что и обычный текст (см. schema.prisma).
const SEARCHABLE_FIELDS = ['fullName', 'code', 'snils', 'inn', 'gender', 'birthDateText', 'fizicheskoyeLitsoUid'] as const;

const SORTABLE_FIELDS: Record<string, string> = {
  fullName: 'fullName',
  code: 'code',
  snils: 'snils',
  birthDate: 'birthDate',
  inn: 'inn',
  gender: 'gender',
};

// Только пол — практичное поле для мультивыбора (пара значений); ФИО/код/СНИЛС/ИНН
// почти уникальны на строку, дата рождения для чипов-фильтров неудобна.
const FILTERABLE_FIELDS = ['gender'] as const;
type FilterableField = (typeof FILTERABLE_FIELDS)[number];

function isFilterableField(field: string): field is FilterableField {
  return (FILTERABLE_FIELDS as readonly string[]).includes(field);
}

@Controller('individuals')
@UseGuards(AuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class IndividualsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly individualSyncService: IndividualSyncService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  async list(
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Query('search') searchParam?: string,
    @Query('sortBy') sortByParam?: string,
    @Query('sortDir') sortDirParam?: string,
    @Query('filters') filtersParam?: string,
  ) {
    const page = Math.max(1, Number.parseInt(pageParam ?? '', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSizeParam ?? '', 10) || DEFAULT_PAGE_SIZE));
    const search = searchParam?.trim();
    const sortField = SORTABLE_FIELDS[sortByParam ?? ''] ?? 'fullName';
    const sortDir: Prisma.SortOrder = sortDirParam === 'desc' ? 'desc' : 'asc';

    const filterClauses: Prisma.IndividualWhereInput[] = [];
    if (filtersParam) {
      try {
        const parsed: unknown = JSON.parse(filtersParam);
        if (parsed && typeof parsed === 'object') {
          for (const [field, values] of Object.entries(parsed as Record<string, unknown>)) {
            if (!isFilterableField(field) || !Array.isArray(values) || values.length === 0) {
              continue;
            }
            const stringValues = values.filter((v): v is string => typeof v === 'string');
            if (stringValues.length === 0) continue;
            filterClauses.push({ [field]: { in: stringValues } });
          }
        }
      } catch {
        // Битый JSON в необязательном параметре — просто игнорируем фильтры, не 400'им весь запрос.
      }
    }

    const searchClause: Prisma.IndividualWhereInput | undefined = search
      ? { OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
      : undefined;

    // Слитые (см. merge() ниже) не показываем в обычном списке/поиске — это одна и та же
    // запись с точки зрения дела, только неактуальная строка-источник, дальше работать
    // нужно с той, в которую слили. Сама строка не удаляется физически (историческая
    // ссылка на неё в AuditLog/старых логах не должна повиснуть) — просто скрыта здесь.
    const where: Prisma.IndividualWhereInput = {
      AND: [{ mergedIntoUid: null }, ...(searchClause ? [searchClause] : []), ...filterClauses],
    };

    const [data, total] = await Promise.all([
      this.prisma.individual.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.individual.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: Request) {
    const parsed = createIndividualSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const data = parsed.data;
    const fullName = [data.surname, data.name, data.otchestvo].filter(Boolean).join(' ');

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.individual.create({
        data: {
          fizicheskoyeLitsoUid: `manual-${randomUUID()}`,
          isManual: true,
          fullName,
          surname: data.surname,
          name: data.name,
          otchestvo: data.otchestvo ?? null,
          birthDate: data.birthDate,
          gender: data.gender ?? null,
          citizenship: data.citizenship ?? null,
          phone: data.phone,
          email: data.email ?? null,
          address: data.address,
          snils: data.snils ?? null,
          inn: data.inn ?? null,
          passportSeries: data.passportSeries ?? null,
          passportNumber: data.passportNumber,
          passportIssuedBy: data.passportIssuedBy ?? null,
          passportIssuedCode: data.passportIssuedCode ?? null,
          passportIssuedAt: data.passportIssuedAt,
        },
      });

      const userId = await ensureUserRecord(tx, req.user!);
      await this.auditLog.log(tx, {
        userId,
        action: 'CREATE',
        entityType: 'Individual',
        entityId: created.fizicheskoyeLitsoUid,
        entityLabel: created.fullName,
        before: null,
        after: created,
        fields: AUDITED_INDIVIDUAL_FIELDS,
      });

      return created;
    });
  }

  // "Критическая правка" — пишет напрямую в те же таблицы, что и ночной синхрон 1С
  // (ContactInfo/Passport/Citizenship), не в отдельные manual-поля Individual (см.
  // individual-edit.ts). Осознанный аварийный костыль: следующий синхрон синхронизируемых
  // физлиц перезапишет эти значения обратно из 1С — это ожидаемо, не баг. Доступно любому
  // физлицу (и isManual, и синхронизируемому) — до этого эндпоинта на изменение вообще
  // не было ни у кого (известный пробел проекта).
  @Patch(':uid')
  async update(@Param('uid') uid: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = updateIndividualSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const data = parsed.data;
    const fullName = [data.surname, data.name, data.otchestvo].filter(Boolean).join(' ');

    const existing = await this.prisma.individual.findUnique({ where: { fizicheskoyeLitsoUid: uid } });
    if (!existing) {
      throw new NotFoundException('individuals.errors.individualNotFound');
    }

    await this.prisma.$transaction(async (tx) => {
      const before = await buildEditableSnapshot(tx, uid);

      await tx.individual.update({
        where: { fizicheskoyeLitsoUid: uid },
        data: {
          fullName,
          surname: data.surname,
          name: data.name,
          otchestvo: data.otchestvo,
          birthDate: data.birthDate,
          gender: data.gender ?? null,
          snils: data.snils,
          inn: data.inn,
        },
      });

      if (data.citizenship) {
        await upsertCitizenship(tx, uid, data.citizenship);
      }

      if (data.birthPlace) {
        await upsertContactInfo(tx, uid, BIRTH_PLACE_TYPE, data.birthPlace);
      } else {
        await deleteContactInfoIfExists(tx, uid, BIRTH_PLACE_TYPE);
      }
      if (data.registrationAddress) {
        await upsertContactInfo(tx, uid, REGISTRATION_ADDRESS_TYPE, data.registrationAddress);
      } else {
        await deleteContactInfoIfExists(tx, uid, REGISTRATION_ADDRESS_TYPE);
      }
      if (data.residenceAddress) {
        await upsertContactInfo(tx, uid, RESIDENCE_ADDRESS_TYPE, data.residenceAddress);
      } else {
        await deleteContactInfoIfExists(tx, uid, RESIDENCE_ADDRESS_TYPE);
      }
      if (data.phone) {
        await upsertContactInfo(tx, uid, PHONE_TYPE, data.phone, { phoneNumber: data.phone, phoneNumberNoCode: data.phone.replace(/^\+?\d/, '') });
      } else {
        await deleteContactInfoIfExists(tx, uid, PHONE_TYPE);
      }
      if (data.email) {
        await upsertContactInfo(tx, uid, EMAIL_TYPE, data.email, { email: data.email });
      } else {
        await deleteContactInfoIfExists(tx, uid, EMAIL_TYPE);
      }

      // Паспорт — блок из нескольких полей сразу, трогаем его только если реально
      // указан номер (иначе непонятно, что здесь вообще "изменение" — можно случайно
      // затереть существующий паспорт пустой формой, где эти поля просто не заполняли).
      if (data.passportNumber) {
        await upsertPassport(tx, uid, {
          series: data.passportSeries,
          number: data.passportNumber,
          issuedBy: data.passportIssuedBy,
          issuedCode: data.passportIssuedCode,
          issuedAt: data.passportIssuedAt ?? new Date(),
        });
      }

      const after = await buildEditableSnapshot(tx, uid);

      const userId = await ensureUserRecord(tx, req.user!);
      await this.auditLog.log(tx, {
        userId,
        action: 'UPDATE',
        entityType: 'Individual',
        entityId: uid,
        entityLabel: fullName,
        before: { ...before },
        after: { ...after },
        fields: AUDITED_INDIVIDUAL_UPDATE_FIELDS,
      });
    });

    // this.prisma (не tx) — транзакция выше уже закоммичена к этому моменту, detail()
    // должен увидеть только что записанные данные, а не читать их же соединением tx
    // ДО commit (см. известную ловушку — за пределами транзакции detail() безопасен).
    return this.detail(uid);
  }

  @Get('facets/:field')
  async facetValues(@Param('field') field: string) {
    if (!isFilterableField(field)) {
      return [];
    }

    const rows = await this.prisma.individual.findMany({
      where: { [field]: { notIn: [''] } },
      select: { [field]: true },
      distinct: [field as unknown as Prisma.IndividualScalarFieldEnum],
      orderBy: { [field]: 'asc' },
      take: 500,
    });

    return rows.map((row) => {
      const value = (row as unknown as Record<string, string>)[field];
      return { value, label: value };
    });
  }

  // Гражданство — только последнее по period (take: 1). Паспорта — все, пересортированные
  // в приложении через sortPassportsByPriority: тип документа важнее даты (паспорт РФ,
  // выданный раньше, всё равно актуальнее военного билета, полученного позже) — Prisma
  // не умеет сортировать по произвольному приоритету значений напрямую в orderBy.
  // Контактная информация — тем же способом схлопывается до одной записи на Type,
  // см. pickLatestContactInfo (там же — почему это эвристика, а не чистка данных).
  // Student не имеет Prisma-связи с Individual (только совпадающий fizicheskoyeLitsoUid,
  // см. schema.prisma) — берём отдельным запросом, а не через include.
  @Get(':uid')
  async detail(@Param('uid') uid: string) {
    const [individual, students] = await Promise.all([
      this.prisma.individual.findUnique({
        where: { fizicheskoyeLitsoUid: uid },
        include: {
          citizenships: { orderBy: { period: 'desc' }, take: 1 },
          passports: true,
          contactInfos: true,
          // Обратная сторона слияния (см. merge()/unmerge() ниже) — без этого списка с
          // карточки цели физически некуда перейти на слитую запись, чтобы отменить
          // слияние: сама она скрыта из общего списка/поиска.
          mergedFrom: { select: { fizicheskoyeLitsoUid: true, fullName: true, mergedAt: true } },
        },
      }),
      this.prisma.student.findMany({
        where: { fizicheskoyeLitsoUid: uid },
        orderBy: { period: 'desc' },
      }),
    ]);

    if (!individual) {
      throw new NotFoundException('individuals.errors.individualNotFound');
    }

    return {
      ...individual,
      passports: sortPassportsByPriority(individual.passports),
      contactInfos: pickLatestContactInfo(individual.contactInfos),
      students,
    };
  }

  // "Второй слой" — только ПОДСКАЗКА кандидатов для ручного слияния (кнопка merge() ниже),
  // ничего не выполняет и не решает сама: сотрудник видит список и подтверждает выбор
  // явным кликом, как и везде в проекте (тот же принцип, что у suggestContractMatch в
  // разборе платежей из 1С — по прямой просьбе не делать автоматическое слияние).
  // Совпадение по СНИЛС/паспорту — сильный сигнал, по ФИО — слабый (мог просто
  // совпасть у разных людей), но остаётся полезной подсказкой, если СНИЛС/паспорт
  // ещё не заполнены ни у одной из сторон.
  @Get(':uid/merge-candidates')
  async mergeCandidates(@Param('uid') uid: string) {
    const source = await this.prisma.individual.findUnique({ where: { fizicheskoyeLitsoUid: uid } });
    if (!source) {
      throw new NotFoundException('individuals.errors.individualNotFound');
    }
    if (!source.isManual || source.mergedIntoUid) {
      return [];
    }

    const orClauses: Prisma.IndividualWhereInput[] = [{ fullName: { equals: source.fullName, mode: 'insensitive' } }];
    if (source.snils) {
      orClauses.push({ snils: source.snils });
    }
    if (source.passportSeries && source.passportNumber) {
      orClauses.push({ passports: { some: { series: source.passportSeries, number: source.passportNumber } } });
    }

    return this.prisma.individual.findMany({
      where: { isManual: false, mergedIntoUid: null, OR: orClauses },
      select: { fizicheskoyeLitsoUid: true, fullName: true, snils: true, birthDate: true, code: true },
      take: 5,
    });
  }

  // Слияние ручного физлица (isManual) в настоящую синхронную запись, которая позже
  // появилась в 1С Университет (частый случай — сотрудник завёл человека вручную ДО того,
  // как университет прислал его официальные данные). ТОЛЬКО по явному действию сотрудника
  // — вызывается исключительно с этой кнопки, синхрон физлиц (individuals-sync) сам этот
  // эндпоинт никогда не дёргает и вообще не знает о ручных записях (см. schema.prisma).
  // Источник не удаляется физически — помечается mergedIntoUid/mergedAt и перестаёт
  // попадать в список() выше, но остаётся доступен по прямой ссылке (детальная страница
  // покажет баннер "Объединено с..."), чтобы старые ссылки (AuditLog и т.п.) не повисли.
  @Post(':uid/merge')
  @HttpCode(200)
  async merge(@Param('uid') uid: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = mergeIndividualSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(zodErrorMessage(parsed.error));
    }
    if (!req.user) {
      throw new BadRequestException('contracts.errors.sessionUserNotFound');
    }
    const { targetUid } = parsed.data;

    if (targetUid === uid) {
      throw new BadRequestException('individuals.errors.mergeSameIndividual');
    }

    const [source, target] = await Promise.all([
      this.prisma.individual.findUnique({ where: { fizicheskoyeLitsoUid: uid } }),
      this.prisma.individual.findUnique({ where: { fizicheskoyeLitsoUid: targetUid } }),
    ]);
    if (!source) {
      throw new NotFoundException('individuals.errors.individualNotFound');
    }
    if (!target) {
      throw new NotFoundException('individuals.errors.mergeTargetNotFound');
    }
    if (!source.isManual) {
      throw new BadRequestException('individuals.errors.mergeSourceMustBeManual');
    }
    if (source.mergedIntoUid) {
      throw new BadRequestException('individuals.errors.mergeSourceAlreadyMerged');
    }
    if (target.isManual) {
      throw new BadRequestException('individuals.errors.mergeTargetMustBeSynced');
    }
    if (target.mergedIntoUid) {
      throw new BadRequestException('individuals.errors.mergeTargetAlreadyMerged');
    }

    await this.prisma.$transaction(async (tx) => {
      // User.univerId и ChatConversation.individualUid оба @unique в схеме — если ОБЕ
      // стороны уже успели обзавестись своей записью, автоматически объединить их некуда
      // (какую из двух оставить — решение не техническое, а человеческое). Останавливаемся
      // явной ошибкой, а не тихо теряем одну из них.
      const [sourceUser, targetUser, sourceChat, targetChat] = await Promise.all([
        tx.user.findFirst({ where: { univerId: uid } }),
        tx.user.findFirst({ where: { univerId: targetUid } }),
        tx.chatConversation.findUnique({ where: { individualUid: uid } }),
        tx.chatConversation.findUnique({ where: { individualUid: targetUid } }),
      ]);
      if (sourceUser && targetUser) {
        throw new ConflictException('individuals.errors.mergeUserConflict');
      }
      if (sourceChat && targetChat) {
        throw new ConflictException('individuals.errors.mergeChatConflict');
      }

      // Список конкретных id ДО переноса — не только чтобы перенести, но и чтобы записать
      // точный снепшот для unmerge() ниже (см. IndividualMergeSnapshot). updateMany() сам
      // по себе не возвращает, какие строки затронул, только count — поэтому сначала находим
      // id, потом обновляем по ним же явно (эквивалентно where на исходном uid, но с id на руках).
      const [residentContracts, legalRepContracts, citizenships, passports, contactInfos] = await Promise.all([
        tx.contract.findMany({ where: { residentIndividualUid: uid }, select: { id: true } }),
        tx.contract.findMany({ where: { legalRepIndividualUid: uid }, select: { id: true } }),
        tx.citizenship.findMany({ where: { fizicheskoyeLitsoUid: uid }, select: { id: true } }),
        tx.passport.findMany({ where: { fizicheskoyeLitsoUid: uid }, select: { id: true } }),
        tx.contactInfo.findMany({ where: { fizicheskoyeLitsoUid: uid }, select: { id: true } }),
      ]);
      // ContractorUID из 1С Бухгалтерии (не путать с User/чатом выше — не @unique, поэтому
      // не может технически "конфликтовать") — если он уже проставлен у цели, ничего не
      // трогаем: он уже реально используется её собственными платежами. Переносим только
      // если у цели его ещё нет, а у источника есть (иначе следующий платёж по
      // перенесённому договору уйдёт в 1С без UID и заведёт там контрагента-дубля).
      const accountingContractorUidCopied = !target.accounting1cContractorUid && !!source.accounting1cContractorUid;

      await Promise.all([
        residentContracts.length
          ? tx.contract.updateMany({ where: { id: { in: residentContracts.map((c) => c.id) } }, data: { residentIndividualUid: targetUid } })
          : Promise.resolve(),
        legalRepContracts.length
          ? tx.contract.updateMany({ where: { id: { in: legalRepContracts.map((c) => c.id) } }, data: { legalRepIndividualUid: targetUid } })
          : Promise.resolve(),
        // preservedFromMerge: true — иначе ближайший ночной ресинк цели (она синхронная,
        // isManual=false) сотрёт эти перенесённые строки как "не пришедшие из 1С в этот
        // раз" (код-ревью 2026-09-04, см. citizenship-sync/passport-sync/contact-info-sync).
        citizenships.length
          ? tx.citizenship.updateMany({ where: { id: { in: citizenships.map((c) => c.id) } }, data: { fizicheskoyeLitsoUid: targetUid, preservedFromMerge: true } })
          : Promise.resolve(),
        passports.length
          ? tx.passport.updateMany({ where: { id: { in: passports.map((c) => c.id) } }, data: { fizicheskoyeLitsoUid: targetUid, preservedFromMerge: true } })
          : Promise.resolve(),
        contactInfos.length
          ? tx.contactInfo.updateMany({ where: { id: { in: contactInfos.map((c) => c.id) } }, data: { fizicheskoyeLitsoUid: targetUid, preservedFromMerge: true } })
          : Promise.resolve(),
        sourceUser ? tx.user.update({ where: { id: sourceUser.id }, data: { univerId: targetUid } }) : Promise.resolve(),
        sourceChat ? tx.chatConversation.update({ where: { id: sourceChat.id }, data: { individualUid: targetUid } }) : Promise.resolve(),
        accountingContractorUidCopied
          ? tx.individual.update({ where: { fizicheskoyeLitsoUid: targetUid }, data: { accounting1cContractorUid: source.accounting1cContractorUid } })
          : Promise.resolve(),
      ]);

      const snapshot: IndividualMergeSnapshot = {
        contractResidentIds: residentContracts.map((c) => c.id),
        contractLegalRepIds: legalRepContracts.map((c) => c.id),
        citizenshipIds: citizenships.map((c) => c.id),
        passportIds: passports.map((c) => c.id),
        contactInfoIds: contactInfos.map((c) => c.id),
        userId: sourceUser?.id ?? null,
        chatConversationId: sourceChat?.id ?? null,
        accountingContractorUidCopied,
      };

      await tx.individual.update({
        where: { fizicheskoyeLitsoUid: uid },
        data: { mergedIntoUid: targetUid, mergedAt: new Date(), mergedSnapshot: snapshot as unknown as Prisma.InputJsonValue },
      });

      const userId = await ensureUserRecord(tx, req.user!);
      await this.auditLog.log(tx, {
        userId,
        action: 'UPDATE',
        entityType: 'Individual',
        entityId: uid,
        entityLabel: `${source.fullName} → объединено с ${target.fullName}`,
        before: { mergedIntoUid: null },
        after: { mergedIntoUid: targetUid },
        fields: ['mergedIntoUid'],
      });
    });

    return this.detail(targetUid);
  }

  // Отмена слияния — только ADMIN (не STAFF, см. @Roles ниже, переопределяет уровень
  // класса), это восстановление после ошибки сотрудника, не рядовое действие. По
  // сохранённому mergedSnapshot (см. merge() выше) переносит обратно РОВНО те строки,
  // что были перенесены при слиянии — не всё подряд, что сейчас есть у цели (у нее могли
  // появиться собственные новые данные уже после слияния, их не трогаем).
  @Roles('ADMIN')
  @Post(':uid/unmerge')
  @HttpCode(200)
  async unmerge(@Param('uid') uid: string, @Req() req: Request) {
    const source = await this.prisma.individual.findUnique({ where: { fizicheskoyeLitsoUid: uid } });
    if (!source) {
      throw new NotFoundException('individuals.errors.individualNotFound');
    }
    if (!source.mergedIntoUid) {
      throw new BadRequestException('individuals.errors.unmergeNotMerged');
    }
    const targetUid = source.mergedIntoUid;
    const snapshot = source.mergedSnapshot as unknown as IndividualMergeSnapshot | null;
    if (!snapshot) {
      throw new BadRequestException('individuals.errors.unmergeNoSnapshot');
    }

    await this.prisma.$transaction(async (tx) => {
      await Promise.all([
        snapshot.contractResidentIds.length
          ? tx.contract.updateMany({ where: { id: { in: snapshot.contractResidentIds } }, data: { residentIndividualUid: uid } })
          : Promise.resolve(),
        snapshot.contractLegalRepIds.length
          ? tx.contract.updateMany({ where: { id: { in: snapshot.contractLegalRepIds } }, data: { legalRepIndividualUid: uid } })
          : Promise.resolve(),
        // preservedFromMerge сбрасываем обратно — строка возвращается на исходное ручное
        // физлицо, которое ресинк вообще не трогает (не входит в его выборку isManual:false),
        // флаг там больше не нужен и не должен пережить возможное будущее слияние с другим target.
        snapshot.citizenshipIds.length
          ? tx.citizenship.updateMany({ where: { id: { in: snapshot.citizenshipIds } }, data: { fizicheskoyeLitsoUid: uid, preservedFromMerge: false } })
          : Promise.resolve(),
        snapshot.passportIds.length
          ? tx.passport.updateMany({ where: { id: { in: snapshot.passportIds } }, data: { fizicheskoyeLitsoUid: uid, preservedFromMerge: false } })
          : Promise.resolve(),
        snapshot.contactInfoIds.length
          ? tx.contactInfo.updateMany({ where: { id: { in: snapshot.contactInfoIds } }, data: { fizicheskoyeLitsoUid: uid, preservedFromMerge: false } })
          : Promise.resolve(),
        snapshot.userId ? tx.user.update({ where: { id: snapshot.userId }, data: { univerId: uid } }) : Promise.resolve(),
        snapshot.chatConversationId
          ? tx.chatConversation.update({ where: { id: snapshot.chatConversationId }, data: { individualUid: uid } })
          : Promise.resolve(),
        // Возвращаем в null, а не на какое-то старое значение цели — до слияния его там не
        // было (мы копировали только когда у цели было пусто, см. merge() выше).
        snapshot.accountingContractorUidCopied
          ? tx.individual.update({ where: { fizicheskoyeLitsoUid: targetUid }, data: { accounting1cContractorUid: null } })
          : Promise.resolve(),
      ]);

      await tx.individual.update({
        where: { fizicheskoyeLitsoUid: uid },
        data: { mergedIntoUid: null, mergedAt: null, mergedSnapshot: Prisma.DbNull },
      });

      const userId = await ensureUserRecord(tx, req.user!);
      await this.auditLog.log(tx, {
        userId,
        action: 'UPDATE',
        entityType: 'Individual',
        entityId: uid,
        entityLabel: `${source.fullName} — слияние отменено`,
        before: { mergedIntoUid: targetUid },
        after: { mergedIntoUid: null },
        fields: ['mergedIntoUid'],
      });
    });

    return this.detail(uid);
  }

  // История изменений одного физлица — кнопка "История изменений" на карточке
  // (IndividualDetail.vue). Отдельно от общего /audit-log (тот — только ADMIN, показывает
  // все типы сущностей сразу) — здесь тот же уровень доступа, что и у самой карточки
  // (STAFF/ADMIN), т.к. это просто история по уже открытой записи, не отдельная
  // административная возможность. Без пагинации — объём на одно физлицо небольшой.
  // Если в это физлицо когда-то что-то слили (merge(), см. выше) — история слитых
  // записей (кто их создавал, что в них правили ДО слияния) тоже подмешивается сюда,
  // иначе она была бы навсегда недостижима с карточки актуальной записи.
  @Get(':uid/audit-log')
  async individualAuditLog(@Param('uid') uid: string) {
    const mergedFrom = await this.prisma.individual.findMany({
      where: { mergedIntoUid: uid },
      select: { fizicheskoyeLitsoUid: true },
    });
    const entityIds = [uid, ...mergedFrom.map((m) => m.fizicheskoyeLitsoUid)];

    const rows = await this.prisma.auditLog.findMany({
      where: { entityType: 'Individual', entityId: { in: entityIds } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { fullName: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      userFullName: row.user.fullName,
      action: row.action,
      changes: row.changes,
      createdAt: row.createdAt,
    }));
  }

  // Кнопка "Синхронизировать" на карточке физлица — единственный способ запустить
  // этот синхрон (см. IndividualSyncController: там только логи, без POST).
  @Post(':uid/sync')
  @HttpCode(200)
  async sync(@Param('uid') uid: string): Promise<IndividualSyncResult> {
    try {
      return await this.individualSyncService.runSyncForIndividual(uid);
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        throw new ConflictException('individuals.errors.syncAlreadyRunning');
      }
      throw error;
    }
  }
}
