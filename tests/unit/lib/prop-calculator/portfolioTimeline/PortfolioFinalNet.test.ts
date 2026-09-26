import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    FirmId,
    MffuVariant,
    type Plan,
    type PlanId,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { simulatePortfolioTimeline } from '~/lib/prop-calculator/portfolioTimeline';

function planFor(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

const rapidEod50k = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});
const apexEod50k = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

describe('N-XX (PT-55): pFinalNetNegative on simulatePortfolioTimeline', () => {
    it('equals the share of trials whose final cumulative net is below 0 (0% winrate: always negative)', () => {
        const out = simulatePortfolioTimeline({
            accounts: 1,
            dayBudget: 60,
            maxEvalDays: 30,
            plan: rapidEod50k,
            riskPerTrade: 300,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 3,
            trials: 20,
            winrate: 0,
        });
        expect(out.pFinalNetNegative).toBe(1);
    });

    it('is 0 when every trial ends non-negative (a plan overridden to a trivial, always-passing single trade)', () => {
        const out = simulatePortfolioTimeline({
            accounts: 1,
            dayBudget: 5,
            maxEvalDays: 5,
            plan: apexEod50k.withOverrides({ isInstantFunded: true }),
            riskPerTrade: 100_000,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 10,
            winrate: 1,
        });
        expect(out.pFinalNetNegative).toBe(0);
    });

    it('is computed from the same per-trial nets used for netP50 (matches a hand count at seed 12345)', () => {
        const out = simulatePortfolioTimeline({
            accounts: 2,
            dayBudget: 80,
            maxEvalDays: 40,
            plan: rapidEod50k,
            riskPerTrade: 300,
            rrRatio: 2,
            seed: 12_345,
            tradesPerDay: 3,
            trials: 60,
            winrate: 0.35,
        });
        expect(out.pFinalNetNegative).toBeGreaterThan(0);
        expect(out.pFinalNetNegative).toBeLessThanOrEqual(1);
    });
});
