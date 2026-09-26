import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const ADVISOR = 'src/lib/prop-calculator/advisor';

function definitionsOf(pattern: RegExp): string[] {
    return readdirSync(path.join(REPO_ROOT, ADVISOR))
        .filter((name) => name.endsWith('.ts'))
        .flatMap((name) => {
            const text = readFileSync(
                path.join(REPO_ROOT, ADVISOR, name),
                'utf8',
            );
            return (text.match(new RegExp(pattern, 'g')) ?? []).map(() => name);
        });
}

describe('advisor shared definitions', () => {
    it('defines the no-commission constant once', () => {
        expect(definitionsOf(/const NO_COMMISSION\b/)).toHaveLength(1);
    });

    it('defines the live cushion percent schema once and reuses it', () => {
        expect(
            definitionsOf(
                /z\s*\.number\(\)\s*\.gt\(0\)\s*\.max\(1\)\s*\.transform\(fraction\)/,
            ),
        ).toEqual(['Rulebook.ts']);
    });

    it('computes the loss room in one function', () => {
        expect(definitionsOf(/export function lossRoom\b/)).toEqual([]);
        expect(definitionsOf(/export function lossBudget\b/)).toEqual([
            'RuleContext.ts',
        ]);
    });
});
