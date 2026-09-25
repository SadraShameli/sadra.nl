import { type AccountState } from './AccountState';
import { BUCKET_EPSILON } from './constants';
import { type PeakTierBasis, TierBasis } from './TierBasis';

export class PeakRatchet {
    readonly radix: number;

    constructor(
        private readonly breakpoints: readonly number[],
        readonly basis: PeakTierBasis = TierBasis.PeakSessionCloseProfit,
    ) {
        this.radix = breakpoints.length + 1;
    }

    private committedPeakOf(state: AccountState): number {
        switch (this.basis) {
            case TierBasis.PeakIntradayProfit: {
                return state.peakIntradayProfit;
            }
            case TierBasis.PeakSessionCloseProfit: {
                return state.peakDayCloseProfit;
            }
        }
    }

    get isIntraday(): boolean {
        return this.basis === TierBasis.PeakIntradayProfit;
    }

    bandOf(peakProfit: number): number {
        let band = 0;
        for (const breakpoint of this.breakpoints) {
            if (breakpoint <= peakProfit + BUCKET_EPSILON) band++;
        }
        return band;
    }

    committedBandOf(state: AccountState): number {
        return this.bandOf(this.committedPeakOf(state));
    }

    peakAt(band: number): number {
        return band === 0 ? 0 : (this.breakpoints[band - 1] ?? 0);
    }

    raise(band: number, reachedProfit: number): number {
        return Math.max(band, this.bandOf(reachedProfit));
    }

    reachBandOf(state: AccountState): number {
        const committedBand = this.committedBandOf(state);
        return this.isIntraday
            ? this.raise(committedBand, state.intradayHighProfit)
            : committedBand;
    }
}
