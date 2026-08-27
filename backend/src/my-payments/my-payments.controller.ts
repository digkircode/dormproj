import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import { Prisma } from '../../generated/prisma/client.js';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ensureUserRecord } from '../users/ensure-user';
import type { SessionUser } from '../auth/types';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { Env } from '../config/env.schema';
import { allocatePaymentFifo } from '../billing/payment-allocation';
import { computePenaltyBalance } from '../billing/penalty-balance';
import { dateOnly } from '../billing/period-utils';
import { serializeAccrual } from '../contracts/serializers';
import {
  ACQUIRING_PROVIDER,
  AcquiringNotConfiguredError,
  type AcquiringProvider,
} from '../acquiring/acquiring.types';
import { FISCAL_PROVIDER, FiscalNotConfiguredError, type FiscalProvider } from '../fiscal/fiscal.types';
import { PaymentRateLimiterService } from './payment-rate-limiter.service';
import { buildPaymentDescription, buildPeriodLabel } from './payment-description';
import { pickLatestContactInfo } from '../individuals/contact-info-priority';

const { Decimal } = Prisma;

type PaymentIntentWithContract = Prisma.PaymentIntentGetPayload<{ include: { contract: true } }>;

// Телефон убран из формы (по прямой просьбе 2026-08-25) — только email, обязателен.
// ФИО представителя — только буквы (кириллица/латиница), пробел и дефис — то же самое
// ограничение, что и на фронте (см. sanitizeLettersOnly в lib/utils.ts), продублировано
// тут: фронт вырезает недопустимые символы на вводе, но прямой запрос мимо формы должен
// отклоняться сервером, а не просто довериться уже отфильтрованному значению.
const REPRESENTATIVE_NAME_PATTERN = /^[A-Za-zА-Яа-яЁё\s-]+$/;
const createIntentSchema = z
  .object({
    contractId: z.number().int().positive().nullish(),
    accrualIds: z.array(z.number().int().positive()).default([]),
    // Пеня всегда платится отдельным платежом (см. buildPeriodLabel/payment-description.ts)
    // — не сочетается с accrualIds/customAmount, гасит строго пеню (см. createIntent ниже
    // и penaltyOnly на PaymentIntent, reconcileBankStatus пропускает для неё allocatePaymentFifo).
    penaltyOnly: z.boolean().default(false),
    customAmount: z.number().positive().nullish(),
    payerIsResident: z.boolean(),
    representativeFullName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(REPRESENTATIVE_NAME_PATTERN, 'payment.errors.representativeNamePattern')
      .nullish(),
    payerEmail: z.string().trim().email(),
  })
  .refine((v) => v.payerIsResident || (v.representativeFullName?.length ?? 0) > 0, {
    message: 'payment.errors.representativeNameRequired',
    path: ['representativeFullName'],
  });

function parseIdParam(idParam: string): number {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isInteger(id)) {
    throw new BadRequestException('contracts.errors.invalidId');
  }
  return id;
}

function serializeIntent(intent: {
  id: number;
  amount: Prisma.Decimal;
  status: string;
  description: string;
  createdAt: Date;
  fiscalStatus: string | null;
  fiscalReceiptUrl: string | null;
  failureReason: string | null;
}) {
  return {
    id: intent.id,
    amount: Number(intent.amount),
    status: intent.status,
    description: intent.description,
    createdAt: intent.createdAt,
    fiscalStatus: intent.fiscalStatus,
    fiscalReceiptUrl: intent.fiscalReceiptUrl,
    failureReason: intent.failureReason,
  };
}

