import { type ContractCount, type Dollars } from './units';

export enum DailyLossLimitKind {
    Flat = 'flat',
    None = 'none',
    Tiered = 'tiered',
}

export type DailyLossLimitConfig =
    | { amount: Dollars; kind: DailyLossLimitKind.Flat }
    | { kind: DailyLossLimitKind.None }
    | { kind: DailyLossLimitKind.Tiered; tiers: readonly DllTier[] };

export interface DllTier {
    dailyLossLimit: Dollars;
    maxContracts: ContractCount;
    minProfit: number;
}

abstract class DailyLossLimit {
    abstract resolve(profitInCycle: number): null | number;
}

class FlatDailyLossLimit extends DailyLossLimit {
    constructor(private readonly amount: Dollars) {
        super();
    }

    resolve(): null | number {
        return this.amount;
    }
}

class NoDailyLossLimit extends DailyLossLimit {
    resolve(): null | number {
        return null;
    }
}

class TieredDailyLossLimit extends DailyLossLimit {
    constructor(private readonly tiers: readonly DllTier[]) {
        super();
    }

    resolve(profitInCycle: number): null | number {
        let lowest: DllTier | undefined;
        let best: DllTier | undefined;
        for (const tier of this.tiers) {
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

export function resolveDailyLossLimit(
    config: DailyLossLimitConfig,
    profitInCycle: number,
): null | number {
    return dailyLossLimitFor(config).resolve(profitInCycle);
}

function dailyLossLimitFor(config: DailyLossLimitConfig): DailyLossLimit {
    switch (config.kind) {
        case DailyLossLimitKind.Flat: {
            return new FlatDailyLossLimit(config.amount);
        }
        case DailyLossLimitKind.None: {
            return new NoDailyLossLimit();
        }
        case DailyLossLimitKind.Tiered: {
            return new TieredDailyLossLimit(config.tiers);
        }
    }
}
