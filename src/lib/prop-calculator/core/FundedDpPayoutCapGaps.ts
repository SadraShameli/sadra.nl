import { defaultPayoutRegimeCap } from './FundedStateValue';
import { type Dollars } from './lib/units';
import { PayoutCountTieredPayoutCap } from './PayoutCap';
import { type Plan } from './Plan';

export enum FundedDpPayoutCapGapKind {
    LifetimeDollarCapIgnored = 'lifetime-dollar-cap-ignored',
    PayoutCountTierBeyondRegimeCap = 'payout-count-tier-beyond-regime-cap',
}

export type FundedDpPayoutCapGap =
    | {
          readonly fromPayoutIndex: number;
          readonly kind: FundedDpPayoutCapGapKind.PayoutCountTierBeyondRegimeCap;
          readonly payoutRegimeCap: number;
      }
    | {
          readonly kind: FundedDpPayoutCapGapKind.LifetimeDollarCapIgnored;
          readonly maxLifetimePayoutDollars: Dollars;
      };

export function fundedDpPayoutCapGaps(plan: Plan): FundedDpPayoutCapGap[] {
    const gaps: FundedDpPayoutCapGap[] = [];
    if (plan.maxLifetimePayoutDollars !== null) {
        gaps.push({
            kind: FundedDpPayoutCapGapKind.LifetimeDollarCapIgnored,
            maxLifetimePayoutDollars: plan.maxLifetimePayoutDollars,
        });
    }
    if (plan.payoutCapOverride instanceof PayoutCountTieredPayoutCap) {
        const payoutRegimeCap = defaultPayoutRegimeCap(plan);
        for (const tier of plan.payoutCapOverride.tiers) {
            if (tier.fromPayoutIndex > payoutRegimeCap) {
                gaps.push({
                    fromPayoutIndex: tier.fromPayoutIndex,
                    kind: FundedDpPayoutCapGapKind.PayoutCountTierBeyondRegimeCap,
                    payoutRegimeCap,
                });
            }
        }
    }
    return gaps;
}
