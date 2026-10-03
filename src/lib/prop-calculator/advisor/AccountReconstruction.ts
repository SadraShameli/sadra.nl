import {
    type AccountState,
    applyPayoutFloorEffect,
    contractLimitAt,
    type Dollars,
    dollars,
    DrawdownKind,
    type DrawdownState,
    type DrawdownStrategy,
    type FundedCycleSeed,
    type LiveAccountState,
    type LivePlan,
    ONE_CENT,
    PayoutDayGateBasis,
    PayoutFloorEffect,
    type Plan,
    restoreFundedCycleTracker,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    isLiveModelApproximation,
    LiveApplicabilityKind,
    type LivePlanApplicability,
    livePlanApplicability,
    LiveReconstructionAssumption,
    type ModeledLiveBuilder,
    type ModeledLiveTransition,
} from '~/lib/prop-calculator/firms';

import {
    type AccountPendingPayoutCounts,
    type AccountSnapshotInput,
} from './AccountSnapshotInput';
import {
    type Assumption,
    AssumptionBias,
    inputAssumption,
    type InputAssumptionKind,
} from './Assumption';
import { AssumptionKind } from './AssumptionKind';
import {
    calendarGateProgress,
    CalendarGateProgressKind,
} from './CalendarGateProgress';
import { nominalBalanceOf } from './DashboardBalanceConvention';
import {
    type DashboardFloorMismatch,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
} from './ReconstructedAccount';
import { SizingStage } from './SizingStage';

const RECONSTRUCTION_ASSUMPTION_KIND: Readonly<
    Record<LiveReconstructionAssumption, InputAssumptionKind>
> = {
    [LiveReconstructionAssumption.TopStepLiveReserveDefaulted]:
        AssumptionKind.TopStepLiveReserveDefaulted,
};

export enum ReconstructionErrorReason {
    EodPeakRequired = 'eod-peak-required',
    IntradayPeakRequired = 'intraday-peak-required',
}

interface PayoutFloorReplay {
    readonly drawdown: DrawdownStrategy | null;
    readonly effect: PayoutFloorEffect;
    readonly nominal: (amount: Dollars) => Dollars;
    readonly payoutsIssued: number;
    readonly releaseTarget: number;
}

export class AccountReconstructionError extends Error {
    constructor(
        readonly reason: ReconstructionErrorReason,
        message: string,
    ) {
        super(message);
        this.name = 'AccountReconstructionError';
    }
}

export const AccountReconstruction = {
    rebuild(
        input: AccountSnapshotInput,
        plan: Plan,
        personalMaxRiskPerTrade: Dollars | null,
        pendingPayoutCounts: AccountPendingPayoutCounts,
    ): ReconstructedAccount {
        switch (input.stage) {
            case SizingStage.Eval: {
                return rebuildEval(input, plan, personalMaxRiskPerTrade);
            }
            case SizingStage.Funded: {
                return rebuildFunded(
                    input,
                    plan,
                    personalMaxRiskPerTrade,
                    pendingPayoutCounts,
                );
            }
            case SizingStage.Live: {
                return rebuildLive(input, plan, personalMaxRiskPerTrade);
            }
        }
    },
};

function addAssumption(
    assumptions: Assumption[],
    kind: InputAssumptionKind,
    bias: AssumptionBias,
): void {
    assumptions.push(inputAssumption(kind, bias));
}

function applyDashboardFloor(
    input: AccountSnapshotInput,
    nominal: (amount: Dollars) => Dollars,
    state: DrawdownState,
    assumptions: Assumption[],
): DashboardFloorMismatch | null {
    if (input.dashboardFloor === undefined) return null;
    const nominalFloor = nominal(input.dashboardFloor);
    if (!(nominalFloor > state.threshold + ONE_CENT)) return null;
    const mismatch: DashboardFloorMismatch = {
        engineFloor: state.threshold,
        enteredFloor: nominalFloor,
    };
    state.threshold = nominalFloor;
    addAssumption(
        assumptions,
        AssumptionKind.DashboardFloorMismatch,
        AssumptionBias.Conservative,
    );
    return mismatch;
}

