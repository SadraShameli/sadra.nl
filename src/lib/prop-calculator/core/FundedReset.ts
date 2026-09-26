import { type CouponDiscounts, resetFactor } from './FeeSchedule';
import { type Dollars } from './lib/units';
import { type Plan } from './Plan';

export enum FundedResetEligibility {
    NoPayoutEverRequested = 'no-payout-ever-requested',
}

export interface FundedResetContext {
    readonly closedForInactivity: boolean;
    readonly payoutsIssued: number;
    readonly resetsUsed: number;
}

export interface FundedResetPolicy {
    readonly eligibility: FundedResetEligibility;
    readonly fee: Dollars;
    readonly label: string;
    readonly maxPerAccount: number;
    readonly windowCalendarDays: number;
}

interface EligibilityRule {
    readonly allows: (context: FundedResetContext) => boolean;
    readonly description: string;
}

const ELIGIBILITY_RULES: Readonly<
    Record<FundedResetEligibility, EligibilityRule>
> = {
    [FundedResetEligibility.NoPayoutEverRequested]: {
        allows: (context) => context.payoutsIssued === 0,
        description: 'only while the account never requested a payout',
    },
};

export function canTakeFundedReset(
    plan: Plan,
    context: FundedResetContext,
): boolean {
    const policy = plan.fundedReset;
    return (
        policy !== null &&
        plan.takesFundedReset &&
        !context.closedForInactivity &&
        context.resetsUsed < policy.maxPerAccount &&
        ELIGIBILITY_RULES[policy.eligibility].allows(context)
    );
}

export const FUNDED_RESET_MECHANICS =
    'When taken, every breach that allows it (not an inactivity closure) is reset the same day to the starting balance, drawdown and trading days, and the fee counts toward net, total cost and cost per funded account. A reset account that then survives counts as surviving; funded bust counts only a breach that could not be reset.';

const FUNDED_RESET_DP_MODEL =
    "a breach before the first payout is worth the next reset layer's start value less the discounted reset fee, and an inactivity closure is never reset. Its day policy picks the layer from the resets already used, so the empirical run takes the same decisions the DP valued.";

export function describeFundedReset(policy: FundedResetPolicy): string {
    return `${describeFundedResetTerms(policy)}. ${FUNDED_RESET_MECHANICS}`;
}

export function describeFundedResetTerms(policy: FundedResetPolicy): string {
    return `${policy.label}: $${policy.fee.toLocaleString('en-US')} each, up to ${policy.maxPerAccount} per account, ${ELIGIBILITY_RULES[policy.eligibility].description}, within ${policy.windowCalendarDays} calendar days of a breach`;
}

export function fundedResetDpModelSentence(leadIn: string): string {
    if (leadIn.trim() === '') {
        throw new Error(
            `fundedResetDpModelSentence needs a non-empty lead-in, got ${JSON.stringify(leadIn)}`,
        );
    }
    if (leadIn.trimEnd().endsWith(':')) {
        throw new Error(
            `fundedResetDpModelSentence adds the colon itself, so the lead-in must not end in one, got ${JSON.stringify(leadIn)}`,
        );
    }
    return `${leadIn}: ${FUNDED_RESET_DP_MODEL}`;
}

export function fundedResetFee(
    policy: FundedResetPolicy,
    discounts: CouponDiscounts | undefined,
): number {
    return policy.fee * resetFactor(discounts);
}

export function fundedResetsBeforeFirstPayout(plan: Plan): number {
    let resetCount = 0;
    while (
        canTakeFundedReset(plan, {
            closedForInactivity: false,
            payoutsIssued: 0,
            resetsUsed: resetCount,
        })
    ) {
        resetCount++;
    }
    return resetCount;
}

export function withFundedResetTaken(plan: Plan, isTaken: boolean): Plan {
    return isTaken && plan.fundedReset !== null
        ? plan.withOverrides({ takesFundedReset: true })
        : plan;
}
