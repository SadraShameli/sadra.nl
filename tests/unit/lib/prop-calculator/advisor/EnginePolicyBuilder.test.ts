import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    effectivePayoutRequest,
    FirmId,
    InstrumentSymbol,
    LifetimePayoutCapOverrideKind,
    PayoutRequestPolicy,
    type Plan,
    points,
    TopStepVariant,
    UnverifiedFirmAccountPolicy,
} from '~/lib/prop-calculator';
import {
    applyEnginePolicy,
    AssumptionBias,
    AssumptionKind,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type EnginePolicy,
    enginePolicyKey,
    enginePolicySchema,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import { findFirm } from '~/lib/prop-calculator/firms';
import { type SimInputs } from '~/lib/prop-calculator/simulator';

function apexPlan(variant: ApexVariant): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant,
    });
    if (!plan) throw new Error(`Apex ${variant} 50K plan not found`);
    return plan;
}

function topStepPlan(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep Standard/Standard 50K plan not found');
    return plan;
}

const HORIZON_DAYS = 90;

function rulebook(): RulebookParameters {
    return { ...DEFAULT_RULEBOOK };
}

describe('buildEnginePolicy (PT-19 step 1)', () => {
    it('builds a schema-valid policy with the Hard Rule 2 retained cushion request by default', () => {
        const { policy } = buildEnginePolicy({
            fundedHorizonDays: HORIZON_DAYS,
            plan: apexPlan(ApexVariant.Eod),
            rulebook: rulebook(),
        });
        expect(enginePolicySchema.safeParse(policy).success).toBe(true);
        expect(policy.retainedCushionRequest).toBe(2000);
        expect(policy.fundedHorizonDays).toBe(HORIZON_DAYS);
        expect(policy.payoutRequestOverride).toBeNull();
    });

    it('defaults the lifetime payout cap basis to LiveTriggersNotChecked with an optimistic assumption when no account policy is given', () => {
        const { assumptions, policy } = buildEnginePolicy({
            fundedHorizonDays: HORIZON_DAYS,
            plan: apexPlan(ApexVariant.Eod),
            rulebook: rulebook(),
        });
        expect(policy.lifetimePayoutCapBasis).toBe(
            LifetimePayoutCapBasis.LiveTriggersNotChecked,
        );
        expect(policy.lifetimePayoutCapOverride).toBeNull();
        expect(assumptions).toContainEqual({
            bias: AssumptionBias.Optimistic,
            kind: AssumptionKind.LiveTriggersNotChecked,
        });
    });

    it('maps a verified capped count trigger to VerifiedCountTrigger with the cap', () => {
        class CappedAccountPolicy extends UnverifiedFirmAccountPolicy {
            override lifetimePayoutCapOverride() {
                return {
                    cap: 6,
                    kind: LifetimePayoutCapOverrideKind.Capped as const,
                };
            }
        }
        const { assumptions, policy } = buildEnginePolicy({
            accountPolicy: new CappedAccountPolicy(),
            fundedHorizonDays: HORIZON_DAYS,
            plan: apexPlan(ApexVariant.Eod),
            rulebook: rulebook(),
        });
        expect(policy.lifetimePayoutCapBasis).toBe(
            LifetimePayoutCapBasis.VerifiedCountTrigger,
        );
        expect(policy.lifetimePayoutCapOverride).toBe(6);
        expect(assumptions).not.toContainEqual(
            expect.objectContaining({
                kind: AssumptionKind.LiveTriggersNotChecked,
            }),
        );
    });

    it('maps a verified no-count-trigger firm to VerifiedNoCountTrigger with no override', () => {
        class NoCountTriggerAccountPolicy extends UnverifiedFirmAccountPolicy {
            override lifetimePayoutCapOverride() {
                return {
                    kind: LifetimePayoutCapOverrideKind.NoCountTrigger as const,
                };
            }
        }
        const { policy } = buildEnginePolicy({
            accountPolicy: new NoCountTriggerAccountPolicy(),
            fundedHorizonDays: HORIZON_DAYS,
            plan: apexPlan(ApexVariant.Eod),
            rulebook: rulebook(),
        });
        expect(policy.lifetimePayoutCapBasis).toBe(
            LifetimePayoutCapBasis.VerifiedNoCountTrigger,
        );
        expect(policy.lifetimePayoutCapOverride).toBeNull();
    });

    it('sets intradayPathStepsPerR only for an intraday-trailing funded drawdown', () => {
        const intraday = buildEnginePolicy({
            fundedHorizonDays: HORIZON_DAYS,
            plan: apexPlan(ApexVariant.Intraday),
            rulebook: rulebook(),
        });
        expect(intraday.policy.intradayPathStepsPerR).toBe(10);

        const eod = buildEnginePolicy({
            fundedHorizonDays: HORIZON_DAYS,
            plan: apexPlan(ApexVariant.Eod),
            rulebook: rulebook(),
        });
        expect(eod.policy.intradayPathStepsPerR).toBeUndefined();
    });

    it('leaves position sizing undefined and discloses it as an assumption when none is given', () => {
        const { assumptions, policy } = buildEnginePolicy({
            fundedHorizonDays: HORIZON_DAYS,
            plan: apexPlan(ApexVariant.Eod),
            rulebook: rulebook(),
        });
        expect(policy.instrument).toBeUndefined();
        expect(policy.stopPoints).toBeUndefined();
        expect(assumptions).toContainEqual(
            expect.objectContaining({
                kind: AssumptionKind.PositionSizingUnspecified,
            }),
        );
        expect(assumptions).toContainEqual(
            expect.objectContaining({
                kind: AssumptionKind.PercentCandidatesLeftOut,
            }),
        );
    });

    it('carries a given position sizing without the unsized assumptions', () => {
        const { assumptions, policy } = buildEnginePolicy({
            fundedHorizonDays: HORIZON_DAYS,
            plan: apexPlan(ApexVariant.Eod),
            positionSizing: {
                instrument: InstrumentSymbol.MNQ,
                stopPoints: points(10),
            },
            rulebook: rulebook(),
        });
        expect(policy.instrument).toBe(InstrumentSymbol.MNQ);
        expect(policy.stopPoints).toBe(10);
        expect(assumptions).not.toContainEqual(
            expect.objectContaining({
                kind: AssumptionKind.PositionSizingUnspecified,
            }),
        );
    });

    it('takes a measured rebuy lag only when samples exist, else assumes zero', () => {
        const measured = buildEnginePolicy({
            fundedHorizonDays: HORIZON_DAYS,
            measuredRebuyLag: { days: 3, samples: 5 },
            plan: apexPlan(ApexVariant.Eod),
            rulebook: rulebook(),
        });
        expect(measured.policy.rebuyLagBasis).toBe(RebuyLagBasis.Measured);
        expect(measured.policy.rebuyLagDays).toBe(3);
        expect(measured.assumptions).not.toContainEqual(
            expect.objectContaining({ kind: AssumptionKind.RebuyLagAssumed }),
        );

        const assumed = buildEnginePolicy({
            fundedHorizonDays: HORIZON_DAYS,
            measuredRebuyLag: { days: 3, samples: 0 },
            plan: apexPlan(ApexVariant.Eod),
            rulebook: rulebook(),
        });
        expect(assumed.policy.rebuyLagBasis).toBe(RebuyLagBasis.AssumedZero);
        expect(assumed.policy.rebuyLagDays).toBe(0);
        expect(assumed.assumptions).toContainEqual({
            bias: AssumptionBias.Optimistic,
            kind: AssumptionKind.RebuyLagAssumed,
        });
    });

    it('keeps the Measured basis when a real measurement is exactly zero days', () => {
        const measuredZero = buildEnginePolicy({
            fundedHorizonDays: HORIZON_DAYS,
            measuredRebuyLag: { days: 0, samples: 5 },
            plan: apexPlan(ApexVariant.Eod),
            rulebook: rulebook(),
        });
        expect(measuredZero.policy.rebuyLagBasis).toBe(RebuyLagBasis.Measured);
        expect(measuredZero.policy.rebuyLagDays).toBe(0);
        expect(measuredZero.assumptions).not.toContainEqual(
            expect.objectContaining({ kind: AssumptionKind.RebuyLagAssumed }),
        );
    });

    it('discloses the zero-commission default as a sizing-rule assumption', () => {
        const { assumptions } = buildEnginePolicy({
            fundedHorizonDays: HORIZON_DAYS,
            plan: apexPlan(ApexVariant.Eod),
            rulebook: rulebook(),
        });
        expect(assumptions).toContainEqual(
            expect.objectContaining({ kind: AssumptionKind.SizingRule }),
        );
    });
});

