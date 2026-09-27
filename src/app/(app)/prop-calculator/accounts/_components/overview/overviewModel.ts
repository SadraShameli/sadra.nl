import { type z } from 'zod';

import type {
    PropAccountRow,
    PropAccountSnapshotRow,
} from '~/server/db/schemas/prop';

import { errorMessage } from '~/lib/errorMessage';
import {
    formatCurrency,
    formatOptionalPercent,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import {
    type AccountAlert,
    AccountEventKind,
    AccountReadIssueKind,
    AccountStage,
    accountStageLabel,
    type AccountStateAccountRow,
    type AccountStateEntry,
    type AccountStateSnapshotRow,
    accountStatesOf,
    type AlertAccountRow,
    type AlertCopyGroupRow,
    AlertDisclosure,
    AlertEvaluator,
    type AlertInputs,
    alertKindLabel,
    type AlertPayoutRow,
    type AlertSeverity,
    type AlertSnapshotRow,
    type AttemptThroughput,
    attemptThroughput,
    type CohortMultiple,
    costAnalytics,
    createAlertContext,
    DEFAULT_ALERT_RULES,
    DEFAULT_PAYOUT_HISTOGRAM_BUCKET_CENTS,
    diversification,
    type ExternalFirmName,
    FeeKind,
    feeReconciliation,
    type FirmDiscountCapture,
    type FirmKey,
    firmKeyId,
    firmKeyLabel,
    type FirmReturn,
    firmReturns,
    type FirmShare,
    formatUsdCents,
    fundedPayoutDistribution,
    fundingTotals,
    type FunnelDiagnostic,
    FunnelDiagnosticReason,
    FunnelStage,
    IsoDateError,
    type LedgerAccount,
    type LedgerAccountRow,
    type LedgerEventRow,
    type LedgerFeeRow,
    type LedgerPayoutRow,
    ledgerTimeline,
    MARGIN_ABOVE_BREAKEVEN_HELP_TEXT,
    type MonthlyStatement,
    monthlyStatement,
    type MonthlyStatementTargets,
    NO_ACCOUNT_STATES,
    paidPayoutCash,
    PAYOUT_COUNT_CAP,
    payoutMultiple,
    type PayoutsByAccountSize,
    type PayoutsByFirm,
    type PayoutsByStage,
    type PayoutSizeSnapshotBalance,
    type PayoutSizeStats,
    payoutSizeStats,
    type PayoutSizeStatsOptions,
    PayoutStatus,
    PendingFeeAttribution,
    type PlanAttemptEconomics,
    planCapUsage,
    type PlanCapUsage,
    PortfolioLedger,
    portfolioRoi,
    purchaseCohorts,
    realizedAttemptEconomics,
    type RealizedNetPerSlot,
    realizedNetPerSlot,
    realizedOutcomes,
    realizedPayoutRates,
    RebuyLagBasis,
    rebuyLagDefault,
    repeatability,
    type RepeatabilityStats,
    replacementStats,
    roundCents,
    sampleAdequacy,
    type SampledEstimate,
    SampleKind,
    SampleLevel,
    spendAndPayouts,
    stageFunnel,
    type TimelineEntry,
    TimelineEntryKind,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts';
import { CENTS_PER_DOLLAR, ROI_BASIS_LABEL } from '~/lib/prop-calculator';
import {
    type RulebookParameters,
    type SampleThresholds,
} from '~/lib/prop-calculator/advisor';
import { type HistogramBin, NoiseVerdict } from '~/lib/prop-calculator/stats';
import {
    type eventListSchema,
    type ledgerListSchema,
    MAX_EVENT_LIST_YEARS,
} from '~/lib/schemas/propAccounts';

import { alertSubjectView } from '../accountListFilters';

export enum KpiTone {
    Negative = 'negative',
    Neutral = 'neutral',
    Pending = 'pending',
    Positive = 'positive',
}

export enum OverviewKpiKind {
    AveragePayout = 'average-payout',
    ExpectedNet = 'expected-net',
    Net = 'net',
    PayoutMultiple = 'payout-multiple',
    PayoutsReceived = 'payouts-received',
    RealizedNetPerSlot = 'realized-net-per-slot',
    Roi = 'roi',
    Spend = 'spend',
    TotalFunding = 'total-funding',
}

export enum OverviewNoticeKind {
    EventWindow = 'event-window',
    LedgerOnlyAccounts = 'ledger-only-accounts',
    ReadIssues = 'read-issues',
    RejectedEvents = 'rejected-events',
    TimelineMismatch = 'timeline-mismatch',
    UnallocatedNet = 'unallocated-net',
    UndatedPaidPayouts = 'undated-paid-payouts',
    UnmatchedRows = 'unmatched-rows',
    UnmeasuredSlots = 'unmeasured-slots',
    UnresolvedAccounts = 'unresolved-accounts',
}

export enum OverviewSectionStatus {
    Failed = 'failed',
    Pending = 'pending',
    Ready = 'ready',
}

export enum PortfolioSource {
    Accounts = 'accounts',
    CopyGroups = 'copyGroups',
    Events = 'events',
    Fees = 'fees',
    Payouts = 'payouts',
    Rulebook = 'rulebook',
    Snapshots = 'snapshots',
}

export interface AttemptEconomicsCardModel {
    readonly disclosures: readonly string[];
    readonly horizonDays: number;
    readonly rows: readonly AttemptEconomicsRow[];
}

export interface AttemptThroughputCardModel {
    readonly meanPerActiveFirmPerMonth: null | string;
    readonly meanPerMonth: string;
    readonly months: readonly AttemptThroughputMonthRow[];
    readonly perFirm: readonly FirmAttemptThroughputRow[];
}

export interface CapUsageCardModel {
    readonly disclosure: string;
    readonly rows: readonly CapUsageRow[];
    readonly unresolvedNote: null | string;
}

export interface CostCardModel {
    readonly byAccountSize: readonly SizeCostRow[];
    readonly byFirm: readonly FirmAmountRow[];
    readonly byFirmAttemptCost: readonly FirmAttemptCostRow[];
    readonly byKind: readonly FeeKindAmountRow[];
    readonly disclosures: readonly string[];
    readonly discountsByFirm: readonly FirmDiscountRow[];
    readonly perPlan: readonly PlanCostRow[];
}

export interface DiversificationCardModel {
    readonly funding: readonly FirmShareRow[];
    readonly payouts: readonly FirmShareRow[];
}

export interface FirmReturnsCardModel {
    readonly rows: readonly FirmReturnRow[];
}

export interface FirmShareRow extends FirmAmountRow {
    readonly share: string;
}

export interface FundedPayoutsCardModel {
    readonly disclosures: readonly string[];
    readonly horizonDays: number;
    readonly payoutCountCap: number;
    readonly rows: readonly FundedPayoutsRow[];
}

export interface FunnelCardModel {
    readonly biggestWeakness: string;
    readonly disclosures: readonly string[];
    readonly rows: readonly FunnelRow[];
    readonly unresolvedNote: null | string;
}

export interface OutcomesCardModel {
    readonly disclosures: readonly string[];
    readonly rows: readonly OutcomesRow[];
}

export type OverviewAccountRow = AlertAccountRow & LedgerAccountRow;

export interface OverviewAlert {
    readonly disclosures: readonly string[];
    readonly key: string;
    readonly kindLabel: string;
    readonly message: string;
    readonly severity: AlertSeverity;
    readonly subjectLabel: string;
}

export type OverviewAlerts =
    | OverviewSectionGap
    | {
          readonly accountStatesCaveat: null | string;
          readonly alerts: readonly OverviewAlert[];
          readonly kind: OverviewSectionStatus.Ready;
      };

export interface OverviewInputs {
    readonly externalFirms: readonly ExternalFirmName[];
    readonly load: PortfolioLoad;
    readonly today: string;
    readonly userId: string;
}

export interface OverviewKpi {
    readonly detail: null | string;
    readonly kind: OverviewKpiKind;
    readonly label: string;
    readonly note: null | string;
    readonly tone: KpiTone;
    readonly value: string;
}

export type OverviewLedger =
    | (OverviewLedgerCards & { readonly kind: OverviewSectionStatus.Ready })
    | OverviewSectionGap;

export interface OverviewLedgerCards {
    readonly attemptEconomics: AttemptEconomicsCardModel;
    readonly attemptThroughput: AttemptThroughputCardModel;
    readonly capUsage: CapUsageCardModel;
    readonly cost: CostCardModel;
    readonly diversification: DiversificationCardModel;
    readonly firmReturns: FirmReturnsCardModel;
    readonly fundedPayouts: FundedPayoutsCardModel;
    readonly funnel: FunnelCardModel;
    readonly kpis: readonly OverviewKpi[];
    readonly notices: readonly OverviewNotice[];
    readonly outcomes: OutcomesCardModel;
    readonly payoutSizes: PayoutSizesCardModel;
    readonly repeatability: RepeatabilityCardModel;
    readonly replacement: ReplacementCardModel;
    readonly statement: StatementCardModel;
    readonly timeline: TimelineCardModel;
}

export interface OverviewModel {
    readonly alerts: OverviewAlerts;
    readonly hasAccounts: boolean;
    readonly ledger: OverviewLedger;
}

export interface OverviewNotice {
    readonly kind: OverviewNoticeKind;
    readonly message: string;
}

export type OverviewPayoutRow = AlertPayoutRow & LedgerPayoutRow;

export type OverviewSnapshotRow = AlertSnapshotRow &
    Pick<PropAccountSnapshotRow, 'balanceCents' | 'dashboardFloorCents'>;

export interface PayoutSizesCardModel {
    readonly byAccountSize: readonly PayoutSizeGroupRow[];
    readonly byFirm: readonly PayoutSizeFirmRow[];
    readonly byStage: readonly PayoutSizeStageRow[];
    readonly count: number;
    readonly disclosures: readonly string[];
    readonly grossOnlyPayouts: number;
    readonly histogram: readonly HistogramBin[];
    readonly lowBalanceCount: number;
    readonly mean: string;
    readonly median: string;
    readonly p10: string;
    readonly p90: string;
}

export interface PortfolioLoad {
    readonly accounts: SectionLoad<readonly OverviewAccountRow[]>;
    readonly alerts: SectionLoad<AlertRows>;
    readonly failures: readonly PortfolioLoadIssue[];
    readonly ledger: SectionLoad<LedgerRows>;
    readonly retainedCushionCents: null | UsdCents;
    readonly sampleThresholds: SampleThresholds;
    readonly stale: readonly PortfolioLoadIssue[];
    readonly statementTargets: MonthlyStatementTargets;
}

export interface PortfolioLoadIssue {
    readonly message: string;
    readonly source: PortfolioSource;
    readonly title: string;
}

export type PortfolioQueries = {
    readonly [Source in PortfolioSource]: PortfolioQuery<PortfolioRows[Source]>;
};

export interface PortfolioRows {
    readonly [PortfolioSource.Accounts]: readonly OverviewAccountRow[];
    readonly [PortfolioSource.CopyGroups]: readonly AlertCopyGroupRow[];
    readonly [PortfolioSource.Events]: readonly LedgerEventRow[];
    readonly [PortfolioSource.Fees]: readonly LedgerFeeRow[];
    readonly [PortfolioSource.Payouts]: readonly OverviewPayoutRow[];
    readonly [PortfolioSource.Rulebook]: RulebookParameters;
    readonly [PortfolioSource.Snapshots]: readonly OverviewSnapshotRow[];
}

export interface PurchaseCohortRow {
    readonly endedAccounts: string;
    readonly inProgressCount: string;
    readonly key: string;
    readonly month: string;
    readonly payouts: string;
    readonly realizedMultiple: string;
    readonly spend: string;
    readonly toDateMultiple: string;
}

export interface RepeatabilityCardModel {
    readonly overall: null | RepeatabilityStatsRow;
    readonly perSlot: null | RepeatabilityStatsRow;
    readonly perSlotTargetNote: null | string;
}

export interface ReplacementCardModel {
    readonly rows: readonly ReplacementRow[];
}

export interface StatementCardModel {
    readonly caveat: string;
    readonly chart: readonly StatementChartPoint[];
    readonly months: readonly StatementRow[];
    readonly purchaseCohorts: readonly PurchaseCohortRow[];
    readonly targetDollars: null | number;
}

export interface StatementChartPoint {
    readonly month: string;
    readonly payouts: number;
    readonly spend: number;
}

export interface TimelineCardModel {
    readonly entries: readonly TimelineRow[];
    readonly hiddenEntries: number;
}

interface AttemptEconomicsRow {
    readonly attemptCost: string;
    readonly attempts: string;
    readonly averagePayout: string;
    readonly breakevenPassRate: string;
    readonly fundedValue: string;
    readonly key: string;
    readonly marginAboveBreakeven: string;
    readonly passRate: string;
    readonly payoutRate: string;
    readonly payoutsPerPaidFunded: string;
    readonly plan: string;
    readonly realizedEvPerAttempt: string;
}

interface AttemptThroughputMonthRow {
    readonly attempts: string;
    readonly key: string;
    readonly month: string;
}

interface CapUsageRow {
    readonly cap: string;
    readonly freeSlots: string;
    readonly key: string;
    readonly note: null | string;
    readonly plan: string;
    readonly used: string;
}

interface FeeKindAmountRow {
    readonly amount: string;
    readonly key: FeeKind;
    readonly kind: string;
}

interface FirmAmountRow {
    readonly amount: string;
    readonly firm: string;
    readonly key: string;
}

interface FirmAttemptCostRow {
    readonly attempts: string;
    readonly attemptsSampleLevel: null | SampleLevel;
    readonly costPerAttempt: string;
    readonly firm: string;
    readonly key: string;
    readonly retryFeeAttempts: string;
}

interface FirmAttemptThroughputRow {
    readonly firm: string;
    readonly key: string;
    readonly meanPerMonth: string;
    readonly months: readonly AttemptThroughputMonthRow[];
}

interface FirmDiscountRow {
    readonly discount: string;
    readonly feesChecked: string;
    readonly firm: string;
    readonly key: string;
}

interface FirmReturnRow {
    readonly accounts: string;
    readonly accountsWithPayout: string;
    readonly attempts: string;
    readonly attemptsSampleLevel: null | SampleLevel;
    readonly firm: string;
    readonly firstPayoutOn: string;
    readonly fundedAccounts: string;
    readonly fundedSampleLevel: null | SampleLevel;
    readonly key: string;
    readonly lastPayoutOn: string;
    readonly multiple: string;
    readonly net: string;
    readonly payouts: string;
    readonly spend: string;
    readonly verdict: string;
}

interface FundedPayoutsRow {
    readonly counts: readonly string[];
    readonly key: string;
    readonly openAccounts: string;
    readonly plan: string;
    readonly realizedFundedValue: string;
}

interface FunnelRow {
    readonly fees: string;
    readonly firm: string;
    readonly firstPayout: string;
    readonly funded: string;
    readonly key: string;
    readonly movedLive: string;
    readonly net: string;
    readonly netPayouts: string;
    readonly passed: string;
    readonly payoutRate: string;
    readonly purchased: string;
}

interface OutcomesRow {
    readonly fundedSurvival: string;
    readonly key: string;
    readonly openFunded: string;
    readonly passRate: string;
    readonly plan: string;
    readonly sessionsToFunded: string;
}

interface PayoutSizeFirmRow {
    readonly count: string;
    readonly firm: string;
    readonly key: string;
    readonly mean: string;
}

interface PayoutSizeGroupRow {
    readonly accountSize: string;
    readonly count: string;
    readonly key: string;
    readonly mean: string;
}

interface PayoutSizeStageRow {
    readonly count: string;
    readonly key: AccountStage;
    readonly mean: string;
    readonly stage: string;
}

interface PlanCostRow {
    readonly acquisitionSpend: string;
    readonly costPerFunded: string;
    readonly fundedAccounts: string;
    readonly fundedSampleLevel: null | SampleLevel;
    readonly key: string;
    readonly modeled: string;
    readonly pendingEvalAccounts: string;
    readonly pendingSpend: string;
    readonly plan: string;
}

interface PortfolioQuery<Data> {
    readonly data: Data | undefined;
    readonly error: unknown;
}

interface RepeatabilityStatsRow {
    readonly best: string;
    readonly count: string;
    readonly mean: string;
    readonly shareAtOrAboveTarget: null | string;
    readonly sharePositive: string;
    readonly standardDeviation: string;
    readonly worst: string;
}

interface ReplacementRow {
    readonly attempts: string;
    readonly attemptsPerFunded: string;
    readonly attemptsSampleLevel: null | SampleLevel;
    readonly key: string;
    readonly lag: string;
    readonly plan: string;
    readonly rebuyLag: string;
    readonly unmeasured: string;
}

interface SizeCostRow {
    readonly accountSize: string;
    readonly attempts: string;
    readonly attemptsSampleLevel: null | SampleLevel;
    readonly costPerAttempt: string;
    readonly key: string;
    readonly spend: string;
}

interface StatementRow {
    readonly cumulativeNet: string;
    readonly isPartial: boolean;
    readonly key: string;
    readonly meetsMultipleTarget: boolean | null;
    readonly meetsPayoutTarget: boolean | null;
    readonly month: string;
    readonly multiple: string;
    readonly net: string;
    readonly payoutCount: string;
    readonly payoutGrowth: string;
    readonly payouts: string;
    readonly spend: string;
    readonly trailingThreeMonthMultiple: string;
}

interface TimelineRow {
    readonly account: string;
    readonly amount: null | string;
    readonly description: string;
    readonly key: string;
    readonly on: string;
}

export const OVERVIEW_TIMELINE_LIMIT = 50;

export const EVENT_LIST_INPUT: Readonly<z.input<typeof eventListSchema>> =
    Object.freeze({});

export const LEDGER_LIST_INPUT: Readonly<z.input<typeof ledgerListSchema>> =
    Object.freeze({});

const ACCOUNT_EVENT_KIND_LABEL: Readonly<Record<AccountEventKind, string>> = {
    [AccountEventKind.Busted]: 'Busted',
    [AccountEventKind.BustReversed]: 'Bust reversed',
    [AccountEventKind.Closed]: 'Closed',
    [AccountEventKind.ClosedInactivity]: 'Closed for inactivity',
    [AccountEventKind.Concluded]: 'Concluded',
    [AccountEventKind.Edited]: 'Edited',
    [AccountEventKind.EvalPassed]: 'Eval passed',
    [AccountEventKind.FundedReset]: 'Funded reset',
    [AccountEventKind.MovedLive]: 'Moved live',
    [AccountEventKind.Purchased]: 'Purchased',
    [AccountEventKind.Refunded]: 'Refunded',
    [AccountEventKind.Reopened]: 'Reopened',
    [AccountEventKind.Resumed]: 'Resumed',
    [AccountEventKind.Suspended]: 'Suspended',
};

const ALERT_DISCLOSURE_TEXT: Readonly<Record<AlertDisclosure, string>> = {
    [AlertDisclosure.GrossUsedForMissingNet]:
        'Payouts without a net amount are counted at their gross amount.',
    [AlertDisclosure.NoHolidayCalendar]:
        'Trading sessions count every weekday; exchange holidays are not known.',
    [AlertDisclosure.SessionLimitApproximatedAsCalendarDays]:
        'The inactivity limit is checked in calendar days since the last trade; the engine counts the same limit in trading sessions, so this warning can come early.',
    [AlertDisclosure.ThirtyDayBillingCycle]:
        'Subscriptions are assumed to renew every 30 days from the purchase date.',
};

const FEE_KIND_LABEL: Readonly<Record<FeeKind, string>> = {
    [FeeKind.Activation]: 'Activation fee',
    [FeeKind.EvalPurchase]: 'Evaluation purchase',
    [FeeKind.FundedReset]: 'Funded reset',
    [FeeKind.Other]: 'Other fee',
    [FeeKind.Rebuy]: 'Rebuy',
    [FeeKind.Refund]: 'Refund',
    [FeeKind.Reset]: 'Reset',
    [FeeKind.Subscription]: 'Subscription',
};

const NOISE_VERDICT_LABEL: Readonly<Record<NoiseVerdict, string>> = {
    [NoiseVerdict.BeyondNoise]: 'Beyond noise (differs from the other firms)',
    [NoiseVerdict.Unknown]: 'Unknown (not enough data)',
    [NoiseVerdict.WithinNoise]: 'Within noise',
};

const PAYOUT_STATUS_LABEL: Readonly<Record<PayoutStatus, string>> = {
    [PayoutStatus.Cancelled]: 'Payout cancelled',
    [PayoutStatus.Denied]: 'Payout denied',
    [PayoutStatus.Paid]: 'Payout paid',
    [PayoutStatus.Requested]: 'Payout requested',
};

const SAMPLE_LEVEL_LABEL: Readonly<Record<SampleLevel, string>> = {
    [SampleLevel.Adequate]: 'adequate sample',
    [SampleLevel.Low]: 'low sample',
    [SampleLevel.None]: 'no sample',
};

const SOURCE_LABEL: Readonly<Record<PortfolioSource, string>> = {
    [PortfolioSource.Accounts]: 'accounts',
    [PortfolioSource.CopyGroups]: 'copy groups',
    [PortfolioSource.Events]: 'account events',
    [PortfolioSource.Fees]: 'fees',
    [PortfolioSource.Payouts]: 'payouts',
    [PortfolioSource.Rulebook]: 'rulebook',
    [PortfolioSource.Snapshots]: 'latest balances',
};

const PENDING_FEE_ATTRIBUTION_TEXT: Readonly<
    Record<PendingFeeAttribution, string>
> = {
    [PendingFeeAttribution.PaidOnOrAfterOpenAttemptStart]:
        'Fees paid on or after the start of an eval attempt that is still open are pending: they count toward cost per funded account once that attempt passes or fails.',
};

const PENDING = 'Pending';
const MODELED_COST_PENDING =
    'The modeled cost per funded account is pending the engine cards.';
const MODELED_OUTCOMES_PENDING =
    'The modeled pass rate and survival are pending the engine cards.';
const POOLED_CAPS_DISCLOSURE =
    'Caps are counted per plan. Firm-wide pooled caps are not modeled yet, so a firm can stop you sooner than these free slots suggest.';
const DEFAULT_REALIZED_HORIZON_DAYS = 365;
const REALIZED_HORIZON_DISCLOSURE = `No engine run is being compared, so this counts a funded account as decided once it is at least ${String(DEFAULT_REALIZED_HORIZON_DAYS)} calendar days past funding (an approximation of the simulator's default funded horizon of roughly one trading year); younger funded accounts are shown separately, not counted as failures.`;
const MODELED_PAYOUT_DISTRIBUTION_PENDING =
    'The modeled payout-count distribution from the simulator is pending the engine cards.';
const LOW_BALANCE_MONITORING_NOT_WIRED_DISCLOSURE =
    'Low-balance monitoring against the retained cushion is not wired to a stored account balance yet, so no payout is ever flagged here; a clean result is not verified.';
const LOW_BALANCE_APPROXIMATED_DISCLOSURE =
    'Low-balance monitoring compares each payout to the latest recorded snapshot balance, not the balance on the day the payout was paid, so a payout made before the most recent snapshot can be misclassified.';
const FUNNEL_DIAGNOSTIC_PENDING_TEXT =
    'The biggest-weakness ranking is pending the engine cards: no modeled run is compared against these realized numbers yet.';
const FUNNEL_DIAGNOSTIC_MODELED_MISSING: FunnelDiagnostic = {
    modeledEvPerAttempt: null,
    realizedEvPerAttempt: null,
    reason: FunnelDiagnosticReason.ModeledFiguresMissing,
    stages: null,
};
const FUNNEL_STAGE_LABEL: Readonly<Record<FunnelStage, string>> = {
    [FunnelStage.AveragePayout]: 'Average payout',
    [FunnelStage.PassRate]: 'Pass rate',
    [FunnelStage.PayoutRate]: 'Payout rate',
    [FunnelStage.PayoutsPerPaidFunded]: 'Payouts per paid funded account',
};
const STATEMENT_MULTIPLE_CAVEAT = 'calendar months mix purchase cohorts';
const SENTENCE_END = /[.!?]$/u;

const PORTFOLIO_EVALUATOR = new AlertEvaluator(DEFAULT_ALERT_RULES);


const ALERT_SOURCES = [
    PortfolioSource.Accounts,
    PortfolioSource.CopyGroups,
    PortfolioSource.Payouts,
    PortfolioSource.Rulebook,
    PortfolioSource.Snapshots,
] as const;

const LEDGER_SOURCES = [
    PortfolioSource.Accounts,
    PortfolioSource.Events,
    PortfolioSource.Fees,
    PortfolioSource.Payouts,
    PortfolioSource.Snapshots,
] as const;

type AlertRows = Pick<PortfolioRows, (typeof ALERT_SOURCES)[number]>;

interface Counted {
    readonly count: number;
    readonly plural: string;
    readonly singular: string;
}

interface FirmNames {
    of(firmKey: FirmKey): string;
}

type LedgerComputation<Result> =
    | { readonly kind: OverviewSectionStatus.Failed; readonly message: string }
    | { readonly kind: OverviewSectionStatus.Ready; readonly value: Result };

type LedgerRows = Pick<PortfolioRows, (typeof LEDGER_SOURCES)[number]>;

type OverviewSectionGap =
    | { readonly kind: OverviewSectionStatus.Failed; readonly message: string }
    | { readonly kind: OverviewSectionStatus.Pending };

interface PlanNames {
    of(planSerial: string): string;
}

type SectionLoad<Rows> =
    | SectionLoadGap
    | { readonly rows: Rows; readonly status: OverviewSectionStatus.Ready };

type SectionLoadGap =
    | {
          readonly failed: readonly PortfolioSource[];
          readonly status: OverviewSectionStatus.Failed;
      }
    | { readonly status: OverviewSectionStatus.Pending };

export function accountEventKindLabel(kind: AccountEventKind): string {
    return ACCOUNT_EVENT_KIND_LABEL[kind];
}

export function accountStatesForRows(
    userId: string,
    today: string,
    accounts: readonly OverviewAccountRow[],
    events: readonly LedgerEventRow[],
    payouts: readonly OverviewPayoutRow[],
    snapshots: readonly OverviewSnapshotRow[],
): readonly AccountStateEntry[] {
    return accountStatesOf(userId, today, {
        accounts: accounts.map(accountStateAccountRowOf),
        events,
        payouts,
        snapshots: snapshots.map(accountStateSnapshotRowOf),
    });
}

export function accountStatesFromLoad(
    userId: string,
    today: string,
    load: PortfolioLoad,
): readonly AccountStateEntry[] {
    if (
        load.alerts.status !== OverviewSectionStatus.Ready ||
        load.ledger.status !== OverviewSectionStatus.Ready
    ) {
        return NO_ACCOUNT_STATES;
    }
    const { accounts, payouts, snapshots } = load.alerts.rows;
    return accountStatesForRows(
        userId,
        today,
        accounts,
        load.ledger.rows.events,
        payouts,
        snapshots,
    );
}

export function alertsFor(
    section: PortfolioLoad['alerts'],
    today: string,
    isIncluded: (alert: AccountAlert) => boolean,
    accountStates: readonly AccountStateEntry[] = NO_ACCOUNT_STATES,
    accountStatesSource: null | PortfolioLoad['ledger'] = null,
): OverviewAlerts {
    switch (section.status) {
        case OverviewSectionStatus.Failed: {
            return {
                kind: OverviewSectionStatus.Failed,
                message: `Alerts could not be checked because your ${sourceList(section.failed)} could not be loaded.`,
            };
        }
        case OverviewSectionStatus.Pending: {
            return { kind: OverviewSectionStatus.Pending };
        }
        case OverviewSectionStatus.Ready: {
            const { accounts, copyGroups, payouts, rulebook, snapshots } =
                section.rows;
            return {
                accountStatesCaveat: accountStatesCaveatFor(
                    accountStatesSource,
                ),
                alerts: portfolioAlerts({
                    accounts,
                    accountStates,
                    copyGroups,
                    payouts,
                    rulebook,
                    snapshots,
                    today,
                })
                    .filter((alert) => isIncluded(alert))
                    .map((alert) => overviewAlert(alert)),
                kind: OverviewSectionStatus.Ready,
            };
        }
    }
}

export function buildOverview({
    externalFirms,
    load,
    today,
    userId,
}: OverviewInputs): OverviewModel {
    return {
        alerts: alertsFor(
            load.alerts,
            today,
            () => true,
            accountStatesFromLoad(userId, today, load),
            load.ledger,
        ),
        hasAccounts:
            load.accounts.status === OverviewSectionStatus.Ready &&
            load.accounts.rows.length > 0,
        ledger: overviewLedger(
            load.ledger,
            today,
            userId,
            firmNames(externalFirms),
            load.statementTargets,
            load.sampleThresholds,
            load.retainedCushionCents,
        ),
    };
}

export function feeKindLabel(kind: FeeKind): string {
    return FEE_KIND_LABEL[kind];
}

export function ledgerOrDateFailure<Result>(
    compute: () => Result,
): LedgerComputation<Result> {
    try {
        return { kind: OverviewSectionStatus.Ready, value: compute() };
    } catch (error) {
        if (!(error instanceof IsoDateError)) throw error;
        return {
            kind: OverviewSectionStatus.Failed,
            message: asSentence(error.message),
        };
    }
}

export function payoutStatusLabel(status: PayoutStatus): string {
    return PAYOUT_STATUS_LABEL[status];
}

export function portfolioAlerts(inputs: AlertInputs): readonly AccountAlert[] {
    return PORTFOLIO_EVALUATOR.evaluate(createAlertContext(inputs));
}

export function portfolioLoad(queries: PortfolioQueries): PortfolioLoad {
    const sources = Object.values(PortfolioSource);
    return {
        accounts: accountsLoad(queries),
        alerts: alertsLoad(queries),
        failures: sources
            .filter((source) => isFailed(queries[source]))
            .map((source) => ({
                message: readableError(queries[source].error),
                source,
                title: `Your ${SOURCE_LABEL[source]} could not be loaded`,
            })),
        ledger: ledgerLoad(queries),
        retainedCushionCents: retainedCushionCentsOf(queries),
        sampleThresholds: sampleThresholdsOf(queries),
        stale: sources
            .filter((source) => isStale(queries[source]))
            .map((source) => ({
                message: `${readableError(queries[source].error)} The figures below use the last loaded ${SOURCE_LABEL[source]}.`,
                source,
                title: `Your ${SOURCE_LABEL[source]} could not be refreshed`,
            })),
        statementTargets: statementTargetsOf(queries),
    };
}

function accountsLoad(
    queries: PortfolioQueries,
): SectionLoad<readonly OverviewAccountRow[]> {
    const accounts = queries[PortfolioSource.Accounts].data;
    return accounts === undefined
        ? loadGap(queries, [PortfolioSource.Accounts])
        : { rows: accounts, status: OverviewSectionStatus.Ready };
}

function accountStateAccountRowOf(
    row: OverviewAccountRow,
): AccountStateAccountRow {
    const stored = row as unknown as Pick<
        PropAccountRow,
        'dashboardConvention' | 'firstFundedTradeOn' | 'liveStartBalanceCents'
    >;
    return {
        accountSize: row.accountSize,
        archivedAt: row.archivedAt,
        dashboardConvention: stored.dashboardConvention,
        externalFirmId: row.externalFirmId,
        firmId: row.firmId,
        firstFundedTradeOn: stored.firstFundedTradeOn,
        fundedOn: row.fundedOn,
        id: row.id,
        liveStartBalanceCents: stored.liveStartBalanceCents,
        optIns: row.optIns,
        planLabel: row.planLabel,
        planSerial: row.planSerial,
        purchasedOn: row.purchasedOn,
        readIssues: row.readIssues,
        stage: row.stage,
        status: row.status,
        tracking: row.tracking,
        userId: row.userId,
    };
}

function accountStatesCaveatFor(
    accountStatesSource: null | PortfolioLoad['ledger'],
): null | string {
    if (accountStatesSource === null) return null;
    switch (accountStatesSource.status) {
        case OverviewSectionStatus.Failed: {
            return `Alerts that depend on account history could not be checked because your ${sourceList(accountStatesSource.failed)} could not be loaded.`;
        }
        case OverviewSectionStatus.Pending: {
            return 'Alerts that depend on account history are not yet available because your ledger is still loading.';
        }
        case OverviewSectionStatus.Ready: {
            return null;
        }
    }
}

function accountStateSnapshotRowOf(
    row: OverviewSnapshotRow,
): AccountStateSnapshotRow {
    const stored = row as unknown as Pick<
        PropAccountSnapshotRow,
        | 'balanceAtLastPayoutCents'
        | 'cycleBestDayProfitCents'
        | 'evalBestDayProfitCents'
        | 'floorAtLastPayoutCents'
        | 'highestEodBalanceCents'
        | 'highestIntradayBalanceCents'
        | 'lastPayoutOn'
        | 'qualifyingDaysSinceLastPayout'
        | 'userId'
    >;
    return {
        accountId: row.accountId,
        asOf: row.asOf,
        balanceAtLastPayoutCents: stored.balanceAtLastPayoutCents,
        balanceCents: row.balanceCents,
        createdAt: row.createdAt,
        cumulativePayoutCents: row.cumulativePayoutCents,
        cycleBestDayProfitCents: stored.cycleBestDayProfitCents,
        dashboardFloorCents: row.dashboardFloorCents,
        evalBestDayProfitCents: stored.evalBestDayProfitCents,
        floorAtLastPayoutCents: stored.floorAtLastPayoutCents,
        highestEodBalanceCents: stored.highestEodBalanceCents,
        highestIntradayBalanceCents: stored.highestIntradayBalanceCents,
        id: row.id,
        lastPayoutOn: stored.lastPayoutOn,
        lastTradedOn: row.lastTradedOn,
        payoutsTaken: row.payoutsTaken,
        qualifyingDaysSinceLastPayout: stored.qualifyingDaysSinceLastPayout,
        tradingDays: row.tradingDays,
        userId: stored.userId,
    };
}

function alertsLoad(queries: PortfolioQueries): SectionLoad<AlertRows> {
    const accounts = queries[PortfolioSource.Accounts].data;
    const copyGroups = queries[PortfolioSource.CopyGroups].data;
    const payouts = queries[PortfolioSource.Payouts].data;
    const rulebook = queries[PortfolioSource.Rulebook].data;
    const snapshots = queries[PortfolioSource.Snapshots].data;
    return accounts === undefined ||
        copyGroups === undefined ||
        payouts === undefined ||
        rulebook === undefined ||
        snapshots === undefined
        ? loadGap(queries, ALERT_SOURCES)
        : {
              rows: { accounts, copyGroups, payouts, rulebook, snapshots },
              status: OverviewSectionStatus.Ready,
          };
}

function asSentence(text: string): string {
    const trimmed = text.trim();
    return SENTENCE_END.test(trimmed) ? trimmed : `${trimmed}.`;
}

function attemptEconomicsCard(
    ledger: PortfolioLedger,
    names: PlanNames,
    today: string,
    sampleThresholds: SampleThresholds,
): AttemptEconomicsCardModel {
    const economics = realizedAttemptEconomics(
        ledger,
        today,
        DEFAULT_REALIZED_HORIZON_DAYS,
    );
    return {
        disclosures: [
            REALIZED_HORIZON_DISCLOSURE,
            MARGIN_ABOVE_BREAKEVEN_HELP_TEXT,
        ],
        horizonDays: economics.horizonDays,
        rows: economics.perPlan.map((row) =>
            attemptEconomicsRow(row, names, sampleThresholds),
        ),
    };
}

function attemptEconomicsRow(
    row: PlanAttemptEconomics,
    names: PlanNames,
    sampleThresholds: SampleThresholds,
): AttemptEconomicsRow {
    const decomposition = row.decomposition?.value ?? null;
    return {
        attemptCost:
            row.attemptCost === null
                ? NOT_APPLICABLE
                : formatUsdCents(roundCents(row.attemptCost)),
        attempts: String(row.attempts),
        averagePayout: formatSampledCents(row.averagePayout),
        breakevenPassRate:
            decomposition === null
                ? NOT_APPLICABLE
                : formatOptionalPercent(decomposition.breakevenPassRate.value),
        fundedValue:
            decomposition === null
                ? NOT_APPLICABLE
                : formatCurrency(decomposition.fundedValue),
        key: row.planSerial,
        marginAboveBreakeven: marginAboveBreakevenLabel(
            row.marginAboveBreakeven,
        ),
        passRate: formatSampledRate(
            row.passRate,
            SampleKind.EvalAttempts,
            sampleThresholds,
        ),
        payoutRate: formatSampledRate(
            row.payoutRate,
            SampleKind.FundedAccounts,
            sampleThresholds,
        ),
        payoutsPerPaidFunded:
            row.payoutsPerPaidFunded === null
                ? NOT_APPLICABLE
                : row.payoutsPerPaidFunded.toFixed(2),
        plan: names.of(row.planSerial),
        realizedEvPerAttempt:
            row.realizedEvPerAttempt === null
                ? NOT_APPLICABLE
                : formatUsdCents(roundCents(row.realizedEvPerAttempt)),
    };
}

function attemptThroughputCard(
    ledger: PortfolioLedger,
    firms: FirmNames,
    today: string,
): AttemptThroughputCardModel {
    const throughput = attemptThroughput(ledger, today);
    return {
        meanPerActiveFirmPerMonth: formatOptionalMeanAttempts(
            throughput.meanPerActiveFirmPerMonth,
        ),
        meanPerMonth: throughput.meanPerMonth.toFixed(2),
        months: attemptThroughputMonthRows(throughput.months),
        perFirm: throughput.perFirm.map((row) =>
            firmAttemptThroughputRow(row, firms),
        ),
    };
}

function attemptThroughputMonthRows(
    months: AttemptThroughput['months'],
): readonly AttemptThroughputMonthRow[] {
    return months.map((month) => ({
        attempts: String(month.attempts),
        key: month.month,
        month: month.month,
    }));
}

function biggestWeaknessLine(diagnostic: FunnelDiagnostic): string {
    if (diagnostic.reason === FunnelDiagnosticReason.ModeledFiguresMissing) {
        return FUNNEL_DIAGNOSTIC_PENDING_TEXT;
    }
    const worst = diagnostic.stages[0];
    return worst === undefined ? FUNNEL_DIAGNOSTIC_PENDING_TEXT : `Biggest weakness vs the engine: ${FUNNEL_STAGE_LABEL[worst.stage]} (${formatUsdCents(roundCents(worst.dollarChangePerAttempt))} per attempt, ${formatUsdCents(roundCents(worst.dollarChangePerMonth))} per month).`;
}

function capNote(used: number, cap: number, suspended: number): null | string {
    if (used > cap) return `Over the cap by ${String(used - cap)}`;
    if (suspended === 0) return null;
    return `${counted({ count: suspended, plural: 'suspended accounts', singular: 'suspended account' })} ${suspended === 1 ? 'counts' : 'count'} toward the cap`;
}

function capUsageCard(
    usage: PlanCapUsage,
    names: PlanNames,
): CapUsageCardModel {
    return {
        disclosure: POOLED_CAPS_DISCLOSURE,
        rows: usage.plans.map((row) => ({
            cap: String(row.cap),
            freeSlots: String(row.freeSlots),
            key: row.planSerial,
            note: capNote(row.used, row.cap, row.suspended),
            plan: names.of(row.planSerial),
            used: String(row.used),
        })),
        unresolvedNote: combinedNote(
            unresolvedNote(usage.unresolvedAccounts),
            ledgerOnlyCapNote(usage.ledgerOnlyAccounts),
        ),
    };
}

function combinedNote(...notes: readonly (null | string)[]): null | string {
    const present = notes.filter((note): note is string => note !== null);
    return present.length === 0 ? null : present.join(' ');
}

function costCard(
    ledger: PortfolioLedger,
    names: PlanNames,
    firms: FirmNames,
    sampleThresholds: SampleThresholds,
): CostCardModel {
    const analytics = costAnalytics(ledger, new Map());
    const reconciliation = feeReconciliation(ledger);
    return {
        byAccountSize: analytics.byAccountSize.map((row) => ({
            accountSize: String(row.accountSize),
            attempts: String(row.attempts),
            attemptsSampleLevel: sampleAdequacy(
                SampleKind.EvalAttempts,
                row.attempts,
                sampleThresholds,
            ),
            costPerAttempt: optionalCents(row.costPerAttempt),
            key: String(row.accountSize),
            spend: formatUsdCents(row.spend),
        })),
        byFirm: analytics.byFirm.map((row) => ({
            amount: formatUsdCents(row.spend),
            firm: firms.of(row.firmKey),
            key: firmKeyId(row.firmKey),
        })),
        byFirmAttemptCost: analytics.byFirmAttemptCost.map((row) => ({
            attempts: String(row.attempts),
            attemptsSampleLevel: sampleAdequacy(
                SampleKind.EvalAttempts,
                row.attempts,
                sampleThresholds,
            ),
            costPerAttempt: optionalCents(row.costPerAttempt),
            firm: firms.of(row.firmKey),
            key: firmKeyId(row.firmKey),
            retryFeeAttempts: String(row.retryFeeAttempts),
        })),
        byKind: Object.values(FeeKind)
            .filter((kind) => analytics.byKind[kind] !== 0)
            .map((kind) => ({
                amount: formatUsdCents(analytics.byKind[kind]),
                key: kind,
                kind: feeKindLabel(kind),
            })),
        disclosures: [
            PENDING_FEE_ATTRIBUTION_TEXT[analytics.pendingFeeAttribution],
            MODELED_COST_PENDING,
            ...(analytics.unresolvedAccounts === 0
                ? []
                : [
                      `${formatUsdCents(analytics.unresolvedSpend)} spent on ${counted({ count: analytics.unresolvedAccounts, plural: 'accounts', singular: 'account' })} with a plan that is no longer modeled is in no plan row.`,
                  ]),
            ...(analytics.ledgerOnlyAccounts === 0
                ? []
                : [
                      `${formatUsdCents(analytics.ledgerOnlySpend)} spent on ${counted({ count: analytics.ledgerOnlyAccounts, plural: 'ledger-only accounts', singular: 'ledger-only account' })} is in the firm table but in no plan row.`,
                  ]),
        ],
        discountsByFirm: reconciliation.byFirm
            .filter((row) => row.discountCents !== 0)
            .map((row) => firmDiscountRow(row, firms)),
        perPlan: analytics.perPlan.map((row) => ({
            acquisitionSpend: formatUsdCents(row.acquisitionSpend),
            costPerFunded: optionalCents(row.costPerFundedAccount),
            fundedAccounts: String(row.fundedAccounts),
            fundedSampleLevel: sampleAdequacy(
                SampleKind.FundedAccounts,
                row.fundedAccounts,
                sampleThresholds,
            ),
            key: row.planSerial,
            modeled: PENDING,
            pendingEvalAccounts: String(row.pendingEvalAccounts),
            pendingSpend: formatUsdCents(row.pendingAcquisitionSpend),
            plan: names.of(row.planSerial),
        })),
    };
}

function counted({ count, plural, singular }: Counted): string {
    return `${String(count)} ${count === 1 ? singular : plural}`;
}

function diversificationCard(
    ledger: PortfolioLedger,
    firms: FirmNames,
): DiversificationCardModel {
    const shares = diversification(ledger);
    return {
        funding: shares.funding.map((share) => shareRow(share, firms)),
        payouts: shares.payouts.map((share) => shareRow(share, firms)),
    };
}

function firmActiveMonthWindow(
    months: AttemptThroughput['perFirm'][number]['months'],
): AttemptThroughput['perFirm'][number]['months'] {
    const firstActive = months.findIndex((month) => month.attempts > 0);
    if (firstActive === -1) return [];
    const lastActive = months.findLastIndex((month) => month.attempts > 0);
    return months.slice(firstActive, lastActive + 1);
}

function firmAttemptThroughputRow(
    row: AttemptThroughput['perFirm'][number],
    firms: FirmNames,
): FirmAttemptThroughputRow {
    const activeWindow = firmActiveMonthWindow(row.months);
    const monthlyMean =
        activeWindow.length === 0
            ? 0
            : activeWindow.reduce((sum, month) => sum + month.attempts, 0) /
              activeWindow.length;
    return {
        firm: firms.of(row.firmKey),
        key: firmKeyId(row.firmKey),
        meanPerMonth: monthlyMean.toFixed(2),
        months: attemptThroughputMonthRows(row.months),
    };
}

function firmDiscountRow(
    row: FirmDiscountCapture,
    firms: FirmNames,
): FirmDiscountRow {
    return {
        discount: formatUsdCents(row.discountCents),
        feesChecked: String(row.feesChecked),
        firm: firms.of(row.firmKey),
        key: firmKeyId(row.firmKey),
    };
}

function firmNames(externalFirms: readonly ExternalFirmName[]): FirmNames {
    return { of: (firmKey) => firmKeyLabel(firmKey, externalFirms) };
}

function firmReturnRow(
    row: FirmReturn,
    firms: FirmNames,
    sampleThresholds: SampleThresholds,
): FirmReturnRow {
    return {
        accounts: String(row.accounts),
        accountsWithPayout: String(row.accountsWithPayout),
        attempts: String(row.attempts),
        attemptsSampleLevel: sampleAdequacy(
            SampleKind.EvalAttempts,
            row.attempts,
            sampleThresholds,
        ),
        firm: firms.of(row.firmKey),
        firstPayoutOn: row.firstPayoutOn ?? NOT_APPLICABLE,
        fundedAccounts: String(row.fundedAccounts),
        fundedSampleLevel: sampleAdequacy(
            SampleKind.FundedAccounts,
            row.fundedAccounts,
            sampleThresholds,
        ),
        key: firmKeyId(row.firmKey),
        lastPayoutOn: row.lastPayoutOn ?? NOT_APPLICABLE,
        multiple: formatMultiple(row.multiple),
        net: formatUsdCents(row.net),
        payouts: formatUsdCents(row.payouts),
        spend: formatUsdCents(row.spend),
        verdict: NOISE_VERDICT_LABEL[row.verdict],
    };
}

function firmReturnsCard(
    ledger: PortfolioLedger,
    firms: FirmNames,
    sampleThresholds: SampleThresholds,
): FirmReturnsCardModel {
    return {
        rows: firmReturns(ledger).firms.map((row) =>
            firmReturnRow(row, firms, sampleThresholds),
        ),
    };
}

function formatMultiple(value: null | number): string {
    return value === null ? NOT_APPLICABLE : `${value.toFixed(2)}x`;
}

function formatOptionalMeanAttempts(value: null | number): null | string {
    return value === null ? null : value.toFixed(2);
}

function formatSampledCents(estimate: null | SampledEstimate): string {
    if (estimate === null) return NOT_APPLICABLE;
    const value = formatUsdCents(roundCents(estimate.value));
    const ciText =
        estimate.interval === null
            ? ''
            : ` (95% CI ${formatUsdCents(roundCents(estimate.interval.lower))} to ${formatUsdCents(roundCents(estimate.interval.upper))})`;
    return `${value}${ciText}, n = ${String(estimate.n)}`;
}

function formatSampledRate(
    estimate: null | SampledEstimate,
    kind: SampleKind,
    thresholds: SampleThresholds,
): string {
    if (estimate === null) return NOT_APPLICABLE;
    const ciText =
        estimate.interval === null
            ? ''
            : ` (95% CI ${formatPercent(estimate.interval.lower)} to ${formatPercent(estimate.interval.upper)}, n = ${String(estimate.n)})`;
    const nText = estimate.interval === null ? ` (n = ${String(estimate.n)})` : '';
    const level = sampleAdequacy(kind, estimate.n, thresholds);
    const levelText = level === null ? '' : `, ${SAMPLE_LEVEL_LABEL[level]}`;
    return `${formatPercent(estimate.value)}${ciText}${nText}${levelText}`;
}

function formatSessions(estimate: null | SampledEstimate): string {
    if (estimate === null) return NOT_APPLICABLE;
    const standardError =
        estimate.standardError === null
            ? NOT_APPLICABLE
            : estimate.standardError.toFixed(1);
    return `${estimate.value.toFixed(1)} sessions (SE ${standardError}, n = ${String(estimate.n)})`;
}

function fundedPayoutsCard(
    ledger: PortfolioLedger,
    names: PlanNames,
    today: string,
): FundedPayoutsCardModel {
    const distribution = fundedPayoutDistribution(
        ledger,
        today,
        DEFAULT_REALIZED_HORIZON_DAYS,
    );
    return {
        disclosures: [
            REALIZED_HORIZON_DISCLOSURE,
            MODELED_PAYOUT_DISTRIBUTION_PENDING,
        ],
        horizonDays: distribution.horizonDays,
        payoutCountCap: PAYOUT_COUNT_CAP,
        rows: distribution.perPlan.map((row) => ({
            counts: row.counts.map(String),
            key: row.planSerial,
            openAccounts: String(row.openAccounts),
            plan: names.of(row.planSerial),
            realizedFundedValue: formatSampledCents(row.realizedFundedValue),
        })),
    };
}

function funnelCard(
    ledger: PortfolioLedger,
    firms: FirmNames,
    today: string,
    sampleThresholds: SampleThresholds,
): FunnelCardModel {
    const funnel = stageFunnel(ledger);
    const payoutRates = realizedPayoutRates(
        ledger,
        today,
        DEFAULT_REALIZED_HORIZON_DAYS,
    );
    return {
        biggestWeakness: biggestWeaknessLine(FUNNEL_DIAGNOSTIC_MODELED_MISSING),
        disclosures: [REALIZED_HORIZON_DISCLOSURE],
        rows: funnel.byFirm.map((row) => {
            const payoutRate =
                payoutRates.perFirm.find(
                    (candidate) =>
                        firmKeyId(candidate.firmKey) ===
                        firmKeyId(row.firmKey),
                )?.payoutRate ?? null;
            return {
                fees: formatUsdCents(row.feesCents),
                firm: firms.of(row.firmKey),
                firstPayout: String(row.firstPayout),
                funded: String(row.funded),
                key: firmKeyId(row.firmKey),
                movedLive: String(row.movedLive),
                net: formatUsdCents(row.netCents),
                netPayouts: formatUsdCents(row.netPayoutsCents),
                passed: String(row.passed),
                payoutRate: formatSampledRate(
                    payoutRate,
                    SampleKind.FundedAccounts,
                    sampleThresholds,
                ),
                purchased: String(row.purchased),
            };
        }),
        unresolvedNote: combinedNote(
            unresolvedNote(funnel.unresolvedAccounts),
            ledgerOnlyFunnelNote(funnel.ledgerOnlyAccounts),
        ),
    };
}

function hasError(error: unknown): boolean {
    return error !== null && error !== undefined;
}

function isFailed(query: PortfolioQuery<unknown>): boolean {
    return query.data === undefined && hasError(query.error);
}

function isStale(query: PortfolioQuery<unknown>): boolean {
    return query.data !== undefined && hasError(query.error);
}

function kpiRow(
    ledger: PortfolioLedger,
    today: string,
    perSlot: RealizedNetPerSlot,
): OverviewKpi[] {
    const cash = spendAndPayouts(ledger).allTime;
    const roi = portfolioRoi(ledger, today);
    const funding = fundingTotals(ledger);
    const pooled = perSlot.pooled;
    const averagePayout = payoutSizeStats(ledger).mean;
    const perSlotNote =
        perSlot.ledgerOnlyAccounts === 0
            ? null
            : `${counted({ count: perSlot.ledgerOnlyAccounts, plural: 'ledger-only accounts', singular: 'ledger-only account' })} not counted`;
    return [
        {
            detail:
                cash.refunds === 0
                    ? null
                    : `After ${formatUsdCents(cash.refunds)} in refunds`,
            kind: OverviewKpiKind.Spend,
            label: 'Spend',
            note: null,
            tone: KpiTone.Neutral,
            value: formatUsdCents(cash.spend),
        },
        {
            detail: paidPayoutsDetail(cash.paidPayouts, cash.grossOnlyPayouts),
            kind: OverviewKpiKind.PayoutsReceived,
            label: 'Payouts received',
            note: null,
            tone: KpiTone.Neutral,
            value: formatUsdCents(cash.payouts),
        },
        {
            detail: 'Payouts received minus spend',
            kind: OverviewKpiKind.Net,
            label: 'Net',
            note: null,
            tone: toneOf(cash.net),
            value: formatUsdCents(cash.net),
        },
        pooled === null
            ? {
                  detail: 'No funded slot-month yet',
                  kind: OverviewKpiKind.RealizedNetPerSlot,
                  label: 'Realized net per slot per month',
                  note: perSlotNote,
                  tone: KpiTone.Neutral,
                  value: NOT_APPLICABLE,
              }
            : {
                  detail: `Pooled over ${counted({ count: perSlot.n, plural: 'months', singular: 'month' })} and ${perSlot.slotMonths.toFixed(1)} funded slot-months, SE ${optionalCents(pooled.standardError)}`,
                  kind: OverviewKpiKind.RealizedNetPerSlot,
                  label: 'Realized net per slot per month',
                  note: perSlotNote,
                  tone: toneOf(pooled.value),
                  value: formatUsdCents(pooled.value),
              },
        {
            detail: 'Modeled monthly net per slot under your documented rule: pending the engine cards',
            kind: OverviewKpiKind.ExpectedNet,
            label: 'Expected net per slot per month',
            note: null,
            tone: KpiTone.Pending,
            value: PENDING,
        },
        {
            detail:
                roi.total.value === null
                    ? 'No spend recorded yet'
                    : `${ROI_BASIS_LABEL[roi.annualised.basis]}: ${formatOptionalPercent(roi.annualised.value)}`,
            kind: OverviewKpiKind.Roi,
            label: ROI_BASIS_LABEL[roi.total.basis],
            note: null,
            tone: toneOf(roi.total.value ?? 0),
            value: formatOptionalPercent(roi.total.value),
        },
        {
            detail:
                cash.spend === 0
                    ? 'No spend recorded yet'
                    : 'Payouts received divided by spend',
            kind: OverviewKpiKind.PayoutMultiple,
            label: 'Payout multiple',
            note: null,
            tone:
                cash.spend === 0
                    ? KpiTone.Neutral
                    : toneOf(cash.payouts - cash.spend),
            value: formatMultiple(payoutMultiple(cash.payouts, cash.spend)),
        },
        {
            detail: `Information only: nominal account size, not money you hold. Evals in progress: ${formatUsdCents(funding.evalNominal)} across ${counted({ count: funding.byStage[AccountStage.Eval].accounts, plural: 'accounts', singular: 'account' })}.`,
            kind: OverviewKpiKind.TotalFunding,
            label: 'Total nominal funding',
            note: null,
            tone: KpiTone.Neutral,
            value: formatUsdCents(funding.fundedNominal),
        },
        {
            detail: averagePayout === null ? 'No paid payout yet' : null,
            kind: OverviewKpiKind.AveragePayout,
            label: 'Average payout',
            note: null,
            tone: KpiTone.Neutral,
            value: formatSampledCents(averagePayout),
        },
    ];
}

function labelsOf(accounts: readonly LedgerAccount[]): string {
    return accounts.map((entry) => entry.row.label).join(', ');
}

function latestSnapshotBalanceOf(
    snapshots: readonly OverviewSnapshotRow[],
    asOf: string,
): null | PayoutSizeSnapshotBalance {
    const latest = snapshots
        .filter((snapshot) => snapshot.asOf <= asOf)
        .reduce<null | OverviewSnapshotRow>(
            (best, snapshot) =>
                best === null || snapshot.asOf > best.asOf ? snapshot : best,
            null,
        );
    if (latest?.dashboardFloorCents == null) return null;
    return {
        balanceCents: latest.balanceCents,
        dashboardFloorCents: latest.dashboardFloorCents,
    };
}

function ledgerCards(
    ledger: PortfolioLedger,
    today: string,
    firms: FirmNames,
    statementTargets: MonthlyStatementTargets,
    sampleThresholds: SampleThresholds,
    snapshots: readonly OverviewSnapshotRow[],
    retainedCushionCents: null | UsdCents,
): OverviewLedgerCards {
    const names = planNames(ledger);
    const statement = monthlyStatement(ledger, today, statementTargets);
    const perSlot = realizedNetPerSlot(ledger, today);
    return {
        attemptEconomics: attemptEconomicsCard(
            ledger,
            names,
            today,
            sampleThresholds,
        ),
        attemptThroughput: attemptThroughputCard(ledger, firms, today),
        capUsage: capUsageCard(planCapUsage(ledger), names),
        cost: costCard(ledger, names, firms, sampleThresholds),
        diversification: diversificationCard(ledger, firms),
        firmReturns: firmReturnsCard(ledger, firms, sampleThresholds),
        fundedPayouts: fundedPayoutsCard(ledger, names, today),
        funnel: funnelCard(ledger, firms, today, sampleThresholds),
        kpis: kpiRow(ledger, today, perSlot),
        notices: ledgerNotices(ledger, today),
        outcomes: outcomesCard(ledger, names, sampleThresholds),
        payoutSizes: payoutSizesCard(
            ledger,
            firms,
            snapshots,
            retainedCushionCents,
        ),
        repeatability: repeatabilityCard(
            statement,
            perSlot,
            statementTargets.monthlyPayoutTargetCents,
        ),
        replacement: replacementCard(ledger, names, sampleThresholds),
        statement: statementCard(
            ledger,
            statement,
            today,
            statementTargets.monthlyPayoutTargetCents,
        ),
        timeline: timelineCard(ledger),
    };
}

function ledgerLoad(queries: PortfolioQueries): SectionLoad<LedgerRows> {
    const accounts = queries[PortfolioSource.Accounts].data;
    const events = queries[PortfolioSource.Events].data;
    const fees = queries[PortfolioSource.Fees].data;
    const payouts = queries[PortfolioSource.Payouts].data;
    const snapshots = queries[PortfolioSource.Snapshots].data;
    return accounts === undefined ||
        events === undefined ||
        fees === undefined ||
        payouts === undefined ||
        snapshots === undefined
        ? loadGap(queries, LEDGER_SOURCES)
        : {
              rows: { accounts, events, fees, payouts, snapshots },
              status: OverviewSectionStatus.Ready,
          };
}

function ledgerNotices(
    ledger: PortfolioLedger,
    today: string,
): OverviewNotice[] {
    const mismatched = ledger.resolvedAccounts.filter(
        (entry) => !entry.timelineMatchesRow,
    );
    const rejectedEvents = ledger.accounts.reduce(
        (sum, entry) => sum + entry.rejectedEvents,
        0,
    );
    const unresolved = ledger.unresolvedAccounts;
    const { ledgerOnlyAccounts } = ledger;
    const unreadable = ledger.accounts.filter((entry) =>
        entry.row.readIssues.some(
            (issue) => issue.kind === AccountReadIssueKind.CorruptPersonalRules,
        ),
    );
    const undatedPaidPayouts = spendAndPayouts(ledger).undatedPaidPayouts;
    const perSlot = realizedNetPerSlot(ledger, today);
    const { unmatched } = ledger;
    const unmatchedRows =
        unmatched.accounts +
        unmatched.events +
        unmatched.fees +
        unmatched.payouts;
    const notices: OverviewNotice[] = [];
    if (mismatched.length > 0) {
        const isSingular = mismatched.length === 1;
        notices.push({
            kind: OverviewNoticeKind.TimelineMismatch,
            message: `${counted({ count: mismatched.length, plural: 'accounts', singular: 'account' })} ${isSingular ? 'has' : 'have'} recorded events that do not replay to ${isSingular ? 'its' : 'their'} stored stage and status (${labelsOf(mismatched)}); ${isSingular ? 'its' : 'their'} funnel, outcomes and slot months follow the recorded events.`,
        });
    }
    if (rejectedEvents > 0) {
        const isSingular = rejectedEvents === 1;
        notices.push({
            kind: OverviewNoticeKind.RejectedEvents,
            message: `${counted({ count: rejectedEvents, plural: 'recorded events', singular: 'recorded event' })} ${isSingular ? 'was' : 'were'} rejected by the account lifecycle and ${isSingular ? 'is' : 'are'} left out of the funnel, outcomes and slot months.`,
        });
    }
    if (unresolved.length > 0) {
        const isSingular = unresolved.length === 1;
        notices.push({
            kind: OverviewNoticeKind.UnresolvedAccounts,
            message: `${counted({ count: unresolved.length, plural: 'accounts', singular: 'account' })} ${isSingular ? 'has' : 'have'} a plan that is no longer modeled (${labelsOf(unresolved)}); ${isSingular ? 'its' : 'their'} fees and payouts count in the cash totals but not in realized net per slot or the per-plan cards.`,
        });
    }
    if (ledgerOnlyAccounts.length > 0) {
        const isSingular = ledgerOnlyAccounts.length === 1;
        notices.push({
            kind: OverviewNoticeKind.LedgerOnlyAccounts,
            message: `${counted({ count: ledgerOnlyAccounts.length, plural: 'accounts', singular: 'account' })} ${isSingular ? 'is' : 'are'} ledger only (${labelsOf(ledgerOnlyAccounts)}); the engine does not model ${isSingular ? 'its plan' : 'their plans'}, so ${isSingular ? 'its' : 'their'} fees and payouts count in the cash totals, the firm tables and the funnel, but not in realized net per slot or the per-plan cards (cost per plan, outcomes, replacement and plan caps).`,
        });
    }
    if (unreadable.length > 0) {
        const isSingular = unreadable.length === 1;
        notices.push({
            kind: OverviewNoticeKind.ReadIssues,
            message: `${counted({ count: unreadable.length, plural: 'accounts', singular: 'account' })} ${isSingular ? 'has' : 'have'} saved caps and limits that cannot be read (${labelsOf(unreadable)}), so ${isSingular ? 'it is' : 'they are'} read-only and ${isSingular ? 'gets' : 'get'} no sizing advice until the stored data is repaired.`,
        });
    }
    if (undatedPaidPayouts > 0) {
        const isSingular = undatedPaidPayouts === 1;
        notices.push({
            kind: OverviewNoticeKind.UndatedPaidPayouts,
            message: `${counted({ count: undatedPaidPayouts, plural: 'paid payouts', singular: 'paid payout' })} ${isSingular ? 'has' : 'have'} no paid date; ${isSingular ? 'it counts' : 'they count'} in the all-time totals but in no month.`,
        });
    }
    if (perSlot.unmeasuredFundedAccounts > 0) {
        const isSingular = perSlot.unmeasuredFundedAccounts === 1;
        notices.push({
            kind: OverviewNoticeKind.UnmeasuredSlots,
            message: `${counted({ count: perSlot.unmeasuredFundedAccounts, plural: 'funded accounts', singular: 'funded account' })} ${isSingular ? 'has' : 'have'} no known funded date, so ${isSingular ? 'its' : 'their'} net of ${formatUsdCents(perSlot.unmeasuredNet)} is left out of realized net per slot.`,
        });
    }
    if (perSlot.unallocatedMonths > 0) {
        notices.push({
            kind: OverviewNoticeKind.UnallocatedNet,
            message: `${formatUsdCents(perSlot.unallocatedNet)} net in ${counted({ count: perSlot.unallocatedMonths, plural: 'months', singular: 'month' })} with no active funded slot is left out of realized net per slot.`,
        });
    }
    if (unmatchedRows > 0) {
        const isSingular = unmatchedRows === 1;
        notices.push({
            kind: OverviewNoticeKind.UnmatchedRows,
            message: `${counted({ count: unmatchedRows, plural: 'rows', singular: 'row' })} ${isSingular ? 'belongs' : 'belong'} to no listed account and ${isSingular ? 'is' : 'are'} left out.`,
        });
    }
    notices.push({
        kind: OverviewNoticeKind.EventWindow,
        message: `Account events are loaded for the last ${String(MAX_EVENT_LIST_YEARS)} years only; older events are not in the funnel, outcomes, slot months or timeline.`,
    });
    return notices;
}

function ledgerOnlyCapNote(ledgerOnlyAccounts: number): null | string {
    if (ledgerOnlyAccounts === 0) return null;
    const isSingular = ledgerOnlyAccounts === 1;
    return `${counted({ count: ledgerOnlyAccounts, plural: 'ledger-only accounts', singular: 'ledger-only account' })} ${isSingular ? 'is' : 'are'} not counted here; check ${isSingular ? 'it' : 'them'} against the firm's own account cap yourself.`;
}

function ledgerOnlyFunnelNote(ledgerOnlyAccounts: number): null | string {
    if (ledgerOnlyAccounts === 0) return null;
    const isSingular = ledgerOnlyAccounts === 1;
    return `${counted({ count: ledgerOnlyAccounts, plural: 'ledger-only accounts', singular: 'ledger-only account' })} ${isSingular ? 'counts' : 'count'} from ${isSingular ? 'its' : 'their'} stored stage and paid payouts; whether ${isSingular ? 'it' : 'they'} passed an evaluation is not known.`;
}

function loadGap(
    queries: PortfolioQueries,
    sources: readonly PortfolioSource[],
): SectionLoadGap {
    const failed = sources.filter((source) => isFailed(queries[source]));
    return failed.length > 0
        ? { failed, status: OverviewSectionStatus.Failed }
        : { status: OverviewSectionStatus.Pending };
}

function marginAboveBreakevenLabel(margin: boolean | null): string {
    if (margin === null) return NOT_APPLICABLE;
    return margin ? 'Above breakeven' : 'Not above breakeven';
}

function optionalCents(value: null | UsdCents): string {
    return value === null ? NOT_APPLICABLE : formatUsdCents(value);
}

function outcomesCard(
    ledger: PortfolioLedger,
    names: PlanNames,
    sampleThresholds: SampleThresholds,
): OutcomesCardModel {
    const outcomes = realizedOutcomes(ledger);
    const open = outcomes.perPlan.reduce(
        (sum, row) => sum + row.openFundedAccounts,
        0,
    );
    const isSingular = open === 1;
    return {
        disclosures: [
            ...(outcomes.perPlan.length === 0
                ? []
                : [
                      `Funded survival counts every account that reached funded; ${String(open)} still open ${isSingular ? 'is' : 'are'} counted as ${isSingular ? 'a survivor' : 'survivors'}, so the rate is an upper bound until ${isSingular ? 'it closes' : 'they close'}.`,
                  ]),
            ...(outcomes.ledgerOnlyAccounts === 0
                ? []
                : [
                      `${counted({ count: outcomes.ledgerOnlyAccounts, plural: 'ledger-only accounts', singular: 'ledger-only account' })} ${outcomes.ledgerOnlyAccounts === 1 ? 'is' : 'are'} not counted here, since the engine does not model ${outcomes.ledgerOnlyAccounts === 1 ? 'its plan' : 'their plans'}.`,
                  ]),
            MODELED_OUTCOMES_PENDING,
        ],
        rows: outcomes.perPlan.map((row) => ({
            fundedSurvival: formatSampledRate(
                row.fundedSurvival,
                SampleKind.FundedAccounts,
                sampleThresholds,
            ),
            key: row.planSerial,
            openFunded: String(row.openFundedAccounts),
            passRate: row.instantFunded
                ? 'Instant funded'
                : formatSampledRate(
                      row.passRate,
                      SampleKind.EvalAttempts,
                      sampleThresholds,
                  ),
            plan: names.of(row.planSerial),
            sessionsToFunded: row.instantFunded
                ? 'Instant funded'
                : formatSessions(row.sessionsToFunded),
        })),
    };
}

function overviewAlert(alert: AccountAlert): OverviewAlert {
    const subject = alertSubjectView(alert);
    return {
        disclosures: alert.disclosures.map(
            (disclosure) => ALERT_DISCLOSURE_TEXT[disclosure],
        ),
        key: subject.key,
        kindLabel: alertKindLabel(alert.kind),
        message: alert.message,
        severity: alert.severity,
        subjectLabel: subject.label,
    };
}

function overviewLedger(
    section: SectionLoad<LedgerRows>,
    today: string,
    userId: string,
    firms: FirmNames,
    statementTargets: MonthlyStatementTargets,
    sampleThresholds: SampleThresholds,
    retainedCushionCents: null | UsdCents,
): OverviewLedger {
    switch (section.status) {
        case OverviewSectionStatus.Failed: {
            return {
                kind: OverviewSectionStatus.Failed,
                message: `Spend, payouts, net and the ledger cards are not shown because your ${sourceList(section.failed)} could not be loaded.`,
            };
        }
        case OverviewSectionStatus.Pending: {
            return { kind: OverviewSectionStatus.Pending };
        }
        case OverviewSectionStatus.Ready: {
            return readyLedger(
                section.rows,
                today,
                userId,
                firms,
                statementTargets,
                sampleThresholds,
                retainedCushionCents,
            );
        }
    }
}

function paidPayoutsDetail(paid: number, grossOnly: number): string {
    const paidText = counted({
        count: paid,
        plural: 'paid payouts',
        singular: 'paid payout',
    });
    if (grossOnly === 0) return paidText;
    const isSingular = grossOnly === 1;
    return `${paidText}; ${String(grossOnly)} ${isSingular ? 'has' : 'have'} no net amount, so ${isSingular ? 'its' : 'their'} gross is counted`;
}

function payoutSizeDisclosures(
    stats: PayoutSizeStats,
    hasCushion: boolean,
): string[] {
    const disclosures: string[] = [];
    if (stats.count > 0) {
        disclosures.push(
            `The median, p10 and p90 are sample quantiles over ${counted({ count: stats.count, plural: 'payouts', singular: 'payout' })}; unlike the mean above, they carry no confidence interval.`,
        );
    }
    if (stats.grossOnlyPayouts > 0) {
        disclosures.push(
            `${counted({ count: stats.grossOnlyPayouts, plural: 'payouts have', singular: 'payout has' })} no net amount, so its gross is counted.`,
        );
    }
    if (stats.lowBalanceCount > 0) {
        disclosures.push(
            `${counted({ count: stats.lowBalanceCount, plural: 'payouts left', singular: 'payout left' })} the account close to its retained cushion at the time it was paid.`,
        );
    }
    disclosures.push(
        hasCushion
            ? LOW_BALANCE_APPROXIMATED_DISCLOSURE
            : LOW_BALANCE_MONITORING_NOT_WIRED_DISCLOSURE,
    );
    return disclosures;
}

function payoutSizeFirmRow(
    row: PayoutsByFirm,
    firms: FirmNames,
): PayoutSizeFirmRow {
    return {
        count: String(row.count),
        firm: firms.of(row.firmKey),
        key: firmKeyId(row.firmKey),
        mean: formatSampledCents(row.mean),
    };
}

function payoutSizeGroupRow(row: PayoutsByAccountSize): PayoutSizeGroupRow {
    return {
        accountSize: String(row.accountSize),
        count: String(row.count),
        key: String(row.accountSize),
        mean: formatSampledCents(row.mean),
    };
}

function payoutSizesCard(
    ledger: PortfolioLedger,
    firms: FirmNames,
    snapshots: readonly OverviewSnapshotRow[],
    retainedCushionCents: null | UsdCents,
): PayoutSizesCardModel {
    const stats = payoutSizeStats(
        ledger,
        payoutSizeSnapshotOptions(snapshots, retainedCushionCents),
    );
    const hasCushion = retainedCushionCents !== null && snapshots.length > 0;
    return {
        byAccountSize: stats.byAccountSize.map((row) => payoutSizeGroupRow(row)),
        byFirm: stats.byFirm.map((row) => payoutSizeFirmRow(row, firms)),
        byStage: stats.byStage.map((row) => payoutSizeStageRow(row)),
        count: stats.count,
        disclosures: payoutSizeDisclosures(stats, hasCushion),
        grossOnlyPayouts: stats.grossOnlyPayouts,
        histogram: stats.histogram,
        lowBalanceCount: stats.lowBalanceCount,
        mean: formatSampledCents(stats.mean),
        median: formatUsdCents(stats.median),
        p10: formatUsdCents(stats.p10),
        p90: formatUsdCents(stats.p90),
    };
}

function payoutSizeSnapshotOptions(
    snapshots: readonly OverviewSnapshotRow[],
    retainedCushionCents: null | UsdCents,
): PayoutSizeStatsOptions {
    if (retainedCushionCents === null) {
        return { bucketWidthCents: DEFAULT_PAYOUT_HISTOGRAM_BUCKET_CENTS };
    }
    const byAccount = Map.groupBy(
        snapshots,
        (snapshot) => snapshot.accountId,
    );
    return {
        bucketWidthCents: DEFAULT_PAYOUT_HISTOGRAM_BUCKET_CENTS,
        latestBalanceOnOrBefore: (accountId, asOf) =>
            latestSnapshotBalanceOf(byAccount.get(accountId) ?? [], asOf),
        retainedCushionCents,
    };
}

function payoutSizeStageRow(row: PayoutsByStage): PayoutSizeStageRow {
    return {
        count: String(row.count),
        key: row.stage,
        mean: formatSampledCents(row.mean),
        stage: accountStageLabel(row.stage),
    };
}

function planNames(ledger: PortfolioLedger): PlanNames {
    const names = new Map(
        ledger
            .planGroups()
            .map((group) => [
                group.planSerial,
                `${group.firm.displayName} ${group.plan.label}`,
            ]),
    );
    return { of: (planSerial) => names.get(planSerial) ?? planSerial };
}

function readableError(error: unknown): string {
    return asSentence(errorMessage(error));
}

function readyLedger(
    rows: LedgerRows,
    today: string,
    userId: string,
    firms: FirmNames,
    statementTargets: MonthlyStatementTargets,
    sampleThresholds: SampleThresholds,
    retainedCushionCents: null | UsdCents,
): OverviewLedger {
    const computed = ledgerOrDateFailure(() =>
        ledgerCards(
            PortfolioLedger.fromRows(userId, rows),
            today,
            firms,
            statementTargets,
            sampleThresholds,
            rows.snapshots,
            retainedCushionCents,
        ),
    );
    switch (computed.kind) {
        case OverviewSectionStatus.Failed: {
            return {
                kind: OverviewSectionStatus.Failed,
                message: `The ledger cards could not be computed: ${computed.message} Fix the stored date listed in the alerts.`,
            };
        }
        case OverviewSectionStatus.Ready: {
            return { ...computed.value, kind: OverviewSectionStatus.Ready };
        }
    }
}

const PER_SLOT_TARGET_NOTE =
    'The per-slot target divides the portfolio-wide monthly target evenly across the funded slots active that month.';

function formatCohortMultiple(cohort: CohortMultiple | null): string {
    if (cohort === null) return NOT_APPLICABLE;
    return cohort.value === null ? `${NOT_APPLICABLE}, n = ${String(cohort.n)}` : `${formatMultiple(cohort.value)} (P10-P90 ${cohort.interval.lower.toFixed(2)}x to ${cohort.interval.upper.toFixed(2)}x), n = ${String(cohort.n)}`;
}

function purchaseCohortRows(
    ledger: PortfolioLedger,
    today: string,
): readonly PurchaseCohortRow[] {
    return purchaseCohorts(ledger, today).map((cohort) => ({
        endedAccounts: String(cohort.endedAccounts),
        inProgressCount: String(cohort.inProgressCount),
        key: cohort.month,
        month: cohort.month,
        payouts: formatUsdCents(cohort.payouts),
        realizedMultiple: formatCohortMultiple(cohort.realizedMultiple),
        spend: formatUsdCents(cohort.spend),
        toDateMultiple: formatMultiple(cohort.toDateMultiple),
    }));
}

function repeatabilityCard(
    statement: MonthlyStatement,
    slots: RealizedNetPerSlot,
    target: null | number,
): RepeatabilityCardModel {
    const stats = repeatability(statement, slots, target);
    return {
        overall: repeatabilityStatsRow(stats.overall),
        perSlot: repeatabilityStatsRow(stats.perSlot),
        perSlotTargetNote: target === null ? null : PER_SLOT_TARGET_NOTE,
    };
}

function repeatabilityStatsRow(
    stats: null | RepeatabilityStats,
): null | RepeatabilityStatsRow {
    return stats === null
        ? null
        : {
              best: formatUsdCents(stats.best),
              count: String(stats.count),
              mean: formatUsdCents(stats.mean),
              shareAtOrAboveTarget:
                  stats.shareAtOrAboveTarget === null
                      ? null
                      : formatPercent(stats.shareAtOrAboveTarget),
              sharePositive: formatPercent(stats.sharePositive),
              standardDeviation: formatUsdCents(stats.standardDeviation),
              worst: formatUsdCents(stats.worst),
          };
}

function replacementCard(
    ledger: PortfolioLedger,
    names: PlanNames,
    sampleThresholds: SampleThresholds,
): ReplacementCardModel {
    const stats = replacementStats(ledger);
    return {
        rows: stats.perPlan.map((row) => {
            const rebuyLag = rebuyLagDefault(stats, row.planSerial);
            return {
                attempts: String(row.attempts),
                attemptsPerFunded:
                    row.attemptsPerFundedAccount === null
                        ? NOT_APPLICABLE
                        : row.attemptsPerFundedAccount.toFixed(2),
                attemptsSampleLevel: sampleAdequacy(
                    SampleKind.EvalAttempts,
                    row.attempts,
                    sampleThresholds,
                ),
                key: row.planSerial,
                lag: formatSessions(row.lagSessions),
                plan: names.of(row.planSerial),
                rebuyLag:
                    rebuyLag.basis === RebuyLagBasis.Measured
                        ? `${rebuyLag.days.toFixed(1)} sessions (measured, n = ${String(rebuyLag.samples)})`
                        : '0 sessions (assumed: no replacement measured yet)',
                unmeasured: String(row.unmeasuredReplacements),
            };
        }),
    };
}

function retainedCushionCentsOf(queries: PortfolioQueries): null | UsdCents {
    const rulebook = queries[PortfolioSource.Rulebook].data;
    return rulebook === undefined
        ? null
        : usdCents(rulebook.payout.retainedCushionCents);
}

function sampleThresholdsOf(queries: PortfolioQueries): SampleThresholds {
    const rulebook = queries[PortfolioSource.Rulebook].data;
    return (
        rulebook?.samples ?? {
            minClosedRounds: null,
            minEvalAttempts: null,
            minFundedAccounts: null,
            minTrades: null,
        }
    );
}

function shareRow(share: FirmShare, firms: FirmNames): FirmShareRow {
    return {
        amount: formatUsdCents(share.cents),
        firm: firms.of(share.firmKey),
        key: firmKeyId(share.firmKey),
        share: formatPercent(share.share),
    };
}

function signedCash(cents: UsdCents): string {
    return cents > 0 ? `+${formatUsdCents(cents)}` : formatUsdCents(cents);
}

function sourceList(sources: readonly PortfolioSource[]): string {
    const labels = sources.map((source) => SOURCE_LABEL[source]);
    const last = labels.at(-1) ?? '';
    return labels.length < 2
        ? last
        : `${labels.slice(0, -1).join(', ')} and ${last}`;
}

function statementCard(
    ledger: PortfolioLedger,
    statement: MonthlyStatement,
    today: string,
    monthlyPayoutTargetCents: null | number,
): StatementCardModel {
    return {
        caveat: STATEMENT_MULTIPLE_CAVEAT,
        chart: statement.months.map((month) => ({
            month: month.month,
            payouts: month.payouts / CENTS_PER_DOLLAR,
            spend: month.spend / CENTS_PER_DOLLAR,
        })),
        months: statement.months.map((month) => ({
            cumulativeNet: formatUsdCents(month.cumulativeNet),
            isPartial: month.isPartial,
            key: month.month,
            meetsMultipleTarget: month.meetsMultipleTarget,
            meetsPayoutTarget: month.meetsPayoutTarget,
            month: month.month,
            multiple: formatMultiple(month.multiple),
            net: formatUsdCents(month.net),
            payoutCount: String(month.paidPayouts),
            payoutGrowth: formatOptionalPercent(month.payoutGrowth),
            payouts: formatUsdCents(month.payouts),
            spend: formatUsdCents(month.spend),
            trailingThreeMonthMultiple: formatMultiple(
                month.trailingThreeMonthMultiple,
            ),
        })),
        purchaseCohorts: purchaseCohortRows(ledger, today),
        targetDollars:
            monthlyPayoutTargetCents === null
                ? null
                : monthlyPayoutTargetCents / CENTS_PER_DOLLAR,
    };
}

function statementTargetsOf(
    queries: PortfolioQueries,
): MonthlyStatementTargets {
    const rulebook = queries[PortfolioSource.Rulebook].data;
    return rulebook === undefined
        ? { monthlyPayoutTargetCents: null, targetMonthlyMultiple: null }
        : {
              monthlyPayoutTargetCents: rulebook.review.monthlyPayoutTargetCents,
              targetMonthlyMultiple: rulebook.review.targetMonthlyMultiple,
          };
}

function timelineCard(ledger: PortfolioLedger): TimelineCardModel {
    const entries = ledgerTimeline(ledger).toReversed();
    return {
        entries: entries
            .slice(0, OVERVIEW_TIMELINE_LIMIT)
            .map((entry) => timelineRow(entry)),
        hiddenEntries: Math.max(0, entries.length - OVERVIEW_TIMELINE_LIMIT),
    };
}

function timelineRow(entry: TimelineEntry): TimelineRow {
    const base = {
        account: entry.accountLabel,
        key: `${entry.kind}-${entry.id}`,
        on: entry.on,
    };
    switch (entry.kind) {
        case TimelineEntryKind.Event: {
            return {
                ...base,
                amount: null,
                description: accountEventKindLabel(entry.eventKind),
            };
        }
        case TimelineEntryKind.Fee: {
            return {
                ...base,
                amount: signedCash(usdCents(0 - entry.signedCents)),
                description: feeKindLabel(entry.feeKind),
            };
        }
        case TimelineEntryKind.Payout: {
            const label = payoutStatusLabel(entry.status);
            const cash = paidPayoutCash({ ...entry, paidOn: entry.on });
            if (cash === null) {
                return {
                    ...base,
                    amount: null,
                    description: `${label} (${formatUsdCents(entry.grossCents)} gross, no cash received)`,
                };
            }
            return {
                ...base,
                amount: signedCash(cash.cents),
                description: cash.grossOnly
                    ? `${label} (no net amount, gross counted)`
                    : label,
            };
        }
    }
}

function toneOf(value: number): KpiTone {
    if (value > 0) return KpiTone.Positive;
    return value < 0 ? KpiTone.Negative : KpiTone.Neutral;
}

function unresolvedNote(unresolvedAccounts: number): null | string {
    if (unresolvedAccounts === 0) return null;
    const isSingular = unresolvedAccounts === 1;
    return `${counted({ count: unresolvedAccounts, plural: 'accounts', singular: 'account' })} with a plan that is no longer modeled ${isSingular ? 'is' : 'are'} not counted here.`;
}
