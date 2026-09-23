import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    RungSizing,
    TradeifyVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    runEvalToFundedCycle,
    simulatePortfolioTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';
import { mulberry32 } from '~/lib/prop-calculator/rng';

function apexWithFees(oneTimeEval: number, reset: number) {
    const base = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!base) throw new Error('Apex EOD plan not found');
    return base.withOverrides({
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(oneTimeEval),
            reset: dollars(reset),
        },
    });
}

describe('N-12: the cash-flow timeline prices eval retries on the D1 cheaper path', () => {
    it('re-buys instead of paying a reset that costs more than a fresh eval', () => {
        const policy = flatDayPolicy(3000, 1, { kind: DayStopRuleKind.None });
        const card = runEvalToFundedCycle({
            commission: dollars(0),
            discounts: undefined,
            evalDayPolicy: policy,
            fundedDayPolicy: policy,
            maxEvalDays: 30,
            maxFundedDays: 0,
            minRetainedCushion: dollars(0),
            payoutRequestSize: undefined,
            plan: apexWithFees(100, 500),
            positionSizing: null,
            rng: mulberry32(1),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            winrate: fraction(0),
        });
        expect(card.attemptsUsed).toBeGreaterThan(1);
        expect(card.totalCost).toBeCloseTo(
            100 + 100 * (card.attemptsUsed - 1),
            9,
        );
    });
});

describe('N-12: the cash-flow timeline applies the bundle discount to the first purchase of a 5-account portfolio', () => {
    it('charges 5 Growth evals at the bundle price when every eval passes', () => {
        const plan = findFirm(FirmId.Tradeify)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Growth,
        });
        if (!plan) throw new Error('Tradeify Growth plan not found');
        const inputs = {
            dayBudget: 40,
            dayStop: { kind: DayStopRuleKind.None },
            maxEvalDays: 30,
            plan,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 3,
            winrate: 1,
        } as const;
        const five = simulatePortfolioTimeline({ ...inputs, accounts: 5 });
        const four = simulatePortfolioTimeline({ ...inputs, accounts: 4 });
        expect(five.spendP50.at(-1)).toBeCloseTo(
            5 * plan.fees.oneTimeEval * 0.95,
            6,
        );
        expect(four.spendP50.at(-1)).toBeCloseTo(4 * plan.fees.oneTimeEval, 6);
    });
});