function applyLiveStart(
    state: LiveAccountState,
    drawdown: DrawdownStrategy | null,
    applicability: ModeledLiveBuilder | ModeledLiveTransition,
    input: AccountSnapshotInput,
    assumptions: Assumption[],
): void {
    const liveStart = input.liveStartBalance;
    if (liveStart === undefined) {
        addAssumption(
            assumptions,
            AssumptionKind.LiveStartBalanceDefaulted,
            AssumptionBias.Optimistic,
        );
        return;
    }
    if (state.startingBalance === liveStart) return;
    if (
        applicability.kind === LiveApplicabilityKind.Builder &&
        applicability.documentedStart !== null
    ) {
        addAssumption(
            assumptions,
            AssumptionKind.LiveStartBalanceDefaulted,
            AssumptionBias.Optimistic,
        );
        return;
    }
    state.startingBalance = liveStart;
    if (drawdown !== null) {
        state.threshold = drawdown.initialThreshold(liveStart);
    }
}

function applyReplayedPayoutFloor(
    replay: PayoutFloorReplay,
    state: DrawdownState,
    input: AccountSnapshotInput,
    assumptions: Assumption[],
): void {
    const { drawdown, effect, nominal, payoutsIssued, releaseTarget } = replay;
    if (payoutsIssued <= 0) return;
    const thresholdBeforeEffect = state.threshold;
    const wasLocked = state.thresholdLocked;
    applyPayoutFloorEffect(drawdown, state, effect, releaseTarget);
    if (effect !== PayoutFloorEffect.LockAtPlanFloor) return;
    if (input.floorAtLastPayout !== undefined) {
        state.threshold = nominal(input.floorAtLastPayout);
        state.thresholdLocked = true;
        return;
    }
    const lock = drawdown?.lock;
    if (lock === undefined || wasLocked) return;
    if (thresholdBeforeEffect > lock.lockedThreshold(state.startingBalance)) {
        addAssumption(
            assumptions,
            AssumptionKind.PeakOrderAssumed,
            AssumptionBias.Conservative,
        );
    }
}

function builderArgumentFor(
    applicability: ModeledLiveBuilder,
    input: AccountSnapshotInput,
    accountSize: Dollars,
): Dollars | null {
    const documented = applicability.documentedStart?.(accountSize);
    const liveStart = input.liveStartBalance;
    return documented !== undefined &&
        liveStart !== undefined &&
        liveStart >= documented.lowest &&
        liveStart < documented.highest
        ? liveStart
        : applicability.reconstructionDefault;
}

function buildLivePlanFor(
    applicability: ModeledLiveBuilder | ModeledLiveTransition,
    input: AccountSnapshotInput,
    accountSize: Dollars,
    assumptions: Assumption[],
): LivePlan {
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder: {
            if (applicability.reconstructionDefaultAssumption !== null) {
                assumptions.push(
                    inputAssumption(
                        RECONSTRUCTION_ASSUMPTION_KIND[
                            applicability.reconstructionDefaultAssumption
                        ],
                        AssumptionBias.Conservative,
                    ),
                );
            }
            const builderArgument = builderArgumentFor(
                applicability,
                input,
                accountSize,
            );
            return builderArgument === null
                ? applicability.builder(applicability.defaultCushionPercent)
                : applicability.builder(
                      applicability.defaultCushionPercent,
                      builderArgument,
                  );
        }
        case LiveApplicabilityKind.TransitionBuilder: {
            return applicability.transitionBuilder(
                applicability.defaultCushionPercent,
                dollars(0),
            );
        }
    }
}

function calendarSeedFor(
    plan: Plan,
    payoutsIssued: number,
    input: AccountSnapshotInput,
    assumptions: Assumption[],
): number {
    if (
        plan.payoutDayGateBasis !==
        PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout
    ) {
        return 0;
    }
    const anchorOn =
        payoutsIssued === 0
            ? (input.firstFundedTradeOn ?? null)
            : (input.lastPayoutOn ?? null);
    const progress = calendarGateProgress(
        plan,
        payoutsIssued,
        anchorOn,
        input.asOf,
    );
    if (progress.kind === CalendarGateProgressKind.MissingAnchor) {
        assumptions.push(
            inputAssumption(
                AssumptionKind.CalendarAnchorMissing,
                AssumptionBias.Conservative,
            ),
        );
        return 0;
    }
    return progress.restoreProgress;
}

