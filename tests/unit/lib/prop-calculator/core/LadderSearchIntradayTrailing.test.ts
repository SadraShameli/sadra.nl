import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    createInitialState,
    DailyLossLimitKind,
    type DayOutcome,
    DayStopRuleKind,
    dollars,
    type DrawdownStrategy,
    enumerateDay,
    EodTrailingDrawdown,
    FirmId,
    IntradayTrailingDrawdown,
    type LadderScoreConfig,
    ladderTrialStreams,
    MffuVariant,
    type Plan,
    RungSizing,
    scoreLadder,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';
import { type Rng } from '~/lib/prop-calculator/rng';
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

function config(
    plan: Plan,
    overrides: Partial<LadderScoreConfig> = {},
): LadderScoreConfig {
    return {
        commission: 0,
        cushion: plan.drawdown.amount,
        maxDays: 150,
        plan,
        positionSizing: null,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seedOffset: 0,
        sims: 4000,
        stopRule: { kind: DayStopRuleKind.None },
        winrate: 0.5,
        ...overrides,
    };
}

function rapidEod(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

function scripted(values: readonly number[]): () => Rng {
    return () => {
        let index = 0;
        return () => {
            const value = values[index];
            if (value === undefined) throw new Error('scripted rng exhausted');
            index += 1;
            return value;
        };
    };
}

function scriptedConfig(plan: Plan): LadderScoreConfig {
    return config(plan, { maxDays: 2, sims: 1 });
}

function simEvalPassRate(plan: Plan, ladder: readonly number[]): number {
    const out = simulate({
        commissionPerRoundTrip: 0,
        copyAccounts: 1,
        dayStop: { kind: DayStopRuleKind.None },
        discounts: undefined,
        evalDayPolicy: {
            ladder,
            maxLossesPerDay: null,
            stopRule: { kind: DayStopRuleKind.None },
        },
        fundedHorizonDays: 1,
        maxAttempts: 1,
        maxEvalDays: 21,
        minRetainedCushion: 0,
        plan,
        riskPerTrade: 400,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: ladder.length,
        trials: 20_000,
        winrate: 0.4,
    });
    return 1 - out.bustProbability - out.timeoutProbability;
}

function twoRungDay(drawdown: DrawdownStrategy): readonly DayOutcome[] {
    return enumerateDay({
        commission: 0,
        contractLimit: null,
        dailyLossLimit: null,
        dayPolicy: {
            ladder: [1500, 2500],
            maxLossesPerDay: null,
            stopRule: { kind: DayStopRuleKind.None },
        },
        dayStart: createInitialState(50_000, 48_000),
        drawdown,
        positionSizing: null,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        winrate: 0.5,
    }).outcomes;
}

describe('enumerateDay sizes each rung on the intraday cushion', () => {
    it('lets an end-of-day trailing account risk its intraday gain', () => {
        const [, winThenLoss] = twoRungDay(
            new EodTrailingDrawdown({ amount: dollars(2000) }),
        );
        expect(winThenLoss?.tradePnLs).toStrictEqual([3000, -2500]);
    });

    it('caps the second rung to the ratcheted intraday cushion on an intraday trailing account', () => {
        const [, winThenLoss] = twoRungDay(
            new IntradayTrailingDrawdown({ amount: dollars(2000) }),
        );
        expect(winThenLoss?.tradePnLs).toStrictEqual([3000, -2000]);
    });

    it('records every trade in order for every outcome', () => {
        const outcomes = twoRungDay(
            new EodTrailingDrawdown({ amount: dollars(2000) }),
        );
        for (const outcome of outcomes) {
            expect(outcome.tradePnLs.reduce((sum, pnl) => sum + pnl, 0)).toBe(
                outcome.finalPnL,
            );
        }
    });
});

describe('scoreLadder decides a breach at trade granularity', () => {
    const base = rapidEod().withOverrides({
        consistency: undefined,
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        minTradingDays: 1,
        profitTarget: dollars(3000),
    });

    it('busts an intraday trailing account that gives back an intraday gain', () => {
        const plan = base.withOverrides({
            drawdown: new IntradayTrailingDrawdown({ amount: dollars(2000) }),
        });
        const score = scoreLadder(
            [1000, 2000],
            scriptedConfig(plan),
            scripted([0.4, 0.1]),
        );
        expect(score.passRate).toBe(0);
        expect(score.meanDaysOnFail).toBe(1);
    });

    it('keeps the same day alive on an end-of-day trailing account', () => {
        const plan = base.withOverrides({
            drawdown: new EodTrailingDrawdown({ amount: dollars(2000) }),
        });
        const score = scoreLadder(
            [1000, 2000],
            scriptedConfig(plan),
            scripted([0.4, 0.1]),
        );
        expect(score.passRate).toBe(1);
        expect(score.meanDaysOnPass).toBe(2);
    });
});

describe('scoreLadder agrees with the simulator on intraday trailing plans', () => {
    const ladder = [400, 400, 400, 400];

    it('Apex Intraday 50K [400 x4], stop none, 21 days: within 2pp of prop sim', () => {
        const plan = apexPlan(ApexVariant.Intraday);
        const score = scoreLadder(
            ladder,
            config(plan, { maxDays: 21, sims: 20_000, winrate: 0.4 }),
            ladderTrialStreams(42),
        );
        expect(
            Math.abs(score.passRate - simEvalPassRate(plan, ladder)),
        ).toBeLessThan(0.02);
    }, 60_000);

    it('Apex EOD 50K control stays within 2pp of prop sim', () => {
        const plan = apexPlan(ApexVariant.Eod);
        const score = scoreLadder(
            ladder,
            config(plan, { maxDays: 21, sims: 20_000, winrate: 0.4 }),
            ladderTrialStreams(42),
        );
        expect(
            Math.abs(score.passRate - simEvalPassRate(plan, ladder)),
        ).toBeLessThan(0.02);
    }, 60_000);
});

describe('scoreLadder passes through Plan.isPassed', () => {
    it('passes TPT at twice the target after a consistency violation, as the simulator does', () => {
        const plan = new TakeProfitTrader().findPlan({
            accountSize: 50_000,
            firm: FirmId.Tpt,
        });
        if (!plan) throw new Error('TPT 50K plan not found');
        expect(plan.profitTarget).toBe(3000);
        expect(plan.minTradingDays).toBe(3);

        const score = scoreLadder(
            [1000, 1000],
            config(plan, { maxDays: 4, sims: 1 }),
            scripted([0.1, 0.4, 0.4, 0.9]),
        );

        expect(score.passRate).toBe(1);
        expect(score.meanDaysOnPass).toBe(3);
    });
});
