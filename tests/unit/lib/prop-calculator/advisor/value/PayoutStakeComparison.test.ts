import { describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';
import { type DocumentedPolicySpec, type EnginePolicy } from '~/lib/prop-calculator/advisor/policy';
import { MilestoneKind, milestoneState } from '~/lib/prop-calculator/advisor/value/MilestoneState';
import {
    payoutStakeComparison,
    REDUCED_RISK_WHAT_IF_LABEL,
} from '~/lib/prop-calculator/advisor/value/PayoutStakeComparison';
import { valueAtState } from '~/lib/prop-calculator/advisor/value/ValueAtState';
import { requireValue } from '~/lib/prop-calculator/advisor/value/ValueChain';
import {
    type AccountState,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function evalAccount(plan: Plan): ReconstructedFundedOrEvalAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: 0,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan,
        resolvedDailyLossLimit: null,
        state: plan.initialState(),
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
        run: { maxEvalDays: 40, seed: 13, trials: 30 },
    };
}

describe('payoutStakeComparison (F-V19, PT-65b step 7)', () => {
    it('requestNow is the net-of-split payout plus the post-payout continuation value', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 51_500 });

        const outcome = payoutStakeComparison(account, spec);
        if (!('requestNow' in outcome)) throw new Error('expected a result');

        expect(outcome.requestedAmount).toBeGreaterThan(0);
        expect(outcome.traderReceivesNow).toBe(
            plan.payoutFromProfit(outcome.requestedAmount, 0),
        );
        expect(outcome.requestNow.creditInclusive.value).toBeGreaterThan(
            outcome.traderReceivesNow,
        );
    });

    it('continueNow equals V(now) for the account unchanged', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 51_500 });

        const outcome = payoutStakeComparison(account, spec);
        if (!('continueNow' in outcome)) throw new Error('expected a result');

        expect(outcome.continueNow).toEqual(
            requireValue(valueAtState(account, spec)),
        );
    });

    it('is not modeled for a live account', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = liveAccount(plan);

        expect(payoutStakeComparison(account, spec)).toStrictEqual({
            kind: 'not-modeled',
            reason: 'live-not-modeled',
        });
    });

    it('refuses an eval account (the caller determines eligibility)', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = evalAccount(plan);

        expect(() => payoutStakeComparison(account, spec)).toThrow(
            /expected a funded account/,
        );
    });

    it('gives no what-if row unless a reduced risk is requested', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 51_500 });

        const outcome = payoutStakeComparison(account, spec);
        if (!('reducedRiskWhatIf' in outcome)) throw new Error('expected a result');
        expect(outcome.reducedRiskWhatIf).toBeNull();
    });

    it('labels the reduced-risk what-if row with QV-18 and never changes the documented rung', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 51_500 });

        const outcome = payoutStakeComparison(account, spec, {
            reducedRiskDollars: 50,
        });
        if (!('reducedRiskWhatIf' in outcome) || outcome.reducedRiskWhatIf === null) {
            throw new Error('expected a what-if row');
        }

        expect(outcome.reducedRiskWhatIf.label).toBe(REDUCED_RISK_WHAT_IF_LABEL);
        expect(outcome.reducedRiskWhatIf.risk).toBe(50);
        expect(spec.rulebook.funded.riskCents).toBe(DEFAULT_RULEBOOK.funded.riskCents);
    });

    it('rejects a non-positive reduced risk', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 51_500 });

        expect(() =>
            payoutStakeComparison(account, spec, { reducedRiskDollars: 0 }),
        ).toThrow(RangeError);
    });

    it('is deterministic per seed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 51_500 });

        expect(payoutStakeComparison(account, spec)).toStrictEqual(
            payoutStakeComparison(account, spec),
        );
    });

    it('requestNow uses a continuation tracker advanced through the modeled payout, not the stale pre-payout tracker', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 51_500 });

        const outcome = payoutStakeComparison(account, spec);
        if (!('requestNow' in outcome)) throw new Error('expected a result');

        const milestone = milestoneState(account, spec);
        if (milestone.kind !== MilestoneKind.Funded) {
            throw new Error('expected a funded milestone');
        }
        const staleContinuation = requireValue(
            valueAtState({ ...account, state: milestone.state }, spec),
        );
        const traderReceivesNow = plan.payoutFromProfit(milestone.debited, 0);
        const staleRequestNow =
            traderReceivesNow + staleContinuation.creditInclusive.value;

        expect(outcome.requestNow.creditInclusive.value).not.toBeCloseTo(
            staleRequestNow,
        );
    });
});
