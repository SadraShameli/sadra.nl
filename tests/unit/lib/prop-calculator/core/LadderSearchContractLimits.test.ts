import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    contracts,
    createInitialState,
    type DayOutcome,
    DayStopRuleKind,
    dollars,
    enumerateDay,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    INSTRUMENTS,
    type LadderScoreConfig,
    ladderTrialStreams,
    type Plan,
    points,
    type PositionSizingConfig,
    RungSizing,
    scoreLadder,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import { runEvalAttempt, TradeTotals } from '~/lib/prop-calculator/simulator';

interface AttemptSummary {
    meanDaysOnFail: number;
    meanDaysOnPass: number;
    passRate: number;
}

const PARITY_TRIALS = 20_000;

function apexEod(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function config(
    plan: Plan,
    positionSizing: null | PositionSizingConfig,
): LadderScoreConfig {
    return {
        commission: 0,
        cushion: plan.drawdown.amount,
        maxDays: 150,
        plan,
        positionSizing,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seedOffset: 0,
        sims: 4000,
        stopRule: { kind: DayStopRuleKind.DayGreen },
        winrate: 0.4,
    };
}

function mnq(stopPoints: number): PositionSizingConfig {
    return { instrument: INSTRUMENTS.MNQ, stopPoints: points(stopPoints) };
}

function simulatedAttempts(
    plan: Plan,
    ladder: readonly number[],
    positionSizing: null | PositionSizingConfig,
): AttemptSummary {
    const rng = mulberry32(42);
    const totals = new TradeTotals();
    let passes = 0;
    let passDays = 0;
    let failDays = 0;
    for (let trial = 0; trial < PARITY_TRIALS; trial++) {
        const attempt = runEvalAttempt({
            commission: dollars(0),
            dayPolicy: {
                ladder,
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.DayGreen },
            },
            maxEvalDays: 150,
            plan,
            positionSizing,
            rng,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            totals,
            winrate: fraction(0.4),
        });
        if (attempt.outcome === 'passed') {
            passes += 1;
            passDays += attempt.days;
        } else {
            failDays += attempt.days;
        }
    }
    return {
        meanDaysOnFail: failDays / (PARITY_TRIALS - passes),
        meanDaysOnPass: passDays / passes,
        passRate: passes / PARITY_TRIALS,
    };
}

function singleRungDay(
    positionSizing: null | PositionSizingConfig,
    contractLimit: null | number,
): readonly DayOutcome[] {
    return enumerateDay({
        commission: 0,
        contractLimit: contractLimit === null ? null : contracts(contractLimit),
        dailyLossLimit: null,
        dayPolicy: {
            ladder: [500],
            maxLossesPerDay: null,
            stopRule: { kind: DayStopRuleKind.None },
        },
        dayStart: createInitialState(50_000, 48_000),
        drawdown: new EodTrailingDrawdown({ amount: dollars(2000) }),
        positionSizing,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        winrate: 0.4,
    }).outcomes;
}

describe('enumerateDay caps each rung to the contract limit', () => {
    it('caps a $500 rung to 60 MNQ at a 1 point stop ($120)', () => {
        const outcomes = singleRungDay(mnq(1), 60);
        expect(outcomes).toHaveLength(2);
        expect(outcomes.map((outcome) => outcome.finalPnL)).toStrictEqual([
            240, -120,
        ]);
        expect(Math.min(...outcomes.map((outcome) => outcome.worstPnL))).toBe(
            -120,
        );
    });

    it('leaves the rung uncapped without position sizing', () => {
        expect(
            singleRungDay(null, 60).map((outcome) => outcome.finalPnL),
        ).toStrictEqual([1000, -500]);
    });

    it('leaves the rung uncapped when the plan has no contract limit', () => {
        expect(
            singleRungDay(mnq(1), null).map((outcome) => outcome.finalPnL),
        ).toStrictEqual([1000, -500]);
    });
});

describe('scoreLadder applies the plan eval contract limit', () => {
    it('Apex EOD 50K [500] at MNQ 1 point is capped to $120 a trade and almost never passes', () => {
        const plan = apexEod();
        const capped = scoreLadder(
            [500],
            config(plan, mnq(1)),
            ladderTrialStreams(42),
        );
        const uncapped = scoreLadder(
            [500],
            config(plan, null),
            ladderTrialStreams(42),
        );

        expect(capped.passRate).toBeLessThan(0.02);
        expect(capped.costPerFunded).toBe(Infinity);
        expect(uncapped.passRate).toBeGreaterThan(0.3);
    });

    it('a contract limit that does not bind leaves the score unchanged', () => {
        const plan = apexEod();
        const trialRng = ladderTrialStreams(42);
        const nonBinding = scoreLadder([500], config(plan, mnq(25)), trialRng);
        expect(nonBinding).toStrictEqual(
            scoreLadder([500], config(plan, null), trialRng),
        );
    });
});

describe('scoreLadder trades a cushion left below its bucket, as the simulator does', () => {
    const topStep = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!topStep) throw new Error('TopStep 50K plan not found');

    it.each([
        ['TopStep 50K [465]', topStep, [465], null],
        ['TopStep 50K [490]', topStep, [490], null],
        ['Apex EOD 50K [900] at MNQ 7pt', apexEod(), [900], mnq(7)],
    ])(
        '%s: eval pass rate and mean days on pass and on fail match the simulator',
        (_, plan, ladder, positionSizing) => {
            const score = scoreLadder(
                ladder,
                { ...config(plan, positionSizing), sims: PARITY_TRIALS },
                ladderTrialStreams(42),
            );
            const sim = simulatedAttempts(plan, ladder, positionSizing);
            expect(Math.abs(score.passRate - sim.passRate)).toBeLessThan(0.02);
            expect(
                Math.abs(score.meanDaysOnPass - sim.meanDaysOnPass),
            ).toBeLessThan(0.1 * sim.meanDaysOnPass + 0.5);
            expect(
                Math.abs(score.meanDaysOnFail - sim.meanDaysOnFail),
            ).toBeLessThan(0.1 * sim.meanDaysOnFail + 0.5);
        },
        60_000,
    );
});
