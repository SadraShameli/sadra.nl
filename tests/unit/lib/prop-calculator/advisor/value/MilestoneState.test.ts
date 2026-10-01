import { describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    LiveApplicabilityKind,
    LiveNotModeledReason,
    livePlanApplicability,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    type EnginePolicy,
    resolveDocumentedPayoutRequestSize,
    resolveDocumentedPlan,
    resolveDocumentedRetainedCushion,
} from '~/lib/prop-calculator/advisor/policy';
import {
    EvalMilestoneGap,
    MilestoneKind,
    milestoneState,
} from '~/lib/prop-calculator/advisor/value/MilestoneState';
import {
    type AccountState,
    dollars,
    E8FuturesVariant,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    postPayoutThreshold,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function e8SignaturePlan(): Plan {
    const plan = findFirm(FirmId.E8Futures)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant: E8FuturesVariant.Signature,
    });
    if (!plan) throw new Error('E8 Signature 50K plan not found');
    return plan;
}

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

function modeledLiveAccount(plan: Plan, balanceAbove: number): ReconstructedAccount {
    const applicability = livePlanApplicability(plan.id);
    if (applicability.kind !== LiveApplicabilityKind.Builder) {
        throw new Error('expected a modeled live builder');
    }
    const livePlan = applicability.builder(applicability.defaultCushionPercent);
    const state = livePlan.initialState();
    state.balance += balanceAbove;
    return {
        assumptions: [],
        cushion: state.balance - state.threshold,
        kind: ReconstructedLiveKind.Live,
        livePlan,
        plan,
        state,
    };
}

function notModeledLiveAccount(plan: Plan): ReconstructedAccount {
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

function topStepPlan(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep Standard/Standard 50K plan not found');
    return plan;
}

describe('milestoneState (F-V17, PT-65a step 2)', () => {
    it('eval: moves the state to balance = target, carrying elapsed progress', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = evalAccount(plan, { qualifyingDays: 3, tradingDays: 3 });

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Eval) {
            throw new Error('expected an eval milestone');
        }

        expect(outcome.state.balance).toBe(
            account.state.startingBalance + plan.profitTarget,
        );
        expect(outcome.state.qualifyingDays).toBe(3);
        expect(outcome.state.tradingDays).toBe(3);
    });

    it('eval: lists MinTradingDaysNotMet when the plan needs more trading days than elapsed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = evalAccount(plan, { tradingDays: 0 });

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Eval) {
            throw new Error('expected an eval milestone');
        }

        expect(outcome.unmetGates.includes(EvalMilestoneGap.MinTradingDaysNotMet)).toBe(
            plan.minTradingDays > 0,
        );
    });

    it('eval: lists ConsistencyNotMet exactly when the plan has an eval consistency rule', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = evalAccount(plan, {
            bestDayProfit: plan.profitTarget,
            tradingDays: plan.minTradingDays,
        });

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Eval) {
            throw new Error('expected an eval milestone');
        }

        expect(outcome.unmetGates.includes(EvalMilestoneGap.ConsistencyNotMet)).toBe(
            plan.evalConsistencyRule() !== null,
        );
    });

    it('eval: flags ConsistencyNotMet when the milestone-closing trade alone would blow the best-day share, even though the pre-existing best day was small', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = evalAccount(plan, {
            balance: plan.initialState().startingBalance + 1000,
            bestDayProfit: 100,
            tradingDays: plan.minTradingDays,
        });

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Eval) {
            throw new Error('expected an eval milestone');
        }

        expect(outcome.state.bestDayProfit).toBe(
            plan.profitTarget - 1000,
        );
        expect(outcome.unmetGates.includes(EvalMilestoneGap.ConsistencyNotMet)).toBe(
            true,
        );
    });

    it('funded: debits the effective payout request and applies the post-payout floor', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 51_500 });

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Funded) {
            throw new Error('expected a funded milestone');
        }

        const resolvedPlan = resolveDocumentedPlan(plan, spec.enginePolicy);
        const expectedDebited = resolveDocumentedPayoutRequestSize(
            resolvedPlan,
            spec.enginePolicy,
            spec.rulebook.payout,
        );
        const expectedBalance = account.state.balance - expectedDebited;
        expect(outcome.debited).toBe(expectedDebited);
        expect(outcome.state.balance).toBe(expectedBalance);
        expect(outcome.state.threshold).toBe(
            postPayoutThreshold(
                resolvedPlan.fundedDrawdown,
                { ...account.state, balance: expectedBalance },
                resolvedPlan.payoutFloorEffect,
                resolvedPlan.accountSize,
            ),
        );
    });

    it('rejects a spec whose retained cushion request breaks Hard Rule 2, before computing a payout or withdrawal', () => {
        const plan = rapidEodPlan();
        const spec: DocumentedPolicySpec = {
            ...specFor(plan),
            enginePolicy: {
                ...policyFor(plan),
                retainedCushionRequest: 500,
            },
        };
        const account = fundedAccount(plan, { balance: 51_500 });

        expect(() => milestoneState(account, spec)).toThrow(/Hard Rule 2/);
    });

    it('live: not modeled gives the plan-level typed reason (E8 runs no live program)', () => {
        const plan = e8SignaturePlan();
        const spec = specFor(plan);
        const account = notModeledLiveAccount(plan);

        expect(milestoneState(account, spec)).toStrictEqual({
            kind: 'not-modeled',
            reason: LiveNotModeledReason.FirmRunsNoLiveProgram,
        });
    });

    it('live: applies the next live payout when a live builder is modeled', () => {
        const plan = topStepPlan();
        const spec = specFor(plan);
        const account = modeledLiveAccount(plan, 5000);
        if (account.kind !== ReconstructedLiveKind.Live || account.state === null || account.livePlan === null) {
            throw new Error('expected a modeled live account');
        }

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Live) {
            throw new Error('expected a live milestone');
        }

        const retainedCushion = dollars(
            resolveDocumentedRetainedCushion(spec.enginePolicy, spec.rulebook.payout),
        );
        const expectedDebited = account.livePlan.payoutRequestAmount(
            account.state,
            retainedCushion,
            undefined,
        );
        expect(outcome.debited).toBe(expectedDebited);
        if (expectedDebited > 0) {
            expect(outcome.state.balance).toBe(
                account.state.balance - expectedDebited,
            );
        } else {
            expect(outcome.state.balance).toBe(account.state.balance);
        }
    });

    it('is deterministic and does not mutate the given account state', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 51_500 });
        const before = { ...account.state };

        expect(milestoneState(account, spec)).toStrictEqual(
            milestoneState(account, spec),
        );
        expect(account.state).toStrictEqual(before);
    });
});
