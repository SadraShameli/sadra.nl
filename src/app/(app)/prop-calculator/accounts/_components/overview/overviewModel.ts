import { z } from 'zod';

import type {
    PropAccountRow,
    PropAccountSnapshotRow,
} from '~/server/db/schemas/prop';

import {
    payoutBlockReasonText,
    payoutWaitText,
} from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    type AccountFromStateFigures,
    type DocumentedRunFigures,
    overviewDocumentedRequestOf,
    overviewPlanOptInsOf,
    overviewPlanValueRequestsFor,
    type OverviewProjectionPlanInput,
    overviewProjectionRequestsFor,
    type OverviewRequest,
    OverviewRequestGroup,
    overviewRequestKey,
    OverviewRequestKind,
    overviewRequestsFor,
    type PayoutSizeOptimumFigures,
    type PlanValuesFigures,
    type PortfolioProjectionFigures,
    withPreviousAccount,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { alertSubjectView } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    accountStateUnavailableText,
    exposureUnavailableText,
} from '~/app/(app)/prop-calculator/accounts/_components/accountStateReasonText';
import {
    accountFromStateRequestOf,
    readinessBoardInputsOf,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import { firmsModelOf } from '~/app/(app)/prop-calculator/accounts/firms/firmsModel';
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
    type AccountExposure,
    AccountReadIssueKind,
    AccountStage,
    accountStageLabel,
    type AccountStateAccountRow,
    type AccountStateEntry,
    AccountStateKind,
    type AccountStateSnapshotRow,
    accountStatesOf,
    ADHERENCE_STEP_REASON,
    type AlertAccountRow,
    type AlertContext,
    type AlertCopyGroupRow,
    type AlertDecisionRow,
    AlertDisclosure,
    AlertEvaluator,
    type AlertEventRow,
    type AlertInputs,
    AlertKind,
    alertKindLabel,
    type AlertPayoutRow,
    type AlertRoundRow,
    type AlertSeverity,
    type AlertSnapshotRow,
    AlertSubjectKind,
    type AttemptThroughput,
    attemptThroughput,
    AVERAGE_DAYS_PER_MONTH,
    bustSplitByFirm,
    type CohortMultiple,
    compareText,
    type CopyGroupExposure,
    type CostAnalytics,
    costAnalytics,
    createAlertContext,
    type CushionBoardRow as CushionBoardEntry,
    cushionBoardOf,
    type CushionRatio,
    CushionRatioBasis,
    dayLossBasisNotes,
    dayLossBreakdownText,
    dayLossShareOfContext,
    decisionAdherenceOf,
    DEFAULT_ALERT_RULES,
    DEFAULT_PAYOUT_HISTOGRAM_BUCKET_CENTS,
    diversification,
    type Exposure,
    ExposureBasis,
    type ExposureEntry,
    exposureOf,
    type ExternalFirmName,
    FeeKind,
    feeReconciliation,
    type FirmConcentration,
    type FirmDiscountCapture,
    type FirmFunnel,
    type FirmKey,
    firmKeyId,
    FirmKeyKind,
    firmKeyLabel,
    firmKeyOf,
    type FirmPayoutCount,
    firmPayoutCountOrNull,
    firmPayoutCounts,
    type FirmProfitConcentration,
    firmProfitConcentrationOfContext,
    firmReconciliation,
    type FirmReconciliationEntry,
    type FirmReturn,
    firmReturns,
    type FirmShare,
    type FirmVerificationDate,
    formatUsdCents,
    fundedPayoutDistribution,
    FundedRiskBasis,
    fundingTotals,
    funnelDiagnostic,
    FunnelDiagnosticReason,
    FunnelStage,
    type FunnelStageDiagnosis,
    type FunnelStageFigures,
    heldPlanGroupsOf,
    isActiveAccount,
    isEndedStatus,
    isModeledAccount,
    IsoDateError,
    joinWithAnd,
    latestTwoSnapshots,
    type LedgerAccount,
    type LedgerAccountRow,
    type LedgerEventRow,
    type LedgerFeeRow,
    type LedgerFirmStatementRow,
    type LedgerPayoutRow,
    type LedgerRoundRow,
    ledgerTimeline,
    type LedgerTransferRow,
    LiveProximityCountStatus,
    LiveProximityStatus,
    liveTransitionProximity,
    MARGIN_ABOVE_BREAKEVEN_HELP_TEXT,
    measuredRebuyLagOfDefault,
    type ModeledFundedCost,
    type MonthlyCash,
    monthlyCash,
    type MonthlyStatement,
    monthlyStatement,
    type MonthlyStatementTargets,
    NO_ACCOUNT_STATES,
    NO_FIRM_PAYOUT_COUNTS,
    paidPayoutCash,
    PAYOUT_COUNT_CAP,
    payoutMultiple,
    type PayoutReadinessBoard,
    payoutReadinessBoardOf,
    PayoutReadinessNotApplicableKind,
    PayoutReadinessRowKind,
    type PayoutsByAccountSize,
    type PayoutsByFirm,
    type PayoutsByStage,
    type PayoutSizeSnapshotBalance,
    type PayoutSizeStats,
    payoutSizeStats,
    type PayoutSizeStatsOptions,
    PayoutStatus,
    payoutTiming,
    PendingFeeAttribution,
    type PlanAttemptEconomics,
    planCapUsage,
    type PlanCapUsage,
    type PlanGroup,
    type PooledCapPlanRow,
    pooledCapUsage,
    pooledEndedCohortMultiple,
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
    type RuleViolationKind,
    sampleAdequacy,
    type SampledEstimate,
    SampleKind,
    SampleLevel,
    type SetupChecklist,
    setupChecklistOf,
    type SetupMissingItem,
    SetupMissingKind,
    SetupStep,
    type SetupStepResult,
    SetupStepStatus,
    type SingleDayTriggerFact,
    snapshotInputFrom,
    spendAndPayouts,
    stageFunnel,
    StaleSnapshotRule,
    summarizeCash,
    type TimelineEntry,
    TimelineEntryKind,
    trackedAccountOf,
    type UsdCents,
    usdCents,
    usdCentsFromDollars,
    type ViolationSource,
} from '~/lib/prop-accounts';
import {
    bankrollOf,
    type RealizedLossRisk,
    realizedLossRisk,
    roundBudgetStatus,
    SCALE_GATE_STATUS_TEXT,
    scaleAtMeasuredMultiple,
    type ScaleAtMultiple,
    ScaleAtMultipleKind,
    ScaleAtMultipleReason,
    ScaleBudgetBasis,
    ScaleCappedBy,
    type ScaleGateStatus,
} from '~/lib/prop-accounts/bankroll';
import {
    type NetCashBucket,
    tiltVarianceSplitOf,
    type ViolationStats,
    violationStatsOf,
} from '~/lib/prop-accounts/conduct';
import {
    CENTS_PER_DOLLAR,
    CumulativeAmountTrigger,
    dollars,
    findFirm,
    type FirmId,
    fraction,
    type LiveTransitionTrigger,
    LiveTriggerKind,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    PayoutRequestPolicy,
    type PolicyQuote,
    PolicyVerification,
    ROI_BASIS_LABEL,
    serializePlanId,
    TRADING_DAYS_PER_MONTH,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    applicableTimelineGaps,
    type BankrollParameters,
    DEFAULT_RULEBOOK,
    DOCUMENTED_POLICY_TIMELINE_GAP_TEXT,
    DOCUMENTED_POLICY_TIMELINE_GAPS,
    type EnginePolicy,
    labelledAssumptionLines,
    LifetimePayoutCapBasis,
    LiveTriggerCoverage,
    payoutPolicySensitivity,
    type PayoutPolicySensitivityPlanEntry,
    type PayoutPolicySensitivityRankedEntry,
    ReconstructedLiveKind,
    type RulebookParameters,
    type SampleThresholds,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    conversionEvPerAttempt,
    ECONOMICS_REASON_TEXT,
    EconomicsReason,
    fundedProgressValue,
} from '~/lib/prop-calculator/economics';
import { type PortfolioTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';
import {
    type HistogramBin,
    isBeyondNoise,
    NoiseVerdict,
    percentile,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';
import {
    type eventListSchema,
    type ledgerListSchema,
    MAX_EVENT_LIST_YEARS,
} from '~/lib/schemas/propAccounts';
import { routes } from '~/lib/site/routes';

import {
    type AccountFromStateView,
    accountFromStateViewOf,
    evalValueLossDollarsOf,
    previousAccountOf,
} from './accountFromStateModel';
import {
    type EngineSlot,
    EngineSlotKind,
    engineSlotOf,
    groupFailureOf,
    type SlotEngine,
    uniformSlotEngine,
} from './engineSlot';
import {
    type PayoutTimingCardModel,
    payoutTimingCardOf,
} from './payoutTimingModel';
import {
    estimateCurrency,
    estimatePercent,
    formatTrials,
} from './uncertainText';

export enum BankrollLossRiskKind {
    Ready = 'ready',
    Unavailable = 'unavailable',
}

export enum ExpectedNetStatus {
    Failed = 'failed',
    NoPlans = 'no-plans',
    Pending = 'pending',
    Ready = 'ready',
}

export enum KpiTone {
    Negative = 'negative',
    Neutral = 'neutral',
    Pending = 'pending',
    Positive = 'positive',
}

export enum OverviewKpiKind {
    AveragePayout = 'average-payout',
    ExpectedNet = 'expected-net',
    FollowedRecommendations = 'followed-recommendations',
    Net = 'net',
    PayoutMultiple = 'payout-multiple',
    PayoutsReceived = 'payouts-received',
    RealizedNetPerSlot = 'realized-net-per-slot',
    Roi = 'roi',
    Spend = 'spend',
    TotalFunding = 'total-funding',
    WorstDay = 'worst-day',
}

export enum OverviewNoticeKind {
    CorruptTags = 'corrupt-tags',
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

export enum PayoutBalanceBandKey {
    AboveCushion = 'above-cushion',
    LowBalance = 'low-balance',
    NoSnapshot = 'no-snapshot',
}

export enum PooledCapScope {
    CapScopeUnverified = 'Cap scope unverified',
    PerPlan = 'Per plan',
    SharedPool = 'Shared pool',
}

export enum PortfolioSource {
    Accounts = 'accounts',
    CopyGroups = 'copyGroups',
    Decisions = 'decisions',
    Events = 'events',
    Fees = 'fees',
    FirmStatements = 'firmStatements',
    Payouts = 'payouts',
    Rounds = 'rounds',
    Rulebook = 'rulebook',
    Snapshots = 'snapshots',
    Transfers = 'transfers',
    Violations = 'violations',
}

enum FunnelCohortStage {
    FirstPayout = 'firstPayout',
    Funded = 'funded',
    MovedLive = 'movedLive',
    Passed = 'passed',
    Purchased = 'purchased',
}

export interface AttemptEconomicsCardModel {
    readonly disclosures: readonly string[];
    readonly horizonDays: number;
    readonly rows: readonly AttemptEconomicsRow[];
}

export interface AttemptThroughputCardModel {
    readonly countingNote: string;
    readonly meanPerActiveFirmPerMonth: null | string;
    readonly meanPerMonth: string;
    readonly months: readonly AttemptThroughputMonthRow[];
    readonly perFirm: readonly FirmAttemptThroughputRow[];
}

export interface BankrollCardModel {
    readonly available: string;
    readonly deposits: string;
    readonly grownFromText: null | string;
    readonly lossRisk: BankrollLossRiskModel;
    readonly moneyWeightedReturn: string;
    readonly reinvestedPayouts: string;
    readonly scale: ScaleAtMultipleModel;
    readonly scaleInputs: BankrollScaleInputs;
    readonly undatedPaidPayoutsCaveat: null | string;
    readonly withdrawals: string;
}

export type BankrollLossRiskModel =
    | {
          readonly attemptPays: string;
          readonly attemptsAtBankroll: string;
          readonly batchLoss: string;
          readonly kind: BankrollLossRiskKind.Ready;
          readonly minimumBudget: string;
          readonly minimumBudgetNote: null | string;
          readonly noPayout: string;
          readonly sampleNote: string;
      }
    | {
          readonly kind: BankrollLossRiskKind.Unavailable;
          readonly reason: string;
      };

export interface BankrollScaleInputs {
    readonly capacityFillCents: null | number;
    readonly cohortMultiple: CohortMultiple | null;
    readonly planLimitCents: null | number;
    readonly sampleThresholds: SampleThresholds;
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
    readonly discountsNote: null | string;
    readonly perPlan: readonly PlanCostRow[];
}

export interface CushionBoardCardModel {
    readonly disclosure: string;
    readonly rows: readonly CushionBoardRow[];
    readonly unavailable: readonly UnavailableAccountRow[];
}

export interface DiversificationCardModel {
    readonly funding: readonly FirmShareRow[];
    readonly payouts: readonly FirmShareRow[];
}

export interface EvSourcesCardModel {
    readonly accounts: readonly EvSourceAccountRow[];
    readonly disclosures: readonly string[];
    readonly heldLabel: string;
    readonly liveTransferNotes: readonly string[];
    readonly plans: readonly EvSourcePlanRow[];
}

export interface ExpectedNetCardModel {
    readonly disclosures: readonly string[];
    readonly refused: readonly ExpectedNetRefusal[];
    readonly rows: readonly ExpectedNetRow[];
    readonly status: ExpectedNetStatus;
    readonly statusNote: null | string;
}

export interface ExposureAccountRow {
    readonly account: string;
    readonly basis: string;
    readonly cushion: string;
    readonly firstTradeRisk: string;
    readonly key: string;
    readonly maxDailyLoss: string;
    readonly shareOfCushionAtRisk: string;
}

export interface ExposureCardModel {
    readonly accounts: readonly ExposureAccountRow[];
    readonly disclosures: readonly string[];
    readonly groups: readonly ExposureGroupRow[];
    readonly unavailable: readonly UnavailableAccountRow[];
}

export interface ExposureGroupRow {
    readonly accounts: string;
    readonly group: string;
    readonly key: string;
    readonly maxDailyLoss: string;
    readonly note: string;
    readonly shareOfCushionAtRisk: string;
    readonly totalCushion: string;
}

export interface FirmReturnsCardModel {
    readonly rows: readonly FirmReturnRow[];
}

export interface FirmShareRow extends FirmAmountRow {
    readonly share: string;
}

export interface FirmsTileModel {
    readonly activeFirms: number;
    readonly firmsUsed: number;
    readonly scaleGateLabel: string;
    readonly scaleGateStatus: ScaleGateStatus;
    readonly sentLive: number;
    readonly unmetConditions: number;
}

export interface FundedPayoutsCardModel {
    readonly disclosures: readonly string[];
    readonly horizonDays: number;
    readonly payoutCountCap: number;
    readonly rows: readonly FundedPayoutsRow[];
}

export interface FunnelCardModel {
    readonly biggestWeakness: string;
    readonly diagnosticIssues: readonly FunnelWeaknessRow[];
    readonly disclosures: readonly string[];
    readonly rows: readonly FunnelRow[];
    readonly stageDollars: readonly FunnelStageDollarsRow[];
    readonly unresolvedNote: null | string;
    readonly untestedWeaknesses: readonly FunnelWeaknessRow[];
    readonly weaknesses: readonly FunnelWeaknessRow[];
}

export interface HubPortfolio {
    readonly alertCount: number;
    readonly setup: null | SetupChecklistCardModel;
}

export interface HubPortfolioInputs {
    readonly accounts: readonly OverviewAccountRow[];
    readonly copyGroups: readonly AlertCopyGroupRow[];
    readonly decisions: readonly OverviewDecisionRow[];
    readonly events: readonly LedgerEventRow[] | undefined;
    readonly fees: readonly LedgerFeeRow[];
    readonly firmStatements?: readonly LedgerFirmStatementRow[];
    readonly payouts: readonly OverviewPayoutRow[];
    readonly rounds?: readonly LedgerRoundRow[];
    readonly rulebook: RulebookParameters;
    readonly snapshots: readonly OverviewSnapshotRow[];
    readonly today: string;
    readonly transfers: readonly LedgerTransferRow[];
    readonly userId: string;
}

export interface LiveProximityCardModel {
    readonly accounts: readonly LiveProximityAccountRow[];
    readonly disclosure: string;
    readonly firms: readonly LiveProximityFirmRow[];
    readonly openFundedAccounts: number;
    readonly singleDayFacts: readonly SingleDayFactRow[];
    readonly unlistedNote: null | string;
    readonly unmeasuredNote: null | string;
}

export interface NextPayoutCardModel {
    readonly disclosures: readonly string[];
    readonly rows: readonly NextPayoutCardRow[];
    readonly statusNote: null | string;
}

export interface NextPayoutCardRow {
    readonly accountId: string;
    readonly label: string;
    readonly plan: string;
    readonly view: AccountFromStateView;
}

export interface OutcomesCardModel {
    readonly disclosures: readonly string[];
    readonly rows: readonly OutcomesRow[];
}

export type OverviewAccountRow = AlertAccountRow &
    LedgerAccountRow &
    Pick<
        PropAccountRow,
        'dashboardConvention' | 'firstFundedTradeOn' | 'liveStartBalanceCents'
    > & {
        readonly hasCorruptTags?: boolean;
        readonly personalRules?: null | PropAccountRow['personalRules'];
    };

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

export type OverviewBoards =
    | OverviewSectionGap
    | {
          readonly cushion: CushionBoardCardModel;
          readonly kind: OverviewSectionStatus.Ready;
          readonly readiness: ReadinessBoardCardModel;
      };

export type OverviewConcentration =
    | OverviewSectionGap
    | {
          readonly kind: OverviewSectionStatus.Ready;
          readonly model: ProfitConcentrationCardModel;
      };

export type OverviewDecisionRow = AlertDecisionRow;

export type OverviewEngine = SlotEngine;

export type OverviewEvSources =
    | OverviewSectionGap
    | {
          readonly kind: OverviewSectionStatus.Ready;
          readonly model: EvSourcesCardModel;
      };

export type OverviewExposure =
    | OverviewSectionGap
    | {
          readonly kind: OverviewSectionStatus.Ready;
          readonly model: ExposureCardModel;
      };

export interface OverviewInputs {
    readonly engine?: OverviewEngine;
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
    readonly bankroll: BankrollCardModel;
    readonly capUsage: CapUsageCardModel;
    readonly cost: CostCardModel;
    readonly diversification: DiversificationCardModel;
    readonly expectedNet: ExpectedNetCardModel;
    readonly firmReturns: FirmReturnsCardModel;
    readonly fundedPayouts: FundedPayoutsCardModel;
    readonly funnel: FunnelCardModel;
    readonly kpis: readonly OverviewKpi[];
    readonly liveProximity: LiveProximityCardModel;
    readonly notices: readonly OverviewNotice[];
    readonly outcomes: OutcomesCardModel;
    readonly payoutSizes: PayoutSizesCardModel;
    readonly payoutTiming: PayoutTimingCardModel;
    readonly pooledCaps: PooledCapCardModel;
    readonly repeatability: RepeatabilityCardModel;
    readonly replacement: ReplacementCardModel;
    readonly statement: StatementCardModel;
    readonly tiltVariance: TiltVarianceCardModel;
    readonly timeline: TimelineCardModel;
}

export interface OverviewModel {
    readonly alerts: OverviewAlerts;
    readonly boards: OverviewBoards;
    readonly concentration: OverviewConcentration;
    readonly evSources: OverviewEvSources;
    readonly exposure: OverviewExposure;
    readonly hasAccounts: boolean;
    readonly ledger: OverviewLedger;
    readonly nextPayout: OverviewNextPayout;
    readonly projection: OverviewProjection;
    readonly setup: OverviewSetup;
    readonly violations: OverviewViolations;
}

export type OverviewNextPayout =
    | OverviewSectionGap
    | {
          readonly kind: OverviewSectionStatus.Ready;
          readonly model: NextPayoutCardModel;
      };

export interface OverviewNotice {
    readonly kind: OverviewNoticeKind;
    readonly message: string;
}

export type OverviewPayoutRow = AlertPayoutRow & LedgerPayoutRow;

export type OverviewProjection =
    | OverviewSectionGap
    | {
          readonly kind: OverviewSectionStatus.Ready;
          readonly model: ProjectionCardModel;
      };

export type OverviewSetup =
    | OverviewSectionGap
    | {
          readonly kind: OverviewSectionStatus.Ready;
          readonly model: SetupChecklistCardModel;
      };

export type OverviewSnapshotRow = AlertSnapshotRow &
    Pick<
        PropAccountSnapshotRow,
        | 'balanceAtLastPayoutCents'
        | 'balanceCents'
        | 'cycleBestDayProfitCents'
        | 'dashboardFloorCents'
        | 'evalBestDayProfitCents'
        | 'floorAtLastPayoutCents'
        | 'highestEodBalanceCents'
        | 'highestIntradayBalanceCents'
        | 'lastPayoutOn'
        | 'qualifyingDaysSinceLastPayout'
        | 'userId'
    >;

export interface OverviewViolationRow {
    readonly accountId: string;
    readonly costCents: null | UsdCents;
    readonly kind: RuleViolationKind;
    readonly occurredOn: string;
    readonly source: ViolationSource;
}

export type OverviewViolations =
    | OverviewSectionGap
    | {
          readonly kind: OverviewSectionStatus.Ready;
          readonly model: ViolationsCardModel;
      };

export interface PayoutSizesCardModel {
    readonly bucketWidth: string;
    readonly byAccountSize: readonly PayoutSizeGroupRow[];
    readonly byBalance: readonly PayoutSizeBalanceRow[];
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

export interface PooledCapCardModel {
    readonly countingNote: string;
    readonly disclosure: string;
    readonly householdNote: null | string;
    readonly rows: readonly PooledCapRow[];
    readonly unverifiedFirms: readonly string[];
}

export interface PortfolioLoad {
    readonly accounts: SectionLoad<readonly OverviewAccountRow[]>;
    readonly alerts: SectionLoad<AlertRows>;
    readonly bankrollParameters: BankrollParameters;
    readonly checks: SectionLoad<PortfolioCheckRows>;
    readonly decisions: SectionLoad<readonly OverviewDecisionRow[]>;
    readonly failures: readonly PortfolioLoadIssue[];
    readonly ledger: SectionLoad<LedgerRows>;
    readonly retainedCushionCents: null | UsdCents;
    readonly rulebook: null | RulebookParameters;
    readonly sampleThresholds: SampleThresholds;
    readonly stale: readonly PortfolioLoadIssue[];
    readonly statementTargets: MonthlyStatementTargets;
    readonly violations: SectionLoad<readonly OverviewViolationRow[]>;
}

export interface PortfolioLoadIssue {
    readonly message: string;
    readonly source: PortfolioSource;
    readonly title: string;
}

export type PortfolioQueries = {
    readonly [Source in CheckPortfolioSource]?: PortfolioQuery<
        PortfolioRows[Source]
    >;
} & {
    readonly [Source in RequiredPortfolioSource]: PortfolioQuery<
        PortfolioRows[Source]
    >;
};

export interface PortfolioRows {
    readonly [PortfolioSource.Accounts]: readonly OverviewAccountRow[];
    readonly [PortfolioSource.CopyGroups]: readonly AlertCopyGroupRow[];
    readonly [PortfolioSource.Decisions]: readonly OverviewDecisionRow[];
    readonly [PortfolioSource.Events]: readonly LedgerEventRow[];
    readonly [PortfolioSource.Fees]: readonly LedgerFeeRow[];
    readonly [PortfolioSource.FirmStatements]: readonly LedgerFirmStatementRow[];
    readonly [PortfolioSource.Payouts]: readonly OverviewPayoutRow[];
    readonly [PortfolioSource.Rounds]: readonly LedgerRoundRow[];
    readonly [PortfolioSource.Rulebook]: RulebookParameters;
    readonly [PortfolioSource.Snapshots]: readonly OverviewSnapshotRow[];
    readonly [PortfolioSource.Transfers]: readonly LedgerTransferRow[];
    readonly [PortfolioSource.Violations]: readonly OverviewViolationRow[];
}

export interface ProfitConcentrationCardModel {
    readonly caveats: readonly string[];
    readonly disclosures: readonly string[];
    readonly rows: readonly ProfitConcentrationRow[];
    readonly thresholdNote: string;
}

export interface ProjectionCardModel {
    readonly disclosures: readonly string[];
    readonly refused: readonly ProjectionRefusal[];
    readonly rows: readonly ProjectionRow[];
    readonly status: ExpectedNetStatus;
    readonly statusNote: null | string;
}

export interface ProjectionFinalNet {
    readonly p10: string;
    readonly p50: string;
    readonly p90: string;
}

export interface ProjectionLabels {
    readonly creditBasis: string;
    readonly horizon: string;
    readonly lifetimeCapBasis: string;
    readonly payoutPolicy: string;
    readonly retainedCushion: string;
    readonly startBasis: string;
    readonly tradesPerDay: string;
    readonly trials: string;
}

export interface ProjectionRefusal {
    readonly key: string;
    readonly plan: string;
    readonly reason: string;
}

export interface ProjectionRow {
    readonly accounts: string;
    readonly breakEvenMonth: string;
    readonly finalNet: ProjectionFinalNet;
    readonly finalPayoutMedian: string;
    readonly finalSpendMedian: string;
    readonly key: string;
    readonly labels: ProjectionLabels;
    readonly notHonoured: readonly string[];
    readonly plan: string;
    readonly probabilityEverPositive: string;
    readonly probabilityFinalNetNegative: string;
    readonly result: null | PortfolioTimelineResult;
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

export interface ReadinessBoardCardModel {
    readonly disclosure: string;
    readonly notFundedCount: number;
    readonly rows: readonly ReadinessRow[];
    readonly unavailable: readonly UnavailableAccountRow[];
}

export interface RepeatabilityCardModel {
    readonly basisNote: string;
    readonly overall: null | RepeatabilityStatsRow;
    readonly perSlot: null | RepeatabilityStatsRow;
    readonly perSlotTargetNote: null | string;
}

export interface ReplacementCardModel {
    readonly rows: readonly ReplacementRow[];
}

export type ScaleAtMultipleModel =
    | {
          readonly budget: string;
          readonly budgetLabel: string;
          readonly cappedNote: null | string;
          readonly intervalLower: string;
          readonly intervalUpper: string;
          readonly kind: ScaleAtMultipleKind.Available;
          readonly multiple: string;
          readonly n: number;
          readonly projected: string;
          readonly projectionLabel: string;
          readonly sampleLevel: null | SampleLevel;
      }
    | {
          readonly kind: ScaleAtMultipleKind.Unavailable;
          readonly reason: string;
      };

export interface SetupChecklistCardModel {
    readonly doneCount: number;
    readonly isComplete: boolean;
    readonly steps: readonly SetupStepRow[];
    readonly totalSteps: number;
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

export interface TiltVarianceCardModel {
    readonly disclosure: string;
    readonly droppedNote: null | string;
    readonly rows: readonly TiltVarianceCardRow[];
}

export interface TimelineCardModel {
    readonly entries: readonly TimelineRow[];
    readonly hiddenEntries: number;
}

export interface ViolationsCardModel {
    readonly byKind: readonly ViolationKindRow[];
    readonly detectedCount: number;
    readonly disclosures: readonly string[];
    readonly manualCount: number;
    readonly netCost: string;
    readonly netCostShareOfNetCash: null | string;
}

interface AttemptEconomicsRow {
    readonly attemptCost: string;
    readonly attempts: string;
    readonly averagePayout: string;
    readonly breakevenPassRate: string;
    readonly formula: string;
    readonly fundedValue: string;
    readonly fundedValueToAttemptCost: string;
    readonly key: string;
    readonly marginAboveBreakeven: string;
    readonly modeledEvPerAttempt: string;
    readonly modeledFundedValue: string;
    readonly modeledPassRate: string;
    readonly modeledPayoutRate: string;
    readonly modeledPayoutsPerPaidFunded: string;
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

type CheckPortfolioSource =
    PortfolioSource.FirmStatements | PortfolioSource.Rounds;

interface CushionBoardRow {
    readonly account: string;
    readonly asOf: string;
    readonly basis: string;
    readonly cushion: string;
    readonly floor: string;
    readonly key: string;
    readonly rank: string;
    readonly ratio: string;
}

interface EvSourceAccountRow {
    readonly account: string;
    readonly freshFundedValue: string;
    readonly heldInFundedProgress: string;
    readonly key: string;
    readonly plan: string;
    readonly valueNow: string;
}

interface EvSourcePlanRow {
    readonly attemptCost: string;
    readonly freshFundedValue: string;
    readonly key: string;
    readonly modeledConversionEv: string;
    readonly passRate: string;
    readonly plan: string;
    readonly realizedConversionEv: string;
}

interface ExpectedNetFigure {
    readonly creditFree: string;
    readonly creditInclusive: string;
    readonly requestSize: string;
    readonly totalCreditFree: string;
}

interface ExpectedNetLabels {
    readonly creditBasis: string;
    readonly lifetimeCapBasis: string;
    readonly payoutPolicy: string;
    readonly retainedCushion: string;
    readonly startBasis: string;
    readonly trials: string;
}

interface ExpectedNetRefusal {
    readonly key: string;
    readonly plan: string;
    readonly reason: string;
    readonly run: string;
}

interface ExpectedNetRow {
    readonly activeSlots: string;
    readonly documented: ExpectedNetFigure;
    readonly key: string;
    readonly labels: ExpectedNetLabels;
    readonly liveTransferNotes: readonly string[];
    readonly optimum: ExpectedNetFigure;
    readonly plan: string;
    readonly policySensitiveNote: null | string;
    readonly rankDocumented: string;
    readonly rankOptimum: string;
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
    readonly impliedAttempts: string;
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
    readonly coverageNote: null | string;
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
    readonly fundedValueFlag: null | string;
    readonly key: string;
    readonly modeledCounts: null | readonly string[];
    readonly modeledFundedValue: string;
    readonly modeledProbabilities: null | readonly number[];
    readonly openAccounts: string;
    readonly plan: string;
    readonly realizedFundedValue: string;
    readonly realizedProbabilities: readonly number[];
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
    readonly structuralBusts: string;
    readonly unknownBusts: string;
    readonly withinPlanBusts: string;
}

interface FunnelStageDollarsRow {
    readonly fees: string;
    readonly firm: string;
    readonly key: string;
    readonly net: string;
    readonly netPayouts: string;
    readonly stage: string;
}

interface FunnelWeaknessAnalysis {
    readonly issues: readonly FunnelWeaknessRow[];
    readonly rows: readonly FunnelWeaknessRow[];
    readonly untested: readonly UntestedFunnelGap[];
    readonly untestedRows: readonly FunnelWeaknessRow[];
}

interface FunnelWeaknessRow {
    readonly key: string;
    readonly plan: string;
    readonly text: string;
}

interface LiveProximityAccountRow {
    readonly account: string;
    readonly key: string;
    readonly paidPayouts: string;
    readonly plan: string;
    readonly remaining: string;
    readonly requestedPayouts: string;
    readonly sourceText: string;
    readonly trigger: string;
}

interface LiveProximityFirmRow {
    readonly firm: string;
    readonly isVerified: boolean;
    readonly key: string;
    readonly paidSinceLastLive: string;
    readonly remaining: string;
    readonly requestedSinceLastLive: string;
    readonly since: string;
    readonly sourceText: string;
    readonly trigger: string;
}

interface OutcomesRow {
    readonly fundedSurvival: string;
    readonly fundedSurvivalCounts: string;
    readonly key: string;
    readonly modeledFundedSurvival: string;
    readonly modeledPassRate: string;
    readonly openFunded: string;
    readonly passRate: string;
    readonly passRateCounts: string;
    readonly plan: string;
    readonly sessionsToFunded: string;
}

interface PayoutSizeBalanceRow {
    readonly count: string;
    readonly key: PayoutBalanceBandKey;
    readonly label: string;
    readonly mean: string;
    readonly median: string;
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
    readonly attempts: string;
    readonly attemptsSampleLevel: null | SampleLevel;
    readonly costPerAttempt: string;
    readonly costPerFunded: string;
    readonly fundedAccounts: string;
    readonly fundedSampleLevel: null | SampleLevel;
    readonly impliedAttempts: string;
    readonly key: string;
    readonly modeled: string;
    readonly pendingEvalAccounts: string;
    readonly pendingSpend: string;
    readonly plan: string;
    readonly realizedMinusModeled: string;
}

interface PlanFunnelFinding {
    readonly dollarChangePerMonth: number;
    readonly issue: FunnelWeaknessRow | null;
    readonly row: FunnelWeaknessRow | null;
    readonly untested: null | UntestedFunnelGap;
    readonly untestedRows: readonly FunnelWeaknessRow[];
}

interface PooledCapRow {
    readonly cap: string;
    readonly freeSlots: string;
    readonly key: string;
    readonly note: null | string;
    readonly plan: string;
    readonly poolFreeSlots: string;
    readonly scope: PooledCapScope;
    readonly used: string;
}

interface PortfolioCheckRows {
    readonly firmStatements: readonly LedgerFirmStatementRow[];
    readonly rounds: readonly LedgerRoundRow[];
}

interface PortfolioQuery<Data> {
    readonly data: Data | undefined;
    readonly error: unknown;
}

interface ProfitConcentrationRow {
    readonly firm: string;
    readonly fundedAccounts: string;
    readonly inProfit: string;
    readonly key: string;
    readonly recentPayouts: string;
    readonly sinceMovedLive: string;
    readonly withdrawable: string;
    readonly withdrawableShare: string;
}

interface ReadinessRow {
    readonly account: string;
    readonly asOf: string;
    readonly key: string;
    readonly netAfterSplit: string;
    readonly note: null | string;
    readonly requested: string;
    readonly status: string;
    readonly unlock: string;
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

type RequiredPortfolioSource = Exclude<PortfolioSource, CheckPortfolioSource>;

interface SetupItemRow {
    readonly href: string;
    readonly key: string;
    readonly label: string;
}

interface SetupStepRow {
    readonly detail: null | string;
    readonly href: string;
    readonly items: readonly SetupItemRow[];
    readonly key: SetupStep;
    readonly label: string;
    readonly status: SetupStepStatus;
    readonly statusLabel: string;
}

interface SingleDayFactRow {
    readonly fetchedOn: string;
    readonly firm: string;
    readonly key: string;
    readonly plan: string;
    readonly quote: string;
    readonly source: string;
    readonly text: string;
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

interface TiltVarianceCardRow {
    readonly firm: string;
    readonly key: string;
    readonly month: string;
    readonly netCash: string;
    readonly netWithoutViolations: string;
    readonly violationCost: string;
}

interface TimelineRow {
    readonly account: string;
    readonly amount: null | string;
    readonly description: string;
    readonly key: string;
    readonly on: string;
}

interface UnavailableAccountRow {
    readonly account: string;
    readonly key: string;
    readonly reason: string;
}

interface UntestedFunnelGap {
    readonly key: string;
    readonly plan: string;
    readonly stage: string;
}

interface ViolationKindRow {
    readonly cost: string;
    readonly count: number;
    readonly key: string;
    readonly kind: RuleViolationKind;
}

export const NO_OVERVIEW_ENGINE: OverviewEngine = uniformSlotEngine(null);

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
    [AlertDisclosure.LiveTriggersNotChecked]:
        'The live trigger count since the last live account is not checked here.',
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
    [PortfolioSource.Decisions]: 'sizing decisions',
    [PortfolioSource.Events]: 'account events',
    [PortfolioSource.Fees]: 'fees',
    [PortfolioSource.FirmStatements]: 'firm statements',
    [PortfolioSource.Payouts]: 'payouts',
    [PortfolioSource.Rounds]: 'rounds',
    [PortfolioSource.Rulebook]: 'rulebook',
    [PortfolioSource.Snapshots]: 'latest balances',
    [PortfolioSource.Transfers]: 'bankroll deposits and withdrawals',
    [PortfolioSource.Violations]: 'rule violations',
};

const FUNNEL_COHORT_STAGES: readonly {
    readonly label: string;
    readonly stage: FunnelCohortStage;
}[] = [
    { label: 'Purchased', stage: FunnelCohortStage.Purchased },
    { label: 'Passed', stage: FunnelCohortStage.Passed },
    { label: 'Funded', stage: FunnelCohortStage.Funded },
    { label: 'First payout', stage: FunnelCohortStage.FirstPayout },
    { label: 'Moved live', stage: FunnelCohortStage.MovedLive },
];

const PENDING_FEE_ATTRIBUTION_TEXT: Readonly<
    Record<PendingFeeAttribution, string>
> = {
    [PendingFeeAttribution.PaidOnOrAfterOpenAttemptStart]:
        'Fees paid on or after the start of an eval attempt that is still open are pending: they count toward cost per funded account once that attempt passes or fails.',
};

const PENDING = 'Pending';
const NO_MODELED_COST = 'No modeled cost (the engine passes no attempt)';
const MODELED_COST_PENDING =
    'The modeled cost per funded account is pending the engine cards.';
const MODELED_OUTCOMES_PENDING =
    'The modeled pass rate and survival are pending the engine cards.';
const BUST_SPLIT_DISCLOSURE =
    'Each busted account is diagnosed by the same rule as the account detail page: Structural when its recorded cause is a rule breach, a violation is recorded in the attempt window, or a decision shows risk taken above what was accepted; Within-plan needs at least one sizing decision in that window with risk followed and a Maximum drawdown cause, and a decision with no recorded actual risk counts as risk followed; every other busted account is Unknown.';
const BUST_SPLIT_LOADING_DISCLOSURE =
    'The bust diagnosis split is not shown yet because your rule violations and sizing decisions are still loading; busts are shown as not applicable, not assumed within-plan.';
const TILT_VARIANCE_LOADING_DISCLOSURE =
    'Tilt vs variance is not shown yet because your rule violations are still loading.';
const POOLED_CAPS_DISCLOSURE =
    'Caps are counted per plan. Firm-wide pooled caps are not modeled yet, so a firm can stop you sooner than these free slots suggest.';
const POOLED_CAPS_VERIFIED_CAP_DISCLOSURE =
    'Caps are counted per plan. Firm-wide pools of firms with a verified source are shown in the pooled caps card, which can show fewer free slots than these.';
const POOLED_CAPS_CARD_PARTIAL_DISCLOSURE =
    'Pools are modeled only for firms whose policy a source confirms. A firm listed as cap scope unverified falls back to the per-plan cap, so it can stop you sooner than these free slots suggest.';
const POOLED_CAPS_CARD_VERIFIED_DISCLOSURE =
    "Pools come from each firm's own verified policy; a plan outside any pool is counted per plan.";
const LIVE_TRIGGERS_NOT_CHECKED_NOTE =
    "Live triggers not checked: this firm's rules for moving an account live are not all verified here, or its firm-wide payout count is unknown, so this payout may be one the firm moves live.";

const LIVE_PROXIMITY_DISCLOSURE =
    'Distances to going live come only from a trigger a firm source confirms. A firm whose triggers are unverified or in conflict shows unverified, never a number. Paid payouts are the larger of the ledger paid count and the payouts taken on the latest snapshot, the same count the alerts use, and requested payouts are added, so a payout that is requested but not yet paid already lowers payouts left. A count that cannot be read, such as one with a malformed payout date, shows not checked, never zero. A firm-wide count covers every account you hold at the firm and starts after your latest move live. Accounts held by others in a household are not tracked.';
const POOLED_CAPS_COUNTING_NOTE =
    'Active and suspended funded accounts count toward a cap; accounts that moved live, ended or archived accounts and accounts held by others in a household do not.';
const NO_CONFIRMED_SOURCE_TEXT = 'No confirmed source';
const UNVERIFIED_TEXT = 'Unverified';
const COUNT_NOT_CHECKED_TEXT = 'Not checked';
const ALL_TIME_TEXT = 'all time';
export const DEFAULT_REALIZED_HORIZON_DAYS = 365;
const REALIZED_LOSS_RISK_DRAWS = 2000;
const REALIZED_LOSS_RISK_SEED = 42;
const TO_FIRST_PAYOUT_FALLBACK_DAYS = 30;
const REALIZED_HORIZON_DISCLOSURE = `No engine run is being compared, so this counts a funded account as decided once it has ended or is at least ${String(DEFAULT_REALIZED_HORIZON_DAYS)} calendar days past funding (an approximation of the simulator's default funded horizon of roughly one trading year); a younger funded account that is still open is listed open and left out of the payout counts, the realized funded value, the payouts per paid funded account and the average payout, while the payout rate counts an account that has already been paid as decided at once.`;
const MODELED_PAYOUT_DISTRIBUTION_READY =
    "The modeled payout-count distribution is the engine's share of funded accounts by number of payouts within its funded horizon.";
const MODELED_PAYOUT_DISTRIBUTION_PENDING =
    'The modeled payout-count distribution from the simulator is pending the engine cards.';
const LOW_BALANCE_MONITORING_NOT_WIRED_DISCLOSURE =
    'Low-balance monitoring against the retained cushion is not wired to a stored account balance yet, so no payout is ever flagged here; a clean result is not verified.';
const LOW_BALANCE_APPROXIMATED_DISCLOSURE =
    'Low-balance monitoring compares each payout to the latest snapshot on or before the payout date, not the balance on the day the payout was paid, so a payout made long after its last earlier snapshot can be misclassified.';
const FUNNEL_DIAGNOSTIC_PENDING_TEXT =
    'The biggest-weakness ranking is pending the engine cards: no modeled run is compared against these realized numbers yet.';
const FUNNEL_STAGE_LABEL: Readonly<Record<FunnelStage, string>> = {
    [FunnelStage.AttemptCost]: 'Attempt cost',
    [FunnelStage.AveragePayout]: 'Average payout',
    [FunnelStage.PassRate]: 'Pass rate',
    [FunnelStage.PayoutRate]: 'Payout rate',
    [FunnelStage.PayoutsPerPaidFunded]: 'Payouts per paid funded account',
};
const STATEMENT_MULTIPLE_CAVEAT = 'calendar months mix purchase cohorts';
const MAJORITY_VOTE_RULE =
    'Accounts bought together in one copy group count once: the group counts as a success only when more than half of its accounts succeeded, and a tie counts as a failure.';
const ATTEMPT_COUNTING_NOTE =
    'Attempt throughput counts started attempts; cost per attempt counts decided attempts only, so the two rates do not cover the same attempts.';
const FUNNEL_DIAGNOSTIC_INVALID_TEXT =
    'The funnel diagnostic could not be computed: a modeled or realized figure is outside its valid range, such as a rate above 100 percent or a negative amount.';
const REPEATABILITY_BASIS_NOTE =
    'Mean, standard deviation, worst, best and share positive are net per month. The share at or above target compares payouts per month with your monthly payout target.';
const NO_ATTEMPT_COST_TEXT =
    'No attempt cost is recorded yet, so the realized loss risk cannot be computed.';
const SENTENCE_END = /[.!?]$/u;

const NOT_AVAILABLE = 'Not available';
const ENGINE_COMPUTING_NOTE =
    'The engine is computing these figures off the main thread.';
const NO_ACTIVE_FUNDED_SLOT = 'No active funded slot';
const EXPECTED_NET_PENDING_DETAIL =
    'Modeled monthly net per slot under your documented rule: pending the engine cards';
const CREDIT_BASIS_LABEL =
    'Headline is credit-free (no horizon credit); the credit-inclusive figure is shown beside it and ranks the plans.';
const PROJECTION_START_BASIS_LABEL =
    'Fresh start from a new purchase of every account, not your current balances';
const PROJECTION_CREDIT_BASIS_LABEL =
    'Cash only: no end-of-horizon credit is booked, unlike the expected monthly net.';
const NEXT_PAYOUT_DISCLOSURES: readonly string[] = [
    'Each figure starts from the latest snapshot of the account and runs your documented policy forward from that state. It is not a fresh start, and it is never merged into the fresh-start projection.',
    'Values are expected cash from the state of the account, in dollars, each with the standard error (SE) of the simulation. The credit-free figure is the headline.',
    'No instrument or stop is set, so risk runs as dollars, not whole contracts.',
];
const NEXT_PAYOUT_NO_RULEBOOK_NOTE =
    'Your rulebook has not loaded, so no from-state figure can be computed.';
const NEXT_PAYOUT_NO_ACCOUNTS_NOTE =
    'No active funded or evaluation account has a usable snapshot yet. Record a snapshot to see its value and next payout from its own state.';
const PROJECTION_DISCLOSURES: readonly string[] = [
    'Each plan is simulated as a fresh start from a new purchase of every active account on it, under your documented policy, not from your current balances.',
    'The timeline books no end-of-horizon credit, while the expected monthly net on the Expected net card includes one capped payout request for each surviving account, so the two are different figures and are not comparable.',
    'No instrument or stop is set, so risk runs as dollars, not whole contracts; with a stop the documented funded risk would be placed in whole contracts, possibly below the documented risk or refused.',
    'Accounts on a plan are simulated independently, up to the number of funded accounts the plan allows.',
    'The from-state figures for the accounts you hold are on the Next payout card and are never merged into this fresh-start band.',
];
const EXPECTED_NET_DISCLOSURES: readonly string[] = [
    'Both figures are fresh-start simulations: the documented policy runs your rulebook rule itself, and the payout-size optimum is the best request size on the same seed.',
    'No instrument or stop is set, so risk is not rounded to whole contracts or capped by contract limits (the declared fractional basis).',
];
const NO_STAGE_BEYOND_NOISE =
    'No stage differs from the engine beyond noise, so no weakness is named; a stage without a standard error on both sides is not ranked.';

const START_BASIS_LABEL: Readonly<Record<StartBasis, string>> = {
    [StartBasis.Fresh]: 'Fresh start',
    [StartBasis.FromState]: 'From the account state',
};

const REQUEST_RUN_LABEL: Readonly<Record<OverviewRequestKind, string>> = {
    [OverviewRequestKind.AccountFromState]: 'From-state account value',
    [OverviewRequestKind.DocumentedRun]: 'Documented policy',
    [OverviewRequestKind.PayoutSizeOptimum]: 'Payout-size optimum',
    [OverviewRequestKind.PlanValues]: 'Fresh plan values',
    [OverviewRequestKind.PortfolioProjection]: 'Fresh-start projection',
    [OverviewRequestKind.RetireComparison]: 'Retire comparison',
    [OverviewRequestKind.ValueChain]: 'Value chain',
};

const EXPOSURE_BASIS_LABEL: Readonly<Record<ExposureBasis, string>> = {
    [ExposureBasis.DocumentedDollars]: 'Documented dollars',
};

const EXPOSURE_DISCLOSURES: readonly string[] = [
    'Maximum daily loss is the sum of the documented rungs for the day (a funded account risks its documented risk on each trade, an eval account its ladder rungs), capped by the cushion; first-trade risk is the first rung. Both are in dollars, not contracts.',
    'Share of cushion at risk is the maximum daily loss divided by the cushion; a copy group divides the combined loss by the combined cushion.',
    'Live accounts and accounts without a usable balance snapshot are not computed and are listed below with the reason.',
];

const CUSHION_BASIS_LABEL: Readonly<Record<CushionRatioBasis, string>> = {
    [CushionRatioBasis.Eval]: 'Eval',
    [CushionRatioBasis.Funded]: 'Funded',
    [CushionRatioBasis.Live]: 'Live',
};

const EXPECTED_NET_SECTION_HREF = `${routes.propCalculator.accounts.index}#prop-overview-expected-net-heading`;

const SETUP_STEP_LABEL: Readonly<Record<SetupStep, string>> = {
    [SetupStep.BudgetSet]: 'Budget set',
    [SetupStep.CostsEntered]: 'Costs entered',
    [SetupStep.ExpectedValueComputed]: 'Expected value computed',
    [SetupStep.FirmRulesVerified]: 'Firm rules verified',
    [SetupStep.StagesCaptured]: 'Stages captured',
};

const SETUP_STEP_HREF: Readonly<Record<SetupStep, string>> = {
    [SetupStep.BudgetSet]: routes.propCalculator.accounts.ledger,
    [SetupStep.CostsEntered]: routes.propCalculator.accounts.ledger,
    [SetupStep.ExpectedValueComputed]: EXPECTED_NET_SECTION_HREF,
    [SetupStep.FirmRulesVerified]: routes.propCalculator.rules,
    [SetupStep.StagesCaptured]: routes.propCalculator.accounts.review,
};

const SETUP_STATUS_LABEL: Readonly<Record<SetupStepStatus, string>> = {
    [SetupStepStatus.Done]: 'Done',
    [SetupStepStatus.Missing]: 'Missing',
    [SetupStepStatus.NotApplicable]: 'Add an account first',
    [SetupStepStatus.NotChecked]: 'Not checked yet',
};

const EV_FUNDED_PROGRESS_LABEL = 'payout money at risk';

const EV_SOURCES_DISCLOSURES: readonly string[] = [
    "Conversion EV per attempt is the pass probability times the value of a fresh funded account, minus the attempt cost. The attempt cost is the engine's one definition: all fees per attempt, the activation fee on a pass included. It is per attempt, ignores time, and is not the ranking objective: expected monthly net per slot stays the first figure.",
    "Value held in funded progress is each funded account's value from its own state minus the value of a fresh funded account, both credit-free (no end-of-horizon credit): the payout money at risk in that account compared with replacing it by a fresh funded one.",
    'The realized conversion EV comes from your own ledger and is shown beside the modeled one; the two are not merged.',
];

const CONCENTRATION_DISCLOSURES: readonly string[] = [
    'A firm that publishes no threshold for moving accounts live can still do so at its discretion, so this card shows where your withdrawable profit sits. A firm with a verified published trigger is tracked on the live proximity card and by the live trigger alert.',
    'Only accounts at firms the engine models are counted.',
];

const ADHERENCE_BASIS_NOTE =
    'Measured against the accepted risk, not the documented rung: an accepted risk above the rung that was then traded counts as followed, and trading less than the accepted risk by more than the step counts as not followed.';

const NO_ALERT_EXTRAS: AlertExtras = {};

const NO_EVAL_LOSSES: ReadonlyMap<string, number> = new Map();

const ENTERED_MONTHLY_BUDGET_SCHEMA = z
    .string()
    .trim()
    .regex(/^\d{1,9}(?:\.\d{1,2})?$/u)
    .transform((text) => Math.round(Number(text) * CENTS_PER_DOLLAR))
    .pipe(z.number().int().positive());

const PORTFOLIO_EVALUATOR = new AlertEvaluator(DEFAULT_ALERT_RULES);

const ALERT_SOURCES = [
    PortfolioSource.Accounts,
    PortfolioSource.CopyGroups,
    PortfolioSource.Payouts,
    PortfolioSource.Rulebook,
    PortfolioSource.Snapshots,
] as const;

const CHECK_SOURCES = [
    PortfolioSource.FirmStatements,
    PortfolioSource.Rounds,
] as const;

const LEDGER_SOURCES = [
    PortfolioSource.Accounts,
    PortfolioSource.Events,
    PortfolioSource.Fees,
    PortfolioSource.Payouts,
    PortfolioSource.Snapshots,
    PortfolioSource.Transfers,
] as const;

interface AccountFromStateEntry {
    readonly accountId: string;
    readonly isFunded: boolean;
    readonly label: string;
    readonly plan: string;
    readonly planSerial: string;
    readonly request: OverviewRequest;
}

interface AlertExtras {
    readonly availableBankrollCents?: null | UsdCents;
    readonly checksGap?: SectionLoadGap;
    readonly decisions?: readonly OverviewDecisionRow[];
    readonly decisionsCaveat?: null | string;
    readonly evalValueLossDollars?: ReadonlyMap<string, number>;
    readonly firmReconciliation?: readonly FirmReconciliationEntry[];
    readonly rounds?: readonly AlertRoundRow[];
}

type AlertRows = Pick<PortfolioRows, (typeof ALERT_SOURCES)[number]>;

interface Counted {
    readonly count: number;
    readonly plural: string;
    readonly singular: string;
}

interface EngineView {
    readonly failure: null | string;
    readonly hasRulebook: boolean;
    readonly plans: ReadonlyMap<string, PlanEngine>;
    readonly values: ReadonlyMap<string, EngineSlot<PlanValuesFigures>>;
}

interface FirmNames {
    of(firmKey: FirmKey): string;
}

type LedgerComputation<Result> =
    | { readonly kind: OverviewSectionStatus.Failed; readonly message: string }
    | { readonly kind: OverviewSectionStatus.Ready; readonly value: Result };

type LedgerRows = Pick<PortfolioRows, (typeof LEDGER_SOURCES)[number]>;

interface MonthlyNetFigures {
    readonly expectedMonthlyNet: UncertainValue;
    readonly expectedMonthlyRealizedNet: UncertainValue;
}

type OverviewSectionGap =
    | { readonly kind: OverviewSectionStatus.Failed; readonly message: string }
    | { readonly kind: OverviewSectionStatus.Pending };

interface PlanEngine {
    readonly documented: EngineSlot<DocumentedRunFigures>;
    readonly documentedRequest: OverviewRequest;
    readonly optimum: EngineSlot<PayoutSizeOptimumFigures>;
    readonly optimumRequest: OverviewRequest | undefined;
}

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

export function alertExtrasOf(
    load: PortfolioLoad,
    today: string,
    userId: string,
    engine?: OverviewEngine,
): AlertExtras {
    return alertExtrasWith(
        load,
        today,
        userId,
        engine,
        engine === undefined
            ? NO_ACCOUNT_STATES
            : accountStatesFromLoad(userId, today, load),
    );
}

export function alertsFor(
    section: PortfolioLoad['alerts'],
    today: string,
    isIncluded: (alert: AccountAlert) => boolean,
    accountStates: readonly AccountStateEntry[] = NO_ACCOUNT_STATES,
    accountStatesSource: null | PortfolioLoad['ledger'] = null,
    realizedLossRiskInput: null | RealizedLossRisk = null,
    eventsOverride?: readonly AlertEventRow[],
    extras: AlertExtras = NO_ALERT_EXTRAS,
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
            if (extras.checksGap !== undefined) {
                return checksGapAlerts(extras.checksGap);
            }
            return {
                accountStatesCaveat: combinedNote(
                    accountStatesCaveatFor(accountStatesSource),
                    extras.decisionsCaveat ?? null,
                ),
                alerts: portfolioAlerts(
                    alertInputsOf(
                        section.rows,
                        today,
                        accountStates,
                        accountStatesSource,
                        realizedLossRiskInput,
                        eventsOverride,
                        extras,
                    ),
                )
                    .filter((alert) => isIncluded(alert))
                    .map((alert) => overviewAlert(alert)),
                kind: OverviewSectionStatus.Ready,
            };
        }
    }
}

export function availableBankrollCentsFor(
    load: PortfolioLoad,
    today: string,
    userId: string,
): null | UsdCents {
    if (load.ledger.status !== OverviewSectionStatus.Ready) return null;
    const { rows } = load.ledger;
    const computed = ledgerOrDateFailure(() =>
        availableCentsOf(PortfolioLedger.fromRows(userId, rows), today),
    );
    return computed.kind === OverviewSectionStatus.Ready
        ? computed.value
        : null;
}

export function buildOverview({
    engine = NO_OVERVIEW_ENGINE,
    externalFirms,
    load,
    today,
    userId,
}: OverviewInputs): OverviewModel {
    const accountStates = accountStatesFromLoad(userId, today, load);
    const extras = alertExtrasWith(load, today, userId, engine, accountStates);
    const realizedRisk = realizedLossRiskFor(load, today, userId);
    const firms = firmNames(externalFirms);
    const context =
        load.alerts.status === OverviewSectionStatus.Ready
            ? createAlertContext(
                  alertInputsOf(
                      load.alerts.rows,
                      today,
                      accountStates,
                      load.ledger,
                      realizedRisk,
                      undefined,
                      extras,
                  ),
              )
            : null;
    const ledger = overviewLedger(
        load.ledger,
        today,
        userId,
        firms,
        load.statementTargets,
        load.sampleThresholds,
        load.retainedCushionCents,
        load.bankrollParameters,
        load.violations,
        load.decisions,
        engine,
        load.rulebook,
        realizedRisk,
    );
    return {
        alerts: alertsFor(
            load.alerts,
            today,
            () => true,
            accountStates,
            load.ledger,
            realizedRisk,
            undefined,
            extras,
        ),
        boards: boardsFor(load, accountStates, userId, today),
        concentration: concentrationFor(load, context, firms),
        evSources: evSourcesFor(load, userId, today, accountStates, engine),
        exposure: exposureFor(load, accountStates),
        hasAccounts:
            load.accounts.status === OverviewSectionStatus.Ready &&
            load.accounts.rows.length > 0,
        ledger:
            ledger.kind === OverviewSectionStatus.Ready
                ? {
                      ...ledger,
                      kpis: [
                          ...ledger.kpis,
                          worstDayKpi(load, context),
                          followedRecommendationsKpi(load),
                      ],
                  }
                : ledger,
        nextPayout: nextPayoutFor(load, userId, today, accountStates, engine),
        projection: projectionFor(load, userId, engine),
        setup: setupFor(load, userId, context, engine),
        violations: violationsFor(
            load.violations,
            netCashCentsFor(load, userId, today),
        ),
    };
}

export function combinedNote(
    ...notes: readonly (null | string)[]
): null | string {
    const present = notes.filter((note): note is string => note !== null);
    return present.length === 0 ? null : present.join(' ');
}

export function decisionsCaveatFor(load: PortfolioLoad): null | string {
    const threshold =
        load.rulebook?.alerts.payoutReadyRiskAboveRungCents ?? null;
    if (threshold === null) return null;
    switch (load.decisions.status) {
        case OverviewSectionStatus.Failed: {
            return `The alert for risk above the documented rung on a payout-ready account could not be checked because your ${sourceList(load.decisions.failed)} could not be loaded.`;
        }
        case OverviewSectionStatus.Pending: {
            return 'The alert for risk above the documented rung on a payout-ready account is not yet available because your sizing decisions are still loading.';
        }
        case OverviewSectionStatus.Ready: {
            return null;
        }
    }
}

export function enteredMonthlyBudgetCentsOf(text: string): null | number {
    const parsed = ENTERED_MONTHLY_BUDGET_SCHEMA.safeParse(text);
    return parsed.success ? parsed.data : null;
}

export function feeKindLabel(kind: FeeKind): string {
    return FEE_KIND_LABEL[kind];
}

export function firmsTileModelOf(
    inputs: Parameters<typeof firmsModelOf>[0],
): FirmsTileModel {
    const { roster, scaleGate } = firmsModelOf(inputs);
    return {
        activeFirms: roster.totalActive,
        firmsUsed: roster.totalFirmsUsed,
        scaleGateLabel: SCALE_GATE_STATUS_TEXT[scaleGate.status],
        scaleGateStatus: scaleGate.status,
        sentLive: roster.totalSentLive,
        unmetConditions: scaleGate.unmetConditions.length,
    };
}

export function hubPortfolioOf(inputs: HubPortfolioInputs): HubPortfolio {
    const { events, today, userId } = inputs;
    const accountStates =
        events === undefined
            ? NO_ACCOUNT_STATES
            : accountStatesForRows(
                  userId,
                  today,
                  inputs.accounts,
                  events,
                  inputs.payouts,
                  inputs.snapshots,
              );
    const computed =
        events === undefined
            ? null
            : ledgerOrDateFailure(() => {
                  const ledger = PortfolioLedger.fromRows(userId, {
                      accounts: inputs.accounts,
                      events,
                      fees: inputs.fees,
                      firmStatements: inputs.firmStatements ?? [],
                      payouts: inputs.payouts,
                      rounds: inputs.rounds ?? [],
                      transfers: inputs.transfers,
                  });
                  const { lossRiskThreshold } = inputs.rulebook.bankroll;
                  return {
                      available: availableCentsOf(ledger, today),
                      ledger,
                      realizedLossRisk:
                          lossRiskThreshold === null
                              ? null
                              : realizedLossRiskOf(
                                    ledger,
                                    today,
                                    lossRiskThreshold,
                                ),
                  };
              });
    const ledgerFigures =
        computed?.kind === OverviewSectionStatus.Ready ? computed.value : null;
    const alerts = portfolioAlerts(
        alertInputsOf(
            {
                accounts: inputs.accounts,
                copyGroups: inputs.copyGroups,
                payouts: inputs.payouts,
                rulebook: inputs.rulebook,
                snapshots: inputs.snapshots,
            },
            today,
            accountStates,
            null,
            ledgerFigures?.realizedLossRisk ?? null,
            events,
            {
                availableBankrollCents: ledgerFigures?.available ?? null,
                decisions: inputs.decisions,
                ...(ledgerFigures !== null &&
                    reconciliationExtrasOfLedger(ledgerFigures.ledger)),
            },
        ),
    );
    return {
        alertCount: alerts.length,
        setup:
            ledgerFigures === null
                ? null
                : hubSetupCardOf(
                      setupChecklistOf({
                          expectedValuePlanSerials: null,
                          ledger: ledgerFigures.ledger,
                          rulebook: inputs.rulebook,
                          staleSnapshotAccountIds:
                              staleSnapshotAccountIdsOf(alerts),
                      }),
                  ),
    };
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

export function overviewAccountRequestsOf(
    load: PortfolioLoad,
    userId: string,
    today: string,
): readonly OverviewRequest[] {
    const { rulebook } = load;
    if (rulebook === null) return [];
    const computed = ledgerOrDateFailure(() =>
        accountFromStateEntriesOf(
            load,
            userId,
            today,
            accountStatesFromLoad(userId, today, load),
        ),
    );
    if (computed.kind !== OverviewSectionStatus.Ready) return [];
    return new Map(
        computed.value.map((entry) => [
            overviewRequestKey(entry.request),
            entry.request,
        ]),
    )
        .values()
        .toArray();
}

export function overviewEngineRequestsOf(
    load: PortfolioLoad,
    userId: string,
): readonly OverviewRequest[] {
    const { ledger: section, rulebook } = load;
    if (section.status !== OverviewSectionStatus.Ready) return [];
    const computed = ledgerOrDateFailure(() =>
        engineRequestsOfLedger(
            PortfolioLedger.fromRows(userId, section.rows),
            rulebook,
        ),
    );
    return computed.kind === OverviewSectionStatus.Ready ? computed.value : [];
}

export function overviewProjectionRequestsOf(
    load: PortfolioLoad,
    userId: string,
): readonly OverviewRequest[] {
    const { ledger: section, rulebook } = load;
    if (section.status !== OverviewSectionStatus.Ready) return [];
    const computed = ledgerOrDateFailure(() =>
        projectionRequestsOfLedger(
            PortfolioLedger.fromRows(userId, section.rows),
            rulebook,
        ),
    );
    return computed.kind === OverviewSectionStatus.Ready ? computed.value : [];
}

export function overviewValueRequestsOf(
    load: PortfolioLoad,
    userId: string,
): readonly OverviewRequest[] {
    const { ledger: section, rulebook } = load;
    if (section.status !== OverviewSectionStatus.Ready) return [];
    const computed = ledgerOrDateFailure(() =>
        valueRequestsOfLedger(
            PortfolioLedger.fromRows(userId, section.rows),
            rulebook,
        ),
    );
    return computed.kind === OverviewSectionStatus.Ready ? computed.value : [];
}

export function payoutStatusLabel(status: PayoutStatus): string {
    return PAYOUT_STATUS_LABEL[status];
}

export function portfolioAlerts(inputs: AlertInputs): readonly AccountAlert[] {
    return PORTFOLIO_EVALUATOR.evaluate(createAlertContext(inputs));
}

export function portfolioLoad(queries: PortfolioQueries): PortfolioLoad {
    const supplied = suppliedQueriesOf(queries);
    return {
        accounts: accountsLoad(queries),
        alerts: alertsLoad(queries),
        bankrollParameters: bankrollParametersOf(queries),
        checks: checksLoad(queries),
        decisions: decisionsLoad(queries),
        failures: supplied
            .filter(([, query]) => isFailed(query))
            .map(([source, query]) => ({
                message: readableError(query.error),
                source,
                title: `Your ${SOURCE_LABEL[source]} could not be loaded`,
            })),
        ledger: ledgerLoad(queries),
        retainedCushionCents: retainedCushionCentsOf(queries),
        rulebook: queries[PortfolioSource.Rulebook].data ?? null,
        sampleThresholds: sampleThresholdsOf(queries),
        stale: supplied
            .filter(([, query]) => isStale(query))
            .map(([source, query]) => ({
                message: `${readableError(query.error)} The figures below use the last loaded ${SOURCE_LABEL[source]}.`,
                source,
                title: `Your ${SOURCE_LABEL[source]} could not be refreshed`,
            })),
        statementTargets: statementTargetsOf(queries),
        violations: violationsLoad(queries),
    };
}

export function scaleAtMultipleModel(
    scale: ScaleAtMultiple,
): ScaleAtMultipleModel {
    if (scale.kind === ScaleAtMultipleKind.Unavailable) {
        return {
            kind: ScaleAtMultipleKind.Unavailable,
            reason: scaleAtMultipleReasonLabel(scale.reason),
        };
    }
    return {
        budget: formatUsdCents(usdCents(scale.budgetCents)),
        budgetLabel: scaleBudgetBasisLabel(scale.budgetBasis),
        cappedNote:
            scale.cappedBy === null
                ? null
                : `Your entered monthly budget is above ${scaleCappedByLabel(scale.cappedBy)}, so it is capped at ${formatUsdCents(usdCents(scale.budgetCents))}.`,
        intervalLower: formatMultiple(scale.interval.lower),
        intervalUpper: formatMultiple(scale.interval.upper),
        kind: ScaleAtMultipleKind.Available,
        multiple: formatMultiple(scale.multiple),
        n: scale.n,
        projected: formatUsdCents(usdCents(scale.projectedCents)),
        projectionLabel:
            scale.projectedMonthlyCents === null
                ? 'projected for one fill, not a monthly budget'
                : 'projected monthly',
        sampleLevel: scale.sampleLevel,
    };
}

export function scaleModelAtBudget(
    inputs: BankrollScaleInputs,
    enteredMonthlyCents: null | number,
): ScaleAtMultipleModel {
    return scaleAtMultipleModel(
        scaleAtMeasuredMultiple(
            inputs.cohortMultiple,
            {
                capacityFillCents: inputs.capacityFillCents,
                enteredMonthlyCents,
                planLimitCents: inputs.planLimitCents,
            },
            inputs.sampleThresholds,
        ),
    );
}

export function setupChecklistCardOf(
    checklist: SetupChecklist,
): SetupChecklistCardModel {
    return {
        doneCount: checklist.doneCount,
        isComplete: checklist.isComplete,
        steps: checklist.steps.map((result) => ({
            detail: setupStepDetail(result),
            href: SETUP_STEP_HREF[result.step],
            items: result.missing.flatMap(setupItemRows),
            key: result.step,
            label: SETUP_STEP_LABEL[result.step],
            status: result.status,
            statusLabel: SETUP_STATUS_LABEL[result.status],
        })),
        totalSteps: checklist.steps.length,
    };
}

export function violationsFor(
    section: PortfolioLoad['violations'],
    netCashCents: null | UsdCents,
): OverviewViolations {
    switch (section.status) {
        case OverviewSectionStatus.Failed: {
            return {
                kind: OverviewSectionStatus.Failed,
                message: `Rule violations could not be shown because your ${sourceList(section.failed)} could not be loaded.`,
            };
        }
        case OverviewSectionStatus.Pending: {
            return { kind: OverviewSectionStatus.Pending };
        }
        case OverviewSectionStatus.Ready: {
            return {
                kind: OverviewSectionStatus.Ready,
                model: violationsCardOf(section.rows, netCashCents),
            };
        }
    }
}

function accountFromStateEntriesOf(
    load: PortfolioLoad,
    userId: string,
    today: string,
    accountStates: readonly AccountStateEntry[],
): readonly AccountFromStateEntry[] {
    const { alerts, ledger: section, rulebook } = load;
    if (
        rulebook === null ||
        alerts.status !== OverviewSectionStatus.Ready ||
        section.status !== OverviewSectionStatus.Ready
    ) {
        return [];
    }
    const ledger = PortfolioLedger.fromRows(userId, section.rows);
    const names = planNames(ledger);
    const stats = replacementStats(ledger);
    const firmCounts = firmPayoutCounts(ledger, today);
    const firmCountsByDate = new Map<string, readonly FirmPayoutCount[]>([
        [today, firmCounts],
    ]);
    const firmCountsAt = (asOf: string): readonly FirmPayoutCount[] => {
        const known = firmCountsByDate.get(asOf);
        if (known !== undefined) return known;
        const counts = firmPayoutCounts(ledger, asOf);
        firmCountsByDate.set(asOf, counts);
        return counts;
    };
    const { accounts, payouts, snapshots } = alerts.rows;
    const entries: AccountFromStateEntry[] = [];
    for (const { accountId, state } of accountStates) {
        if (
            state.kind !== AccountStateKind.Reconstructed ||
            state.latest.reconstructed.kind === ReconstructedLiveKind.Live
        ) {
            continue;
        }
        const row = accounts.find((candidate) => candidate.id === accountId);
        if (row === undefined || !isActiveAccount(row)) continue;
        const tracked = trackedAccountOf(accountStateAccountRowOf(row));
        if (!isModeledAccount(tracked)) continue;
        const accountSnapshots = snapshots
            .filter(
                (snapshot) =>
                    snapshot.accountId === accountId &&
                    snapshot.userId === userId,
            )
            .map(accountStateSnapshotRowOf);
        const { latest } = latestTwoSnapshots(accountSnapshots);
        const { plan } = state;
        const firmCount = firmPayoutCountOrNull(firmCounts, plan.id.firm);
        if (firmCount === null) continue;
        const accountEvents = section.rows.events.filter(
            (event) => event.accountId === accountId && event.userId === userId,
        );
        const accountPayouts = payouts.filter(
            (payout) =>
                payout.accountId === accountId && payout.userId === userId,
        );
        const { input, pendingPayoutCounts, personalMaxRiskPerTrade } =
            snapshotInputFrom(
                plan,
                tracked,
                latest,
                accountEvents,
                accountPayouts,
                today,
                firmCount,
            );
        const planSerial = serializePlanId(plan.id);
        const measuredRebuyLag = measuredRebuyLagOfDefault(
            rebuyLagDefault(stats, planSerial),
        );
        const request = withPreviousAccount(
            accountFromStateRequestOf({
                account: input,
                measuredRebuyLag,
                pendingPayoutCounts,
                personalMaxRiskPerTrade,
                personalRules: row.personalRules,
                plan,
                rulebook,
            }),
            previousAccountOf({
                accountId,
                events: accountEvents,
                firmCountAt: (asOf) =>
                    firmPayoutCountOrNull(firmCountsAt(asOf), plan.id.firm),
                payouts: accountPayouts,
                plan,
                rulebook,
                snapshots: accountSnapshots,
                state,
                tracked,
            }),
        );
        if (request === undefined) continue;
        entries.push({
            accountId,
            isFunded: state.latest.reconstructed.kind === TradingPhase.Funded,
            label: row.label,
            plan: names.of(planSerial),
            planSerial,
            request,
        });
    }
    return entries;
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
    return {
        accountSize: row.accountSize,
        archivedAt: row.archivedAt,
        dashboardConvention: row.dashboardConvention,
        externalFirmId: row.externalFirmId,
        firmId: row.firmId,
        firstFundedTradeOn: row.firstFundedTradeOn,
        fundedOn: row.fundedOn,
        id: row.id,
        liveStartBalanceCents: row.liveStartBalanceCents,
        optIns: row.optIns,
        personalRules: row.personalRules ?? undefined,
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
    return {
        accountId: row.accountId,
        asOf: row.asOf,
        balanceAtLastPayoutCents: row.balanceAtLastPayoutCents,
        balanceCents: row.balanceCents,
        createdAt: row.createdAt,
        cumulativePayoutCents: row.cumulativePayoutCents,
        cycleBestDayProfitCents: row.cycleBestDayProfitCents,
        dashboardFloorCents: row.dashboardFloorCents,
        evalBestDayProfitCents: row.evalBestDayProfitCents,
        floorAtLastPayoutCents: row.floorAtLastPayoutCents,
        highestEodBalanceCents: row.highestEodBalanceCents,
        highestIntradayBalanceCents: row.highestIntradayBalanceCents,
        id: row.id,
        lastPayoutOn: row.lastPayoutOn,
        lastTradedOn: row.lastTradedOn,
        payoutsTaken: row.payoutsTaken,
        qualifyingDaysSinceLastPayout: row.qualifyingDaysSinceLastPayout,
        tradingDays: row.tradingDays,
        userId: row.userId,
    };
}

function activeSlotsOf(usage: PlanCapUsage): ReadonlyMap<string, number> {
    return new Map(
        usage.plans.map((row) => [row.planSerial, row.used - row.suspended]),
    );
}

function alertExtrasWith(
    load: PortfolioLoad,
    today: string,
    userId: string,
    engine: OverviewEngine | undefined,
    accountStates: readonly AccountStateEntry[],
): AlertExtras {
    return {
        availableBankrollCents: availableBankrollCentsFor(load, today, userId),
        ...(load.checks.status !== OverviewSectionStatus.Ready && {
            checksGap: load.checks,
        }),
        decisions:
            load.decisions.status === OverviewSectionStatus.Ready
                ? load.decisions.rows
                : [],
        decisionsCaveat: decisionsCaveatFor(load),
        ...(engine !== undefined && {
            evalValueLossDollars: evalValueLossDollarsFor(
                load,
                userId,
                today,
                accountStates,
                engine,
            ),
        }),
        ...reconciliationExtrasFor(load, userId),
    };
}

function alertInputsOf(
    rows: AlertRows,
    today: string,
    accountStates: readonly AccountStateEntry[],
    accountStatesSource: null | PortfolioLoad['ledger'],
    realizedLossRiskInput: null | RealizedLossRisk,
    eventsOverride: readonly AlertEventRow[] | undefined,
    extras: AlertExtras,
): AlertInputs {
    const { accounts, copyGroups, payouts, rulebook, snapshots } = rows;
    return {
        accounts,
        accountStates,
        availableBankrollCents: extras.availableBankrollCents ?? null,
        copyGroups,
        decisions: extras.decisions ?? [],
        evalValueLossDollars: extras.evalValueLossDollars ?? NO_EVAL_LOSSES,
        events: eventsOverride ?? eventsFrom(accountStatesSource),
        firmReconciliation: extras.firmReconciliation ?? [],
        payouts,
        realizedLossRisk: realizedLossRiskInput,
        rounds: extras.rounds ?? [],
        rulebook,
        snapshots,
        today,
    };
}

function alertRoundOf(
    ledger: PortfolioLedger,
    round: LedgerRoundRow,
): AlertRoundRow {
    const members = ledger.membersOfRound(round.id);
    const { spend } = summarizeCash(
        members.flatMap((entry) => entry.fees),
        [],
    );
    return {
        budget: roundBudgetStatus(round.budgetCents, spend),
        id: round.id,
        label: round.label,
        status: round.status,
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
    engine: EngineView,
): AttemptEconomicsCardModel {
    const economics = realizedAttemptEconomics(
        ledger,
        today,
        realizedHorizonDaysOf(engine),
    );
    return {
        disclosures: [
            realizedHorizonDisclosureOf(engine),
            MARGIN_ABOVE_BREAKEVEN_HELP_TEXT,
        ],
        horizonDays: economics.horizonDays,
        rows: economics.perPlan.map((row) =>
            attemptEconomicsRow(
                row,
                names,
                sampleThresholds,
                documentedSlotOf(engine, row.planSerial),
            ),
        ),
    };
}

function attemptEconomicsRow(
    row: PlanAttemptEconomics,
    names: PlanNames,
    sampleThresholds: SampleThresholds,
    modeled: EngineSlot<DocumentedRunFigures> | undefined,
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
        formula:
            decomposition === null
                ? NOT_APPLICABLE
                : `Pass rate ${formatPercent(decomposition.passProbability)} x funded value ${formatCurrency(decomposition.fundedValue)} - attempt cost ${formatCurrency(decomposition.attemptCost)} = ${formatCurrency(decomposition.expectedNetPerAttempt)} per attempt`,
        fundedValue: formatSampledCents(row.fundedValue),
        fundedValueToAttemptCost:
            decomposition?.fundedValueToAttemptCost.value?.label ??
            NOT_APPLICABLE,
        key: row.planSerial,
        marginAboveBreakeven: marginAboveBreakevenLabel(
            row.marginAboveBreakeven,
        ),
        modeledEvPerAttempt: engineText(modeled, (figures) =>
            estimateCurrency(figures.expectedNetPerAttempt),
        ),
        modeledFundedValue: engineText(modeled, (figures) =>
            estimateCurrency(figures.expectedPayoutPerFundedAccount),
        ),
        modeledPassRate: engineText(modeled, (figures) =>
            estimatePercent(figures.attemptPassProbability),
        ),
        modeledPayoutRate: engineText(modeled, (figures) =>
            estimatePercent(figures.anyPayoutGivenFundedProbability),
        ),
        modeledPayoutsPerPaidFunded: engineText(modeled, (figures) => {
            const perPaid = payoutsPerPaidFundedOf(figures);
            return perPaid === null ? NOT_APPLICABLE : perPaid.toFixed(2);
        }),
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
        payoutsPerPaidFunded: formatSampledCount(
            row.payoutsPerPaidFundedEstimate,
        ),
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
        countingNote: ATTEMPT_COUNTING_NOTE,
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

function availableCentsOf(ledger: PortfolioLedger, today: string): UsdCents {
    return roundCents(bankrollOf(ledger, today).availableCents);
}

function averagePayoutOf(figures: DocumentedRunFigures): null | number {
    const perFunded = figures.payoutsPerFundedAccount.value;
    return perFunded > 0
        ? figures.expectedPayoutPerFundedAccount.value / perFunded
        : null;
}

function bankrollCard(
    ledger: PortfolioLedger,
    today: string,
    sampleThresholds: SampleThresholds,
    bankrollParameters: BankrollParameters,
    capUsage: PlanCapUsage,
    realizedRisk: null | RealizedLossRisk,
): BankrollCardModel {
    const bankroll = bankrollOf(ledger, today);
    const { dailyAccountCapacity } = bankrollParameters;
    const cheapestAttemptCents =
        dailyAccountCapacity === null || dailyAccountCapacity <= 0
            ? null
            : cheapestAttemptCostCentsOf(ledger, today);
    const capacityFillCents = capacityFillBudgetCentsOf(
        cheapestAttemptCents,
        dailyAccountCapacity,
    );
    const scaleInputs: BankrollScaleInputs = {
        capacityFillCents,
        cohortMultiple: pooledEndedCohortMultiple(ledger),
        planLimitCents:
            capacityFillCents === null
                ? null
                : planLimitBudgetCentsOf(cheapestAttemptCents, capUsage),
        sampleThresholds,
    };
    return {
        available: formatUsdCents(usdCents(bankroll.availableCents)),
        deposits: formatUsdCents(usdCents(bankroll.depositsCents)),
        grownFromText:
            bankroll.depositsCents === 0
                ? null
                : `Grown from ${formatUsdCents(usdCents(bankroll.depositsCents))} injected.`,
        lossRisk: bankrollLossRiskModelOf(realizedRisk),
        moneyWeightedReturn:
            bankroll.moneyWeightedReturn === null
                ? NOT_APPLICABLE
                : formatPercent(bankroll.moneyWeightedReturn),
        reinvestedPayouts: formatUsdCents(
            usdCents(bankroll.reinvestedPayoutsCents),
        ),
        scale: scaleModelAtBudget(scaleInputs, null),
        scaleInputs,
        undatedPaidPayoutsCaveat: undatedPaidPayoutsCaveatOf(
            bankroll.undatedPaidPayouts,
        ),
        withdrawals: formatUsdCents(usdCents(bankroll.withdrawalsCents)),
    };
}

function bankrollLossRiskModelOf(
    risk: null | RealizedLossRisk,
): BankrollLossRiskModel {
    if (risk === null) {
        return {
            kind: BankrollLossRiskKind.Unavailable,
            reason: NO_ATTEMPT_COST_TEXT,
        };
    }
    const { batchLossProbability, minimumBudget } = risk;
    return {
        attemptPays:
            risk.attemptPaysRate === null
                ? NOT_APPLICABLE
                : formatSampledRateWithoutLevel(risk.attemptPaysRate),
        attemptsAtBankroll:
            risk.attempts === null ? NOT_APPLICABLE : String(risk.attempts),
        batchLoss:
            batchLossProbability === null
                ? NOT_APPLICABLE
                : `${formatPercent(batchLossProbability.value)}${batchLossProbability.standardError === null ? '' : ` (SE ${formatPercent(batchLossProbability.standardError)})`}`,
        kind: BankrollLossRiskKind.Ready,
        minimumBudget:
            minimumBudget.value === null
                ? NOT_APPLICABLE
                : formatCurrency(minimumBudget.value),
        minimumBudgetNote:
            minimumBudget.value === null
                ? minimumBudgetNoteOf(minimumBudget.reason)
                : null,
        noPayout:
            risk.noPayoutProbability === null
                ? NOT_APPLICABLE
                : formatPercent(risk.noPayoutProbability),
        sampleNote: `Measured from ${counted({ count: risk.sampleCount, plural: 'attempts', singular: 'attempt' })} decided within ${risk.toFirstPayoutDays.toFixed(1)} days of funding (${risk.toFirstPayoutMeasured ? 'measured' : 'assumed'}).`,
    };
}

function bankrollParametersOf(queries: PortfolioQueries): BankrollParameters {
    const rulebook = queries[PortfolioSource.Rulebook].data;
    return (
        rulebook?.bankroll ?? {
            accountsPerSession: null,
            dailyAccountCapacity: null,
            defaultRoundBudgetCents: null,
            lossRiskThreshold: null,
            objectiveSwitchCents: null,
            roundGapDays: 14,
            sessionHoursPerDay: null,
        }
    );
}

function biggestWeaknessLine(
    analysis: FunnelWeaknessAnalysis,
    engine: EngineView,
): string {
    if (readyDocumentedFigures(engine) === null) {
        return FUNNEL_DIAGNOSTIC_PENDING_TEXT;
    }
    const [first] = analysis.rows;
    if (first === undefined) {
        const untested = analysis.untested
            .map((gap) => `${gap.stage} (${gap.plan})`)
            .join('; ');
        return untested === ''
            ? NO_STAGE_BEYOND_NOISE
            : `${NO_STAGE_BEYOND_NOISE} The largest gap is in ${untested}, which cannot be tested for noise.`;
    }
    const samePlan = analysis.untested.filter((gap) => gap.key === first.key);
    const untested = samePlan.map((gap) => gap.stage).join('; ');
    return `Biggest weakness vs the engine beyond noise: ${first.plan}, ${first.text}${untested === '' ? '' : ` A larger gap in ${untested} cannot be tested for noise.`}`;
}

function boardAccountLabels(
    accounts: readonly OverviewAccountRow[],
): ReadonlyMap<string, OverviewAccountRow> {
    return new Map(accounts.map((account) => [account.id, account]));
}

function boardFailures(load: PortfolioLoad): readonly PortfolioSource[] {
    return [
        ...new Set([
            ...(load.alerts.status === OverviewSectionStatus.Failed
                ? load.alerts.failed
                : []),
            ...(load.ledger.status === OverviewSectionStatus.Failed
                ? load.ledger.failed
                : []),
        ]),
    ];
}

function boardsFor(
    load: PortfolioLoad,
    accountStates: readonly AccountStateEntry[],
    userId: string,
    today: string,
): OverviewBoards {
    const failed = boardFailures(load);
    if (failed.length > 0) {
        return {
            kind: OverviewSectionStatus.Failed,
            message: `The cushion and payout readiness boards could not be computed because your ${sourceList(failed)} could not be loaded.`,
        };
    }
    if (
        load.alerts.status !== OverviewSectionStatus.Ready ||
        load.ledger.status !== OverviewSectionStatus.Ready
    ) {
        return { kind: OverviewSectionStatus.Pending };
    }
    const { accounts, rulebook } = load.alerts.rows;
    const { rows: ledgerRows } = load.ledger;
    const byId = boardAccountLabels(accounts);
    const counted = ledgerOrDateFailure(() =>
        firmPayoutCounts(PortfolioLedger.fromRows(userId, ledgerRows), today),
    );
    const readinessInputs = readinessBoardInputsOf(
        accounts,
        accountStates,
        counted.kind === OverviewSectionStatus.Ready
            ? counted.value
            : NO_FIRM_PAYOUT_COUNTS,
    );
    const readiness = payoutReadinessBoardOf(
        rulebook,
        readinessInputs.states,
        readinessInputs.overrides,
    );
    return {
        cushion: cushionBoardCard(
            cushionBoardOf(rulebook, accountStates),
            byId,
        ),
        kind: OverviewSectionStatus.Ready,
        readiness: readinessBoardCard(readiness, byId),
    };
}

function bustSplitDisclosureFor(
    violations: PortfolioLoad['violations'],
    decisions: PortfolioLoad['decisions'],
): string {
    const failedSources = [
        ...(violations.status === OverviewSectionStatus.Failed
            ? violations.failed
            : []),
        ...(decisions.status === OverviewSectionStatus.Failed
            ? decisions.failed
            : []),
    ];
    if (failedSources.length > 0) {
        return `The bust diagnosis split could not be computed because your ${sourceList(failedSources)} could not be loaded; busts are shown as not applicable, not assumed within-plan.`;
    }
    return violations.status === OverviewSectionStatus.Pending ||
        decisions.status === OverviewSectionStatus.Pending
        ? BUST_SPLIT_LOADING_DISCLOSURE
        : BUST_SPLIT_DISCLOSURE;
}

function calendarHorizonDaysOf(tradingDays: number): number {
    return Math.round(
        (tradingDays * AVERAGE_DAYS_PER_MONTH) / TRADING_DAYS_PER_MONTH,
    );
}

function capacityFillBudgetCentsOf(
    cheapestAttemptCents: null | number,
    dailyAccountCapacity: null | number,
): null | number {
    return cheapestAttemptCents === null ||
        dailyAccountCapacity === null ||
        dailyAccountCapacity <= 0
        ? null
        : Math.round(dailyAccountCapacity * cheapestAttemptCents);
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
        disclosure:
            usage.pooledCapsModeled && usage.plans.length > 0
                ? POOLED_CAPS_VERIFIED_CAP_DISCLOSURE
                : POOLED_CAPS_DISCLOSURE,
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

function cheapestAttemptCostCentsOf(
    ledger: PortfolioLedger,
    today: string,
): null | number {
    const costs = realizedAttemptEconomics(
        ledger,
        today,
        DEFAULT_REALIZED_HORIZON_DAYS,
    )
        .perPlan.map((row) => row.attemptCost)
        .filter((cost): cost is number => cost !== null && cost > 0);
    return costs.length === 0 ? null : Math.min(...costs);
}

function checkedCount(status: LiveProximityCountStatus, count: number): string {
    return status === LiveProximityCountStatus.NotChecked
        ? COUNT_NOT_CHECKED_TEXT
        : String(count);
}

function checksGapAlerts(gap: SectionLoadGap): OverviewAlerts {
    switch (gap.status) {
        case OverviewSectionStatus.Failed: {
            return {
                kind: OverviewSectionStatus.Failed,
                message: `Alerts could not be checked because your ${sourceList(gap.failed)} could not be loaded.`,
            };
        }
        case OverviewSectionStatus.Pending: {
            return { kind: OverviewSectionStatus.Pending };
        }
    }
}

function checksLoad(
    queries: PortfolioQueries,
): SectionLoad<PortfolioCheckRows> {
    const statements = queries[PortfolioSource.FirmStatements];
    const rounds = queries[PortfolioSource.Rounds];
    const supplied = CHECK_SOURCES.filter(
        (source) => queries[source] !== undefined,
    );
    if (
        (statements !== undefined && statements.data === undefined) ||
        (rounds !== undefined && rounds.data === undefined)
    ) {
        return loadGap(queries, supplied);
    }
    return {
        rows: {
            firmStatements: statements?.data ?? [],
            rounds: rounds?.data ?? [],
        },
        status: OverviewSectionStatus.Ready,
    };
}

function concentrationBasisDisclosure(
    retainedCushionDollars: null | number,
): string {
    const cushion =
        retainedCushionDollars === null
            ? ''
            : ` of ${formatCurrency(retainedCushionDollars)}, the larger of Hard Rule 2's minimum and the rulebook's retained cushion size,`;
    return `A funded account counts as in profit when its account profit is above zero. Withdrawable is the room above the retained cushion${cushion} within the plan's payout request caps and after the floor a payout would set, never the horizon credit. It ignores payout eligibility (qualifying days, the minimum profit, the payout day gate, pending payouts and personal cushion or request entries) and uses each account's latest snapshot as is.`;
}

function concentrationCard(
    concentration: FirmProfitConcentration,
    rulebook: RulebookParameters,
    firms: FirmNames,
): ProfitConcentrationCardModel {
    return {
        caveats: concentration.firms.flatMap((firm) =>
            concentrationCaveatOf(firm, firms),
        ),
        disclosures: [
            concentrationBasisDisclosure(concentration.retainedCushionDollars),
            ...CONCENTRATION_DISCLOSURES,
        ],
        rows: concentration.firms.map((firm) => {
            const firmKey: FirmKey = {
                firmId: firm.firmId,
                kind: FirmKeyKind.Modeled,
            };
            const { payoutsSinceLastMovedLive: since, recentPayouts } = firm;
            return {
                firm: firms.of(firmKey),
                fundedAccounts: String(firm.fundedAccounts),
                inProfit: String(firm.inProfitAccounts),
                key: firmKeyId(firmKey),
                recentPayouts: `${counted({ count: recentPayouts.count, plural: 'payouts', singular: 'payout' })}, ${formatUsdCents(usdCents(recentPayouts.cents))} in the last ${String(concentration.recentDays)} days`,
                sinceMovedLive: `${counted({ count: since.count, plural: 'payouts', singular: 'payout' })}, ${formatUsdCents(usdCents(since.cents))} ${since.since === null ? 'in total (no move live recorded)' : `since the last move live on ${since.since}`}`,
                withdrawable: formatUsdCents(firm.withdrawableCents),
                withdrawableShare: formatOptionalPercent(
                    firm.withdrawableShare,
                ),
            };
        }),
        thresholdNote: concentrationThresholdNote(rulebook),
    };
}

function concentrationCaveatOf(
    firm: FirmConcentration,
    firms: FirmNames,
): readonly string[] {
    const parts = [
        firm.staleAccounts === 0
            ? null
            : `${counted({ count: firm.staleAccounts, plural: 'funded accounts have', singular: 'funded account has' })} a stale snapshot`,
        firm.unreadableAccounts === 0
            ? null
            : `${counted({ count: firm.unreadableAccounts, plural: 'active accounts', singular: 'active account' })} could not be read from a snapshot`,
    ].filter((part): part is string => part !== null);
    return parts.length === 0
        ? []
        : [
              `${firms.of({ firmId: firm.firmId, kind: FirmKeyKind.Modeled })}: ${joinWithAnd(parts)}, so its withdrawable may be out of date.`,
          ];
}

function concentrationFor(
    load: PortfolioLoad,
    context: AlertContext | null,
    firms: FirmNames,
): OverviewConcentration {
    switch (load.alerts.status) {
        case OverviewSectionStatus.Failed: {
            return {
                kind: OverviewSectionStatus.Failed,
                message: `Profit concentration could not be computed because your ${sourceList(load.alerts.failed)} could not be loaded.`,
            };
        }
        case OverviewSectionStatus.Pending: {
            return { kind: OverviewSectionStatus.Pending };
        }
        case OverviewSectionStatus.Ready: {
            return context === null
                ? { kind: OverviewSectionStatus.Pending }
                : {
                      kind: OverviewSectionStatus.Ready,
                      model: concentrationCard(
                          firmProfitConcentrationOfContext(context),
                          load.alerts.rows.rulebook,
                          firms,
                      ),
                  };
        }
    }
}

function concentrationThresholdNote(rulebook: RulebookParameters): string {
    const {
        firmProfitConcentrationCount: count,
        firmProfitConcentrationShare: share,
    } = rulebook.alerts;
    const limits = [
        count === null
            ? null
            : `${String(count)} funded accounts in profit at one firm`,
        share === null
            ? null
            : `${formatPercent(share)} of your withdrawable money at one firm`,
    ].filter((limit): limit is string => limit !== null);
    return limits.length === 0
        ? 'The concentration alert is off: set a limit in the rulebook to be warned.'
        : `The concentration alert warns at ${joinWithAnd(limits)}.`;
}

function confirmedTriggerSource(
    triggers: readonly LiveTransitionTrigger[],
    kind: LiveTriggerKind,
): null | PolicyQuote {
    for (const trigger of triggers) {
        const { source } = trigger;
        if (
            trigger.kind === kind &&
            source?.verification === PolicyVerification.Confirmed
        ) {
            return source;
        }
    }
    return null;
}

function conversionEvText(
    documented: EngineSlot<DocumentedRunFigures> | undefined,
    values: EngineSlot<PlanValuesFigures> | undefined,
): string {
    if (documented === undefined || values === undefined) {
        return NOT_APPLICABLE;
    }
    if (
        documented.kind === EngineSlotKind.Ready &&
        values.kind === EngineSlotKind.Ready
    ) {
        const conversion = conversionEvPerAttempt({
            attemptCost: dollars(documented.figures.costPerAttempt.value),
            attemptPassProbability: fraction(
                documented.figures.attemptPassProbability.value,
            ),
            freshFundedValue: dollars(
                values.figures.freshFundedValue.creditFree.value,
            ),
        });
        return conversion.value === null
            ? NOT_AVAILABLE
            : formatCurrency(conversion.value);
    }
    return documented.kind === EngineSlotKind.Pending ||
        values.kind === EngineSlotKind.Pending
        ? PENDING
        : NOT_AVAILABLE;
}

function costCard(
    ledger: PortfolioLedger,
    names: PlanNames,
    firms: FirmNames,
    sampleThresholds: SampleThresholds,
    engine: EngineView,
): CostCardModel {
    const analytics = costAnalytics(ledger, modeledCostMap(engine));
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
            impliedAttempts: firmImpliedAttemptsText(row),
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
            ...costCardDisclosures(analytics, engine),
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
        discountsNote: excludedFeeRowsNoteOf(reconciliation.excludedFeeRows),
        perPlan: analytics.perPlan.map((row) => ({
            acquisitionSpend: formatUsdCents(row.acquisitionSpend),
            attempts: String(row.attempts),
            attemptsSampleLevel: sampleAdequacy(
                SampleKind.EvalAttempts,
                row.attempts,
                sampleThresholds,
            ),
            costPerAttempt: optionalCents(row.costPerAttempt),
            costPerFunded: optionalCents(row.costPerFundedAccount),
            fundedAccounts: String(row.fundedAccounts),
            fundedSampleLevel: sampleAdequacy(
                SampleKind.FundedAccounts,
                row.fundedAccounts,
                sampleThresholds,
            ),
            impliedAttempts:
                row.impliedAttempts === null
                    ? NOT_APPLICABLE
                    : row.impliedAttempts.toFixed(2),
            key: row.planSerial,
            modeled: modeledCostText(
                row.modeledCostPerFundedAccount,
                engine.plans.get(row.planSerial)?.documented,
            ),
            pendingEvalAccounts: String(row.pendingEvalAccounts),
            pendingSpend: formatUsdCents(row.pendingAcquisitionSpend),
            plan: names.of(row.planSerial),
            realizedMinusModeled:
                row.modeledCostPerFundedAccount !== null &&
                row.realizedMinusModeled === null
                    ? NOT_APPLICABLE
                    : modeledCostText(
                          row.realizedMinusModeled,
                          engine.plans.get(row.planSerial)?.documented,
                          signedCash,
                      ),
        })),
    };
}

function costCardDisclosures(
    analytics: ReturnType<typeof costAnalytics>,
    engine: EngineView,
): string[] {
    const ready = readyDocumentedFigures(engine);
    return [
        PENDING_FEE_ATTRIBUTION_TEXT[analytics.pendingFeeAttribution],
        ATTEMPT_COUNTING_NOTE,
        ready === null
            ? engine.failure === null
                ? MODELED_COST_PENDING
                : `The modeled cost per funded account is not available: ${asSentence(engine.failure)}`
            : `The modeled cost per funded account is the simulator's replacement-chain cost under your documented policy: fresh start, ${formatTrials(ready.trials)}, with the engine's pass rate rather than yours.`,
    ];
}

function counted({ count, plural, singular }: Counted): string {
    return `${String(count)} ${count === 1 ? singular : plural}`;
}

function cushionBasisText(ratio: CushionRatio): string {
    switch (ratio.basis) {
        case CushionRatioBasis.Eval: {
            return 'eval drawdown';
        }
        case CushionRatioBasis.Funded: {
            return ratio.fundedRiskBasis ===
                FundedRiskBasis.PersonalMaxRiskPerTrade
                ? 'personal max risk per trade'
                : 'documented funded risk';
        }
        case CushionRatioBasis.Live: {
            return 'live retained cushion';
        }
    }
}

function cushionBoardCard(
    board: ReturnType<typeof cushionBoardOf>,
    accounts: ReadonlyMap<string, OverviewAccountRow>,
): CushionBoardCardModel {
    return {
        disclosure:
            'Accounts are ranked by cushion in risk units, nearest to the floor first; the risk unit is the documented funded risk, your personal max risk per trade when it is lower, the eval drawdown for an eval, or the live retained cushion.',
        rows: board.rows.map((row, index) =>
            cushionBoardRow(row, index, accounts),
        ),
        unavailable: board.unavailable.map((row) =>
            unavailableAccountRow(
                row.accountId,
                accounts,
                accountStateUnavailableText(
                    accounts.get(row.accountId),
                    row.reason,
                ),
            ),
        ),
    };
}

function cushionBoardRow(
    row: CushionBoardEntry,
    index: number,
    accounts: ReadonlyMap<string, OverviewAccountRow>,
): CushionBoardRow {
    const { ratio } = row;
    return {
        account: accounts.get(row.accountId)?.label ?? row.accountId,
        asOf: row.asOf,
        basis: CUSHION_BASIS_LABEL[ratio.basis],
        cushion: optionalCents(row.cushionCents),
        floor: optionalCents(row.floorCents),
        key: row.accountId,
        rank: String(index + 1),
        ratio:
            ratio.ratio === null || ratio.basisAmount === null
                ? NOT_APPLICABLE
                : `${ratio.ratio.toFixed(1)} x ${formatCurrency(ratio.basisAmount)} ${cushionBasisText(ratio)}`,
    };
}

function dayLossNoteSentence(note: string): string {
    return asSentence(`${note.charAt(0).toUpperCase()}${note.slice(1)}`);
}

function decisionsLoad(
    queries: PortfolioQueries,
): SectionLoad<readonly OverviewDecisionRow[]> {
    const decisions = queries[PortfolioSource.Decisions].data;
    return decisions === undefined
        ? loadGap(queries, [PortfolioSource.Decisions])
        : { rows: decisions, status: OverviewSectionStatus.Ready };
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

function documentedSlotOf(
    engine: EngineView,
    planSerial: string,
): EngineSlot<DocumentedRunFigures> | undefined {
    return engine.plans.get(planSerial)?.documented;
}

function engineHorizonTradingDaysOf(engine: EngineView): null | number {
    return readyDocumentedFigures(engine)?.fundedHorizonDays ?? null;
}

function engineRequestsOfLedger(
    ledger: PortfolioLedger,
    rulebook: null | RulebookParameters,
): readonly OverviewRequest[] {
    return rulebook === null
        ? []
        : overviewRequestsFor(heldPlanInputsOf(ledger), rulebook);
}

function engineText<Figures>(
    slot: EngineSlot<Figures> | undefined,
    ready: (figures: Figures) => string,
): string {
    if (slot === undefined) return NOT_APPLICABLE;
    switch (slot.kind) {
        case EngineSlotKind.Failed:
        case EngineSlotKind.Refused: {
            return NOT_AVAILABLE;
        }
        case EngineSlotKind.Pending: {
            return PENDING;
        }
        case EngineSlotKind.Ready: {
            return ready(slot.figures);
        }
    }
}

function engineViewOf(
    engine: OverviewEngine,
    requests: readonly OverviewRequest[],
    hasRulebook: boolean,
): EngineView {
    const plans = new Map<string, PlanEngine>();
    const values = new Map<string, EngineSlot<PlanValuesFigures>>();
    for (const request of requests) {
        if (request.kind === OverviewRequestKind.PlanValues) {
            values.set(
                request.planSerial,
                engineSlotOf(engine, request, (result) =>
                    result.kind === OverviewRequestKind.PlanValues
                        ? result.figures
                        : null,
                ),
            );
            continue;
        }
        if (request.kind !== OverviewRequestKind.DocumentedRun) continue;
        const optimumRequest = requests.find(
            (candidate) =>
                candidate.kind === OverviewRequestKind.PayoutSizeOptimum &&
                candidate.planSerial === request.planSerial,
        );
        plans.set(request.planSerial, {
            documented: engineSlotOf(engine, request, (result) =>
                result.kind === OverviewRequestKind.DocumentedRun
                    ? result.figures
                    : null,
            ),
            documentedRequest: request,
            optimum: engineSlotOf(engine, optimumRequest, (result) =>
                result.kind === OverviewRequestKind.PayoutSizeOptimum
                    ? result.figures
                    : null,
            ),
            optimumRequest,
        });
    }
    return {
        failure: groupFailureOf(engine, OverviewRequestGroup.Policy),
        hasRulebook,
        plans,
        values,
    };
}

function evalValueLossDollarsFor(
    load: PortfolioLoad,
    userId: string,
    today: string,
    accountStates: readonly AccountStateEntry[],
    engine: OverviewEngine,
): ReadonlyMap<string, number> {
    const computed = ledgerOrDateFailure(() =>
        accountFromStateEntriesOf(load, userId, today, accountStates),
    );
    return computed.kind === OverviewSectionStatus.Ready
        ? evalValueLossDollarsOf(computed.value, engine)
        : NO_EVAL_LOSSES;
}

function eventsFrom(
    accountStatesSource: null | PortfolioLoad['ledger'],
): readonly LedgerEventRow[] | undefined {
    if (accountStatesSource === null) return undefined;
    return accountStatesSource.status === OverviewSectionStatus.Ready
        ? accountStatesSource.rows.events
        : undefined;
}

function evSourcesCard(
    ledger: PortfolioLedger,
    names: PlanNames,
    today: string,
    view: EngineView,
    engine: OverviewEngine,
    entries: readonly AccountFromStateEntry[],
): EvSourcesCardModel {
    const realized = new Map(
        realizedAttemptEconomics(
            ledger,
            today,
            realizedHorizonDaysOf(view),
        ).perPlan.map((row) => [row.planSerial, row.realizedEvPerAttempt]),
    );
    const slotOfPlan = (planSerial: string) => ({
        documented: view.plans.get(planSerial)?.documented,
        values: view.values.get(planSerial),
    });
    const fundedEntries = entries.filter((entry) => entry.isFunded);
    const fromStateOf = (entry: AccountFromStateEntry) =>
        engineSlotOf(engine, entry.request, (result) =>
            result.kind === OverviewRequestKind.AccountFromState
                ? result.figures
                : null,
        );
    const planNotes = heldPlanGroupsOf(ledger).flatMap((group) => {
        const { values } = slotOfPlan(group.planSerial);
        if (values?.kind !== EngineSlotKind.Ready) return [];
        const plan = names.of(group.planSerial);
        return [
            ...labelledAssumptionLines(
                `${plan}, fresh funded value`,
                values.figures.freshFundedValue.liveTransfer,
            ),
            ...labelledAssumptionLines(
                `${plan}, fresh funded value`,
                values.figures.freshFundedValue.cumulativePayoutTrigger,
            ),
            ...labelledAssumptionLines(
                `${plan}, fresh eval value`,
                values.figures.valueFreshEval.liveTransfer,
            ),
            ...labelledAssumptionLines(
                `${plan}, fresh eval value`,
                values.figures.valueFreshEval.cumulativePayoutTrigger,
            ),
        ];
    });
    const accountNotes = fundedEntries.flatMap((entry) => {
        const fromState = fromStateOf(entry);
        return fromState.kind === EngineSlotKind.Ready
            ? [
                  ...labelledAssumptionLines(
                      `${entry.label}, value from its own state`,
                      fromState.figures.valueNow.liveTransfer,
                  ),
                  ...labelledAssumptionLines(
                      `${entry.label}, value from its own state`,
                      fromState.figures.valueNow.cumulativePayoutTrigger,
                  ),
              ]
            : [];
    });
    return {
        accounts: fundedEntries.map((entry) => {
            const { values } = slotOfPlan(entry.planSerial);
            const fromState = fromStateOf(entry);
            return {
                account: entry.label,
                freshFundedValue: engineText(values, (figures) =>
                    estimateCurrency(figures.freshFundedValue.creditFree),
                ),
                heldInFundedProgress: heldInFundedProgressText(
                    values,
                    fromState,
                ),
                key: entry.accountId,
                plan: entry.plan,
                valueNow: engineText(fromState, (figures) =>
                    estimateCurrency(figures.valueNow.creditFree),
                ),
            };
        }),
        disclosures: EV_SOURCES_DISCLOSURES,
        heldLabel: EV_FUNDED_PROGRESS_LABEL,
        liveTransferNotes: [...planNotes, ...accountNotes],
        plans: heldPlanGroupsOf(ledger).map((group) => {
            const { documented, values } = slotOfPlan(group.planSerial);
            const realizedEv = realized.get(group.planSerial) ?? null;
            return {
                attemptCost: engineText(documented, (figures) =>
                    estimateCurrency(figures.costPerAttempt),
                ),
                freshFundedValue: engineText(values, (figures) =>
                    estimateCurrency(figures.freshFundedValue.creditFree),
                ),
                key: group.planSerial,
                modeledConversionEv: conversionEvText(documented, values),
                passRate: engineText(documented, (figures) =>
                    estimatePercent(figures.attemptPassProbability),
                ),
                plan: names.of(group.planSerial),
                realizedConversionEv:
                    realizedEv === null
                        ? NOT_APPLICABLE
                        : formatUsdCents(roundCents(realizedEv)),
            };
        }),
    };
}

function evSourcesFor(
    load: PortfolioLoad,
    userId: string,
    today: string,
    accountStates: readonly AccountStateEntry[],
    engine: OverviewEngine,
): OverviewEvSources {
    const ready = readyRowsOf(load, 'Where EV comes from');
    if (ready.kind !== OverviewSectionStatus.Ready) return ready;
    const computed = ledgerOrDateFailure(() => {
        const ledger = PortfolioLedger.fromRows(userId, ready.ledger);
        const view = engineViewOf(
            engine,
            [
                ...engineRequestsOfLedger(ledger, load.rulebook),
                ...valueRequestsOfLedger(ledger, load.rulebook),
            ],
            load.rulebook !== null,
        );
        return evSourcesCard(
            ledger,
            planNames(ledger),
            today,
            view,
            engine,
            accountFromStateEntriesOf(load, userId, today, accountStates),
        );
    });
    return computed.kind === OverviewSectionStatus.Ready
        ? { kind: OverviewSectionStatus.Ready, model: computed.value }
        : {
              kind: OverviewSectionStatus.Failed,
              message: `Where EV comes from could not be computed: ${computed.message} Fix the stored date listed in the alerts.`,
          };
}

function excludedFeeRowsNoteOf(excludedFeeRows: number): null | string {
    if (excludedFeeRows === 0) return null;
    return `${counted({ count: excludedFeeRows, plural: 'fee rows', singular: 'fee row' })} of ledger-only and unmodeled accounts ${excludedFeeRows === 1 ? 'has' : 'have'} no plan to price against and ${excludedFeeRows === 1 ? 'is' : 'are'} not in this table.`;
}

function expectedNetCard(
    names: PlanNames,
    engine: EngineView,
    slots: ReadonlyMap<string, number>,
): ExpectedNetCardModel {
    const plans = [...engine.plans];
    if (plans.length === 0) {
        return {
            disclosures: [],
            refused: [],
            rows: [],
            status: engine.hasRulebook
                ? ExpectedNetStatus.NoPlans
                : ExpectedNetStatus.Pending,
            statusNote: engine.hasRulebook
                ? 'No plan you hold is modeled by the engine, so there is no expected net to compute.'
                : 'The expected net waits for your rulebook to load.',
        };
    }
    const allSlots = plans.flatMap(([, plan]) => [
        plan.documented,
        plan.optimum,
    ]);
    const status = allSlots.some((slot) => slot.kind === EngineSlotKind.Failed)
        ? ExpectedNetStatus.Failed
        : allSlots.some((slot) => slot.kind === EngineSlotKind.Pending)
          ? ExpectedNetStatus.Pending
          : ExpectedNetStatus.Ready;
    const isOptimumComparable = plans.every(
        ([, plan]) =>
            plan.documented.kind !== EngineSlotKind.Ready ||
            plan.optimum.kind === EngineSlotKind.Ready,
    );
    const ranked = payoutPolicySensitivity(
        plans.flatMap(([serial, plan]) =>
            sensitivityEntryOf(serial, plan, isOptimumComparable),
        ),
    );
    const optimumCount = ranked.filter(
        (entry) => entry.optimumRank !== null,
    ).length;
    return {
        disclosures: [
            ...EXPECTED_NET_DISCLOSURES,
            ...plans.flatMap(([serial, plan]) =>
                plan.optimum.kind === EngineSlotKind.Ready &&
                plan.optimum.figures.creditSensitive
                    ? [
                          `${names.of(serial)}: the payout-size optimum is credit sensitive, so the credit-free figures would choose another request size.`,
                      ]
                    : [],
            ),
        ],
        refused: plans.flatMap(([serial, plan]) => [
            ...refusalOf(
                names,
                serial,
                plan.documented,
                plan.documentedRequest,
            ),
            ...(plan.optimumRequest === undefined
                ? []
                : refusalOf(names, serial, plan.optimum, plan.optimumRequest)),
        ]),
        rows: plans.map(([serial, plan]) =>
            expectedNetRow(
                names,
                serial,
                plan,
                slots.get(serial) ?? 0,
                ranked.find((entry) => entry.planKey === serial),
                ranked.length,
                optimumCount,
            ),
        ),
        status,
        statusNote:
            status === ExpectedNetStatus.Failed
                ? `The engine cards could not be computed: ${asSentence(engine.failure ?? NOT_AVAILABLE)}`
                : status === ExpectedNetStatus.Pending
                  ? ENGINE_COMPUTING_NOTE
                  : null,
    };
}

function expectedNetFigure<Figures extends MonthlyNetFigures>(
    slot: EngineSlot<Figures>,
    slotCount: number,
    requestSizeOf: (figures: Figures) => number,
): ExpectedNetFigure {
    switch (slot.kind) {
        case EngineSlotKind.Failed:
        case EngineSlotKind.Refused: {
            return unavailableFigure(NOT_AVAILABLE);
        }
        case EngineSlotKind.Pending: {
            return unavailableFigure(PENDING);
        }
        case EngineSlotKind.Ready: {
            const { figures } = slot;
            return {
                creditFree: estimateCurrency(
                    figures.expectedMonthlyRealizedNet,
                ),
                creditInclusive: estimateCurrency(figures.expectedMonthlyNet),
                requestSize: formatCurrency(requestSizeOf(figures)),
                totalCreditFree: formatCurrency(
                    figures.expectedMonthlyRealizedNet.value * slotCount,
                ),
            };
        }
    }
}

function expectedNetKpi(
    engine: EngineView,
    slots: ReadonlyMap<string, number>,
): OverviewKpi {
    const base = {
        kind: OverviewKpiKind.ExpectedNet,
        label: 'Expected net per slot per month',
        note: null,
    } as const;
    const held = [...engine.plans].flatMap(([serial, plan]) => {
        const count = slots.get(serial) ?? 0;
        return count > 0 ? [{ count, plan }] : [];
    });
    if (engine.plans.size === 0 && !engine.hasRulebook) {
        return {
            ...base,
            detail: EXPECTED_NET_PENDING_DETAIL,
            tone: KpiTone.Pending,
            value: PENDING,
        };
    }
    if (held.length === 0) {
        return {
            ...base,
            detail: NO_ACTIVE_FUNDED_SLOT,
            tone: KpiTone.Neutral,
            value: NOT_APPLICABLE,
        };
    }
    if (
        held.some(({ plan }) => plan.documented.kind === EngineSlotKind.Failed)
    ) {
        return {
            ...base,
            detail: `The engine cards could not be computed: ${asSentence(engine.failure ?? NOT_AVAILABLE)}`,
            tone: KpiTone.Neutral,
            value: NOT_APPLICABLE,
        };
    }
    if (
        held.some(({ plan }) => plan.documented.kind === EngineSlotKind.Pending)
    ) {
        return {
            ...base,
            detail: EXPECTED_NET_PENDING_DETAIL,
            tone: KpiTone.Pending,
            value: PENDING,
        };
    }
    const answered = held.flatMap(({ count, plan }) =>
        plan.documented.kind === EngineSlotKind.Ready
            ? [{ count, figures: plan.documented.figures }]
            : [],
    );
    const totalSlots = answered.reduce((sum, row) => sum + row.count, 0);
    if (totalSlots === 0) {
        return {
            ...base,
            detail: 'Every plan you hold with an active funded slot was refused by the engine; the refusals are listed in the expected net card.',
            tone: KpiTone.Neutral,
            value: NOT_APPLICABLE,
        };
    }
    const weighted = (
        pick: (figures: DocumentedRunFigures) => number,
    ): number =>
        answered.reduce((sum, row) => sum + pick(row.figures) * row.count, 0) /
        totalSlots;
    const creditFree = weighted(
        (figures) => figures.expectedMonthlyRealizedNet.value,
    );
    const creditInclusive = weighted(
        (figures) => figures.expectedMonthlyNet.value,
    );
    const trials = answered[0]?.figures.trials ?? 0;
    const excludedSlots =
        held.reduce((sum, row) => sum + row.count, 0) - totalSlots;
    const exclusion =
        excludedSlots === 0
            ? ''
            : ` (${counted({ count: excludedSlots, plural: 'active funded slots', singular: 'active funded slot' })} not counted because the engine refused ${excludedSlots === 1 ? 'its plan' : 'their plans'})`;
    return {
        ...base,
        detail: `Under your documented rule, credit-free (credit-inclusive ${formatCurrency(creditInclusive)}), weighted over ${counted({ count: totalSlots, plural: 'active funded slots', singular: 'active funded slot' })}${exclusion}; fresh start, ${formatTrials(trials)}`,
        tone: toneOf(creditFree),
        value: formatCurrency(creditFree),
    };
}

function expectedNetLabels(plan: PlanEngine): ExpectedNetLabels {
    const { enginePolicy, run } = plan.documentedRequest.spec;
    const ready =
        plan.documented.kind === EngineSlotKind.Ready
            ? plan.documented.figures
            : null;
    return {
        creditBasis: CREDIT_BASIS_LABEL,
        lifetimeCapBasis: lifetimeCapBasisText(
            enginePolicy.lifetimePayoutCapBasis,
            enginePolicy.lifetimePayoutCapOverride,
        ),
        payoutPolicy: payoutPolicyLabel(
            ready?.payoutRequestSize ??
                overviewDocumentedRequestOf(plan.documentedRequest),
        ),
        retainedCushion: retainedCushionLabel(
            enginePolicy,
            ready?.minRetainedCushion ?? null,
        ),
        startBasis: START_BASIS_LABEL[StartBasis.Fresh],
        trials: formatTrials(ready?.trials ?? run.trials),
    };
}

function expectedNetRow(
    names: PlanNames,
    serial: string,
    plan: PlanEngine,
    slotCount: number,
    rank: PayoutPolicySensitivityRankedEntry | undefined,
    rankedCount: number,
    optimumCount: number,
): ExpectedNetRow {
    return {
        activeSlots: String(slotCount),
        documented: expectedNetFigure(
            plan.documented,
            slotCount,
            (figures) => figures.payoutRequestSize,
        ),
        key: serial,
        labels: expectedNetLabels(plan),
        liveTransferNotes: liveTransferNotesOf(plan),
        optimum: expectedNetFigure(
            plan.optimum,
            slotCount,
            (figures) => figures.requestSize,
        ),
        plan: names.of(serial),
        policySensitiveNote:
            rank?.payoutPolicySensitive === true
                ? 'Payout-policy sensitive: the plan order changes under the payout-size optimum.'
                : null,
        rankDocumented:
            rank === undefined
                ? NOT_APPLICABLE
                : `${String(rank.documentedRank)} of ${String(rankedCount)}`,
        rankOptimum:
            rank?.optimumRank === null || rank?.optimumRank === undefined
                ? NOT_APPLICABLE
                : `${String(rank.optimumRank)} of ${String(optimumCount)}`,
    };
}

function expectedValuePlanSerialsOf(
    ledger: PortfolioLedger,
    view: EngineView,
): null | ReadonlySet<string> {
    const answered = new Set<string>();
    for (const group of heldPlanGroupsOf(ledger)) {
        const slot = view.plans.get(group.planSerial)?.documented;
        if (slot?.kind === EngineSlotKind.Ready) {
            answered.add(group.planSerial);
        } else if (slot?.kind !== EngineSlotKind.Refused) {
            return null;
        }
    }
    return answered;
}

function exposureAccountRow(
    row: AccountExposure,
    accounts: ReadonlyMap<string, OverviewAccountRow>,
): ExposureAccountRow {
    return {
        account: accounts.get(row.accountId)?.label ?? row.accountId,
        basis: EXPOSURE_BASIS_LABEL[row.basis],
        cushion: formatCurrency(row.cushion),
        firstTradeRisk: formatCurrency(row.firstTradeRisk),
        key: row.accountId,
        maxDailyLoss: formatCurrency(row.maxDailyLoss),
        shareOfCushionAtRisk: formatOptionalPercent(row.shareOfCushionAtRisk),
    };
}

function exposureCard(
    exposure: Exposure,
    accounts: ReadonlyMap<string, OverviewAccountRow>,
    copyGroups: readonly AlertCopyGroupRow[],
): ExposureCardModel {
    const groupNames = new Map(
        copyGroups.map((group) => [group.id, group.name]),
    );
    return {
        accounts: exposure.accounts.map((row) =>
            exposureAccountRow(row, accounts),
        ),
        disclosures: EXPOSURE_DISCLOSURES,
        groups: exposure.groups.map((group) =>
            exposureGroupRow(group, accounts, groupNames),
        ),
        unavailable: exposure.unavailable.map((row) =>
            unavailableAccountRow(
                row.accountId,
                accounts,
                exposureUnavailableText(
                    accounts.get(row.accountId),
                    row.reason,
                ),
            ),
        ),
    };
}

function exposureFor(
    load: PortfolioLoad,
    accountStates: readonly AccountStateEntry[],
): OverviewExposure {
    const failed = boardFailures(load);
    if (failed.length > 0) {
        return {
            kind: OverviewSectionStatus.Failed,
            message: `The exposure could not be computed because your ${sourceList(failed)} could not be loaded.`,
        };
    }
    if (
        load.alerts.status !== OverviewSectionStatus.Ready ||
        load.ledger.status !== OverviewSectionStatus.Ready
    ) {
        return { kind: OverviewSectionStatus.Pending };
    }
    const { accounts, copyGroups, rulebook } = load.alerts.rows;
    const active = new Map(
        accounts
            .filter((account) => isActiveAccount(account))
            .map((account) => [account.id, account]),
    );
    const entries = accountStates.flatMap((entry): ExposureEntry[] => {
        const account = active.get(entry.accountId);
        return account === undefined
            ? []
            : [{ ...entry, copyGroupId: account.copyGroupId }];
    });
    return {
        kind: OverviewSectionStatus.Ready,
        model: exposureCard(exposureOf(rulebook, entries), active, copyGroups),
    };
}

function exposureGroupRow(
    group: CopyGroupExposure,
    accounts: ReadonlyMap<string, OverviewAccountRow>,
    names: ReadonlyMap<string, string>,
): ExposureGroupRow {
    return {
        accounts: group.accountIds
            .map((accountId) => accounts.get(accountId)?.label ?? accountId)
            .join(', '),
        group: names.get(group.copyGroupId) ?? group.copyGroupId,
        key: group.copyGroupId,
        maxDailyLoss: formatCurrency(group.maxDailyLoss),
        note: `Treated as one correlated bet: ${String(group.accountIds.length)} accounts copy the same trades, so up to ${formatCurrency(group.maxDailyLoss)} of the ${formatCurrency(group.totalCushion)} combined cushion can be lost in one day.`,
        shareOfCushionAtRisk: formatOptionalPercent(group.shareOfCushionAtRisk),
        totalCushion: formatCurrency(group.totalCushion),
    };
}

function firmAttemptThroughputRow(
    row: AttemptThroughput['perFirm'][number],
    firms: FirmNames,
): FirmAttemptThroughputRow {
    return {
        firm: firms.of(row.firmKey),
        key: firmKeyId(row.firmKey),
        meanPerMonth: row.meanPerMonth.toFixed(2),
        months: attemptThroughputMonthRows(row.months),
    };
}

function firmCoverageNoteOf(row: FirmReturn): null | string {
    const parts = [
        row.unresolvedAccounts === 0
            ? null
            : counted({
                  count: row.unresolvedAccounts,
                  plural: 'accounts with a plan that is no longer modeled',
                  singular: 'account with a plan that is no longer modeled',
              }),
        row.ledgerOnlyAccounts === 0
            ? null
            : counted({
                  count: row.ledgerOnlyAccounts,
                  plural: 'ledger-only accounts',
                  singular: 'ledger-only account',
              }),
    ].filter((part): part is string => part !== null);
    if (parts.length === 0) return null;
    const total = row.unresolvedAccounts + row.ledgerOnlyAccounts;
    return `${joinWithAnd(parts)} ${total === 1 ? 'has' : 'have'} no timeline in this firm row.`;
}

function firmDateText(entry: FirmVerificationDate): string {
    const label = firmKeyLabel(
        { firmId: entry.firmId, kind: FirmKeyKind.Modeled },
        [],
    );
    return `${label} ${entry.verifiedOn}`;
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

function firmImpliedAttemptsText(
    row: CostAnalytics['byFirmAttemptCost'][number],
): string {
    const leftOut = [
        row.plansWithoutListPrice === 0
            ? null
            : counted({
                  count: row.plansWithoutListPrice,
                  plural: 'plans without a list price',
                  singular: 'plan without a list price',
              }),
        row.accountsWithoutPlan === 0
            ? null
            : counted({
                  count: row.accountsWithoutPlan,
                  plural: 'accounts without a plan',
                  singular: 'account without a plan',
              }),
    ].filter((part): part is string => part !== null);
    const implied = row.impliedAttempts.toFixed(2);
    return leftOut.length === 0
        ? implied
        : `${implied} (leaves out ${joinWithAnd(leftOut)})`;
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
        coverageNote: firmCoverageNoteOf(row),
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

function firmTotalSourceOf(groups: readonly PlanGroup[]): null | PolicyQuote {
    for (const group of groups) {
        const source = confirmedTriggerSource(
            liveTriggersOf(group),
            LiveTriggerKind.PayoutCountTotal,
        );
        if (source !== null) return source;
    }
    return null;
}

function followedRecommendationsKpi(load: PortfolioLoad): OverviewKpi {
    const base = {
        kind: OverviewKpiKind.FollowedRecommendations,
        label: 'Followed recommendations',
        note: null,
    } as const;
    const { decisions, rulebook } = load;
    switch (decisions.status) {
        case OverviewSectionStatus.Failed: {
            return {
                ...base,
                detail: `Your ${sourceList(decisions.failed)} could not be loaded`,
                tone: KpiTone.Neutral,
                value: NOT_APPLICABLE,
            };
        }
        case OverviewSectionStatus.Pending: {
            return {
                ...base,
                detail: 'Pending your sizing decisions',
                tone: KpiTone.Pending,
                value: PENDING,
            };
        }
        case OverviewSectionStatus.Ready: {
            if (rulebook === null) {
                return {
                    ...base,
                    detail: 'Your rulebook is needed to read the rounding step',
                    tone: KpiTone.Neutral,
                    value: NOT_APPLICABLE,
                };
            }
            const stepCents = rulebook.eval.roundingStepCents;
            const adherence = decisionAdherenceOf(decisions.rows, stepCents);
            if (adherence.total === 0) {
                return {
                    ...base,
                    detail: 'No sizing decision recorded yet',
                    tone: KpiTone.Neutral,
                    value: NOT_APPLICABLE,
                };
            }
            if (adherence.rate === null) {
                return {
                    ...base,
                    detail: `No decision has an actual risk entered yet (${String(adherence.notRecorded)} recorded without one)`,
                    tone: KpiTone.Neutral,
                    value: NOT_APPLICABLE,
                };
            }
            const unrecorded =
                adherence.notRecorded === 0
                    ? ''
                    : `; ${String(adherence.notRecorded)} without an actual risk entered, not counted`;
            return {
                ...base,
                detail: `n = ${String(adherence.measured)}; the actual risk within ${formatUsdCents(usdCents(stepCents))} of the accepted risk (${ADHERENCE_STEP_REASON})${unrecorded}`,
                note: ADHERENCE_BASIS_NOTE,
                tone: KpiTone.Neutral,
                value: formatPercent(adherence.rate),
            };
        }
    }
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

function formatSampledCount(estimate: null | SampledEstimate): string {
    return estimate === null
        ? NOT_APPLICABLE
        : `${estimate.value.toFixed(2)}, n = ${String(estimate.n)}`;
}

function formatSampledRate(
    estimate: null | SampledEstimate,
    kind: SampleKind,
    thresholds: SampleThresholds,
): string {
    const level = sampleAdequacy(kind, estimate?.n ?? 0, thresholds);
    const levelText = level === null ? '' : `, ${SAMPLE_LEVEL_LABEL[level]}`;
    const figure =
        estimate === null
            ? `${NOT_APPLICABLE} (n = 0)`
            : formatSampledRateWithoutLevel(estimate);
    return `${figure}${levelText}`;
}

function formatSampledRateWithoutLevel(estimate: SampledEstimate): string {
    const ciText =
        estimate.interval === null
            ? ''
            : ` (95% CI ${formatPercent(estimate.interval.lower)} to ${formatPercent(estimate.interval.upper)}, n = ${String(estimate.n)})`;
    const nText =
        estimate.interval === null ? ` (n = ${String(estimate.n)})` : '';
    return `${formatPercent(estimate.value)}${ciText}${nText}`;
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
    engine: EngineView,
): FundedPayoutsCardModel {
    const distribution = fundedPayoutDistribution(
        ledger,
        today,
        realizedHorizonDaysOf(engine),
    );
    const isModeled = readyDocumentedFigures(engine) !== null;
    return {
        disclosures: [
            realizedHorizonDisclosureOf(engine),
            isModeled
                ? MODELED_PAYOUT_DISTRIBUTION_READY
                : MODELED_PAYOUT_DISTRIBUTION_PENDING,
        ],
        horizonDays: distribution.horizonDays,
        payoutCountCap: PAYOUT_COUNT_CAP,
        rows: distribution.perPlan.map((row) => {
            const modeled = documentedSlotOf(engine, row.planSerial);
            const ready =
                modeled?.kind === EngineSlotKind.Ready ? modeled.figures : null;
            return {
                counts: row.counts.map(String),
                fundedValueFlag:
                    ready === null
                        ? null
                        : fundedValueFlagOf(row.realizedFundedValue, ready),
                key: row.planSerial,
                modeledCounts:
                    ready === null ||
                    ready.fundedPayoutCountDistribution.length === 0
                        ? null
                        : ready.fundedPayoutCountDistribution.map((share) =>
                              formatPercent(share),
                          ),
                modeledFundedValue: engineText(modeled, (figures) =>
                    estimateCurrency(figures.expectedPayoutPerFundedAccount),
                ),
                modeledProbabilities:
                    ready === null ||
                    ready.fundedPayoutCountDistribution.length === 0
                        ? null
                        : ready.fundedPayoutCountDistribution,
                openAccounts: String(row.openAccounts),
                plan: names.of(row.planSerial),
                realizedFundedValue: formatSampledCents(
                    row.realizedFundedValue,
                ),
                realizedProbabilities: row.probabilities,
            };
        }),
    };
}

function fundedValueFlagOf(
    realized: null | SampledEstimate,
    figures: DocumentedRunFigures,
): null | string {
    if (realized === null) return null;
    const realizedDollars: UncertainValue = {
        standardError:
            realized.standardError === null
                ? null
                : realized.standardError / CENTS_PER_DOLLAR,
        value: realized.value / CENTS_PER_DOLLAR,
    };
    return isBeyondNoise(
        realizedDollars,
        figures.expectedPayoutPerFundedAccount,
        { sharedSeed: false },
    )
        ? `Differs from the engine beyond noise: realized ${formatCurrency(realizedDollars.value)} vs engine ${formatCurrency(figures.expectedPayoutPerFundedAccount.value)}.`
        : null;
}

function funnelCard(
    ledger: PortfolioLedger,
    firms: FirmNames,
    names: PlanNames,
    today: string,
    sampleThresholds: SampleThresholds,
    violations: PortfolioLoad['violations'],
    decisions: PortfolioLoad['decisions'],
    engine: EngineView,
): FunnelCardModel {
    const funnel = stageFunnel(ledger);
    const payoutRates = realizedPayoutRates(
        ledger,
        today,
        realizedHorizonDaysOf(engine),
    );
    const weaknessAnalysis = funnelWeaknessesOf(ledger, names, engine, today);
    const bustSplit =
        violations.status === OverviewSectionStatus.Ready &&
        decisions.status === OverviewSectionStatus.Ready
            ? bustSplitByFirm(ledger, decisions.rows, violations.rows)
            : null;
    return {
        biggestWeakness: biggestWeaknessLine(weaknessAnalysis, engine),
        diagnosticIssues: weaknessAnalysis.issues,
        disclosures: [
            realizedHorizonDisclosureOf(engine),
            bustSplitDisclosureFor(violations, decisions),
            ...(funnel.byFirm.length === 0 ? [] : [MAJORITY_VOTE_RULE]),
        ],
        rows: funnel.byFirm.map((row) => {
            const payoutRate =
                payoutRates.perFirm.find(
                    (candidate) =>
                        firmKeyId(candidate.firmKey) === firmKeyId(row.firmKey),
                )?.payoutRate ?? null;
            const busts = bustSplit?.get(firmKeyId(row.firmKey)) ?? {
                structuralBusts: 0,
                unknownBusts: 0,
                withinPlanBusts: 0,
            };
            return {
                fees: formatUsdCents(row.feesCents),
                firm: firms.of(row.firmKey),
                firstPayout: stageCountText(row, FunnelCohortStage.FirstPayout),
                funded: stageCountText(row, FunnelCohortStage.Funded),
                key: firmKeyId(row.firmKey),
                movedLive: stageCountText(row, FunnelCohortStage.MovedLive),
                net: formatUsdCents(row.netCents),
                netPayouts: formatUsdCents(row.netPayoutsCents),
                passed: stageCountText(row, FunnelCohortStage.Passed),
                payoutRate: formatSampledRate(
                    payoutRate,
                    SampleKind.FundedAccounts,
                    sampleThresholds,
                ),
                purchased: stageCountText(row, FunnelCohortStage.Purchased),
                structuralBusts:
                    bustSplit === null
                        ? NOT_APPLICABLE
                        : String(busts.structuralBusts),
                unknownBusts:
                    bustSplit === null
                        ? NOT_APPLICABLE
                        : String(busts.unknownBusts),
                withinPlanBusts:
                    bustSplit === null
                        ? NOT_APPLICABLE
                        : String(busts.withinPlanBusts),
            };
        }),
        stageDollars: funnel.byFirm.flatMap((row) =>
            FUNNEL_COHORT_STAGES.map(({ label, stage }) => ({
                fees: formatUsdCents(row.stages[stage].feesCents),
                firm: firms.of(row.firmKey),
                key: `${firmKeyId(row.firmKey)}-${stage}`,
                net: formatUsdCents(row.stages[stage].netCents),
                netPayouts: formatUsdCents(row.stages[stage].netPayoutsCents),
                stage: label,
            })),
        ),
        unresolvedNote: combinedNote(
            unresolvedNote(funnel.unresolvedAccounts),
            ledgerOnlyFunnelNote(funnel.ledgerOnlyAccounts),
        ),
        untestedWeaknesses: weaknessAnalysis.untestedRows,
        weaknesses: weaknessAnalysis.rows,
    };
}

function funnelNoiseVerdictsOf(
    row: PlanAttemptEconomics,
    figures: DocumentedRunFigures,
): Readonly<
    Partial<Record<FunnelStage.PassRate | FunnelStage.PayoutRate, boolean>>
> {
    return {
        ...(row.passRate !== null && {
            [FunnelStage.PassRate]: isBeyondNoise(
                row.passRate,
                figures.attemptPassProbability,
                { sharedSeed: false },
            ),
        }),
        ...(row.payoutRate !== null && {
            [FunnelStage.PayoutRate]: isBeyondNoise(
                row.payoutRate,
                figures.anyPayoutGivenFundedProbability,
                { sharedSeed: false },
            ),
        }),
    };
}

function funnelStageFiguresOf(
    row: PlanAttemptEconomics,
    figures: DocumentedRunFigures,
): null | { modeled: FunnelStageFigures; realized: FunnelStageFigures } {
    const averagePayout = averagePayoutOf(figures);
    const perPaid = payoutsPerPaidFundedOf(figures);
    if (
        averagePayout === null ||
        perPaid === null ||
        row.attemptCost === null ||
        row.averagePayout === null ||
        row.passRate === null ||
        row.payoutRate === null ||
        row.payoutsPerPaidFunded === null
    ) {
        return null;
    }
    return {
        modeled: {
            attemptCost: figures.costPerAttempt.value,
            averagePayout,
            passRate: figures.attemptPassProbability.value,
            payoutRate: figures.anyPayoutGivenFundedProbability.value,
            payoutsPerPaidFunded: perPaid,
        },
        realized: {
            attemptCost: row.attemptCost / CENTS_PER_DOLLAR,
            averagePayout: row.averagePayout.value / CENTS_PER_DOLLAR,
            passRate: row.passRate.value,
            payoutRate: row.payoutRate.value,
            payoutsPerPaidFunded: row.payoutsPerPaidFunded,
        },
    };
}

function funnelStageGapText(stage: FunnelStageDiagnosis): string {
    return `${FUNNEL_STAGE_LABEL[stage.stage]}: ${formatCurrency(stage.dollarChangePerAttempt, 2)} per attempt, ${formatCurrency(stage.dollarChangePerMonth, 2)} per month versus the engine`;
}

function funnelWeaknessesOf(
    ledger: PortfolioLedger,
    names: PlanNames,
    engine: EngineView,
    today: string,
): FunnelWeaknessAnalysis {
    const economics = realizedAttemptEconomics(
        ledger,
        today,
        realizedHorizonDaysOf(engine),
    );
    const found = economics.perPlan.flatMap((row): PlanFunnelFinding[] => {
        const slot = documentedSlotOf(engine, row.planSerial);
        if (slot?.kind !== EngineSlotKind.Ready) return [];
        const stageFigures = funnelStageFiguresOf(row, slot.figures);
        if (stageFigures === null) return [];
        const plan = names.of(row.planSerial);
        const diagnostic = funnelDiagnostic(
            stageFigures.realized,
            stageFigures.modeled,
            planAttemptsPerMonth(ledger, row.planSerial, today),
            funnelNoiseVerdictsOf(row, slot.figures),
        );
        if (diagnostic.stages === null) {
            return diagnostic.reason === FunnelDiagnosticReason.InvalidFigures
                ? [
                      {
                          dollarChangePerMonth: 0,
                          issue: {
                              key: row.planSerial,
                              plan,
                              text: FUNNEL_DIAGNOSTIC_INVALID_TEXT,
                          },
                          row: null,
                          untested: null,
                          untestedRows: [],
                      },
                  ]
                : [];
        }
        const losing = diagnostic.stages.filter(
            (stage) => stage.dollarChangePerAttempt < 0,
        );
        const worst = losing.find((stage) => stage.isBeyondNoise === true);
        const [largest] = losing;
        return [
            {
                dollarChangePerMonth: worst?.dollarChangePerMonth ?? 0,
                issue: null,
                row:
                    worst === undefined
                        ? null
                        : {
                              key: row.planSerial,
                              plan,
                              text: `${funnelStageGapText(worst)}.`,
                          },
                untested:
                    largest?.isBeyondNoise === null
                        ? {
                              key: row.planSerial,
                              plan,
                              stage: FUNNEL_STAGE_LABEL[largest.stage],
                          }
                        : null,
                untestedRows: losing
                    .filter((stage) => stage.isBeyondNoise === null)
                    .map((stage) => ({
                        key: `${row.planSerial}-${stage.stage}`,
                        plan,
                        text: `${funnelStageGapText(stage)}; not tested for noise.`,
                    })),
            },
        ];
    });
    return {
        issues: found.flatMap((entry) =>
            entry.issue === null ? [] : [entry.issue],
        ),
        rows: found
            .toSorted((a, b) => a.dollarChangePerMonth - b.dollarChangePerMonth)
            .flatMap((entry) => (entry.row === null ? [] : [entry.row])),
        untested: found.flatMap((entry) =>
            entry.untested === null ? [] : [entry.untested],
        ),
        untestedRows: found.flatMap((entry) => entry.untestedRows),
    };
}

function hasError(error: unknown): boolean {
    return error !== null && error !== undefined;
}

function heldInFundedProgressText(
    values: EngineSlot<PlanValuesFigures> | undefined,
    fromState: EngineSlot<AccountFromStateFigures>,
): string {
    if (values === undefined) return NOT_APPLICABLE;
    if (
        values.kind === EngineSlotKind.Ready &&
        fromState.kind === EngineSlotKind.Ready
    ) {
        const progress = fundedProgressValue({
            freshFundedValue: dollars(
                values.figures.freshFundedValue.creditFree.value,
            ),
            valueNow: dollars(fromState.figures.valueNow.creditFree.value),
        });
        return progress.value === null
            ? NOT_AVAILABLE
            : formatCurrency(progress.value);
    }
    return values.kind === EngineSlotKind.Pending ||
        fromState.kind === EngineSlotKind.Pending
        ? PENDING
        : NOT_AVAILABLE;
}

function heldPlanInputsOf(
    ledger: PortfolioLedger,
): readonly OverviewProjectionPlanInput[] {
    const stats = replacementStats(ledger);
    return heldPlanGroupsOf(ledger).map((group) => ({
        accounts: group.accounts.filter((entry) => isActiveAccount(entry.row))
            .length,
        firmId: group.firmId,
        measuredRebuyLag: measuredRebuyLagOfDefault(
            rebuyLagDefault(stats, group.planSerial),
        ),
        optIns: overviewPlanOptInsOf(group.plan),
        planSerial: group.planSerial,
    }));
}

function householdNoteOf(
    firmIds: readonly FirmId[],
    firms: FirmNames,
): null | string {
    if (firmIds.length === 0) return null;
    const labels = joinWithAnd(
        firmIds.map((firmId) =>
            firms.of(firmKeyOf({ externalFirmId: null, firmId })),
        ),
    );
    return `${labels} ${firmIds.length === 1 ? 'counts' : 'count'} a household's accounts together; accounts held by others in your household are not in these figures.`;
}

function hubSetupCardOf(checklist: SetupChecklist): SetupChecklistCardModel {
    const card = setupChecklistCardOf(checklist);
    const shown = card.steps.filter(
        (step) =>
            step.status !== SetupStepStatus.NotChecked &&
            step.status !== SetupStepStatus.NotApplicable,
    );
    return {
        ...card,
        isComplete:
            shown.every((step) => step.status !== SetupStepStatus.Missing) &&
            shown.some(
                (step) =>
                    step.key !== SetupStep.BudgetSet &&
                    step.status === SetupStepStatus.Done,
            ),
        totalSteps: shown.length,
    };
}

function independentCountsText(
    raw: number,
    independent: number,
    unit: Pick<Counted, 'plural' | 'singular'>,
): string {
    return `${counted({ count: raw, ...unit })}, ${String(independent)} independent`;
}

function isAccountTriggerUnverified(group: PlanGroup): boolean {
    const triggers = liveTriggersOf(group);
    return (
        triggers.some(
            (trigger) => trigger instanceof PayoutCountPerAccountTrigger,
        ) || !isLiveTriggerListChecked(triggers)
    );
}

function isFailed(query: PortfolioQuery<unknown> | undefined): boolean {
    return (
        query !== undefined && query.data === undefined && hasError(query.error)
    );
}

function isFirmTriggerUnverified(groups: readonly PlanGroup[]): boolean {
    return groups.some((group) => {
        const triggers = liveTriggersOf(group);
        return (
            triggers.some(
                (trigger) => trigger instanceof PayoutCountTotalTrigger,
            ) || !isLiveTriggerListChecked(triggers)
        );
    });
}

function isLiveTriggerListChecked(
    triggers: readonly LiveTransitionTrigger[],
): boolean {
    return (
        triggers.length > 0 &&
        triggers.every((trigger) => trigger.kind !== LiveTriggerKind.NotChecked)
    );
}

function isStale(query: PortfolioQuery<unknown> | undefined): boolean {
    return query?.data !== undefined && hasError(query.error);
}

function kpiRow(
    ledger: PortfolioLedger,
    today: string,
    perSlot: RealizedNetPerSlot,
    expectedNet: OverviewKpi,
): OverviewKpi[] {
    const roi = portfolioRoi(ledger, today);
    const { cash } = roi;
    const cashNote = combinedNote(
        futureDatedRowsNoteOf(roi.futureDatedRows),
        undatedPaidPayoutsCaveatOf(roi.undatedPaidPayouts),
    );
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
            note: cashNote,
            tone: KpiTone.Neutral,
            value: formatUsdCents(cash.spend),
        },
        {
            detail: paidPayoutsDetail(cash.paidPayouts, cash.grossOnlyPayouts),
            kind: OverviewKpiKind.PayoutsReceived,
            label: 'Payouts received',
            note: cashNote,
            tone: KpiTone.Neutral,
            value: formatUsdCents(cash.payouts),
        },
        {
            detail: 'Payouts received minus spend',
            kind: OverviewKpiKind.Net,
            label: 'Net',
            note: cashNote,
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
        expectedNet,
        {
            detail:
                roi.total.value === null
                    ? 'No spend recorded yet'
                    : `${ROI_BASIS_LABEL[roi.annualised.basis]}: ${formatOptionalPercent(roi.annualised.value)}`,
            kind: OverviewKpiKind.Roi,
            label: ROI_BASIS_LABEL[roi.total.basis],
            note: cashNote,
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
            note: cashNote,
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
    bankrollParameters: BankrollParameters,
    violations: PortfolioLoad['violations'],
    decisions: PortfolioLoad['decisions'],
    engine: EngineView,
    realizedRisk: null | RealizedLossRisk,
    unreadableTagAccounts: readonly OverviewAccountRow[],
): OverviewLedgerCards {
    const names = planNames(ledger);
    const statement = monthlyStatement(ledger, today, statementTargets);
    const perSlot = realizedNetPerSlot(ledger, today);
    const capUsage = planCapUsage(ledger);
    const slots = activeSlotsOf(capUsage);
    return {
        attemptEconomics: attemptEconomicsCard(
            ledger,
            names,
            today,
            sampleThresholds,
            engine,
        ),
        attemptThroughput: attemptThroughputCard(ledger, firms, today),
        bankroll: bankrollCard(
            ledger,
            today,
            sampleThresholds,
            bankrollParameters,
            capUsage,
            realizedRisk,
        ),
        capUsage: capUsageCard(capUsage, names),
        cost: costCard(ledger, names, firms, sampleThresholds, engine),
        diversification: diversificationCard(ledger, firms),
        expectedNet: expectedNetCard(names, engine, slots),
        firmReturns: firmReturnsCard(ledger, firms, sampleThresholds),
        fundedPayouts: fundedPayoutsCard(ledger, names, today, engine),
        funnel: funnelCard(
            ledger,
            firms,
            names,
            today,
            sampleThresholds,
            violations,
            decisions,
            engine,
        ),
        kpis: kpiRow(ledger, today, perSlot, expectedNetKpi(engine, slots)),
        liveProximity: liveProximityCard(
            ledger,
            today,
            names,
            firms,
            snapshots,
        ),
        notices: ledgerNotices(ledger, today, unreadableTagAccounts),
        outcomes: outcomesCard(ledger, names, sampleThresholds, engine),
        payoutSizes: payoutSizesCard(
            ledger,
            firms,
            snapshots,
            retainedCushionCents,
        ),
        payoutTiming: payoutTimingCardOf(
            payoutTiming(ledger, today),
            names,
            sampleThresholds,
        ),
        pooledCaps: pooledCapCard(ledger, names, firms),
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
        tiltVariance: tiltVarianceCard(ledger, firms, violations),
        timeline: timelineCard(ledger),
    };
}

function ledgerLoad(queries: PortfolioQueries): SectionLoad<LedgerRows> {
    const accounts = queries[PortfolioSource.Accounts].data;
    const events = queries[PortfolioSource.Events].data;
    const fees = queries[PortfolioSource.Fees].data;
    const payouts = queries[PortfolioSource.Payouts].data;
    const snapshots = queries[PortfolioSource.Snapshots].data;
    const transfers = queries[PortfolioSource.Transfers].data;
    return accounts === undefined ||
        events === undefined ||
        fees === undefined ||
        payouts === undefined ||
        snapshots === undefined ||
        transfers === undefined
        ? loadGap(queries, LEDGER_SOURCES)
        : {
              rows: { accounts, events, fees, payouts, snapshots, transfers },
              status: OverviewSectionStatus.Ready,
          };
}

function ledgerNotices(
    ledger: PortfolioLedger,
    today: string,
    unreadableTagAccounts: readonly OverviewAccountRow[],
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
    if (unreadableTagAccounts.length > 0) {
        const isSingular = unreadableTagAccounts.length === 1;
        notices.push({
            kind: OverviewNoticeKind.CorruptTags,
            message: `${counted({ count: unreadableTagAccounts.length, plural: 'accounts', singular: 'account' })} ${isSingular ? 'has' : 'have'} saved tags that cannot be read (${unreadableTagAccounts.map((account) => account.label).join(', ')}), so they show as none; ${isSingular ? 'saving the account' : 'saving each account'} with at least one tag replaces them.`,
        });
    }
    if (undatedPaidPayouts > 0) {
        const isSingular = undatedPaidPayouts === 1;
        notices.push({
            kind: OverviewNoticeKind.UndatedPaidPayouts,
            message: `${counted({ count: undatedPaidPayouts, plural: 'paid payouts', singular: 'paid payout' })} ${isSingular ? 'has' : 'have'} no paid date; ${isSingular ? 'it is' : 'they are'} left out of the as-of cash totals and of every month, while the firm and plan tables still count ${isSingular ? 'it' : 'them'}.`,
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

function lifetimeCapBasisText(
    basis: LifetimePayoutCapBasis,
    override: null | number,
): string {
    switch (basis) {
        case LifetimePayoutCapBasis.LiveTriggersNotChecked: {
            return 'Lifetime cap: live triggers not checked (optimistic)';
        }
        case LifetimePayoutCapBasis.VerifiedCountTrigger: {
            return `Lifetime payout cap of ${String(override ?? 0)} payouts (verified count trigger)`;
        }
        case LifetimePayoutCapBasis.VerifiedNoCountTrigger: {
            return 'Lifetime cap: no count trigger (verified)';
        }
    }
}

function liveProximityCard(
    ledger: PortfolioLedger,
    today: string,
    names: PlanNames,
    firms: FirmNames,
    snapshots: readonly OverviewSnapshotRow[],
): LiveProximityCardModel {
    const proximity = liveTransitionProximity(
        ledger,
        today,
        reportedPayoutsTakenOf(snapshots),
    );
    const groups = ledger.planGroups();
    const located = new Map(
        groups.flatMap((group) =>
            group.accounts.map(
                (entry) => [entry.row.id, { entry, group }] as const,
            ),
        ),
    );
    const open = proximity.byAccount.filter((row) => {
        const entry = located.get(row.accountId)?.entry;
        return (
            entry?.row.stage === AccountStage.Funded &&
            !isEndedStatus(entry.row.status)
        );
    });
    const openFirmIds = new Set(open.map((row) => row.firmId));
    const openGroups = new Set(
        open.flatMap((row) => {
            const group = located.get(row.accountId)?.group;
            return group === undefined ? [] : [group];
        }),
    );
    const unverified = open.filter((row) => {
        const group = located.get(row.accountId)?.group;
        return (
            row.status !== LiveProximityStatus.Verified &&
            (group === undefined || isAccountTriggerUnverified(group))
        );
    });
    return {
        accounts: open.flatMap((row) => {
            const found = located.get(row.accountId);
            return found !== undefined &&
                row.status === LiveProximityStatus.Verified
                ? [
                      {
                          account: found.entry.row.label,
                          key: row.accountId,
                          paidPayouts: checkedCount(
                              row.countStatus,
                              row.paidPayouts,
                          ),
                          plan: names.of(row.planSerial),
                          remaining:
                              row.countStatus ===
                              LiveProximityCountStatus.NotChecked
                                  ? COUNT_NOT_CHECKED_TEXT
                                  : optionalCount(row.remaining),
                          requestedPayouts: checkedCount(
                              row.countStatus,
                              row.requestedPayouts,
                          ),
                          sourceText: policySourceText(
                              confirmedTriggerSource(
                                  liveTriggersOf(found.group),
                                  LiveTriggerKind.PayoutCountPerAccount,
                              ),
                          ),
                          trigger: optionalCount(row.triggerCount),
                      },
                  ]
                : [];
        }),
        disclosure: LIVE_PROXIMITY_DISCLOSURE,
        firms: proximity.byFirm
            .filter(
                (row) =>
                    openFirmIds.has(row.firmId) &&
                    (row.status === LiveProximityStatus.Verified ||
                        isFirmTriggerUnverified(
                            groups.filter(
                                (group) =>
                                    group.firmId === row.firmId &&
                                    group.accounts.some(
                                        (entry) =>
                                            entry.row.archivedAt === null,
                                    ),
                            ),
                        )),
            )
            .map((row) => {
                const firmKey = firmKeyOf({
                    externalFirmId: null,
                    firmId: row.firmId,
                });
                return {
                    firm: firms.of(firmKey),
                    isVerified: row.status === LiveProximityStatus.Verified,
                    key: firmKeyId(firmKey),
                    paidSinceLastLive: checkedCount(
                        row.countStatus,
                        row.paidPayoutsSinceLastLiveAccount,
                    ),
                    remaining:
                        row.countStatus === LiveProximityCountStatus.NotChecked
                            ? COUNT_NOT_CHECKED_TEXT
                            : optionalCount(row.remaining),
                    requestedSinceLastLive: checkedCount(
                        row.countStatus,
                        row.requestedPayoutsSinceLastLiveAccount,
                    ),
                    since:
                        row.countStatus === LiveProximityCountStatus.NotChecked
                            ? COUNT_NOT_CHECKED_TEXT
                            : (row.sinceOn ?? ALL_TIME_TEXT),
                    sourceText:
                        row.status === LiveProximityStatus.Verified
                            ? policySourceText(
                                  firmTotalSourceOf(
                                      groups.filter(
                                          (group) =>
                                              group.firmId === row.firmId,
                                      ),
                                  ),
                              )
                            : NO_CONFIRMED_SOURCE_TEXT,
                    trigger: optionalCount(row.triggerCount),
                };
            }),
        openFundedAccounts: open.length,
        singleDayFacts: proximity.singleDayFacts
            .filter((fact) => openFirmIds.has(fact.firmId))
            .map((fact) => ({
                fetchedOn: fact.quote.fetchedOn,
                firm: firms.of(
                    firmKeyOf({ externalFirmId: null, firmId: fact.firmId }),
                ),
                key: `${fact.planSerial}-single-day`,
                plan: names.of(fact.planSerial),
                quote: fact.quote.quote,
                source: fact.quote.url,
                text: singleDayFactText(fact),
            })),
        unlistedNote: combinedNote(
            unverified.length === 0
                ? null
                : `${counted({ count: unverified.length, plural: 'funded accounts', singular: 'funded account' })} ${unverified.length === 1 ? 'is at a firm whose live triggers are unverified, so its' : 'are at firms whose live triggers are unverified, so their'} distance to going live is not shown.`,
            unmodeledFundedNote({
                count: openFundedOf(ledger.ledgerOnlyAccounts),
                plural: 'funded ledger-only accounts',
                reason: 'no modeled plan',
                reasons: 'no modeled plan',
                singular: 'funded ledger-only account',
            }),
            unmodeledFundedNote({
                count: openFundedOf(ledger.unresolvedAccounts),
                plural: 'funded accounts',
                reason: 'a plan that is no longer modeled',
                reasons: 'plans that are no longer modeled',
                singular: 'funded account',
            }),
        ),
        unmeasuredNote: unmeasuredTriggerNote([...openGroups], names),
    };
}

function liveTransferNotesOf(plan: PlanEngine): readonly string[] {
    return [
        ...labelledAssumptionLines(
            'Documented policy',
            plan.documented.kind === EngineSlotKind.Ready
                ? plan.documented.figures.liveTransfer
                : undefined,
        ),
        ...labelledAssumptionLines(
            'Documented policy',
            plan.documented.kind === EngineSlotKind.Ready
                ? plan.documented.figures.cumulativePayoutTrigger
                : undefined,
        ),
        ...labelledAssumptionLines(
            'Payout-size optimum',
            plan.optimum.kind === EngineSlotKind.Ready
                ? plan.optimum.figures.liveTransfer
                : undefined,
        ),
        ...labelledAssumptionLines(
            'Payout-size optimum',
            plan.optimum.kind === EngineSlotKind.Ready
                ? plan.optimum.figures.cumulativePayoutTrigger
                : undefined,
        ),
    ];
}

function liveTriggersOf(group: PlanGroup): readonly LiveTransitionTrigger[] {
    return group.firm.accountPolicy.liveTriggersFor(group.plan);
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

function minimumBudgetNoteOf(reason: EconomicsReason): string {
    const base = `The minimum budget is not shown: ${ECONOMICS_REASON_TEXT[reason]}.`;
    return reason === EconomicsReason.ThresholdNotSet
        ? `${base} Set a loss-risk threshold in the rulebook.`
        : base;
}

function modeledCostMap(
    engine: EngineView,
): ReadonlyMap<string, ModeledFundedCost> {
    return new Map(
        [...engine.plans].flatMap(([serial, plan]) =>
            plan.documented.kind === EngineSlotKind.Ready
                ? [
                      [
                          serial,
                          {
                              costPerFundedAccount:
                                  plan.documented.figures.costPerFundedAccount,
                          },
                      ] as const,
                  ]
                : [],
        ),
    );
}

function modeledCostText(
    value: null | UsdCents,
    slot: EngineSlot<DocumentedRunFigures> | undefined,
    format: (cents: UsdCents) => string = formatUsdCents,
): string {
    return value === null
        ? engineText(slot, () => NO_MODELED_COST)
        : format(value);
}

function modeledOutcomesDisclosure(engine: EngineView): string {
    const ready = readyDocumentedFigures(engine);
    if (ready !== null) {
        return `The modeled pass rate and funded survival are the engine's under your documented policy: fresh start, ${formatTrials(ready.trials)}, funded horizon ${String(ready.fundedHorizonDays)} trading days.`;
    }
    return engine.failure === null
        ? MODELED_OUTCOMES_PENDING
        : `The modeled pass rate and survival are not available: ${asSentence(engine.failure)}`;
}

function netCashCentsFor(
    load: PortfolioLoad,
    userId: string,
    today: string,
): null | UsdCents {
    if (load.ledger.status !== OverviewSectionStatus.Ready) return null;
    try {
        const ledger = PortfolioLedger.fromRows(userId, load.ledger.rows);
        return portfolioRoi(ledger, today).cash.net;
    } catch (error) {
        if (error instanceof IsoDateError) return null;
        throw error;
    }
}

function nextPayoutFor(
    load: PortfolioLoad,
    userId: string,
    today: string,
    accountStates: readonly AccountStateEntry[],
    engine: OverviewEngine,
): OverviewNextPayout {
    const failed = boardFailures(load);
    if (failed.length > 0) {
        return {
            kind: OverviewSectionStatus.Failed,
            message: `The from-state figures could not be computed because your ${sourceList(failed)} could not be loaded.`,
        };
    }
    if (
        load.alerts.status !== OverviewSectionStatus.Ready ||
        load.ledger.status !== OverviewSectionStatus.Ready
    ) {
        return { kind: OverviewSectionStatus.Pending };
    }
    const computed = ledgerOrDateFailure(() =>
        accountFromStateEntriesOf(load, userId, today, accountStates),
    );
    switch (computed.kind) {
        case OverviewSectionStatus.Failed: {
            return {
                kind: OverviewSectionStatus.Failed,
                message: `The from-state figures could not be computed: ${computed.message} Fix the stored date listed in the alerts.`,
            };
        }
        case OverviewSectionStatus.Ready: {
            return {
                kind: OverviewSectionStatus.Ready,
                model: {
                    disclosures: NEXT_PAYOUT_DISCLOSURES,
                    rows: computed.value.map((entry) => ({
                        accountId: entry.accountId,
                        label: entry.label,
                        plan: entry.plan,
                        view: accountFromStateViewOf(engine, entry.request),
                    })),
                    statusNote:
                        load.rulebook === null
                            ? NEXT_PAYOUT_NO_RULEBOOK_NOTE
                            : computed.value.length === 0
                              ? NEXT_PAYOUT_NO_ACCOUNTS_NOTE
                              : null,
                },
            };
        }
    }
}

function openFundedOf(
    entries: readonly { readonly row: LedgerAccountRow }[],
): number {
    return entries.filter(
        (entry) =>
            entry.row.stage === AccountStage.Funded &&
            !isEndedStatus(entry.row.status),
    ).length;
}

function optionalCents(value: null | UsdCents): string {
    return value === null ? NOT_APPLICABLE : formatUsdCents(value);
}

function optionalCount(value: null | number): string {
    return value === null ? UNVERIFIED_TEXT : String(value);
}

function outcomesCard(
    ledger: PortfolioLedger,
    names: PlanNames,
    sampleThresholds: SampleThresholds,
    engine: EngineView,
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
            ...(outcomes.perPlan.length === 0 ? [] : [MAJORITY_VOTE_RULE]),
            ...(outcomes.ledgerOnlyAccounts === 0
                ? []
                : [
                      `${counted({ count: outcomes.ledgerOnlyAccounts, plural: 'ledger-only accounts', singular: 'ledger-only account' })} ${outcomes.ledgerOnlyAccounts === 1 ? 'is' : 'are'} not counted here, since the engine does not model ${outcomes.ledgerOnlyAccounts === 1 ? 'its plan' : 'their plans'}.`,
                  ]),
            modeledOutcomesDisclosure(engine),
            ...survivalBasisDisclosure(engine),
        ],
        rows: outcomes.perPlan.map((row) => ({
            fundedSurvival: formatSampledRate(
                row.fundedSurvival,
                SampleKind.FundedAccounts,
                sampleThresholds,
            ),
            fundedSurvivalCounts: independentCountsText(
                row.fundedSurvivalAccounts,
                row.fundedSurvival?.n ?? 0,
                { plural: 'accounts', singular: 'account' },
            ),
            key: row.planSerial,
            modeledFundedSurvival: engineText(
                documentedSlotOf(engine, row.planSerial),
                (figures) =>
                    `${estimatePercent(figures.fundedSurvivalProbability)} over ${String(figures.fundedHorizonDays)} trading days`,
            ),
            modeledPassRate: row.instantFunded
                ? 'Instant funded'
                : engineText(
                      documentedSlotOf(engine, row.planSerial),
                      (figures) =>
                          estimatePercent(figures.attemptPassProbability),
                  ),
            openFunded: String(row.openFundedAccounts),
            passRate: row.instantFunded
                ? 'Instant funded'
                : formatSampledRate(
                      row.passRate,
                      SampleKind.EvalAttempts,
                      sampleThresholds,
                  ),
            passRateCounts: row.instantFunded
                ? 'Instant funded'
                : independentCountsText(
                      row.passRateAttempts,
                      row.passRate?.n ?? 0,
                      { plural: 'attempts', singular: 'attempt' },
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
    bankrollParameters: BankrollParameters,
    violations: PortfolioLoad['violations'],
    decisions: PortfolioLoad['decisions'],
    engine: OverviewEngine,
    rulebook: null | RulebookParameters,
    realizedRisk: null | RealizedLossRisk,
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
                bankrollParameters,
                violations,
                decisions,
                engine,
                rulebook,
                realizedRisk,
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

function payoutPolicyLabel(requestSize: null | number): string {
    return requestSize === null
        ? 'Full request only, request size not resolved because the plan is not modeled'
        : `Full request only, ${formatCurrency(requestSize)} request`;
}

function payoutSizeBalanceRow(
    key: PayoutBalanceBandKey,
    label: string,
    band: PayoutSizeStats['byBalance'][keyof PayoutSizeStats['byBalance']],
): PayoutSizeBalanceRow {
    return {
        count: String(band.count),
        key,
        label,
        mean: formatSampledCents(band.mean),
        median: optionalCents(band.median),
    };
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
        bucketWidth: formatUsdCents(roundCents(stats.bucketWidthCents)),
        byAccountSize: stats.byAccountSize.map((row) =>
            payoutSizeGroupRow(row),
        ),
        byBalance: [
            payoutSizeBalanceRow(
                PayoutBalanceBandKey.LowBalance,
                'Low balance at payout',
                stats.byBalance.lowBalance,
            ),
            payoutSizeBalanceRow(
                PayoutBalanceBandKey.AboveCushion,
                'Above the retained cushion',
                stats.byBalance.aboveCushion,
            ),
            payoutSizeBalanceRow(
                PayoutBalanceBandKey.NoSnapshot,
                'No snapshot on or before the payout',
                stats.byBalance.noSnapshot,
            ),
        ],
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
    const byAccount = Map.groupBy(snapshots, (snapshot) => snapshot.accountId);
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

function payoutsPerPaidFundedOf(figures: DocumentedRunFigures): null | number {
    const paidShare = figures.anyPayoutGivenFundedProbability.value;
    return paidShare > 0
        ? figures.payoutsPerFundedAccount.value / paidShare
        : null;
}

function planAttemptsPerMonth(
    ledger: PortfolioLedger,
    planSerial: string,
    today: string,
): number {
    const group = ledger
        .planGroups()
        .find((candidate) => candidate.planSerial === planSerial);
    if (group === undefined) return 0;
    const planLedger = PortfolioLedger.fromRows(ledger.userId, {
        accounts: group.accounts.map((entry) => entry.row),
        events: group.accounts.flatMap((entry) => entry.events),
        fees: group.accounts.flatMap((entry) => entry.fees),
        payouts: group.accounts.flatMap((entry) => entry.payouts),
    });
    return attemptThroughput(planLedger, today).meanPerMonth;
}

function planLimitBudgetCentsOf(
    cheapestAttemptCents: null | number,
    usage: PlanCapUsage,
): null | number {
    const freeSlots = usage.plans.reduce((sum, row) => sum + row.freeSlots, 0);
    return cheapestAttemptCents === null || freeSlots === 0
        ? null
        : Math.round(freeSlots * cheapestAttemptCents);
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

function policySourceText(source: null | PolicyQuote): string {
    return source === null
        ? NO_CONFIRMED_SOURCE_TEXT
        : `"${source.quote}" ${source.url}, checked ${source.fetchedOn}`;
}

function pooledAttemptCostCentsOf(ledger: PortfolioLedger): null | number {
    const totals = costAnalytics(ledger, new Map()).perPlan.reduce(
        (sum, row) => ({
            attempts: sum.attempts + row.attempts,
            spendCents: sum.spendCents + row.acquisitionSpend,
        }),
        { attempts: 0, spendCents: 0 },
    );
    return totals.attempts === 0 ? null : totals.spendCents / totals.attempts;
}

function pooledCapCard(
    ledger: PortfolioLedger,
    names: PlanNames,
    firms: FirmNames,
): PooledCapCardModel {
    const usage = pooledCapUsage(ledger);
    return {
        countingNote: POOLED_CAPS_COUNTING_NOTE,
        disclosure:
            usage.pooledCapsModeled && usage.plans.length > 0
                ? POOLED_CAPS_CARD_VERIFIED_DISCLOSURE
                : POOLED_CAPS_CARD_PARTIAL_DISCLOSURE,
        householdNote: householdNoteOf(usage.householdDisclosedFirmIds, firms),
        rows: usage.plans.map((row) => ({
            cap: String(row.cap),
            freeSlots: String(row.freeSlots),
            key: row.planSerial,
            note: capNote(row.used, row.cap, row.suspended),
            plan: names.of(row.planSerial),
            poolFreeSlots:
                row.poolFreeSlots === null
                    ? row.isVerified
                        ? NOT_APPLICABLE
                        : UNVERIFIED_TEXT
                    : String(row.poolFreeSlots),
            scope: pooledCapScopeOf(row),
            used: String(row.used),
        })),
        unverifiedFirms: usage.capScopeUnverifiedFirmIds.map((firmId) =>
            firms.of(firmKeyOf({ externalFirmId: null, firmId })),
        ),
    };
}

function pooledCapScopeOf(row: PooledCapPlanRow): PooledCapScope {
    if (row.poolFreeSlots !== null) return PooledCapScope.SharedPool;
    return row.isVerified
        ? PooledCapScope.PerPlan
        : PooledCapScope.CapScopeUnverified;
}

function projectionAccountsText(figures: PortfolioProjectionFigures): string {
    const { accountsRequested, accountsSimulated } = figures;
    return accountsSimulated === accountsRequested
        ? `${counted({ count: accountsSimulated, plural: 'accounts', singular: 'account' })} simulated`
        : `${String(accountsSimulated)} of ${String(accountsRequested)} active accounts simulated (the plan allows at most ${String(accountsSimulated)} funded accounts)`;
}

function projectionBreakEvenText(timeline: PortfolioTimelineResult): string {
    const months = timeline.breakEvenMonthValues;
    return months.length === 0
        ? 'Not reached within the horizon'
        : `${percentile(months, 50).toFixed(1)} months (median of the trials that get there)`;
}

function projectionCard(
    names: PlanNames,
    engine: OverviewEngine,
    requests: readonly OverviewRequest[],
    hasRulebook: boolean,
): ProjectionCardModel {
    if (requests.length === 0) {
        return {
            disclosures: [],
            refused: [],
            rows: [],
            status: hasRulebook
                ? ExpectedNetStatus.NoPlans
                : ExpectedNetStatus.Pending,
            statusNote: hasRulebook
                ? 'No plan you hold has an active account the engine models, so there is no projection to compute.'
                : 'The projection waits for your rulebook to load.',
        };
    }
    const slots = requests.map((request) => ({
        request,
        slot: engineSlotOf(engine, request, (result) =>
            result.kind === OverviewRequestKind.PortfolioProjection
                ? result.figures
                : null,
        ),
    }));
    const status = slots.some(({ slot }) => slot.kind === EngineSlotKind.Failed)
        ? ExpectedNetStatus.Failed
        : slots.some(({ slot }) => slot.kind === EngineSlotKind.Pending)
          ? ExpectedNetStatus.Pending
          : ExpectedNetStatus.Ready;
    return {
        disclosures: PROJECTION_DISCLOSURES,
        refused: slots.flatMap(({ request, slot }) =>
            slot.kind === EngineSlotKind.Refused
                ? [
                      {
                          key: overviewRequestKey(request),
                          plan: names.of(request.planSerial),
                          reason: slot.reason,
                      },
                  ]
                : [],
        ),
        rows: slots.map(({ request, slot }) =>
            projectionRow(names, request, slot),
        ),
        status,
        statusNote:
            status === ExpectedNetStatus.Failed
                ? `The projection could not be computed: ${asSentence(groupFailureOf(engine, OverviewRequestGroup.Projection) ?? NOT_AVAILABLE)}`
                : status === ExpectedNetStatus.Pending
                  ? ENGINE_COMPUTING_NOTE
                  : null,
    };
}

function projectionFigureText(
    slot: EngineSlot<PortfolioProjectionFigures>,
    ready: (figures: PortfolioProjectionFigures) => string,
): string {
    switch (slot.kind) {
        case EngineSlotKind.Failed: {
            return NOT_AVAILABLE;
        }
        case EngineSlotKind.Pending: {
            return PENDING;
        }
        case EngineSlotKind.Ready: {
            return ready(slot.figures);
        }
        case EngineSlotKind.Refused: {
            return NOT_APPLICABLE;
        }
    }
}

function projectionFor(
    load: PortfolioLoad,
    userId: string,
    engine: OverviewEngine,
): OverviewProjection {
    const section = load.ledger;
    switch (section.status) {
        case OverviewSectionStatus.Failed: {
            return {
                kind: OverviewSectionStatus.Failed,
                message: `The fresh-start projection could not be computed because your ${sourceList(section.failed)} could not be loaded.`,
            };
        }
        case OverviewSectionStatus.Pending: {
            return { kind: OverviewSectionStatus.Pending };
        }
        case OverviewSectionStatus.Ready: {
            const { rulebook } = load;
            const computed = ledgerOrDateFailure(() => {
                const ledger = PortfolioLedger.fromRows(userId, section.rows);
                return projectionCard(
                    planNames(ledger),
                    engine,
                    projectionRequestsOfLedger(ledger, rulebook),
                    rulebook !== null,
                );
            });
            switch (computed.kind) {
                case OverviewSectionStatus.Failed: {
                    return {
                        kind: OverviewSectionStatus.Failed,
                        message: `The fresh-start projection could not be computed: ${computed.message} Fix the stored date listed in the alerts.`,
                    };
                }
                case OverviewSectionStatus.Ready: {
                    return {
                        kind: OverviewSectionStatus.Ready,
                        model: computed.value,
                    };
                }
            }
        }
    }
}

function projectionLabels(
    request: OverviewRequest,
    slot: EngineSlot<PortfolioProjectionFigures>,
): ProjectionLabels {
    const { enginePolicy, rulebook, run } = request.spec;
    const figures = slot.kind === EngineSlotKind.Ready ? slot.figures : null;
    return {
        creditBasis: PROJECTION_CREDIT_BASIS_LABEL,
        horizon: projectionFigureText(
            slot,
            (ready) => `${String(ready.dayBudget)} trading days`,
        ),
        lifetimeCapBasis: lifetimeCapBasisText(
            enginePolicy.lifetimePayoutCapBasis,
            enginePolicy.lifetimePayoutCapOverride,
        ),
        payoutPolicy: payoutPolicyLabel(
            figures?.payoutRequestSize ?? overviewDocumentedRequestOf(request),
        ),
        retainedCushion: retainedCushionLabel(
            enginePolicy,
            figures?.minRetainedCushion ?? null,
        ),
        startBasis: PROJECTION_START_BASIS_LABEL,
        tradesPerDay: `Trades per day: ${String(rulebook.strategy.tradesPerDayMax)} in the eval phase, ${String(rulebook.funded.tradesPerDayMax)} in the funded phase`,
        trials: formatTrials(figures?.trials ?? run.trials),
    };
}

function projectionRequestsOfLedger(
    ledger: PortfolioLedger,
    rulebook: null | RulebookParameters,
): readonly OverviewRequest[] {
    return rulebook === null
        ? []
        : overviewProjectionRequestsFor(heldPlanInputsOf(ledger), rulebook);
}

function projectionRow(
    names: PlanNames,
    request: OverviewRequest,
    slot: EngineSlot<PortfolioProjectionFigures>,
): ProjectionRow {
    const timelineText = (
        series: (timeline: PortfolioTimelineResult) => readonly number[],
    ) =>
        projectionFigureText(slot, (figures) => {
            const last = series(figures.timeline).at(-1);
            return last === undefined ? NOT_APPLICABLE : formatCurrency(last);
        });
    return {
        accounts: projectionFigureText(slot, projectionAccountsText),
        breakEvenMonth: projectionFigureText(slot, (figures) =>
            projectionBreakEvenText(figures.timeline),
        ),
        finalNet: {
            p10: timelineText((timeline) => timeline.netP10),
            p50: timelineText((timeline) => timeline.netP50),
            p90: timelineText((timeline) => timeline.netP90),
        },
        finalPayoutMedian: timelineText((timeline) => timeline.payoutP50),
        finalSpendMedian: timelineText((timeline) => timeline.spendP50),
        key: request.planSerial,
        labels: projectionLabels(request, slot),
        notHonoured:
            slot.kind === EngineSlotKind.Ready
                ? timelineGapTexts(request, slot.figures)
                : [],
        plan: names.of(request.planSerial),
        probabilityEverPositive: projectionFigureText(slot, (figures) =>
            formatPercent(figures.timeline.pEverCashflowPositive),
        ),
        probabilityFinalNetNegative: projectionFigureText(slot, (figures) =>
            formatPercent(figures.timeline.pFinalNetNegative),
        ),
        result:
            slot.kind === EngineSlotKind.Ready ? slot.figures.timeline : null,
    };
}

function readableError(error: unknown): string {
    return asSentence(errorMessage(error));
}

function readinessBoardCard(
    board: PayoutReadinessBoard,
    accounts: ReadonlyMap<string, OverviewAccountRow>,
): ReadinessBoardCardModel {
    const labelOf = (accountId: string): string =>
        accounts.get(accountId)?.label ?? accountId;
    const eligible = board.rows.filter(
        (row) => row.kind === PayoutReadinessRowKind.Eligible,
    );
    const blocked = board.rows.filter(
        (row) => row.kind === PayoutReadinessRowKind.Blocked,
    );
    return {
        disclosure:
            'Eligible means the documented request can be made now: the amount is the rule-capped withdrawable at the effective request (never below the firm minimum), and the net applies the firm split. Blocked shows the gate and what unlocks it.',
        notFundedCount: board.notApplicable.filter(
            (row) =>
                row.notApplicable.kind ===
                PayoutReadinessNotApplicableKind.NotFunded,
        ).length,
        rows: [...eligible, ...blocked].map((row) =>
            readinessRow(row, labelOf(row.accountId)),
        ),
        unavailable: board.notApplicable.flatMap((row) =>
            row.notApplicable.kind ===
            PayoutReadinessNotApplicableKind.Unavailable
                ? [
                      unavailableAccountRow(
                          row.accountId,
                          accounts,
                          accountStateUnavailableText(
                              accounts.get(row.accountId),
                              row.notApplicable.reason,
                          ),
                      ),
                  ]
                : [],
        ),
    };
}

function readinessRow(
    row: PayoutReadinessBoard['rows'][number],
    account: string,
): ReadinessRow {
    switch (row.kind) {
        case PayoutReadinessRowKind.Blocked: {
            return {
                account,
                asOf: row.asOf,
                key: row.accountId,
                netAfterSplit: NOT_APPLICABLE,
                note:
                    row.pendingAmountCents === null
                        ? null
                        : `A payout of ${formatUsdCents(row.pendingAmountCents)} is pending.`,
                requested: NOT_APPLICABLE,
                status: 'Blocked',
                unlock:
                    row.pendingAmountCents === null
                        ? `Blocked: ${payoutBlockReasonText(row.reason)}; ${payoutWaitText(row.wait, row.reason)}`
                        : `Blocked: ${payoutBlockReasonText(row.reason)}`,
            };
        }
        case PayoutReadinessRowKind.Eligible: {
            return {
                account,
                asOf: row.asOf,
                key: row.accountId,
                netAfterSplit: formatUsdCents(row.traderReceivesCents),
                note: combinedNote(
                    row.firmMinimumNotice === null
                        ? null
                        : `Firm minimum ${formatUsdCents(row.firmMinimumNotice.minimumRequestAmountCents)} is above your ${formatUsdCents(row.firmMinimumNotice.requestedAmountCents)} request.`,
                    row.liveTriggerCoverage === LiveTriggerCoverage.Enforced
                        ? null
                        : LIVE_TRIGGERS_NOT_CHECKED_NOTE,
                ),
                requested: formatUsdCents(row.requestedAmountCents),
                status: 'Eligible',
                unlock: 'Ready now',
            };
        }
    }
}

function readyDocumentedFigures(
    engine: EngineView,
): DocumentedRunFigures | null {
    for (const plan of engine.plans.values()) {
        if (plan.documented.kind === EngineSlotKind.Ready) {
            return plan.documented.figures;
        }
    }
    return null;
}

function readyLedger(
    rows: LedgerRows,
    today: string,
    userId: string,
    firms: FirmNames,
    statementTargets: MonthlyStatementTargets,
    sampleThresholds: SampleThresholds,
    retainedCushionCents: null | UsdCents,
    bankrollParameters: BankrollParameters,
    violations: PortfolioLoad['violations'],
    decisions: PortfolioLoad['decisions'],
    engine: OverviewEngine,
    rulebook: null | RulebookParameters,
    realizedRisk: null | RealizedLossRisk,
): OverviewLedger {
    const computed = ledgerOrDateFailure(() => {
        const ledger = PortfolioLedger.fromRows(userId, rows);
        return ledgerCards(
            ledger,
            today,
            firms,
            statementTargets,
            sampleThresholds,
            rows.snapshots,
            retainedCushionCents,
            bankrollParameters,
            violations,
            decisions,
            engineViewOf(
                engine,
                engineRequestsOfLedger(ledger, rulebook),
                rulebook !== null,
            ),
            realizedRisk,
            rows.accounts.filter((row) => row.hasCorruptTags === true),
        );
    });
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

function readyRowsOf(
    load: PortfolioLoad,
    subject: string,
):
    | OverviewSectionGap
    | {
          readonly alerts: AlertRows;
          readonly kind: OverviewSectionStatus.Ready;
          readonly ledger: LedgerRows;
      } {
    const failed = boardFailures(load);
    if (failed.length > 0) {
        return {
            kind: OverviewSectionStatus.Failed,
            message: `${subject} could not be computed because your ${sourceList(failed)} could not be loaded.`,
        };
    }
    if (
        load.alerts.status !== OverviewSectionStatus.Ready ||
        load.ledger.status !== OverviewSectionStatus.Ready
    ) {
        return { kind: OverviewSectionStatus.Pending };
    }
    return {
        alerts: load.alerts.rows,
        kind: OverviewSectionStatus.Ready,
        ledger: load.ledger.rows,
    };
}

function realizedHorizonDaysOf(engine: EngineView): number {
    const tradingDays = engineHorizonTradingDaysOf(engine);
    return tradingDays === null
        ? DEFAULT_REALIZED_HORIZON_DAYS
        : calendarHorizonDaysOf(tradingDays);
}

function realizedHorizonDisclosureOf(engine: EngineView): string {
    const tradingDays = engineHorizonTradingDaysOf(engine);
    return tradingDays === null
        ? REALIZED_HORIZON_DISCLOSURE
        : `Realized figures use the engine's funded horizon of ${String(tradingDays)} trading days (about ${String(calendarHorizonDaysOf(tradingDays))} calendar days), so each funded account is compared over the same window as the modeled run; a younger funded account that is still open is listed open and left out of the payout counts, the realized funded value, the payouts per paid funded account and the average payout, while the payout rate counts an account that has already been paid as decided at once.`;
}

function realizedLossRiskFor(
    load: PortfolioLoad,
    today: string,
    userId: string,
): null | RealizedLossRisk {
    if (load.ledger.status !== OverviewSectionStatus.Ready) return null;
    try {
        return realizedLossRiskOf(
            PortfolioLedger.fromRows(userId, load.ledger.rows),
            today,
            load.bankrollParameters.lossRiskThreshold,
        );
    } catch (error) {
        if (error instanceof IsoDateError) return null;
        throw error;
    }
}

function realizedLossRiskOf(
    ledger: PortfolioLedger,
    today: string,
    lossRiskThreshold: null | number,
): null | RealizedLossRisk {
    const attemptCostCents = pooledAttemptCostCentsOf(ledger);
    if (attemptCostCents === null || attemptCostCents <= 0) return null;
    return realizedLossRisk({
        asOfDate: today,
        attemptCostCents,
        availableCents: bankrollOf(ledger, today).availableCents,
        draws: REALIZED_LOSS_RISK_DRAWS,
        ledger,
        lossRiskThreshold,
        seed: REALIZED_LOSS_RISK_SEED,
        toFirstPayoutFallbackDays: TO_FIRST_PAYOUT_FALLBACK_DAYS,
    });
}

function reconciliationExtrasFor(
    load: PortfolioLoad,
    userId: string,
): Pick<AlertExtras, 'firmReconciliation' | 'rounds'> {
    if (
        load.ledger.status !== OverviewSectionStatus.Ready ||
        load.checks.status !== OverviewSectionStatus.Ready
    ) {
        return {};
    }
    const { firmStatements, rounds } = load.checks.rows;
    const { rows } = load.ledger;
    const computed = ledgerOrDateFailure(() =>
        reconciliationExtrasOfLedger(
            PortfolioLedger.fromRows(userId, {
                ...rows,
                firmStatements,
                rounds,
            }),
        ),
    );
    return computed.kind === OverviewSectionStatus.Ready ? computed.value : {};
}

function reconciliationExtrasOfLedger(
    ledger: PortfolioLedger,
): Required<Pick<AlertExtras, 'firmReconciliation' | 'rounds'>> {
    return {
        firmReconciliation: firmReconciliation(ledger),
        rounds: ledger.rounds.map((round) => alertRoundOf(ledger, round)),
    };
}

function refusalOf<Figures>(
    names: PlanNames,
    serial: string,
    slot: EngineSlot<Figures>,
    request: OverviewRequest,
): readonly ExpectedNetRefusal[] {
    return slot.kind === EngineSlotKind.Refused
        ? [
              {
                  key: overviewRequestKey(request),
                  plan: names.of(serial),
                  reason: slot.reason,
                  run: REQUEST_RUN_LABEL[request.kind],
              },
          ]
        : [];
}

function reportedPayoutsTakenOf(
    snapshots: readonly OverviewSnapshotRow[],
): ReadonlyMap<string, number> {
    return new Map(
        Map.groupBy(snapshots, (snapshot) => snapshot.accountId)
            .entries()
            .flatMap(([accountId, rows]) => {
                const taken = latestTwoSnapshots(rows).latest?.payoutsTaken;
                return taken === null || taken === undefined
                    ? []
                    : [[accountId, taken] as const];
            }),
    );
}

function retainedCushionLabel(
    enginePolicy: EnginePolicy,
    resolved: null | number,
): string {
    return resolved === null
        ? `Retained cushion ${formatCurrency(enginePolicy.retainedCushionRequest ?? 0)} (requested)`
        : `Retained cushion ${formatCurrency(resolved)} (engine-resolved)`;
}

function sensitivityEntryOf(
    serial: string,
    plan: PlanEngine,
    isOptimumComparable: boolean,
): readonly PayoutPolicySensitivityPlanEntry[] {
    if (plan.documented.kind !== EngineSlotKind.Ready) return [];
    const { figures } = plan.documented;
    return [
        {
            documented: {
                monthlyNet: figures.expectedMonthlyNet.value,
                standardError: figures.expectedMonthlyNet.standardError,
            },
            labels: {
                lifetimeCapBasis:
                    plan.documentedRequest.spec.enginePolicy
                        .lifetimePayoutCapBasis,
                payoutPolicy: PayoutRequestPolicy.FullRequestOnly,
                retainedCushion: figures.minRetainedCushion,
                startBasis: StartBasis.Fresh,
                trials: figures.trials,
            },
            optimum:
                isOptimumComparable &&
                plan.optimum.kind === EngineSlotKind.Ready
                    ? {
                          monthlyNet:
                              plan.optimum.figures.expectedMonthlyNet.value,
                          standardError:
                              plan.optimum.figures.expectedMonthlyNet
                                  .standardError,
                      }
                    : null,
            planKey: serial,
        },
    ];
}

function setupFor(
    load: PortfolioLoad,
    userId: string,
    context: AlertContext | null,
    engine: OverviewEngine,
): OverviewSetup {
    const ready = readyRowsOf(load, 'The setup checklist');
    if (ready.kind !== OverviewSectionStatus.Ready) return ready;
    if (context === null) return { kind: OverviewSectionStatus.Pending };
    const computed = ledgerOrDateFailure(() => {
        const ledger = PortfolioLedger.fromRows(userId, ready.ledger);
        const view = engineViewOf(
            engine,
            engineRequestsOfLedger(ledger, load.rulebook),
            load.rulebook !== null,
        );
        const staleAlerts = new StaleSnapshotRule().evaluate(context);
        return setupChecklistCardOf(
            setupChecklistOf({
                expectedValuePlanSerials: expectedValuePlanSerialsOf(
                    ledger,
                    view,
                ),
                ledger,
                rulebook: ready.alerts.rulebook,
                staleSnapshotAccountIds: staleSnapshotAccountIdsOf(staleAlerts),
            }),
        );
    });
    return computed.kind === OverviewSectionStatus.Ready
        ? { kind: OverviewSectionStatus.Ready, model: computed.value }
        : {
              kind: OverviewSectionStatus.Failed,
              message: `The setup checklist could not be computed: ${computed.message} Fix the stored date listed in the alerts.`,
          };
}

function setupItemRows(item: SetupMissingItem): readonly SetupItemRow[] {
    switch (item.kind) {
        case SetupMissingKind.Account: {
            return [
                {
                    href: routes.propCalculator.accounts.detail(item.accountId),
                    key: item.accountId,
                    label: item.label,
                },
            ];
        }
        case SetupMissingKind.Bankroll: {
            return [];
        }
        case SetupMissingKind.Firm: {
            return [
                {
                    href: routes.propCalculator.rules,
                    key: item.firmId,
                    label: item.label,
                },
            ];
        }
        case SetupMissingKind.Plan: {
            return [
                {
                    href: EXPECTED_NET_SECTION_HREF,
                    key: item.planSerial,
                    label: item.label,
                },
            ];
        }
    }
}

function setupStepDetail(result: SetupStepResult): null | string {
    const { status } = result;
    switch (result.step) {
        case SetupStep.BudgetSet: {
            return status === SetupStepStatus.Missing
                ? 'Add a bankroll deposit, or set a bankroll limit in the rulebook, so the budget figures have a base.'
                : null;
        }
        case SetupStep.CostsEntered: {
            return status === SetupStepStatus.Missing
                ? 'These active accounts have no purchase fee recorded: an evaluation purchase, or the activation fee for an instant-funded plan.'
                : null;
        }
        case SetupStep.ExpectedValueComputed: {
            if (status === SetupStepStatus.Missing) {
                return 'The engine has no expected net for these plans.';
            }
            return status === SetupStepStatus.NotChecked
                ? 'Computed on the overview once the engine has answered.'
                : null;
        }
        case SetupStep.FirmRulesVerified: {
            if (status === SetupStepStatus.Done) {
                return `Verified on: ${result.firmDates.map(firmDateText).join(', ')}`;
            }
            return status === SetupStepStatus.Missing
                ? 'These firms have no verification date for their rules.'
                : null;
        }
        case SetupStep.StagesCaptured: {
            return status === SetupStepStatus.Missing
                ? 'These active accounts have no snapshot the stale-snapshot check accepts; enter their current balance.'
                : null;
        }
    }
}

function stageCountText(row: FirmFunnel, stage: FunnelCohortStage): string {
    return independentCountsText(row[stage], row.independent[stage], {
        plural: 'accounts',
        singular: 'account',
    });
}

function staleSnapshotAccountIdsOf(
    alerts: readonly AccountAlert[],
): ReadonlySet<string> {
    return new Set(
        alerts.flatMap((alert) =>
            alert.kind === AlertKind.StaleSnapshot &&
            alert.subject.kind === AlertSubjectKind.Account
                ? [alert.subject.accountId]
                : [],
        ),
    );
}

function suppliedQueriesOf(
    queries: PortfolioQueries,
): readonly (readonly [PortfolioSource, PortfolioQuery<unknown>])[] {
    return Object.values(PortfolioSource).flatMap((source) => {
        const query: PortfolioQuery<unknown> | undefined = queries[source];
        return query === undefined ? [] : [[source, query] as const];
    });
}

function survivalBasisDisclosure(engine: EngineView): readonly string[] {
    const ready = readyDocumentedFigures(engine);
    return ready === null
        ? []
        : [
              `The modeled survival is over ${String(ready.fundedHorizonDays)} trading days, but the realized survival is not horizon-matched: it counts every account that reached funded at any age, with open ones as survivors, so a young funded account lifts it.`,
          ];
}

function timelineGapTexts(
    request: OverviewRequest,
    figures: PortfolioProjectionFigures,
): readonly string[] {
    const plan = findFirm(request.firmId)?.findPlanBySerial(request.planSerial);
    if (plan === null || plan === undefined) {
        throw new Error(
            `overviewModel: cannot resolve the plan ${request.planSerial} of a ready projection`,
        );
    }
    const gaps = new Set([
        ...figures.timelineGaps,
        ...applicableTimelineGaps(request.spec, plan),
    ]);
    return DOCUMENTED_POLICY_TIMELINE_GAPS.filter((gap) => gaps.has(gap)).map(
        (gap) => DOCUMENTED_POLICY_TIMELINE_GAP_TEXT[gap],
    );
}

function unavailableAccountRow(
    accountId: string,
    accounts: ReadonlyMap<string, OverviewAccountRow>,
    reason: string,
): UnavailableAccountRow {
    return {
        account: accounts.get(accountId)?.label ?? accountId,
        key: accountId,
        reason,
    };
}

function unavailableFigure(text: string): ExpectedNetFigure {
    return {
        creditFree: text,
        creditInclusive: text,
        requestSize: text,
        totalCreditFree: text,
    };
}

function unmodeledFundedNote({
    count,
    plural,
    reason,
    reasons,
    singular,
}: {
    readonly count: number;
    readonly plural: string;
    readonly reason: string;
    readonly reasons: string;
    readonly singular: string;
}): null | string {
    if (count === 0) return null;
    return count === 1
        ? `${counted({ count, plural, singular })} has ${reason}, so its distance to going live is not measured.`
        : `${counted({ count, plural, singular })} have ${reasons}, so their distance to going live is not measured.`;
}

function valueRequestsOfLedger(
    ledger: PortfolioLedger,
    rulebook: null | RulebookParameters,
): readonly OverviewRequest[] {
    return rulebook === null
        ? []
        : overviewPlanValueRequestsFor(heldPlanInputsOf(ledger), rulebook);
}

function violationsLoad(
    queries: PortfolioQueries,
): SectionLoad<readonly OverviewViolationRow[]> {
    const violations = queries[PortfolioSource.Violations].data;
    return violations === undefined
        ? loadGap(queries, [PortfolioSource.Violations])
        : { rows: violations, status: OverviewSectionStatus.Ready };
}

function worstDayKpi(
    load: PortfolioLoad,
    context: AlertContext | null,
): OverviewKpi {
    const base = {
        kind: OverviewKpiKind.WorstDay,
        label: 'Worst day loss',
    } as const;
    if (context === null) {
        return load.alerts.status === OverviewSectionStatus.Failed
            ? {
                  ...base,
                  detail: `Your ${sourceList(load.alerts.failed)} could not be loaded`,
                  note: null,
                  tone: KpiTone.Neutral,
                  value: NOT_APPLICABLE,
              }
            : {
                  ...base,
                  detail: 'Pending your accounts and snapshots',
                  note: null,
                  tone: KpiTone.Pending,
                  value: PENDING,
              };
    }
    const dayLoss = dayLossShareOfContext(context);
    const unmeasured =
        dayLoss.unmeasured.length === 0
            ? null
            : `${counted({ count: dayLoss.unmeasured.length, plural: 'accounts', singular: 'account' })} not compared (no previous snapshot, more than one trading day apart, a funded reset, a stage change or not modeled)`;
    const { worstDay } = dayLoss;
    if (worstDay !== null) {
        const breakdown = dayLossBreakdownText(worstDay);
        return {
            ...base,
            detail:
                worstDay.share === null
                    ? `On ${worstDay.date}, ${breakdown}; no available bankroll to compare it with`
                    : `On ${worstDay.date}, ${breakdown}: ${formatPercent(worstDay.share)} of your available bankroll`,
            note: combinedNote(
                ...dayLossBasisNotes(worstDay).map(dayLossNoteSentence),
                unmeasured,
            ),
            tone: KpiTone.Negative,
            value: formatUsdCents(worstDay.lossCents),
        };
    }
    return dayLoss.measuredAccounts > 0
        ? {
              ...base,
              detail: 'No loss measured on any account since its previous snapshot',
              note: unmeasured,
              tone: KpiTone.Neutral,
              value: formatUsdCents(usdCents(0)),
          }
        : {
              ...base,
              detail: 'No active account could be compared with a previous snapshot yet',
              note: unmeasured,
              tone: KpiTone.Neutral,
              value: NOT_APPLICABLE,
          };
}

const MIN_MONTHS_FOR_DEVIATION = 2;

const PER_SLOT_TARGET_NOTE =
    'The per-slot target divides the portfolio-wide monthly target evenly across the funded slots active that month.';

function droppedViolationsNoteOf(count: number): null | string {
    if (count === 0) return null;
    const isSingular = count === 1;
    return `${counted({ count, plural: 'recorded violations', singular: 'recorded violation' })} ${isSingular ? 'belongs' : 'belong'} to no listed account and ${isSingular ? 'is' : 'are'} not in this split.`;
}

function formatCohortMultiple(cohort: CohortMultiple | null): string {
    if (cohort === null) return NOT_APPLICABLE;
    return cohort.value === null
        ? `${NOT_APPLICABLE}, n = ${String(cohort.n)}`
        : `${formatMultiple(cohort.value)} (P10-P90 ${cohort.interval.lower.toFixed(2)}x to ${cohort.interval.upper.toFixed(2)}x), n = ${String(cohort.n)}`;
}

function futureDatedRowsNoteOf(count: number): null | string {
    if (count === 0) return null;
    const isSingular = count === 1;
    return `${counted({ count, plural: 'fee or paid payout rows', singular: 'fee or paid payout row' })} ${isSingular ? 'is' : 'are'} dated after today and ${isSingular ? 'is' : 'are'} left out of the as-of cash.`;
}

function netCashBucketsOf(ledger: PortfolioLedger): readonly NetCashBucket[] {
    return ledger.accounts.flatMap((entry) =>
        monthlyCash(entry.fees, entry.payouts).map((month: MonthlyCash) => ({
            accountId: entry.row.id,
            firmKey: firmKeyOf(entry.row),
            month: month.month,
            netCashCents: month.net,
        })),
    );
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

function readyTiltVarianceCard(
    ledger: PortfolioLedger,
    firms: FirmNames,
    violations: readonly OverviewViolationRow[],
): TiltVarianceCardModel {
    const split = tiltVarianceSplitOf({
        firmKeyByAccount: new Map(
            ledger.accounts.map((entry) => [
                entry.row.id,
                firmKeyOf(entry.row),
            ]),
        ),
        netCashByBucket: netCashBucketsOf(ledger),
        violations,
    });
    const byFirmMonth = new Map<
        string,
        {
            firmKey: FirmKey;
            month: string;
            netCashCents: number;
            netWithoutViolationsCents: number;
            violationCostCents: number;
        }
    >();
    for (const row of split.rows) {
        const key = `${firmKeyId(row.firmKey)}|${row.month}`;
        const existing = byFirmMonth.get(key);
        byFirmMonth.set(key, {
            firmKey: row.firmKey,
            month: row.month,
            netCashCents: (existing?.netCashCents ?? 0) + row.netCashCents,
            netWithoutViolationsCents:
                (existing?.netWithoutViolationsCents ?? 0) +
                row.netWithoutViolationsCents,
            violationCostCents:
                (existing?.violationCostCents ?? 0) + row.violationCostCents,
        });
    }
    return {
        disclosure: split.disclosure,
        droppedNote: droppedViolationsNoteOf(split.droppedViolations),
        rows: byFirmMonth
            .values()
            .toArray()
            .toSorted(
                (a, b) =>
                    compareText(a.month, b.month) ||
                    compareText(firmKeyId(a.firmKey), firmKeyId(b.firmKey)),
            )
            .map((row) => ({
                firm: firms.of(row.firmKey),
                key: `${firmKeyId(row.firmKey)}-${row.month}`,
                month: row.month,
                netCash: formatUsdCents(usdCents(row.netCashCents)),
                netWithoutViolations: formatUsdCents(
                    usdCents(row.netWithoutViolationsCents),
                ),
                violationCost: formatUsdCents(usdCents(row.violationCostCents)),
            })),
    };
}

function repeatabilityCard(
    statement: MonthlyStatement,
    slots: RealizedNetPerSlot,
    target: null | number,
): RepeatabilityCardModel {
    const stats = repeatability(statement, slots, target);
    return {
        basisNote: REPEATABILITY_BASIS_NOTE,
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
                      : formatSampledRateWithoutLevel(
                            stats.shareAtOrAboveTarget,
                        ),
              sharePositive: formatSampledRateWithoutLevel(stats.sharePositive),
              standardDeviation:
                  stats.count < MIN_MONTHS_FOR_DEVIATION
                      ? NOT_APPLICABLE
                      : formatUsdCents(stats.standardDeviation),
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
    return rulebook?.samples ?? DEFAULT_RULEBOOK.samples;
}

function scaleAtMultipleReasonLabel(reason: ScaleAtMultipleReason): string {
    switch (reason) {
        case ScaleAtMultipleReason.CapacityNotSet: {
            return 'Set your daily account capacity in the rulebook to see what running your full capacity once would project.';
        }
        case ScaleAtMultipleReason.NoEndedAccounts: {
            return 'No account has ended yet, so there is no measured multiple to scale.';
        }
    }
}

function scaleBudgetBasisLabel(basis: ScaleBudgetBasis): string {
    switch (basis) {
        case ScaleBudgetBasis.CapacityFill: {
            return 'one capacity fill (daily account capacity x cheapest measured attempt cost)';
        }
        case ScaleBudgetBasis.EnteredMonthly: {
            return 'your entered monthly budget';
        }
        case ScaleBudgetBasis.PlanLimit: {
            return 'one plan-limit fill (free funded slots x cheapest measured attempt cost)';
        }
    }
}

function scaleCappedByLabel(cappedBy: ScaleCappedBy): string {
    switch (cappedBy) {
        case ScaleCappedBy.Capacity: {
            return 'your daily account capacity fill';
        }
        case ScaleCappedBy.PlanLimits: {
            return 'your plan limits';
        }
    }
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

function singleDayFactText(fact: SingleDayTriggerFact): string {
    const amount = formatUsdCents(usdCentsFromDollars(fact.amount));
    const effect = fact.isAutomatic
        ? 'moves the account live automatically'
        : 'can move the account live, which the firm does not apply automatically';
    return `${amount} of profit in one day ${effect}${fact.isExcessForfeited ? '; the excess is forfeited' : ''}`;
}

function sourceList(sources: readonly PortfolioSource[]): string {
    return joinWithAnd(sources.map((source) => SOURCE_LABEL[source]));
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
              monthlyPayoutTargetCents:
                  rulebook.review.monthlyPayoutTargetCents,
              targetMonthlyMultiple: rulebook.review.targetMonthlyMultiple,
          };
}

function tiltVarianceCard(
    ledger: PortfolioLedger,
    firms: FirmNames,
    violations: PortfolioLoad['violations'],
): TiltVarianceCardModel {
    switch (violations.status) {
        case OverviewSectionStatus.Failed: {
            return {
                disclosure: `Tilt vs variance could not be split because your ${sourceList(violations.failed)} could not be loaded.`,
                droppedNote: null,
                rows: [],
            };
        }
        case OverviewSectionStatus.Pending: {
            return {
                disclosure: TILT_VARIANCE_LOADING_DISCLOSURE,
                droppedNote: null,
                rows: [],
            };
        }
        case OverviewSectionStatus.Ready: {
            return readyTiltVarianceCard(ledger, firms, violations.rows);
        }
    }
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

function undatedPaidPayoutsCaveatOf(count: number): null | string {
    if (count === 0) return null;
    const isSingular = count === 1;
    return `${counted({ count, plural: 'paid payouts', singular: 'paid payout' })} ${isSingular ? 'has' : 'have'} no paid date; ${isSingular ? 'it is' : 'they are'} left out of the as-of cash, the available bankroll and ROI.`;
}

function unmeasuredTriggerNote(
    groups: readonly PlanGroup[],
    names: PlanNames,
): null | string {
    const sentences = groups.flatMap((group) =>
        liveTriggersOf(group).flatMap((trigger) =>
            trigger instanceof CumulativeAmountTrigger &&
            trigger.source?.verification === PolicyVerification.Confirmed
                ? [
                      `${names.of(group.planSerial)} has a verified cumulative payout trigger of ${formatUsdCents(usdCentsFromDollars(trigger.amount))} that this card does not measure.`,
                  ]
                : [],
        ),
    );
    return sentences.length === 0 ? null : sentences.join(' ');
}

function unresolvedNote(unresolvedAccounts: number): null | string {
    if (unresolvedAccounts === 0) return null;
    const isSingular = unresolvedAccounts === 1;
    return `${counted({ count: unresolvedAccounts, plural: 'accounts', singular: 'account' })} with a plan that is no longer modeled ${isSingular ? 'is' : 'are'} not counted here.`;
}

function violationsCardOf(
    violations: readonly OverviewViolationRow[],
    netCashCents: null | UsdCents,
): ViolationsCardModel {
    const stats: ViolationStats = violationStatsOf(violations, netCashCents);
    return {
        byKind: stats.byKind.map((row) => ({
            cost: formatUsdCents(usdCents(row.costCents)),
            count: row.count,
            key: row.kind,
            kind: row.kind,
        })),
        detectedCount: stats.detectedCount,
        disclosures: stats.disclosures,
        manualCount: stats.manualCount,
        netCost: formatUsdCents(usdCents(stats.netCostCents)),
        netCostShareOfNetCash:
            stats.netCostShareOfNetCash === null
                ? null
                : formatPercent(stats.netCostShareOfNetCash),
    };
}
