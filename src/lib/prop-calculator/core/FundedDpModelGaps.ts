import { defaultPayoutRegimeCap } from './FundedStateValue';
import { type Dollars } from './lib/units';
import { PayoutCountTieredPayoutCap } from './PayoutCap';
import { type Plan } from './Plan';

export enum FundedDpModelGapKind {
    LifetimeDollarCapIgnored = 'lifetime-dollar-cap-ignored',
    PayoutCountTierBeyondRegimeCap = 'payout-count-tier-beyond-regime-cap',
    PayoutTriggeredLockPreLockOffsetSaturates = 'payout-triggered-lock-pre-lock-offset-saturates',
}

export type FundedDpModelGap =
    | {
          readonly fromPayoutIndex: number;
          readonly kind: FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap;
          readonly payoutRegimeCap: number;
      }
    | {
          readonly kind: FundedDpModelGapKind.LifetimeDollarCapIgnored;
          readonly maxLifetimePayoutDollars: Dollars;
      }
    | {
          readonly kind: FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates;
      };

export function fundedDpModelGaps(plan: Plan): FundedDpModelGap[] {
    const gaps: FundedDpModelGap[] = [];
    if (plan.maxLifetimePayoutDollars !== null) {
        gaps.push({
            kind: FundedDpModelGapKind.LifetimeDollarCapIgnored,
            maxLifetimePayoutDollars: plan.maxLifetimePayoutDollars,
        });
    }
    if (plan.payoutCapOverride instanceof PayoutCountTieredPayoutCap) {
        const payoutRegimeCap = defaultPayoutRegimeCap(plan);
        for (const tier of plan.payoutCapOverride.tiers) {
            if (tier.fromPayoutIndex > payoutRegimeCap) {
                gaps.push({
                    fromPayoutIndex: tier.fromPayoutIndex,
                    kind: FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap,
                    payoutRegimeCap,
                });
            }
        }
    }
    if (plan.fundedDrawdown.lock?.atProfit === null) {
        gaps.push({
            kind: FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates,
        });
    }
    return gaps;
}