function isTieredOnPeak(
    breakpointsFor: (isMicro: boolean) => readonly number[],
): boolean {
    return [false, true].some((isMicro) => breakpointsFor(isMicro).length > 0);
}

function nominalOf(
    input: AccountSnapshotInput,
    accountSize: Dollars,
): (amount: Dollars) => Dollars {
    return (amount) =>
        nominalBalanceOf(amount, input.dashboardConvention, accountSize);
}

function noteRequestsAssumedInBalance(
    input: AccountSnapshotInput,
    assumptions: Assumption[],
): void {
    if ((input.requestedPayoutsAssumedInBalance ?? 0) <= 0) return;
    addAssumption(
        assumptions,
        AssumptionKind.PendingPayoutAssumedInBalance,
        AssumptionBias.Optimistic,
    );
}

function rebuildEval(
    input: AccountSnapshotInput,
    plan: Plan,
    personalMaxRiskPerTrade: Dollars | null,
): ReconstructedFundedOrEvalAccount {
    const assumptions: Assumption[] = [];
    const nominal = nominalOf(input, plan.accountSize);
    const state = plan.initialState();
    replayDrawdownPeak(
        plan.drawdownFor(TradingPhase.Eval),
        state,
        input,
        nominal,
        assumptions,
    );
    const dashboardFloorMismatch = applyDashboardFloor(
        input,
        nominal,
        state,
        assumptions,
    );
    state.balance = nominal(input.balance);
    const hasHistory = state.balance !== plan.accountSize;
    state.bestDayProfit = input.evalBestDayProfit ?? 0;
    if (hasHistory && input.evalBestDayProfit === undefined) {
        addAssumption(
            assumptions,
            AssumptionKind.EvalBestDayProfitDefaulted,
            AssumptionBias.Optimistic,
        );
    }
    state.tradingDays = input.tradingDays ?? 0;
    if (hasHistory && input.tradingDays === undefined) {
        addAssumption(
            assumptions,
            AssumptionKind.TradingDaysDefaulted,
            AssumptionBias.Conservative,
        );
    }
    if (
        input.elapsedDaysSinceAttemptStart === undefined ||
        input.elapsedDaysSinceAttemptStart < state.tradingDays
    ) {
        assumptions.push(
            inputAssumption(
                AssumptionKind.ElapsedDaysApproximatedFromTradingDays,
                AssumptionBias.Optimistic,
            ),
        );
        state.elapsedDays = state.tradingDays;
    } else {
        state.elapsedDays = input.elapsedDaysSinceAttemptStart;
    }
    recordPeakProfits(
        plan,
        TradingPhase.Eval,
        state,
        input,
        nominal,
        assumptions,
    );
    if (hasHistory && plan.calendarWeekInactivityFor(TradingPhase.Eval)) {
        addAssumption(
            assumptions,
            AssumptionKind.CalendarWeekProgressDefaulted,
            AssumptionBias.Neutral,
        );
    }

    const { contractLimit, microContractLimit } = resolvedContractLimits(
        plan,
        TradingPhase.Eval,
        state,
        assumptions,
    );

    return {
        assumptions,
        contractLimit,
        cushion: state.balance - state.threshold,
        dashboardFloorMismatch,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        microContractLimit,
        otherAccountsPendingPayoutCount: 0,
        pendingPayoutCount: 0,
        pendingPayouts: 0,
        personalMaxRiskPerTrade,
        plan,
        resolvedDailyLossLimit: plan.resolvedDailyLossLimit(
            state,
            TradingPhase.Eval,
        ),
        state,
    };
}

