import { type Dollars, type Fraction0to1 } from './lib/units';

export interface PayoutCapContext {
    cumulativeQualifyingDays: number;
    payoutsIssued: number;
}

export interface PayoutCapRegime {
    balanceShareCap: Fraction0to1 | null;
    requestCap: Dollars | null;
}

export interface PayoutCapStrategy {
    resolve(context: PayoutCapContext): PayoutCapRegime;
}

export interface PayoutCountCapTier {
    fromPayoutIndex: number;
    regime: PayoutCapRegime;
}

export interface QualifyingDaysMilestoneCapConfig {
    afterMilestone: PayoutCapRegime;
    beforeMilestone: PayoutCapRegime;
    milestoneQualifyingDays: number;
}

export class PayoutCountTieredPayoutCap implements PayoutCapStrategy {
    constructor(private readonly tiers: readonly PayoutCountCapTier[]) {
        if (tiers.length === 0) {
            throw new Error(
                'PayoutCountTieredPayoutCap: tiers must not be empty',
            );
        }
        const sorted = tiers.toSorted(
            (a, b) => a.fromPayoutIndex - b.fromPayoutIndex,
        );
        if (sorted[0]?.fromPayoutIndex !== 0) {
            throw new Error(
                'PayoutCountTieredPayoutCap: the first tier must start at fromPayoutIndex 0',
            );
        }
        const seen = new Set<number>();
        for (const tier of sorted) {
            if (seen.has(tier.fromPayoutIndex)) {
                throw new Error(
                    `PayoutCountTieredPayoutCap: duplicate fromPayoutIndex ${tier.fromPayoutIndex}`,
                );
            }
            seen.add(tier.fromPayoutIndex);
        }
    }

    resolve(context: PayoutCapContext): PayoutCapRegime {
        let lowest: PayoutCountCapTier | undefined;
        let best: PayoutCountCapTier | undefined;
        for (const tier of this.tiers) {
            if (
                lowest === undefined ||
                tier.fromPayoutIndex < lowest.fromPayoutIndex
            ) {
                lowest = tier;
            }
            if (
                tier.fromPayoutIndex <= context.payoutsIssued &&
                (best === undefined ||
                    tier.fromPayoutIndex > best.fromPayoutIndex)
            ) {
                best = tier;
            }
        }
        const resolved = best ?? lowest;
        if (resolved === undefined) {
            throw new Error('PayoutCountTieredPayoutCap: no tiers configured');
        }
        return resolved.regime;
    }
}

export class QualifyingDaysMilestonePayoutCap implements PayoutCapStrategy {
    constructor(private readonly config: QualifyingDaysMilestoneCapConfig) {}

    resolve(context: PayoutCapContext): PayoutCapRegime {
        return context.cumulativeQualifyingDays >
            this.config.milestoneQualifyingDays
            ? this.config.afterMilestone
            : this.config.beforeMilestone;
    }
}
