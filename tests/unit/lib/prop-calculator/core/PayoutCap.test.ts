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
import { QualifyingDaysMilestonePayoutCap } from '~/lib/prop-calculator/core/PayoutCap';
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
        expect(cap.resolve({ cumulativeQualifyingDays: 30 })).toStrictEqual({
            balanceShareCap: 0.5,
            requestCap: 6000,
        });
    });

    it('switches to the uncapped regime one day past the milestone', () => {
        expect(cap.resolve({ cumulativeQualifyingDays: 31 })).toStrictEqual({
            balanceShareCap: null,
            requestCap: null,
        });
    });

    it('stays in the before-milestone regime well under the threshold', () => {
        expect(cap.resolve({ cumulativeQualifyingDays: 0 })).toStrictEqual({
            balanceShareCap: 0.5,
            requestCap: 6000,
        });
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
        'removing the cap collapses funded survival across a whole Monte Carlo run ' +
            '(E10 revisit: confirms the magnitude reported for the cap fix is a real, ' +
            'correctly-directional withdrawal-aggressiveness effect against the trailing-' +
            'drawdown floor, not shared-RNG-stream noise or a sampling artifact)',
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

            expect(capped.fundedBustProbability).toBeLessThan(0.5);
            expect(uncapped.fundedBustProbability).toBeGreaterThan(0.95);
            expect(capped.passProbability).toBeGreaterThan(0.5);
            expect(uncapped.passProbability).toBe(0);
        },
    );
});
