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
const RF_PASSPORT_SERIES_MESSAGE = 'Серия паспорта гражданина РФ должна состоять из 4 цифр';
const RF_PASSPORT_NUMBER_MESSAGE = 'Номер паспорта гражданина РФ должен состоять из 6 цифр';

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
  message: 'Выберите гражданство из списка',
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
    snils: clearableFormattedText(SNILS_PATTERN, 'СНИЛС должен быть в формате 000-000-000 00'),
    inn: clearableText,
    passportSeries: clearableText,
    passportNumber: clearableText,
    passportIssuedBy: clearableText,
    passportIssuedCode: clearableFormattedText(SUBDIVISION_CODE_PATTERN, 'Код подразделения должен быть в формате 000-000'),
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
    snils: z.string().trim().regex(SNILS_PATTERN, 'СНИЛС должен быть в формате 000-000-000 00').nullish(),
    inn: z.string().trim().min(1).nullish(),
    passportSeries: z.string().trim().min(1).nullish(),
    passportNumber: z.string().trim().min(1),
    passportIssuedBy: z.string().trim().min(1).nullish(),
    passportIssuedCode: z.string().trim().regex(SUBDIVISION_CODE_PATTERN, 'Код подразделения должен быть в формате 000-000').nullish(),
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

    const where: Prisma.IndividualWhereInput | undefined =
      searchClause || filterClauses.length > 0 ? { AND: [...(searchClause ? [searchClause] : []), ...filterClauses] } : undefined;

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
      throw new BadRequestException(parsed.error.message);
    }
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
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
      throw new BadRequestException(parsed.error.message);
    }
    if (!req.user) {
      throw new BadRequestException('Не удалось определить пользователя сессии');
    }
    const data = parsed.data;
    const fullName = [data.surname, data.name, data.otchestvo].filter(Boolean).join(' ');

    const existing = await this.prisma.individual.findUnique({ where: { fizicheskoyeLitsoUid: uid } });
    if (!existing) {
      throw new NotFoundException('Физлицо не найдено');
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
        },
      }),
      this.prisma.student.findMany({
        where: { fizicheskoyeLitsoUid: uid },
        orderBy: { period: 'desc' },
      }),
    ]);

    if (!individual) {
      throw new NotFoundException('Физлицо не найдено');
    }

    return {
      ...individual,
      passports: sortPassportsByPriority(individual.passports),
      contactInfos: pickLatestContactInfo(individual.contactInfos),
      students,
    };
  }

  // История изменений одного физлица — кнопка "История изменений" на карточке
  // (IndividualDetail.vue). Отдельно от общего /audit-log (тот — только ADMIN, показывает
  // все типы сущностей сразу) — здесь тот же уровень доступа, что и у самой карточки
  // (STAFF/ADMIN), т.к. это просто история по уже открытой записи, не отдельная
  // административная возможность. Без пагинации — объём на одно физлицо небольшой.
  @Get(':uid/audit-log')
  async individualAuditLog(@Param('uid') uid: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { entityType: 'Individual', entityId: uid },
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
        throw new ConflictException('Синхронизация физлица уже выполняется, дождитесь её завершения');
      }
      throw error;
    }
  }
}
