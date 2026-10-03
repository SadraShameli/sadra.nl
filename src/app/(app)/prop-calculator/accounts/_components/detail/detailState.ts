import {
    ledgerOrDateFailure,
    OverviewSectionStatus,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    type ConsistencyStatus,
    ConsistencyStatusKind,
    evalConsistencyStatus,
    type FirmPayoutCount,
    firmPayoutCounts,
    fundedConsistencyStatus,
    type ModeledAccountRow,
    type OrderedSnapshot,
    type PerformanceEventRow,
    type PerformancePayoutRow,
    performanceSinceSnapshot,
    type PerformanceSinceSnapshot,
    PortfolioLedger,
    type PortfolioLedgerRows,
    type SnapshotAccountRow,
    type SnapshotEventRow,
    type SnapshotFirmCount,
    snapshotInputFrom,
    type SnapshotPayoutRow,
    type SnapshotSnapshotRow,
    type StoredFirmId,
} from '~/lib/prop-accounts';
import {
    type DrawdownKind,
    type Fraction0to1,
    type LiveContractCaps,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AccountReconstructionError,
    type AccountSnapshotInput,
    type Assumption,
    AssumptionKind,
    type ReconstructedAccount,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
    type ReconstructionErrorReason,
    snapshotInputIssues,
    SnapshotIssueSeverity,
    type SnapshotPlausibilityIssue,
} from '~/lib/prop-calculator/advisor';
import {
    isLiveModelApproximation,
    LiveApplicabilityKind,
    livePlanApplicability,
} from '~/lib/prop-calculator/firms';

export enum FirmPayoutCountKind {
    Failed = 'failed',
    Pending = 'pending',
    Ready = 'ready',
}

export enum LiveRulesCardKind {
    Modeled = 'modeled',
    NotModeled = 'not-modeled',
    Pending = 'pending',
}

export enum StateCardKind {
    NoSnapshot = 'no-snapshot',
    PeakRequired = 'peak-required',
    Ready = 'ready',
}

export type DetailSnapshotRow = OrderedSnapshot & SnapshotSnapshotRow;

export type FirmPayoutCountOutcome =
    | {
          readonly count: FirmPayoutCount;
          readonly kind: FirmPayoutCountKind.Ready;
      }
    | { readonly kind: FirmPayoutCountKind.Failed; readonly message: string }
    | { readonly kind: FirmPayoutCountKind.Pending };

export interface LiveRulesCardModeled {
    readonly contractLimit: LiveContractCaps;
    readonly cushionPercent: Fraction0to1;
    readonly dailyLossLimit: null | number;
    readonly drawdown: null | {
        readonly amount: number;
        readonly kind: DrawdownKind;
    };
    readonly isApproximation: boolean;
    readonly kind: LiveRulesCardKind.Modeled;
    readonly minPayoutRequest: number;
    readonly requiresLockForWithdrawal: boolean;
}

export interface LiveRulesCardNotModeled {
    readonly kind: LiveRulesCardKind.NotModeled;
}

export interface LiveRulesCardPending {
    readonly kind: LiveRulesCardKind.Pending;
}

export type LiveRulesCardView =
    LiveRulesCardModeled | LiveRulesCardNotModeled | LiveRulesCardPending;

export interface PerformanceCardView {
    readonly consistency: ConsistencyStatus;
    readonly performance: PerformanceSinceSnapshot;
}

export interface PreviousReconstruction {
    readonly account: ReconstructedAccount;
    readonly asOf: string;
}

export type StateCardView =
    | {
          readonly account: ReconstructedAccount;
          readonly asOf: string;
          readonly input: AccountSnapshotInput;
          readonly issues: readonly SnapshotPlausibilityIssue[];
          readonly kind: StateCardKind.Ready;
      }
    | {
          readonly asOf: string;
          readonly issues: readonly SnapshotPlausibilityIssue[];
          readonly kind: StateCardKind.PeakRequired;
          readonly message: string;
          readonly reason: ReconstructionErrorReason;
      }
    | { readonly kind: StateCardKind.NoSnapshot };

