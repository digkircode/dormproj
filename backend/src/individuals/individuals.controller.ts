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

const clearableText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

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

const citizenshipField = z.enum(OKSM_COUNTRIES as unknown as [string, ...string[]], {
  message: 'individuals.errors.citizenshipRequired',
});

const updateIndividualSchema = z
  .object({
    surname: z.string().trim().min(1),
    name: z.string().trim().min(1),
    otchestvo: clearableText,
    birthDate: z.coerce.date(),
    gender: z.enum(['Мужской', 'Женский']),
    citizenship: citizenshipField,
    birthPlace: clearableText,
    registrationAddress: clearableText,
    residenceAddress: clearableText,
    phone: clearableText,
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

const createIndividualSchema = z
  .object({
    surname: z.string().trim().min(1),
    name: z.string().trim().min(1),
    otchestvo: z.string().trim().min(1).nullish(),
    birthDate: z.coerce.date(),
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

function normalizedFullName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

function sameBirthDate(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

type MergeIdentity = {
  fullName: string;
  surname: string | null;
  name: string | null;
  otchestvo: string | null;
  birthDate: Date | null;
  snils: string | null;
};

function normalizedNamePart(value: string): string {
  return normalizedFullName(value).replace(/ё/g, 'е');
}

function sameMergeIdentity(source: MergeIdentity, target: MergeIdentity): boolean {
  if (!sameBirthDate(source.birthDate, target.birthDate)) return false;
  if (source.surname && target.surname && source.name && target.name) {
    return normalizedNamePart(source.surname) === normalizedNamePart(target.surname)
      && normalizedNamePart(source.name) === normalizedNamePart(target.name)
      && (!source.otchestvo || !target.otchestvo
        || normalizedNamePart(source.otchestvo) === normalizedNamePart(target.otchestvo));
  }
  return normalizedFullName(source.fullName) === normalizedFullName(target.fullName);
}

function conflictingSnils(source: MergeIdentity, target: MergeIdentity): boolean {
  const sourceSnils = source.snils?.replace(/\D/g, '');
  const targetSnils = target.snils?.replace(/\D/g, '');
  return !!sourceSnils && !!targetSnils && sourceSnils !== targetSnils;
}

function birthDateDayRange(date: Date): { gte: Date; lt: Date } {
  const gte = new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return { gte, lt: new Date(gte.getTime() + 24 * 60 * 60 * 1000) };
}

const accounting1cMappingSchema = z.object({
  contractorUid: z.string().trim().max(200).nullish().transform((value) => value || null),
});

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

const SEARCHABLE_FIELDS = ['fullName', 'code', 'snils', 'inn', 'gender', 'birthDateText', 'fizicheskoyeLitsoUid'] as const;

const SORTABLE_FIELDS: Record<string, string> = {
  fullName: 'fullName',
  code: 'code',
  snils: 'snils',
  birthDate: 'birthDate',
  inn: 'inn',
  gender: 'gender',
};

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
      }
    }

    const searchClause: Prisma.IndividualWhereInput | undefined = search
      ? { OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) }
      : undefined;

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

    return {
      data: data.map((individual) => ({
        ...individual,
        accounting1cMatched: Boolean(individual.accounting1cContractorUid),
      })),
      total,
      page,
      pageSize,
    };
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
      const possibleDuplicates = await tx.individual.findMany({
        where: { birthDate: birthDateDayRange(data.birthDate), mergedIntoUid: null },
        select: { fullName: true },
      });
      if (possibleDuplicates.some((candidate) => normalizedFullName(candidate.fullName) === normalizedFullName(fullName))) {
        throw new ConflictException('individuals.errors.duplicateIndividual');
      }
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

  @Patch(':uid/accounting-1c-mapping')
  async updateAccounting1cMapping(@Param('uid') uid: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = accounting1cMappingSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(zodErrorMessage(parsed.error));
    if (!req.user) throw new BadRequestException('contracts.errors.sessionUserNotFound');

    const existing = await this.prisma.individual.findUnique({ where: { fizicheskoyeLitsoUid: uid } });
    if (!existing) throw new NotFoundException('individuals.errors.individualNotFound');
    if (existing.mergedIntoUid) throw new ConflictException('individuals.errors.mergedIndividualReadOnly');

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.individual.update({
        where: { fizicheskoyeLitsoUid: uid },
        data: { accounting1cContractorUid: parsed.data.contractorUid },
      });
      const userId = await ensureUserRecord(tx, req.user!);
      await this.auditLog.log(tx, {
        userId,
        action: 'UPDATE',
        entityType: 'Individual',
        entityId: uid,
        entityLabel: `Сопоставление с 1С - ${existing.fullName}`,
        before: existing,
        after: updated,
        fields: ['accounting1cContractorUid'],
      });
    });

    return this.detail(uid);
  }

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
    if (existing.mergedIntoUid) {
      throw new ConflictException('individuals.errors.mergedIndividualReadOnly');
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

  @Get(':uid')
  async detail(@Param('uid') uid: string) {
    const [individual, students] = await Promise.all([
      this.prisma.individual.findUnique({
        where: { fizicheskoyeLitsoUid: uid },
        include: {
          citizenships: { orderBy: { period: 'desc' }, take: 1 },
          passports: true,
          contactInfos: true,
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
      accounting1cMatched: Boolean(individual.accounting1cContractorUid),
      passports: sortPassportsByPriority(individual.passports),
      contactInfos: pickLatestContactInfo(individual.contactInfos),
      students,
    };
  }

  @Get(':uid/merge-candidates')
  async mergeCandidates(@Param('uid') uid: string) {
    const source = await this.prisma.individual.findUnique({ where: { fizicheskoyeLitsoUid: uid } });
    if (!source) {
      throw new NotFoundException('individuals.errors.individualNotFound');
    }
    if (!source.isManual || source.mergedIntoUid) {
      return [];
    }

    if (!source.birthDate) return [];
    const sameDayCandidates = await this.prisma.individual.findMany({
      where: { isManual: false, mergedIntoUid: null, birthDate: birthDateDayRange(source.birthDate) },
      select: { fizicheskoyeLitsoUid: true, fullName: true, surname: true, name: true, otchestvo: true, snils: true, birthDate: true, code: true },
    });
    return sameDayCandidates
      .filter((candidate) => sameMergeIdentity(source, candidate) && !conflictingSnils(source, candidate))
      .sort((a, b) => Number(normalizedFullName(b.fullName) === normalizedFullName(source.fullName))
        - Number(normalizedFullName(a.fullName) === normalizedFullName(source.fullName)))
      .slice(0, 10);
  }

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
    if (!sameMergeIdentity(source, target)) {
      throw new BadRequestException('individuals.errors.mergeIdentityMismatch');
    }
    if (conflictingSnils(source, target)) {
      throw new ConflictException('individuals.errors.mergeSnilsConflict');
    }
    if (source.accounting1cContractorUid && target.accounting1cContractorUid
      && source.accounting1cContractorUid !== target.accounting1cContractorUid) {
      throw new ConflictException('individuals.errors.mergeAccountingConflict');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const individualUid of [uid, targetUid].sort()) {
        await tx.$queryRaw`SELECT fizicheskoye_litso_uid FROM individuals WHERE fizicheskoye_litso_uid = ${individualUid} FOR UPDATE`;
      }
      const currentSource = await tx.individual.findUniqueOrThrow({ where: { fizicheskoyeLitsoUid: uid } });
      const currentTarget = await tx.individual.findUniqueOrThrow({ where: { fizicheskoyeLitsoUid: targetUid } });
      if (currentSource.mergedIntoUid) throw new ConflictException('individuals.errors.mergeSourceAlreadyMerged');
      if (currentTarget.mergedIntoUid) throw new ConflictException('individuals.errors.mergeTargetAlreadyMerged');
      if (!sameMergeIdentity(currentSource, currentTarget)) {
        throw new BadRequestException('individuals.errors.mergeIdentityMismatch');
      }
      if (conflictingSnils(currentSource, currentTarget)) {
        throw new ConflictException('individuals.errors.mergeSnilsConflict');
      }
      if (currentSource.accounting1cContractorUid && currentTarget.accounting1cContractorUid
        && currentSource.accounting1cContractorUid !== currentTarget.accounting1cContractorUid) {
        throw new ConflictException('individuals.errors.mergeAccountingConflict');
      }
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

      const [residentContracts, legalRepContracts, citizenships, passports, contactInfos] = await Promise.all([
        tx.contract.findMany({ where: { residentIndividualUid: uid }, select: { id: true } }),
        tx.contract.findMany({ where: { legalRepIndividualUid: uid }, select: { id: true } }),
        tx.citizenship.findMany({ where: { fizicheskoyeLitsoUid: uid }, select: { id: true } }),
        tx.passport.findMany({ where: { fizicheskoyeLitsoUid: uid }, select: { id: true } }),
        tx.contactInfo.findMany({ where: { fizicheskoyeLitsoUid: uid }, select: { id: true } }),
      ]);
      const accountingContractorUidCopied = !currentTarget.accounting1cContractorUid && !!currentSource.accounting1cContractorUid;

      await Promise.all([
        residentContracts.length
          ? tx.contract.updateMany({ where: { id: { in: residentContracts.map((c) => c.id) } }, data: { residentIndividualUid: targetUid } })
          : Promise.resolve(),
        legalRepContracts.length
          ? tx.contract.updateMany({ where: { id: { in: legalRepContracts.map((c) => c.id) } }, data: { legalRepIndividualUid: targetUid } })
          : Promise.resolve(),
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
          ? tx.individual.update({ where: { fizicheskoyeLitsoUid: targetUid }, data: { accounting1cContractorUid: currentSource.accounting1cContractorUid } })
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

    let accountingMappingNeedsReview = false;
    await this.prisma.$transaction(async (tx) => {
      if (snapshot.accountingContractorUidCopied && source.accounting1cContractorUid) {
        const targetOwnAccountingContracts = await tx.contract.count({
          where: {
            residentIndividualUid: targetUid,
            id: { notIn: snapshot.contractResidentIds },
            OR: [
              { accounting1cUid: { not: null } },
              { payments: { some: { accounting1cSyncStatus: 'SYNCED' } } },
            ],
          },
        });
        if (targetOwnAccountingContracts === 0) {
          await tx.individual.updateMany({
            where: { fizicheskoyeLitsoUid: targetUid, accounting1cContractorUid: source.accounting1cContractorUid },
            data: { accounting1cContractorUid: null },
          });
        } else {
          const targetMapping = await tx.individual.findUniqueOrThrow({
            where: { fizicheskoyeLitsoUid: targetUid },
            select: { accounting1cContractorUid: true },
          });
          accountingMappingNeedsReview = targetMapping.accounting1cContractorUid === source.accounting1cContractorUid;
        }
      }
      await Promise.all([
        snapshot.contractResidentIds.length
          ? tx.contract.updateMany({ where: { id: { in: snapshot.contractResidentIds } }, data: { residentIndividualUid: uid } })
          : Promise.resolve(),
        snapshot.contractLegalRepIds.length
          ? tx.contract.updateMany({ where: { id: { in: snapshot.contractLegalRepIds } }, data: { legalRepIndividualUid: uid } })
          : Promise.resolve(),
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
        entityLabel: `${source.fullName} - слияние отменено`,
        before: { mergedIntoUid: targetUid },
        after: { mergedIntoUid: null },
        fields: ['mergedIntoUid'],
      });
    });

    return { ...(await this.detail(uid)), accountingMappingNeedsReview };
  }

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
      userFullName: row.user?.fullName ?? null,
      action: row.action,
      changes: row.changes,
      createdAt: row.createdAt,
    }));
  }

  @Post(':uid/sync')
  @HttpCode(200)
  async sync(@Param('uid') uid: string): Promise<IndividualSyncResult> {
    const individual = await this.prisma.individual.findUnique({ where: { fizicheskoyeLitsoUid: uid }, select: { mergedIntoUid: true } });
    if (!individual) throw new NotFoundException('individuals.errors.individualNotFound');
    if (individual.mergedIntoUid) throw new ConflictException('individuals.errors.mergedIndividualReadOnly');
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
