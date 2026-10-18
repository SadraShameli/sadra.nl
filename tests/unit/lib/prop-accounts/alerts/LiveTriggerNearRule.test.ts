import { describe, expect, it } from 'vitest';

import {
    AlertDisclosure,
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    LiveTriggerNearRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStatus, PayoutStatus } from '~/lib/prop-accounts/core';
import {
    ALL_FIRMS,
    FirmAccountPolicy,
    type LiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';

import {
    accountFor,
    alertsOf,
    movedLiveEvent,
    paidPayout,
    planWhere,
} from './alertFixtures';

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

    it('counts the account own requested payouts toward the per-account cap, and says how many were requested (PT-36i)', () => {
        const account = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account],
                payouts: [
                    ...paidPayoutsFor(account, 1, 1),
                    paidPayout(account, {
                        paidOn: null,
                        status: PayoutStatus.Requested,
                    }),
                ],
            }),
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('2 of 3');
        expect(alerts[0]?.message).toContain('1 paid, 1 requested');
    });

    it('does not count a sibling requested payout toward the per-account cap (PT-36i)', () => {
        const account = accountFor(ENTRY);
        const sibling = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account, sibling],
                payouts: [
                    ...paidPayoutsFor(account, 1, 1),
                    paidPayout(sibling, {
                        paidOn: null,
                        status: PayoutStatus.Requested,
                    }),
                ],
            }),
        );
        expect(alerts).toEqual([]);
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

    it('counts the payouts of an archived account at the firm', () => {
        const archived = accountFor(ENTRY, {
            archivedAt: new Date('2026-09-10T00:00:00Z'),
        });
        const active = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(4, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [archived, active],
                payouts: [
                    ...paidPayoutsFor(archived, 2, 1),
                    ...paidPayoutsFor(active, 1, 10),
                ],
            }),
        );
        const firmAlerts = alerts.filter(
            (alert) => alert.subject.kind === AlertSubjectKind.Portfolio,
        );
        expect(firmAlerts).toHaveLength(1);
        expect(firmAlerts[0]?.message).toContain('3 of 4');
    });

    it('restarts the count at a live move recorded on an archived account', () => {
        const archived = accountFor(ENTRY, {
            archivedAt: new Date('2026-09-10T00:00:00Z'),
        });
        const active = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(4, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [archived, active],
                events: [movedLiveEvent(archived, '2026-08-20')],
                payouts: paidPayoutsFor(active, 3, 1),
            }),
        );
        expect(alerts).toEqual([]);
    });

    it('says the count cannot be read instead of going silent when a sibling payout has an invalid stored date (PT-36i)', () => {
        const sibling = accountFor(ENTRY);
        const active = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(4, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [sibling, active],
                payouts: [
                    ...paidPayoutsFor(active, 3, 1),
                    paidPayout(sibling, { paidOn: 'not a date' }),
                ],
            }),
        );
        const firmAlerts = alerts.filter(
            (alert) => alert.subject.kind === AlertSubjectKind.Portfolio,
        );
        expect(firmAlerts).toHaveLength(1);
        const [alert] = firmAlerts;
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.disclosures).toEqual([
            AlertDisclosure.LiveTriggersNotChecked,
        ]);
        expect(alert?.message).toContain('cannot be read');
        expect(alert?.message).toContain('cap 4');
        expect(alert?.message).toContain(CONFIRMED_QUOTE_TEXT);
        expect(alert?.subject).toMatchObject({
            accountIds: [sibling.id, active.id],
        });
    });

    it('says the count cannot be read when an archived sibling at the firm is unreadable (PT-36i)', () => {
        const unreadable = accountFor(ENTRY, {
            archivedAt: new Date('2026-09-10T00:00:00Z'),
            planSerial: null,
        });
        const active = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(4, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [unreadable, active],
                payouts: paidPayoutsFor(active, 1, 1),
            }),
        );
        const firmAlerts = alerts.filter(
            (alert) => alert.subject.kind === AlertSubjectKind.Portfolio,
        );
        expect(firmAlerts).toHaveLength(1);
        expect(firmAlerts[0]?.disclosures).toEqual([
            AlertDisclosure.LiveTriggersNotChecked,
        ]);
        expect(firmAlerts[0]?.message).toContain('cannot be read');
    });

    it('stays silent about the unreadable count when no active account at the firm is left to alert on (PT-36i)', () => {
        const sibling = accountFor(ENTRY, { status: AccountStatus.Busted });
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(4, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [sibling],
                payouts: [paidPayout(sibling, { paidOn: 'not a date' })],
            }),
        );
        expect(alerts).toEqual([]);
    });

    it('counts a payout requested at a sibling account toward the firm total, and says how many were requested (PT-36i)', () => {
        const sibling = accountFor(ENTRY);
        const active = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(5, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [sibling, active],
                payouts: [
                    ...paidPayoutsFor(active, 2, 1),
                    paidPayout(sibling, {
                        paidOn: null,
                        status: PayoutStatus.Requested,
                    }),
                    paidPayout(active, {
                        paidOn: null,
                        status: PayoutStatus.Requested,
                    }),
                ],
            }),
        );
        const firmAlerts = alerts.filter(
            (alert) => alert.subject.kind === AlertSubjectKind.Portfolio,
        );
        expect(firmAlerts).toHaveLength(1);
        expect(firmAlerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(firmAlerts[0]?.message).toContain('4 of 5');
        expect(firmAlerts[0]?.message).toContain('2 paid, 2 requested');
    });

    it('ignores a requested payout dated before the last live move (PT-36i)', () => {
        const active = accountFor(ENTRY);
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(5, CONFIRMED_SOURCE),
        ]);
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [active],
                events: [movedLiveEvent(active, '2026-09-15')],
                payouts: [
                    paidPayout(active, {
                        paidOn: null,
                        requestedOn: '2026-09-05',
                        status: PayoutStatus.Requested,
                    }),
                ],
            }),
        );
        expect(alerts).toEqual([]);
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
