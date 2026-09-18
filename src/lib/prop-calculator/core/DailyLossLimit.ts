import {
    type ContractCount,
    type Dollars,
    dollars,
    fraction,
    type Fraction0to1,
} from './lib/units';

export enum DailyLossLimitKind {
    AfterThresholdLock = 'after-threshold-lock',
    Flat = 'flat',
    None = 'none',
    PeakProfitShare = 'peak-profit-share',
    Tiered = 'tiered',
}

export enum DailyLossLimitShape {
    Fixed = 'fixed',
    None = 'none',
    Range = 'range',
    ShareOfPeak = 'share-of-peak',
    Staged = 'staged',
}

export type DailyLossLimitConfig =
    | {
          readonly afterLock: DailyLossLimitConfig;
          readonly beforeLock: DailyLossLimitConfig;
          readonly kind: DailyLossLimitKind.AfterThresholdLock;
      }
    | { readonly amount: Dollars; readonly kind: DailyLossLimitKind.Flat }
    | { readonly kind: DailyLossLimitKind.None }
    | {
          readonly kind: DailyLossLimitKind.PeakProfitShare;
          readonly share: Fraction0to1;
      }
    | {
          readonly kind: DailyLossLimitKind.Tiered;
          readonly tiers: readonly DllTier[];
      };

export interface DailyLossLimitContext {
    isThresholdLocked: boolean;
    peakDayCloseProfit: number;
    profit: number;
}

export type DailyLossLimitDescriptor =
    | {
          after: DailyLossLimitDescriptor;
          before: DailyLossLimitDescriptor;
          kind: DailyLossLimitShape.Staged;
      }
    | { amount: Dollars; kind: DailyLossLimitShape.Fixed }
    | { kind: DailyLossLimitShape.None }
    | { kind: DailyLossLimitShape.Range; max: Dollars; min: Dollars }
    | { kind: DailyLossLimitShape.ShareOfPeak; share: Fraction0to1 };

export interface DllTier {
    dailyLossLimit: Dollars;
    maxContracts: ContractCount;
    minProfit: number;
}

abstract class DailyLossLimit {
    abstract describe(): DailyLossLimitDescriptor;

    abstract resolve(context: DailyLossLimitContext): null | number;
}

class AfterThresholdLockDailyLossLimit extends DailyLossLimit {
    constructor(
        private readonly beforeLock: DailyLossLimit,
        private readonly afterLock: DailyLossLimit,
    ) {
        super();
    }

    describe(): DailyLossLimitDescriptor {
        return {
            after: this.afterLock.describe(),
            before: this.beforeLock.describe(),
            kind: DailyLossLimitShape.Staged,
        };
    }

    resolve(context: DailyLossLimitContext): null | number {
        const active = context.isThresholdLocked
            ? this.afterLock
            : this.beforeLock;
        return active.resolve(context);
    }
}

class FlatDailyLossLimit extends DailyLossLimit {
    constructor(private readonly amount: Dollars) {
        super();
    }

    describe(): DailyLossLimitDescriptor {
        return { amount: this.amount, kind: DailyLossLimitShape.Fixed };
    }

    resolve(): null | number {
        return this.amount;
    }
}

class NoDailyLossLimit extends DailyLossLimit {
    describe(): DailyLossLimitDescriptor {
        return { kind: DailyLossLimitShape.None };
    }

    resolve(): null | number {
        return null;
    }
}

class PeakProfitShareDailyLossLimit extends DailyLossLimit {
    constructor(private readonly share: Fraction0to1) {
        super();
    }

    describe(): DailyLossLimitDescriptor {
        return { kind: DailyLossLimitShape.ShareOfPeak, share: this.share };
    }

    resolve(context: DailyLossLimitContext): null | number {
        return this.share * context.peakDayCloseProfit;
    }
}

class TieredDailyLossLimit extends DailyLossLimit {
    constructor(private readonly tiers: readonly DllTier[]) {
        super();
        if (tiers.length === 0) {
            throw new Error('TieredDailyLossLimit: tiers must not be empty');
        }
    }

