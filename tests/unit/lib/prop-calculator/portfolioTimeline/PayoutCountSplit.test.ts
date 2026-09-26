import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    type Plan,
} from '~/lib/prop-calculator/core';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';
import { runEvalToFundedCycle } from '~/lib/prop-calculator/portfolioTimeline';
import { type Rng } from '~/lib/prop-calculator/rng';

const alwaysWinRng: Rng = () => 0;

function payoutAmounts(plan: Plan): number[] {
    const dayPolicy = flatDayPolicy(250, 1, { kind: DayStopRuleKind.None });
    return runEvalToFundedCycle({
        cardDayBudget: 60,
        commission: dollars(0),
        discounts: undefined,
        evalDayPolicy: dayPolicy,
        fundedDayPolicy: dayPolicy,
        maxEvalDays: 60,
        maxFundedDays: 252,
        minRetainedCushion: plan.resolveRetainedCushion(undefined),
        payoutRequestSize: dollars(1000),
        plan,
        positionSizing: null,
        rng: alwaysWinRng,
        rrRatio: 2,
        rungSizing: DEFAULT_RUNG_SIZING,
        winrate: fraction(1),
    }).payouts.map((event) => event.amount);
}

describe('the cash-flow timeline pays Alpha Futures by payout number', () => {
    it('pays 0.7, 0.7, 0.8, 0.8, 0.9, 0.9 of the flat 100% control on the same balance path', () => {
        const standard = new AlphaFutures().findPlan({
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Standard,
        });
        if (!standard) {
            throw new Error('Alpha Futures Standard 50K plan not found');
        }
        const plan = standard.withMaxLifetimePayouts(6);
        const control = plan.withOverrides({
            payoutTiers: [
                { thresholdProfit: dollars(0), traderShare: fraction(1) },
            ],
            payoutTiersFromPayout: undefined,
        });

        const tiered = payoutAmounts(plan);
        const flat = payoutAmounts(control);

        expect(flat).toHaveLength(6);
        expect(tiered).toHaveLength(6);
        expect(
            tiered.map((amount, index) =>
                Number((amount / (flat[index] ?? NaN)).toFixed(6)),
            ),
        ).toStrictEqual([0.7, 0.7, 0.8, 0.8, 0.9, 0.9]);
    });
});
