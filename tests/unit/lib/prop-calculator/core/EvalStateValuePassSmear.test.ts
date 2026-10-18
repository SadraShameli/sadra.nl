import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    computeEvalStateValue,
    ConsistencyRule,
    ConsistencyScope,
    dollars,
    type EvalStateValueConfig,
    fraction,
    type Plan,
    StaticDrawdown,
} from '~/lib/prop-calculator/core';

import { exactPolicyPassProbability, toyPlan } from '../evalStateValueToy';

const ACTION_STEP = 50;
const CUSHION_STEP = 200;
const START_CUSHION = 200;
const TARGET_PROFIT = 200;

function consistencyToyConfig(): EvalStateValueConfig {
    const consistency = new ConsistencyRule(
        ConsistencyScope.Eval,
        fraction(0.55),
    );
    const plan = staticToyPlan(150).withOverrides({ consistency });
    return {
        ...passSmearConfig(plan, {
            maxActionDollars: 150,
            maxEvalDays: 2,
            tradesPerDay: 1,
        }),
        profitStepDollars: ACTION_STEP,
    };
}

function dayOneAfterWinOf(plan: Plan, winDollars: number): AccountState {
    return {
        ...plan.initialState(),
        balance: plan.initialState().balance + winDollars,
        bestDayProfit: winDollars,
        elapsedDays: 1,
        intradayHighProfit: winDollars,
        peakDayCloseProfit: winDollars,
        peakIntradayProfit: winDollars,
        tradingDays: 1,
    };
}

function passSmearConfig(
    plan: Plan,
    shape: {
        maxActionDollars: number;
        maxEvalDays: number;
        tradesPerDay: number;
    },
): EvalStateValueConfig {
    return {
        actionStepDollars: ACTION_STEP,
        cushionStepDollars: CUSHION_STEP,
        plan,
        profitStepDollars: CUSHION_STEP,
        rrRatio: 1,
        winrate: fraction(0.5),
        ...shape,
    };
}

function staticToyPlan(profitTarget: number): Plan {
    return toyPlan(profitTarget).withOverrides({
        drawdown: new StaticDrawdown({ amount: dollars(START_CUSHION) }),
    });
}

describe('the eval DP never credits a pass by interpolating the day-end value across cushion nodes (N-89)', () => {
    describe('two days, one trade a day, a $200 cushion step on a $50 action step, a profit target that lands on a cushion node', () => {
        const config = passSmearConfig(staticToyPlan(TARGET_PROFIT), {
            maxActionDollars: 100,
            maxEvalDays: 2,
            tradesPerDay: 1,
        });
        const result = computeEvalStateValue(config);

        it('values day 0 at the hand-solved 0.25: a $100 bet reaches cushion 300 on a win, from which a day-1 $100 bet passes at the $400 node with probability one half', () => {
            expect(result.initialValue).toBeCloseTo(0.25, 9);
        });

        it('equals the exact pass probability of its own policy enumerated on real account state', () => {
            expect(exactPolicyPassProbability(config, result)).toBeCloseTo(
                result.initialValue,
                9,
            );
        });

        it('sizes a day-1 trade from cushion 300 to the $100 that can reach the target, not the $50 that only lands between nodes', () => {
            const state = dayOneAfterWinOf(config.plan, 100);
            expect(state.balance - state.threshold).toBe(300);

            expect(result.dayPolicy.computeRisk?.(state, 0)).toBe(100);
            expect(result.riskAtReachedState(state, 0)).toBe(100);
        });

        it('reports its own pass probability under the same policy', () => {
            expect(result.policyPassProbability()).toBeCloseTo(0.25, 9);
        });
    });

    describe('two days, one trade a day, a $150 action that lands between the $200 and $400 cushion nodes just under the target', () => {
        const config = passSmearConfig(staticToyPlan(TARGET_PROFIT), {
            maxActionDollars: 150,
            maxEvalDays: 2,
            tradesPerDay: 1,
        });
        const result = computeEvalStateValue(config);

        it('does not credit the day-1 state at cushion 350 the pass of the $400 node: its value equals the exact pass probability of its own policy', () => {
            expect(exactPolicyPassProbability(config, result)).toBeCloseTo(
                0.25,
                9,
            );
            expect(result.initialValue).toBeCloseTo(
                exactPolicyPassProbability(config, result),
                9,
            );
        });

        it('reports the same exact pass probability for its own policy', () => {
            expect(result.policyPassProbability()).toBeCloseTo(
                exactPolicyPassProbability(config, result),
                9,
            );
        });

        it('sizes the day-1 trade from cushion 350 as the $50 that reaches the target, not an idle day', () => {
            const state = dayOneAfterWinOf(config.plan, 150);
            expect(state.balance - state.threshold).toBe(350);

            expect(result.riskAtReachedState(state, 0)).toBe(50);
        });
    });

    describe('one day, two trades, the same grid: the second trade is valued from the exact cushion the first one lands on', () => {
        const config = passSmearConfig(staticToyPlan(TARGET_PROFIT), {
            maxActionDollars: 100,
            maxEvalDays: 1,
            tradesPerDay: 2,
        });
        const result = computeEvalStateValue(config);

        it('equals the exact pass probability of its own policy', () => {
            expect(result.initialValue).toBeCloseTo(0.25, 9);
            expect(exactPolicyPassProbability(config, result)).toBeCloseTo(
                result.initialValue,
                9,
            );
        });
    });

    describe('a 55% best-day consistency rule at the edge of its window', () => {
        const config = consistencyToyConfig();
        const result = computeEvalStateValue(config);

        it('equals the exact pass probability of its own policy, where a $100 day then a $50 day reaches the target but breaks the rule', () => {
            expect(result.initialValue).toBeCloseTo(0.25, 9);
            expect(exactPolicyPassProbability(config, result)).toBeCloseTo(
                result.initialValue,
                9,
            );
        });

        it('is strictly harder to pass than the same toy without the rule, so the rule really binds', () => {
            const unruled = {
                ...config,
                plan: staticToyPlan(150),
            };
            const unruledResult = computeEvalStateValue(unruled);

            expect(
                exactPolicyPassProbability(unruled, unruledResult),
            ).toBeGreaterThan(result.initialValue + 0.2);
        });
    });

    describe('a dollar-valued objective', () => {
        it('reports the pass probability of its policy, not the dollar value, and that probability is the exact one', () => {
            const config: EvalStateValueConfig = {
                ...passSmearConfig(staticToyPlan(TARGET_PROFIT), {
                    maxActionDollars: 100,
                    maxEvalDays: 2,
                    tradesPerDay: 1,
                }),
                dayCost: () => 3,
                terminalValueAtFail: () => -40,
                terminalValueAtPass: 500,
            };
            const result = computeEvalStateValue(config);

            expect(result.initialValue).not.toBeCloseTo(0.25, 3);
            expect(result.policyPassProbability()).toBeCloseTo(
                exactPolicyPassProbability(config, result),
                9,
            );
        });
    });
});
