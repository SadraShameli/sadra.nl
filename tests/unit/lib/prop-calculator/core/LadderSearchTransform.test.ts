import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    FirmId,
    type LadderScoreConfig,
    MffuVariant,
    type Plan,
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

const GRID = { lo: 100, max: 400, slots: 3, step: 100 };

describe('runLadderSearch with a per-ladder transform (PT-68i, F-V16)', () => {
    it('is byte-identical to the plain search when the transform is absent or the identity', () => {
        const plain = runLadderSearch({
            grid: GRID,
            score: scoreConfig(),
            seed: 11,
        });
        const identity = runLadderSearch({
            grid: GRID,
            score: scoreConfig(),
            seed: 11,
            transformLadder: (ladder) => ladder,
        });

        expect(identity).toStrictEqual(plain);
    });

    it('scores each grid ladder after the transform, so the ranked ladders are the transformed ones', () => {
        const result = runLadderSearch({
            grid: GRID,
            score: scoreConfig(),
            seed: 11,
            topN: 1000,
            transformLadder: (ladder) => ladder.map((rung) => rung / 2),
        });

        expect(result.byPassRate.length).toBeGreaterThan(0);
        for (const score of result.byPassRate) {
            for (const rung of score.ladder) {
                expect([50, 100, 150, 200]).toContain(rung);
            }
        }
    });

    it('drops the aliases the transform creates and reports them', () => {
        const result = runLadderSearch({
            grid: GRID,
            score: scoreConfig(),
            seed: 11,
            topN: 1000,
            transformLadder: (ladder) => ladder.slice(0, 1),
        });

        expect(result.gridSize).toBe(84);
        expect(result.laddersScored).toBe(4);
        expect(result.droppedAliasCount).toBe(80);
        expect(result.byPassRate).toHaveLength(4);
    });

    it('reports progress over the ladders the transform leaves', () => {
        const progress: number[] = [];
        runLadderSearch({
            grid: GRID,
            onProgress: ({ completed, total }) => {
                progress.push(completed, total);
            },
            score: scoreConfig(),
            seed: 11,
            transformLadder: (ladder) => ladder.slice(0, 1),
        });

        expect(progress).toStrictEqual([4, 4]);
    });
});
