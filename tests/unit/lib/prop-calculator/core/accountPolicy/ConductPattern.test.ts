import { describe, expect, it } from 'vitest';

import {
    ConductCategory,
    type ConductPattern,
    isAggressiveSizingConcern,
    isRebuyConcern,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator/core';

const SOURCE = {
    fetchedOn: '2026-09-26',
    quote: 'Inconsistent position sizing is prohibited.',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.invalid/conduct',
    verification: PolicyVerification.Confirmed as const,
};

function patternOf(category: ConductCategory): ConductPattern {
    return { category, consequence: 'account termination', source: SOURCE };
}

describe('ConductPattern predicates', () => {
    it('isAggressiveSizingConcern covers max-size, inconsistent, news and microscalping patterns only', () => {
        expect(
            isAggressiveSizingConcern(patternOf(ConductCategory.MaxSizeMostTrades)),
        ).toBe(true);
        expect(
            isAggressiveSizingConcern(
                patternOf(ConductCategory.InconsistentSizing),
            ),
        ).toBe(true);
        expect(
            isAggressiveSizingConcern(patternOf(ConductCategory.NewsSizing)),
        ).toBe(true);
        expect(
            isAggressiveSizingConcern(patternOf(ConductCategory.Microscalping)),
        ).toBe(true);
        expect(
            isAggressiveSizingConcern(patternOf(ConductCategory.RapidRebuys)),
        ).toBe(false);
    });

    it('isRebuyConcern covers rapid rebuys, excessive purchases, rolling and scaling circumvention only', () => {
        expect(isRebuyConcern(patternOf(ConductCategory.RapidRebuys))).toBe(
            true,
        );
        expect(
            isRebuyConcern(patternOf(ConductCategory.ExcessivePurchases)),
        ).toBe(true);
        expect(isRebuyConcern(patternOf(ConductCategory.AccountRolling))).toBe(
            true,
        );
        expect(
            isRebuyConcern(patternOf(ConductCategory.ScalingCircumvention)),
        ).toBe(true);
        expect(
            isRebuyConcern(patternOf(ConductCategory.MaxSizeMostTrades)),
        ).toBe(false);
    });
});
