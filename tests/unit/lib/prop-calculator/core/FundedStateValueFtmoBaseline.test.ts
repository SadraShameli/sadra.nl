import { describe, expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import {
    dollars,
    FirmId,
    FtmoFuturesVariant,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/FundedStateValue';

async function ftmoGrowthCoarse(cycleBaselineFineRangeMultiple: number) {
    await warmFirmsRegistryCache();
    const plan = ALL_FIRMS.find(
        (firm) => firm.id === FirmId.FtmoFutures,
    )?.findPlan({
        accountSize: 50_000,
        firm: FirmId.FtmoFutures,
        variant: FtmoFuturesVariant.Growth,
    });
    if (!plan) throw new Error('FTMO Futures Growth 50K plan not found');
    return computeFundedStateValue({
        actionStepMultiple: 1,
        cushionStepMultiple: 0.5,
        cycleBaselineFineRangeMultiple,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        maxTailCushionMultiple: 6,
        meanHorizonDays: 20,
        payoutRegimeCap: 2,
        plan: plan.withOverrides({}),
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.5,
    });
}

describe('cycleBaselineFineRangeMultiple sets how finely the post-payout baseline is gridded (T11; PT-T1b re-pin: the three multiples are solved at cushion step 0.5 and action step 1 drawdown, one trade a day and a 20 day horizon with the cushion tail pinned off at 6 drawdowns, instead of cushion and action step 0.25, two trades a day and a 60 day horizon on the default 30 drawdown tail, whose single 281 s test pinned 14,076.77, 14,058.43 and 14,815.60 over 458,100, 502,200 and 722,700 states; each fixed point is the same run at tolerance 0.0001)', () => {
    it.each([
        {
            fineRangeMultiple: 0,
            fixedPoint: 2228.678785397225,
            reachedStateCount: 28_500,
            value: 2228.507297017571,
        },
        {
            fineRangeMultiple: 1,
            fixedPoint: 2236.068363034112,
            reachedStateCount: 32_400,
            value: 2236.068166427664,
        },
        {
            fineRangeMultiple: 6,
            fixedPoint: 2288.200599032106,
            reachedStateCount: 48_000,
            value: 2288.071612518592,
        },
    ])(
        'FTMO Futures Growth 50K at fine range multiple $fineRangeMultiple converges and keeps its pinned value $value, within its stated error bound of the fixed point $fixedPoint the solver reaches at tolerance 0.0001, over $reachedStateCount states: a finer baseline grid never rounds the baseline higher (FundedCycleBaselineGrid.test), so the three values rise with the multiple here',
        async ({ fineRangeMultiple, fixedPoint, reachedStateCount, value }) => {
            const result = await ftmoGrowthCoarse(fineRangeMultiple);
            expect(result.unconvergedLevelCount).toBe(0);
            expect(result.initialValue).toBeCloseTo(value, 6);
            expect(
                Math.abs(result.initialValue - fixedPoint),
            ).toBeLessThanOrEqual(result.valueErrorBound);
            expect(result.reachedStateCount).toBe(reachedStateCount);
        },
    );
});
