import { describe, expect, it } from 'vitest';

import {
    annualisedRoiOnCost,
    ROI_BASIS_LABEL,
    RoiBasis,
    totalRoiOnCost,
} from '~/lib/prop-calculator/core';

describe('totalRoiOnCost', () => {
    it('divides net by cost and tags the total basis', () => {
        expect(totalRoiOnCost(500, 250)).toStrictEqual({
            basis: RoiBasis.TotalOnCost,
            value: 2,
        });
        expect(totalRoiOnCost(500, 100).value).toBe(5);
    });

    it('keeps the sign of a negative net', () => {
        expect(totalRoiOnCost(-50, 100).value).toBe(-0.5);
        expect(totalRoiOnCost(-100, 400).value).toBe(-0.25);
    });

    it('returns exactly 0 for a zero net on a positive cost', () => {
        expect(totalRoiOnCost(0, 400).value).toBe(0);
    });

    it.each([500, -50, 0])(
        'reports no ratio (null) at zero cost for net %d, never 0 or NaN',
        (net) => {
            const roi = totalRoiOnCost(net, 0);
            expect(roi.basis).toBe(RoiBasis.TotalOnCost);
            expect(roi.value).toBeNull();
        },
    );

    it('reports no ratio (null) for a negative cost', () => {
        expect(totalRoiOnCost(100, -1).value).toBeNull();
    });
});

describe('annualisedRoiOnCost', () => {
    it('annualises monthly net by exactly 12 and tags the annualised basis', () => {
        expect(annualisedRoiOnCost(100, 600)).toStrictEqual({
            basis: RoiBasis.AnnualisedOnCost,
            value: 2,
        });
        expect(annualisedRoiOnCost(100, 1200).value).toBe(1);
    });

    it('keeps the sign of a negative monthly net', () => {
        expect(annualisedRoiOnCost(-50, 300).value).toBe(-2);
    });

    it('reports no ratio (null) at zero cost', () => {
        const roi = annualisedRoiOnCost(100, 0);
        expect(roi.basis).toBe(RoiBasis.AnnualisedOnCost);
        expect(roi.value).toBeNull();
    });
});

function byName(a: string, b: string): number {
    return a.localeCompare(b);
}

describe('ROI_BASIS_LABEL', () => {
    it('has exactly one label per RoiBasis member', () => {
        expect(Object.keys(ROI_BASIS_LABEL).toSorted(byName)).toStrictEqual(
            Object.values(RoiBasis).toSorted(byName),
        );
    });
});
