import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    FirmId,
    MffuVariant,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';

const mffu = new MyFundedFutures();
const tpt = new TakeProfitTrader();

function alwaysWinInputs(overrides: Partial<SimInputs>): SimInputs {
    return {
        dayStop: { kind: DayStopRuleKind.None },
        fundedHorizonDays: 60,
        maxEvalDays: 150,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 1,
        trials: 1,
        winrate: 1,
        ...overrides,
    } as SimInputs;
}

function findPlan(firm: MyFundedFutures, variant: MffuVariant) {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!plan) throw new Error(`${variant} missing`);
    return plan;
}

describe('MFF Rapid (no ladder, intraday-trailing drawdown): payout keeps growing, never spuriously busts', () => {
    const plan = findPlan(mffu, MffuVariant.Rapid);

    it('never busts an always-winning trader', () => {
        const out = simulate(alwaysWinInputs({ fundedHorizonDays: 252, plan }));
        expect(out.passProbability).toBe(1);
        expect(out.fundedBustProbability).toBe(0);
    });

    it('payout keeps growing with a longer horizon', () => {
        const short = simulate(
            alwaysWinInputs({ fundedHorizonDays: 30, plan }),
        );
        const long = simulate(
            alwaysWinInputs({ fundedHorizonDays: 252, plan }),
        );
        expect(long.expectedGrossPayout).toBeGreaterThan(0);
        expect(long.expectedGrossPayout).toBeGreaterThan(
            short.expectedGrossPayout,
        );
    });

    it('the intraday ratchet across multiple trades in one day never spuriously busts', () => {
        const out = simulate(
            alwaysWinInputs({ fundedHorizonDays: 120, plan, tradesPerDay: 3 }),
        );
        expect(out.passProbability).toBe(1);
        expect(out.fundedBustProbability).toBe(0);
        expect(out.expectedGrossPayout).toBeGreaterThan(0);
    });
});

describe('MFF Flex (ladder + 50% profit-share cap): plateaus once the ladder is exhausted, never busts', () => {
    const plan = findPlan(mffu, MffuVariant.Flex);

    it('never busts an always-winning trader, even after the ladder runs out', () => {
        const out = simulate(alwaysWinInputs({ fundedHorizonDays: 252, plan }));
        expect(out.passProbability).toBe(1);
        expect(out.fundedBustProbability).toBe(0);
    });

    it('payout plateaus once the 5-step ladder is exhausted, rather than freezing or busting', () => {
        const mid = simulate(alwaysWinInputs({ fundedHorizonDays: 120, plan }));
        const long = simulate(
            alwaysWinInputs({ fundedHorizonDays: 252, plan }),
        );
        expect(mid.passProbability).toBe(1);
        expect(long.passProbability).toBe(1);
        expect(mid.expectedGrossPayout).toBeGreaterThan(0);
        expect(long.expectedGrossPayout).toBe(mid.expectedGrossPayout);
    });
});

describe('MFF Builder (pure ladder): plateaus once the ladder is exhausted, never busts', () => {
    const plan = findPlan(mffu, MffuVariant.Builder);

    it('never busts an always-winning trader, even after the ladder runs out', () => {
        const out = simulate(alwaysWinInputs({ fundedHorizonDays: 252, plan }));
        expect(out.passProbability).toBe(1);
        expect(out.fundedBustProbability).toBe(0);
    });

    it('payout plateaus once the 5-step ladder is exhausted, rather than freezing or busting', () => {
        const mid = simulate(alwaysWinInputs({ fundedHorizonDays: 120, plan }));
        const long = simulate(
            alwaysWinInputs({ fundedHorizonDays: 252, plan }),
        );
        expect(mid.passProbability).toBe(1);
        expect(long.passProbability).toBe(1);
        expect(mid.expectedGrossPayout).toBeGreaterThan(0);
        expect(long.expectedGrossPayout).toBe(mid.expectedGrossPayout);
    });
});

describe('TPT (no ladder, uncapped payouts): payout keeps growing, never spuriously busts', () => {
    it('never busts an always-winning trader', () => {
        const plan = tpt.plans[0];
        if (!plan) throw new Error('TPT must expose a plan');
        const out = simulate(alwaysWinInputs({ fundedHorizonDays: 252, plan }));
        expect(out.passProbability).toBe(1);
        expect(out.fundedBustProbability).toBe(0);
    });

    it('payout keeps growing with a longer horizon', () => {
        const plan = tpt.plans[0];
        if (!plan) throw new Error('TPT must expose a plan');
        const short = simulate(
            alwaysWinInputs({ fundedHorizonDays: 30, plan }),
        );
        const long = simulate(
            alwaysWinInputs({ fundedHorizonDays: 252, plan }),
        );
        expect(long.expectedGrossPayout).toBeGreaterThan(0);
        expect(long.expectedGrossPayout).toBeGreaterThan(
            short.expectedGrossPayout,
        );
    });
});
