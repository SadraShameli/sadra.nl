import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    type FeeKind,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    type LedgerAccountRow,
    type LedgerEventRow,
    type LedgerFeeRow,
    type LedgerPayoutRow,
    PortfolioLedger,
    type PortfolioLedgerRows,
} from '~/lib/prop-accounts/metrics';
import {
    ALL_FIRMS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { NINETY_FIVE_PERCENT_Z } from '~/lib/prop-calculator/stats';

const USER_ID = 'user-a';
export const OTHER_USER_ID = 'user-b';

export interface PlanEntry {
    readonly firm: TradingFirm;
    readonly plan: Plan;
    readonly serial: string;
}

const REGISTRY: readonly PlanEntry[] = ALL_FIRMS.flatMap((firm) =>
    firm.plans.map((plan) => ({
        firm,
        plan,
        serial: serializePlanId(plan.id),
    })),
);

function firstEntry(isMatch: (entry: PlanEntry) => boolean): PlanEntry {
    const entry = REGISTRY.find(isMatch);
    if (entry === undefined) throw new Error('no registry plan matches');
    return entry;
}

export const EVAL_PLAN = firstEntry((entry) => !entry.plan.isInstantFunded);
export const OTHER_FIRM_EVAL_PLAN = firstEntry(
    (entry) =>
        !entry.plan.isInstantFunded && entry.firm.id !== EVAL_PLAN.firm.id,
);
export const INSTANT_PLAN = firstEntry((entry) => entry.plan.isInstantFunded);
export const FUNDED_RESET_PLAN = firstEntry(
    (entry) => !entry.plan.isInstantFunded && entry.plan.fundedReset !== null,
);
export const SAME_FIRM_SECOND_EVAL_PLAN = firstEntry(
    (entry) =>
        !entry.plan.isInstantFunded &&
        entry.firm.id === EVAL_PLAN.firm.id &&
        entry.serial !== EVAL_PLAN.serial,
);

const sequence = { value: 0 };

export function account(
    entry: PlanEntry,
    overrides: Partial<LedgerAccountRow> = {},
): LedgerAccountRow {
    return {
        accountSize: entry.plan.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        externalFirmId: null,
        firmId: entry.firm.id,
        fundedOn: null,
        id: nextId('account'),
        label: nextId('label'),
        optIns: {},
        planLabel: null,
        planSerial: entry.serial,
        purchasedOn: '2026-09-01',
        readIssues: [],
        replacesAccountId: null,
        stage: entry.plan.isInstantFunded
            ? AccountStage.Funded
            : AccountStage.Eval,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
        userId: USER_ID,
        ...overrides,
    };
}

export function event(
    owner: LedgerAccountRow,
    kind: AccountEventKind,
    occurredOn: string,
    overrides: Partial<LedgerEventRow> = {},
): LedgerEventRow {
    return {
        accountId: owner.id,
        createdAt: new Date(`${occurredOn}T12:00:00Z`),
        id: nextId('event'),
        kind,
        occurredOn,
        userId: owner.userId,
        ...overrides,
    };
}

export function fee(
    owner: LedgerAccountRow,
    kind: FeeKind,
    amountCents: number,
    paidOn: string,
    overrides: Partial<LedgerFeeRow> = {},
): LedgerFeeRow {
    return {
        accountId: owner.id,
        amountCents: usdCents(amountCents),
        id: nextId('fee'),
        kind,
        paidOn,
        userId: owner.userId,
        ...overrides,
    };
}

export function ledger(rows: Partial<PortfolioLedgerRows>): PortfolioLedger {
    return PortfolioLedger.fromRows(USER_ID, {
        accounts: rows.accounts ?? [],
        events: rows.events ?? [],
        fees: rows.fees ?? [],
        payouts: rows.payouts ?? [],
    });
}

export function meanInterval(
    value: number,
    standardError: null | number,
): null | { readonly lower: number; readonly upper: number } {
    return standardError === null
        ? null
        : {
              lower: value - NINETY_FIVE_PERCENT_Z * standardError,
              upper: value + NINETY_FIVE_PERCENT_Z * standardError,
          };
}

export function payout(
    owner: LedgerAccountRow,
    grossCents: number,
    options: {
        readonly approvedOn?: null | string;
        readonly netCents?: null | number;
        readonly paidOn?: null | string;
        readonly requestedOn?: string;
        readonly status?: PayoutStatus;
        readonly userId?: string;
    } = {},
): LedgerPayoutRow {
    const paidOn = options.paidOn === undefined ? '2026-09-20' : options.paidOn;
    const netCents = options.netCents ?? null;
    return {
        accountId: owner.id,
        approvedOn: options.approvedOn ?? null,
        grossCents: usdCents(grossCents),
        id: nextId('payout'),
        netCents: netCents === null ? null : usdCents(netCents),
        paidOn,
        requestedOn: options.requestedOn ?? paidOn ?? '2026-09-18',
        status: options.status ?? PayoutStatus.Paid,
        userId: options.userId ?? owner.userId,
    };
}

export function purchased(owner: LedgerAccountRow): LedgerEventRow {
    return event(owner, AccountEventKind.Purchased, owner.purchasedOn);
}

function nextId(prefix: string): string {
    sequence.value += 1;
    return `${prefix}-${String(sequence.value).padStart(6, '0')}`;
}
