import { describe, expect, it } from 'vitest';

import {
    createInitialState,
    PeakRatchet,
    TierBasis,
} from '~/lib/prop-calculator/core';

describe('PeakRatchet', () => {
    const ratchet = new PeakRatchet([300, 1500, 3000]);

    it('has one band below the first breakpoint plus one per breakpoint', () => {
        expect(ratchet.radix).toBe(4);
        expect(new PeakRatchet([]).radix).toBe(1);
    });

    it.each([
        [0, 0],
        [299.99, 0],
        [300, 1],
        [300 - 1e-10, 1],
        [300.01, 1],
        [1499.99, 1],
        [1500, 2],
        [2999.99, 2],
        [3000, 3],
        [50_000, 3],
        [-500, 0],
    ])('puts a peak session close of %s in band %s', (peak, band) => {
        expect(ratchet.bandOf(peak)).toBe(band);
    });

    it('maps band 0 to a peak of 0 and every other band to its breakpoint', () => {
        expect([0, 1, 2, 3].map((band) => ratchet.peakAt(band))).toStrictEqual([
            0, 300, 1500, 3000,
        ]);
    });

    it('round-trips every band through peakAt and bandOf', () => {
        for (let band = 0; band < ratchet.radix; band++) {
            expect(ratchet.bandOf(ratchet.peakAt(band))).toBe(band);
        }
    });

    it('keeps every band empty with no breakpoints', () => {
        const flat = new PeakRatchet([]);
        expect(flat.bandOf(10_000)).toBe(0);
        expect(flat.peakAt(0)).toBe(0);
    });

    it('ratchets on the peak session close by default', () => {
        const state = createInitialState(50_000, 48_000);
        state.peakDayCloseProfit = 1600;
        state.peakIntradayProfit = 3100;

        expect(ratchet.basis).toBe(TierBasis.PeakSessionCloseProfit);
        expect(ratchet.isIntraday).toBe(false);
        expect(ratchet.committedBandOf(state)).toBe(2);
    });

    it('ratchets on the committed intraday peak, not the running intraday high, for PeakIntradayProfit', () => {
        const intraday = new PeakRatchet(
            [300, 1500, 3000],
            TierBasis.PeakIntradayProfit,
        );
        const state = createInitialState(50_000, 48_000);
        state.peakDayCloseProfit = 200;
        state.peakIntradayProfit = 1600;
        state.intradayHighProfit = 3100;

        expect(intraday.isIntraday).toBe(true);
        expect(intraday.committedBandOf(state)).toBe(2);
        expect(intraday.reachBandOf(state)).toBe(3);
    });

    it('never lowers a band when the reached profit falls below it', () => {
        expect(ratchet.raise(2, 0)).toBe(2);
        expect(ratchet.raise(2, 1600)).toBe(2);
        expect(ratchet.raise(1, 1600)).toBe(2);
        expect(ratchet.raise(0, 50_000)).toBe(3);
    });

    it('keeps the reach band at the committed band when the running high lags it', () => {
        const intraday = new PeakRatchet([300], TierBasis.PeakIntradayProfit);
        const state = createInitialState(50_000, 48_000);
        state.peakIntradayProfit = 400;
        state.intradayHighProfit = 100;

        expect(intraday.reachBandOf(state)).toBe(1);
    });

    it('fails loud when an intraday ratchet reads a state that never tracked the intraday peak', () => {
        const intraday = new PeakRatchet([300], TierBasis.PeakIntradayProfit);
        const untracked = createInitialState(50_000, 48_000);
        delete untracked.intradayHighProfit;
        delete untracked.peakIntradayProfit;

        expect(() => intraday.committedBandOf(untracked)).toThrow(
            /PeakIntradayProfit/,
        );
        expect(() => intraday.reachBandOf(untracked)).toThrow(
            /PeakIntradayProfit/,
        );
        expect(ratchet.committedBandOf(untracked)).toBe(0);
        expect(ratchet.reachBandOf(untracked)).toBe(0);
    });
});
