import { defaultPayoutRegimeCap } from './FundedStateValue';
import { type Dollars } from './lib/units';
import { PayoutCountTieredPayoutCap } from './PayoutCap';
import { type Plan } from './Plan';

export enum FundedDpPayoutCapGapKind {
    FundedResetNotModeled = 'funded-reset-not-modeled',
    LifetimeDollarCapIgnored = 'lifetime-dollar-cap-ignored',
    PayoutCountTierBeyondRegimeCap = 'payout-count-tier-beyond-regime-cap',
    PayoutTriggeredLockPreLockOffsetSaturates = 'payout-triggered-lock-pre-lock-offset-saturates',
}

export type FundedDpPayoutCapGap =
    | {
          readonly fee: Dollars;
          readonly kind: FundedDpPayoutCapGapKind.FundedResetNotModeled;
          readonly maxPerAccount: number;
      }
    | {
          readonly fromPayoutIndex: number;
          readonly kind: FundedDpPayoutCapGapKind.PayoutCountTierBeyondRegimeCap;
          readonly payoutRegimeCap: number;
      }
    | {
          readonly kind: FundedDpPayoutCapGapKind.LifetimeDollarCapIgnored;
          readonly maxLifetimePayoutDollars: Dollars;
      }
    | {
          readonly kind: FundedDpPayoutCapGapKind.PayoutTriggeredLockPreLockOffsetSaturates;
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
    if (plan.fundedDrawdown.lock?.atProfit === null) {
        gaps.push({
            kind: FundedDpPayoutCapGapKind.PayoutTriggeredLockPreLockOffsetSaturates,
        });
    }
    if (plan.takesFundedReset && plan.fundedReset !== null) {
        gaps.push({
            fee: plan.fundedReset.fee,
            kind: FundedDpPayoutCapGapKind.FundedResetNotModeled,
            maxPerAccount: plan.fundedReset.maxPerAccount,
        });
    }
    return gaps;
}
