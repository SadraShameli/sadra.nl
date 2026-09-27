import { stableJson } from '~/lib/stableJson';

import {
    CENTS_PER_DOLLAR,
    DrawdownKind,
    effectivePayoutRequest,
    type FirmAccountPolicy,
    type InstrumentSymbol,
    LifetimePayoutCapOverrideKind,
    PayoutRequestPolicy,
    type Plan,
    type Points,
} from '../core';
import { SIM_DEFAULTS, type SimInputs } from '../simulator';
import {
    type Assumption,
    AssumptionBias,
    inputAssumption,
    sizingRuleAssumption,
} from './Assumption';
import { AssumptionKind } from './AssumptionKind';
import { SizingAssumption } from './DocumentedSizing';
import {
    type EnginePolicy,
    enginePolicySchema,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    resolveDocumentedPlan,
} from './policy';
import {
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    type RulebookParameters,
} from './Rulebook';

export const INTRADAY_TRAILING_PATH_STEPS_PER_R = 10;

const HARD_RULE_2_MIN_RETAINED_CUSHION =
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS / CENTS_PER_DOLLAR;

export interface EnginePolicyBuild {
    readonly assumptions: readonly Assumption[];
    readonly policy: EnginePolicy;
}

export interface EnginePolicyBuilderInput {
    readonly accountPolicy?: FirmAccountPolicy;
    readonly fundedHorizonDays: number;
    readonly measuredRebuyLag?: MeasuredRebuyLag | null;
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
    const requestedBeforeMinimum = policy.payoutRequestOverride ?? base.payoutRequestSize;
    if (requestedBeforeMinimum === undefined) {
        throw new Error(
            'applyEnginePolicy: the base SimInputs must carry a payoutRequestSize when the policy has no payoutRequestOverride',
        );
    }
    return {
        ...base,
        intradayPathStepsPerR:
            policy.intradayPathStepsPerR ?? base.intradayPathStepsPerR,
        minRetainedCushion: simulatedPlan.resolveRetainedCushion(
            policy.retainedCushionRequest ?? HARD_RULE_2_MIN_RETAINED_CUSHION,
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
            inputAssumption(AssumptionKind.RebuyLagAssumed, AssumptionBias.Optimistic),
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
        rebuyLagBasis,
        rebuyLagDays,
        retainedCushionRequest:
            rulebook.payout.retainedCushionCents / CENTS_PER_DOLLAR,
        ...(stopPoints !== undefined && { stopPoints }),
    });

    return { assumptions, policy };
}

export function enginePolicyKey(policy: EnginePolicy): string {
    return stableJson(enginePolicySchema.parse(policy));
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
                lifetimePayoutCapBasis: LifetimePayoutCapBasis.VerifiedCountTrigger,
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
                lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
                lifetimePayoutCapOverride: null,
            };
        }
    }
}
