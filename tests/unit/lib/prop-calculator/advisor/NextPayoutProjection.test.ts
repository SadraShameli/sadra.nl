import { describe, expect, it } from 'vitest';

import {
    AdviceSource,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    fundedCycleSeedFromTracker,
    type NextPayoutProjectionRequest,
    runNextPayoutProjection,
} from '~/lib/prop-calculator/advisor';
import {
    type AccountState,
    dollars,
    FirmId,
    type FundedCycleSeed,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    type FundedSimStart,
    type SimInputs,
} from '~/lib/prop-calculator/simulator';

function baseFor(
    overrides: Partial<Omit<SimInputs, 'plan'>> = {},
): Omit<SimInputs, 'plan'> {
    return {
        fundedHorizonDays: 40,
        maxEvalDays: 5,
        payoutRequestSize: 500,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 4,
        trials: 200,
        winrate: 0.4,
        ...overrides,
    };
}

function freshFundedState(plan: Plan): AccountState {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return state;
}

function policyFor(plan: Plan) {
    return buildEnginePolicy({
        fundedHorizonDays: 40,
        plan,
        rulebook: DEFAULT_RULEBOOK,
    }).policy;
}

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

describe('runNextPayoutProjection (PT-32)', () => {
    it('projects 0 days for an account already eligible for a payout right now', () => {
        const plan = rapidEodPlan();
        const state = freshFundedState(plan);
        const tracker = newFundedCycleTracker(state);
        const seed: FundedCycleSeed = fundedCycleSeedFromTracker(
            plan,
            state,
            tracker,
        );
        state.qualifyingDays = 5;
        state.balance = state.startingBalance + 5000;
        const start: FundedSimStart = {
            phase: TradingPhase.Funded,
            seed,
            state,
        };

        const request: NextPayoutProjectionRequest = {
            base: baseFor(),
            policy: policyFor(plan),
            source: AdviceSource.NextPayoutProjection,
            start,
        };
        const projection = runNextPayoutProjection(plan, request);

        expect(projection.expectedSessionDaysToFirstPayout).toStrictEqual({
            standardError: 0,
            value: 0,
        });
        expect(projection.expectedCalendarDaysToFirstPayout).toStrictEqual({
            standardError: 0,
            value: 0,
        });
        expect(projection.accountLostBeforeFirstPayoutProbability).toBe(0);
        expect(projection.firstPayoutCausedBreachProbability).toBe(0);
        expect(projection.alreadyEligible).toBe(true);
    });

    it('reports an account that is not eligible yet as not already eligible, even when every trial pays later (PT-68b, F-V18)', () => {
        const plan = rapidEodPlan();
        const state = freshFundedState(plan);
        const tracker = newFundedCycleTracker(state);
        const seed = fundedCycleSeedFromTracker(plan, state, tracker);
        const projection = runNextPayoutProjection(plan, {
            base: baseFor({ trials: 1, winrate: 1 }),
            policy: policyFor(plan),
            source: AdviceSource.NextPayoutProjection,
            start: { phase: TradingPhase.Funded, seed, state },
        });
        expect(projection.payingTrials).toBe(projection.trials);
        expect(
            projection.expectedCalendarDaysToFirstPayout.value,
        ).toBeGreaterThan(0);
        expect(projection.alreadyEligible).toBe(false);
    });

    it('reports a never-paying account as not already eligible', () => {
        const plan = rapidEodPlan();
        const state = freshFundedState(plan);
        const tracker = newFundedCycleTracker(state);
        const seed = fundedCycleSeedFromTracker(plan, state, tracker);
        const projection = runNextPayoutProjection(plan, {
            base: baseFor({ fundedHorizonDays: 3, trials: 10, winrate: 0 }),
            policy: policyFor(plan),
            source: AdviceSource.NextPayoutProjection,
            start: { phase: TradingPhase.Funded, seed, state },
        });
        expect(projection.alreadyEligible).toBe(false);
    });

    it('is deterministic per seed: the same request gives the same result', () => {
        const plan = rapidEodPlan();
        const state = freshFundedState(plan);
        const tracker = newFundedCycleTracker(state);
        const seed = fundedCycleSeedFromTracker(plan, state, tracker);
        const request: NextPayoutProjectionRequest = {
            base: baseFor(),
            policy: policyFor(plan),
            source: AdviceSource.NextPayoutProjection,
            start: { phase: TradingPhase.Funded, seed, state },
        };

        expect(runNextPayoutProjection(plan, request)).toStrictEqual(
            runNextPayoutProjection(plan, request),
        );
    });

    it('converts session days to calendar days by the documented 7/5 ratio, exactly at one trial', () => {
        const plan = rapidEodPlan();
        const state = freshFundedState(plan);
        const tracker = newFundedCycleTracker(state);
        const seed = fundedCycleSeedFromTracker(plan, state, tracker);
        const request: NextPayoutProjectionRequest = {
            base: baseFor({ trials: 1, winrate: 1 }),
            policy: policyFor(plan),
            source: AdviceSource.NextPayoutProjection,
            start: { phase: TradingPhase.Funded, seed, state },
        };

        const projection = runNextPayoutProjection(plan, request);
        if (projection.payingTrials === 0) {
            throw new Error(
                'expected the always-winning trial to pay at least once',
            );
        }
        const sessionDays = projection.expectedSessionDaysToFirstPayout.value;
        const calendarDays = projection.expectedCalendarDaysToFirstPayout.value;
        expect(calendarDays).toBe(Math.round((sessionDays * 7) / 5));
        expect(projection.expectedSessionDaysToFirstPayout.standardError).toBe(
            0,
        );
    });

    it('throws with the shared refusal prefix for an already-busted start (PT-14 validation)', () => {
        const plan = rapidEodPlan();
        const state = freshFundedState(plan);
        state.balance = dollars(0);
        const tracker = newFundedCycleTracker(state);
        const seed = fundedCycleSeedFromTracker(plan, state, tracker);
        const request: NextPayoutProjectionRequest = {
            base: baseFor(),
            policy: policyFor(plan),
            source: AdviceSource.NextPayoutProjection,
            start: { phase: TradingPhase.Funded, seed, state },
        };

        expect(() => runNextPayoutProjection(plan, request)).toThrow(
            /Invalid SimInputs: .*already busted/,
        );
    });

    it('never pays and reports a null breach probability when every trade is a guaranteed loss', () => {
        const plan = rapidEodPlan();
        const state = freshFundedState(plan);
        const tracker = newFundedCycleTracker(state);
        const seed = fundedCycleSeedFromTracker(plan, state, tracker);
        const request: NextPayoutProjectionRequest = {
            base: baseFor({ fundedHorizonDays: 3, trials: 10, winrate: 0 }),
            policy: policyFor(plan),
            source: AdviceSource.NextPayoutProjection,
            start: { phase: TradingPhase.Funded, seed, state },
        };

        const projection = runNextPayoutProjection(plan, request);
        expect(projection.payingTrials).toBe(0);
        expect(projection.firstPayoutCausedBreachProbability).toBeNull();
        expect(projection.expectedSessionDaysToFirstPayout).toStrictEqual({
            standardError: null,
            value: 0,
        });
    });

    it('reports a probability of account loss before any payout within [0, 1]', () => {
        const plan = rapidEodPlan();
        const state = freshFundedState(plan);
        const tracker = newFundedCycleTracker(state);
        const seed = fundedCycleSeedFromTracker(plan, state, tracker);
        const request: NextPayoutProjectionRequest = {
            base: baseFor({ trials: 100 }),
            policy: policyFor(plan),
            source: AdviceSource.NextPayoutProjection,
            start: { phase: TradingPhase.Funded, seed, state },
        };

        const projection = runNextPayoutProjection(plan, request);
        expect(
            projection.accountLostBeforeFirstPayoutProbability,
        ).toBeGreaterThanOrEqual(0);
        expect(
            projection.accountLostBeforeFirstPayoutProbability,
        ).toBeLessThanOrEqual(1);
        expect(
            projection.accountLostBeforeFirstPayoutStandardError,
        ).toBeGreaterThanOrEqual(0);
    });
});
