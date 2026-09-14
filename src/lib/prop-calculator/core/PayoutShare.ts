import { type PayoutTier } from './PayoutTiers';

export interface DaysSinceFundedShareTier {
    fromDay: number;
    tiers: readonly PayoutTier[];
}

export interface PayoutShareContext {
    daysSinceFunded: number;
}

export interface PayoutShareStrategy {
    resolve(context: PayoutShareContext): readonly PayoutTier[];
}

export class DaysSinceFundedTieredPayoutShare implements PayoutShareStrategy {
    constructor(private readonly tiers: readonly DaysSinceFundedShareTier[]) {
        if (tiers.length === 0) {
            throw new Error(
                'DaysSinceFundedTieredPayoutShare: tiers must not be empty',
            );
        }
        const sorted = tiers.toSorted((a, b) => a.fromDay - b.fromDay);
        if (sorted[0]?.fromDay !== 0) {
            throw new Error(
                'DaysSinceFundedTieredPayoutShare: the first tier must start at fromDay 0',
            );
        }
        const seen = new Set<number>();
        for (const tier of sorted) {
            if (seen.has(tier.fromDay)) {
                throw new Error(
                    `DaysSinceFundedTieredPayoutShare: duplicate fromDay ${tier.fromDay}`,
                );
            }
            seen.add(tier.fromDay);
            if (tier.tiers.length === 0) {
                throw new Error(
                    `DaysSinceFundedTieredPayoutShare: tiers for fromDay ${tier.fromDay} must not be empty`,
                );
            }
        }
    }

    resolve(context: PayoutShareContext): readonly PayoutTier[] {
        let lowest: DaysSinceFundedShareTier | undefined;
        let best: DaysSinceFundedShareTier | undefined;
        for (const tier of this.tiers) {
            if (lowest === undefined || tier.fromDay < lowest.fromDay) {
                lowest = tier;
            }
            if (
                tier.fromDay <= context.daysSinceFunded &&
                (best === undefined || tier.fromDay > best.fromDay)
            ) {
                best = tier;
            }
        }
        const resolved = best ?? lowest;
        if (resolved === undefined) {
            throw new Error(
                'DaysSinceFundedTieredPayoutShare: no tiers configured',
            );
        }
        return resolved.tiers;
    }
}
