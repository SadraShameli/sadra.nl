import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    DrawdownKind,
    type FundedCycleTracker,
    newFundedCycleTracker,
    PayoutFloorEffect,
    type Plan,
    type PlanInit,
    TradingPhase,
    tryFundedPayout,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

const ALL_PLANS: readonly Plan[] = ALL_FIRMS.flatMap((firm) => firm.plans);

function fullyQualifiedFundedAccount(
    plan: Plan,
    profit: number,
): { state: ReturnType<Plan['initialState']>; tracker: FundedCycleTracker } {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const tracker = newFundedCycleTracker(state);
    state.balance = state.startingBalance + profit;
    state.qualifyingDays =
        plan.minDaysAfterPassForPayout +
        (plan.minDaysAfterPassForPayoutPerCycle ?? 0) +
        10;
    return { state, tracker };
}

describe(`every plan of every registered firm has at least one plan (registry sanity: ${ALL_PLANS.length} plans found)`, () => {
    it('the registry is non-empty', () => {
        expect(ALL_PLANS.length).toBeGreaterThan(0);
    });
});

describe.each(ALL_PLANS)(
    '$label: a hard-terminating daily loss limit strictly dominates its soft twin',
    (plan) => {
        const phasesWithALimit = [
            TradingPhase.Eval,
            TradingPhase.Funded,
        ].filter(
            (phase) =>
                plan.dailyLossLimitFor(phase).kind !== DailyLossLimitKind.None,
        );

        if (phasesWithALimit.length === 0) {
            it('has no daily loss limit in either phase, so there is nothing to dominate', () => {
                expect(plan.dailyLossLimitFor(TradingPhase.Eval).kind).toBe(
                    DailyLossLimitKind.None,
                );
                expect(plan.dailyLossLimitFor(TradingPhase.Funded).kind).toBe(
                    DailyLossLimitKind.None,
                );
            });
        }

        for (const phase of phasesWithALimit) {
            it(`phase=${phase}: Lockout never busts where Terminate does, and Terminate strictly busts more`, () => {
                const overrideKey: keyof PlanInit =
                    phase === TradingPhase.Eval
                        ? 'evalDailyLossLimitBreach'
                        : 'fundedDailyLossLimitBreach';
                const lockoutTwin = plan.withOverrides({
                    [overrideKey]: DailyLossLimitBreachEffect.Lockout,
                });
                const terminateTwin = plan.withOverrides({
                    [overrideKey]: DailyLossLimitBreachEffect.Terminate,
                });

                const state = lockoutTwin.initialState();
                if (phase === TradingPhase.Funded) {
                    lockoutTwin.beginFundedPhase(state);
                }
                const resolvedLimit = lockoutTwin.dailyLossLimitFor(phase);
                const amount =
                    resolvedLimit.kind === DailyLossLimitKind.Flat
                        ? resolvedLimit.amount
                        : null;
                if (amount === null) return;

                state.todayPnL = 0 - amount;
                const isLockedOut = lockoutTwin.isDayLockedOut(state, phase);
                expect(isLockedOut).toBe(true);

                const isLockoutBust = lockoutTwin.isBust(state, phase);
                const isTerminateBust = terminateTwin.isBust(
                    { ...state },
                    phase,
                );
                expect(isLockoutBust).toBe(false);
                expect(isTerminateBust).toBe(true);
            });
        }
    },
);

describe.each(ALL_PLANS)(
    '$label: the plan’s own default retained cushion never self-busts on a fully legal payout',
    (plan) => {
        it('a maximum payout at defaultRetainedCushion leaves isBust false', () => {
            const { state, tracker } = fullyQualifiedFundedAccount(
                plan,
                plan.fundedDrawdown.amount * 10,
            );
            const payout = tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: plan.defaultRetainedCushion(),
                payoutRequestSize: undefined,
                plan,
                state,
                tracker,
            });
            if (payout === null) return;
            expect(plan.isBust(state, TradingPhase.Funded)).toBe(false);
        });

        if (plan.defaultRetainedCushion() > 0) {
            it('payoutBalanceFloor strictly exceeds the bust threshold, since this plan models a nonzero retained cushion', () => {
                const { state } = fullyQualifiedFundedAccount(plan, 0);
                const floor = plan.payoutBalanceFloor(
                    state,
                    plan.defaultRetainedCushion(),
                );
                expect(floor).toBeGreaterThan(state.threshold);
            });
        } else {
            it('payoutBalanceFloor equals the bust threshold exactly, since this plan models no retained cushion at all -- protection against a self-bust payout must come from its own payout caps, tested separately by the never-self-busts case above', () => {
                const { state } = fullyQualifiedFundedAccount(plan, 0);
                const floor = plan.payoutBalanceFloor(
                    state,
                    plan.defaultRetainedCushion(),
                );
                expect(floor).toBe(state.threshold);
            });
        }
    },
);

describe.each(ALL_PLANS)(
    '$label: can issue at least one payout when profit is plentiful',
    (plan) => {
        it('a funded account holding 10x the drawdown amount can be paid', () => {
            const { state, tracker } = fullyQualifiedFundedAccount(
                plan,
                plan.fundedDrawdown.amount * 10,
            );
            const payout = tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: plan.defaultRetainedCushion(),
                payoutRequestSize: undefined,
                plan,
                state,
                tracker,
            });
            expect(payout).not.toBeNull();
            expect(payout?.debited).toBeGreaterThan(0);
            expect(payout?.traderReceives).toBeGreaterThan(0);
        });
    },
);

