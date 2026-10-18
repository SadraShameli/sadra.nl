import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as barrel from '~/lib/prop-calculator/advisor';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

function sourceOf(file: string): string {
    return readFileSync(
        path.join(REPO_ROOT, 'src/lib/prop-calculator/advisor', file),
        'utf8',
    );
}

describe('the shared advisor helpers live off the funded class (PT-19h, F-124)', () => {
    it.each([
        'aggressiveOptimumChurnReasons',
        'documentedPeakRiskOf',
        'peakRiskOf',
        'fundedConsistencyCeiling',
    ] as const)('exports %s through the advisor barrel', (name) => {
        expect(typeof barrel[name]).toBe('function');
    });

    it('keeps the helpers out of FundedSizingAdvisor.ts, which only uses them', () => {
        const funded = sourceOf('FundedSizingAdvisor.ts');

        for (const name of [
            'aggressiveOptimumChurnReasons',
            'documentedPeakRiskOf',
            'peakRiskOf',
            'fundedConsistencyCeiling',
        ]) {
            expect(funded).not.toMatch(
                new RegExp(String.raw`export function ${name}\b`),
            );
        }
    });

    it('lets no other advisor file import from the funded class module', () => {
        for (const file of [
            'EvalSizingAdvisor.ts',
            'LiveSizingAdvisor.ts',
            'CopyGroupSizing.ts',
        ]) {
            expect(sourceOf(file), file).not.toContain(
                "from './FundedSizingAdvisor'",
            );
        }
    });
});
