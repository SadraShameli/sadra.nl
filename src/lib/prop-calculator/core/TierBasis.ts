export enum TierBasis {
    LiveProfit = 'live-profit',
    PeakIntradayProfit = 'peak-intraday-profit',
    PeakSessionCloseProfit = 'peak-session-close-profit',
    SessionOpenProfit = 'session-open-profit',
}

export type PeakTierBasis =
    TierBasis.PeakIntradayProfit | TierBasis.PeakSessionCloseProfit;

export interface TierProfitContext {
    readonly peakDayCloseProfit: number;
    readonly peakIntradayProfit?: number;
    readonly profit: number;
    readonly sessionOpenProfit: number;
}

export function selectTier<T>(
    tiers: readonly T[],
    profit: number,
    minProfitOf: (tier: T) => number,
): T | undefined {
    let lowest: T | undefined;
    let best: T | undefined;
    for (const tier of tiers) {
        const minProfit = minProfitOf(tier);
        if (lowest === undefined || minProfit < minProfitOf(lowest)) {
            lowest = tier;
        }
        if (
            profit >= minProfit &&
            (best === undefined || minProfit > minProfitOf(best))
        ) {
            best = tier;
        }
    }
    return best ?? lowest;
}

export function tierBreakpoints(values: readonly number[]): readonly number[] {
    return [...new Set(values)].toSorted((a, b) => a - b);
}

export function tierProfitFor(
    basis: TierBasis,
    context: TierProfitContext,
): number {
    switch (basis) {
        case TierBasis.LiveProfit: {
            return context.profit;
        }
        case TierBasis.PeakIntradayProfit: {
            if (context.peakIntradayProfit === undefined) {
                throw new Error(
                    'TierBasis.PeakIntradayProfit needs the committed intraday peak, and this tier profit context does not track it',
                );
            }
            return Math.max(
                context.peakIntradayProfit,
                context.peakDayCloseProfit,
                context.sessionOpenProfit,
            );
        }
        case TierBasis.PeakSessionCloseProfit: {
            return Math.max(
                context.peakDayCloseProfit,
                context.sessionOpenProfit,
            );
        }
        case TierBasis.SessionOpenProfit: {
            return context.sessionOpenProfit;
        }
    }
}
