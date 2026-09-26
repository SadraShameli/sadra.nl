import {
    type AccountAlert,
    type AlertAccountRow,
    type AlertContext,
    type AlertCopyGroupRow,
    type AlertInputs,
    type AlertPayoutRow,
    type AlertRule,
    type AlertSnapshotRow,
    createAlertContext,
} from '~/lib/prop-accounts/alerts';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    ALL_FIRMS,
    type FirmId,
    type Plan,
    serializePlanId,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

export const WEDNESDAY = '2026-09-23';
export const TUESDAY = '2026-09-22';
export const MONDAY = '2026-09-21';
export const SUNDAY = '2026-09-20';
export const SATURDAY = '2026-09-19';
export const FRIDAY = '2026-09-18';

interface PlanEntry {
    readonly firmId: FirmId;
    readonly plan: Plan;
}

const REGISTRY: readonly PlanEntry[] = ALL_FIRMS.flatMap((firm) =>
    firm.plans.map((plan) => ({ firmId: firm.id, plan })),
);

const idCounter = { value: 0 };

export function accountFor(
    entry: PlanEntry,
    overrides: Partial<AlertAccountRow> = {},
): AlertAccountRow {
    idCounter.value += 1;
    const nextId = idCounter.value;
    return {
        accountSize: entry.plan.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        externalFirmId: null,
        firmId: entry.firmId,
        id: `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`,
        label: `Account ${nextId}`,
        optIns: {},
        planLabel: null,
        planRulesChanged: null,
        planSerial: serializePlanId(entry.plan.id),
        purchasedOn: '2026-09-01',
        readIssues: [],
        stage: entry.plan.isInstantFunded
            ? AccountStage.Funded
            : AccountStage.Eval,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

export function alertsOf(
    rule: AlertRule,
    inputs: Partial<AlertInputs>,
): readonly AccountAlert[] {
    return rule.evaluate(contextOf(inputs));
}

export function contextOf(inputs: Partial<AlertInputs>): AlertContext {
    return createAlertContext({
        accounts: [],
        copyGroups: [],
        payouts: [],
        rulebook: DEFAULT_RULEBOOK,
        snapshots: [],
        today: WEDNESDAY,
        ...inputs,
    });
}

export function copyGroup(id: string, name: string): AlertCopyGroupRow {
    return { id, name };
}

export function paidPayout(
    account: AlertAccountRow,
    overrides: Partial<AlertPayoutRow> = {},
): AlertPayoutRow {
    return {
        accountId: account.id,
        grossCents: usdCents(50_000),
        netCents: usdCents(45_000),
        paidOn: '2026-09-10',
        requestedOn: '2026-09-08',
        status: PayoutStatus.Paid,
        ...overrides,
    };
}

export function planWhere(isMatch: (plan: Plan) => boolean): PlanEntry {
    const entry = REGISTRY.find((candidate) => isMatch(candidate.plan));
    if (entry === undefined) throw new Error('no registry plan matches');
    return entry;
}

export function snapshotFor(
    account: AlertAccountRow,
    overrides: Partial<AlertSnapshotRow> = {},
): AlertSnapshotRow {
    idCounter.value += 1;
    const nextId = idCounter.value;
    return {
        accountId: account.id,
        asOf: WEDNESDAY,
        createdAt: new Date('2026-09-23T12:00:00Z'),
        cumulativePayoutCents: null,
        id: `10000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`,
        payoutsTaken: null,
        tradingDays: null,
        ...overrides,
    };
}

export const ANY_EVAL_PLAN = planWhere((plan) => !plan.isInstantFunded);

export const EXTERNAL_FIRM_ID = '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b';

export function ledgerOnlyAccountFor(
    entry: PlanEntry,
    overrides: Partial<AlertAccountRow> = {},
): AlertAccountRow {
    return accountFor(entry, {
        accountSize: 150_000,
        planLabel: 'Ledger only 150K',
        planSerial: null,
        tracking: AccountTracking.LedgerOnly,
        ...overrides,
    });
}
