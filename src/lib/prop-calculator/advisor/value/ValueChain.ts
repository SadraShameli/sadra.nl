import { type DocumentedPolicySpec } from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import {
    applyClosedTrade,
    type FundedCycleTracker,
    newFundedCycleTracker,
    newFundedCycleTrackerAfterReset,
    type Plan,
    recordBestDay,
    TradingPhase,
} from '~/lib/prop-calculator/core';

import { type FundedMilestone, MilestoneKind, milestoneState } from './MilestoneState';
import { valueAtState } from './ValueAtState';
import {
    type ValueNotModeledResult,
    type ValueOutcome,
    type ValueResult,
    ValueResultKind,
} from './ValueEstimate';

export enum ValueChainStepKind {
    EvalStart = 'eval-start',
    FirstPayoutEligible = 'first-payout-eligible',
    FreshFunded = 'fresh-funded',
    PostFirstPayout = 'post-first-payout',
}

export interface ValueChainResult {
    readonly accountValue: null | ValueOutcome;
    readonly steps: readonly ValueChainStep[];
}

export interface ValueChainStep {
    readonly kind: ValueChainStepKind;
    readonly value: ValueResult;
}

export function evalStartAccount(plan: Plan): ReconstructedFundedOrEvalAccount {
    const state = plan.initialState();
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

export function firstPayoutEligibleAccount(
    plan: Plan,
    freshFunded: ReconstructedFundedOrEvalAccount,
): ReconstructedFundedOrEvalAccount {
    const state = { ...freshFunded.state };
    applyClosedTrade(state, plan, TradingPhase.Funded, plan.minPayoutProfit);
    plan.drawdownFor(TradingPhase.Funded).onDayClose(state);
    plan.recordDayClosePeak(state);
    recordBestDay(state);
    return {
        ...freshFunded,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker(state),
        state,
    };
}

export function freshFundedAccount(plan: Plan): ReconstructedFundedOrEvalAccount {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker(state),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

export function fundedTrackerAfterMilestonePayout(
    account: ReconstructedFundedOrEvalAccount,
    milestone: FundedMilestone,
): FundedCycleTracker {
    const priorTracker = account.fundedTracker;
    if (priorTracker === null) {
        throw new Error(
            'value/ValueChain: a funded account needs its funded cycle tracker',
        );
    }
    const traderReceives = account.plan.payoutFromProfit(
        milestone.debited,
        priorTracker.payoutsIssued,
    );
    const consistency = account.plan.fundedConsistencyRule(
        priorTracker.payoutsIssued,
    );
    const tracker =
        priorTracker.fundedResetsUsed === 0
            ? newFundedCycleTracker(milestone.state)
            : newFundedCycleTrackerAfterReset(
                  milestone.state,
                  priorTracker.fundedResetsUsed,
              );
    tracker.payoutsIssued = priorTracker.payoutsIssued + 1;
    tracker.cumulativePayout = priorTracker.cumulativePayout + traderReceives;
    tracker.cycleBestDayProfit = consistency?.isPerpetual()
        ? priorTracker.cycleBestDayProfit
        : 0;
    return tracker;
}

export function postFirstPayoutAccount(
    firstPayoutEligible: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): ReconstructedFundedOrEvalAccount {
    const milestone = milestoneState(firstPayoutEligible, spec);
    if (milestone.kind !== MilestoneKind.Funded) {
        throw new Error(
            'postFirstPayoutAccount: expected a funded milestone at the first-payout-eligible state',
        );
    }
    return {
        ...firstPayoutEligible,
        fundedTracker: fundedTrackerAfterMilestonePayout(
            firstPayoutEligible,
            milestone,
        ),
        state: milestone.state,
    };
}

export function requireValue<
    TModeled extends { readonly kind: Exclude<ValueResultKind, ValueResultKind.NotModeled> },
>(outcome: TModeled | ValueNotModeledResult): TModeled {
    if (outcome.kind === ValueResultKind.NotModeled) {
        throw new Error(
            'value/ValueChain: expected a modeled outcome for an eval or funded account, got not-modeled',
        );
    }
    return outcome;
}

export function valueChain(
    plan: Plan,
    spec: DocumentedPolicySpec,
    account?: ReconstructedAccount,
): ValueChainResult {
    const freshFunded = freshFundedAccount(plan);
    const firstPayoutEligible = firstPayoutEligibleAccount(plan, freshFunded);
    const steps: ValueChainStep[] = [
        {
            kind: ValueChainStepKind.EvalStart,
            value: requireValue(valueAtState(evalStartAccount(plan), spec)),
        },
        {
            kind: ValueChainStepKind.FreshFunded,
            value: requireValue(valueAtState(freshFunded, spec)),
        },
        {
            kind: ValueChainStepKind.FirstPayoutEligible,
            value: requireValue(valueAtState(firstPayoutEligible, spec)),
        },
        {
            kind: ValueChainStepKind.PostFirstPayout,
            value: requireValue(
                valueAtState(
                    postFirstPayoutAccount(firstPayoutEligible, spec),
                    spec,
                ),
            ),
        },
    ];
    return {
        accountValue: account === undefined ? null : valueAtState(account, spec),
        steps,
    };
}
