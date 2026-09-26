import { describe, expect, it } from 'vitest';

import {
    type AlertContext,
    AlertKind,
    AlertSeverity,
    LifetimePayoutCountRule,
} from '~/lib/prop-accounts/alerts';
import {
    AccountStage,
    PayoutStatus,
    PlanKeyResolutionKind,
} from '~/lib/prop-accounts/core';
import { ALL_FIRMS, dollars, type Plan } from '~/lib/prop-calculator';

import {
    accountFor,
    alertsOf,
    contextOf,
    ledgerOnlyAccountFor,
    paidPayout,
    planWhere,
    snapshotFor,
} from './alertFixtures';

const CAPPED = planWhere((plan) => plan.maxLifetimePayouts !== null);
const UNCAPPED = planWhere(
    (plan) =>
        plan.lifetimeConclusion.maxLifetimePayouts === null &&
        plan.lifetimeConclusion.payoutLadder === null,
);
const MAX_PAYOUTS = CAPPED.plan.maxLifetimePayouts ?? 0;
const LADDER_STEPS = 3;
const rule = new LifetimePayoutCountRule();

function alertsAt(
    payoutsTaken: null | number,
    options: {
        entry?: typeof CAPPED;
        paidCount?: number;
        stage?: AccountStage;
    } = {},
) {
    const account = accountFor(options.entry ?? CAPPED, {
        stage: options.stage ?? AccountStage.Funded,
    });
    const payouts = Array.from({ length: options.paidCount ?? 0 }, () =>
        paidPayout(account),
    );
    return alertsOf(rule, {
        accounts: [account],
        payouts: [
            ...payouts,
            paidPayout(account, { status: PayoutStatus.Requested }),
        ],
        snapshots: [snapshotFor(account, { payoutsTaken })],
    });
}

function alertsOnPlan(plan: Plan, payoutsTaken: number) {
    const account = accountFor(UNCAPPED, { stage: AccountStage.Funded });
    const context = contextOf({
        accounts: [account],
        snapshots: [snapshotFor(account, { payoutsTaken })],
    });
    const resolved: AlertContext = {
        ...context,
        accounts: context.accounts.map((monitored) => ({
            ...monitored,
            plan: { kind: PlanKeyResolutionKind.Resolved, plan },
        })),
    };
    return rule.evaluate(resolved);
}

function exhaustingLadderPlan(maxLifetimePayouts?: number): Plan {
    return UNCAPPED.plan.withOverrides({
        maxLifetimePayouts,
        payoutLadder: {
            minRequestAmount: dollars(500),
            steps: Array.from({ length: LADDER_STEPS }, () => 2000),
        },
    });
}

