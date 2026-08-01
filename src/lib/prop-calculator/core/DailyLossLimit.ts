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
            const first = config.tiers[0];
            if (!first) return null;

            let selected = first;
            for (const tier of config.tiers) {
                if (profitInCycle >= tier.minProfit) selected = tier;
            }
            return selected.dailyLossLimit;
        }
    }
}
