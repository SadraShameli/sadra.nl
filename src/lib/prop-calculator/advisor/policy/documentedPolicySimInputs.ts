import {
    fundedStopRuleToDayStopRule,
    type PayoutParameters,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor/Rulebook';
import { SizingStage } from '~/lib/prop-calculator/advisor/SizingStage';
import {
    CENTS_PER_DOLLAR,
    computedDayPolicy,
    type DayPolicy,
    DayStopRuleKind,
    effectivePayoutRequest,
    flatDayPolicy,
    PayoutRequestPolicy,
    type Plan,
    policySizingOf,
    RungSizing,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    SIM_INPUTS_REFUSAL_PREFIX,
    type SimInputs,
    simInputsSizingIssue,
} from '~/lib/prop-calculator/simulator';

import { documentedDayRisk } from './DocumentedDayRisk';
import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
} from './DocumentedPolicySpec';
import { type EnginePolicy } from './EnginePolicy';

export interface DocumentedDayPolicies {
    evalDayPolicy: DayPolicy;
    fundedDayPolicy: DayPolicy;
}

export function buildDocumentedDayPolicies(
    plan: Plan,
    rulebook: RulebookParameters,
    enginePolicy: EnginePolicy,
): DocumentedDayPolicies {
    const { funded, strategy } = rulebook;
    const fundedRisk = funded.riskCents / CENTS_PER_DOLLAR;
    return {
        evalDayPolicy: computedDayPolicy(
            documentedDayRisk(plan, SizingStage.Eval, rulebook, enginePolicy),
            strategy.tradesPerDayMax,
            { kind: DayStopRuleKind.None },
            policySizingOf(TradingPhase.Eval),
        ),
        fundedDayPolicy: flatDayPolicy(
            fundedRisk,
            funded.tradesPerDayMax,
            fundedStopRuleToDayStopRule(funded.stopRule),
            policySizingOf(TradingPhase.Funded),
        ),
    };
}

export function resolveDocumentedPayoutRequestSize(
    plan: Plan,
    enginePolicy: EnginePolicy,
    payout: PayoutParameters,
): number {
    return effectivePayoutRequest(
        plan,
        enginePolicy.payoutRequestOverride ??
            payout.requestCents / CENTS_PER_DOLLAR,
    );
}

export function resolveDocumentedPlan(
    plan: Plan,
    enginePolicy: EnginePolicy,
): Plan {
    const lifetimeCap = enginePolicy.lifetimePayoutCapOverride;
    return lifetimeCap === null
        ? plan
        : plan.withMaxLifetimePayouts(lifetimeCap);
}

export function resolveDocumentedRetainedCushion(
    enginePolicy: EnginePolicy,
    payout: PayoutParameters,
): number {
    return (
        enginePolicy.retainedCushionRequest ??
        payout.retainedCushionCents / CENTS_PER_DOLLAR
    );
}

export function toSimInputs(plan: Plan, spec: DocumentedPolicySpec): SimInputs {
    const { enginePolicy, planSerial, rulebook, run } =
        documentedPolicySpecSchema.parse(spec);
    const serial = serializePlanId(plan.id);
    if (planSerial !== undefined && planSerial !== serial) {
        throw new Error(
            `the documented policy spec is for plan ${planSerial}, but it was applied to ${serial}`,
        );
    }
    const { funded, payout, strategy } = rulebook;
    const fundedRisk = funded.riskCents / CENTS_PER_DOLLAR;
    const { instrument, stopPoints } = enginePolicy;
    const issue = simInputsSizingIssue({
        instrument,
        riskPerTrade: fundedRisk,
        stopPoints,
    });
    if (issue !== null) throw new Error(`${SIM_INPUTS_REFUSAL_PREFIX}${issue}`);
    const simulatedPlan = resolveDocumentedPlan(plan, enginePolicy);
    const { evalDayPolicy, fundedDayPolicy } = buildDocumentedDayPolicies(
        simulatedPlan,
        rulebook,
        enginePolicy,
    );
    return {
        commissionPerRoundTrip: enginePolicy.commissionPerRoundTrip,
        evalDayPolicy,
        fundedDayPolicy,
        fundedHorizonDays: enginePolicy.fundedHorizonDays,
        fundedRrRatio: funded.takeProfitCents / funded.riskCents,
        instrument,
        intradayPathStepsPerR: enginePolicy.intradayPathStepsPerR,
        maxAttempts: run.maxAttempts,
        maxEvalDays: run.maxEvalDays,
        minRetainedCushion: resolveDocumentedRetainedCushion(
            enginePolicy,
            payout,
        ),
        payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
        payoutRequestSize: resolveDocumentedPayoutRequestSize(
            simulatedPlan,
            enginePolicy,
            payout,
        ),
        plan: simulatedPlan,
        rebuyLagDays: enginePolicy.rebuyLagDays,
        riskPerTrade: fundedRisk,
        rrRatio: strategy.rr,
        rungSizing: RungSizing.CapToCushion,
        seed: run.seed,
        stopPoints,
        tradesPerDay: funded.tradesPerDayMax,
        trials: run.trials,
        winrate: strategy.winrate,
    };
}
