import { describe, expect, it } from 'vitest';

import { fraction } from '~/lib/prop-calculator/core';
import { bankrollLossRiskSummary } from '~/lib/prop-calculator/economics';

describe('bankrollLossRiskSummary (PT-62d)', () => {
    it('does not report NaN attempts when the attempt cost is zero', () => {
        const summary = bankrollLossRiskSummary([100, 100, 100], 0, fraction(0.5));
        expect(summary.minimumBudget.value).not.toBeNull();
        if (summary.minimumBudget.value === null) throw new Error('unreachable');
        expect(Number.isNaN(summary.minimumBudget.value.attempts)).toBe(false);
        expect(summary.minimumBudget.value.attempts).toBe(0);
        expect(summary.minimumBudget.value.budget).toBe(0);
    });
});
