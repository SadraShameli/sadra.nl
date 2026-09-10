import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    FirmId,
    MffuVariant,
    type Plan,
    type PlanId,
    RungSizing,
    TopStepVariant,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { simulate } from '~/lib/prop-calculator/simulator';

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error('plan not found');
    return plan;
}

const topStep = planFor({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});

const apexEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

const rapidEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});

describe('per-payout method fee', () => {
    it('charges the wire fee that is the only method open to a Netherlands trader', () => {
        expect(topStep.payoutMethodFee).toBe(30);
    });

    it('deducts the fee after the profit split, not before', () => {
        expect(topStep.payoutFromProfit(1000)).toBeCloseTo(1000 * 0.9 - 30, 6);
    });

    it('never returns a negative payout when the fee exceeds the split', () => {
        expect(topStep.payoutFromProfit(10)).toBe(0);
    });

    it('leaves firms with no published fee untouched', () => {
        for (const plan of [apexEod, rapidEod]) {
            expect(plan.payoutMethodFee).toBe(0);
        }
        expect(rapidEod.payoutFromProfit(1000)).toBeCloseTo(900, 6);
    });
});

describe('evaluation access period', () => {
    it('caps Apex evaluations at one trading month', () => {
        expect(apexEod.maxEvalTradingDays).toBe(TRADING_DAYS_PER_MONTH);
        expect(apexEod.evalDayCap(200)).toBe(TRADING_DAYS_PER_MONTH);
        expect(apexEod.evalDayCap(10)).toBe(10);
    });

    it('leaves plans with no published access period uncapped', () => {
        expect(rapidEod.maxEvalTradingDays).toBeNull();
        expect(rapidEod.evalDayCap(200)).toBe(200);
    });

    it('times out an Apex evaluation that cannot reach target inside the window', () => {
        const out = simulate({
            fundedHorizonDays: 10,
            maxEvalDays: 200,
            plan: apexEod,
            riskPerTrade: 20,
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            seed: 7,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.timeoutProbability).toBe(1);
        expect(out.passProbability).toBe(0);
    });

    it('passes the same evaluation when the daily gain fits the window', () => {
        const out = simulate({
            fundedHorizonDays: 10,
            maxEvalDays: 200,
            plan: apexEod,
            riskPerTrade: 150,
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            seed: 7,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.passProbability).toBe(1);
        expect(out.daysToPassP50).toBeLessThanOrEqual(TRADING_DAYS_PER_MONTH);
    });
});
