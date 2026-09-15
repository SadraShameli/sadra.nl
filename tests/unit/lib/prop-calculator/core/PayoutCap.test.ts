import { describe, expect, it } from 'vitest';

import {
    dollars,
    FirmId,
    fraction,
    FundedNextVariant,
    percent,
} from '~/lib/prop-calculator/core';
import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import {
    PayoutCountTieredPayoutCap,
    QualifyingDaysMilestonePayoutCap,
} from '~/lib/prop-calculator/core/PayoutCap';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';
import { type SimInputs, simulate } from '~/lib/prop-calculator/simulator';

describe('QualifyingDaysMilestonePayoutCap.resolve', () => {
    const cap = new QualifyingDaysMilestonePayoutCap({
        afterMilestone: { balanceShareCap: null, requestCap: null },
        beforeMilestone: {
            balanceShareCap: fraction(0.5),
            requestCap: dollars(6000),
        },
        milestoneQualifyingDays: 30,
    });

    it('stays in the before-milestone regime at exactly the milestone count (boundary is strict >)', () => {
        expect(
            cap.resolve({ cumulativeQualifyingDays: 30, payoutsIssued: 0 }),
        ).toStrictEqual({
            balanceShareCap: 0.5,
            requestCap: 6000,
        });
    });

    it('switches to the uncapped regime one day past the milestone', () => {
        expect(
            cap.resolve({ cumulativeQualifyingDays: 31, payoutsIssued: 0 }),
        ).toStrictEqual({
            balanceShareCap: null,
            requestCap: null,
        });
    });

    it('stays in the before-milestone regime well under the threshold', () => {
        expect(
            cap.resolve({ cumulativeQualifyingDays: 0, payoutsIssued: 0 }),
        ).toStrictEqual({
            balanceShareCap: 0.5,
            requestCap: 6000,
        });
    });
});

describe('PayoutCountTieredPayoutCap.resolve', () => {
    const cap = new PayoutCountTieredPayoutCap([
        {
            fromPayoutIndex: 0,
            regime: { balanceShareCap: null, requestCap: dollars(1250) },
        },
        {
            fromPayoutIndex: 2,
            regime: { balanceShareCap: null, requestCap: dollars(2250) },
        },
        {
            fromPayoutIndex: 4,
            regime: { balanceShareCap: null, requestCap: dollars(3250) },
        },
    ]);

    it('caps at $1,250 for the 1st and 2nd payout', () => {
        expect(
            cap.resolve({ cumulativeQualifyingDays: 0, payoutsIssued: 0 })
                .requestCap,
        ).toBe(1250);
        expect(
            cap.resolve({ cumulativeQualifyingDays: 0, payoutsIssued: 1 })
                .requestCap,
        ).toBe(1250);
    });

    it('caps at $2,250 for the 3rd and 4th payout', () => {
        expect(
            cap.resolve({ cumulativeQualifyingDays: 0, payoutsIssued: 2 })
                .requestCap,
        ).toBe(2250);
        expect(
            cap.resolve({ cumulativeQualifyingDays: 0, payoutsIssued: 3 })
                .requestCap,
        ).toBe(2250);
    });

    it('caps at $3,250 for the 5th payout and every one after', () => {
        expect(
            cap.resolve({ cumulativeQualifyingDays: 0, payoutsIssued: 4 })
                .requestCap,
        ).toBe(3250);
        expect(
            cap.resolve({ cumulativeQualifyingDays: 0, payoutsIssued: 40 })
                .requestCap,
        ).toBe(3250);
    });

    it('selects the correct tier regardless of construction order', () => {
        const outOfOrder = new PayoutCountTieredPayoutCap([
            {
                fromPayoutIndex: 4,
                regime: { balanceShareCap: null, requestCap: dollars(3250) },
            },
            {
                fromPayoutIndex: 0,
                regime: { balanceShareCap: null, requestCap: dollars(1250) },
            },
            {
                fromPayoutIndex: 2,
                regime: { balanceShareCap: null, requestCap: dollars(2250) },
            },
        ]);
        expect(
            outOfOrder.resolve({
                cumulativeQualifyingDays: 0,
                payoutsIssued: 3,
            }).requestCap,
        ).toBe(2250);
    });

    it('throws if no tier starts at payout index 0', () => {
        expect(
            () =>
                new PayoutCountTieredPayoutCap([
                    {
                        fromPayoutIndex: 1,
                        regime: { balanceShareCap: null, requestCap: null },
                    },
                ]),
        ).toThrow(/must start at fromPayoutIndex 0/);
    });

    it('throws on duplicate fromPayoutIndex values', () => {
        expect(
            () =>
                new PayoutCountTieredPayoutCap([
                    {
                        fromPayoutIndex: 0,
                        regime: { balanceShareCap: null, requestCap: null },
                    },
                    {
                        fromPayoutIndex: 0,
                        regime: {
                            balanceShareCap: null,
                            requestCap: dollars(500),
                        },
                    },
                ]),
        ).toThrow(/duplicate fromPayoutIndex/);
    });

    it('throws on an empty tier list', () => {
        expect(() => new PayoutCountTieredPayoutCap([])).toThrow(
            /must not be empty/,
        );
    });
});

