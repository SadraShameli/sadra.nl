import { describe, expect, it } from 'vitest';

import {
    FirmId,
    flatDayPolicy,
    resolveDailyLossLimit,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import {
    newPathStats,
    runDay,
    simulate,
} from '~/lib/prop-calculator/simulator';

const firm = new ApexTraderFunding();

function findPlan(accountSize: 50_000, variant: 'eod' | 'intraday') {
    const plan = firm.findPlan({ accountSize, firm: FirmId.Apex, variant });
    if (!plan) {
        throw new Error(`Apex plan not found: ${accountSize} ${variant}`);
    }
    return plan;
}

describe('Apex payout ladder', () => {
    const plan50kEod = findPlan(50_000, 'eod');

    it('caps total payout at the lifetime cap and closes the account after payout 6', () => {
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

        const justEnough = simulate({ ...base, fundedHorizonDays: 40 });
        const wayMore = simulate({ ...base, fundedHorizonDays: 400 });

        expect(justEnough.passProbability).toBe(1);
        expect(justEnough.fundedBustProbability).toBe(0);
        expect(justEnough.expectedGrossPayout).toBeCloseTo(LIFETIME_CAP, 6);

        expect(wayMore.expectedGrossPayout).toBeCloseTo(LIFETIME_CAP, 6);
        expect(wayMore.finalBalanceP50).toBeCloseTo(
            justEnough.finalBalanceP50,
            6,
        );
    });
});

describe('Apex qualifying-day threshold', () => {
    const plan50kEodQualifying = findPlan(50_000, 'eod');

    it('does not advance qualifyingDays on a day below the minimum daily profit', () => {
        const state = plan50kEodQualifying.initialState();
        const stats = newPathStats(state.startingBalance);
        const rng = mulberry32(1);

        runDay({
            commission: 0,
            dayPolicy: flatDayPolicy(200, 1, { kind: 'none' }),
            phase: 'eval',
            plan: plan50kEodQualifying,
            rng: rng,
            rrRatio: 1,
            rungSizing: 'capToCushion',
            state: state,
            stats: stats,
            winrate: 1,
        });
        expect(state.tradingDays).toBe(1);
        expect(state.qualifyingDays).toBe(0);

        runDay({
            commission: 0,
            dayPolicy: flatDayPolicy(300, 1, { kind: 'none' }),
            phase: 'eval',
            plan: plan50kEodQualifying,
            rng: rng,
            rrRatio: 1,
            rungSizing: 'capToCushion',
            state: state,
            stats: stats,
            winrate: 1,
        });
        expect(state.tradingDays).toBe(2);
        expect(state.qualifyingDays).toBe(1);
    });

    it('never grants a payout when daily profit never clears the qualifying bar', () => {
        const out = simulate({
            fundedHorizonDays: 100,
            maxEvalDays: 200,
            plan: plan50kEodQualifying,
            riskPerTrade: 20,
            rrRatio: 1,
            seed: 7,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.passProbability).toBe(1);
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

        expect(plan50kIntraday.isBust(lossState, 'eval')).toBe(false);
        expect(plan50kIntraday.isBust(lossState, 'funded')).toBe(true);
    });

    it('does not bust in eval but does bust once funded, for an identical loss (via runDay)', () => {
        const evalState = plan50kIntraday.initialState();
        const evalStats = newPathStats(evalState.startingBalance);
        const evalResult = runDay({
            commission: 0,
            dayPolicy: flatDayPolicy(1500, 1, { kind: 'none' }),
            phase: 'eval',
            plan: plan50kIntraday,
            rng: mulberry32(2),
            rrRatio: 1,
            rungSizing: 'capToCushion',
            state: evalState,
            stats: evalStats,
            winrate: 0,
        });
        expect(evalResult.busted).toBe(false);

        const fundedState = plan50kIntraday.initialState();
        fundedState.fundingBaseline = fundedState.balance;
        const fundedStats = newPathStats(fundedState.startingBalance);
        const fundedResult = runDay({
            commission: 0,
            dayPolicy: flatDayPolicy(1500, 1, { kind: 'none' }),
            phase: 'funded',
            plan: plan50kIntraday,
            rng: mulberry32(3),
            rrRatio: 1,
            rungSizing: 'capToCushion',
            state: fundedState,
            stats: fundedStats,
            winrate: 0,
        });
        expect(fundedResult.busted).toBe(true);
    });
});

describe('Apex EOD daily-loss-limit: flat in eval, tiered once funded', () => {
    const plan = findPlan(50_000, 'eod');

    it('has a flat eval DLL and a tiered funded DLL', () => {
        expect(plan.evalDailyLossLimit).toEqual({
            amount: 1000,
            kind: 'flat',
        });
        expect(plan.fundedDailyLossLimit.kind).toBe('tiered');
        if (plan.fundedDailyLossLimit.kind === 'tiered') {
            expect(plan.fundedDailyLossLimit.tiers[0]?.dailyLossLimit).toBe(
                1000,
            );
        }
    });

    it('escalates the funded DLL with cycle profit while the eval DLL stays flat', () => {
        for (const profit of [0, 1500, 3000, 6000, 20_000]) {
            expect(resolveDailyLossLimit(plan.evalDailyLossLimit, profit)).toBe(
                1000,
            );
        }
        expect(resolveDailyLossLimit(plan.fundedDailyLossLimit, 0)).toBe(1000);
        expect(resolveDailyLossLimit(plan.fundedDailyLossLimit, 1500)).toBe(
            1000,
        );
        expect(resolveDailyLossLimit(plan.fundedDailyLossLimit, 3000)).toBe(
            2000,
        );
        expect(resolveDailyLossLimit(plan.fundedDailyLossLimit, 6000)).toBe(
            3000,
        );
    });

    it('busts on a $1,500 day at funding start but tolerates it once the tier has escalated', () => {
        const atStart = plan.initialState();
        atStart.fundingBaseline = atStart.balance;
        atStart.todayPnL = -1500;
        expect(plan.isBust(atStart, 'funded')).toBe(true);

        const escalated = plan.initialState();
        escalated.fundingBaseline = escalated.balance;
        escalated.balance = escalated.fundingBaseline + 3000;
        escalated.todayPnL = -1500;
        expect(plan.isBust(escalated, 'funded')).toBe(false);
    });
});

describe('Apex eval reset fee', () => {
    it('charges the full eval price (not a discounted flat fee) for every plan and variant', () => {
        for (const plan of firm.plans) {
            expect(plan.fees.reset).toBe(plan.fees.oneTimeEval);
        }
    });

    it('charges the variant-specific eval price on reset, not the other variant’s price', () => {
        const eod = findPlan(50_000, 'eod');
        const intraday = findPlan(50_000, 'intraday');
        expect(eod.fees.reset).toBe(490);
        expect(intraday.fees.reset).toBe(249);
        expect(intraday.fees.reset).not.toBe(eod.fees.reset);
    });

    it('accrues one full eval-price reset fee per failed attempt in a multi-attempt trial', () => {
        const intraday = findPlan(50_000, 'intraday');
        const out = simulate({
            fundedHorizonDays: 10,
            maxAttempts: 3,
            maxEvalDays: 5,
            plan: intraday,
            riskPerTrade: 2100,
            rrRatio: 1,
            seed: 9,
            tradesPerDay: 1,
            trials: 1,
            winrate: 0,
        });

        expect(out.bustProbability).toBe(1);
        expect(out.costBreakdown.resetFeesTotal).toBe(2 * intraday.fees.reset);
        expect(out.costBreakdown.resetFeesTotal).toBe(2 * 249);
    });
});