describe.each(ALL_PLANS)(
    '$label: payoutFromProfit is monotone non-decreasing and never exceeds its input',
    (plan) => {
        const thresholds = plan.payoutTiers
            .map((tier) => tier.thresholdProfit)
            .toSorted((a, b) => a - b);
        const grid = [
            0,
            ...thresholds.flatMap((t) => [
                Math.max(0, t - 1),
                t,
                t + 1,
                t * 2 + 1,
            ]),
            plan.fundedDrawdown.amount * 20,
        ].toSorted((a, b) => a - b);

        it('non-decreasing across every declared tier boundary', () => {
            let previous = -Infinity;
            for (const profit of grid) {
                const payout = plan.payoutFromProfit(profit);
                expect(payout).toBeGreaterThanOrEqual(previous - 1e-9);
                expect(payout).toBeGreaterThanOrEqual(0);
                previous = payout;
            }
        });

        it('never exceeds the profit passed in', () => {
            for (const profit of grid) {
                if (profit <= 0) continue;
                expect(plan.payoutFromProfit(profit)).toBeLessThanOrEqual(
                    profit + 1e-9,
                );
            }
        });
    },
);

describe.each(ALL_PLANS)(
    '$label: paired eval/funded overrides are neither dead nor cross-phase leaks',
    (plan) => {
        it('overriding only fundedDailyLossLimitBreach changes funded, not eval', () => {
            const evalBreach = plan.dailyLossLimitBreachFor(TradingPhase.Eval);
            const flipped =
                evalBreach === DailyLossLimitBreachEffect.Lockout
                    ? DailyLossLimitBreachEffect.Terminate
                    : DailyLossLimitBreachEffect.Lockout;
            const fundedLimit = plan.dailyLossLimitFor(TradingPhase.Funded);
            if (fundedLimit.kind === DailyLossLimitKind.None) return;

            const twin = plan.withOverrides({
                fundedDailyLossLimitBreach: flipped,
            });
            expect(twin.dailyLossLimitBreachFor(TradingPhase.Funded)).toBe(
                flipped,
            );
            expect(twin.dailyLossLimitBreachFor(TradingPhase.Eval)).toBe(
                evalBreach,
            );
        });

        it('overriding only fundedDrawdown changes drawdownFor(Funded), not drawdownFor(Eval)', () => {
            const requiresAFundedLock =
                plan.payoutFloorEffect === PayoutFloorEffect.LockAtPlanFloor;
            if (requiresAFundedLock && plan.drawdown.lock === undefined) {
                return;
            }
            const evalDrawdown = plan.drawdownFor(TradingPhase.Eval);
            const twin = plan.withOverrides({
                fundedDrawdown: plan.drawdown,
            });
            expect(twin.drawdownFor(TradingPhase.Funded)).toBe(plan.drawdown);
            expect(twin.drawdownFor(TradingPhase.Eval)).toBe(evalDrawdown);
        });

        it('overriding maxConsecutiveIdleDays changes the funded accessor and, with an explicit evalMaxConsecutiveIdleDays pin in the same call, never leaks into eval', () => {
            const evalIdle = plan.maxConsecutiveIdleDaysFor(TradingPhase.Eval);
            const fundedIdle = plan.maxConsecutiveIdleDaysFor(
                TradingPhase.Funded,
            );
            const newFundedValue = fundedIdle === null ? 5 : fundedIdle + 1;
            const twin = plan.withOverrides({
                evalMaxConsecutiveIdleDays: evalIdle,
                maxConsecutiveIdleDays: newFundedValue,
            });
            expect(twin.maxConsecutiveIdleDaysFor(TradingPhase.Funded)).toBe(
                newFundedValue,
            );
            expect(twin.maxConsecutiveIdleDaysFor(TradingPhase.Eval)).toBe(
                evalIdle,
            );
        });
    },
);

describe.each(
    ALL_PLANS.filter((plan) => plan.fundedDrawdown.lock !== undefined),
)(
    '$label: the natural (onDayClose/onTrade) lock trigger always snaps the ' +
        "threshold to exactly the documented locked value, even when the " +
        'same call’s ratchet already carried it higher -- confirmed against ' +
        "DrawdownTransitions.test.ts's own synthetic case " +
        "('locks at the documented floor even when the qualifying day " +
        "overshoots the trigger'); forceLock's separate never-lower guard " +
        'is a payout-specific safety measure (LockAtPlanFloor debits are ' +
        "sized against the pre-lock floor, so forceLock must never drop " +
        'the floor below a balance already paid out against it) and is ' +
        'deliberately NOT the same contract as the natural lock',
    (plan) => {
        it('locks at exactly lockedThreshold(accountSize), not at the higher ratcheted value', () => {
            const lock = plan.fundedDrawdown.lock;
            if (!lock) return;
            const start = plan.accountSize;
            const amount = plan.fundedDrawdown.amount;
            const targetLockedThreshold = lock.lockedThreshold(start);

            const overshootMargin =
                Math.abs(targetLockedThreshold - start) + amount + 1000;
            const overshootBalance =
                Math.max(
                    start + lock.atProfit,
                    targetLockedThreshold + amount,
                ) + overshootMargin;
            const ratchetedThreshold = overshootBalance - amount;
            if (ratchetedThreshold <= targetLockedThreshold) return;

            const state = plan.initialState();
            plan.beginFundedPhase(state);
            state.balance = overshootBalance;
            if (plan.fundedDrawdown.kind === DrawdownKind.IntradayTrailing) {
                plan.fundedDrawdown.onTrade(state, 0, 0);
            } else {
                plan.fundedDrawdown.onDayClose(state);
            }

            expect(state.thresholdLocked).toBe(true);
            expect(state.threshold).toBe(targetLockedThreshold);
        });
    },
);