export function firmPayoutCountOutcomeOf(args: {
    readonly accounts: PortfolioLedgerRows['accounts'] | undefined;
    readonly events: PortfolioLedgerRows['events'] | undefined;
    readonly failure: null | string;
    readonly firmId: null | StoredFirmId;
    readonly payouts: PortfolioLedgerRows['payouts'] | undefined;
    readonly today: string;
    readonly userId: string | undefined;
}): FirmPayoutCountOutcome {
    const { accounts, events, failure, firmId, payouts, today, userId } = args;
    if (failure !== null) {
        return { kind: FirmPayoutCountKind.Failed, message: failure };
    }
    if (
        accounts === undefined ||
        events === undefined ||
        firmId === null ||
        payouts === undefined ||
        userId === undefined
    ) {
        return { kind: FirmPayoutCountKind.Pending };
    }
    const computed = ledgerOrDateFailure(() =>
        firmPayoutCounts(
            PortfolioLedger.fromRows(userId, {
                accounts,
                events,
                fees: [],
                payouts,
            }),
            today,
        ).find((entry) => entry.firmId === firmId),
    );
    if (computed.kind !== OverviewSectionStatus.Ready) {
        return { kind: FirmPayoutCountKind.Failed, message: computed.message };
    }
    return computed.value === undefined
        ? {
              kind: FirmPayoutCountKind.Failed,
              message:
                  'The accounts list holds no account of this firm, so its payout count could not be computed.',
          }
        : { count: computed.value, kind: FirmPayoutCountKind.Ready };
}

export function ledgerQueryFailureOf(
    queries: readonly {
        readonly data: unknown;
        readonly error: null | { readonly message: string };
        readonly label: string;
    }[],
): null | string {
    const failed = queries.find(
        ({ data, error }) => error !== null && data === undefined,
    );
    return failed?.error == null
        ? null
        : `The ${failed.label} could not be loaded: ${failed.error.message}`;
}

export function liveAccountOf(
    view: StateCardView,
): null | ReconstructedLiveAccount {
    if (view.kind !== StateCardKind.Ready) return null;
    return view.account.kind === ReconstructedLiveKind.Live
        ? view.account
        : null;
}

export function liveRulesCardOf(
    plan: Plan,
    reconstructed: null | ReconstructedLiveAccount,
): LiveRulesCardView {
    const applicability = livePlanApplicability(plan.id);
    if (applicability.kind === LiveApplicabilityKind.NotModeled) {
        return { kind: LiveRulesCardKind.NotModeled };
    }
    if (reconstructed?.livePlan == null || reconstructed.state === null) {
        return { kind: LiveRulesCardKind.Pending };
    }
    const { livePlan, state } = reconstructed;
    return {
        contractLimit: livePlan.liveContractLimitsFor(state),
        cushionPercent: livePlan.cushionPercentFor(state),
        dailyLossLimit: livePlan.dailyLossLimitFor(state),
        drawdown:
            livePlan.liveDrawdown === null
                ? null
                : {
                      amount: livePlan.liveDrawdown.amount,
                      kind: livePlan.liveDrawdown.kind,
                  },
        isApproximation:
            isLiveModelApproximation(applicability) ||
            reconstructed.assumptions.some(
                (assumption) =>
                    assumption.kind === AssumptionKind.LiveModelApproximation,
            ),
        kind: LiveRulesCardKind.Modeled,
        minPayoutRequest: livePlan.minPayoutRequest,
        requiresLockForWithdrawal: livePlan.requiresLockForWithdrawal,
    };
}

export function performanceCardOf(
    latest: {
        readonly account: ReconstructedAccount;
        readonly asOf: string;
        readonly input: AccountSnapshotInput;
    },
    previous: null | PreviousReconstruction,
    events: readonly PerformanceEventRow[],
    payouts: readonly PerformancePayoutRow[],
): PerformanceCardView {
    return {
        consistency: consistencyOf(latest.account, latest.input),
        performance: performanceSinceSnapshot(
            latest.account,
            latest.asOf,
            previous?.account ?? null,
            previous?.asOf ?? null,
            events,
            payouts,
        ),
    };
}

