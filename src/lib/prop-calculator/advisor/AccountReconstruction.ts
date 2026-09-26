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
    type Plan,
    restoreFundedCycleTracker,
    TradingPhase,
} from '../core';
import { type AccountSnapshotInput } from './AccountSnapshotInput';
import {
    type Assumption,
    AssumptionBias,
    inputAssumption,
} from './Assumption';
import { AssumptionKind } from './AssumptionKind';
import {
    calendarGateProgress,
    CalendarGateProgressKind,
} from './CalendarGateProgress';
import { nominalBalanceOf } from './DashboardBalanceConvention';
import {
    isLiveModelApproximation,
    LiveApplicabilityKind,
    type LivePlanApplicability,
    livePlanApplicability,
    type ModeledLiveBuilder,
    type ModeledLiveTransition,
} from './LivePlanApplicability';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
} from './ReconstructedAccount';
import { SizingStage } from './SizingStage';

export enum ReconstructionErrorReason {
    EodPeakRequired = 'eod-peak-required',
    IntradayPeakRequired = 'intraday-peak-required',
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
    rebuild(input: AccountSnapshotInput, plan: Plan): ReconstructedAccount {
        switch (input.stage) {
            case SizingStage.Eval: {
                return rebuildEval(input, plan);
            }
            case SizingStage.Funded: {
                return rebuildFunded(input, plan);
            }
            case SizingStage.Live: {
                return rebuildLive(input, plan);
            }
        }
    },
};

function buildLivePlanFor(
    applicability: ModeledLiveBuilder | ModeledLiveTransition,
    assumptions: Assumption[],
): LivePlan {
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder: {
            if (applicability.reconstructionDefaultAssumption !== null) {
                assumptions.push(
                    inputAssumption(
                        applicability.reconstructionDefaultAssumption,
                        AssumptionBias.Conservative,
                    ),
                );
            }
            return applicability.reconstructionDefault === null
                ? applicability.builder(applicability.defaultCushionPercent)
                : applicability.builder(
                      applicability.defaultCushionPercent,
                      applicability.reconstructionDefault,
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

function nominalOf(
    input: AccountSnapshotInput,
    accountSize: Dollars,
): (amount: Dollars) => Dollars {
    return (amount) =>
        nominalBalanceOf(amount, input.dashboardConvention, accountSize);
}

function rebuildEval(
    input: AccountSnapshotInput,
    plan: Plan,
): ReconstructedFundedOrEvalAccount {
    const assumptions: Assumption[] = [];
    const nominal = nominalOf(input, plan.accountSize);
    const state = plan.initialState();
    replayDrawdownPeak(plan.drawdownFor(TradingPhase.Eval), state, input, nominal);
    state.balance = nominal(input.balance);
    state.bestDayProfit = input.evalBestDayProfit ?? 0;
    state.tradingDays = input.tradingDays ?? 0;
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

    const contractLimit = resolvedContractLimit(
        plan,
        TradingPhase.Eval,
        state,
        assumptions,
    );

    return {
        assumptions,
        contractLimit,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
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
): ReconstructedFundedOrEvalAccount {
    const assumptions: Assumption[] = [];
    const nominal = nominalOf(input, plan.accountSize);
    const state = plan.initialState();
    plan.beginFundedPhase(state);

    const drawdown = plan.fundedDrawdown;
    replayDrawdownPeak(drawdown, state, input, nominal);

    const payoutsIssued = input.payoutsTaken ?? 0;
    if (payoutsIssued > 0) {
        applyPayoutFloorEffect(
            drawdown,
            state,
            plan.payoutFloorEffect,
            plan.accountSize,
        );
    }

    if (input.dashboardFloor !== undefined) {
        const nominalFloor = nominal(input.dashboardFloor);
        if (nominalFloor > state.threshold + ONE_CENT) {
            state.threshold = nominalFloor;
            assumptions.push(
                inputAssumption(
                    AssumptionKind.DashboardFloorMismatch,
                    AssumptionBias.Conservative,
                ),
            );
        }
    }

    state.balance = nominal(input.balance);

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

    if (input.qualifyingDaysSinceLastPayout !== undefined) {
        assumptions.push(
            inputAssumption(
                AssumptionKind.CumulativeQualifyingDaysAssumed,
                AssumptionBias.Neutral,
            ),
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

    const contractLimit = resolvedContractLimit(
        plan,
        TradingPhase.Funded,
        state,
        assumptions,
    );

    return {
        assumptions,
        contractLimit,
        cushion: state.balance - state.threshold,
        fundedTracker: tracker,
        kind: TradingPhase.Funded,
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
): ReconstructedLiveAccount {
    const assumptions: Assumption[] = [];
    const nominal = nominalOf(input, plan.accountSize);
    const applicability: LivePlanApplicability = livePlanApplicability(
        plan.id,
    );
    switch (applicability.kind) {
        case LiveApplicabilityKind.Builder:
        case LiveApplicabilityKind.TransitionBuilder: {
            const livePlan = buildLivePlanFor(applicability, assumptions);
            const state: LiveAccountState = livePlan.initialState();
            const drawdown = livePlan.liveDrawdown;
            if (drawdown !== null) {
                replayDrawdownPeak(drawdown, state, input, nominal);
            }
            state.balance = nominal(input.balance);
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
                kind: ReconstructedLiveKind.Live,
                livePlan,
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
                kind: ReconstructedLiveKind.Live,
                livePlan: null,
                plan,
                state: null,
            };
        }
    }
}

function replayDrawdownPeak(
    drawdown: DrawdownStrategy,
    state: DrawdownState,
    input: AccountSnapshotInput,
    nominal: (amount: Dollars) => Dollars,
): void {
    switch (drawdown.kind) {
        case DrawdownKind.EodTrailing: {
            if (input.highestEodBalance === undefined) {
                throw new AccountReconstructionError(
                    ReconstructionErrorReason.EodPeakRequired,
                    'An EOD-trailing drawdown needs the highest EOD balance to reconstruct the threshold',
                );
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
                throw new AccountReconstructionError(
                    ReconstructionErrorReason.IntradayPeakRequired,
                    'An intraday-trailing drawdown needs the highest intraday balance to reconstruct the threshold',
                );
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

function resolvedContractLimit(
    plan: Plan,
    phase: TradingPhase,
    state: AccountState,
    assumptions: Assumption[],
): null | number {
    if (plan.contractLimits === null) return null;
    assumptions.push(
        inputAssumption(
            AssumptionKind.ContractCapInstrumentAssumed,
            AssumptionBias.Neutral,
        ),
    );
    return contractLimitAt(
        plan.contractLimits,
        phase,
        false,
        plan.tierProfitContext(state),
    );
}
