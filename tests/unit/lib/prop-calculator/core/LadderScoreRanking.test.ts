import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    FirmId,
    type LadderScore,
    type LadderScoreConfig,
    MffuVariant,
    type Plan,
    rankLadderScores,
    RungSizing,
    runLadderSearch,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function rapidEodPlan(): Plan {
    const id = {
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    } as const;
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error('plan not found');
    return plan;
}

function scoreConfig(): LadderScoreConfig {
    return {
        commission: 0,
        cushion: rapidEodPlan().drawdown.amount,
        maxDays: 150,
        plan: rapidEodPlan(),
        positionSizing: null,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seedOffset: 0,
        sims: 300,
        stopRule: { kind: DayStopRuleKind.DayGreen },
        winrate: 0.4,
    };
}

function scoreOf(
    ladder: readonly number[],
    overrides: Partial<LadderScore>,
): LadderScore {
    return {
        costPerFunded: 100,
        costPerFundedStandardError: 1,
        expectedDaysToFunded: 10,
        expectedDaysToFundedStandardError: 1,
        ladder,
        meanDaysOnFail: 5,
        meanDaysOnPass: 5,
        passRate: 0.5,
        passRateStandardError: 0.01,
        ...overrides,
    };
}

describe('rankLadderScores (PT-68i, one ranking tail)', () => {
    const cheap = scoreOf([100], {
        costPerFunded: 50,
        expectedDaysToFunded: 30,
        passRate: 0.2,
    });
    const quick = scoreOf([200], {
        costPerFunded: 90,
        expectedDaysToFunded: 5,
        passRate: 0.4,
    });
    const reliable = scoreOf([300], {
        costPerFunded: 80,
        expectedDaysToFunded: 20,
        passRate: 0.9,
    });
    const unscorable = scoreOf([400], {
        costPerFunded: Infinity,
        expectedDaysToFunded: Infinity,
        passRate: 0.01,
    });

    it('ranks the scorable scores by cost, pass rate and speed and drops the unscorable ones', () => {
        const ranked = rankLadderScores(
            [unscorable, cheap, quick, reliable],
            25,
        );

        expect(ranked.byCost).toStrictEqual([cheap, reliable, quick]);
        expect(ranked.byPassRate).toStrictEqual([reliable, quick, cheap]);
        expect(ranked.bySpeed).toStrictEqual([quick, reliable, cheap]);
        expect(ranked.frontier).toStrictEqual([quick, reliable, cheap]);
        expect(ranked.unscorableCount).toBe(1);
    });

    it('keeps only the top N of each ranking', () => {
        const ranked = rankLadderScores([cheap, quick, reliable], 1);

        expect(ranked.byCost).toStrictEqual([cheap]);
        expect(ranked.byPassRate).toStrictEqual([reliable]);
        expect(ranked.bySpeed).toStrictEqual([quick]);
    });

    it('ranks an empty score list to empty rankings', () => {
        const ranked = rankLadderScores([], 25);

        expect(ranked).toStrictEqual({
            byCost: [],
            byPassRate: [],
            bySpeed: [],
            frontier: [],
            unscorableCount: 0,
        });
    });

    it('is the ranking runLadderSearch returns', () => {
        const result = runLadderSearch({
            grid: { lo: 100, max: 400, slots: 3, step: 100 },
            score: scoreConfig(),
            seed: 11,
            topN: 4,
        });
        const all = runLadderSearch({
            grid: { lo: 100, max: 400, slots: 3, step: 100 },
            score: scoreConfig(),
            seed: 11,
            topN: 1000,
        });
        const rescored = rankLadderScores(
            [...all.byCost, ...all.byPassRate, ...all.bySpeed].filter(
                (score, index, scores) => scores.indexOf(score) === index,
            ),
            4,
        );

        expect(rescored.byCost).toStrictEqual(result.byCost);
        expect(rescored.byPassRate).toStrictEqual(result.byPassRate);
        expect(rescored.bySpeed).toStrictEqual(result.bySpeed);
    });
});
