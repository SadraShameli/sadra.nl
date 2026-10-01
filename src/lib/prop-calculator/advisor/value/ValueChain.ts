import {
    type DocumentedPolicySpec,
    resolveDocumentedRetainedCushion,
} from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import {
    type FundedCycleTracker,
    newFundedCycleTracker,
    newFundedCycleTrackerAfterReset,
    ONE_CENT,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';

import {
    accountAfterClosedSession,
    type FundedMilestone,
    MilestoneKind,
    milestoneState,
} from './MilestoneState';
import { valueAtState } from './ValueAtState';
import {
    type ValueNotModeledResult,
    type ValueOutcome,
    type ValueResult,
    ValueResultKind,
    withCashAdded,
} from './ValueEstimate';

const MAX_ELIGIBILITY_PROFIT_MULTIPLE = 2;

const ONE_DOLLAR = 1;

export enum ValueChainStepKind {
    EvalStart = 'eval-start',
    FirstPayoutEligible = 'first-payout-eligible',
    FreshFunded = 'fresh-funded',
    PostFirstPayout = 'post-first-payout',
}

export interface RequestNowValue {
    readonly continuation: ValueResult;
    readonly requestNow: ValueResult;
    readonly traderReceives: number;
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
    spec: DocumentedPolicySpec,
): ReconstructedFundedOrEvalAccount {
    const accountFor = (profit: number) =>
        accountAfterClosedSession(freshFunded, profit);
    const isEligible = (profit: number) =>
        retainedCushionShortfallOf(accountFor(profit), spec) <= 0;
    let low: number = plan.minPayoutProfit;
    if (isEligible(low)) return accountFor(low);
    const ceiling = plan.accountSize * MAX_ELIGIBILITY_PROFIT_MULTIPLE;
    let high = Math.max(low * 2, ONE_DOLLAR);
    while (!isEligible(high)) {
        if (high >= ceiling) {
            throw new Error(
                `value/ValueChain: no first-payout-eligible account of ${plan.accountSize} dollars keeps the retained cushion after the documented request, even at a profit of ${ceiling}`,
            );
        }
        low = high;
        high = Math.min(high * 2, ceiling);
    }
    while (high - low > ONE_CENT) {
        const middle = (low + high) / 2;
        if (isEligible(middle)) high = middle;
        else low = middle;
    }
    return accountFor(high);
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
    tracker.cumulativePayout =
        priorTracker.cumulativePayout + milestone.traderReceives;
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

export function requestNowValue(
    account: ReconstructedFundedOrEvalAccount,
    milestone: FundedMilestone,
    spec: DocumentedPolicySpec,
): RequestNowValue {
    const continuation = requireValue(
        valueAtState(
            {
                ...account,
                cushion: milestone.state.balance - milestone.state.threshold,
                fundedTracker: fundedTrackerAfterMilestonePayout(
                    account,
                    milestone,
                ),
                state: milestone.state,
            },
            spec,
        ),
    );
    return {
        continuation,
        requestNow: withCashAdded(continuation, milestone.traderReceives),
        traderReceives: milestone.traderReceives,
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
    const firstPayoutEligible = firstPayoutEligibleAccount(
        plan,
        freshFunded,
        spec,
    );
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

function retainedCushionShortfallOf(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): number {
    const milestone = milestoneState(account, spec);
    if (milestone.kind !== MilestoneKind.Funded) {
        throw new Error(
            'value/ValueChain: expected a funded milestone for a funded account',
        );
    }
    const required = Math.max(
        resolveDocumentedRetainedCushion(spec.enginePolicy, spec.rulebook.payout),
        ONE_CENT,
    );
    return required - (milestone.state.balance - milestone.state.threshold);
}