function policyOf(overrides: Partial<EnginePolicy> = {}): EnginePolicy {
    return enginePolicySchema.parse({
        commissionPerRoundTrip: 0,
        fundedHorizonDays: HORIZON_DAYS,
        lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
        lifetimePayoutCapOverride: null,
        payoutRequestOverride: null,
        rebuyLagBasis: RebuyLagBasis.AssumedZero,
        rebuyLagDays: 0,
        retainedCushionRequest: 2000,
        ...overrides,
    });
}

describe('enginePolicyKey (PT-19 step 1)', () => {
    it('is deterministic for the same policy', () => {
        expect(enginePolicyKey(policyOf())).toBe(enginePolicyKey(policyOf()));
    });

    it('changes when any field changes, including the lifetime cap override', () => {
        const base = enginePolicyKey(policyOf());
        expect(
            enginePolicyKey(
                policyOf({
                    rebuyLagBasis: RebuyLagBasis.Measured,
                    rebuyLagDays: 3,
                }),
            ),
        ).not.toBe(base);
        expect(
            enginePolicyKey(
                policyOf({
                    lifetimePayoutCapBasis:
                        LifetimePayoutCapBasis.VerifiedCountTrigger,
                    lifetimePayoutCapOverride: 6,
                }),
            ),
        ).not.toBe(base);
    });
});

