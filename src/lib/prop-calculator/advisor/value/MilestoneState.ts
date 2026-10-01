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
    dollars,
    type LiveAccountState,
    postPayoutThreshold,
    recordBestDay,
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

export interface EvalMilestone {
    readonly kind: MilestoneKind.Eval;
    readonly state: AccountState;
    readonly unmetGates: readonly EvalMilestoneGap[];
}

export interface FundedMilestone {
    readonly debited: number;
    readonly kind: MilestoneKind.Funded;
    readonly state: AccountState;
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
    const state: AccountState = { ...account.state };
    applyClosedTrade(state, plan, TradingPhase.Eval, pnl);
    plan.drawdownFor(TradingPhase.Eval).onDayClose(state);
    plan.recordDayClosePeak(state);
    recordBestDay(state);

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
    return { debited, kind: MilestoneKind.Funded, state };
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