function rebuildFunded(
    input: AccountSnapshotInput,
    plan: Plan,
    personalMaxRiskPerTrade: Dollars | null,
    pendingPayoutCounts: AccountPendingPayoutCounts,
): ReconstructedFundedOrEvalAccount {
    const assumptions: Assumption[] = [];
    const nominal = nominalOf(input, plan.accountSize);
    const state = plan.initialState();
    plan.beginFundedPhase(state);

    const drawdown = plan.fundedDrawdown;
    replayDrawdownPeak(drawdown, state, input, nominal, assumptions);

    const payoutsIssued = input.payoutsTaken ?? 0;
    applyReplayedPayoutFloor(
        {
            drawdown,
            effect: plan.payoutFloorEffect,
            nominal,
            payoutsIssued,
            releaseTarget: plan.accountSize,
        },
        state,
        input,
        assumptions,
    );

    const dashboardFloorMismatch = applyDashboardFloor(
        input,
        nominal,
        state,
        assumptions,
    );

    state.balance = nominal(input.balance);
    const hasHistory = payoutsIssued > 0 || state.balance !== plan.accountSize;
    if (hasHistory && input.payoutsTaken === undefined) {
        addAssumption(
            assumptions,
            AssumptionKind.PayoutsTakenDefaulted,
            AssumptionBias.Neutral,
        );
    }

    const pendingPayouts = input.pendingPayouts ?? 0;
    if (pendingPayouts > 0) {
        state.balance -= pendingPayouts;
        assumptions.push(
            inputAssumption(
                AssumptionKind.PendingPayoutDeducted,
                AssumptionBias.Conservative,
            ),
        );
    }
    noteRequestsAssumedInBalance(input, assumptions);

    if (input.qualifyingDaysSinceLastPayout !== undefined) {
        assumptions.push(
            inputAssumption(
                AssumptionKind.CumulativeQualifyingDaysAssumed,
                AssumptionBias.Neutral,
            ),
        );
    } else if (hasHistory) {
        addAssumption(
            assumptions,
            AssumptionKind.QualifyingDaysDefaulted,
            AssumptionBias.Conservative,
        );
    }
    state.qualifyingDays = input.qualifyingDaysSinceLastPayout ?? 0;
    state.tradingDays = input.tradingDays ?? 0;

    const fundedResetsUsed = input.fundedResetsUsed ?? 0;
    if (fundedResetsUsed > 0) {
        assumptions.push(
            inputAssumption(
                AssumptionKind.FundedResetsFromEvents,
                AssumptionBias.Neutral,
            ),
        );
    }

    if (input.balanceAtLastPayout === undefined && payoutsIssued > 0) {
        assumptions.push(
            inputAssumption(
                AssumptionKind.LastPayoutBalanceAssumedCurrent,
                AssumptionBias.Conservative,
            ),
        );
    }
    const lastPayoutBalance =
        input.balanceAtLastPayout === undefined
            ? payoutsIssued > 0
                ? state.balance
                : plan.accountSize
            : nominal(input.balanceAtLastPayout);
    const worstCaseCycleBestDayProfit = Math.max(
        0,
        state.balance - lastPayoutBalance,
    );
    if (input.cycleBestDayProfit === undefined) {
        assumptions.push(
            inputAssumption(
                AssumptionKind.CycleBestDayProfitAssumedWorstCase,
                AssumptionBias.Conservative,
            ),
        );
    }
    if (payoutsIssued > 0 && input.cumulativePayout === undefined) {
        addAssumption(
            assumptions,
            AssumptionKind.CumulativePayoutDefaulted,
            AssumptionBias.Optimistic,
        );
    }

    const seed: FundedCycleSeed = {
        calendarDayGateProgress: calendarSeedFor(
            plan,
            payoutsIssued,
            input,
            assumptions,
        ),
        cumulativePayout: input.cumulativePayout ?? 0,
        cycleBestDayProfit:
            input.cycleBestDayProfit ?? worstCaseCycleBestDayProfit,
        fundedResetsUsed,
        lastPayoutBalance,
        payoutsIssued,
        qualifyingDaysAtLastPayout: 0,
    };
    const tracker = restoreFundedCycleTracker(state, seed);
    recordPeakProfits(
        plan,
        TradingPhase.Funded,
        state,
        input,
        nominal,
        assumptions,
    );
    if (hasHistory && plan.calendarWeekInactivityFor(TradingPhase.Funded)) {
        addAssumption(
            assumptions,
            AssumptionKind.CalendarWeekProgressDefaulted,
            AssumptionBias.Neutral,
        );
    }

    const { contractLimit, microContractLimit } = resolvedContractLimits(
        plan,
        TradingPhase.Funded,
        state,
        assumptions,
    );

    return {
        assumptions,
        contractLimit,
        cushion: state.balance - state.threshold,
        dashboardFloorMismatch,
        fundedTracker: tracker,
        kind: TradingPhase.Funded,
        microContractLimit,
        otherAccountsPendingPayoutCount:
            pendingPayoutCounts.otherAccountsPendingPayoutCount,
        pendingPayoutCount: pendingPayoutCounts.pendingPayoutCount,
        pendingPayouts,
        personalMaxRiskPerTrade,
        plan,
        resolvedDailyLossLimit: plan.resolvedDailyLossLimit(
            state,
            TradingPhase.Funded,
        ),
        state,
    };
}

