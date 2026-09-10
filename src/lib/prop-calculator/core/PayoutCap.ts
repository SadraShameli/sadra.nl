import { type Dollars, type Fraction0to1 } from './units';

export interface PayoutCapContext {
    cumulativeQualifyingDays: number;
}

export interface PayoutCapRegime {
    balanceShareCap: Fraction0to1 | null;
    requestCap: Dollars | null;
}

export interface QualifyingDaysMilestoneCapConfig {
    afterMilestone: PayoutCapRegime;
    beforeMilestone: PayoutCapRegime;
    milestoneQualifyingDays: number;
}

export class QualifyingDaysMilestonePayoutCap {
    constructor(private readonly config: QualifyingDaysMilestoneCapConfig) {}

    resolve(context: PayoutCapContext): PayoutCapRegime {
        return context.cumulativeQualifyingDays >
            this.config.milestoneQualifyingDays
            ? this.config.afterMilestone
            : this.config.beforeMilestone;
    }
}