    private selectTier(profit: number): DllTier | undefined {
        let lowest: DllTier | undefined;
        let best: DllTier | undefined;
        for (const tier of this.tiers) {
            if (!lowest || tier.minProfit < lowest.minProfit) {
                lowest = tier;
            }
            if (
                profit >= tier.minProfit &&
                (!best || tier.minProfit > best.minProfit)
            ) {
                best = tier;
            }
        }
        return best ?? lowest;
    }

    describe(): DailyLossLimitDescriptor {
        const amounts = this.tiers.map((tier) => tier.dailyLossLimit);
        return {
            kind: DailyLossLimitShape.Range,
            max: dollars(Math.max(...amounts)),
            min: dollars(Math.min(...amounts)),
        };
    }

    resolve(context: DailyLossLimitContext): null | number {
        const selected = this.selectTier(context.profit);
        return selected ? selected.dailyLossLimit : null;
    }
}

export function describeDailyLossLimit(
    config: DailyLossLimitConfig,
): DailyLossLimitDescriptor {
    return dailyLossLimitFor(config).describe();
}

export function hasPeakShareDependency(
    descriptor: DailyLossLimitDescriptor,
): boolean {
    switch (descriptor.kind) {
        case DailyLossLimitShape.Fixed:
        case DailyLossLimitShape.None:
        case DailyLossLimitShape.Range: {
            return false;
        }
        case DailyLossLimitShape.ShareOfPeak: {
            return true;
        }
        case DailyLossLimitShape.Staged: {
            return (
                hasPeakShareDependency(descriptor.before) ||
                hasPeakShareDependency(descriptor.after)
            );
        }
    }
}

export function resolveDailyLossLimit(
    config: DailyLossLimitConfig,
    context: DailyLossLimitContext,
): null | number {
    return dailyLossLimitFor(config).resolve(context);
}

export function scaleDailyLossLimit(
    config: DailyLossLimitConfig,
    factor: Fraction0to1,
): DailyLossLimitConfig {
    switch (config.kind) {
        case DailyLossLimitKind.AfterThresholdLock: {
            return {
                afterLock: scaleDailyLossLimit(config.afterLock, factor),
                beforeLock: scaleDailyLossLimit(config.beforeLock, factor),
                kind: DailyLossLimitKind.AfterThresholdLock,
            };
        }
        case DailyLossLimitKind.Flat: {
            return {
                amount: dollars(config.amount * factor),
                kind: DailyLossLimitKind.Flat,
            };
        }
        case DailyLossLimitKind.None: {
            return config;
        }
        case DailyLossLimitKind.PeakProfitShare: {
            return {
                kind: DailyLossLimitKind.PeakProfitShare,
                share: fraction(config.share * factor),
            };
        }
        case DailyLossLimitKind.Tiered: {
            return {
                kind: DailyLossLimitKind.Tiered,
                tiers: config.tiers.map((tier) => ({
                    ...tier,
                    dailyLossLimit: dollars(tier.dailyLossLimit * factor),
                })),
            };
        }
    }
}

const resolverCache = new WeakMap<DailyLossLimitConfig, DailyLossLimit>();

function buildDailyLossLimit(config: DailyLossLimitConfig): DailyLossLimit {
    switch (config.kind) {
        case DailyLossLimitKind.AfterThresholdLock: {
            return new AfterThresholdLockDailyLossLimit(
                dailyLossLimitFor(config.beforeLock),
                dailyLossLimitFor(config.afterLock),
            );
        }
        case DailyLossLimitKind.Flat: {
            return new FlatDailyLossLimit(config.amount);
        }
        case DailyLossLimitKind.None: {
            return new NoDailyLossLimit();
        }
        case DailyLossLimitKind.PeakProfitShare: {
            return new PeakProfitShareDailyLossLimit(config.share);
        }
        case DailyLossLimitKind.Tiered: {
            return new TieredDailyLossLimit(config.tiers);
        }
    }
}

function dailyLossLimitFor(config: DailyLossLimitConfig): DailyLossLimit {
    const cached = resolverCache.get(config);
    if (cached) return cached;
    const resolver = buildDailyLossLimit(config);
    resolverCache.set(config, resolver);
    return resolver;
}
