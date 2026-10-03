import { type AccountState } from '~/lib/prop-calculator/core/AccountState';
import {
    evalStartStateIssue,
    subscriptionElapsedDaysIssue,
} from '~/lib/prop-calculator/core/EvalStartState';
import {
    type FundedCycleSeed,
    restoreFundedCycleTracker,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import {
    minimumPayoutRequest,
    PayoutRequestPolicy,
} from '~/lib/prop-calculator/core/PayoutRequestPolicy';
import { type Plan } from '~/lib/prop-calculator/core/Plan';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';

import { SIM_INPUTS_REFUSAL_PREFIX } from './dayPolicyValidation';
import { type SimStart } from './types';

export function assertPayoutRequestPolicy(
    plan: Plan,
    policy: PayoutRequestPolicy | undefined,
    payoutRequestSize: number | undefined,
): void {
    const issue = payoutRequestPolicyIssue(plan, policy, payoutRequestSize);
    if (issue !== null) {
        throw new Error(`${SIM_INPUTS_REFUSAL_PREFIX}${issue}`);
    }
}

export function payoutRequestPolicyIssue(
    plan: Plan,
    policy: PayoutRequestPolicy | undefined,
    payoutRequestSize: number | undefined,
): null | string {
    if (policy !== PayoutRequestPolicy.FullRequestOnly) return null;
    if (payoutRequestSize === undefined) {
        return 'payoutRequestPolicy is FullRequestOnly, but payoutRequestSize is undefined';
    }
    const minimum = minimumPayoutRequest(plan);
    return payoutRequestSize < minimum
        ? `payoutRequestPolicy is FullRequestOnly with payoutRequestSize ${payoutRequestSize}, below ${plan.label}'s minimum payout request of ${minimum}`
        : null;
}

export function simStartIssue(
    plan: Plan,
    start: SimStart,
    maxEvalDays: number,
    copyAccounts = 1,
): null | string {
    if (copyAccounts > 1) {
        return `copyAccounts is ${copyAccounts}, but a from-state run values one account: run it once per account`;
    }
    switch (start.phase) {
        case TradingPhase.Eval: {
            if (plan.isInstantFunded) {
                return `${plan.label} is instant-funded: an eval start state does not apply`;
            }
            const inactivityIssue = inactivityClosedIssue(
                plan,
                start.state,
                TradingPhase.Eval,
            );
            return (
                inactivityIssue ??
                evalStartStateIssue(plan, start.state, maxEvalDays) ??
                subscriptionElapsedDaysIssue(
                    start.state,
                    start.subscriptionElapsedDays ??
                        start.state.elapsedDays ??
                        0,
                )
            );
        }
        case TradingPhase.Funded: {
            return fundedSimStartIssue(plan, start.state, start.seed);
        }
    }
}

function fundedSimStartIssue(
    plan: Plan,
    state: AccountState,
    seed: FundedCycleSeed,
): null | string {
    if (plan.isBust(state, TradingPhase.Funded)) {
        return 'the funded account is already busted';
    }
    const inactivityIssue = inactivityClosedIssue(
        plan,
        state,
        TradingPhase.Funded,
    );
    if (inactivityIssue !== null) return inactivityIssue;
    try {
        restoreFundedCycleTracker({ ...state }, seed);
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    if (
        Number.isFinite(seed.payoutsIssued) &&
        Number.isFinite(seed.cumulativePayout) &&
        plan.isAccountConcluded(seed.payoutsIssued, seed.cumulativePayout)
    ) {
        return 'the funded account has already concluded';
    }
    if (seed.fundedResetsUsed > 0 && plan.fundedReset === null) {
        return `fundedResetsUsed is ${seed.fundedResetsUsed}, but ${plan.label} has no funded reset`;
    }
    const maxPerAccount = plan.fundedReset?.maxPerAccount ?? 0;
    if (seed.fundedResetsUsed > maxPerAccount) {
        return `fundedResetsUsed (${seed.fundedResetsUsed}) is above ${plan.label}'s funded reset maximum of ${maxPerAccount}`;
    }
    return seed.fundedResetsUsed > 0 && seed.payoutsIssued > 0
        ? 'a funded cycle seed cannot combine payoutsIssued > 0 with fundedResetsUsed > 0: a reset restarts the payout count'
        : null;
}

function inactivityClosedIssue(
    plan: Plan,
    state: AccountState,
    phase: TradingPhase,
): null | string {
    const limit = plan.maxConsecutiveIdleDaysFor(phase);
    return limit !== null && state.consecutiveIdleDays >= limit
        ? `consecutiveIdleDays (${state.consecutiveIdleDays}) is at or beyond ${plan.label}'s inactivity limit of ${limit} for the ${phase} phase: the account is already closed for inactivity`
        : null;
}
