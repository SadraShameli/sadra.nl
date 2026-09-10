import { type AccountState } from './AccountState';
import { PayoutFloorEffect } from './PayoutFloorEffect';
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
        if (this.payoutsIssued >= maxPayouts) return null;

        const ladder = plan.payoutLadder;
        const cycleProfit = state.balance - this.lastPayoutBalance;
        const requiredProfit =
            this.payoutsIssued === 0
                ? plan.minPayoutProfit
                : (plan.minPayoutProfitPerCycle ??
                  ladder?.minRequestAmount ??
                  plan.minPayoutRequest);
        const hasQualifyingDays =
            state.qualifyingDays - this.qualifyingDaysAtLastPayout >=
            plan.minDaysAfterPassForPayout;
        const fundedConsistency = plan.fundedConsistencyRule(
            this.payoutsIssued,
        );
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
            state.balance - plan.payoutBalanceFloor(state, minRetainedCushion);
        const dollarCappedWithdrawable =
            plan.payoutRequestCap === null
                ? cushionRoom
                : Math.min(cushionRoom, plan.payoutRequestCap);
        const withdrawable =
            plan.payoutBalanceShareCap === null
                ? dollarCappedWithdrawable
                : Math.min(
                      dollarCappedWithdrawable,
                      plan.payoutBalanceShareCap *
                          Math.max(0, plan.accountProfit(state)),
                  );
        if (withdrawable <= 0) return null;

        const debited = resolveWithdrawal({
            cycleProfit,
            deniesIfUnaffordable: ladder?.deniesIfUnaffordable ?? false,
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
        switch (plan.payoutFloorEffect) {
            case PayoutFloorEffect.LockAtPlanFloor: {
                plan.fundedDrawdown.forceLock(state);
                break;
            }
            case PayoutFloorEffect.None: {
                break;
            }
            case PayoutFloorEffect.ReleaseFloor: {
                plan.fundedDrawdown.release(state, plan.accountSize);
                break;
            }
        }
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
    if (step !== undefined) return { amount: step, kind: 'step' };
    if (ladder.capsAtLastStep) {
        const lastStep = ladder.steps.at(-1);
        if (lastStep !== undefined) return { amount: lastStep, kind: 'step' };
    }
    return { kind: 'exhausted' };
}

function resolveWithdrawal(options: {
    cycleProfit: number;
    deniesIfUnaffordable: boolean;
    ladderStep: LadderStepLookup;
    minRequest: number;
    payoutRequestSize: number | undefined;
    profitShareCap: number | undefined;
    withdrawable: number;
}): null | number {
    const {
        cycleProfit,
        deniesIfUnaffordable,
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
            if (deniesIfUnaffordable) {
                return ladderStep.amount > ceiling ? null : ladderStep.amount;
            }
            const debited = Math.min(ladderStep.amount, ceiling);
            return debited < minRequest ? null : debited;
        }
    }
}
