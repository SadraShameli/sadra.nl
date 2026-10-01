import { describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    type EnginePolicy,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';
import {
    startStateOf,
    valueAtState,
} from '~/lib/prop-calculator/advisor/value/ValueAtState';
import {
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value/ValueEstimate';
import {
    type AccountState,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    type FromStateSimInputs,
    simulateFromState,
} from '~/lib/prop-calculator/simulator';

function evalAccount(
    plan: Plan,
    overrides: Partial<AccountState> = {},
): ReconstructedFundedOrEvalAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: 0,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state: { ...plan.initialState(), ...overrides },
    };
}

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

function policyFor(plan: Plan): EnginePolicy {
    return buildEnginePolicy({
        fundedHorizonDays: 90,
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

function specFor(plan: Plan): DocumentedPolicySpec {
    return {
        enginePolicy: policyFor(plan),
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 40, seed: 11, trials: 30 },
    };
}

describe('valueAtState (F-V17, PT-65a step 1)', () => {
    it('wraps simulateFromState/fromStateExpectedCash for a funded reconstructed account', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        const outcome = valueAtState(account, spec);
        if (outcome.kind !== ValueResultKind.Value) {
            throw new Error('expected a value result');
        }

        const base = toSimInputs(plan, spec);
        const inputs: FromStateSimInputs = {
            ...base,
            start: startStateOf(base.plan, account),
        };
        const expected = simulateFromState(inputs);

        expect(outcome.creditInclusive).toEqual(
            expected.estimates.fromStateExpectedCash,
        );
        expect(outcome.creditFree).toEqual(
            expected.estimates.fromStateExpectedRealizedCash,
        );
        expect(outcome.seed).toBe(spec.run.seed);
        expect(outcome.trials).toBe(spec.run.trials);
    });

    it('wraps simulateFromState for a fresh eval reconstructed account', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = evalAccount(plan);

        const outcome = valueAtState(account, spec);
        if (outcome.kind !== ValueResultKind.Value) {
            throw new Error('expected a value result');
        }

        const base = toSimInputs(plan, spec);
        const expected = simulateFromState({
            ...base,
            start: startStateOf(base.plan, account),
        });

        expect(outcome.creditInclusive).toEqual(
            expected.estimates.fromStateExpectedCash,
        );
    });

    it('is deterministic per seed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        expect(valueAtState(account, spec)).toStrictEqual(
            valueAtState(account, spec),
        );
    });

    it('returns a typed reason, never a number, for a live account (the engine has no from-state live value path)', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = liveAccount(plan);

        const outcome = valueAtState(account, spec);

        expect(outcome).toStrictEqual({
            kind: ValueResultKind.NotModeled,
            reason: 'live-not-modeled',
        });
    });
});
