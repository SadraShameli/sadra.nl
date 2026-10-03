import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    PolicySizing,
    RungSizing,
    TRADING_DAYS_PER_YEAR,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import {
    DEFAULT_DAY_BUDGET,
    type PortfolioTimelineInputs,
    type PortfolioTimelineResult,
    runAccountTimeline,
    runEvalToFundedCycle,
    simulatePortfolioTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';
import { mulberry32 } from '~/lib/prop-calculator/rng';

const firm = new ApexTraderFunding();

function findPlan(accountSize: 50_000, variant: ApexVariant) {
    const plan = firm.findPlan({ accountSize, firm: FirmId.Apex, variant });
    if (!plan) {
        throw new Error(`Apex plan not found: ${accountSize} ${variant}`);
    }
    return plan;
}

const plan50kEod = findPlan(50_000, ApexVariant.Eod);

function assertWellFormed(out: PortfolioTimelineResult): void {
    expect(Number.isSafeInteger(out.accountsSimulated)).toBe(true);
    expect(out.accountsSimulated).toBeGreaterThanOrEqual(1);
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

        expect(elapsedMs).toBeLessThan(15_000);
        assertWellFormed(out);
        expect(out.days.at(-1)).toBe(252);
    });

    it('TERMINATION GUARANTEE: the shortest valid eval window with a near-zero winrate finishes quickly', () => {
        const start = performance.now();

        const out = simulatePortfolioTimeline({
            accounts: 5,
            dayBudget: 1,
            maxEvalDays: 1,
            plan: plan50kEod,
            riskPerTrade: 200,
            rrRatio: 1.5,
            seed: 7,
            tradesPerDay: 3,
            trials: 50,
            winrate: 0.01,
        });

        const elapsedMs = performance.now() - start;

        expect(elapsedMs).toBeLessThan(15_000);
        assertWellFormed(out);
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
        expect(out.pEverCashflowPositive).toBeCloseTo(
            out.breakEvenMonthValues.length / 30,
            6,
        );
    });
});

describe('N-13: the portfolio timeline fails loud on a trial count, day budget, account count or eval window that is not a positive safe integer', () => {
    const invalidCounts = [0, -5, 1.5, NaN, Infinity];

    it.each(invalidCounts)(
        'simulatePortfolioTimeline rejects trials %s instead of clamping it',
        (trials) => {
            expect(() =>
                simulatePortfolioTimeline(baseInputs({ trials })),
            ).toThrow(/trials must be a positive safe integer/);
        },
    );

    it.each(invalidCounts)(
        'simulatePortfolioTimeline rejects dayBudget %s instead of clamping it',
        (dayBudget) => {
            expect(() =>
                simulatePortfolioTimeline(baseInputs({ dayBudget })),
            ).toThrow(/dayBudget must be a positive safe integer/);
        },
    );

    it.each(invalidCounts)(
        'runAccountTimeline rejects dayBudget %s instead of clamping it',
        (dayBudget) => {
            expect(() =>
                runAccountTimeline({
                    dayBudget,
                    maxEvalDays: 60,
                    plan: plan50kEod,
                    riskPerTrade: 300,
                    rng: mulberry32(1),
                    rrRatio: 2,
                    tradesPerDay: 3,
                    winrate: 0.5,
                }),
            ).toThrow(/dayBudget must be a positive safe integer/);
        },
    );

    it.each(invalidCounts)(
        'simulatePortfolioTimeline rejects accounts %s instead of clamping it',
        (accounts) => {
            expect(() =>
                simulatePortfolioTimeline(baseInputs({ accounts })),
            ).toThrow(/accounts must be a positive safe integer/);
        },
    );

    it.each(invalidCounts)(
        'simulatePortfolioTimeline rejects maxEvalDays %s instead of clamping it',
        (maxEvalDays) => {
            expect(() =>
                simulatePortfolioTimeline(baseInputs({ maxEvalDays })),
            ).toThrow(/maxEvalDays must be a positive safe integer/);
        },
    );

    it.each(invalidCounts)(
        'runAccountTimeline rejects maxEvalDays %s instead of clamping it',
        (maxEvalDays) => {
            expect(() =>
                runAccountTimeline({
                    dayBudget: 20,
                    maxEvalDays,
                    plan: plan50kEod,
                    riskPerTrade: 300,
                    rng: mulberry32(1),
                    rrRatio: 2,
                    tradesPerDay: 3,
                    winrate: 0.5,
                }),
            ).toThrow(/maxEvalDays must be a positive safe integer/);
        },
    );

    it.each(invalidCounts)(
        'runEvalToFundedCycle rejects maxEvalDays %s instead of clamping it',
        (maxEvalDays) => {
            const policy = flatDayPolicy(
                300,
                3,
                {
                    kind: DayStopRuleKind.None,
                },
                PolicySizing.ContractCapped,
            );
            expect(() =>
                runEvalToFundedCycle({
                    cardDayBudget: 0,
                    commission: dollars(0),
                    discounts: undefined,
                    evalDayPolicy: policy,
                    fundedDayPolicy: policy,
                    maxEvalDays,
                    maxFundedDays: 0,
                    minRetainedCushion: dollars(0),
                    payoutRequestSize: undefined,
                    plan: plan50kEod,
                    positionSizing: null,
                    rng: mulberry32(1),
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    winrate: fraction(0.5),
                }),
            ).toThrow(/maxEvalDays must be a positive safe integer/);
        },
    );

    it('keeps the firm cap on accounts: asking for more than maxFundedAccounts simulates the cap', () => {
        const out = simulatePortfolioTimeline(
            baseInputs({
                accounts: plan50kEod.maxFundedAccounts + 1,
                dayBudget: 5,
                trials: 1,
            }),
        );
        expect(out.accountsSimulated).toBe(plan50kEod.maxFundedAccounts);
    });

    it('still runs one trial over a one-day budget', () => {
        const out = simulatePortfolioTimeline(
            baseInputs({ dayBudget: 1, trials: 1 }),
        );
        assertWellFormed(out);
        expect(out.days.at(-1)).toBe(1);
    });

    it('defaults the day budget to one trading year', () => {
        expect(DEFAULT_DAY_BUDGET).toBe(TRADING_DAYS_PER_YEAR);
    });
});