describe('LifetimePayoutCountRule', () => {
    it('is silent below max - 1 payouts', () => {
        expect(alertsAt(MAX_PAYOUTS - 2)).toEqual([]);
    });

    it('warns at max - 1 payouts', () => {
        const alerts = alertsAt(MAX_PAYOUTS - 1);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.LifetimePayoutCountNear);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain(
            `${MAX_PAYOUTS - 1} of ${MAX_PAYOUTS}`,
        );
    });

    it('is critical once every lifetime payout is taken', () => {
        expect(alertsAt(MAX_PAYOUTS)[0]?.severity).toBe(AlertSeverity.Critical);
    });

    it('counts the larger of the snapshot and the paid ledger', () => {
        expect(
            alertsAt(MAX_PAYOUTS - 2, { paidCount: MAX_PAYOUTS - 1 }),
        ).toHaveLength(1);
        expect(alertsAt(null, { paidCount: MAX_PAYOUTS - 1 })).toHaveLength(1);
        expect(alertsAt(null, { paidCount: MAX_PAYOUTS - 2 })).toEqual([]);
    });

    it('skips a ledger-only funded account, which has no plan payout count', () => {
        const account = ledgerOnlyAccountFor(CAPPED, {
            stage: AccountStage.Funded,
        });
        expect(
            alertsOf(rule, {
                accounts: [account],
                snapshots: [snapshotFor(account, { payoutsTaken: 99 })],
            }),
        ).toEqual([]);
    });

    it('applies only to funded accounts on plans with a lifetime payout count', () => {
        expect(alertsAt(MAX_PAYOUTS, { stage: AccountStage.Eval })).toEqual([]);
        expect(alertsAt(50, { entry: UNCAPPED })).toEqual([]);
    });

    it('names the lifetime payout limit as the source when the payout count concludes the plan', () => {
        expect(alertsAt(MAX_PAYOUTS - 1)[0]?.message).toContain(
            "the plan's lifetime payout limit",
        );
        expect(alertsAt(MAX_PAYOUTS)[0]?.message).toContain(
            "the plan's lifetime payout limit",
        );
    });

    it('alerts on a plan concluded by a non-capping payout ladder, and names the ladder', () => {
        const plan = exhaustingLadderPlan();
        expect(plan.conclusionGate(LADDER_STEPS)).not.toBeNull();
        expect(alertsOnPlan(plan, LADDER_STEPS - 2)).toEqual([]);

        const warning = alertsOnPlan(plan, LADDER_STEPS - 1);
        expect(warning).toHaveLength(1);
        expect(warning[0]?.severity).toBe(AlertSeverity.Warning);
        expect(warning[0]?.message).toContain(
            `${LADDER_STEPS - 1} of ${LADDER_STEPS}`,
        );
        expect(warning[0]?.message).toContain("the plan's payout ladder");

        const critical = alertsOnPlan(plan, LADDER_STEPS);
        expect(critical).toHaveLength(1);
        expect(critical[0]?.severity).toBe(AlertSeverity.Critical);
        expect(critical[0]?.message).toContain(
            `${LADDER_STEPS} of ${LADDER_STEPS}`,
        );
        expect(critical[0]?.message).toContain("the plan's payout ladder");
    });

    it('takes the ladder length when a payout count outlives a non-capping ladder', () => {
        const plan = exhaustingLadderPlan(LADDER_STEPS + 5);
        const critical = alertsOnPlan(plan, LADDER_STEPS);
        expect(critical[0]?.severity).toBe(AlertSeverity.Critical);
        expect(critical[0]?.message).toContain(
            `${LADDER_STEPS} of ${LADDER_STEPS}`,
        );
        expect(critical[0]?.message).toContain("the plan's payout ladder");
    });

    it('is silent on a ladder that repeats its last step', () => {
        const plan = UNCAPPED.plan.withOverrides({
            payoutLadder: {
                capsAtLastStep: true,
                minRequestAmount: dollars(500),
                steps: [2000, 2000],
            },
        });
        expect(alertsOnPlan(plan, 50)).toEqual([]);
    });

    it('scopes the warning to the payout count, since a dollar cap can end the account sooner', () => {
        const plan = exhaustingLadderPlan(LADDER_STEPS).withOverrides({
            maxLifetimePayoutDollars: dollars(1000),
        });
        const message = alertsOnPlan(plan, LADDER_STEPS - 1)[0]?.message;
        expect(message).toContain(
            'the next payout is the last one this limit allows',
        );
        expect(message).not.toContain('the last one the plan allows');
    });

    it('stays silent on a plan that concludes only on its lifetime payout dollars', () => {
        const plan = UNCAPPED.plan.withOverrides({
            maxLifetimePayoutDollars: dollars(1000),
        });
        expect(plan.conclusionGate(50, 1000)).not.toBeNull();
        expect(alertsOnPlan(plan, 50)).toEqual([]);
    });

    const SYNTHETIC_PLANS = [
        exhaustingLadderPlan(),
        exhaustingLadderPlan(LADDER_STEPS - 1),
        exhaustingLadderPlan(LADDER_STEPS + 5),
        exhaustingLadderPlan(LADDER_STEPS + 5).withOverrides({
            maxLifetimePayoutDollars: dollars(1000),
        }),
    ];

    it.each([
        ...ALL_FIRMS.flatMap((firm) => firm.plans).map((plan, index) => ({
            plan,
            title: `${index} ${plan.label}`,
        })),
        ...SYNTHETIC_PLANS.map((plan, index) => ({
            plan,
            title: `synthetic ${index} ${plan.label}`,
        })),
    ])(
        'is critical exactly when Plan.conclusionGate names a count conclusion, and warns one payout before, on $title',
        ({ plan }) => {
            for (let taken = 0; taken <= 12; taken++) {
                const severity = alertsOnPlan(plan, taken)[0]?.severity;
                const isConcludedNow = plan.conclusionGate(taken) !== null;
                const isConcludedNext = plan.conclusionGate(taken + 1) !== null;
                expect(
                    severity === AlertSeverity.Critical,
                    `${taken} payouts`,
                ).toBe(isConcludedNow);
                expect(
                    severity === AlertSeverity.Warning,
                    `${taken} payouts`,
                ).toBe(!isConcludedNow && isConcludedNext);
            }
        },
    );

    it('names the payout count that ends the account on every synthetic plan', () => {
        const limits = SYNTHETIC_PLANS.map((plan) => {
            const taken = Array.from({ length: 13 }, (_, count) => count).find(
                (count) => plan.conclusionGate(count) !== null,
            );
            const message = alertsOnPlan(plan, taken ?? 0)[0]?.message ?? '';
            return /^\d+ of \d+/.exec(message)?.[0];
        });
        expect(limits).toEqual([
            `${LADDER_STEPS} of ${LADDER_STEPS}`,
            `${LADDER_STEPS - 1} of ${LADDER_STEPS - 1}`,
            `${LADDER_STEPS} of ${LADDER_STEPS}`,
            `${LADDER_STEPS} of ${LADDER_STEPS}`,
        ]);
    });
});
