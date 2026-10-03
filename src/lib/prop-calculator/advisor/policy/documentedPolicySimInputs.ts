import {
    cumulativePayoutTriggerAssumption,
    type CumulativePayoutTriggerAssumption,
    type CumulativePayoutTriggerInputs,
} from '~/lib/prop-calculator/advisor/Assumption';
import { documentedPayoutRequest } from '~/lib/prop-calculator/advisor/DocumentedPayoutRequest';
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
    dollars,
    type Dollars,
    type FirmAccountPolicy,
    type FirmId,
    flatDayPolicy,
    fraction,
    type Fraction0to1,
    PayoutRequestPolicy,
    type Plan,
    policySizingOf,
    RungSizing,
    serializePlanId,
    tightestVerifiedCumulativeTrigger,
    TradingPhase,
    type VerifiedCumulativeTrigger,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
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
import { type EnginePolicy, hasDayLimits } from './EnginePolicy';

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
    const fundedStopRule = fundedStopRuleToDayStopRule(funded.stopRule);
    return {
        evalDayPolicy: computedDayPolicy(
            documentedDayRisk(plan, SizingStage.Eval, rulebook, enginePolicy),
            strategy.tradesPerDayMax,
            { kind: DayStopRuleKind.None },
            policySizingOf(TradingPhase.Eval),
        ),
        fundedDayPolicy: hasDayLimits(enginePolicy)
            ? computedDayPolicy(
                  documentedDayRisk(
                      plan,
                      SizingStage.Funded,
                      rulebook,
                      enginePolicy,
                  ),
                  funded.tradesPerDayMax,
                  fundedStopRule,
                  policySizingOf(TradingPhase.Funded),
              )
            : flatDayPolicy(
                  documentedFundedRisk(rulebook, enginePolicy),
                  documentedFundedTrades(rulebook, enginePolicy),
                  fundedStopRule,
                  policySizingOf(TradingPhase.Funded),
              ),
    };
}

export function cappedFundedRisk(
    rulebook: RulebookParameters,
    maxRiskPerTrade: null | number,
): number {
    return cappedRisk(
        rulebook.funded.riskCents / CENTS_PER_DOLLAR,
        maxRiskPerTrade === null ? null : dollars(maxRiskPerTrade),
    );
}

export function cappedRisk(risk: number, cap: Dollars | null): number {
    return cap === null ? risk : Math.min(risk, cap);
}

export function documentedFundedRisk(
    rulebook: RulebookParameters,
    enginePolicy: EnginePolicy,
): number {
    return cappedFundedRisk(
        rulebook,
        enginePolicy.personalCaps?.maxRiskPerTrade ?? null,
    );
}

export function documentedFundedTakeProfit(
    rulebook: RulebookParameters,
    enginePolicy: EnginePolicy,
): number {
    const { funded } = rulebook;
    const riskCents =
        documentedFundedRisk(rulebook, enginePolicy) * CENTS_PER_DOLLAR;
    return (
        Math.round((riskCents * funded.takeProfitCents) / funded.riskCents) /
        CENTS_PER_DOLLAR
    );
}

export function documentedFundedTrades(
    rulebook: RulebookParameters,
    enginePolicy: EnginePolicy,
): number {
    const maxTrades = enginePolicy.personalCaps?.maxTradesPerDay ?? null;
    return maxTrades === null
        ? rulebook.funded.tradesPerDayMax
        : Math.min(rulebook.funded.tradesPerDayMax, maxTrades);
}

export function documentedLiveTransferHazard(
    rulebook: RulebookParameters,
    firm: FirmId,
): Fraction0to1 | undefined {
    const hazard = rulebook.liveTransfer.hazardPerPaidPayoutByFirm[firm];
    return hazard === undefined ? undefined : fraction(hazard);
}

export function documentedSizedFundedRisk(
    rulebook: RulebookParameters,
    enginePolicy: EnginePolicy,
): number {
    const fundedRisk = documentedFundedRisk(rulebook, enginePolicy);
    const { instrument, stopPoints } = enginePolicy;
    const issue = simInputsSizingIssue({
        instrument,
        riskPerTrade: fundedRisk,
        stopPoints,
    });
    if (issue !== null) throw new Error(`${SIM_INPUTS_REFUSAL_PREFIX}${issue}`);
    return fundedRisk;
}

export function pricedCumulativeTriggerAssumptionOf(
    inputs: CumulativePayoutTriggerInputs & {
        readonly verifiedCumulativePayoutTrigger?: number | undefined;
    },
): CumulativePayoutTriggerAssumption | undefined {
    const { plan, verifiedCumulativePayoutTrigger } = inputs;
    if (verifiedCumulativePayoutTrigger === undefined) return undefined;
    const trigger = verifiedCumulativeTriggerOf(
        findFirm(plan.id.firm)?.accountPolicy,
        plan,
    );
    return trigger?.amount === verifiedCumulativePayoutTrigger
        ? cumulativePayoutTriggerAssumption(trigger, inputs)
        : undefined;
}

export function resolveDocumentedPayoutRequestSize(
    plan: Plan,
    enginePolicy: EnginePolicy,
    payout: PayoutParameters,
): number {
    return documentedPayoutRequest(
        plan,
        enginePolicy.payoutRequestOverride,
        payout,
    ).effective;
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
    const fundedRisk = documentedSizedFundedRisk(rulebook, enginePolicy);
    const { instrument, stopPoints } = enginePolicy;
    const simulatedPlan = resolveDocumentedPlan(plan, enginePolicy);
    const liveTransferHazard = documentedLiveTransferHazard(
        rulebook,
        simulatedPlan.id.firm,
    );
    const verifiedCumulativePayoutTrigger = verifiedCumulativeTriggerOf(
        findFirm(simulatedPlan.id.firm)?.accountPolicy,
        simulatedPlan,
    )?.amount;
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
        ...(liveTransferHazard !== undefined && { liveTransferHazard }),
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
        ...(verifiedCumulativePayoutTrigger !== undefined && {
            verifiedCumulativePayoutTrigger,
        }),
        winrate: strategy.winrate,
    };
}

export function verifiedCumulativeTriggerOf(
    accountPolicy: FirmAccountPolicy | undefined,
    plan: Plan,
): null | VerifiedCumulativeTrigger {
    return tightestVerifiedCumulativeTrigger(
        accountPolicy?.liveTriggersFor(plan) ?? [],
    );
}