describe('PayoutCountTieredPayoutCap through tryFundedPayout: the cap raises exactly at the real payout-count boundary', () => {
    const fundedNext = new FundedNext();

    function planWithPayoutCountTiers() {
        const base = fundedNext.findPlan({
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Legacy,
        });
        if (!base) throw new Error('FundedNext Legacy 50K plan not found');
        return base.withOverrides({
            minDaysAfterPassForPayout: 0,
            minQualifyingDayProfit: undefined,
            payoutCapOverride: new PayoutCountTieredPayoutCap([
                {
                    fromPayoutIndex: 0,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(1250),
                    },
                },
                {
                    fromPayoutIndex: 1,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(3250),
                    },
                },
            ]),
        });
    }

    it('caps the 1st payout at $1,250 even when far more profit is available', () => {
        const plan = planWithPayoutCountTiers();
        const state = plan.initialState();
        state.balance = state.startingBalance + 20_000;
        state.threshold = state.startingBalance - 2000;
        state.thresholdLocked = true;

        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBe(1250);
    });

    it('raises the cap to $3,250 starting with the 2nd payout, keyed on payout count not qualifying days', () => {
        const plan = planWithPayoutCountTiers();
        const state = plan.initialState();
        state.balance = state.startingBalance + 40_000;
        state.threshold = state.startingBalance - 2000;
        state.thresholdLocked = true;

        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        expect(tracker.payoutsIssued).toBe(0);
        tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });
        expect(tracker.payoutsIssued).toBe(1);

        state.balance += 10_000;
        const secondPayout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });

        expect(secondPayout).not.toBeNull();
        expect(secondPayout?.debited).toBe(3250);
    });
});

describe('FundedNext Legacy: two-regime payout cap (live-verified: 50% / $6,000 before 30 benchmark days, uncapped after)', () => {
    const fundedNext = new FundedNext();

    function legacyPlan() {
        const plan = fundedNext.findPlan({
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Legacy,
        });
        if (!plan) throw new Error('FundedNext Legacy 50K plan not found');
        return plan;
    }

    it('caps an early large payout at $6,000, not 50% of profit', () => {
        const plan = legacyPlan();
        const state = plan.initialState();
        state.balance = state.startingBalance + 20_000;
        state.threshold = state.startingBalance - 2000;
        state.thresholdLocked = true;
        state.qualifyingDays = 10;

        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBe(6000);
    });

    it('removes the cap once cumulative qualifying days exceed 30', () => {
        const plan = legacyPlan();
        const state = plan.initialState();
        state.balance = state.startingBalance + 20_000;
        state.threshold = state.startingBalance - 2000;
        state.thresholdLocked = true;
        state.qualifyingDays = 31;

        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBeGreaterThan(6000);
        expect(payout?.debited).toBe(20_000);
    });

    it(
        'the retained-cushion floor (now the full funded drawdown by default, ' +
            "not the old 10%) already dominates this plan's payout cap at real " +
            'trading parameters, so removing the cap no longer changes Monte Carlo ' +
            "survival -- the cap's own marginal effect is still directly verified " +
            'by the two tryFundedPayout-level tests above (a large early payout ' +
            'against a locked, non-trailing threshold, where cushionRoom is not ' +
            'floor-bound)',
        () => {
            const cappedPlan = legacyPlan();
            const uncappedPlan = cappedPlan.withOverrides({
                payoutCapOverride: undefined,
            });

            function inputsFor(plan: typeof cappedPlan): SimInputs {
                return {
                    discounts: {
                        activationPercent: percent(0),
                        evalPercent: percent(0),
                    },
                    fundedHorizonDays: 252,
                    maxEvalDays: 150,
                    plan,
                    riskPerTrade: 200,
                    rrRatio: 2,
                    seed: 42,
                    tradesPerDay: 1,
                    trials: 2000,
                    winrate: 0.55,
                };
            }

            const capped = simulate(inputsFor(cappedPlan));
            const uncapped = simulate(inputsFor(uncappedPlan));

            expect(capped.fundedBustProbability).toBeCloseTo(
                uncapped.fundedBustProbability,
                6,
            );
            expect(capped.passProbability).toBeCloseTo(
                uncapped.passProbability,
                6,
            );
            expect(capped.fundedBustProbability).toBeLessThan(0.5);
            expect(capped.passProbability).toBeGreaterThan(0.5);
        },
    );
});
