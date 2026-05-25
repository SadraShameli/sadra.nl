export interface PayoutTier {
    thresholdProfit: number;
    traderShare: number;
}

export function walkPayoutTiers(
    tiers: readonly PayoutTier[],
    fundedProfit: number,
): number {
    if (fundedProfit <= 0) return 0;

    let payout = 0;
    let remaining = fundedProfit;

    for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        if (!tier) continue;
        const next = tiers[i + 1];
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
