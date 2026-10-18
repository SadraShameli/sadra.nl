import { describe, expect, it } from 'vitest';

import { SizingConstraint } from '~/lib/prop-calculator/advisor/DocumentedSizing';

describe('SizingConstraint.CeilingCap (F-154, PT-19 step 0)', () => {
    it('declares a constraint tag for a sourced ceiling cap (RuleContext.profitCeiling), distinct from every existing tag', () => {
        expect(SizingConstraint.CeilingCap).toBe('ceiling-cap');
        expect(new Set(Object.values(SizingConstraint)).size).toBe(
            Object.values(SizingConstraint).length,
        );
    });
});
