import { describe, expect, it } from 'vitest';

import { formatCurrency } from '~/lib/format';
import {
    AlertDisclosure,
    AlertKind,
    AlertSeverity,
    SubscriptionRenewalDueRule,
} from '~/lib/prop-accounts/alerts';
import {
    AccountReadIssueKind,
    AccountStage,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts/core';

import {
    accountFor,
    alertsOf,
    ledgerOnlyAccountFor,
    planWhere,
    WEDNESDAY,
} from './alertFixtures';

const SUBSCRIBED = planWhere(
    (plan) => plan.fees.monthlySubscription > 0 && !plan.isInstantFunded,
);
const ONE_TIME = planWhere(
    (plan) => plan.fees.monthlySubscription === 0 && !plan.isInstantFunded,
);
const rule = new SubscriptionRenewalDueRule();

function alertsFor(
    purchasedOn: string,
    options: { entry?: typeof SUBSCRIBED; stage?: AccountStage } = {},
) {
    const account = accountFor(options.entry ?? SUBSCRIBED, {
        purchasedOn,
        stage: options.stage ?? AccountStage.Eval,
    });
    return alertsOf(rule, { accounts: [account], today: WEDNESDAY });
}

describe('SubscriptionRenewalDueRule', () => {
    it('fires within 3 days of the next 30-day renewal', () => {
        const alerts = alertsFor('2026-08-27');
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.SubscriptionRenewalDue);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
        expect(alerts[0]?.message).toContain('in 3 days');
        expect(alerts[0]?.message).toContain('2026-09-26');
        expect(alerts[0]?.message).toContain(
            formatCurrency(SUBSCRIBED.plan.fees.monthlySubscription, 2),
        );
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.ThirtyDayBillingCycle,
        ]);
    });

    it('is silent 4 days before the renewal', () => {
        expect(alertsFor('2026-08-28')).toEqual([]);
    });

    it('fires on the renewal day and in later cycles', () => {
        expect(alertsFor('2026-08-24')[0]?.message).toContain('today');
        expect(alertsFor('2026-07-27')[0]?.message).toContain('in 2 days');
    });

    it('is silent on the purchase day and for a future purchase', () => {
        expect(alertsFor(WEDNESDAY)).toEqual([]);
        expect(alertsFor('2026-09-30')).toEqual([]);
    });

    it('prices no renewal for a ledger-only eval account, which has no plan list price', () => {
        const account = ledgerOnlyAccountFor(SUBSCRIBED, {
            purchasedOn: '2026-08-27',
            stage: AccountStage.Eval,
        });
        expect(
            alertsOf(rule, { accounts: [account], today: WEDNESDAY }),
        ).toEqual([]);
    });

    it('applies only to eval accounts on subscription plans', () => {
        expect(alertsFor('2026-08-27', { stage: AccountStage.Funded })).toEqual(
            [],
        );
        expect(alertsFor('2026-08-27', { entry: ONE_TIME })).toEqual([]);
    });

    it('prices no renewal off the placeholder plan of a row read with corrupt opt-ins', () => {
        const account = accountFor(SUBSCRIBED, {
            purchasedOn: '2026-08-27',
            readIssues: [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.CorruptOptIns,
                },
            ],
            stage: AccountStage.Eval,
        });
        expect(
            alertsOf(rule, { accounts: [account], today: WEDNESDAY }),
        ).toEqual([]);
    });
});
