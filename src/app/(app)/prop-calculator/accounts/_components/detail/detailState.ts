import {
    type ConsistencyStatus,
    ConsistencyStatusKind,
    evalConsistencyStatus,
    fundedConsistencyStatus,
    type ModeledAccountRow,
    type OrderedSnapshot,
    type PerformanceEventRow,
    type PerformancePayoutRow,
    performanceSinceSnapshot,
    type PerformanceSinceSnapshot,
    type SnapshotAccountRow,
    type SnapshotEventRow,
    snapshotInputFrom,
    type SnapshotPayoutRow,
    type SnapshotSnapshotRow,
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
    AssumptionKind,
    type InputAssumptionKind,
    isLiveModelApproximation,
    LiveApplicabilityKind,
    livePlanApplicability,
    type ReconstructedAccount,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
    type ReconstructionErrorReason,
    snapshotInputIssues,
    SnapshotIssueSeverity,
    type SnapshotPlausibilityIssue,
} from '~/lib/prop-calculator/advisor';

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
    | LiveRulesCardModeled
    | LiveRulesCardNotModeled
    | LiveRulesCardPending;

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

const INPUT_ASSUMPTION_LABEL: Readonly<Record<InputAssumptionKind, string>> = {
    [AssumptionKind.CalendarAnchorMissing]:
        'No firm trade or payout date was recorded, so the payout day gate starts from zero.',
    [AssumptionKind.ContractCapInstrumentAssumed]:
        'The contract cap is estimated at the plan default instrument.',
    [AssumptionKind.CumulativeQualifyingDaysAssumed]:
        'Qualifying days since the last payout were entered directly, not derived from trade dates.',
    [AssumptionKind.CycleBestDayProfitAssumedWorstCase]:
        "No cycle best day was entered, so the worst case (today's profit since the last payout) is assumed.",
    [AssumptionKind.DashboardFloorMismatch]:
        'The entered dashboard floor was higher than the reconstructed floor, so the higher, safer floor is used.',
    [AssumptionKind.ElapsedDaysApproximatedFromTradingDays]:
        'Elapsed days were approximated from trading days, not the real attempt start date.',
    [AssumptionKind.FundedResetsFromEvents]:
        'The funded reset count comes from recorded reset events.',
    [AssumptionKind.GrossOnlyPayouts]:
        'At least one paid payout has no net amount, so its gross amount is counted as received.',
    [AssumptionKind.LastPayoutBalanceAssumedCurrent]:
        'No balance at the last payout was entered, so the current balance is assumed.',
    [AssumptionKind.LiveModelApproximation]:
        'Only a firm-level live model exists for this plan, so its live rules are an approximation.',
    [AssumptionKind.LiveNotModeled]: 'No live stage is modeled for this plan.',
    [AssumptionKind.LiveTriggersNotChecked]:
        'Live triggers on the lifetime payout cap are not checked yet.',
    [AssumptionKind.NoHolidayCalendar]:
        'Calendar-day gates use weekdays only; holidays are not excluded.',
    [AssumptionKind.PeakOrderAssumed]:
        'Without a floor at the last payout, the conservative, higher floor order is assumed.',
    [AssumptionKind.PendingPayoutDeducted]:
        'A pending payout request was deducted from the balance.',
    [AssumptionKind.PercentCandidatesLeftOut]:
        'Some engine candidates were left out of this figure.',
    [AssumptionKind.PositionSizingUnspecified]:
        'Position sizing (instrument and stop) was not specified.',
    [AssumptionKind.RebuyLagAssumed]:
        'The rebuy lag is assumed rather than measured.',
    [AssumptionKind.TopStepLfaProgressDefaulted]:
        "TopStep's LFA progress is defaulted, not stored.",
    [AssumptionKind.TopStepLiveReserveDefaulted]:
        "TopStep's live reserve progress is defaulted, not stored.",
};

export function assumptionLabel(kind: InputAssumptionKind): string {
    return INPUT_ASSUMPTION_LABEL[kind];
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
): null | PreviousReconstruction {
    if (snapshot === null) return null;
    const { input, personalMaxRiskPerTrade } = snapshotInputFrom(
        plan,
        account,
        snapshot,
        events,
        payouts,
        asOf,
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
): StateCardView {
    if (snapshot === null) return { kind: StateCardKind.NoSnapshot };
    const { input, personalMaxRiskPerTrade } = snapshotInputFrom(
        plan,
        account,
        snapshot,
        events,
        payouts,
        asOf,
    );
    const issues = snapshotInputIssues(plan, input);
    try {
        return {
            account: AccountReconstruction.rebuild(
                input,
                plan,
                personalMaxRiskPerTrade,
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
