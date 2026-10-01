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
    accountAfterClosedSession,
    closedSessionOf,
    EvalMilestoneGap,
    MilestoneKind,
    milestoneState,
} from '~/lib/prop-calculator/advisor/value/MilestoneState';
import {
    type AccountState,
    dollars,
    E8FuturesVariant,
    evalStartStateIssue,
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

function modeledLiveAccount(
    plan: Plan,
    balanceAbove: number,
): ReconstructedAccount {
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
    it('eval: moves the state to balance = target and counts the closing day, carrying elapsed progress', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = evalAccount(plan, {
            qualifyingDays: 3,
            tradingDays: 3,
        });

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Eval) {
            throw new Error('expected an eval milestone');
        }

        expect(outcome.state.balance).toBe(
            account.state.startingBalance + plan.profitTarget,
        );
        expect(outcome.state.qualifyingDays).toBe(4);
        expect(outcome.state.tradingDays).toBe(4);
    });

    it('eval: returns a session-start state, so callers never compose resetForNewDay themselves', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = evalAccount(plan, { elapsedDays: 3, tradingDays: 3 });

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Eval) {
            throw new Error('expected an eval milestone');
        }

        expect(outcome.state.todayPnL).toBe(0);
        expect(outcome.state.elapsedDays).toBe(4);
        expect(
            evalStartStateIssue(plan, outcome.state, 40)?.includes(
                'todayPnL',
            ) ?? false,
        ).toBe(false);
    });

    it('eval: lists MinTradingDaysNotMet when the plan needs more trading days than elapsed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = evalAccount(plan, { tradingDays: 0 });

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Eval) {
            throw new Error('expected an eval milestone');
        }

        expect(
            outcome.unmetGates.includes(EvalMilestoneGap.MinTradingDaysNotMet),
        ).toBe(plan.minTradingDays > 0);
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

        expect(
            outcome.unmetGates.includes(EvalMilestoneGap.ConsistencyNotMet),
        ).toBe(plan.evalConsistencyRule() !== null);
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

        expect(outcome.state.bestDayProfit).toBe(plan.profitTarget - 1000);
        expect(
            outcome.unmetGates.includes(EvalMilestoneGap.ConsistencyNotMet),
        ).toBe(true);
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

    it('funded: carries the cash the trader receives for the debited request, net of the split and the payouts already issued', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 51_500 });

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Funded) {
            throw new Error('expected a funded milestone');
        }

        expect(outcome.traderReceives).toBe(
            plan.payoutFromProfit(
                outcome.debited,
                account.fundedTracker?.payoutsIssued ?? 0,
            ),
        );
        expect(outcome.traderReceives).toBeGreaterThan(0);
        expect(outcome.traderReceives).toBeLessThanOrEqual(outcome.debited);
    });

    it('funded: refuses an account without its funded cycle tracker, which the cash depends on', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account: ReconstructedFundedOrEvalAccount = {
            ...fundedAccount(plan, { balance: 51_500 }),
            fundedTracker: null,
        };

        expect(() => milestoneState(account, spec)).toThrow(
            /funded cycle tracker/,
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
        if (
            account.kind !== ReconstructedLiveKind.Live ||
            account.state === null ||
            account.livePlan === null
        ) {
            throw new Error('expected a modeled live account');
        }

        const outcome = milestoneState(account, spec);
        if (outcome.kind !== MilestoneKind.Live) {
            throw new Error('expected a live milestone');
        }

        const retainedCushion = dollars(
            resolveDocumentedRetainedCushion(
                spec.enginePolicy,
                spec.rulebook.payout,
            ),
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

describe('accountAfterClosedSession (PT-67b step 1)', () => {
    it('eval: closes the day through the ledger, with todayPnL back at 0', () => {
        const plan = rapidEodPlan();
        const account = evalAccount(plan, {
            elapsedDays: 2,
            qualifyingDays: 1,
            tradingDays: 2,
        });

        const closed = accountAfterClosedSession(account, 600);

        expect(closed.state.balance).toBe(account.state.balance + 600);
        expect(closed.state.todayPnL).toBe(0);
        expect(closed.state.tradingDays).toBe(3);
        expect(closed.state.elapsedDays).toBe(3);
        expect(closed.state.bestDayProfit).toBe(600);
        expect(closed.state.threshold).toBeGreaterThan(account.state.threshold);
        expect(closed.cushion).toBe(
            closed.state.balance - closed.state.threshold,
        );
        expect(account.state.todayPnL).toBe(0);
        expect(account.state.tradingDays).toBe(2);
    });

    it('eval: a losing day leaves the best day and the floor where they were', () => {
        const plan = rapidEodPlan();
        const account = evalAccount(plan, {
            bestDayProfit: 300,
            tradingDays: 2,
        });

        const closed = accountAfterClosedSession(account, -250);

        expect(closed.state.bestDayProfit).toBe(300);
        expect(closed.state.threshold).toBe(account.state.threshold);
        expect(closed.state.todayPnL).toBe(0);
    });

    it('funded: counts the day as the cycle best day on a fresh tracker object and advances the session count', () => {
        const plan = rapidEodPlan();
        const account = fundedAccount(plan, { balance: 50_800 });
        const priorTracker = account.fundedTracker;
        if (priorTracker === null) throw new Error('expected a funded tracker');

        const closed = accountAfterClosedSession(account, 500);

        expect(closed.fundedTracker).not.toBe(priorTracker);
        expect(closed.fundedTracker?.cycleBestDayProfit).toBe(500);
        expect(closed.fundedTracker?.sessionDaysSinceAnchor).toBe(0);
        expect(closed.state.todayPnL).toBe(0);
        expect(closed.state.qualifyingDays).toBe(
            account.state.qualifyingDays +
                (500 >= (plan.minQualifyingDayProfit ?? -Infinity) ? 1 : 0),
        );
        expect(priorTracker.cycleBestDayProfit).toBe(0);
        expect(priorTracker.sessionDaysSinceAnchor).toBeNull();
    });

    it('funded: a smaller day never lowers the cycle best day', () => {
        const plan = rapidEodPlan();
        const account = fundedAccount(plan, { balance: 50_800 });
        if (account.fundedTracker === null)
            throw new Error('expected a funded tracker');
        account.fundedTracker.cycleBestDayProfit = 700;

        const closed = accountAfterClosedSession(account, 200);

        expect(closed.fundedTracker?.cycleBestDayProfit).toBe(700);
    });

    it('funded: refuses an account without its cycle tracker', () => {
        const plan = rapidEodPlan();
        const account: ReconstructedFundedOrEvalAccount = {
            ...fundedAccount(plan),
            fundedTracker: null,
        };

        expect(() => accountAfterClosedSession(account, 100)).toThrow(
            /funded cycle tracker/,
        );
    });
});

describe('closedSessionOf (a session of several trades)', () => {
    it('closes the day once over all the trades and leaves the session start state', () => {
        const plan = rapidEodPlan();
        const account = evalAccount(plan);

        const session = closedSessionOf(account, [-300, -200]);

        expect(session.isBusted).toBe(false);
        expect(session.isDayEnded).toBe(false);
        expect(session.account.state.balance).toBe(account.state.balance - 500);
        expect(session.account.state.todayPnL).toBe(0);
        expect(session.account.state.tradingDays).toBe(
            account.state.tradingDays + 1,
        );
    });

    it('stops at the trade that busts and reports the bust, though the reset state is alive', () => {
        const plan = rapidEodPlan();
        const account = evalAccount(plan);
        const cushion = account.state.balance - account.state.threshold;

        const session = closedSessionOf(account, [-cushion, -100]);

        expect(session.isBusted).toBe(true);
        expect(session.isDayEnded).toBe(true);
        expect(session.account.state.balance).toBe(
            account.state.balance - cushion,
        );
    });

    it('agrees with accountAfterClosedSession for one trade', () => {
        const plan = rapidEodPlan();
        const account = fundedAccount(plan, { balance: 50_800 });

        expect(closedSessionOf(account, [500]).account).toEqual(
            accountAfterClosedSession(account, 500),
        );
    });
});
