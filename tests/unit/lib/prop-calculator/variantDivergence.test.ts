import { describe, expect, it } from 'vitest';

import {
    type DayStopRule,
    DayStopRuleKind,
    DrawdownKind,
    FirmId,
    MffuVariant,
    type Plan,
    RungSizing,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

const mffu = new MyFundedFutures();

function mffuPlan(variant: MffuVariant): Plan {
    const plan = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!plan) throw new Error(`MFFU ${variant} 50K plan not found`);
    return plan;
}

function run(plan: Plan, dayStop: DayStopRule) {
    return simulate({
        dayStop,
        fundedHorizonDays: 250,
        maxEvalDays: 150,
        minRetainedCushion: 2000,
        plan,
        riskPerTrade: 300,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: 2,
        trials: 3000,
        winrate: 0.55,
    });
}

describe('MFFU Rapid versus Rapid EOD', () => {
    const rapid = mffuPlan(MffuVariant.Rapid);
    const rapidEod = mffuPlan(MffuVariant.RapidEod);

    it('are structurally distinct plans', () => {
        expect(rapid.drawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(rapid.fundedDrawdown.kind).toBe(DrawdownKind.IntradayTrailing);
        expect(rapidEod.drawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(rapidEod.fundedDrawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(rapid.evalConsistencyRule()?.maxBestDayShare).toBe(0.5);
        expect(rapidEod.evalConsistencyRule()?.maxBestDayShare).toBe(0.3);
        expect(rapid.minTradingDays).toBe(2);
        expect(rapidEod.minTradingDays).toBe(4);
    });

    it('diverge once their distinguishing rules can bind', () => {
        const a = run(rapid, { kind: DayStopRuleKind.None });
        const b = run(rapidEod, { kind: DayStopRuleKind.None });

        expect(b.daysToPassP50).toBeGreaterThan(a.daysToPassP50);
        expect(b.expectedDaysToPass).toBeGreaterThan(a.expectedDaysToPass);
    });

    it('converge under a day-green stop, which makes every difference inert', () => {
        const a = run(rapid, { kind: DayStopRuleKind.DayGreen });
        const b = run(rapidEod, { kind: DayStopRuleKind.DayGreen });

        expect(b.daysToPassP50).toBe(a.daysToPassP50);
        expect(b.expectedGrossPayout).toBeCloseTo(a.expectedGrossPayout, 6);
    });
});
