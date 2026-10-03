import { describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    type EnginePolicy,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor/policy';
import {
    retireComparison,
    RetireComparisonBasis,
    RetireComparisonReason,
    RetireComparisonVerdict,
} from '~/lib/prop-calculator/advisor/value/RetireComparison';
import {
    type AccountState,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function fundedAccount(
    plan: Plan,
    overrides: Partial<AccountState> = {},
): ReconstructedFundedOrEvalAccount {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    Object.assign(state, overrides);
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker(state),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function liveAccount(plan: Plan): ReconstructedAccount {
    return {
        assumptions: [],
        cushion: null,
        kind: ReconstructedLiveKind.Live,
        livePlan: null,
        plan,
        state: null,
    };
}

function policyFor(plan: Plan, fundedHorizonDays = 90): EnginePolicy {
    return buildEnginePolicy({
        fundedHorizonDays,
        plan,
        rulebook: DEFAULT_RULEBOOK,
    }).policy;
}

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function specFor(plan: Plan, fundedHorizonDays = 90): DocumentedPolicySpec {
    return {
        enginePolicy: policyFor(plan, fundedHorizonDays),
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 40, seed: 9, trials: 30 },
    };
}

describe('retireComparison (F-V18, PT-65b step 8)', () => {
    it('is not modeled for a live account', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = liveAccount(plan);

        expect(
            retireComparison(account, spec, {
                isCapacityBound: true,
                replacementPlan: plan,
            }),
        ).toStrictEqual({ kind: 'not-modeled', reason: 'live-not-modeled' });
    });

    it('uses the simulator basis and the plan retry fee for the switch cost when no validated DP row is given and the rebuy lag is 0', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });
        expect(spec.enginePolicy.rebuyLagDays).toBe(0);

        const outcome = retireComparison(account, spec, {
            isCapacityBound: true,
            replacementPlan: plan,
        });
        if (!('basis' in outcome)) throw new Error('expected a result');

        expect(outcome.basis).toBe(RetireComparisonBasis.Simulator);
        expect(outcome.switchCost).toBeCloseTo(plan.retryFee());
        expect(outcome.remainingDays).toBeGreaterThan(0);
    });

    it('uses the average-reward DP basis when a validated slot rate is given', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        const outcome = retireComparison(account, spec, {
            isCapacityBound: true,
            replacementPlan: plan,
            validatedSlotRate: { standardError: 1, value: 500 },
        });
        if (!('basis' in outcome)) throw new Error('expected a result');

        expect(outcome.basis).toBe(RetireComparisonBasis.AverageRewardDp);
    });

    it('SwitchBeatsKeep only when the switch is beyond noise ahead and the slot is capacity-bound', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        const probe = retireComparison(account, spec, {
            isCapacityBound: false,
            replacementPlan: plan,
            validatedSlotRate: { standardError: 1, value: 0 },
        });
        if (!('keepRate' in probe)) throw new Error('expected a result');
        const farAheadRate = probe.keepRate.value + 1000;

        const capacityBound = retireComparison(account, spec, {
            isCapacityBound: true,
            replacementPlan: plan,
            validatedSlotRate: { standardError: 1, value: farAheadRate },
        });
        const notCapacityBound = retireComparison(account, spec, {
            isCapacityBound: false,
            replacementPlan: plan,
            validatedSlotRate: { standardError: 1, value: farAheadRate },
        });
        if (!('verdict' in capacityBound) || !('verdict' in notCapacityBound)) {
            throw new Error('expected results');
        }

        expect(capacityBound.verdict).toBe(
            RetireComparisonVerdict.SwitchBeatsKeep,
        );
        expect(capacityBound.reason).toBeNull();
        expect(notCapacityBound.verdict).toBe(RetireComparisonVerdict.Keep);
        expect(notCapacityBound.reason).toBe(
            RetireComparisonReason.NotCapacityBound,
        );
    });

    it('Keep with SwitchBehind when the switch is beyond noise behind, even when capacity-bound', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        const probe = retireComparison(account, spec, {
            isCapacityBound: false,
            replacementPlan: plan,
            validatedSlotRate: { standardError: 1, value: 0 },
        });
        if (!('keepRate' in probe)) throw new Error('expected a result');
        const farBehindRate = probe.keepRate.value - 1000;

        const outcome = retireComparison(account, spec, {
            isCapacityBound: true,
            replacementPlan: plan,
            validatedSlotRate: { standardError: 1, value: farBehindRate },
        });
        if (!('verdict' in outcome)) throw new Error('expected a result');

        expect(outcome.verdict).toBe(RetireComparisonVerdict.Keep);
        expect(outcome.reason).toBe(RetireComparisonReason.SwitchBehind);
    });

    it('Keep with WithinNoise when the switch rate is statistically indistinguishable from keep', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        const probe = retireComparison(account, spec, {
            isCapacityBound: false,
            replacementPlan: plan,
            validatedSlotRate: { standardError: 1, value: 0 },
        });
        if (!('keepRate' in probe) || !('switchCost' in probe)) {
            throw new Error('expected a result');
        }
        const matchedRate =
            probe.keepRate.value + probe.switchCost / probe.remainingDays;

        const outcome = retireComparison(account, spec, {
            isCapacityBound: true,
            replacementPlan: plan,
            validatedSlotRate: {
                standardError: Math.max(1, Math.abs(probe.keepRate.value)),
                value: matchedRate,
            },
        });
        if (!('verdict' in outcome)) throw new Error('expected a result');

        expect(outcome.verdict).toBe(RetireComparisonVerdict.Keep);
        expect(outcome.reason).toBe(RetireComparisonReason.WithinNoise);
    });

    it('scales the switch rate standard error by the rebuy-lag sensitivity, not the raw slot-rate SE', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });
        const rebuyLagDays = 5;
        const laggedSpec: DocumentedPolicySpec = {
            ...spec,
            enginePolicy: {
                ...spec.enginePolicy,
                rebuyLagBasis: RebuyLagBasis.Measured,
                rebuyLagDays,
            },
        };

        const outcome = retireComparison(account, laggedSpec, {
            isCapacityBound: true,
            replacementPlan: plan,
            validatedSlotRate: { standardError: 10, value: 500 },
        });
        if (!('switchRate' in outcome) || !('remainingDays' in outcome)) {
            throw new Error('expected a result');
        }

        const sensitivity = Math.abs(1 - rebuyLagDays / outcome.remainingDays);
        expect(outcome.switchRate.standardError).toBeCloseTo(10 * sensitivity);
        expect(outcome.switchRate.standardError).not.toBeCloseTo(10);
    });

    it('gives a distinct Unknown reason when the noise comparison cannot be judged', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        const outcome = retireComparison(account, spec, {
            isCapacityBound: true,
            replacementPlan: plan,
            validatedSlotRate: { standardError: null, value: 0 },
        });
        if (!('verdict' in outcome)) throw new Error('expected a result');

        expect(outcome.verdict).toBe(RetireComparisonVerdict.Keep);
        expect(outcome.reason).toBe(RetireComparisonReason.Unknown);
    });

    it('does not divide by zero when the engine policy carries a zero-day funded horizon', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan, 0);
        const account = fundedAccount(plan, { balance: 50_800 });

        const outcome = retireComparison(account, spec, {
            isCapacityBound: true,
            replacementPlan: plan,
        });
        if (!('verdict' in outcome)) throw new Error('expected a result');

        expect(outcome.remainingDays).toBe(0);
        expect(Number.isFinite(outcome.keepRate.value)).toBe(true);
        expect(Number.isFinite(outcome.switchRate.value)).toBe(true);
        expect(outcome.verdict).toBe(RetireComparisonVerdict.Keep);
        expect(outcome.reason).toBe(RetireComparisonReason.NoRemainingHorizon);
    });

    it('is deterministic per seed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });
        const request = { isCapacityBound: true, replacementPlan: plan };

        expect(retireComparison(account, spec, request)).toStrictEqual(
            retireComparison(account, spec, request),
        );
    });
});
