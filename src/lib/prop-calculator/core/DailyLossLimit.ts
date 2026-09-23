import {
    type ContractCount,
    type Dollars,
    dollars,
    fraction,
    type Fraction0to1,
} from './lib/units';
import {
    selectTier,
    TierBasis,
    tierBreakpoints,
    type TierProfitContext,
    tierProfitFor,
} from './TierBasis';

export enum DailyLossLimitBreachEffect {
    Lockout = 'lockout',
    Terminate = 'terminate',
}

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
          readonly tierBasis?: TierBasis;
          readonly tiers: readonly DllTier[];
      };

export interface DailyLossLimitContext extends TierProfitContext {
    readonly isThresholdLocked: boolean;
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

    abstract tierBreakpoints(basis: TierBasis): readonly number[];
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

    tierBreakpoints(basis: TierBasis): readonly number[] {
        return tierBreakpoints([
            ...this.beforeLock.tierBreakpoints(basis),
            ...this.afterLock.tierBreakpoints(basis),
        ]);
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

    tierBreakpoints(): readonly number[] {
        return [];
    }
}

class NoDailyLossLimit extends DailyLossLimit {
    describe(): DailyLossLimitDescriptor {
        return { kind: DailyLossLimitShape.None };
    }

    resolve(): null | number {
        return null;
    }

    tierBreakpoints(): readonly number[] {
        return [];
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

    tierBreakpoints(): readonly number[] {
        return [];
    }
}

class TieredDailyLossLimit extends DailyLossLimit {
    constructor(
        private readonly tiers: readonly DllTier[],
        private readonly tierBasis: TierBasis,
    ) {
        super();
        if (tiers.length === 0) {
            throw new Error('TieredDailyLossLimit: tiers must not be empty');
        }
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
        return (
            selectTier(
                this.tiers,
                tierProfitFor(this.tierBasis, context),
                (tier) => tier.minProfit,
            )?.dailyLossLimit ?? null
        );
    }

    tierBreakpoints(basis: TierBasis): readonly number[] {
        return basis === this.tierBasis
            ? tierBreakpoints(this.tiers.map((tier) => tier.minProfit))
            : [];
    }
}

export function dailyLossLimitTierBreakpoints(
    config: DailyLossLimitConfig,
    basis: TierBasis,
): readonly number[] {
    return dailyLossLimitFor(config).tierBreakpoints(basis);
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
                ...(config.tierBasis !== undefined && {
                    tierBasis: config.tierBasis,
                }),
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
            return new TieredDailyLossLimit(
                config.tiers,
                config.tierBasis ?? TierBasis.LiveProfit,
            );
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
