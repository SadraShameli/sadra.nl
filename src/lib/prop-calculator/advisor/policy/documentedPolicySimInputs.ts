import {
    CENTS_PER_DOLLAR,
    computedDayPolicy,
    DayStopRuleKind,
    flatDayPolicy,
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

import { fundedStopRuleToDayStopRule } from '../Rulebook';
import { SizingStage } from '../SizingStage';
import { documentedDayRisk } from './DocumentedDayRisk';
import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
} from './DocumentedPolicySpec';

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
    const lifetimeCap = enginePolicy.lifetimePayoutCapOverride;
    const simulatedPlan =
        lifetimeCap === null ? plan : plan.withMaxLifetimePayouts(lifetimeCap);
    return {
        commissionPerRoundTrip: enginePolicy.commissionPerRoundTrip,
        evalDayPolicy: computedDayPolicy(
            documentedDayRisk(
                simulatedPlan,
                SizingStage.Eval,
                rulebook,
                enginePolicy,
            ),
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
        fundedHorizonDays: enginePolicy.fundedHorizonDays,
        fundedRrRatio: funded.takeProfitCents / funded.riskCents,
        instrument,
        intradayPathStepsPerR: enginePolicy.intradayPathStepsPerR,
        maxAttempts: run.maxAttempts,
        maxEvalDays: run.maxEvalDays,
        minRetainedCushion:
            enginePolicy.retainedCushionRequest ??
            payout.retainedCushionCents / CENTS_PER_DOLLAR,
        payoutRequestSize:
            enginePolicy.payoutRequestOverride ??
            payout.requestCents / CENTS_PER_DOLLAR,
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
