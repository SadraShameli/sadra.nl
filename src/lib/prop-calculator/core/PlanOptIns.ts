import { withOneTimeEarlyWithdrawalTaken } from './FundedPayoutCycle';
import { withFundedResetTaken } from './FundedReset';
import { type Plan } from './Plan';

export interface PlanOptIns {
    readonly takesFundedReset: boolean;
    readonly takesOneTimeEarlyWithdrawal: boolean;
}

export const NO_PLAN_OPT_INS: PlanOptIns = {
    takesFundedReset: false,
    takesOneTimeEarlyWithdrawal: false,
};

export function withPlanOptIns(plan: Plan, optIns: PlanOptIns): Plan {
    return withFundedResetTaken(
        withOneTimeEarlyWithdrawalTaken(
            plan,
            optIns.takesOneTimeEarlyWithdrawal,
        ),
        optIns.takesFundedReset,
    );
}
