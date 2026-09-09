import { type Dollars, type Fraction0to1 } from './units';

export interface PayoutLadder {
    capsAtLastStep?: boolean;
    minRequestAmount: number;
    steps: readonly number[];
}

export interface PayoutTier {
    thresholdProfit: Dollars;
    traderShare: Fraction0to1;
}

export function walkPayoutTiers(
    tiers: readonly PayoutTier[],
    fundedProfit: number,
): number {
    if (fundedProfit <= 0) return 0;

    const sorted = tiers.toSorted(
        (a, b) => a.thresholdProfit - b.thresholdProfit,
    );

    let payout = 0;
    let remaining = fundedProfit;

    for (let index = 0; index < sorted.length; index++) {
        const tier = sorted[index];
        if (!tier) continue;
        const next = sorted[index + 1];
        const tierCap = next ? next.thresholdProfit : Infinity;
        const tierStart = tier.thresholdProfit;
        if (fundedProfit <= tierStart) break;

        const tierWidth = Math.min(remaining, tierCap - tierStart);
        if (tierWidth <= 0) continue;

        payout += tierWidth * tier.traderShare;
        remaining -= tierWidth;
        if (remaining <= 0) break;
    }

    return payout;
}
