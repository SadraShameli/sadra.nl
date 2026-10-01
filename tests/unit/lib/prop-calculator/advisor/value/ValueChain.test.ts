import { describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import { type DocumentedPolicySpec, type EnginePolicy } from '~/lib/prop-calculator/advisor/policy';
import {
    MilestoneKind,
    milestoneState,
} from '~/lib/prop-calculator/advisor/value/MilestoneState';
import {
    evalStartAccount,
    firstPayoutEligibleAccount,
    freshFundedAccount,
    fundedTrackerAfterMilestonePayout,
    postFirstPayoutAccount,
    valueChain,
    ValueChainStepKind,
} from '~/lib/prop-calculator/advisor/value/ValueChain';
import { isValueResult } from '~/lib/prop-calculator/advisor/value/ValueEstimate';
import {
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

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
        run: { maxEvalDays: 40, seed: 17, trials: 30 },
    };
}

describe('valueChain (F-V17, PT-65b step 5)', () => {
    it('gives four canonical steps in order: eval start, fresh funded, first payout eligible, post first payout', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);

        const result = valueChain(plan, spec);

        expect(result.steps.map((step) => step.kind)).toEqual([
            ValueChainStepKind.EvalStart,
            ValueChainStepKind.FreshFunded,
            ValueChainStepKind.FirstPayoutEligible,
            ValueChainStepKind.PostFirstPayout,
        ]);
        for (const step of result.steps) {
            expect(step.value.seed).toBe(spec.run.seed);
            expect(step.value.trials).toBe(spec.run.trials);
        }
    });

    it('the first-payout-eligible step has earned at least the plan minimum payout profit', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);

        const result = valueChain(plan, spec);
        const freshFunded = result.steps.find(
            (step) => step.kind === ValueChainStepKind.FreshFunded,
        );
        const eligible = result.steps.find(
            (step) => step.kind === ValueChainStepKind.FirstPayoutEligible,
        );
        if (!freshFunded || !eligible) throw new Error('missing steps');

        expect(eligible.value.creditFree.value).not.toBe(
            freshFunded.value.creditFree.value,
        );
    });

    it('has no account value when no account is given', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);

        expect(valueChain(plan, spec).accountValue).toBeNull();
    });

    it('marks the account own position when an account is given', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        const account: ReconstructedFundedOrEvalAccount = {
            assumptions: [],
            contractLimit: null,
            cushion: state.balance - state.threshold,
            fundedTracker: newFundedCycleTracker(state),
            kind: TradingPhase.Funded,
            plan,
            resolvedDailyLossLimit: null,
            state,
        };

        const result = valueChain(plan, spec, account);
        if (result.accountValue === null || !isValueResult(result.accountValue)) {
            throw new Error('expected a value result for the account');
        }
        const freshFunded = result.steps.find(
            (step) => step.kind === ValueChainStepKind.FreshFunded,
        );
        if (!freshFunded) throw new Error('missing fresh funded step');
        expect(result.accountValue).toEqual(freshFunded.value);
    });

    it('is deterministic per seed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);

        expect(valueChain(plan, spec)).toStrictEqual(valueChain(plan, spec));
    });

    it('gives eval start a real drawdown cushion instead of 0', () => {
        const plan = rapidEodPlan();

        const account = evalStartAccount(plan);
        const state = plan.initialState();

        expect(account.cushion).toBe(state.balance - state.threshold);
        expect(account.cushion).toBeGreaterThan(0);
    });

    it('postFirstPayoutAccount advances the funded cycle tracker through the modeled payout instead of reusing the stale pre-payout tracker', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const freshFunded = freshFundedAccount(plan);
        const firstPayoutEligible = firstPayoutEligibleAccount(plan, freshFunded);
        const priorTracker = firstPayoutEligible.fundedTracker;
        if (priorTracker === null) throw new Error('expected a funded tracker');

        const post = postFirstPayoutAccount(firstPayoutEligible, spec);

        expect(post.fundedTracker).not.toBe(priorTracker);
        expect(post.fundedTracker?.payoutsIssued).toBe(1);
        expect(post.fundedTracker?.lastPayoutBalance).toBe(post.state.balance);
        expect(post.fundedTracker?.lastPayoutBalance).not.toBe(
            priorTracker.lastPayoutBalance,
        );
    });

    it('fundedTrackerAfterMilestonePayout carries cumulativePayout and fundedResetsUsed forward', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const freshFunded = freshFundedAccount(plan);
        const firstPayoutEligible = firstPayoutEligibleAccount(plan, freshFunded);
        const milestone = milestoneState(firstPayoutEligible, spec);
        if (milestone.kind !== MilestoneKind.Funded) {
            throw new Error('expected a funded milestone');
        }
        const priorTracker = firstPayoutEligible.fundedTracker;
        if (priorTracker === null) throw new Error('expected a funded tracker');

        const advanced = fundedTrackerAfterMilestonePayout(
            firstPayoutEligible,
            milestone,
        );

        expect(advanced.fundedResetsUsed).toBe(priorTracker.fundedResetsUsed);
        expect(advanced.cumulativePayout).toBe(
            priorTracker.cumulativePayout +
                plan.payoutFromProfit(milestone.debited, priorTracker.payoutsIssued),
        );
    });
});
