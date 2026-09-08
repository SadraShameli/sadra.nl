export type DailyLossLimitConfig =
    | { amount: number; kind: 'flat' }
    | { kind: 'none' }
    | { kind: 'tiered'; tiers: readonly DllTier[] };

export interface DllTier {
    dailyLossLimit: number;
    maxContracts: number;
    minProfit: number;
}

export function resolveDailyLossLimit(
    config: DailyLossLimitConfig,
    profitInCycle: number,
): null | number {
    switch (config.kind) {
        case 'flat': {
            return config.amount;
        }
        case 'none': {
            return null;
        }
        case 'tiered': {
            let lowest: DllTier | undefined;
            let best: DllTier | undefined;
            for (const tier of config.tiers) {
                if (!lowest || tier.minProfit < lowest.minProfit) {
                    lowest = tier;
                }
                if (
                    profitInCycle >= tier.minProfit &&
                    (!best || tier.minProfit > best.minProfit)
                ) {
                    best = tier;
                }
            }
            const selected = best ?? lowest;
            return selected ? selected.dailyLossLimit : null;
        }
    }
}
