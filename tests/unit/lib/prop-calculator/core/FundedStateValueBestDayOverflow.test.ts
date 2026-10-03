import { describe, expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import { dollars, FirmId, type Plan } from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/FundedStateValue';

const COARSE_GRID_TAIL_OFF = {
    actionStepMultiple: 0.5,
    cushionStepMultiple: 1,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    maxTailCushionMultiple: 6,
    meanHorizonDays: 6,
    payoutRegimeCap: 1,
    rrRatio: 2,
    tradesPerDay: 1,
    winrate: 0.5,
} as const;

const COARSE_GRID_TAIL_7 = {
    actionStepMultiple: 1,
    cushionStepMultiple: 0.5,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    maxCushionMultiple: 1,
    maxTailCushionMultiple: 7,
    meanHorizonDays: 6,
    payoutRegimeCap: 1,
    rrRatio: 2,
    tailCushionStepMultiple: 3,
    tradesPerDay: 1,
    winrate: 0.5,
} as const;

async function plan50k(firmId: FirmId, label: string): Promise<Plan> {
    await warmFirmsRegistryCache();
    const plan = ALL_FIRMS.find((firm) => firm.id === firmId)?.plans.find(
        (candidate) =>
            candidate.accountSize === 50_000 && candidate.label === label,
    );
    if (!plan) throw new Error(`${firmId} ${label} not in the registry`);
    return plan.withOverrides({});
}

describe('the best-day overflow bucket leaves the value of real consistency plans alone where no day passes the cap (WP58e, N-90; PT-T1b re-pin: the five plans are solved at a coarse grid, action step 0.5 and cushion step 1 drawdown, one trade a day, one payout regime and a 6 day horizon, instead of the fast grid of action step 0.125, cushion step 0.25, two trades a day, six regimes and a 60 day horizon, whose runs took 80 to 390 s each; each value is the pre-overflow solver on the new inputs and each state count the overflow solver on them, which is the pre-overflow count of 3,192, 1,710, 1,710, 19,152 and 39,680 plus one best-day bucket per level)', () => {
    it.each([
        {
            firmId: FirmId.Tradeify,
            label: '$50K · Lightning Funded',
            reachedStateCount: 3990,
            value: 687.848270415437,
        },
        {
            firmId: FirmId.AlphaFutures,
            label: '$50K · Zero',
            reachedStateCount: 2052,
            value: 407.4986784850878,
        },
        {
            firmId: FirmId.AlphaFutures,
            label: '$50K · Standard',
            reachedStateCount: 2052,
            value: 711.6479362157211,
        },
        {
            firmId: FirmId.Tradeify,
            label: '$50K · Growth',
            reachedStateCount: 23_940,
            value: 601.468892072045,
        },
        {
            firmId: FirmId.TopStep,
            label: '$50K · Standard path · Consistency XFA',
            reachedStateCount: 47_616,
            value: 1220.0088192521002,
        },
    ])(
        '$firmId $label at the coarse grid with the coarse tail off keeps its pre-overflow value $value to 1e-6 and gains one best-day bucket per level',
        async ({ firmId, label, reachedStateCount, value }) => {
            const result = computeFundedStateValue({
                ...COARSE_GRID_TAIL_OFF,
                plan: await plan50k(firmId, label),
            });
            expect(result.unconvergedLevelCount).toBe(0);
            expect(result.reachedStateCount).toBe(reachedStateCount);
            expect(result.initialValue).toBeCloseTo(value, 6);
        },
    );
});

describe('the best-day cap sized for the coarse tail step widens the best-day grid of real consistency plans at a coarse tail without moving their value (WP58e review, N-90; PT-T1b: the five plans are solved at cushion step 0.5, a fine top of 1 drawdown, a tail to 7 drawdowns in steps of 3, one trade a day, one payout regime and a 6 day horizon, instead of the fast grid with a 12 drawdown tail whose runs took 90 to 640 s each; the value is the one-step allowance solver on the same inputs, equal to the sized cap to 1e-6, so the value pin only guards against the cap moving it while the state count is what shows the sized cap, and the over-cap value difference itself is pinned in FundedStateValueBestDayBound)', () => {
    async function solveCoarseTail(firmId: FirmId, label: string) {
        const result = computeFundedStateValue({
            ...COARSE_GRID_TAIL_7,
            plan: await plan50k(firmId, label),
        });
        expect(result.unconvergedLevelCount).toBe(0);
        return result;
    }

    it.each([
        {
            firmId: FirmId.AlphaFutures,
            label: '$50K · Zero',
            oneStepStateCount: 4464,
            reachedStateCount: 5022,
            value: 404.799750032943,
        },
        {
            firmId: FirmId.AlphaFutures,
            label: '$50K · Standard',
            oneStepStateCount: 4464,
            reachedStateCount: 5022,
            value: 646.988241627557,
        },
        {
            firmId: FirmId.TopStep,
            label: '$50K · Standard path · Consistency XFA',
            oneStepStateCount: 100_192,
            reachedStateCount: 112_716,
            value: 965.436133551983,
        },
    ])(
        '$firmId $label at the coarse tail widens the state count from the one-step allowance $oneStepStateCount to $reachedStateCount (a day-close rounding allowance of one tail step per trade) and keeps the value $value that the one-step allowance gave to 1e-6',
        async ({
            firmId,
            label,
            oneStepStateCount,
            reachedStateCount,
            value,
        }) => {
            const result = await solveCoarseTail(firmId, label);
            expect(result.reachedStateCount).toBe(reachedStateCount);
            expect(result.reachedStateCount).toBeGreaterThan(oneStepStateCount);
            expect(result.initialValue).toBeCloseTo(value, 6);
        },
    );

    it.each([
        {
            firmId: FirmId.Tradeify,
            label: '$50K · Lightning Funded',
            reachedStateCount: 9114,
            value: 569.225401983311,
        },
        {
            firmId: FirmId.Tradeify,
            label: '$50K · Growth',
            reachedStateCount: 62_496,
            value: 450.898732816479,
        },
    ])(
        '$firmId $label at the coarse tail pins the value $value and the state count $reachedStateCount, which the one-step allowance gave unchanged (the state count did not widen on this plan at this grid, so these entries guard the value only and cannot tell the sized cap from the one-step allowance)',
        async ({ firmId, label, reachedStateCount, value }) => {
            const result = await solveCoarseTail(firmId, label);
            expect(result.reachedStateCount).toBe(reachedStateCount);
            expect(result.initialValue).toBeCloseTo(value, 6);
        },
    );
});
