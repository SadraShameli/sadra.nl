import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    FirmId,
    type Plan,
    type PlanId,
    RungSizing,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { simulate } from '~/lib/prop-calculator/simulator';

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error(`plan not found for ${id.firm}`);
    return plan;
}

const apexEod: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

describe('expectedPayoutPerFundedAccount vs expectedGrossPayout', () => {
    it('equals expectedGrossPayout divided by the reached-funded fraction, not by every trial', () => {
        const plan = planFor(apexEod);
        const out = simulate({
            fundedHorizonDays: 252,
            maxEvalDays: 150,
            minRetainedCushion: 2000,
            plan,
            riskPerTrade: 400,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            seed: 42,
            tradesPerDay: 2,
            trials: 200,
            winrate: 0.5,
        });

        const reachedFundedFraction =
            out.passProbability + out.fundedBustProbability;
        expect(reachedFundedFraction).toBeGreaterThan(0);
        expect(out.expectedPayoutPerFundedAccount).toBeCloseTo(
            out.expectedGrossPayout / reachedFundedFraction,
            6,
        );
        expect(out.expectedPayoutPerFundedAccount).toBeGreaterThan(
            out.expectedGrossPayout,
        );
    });

    it('is 0, not NaN, when no trial ever reaches the funded phase', () => {
        const plan = planFor(apexEod);
        const out = simulate({
            fundedHorizonDays: 60,
            maxEvalDays: 5,
            plan,
            riskPerTrade: 400,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 10,
            winrate: 0,
        });

        expect(out.passProbability).toBe(0);
        expect(out.fundedBustProbability).toBe(0);
        expect(out.expectedGrossPayout).toBe(0);
        expect(out.expectedPayoutPerFundedAccount).toBe(0);
    });
});
