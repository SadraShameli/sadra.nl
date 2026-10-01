import { fundedCycleSeedFromTracker } from '~/lib/prop-calculator/advisor/FundedFromStateSweep';
import {
    LiveApplicabilityKind,
    LiveNotModeledReason,
    livePlanApplicability,
} from '~/lib/prop-calculator/advisor/LivePlanApplicability';
import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
    resolveDocumentedPayoutRequestSize,
    resolveDocumentedPlan,
    resolveDocumentedRetainedCushion,
} from '~/lib/prop-calculator/advisor/policy';
import {
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    type ReconstructedLiveAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor/ReconstructedAccount';
import {
    type AccountState,
    applyClosedTrade,
    closeTradingDay,
    dollars,
    type FundedCycleTracker,
    type LiveAccountState,
    postPayoutThreshold,
    recordBestDay,
    resetForNewDay,
    restoreFundedCycleTracker,
    TradingPhase,
} from '~/lib/prop-calculator/core';

import { ValueResultKind } from './ValueEstimate';

export enum EvalMilestoneGap {
    ConsistencyNotMet = 'consistency-not-met',
    MinTradingDaysNotMet = 'min-trading-days-not-met',
}

export enum MilestoneKind {
    Eval = 'eval',
    Funded = 'funded',
    Live = 'live',
}

export interface ClosedSession {
    readonly account: ReconstructedFundedOrEvalAccount;
    readonly isBusted: boolean;
    readonly isDayEnded: boolean;
}

export interface EvalMilestone {
    readonly kind: MilestoneKind.Eval;
    readonly state: AccountState;
    readonly unmetGates: readonly EvalMilestoneGap[];
}

export interface FundedMilestone {
    readonly debited: number;
    readonly kind: MilestoneKind.Funded;
    readonly state: AccountState;
    readonly traderReceives: number;
}

export interface LiveMilestone {
    readonly debited: number;
    readonly kind: MilestoneKind.Live;
    readonly state: LiveAccountState;
}

export interface MilestoneNotModeled {
    readonly kind: ValueResultKind.NotModeled;
    readonly reason: LiveNotModeledReason;
}

export type MilestoneOutcome = MilestoneNotModeled | MilestoneStateResult;

export type MilestoneStateResult =
    | EvalMilestone
    | FundedMilestone
    | LiveMilestone;

export function accountAfterClosedSession(
    account: ReconstructedFundedOrEvalAccount,
    pnl: number,
): ReconstructedFundedOrEvalAccount {
    return closedSessionOf(account, [pnl]).account;
}

export function closedSessionOf(
    account: ReconstructedFundedOrEvalAccount,
    pnls: readonly number[],
): ClosedSession {
    const { plan } = account;
    const state: AccountState = { ...account.state };
    let isBusted = false;
    let isDayEnded = false;
    for (const pnl of pnls) {
        applyClosedTrade(state, plan, account.kind, pnl);
        if (plan.isBust(state, account.kind)) {
            isBusted = true;
            isDayEnded = true;
            break;
        }
        if (plan.isDayLockedOut(state, account.kind)) {
            isDayEnded = true;
            break;
        }
    }
    closeTradingDay(plan, account.kind, state, true);
    isBusted ||= plan.isBust(state, account.kind);
    const fundedTracker =
        account.kind === TradingPhase.Eval
            ? account.fundedTracker
            : trackerAfterClosedSession(account, state);
    if (account.kind === TradingPhase.Eval) recordBestDay(state);
    resetForNewDay(state);
    return {
        account: {
            ...account,
            cushion: state.balance - state.threshold,
            fundedTracker,
            state,
        },
        isBusted,
        isDayEnded: isDayEnded || isBusted,
    };
}

export function milestoneState(
    account: ReconstructedAccount,
    spec: DocumentedPolicySpec,
): MilestoneOutcome {
    const validatedSpec = documentedPolicySpecSchema.parse(spec);
    if (account.kind === ReconstructedLiveKind.Live) {
        return liveMilestone(account, validatedSpec);
    }
    return account.kind === TradingPhase.Eval
        ? evalMilestone(account, validatedSpec)
        : fundedMilestone(account, validatedSpec);
}

function evalMilestone(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): EvalMilestone {
    const plan = resolveDocumentedPlan(account.plan, spec.enginePolicy);
    const targetProfit = plan.profitTarget;
    const currentProfit = plan.accountProfit(account.state);
    const pnl = Math.max(0, targetProfit - currentProfit);
    const { state } = accountAfterClosedSession({ ...account, plan }, pnl);

    const unmetGates: EvalMilestoneGap[] = [];
    if (state.tradingDays < plan.minTradingDays) {
        unmetGates.push(EvalMilestoneGap.MinTradingDaysNotMet);
    }
    const consistency = plan.evalConsistencyRule();
    if (
        consistency?.isViolated(state.bestDayProfit, plan.accountProfit(state))
    ) {
        unmetGates.push(EvalMilestoneGap.ConsistencyNotMet);
    }
    return { kind: MilestoneKind.Eval, state, unmetGates };
}

function fundedMilestone(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): FundedMilestone {
    const plan = resolveDocumentedPlan(account.plan, spec.enginePolicy);
    if (account.fundedTracker === null) {
        throw new Error(
            'value/MilestoneState: a funded account needs its funded cycle tracker',
        );
    }
    const debited = resolveDocumentedPayoutRequestSize(
        plan,
        spec.enginePolicy,
        spec.rulebook.payout,
    );
    const balanceAfter = account.state.balance - debited;
    const state: AccountState = {
        ...account.state,
        balance: balanceAfter,
        threshold: postPayoutThreshold(
            plan.fundedDrawdown,
            { ...account.state, balance: balanceAfter },
            plan.payoutFloorEffect,
            plan.accountSize,
        ),
    };
    return {
        debited,
        kind: MilestoneKind.Funded,
        state,
        traderReceives: plan.payoutFromProfit(
            debited,
            account.fundedTracker.payoutsIssued,
        ),
    };
}

function liveMilestone(
    account: ReconstructedLiveAccount,
    spec: DocumentedPolicySpec,
): MilestoneOutcome {
    const applicability = livePlanApplicability(account.plan.id);
    if (applicability.kind === LiveApplicabilityKind.NotModeled) {
        return {
            kind: ValueResultKind.NotModeled,
            reason: applicability.reason,
        };
    }
    if (account.livePlan === null || account.state === null) {
        return {
            kind: ValueResultKind.NotModeled,
            reason: LiveNotModeledReason.LiveTermsUnpublished,
        };
    }
    const livePlan = account.livePlan;
    const retainedCushion = dollars(
        resolveDocumentedRetainedCushion(spec.enginePolicy, spec.rulebook.payout),
    );
    const debited = livePlan.payoutRequestAmount(
        account.state,
        retainedCushion,
        undefined,
    );
    const state: LiveAccountState = { ...account.state };
    if (debited > 0) livePlan.withdraw(state, debited);
    return { debited: Math.max(0, debited), kind: MilestoneKind.Live, state };
}

function trackerAfterClosedSession(
    account: ReconstructedFundedOrEvalAccount,
    state: AccountState,
): FundedCycleTracker {
    const prior = account.fundedTracker;
    if (prior === null) {
        throw new Error(
            'value/MilestoneState: a funded account needs its funded cycle tracker',
        );
    }
    const tracker = restoreFundedCycleTracker(
        { ...state },
        fundedCycleSeedFromTracker(account.plan, account.state, prior),
    );
    tracker.cycleBestDayProfit = Math.max(
        tracker.cycleBestDayProfit,
        state.todayPnL,
    );
    tracker.recordSessionClose(state);
    return tracker;
}
