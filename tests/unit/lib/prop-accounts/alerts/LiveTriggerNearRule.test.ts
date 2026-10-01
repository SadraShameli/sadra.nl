import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    LiveTriggerNearRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStatus } from '~/lib/prop-accounts/core';
import {
    ALL_FIRMS,
    FirmAccountPolicy,
    type LiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';

import { accountFor, alertsOf, paidPayout, planWhere } from './alertFixtures';

const CONFIRMED_QUOTE_TEXT = 'a synthetic test quote';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: CONFIRMED_QUOTE_TEXT,
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const ENTRY = planWhere(() => true);
const rule = new LiveTriggerNearRule();

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function paidPayoutsFor(
    account: ReturnType<typeof accountFor>,
    count: number,
    startDay: number,
) {
    return Array.from({ length: count }, (_unused, index) =>
        paidPayout(account, {
            paidOn: `2026-08-${String(startDay + index).padStart(2, '0')}`,
        }),
    );
}

function withStubbedPolicy<T>(policy: FirmAccountPolicy, run: () => T): T {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === ENTRY.firmId);
    if (firm === undefined)
        throw new Error('expected the entry firm to be registered');
    const mutable = firm as { accountPolicy: FirmAccountPolicy };
    const original = mutable.accountPolicy;
    mutable.accountPolicy = policy;
    try {
        return run();
    } finally {
        mutable.accountPolicy = original;
    }
}

describe('LiveTriggerNearRule: per account', () => {
    it('is silent below cap minus one', () => {
        const account = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account],
                payouts: paidPayoutsFor(account, 1, 1),
            }),
        );
        expect(alerts).toEqual([]);
    });

    it('warns at cap minus one and quotes the firm policy', () => {
        const account = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account],
                payouts: paidPayoutsFor(account, 2, 1),
            }),
        );
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.LiveTriggerNear);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.subject).toEqual({
            accountId: account.id,
            kind: AlertSubjectKind.Account,
            label: account.label,
        });
        expect(alert?.message).toContain('2 of 3');
        expect(alert?.message).toContain(CONFIRMED_QUOTE_TEXT);
    });

    it('is critical once the cap is reached', () => {
        const account = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account],
                payouts: paidPayoutsFor(account, 3, 1),
            }),
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
    });

    it('is silent for an unverified per-account trigger', () => {
        const account = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, undefined),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account],
                payouts: paidPayoutsFor(account, 3, 1),
            }),
        );
        expect(alerts).toEqual([]);
    });
});

describe('LiveTriggerNearRule: firm total', () => {
    it('counts paid payouts across every account at the firm, including a busted sibling, not only active accounts', () => {
        const busted = accountFor(ENTRY, { status: AccountStatus.Busted });
        const active = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [busted, active],
                payouts: [
                    ...paidPayoutsFor(busted, 6, 1),
                    ...paidPayoutsFor(active, 3, 10),
                ],
            }),
        );
        const firmAlerts = alerts.filter(
            (alert) => alert.subject.kind === AlertSubjectKind.Portfolio,
        );
        expect(firmAlerts).toHaveLength(1);
        const [alert] = firmAlerts;
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.message).toContain('9 of 10');
        expect(alert?.subject).toMatchObject({ accountIds: [active.id] });
    });

    it('is critical once the firm-total cap is reached', () => {
        const busted = accountFor(ENTRY, { status: AccountStatus.Busted });
        const active = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [busted, active],
                payouts: [
                    ...paidPayoutsFor(busted, 7, 1),
                    ...paidPayoutsFor(active, 3, 10),
                ],
            }),
        );
        const firmAlerts = alerts.filter(
            (alert) => alert.subject.kind === AlertSubjectKind.Portfolio,
        );
        expect(firmAlerts).toHaveLength(1);
        expect(firmAlerts[0]?.severity).toBe(AlertSeverity.Critical);
    });

    it('is silent when every account at the firm has ended (no active account to alert on)', () => {
        const busted = accountFor(ENTRY, { status: AccountStatus.Busted });
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [busted],
                payouts: paidPayoutsFor(busted, 9, 1),
            }),
        );
        expect(alerts).toEqual([]);
    });

    it('is silent for an unverified firm-total trigger', () => {
        const active = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, undefined),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [active],
                payouts: paidPayoutsFor(active, 9, 1),
            }),
        );
        expect(alerts).toEqual([]);
    });
});
