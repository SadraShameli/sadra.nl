import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';

function alwaysWinInputs(plan: SimInputs['plan']): SimInputs {
    return {
        dayStop: { kind: DayStopRuleKind.None },
        fundedHorizonDays: 252,
        maxEvalDays: 150,
        payoutRequestSize: 1000,
        plan,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 1,
        trials: 1,
        winrate: 1,
    };
}

describe('simulate() pays Alpha Futures by payout number (70/70/80/80/90/90)', () => {
    const standard = new AlphaFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant: AlphaFuturesVariant.Standard,
    });
    if (!standard) throw new Error('Alpha Futures Standard 50K plan not found');
    const plan = standard.withMaxLifetimePayouts(6);
    const flatFullShare = plan.withOverrides({
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        payoutTiersFromPayout: undefined,
    });

    it('pays a $500 first request (the room above the locked floor) then five $1,000 requests in full on the flat 100% control', () => {
        expect(
            simulate(alwaysWinInputs(flatFullShare)).expectedGrossPayout,
        ).toBeCloseTo(500 + 5 * 1000, 6);
    });

    it('pays the same six requests at 70/70/80/80/90/90 on the Agreement split', () => {
        expect(simulate(alwaysWinInputs(plan)).expectedGrossPayout).toBeCloseTo(
            0.7 * 500 + 0.7 * 1000 + 0.8 * 2000 + 0.9 * 2000,
            6,
        );
    });
});
