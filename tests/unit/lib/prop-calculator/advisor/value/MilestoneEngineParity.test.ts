import { describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    resolveDocumentedPayoutRequestSize,
    resolveDocumentedPlan,
} from '~/lib/prop-calculator/advisor/policy';
import {
    documentedRetainedCushion,
    MilestoneKind,
    milestoneState,
} from '~/lib/prop-calculator/advisor/value/MilestoneState';
import {
    firstPayoutEligibleAccount,
    freshFundedAccount,
    fundedTrackerAfterMilestonePayout,
    postFirstPayoutAccount,
} from '~/lib/prop-calculator/advisor/value/ValueChain';
import {
    type FundedCycleTracker,
    PayoutFloorEffect,
    PayoutRequestPolicy,
    type Plan,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

const PLANS = ALL_FIRMS.flatMap((firm) => firm.plans);

function differences(
    milestone: Record<string, unknown>,
    engine: Record<string, unknown>,
): string[] {
    return [...new Set([...Object.keys(milestone), ...Object.keys(engine)])]
        .filter((key) => !Object.is(milestone[key], engine[key]))
        .map(
            (key) =>
                `${key}: milestone ${String(milestone[key])} vs engine ${String(engine[key])}`,
        );
}

function eligibleAccount(plan: Plan, spec: DocumentedPolicySpec) {
    return firstPayoutEligibleAccount(plan, freshFundedAccount(plan), spec);
}

function engineSettled(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
) {
    const plan = resolveDocumentedPlan(account.plan, spec.enginePolicy);
    const { fundedTracker } = account;
    if (fundedTracker === null) throw new Error('expected a funded tracker');
    const state = { ...account.state };
    const payout = fundedTracker.tryPayout({
        minRetainedCushion: documentedRetainedCushion(plan, spec),
        payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
        payoutRequestSize: resolveDocumentedPayoutRequestSize(
            plan,
            spec.enginePolicy,
            spec.rulebook.payout,
        ),
        plan,
        state,
    });
    return { payout, state, tracker: fundedTracker };
}

function specFor(plan: Plan): DocumentedPolicySpec {
    return {
        enginePolicy: buildEnginePolicy({
            fundedHorizonDays: 90,
            plan,
            rulebook: DEFAULT_RULEBOOK,
        }).policy,
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 40, seed: 11, trials: 30 },
    };
}

function trackerFigures(tracker: FundedCycleTracker) {
    return {
        cumulativePayout: tracker.cumulativePayout,
        cycleBestDayProfit: tracker.cycleBestDayProfit,
        fundedResetsUsed: tracker.fundedResetsUsed,
        lastPayoutBalance: tracker.lastPayoutBalance,
        payoutsIssued: tracker.payoutsIssued,
        qualifyingDaysAtLastPayout: tracker.qualifyingDaysAtLastPayout,
        sessionDaysSinceAnchor: tracker.sessionDaysSinceAnchor,
    };
}