function rebuildLive(
    input: AccountSnapshotInput,
    plan: Plan,
    personalMaxRiskPerTrade: Dollars | null,
): ReconstructedLiveAccount {
    const assumptions: Assumption[] = [];
    const nominal = nominalOf(input, plan.accountSize);
    const applicability: LivePlanApplicability = livePlanApplicability(plan.id);
    noteRequestsAssumedInBalance(input, assumptions);
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder:
        case LiveApplicabilityKind.TransitionBuilder: {
            const livePlan = buildLivePlanFor(
                applicability,
                input,
                plan.accountSize,
                assumptions,
            );
            const state: LiveAccountState = livePlan.initialState();
            const drawdown = livePlan.liveDrawdown;
            applyLiveStart(state, drawdown, applicability, input, assumptions);
            if (drawdown !== null) {
                replayDrawdownPeak(
                    drawdown,
                    state,
                    input,
                    nominal,
                    assumptions,
                );
            }
            applyReplayedPayoutFloor(
                {
                    drawdown,
                    effect: livePlan.payoutFloorEffect,
                    nominal,
                    payoutsIssued: input.payoutsTaken ?? 0,
                    releaseTarget: livePlan.startingBalance,
                },
                state,
                input,
                assumptions,
            );
            const dashboardFloorMismatch =
                drawdown === null
                    ? null
                    : applyDashboardFloor(input, nominal, state, assumptions);
            state.balance = nominal(input.balance);
            const hasHistory = state.balance !== state.startingBalance;
            state.peakDayCloseProfit = Math.max(
                0,
                nominal(input.highestEodBalance ?? input.balance) -
                    state.startingBalance,
            );
            state.qualifyingDays = input.qualifyingDaysSinceLastPayout ?? 0;
            if (
                hasHistory &&
                input.qualifyingDaysSinceLastPayout === undefined &&
                livePlan.winningDayPayoutGate !== null
            ) {
                addAssumption(
                    assumptions,
                    AssumptionKind.QualifyingDaysDefaulted,
                    AssumptionBias.Conservative,
                );
            }
            if (hasHistory && livePlan.calendarWeekInactivity !== null) {
                addAssumption(
                    assumptions,
                    AssumptionKind.CalendarWeekProgressDefaulted,
                    AssumptionBias.Neutral,
                );
            }
            if (isLiveModelApproximation(applicability)) {
                assumptions.push(
                    inputAssumption(
                        AssumptionKind.LiveModelApproximation,
                        AssumptionBias.Conservative,
                    ),
                );
            }
            return {
                assumptions,
                cushion: state.balance - state.threshold,
                dashboardFloorMismatch,
                kind: ReconstructedLiveKind.Live,
                livePlan,
                personalMaxRiskPerTrade,
                plan,
                state,
            };
        }
        case LiveApplicabilityKind.NotModeled: {
            assumptions.push(
                inputAssumption(
                    AssumptionKind.LiveNotModeled,
                    AssumptionBias.Conservative,
                ),
            );
            const cushion =
                input.dashboardFloor === undefined
                    ? null
                    : nominal(input.balance) - nominal(input.dashboardFloor);
            return {
                assumptions,
                cushion,
                dashboardFloorMismatch: null,
                kind: ReconstructedLiveKind.Live,
                livePlan: null,
                personalMaxRiskPerTrade,
                plan,
                state: null,
            };
        }
    }
}

