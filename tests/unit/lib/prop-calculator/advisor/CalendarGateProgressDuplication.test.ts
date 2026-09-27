import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

const DAY_GATE_TERNARY = /\(plan\.minDaysAfterPassForPayoutPerCycle \?\?/g;

function occurrencesIn(relativePath: string): number {
    const text = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
    return (text.match(DAY_GATE_TERNARY) ?? []).length;
}

describe('calendar gate day-gate count duplication (PT-46c)', () => {
    it('CalendarGateProgress delegates to requiredDayGateDays instead of its own ternary', () => {
        expect(
            occurrencesIn('src/lib/prop-calculator/advisor/CalendarGateProgress.ts'),
        ).toBe(0);
    });

    it('computes the day-gate required-days count in exactly one place across both files', () => {
        const total =
            occurrencesIn('src/lib/prop-calculator/core/FundedPayoutCycle.ts') +
            occurrencesIn('src/lib/prop-calculator/advisor/CalendarGateProgress.ts');
        expect(total).toBe(1);
    });
});
