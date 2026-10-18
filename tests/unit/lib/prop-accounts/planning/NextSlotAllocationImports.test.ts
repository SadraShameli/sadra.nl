import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as metrics from '~/lib/prop-accounts/metrics';

const SRC_ROOT = path.resolve(import.meta.dirname, '../../../../../src');
const PLANNING_FILE = path.join(
    SRC_ROOT,
    'lib/prop-accounts/planning/NextSlotAllocation.ts',
);
const MODEL_FILE = path.join(
    SRC_ROOT,
    'app/(app)/prop-calculator/accounts/next-slot/nextSlotModel.ts',
);
const IMPORT_SPECIFIER = /\bfrom\s+['"]([^'"]+)['"]/gu;

function importedSpecifiers(file: string): readonly string[] {
    return readFileSync(file, 'utf8')
        .matchAll(IMPORT_SPECIFIER)
        .map((match) => match[1] ?? '')
        .toArray();
}

describe('the metrics barrel', () => {
    it('exports the verified-policy rule and the funded slot counter', () => {
        expect(typeof metrics.isFirmPolicyVerified).toBe('function');
        expect(typeof metrics.fundedSlotCountsOf).toBe('function');
    });
});

describe('the next-slot planning module imports', () => {
    it('reaches the metrics through the barrel and never through an internal metrics file', () => {
        const specifiers = importedSpecifiers(PLANNING_FILE);
        expect(specifiers).toContain('~/lib/prop-accounts/metrics');
        expect(
            specifiers.filter((specifier) =>
                specifier.startsWith('~/lib/prop-accounts/metrics/'),
            ),
        ).toEqual([]);
    });
});

describe('the Hard Rule 2 minimum cushion', () => {
    it('is converted to dollars once, in the planning module, and the model reads it from the allocation', () => {
        const model = readFileSync(MODEL_FILE, 'utf8');
        expect(model).not.toContain('HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS');
        expect(model).not.toMatch(/const HARD_RULE_2_MIN_CUSHION\b/u);
        expect(model).toContain('allocation.hardRule2MinCushion');
    });
});
