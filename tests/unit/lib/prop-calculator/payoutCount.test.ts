import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    MffuVariant,
    type Plan,
    RungSizing,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import {
    runEvalWithRetries,
    runFundedHorizon,
    simulate,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

const mffu = new MyFundedFutures();

function rapidPlan() {
    const plan = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Rapid,
    });
    if (!plan) throw new Error('MFFU Rapid 50K plan not found');
    return plan;
}

function runOverHorizon(fundedHorizonDays: number, plan: Plan) {
    return simulate({
        dayStop: { kind: DayStopRuleKind.None },
        fundedHorizonDays,
        maxEvalDays: 150,
        plan,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 1,
        trials: 1,
        winrate: 1,
    });
}

describe('expectedPayoutCount', () => {
    it('matches PayoutTotals.count from a directly-run funded horizon, for an always-winning single trial', () => {
        const plan = rapidPlan();
        const dayPolicy = flatDayPolicy(250, 1, { kind: DayStopRuleKind.None });

        const rng = mulberry32(1);
        const retry = runEvalWithRetries({
            commission: dollars(0),
            dayPolicy,
            maxAttempts: 1,
            maxEvalDays: 150,
            plan,
            positionSizing: null,
            rng,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            totals: new TradeTotals(),
            winrate: fraction(1),
        });
        expect(retry.terminalOutcome).toBeNull();

        const fundedHorizon = runFundedHorizon({
            attempt: retry.attempt,
            commission: dollars(0),
            dayPolicy,
            fundedHorizonDays: 252,
            minRetainedCushion: dollars(plan.defaultRetainedCushion()),
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rng,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            winrate: fraction(1),
        });
        expect(fundedHorizon.payoutCount).toBeGreaterThan(0);

        const out = simulate({
            dayStop: { kind: DayStopRuleKind.None },
            fundedHorizonDays: 252,
            maxEvalDays: 150,
            plan,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.expectedPayoutCount).toBe(fundedHorizon.payoutCount);
    });

    it('grows monotonically with a longer funded horizon for an always-winning, uncapped-payout trader', () => {
        const tpt = new TakeProfitTrader();
        const plan = tpt.plans[0];
        if (!plan) throw new Error('TPT must expose a plan');

        const short = runOverHorizon(30, plan);
        const long = runOverHorizon(252, plan);
        expect(long.expectedPayoutCount).toBeGreaterThan(
            short.expectedPayoutCount,
        );
    });
});
