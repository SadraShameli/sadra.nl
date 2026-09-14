import { type AccountState } from './AccountState';
import { PayoutFloorEffect } from './PayoutFloorEffect';
import { type PayoutLadder } from './PayoutTiers';
import { type Plan } from './Plan';
import { dollars } from './units';

export interface FundedPayoutOptions {
    daysSinceFunded?: number;
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
            daysSinceFunded,
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
                : (plan.minPayoutProfitPerCycle ?? dollars(0));
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
        const cap = plan.resolvedPayoutCap(state, this.payoutsIssued);
        const dollarCappedWithdrawable =
            cap.requestCap === null
                ? cushionRoom
                : Math.min(cushionRoom, cap.requestCap);
        const withdrawable =
            cap.balanceShareCap === null
                ? dollarCappedWithdrawable
                : Math.min(
                      dollarCappedWithdrawable,
                      cap.balanceShareCap *
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

        return {
            debited,
            traderReceives: plan.payoutFromProfit(
                debited,
                daysSinceFunded ?? 0,
            ),
        };
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
            const available =
                profitShareCap === undefined
                    ? Math.min(cycleProfit, ceiling)
                    : ceiling;
            const debited =
                payoutRequestSize === undefined
                    ? available
                    : Math.min(payoutRequestSize, available);
            return debited < minRequest ? null : debited;
        }
        case 'step': {
            if (deniesIfUnaffordable) {
                if (ladderStep.amount > ceiling) return null;
                const debited =
                    payoutRequestSize === undefined
                        ? ladderStep.amount
                        : Math.min(payoutRequestSize, ladderStep.amount);
                return debited < minRequest ? null : debited;
            }
            const cappedByCeiling = Math.min(ladderStep.amount, ceiling);
            const debited =
                payoutRequestSize === undefined
                    ? cappedByCeiling
                    : Math.min(payoutRequestSize, cappedByCeiling);
            return debited < minRequest ? null : debited;
        }
    }
}
