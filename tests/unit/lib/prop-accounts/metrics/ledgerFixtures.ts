import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    type BankrollTransferKind,
    type FeeKind,
    type FirmEngagementStatus,
    PayoutStatus,
    type ReportedPayoutBasis,
    type RoundStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    type LedgerAccountRow,
    type LedgerEventRow,
    type LedgerFeeRow,
    type LedgerFirmEngagementRow,
    type LedgerFirmStatementRow,
    type LedgerPayoutRow,
    type LedgerRoundRow,
    type LedgerTransferRow,
    PortfolioLedger,
    type PortfolioLedgerRows,
    studentTCriticalValue,
} from '~/lib/prop-accounts/metrics';
import {
    ALL_FIRMS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';

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
        roundId: null,
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

export function firmEngagement(
    externalFirmId: string,
    sinceOn: string,
    status: FirmEngagementStatus,
    overrides: Partial<LedgerFirmEngagementRow> = {},
): LedgerFirmEngagementRow {
    return {
        externalFirmId,
        firmId: null,
        id: nextId('firm-engagement'),
        reason: null,
        sentLiveOn: null,
        sinceOn,
        status,
        userId: USER_ID,
        ...overrides,
    };
}

export function firmStatement(
    externalFirmId: string,
    asOf: string,
    basis: ReportedPayoutBasis,
    reportedPayoutCents: number,
    overrides: Partial<LedgerFirmStatementRow> = {},
): LedgerFirmStatementRow {
    return {
        asOf,
        basis,
        externalFirmId,
        firmId: null,
        id: nextId('firm-statement'),
        reportedPayoutCents: usdCents(reportedPayoutCents),
        userId: USER_ID,
        ...overrides,
    };
}

export function ledger(rows: Partial<PortfolioLedgerRows>): PortfolioLedger {
    return PortfolioLedger.fromRows(USER_ID, {
        accounts: rows.accounts ?? [],
        events: rows.events ?? [],
        fees: rows.fees ?? [],
        firmEngagements: rows.firmEngagements ?? [],
        firmStatements: rows.firmStatements ?? [],
        payouts: rows.payouts ?? [],
        rounds: rows.rounds ?? [],
        transfers: rows.transfers ?? [],
    });
}

export function meanInterval(
    value: number,
    standardError: null | number,
    n: number,
): null | { readonly lower: number; readonly upper: number } {
    if (standardError === null) return null;
    const criticalValue = studentTCriticalValue(n - 1);
    return {
        lower: value - criticalValue * standardError,
        upper: value + criticalValue * standardError,
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

export function round(
    entry: PlanEntry,
    label: string,
    openedOn: string,
    status: RoundStatus,
    overrides: Partial<LedgerRoundRow> = {},
): LedgerRoundRow {
    return {
        budgetCents: null,
        closedOn: null,
        externalFirmId: null,
        firmId: entry.firm.id,
        id: nextId('round'),
        label,
        openedOn,
        status,
        userId: USER_ID,
        ...overrides,
    };
}

export function transfer(
    kind: BankrollTransferKind,
    amountCents: number,
    occurredOn: string,
    overrides: Partial<LedgerTransferRow> = {},
): LedgerTransferRow {
    return {
        amountCents: usdCents(amountCents),
        id: nextId('transfer'),
        kind,
        occurredOn,
        userId: USER_ID,
        ...overrides,
    };
}

function nextId(prefix: string): string {
    sequence.value += 1;
    return `${prefix}-${String(sequence.value).padStart(6, '0')}`;
}
