import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    FirmId,
    INSTRUMENTS,
    type LadderGridConfig,
    type LadderScore,
    type LadderScoreConfig,
    ladderTrialStreams,
    MffuVariant,
    type Plan,
    type PlanId,
    points,
    retryFee,
    RungSizing,
    runLadderSearch,
    scoreLadder,
    subscriptionFee,
    TopStepVariant,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { deriveSubSeed, mulberry32 } from '~/lib/prop-calculator/rng';
import { mean, standardDeviation } from '~/lib/prop-calculator/stats';

function planFor(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error(`plan ${JSON.stringify(id)} not found`);
    return plan;
}

const rapidEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});
const topStep = planFor({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});
const apexEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

function config(plan: Plan, sims: number): LadderScoreConfig {
    return {
        commission: 0,
        cushion: plan.drawdown.amount,
        maxDays: 150,
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

function scoreOf(
    scores: readonly LadderScore[],
    ladder: readonly number[],
): LadderScore | undefined {
    return scores.find((score) => score.ladder.join(',') === ladder.join(','));
}

function searchAll(grid: LadderGridConfig, seed: number) {
    const result = runLadderSearch({
        grid,
        score: config(rapidEod, 2000),
        seed,
        topN: 1000,
    });
    return [...result.byPassRate];
}

const seeds = (count: number) =>
    Array.from({ length: count }, (_, index) => index + 1);

function costNoiseFloor(score: LadderScore): number {
    const retryNoise =
        (retryFee(topStep.fees) / score.passRate ** 2) *
        score.passRateStandardError;
    const subscriptionPerDay =
        subscriptionFee(topStep.fees, TRADING_DAYS_PER_MONTH) /
        TRADING_DAYS_PER_MONTH;
    return Math.hypot(
        retryNoise,
        subscriptionPerDay * score.expectedDaysToFundedStandardError,
    );
}

function topStepCost(ladder: readonly number[], seed: number): number {
    return scoreLadder(ladder, config(topStep, 2000), ladderTrialStreams(seed))
        .costPerFunded;
}

function topStepSubscriptionScores(): readonly LadderScore[] {
    return runLadderSearch({
        grid: { lo: 460, max: 500, slots: 2, step: 5 },
        score: config(topStep, 4000),
        seed: 42,
        topN: 1000,
    }).byPassRate;
}

describe('ladder scores use common random numbers', () => {
    it('ladderTrialStreams gives trial t the stream deriveSubSeed(seed, t, 0)', () => {
        expect(ladderTrialStreams(7)(3)()).toBe(
            mulberry32(deriveSubSeed(7, 3, 0))(),
        );
    });

    it('scores a ladder the same wherever it sits in the grid', () => {
        const alone = scoreOf(
            searchAll({ lo: 300, max: 300, slots: 1, step: 100 }, 7),
            [300],
        );
        const third = scoreOf(
            searchAll({ lo: 100, max: 300, slots: 1, step: 100 }, 7),
            [300],
        );
        expect(alone).toBeDefined();
        expect(third).toStrictEqual(alone);
    });

    it('runLadderSearch scores each ladder exactly as scoreLadder does on the same streams', () => {
        const direct = scoreLadder(
            [300],
            config(rapidEod, 2000),
            ladderTrialStreams(7),
        );
        expect(
            scoreOf(
                searchAll({ lo: 100, max: 300, slots: 1, step: 100 }, 7),
                [300],
            ),
        ).toStrictEqual(direct);
    });

    it('cuts the noise in the difference between two ladders against independent streams', () => {
        const common: number[] = [];
        const independent: number[] = [];
        for (const seed of seeds(20)) {
            const a = topStepCost([300, 200, 100], seed);
            common.push(a - topStepCost([200, 100, 100], seed));
            independent.push(a - topStepCost([200, 100, 100], seed + 5000));
        }
        expect(standardDeviation(common)).toBeLessThan(
            0.8 * standardDeviation(independent),
        );
    }, 60_000);
});

describe('ladder scores carry standard errors', () => {
    it('reports the binomial standard error of the eval pass rate', () => {
        const s = scoreLadder(
            [400, 600, 500],
            config(rapidEod, 20_000),
            ladderTrialStreams(90_210),
        );
        expect(s.passRateStandardError).toBeCloseTo(
            Math.sqrt((s.passRate * (1 - s.passRate)) / 20_000),
            12,
        );
        expect(s.passRateStandardError).toBeGreaterThan(0.003);
        expect(s.passRateStandardError).toBeLessThan(0.004);
    }, 60_000);

    it('reports cost and days standard errors that match the seed-to-seed spread', () => {
        const scores = seeds(30).map((seed) =>
            scoreLadder(
                [400, 600, 500],
                config(rapidEod, 2000),
                ladderTrialStreams(seed),
            ),
        );
        const costRatio =
            standardDeviation(scores.map((s) => s.costPerFunded)) /
            mean(scores.map((s) => s.costPerFundedStandardError));
        const daysRatio =
            standardDeviation(scores.map((s) => s.expectedDaysToFunded)) /
            mean(scores.map((s) => s.expectedDaysToFundedStandardError));
        expect(costRatio).toBeGreaterThan(0.6);
        expect(costRatio).toBeLessThan(1.6);
        expect(daysRatio).toBeGreaterThan(0.6);
        expect(daysRatio).toBeLessThan(1.6);
    }, 60_000);

    it('keeps the cost standard error smooth across neighbouring ladders on a subscription plan', () => {
        const errors = [460, 465, 470, 475, 480, 485, 490, 495, 500].map(
            (rung) =>
                scoreLadder(
                    [rung],
                    config(topStep, 4000),
                    ladderTrialStreams(42),
                ).costPerFundedStandardError,
        );
        expect(Math.max(...errors) / Math.min(...errors)).toBeLessThan(4);
    }, 60_000);

    it('prices the days-to-funded noise at the subscription rate in the cost standard error of every neighbouring ladder', () => {
        const scores = topStepSubscriptionScores();
        const days = scores.map((score) => score.expectedDaysToFunded);
        expect(scores).toHaveLength(90);
        expect(Math.max(...days) - Math.min(...days)).toBeGreaterThan(10);
        const belowFloor = scores.filter(
            (score) =>
                !(score.costPerFundedStandardError > costNoiseFloor(score)),
        );
        expect(belowFloor.map((score) => score.ladder)).toStrictEqual([]);
    }, 60_000);

    it('reports a subscription plan cost standard error that matches the seed-to-seed spread', () => {
        const scores = seeds(30).map((seed) =>
            scoreLadder([500], config(topStep, 2000), ladderTrialStreams(seed)),
        );
        const costRatio =
            standardDeviation(scores.map((s) => s.costPerFunded)) /
            mean(scores.map((s) => s.costPerFundedStandardError));
        expect(costRatio).toBeGreaterThan(0.6);
        expect(costRatio).toBeLessThan(1.6);
    }, 60_000);

    it('reports Infinity standard errors for an unscorable ladder', () => {
        const s = scoreLadder(
            [500],
            {
                ...config(apexEod, 2000),
                positionSizing: {
                    instrument: INSTRUMENTS.MNQ,
                    stopPoints: points(1),
                },
            },
            ladderTrialStreams(42),
        );
        expect(s.passRate).toBeLessThan(0.02);
        expect(s.costPerFundedStandardError).toBe(Infinity);
        expect(s.expectedDaysToFundedStandardError).toBe(Infinity);
    });
});
