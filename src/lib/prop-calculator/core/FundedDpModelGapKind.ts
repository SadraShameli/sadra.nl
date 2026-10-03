import { type Dollars } from './lib/units';

export enum FundedDpModelGapKind {
    CalendarWeekInactivityIgnored = 'calendar-week-inactivity-ignored',
    FundedGridSaturationHigh = 'funded-grid-saturation-high',
    LifetimeDollarCapIgnored = 'lifetime-dollar-cap-ignored',
    PayoutCountTierBeyondRegimeCap = 'payout-count-tier-beyond-regime-cap',
    PayoutFloorReleaseUnvalidated = 'payout-floor-release-unvalidated',
    PayoutTriggeredLockPreLockOffsetSaturates = 'payout-triggered-lock-pre-lock-offset-saturates',
}

export type FundedDpModelGap =
    | {
          readonly fromPayoutIndex: number;
          readonly kind: FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap;
          readonly payoutRegimeCap: number;
      }
    | {
          readonly kind: FundedDpModelGapKind.CalendarWeekInactivityIgnored;
          readonly message: string;
      }
    | {
          readonly kind: FundedDpModelGapKind.FundedGridSaturationHigh;
          readonly shareAtOrAboveTop: number;
      }
    | {
          readonly kind: FundedDpModelGapKind.LifetimeDollarCapIgnored;
          readonly maxLifetimePayoutDollars: Dollars;
      }
    | {
          readonly kind: FundedDpModelGapKind.PayoutFloorReleaseUnvalidated;
      }
    | {
          readonly kind: FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates;
      };
