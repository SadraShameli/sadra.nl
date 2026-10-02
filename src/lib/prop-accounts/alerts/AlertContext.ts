import type {
    PropAccountEventRow,
    PropAccountRow,
    PropAccountSnapshotRow,
    PropCopyGroupRow,
    PropPayoutRow,
    PropSizingDecisionRow,
} from '~/server/db/schemas/prop';

import { firmPayoutCountOf } from '~/lib/prop-accounts/advice';
import {
    type RealizedLossRisk,
    type RoundBudgetStatus,
} from '~/lib/prop-accounts/bankroll';
import {
    AccountEventKind,
    type AccountReadIssue,
    accountShapeProblem,
    AccountTracking,
    findStoredFirm,
    isAccountDate,
    isPaidOnOrBefore,
    latestEventOn,
    latestTwoSnapshots,
    type ModeledAccountRow,
    paidPayoutCash,
    PayoutStatus,
    type PlanKeyInput,
    type PlanKeyResolution,
    PlanKeyResolutionKind,
    resolvePlanKey,
    type RoundStatus,
    sumUsdCents,
    trackedAccountOf,
    type TrackedAccountRow,
    type UsdCents,
} from '~/lib/prop-accounts/core';
import {
    type AccountStateEntry,
    type AccountStateResult,
    type FirmReconciliationEntry,
    isActiveAccount,
} from '~/lib/prop-accounts/metrics';
import { findFirm, type Plan, type TradingFirm } from '~/lib/prop-calculator';
import {
    LiveTriggerCoverage,
    type LiveTriggerLimits,
    liveTriggerLimitsFor,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import { AlertDisclosure } from './AccountAlert';
import { TradingSessionCalendar } from './TradingSessionCalendar';

export enum StoredDateField {
    MovedLiveOn = 'moved-live-on',
    PayoutPaidOn = 'payout-paid-on',
    PayoutRequestedOn = 'payout-requested-on',
    PurchasedOn = 'purchased-on',
    SnapshotAsOf = 'snapshot-as-of',
}

export type AlertAccountRow = Pick<
    PropAccountRow,
    | 'accountSize'
    | 'archivedAt'
    | 'copyGroupId'
    | 'externalFirmId'
    | 'firmId'
    | 'id'
    | 'label'
    | 'optIns'
    | 'planLabel'
    | 'planSerial'
    | 'purchasedOn'
    | 'stage'
    | 'status'
    | 'tracking'
> & {
    readonly planRulesChanged?: boolean | null;
    readonly readIssues: readonly AccountReadIssue[];
};

export interface AlertContext {
    readonly accounts: readonly MonitoredAccount[];
    readonly archivedAccounts: readonly MonitoredAccount[];
    readonly availableBankrollCents: null | UsdCents;
    readonly copyGroups: readonly AlertCopyGroupRow[];
    readonly decisions: readonly AlertDecisionRow[];
    readonly firmReconciliation: readonly FirmReconciliationEntry[];
    readonly realizedLossRisk: null | RealizedLossRisk;
    readonly rounds: readonly AlertRoundRow[];
    readonly rulebook: RulebookParameters;
    readonly today: string;
    readonly unreadableArchivedAccounts: readonly AlertAccountRow[];
}

export type AlertCopyGroupRow = Pick<PropCopyGroupRow, 'id' | 'name'>;

export type AlertDecisionRow = Pick<
    PropSizingDecisionRow,
    | 'acceptedRiskCents'
    | 'accountId'
    | 'actualRiskCents'
    | 'createdAt'
    | 'decidedOn'
    | 'id'
>;

export interface AlertRoundRow {
    readonly budget: RoundBudgetStatus;
    readonly id: string;
    readonly label: string;
    readonly status: RoundStatus;
}

export const NO_ACCOUNT_STATES: readonly AccountStateEntry[] = [];
export const NO_AVAILABLE_BANKROLL: null | UsdCents = null;
export const NO_DECISIONS: readonly AlertDecisionRow[] = [];
export const NO_EVENTS: readonly AlertEventRow[] = [];
export const NO_FIRM_RECONCILIATION: readonly FirmReconciliationEntry[] = [];
export const NO_REALIZED_LOSS_RISK: null | RealizedLossRisk = null;
export const NO_ROUNDS: readonly AlertRoundRow[] = [];

export type AlertEventRow = Pick<
    PropAccountEventRow,
    'accountId' | 'kind' | 'occurredOn'
>;

export interface AlertInputs {
    readonly accounts: readonly AlertAccountRow[];
    readonly accountStates: readonly AccountStateEntry[];
    readonly availableBankrollCents?: null | UsdCents;
    readonly copyGroups: readonly AlertCopyGroupRow[];
    readonly decisions?: readonly AlertDecisionRow[];
    readonly events?: readonly AlertEventRow[];
    readonly firmReconciliation?: readonly FirmReconciliationEntry[];
    readonly payouts: readonly AlertPayoutRow[];
    readonly realizedLossRisk?: null | RealizedLossRisk;
    readonly rounds?: readonly AlertRoundRow[];
    readonly rulebook: RulebookParameters;
    readonly snapshots: readonly AlertSnapshotRow[];
    readonly today: string;
}

export type AlertPayoutRow = Pick<
    PropPayoutRow,
    | 'accountId'
    | 'grossCents'
    | 'netCents'
    | 'paidOn'
    | 'requestedOn'
    | 'status'
>;

export type AlertSnapshotRow = Pick<
    PropAccountSnapshotRow,
    | 'accountId'
    | 'asOf'
    | 'createdAt'
    | 'cumulativePayoutCents'
    | 'id'
    | 'lastTradedOn'
    | 'payoutsTaken'
    | 'tradingDays'
>;

export interface InvalidStoredDate {
    readonly field: StoredDateField;
    readonly value: string;
}

export type ModeledMonitoredAccount = MonitoredAccount & {
    readonly account: ModeledAccountRow<AlertAccountRow>;
    readonly planKey: PlanKeyInput;
};

export interface MonitoredAccount {
    readonly account: TrackedAccountRow<AlertAccountRow>;
    readonly accountState: AccountStateResult | null;
    readonly events: readonly AlertEventRow[];
    readonly invalidDates: readonly InvalidStoredDate[];
    readonly latestSnapshot: AlertSnapshotRow | null;
    readonly movedLiveOn: null | string;
    readonly payouts: readonly AlertPayoutRow[];
    readonly plan: PlanKeyResolution;
    readonly planKey: null | PlanKeyInput;
    readonly previousSnapshot: AlertSnapshotRow | null;
    readonly undatedPayouts: readonly AlertPayoutRow[];
}

export interface PayoutLedgerTotal {
    readonly cents: UsdCents;
    readonly grossCounted: number;
    readonly netCents: UsdCents;
}

export interface ResolvedFirmAccount {
    readonly firm: TradingFirm;
    readonly monitored: ModeledMonitoredAccount;
    readonly plan: Plan;
}

interface LedgerCash {
    readonly cents: UsdCents;
    readonly grossOnly: boolean;
}

export function createAlertContext(inputs: AlertInputs): AlertContext {
    const today = TradingSessionCalendar.requireDate(inputs.today);
    const snapshots = Map.groupBy(
        inputs.snapshots,
        (snapshot) => snapshot.accountId,
    );
    const payouts = Map.groupBy(inputs.payouts, (payout) => payout.accountId);
    const events = Map.groupBy(
        inputs.events ?? NO_EVENTS,
        (event) => event.accountId,
    );
    const accountStates = new Map(
        inputs.accountStates.map((entry) => [entry.accountId, entry.state]),
    );
    const monitorRow = (account: AlertAccountRow): MonitoredAccount =>
        monitor(
            account,
            snapshots.get(account.id) ?? [],
            payouts.get(account.id) ?? [],
            accountStates.get(account.id) ?? null,
            events.get(account.id) ?? NO_EVENTS,
        );
    const archived = inputs.accounts.filter(
        (account) => account.archivedAt !== null,
    );
    return {
        accounts: inputs.accounts
            .filter((account) => account.archivedAt === null)
            .map(monitorRow),
        archivedAccounts: archived.filter(isReadable).map(monitorRow),
        availableBankrollCents:
            inputs.availableBankrollCents ?? NO_AVAILABLE_BANKROLL,
        copyGroups: inputs.copyGroups,
        decisions: inputs.decisions ?? NO_DECISIONS,
        firmReconciliation: inputs.firmReconciliation ?? NO_FIRM_RECONCILIATION,
        realizedLossRisk: inputs.realizedLossRisk ?? NO_REALIZED_LOSS_RISK,
        rounds: inputs.rounds ?? NO_ROUNDS,
        rulebook: inputs.rulebook,
        today,
        unreadableArchivedAccounts: archived.filter(
            (account) => !isReadable(account),
        ),
    };
}

export function grossDisclosureOf(
    grossCounted: number,
): readonly AlertDisclosure[] {
    return grossCounted > 0 ? [AlertDisclosure.GrossUsedForMissingNet] : [];
}

export function isActive(monitored: MonitoredAccount): boolean {
    return isActiveAccount(monitored.account);
}

export function isModeledMonitored(
    monitored: MonitoredAccount,
): monitored is ModeledMonitoredAccount {
    return (
        monitored.account.tracking === AccountTracking.Modeled &&
        monitored.planKey !== null
    );
}

export function liveTriggerDisclosuresOf(
    coverage: LiveTriggerCoverage,
): readonly AlertDisclosure[] {
    return coverage === LiveTriggerCoverage.NotChecked
        ? [AlertDisclosure.LiveTriggersNotChecked]
        : [];
}

export function liveTriggerLimitsIn(
    context: AlertContext,
    monitored: MonitoredAccount,
    plan: Plan,
    asOf: string,
): LiveTriggerLimits {
    return liveTriggerLimitsFor(
        findFirm(plan.id.firm)?.accountPolicy,
        plan,
        paidPayoutsSinceLastLiveAccountOf(context, monitored, asOf),
    );
}

export function paidLedgerTotal(
    payouts: readonly AlertPayoutRow[],
): PayoutLedgerTotal {
    return ledgerTotalOf(
        payouts.flatMap((payout) => {
            const cash = paidPayoutCash(payout);
            return cash === null ? [] : [cash];
        }),
    );
}

export function paidPayoutsSinceLastLiveAccountOf(
    context: AlertContext,
    monitored: MonitoredAccount,
    asOf: string,
): null | number {
    const firmId = monitored.planKey?.firmId;
    if (firmId === undefined) return null;
    const hasUnreadableAccount = context.unreadableArchivedAccounts.some(
        (account) => account.firmId === firmId,
    );
    const members = [...context.accounts, ...context.archivedAccounts].filter(
        (member) => member.account.firmId === firmId,
    );
    return hasUnreadableAccount ||
        members.some((member) => member.invalidDates.length > 0)
        ? null
        : firmPayoutCountOf(firmId, members, asOf)
              .paidPayoutsSinceLastLiveAccount;
}

export function paidPayoutsThrough(
    monitored: MonitoredAccount,
    asOf: string,
): readonly AlertPayoutRow[] {
    return monitored.payouts.filter((payout) => isPaidOnOrBefore(payout, asOf));
}

export function payoutsTakenOf(monitored: MonitoredAccount): number {
    const paidCount = monitored.payouts.filter(
        (payout) => payout.status === PayoutStatus.Paid,
    ).length;
    return Math.max(monitored.latestSnapshot?.payoutsTaken ?? 0, paidCount);
}

export function requestedLedgerTotal(
    payouts: readonly AlertPayoutRow[],
): PayoutLedgerTotal {
    return ledgerTotalOf(
        payouts
            .filter((payout) => payout.status === PayoutStatus.Requested)
            .map((payout) =>
                payout.netCents === null
                    ? { cents: payout.grossCents, grossOnly: true }
                    : { cents: payout.netCents, grossOnly: false },
            ),
    );
}

export function resolvedFirmAccountsOf(
    context: AlertContext,
): readonly ResolvedFirmAccount[] {
    return context.accounts.flatMap((monitored) => {
        if (!isModeledMonitored(monitored)) return [];
        if (monitored.plan.kind !== PlanKeyResolutionKind.Resolved) return [];
        const firm = findStoredFirm(monitored.planKey.firmId);
        return firm === undefined
            ? []
            : [{ firm, monitored, plan: monitored.plan.plan }];
    });
}

function invalidDate(
    field: StoredDateField,
    value: null | string,
): InvalidStoredDate[] {
    return value === null || isAccountDate(value) ? [] : [{ field, value }];
}

function invalidMovedLiveDates(
    events: readonly AlertEventRow[],
): InvalidStoredDate[] {
    return events.flatMap((event) =>
        event.kind === AccountEventKind.MovedLive
            ? invalidDate(StoredDateField.MovedLiveOn, event.occurredOn)
            : [],
    );
}

function invalidPayoutDates(payout: AlertPayoutRow): InvalidStoredDate[] {
    return [
        ...invalidDate(StoredDateField.PayoutRequestedOn, payout.requestedOn),
        ...invalidDate(StoredDateField.PayoutPaidOn, payout.paidOn),
    ];
}

function isReadable(account: AlertAccountRow): boolean {
    return accountShapeProblem(account) === null;
}

function ledgerTotalOf(cash: readonly LedgerCash[]): PayoutLedgerTotal {
    return {
        cents: sumUsdCents(cash.map((entry) => entry.cents)),
        grossCounted: cash.filter((entry) => entry.grossOnly).length,
        netCents: sumUsdCents(
            cash
                .filter((entry) => !entry.grossOnly)
                .map((entry) => entry.cents),
        ),
    };
}

function monitor(
    stored: AlertAccountRow,
    snapshots: readonly AlertSnapshotRow[],
    payouts: readonly AlertPayoutRow[],
    accountState: AccountStateResult | null,
    events: readonly AlertEventRow[],
): MonitoredAccount {
    const account = trackedAccountOf(stored);
    const planKey =
        account.tracking === AccountTracking.Modeled
            ? toPlanKey(account)
            : null;
    const { latest, previous } = latestTwoSnapshots(snapshots);
    const isDated = (payout: AlertPayoutRow): boolean =>
        invalidPayoutDates(payout).length === 0;
    return {
        account,
        accountState,
        events,
        invalidDates: [
            ...invalidDate(StoredDateField.PurchasedOn, account.purchasedOn),
            ...snapshots.flatMap((snapshot) =>
                invalidDate(StoredDateField.SnapshotAsOf, snapshot.asOf),
            ),
            ...payouts.flatMap(invalidPayoutDates),
            ...invalidMovedLiveDates(events),
        ],
        latestSnapshot: latest,
        movedLiveOn: movedLiveOnOf(events),
        payouts: payouts.filter(isDated),
        plan:
            planKey === null
                ? { kind: PlanKeyResolutionKind.LedgerOnly }
                : resolvePlanKey(planKey),
        planKey,
        previousSnapshot: previous,
        undatedPayouts: payouts.filter((payout) => !isDated(payout)),
    };
}

function movedLiveOnOf(events: readonly AlertEventRow[]): null | string {
    return latestEventOn(
        events.filter((event) => isAccountDate(event.occurredOn)),
        AccountEventKind.MovedLive,
    );
}

function toPlanKey(account: ModeledAccountRow<AlertAccountRow>): PlanKeyInput {
    return {
        accountSize: account.accountSize,
        firmId: account.firmId,
        optIns: account.optIns,
        planSerial: account.planSerial,
        readIssues: account.readIssues,
    };
}
