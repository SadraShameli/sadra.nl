import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    FirmId,
    type LadderScoreConfig,
    ladderTrialStreams,
    MffuVariant,
    type Plan,
    RungSizing,
    scoreLadder,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

function apexPlan(variant: ApexVariant): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant,
    });
    if (!plan) throw new Error(`Apex ${variant} 50K plan not found`);
    return plan;
}

function config(plan: Plan, maxDays: number, sims: number): LadderScoreConfig {
    return {
        commission: 0,
        cushion: plan.drawdown.amount,
        maxDays,
        plan,
        positionSizing: null,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seedOffset: 0,
        sims,
        stopRule: { kind: DayStopRuleKind.DayGreen },
        winrate: 0.4,
    };
}

function rapidEodPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

describe('scoreLadder stops eval attempts at the plan eval-day cap', () => {
    it('Apex Intraday 50K has a 21 trading day eval cap', () => {
        expect(apexPlan(ApexVariant.Intraday).evalDayCap(150)).toBe(21);
    });

    it('Apex Intraday 50K scores the same at --eval-days 150 as at the 21 day cap', () => {
        const plan = apexPlan(ApexVariant.Intraday);
        const uncapped = scoreLadder(
            [200],
            config(plan, 150, 4000),
            ladderTrialStreams(42),
        );
        const capped = scoreLadder(
            [200],
            config(plan, 21, 4000),
            ladderTrialStreams(42),
        );

        expect(uncapped).toStrictEqual(capped);
        expect(uncapped.passRate).toBeLessThan(0.15);
        expect(uncapped.meanDaysOnPass).toBeLessThanOrEqual(21);
        expect(uncapped.meanDaysOnFail).toBeLessThanOrEqual(21);
    });

    it('Apex EOD 50K ladder pass rate matches the simulator eval pass rate within 2pp', () => {
        const plan = apexPlan(ApexVariant.Eod);
        const trials = 20_000;
        const score = scoreLadder(
            [200],
            config(plan, 150, trials),
            ladderTrialStreams(42),
        );
        const out = simulate({
            commissionPerRoundTrip: 0,
            copyAccounts: 1,
            dayStop: { kind: DayStopRuleKind.DayGreen },
            discounts: undefined,
            evalDayPolicy: {
                ladder: [200],
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.DayGreen },
            },
            fundedHorizonDays: 1,
            maxAttempts: 1,
            maxEvalDays: 150,
            minRetainedCushion: 0,
            plan,
            riskPerTrade: 200,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            seed: 42,
            tradesPerDay: 1,
            trials,
            winrate: 0.4,
        });
        const evalPassRate = 1 - out.bustProbability - out.timeoutProbability;

        expect(Math.abs(score.passRate - evalPassRate)).toBeLessThan(0.02);
    });

    it('leaves a plan without an eval-day cap on the requested window', () => {
        const plan = rapidEodPlan();
        expect(plan.evalDayCap(60)).toBe(60);
        const sixty = scoreLadder(
            [200],
            config(plan, 60, 4000),
            ladderTrialStreams(42),
        );
        const shorter = scoreLadder(
            [200],
            config(plan, 21, 4000),
            ladderTrialStreams(42),
        );

        expect(sixty.meanDaysOnFail).toBeGreaterThan(21);
        expect(sixty).not.toStrictEqual(shorter);
    });
});
