import { describe, expect, it } from 'vitest';

import {
    computeEvalStateValue,
    dollars,
    fraction,
    type Plan,
    StaticDrawdown,
} from '~/lib/prop-calculator/core';

import { toyPlan } from '../evalStateValueToy';

const TOY_DRAWDOWN = 100;
const HALF_STEP_RISK = 50;

function staticBarrierToyPlan(): Plan {
    return toyPlan(TOY_DRAWDOWN).withOverrides({
        drawdown: new StaticDrawdown({ amount: dollars(TOY_DRAWDOWN) }),
    });
}

describe('the eval DP keeps the expected post-trade cushion when a trade is off its cushion grid (N-77)', () => {
    it('values a fair $50 bet on $100 cushion steps between a static bust and a target one drawdown away at the fair pass probability of one half, not as a pure loss', () => {
        const result = computeEvalStateValue({
            actionStepDollars: HALF_STEP_RISK,
            cushionStepDollars: 2 * HALF_STEP_RISK,
            maxActionDollars: HALF_STEP_RISK,
            maxEvalDays: 100,
            plan: staticBarrierToyPlan(),
            profitStepDollars: 2 * HALF_STEP_RISK,
            rrRatio: 1,
            tradesPerDay: 4,
            winrate: fraction(0.5),
        });
        expect(result.initialValue).toBeCloseTo(0.5, 9);
    });
});
