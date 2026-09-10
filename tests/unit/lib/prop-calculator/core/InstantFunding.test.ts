import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DEFAULT_RUNG_SIZING,
    dollars,
    FirmId,
    flatDayPolicy,
    LucidVariant,
    TradeifyVariant,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { type Rng } from '~/lib/prop-calculator/rng';
import { simulate } from '~/lib/prop-calculator/simulator';
import { runEvalAttempt } from '~/lib/prop-calculator/simulator/evalPhase';
import { TradeTotals } from '~/lib/prop-calculator/simulator/PhaseStats';

function apexEod() {
    const firm = ALL_FIRMS.find((f) => f.id === FirmId.Apex);
    if (!firm) throw new Error('Apex firm not registered');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function lightning() {
    const firm = ALL_FIRMS.find((f) => f.id === FirmId.Tradeify);
    if (!firm) throw new Error('Tradeify firm not registered');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.Lightning,
    });
    if (!plan) throw new Error('Tradeify Lightning plan not found');
    return plan;
}

function lucidDirect() {
    const firm = ALL_FIRMS.find((f) => f.id === FirmId.Lucid);
    if (!firm) throw new Error('Lucid firm not registered');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant: LucidVariant.Direct,
    });
    if (!plan) throw new Error('Lucid Direct plan not found');
    return plan;
}

const throwingRng: Rng = () => {
    throw new Error('rng() should never be called for an instant-funded plan');
};

const losingRng: Rng = () => 0.99;

describe('Plan.isInstantFunded', () => {
    it('is explicitly true for Tradeify Lightning (no real evaluation phase)', () => {
        expect(lightning().isInstantFunded).toBe(true);
    });

    it('is explicitly true for Lucid Direct (no real evaluation phase)', () => {
        expect(lucidDirect().isInstantFunded).toBe(true);
    });

    it('defaults to false for a plan with a genuine evaluation, unset by that firm', () => {
        expect(apexEod().isInstantFunded).toBe(false);
    });

    it('is an authored flag, not derived — withOverrides does not flip it back off', () => {
        const withRealTarget = lightning().withOverrides({
            profitTarget: dollars(3000),
        });
        expect(withRealTarget.isInstantFunded).toBe(true);
    });
});

describe('runEvalAttempt skips the eval loop entirely for an isInstantFunded plan', () => {
    it('returns an instant pass with zero days and never touches rng() for Tradeify Lightning', () => {
        const plan = lightning();
        const totals = new TradeTotals();
        const result = runEvalAttempt({
            commission: dollars(0),
            dayPolicy: flatDayPolicy(250, 4),
            maxEvalDays: 150,
            plan,
            positionSizing: null,
            rng: throwingRng,
            rrRatio: 2,
            rungSizing: DEFAULT_RUNG_SIZING,
            shouldCaptureEquity: false,
            totals,
            winrate: 0.4 as never,
        });

        expect(result.days).toBe(0);
        expect(result.outcome).toBe('passed');
        expect(result.state.balance).toBe(plan.accountSize);
        expect(totals.tradesTaken).toBe(0);
    });

    it('still runs the real day loop (and can bust) for a plan with a genuine evaluation target', () => {
        const plan = apexEod();
        const totals = new TradeTotals();
        const result = runEvalAttempt({
            commission: dollars(0),
            dayPolicy: flatDayPolicy(2000, 4),
            maxEvalDays: 150,
            plan,
            positionSizing: null,
            rng: losingRng,
            rrRatio: 2,
            rungSizing: DEFAULT_RUNG_SIZING,
            shouldCaptureEquity: false,
            totals,
            winrate: 0.4 as never,
        });

        expect(result.days).toBeGreaterThan(0);
        expect(totals.tradesTaken).toBeGreaterThan(0);
    });
});

describe('simulate() end-to-end: an instant-funded plan can never report an eval-phase bust', () => {
    it('Tradeify Lightning always shows 0% eval bust probability and 0 days-to-pass', () => {
        const plan = lightning();
        const out = simulate({
            discounts: undefined,
            fundedHorizonDays: 60,
            maxEvalDays: 150,
            plan,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 500,
            winrate: 0.4,
        });

        expect(out.bustProbability).toBe(0);
        expect(out.timeoutProbability).toBe(0);
        expect(out.daysToPassP50).toBe(0);
    });

    it('Lucid Direct always shows 0% eval bust probability and 0 days-to-pass', () => {
        const plan = lucidDirect();
        const out = simulate({
            discounts: undefined,
            fundedHorizonDays: 60,
            maxEvalDays: 150,
            plan,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 500,
            winrate: 0.4,
        });

        expect(out.bustProbability).toBe(0);
        expect(out.timeoutProbability).toBe(0);
        expect(out.daysToPassP50).toBe(0);
    });

    it('a real evaluation plan (Apex EOD) still reports a nonzero eval bust probability', () => {
        const plan = apexEod();
        const out = simulate({
            discounts: undefined,
            fundedHorizonDays: 60,
            maxEvalDays: 150,
            plan,
            riskPerTrade: 2000,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 500,
            winrate: 0.4,
        });

        expect(out.bustProbability).toBeGreaterThan(0);
    });
});