function recordPeakProfits(
    plan: Plan,
    phase: TradingPhase,
    state: AccountState,
    input: AccountSnapshotInput,
    nominal: (amount: Dollars) => Dollars,
    assumptions: Assumption[],
): void {
    const peakDayClose = Math.max(
        0,
        nominal(input.highestEodBalance ?? input.balance) -
            state.startingBalance,
    );
    const peakIntraday =
        input.highestIntradayBalance === undefined
            ? 0
            : nominal(input.highestIntradayBalance) - state.startingBalance;
    state.peakDayCloseProfit = peakDayClose;
    state.peakIntradayProfit = Math.max(peakDayClose, peakIntraday);
    state.intradayHighProfit = state.peakIntradayProfit;
    const isApproximated =
        (input.highestEodBalance === undefined &&
            isTieredOnPeak((isMicro) =>
                plan.peakSessionCloseBreakpoints(phase, isMicro),
            )) ||
        (input.highestIntradayBalance === undefined &&
            isTieredOnPeak((isMicro) =>
                plan.peakIntradayBreakpoints(phase, isMicro),
            ));
    if (isApproximated) {
        addAssumption(
            assumptions,
            AssumptionKind.PeakProfitApproximated,
            AssumptionBias.Conservative,
        );
    }
}

function replayDrawdownPeak(
    drawdown: DrawdownStrategy,
    state: DrawdownState,
    input: AccountSnapshotInput,
    nominal: (amount: Dollars) => Dollars,
    assumptions: Assumption[],
): void {
    switch (drawdown.kind) {
        case DrawdownKind.EodTrailing: {
            if (input.highestEodBalance === undefined) {
                thresholdFromFloorOrThrow(
                    state,
                    input,
                    nominal,
                    assumptions,
                    ReconstructionErrorReason.EodPeakRequired,
                    'An EOD-trailing drawdown needs the highest EOD balance to reconstruct the threshold',
                );
                return;
            }
            const peak = nominal(input.highestEodBalance);
            const synthetic: DrawdownState = { ...state, balance: peak };
            drawdown.onDayClose(synthetic);
            state.threshold = synthetic.threshold;
            state.thresholdLocked = synthetic.thresholdLocked;
            return;
        }
        case DrawdownKind.IntradayTrailing: {
            if (input.highestIntradayBalance === undefined) {
                thresholdFromFloorOrThrow(
                    state,
                    input,
                    nominal,
                    assumptions,
                    ReconstructionErrorReason.IntradayPeakRequired,
                    'An intraday-trailing drawdown needs the highest intraday balance to reconstruct the threshold',
                );
                return;
            }
            const currentBalance = nominal(input.balance);
            const peak = nominal(input.highestIntradayBalance);
            const synthetic: DrawdownState = {
                ...state,
                balance: currentBalance,
            };
            drawdown.onTrade(synthetic, 0, peak - currentBalance);
            state.threshold = synthetic.threshold;
            state.thresholdLocked = synthetic.thresholdLocked;
            return;
        }
        case DrawdownKind.Static: {
            return;
        }
    }
}

function resolvedContractLimits(
    plan: Plan,
    phase: TradingPhase,
    state: AccountState,
    assumptions: Assumption[],
): {
    readonly contractLimit: null | number;
    readonly microContractLimit: null | number;
} {
    if (plan.contractLimits === null) {
        return { contractLimit: null, microContractLimit: null };
    }
    assumptions.push(
        inputAssumption(
            AssumptionKind.ContractCapInstrumentAssumed,
            AssumptionBias.Neutral,
        ),
    );
    const context = plan.tierProfitContext(state);
    return {
        contractLimit: contractLimitAt(
            plan.contractLimits,
            phase,
            false,
            context,
        ),
        microContractLimit: contractLimitAt(
            plan.contractLimits,
            phase,
            true,
            context,
        ),
    };
}

function thresholdFromFloorOrThrow(
    state: DrawdownState,
    input: AccountSnapshotInput,
    nominal: (amount: Dollars) => Dollars,
    assumptions: Assumption[],
    reason: ReconstructionErrorReason,
    message: string,
): void {
    if (input.dashboardFloor === undefined) {
        throw new AccountReconstructionError(reason, message);
    }
    state.threshold = nominal(input.dashboardFloor);
    addAssumption(
        assumptions,
        AssumptionKind.PeakReplacedByDashboardFloor,
        AssumptionBias.Conservative,
    );
}
