import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import {
    type PortfolioTimelineInputs,
    type PortfolioTimelineResult,
    simulatePortfolioTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';

const firm = new ApexTraderFunding();

function findPlan(
    accountSize: 25_000 | 50_000 | 100_000 | 150_000,
    variant: 'eod' | 'intraday',
) {
    const plan = firm.findPlan({ accountSize, firm: FirmId.Apex, variant });
    if (!plan) {
        throw new Error(`Apex plan not found: ${accountSize} ${variant}`);
    }
    return plan;
}

const plan50kEod = findPlan(50_000, 'eod');

function assertWellFormed(out: PortfolioTimelineResult): void {
    expect(out.days.length).toBeGreaterThan(0);
    expect(out.netP10.length).toBe(out.days.length);
    expect(out.netP50.length).toBe(out.days.length);
    expect(out.netP90.length).toBe(out.days.length);
    expect(out.spendP50.length).toBe(out.days.length);
    expect(out.payoutP50.length).toBe(out.days.length);
    expect(out.pEverCashflowPositive).toBeGreaterThanOrEqual(0);
    expect(out.pEverCashflowPositive).toBeLessThanOrEqual(1);

    const numbers: number[] = [];
    collectNumbers(out, numbers);
    for (const n of numbers) {
        expect(Number.isFinite(n)).toBe(true);
    }
}

function baseInputs(
    overrides: Partial<PortfolioTimelineInputs> = {},
): PortfolioTimelineInputs {
    return {
        accounts: 3,
        maxEvalDays: 60,
        plan: plan50kEod,
        riskPerTrade: 300,
        rrRatio: 2,
        seed: 12_345,
        tradesPerDay: 3,
        trials: 40,
        winrate: 0.5,
        ...overrides,
    };
}

function collectNumbers(value: unknown, out: number[]): void {
    if (typeof value === 'number') {
        out.push(value);
    } else if (Array.isArray(value)) {
        for (const v of value) collectNumbers(v, out);
    } else if (value instanceof Float64Array) {
        for (const v of value) out.push(v);
    } else if (value && typeof value === 'object') {
        for (const v of Object.values(value)) collectNumbers(v, out);
    }
}

describe('simulatePortfolioTimeline', () => {
    it('is deterministic for the same seed', () => {
        const a = simulatePortfolioTimeline(baseInputs({ seed: 42 }));
        const b = simulatePortfolioTimeline(baseInputs({ seed: 42 }));

        expect(a.days).toEqual(b.days);
        expect(a.netP10).toEqual(b.netP10);
        expect(a.netP50).toEqual(b.netP50);
        expect(a.netP90).toEqual(b.netP90);
        expect(a.spendP50).toEqual(b.spendP50);
        expect(a.payoutP50).toEqual(b.payoutP50);
        expect(a.pEverCashflowPositive).toBe(b.pEverCashflowPositive);
        expect(a.breakEvenMonthValues).toEqual(b.breakEvenMonthValues);
    });

    it('produces a different result for a different seed (sanity check on determinism test)', () => {
        const a = simulatePortfolioTimeline(baseInputs({ seed: 1 }));
        const b = simulatePortfolioTimeline(baseInputs({ seed: 2 }));

        // Not a guarantee for every possible field, but at 50% winrate over
        // many trials the median net path should differ at least somewhere.
        expect(a.netP50).not.toEqual(b.netP50);
    });

    it('never produces NaN or Infinity for a mixed-outcome scenario (50% winrate)', () => {
        const out = simulatePortfolioTimeline(baseInputs());
        assertWellFormed(out);
    });

    it('never produces NaN or Infinity for a near-certain-pass scenario (exercises the full payout-ladder cycle)', () => {
        const out = simulatePortfolioTimeline(
            baseInputs({
                accounts: 2,
                riskPerTrade: 600,
                rrRatio: 3,
                tradesPerDay: 2,
                trials: 20,
                winrate: 0.95,
            }),
        );
        assertWellFormed(out);
        // With a very high winrate this portfolio should end up net-positive
        // at least sometimes within a year's day-budget.
        expect(out.pEverCashflowPositive).toBeGreaterThan(0);
    });

    it('never produces NaN or Infinity for a near-certain-bust scenario', () => {
        const out = simulatePortfolioTimeline(
            baseInputs({
                riskPerTrade: 2500,
                rrRatio: 1,
                trials: 20,
                winrate: 0.02,
            }),
        );
        assertWellFormed(out);
    });

    it('TERMINATION GUARANTEE: a very low win rate with a minimal 1-day eval window still completes quickly and returns a well-formed result', () => {
        const start = performance.now();

        const out = simulatePortfolioTimeline({
            accounts: 10,
            maxEvalDays: 1,
            plan: plan50kEod,
            riskPerTrade: 200,
            rrRatio: 1.5,
            seed: 999,
            tradesPerDay: 5,
            trials: 200,
            winrate: 0.01,
        });

        const elapsedMs = performance.now() - start;

        // Vitest's default per-test timeout is 5000ms; leave generous
        // headroom so this fails loudly (not by silently timing out) if the
        // hang-prevention bounds are ever regressed.
        expect(elapsedMs).toBeLessThan(4000);
        assertWellFormed(out);
        expect(out.days.at(-1)).toBe(252);
    });

    it('TERMINATION GUARANTEE: a misconfigured 0-day eval window and 0-day budget are clamped, not left to spin forever', () => {
        const start = performance.now();

        const out = simulatePortfolioTimeline({
            accounts: 5,
            dayBudget: 0,
            maxEvalDays: 0,
            plan: plan50kEod,
            riskPerTrade: 200,
            rrRatio: 1.5,
            seed: 7,
            tradesPerDay: 3,
            trials: 50,
            winrate: 0.01,
        });

        const elapsedMs = performance.now() - start;

        expect(elapsedMs).toBeLessThan(4000);
        assertWellFormed(out);
        // Both `dayBudget: 0` and `maxEvalDays: 0` are defensively clamped up
        // to a minimum of 1, so the timeline still spans at least 1 day.
        expect(out.days.at(-1)).toBe(1);
    });

    it('breakEvenMonthValues only contains entries for trials that actually went cash-flow positive', () => {
        const out = simulatePortfolioTimeline(
            baseInputs({ trials: 30, winrate: 0.95 }),
        );
        expect(out.breakEvenMonthValues.length).toBeLessThanOrEqual(30);
        for (const month of out.breakEvenMonthValues) {
            expect(month).toBeGreaterThan(0);
        }
        // pEverCashflowPositive should agree with the fraction of trials
        // that produced a breakEvenMonthValues entry.
        expect(out.pEverCashflowPositive).toBeCloseTo(
            out.breakEvenMonthValues.length / 30,
            6,
        );
    });
});