describe('the milestone post-payout state is the engine own settled state (CLOSE-1, PT-65a/b)', () => {
    it('covers plans whose payout floor effect locks the threshold', () => {
        const effects = new Set(PLANS.map((plan) => plan.payoutFloorEffect));

        expect(effects.has(PayoutFloorEffect.ReleaseFloor)).toBe(true);
        expect(effects.has(PayoutFloorEffect.LockAtPlanFloor)).toBe(true);
        expect(effects.has(PayoutFloorEffect.MoveToLockedFloor)).toBe(true);
    });

    it('every registry plan: the milestone state equals the state the engine settle leaves for the same payout', () => {
        const failures: string[] = [];
        for (const plan of PLANS) {
            const spec = specFor(plan);
            const label = JSON.stringify(plan.id);
            const milestone = milestoneState(eligibleAccount(plan, spec), spec);
            const settled = engineSettled(eligibleAccount(plan, spec), spec);
            if (
                milestone.kind !== MilestoneKind.Funded ||
                settled.payout === null
            ) {
                failures.push(`${label}: no eligible funded milestone`);
                continue;
            }
            const gaps = [
                ...differences({ ...milestone.state }, { ...settled.state }),
                ...differences(
                    {
                        debited: milestone.debited,
                        traderReceives: milestone.traderReceives,
                    },
                    {
                        debited: settled.payout.debited,
                        traderReceives: settled.payout.traderReceives,
                    },
                ),
            ];
            if (gaps.length > 0) {
                failures.push(
                    `${label} (${plan.payoutFloorEffect}): ${gaps.join('; ')}`,
                );
            }
        }
        expect(failures).toEqual([]);
    });

    it('every registry plan: the post-first-payout account carries the engine settled state and cycle tracker', () => {
        const failures: string[] = [];
        for (const plan of PLANS) {
            const spec = specFor(plan);
            const label = JSON.stringify(plan.id);
            const post = postFirstPayoutAccount(
                eligibleAccount(plan, spec),
                spec,
            );
            const settled = engineSettled(eligibleAccount(plan, spec), spec);
            if (settled.payout === null || post.fundedTracker === null) {
                failures.push(`${label}: no eligible payout or tracker`);
                continue;
            }
            const gaps = [
                ...differences({ ...post.state }, { ...settled.state }),
                ...differences(
                    trackerFigures(post.fundedTracker),
                    trackerFigures(settled.tracker),
                ),
            ];
            if (gaps.length > 0) {
                failures.push(
                    `${label} (${plan.payoutDayGateBasis}): ${gaps.join('; ')}`,
                );
            }
        }
        expect(failures).toEqual([]);
    });

    it('every registry plan: the milestone carries the documented plan it was settled under', () => {
        const failures: string[] = [];
        for (const plan of PLANS) {
            const spec = specFor(plan);
            const label = JSON.stringify(plan.id);
            const milestone = milestoneState(eligibleAccount(plan, spec), spec);
            if (milestone.kind !== MilestoneKind.Funded) {
                failures.push(`${label}: not a funded milestone`);
                continue;
            }
            const documentedPlan = resolveDocumentedPlan(
                plan,
                spec.enginePolicy,
            );
            const gaps = differences(
                {
                    id: JSON.stringify(milestone.plan.id),
                    lifetimeCap: milestone.plan.maxLifetimePayouts,
                    payoutDayGateBasis: milestone.plan.payoutDayGateBasis,
                },
                {
                    id: JSON.stringify(documentedPlan.id),
                    lifetimeCap: documentedPlan.maxLifetimePayouts,
                    payoutDayGateBasis: documentedPlan.payoutDayGateBasis,
                },
            );
            if (gaps.length > 0) failures.push(`${label}: ${gaps.join('; ')}`);
        }
        expect(failures).toEqual([]);
    });

    it('every registry plan: fundedTrackerAfterMilestonePayout is a fresh copy of the engine settled tracker', () => {
        const failures: string[] = [];
        for (const plan of PLANS) {
            const spec = specFor(plan);
            const label = JSON.stringify(plan.id);
            const account = eligibleAccount(plan, spec);
            const milestone = milestoneState(account, spec);
            if (milestone.kind !== MilestoneKind.Funded) {
                failures.push(`${label}: not a funded milestone`);
                continue;
            }
            const settled = engineSettled(eligibleAccount(plan, spec), spec);
            const advanced = fundedTrackerAfterMilestonePayout(milestone);
            const gaps = differences(
                trackerFigures(advanced),
                trackerFigures(settled.tracker),
            );
            if (advanced === account.fundedTracker) {
                gaps.push('returns the prior tracker object');
            }
            if (gaps.length > 0) failures.push(`${label}: ${gaps.join('; ')}`);
        }
        expect(failures).toEqual([]);
    });

    it('every registry plan: a payout the gates would block still leaves the engine settled state and tracker', () => {
        const failures: string[] = [];
        for (const plan of PLANS) {
            const spec = specFor(plan);
            const label = JSON.stringify(plan.id);
            const account = freshFundedAccount(plan);
            const milestone = milestoneState(account, spec);
            const documentedPlan = resolveDocumentedPlan(
                plan,
                spec.enginePolicy,
            );
            const debited = resolveDocumentedPayoutRequestSize(
                documentedPlan,
                spec.enginePolicy,
                spec.rulebook.payout,
            );
            const state = { ...account.state };
            const tracker = freshFundedAccount(plan).fundedTracker;
            if (tracker === null || milestone.kind !== MilestoneKind.Funded) {
                failures.push(`${label}: not a funded milestone`);
                continue;
            }
            tracker.settle(
                {
                    causesHardBreach:
                        documentedPlan.fullWithdrawalHardBreach &&
                        debited >= documentedPlan.accountProfit(state),
                    debited,
                    traderReceives: documentedPlan.payoutFromProfit(debited, 0),
                },
                documentedPlan,
                state,
            );
            const gaps = [
                ...differences({ ...milestone.state }, { ...state }),
                ...differences(
                    trackerFigures(milestone.tracker),
                    trackerFigures(tracker),
                ),
            ];
            if (gaps.length > 0) failures.push(`${label}: ${gaps.join('; ')}`);
        }
        expect(failures).toEqual([]);
    });

    it('does not mutate the account state or tracker the milestone was built from', () => {
        for (const plan of PLANS) {
            const spec = specFor(plan);
            const account = eligibleAccount(plan, spec);
            const stateBefore = { ...account.state };
            const trackerBefore =
                account.fundedTracker === null
                    ? null
                    : trackerFigures(account.fundedTracker);

            milestoneState(account, spec);

            expect(account.state).toEqual(stateBefore);
            expect(
                account.fundedTracker === null
                    ? null
                    : trackerFigures(account.fundedTracker),
            ).toEqual(trackerBefore);
        }
    });
});
