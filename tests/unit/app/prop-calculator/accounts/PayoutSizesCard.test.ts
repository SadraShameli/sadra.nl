import { describe, expect, it } from 'vitest';

import { payoutHistogramValues } from '~/app/(app)/prop-calculator/accounts/_components/overview/PayoutSizesCard';
import { histogram } from '~/lib/prop-calculator/stats';

describe('payoutHistogramValues', () => {
    it('reconstructs a values array whose re-binned boundaries match the original bins exactly', () => {
        const originalValues = [12_000, 34_000, 34_500, 61_000, 88_000, 91_000];
        const binCount = 4;
        const bins = histogram(originalValues, binCount);
        const reconstructed = payoutHistogramValues(bins);
        expect(histogram(reconstructed, binCount)).toEqual(bins);
    });

    it('keeps a single populated bin exact', () => {
        const bins = histogram([50_000], 1);
        const reconstructed = payoutHistogramValues(bins);
        expect(histogram(reconstructed, 1)).toEqual(bins);
    });

    it('keeps a single bin covering several values exact', () => {
        const bins = histogram([50_000, 50_100, 50_400], 1);
        const reconstructed = payoutHistogramValues(bins);
        expect(histogram(reconstructed, 1)).toEqual(bins);
    });

    it('returns an empty array for no bins', () => {
        expect(payoutHistogramValues([])).toEqual([]);
    });
});
