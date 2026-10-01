import { describe, expect, it } from 'vitest';

import {
    AdviceSource,
    type LadderEngineOptimumResult,
    LadderRefusalKind,
    type LadderSearchRequestSource,
    runEngineOptimum,
} from '~/lib/prop-calculator/advisor';
import {
    ApexVariant,
    DayStopRuleKind,
    FirmId,
    LadderGridFieldError,
    type Plan,
    RungSizing,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

const LADDER_SOURCES: readonly LadderSearchRequestSource[] = [
    AdviceSource.LadderSearchFresh,
    AdviceSource.LadderSearchFromState,
];

function apexEodPlan(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function ladderRequest(
    source: LadderSearchRequestSource,
    grid: { lo: number; max: number; slots: number; step: number },
    maxGridSize: number,
) {
    return {
        grid,
        maxGridSize,
        score: {
            commission: 0,
            cushion: 2000,
            maxDays: 40,
            positionSizing: null,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            seedOffset: 0,
            sims: 20,
            stopRule: { kind: DayStopRuleKind.DayGreen },
            winrate: 0.4,
        },
        seed: 7,
        source,
    } as const;
}

describe('runEngineOptimum ladder grid refusal (PT-24c step 1)', () => {
    it.each(LADDER_SOURCES)(
        '%s with a grid above its cap returns a typed refusal instead of throwing',
        (source) => {
            const request = ladderRequest(
                source,
                { lo: 100, max: 800, slots: 4, step: 100 },
                2000,
            );

            const result = runEngineOptimum(apexEodPlan(), request);

            if (!('ladder' in result)) throw new Error('expected a ladder result');
            const ladderResult: LadderEngineOptimumResult = result;
            expect(ladderResult.source).toBe(source);
            expect(ladderResult.refusal).toStrictEqual({
                kind: LadderRefusalKind.GridTooLarge,
                limit: 2000,
                size: 4680,
            });
            expect(ladderResult.ladder.laddersScored).toBe(0);
            expect(ladderResult.ladder.bySpeed).toStrictEqual([]);
        },
    );

    it('a ladder search within its cap carries no refusal', () => {
        const result = runEngineOptimum(
            apexEodPlan(),
            ladderRequest(
                AdviceSource.LadderSearchFresh,
                { lo: 100, max: 200, slots: 2, step: 100 },
                2000,
            ),
        );

        if (!('ladder' in result)) throw new Error('expected a ladder result');
        expect(result.refusal).toBeUndefined();
        expect(result.ladder.laddersScored).toBeGreaterThan(0);
    });

    it('an invalid grid that is not about size still throws', () => {
        expect(() =>
            runEngineOptimum(
                apexEodPlan(),
                ladderRequest(
                    AdviceSource.LadderSearchFresh,
                    { lo: 300, max: 100, slots: 2, step: 100 },
                    2000,
                ),
            ),
        ).toThrow(LadderGridFieldError);
    });
});
