import { type AccountState } from './AccountState';
import { type Plan } from './Plan';

export interface FundedCycleTracker {
    cycleBestDayProfit: number;
    lastPayoutBalance: number;
    payoutsIssued: number;
    qualifyingDaysAtLastPayout: number;
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
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
    payoutCap: number,
): null | number {
    const ladder = plan.payoutLadder;
    if (!ladder || payoutCap <= 0) return null;

    const cycleProfit = state.balance - tracker.lastPayoutBalance;
    const requiredProfit =
        tracker.payoutsIssued === 0
            ? plan.minPayoutProfit
            : ladder.minRequestAmount;
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

    const step = ladder.steps[tracker.payoutsIssued];
    if (step === undefined) return null;

    state.balance -= step;
    tracker.lastPayoutBalance = state.balance;
    tracker.qualifyingDaysAtLastPayout = state.qualifyingDays;
    tracker.cycleBestDayProfit = 0;
    tracker.payoutsIssued += 1;

    return step;
}
