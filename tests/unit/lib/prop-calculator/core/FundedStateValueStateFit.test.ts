import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    defaultPayoutRegimeCap,
    fundedGridBoundsOf,
    type FundedStateValueConfig,
    isBeyondFundedGrid,
} from '~/lib/prop-calculator/core/FundedStateValue';

import { lockAtOneFiftyToyPlan, TOY_DRAWDOWN } from '../fundedStateValueToy';

const CUSHION_STEP_MULTIPLE = 0.25;

function fundedStartState(config: FundedStateValueConfig) {
    const state = config.plan.initialState();
    config.plan.beginFundedPhase(state);
    return state;
}

function toyConfig(
    overrides: Partial<FundedStateValueConfig> = {},
): FundedStateValueConfig {
    return {
        cushionStepMultiple: CUSHION_STEP_MULTIPLE,
        cycleBestDayBucketCount: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxCushionMultiple: 2,
        maxTailCushionMultiple: 2,
        payoutRegimeCap: 1,
        plan: lockAtOneFiftyToyPlan(),
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.4,
        ...overrides,
    };
}

describe('fundedGridBoundsOf derives the funded grid bounds without a solve (PT-30a2 step 3)', () => {
    it('takes the locked cushion top from the cushion multiple and the regime cap from the config', () => {
        const bounds = fundedGridBoundsOf(toyConfig());
        expect(bounds.lockedCushionTopDollars).toBe(2 * TOY_DRAWDOWN);
        expect(bounds.unlockedCushionTopDollars).toBe(TOY_DRAWDOWN);
        expect(bounds.payoutRegimeCap).toBe(1);
        expect(bounds.preLockOffsetTopDollars).toBeGreaterThanOrEqual(
            3 * TOY_DRAWDOWN,
        );
    });

    it('moves the locked cushion top with the cushion multiple and uses the plan default regime cap when none is given', () => {
        const wide = fundedGridBoundsOf(
            toyConfig({ maxCushionMultiple: 4, maxTailCushionMultiple: 4 }),
        );
        expect(wide.lockedCushionTopDollars).toBe(4 * TOY_DRAWDOWN);
        const config = toyConfig({ payoutRegimeCap: undefined });
        expect(fundedGridBoundsOf(config).payoutRegimeCap).toBe(
            defaultPayoutRegimeCap(config.plan),
        );
    });

    it('calls a state inside the cushion grid in range, the start cushion at the unlocked top and a state above it saturated', () => {
        const config = toyConfig();
        const bounds = fundedGridBoundsOf(config);
        const start = fundedStartState(config);
        const inside = {
            ...start,
            balance: start.threshold + TOY_DRAWDOWN / 2,
        };
        expect(isBeyondFundedGrid(bounds, inside)).toBe(false);
        expect(isBeyondFundedGrid(bounds, start)).toBe(true);
        const high = {
            ...start,
            balance: start.threshold + bounds.unlockedCushionTopDollars + 1,
        };
        expect(isBeyondFundedGrid(bounds, high)).toBe(true);
    });

    it('agrees with the solver saturation check on every sampled cushion', () => {
        const config = toyConfig();
        const bounds = fundedGridBoundsOf(config);
        const result = computeFundedStateValue(config);
        expect(result.cushionGrid.lockedTopDollars).toBe(
            bounds.lockedCushionTopDollars,
        );
        const start = fundedStartState(config);
        for (const cushion of [0, 25, 50, 99, 100, 101, 150, 199, 200, 250]) {
            for (const isThresholdLocked of [false, true]) {
                const state = {
                    ...start,
                    balance: start.threshold + cushion,
                    thresholdLocked: isThresholdLocked,
                };
                expect(isBeyondFundedGrid(bounds, state)).toBe(
                    result.isGridSaturated(state),
                );
            }
        }
    });
});
