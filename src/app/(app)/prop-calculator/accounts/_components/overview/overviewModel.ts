import { type z } from 'zod';

import { errorMessage } from '~/lib/errorMessage';
import {
    formatOptionalPercent,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import {
    type AccountAlert,
    AccountEventKind,
    AccountReadIssueKind,
    AccountStage,
    type AlertAccountRow,
    type AlertCopyGroupRow,
    AlertDisclosure,
    AlertEvaluator,
    type AlertInputs,
    alertKindLabel,
    type AlertPayoutRow,
    type AlertSeverity,
    type AlertSnapshotRow,
    costAnalytics,
    createAlertContext,
    DEFAULT_ALERT_RULES,
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
    fundingTotals,
    IsoDateError,
    type LedgerAccount,
    type LedgerAccountRow,
    type LedgerEventRow,
    type LedgerFeeRow,
    type LedgerPayoutRow,
    ledgerTimeline,
    type MonthlyStatement,
    monthlyStatement,
    type MonthlyStatementTargets,
    paidPayoutCash,
    payoutMultiple,
    PayoutStatus,
    PendingFeeAttribution,
    planCapUsage,
    type PlanCapUsage,
    PortfolioLedger,
    portfolioRoi,
    type RealizedNetPerSlot,
    realizedNetPerSlot,
    realizedOutcomes,
    RebuyLagBasis,
    rebuyLagDefault,
    repeatability,
    type RepeatabilityStats,
    replacementStats,
    type SampledEstimate,
    spendAndPayouts,
    stageFunnel,
    type TimelineEntry,
    TimelineEntryKind,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts';
import { CENTS_PER_DOLLAR, ROI_BASIS_LABEL } from '~/lib/prop-calculator';
import { type RulebookParameters } from '~/lib/prop-calculator/advisor';
import { NoiseVerdict } from '~/lib/prop-calculator/stats';
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

export interface FunnelCardModel {
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
    readonly capUsage: CapUsageCardModel;
    readonly cost: CostCardModel;
    readonly diversification: DiversificationCardModel;
    readonly firmReturns: FirmReturnsCardModel;
    readonly funnel: FunnelCardModel;
    readonly kpis: readonly OverviewKpi[];
    readonly notices: readonly OverviewNotice[];
    readonly outcomes: OutcomesCardModel;
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

export interface PortfolioLoad {
    readonly accounts: SectionLoad<readonly OverviewAccountRow[]>;
    readonly alerts: SectionLoad<AlertRows>;
    readonly failures: readonly PortfolioLoadIssue[];
    readonly ledger: SectionLoad<LedgerRows>;
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
    readonly [PortfolioSource.Snapshots]: readonly AlertSnapshotRow[];
}

export interface RepeatabilityCardModel {
    readonly overall: null | RepeatabilityStatsRow;
    readonly perSlot: null | RepeatabilityStatsRow;
    readonly perSlotTargetCaveat: null | string;
}

export interface ReplacementCardModel {
    readonly rows: readonly ReplacementRow[];
}

export interface StatementCardModel {
    readonly caveat: string;
    readonly chart: readonly StatementChartPoint[];
    readonly months: readonly StatementRow[];
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
    readonly costPerAttempt: string;
    readonly firm: string;
    readonly key: string;
    readonly retryFeeAttempts: string;
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
    readonly firm: string;
    readonly firstPayoutOn: string;
    readonly fundedAccounts: string;
    readonly key: string;
    readonly lastPayoutOn: string;
    readonly multiple: string;
    readonly net: string;
    readonly payouts: string;
    readonly spend: string;
    readonly verdict: string;
}

interface FunnelRow {
    readonly firm: string;
    readonly firstPayout: string;
    readonly funded: string;
    readonly key: string;
    readonly movedLive: string;
    readonly passed: string;
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

interface PlanCostRow {
    readonly acquisitionSpend: string;
    readonly costPerFunded: string;
    readonly fundedAccounts: string;
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
    readonly key: string;
    readonly lag: string;
    readonly plan: string;
    readonly rebuyLag: string;
    readonly unmeasured: string;
}

interface SizeCostRow {
    readonly accountSize: string;
    readonly attempts: string;
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

export function alertsFor(
    section: PortfolioLoad['alerts'],
    today: string,
    isIncluded: (alert: AccountAlert) => boolean,
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
            return {
                alerts: portfolioAlerts({ ...section.rows, today })
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
        alerts: alertsFor(load.alerts, today, () => true),
        hasAccounts:
            load.accounts.status === OverviewSectionStatus.Ready &&
            load.accounts.rows.length > 0,
        ledger: overviewLedger(
            load.ledger,
            today,
            userId,
            firmNames(externalFirms),
            load.statementTargets,
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
): CostCardModel {
    const analytics = costAnalytics(ledger, new Map());
    const reconciliation = feeReconciliation(ledger);
    return {
        byAccountSize: analytics.byAccountSize.map((row) => ({
            accountSize: String(row.accountSize),
            attempts: String(row.attempts),
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

function firmReturnRow(row: FirmReturn, firms: FirmNames): FirmReturnRow {
    return {
        accounts: String(row.accounts),
        accountsWithPayout: String(row.accountsWithPayout),
        attempts: String(row.attempts),
        firm: firms.of(row.firmKey),
        firstPayoutOn: row.firstPayoutOn ?? NOT_APPLICABLE,
        fundedAccounts: String(row.fundedAccounts),
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
): FirmReturnsCardModel {
    return {
        rows: firmReturns(ledger).firms.map((row) =>
            firmReturnRow(row, firms),
        ),
    };
}

function formatMultiple(value: null | number): string {
    return value === null ? NOT_APPLICABLE : `${value.toFixed(2)}x`;
}

function formatRate(estimate: null | SampledEstimate): string {
    return estimate === null
        ? NOT_APPLICABLE
        : `${formatPercent(estimate.value)} (SE ${formatOptionalPercent(estimate.standardError)}, n = ${String(estimate.n)})`;
}

function formatSessions(estimate: null | SampledEstimate): string {
    if (estimate === null) return NOT_APPLICABLE;
    const standardError =
        estimate.standardError === null
            ? NOT_APPLICABLE
            : estimate.standardError.toFixed(1);
    return `${estimate.value.toFixed(1)} sessions (SE ${standardError}, n = ${String(estimate.n)})`;
}

function funnelCard(
    ledger: PortfolioLedger,
    firms: FirmNames,
): FunnelCardModel {
    const funnel = stageFunnel(ledger);
    return {
        rows: funnel.byFirm.map((row) => ({
            firm: firms.of(row.firmKey),
            firstPayout: String(row.firstPayout),
            funded: String(row.funded),
            key: firmKeyId(row.firmKey),
            movedLive: String(row.movedLive),
            passed: String(row.passed),
            purchased: String(row.purchased),
        })),
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
    ];
}

function labelsOf(accounts: readonly LedgerAccount[]): string {
    return accounts.map((entry) => entry.row.label).join(', ');
}

function ledgerCards(
    ledger: PortfolioLedger,
    today: string,
    firms: FirmNames,
    statementTargets: MonthlyStatementTargets,
): OverviewLedgerCards {
    const names = planNames(ledger);
    const statement = monthlyStatement(ledger, today, statementTargets);
    const perSlot = realizedNetPerSlot(ledger, today);
    return {
        capUsage: capUsageCard(planCapUsage(ledger), names),
        cost: costCard(ledger, names, firms),
        diversification: diversificationCard(ledger, firms),
        firmReturns: firmReturnsCard(ledger, firms),
        funnel: funnelCard(ledger, firms),
        kpis: kpiRow(ledger, today, perSlot),
        notices: ledgerNotices(ledger, today),
        outcomes: outcomesCard(ledger, names),
        repeatability: repeatabilityCard(
            statement,
            perSlot,
            statementTargets.monthlyPayoutTargetCents,
        ),
        replacement: replacementCard(ledger, names),
        statement: statementCard(
            statement,
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
    return accounts === undefined ||
        events === undefined ||
        fees === undefined ||
        payouts === undefined
        ? loadGap(queries, LEDGER_SOURCES)
        : {
              rows: { accounts, events, fees, payouts },
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

function optionalCents(value: null | UsdCents): string {
    return value === null ? NOT_APPLICABLE : formatUsdCents(value);
}

function outcomesCard(
    ledger: PortfolioLedger,
    names: PlanNames,
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
            fundedSurvival: formatRate(row.fundedSurvival),
            key: row.planSerial,
            openFunded: String(row.openFundedAccounts),
            passRate: row.instantFunded
                ? 'Instant funded'
                : formatRate(row.passRate),
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
): OverviewLedger {
    const computed = ledgerOrDateFailure(() =>
        ledgerCards(
            PortfolioLedger.fromRows(userId, rows),
            today,
            firms,
            statementTargets,
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

const PER_SLOT_TARGET_CAVEAT =
    'More than one funded slot overlapped in some months, so the per-slot share against the portfolio-wide target may read too low.';

function repeatabilityCard(
    statement: MonthlyStatement,
    slots: RealizedNetPerSlot,
    target: null | number,
): RepeatabilityCardModel {
    const stats = repeatability(statement, slots, target);
    const hasOverlappingSlots = slots.months.some(
        (month) => month.slotMonths > 1,
    );
    return {
        overall: repeatabilityStatsRow(stats.overall),
        perSlot: repeatabilityStatsRow(stats.perSlot),
        perSlotTargetCaveat:
            target === null || !hasOverlappingSlots
                ? null
                : PER_SLOT_TARGET_CAVEAT,
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
    statement: MonthlyStatement,
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
