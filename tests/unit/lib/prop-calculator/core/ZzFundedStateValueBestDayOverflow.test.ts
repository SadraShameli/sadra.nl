import { describe, expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import { dollars, FirmId, type Plan } from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/ZzFundedStateValueOrig';

const FAST_GRID_TAIL_OFF = {
    actionStepMultiple: 0.125,
    cushionStepMultiple: 0.25,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    maxTailCushionMultiple: 6,
    meanHorizonDays: 60,
    rrRatio: 2,
    tradesPerDay: 2,
    winrate: 0.5,
} as const;

async function plan50k(firmId: FirmId, label: string): Promise<Plan> {
    await warmFirmsRegistryCache();
    const plan = ALL_FIRMS.find((firm) => firm.id === firmId)?.plans.find(
        (candidate) =>
            candidate.accountSize === 50_000 && candidate.label === label,
    );
    if (!plan) throw new Error(`${firmId} ${label} not in the registry`);
    return plan;
}

describe('the best-day overflow bucket leaves the value of real consistency plans alone where no day passes the cap (WP58e, N-90)', () => {
    it.each([
        {
            firmId: FirmId.Tradeify,
            label: '$50K · Lightning Funded',
            reachedStateCount: 262_080,
            value: 10_107.28437138499,
        },
        {
            firmId: FirmId.AlphaFutures,
            label: '$50K · Zero',
            reachedStateCount: 146_880,
            value: 6915.558313154495,
        },
    ])(
        '$firmId $label at the fast grid with the coarse tail off keeps its pre-overflow value $value to the cent and gains one best-day bucket per level',
        async ({ firmId, label, reachedStateCount, value }) => {
            const result = computeFundedStateValue({
                ...FAST_GRID_TAIL_OFF,
                plan: await plan50k(firmId, label),
            });
            expect(result.unconvergedLevelCount).toBe(0);
            expect(result.reachedStateCount).toBe(reachedStateCount);
            expect(result.initialValue).toBeCloseTo(value, 6);
        },
        600_000,
    );
});
