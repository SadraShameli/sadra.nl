import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AdviceSource,
    AssumptionKind,
    assumptionKindText,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type LadderEngineOptimumResult,
    LadderEngineOptimumResultKind,
    type LadderGridRefusal,
    LadderRefusalKind,
    ladderRefusalText,
    type LadderSearchRequestSource,
    ladderStepWidenedText,
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
        policy: buildEnginePolicy({
            fundedHorizonDays: 60,
            plan: apexEodPlan(),
            rulebook: DEFAULT_RULEBOOK,
        }).policy,
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

            if (!('refusal' in result))
                throw new Error('expected a refused ladder result');
            const ladderResult: LadderEngineOptimumResult = result;
            expect(ladderResult).toStrictEqual({
                kind: LadderEngineOptimumResultKind.Refused,
                refusal: {
                    kind: LadderRefusalKind.GridTooLarge,
                    limit: 2000,
                    size: 4680,
                },
                source,
            });
            expect('ladder' in ladderResult).toBe(false);
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
        expect(result.kind).toBe(LadderEngineOptimumResultKind.Scored);
        expect('refusal' in result).toBe(false);
        expect(result.ladder.laddersScored).toBeGreaterThan(0);
    });

    it('the result is exactly scored or refused, never both and never an empty ladder beside a refusal', () => {
        type Refused = Extract<
            LadderEngineOptimumResult,
            { readonly kind: LadderEngineOptimumResultKind.Refused }
        >;
        type Scored = Extract<
            LadderEngineOptimumResult,
            { readonly kind: LadderEngineOptimumResultKind.Scored }
        >;

        expectTypeOf<Refused['refusal']>().toEqualTypeOf<LadderGridRefusal>();
        expectTypeOf<Refused>().not.toHaveProperty('ladder');
        expectTypeOf<Scored>().toHaveProperty('ladder');
        expectTypeOf<Scored>().not.toHaveProperty('refusal');
        expectTypeOf<
            Refused | Scored
        >().toEqualTypeOf<LadderEngineOptimumResult>();
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

describe('the shared ladder wording (PT-24d review)', () => {
    it('words a refusal once, with both numbers grouped', () => {
        expect(
            ladderRefusalText({
                kind: LadderRefusalKind.GridTooLarge,
                limit: 2000,
                size: 4680,
            }),
        ).toBe(
            'ladder search not run: grid too large (4,680 ladders, above the 2,000 limit)',
        );
    });

    it('states the coarser step with the grid step, and the kind text alone states it without the step', () => {
        const base = assumptionKindText(AssumptionKind.LadderStepWidened);

        expect(base).toContain('coarser');
        expect(base).not.toContain('searched');
        expect(base).not.toContain('grid step is');
        expect(ladderStepWidenedText(140)).toBe(
            `${base} The grid step is $140.`,
        );
    });
});
