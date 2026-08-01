import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import {
    newPathStats,
    runDay,
    runEvalAttempt,
    simulate,
} from '~/lib/prop-calculator/simulator';

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

describe('Apex payout ladder', () => {
    const plan50kEod = findPlan(50_000, 'eod');

    it('caps total payout at the lifetime cap and closes the account after payout 6', () => {
        // 50K EOD ladder steps (A1 table): 1500+1500+2000+2500+2500+3000.
        const LIFETIME_CAP = 13_000;

        const base = {
            maxEvalDays: 20,
            plan: plan50kEod,
            riskPerTrade: 300,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        } as const;

        // 600/day: eval target ($3,000) hit on day 5; each of the 6 funded
        // payout cycles needs exactly 5 qualifying days at this profit rate,
        // so the ladder is fully exhausted by day 30 of the funded horizon.
        const justEnough = simulate({ ...base, fundedHorizonDays: 40 });
        const wayMore = simulate({ ...base, fundedHorizonDays: 400 });

        expect(justEnough.passProbability).toBe(1);
        expect(justEnough.fundedBustProbability).toBe(0);
        expect(justEnough.expectedGrossPayout).toBeCloseTo(LIFETIME_CAP, 6);

        // A far longer funded horizon must not pay out more — the account
        // closes (stops trading) once the 6-payout ladder is exhausted.
        expect(wayMore.expectedGrossPayout).toBeCloseTo(LIFETIME_CAP, 6);
        expect(wayMore.finalBalanceP50).toBeCloseTo(
            justEnough.finalBalanceP50,
            6,
        );
    });
});

