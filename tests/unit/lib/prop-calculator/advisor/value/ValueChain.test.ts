import { describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    type EnginePolicy,
    resolveDocumentedRetainedCushion,
} from '~/lib/prop-calculator/advisor/policy';
import {
    accountAfterClosedSession,
    MilestoneKind,
    milestoneState,
} from '~/lib/prop-calculator/advisor/value/MilestoneState';
import { valueAtState } from '~/lib/prop-calculator/advisor/value/ValueAtState';
import {
    evalStartAccount,
    firstPayoutEligibleAccount,
    freshFundedAccount,
    fundedTrackerAfterMilestonePayout,
    postFirstPayoutAccount,
    requestNowValue,
    valueChain,
    ValueChainStepKind,
} from '~/lib/prop-calculator/advisor/value/ValueChain';
import { isValueResult } from '~/lib/prop-calculator/advisor/value/ValueEstimate';
import {
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    ONE_CENT,
    type Plan,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';

function eligibleFundedMilestone() {
    const plan = rapidEodPlan();
    const spec = specFor(plan);
    const account = firstPayoutEligibleAccount(
        plan,
        freshFundedAccount(plan),
        spec,
    );
    const milestone = milestoneState(account, spec);
    if (milestone.kind !== MilestoneKind.Funded) {
        throw new Error('expected a funded milestone');
    }
    return { account, milestone, plan, spec };
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
        const firstPayoutEligible = firstPayoutEligibleAccount(
            plan,
            freshFunded,
            spec,
        );
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
        const firstPayoutEligible = firstPayoutEligibleAccount(
            plan,
            freshFunded,
            spec,
        );
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

    it('TopStep 50K: the chain no longer throws at the post-first-payout step under the default rulebook', () => {
        const plan = findFirm(FirmId.TopStep)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        if (!plan) throw new Error('TopStep Standard/Standard 50K plan not found');
        const spec = specFor(plan);

        const result = valueChain(plan, spec);

        expect(result.steps.map((step) => step.kind)).toEqual([
            ValueChainStepKind.EvalStart,
            ValueChainStepKind.FreshFunded,
            ValueChainStepKind.FirstPayoutEligible,
            ValueChainStepKind.PostFirstPayout,
        ]);
    });

    it('TopStep 50K: the first-payout-eligible account can take the documented request, and the account after it is not busted', () => {
        const plan = findFirm(FirmId.TopStep)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        if (!plan) throw new Error('TopStep Standard/Standard 50K plan not found');
        const spec = specFor(plan);
        const eligible = firstPayoutEligibleAccount(
            plan,
            freshFundedAccount(plan),
            spec,
        );

        const milestone = milestoneState(eligible, spec);
        if (milestone.kind !== MilestoneKind.Funded) {
            throw new Error('expected a funded milestone');
        }
        const post = postFirstPayoutAccount(eligible, spec);

        expect(milestone.debited).toBeGreaterThan(0);
        expect(plan.isBust(post.state, TradingPhase.Funded)).toBe(false);
        expect(post.state.balance - post.state.threshold).toBeGreaterThanOrEqual(
            0,
        );
    });

    it('does not move the first payout eligible state for a plan whose minimum payout profit already covers the request and the retained cushion', () => {
        const plan = rapidEodPlan();
        const spec: DocumentedPolicySpec = {
            ...specFor(plan),
            enginePolicy: { ...policyFor(plan), retainedCushionRequest: 0 },
            rulebook: {
                ...DEFAULT_RULEBOOK,
                payout: { ...DEFAULT_RULEBOOK.payout, allowBelowHardRule2: true },
            },
        };
        const fresh = freshFundedAccount(plan);
        const eligible = firstPayoutEligibleAccount(plan, fresh, spec);

        expect(eligible.state.balance - fresh.state.balance).toBe(
            plan.minPayoutProfit,
        );
        expect(
            plan.isBust(
                postFirstPayoutAccount(eligible, spec).state,
                TradingPhase.Funded,
            ),
        ).toBe(false);
    });

    it('builds the first payout eligible account through the same day close as a closed session', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const fresh = freshFundedAccount(plan);
        const eligible = firstPayoutEligibleAccount(plan, fresh, spec);
        const profit = eligible.state.balance - fresh.state.balance;

        expect(eligible).toEqual(accountAfterClosedSession(fresh, profit));
        expect(eligible.state.todayPnL).toBe(0);
        expect(eligible.fundedTracker?.cycleBestDayProfit).toBe(profit);
        expect(eligible.fundedTracker?.lastPayoutBalance).toBe(
            fresh.state.balance,
        );
    });

    it('moves the first payout eligible state up until the documented request keeps the retained cushion', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const fresh = freshFundedAccount(plan);
        const eligible = firstPayoutEligibleAccount(plan, fresh, spec);
        const milestone = milestoneState(eligible, spec);
        if (milestone.kind !== MilestoneKind.Funded) {
            throw new Error('expected a funded milestone');
        }

        expect(eligible.state.balance - fresh.state.balance).toBeGreaterThan(
            plan.minPayoutProfit,
        );
        expect(
            milestone.state.balance - milestone.state.threshold,
        ).toBeGreaterThanOrEqual(
            resolveDocumentedRetainedCushion(
                spec.enginePolicy,
                spec.rulebook.payout,
            ),
        );
    });

    describe('requestNowValue (the one request-now construction)', () => {
        it('values the account after the payout with the advanced cycle tracker, never the stale one', () => {
            const { account, milestone, spec } = eligibleFundedMilestone();

            const result = requestNowValue(account, milestone, spec);

            const expected = valueAtState(
                {
                    ...account,
                    fundedTracker: fundedTrackerAfterMilestonePayout(
                        account,
                        milestone,
                    ),
                    state: milestone.state,
                },
                spec,
            );
            if (!isValueResult(expected)) throw new Error('expected a value');
            expect(result.continuation).toEqual(expected);
        });

        it('adds the cash the trader receives to both credit bases and leaves the standard errors unchanged', () => {
            const { account, milestone, plan, spec } = eligibleFundedMilestone();

            const result = requestNowValue(account, milestone, spec);

            const received = plan.payoutFromProfit(
                milestone.debited,
                account.fundedTracker?.payoutsIssued ?? 0,
            );
            expect(result.traderReceives).toBe(received);
            expect(result.traderReceives).toBe(milestone.traderReceives);
            expect(result.requestNow.creditFree.value).toBeCloseTo(
                result.continuation.creditFree.value + received,
                8,
            );
            expect(result.requestNow.creditInclusive.value).toBeCloseTo(
                result.continuation.creditInclusive.value + received,
                8,
            );
            expect(result.requestNow.creditFree.standardError).toBe(
                result.continuation.creditFree.standardError,
            );
            expect(result.requestNow.creditInclusive.standardError).toBe(
                result.continuation.creditInclusive.standardError,
            );
            expect(result.requestNow.seed).toBe(spec.run.seed);
            expect(result.requestNow.trials).toBe(spec.run.trials);
        });

        it('refuses an account without its funded cycle tracker', () => {
            const { account, milestone, spec } = eligibleFundedMilestone();

            expect(() =>
                requestNowValue({ ...account, fundedTracker: null }, milestone, spec),
            ).toThrow(/funded cycle tracker/);
        });
    });

    describe('every registry plan', () => {
        const plans = ALL_FIRMS.flatMap((firm) => firm.plans);

        it('has a first-payout-eligible account whose documented request keeps the retained cushion', () => {
            const failures: string[] = [];
            for (const plan of plans) {
                const spec = specFor(plan);
                const label = JSON.stringify(plan.id);
                try {
                    const eligible = firstPayoutEligibleAccount(
                        plan,
                        freshFundedAccount(plan),
                        spec,
                    );
                    const milestone = milestoneState(eligible, spec);
                    if (milestone.kind !== MilestoneKind.Funded) {
                        failures.push(`${label}: not a funded milestone`);
                        continue;
                    }
                    const after =
                        milestone.state.balance - milestone.state.threshold;
                    const required = Math.max(
                        resolveDocumentedRetainedCushion(
                            spec.enginePolicy,
                            spec.rulebook.payout,
                        ),
                        ONE_CENT,
                    );
                    if (after < required) {
                        failures.push(`${label}: cushion ${after} < ${required}`);
                    }
                    const cycleProfit =
                        eligible.state.balance -
                        (eligible.fundedTracker?.lastPayoutBalance ?? NaN);
                    if (!(cycleProfit >= plan.minPayoutProfit)) {
                        failures.push(
                            `${label}: cycle profit ${cycleProfit} < ${plan.minPayoutProfit}`,
                        );
                    }
                } catch (error) {
                    failures.push(`${label}: threw ${String(error)}`);
                }
            }
            expect(failures).toEqual([]);
        });
    });

    it('refuses loudly when no profit within reach keeps the retained cushion after the documented request', () => {
        const plan = rapidEodPlan();
        const spec: DocumentedPolicySpec = {
            ...specFor(plan),
            enginePolicy: {
                ...policyFor(plan),
                retainedCushionRequest: plan.accountSize * 10,
            },
        };

        expect(() =>
            firstPayoutEligibleAccount(plan, freshFundedAccount(plan), spec),
        ).toThrow(/no first-payout-eligible account/);
    });
});
