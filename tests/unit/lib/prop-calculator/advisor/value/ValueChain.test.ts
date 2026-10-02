import { describe, expect, it } from 'vitest';

import { formatCurrency } from '~/lib/format';
import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    type EnginePolicy,
    resolveDocumentedPayoutRequestSize,
    resolveDocumentedPlan,
    resolveDocumentedRetainedCushion,
    toSimInputs,
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
    VALUE_CHAIN_STEP_ORDER,
    valueChain,
    ValueChainStepKind,
} from '~/lib/prop-calculator/advisor/value/ValueChain';
import { isValueResult } from '~/lib/prop-calculator/advisor/value/ValueEstimate';
import {
    dollars,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    ONE_CENT,
    PayoutDayGateBasis,
    PayoutEvaluationKind,
    PayoutRequestPolicy,
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

function eligibleStepAssumptions() {
    const plan = rapidEodPlan();
    const spec = specFor(plan);
    const result = valueChain(plan, spec);
    const step = result.steps.find(
        (candidate) =>
            candidate.kind === ValueChainStepKind.FirstPayoutEligible,
    );
    if (step === undefined) throw new Error('missing eligible step');
    const fresh = freshFundedAccount(plan);
    const account = firstPayoutEligibleAccount(plan, fresh, spec);
    const milestone = milestoneState(account, spec);
    if (milestone.kind !== MilestoneKind.Funded) {
        throw new Error('expected a funded milestone');
    }
    return {
        account,
        fresh,
        milestone,
        plan,
        spec,
        text: step.assumptions.join('\n'),
    };
}

function eligibleText(plan: Plan, spec: DocumentedPolicySpec): string {
    const step = valueChain(plan, spec).steps.find(
        (candidate) =>
            candidate.kind === ValueChainStepKind.FirstPayoutEligible,
    );
    return step?.assumptions.join('\n') ?? '';
}

function mffuProPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro 50K plan not found');
    return plan;
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

function unreachableCushionSpecFor(plan: Plan): DocumentedPolicySpec {
    return {
        ...specFor(plan),
        enginePolicy: {
            ...policyFor(plan),
            retainedCushionRequest: plan.accountSize * 10,
        },
    };
}

describe('VALUE_CHAIN_STEP_ORDER (PT-67d)', () => {
    it('lists every step kind once, in the order valueChain builds them', () => {
        const plan = rapidEodPlan();

        const result = valueChain(plan, specFor(plan));

        expect(new Set(VALUE_CHAIN_STEP_ORDER)).toEqual(
            new Set(Object.values(ValueChainStepKind)),
        );
        expect(VALUE_CHAIN_STEP_ORDER).toHaveLength(
            Object.values(ValueChainStepKind).length,
        );
        expect(result.steps.map((step) => step.kind)).toEqual(
            VALUE_CHAIN_STEP_ORDER,
        );
    });
});

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
        if (
            result.accountValue === null ||
            !isValueResult(result.accountValue)
        ) {
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
                plan.payoutFromProfit(
                    milestone.debited,
                    priorTracker.payoutsIssued,
                ),
        );
    });

    it('TopStep 50K: the chain no longer throws at the post-first-payout step under the default rulebook', () => {
        const plan = findFirm(FirmId.TopStep)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        if (!plan)
            throw new Error('TopStep Standard/Standard 50K plan not found');
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
        if (!plan)
            throw new Error('TopStep Standard/Standard 50K plan not found');
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
        expect(
            post.state.balance - post.state.threshold,
        ).toBeGreaterThanOrEqual(0);
    });

    it('clamps a retained cushion below the plan floor up to the floor, the same as the simulator does', () => {
        const plan = rapidEodPlan();
        const floor = plan.resolveRetainedCushion(0);
        const specWith = (
            retainedCushionRequest: number,
        ): DocumentedPolicySpec => ({
            ...specFor(plan),
            enginePolicy: { ...policyFor(plan), retainedCushionRequest },
            rulebook: {
                ...DEFAULT_RULEBOOK,
                payout: {
                    ...DEFAULT_RULEBOOK.payout,
                    allowBelowHardRule2: true,
                },
            },
        });
        const fresh = freshFundedAccount(plan);

        const belowFloor = firstPayoutEligibleAccount(plan, fresh, specWith(0));
        const atFloor = firstPayoutEligibleAccount(
            plan,
            fresh,
            specWith(floor),
        );
        const post = postFirstPayoutAccount(belowFloor, specWith(0));

        expect(floor).toBeGreaterThan(0);
        expect(belowFloor).toEqual(atFloor);
        expect(
            post.state.balance - post.state.threshold,
        ).toBeGreaterThanOrEqual(floor);
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
            const { account, milestone, plan, spec } =
                eligibleFundedMilestone();

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
                requestNowValue(
                    { ...account, fundedTracker: null },
                    milestone,
                    spec,
                ),
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
                        failures.push(
                            `${label}: cushion ${after} < ${required}`,
                        );
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

    describe('every registry plan passes its own funded payout gates at the first-payout-eligible state', () => {
        const plans = ALL_FIRMS.flatMap((firm) => firm.plans);

        it('gets a payout, not a block, from the engine own payout evaluation', () => {
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
                    const { fundedTracker } = eligible;
                    if (fundedTracker === null) {
                        failures.push(`${label}: no funded tracker`);
                        continue;
                    }
                    const evaluation = fundedTracker.evaluatePayout({
                        minRetainedCushion: resolveDocumentedRetainedCushion(
                            spec.enginePolicy,
                            spec.rulebook.payout,
                        ),
                        payoutRequestPolicy:
                            PayoutRequestPolicy.FullRequestOnly,
                        payoutRequestSize: resolveDocumentedPayoutRequestSize(
                            plan,
                            spec.enginePolicy,
                            spec.rulebook.payout,
                        ),
                        plan: resolveDocumentedPlan(plan, spec.enginePolicy),
                        state: eligible.state,
                    });
                    if (evaluation.kind !== PayoutEvaluationKind.Eligible) {
                        failures.push(
                            `${label}: blocked by ${evaluation.gate}`,
                        );
                    }
                } catch (error) {
                    failures.push(`${label}: threw ${String(error)}`);
                }
            }
            expect(failures).toEqual([]);
        });

        it('keeps the post-first-payout account alive under the same plan', () => {
            const failures: string[] = [];
            for (const plan of plans) {
                const spec = specFor(plan);
                const label = JSON.stringify(plan.id);
                try {
                    const post = postFirstPayoutAccount(
                        firstPayoutEligibleAccount(
                            plan,
                            freshFundedAccount(plan),
                            spec,
                        ),
                        spec,
                    );
                    if (plan.isBust(post.state, TradingPhase.Funded)) {
                        failures.push(`${label}: busted after the payout`);
                    }
                } catch (error) {
                    failures.push(`${label}: threw ${String(error)}`);
                }
            }
            expect(failures).toEqual([]);
        });
    });

    describe('every registry plan settles at the first-payout-eligible state the amount the engine settles', () => {
        const plans = ALL_FIRMS.flatMap((firm) => firm.plans);
        const requestScales = [1, 5, 20];

        it.each(requestScales)(
            'debits and pays the trader exactly what the engine own payout evaluation settles for a documented request of %d times the default',
            (scale) => {
                const failures: string[] = [];
                for (const plan of plans) {
                    const base = specFor(plan);
                    const spec: DocumentedPolicySpec = {
                        ...base,
                        enginePolicy: {
                            ...base.enginePolicy,
                            payoutRequestOverride:
                                resolveDocumentedPayoutRequestSize(
                                    plan,
                                    base.enginePolicy,
                                    base.rulebook.payout,
                                ) * scale,
                        },
                    };
                    const label = JSON.stringify(plan.id);
                    let eligible: ReconstructedFundedOrEvalAccount;
                    try {
                        eligible = firstPayoutEligibleAccount(
                            plan,
                            freshFundedAccount(plan),
                            spec,
                        );
                    } catch (error) {
                        failures.push(`${label}: threw ${String(error)}`);
                        continue;
                    }
                    const evaluation = eligible.fundedTracker?.evaluatePayout({
                        minRetainedCushion: plan.resolveRetainedCushion(
                            resolveDocumentedRetainedCushion(
                                spec.enginePolicy,
                                spec.rulebook.payout,
                            ),
                        ),
                        payoutRequestPolicy:
                            PayoutRequestPolicy.FullRequestOnly,
                        payoutRequestSize: resolveDocumentedPayoutRequestSize(
                            plan,
                            spec.enginePolicy,
                            spec.rulebook.payout,
                        ),
                        plan: resolveDocumentedPlan(plan, spec.enginePolicy),
                        state: eligible.state,
                    });
                    const milestone = milestoneState(eligible, spec);
                    if (
                        evaluation?.kind !== PayoutEvaluationKind.Eligible ||
                        milestone.kind !== MilestoneKind.Funded
                    ) {
                        failures.push(`${label}: no eligible funded milestone`);
                        continue;
                    }
                    if (
                        Math.abs(milestone.debited - evaluation.debited) >
                            ONE_CENT ||
                        Math.abs(
                            milestone.traderReceives -
                                evaluation.traderReceives,
                        ) > ONE_CENT
                    ) {
                        failures.push(
                            `${label}: milestone debits ${milestone.debited} and pays ${milestone.traderReceives}, engine settles ${evaluation.debited} and pays ${evaluation.traderReceives}`,
                        );
                    }
                }
                expect(failures).toEqual([]);
            },
        );
    });

    describe('the post-first-payout tracker carries the cycle the way the engine settle does', () => {
        const plans = ALL_FIRMS.flatMap((firm) => firm.plans);

        it('keeps a perpetual consistency best day at the equal day profit, and clears it for every other plan', () => {
            const failures: string[] = [];
            let perpetualPlans = 0;
            for (const plan of plans) {
                const rule = plan.fundedConsistencyRule(0);
                const spec = specFor(plan);
                const fresh = freshFundedAccount(plan);
                const eligible = firstPayoutEligibleAccount(plan, fresh, spec);
                const post = postFirstPayoutAccount(eligible, spec);
                const label = JSON.stringify(plan.id);
                if (rule?.isPerpetual() !== true) {
                    if (post.fundedTracker?.cycleBestDayProfit !== 0) {
                        failures.push(`${label}: best day not cleared`);
                    }
                    continue;
                }
                perpetualPlans += 1;
                const profit = eligible.state.balance - fresh.state.balance;
                const bestDay = post.fundedTracker?.cycleBestDayProfit ?? NaN;
                const sessions = Math.round(profit / bestDay);
                if (!(sessions > 1)) {
                    failures.push(
                        `${label}: best day ${bestDay} is all of ${profit}`,
                    );
                }
                if (Math.abs(bestDay * sessions - profit) > ONE_CENT) {
                    failures.push(
                        `${label}: best day ${bestDay} is not an equal share of ${profit}`,
                    );
                }
                if (!(bestDay <= rule.maxBestDayShare * profit)) {
                    failures.push(
                        `${label}: best day ${bestDay} breaks the share`,
                    );
                }
            }
            expect(perpetualPlans).toBeGreaterThan(0);
            expect(failures).toEqual([]);
        });

        it('restarts the day gate after the milestone payout on a calendar-day plan and on a qualifying-day plan', () => {
            const failures: string[] = [];
            const bases = new Set<PayoutDayGateBasis>();
            for (const plan of plans) {
                const spec = specFor(plan);
                const eligible = firstPayoutEligibleAccount(
                    plan,
                    freshFundedAccount(plan),
                    spec,
                );
                const post = postFirstPayoutAccount(eligible, spec);
                const label = JSON.stringify(plan.id);
                bases.add(plan.payoutDayGateBasis);
                if (
                    post.fundedTracker === null ||
                    eligible.fundedTracker === null
                ) {
                    failures.push(`${label}: no funded tracker`);
                    continue;
                }
                if (
                    eligible.fundedTracker.dayGateProgress(
                        plan,
                        eligible.state,
                    ) <= 0
                ) {
                    failures.push(
                        `${label}: no day gate progress before the payout`,
                    );
                }
                if (
                    post.fundedTracker.dayGateProgress(plan, post.state) !== 0
                ) {
                    failures.push(`${label}: day gate did not restart`);
                }
                if (
                    post.state.qualifyingDays !==
                    post.fundedTracker.qualifyingDaysAtLastPayout
                ) {
                    failures.push(`${label}: qualifying day anchor not moved`);
                }
            }
            for (const basis of Object.values(PayoutDayGateBasis)) {
                expect(bases.has(basis)).toBe(true);
            }
            expect(failures).toEqual([]);
        });
    });

    it('closes several equal winning sessions on a plan with a funded consistency share, each at most the allowed share of the cycle profit', () => {
        const failures: string[] = [];
        const plans = ALL_FIRMS.flatMap((firm) => firm.plans);
        for (const plan of plans) {
            const rule = plan.fundedConsistencyRule(0);
            if (rule === null) continue;
            const eligible = firstPayoutEligibleAccount(
                plan,
                freshFundedAccount(plan),
                specFor(plan),
            );
            const { fundedTracker } = eligible;
            const cycleProfit =
                eligible.state.balance -
                (fundedTracker?.lastPayoutBalance ?? NaN);
            const bestDay = fundedTracker?.cycleBestDayProfit ?? NaN;
            if (!(bestDay <= rule.maxBestDayShare * cycleProfit)) {
                failures.push(
                    `${JSON.stringify(plan.id)}: best day ${bestDay} of ${cycleProfit}, share limit ${rule.maxBestDayShare}`,
                );
            }
        }
        expect(failures).toEqual([]);
    });

    describe('a chain step that cannot be built fails only itself', () => {
        it('keeps the eval start and fresh funded steps and reports the steps that depend on the first-payout-eligible state', () => {
            const plan = rapidEodPlan();

            const result = valueChain(plan, unreachableCushionSpecFor(plan));

            expect(result.steps.map((step) => step.kind)).toEqual([
                ValueChainStepKind.EvalStart,
                ValueChainStepKind.FreshFunded,
            ]);
            expect(result.failedSteps.map((step) => step.kind)).toEqual([
                ValueChainStepKind.FirstPayoutEligible,
                ValueChainStepKind.PostFirstPayout,
            ]);
            expect(result.failedSteps[0]?.reason).toMatch(
                /no first-payout-eligible account/,
            );
            expect(result.failedSteps[1]?.reason).toMatch(
                /first-payout-eligible step failed/,
            );
        });

        it('reports no failed step when every step builds', () => {
            const plan = rapidEodPlan();

            expect(valueChain(plan, specFor(plan)).failedSteps).toEqual([]);
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

    describe('the first-payout-eligible step states how it was built (PT-67d)', () => {
        it('gives every built step its own assumptions', () => {
            const plan = rapidEodPlan();

            const result = valueChain(plan, specFor(plan));

            expect(result.steps.map((step) => step.kind)).toEqual(
                VALUE_CHAIN_STEP_ORDER,
            );
            for (const step of result.steps) {
                expect(step.assumptions.length).toBeGreaterThan(0);
            }
        });

        it('states the simulation basis, strategy, request, cushion and rebuy lag on every step', () => {
            const plan = rapidEodPlan();
            const spec = specFor(plan);
            const { funded, strategy } = spec.rulebook;
            const risk = funded.riskCents / 100;

            for (const step of valueChain(plan, spec).steps) {
                const text = step.assumptions.join('\n');
                expect(text).toContain(
                    `${spec.run.trials} trials with seed ${spec.run.seed}`,
                );
                expect(text).toContain(
                    `${spec.enginePolicy.fundedHorizonDays} funded days`,
                );
                expect(text).toContain(
                    `win rate ${(strategy.winrate * 100).toFixed(0)}%`,
                );
                expect(text).toContain(`R:R ${strategy.rr}`);
                expect(text).toContain(
                    `funded risk ${formatCurrency(risk, 2)} and take-profit ${formatCurrency(risk * strategy.rr, 2)}`,
                );
                expect(text).toContain(
                    `at most ${funded.tradesPerDayMax} trades per day`,
                );
                expect(text).toContain('Documented request');
                expect(text).toContain('Retained cushion');
                expect(text).toContain('Rebuy lag');
            }
        });

        it('names the payout the post-first-payout step assumes', () => {
            const { milestone, plan, spec } = eligibleFundedMilestone();

            const step = valueChain(plan, spec).steps.find(
                (candidate) =>
                    candidate.kind === ValueChainStepKind.PostFirstPayout,
            );

            const text = step?.assumptions.join('\n') ?? '';
            expect(text).toContain(
                `first payout taken from the first-payout-eligible state: ${formatCurrency(milestone.debited, 2)} leaves the account and you receive ${formatCurrency(milestone.traderReceives, 2)}`,
            );
            expect(text).toContain(
                `balance after ${formatCurrency(milestone.state.balance, 2)}`,
            );
        });

        it('says the equal-session state is stylised and compares it with the take-profit and trades-per-day cap', () => {
            const { account, fresh, spec, text } = eligibleStepAssumptions();
            const profit = account.state.balance - fresh.state.balance;
            const takeProfit =
                (spec.rulebook.funded.riskCents / 100) *
                spec.rulebook.strategy.rr;
            const sessions = Number(
                /(\d+) equal winning sessions?/.exec(text)?.[1],
            );
            const winsPerSession = Math.ceil(
                Math.round((profit / sessions) * 100) /
                    Math.round(takeProfit * 100),
            );

            expect(text).toContain('stylised state');
            expect(text).toContain('not a path at your rulebook sizing');
            expect(text).toContain(
                `would need ${winsPerSession} take-profit wins of ${formatCurrency(takeProfit, 2)}`,
            );
            expect(text).toContain(
                `above your cap of ${spec.rulebook.funded.tradesPerDayMax} trades per day`,
            );
            expect(text).toMatch(
                /the whole profit needs at least \d+ trading days? at that cap/,
            );
        });

        it('says within the cap when a session fits inside the trades-per-day cap', () => {
            const plan = findFirm(FirmId.TopStep)?.findPlan({
                accountSize: 50_000,
                firm: FirmId.TopStep,
                variant: TopStepVariant.StandardConsistency,
            });
            if (!plan)
                throw new Error(
                    'TopStep Standard Consistency 50K plan not found',
                );
            const spec = specFor(plan);

            const step = valueChain(plan, spec).steps.find(
                (candidate) =>
                    candidate.kind === ValueChainStepKind.FirstPayoutEligible,
            );

            const text = step?.assumptions.join('\n') ?? '';
            expect(text).toMatch(
                /would need \d+ take-profit wins? of \$500\.00, within your cap of 4 trades per day/,
            );
        });

        it('states the number of equal winning sessions and why that many', () => {
            const { account, fresh, text } = eligibleStepAssumptions();

            const match = /(\d+) equal winning sessions?/.exec(text);
            expect(match).not.toBeNull();
            const sessions = Number(match?.[1]);
            expect(sessions).toBeGreaterThanOrEqual(1);
            const profit = account.state.balance - fresh.state.balance;
            let rebuilt = fresh;
            for (let session = 0; session < sessions; session += 1) {
                rebuilt = accountAfterClosedSession(rebuilt, profit / sessions);
            }
            expect(rebuilt.state.balance).toBeCloseTo(account.state.balance, 6);
            expect(text).toMatch(/payout day gate needs \d+ session/);
        });

        it('states the total profit and the profit per session to the cent', () => {
            const { account, fresh, text } = eligibleStepAssumptions();
            const sessions = Number(
                /(\d+) equal winning sessions?/.exec(text)?.[1],
            );
            const profit = account.state.balance - fresh.state.balance;

            expect(text).toContain(`Total profit ${formatCurrency(profit, 2)}`);
            expect(text).toContain(
                `${formatCurrency(profit / sessions, 2)} per session`,
            );
        });

        it('states one closed trade per session', () => {
            expect(eligibleStepAssumptions().text).toMatch(
                /one closed trade per session/i,
            );
        });

        it('states the documented request and the amount the engine settles and pays', () => {
            const { milestone, plan, spec, text } = eligibleStepAssumptions();
            const request = resolveDocumentedPayoutRequestSize(
                plan,
                spec.enginePolicy,
                spec.rulebook.payout,
            );

            expect(text).toContain(
                `Documented request ${formatCurrency(request, 2)}`,
            );
            expect(text).toContain(
                `the engine settles ${formatCurrency(milestone.debited, 2)}`,
            );
            expect(text).toContain(
                `you receive ${formatCurrency(milestone.traderReceives, 2)}`,
            );
        });

        it('states the retained cushion and its source rule', () => {
            const { plan, spec, text } = eligibleStepAssumptions();
            const cushion = plan.resolveRetainedCushion(
                resolveDocumentedRetainedCushion(
                    spec.enginePolicy,
                    spec.rulebook.payout,
                ),
            );

            expect(text).toContain(
                `Retained cushion ${formatCurrency(cushion, 2)}`,
            );
            expect(text).toContain("the rulebook's retained cushion size");
            expect(text).not.toContain('Hard Rule 2');
            expect(text).not.toContain('your retained cushion entry');
        });

        it('names your own retained cushion entry as the source when you set one', () => {
            const plan = rapidEodPlan();
            const spec: DocumentedPolicySpec = {
                ...specFor(plan),
                enginePolicy: {
                    ...policyFor(plan),
                    retainedCushionRequest: 3000,
                },
            };

            const step = valueChain(plan, spec).steps.find(
                (candidate) =>
                    candidate.kind === ValueChainStepKind.FirstPayoutEligible,
            );

            const text = step?.assumptions.join('\n') ?? '';
            expect(text).toContain('Retained cushion $3,000.00');
            expect(text).toContain('your retained cushion entry');
        });

        it('attributes a $3,000 rulebook cushion to the rulebook size, not Hard Rule 2', () => {
            const plan = rapidEodPlan();
            const rulebook = {
                ...DEFAULT_RULEBOOK,
                payout: {
                    ...DEFAULT_RULEBOOK.payout,
                    retainedCushionCents: 300_000,
                },
            };
            const spec: DocumentedPolicySpec = {
                ...specFor(plan),
                enginePolicy: buildEnginePolicy({
                    fundedHorizonDays: 90,
                    plan,
                    rulebook,
                }).policy,
                rulebook,
            };

            const step = valueChain(plan, spec).steps.find(
                (candidate) =>
                    candidate.kind === ValueChainStepKind.FirstPayoutEligible,
            );

            const text = step?.assumptions.join('\n') ?? '';
            expect(text).toContain('Retained cushion $3,000.00');
            expect(text).toContain("the rulebook's retained cushion size");
            expect(text).not.toContain('Hard Rule 2');
        });

        it('does not call a below-Hard-Rule-2 rulebook cushion Hard Rule 2', () => {
            const plan = rapidEodPlan();
            const rulebook = {
                ...DEFAULT_RULEBOOK,
                payout: {
                    ...DEFAULT_RULEBOOK.payout,
                    allowBelowHardRule2: true,
                    retainedCushionCents: 100_000,
                },
            };
            const spec: DocumentedPolicySpec = {
                ...specFor(plan),
                enginePolicy: buildEnginePolicy({
                    fundedHorizonDays: 90,
                    plan,
                    rulebook,
                }).policy,
                rulebook,
            };

            const step = valueChain(plan, spec).steps.find(
                (candidate) =>
                    candidate.kind === ValueChainStepKind.FirstPayoutEligible,
            );

            const text = step?.assumptions.join('\n') ?? '';
            expect(text).toContain('Retained cushion $2,000.00');
            expect(text).toContain("the rulebook's retained cushion size");
            expect(text).toContain(
                "raised to the plan's own floor from $1,000.00",
            );
            expect(text).not.toContain('Hard Rule 2');
        });
    });

    describe('the documented request states its source (PT-67d)', () => {
        it('names the rulebook payout size as the source of the default request', () => {
            const plan = rapidEodPlan();

            expect(eligibleText(plan, specFor(plan))).toContain(
                "Documented request $500.00 from the rulebook's payout size",
            );
        });

        it('names your own request entry when it differs from the rulebook size', () => {
            const plan = rapidEodPlan();
            const spec: DocumentedPolicySpec = {
                ...specFor(plan),
                enginePolicy: {
                    ...policyFor(plan),
                    payoutRequestOverride: 700,
                },
            };

            const text = eligibleText(plan, spec);

            expect(text).toContain(
                'Documented request $700.00 from your payout request entry',
            );
            expect(text).not.toContain('raised');
        });

        it('says the firm minimum raised the request and from what', () => {
            const plan = mffuProPlan();

            const text = eligibleText(plan, specFor(plan));

            expect(text).toContain(
                "Documented request $1,000.00 from the rulebook's payout size, raised from $500.00 to the firm minimum",
            );
        });
    });
});

function cappedSpecFor(plan: Plan, caps: Partial<PersonalCaps>) {
    return {
        ...specFor(plan),
        enginePolicy: {
            ...policyFor(plan),
            personalCaps: { ...NO_PERSONAL_CAPS, ...caps },
        },
    };
}

function textOf(
    plan: Plan,
    spec: DocumentedPolicySpec,
    kind: ValueChainStepKind,
) {
    const step = valueChain(plan, spec).steps.find(
        (candidate) => candidate.kind === kind,
    );
    return step?.assumptions.join('\n') ?? '';
}

describe('the value chain prints the funded sizing it simulates at the personal limits (PT-68g, F-V16)', () => {
    it('names the capped funded risk and its take profit on every step, equal to the risk the simulator places', () => {
        const plan = rapidEodPlan();
        const spec = cappedSpecFor(plan, { maxRiskPerTrade: dollars(100) });
        const { riskPerTrade } = toSimInputs(plan, spec);

        expect(riskPerTrade).toBe(100);
        for (const step of valueChain(plan, spec).steps) {
            const text = step.assumptions.join('\n');
            expect(text).toContain(
                `funded risk ${formatCurrency(riskPerTrade, 2)} and take-profit ${formatCurrency(riskPerTrade * spec.rulebook.strategy.rr, 2)}`,
            );
            expect(text).not.toContain(
                `funded risk ${formatCurrency(DEFAULT_RULEBOOK.funded.riskCents / 100, 2)} `,
            );
        }
    });

    it('prints the rulebook funded risk when the personal cap sits above it', () => {
        const plan = rapidEodPlan();
        const spec = cappedSpecFor(plan, { maxRiskPerTrade: dollars(5000) });

        expect(textOf(plan, spec, ValueChainStepKind.FreshFunded)).toContain(
            `funded risk ${formatCurrency(DEFAULT_RULEBOOK.funded.riskCents / 100, 2)} and take-profit`,
        );
    });

    it('sizes the session comparison at the capped take profit and the personal trades per day', () => {
        const plan = rapidEodPlan();
        const spec = cappedSpecFor(plan, {
            maxRiskPerTrade: dollars(100),
            maxTradesPerDay: 2,
        });

        const text = textOf(plan, spec, ValueChainStepKind.FirstPayoutEligible);

        expect(text).toMatch(
            /would need \d+ take-profit wins? of \$200\.00, above your cap of 2 trades per day/,
        );
        expect(text).toContain('at most 2 trades per day');
    });

    it('prints the take profit the simulator places when the funded reward multiple differs from the strategy one', () => {
        const plan = rapidEodPlan();
        const base = cappedSpecFor(plan, { maxRiskPerTrade: dollars(100) });
        const spec: DocumentedPolicySpec = {
            ...base,
            rulebook: {
                ...base.rulebook,
                funded: {
                    ...base.rulebook.funded,
                    takeProfitCents: base.rulebook.funded.riskCents * 3,
                },
            },
        };
        const simInputs = toSimInputs(plan, spec);

        expect(simInputs.fundedRrRatio).toBe(3);
        expect(spec.rulebook.strategy.rr).not.toBe(3);
        for (const step of valueChain(plan, spec).steps) {
            expect(step.assumptions.join('\n')).toContain(
                'funded risk $100.00 and take-profit $300.00 per trade',
            );
        }
        expect(
            textOf(plan, spec, ValueChainStepKind.FirstPayoutEligible),
        ).toMatch(/would need \d+ take-profit wins? of \$300\.00,/);
    });

    it('prints the uncapped take profit from the funded multiple too', () => {
        const plan = rapidEodPlan();
        const base = specFor(plan);
        const spec: DocumentedPolicySpec = {
            ...base,
            rulebook: {
                ...base.rulebook,
                funded: {
                    ...base.rulebook.funded,
                    takeProfitCents: base.rulebook.funded.riskCents * 3,
                },
            },
        };

        expect(textOf(plan, spec, ValueChainStepKind.FreshFunded)).toContain(
            'funded risk $250.00 and take-profit $750.00 per trade',
        );
    });

    it('leaves the printed sizing of an account without personal limits untouched', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);

        expect(
            textOf(plan, spec, ValueChainStepKind.FirstPayoutEligible),
        ).toMatch(
            /of \$500\.00, (?:above|within) your cap of 4 trades per day/,
        );
    });
});
