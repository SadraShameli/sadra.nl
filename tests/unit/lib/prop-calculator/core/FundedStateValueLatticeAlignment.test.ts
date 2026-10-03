import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    type FundedStateValueConfig,
} from '~/lib/prop-calculator/core/FundedStateValue';

import {
    exactFundedPolicyValue,
    lockAtOneFiftyToyPlan,
} from '../fundedStateValueToy';

const ALIGNED_TOLERANCE = 1e-3;
const OPEN_GAP_TOLERANCE = 0.01;

function dpOverExact(
    cushionStepMultiple: number,
    actionStepMultiple: number,
): number {
    const config: FundedStateValueConfig = {
        actionStepMultiple,
        convergenceTolerance: 1e-9,
        cushionStepMultiple,
        cycleBestDayBucketCount: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        plan: lockAtOneFiftyToyPlan(),
        rrRatio: 2,
        tradesPerDay: 2,
        winrate: 0.5,
    };
    const result = computeFundedStateValue(config);
    return result.initialValue / exactFundedPolicyValue(config, result);
}

describe('the funded DP against the exact value of its own policy, enumerated on real account state, on a toy that pays its first winning close with no horizon (N-89, WP60)', () => {
    it.each([
        { actionStep: 0.25, cushionStep: 0.25 },
        { actionStep: 0.2, cushionStep: 0.2 },
        { actionStep: 0.2, cushionStep: 0.1 },
    ])(
        'agrees to 0.1 percent when every landing sits on a cushion node: cushion step $cushionStep and action step $actionStep of the drawdown',
        ({ actionStep, cushionStep }) => {
            const ratio = dpOverExact(cushionStep, actionStep);

            expect(Math.abs(ratio - 1)).toBeLessThan(ALIGNED_TOLERANCE);
        },
        10_000,
    );

    it.fails(
        'agrees to 1 percent at a cushion step of 0.2 and an action step of 0.1 of the drawdown (open since WP60: a landing between two nodes is valued the next day by interpolating them; the DP is 1.85 times the exact value of its own policy here against 1.39 before WP60, while the same grid with a 4 day mean horizon agrees to 1 percent, so the gap grows with the horizon)',
        () => {
            const ratio = dpOverExact(0.2, 0.1);

            expect(Math.abs(ratio - 1)).toBeLessThan(OPEN_GAP_TOLERANCE);
        },
        10_000,
    );

    it.fails(
        'agrees to 1 percent at a cushion step of 0.25 and an action step of 0.125 of the drawdown (open since WP60: 1.19 times the exact value here, 0.92 before WP60)',
        () => {
            const ratio = dpOverExact(0.25, 0.125);

            expect(Math.abs(ratio - 1)).toBeLessThan(OPEN_GAP_TOLERANCE);
        },
        10_000,
    );
});