describe('Apex qualifying-day threshold', () => {
    const plan25kEod = findPlan(25_000, 'eod');

    it('does not advance qualifyingDays on a day below the minimum daily profit', () => {
        const state = plan25kEod.initialState();
        const stats = newPathStats(state.startingBalance);
        const rng = mulberry32(1);

        // Day 1: a guaranteed $50 winning day — profit, but below the 25K
        // plan's $100 qualifying-day bar.
        runDay(
            plan25kEod,
            state,
            stats,
            1,
            1,
            50,
            1,
            0,
            rng,
            undefined,
            'eval',
        );
        expect(state.tradingDays).toBe(1);
        expect(state.qualifyingDays).toBe(0);

        // Day 2: a guaranteed $150 winning day — clears the $100 bar.
        runDay(
            plan25kEod,
            state,
            stats,
            1,
            1,
            150,
            1,
            0,
            rng,
            undefined,
            'eval',
        );
        expect(state.tradingDays).toBe(2);
        expect(state.qualifyingDays).toBe(1);
    });

    it('never grants a payout when daily profit never clears the qualifying bar', () => {
        const out = simulate({
            fundedHorizonDays: 100,
            maxEvalDays: 200,
            plan: plan25kEod,
            riskPerTrade: 10,
            rrRatio: 1,
            seed: 7,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        // 150 days at $10/day clears the $1,500 eval profit target...
        expect(out.passProbability).toBe(1);
        // ...but every day's $10 profit is below the $100 qualifying bar, so
        // qualifyingDays never advances toward the 5-day requirement and no
        // payout is ever issued, no matter how long the funded horizon runs.
        expect(out.expectedGrossPayout).toBe(0);
        expect(out.fundedBustProbability).toBe(0);
    });
});

describe('Apex Intraday daily-loss-limit: bust behavior differs by phase', () => {
    const plan50kIntraday = findPlan(50_000, 'intraday');

    it('does not bust in eval but does bust once funded, for an identical loss (direct isBust check)', () => {
        const lossState = plan50kIntraday.initialState();
        lossState.balance -= 1500;
        lossState.todayPnL = -1500;

        // Eval: Intraday evals have no DLL at all (`{ kind: 'none' }`), and
        // this loss doesn't breach the $2,000 trailing drawdown either.
        expect(plan50kIntraday.isBust(lossState, 'eval')).toBe(false);

        // Funded: the same state, same loss — but funded Intraday DOES have
        // a DLL (tiered, identical to EOD). The 50K plan's first tier is
        // $1,000, so a $1,500 loss busts it.
        expect(plan50kIntraday.isBust(lossState, 'funded')).toBe(true);
    });

    it('does not bust in eval but does bust once funded, for an identical loss (via runDay)', () => {
        const evalState = plan50kIntraday.initialState();
        const evalStats = newPathStats(evalState.startingBalance);
        const evalResult = runDay(
            plan50kIntraday,
            evalState,
            evalStats,
            0,
            1,
            1500,
            1,
            0,
            mulberry32(2),
            undefined,
            'eval',
        );
        expect(evalResult.busted).toBe(false);

        const fundedState = plan50kIntraday.initialState();
        // Mirrors what the funded-phase orchestration does the moment
        // funding begins: the current balance becomes the funded baseline.
        fundedState.fundingBaseline = fundedState.balance;
        const fundedStats = newPathStats(fundedState.startingBalance);
        const fundedResult = runDay(
            plan50kIntraday,
            fundedState,
            fundedStats,
            0,
            1,
            1500,
            1,
            0,
            mulberry32(3),
            undefined,
            'funded',
        );
        expect(fundedResult.busted).toBe(true);
    });
});

describe('Apex EOD daily-loss-limit: flat pre-pass, tiered post-pass', () => {
    const plan100kEod = findPlan(100_000, 'eod');

    it('has a flat eval DLL and a tiered funded DLL with a higher floor', () => {
        expect(plan100kEod.evalDailyLossLimit).toEqual({
            amount: 1500,
            kind: 'flat',
        });
        expect(plan100kEod.fundedDailyLossLimit.kind).toBe('tiered');
        if (plan100kEod.fundedDailyLossLimit.kind === 'tiered') {
            expect(
                plan100kEod.fundedDailyLossLimit.tiers[0]?.dailyLossLimit,
            ).toBe(1750);
        }
    });

    it('busts pre-pass but not post-pass at an identical $1,600 loss (only the lower/eval cap is breached)', () => {
        const LOSS = 1600; // between the flat $1,500 eval cap and the $1,750 funded floor

        // Pre-pass: a fresh eval account takes the loss straight away.
        const preState = plan100kEod.initialState();
        const preStats = newPathStats(preState.startingBalance);
        const preResult = runDay(
            plan100kEod,
            preState,
            preStats,
            0,
            1,
            LOSS,
            1,
            0,
            mulberry32(4),
            undefined,
            'eval',
        );
        expect(preResult.busted).toBe(true);

        // Post-pass: run a real eval to a genuine pass (guaranteed wins),
        // then apply the identical loss in the funded phase.
        const attempt = runEvalAttempt(
            plan100kEod,
            1,
            2,
            500,
            1,
            30,
            0,
            mulberry32(5),
            false,
            undefined,
        );
        expect(attempt.outcome).toBe('passed');
        attempt.state.fundingBaseline = attempt.state.balance;

        const postResult = runDay(
            plan100kEod,
            attempt.state,
            attempt.stats,
            0,
            1,
            LOSS,
            1,
            0,
            mulberry32(6),
            undefined,
            'funded',
        );
        expect(postResult.busted).toBe(false);
    });
});

describe('Apex eval reset fee', () => {
    it('charges the full eval price (not a discounted flat fee) for every plan and variant', () => {
        for (const plan of firm.plans) {
            expect(plan.fees.reset).toBe(plan.fees.oneTimeEval);
        }
    });

    it('charges the variant-specific eval price on reset, not the other variant’s price', () => {
        const plan25kEod = findPlan(25_000, 'eod');
        const plan25kIntraday = findPlan(25_000, 'intraday');
        expect(plan25kEod.fees.reset).toBe(390);
        expect(plan25kIntraday.fees.reset).toBe(199);
        expect(plan25kIntraday.fees.reset).not.toBe(plan25kEod.fees.reset);
    });

    it('accrues one full eval-price reset fee per failed attempt in a multi-attempt trial', () => {
        const plan25kIntraday = findPlan(25_000, 'intraday');
        // A loss bigger than the $1,000 max drawdown busts the eval on the
        // very first trade, every attempt — deterministic with winrate 0.
        const out = simulate({
            fundedHorizonDays: 10,
            maxAttempts: 3,
            maxEvalDays: 5,
            plan: plan25kIntraday,
            riskPerTrade: 1100,
            rrRatio: 1,
            seed: 9,
            tradesPerDay: 1,
            trials: 1,
            winrate: 0,
        });

        expect(out.bustProbability).toBe(1);
        // 3 attempts total, all busted: the first 2 busts each cost one
        // full reset (a fresh eval at full price, per Apex's "no reset fees,
        // buy a new evaluation" rule); the 3rd (final, exhausted) bust pays
        // no reset since there's no further attempt to fund.
        expect(out.costBreakdown.resetFeesTotal).toBe(
            2 * plan25kIntraday.fees.reset,
        );
        expect(out.costBreakdown.resetFeesTotal).toBe(2 * 199);
    });
});
