import { type AccountState } from './AccountState';
import { type Plan } from './Plan';

export interface FundedCycleTracker {
    cycleBestDayProfit: number;
    lastPayoutBalance: number;
    payoutsIssued: number;
    qualifyingDaysAtLastPayout: number;
}

export interface FundedPayoutOptions {
    maxPayouts: number;
    minRetainedCushion: number;
    payoutRequestSize: number | undefined;
    plan: Plan;
    state: AccountState;
    tracker: FundedCycleTracker;
}

export interface FundedPayoutResult {
    debited: number;
    traderReceives: number;
}

export function newFundedCycleTracker(state: AccountState): FundedCycleTracker {
    return {
        cycleBestDayProfit: 0,
        lastPayoutBalance: state.balance,
        payoutsIssued: 0,
        qualifyingDaysAtLastPayout: state.qualifyingDays,
    };
}

export function tryFundedPayout(
    options: FundedPayoutOptions,
): FundedPayoutResult | null {
    const {
        maxPayouts,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        state,
        tracker,
    } = options;
    if (maxPayouts <= 0) return null;

    const ladder = plan.payoutLadder;
    const cycleProfit = state.balance - tracker.lastPayoutBalance;
    const requiredProfit =
        tracker.payoutsIssued === 0
            ? plan.minPayoutProfit
            : (ladder?.minRequestAmount ?? plan.minPayoutRequest);
    const hasQualifyingDays =
        state.qualifyingDays - tracker.qualifyingDaysAtLastPayout >=
        plan.minDaysAfterPassForPayout;
    const isConsistent =
        !plan.consistency ||
        !plan.consistency.appliesToFunded() ||
        !plan.consistency.isViolated(tracker.cycleBestDayProfit, cycleProfit);

    if (!hasQualifyingDays || !isConsistent || cycleProfit < requiredProfit) {
        return null;
    }

    const withdrawable =
        state.balance - state.threshold - Math.max(0, minRetainedCushion);
    if (withdrawable <= 0) return null;

    const debited = resolveWithdrawal({
        cycleProfit,
        ladderStep: ladder
            ? (ladder.steps[tracker.payoutsIssued] ?? null)
            : undefined,
        minRequest: ladder?.minRequestAmount ?? plan.minPayoutRequest,
        payoutRequestSize,
        profitShareCap:
            plan.payoutProfitShare === null
                ? undefined
                : plan.payoutProfitShare * cycleProfit,
        withdrawable,
    });
    if (debited === null) return null;

    state.balance -= debited;
    tracker.lastPayoutBalance = state.balance;
    tracker.qualifyingDaysAtLastPayout = state.qualifyingDays;
    tracker.cycleBestDayProfit = 0;
    tracker.payoutsIssued += 1;

    return { debited, traderReceives: plan.payoutFromProfit(debited) };
}

function resolveWithdrawal(options: {
    cycleProfit: number;
    ladderStep: null | number | undefined;
    minRequest: number;
    payoutRequestSize: number | undefined;
    profitShareCap: number | undefined;
    withdrawable: number;
}): null | number {
    const {
        cycleProfit,
        ladderStep,
        minRequest,
        payoutRequestSize,
        profitShareCap,
        withdrawable,
    } = options;
    const ceiling =
        profitShareCap === undefined
            ? withdrawable
            : Math.min(withdrawable, profitShareCap);

    if (ladderStep !== undefined) {
        if (ladderStep === null) return null;
        const debited = Math.min(ladderStep, ceiling);
        return debited < minRequest ? null : debited;
    }

    const available = Math.min(cycleProfit, ceiling);
    const debited =
        payoutRequestSize === undefined
            ? available
            : Math.min(payoutRequestSize, available);
    return debited < minRequest ? null : debited;
}