function baseSimInputs(plan: Plan): SimInputs {
    return {
        fundedHorizonDays: HORIZON_DAYS,
        maxEvalDays: 30,
        payoutRequestSize: 500,
        plan,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 4,
        trials: 10,
        winrate: 0.4,
    };
}

describe('applyEnginePolicy (PT-19 step 1)', () => {
    it('sets the effective retained cushion, FullRequestOnly and the lifetime cap', () => {
        const plan = topStepPlan();
        const policy = enginePolicySchema.parse({
            commissionPerRoundTrip: 0,
            fundedHorizonDays: HORIZON_DAYS,
            lifetimePayoutCapBasis: LifetimePayoutCapBasis.VerifiedCountTrigger,
            lifetimePayoutCapOverride: 6,
            payoutRequestOverride: null,
            rebuyLagBasis: RebuyLagBasis.Measured,
            rebuyLagDays: 3,
            retainedCushionRequest: 2000,
        });
        const result = applyEnginePolicy(plan, policy, baseSimInputs(plan));

        expect(result.plan.maxLifetimePayouts).toBe(6);
        expect(result.minRetainedCushion).toBe(
            plan.resolveRetainedCushion(2000),
        );
        expect(result.minRetainedCushion).toBe(2000);
        expect(result.payoutRequestPolicy).toBe(
            PayoutRequestPolicy.FullRequestOnly,
        );
        expect(result.payoutRequestSize).toBe(
            effectivePayoutRequest(result.plan, 500),
        );
        expect(result.rebuyLagDays).toBe(3);
    });

    it('floors the retained cushion at Hard Rule 2 when the policy carries no retained cushion request', () => {
        const plan = topStepPlan();
        const policy = enginePolicySchema.parse({
            commissionPerRoundTrip: 0,
            fundedHorizonDays: HORIZON_DAYS,
            lifetimePayoutCapBasis:
                LifetimePayoutCapBasis.LiveTriggersNotChecked,
            lifetimePayoutCapOverride: null,
            payoutRequestOverride: null,
            rebuyLagBasis: RebuyLagBasis.AssumedZero,
            rebuyLagDays: 0,
            retainedCushionRequest: null,
        });
        expect(plan.defaultRetainedCushion()).toBe(0);

        const result = applyEnginePolicy(plan, policy, baseSimInputs(plan));

        expect(result.minRetainedCushion).toBe(2000);
    });

    it('prefers the policy payout override over the base payout request size', () => {
        const plan = topStepPlan();
        const policy = enginePolicySchema.parse({
            commissionPerRoundTrip: 0,
            fundedHorizonDays: HORIZON_DAYS,
            lifetimePayoutCapBasis:
                LifetimePayoutCapBasis.LiveTriggersNotChecked,
            lifetimePayoutCapOverride: null,
            payoutRequestOverride: 777,
            rebuyLagBasis: RebuyLagBasis.AssumedZero,
            rebuyLagDays: 0,
            retainedCushionRequest: 2000,
        });
        const result = applyEnginePolicy(plan, policy, baseSimInputs(plan));

        expect(result.payoutRequestSize).toBe(
            effectivePayoutRequest(result.plan, 777),
        );
    });

    it('leaves intradayPathStepsPerR at the base value when the policy has none', () => {
        const plan = topStepPlan();
        const policy = enginePolicySchema.parse({
            commissionPerRoundTrip: 0,
            fundedHorizonDays: HORIZON_DAYS,
            lifetimePayoutCapBasis:
                LifetimePayoutCapBasis.LiveTriggersNotChecked,
            lifetimePayoutCapOverride: null,
            payoutRequestOverride: null,
            rebuyLagBasis: RebuyLagBasis.AssumedZero,
            rebuyLagDays: 0,
            retainedCushionRequest: 2000,
        });
        const base: SimInputs = {
            ...baseSimInputs(plan),
            intradayPathStepsPerR: 42,
        };
        expect(
            applyEnginePolicy(plan, policy, base).intradayPathStepsPerR,
        ).toBe(42);
    });

    it('throws when neither the policy nor the base carries a payout request size', () => {
        const plan = topStepPlan();
        const policy = enginePolicySchema.parse({
            commissionPerRoundTrip: 0,
            fundedHorizonDays: HORIZON_DAYS,
            lifetimePayoutCapBasis:
                LifetimePayoutCapBasis.LiveTriggersNotChecked,
            lifetimePayoutCapOverride: null,
            payoutRequestOverride: null,
            rebuyLagBasis: RebuyLagBasis.AssumedZero,
            rebuyLagDays: 0,
            retainedCushionRequest: 2000,
        });
        const base = { ...baseSimInputs(plan) };
        Reflect.deleteProperty(base, 'payoutRequestSize');
        expect(() => applyEnginePolicy(plan, policy, base)).toThrow();
    });
});
