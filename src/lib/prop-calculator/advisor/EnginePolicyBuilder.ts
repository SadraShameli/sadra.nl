import {
    ceilToWholeCents,
    type DayPolicy,
    DayStopRuleKind,
    type Dollars,
    DrawdownKind,
    effectivePayoutRequest,
    type FirmAccountPolicy,
    type InstrumentSymbol,
    LifetimePayoutCapOverrideKind,
    PayoutRequestPolicy,
    percentCushionDayPolicy,
    type Plan,
    type Points,
    policySizingOf,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { SIM_DEFAULTS, type SimInputs } from '~/lib/prop-calculator/simulator';
import { stableJson } from '~/lib/stableJson';

import {
    type Assumption,
    AssumptionBias,
    inputAssumption,
    sizingRuleAssumption,
} from './Assumption';
import { AssumptionKind } from './AssumptionKind';
import { SizingAssumption } from './DocumentedSizing';
import { fundedRetainedCushionResolution } from './PayoutRequestRule';
import { NO_PERSONAL_CAPS, type PersonalCaps } from './PersonalCaps';
import {
    cappedRisk,
    type EnginePolicy,
    enginePolicySchema,
    hasPersonalCaps,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    resolveDocumentedPlan,
} from './policy';
import {
    HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS,
    type RulebookParameters,
} from './Rulebook';

export const INTRADAY_TRAILING_PATH_STEPS_PER_R = 10;

export interface EnginePolicyBuild {
    readonly assumptions: readonly Assumption[];
    readonly policy: EnginePolicy;
}

export interface EnginePolicyBuilderInput {
    readonly accountPolicy?: FirmAccountPolicy;
    readonly fundedHorizonDays: number;
    readonly measuredRebuyLag?: MeasuredRebuyLag | null;
    readonly personalCaps?: PersonalCaps;
    readonly personalDll?: Dollars | null;
    readonly personalRetainedCushion?: Dollars | null;
    readonly plan: Plan;
    readonly positionSizing?: EnginePolicyPositionSizing | null;
    readonly rulebook: RulebookParameters;
}

export interface EnginePolicyPositionSizing {
    readonly instrument: InstrumentSymbol;
    readonly stopPoints: Points;
}

export interface MeasuredRebuyLag {
    readonly days: number;
    readonly samples: number;
}

export function applyEnginePolicy(
    plan: Plan,
    policy: EnginePolicy,
    base: SimInputs,
): SimInputs {
    const simulatedPlan = resolveDocumentedPlan(plan, policy);
    const requestedBeforeMinimum =
        policy.payoutRequestOverride ?? base.payoutRequestSize;
    if (requestedBeforeMinimum === undefined) {
        throw new Error(
            'applyEnginePolicy: the base SimInputs must carry a payoutRequestSize when the policy has no payoutRequestOverride',
        );
    }
    return {
        ...withPersonalCaps(base, policy.personalCaps ?? NO_PERSONAL_CAPS),
        intradayPathStepsPerR:
            policy.intradayPathStepsPerR ?? base.intradayPathStepsPerR,
        minRetainedCushion: simulatedPlan.resolveRetainedCushion(
            policy.retainedCushionRequest ??
                HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS,
        ),
        payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
        payoutRequestSize: effectivePayoutRequest(
            simulatedPlan,
            requestedBeforeMinimum,
        ),
        plan: simulatedPlan,
        rebuyLagDays: policy.rebuyLagDays,
    };
}

export function buildEnginePolicy(
    input: EnginePolicyBuilderInput,
): EnginePolicyBuild {
    const {
        accountPolicy,
        fundedHorizonDays,
        measuredRebuyLag,
        personalCaps,
        personalDll,
        personalRetainedCushion,
        plan,
        positionSizing,
        rulebook,
    } = input;
    const assumptions: Assumption[] = [];

    const { lifetimePayoutCapBasis, lifetimePayoutCapOverride } =
        resolveLifetimePayoutCap(plan, accountPolicy, assumptions);

    const hasMeasuredRebuyLag =
        measuredRebuyLag !== null &&
        measuredRebuyLag !== undefined &&
        measuredRebuyLag.samples > 0;
    const rebuyLagDays = hasMeasuredRebuyLag ? measuredRebuyLag.days : 0;
    const rebuyLagBasis = hasMeasuredRebuyLag
        ? RebuyLagBasis.Measured
        : RebuyLagBasis.AssumedZero;
    if (rebuyLagBasis === RebuyLagBasis.AssumedZero) {
        assumptions.push(
            inputAssumption(
                AssumptionKind.RebuyLagAssumed,
                AssumptionBias.Optimistic,
            ),
        );
    }

    const intradayPathStepsPerR = isIntradayTrailing(plan)
        ? INTRADAY_TRAILING_PATH_STEPS_PER_R
        : undefined;

    let instrument: InstrumentSymbol | undefined;
    let stopPoints: Points | undefined;
    if (positionSizing) {
        instrument = positionSizing.instrument;
        stopPoints = positionSizing.stopPoints;
    } else {
        assumptions.push(
            inputAssumption(
                AssumptionKind.PositionSizingUnspecified,
                AssumptionBias.Neutral,
            ),
            inputAssumption(
                AssumptionKind.PercentCandidatesLeftOut,
                AssumptionBias.Conservative,
            ),
        );
    }

    assumptions.push(
        sizingRuleAssumption(
            SizingAssumption.NoCommission,
            AssumptionBias.Optimistic,
        ),
    );

    const policy: EnginePolicy = enginePolicySchema.parse({
        commissionPerRoundTrip: SIM_DEFAULTS.commissionPerRoundTrip,
        fundedHorizonDays,
        ...(instrument !== undefined && { instrument }),
        ...(intradayPathStepsPerR !== undefined && { intradayPathStepsPerR }),
        lifetimePayoutCapBasis,
        lifetimePayoutCapOverride,
        payoutRequestOverride: null,
        ...(hasPersonalCaps(personalCaps) && { personalCaps }),
        ...(personalDll !== null &&
            personalDll !== undefined && { personalDll }),
        rebuyLagBasis,
        rebuyLagDays,
        retainedCushionRequest: ceilToWholeCents(
            fundedRetainedCushionResolution(
                rulebook,
                personalRetainedCushion ?? 0,
            ).amount,
        ),
        ...(stopPoints !== undefined && { stopPoints }),
    });

    return { assumptions, policy };
}

export function enginePolicyKey(policy: EnginePolicy): string {
    return stableJson(enginePolicySchema.parse(policy));
}

function cappedDayPolicy(
    dayPolicy: DayPolicy,
    caps: PersonalCaps,
): DayPolicy {
    const { maxRiskPerTrade, maxTradesPerDay } = caps;
    const { computeRisk } = dayPolicy;
    const slots =
        maxTradesPerDay === null
            ? dayPolicy.ladder
            : dayPolicy.ladder.slice(0, maxTradesPerDay);
    return {
        ...dayPolicy,
        ...(computeRisk !== undefined &&
            maxRiskPerTrade !== null && {
                computeRisk: (state, tradeIndexToday, fundedCycle) =>
                    cappedRisk(
                        computeRisk(state, tradeIndexToday, fundedCycle),
                        maxRiskPerTrade,
                    ),
            }),
        ladder:
            maxRiskPerTrade === null
                ? slots
                : slots.map((rung) => cappedRisk(rung, maxRiskPerTrade)),
    };
}

function fewerTradesOf(value: number, limit: null | number): number {
    return limit === null ? value : Math.min(value, limit);
}

function isIntradayTrailing(plan: Plan): boolean {
    return plan.fundedDrawdown.kind === DrawdownKind.IntradayTrailing;
}

function resolveLifetimePayoutCap(
    plan: Plan,
    accountPolicy: FirmAccountPolicy | undefined,
    assumptions: Assumption[],
): Pick<EnginePolicy, 'lifetimePayoutCapBasis' | 'lifetimePayoutCapOverride'> {
    const override = accountPolicy?.lifetimePayoutCapOverride(plan) ?? {
        kind: LifetimePayoutCapOverrideKind.NotChecked,
    };
    switch (override.kind) {
        case LifetimePayoutCapOverrideKind.Capped: {
            return {
                lifetimePayoutCapBasis:
                    LifetimePayoutCapBasis.VerifiedCountTrigger,
                lifetimePayoutCapOverride: override.cap,
            };
        }
        case LifetimePayoutCapOverrideKind.NoCountTrigger:
        case LifetimePayoutCapOverrideKind.PlanAlreadyConcludes: {
            return {
                lifetimePayoutCapBasis:
                    LifetimePayoutCapBasis.VerifiedNoCountTrigger,
                lifetimePayoutCapOverride: null,
            };
        }
        case LifetimePayoutCapOverrideKind.NotChecked: {
            assumptions.push(
                inputAssumption(
                    AssumptionKind.LiveTriggersNotChecked,
                    AssumptionBias.Optimistic,
                ),
            );
            return {
                lifetimePayoutCapBasis:
                    LifetimePayoutCapBasis.LiveTriggersNotChecked,
                lifetimePayoutCapOverride: null,
            };
        }
    }
}

function withPersonalCaps(base: SimInputs, caps: PersonalCaps): SimInputs {
    const { maxRiskPerTrade, maxTradesPerDay } = caps;
    if (maxRiskPerTrade === null && maxTradesPerDay === null) return base;
    const tradesPerDay = fewerTradesOf(base.tradesPerDay, maxTradesPerDay);
    const fundedTradesPerDay =
        base.fundedTradesPerDay === undefined
            ? undefined
            : fewerTradesOf(base.fundedTradesPerDay, maxTradesPerDay);
    const percent = base.fundedCushionPercent;
    const percentPolicy =
        percent !== undefined && maxRiskPerTrade !== null
            ? percentCushionDayPolicy(
                  percent,
                  fundedTradesPerDay ?? tradesPerDay,
                  base.dayStop ?? { kind: DayStopRuleKind.None },
                  policySizingOf(TradingPhase.Funded),
                  maxRiskPerTrade,
              )
            : undefined;
    return {
        ...base,
        evalDayPolicy:
            base.evalDayPolicy === undefined
                ? undefined
                : cappedDayPolicy(base.evalDayPolicy, caps),
        fundedCushionPercent:
            percentPolicy === undefined ? percent : undefined,
        fundedDayPolicy:
            percentPolicy ??
            (base.fundedDayPolicy === undefined
                ? undefined
                : cappedDayPolicy(base.fundedDayPolicy, caps)),
        fundedRiskPerTrade:
            base.fundedRiskPerTrade === undefined
                ? undefined
                : cappedRisk(base.fundedRiskPerTrade, maxRiskPerTrade),
        fundedTradesPerDay:
            percentPolicy === undefined ? fundedTradesPerDay : undefined,
        riskPerTrade: cappedRisk(base.riskPerTrade, maxRiskPerTrade),
        tradesPerDay,
    };
}
