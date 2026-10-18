import { type Dollars, fraction, type Fraction0to1 } from './lib/units';
import {
    assertPayoutCountSchedule,
    resolvePayoutCountEntry,
    sortByPayoutIndex,
} from './PayoutCountSchedule';

const PAYOUT_COUNT_SPLIT_OWNER = 'PayoutCountTieredPayoutSplit';

export interface PayoutCountSplitTier {
    readonly fromPayoutIndex: number;
    readonly tiers: readonly PayoutTier[];
}

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

export class PayoutCountTieredPayoutSplit {
    readonly schedule: readonly PayoutCountSplitTier[];

    constructor(schedule: readonly PayoutCountSplitTier[]) {
        assertPayoutCountSchedule(PAYOUT_COUNT_SPLIT_OWNER, schedule);
        this.schedule = sortByPayoutIndex(schedule);
    }

    get stationaryFromPayoutIndex(): number {
        return this.schedule.at(-1)?.fromPayoutIndex ?? 0;
    }

    tiersFor(payoutIndex: number): readonly PayoutTier[] {
        return resolvePayoutCountEntry(
            PAYOUT_COUNT_SPLIT_OWNER,
            this.schedule,
            payoutIndex,
        ).tiers;
    }
}

export function scalePayoutTiers(
    tiers: readonly PayoutTier[],
    factor: number,
): PayoutTier[] {
    return tiers.map((tier) => ({
        ...tier,
        traderShare: fraction(tier.traderShare * factor),
    }));
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
