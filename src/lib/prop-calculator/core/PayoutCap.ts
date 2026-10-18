import { type Dollars, type Fraction0to1 } from './lib/units';
import {
    assertPayoutCountSchedule,
    resolvePayoutCountEntry,
    sortByPayoutIndex,
} from './PayoutCountSchedule';

export enum PayoutCapScheduleKind {
    ByPayoutCount = 'by-payout-count',
    ByQualifyingDays = 'by-qualifying-days',
    Flat = 'flat',
}

export enum PayoutProfitPool {
    AccountProfit = 'account-profit',
    CycleProfit = 'cycle-profit',
}

export interface PayoutCapContext {
    cumulativeQualifyingDays: number;
    payoutsIssued: number;
}

export interface PayoutCapRegime {
    balanceShareCap: Fraction0to1 | null;
    requestCap: Dollars | null;
}

export type PayoutCapSchedule =
    | {
          readonly kind: PayoutCapScheduleKind.ByPayoutCount;
          readonly steps: readonly PayoutCapScheduleStep[];
      }
    | {
          readonly kind: PayoutCapScheduleKind.ByQualifyingDays;
          readonly steps: readonly PayoutCapScheduleStep[];
      }
    | {
          readonly kind: PayoutCapScheduleKind.Flat;
          readonly regime: PayoutCapRegime;
      };

export interface PayoutCapScheduleStep {
    readonly from: number;
    readonly regime: PayoutCapRegime;
}

export interface PayoutCapStrategy {
    describe(): PayoutCapSchedule;
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

const PAYOUT_COUNT_CAP_OWNER = 'PayoutCountTieredPayoutCap';

export class FlatPayoutCap implements PayoutCapStrategy {
    constructor(private readonly regime: PayoutCapRegime) {}

    describe(): PayoutCapSchedule {
        return { kind: PayoutCapScheduleKind.Flat, regime: this.regime };
    }

    resolve(_context: PayoutCapContext): PayoutCapRegime {
        return this.regime;
    }
}

export class PayoutCountTieredPayoutCap implements PayoutCapStrategy {
    constructor(readonly tiers: readonly PayoutCountCapTier[]) {
        assertPayoutCountSchedule(PAYOUT_COUNT_CAP_OWNER, tiers);
    }

    describe(): PayoutCapSchedule {
        return {
            kind: PayoutCapScheduleKind.ByPayoutCount,
            steps: sortByPayoutIndex(this.tiers).map((tier) => ({
                from: tier.fromPayoutIndex,
                regime: tier.regime,
            })),
        };
    }

    resolve(context: PayoutCapContext): PayoutCapRegime {
        return resolvePayoutCountEntry(
            PAYOUT_COUNT_CAP_OWNER,
            this.tiers,
            context.payoutsIssued,
        ).regime;
    }
}

export class QualifyingDaysMilestonePayoutCap implements PayoutCapStrategy {
    constructor(private readonly config: QualifyingDaysMilestoneCapConfig) {}

    private get firstQualifyingDayAfterMilestone(): number {
        return this.config.milestoneQualifyingDays;
    }

    describe(): PayoutCapSchedule {
        return {
            kind: PayoutCapScheduleKind.ByQualifyingDays,
            steps: [
                { from: 0, regime: this.config.beforeMilestone },
                {
                    from: this.firstQualifyingDayAfterMilestone,
                    regime: this.config.afterMilestone,
                },
            ],
        };
    }

    resolve(context: PayoutCapContext): PayoutCapRegime {
        return context.cumulativeQualifyingDays >=
            this.firstQualifyingDayAfterMilestone
            ? this.config.afterMilestone
            : this.config.beforeMilestone;
    }
}