// Онлайн-оплата проживающего — тот же паттерн self-only доступа, что my-contract.controller.ts
// (без :id в маршруте, individualUid только из сессии). Скелет эквайринга/кассы — см.
// acquiring/ и fiscal/, обе стороны подключаются через интерфейс и молчаливо "не настроены"
// без реквизитов в .env (см. AcquiringNotConfiguredError/FiscalNotConfiguredError ниже).
@Controller('my-payments')
@UseGuards(AuthGuard, RolesGuard)
@Roles('RESIDENT')
export class MyPaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly rateLimiter: PaymentRateLimiterService,
    private readonly config: ConfigService<Env, true>,
    @Inject(ACQUIRING_PROVIDER) private readonly acquiring: AcquiringProvider,
    @Inject(FISCAL_PROVIDER) private readonly fiscal: FiscalProvider,
  ) {}

  private async resolveIndividualUid(userId: number): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { univerId: true } });
    if (!user?.univerId) {
      throw new BadRequestException('payment.errors.accountNotLinked');
    }
    return user.univerId;
  }

  // Email для чека — Individual.email как основной источник (туда же пишем правку, см.
  // createIntent), фолбэк на самую актуальную запись ContactInfo типа "Email" (синк из
  // 1С, тот же pickLatestContactInfo, что и на карточке физлица) — по прямой просьбе
  // 2026-08-25: раньше поле было полностью ручным, теперь подтягивается само.
  private async resolveResidentEmail(individualUid: string): Promise<string | null> {
    const individual = await this.prisma.individual.findUnique({
      where: { fizicheskoyeLitsoUid: individualUid },
      select: { email: true },
    });
    if (individual?.email) return individual.email;

    const contactInfos = await this.prisma.contactInfo.findMany({ where: { fizicheskoyeLitsoUid: individualUid } });
    const emailContact = pickLatestContactInfo(contactInfos).find((c) => c.type === 'Email');
    return emailContact?.email || null;
  }

  // contractId — явный выбор из переключателя договоров (см. my-contract.controller.ts#myContracts,
  // тот же принцип multi-contract, добавлено 2026-08-25); без него — самый свежий, как раньше.
  // Принадлежность resident'у проверяется прямо в where.
  private async findResidentContract(individualUid: string, contractId?: number) {
    const contract = await this.prisma.contract.findFirst({
      where: contractId ? { id: contractId, residentIndividualUid: individualUid } : { residentIndividualUid: individualUid },
      orderBy: { contractDate: 'desc' },
      include: {
        resident: { select: { fullName: true } },
        accruals: {
          orderBy: { periodStart: 'asc' },
          include: { allocations: { include: { payment: { select: { paidAt: true, reversedAt: true } } } } },
        },
        payments: true,
        penaltyLogs: true,
        roomAssignments: { orderBy: { fromDate: 'desc' }, include: { room: { select: { room: true } } } },
      },
    });
    return contract;
  }

  private resolveRoomNumber(roomAssignments: { toDate: Date | null; room: { room: string } }[]): string | null {
    return (roomAssignments.find((a) => a.toDate === null) ?? roomAssignments[0])?.room.room ?? null;
  }

  private parseContractId(contractIdParam: string | undefined): number | undefined {
    if (contractIdParam === undefined) return undefined;
    const id = Number.parseInt(contractIdParam, 10);
    if (!Number.isInteger(id)) throw new BadRequestException('contracts.errors.invalidContractId');
    return id;
  }

  @Get()
  async myPayments(@Query('contractId') contractIdParam: string | undefined, @Req() req: Request) {
    if (!req.user) throw new BadRequestException('contracts.errors.sessionUserNotFound');
    const individualUid = await this.resolveIndividualUid(req.user.id);
    const contract = await this.findResidentContract(individualUid, this.parseContractId(contractIdParam));
    if (!contract) return { contract: null };

    const openAccruals = contract.accruals
      .filter((a) => !a.voidedAt)
      .map(serializeAccrual)
      .filter((a) => a.balance > 0);
    const { penaltyBalance } = computePenaltyBalance({
      asOf: dateOnly(new Date()),
      penaltyLogs: contract.penaltyLogs,
      accruals: contract.accruals,
      payments: contract.payments,
    });

    const intents = await this.prisma.paymentIntent.findMany({
      where: { contractId: contract.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      contract: {
        id: contract.id,
        number: contract.number,
        residentFullName: contract.resident.fullName,
        roomNumber: this.resolveRoomNumber(contract.roomAssignments),
      },
      openAccruals,
      penaltyBalance: Number(penaltyBalance),
      acquiringAvailable: this.acquiring.isConfigured(),
      history: intents.map(serializeIntent),
      payerEmail: await this.resolveResidentEmail(individualUid),
    };
  }

  @Post('intents')
  async createIntent(@Body() body: unknown, @Req() req: Request) {
    if (!req.user) throw new BadRequestException('contracts.errors.sessionUserNotFound');
    this.rateLimiter.checkAndRecord(req.user.id);

    const parsed = createIntentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'payment.errors.invalidData');
    }
    const input = parsed.data;

    if (!this.acquiring.isConfigured()) {
      throw new ServiceUnavailableException('payment.errors.acquiringUnavailable');
    }

    const individualUid = await this.resolveIndividualUid(req.user.id);
    const contract = await this.findResidentContract(individualUid, input.contractId ?? undefined);
    if (!contract) throw new NotFoundException('payment.errors.noActiveContract');

    // Правка email прямо из формы оплаты — пишем в Individual.email, он и есть основной
    // источник для resolveResidentEmail (см. выше), так что дальше подтягивается уже
    // отсюда, а не из ContactInfo/1С (по прямой просьбе 2026-08-25). Только когда платит
    // сам проживающий — email представителя не имеет отношения к его собственной карточке.
    if (input.payerIsResident) {
      const currentEmail = await this.resolveResidentEmail(individualUid);
      if (input.payerEmail !== currentEmail) {
        await this.prisma.individual.update({ where: { fizicheskoyeLitsoUid: individualUid }, data: { email: input.payerEmail } });
      }
    }

    const openAccruals = contract.accruals.filter((a) => !a.voidedAt).map(serializeAccrual).filter((a) => a.balance > 0);
    const { penaltyBalance } = computePenaltyBalance({
      asOf: dateOnly(new Date()),
      penaltyLogs: contract.penaltyLogs,
      accruals: contract.accruals,
      payments: contract.payments,
    });

    let amount: number;
    let selectedAccrualStarts: Date[] = [];
    let includesPenalty = false;

    if (input.penaltyOnly) {
      // Пеню можно платить в любом случае (даже если на договоре ещё есть непогашенные
      // начисления) — только и всегда отдельным платежом, никогда вперемешку с accrualIds/
      // customAmount, см. схему выше. reconcileBankStatus не пропускает такой платёж через
      // allocatePaymentFifo вообще (см. penaltyOnly на PaymentIntent), поэтому вся сумма
      // гарантированно засчитывается именно в пеню, независимо от того, сколько ещё
      // открытых начислений на договоре — по прямой просьбе 2026-08-27.
      if (Number(penaltyBalance) <= 0) {
        throw new BadRequestException('payment.errors.nothingToPay');
      }
      amount = input.customAmount ?? Number(penaltyBalance);
      if (amount > Number(penaltyBalance) + 0.01) {
        throw new BadRequestException('payment.errors.amountExceedsDebt');
      }
      includesPenalty = true;
    } else if (input.customAmount != null) {
      const totalDebt = openAccruals.reduce((sum, a) => sum + a.balance, 0);
      if (input.customAmount > totalDebt + 0.01) {
        throw new BadRequestException('payment.errors.amountExceedsDebt');
      }
      amount = input.customAmount;
    } else {
      const selected = openAccruals.filter((a) => input.accrualIds.includes(a.id));
      if (selected.length !== input.accrualIds.length) {
        throw new BadRequestException('payment.errors.accrualsUnavailable');
      }
      amount = selected.reduce((sum, a) => sum + a.balance, 0);
      selectedAccrualStarts = selected.map((a) => a.periodStart);
      if (amount <= 0) throw new BadRequestException('payment.errors.nothingToPay');
    }

    const periodLabel = buildPeriodLabel(selectedAccrualStarts, includesPenalty);
    const description = buildPaymentDescription(
      contract.resident.fullName,
      input.payerIsResident,
      input.representativeFullName ?? null,
      periodLabel,
    );
    const payerFullName = input.payerIsResident ? contract.resident.fullName : input.representativeFullName!.trim();

    const intent = await this.prisma.paymentIntent.create({
      data: {
        contractId: contract.id,
        amount: new Decimal(amount),
        description,
        payerFullName,
        payerEmail: input.payerEmail,
        penaltyOnly: input.penaltyOnly,
      },
    });

    const frontendUrl = this.config.get('FRONTEND_URL', { infer: true }).replace(/\/+$/, '');
    const returnUrl = `${frontendUrl}/student/payment?intentId=${intent.id}`;

    try {
      const started = await this.acquiring.startPayment({
        amount,
        description,
        orderId: String(intent.id),
        items: [{ name: description.slice(0, 128), price: amount, quantity: 1, sum: amount }],
        returnUrl,
        successUrl: returnUrl,
        failureUrl: returnUrl,
        params: { resident_fio: contract.resident.fullName },
      });
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PENDING_BANK', bankToken: started.bankToken },
      });
      return { intentId: intent.id, paymentPageUrl: started.paymentPageUrl };
    } catch (error) {
      // Резолвится сразу текстом (не ключом) — значение уходит и в исключение клиенту, и в
      // failureReason на PaymentIntent (БД), которое дальше отдаётся как есть, без второго
      // прохода через переводчик (см. serializeIntent) — в отличие от остальных исключений
      // в контроллерах, здесь перевод нужен один раз, на месте.
      const message =
        error instanceof AcquiringNotConfiguredError
          ? (I18nContext.current()?.t('payment.errors.acquiringUnavailable') ?? error.message)
          : (I18nContext.current()?.t('payment.errors.bankStartFailed') ?? 'payment.errors.bankStartFailed');
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED', failureReason: message },
      });
      throw new ServiceUnavailableException(message);
    }
  }

  @Get('intents/:id')
  async getIntent(@Param('id') idParam: string, @Req() req: Request) {
    if (!req.user) throw new BadRequestException('contracts.errors.sessionUserNotFound');
    const id = parseIdParam(idParam);
    const individualUid = await this.resolveIndividualUid(req.user.id);

    let intent: PaymentIntentWithContract | null = await this.prisma.paymentIntent.findUnique({
      where: { id },
      include: { contract: true },
    });
    if (!intent || intent.contract.residentIndividualUid !== individualUid) {
      throw new NotFoundException('payment.errors.intentNotFound');
    }

    if (intent.status === 'PENDING_BANK' && intent.bankToken) {
      intent = await this.reconcileBankStatus(intent, req.user);
    }
    if (intent.status === 'SUCCEEDED' && intent.fiscalUuid && intent.fiscalStatus !== 'done') {
      intent = await this.reconcileFiscalStatus(intent);
    }

    return serializeIntent(intent);
  }

  // Опрос банка сервером (не доверяем редиректу браузера, см. промпт задачи) — переводит
  // intent в SUCCEEDED/FAILED, при успехе тут же заводит настоящий Payment и разносит его
  // по начислениям тем же allocatePaymentFifo, что и ручные платежи сотрудников.
  private async reconcileBankStatus(intent: PaymentIntentWithContract, sessionUser: SessionUser): Promise<PaymentIntentWithContract> {
    let status;
    try {
      status = await this.acquiring.getStatus(intent.bankToken!);
    } catch (error) {
      if (error instanceof AcquiringNotConfiguredError) return intent;
      throw error;
    }

    if (status.state === 'IN_PROGRESS') return intent;

    if (status.state === 'FAILED') {
      return this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'FAILED',
          bankRawStatus: status.raw as Prisma.InputJsonValue,
          failureReason: status.failureReason ?? I18nContext.current()?.t('payment.errors.bankDeclined') ?? 'Банк отклонил платёж',
        },
        include: { contract: true },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Перечитываем внутри транзакции — сюда можно дойти дважды почти одновременно
      // (два опроса статуса подряд), вторая попытка не должна создать второй Payment.
      const fresh = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id }, include: { contract: true } });
      if (fresh.status !== 'PENDING_BANK') return fresh;

      const userId = await ensureUserRecord(tx, sessionUser);
      const payment = await tx.payment.create({
        data: {
          contractId: fresh.contractId,
          amount: fresh.amount,
          paidAt: new Date(),
          method: 'CARD_ACQUIRING',
          source: 'WEBSITE',
          externalRef: status.trxId ?? status.rrn ?? fresh.bankToken,
          rawComment: fresh.description,
        },
      });
      // penaltyOnly — намеренно НЕ разносим по начислениям: вся сумма остаётся
      // неаллоцированной, computePenaltyBalance трактует такой "остаток" как покрытие
      // пени (см. billing/penalty-balance.ts) — это и гарантирует, что деньги уходят
      // именно в пеню, а не в старейшее непогашенное начисление по FIFO.
      if (!fresh.penaltyOnly) {
        await allocatePaymentFifo(tx, fresh.contractId, payment.id, fresh.amount);
      }

      await this.auditLog.log(tx, {
        userId,
        action: 'CREATE',
        entityType: 'Payment',
        entityId: payment.id,
        entityLabel: `Онлайн-платёж по договору №${fresh.contract.number}`,
        before: null,
        after: payment,
        fields: ['amount', 'paidAt', 'method', 'source', 'rawComment'],
      });

      return tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'SUCCEEDED', bankRawStatus: status.raw as Prisma.InputJsonValue, paymentId: payment.id },
        include: { contract: true },
      });
    }).then(async (updated) => {
      if (updated.status === 'SUCCEEDED' && !updated.fiscalUuid) {
        return this.registerFiscalReceipt(updated);
      }
      return updated;
    });
  }

  // Best-effort: чек — отдельный от денег шаг, ошибка кассы не должна "откатывать" уже
  // проведённый платёж, просто оставляет fiscalStatus пустым до следующего опроса.
  private async registerFiscalReceipt(intent: PaymentIntentWithContract): Promise<PaymentIntentWithContract> {
    if (!this.fiscal.isConfigured()) return intent;
    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: intent.paymentId! },
        include: { allocations: true },
      });
      const allocated = (payment?.allocations ?? []).reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
      const penaltyPortion = new Decimal(intent.amount).minus(allocated);

      const items: { name: string; price: number; quantity: number; sum: number }[] = [];
      if (allocated.greaterThan(0)) {
        items.push({ name: 'Оплата проживания в общежитии', price: Number(allocated), quantity: 1, sum: Number(allocated) });
      }
      if (penaltyPortion.greaterThan(0)) {
        items.push({ name: 'Пеня по договору найма', price: Number(penaltyPortion), quantity: 1, sum: Number(penaltyPortion) });
      }
      if (items.length === 0) return intent;

      const registered = await this.fiscal.registerReceipt({
        externalId: `payment-intent-${intent.id}`,
        items,
        total: Number(intent.amount),
        clientName: intent.payerFullName,
        clientEmail: intent.payerEmail ?? undefined,
        clientPhone: intent.payerPhone ?? undefined,
      });
      return this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { fiscalUuid: registered.uuid, fiscalStatus: 'wait' },
        include: { contract: true },
      });
    } catch (error) {
      if (error instanceof FiscalNotConfiguredError) return intent;
      // Не пробрасываем — платёж уже проведён, чек можно дозарегистрировать позже вручную.
      return intent;
    }
  }

  private async reconcileFiscalStatus(intent: PaymentIntentWithContract): Promise<PaymentIntentWithContract> {
    try {
      const status = await this.fiscal.getReceiptStatus(intent.fiscalUuid!);
      if (status.state === 'WAIT') return intent;
      return this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: {
          fiscalStatus: status.state === 'DONE' ? 'done' : 'fail',
          fiscalReceiptUrl: status.receiptUrl ?? null,
        },
        include: { contract: true },
      });
    } catch (error) {
      if (error instanceof FiscalNotConfiguredError) return intent;
      return intent;
    }
  }
}