export function previousReconstructionOf(
    plan: Plan,
    account: ModeledAccountRow<SnapshotAccountRow>,
    snapshot: DetailSnapshotRow | null,
    events: readonly SnapshotEventRow[],
    payouts: readonly SnapshotPayoutRow[],
    asOf: string,
    firmCount: SnapshotFirmCount,
): null | PreviousReconstruction {
    if (snapshot === null) return null;
    const { input, pendingPayoutCounts, personalMaxRiskPerTrade } =
        snapshotInputFrom(
            plan,
            account,
            snapshot,
            events,
            payouts,
            asOf,
            firmCount,
        );
    const isBlocked = snapshotInputIssues(plan, input).some(
        (issue) => issue.severity === SnapshotIssueSeverity.Impossible,
    );
    if (isBlocked) return null;
    try {
        return {
            account: AccountReconstruction.rebuild(
                input,
                plan,
                personalMaxRiskPerTrade,
                pendingPayoutCounts,
            ),
            asOf: input.asOf,
        };
    } catch (error) {
        if (error instanceof AccountReconstructionError) return null;
        throw error;
    }
}

export function stateCardOf(
    plan: Plan,
    account: ModeledAccountRow<SnapshotAccountRow>,
    snapshot: DetailSnapshotRow | null,
    events: readonly SnapshotEventRow[],
    payouts: readonly SnapshotPayoutRow[],
    asOf: string,
    firmCount: SnapshotFirmCount,
): StateCardView {
    if (snapshot === null) return { kind: StateCardKind.NoSnapshot };
    const { assumptions, input, pendingPayoutCounts, personalMaxRiskPerTrade } =
        snapshotInputFrom(
            plan,
            account,
            snapshot,
            events,
            payouts,
            asOf,
            firmCount,
        );
    const issues = snapshotInputIssues(plan, input);
    try {
        return {
            account: withFirmCountAssumptions(
                AccountReconstruction.rebuild(
                    input,
                    plan,
                    personalMaxRiskPerTrade,
                    pendingPayoutCounts,
                ),
                assumptions,
            ),
            asOf: input.asOf,
            input,
            issues,
            kind: StateCardKind.Ready,
        };
    } catch (error) {
        if (error instanceof AccountReconstructionError) {
            return {
                asOf: input.asOf,
                issues,
                kind: StateCardKind.PeakRequired,
                message: error.message,
                reason: error.reason,
            };
        }
        throw error;
    }
}

function consistencyOf(
    account: ReconstructedAccount,
    input: AccountSnapshotInput,
): ConsistencyStatus {
    if (account.kind === ReconstructedLiveKind.Live) {
        return { kind: ConsistencyStatusKind.NoRule };
    }
    switch (account.kind) {
        case TradingPhase.Eval: {
            return evalConsistencyStatus(
                account.plan,
                input.evalBestDayProfit,
                account.state.balance - account.state.startingBalance,
            );
        }
        case TradingPhase.Funded: {
            if (account.fundedTracker === null) {
                return { kind: ConsistencyStatusKind.NoRule };
            }
            const cycle = account.fundedTracker.cycleSnapshot(
                account.plan,
                account.state,
            );
            return fundedConsistencyStatus(
                account.plan,
                cycle.payoutsIssued,
                input.cycleBestDayProfit,
                account.state.balance - cycle.lastPayoutBalance,
            );
        }
    }
}

function withFirmCountAssumptions(
    account: ReconstructedAccount,
    assumptions: readonly Assumption[],
): ReconstructedAccount {
    const unknownCount = assumptions.filter(
        (assumption) =>
            assumption.kind === AssumptionKind.FirmPayoutCountNotChecked,
    );
    return unknownCount.length === 0
        ? account
        : {
              ...account,
              assumptions: [...account.assumptions, ...unknownCount],
          };
}
