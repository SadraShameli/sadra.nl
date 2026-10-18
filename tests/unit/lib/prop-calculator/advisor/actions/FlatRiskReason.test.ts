import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator';
import {
    DifferenceReason,
    differenceReasonText,
} from '~/lib/prop-calculator/advisor';
import { flatRiskIgnoresStateReason } from '~/lib/prop-calculator/advisor/actions';

describe('flatRiskIgnoresStateReason (F-V15, QV-8, PT-74b step 5)', () => {
    it('returns null when the from-state optimum is within noise of the documented flat risk', () => {
        const reason = flatRiskIgnoresStateReason(dollars(250), {
            standardError: 500,
            value: 260,
        });
        expect(reason).toBeNull();
    });

    it('returns FlatRiskIgnoresState with typed fields when the gap is beyond noise', () => {
        const reason = flatRiskIgnoresStateReason(dollars(250), {
            standardError: 20,
            value: 900,
        });
        expect(reason).not.toBeNull();
        expect(reason?.kind).toBe(DifferenceReason.FlatRiskIgnoresState);
        if (reason?.kind !== DifferenceReason.FlatRiskIgnoresState) return;
        expect(reason.documentedFlatRisk).toBe(250);
        expect(reason.fromStateOptimum).toBe(900);
        expect(reason.gapInCombinedSEs).toBeGreaterThan(2);
    });

    it('returns null when the standard error is unknown (QV-8 keeps the headline)', () => {
        const reason = flatRiskIgnoresStateReason(dollars(250), {
            standardError: null,
            value: 900,
        });
        expect(reason).toBeNull();
    });

    it('reports a null gapInCombinedSEs, not Infinity, when both values are exact and still differ', () => {
        const reason = flatRiskIgnoresStateReason(dollars(250), {
            standardError: 0,
            value: 900,
        });
        expect(reason).not.toBeNull();
        expect(reason?.kind).toBe(DifferenceReason.FlatRiskIgnoresState);
        if (reason?.kind !== DifferenceReason.FlatRiskIgnoresState) return;
        expect(reason.gapInCombinedSEs).toBeNull();
        const text = differenceReasonText(reason);
        expect(text).not.toContain('Infinity');
        expect(text).toContain('250');
        expect(text).toContain('900');
    });
});
