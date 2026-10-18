import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { requireValue } from '~/lib/prop-calculator/advisor/value';
import {
    type ValueNotModeledResult,
    ValueResultKind,
    ValueUnavailableReason,
} from '~/lib/prop-calculator/advisor/value';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../../..');
const VALUE_DIR = 'src/lib/prop-calculator/advisor/value';

interface SwingLike {
    readonly kind: ValueResultKind.Swing;
    readonly winProbability: number;
}

const NOT_MODELED: ValueNotModeledResult = {
    kind: ValueResultKind.NotModeled,
    reason: ValueUnavailableReason.LiveNotModeled,
};

describe('requireValue (one generic require-or-throw, PT-74b step 8)', () => {
    it('returns the value result unchanged when the outcome is modeled', () => {
        const value = {
            creditFree: { standardError: null, value: 100 },
            creditInclusive: { standardError: null, value: 100 },
            kind: ValueResultKind.Value as const,
            seed: 1,
            trials: 100,
        };
        expect(requireValue(value)).toBe(value);
    });

    it('also accepts a swing outcome, not only a plain value outcome', () => {
        const swing: SwingLike = {
            kind: ValueResultKind.Swing,
            winProbability: 0.4,
        };
        expect(requireValue(swing)).toBe(swing);
    });

    it('throws on a not-modeled outcome regardless of the modeled shape', () => {
        expect(() => requireValue(NOT_MODELED)).toThrow();
    });

    it('is defined exactly once across advisor/value', () => {
        const definitions = readdirSync(path.join(REPO_ROOT, VALUE_DIR))
            .filter(
                (name) => name.endsWith('.ts') && !name.endsWith('index.ts'),
            )
            .flatMap((name) => {
                const text = readFileSync(
                    path.join(REPO_ROOT, VALUE_DIR, name),
                    'utf8',
                );
                return (
                    text.match(/export function requireValue\b/g) ?? []
                ).map(() => name);
            });
        expect(definitions).toEqual(['ValueChain.ts']);
    });

    it('riskCandidateValues never keeps its own require-or-throw for a swing result', () => {
        const text = readFileSync(
            path.join(REPO_ROOT, VALUE_DIR, 'RiskCandidateValues.ts'),
            'utf8',
        );
        expect(text).not.toMatch(
            /throw new Error\(\s*['"]riskCandidateValues:/,
        );
    });
});
