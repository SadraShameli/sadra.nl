import { type AccountState } from './AccountState';
import { type PayoutLadder } from './PayoutTiers';
import { type Plan } from './Plan';

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

type LadderStepLookup =
    | { amount: number; kind: 'step' }
    | { kind: 'exhausted' }
    | { kind: 'no-ladder' };

export class FundedCycleTracker {
    cycleBestDayProfit = 0;

    lastPayoutBalance: number;

    payoutsIssued = 0;

    qualifyingDaysAtLastPayout: number;

    constructor(state: AccountState) {
        this.lastPayoutBalance = state.balance;
        this.qualifyingDaysAtLastPayout = state.qualifyingDays;
    }

    tryPayout(
        options: Omit<FundedPayoutOptions, 'tracker'>,
    ): FundedPayoutResult | null {
        const {
            maxPayouts,
            minRetainedCushion,
            payoutRequestSize,
            plan,
            state,
        } = options;
        if (maxPayouts <= 0) return null;

        const ladder = plan.payoutLadder;
        const cycleProfit = state.balance - this.lastPayoutBalance;
        const requiredProfit =
            this.payoutsIssued === 0
                ? plan.minPayoutProfit
                : (ladder?.minRequestAmount ?? plan.minPayoutRequest);
        const hasQualifyingDays =
            state.qualifyingDays - this.qualifyingDaysAtLastPayout >=
            plan.minDaysAfterPassForPayout;
        const fundedConsistency = plan.fundedConsistencyRule();
        const isConsistent = !fundedConsistency?.isViolated(
            this.cycleBestDayProfit,
            cycleProfit,
        );

        if (
            !hasQualifyingDays ||
            !isConsistent ||
            cycleProfit < requiredProfit
        ) {
            return null;
        }

        const cushionRoom =
            state.balance - state.threshold - Math.max(0, minRetainedCushion);
        const withdrawable =
            plan.payoutRequestCap === null
                ? cushionRoom
                : Math.min(cushionRoom, plan.payoutRequestCap);
        if (withdrawable <= 0) return null;

        const debited = resolveWithdrawal({
            cycleProfit,
            ladderStep: ladderStepLookup(ladder, this.payoutsIssued),
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
        this.lastPayoutBalance = state.balance;
        this.qualifyingDaysAtLastPayout = state.qualifyingDays;
        this.cycleBestDayProfit = 0;
        this.payoutsIssued += 1;

        return { debited, traderReceives: plan.payoutFromProfit(debited) };
    }
}

export function newFundedCycleTracker(state: AccountState): FundedCycleTracker {
    return new FundedCycleTracker(state);
}

export function tryFundedPayout(
    options: FundedPayoutOptions,
): FundedPayoutResult | null {
    const { tracker, ...rest } = options;
    return tracker.tryPayout(rest);
}

function ladderStepLookup(
    ladder: null | PayoutLadder,
    index: number,
): LadderStepLookup {
    if (!ladder) return { kind: 'no-ladder' };
    const step = ladder.steps[index];
    return step === undefined
        ? { kind: 'exhausted' }
        : { amount: step, kind: 'step' };
}

function resolveWithdrawal(options: {
    cycleProfit: number;
    ladderStep: LadderStepLookup;
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

    switch (ladderStep.kind) {
        case 'exhausted': {
            return null;
        }
        case 'no-ladder': {
            const available = Math.min(cycleProfit, ceiling);
            const debited =
                payoutRequestSize === undefined
                    ? available
                    : Math.min(payoutRequestSize, available);
            return debited < minRequest ? null : debited;
        }
        case 'step': {
            const debited = Math.min(ladderStep.amount, ceiling);
            return debited < minRequest ? null : debited;
        }
    }
}
