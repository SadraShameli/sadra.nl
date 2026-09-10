import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    StaticDrawdown,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { runAccountTimeline } from '~/lib/prop-calculator/portfolioTimeline';
import { type Rng } from '~/lib/prop-calculator/rng';

const alwaysWinRng: Rng = () => 0;

function at(array: Float64Array, index: number): number {
    const value = array[index];
    if (value === undefined) throw new Error(`index ${index} out of range`);
    return value;
}

function testPlan() {
    const firm = new ApexTraderFunding();
    const base = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!base) throw new Error('Apex EOD plan not found');
    return base.withOverrides({
        drawdown: new StaticDrawdown({ amount: dollars(1000) }),
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(100),
            oneTimeEval: dollars(0),
            reset: dollars(0),
        },
        maxEvalTradingDays: 30,
        minTradingDays: 0,
        profitTarget: dollars(1000),
    });
}

describe('runAccountTimeline: card cost is attributed across the days it is actually incurred, not front-loaded on day 1', () => {
    it("spreads a card's totalCost proportionally across its eval days instead of booking it all on the card's first day", () => {
        const plan = testPlan();

        const result = runAccountTimeline({
            dayBudget: 10,
            dayStop: { kind: DayStopRuleKind.None },
            maxEvalDays: 30,
            plan,
            riskPerTrade: 100,
            rng: alwaysWinRng,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(at(result.cumulativeSpend, 10)).toBe(100);
        expect(at(result.cumulativeSpend, 1)).toBeCloseTo(100 / 10, 5);
        expect(at(result.cumulativeSpend, 5)).toBeCloseTo((100 * 5) / 10, 5);
        expect(at(result.cumulativeSpend, 1)).toBeLessThan(
            at(result.cumulativeSpend, 10),
        );
        for (let day = 2; day <= 10; day++) {
            expect(at(result.cumulativeSpend, day)).toBeGreaterThanOrEqual(
                at(result.cumulativeSpend, day - 1),
            );
        }
    });
});
