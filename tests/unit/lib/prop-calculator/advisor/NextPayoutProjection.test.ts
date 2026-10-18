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
    computedDayPolicy,
    dollars,
    FirmId,
    type FundedCycleSeed,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    PolicySizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    type FundedSimStart,
    type SimInputs,
} from '~/lib/prop-calculator/simulator';
import { binomialStandardError } from '~/lib/prop-calculator/stats';

import { payoutCapToyPlan } from '../simulator/toyPlans';

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

const TOY_IDLE_LIMIT = 30;
const TOY_FULL_PROFIT_RR = 1;
const TOY_PAYOUT = 100;
const TOY_SURPLUS_RR = 2;

function neverTrade(): number {
    return 0;
}

function toyPlan(isHardBreach: boolean): Plan {
    return payoutCapToyPlan().withOverrides({
        fullWithdrawalHardBreach: isHardBreach,
        maxConsecutiveIdleDays: TOY_IDLE_LIMIT,
        maxLifetimePayouts: 10,
        minPayoutProfit: dollars(0),
        minRetainedCushionOverride: dollars(0),
    });
}

function toyRequest(
    plan: Plan,
    riskOf: (state: AccountState) => number,
    trials: number,
    winrate: number,
    rrRatio: number,
): NextPayoutProjectionRequest {
    const state = freshFundedState(plan);
    const tracker = newFundedCycleTracker(state);
    const seed = fundedCycleSeedFromTracker(plan, state, tracker);
    return {
        base: baseFor({
            fundedDayPolicy: computedDayPolicy(
                riskOf,
                1,
                undefined,
                PolicySizing.ContractCapped,
            ),
            fundedHorizonDays: 40,
            payoutRequestSize: TOY_PAYOUT,
            riskPerTrade: TOY_PAYOUT,
            rrRatio,
            trials,
            winrate,
        }),
        policy: { ...policyFor(plan), retainedCushionRequest: 0 },
        source: AdviceSource.NextPayoutProjection,
        start: { phase: TradingPhase.Funded, seed, state },
    };
}

function winOnFirstDayThenIdle(state: AccountState): number {
    return state.balance === state.startingBalance ? TOY_PAYOUT : 0;
}

describe('runNextPayoutProjection: the breach figure counts only a breach the payout caused (F-88 (2))', () => {
    it('gives 1 when the first payout leaves the balance under the floor on the day it is paid', () => {
        const plan = toyPlan(true);
        const projection = runNextPayoutProjection(
            plan,
            toyRequest(plan, winOnFirstDayThenIdle, 5, 1, TOY_FULL_PROFIT_RR),
        );
        expect(projection.payingTrials).toBe(5);
        expect(projection.expectedSessionDaysToFirstPayout.value).toBeLessThan(
            TOY_IDLE_LIMIT,
        );
        expect(projection.firstPayoutCausedBreachProbability).toBe(1);
        expect(projection.firstPayoutCausedBreachStandardError).toBe(0);
    });

    it('gives 0 for an account that pays once and busts 30 sessions later', () => {
        const plan = toyPlan(false);
        const projection = runNextPayoutProjection(
            plan,
            toyRequest(plan, winOnFirstDayThenIdle, 5, 1, TOY_SURPLUS_RR),
        );
        expect(projection.payingTrials).toBe(5);
        expect(projection.expectedSessionDaysToFirstPayout.value).toBeLessThan(
            TOY_IDLE_LIMIT,
        );
        expect(projection.firstPayoutCausedBreachProbability).toBe(0);
        expect(projection.firstPayoutCausedBreachStandardError).toBe(0);
    });
});

describe('runNextPayoutProjection: the lost-before-first-payout figure and its standard error (F-88 (6))', () => {
    it('gives 1 with a standard error of 0 when every trial busts before paying', () => {
        const plan = toyPlan(false);
        const projection = runNextPayoutProjection(
            plan,
            toyRequest(plan, neverTrade, 8, 1, TOY_SURPLUS_RR),
        );
        expect(projection.payingTrials).toBe(0);
        expect(projection.accountLostBeforeFirstPayoutProbability).toBe(1);
        expect(projection.accountLostBeforeFirstPayoutStandardError).toBe(0);
        expect(projection.firstPayoutCausedBreachProbability).toBeNull();
    });

    it('gives lost over trials with the binomial standard error for a mixed toy', () => {
        const trials = 40;
        const plan = toyPlan(false);
        const projection = runNextPayoutProjection(
            plan,
            toyRequest(
                plan,
                winOnFirstDayThenIdle,
                trials,
                0.5,
                TOY_SURPLUS_RR,
            ),
        );
        const lostTrials = trials - projection.payingTrials;
        expect(projection.payingTrials).toBeGreaterThan(0);
        expect(lostTrials).toBeGreaterThan(0);
        expect(projection.accountLostBeforeFirstPayoutProbability).toBe(
            lostTrials / trials,
        );
        expect(projection.accountLostBeforeFirstPayoutStandardError).toBe(
            binomialStandardError(lostTrials / trials, trials),
        );
        expect(projection.firstPayoutCausedBreachProbability).toBe(0);
    });

    it('asserts the win-rate 0 case beside its paying-trial count', () => {
        const plan = rapidEodPlan();
        const state = freshFundedState(plan);
        const tracker = newFundedCycleTracker(state);
        const seed = fundedCycleSeedFromTracker(plan, state, tracker);
        const trials = 10;
        const projection = runNextPayoutProjection(plan, {
            base: baseFor({ fundedHorizonDays: 3, trials, winrate: 0 }),
            policy: policyFor(plan),
            source: AdviceSource.NextPayoutProjection,
            start: { phase: TradingPhase.Funded, seed, state },
        });
        expect(projection.payingTrials).toBe(0);
        expect(projection.accountLostBeforeFirstPayoutProbability).toBe(1);
        expect(projection.accountLostBeforeFirstPayoutStandardError).toBe(
            binomialStandardError(1, trials),
        );
    });
});
