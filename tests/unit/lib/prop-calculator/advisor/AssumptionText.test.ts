import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    type Assumption,
    AssumptionBias,
    AssumptionKind,
    assumptionSchema,
    assumptionText,
    inputAssumption,
    type InputAssumptionKind,
    ladderStepWidenedAssumption,
    SIZING_ASSUMPTION_TEXT,
    SizingAssumption,
    sizingRuleAssumption,
} from '~/lib/prop-calculator/advisor';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const TEXT_FILE = path.join(
    'lib',
    'prop-calculator',
    'advisor',
    'Assumption.ts',
);
const SOURCE_FILE = /\.tsx?$/;
const KIND_TEXT_ENTRY = /\[AssumptionKind\.[A-Za-z]+\]:/;

const INPUT_KINDS: readonly InputAssumptionKind[] = Object.values(
    AssumptionKind,
).filter(
    (kind): kind is InputAssumptionKind =>
        kind !== AssumptionKind.SizingRule &&
        kind !== AssumptionKind.LadderStepWidened,
);

function filesUnder(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

describe('the widened ladder step travels inside its typed assumption (PT-24e, F-133)', () => {
    it('builds the assumption with its bias and its step', () => {
        expect(
            ladderStepWidenedAssumption(140, AssumptionBias.Neutral),
        ).toStrictEqual({
            bias: AssumptionBias.Neutral,
            kind: AssumptionKind.LadderStepWidened,
            step: 140,
        });
    });

    it('validates it at a boundary and survives structuredClone', () => {
        const assumption = ladderStepWidenedAssumption(
            140,
            AssumptionBias.Neutral,
        );
        const cloned: unknown = structuredClone(assumption);

        expect(assumptionSchema.parse(cloned)).toStrictEqual(assumption);
    });

    it.each([
        [
            'a widened step without its step',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.LadderStepWidened,
            },
        ],
        [
            'a zero step',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.LadderStepWidened,
                step: 0,
            },
        ],
        [
            'a negative step',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.LadderStepWidened,
                step: -100,
            },
        ],
        [
            'a non-finite step',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.LadderStepWidened,
                step: Infinity,
            },
        ],
        [
            'a step on an assumption that has none',
            {
                bias: AssumptionBias.Neutral,
                kind: AssumptionKind.GrossOnlyPayouts,
                step: 140,
            },
        ],
    ])('rejects %s', (_name, candidate) => {
        expect(assumptionSchema.safeParse(candidate).success).toBe(false);
    });

    it('refuses to build a plain input assumption of the widened-step kind', () => {
        expect(() =>
            inputAssumption(
                AssumptionKind.LadderStepWidened as never,
                AssumptionBias.Neutral,
            ),
        ).toThrow(/LadderStepWidened/);
    });

    it('refuses a non-positive step', () => {
        expect(() =>
            ladderStepWidenedAssumption(0, AssumptionBias.Neutral),
        ).toThrow(/step/);
    });
});

describe('one assumption text table for the CLI and the web (PT-24e, F-133)', () => {
    it.each(INPUT_KINDS)('has a text for the %s kind', (kind) => {
        const text = assumptionText(
            inputAssumption(kind, AssumptionBias.Neutral),
        );

        expect(text.length).toBeGreaterThan(10);
        expect(text).not.toContain('—');
    });

    it('says the widened step from the assumption itself', () => {
        const text = assumptionText(
            ladderStepWidenedAssumption(140, AssumptionBias.Neutral),
        );

        expect(text).toContain('coarser');
        expect(text).toContain('The grid step is $140.');
        expect(text).not.toContain('searched');
    });

    it('says what unspecified position sizing means for the suggested risk', () => {
        const text = assumptionText(
            inputAssumption(
                AssumptionKind.PositionSizingUnspecified,
                AssumptionBias.Neutral,
            ),
        );

        expect(text).toContain('fractional');
        expect(text).toContain('whole contracts');
        expect(text).toContain('contract cap');
    });

    it('gives a SizingRule assumption its sizing text', () => {
        expect(
            assumptionText(
                sizingRuleAssumption(
                    SizingAssumption.NoCommission,
                    AssumptionBias.Optimistic,
                ),
            ),
        ).toBe(SIZING_ASSUMPTION_TEXT[SizingAssumption.NoCommission]);
    });

    it('gives every input kind a distinct text', () => {
        const assumptions: readonly Assumption[] = INPUT_KINDS.map((kind) =>
            inputAssumption(kind, AssumptionBias.Neutral),
        );
        const texts = assumptions.map((assumption) =>
            assumptionText(assumption),
        );

        expect(new Set(texts).size).toBe(texts.length);
    });

    it('finds the kind-to-text table in one source file only', () => {
        const holders = filesUnder(SOURCE_ROOT)
            .filter((file) => KIND_TEXT_ENTRY.test(readFileSync(file, 'utf8')))
            .map((file) => path.relative(SOURCE_ROOT, file));

        expect(holders).toStrictEqual([TEXT_FILE]);
    });
});
