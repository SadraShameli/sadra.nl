import { type Dollars, type Fraction0to1 } from './lib/units';

export interface PayoutLadder {
    capsAtLastStep?: boolean;
    deniesIfUnaffordable?: boolean;
    minRequestAmount: Dollars;
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

    for (let index = 0; index < sorted.length; index++) {
        const tier = sorted[index];
        if (!tier) continue;
        const next = sorted[index + 1];
        const tierCap = next ? next.thresholdProfit : Infinity;
        const tierStart = tier.thresholdProfit;
        if (fundedProfit <= tierStart) break;

        const tierWidth = Math.min(fundedProfit, tierCap) - tierStart;
        if (tierWidth <= 0) continue;

        payout += tierWidth * tier.traderShare;
    }

    return payout;
}
