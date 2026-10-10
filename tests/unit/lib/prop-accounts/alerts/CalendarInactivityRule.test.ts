import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    CalendarInactivityRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage } from '~/lib/prop-accounts/core';
import {
    ALL_FIRMS,
    EvalPurchaseEffect,
    FirmAccountPolicy,
    InactivityBasisKind,
    InactivityMinimumQualifyingKind,
    InactivityOutcome,
    type InactivityPolicy,
    type LiveExclusivityPolicy,
    PolicySourceKind,
    PolicyVerification,
    SimAccountEffect,
    UnknownCooldown,
} from '~/lib/prop-calculator';

import { accountFor, alertsOf, planWhere, snapshotFor } from './alertFixtures';

const CONFIRMED_QUOTE_TEXT = 'a synthetic test quote';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: CONFIRMED_QUOTE_TEXT,
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const ENTRY = planWhere(() => true);
const rule = new CalendarInactivityRule();

class StubInactivityPolicy extends FirmAccountPolicy {
    constructor(
        private readonly policy: InactivityPolicy,
        private readonly exclusivity: LiveExclusivityPolicy | null = null,
    ) {
        super();
    }

    override inactivityFor(): InactivityPolicy {
        return this.policy;
    }

    override liveExclusivityFor(): LiveExclusivityPolicy {
        return (
            this.exclusivity ?? {
                cooldown: new UnknownCooldown(),
                evalPurchaseEffect: EvalPurchaseEffect.Unknown,
                household: false,
                simAccountEffect: SimAccountEffect.Unknown,
                source: undefined,
            }
        );
    }
}

function calendarDaysPolicy(): InactivityPolicy {
    return {
        kind: InactivityBasisKind.CalendarDays,
        maxIdleDays: 7,
        minimumQualifying: { kind: InactivityMinimumQualifyingKind.AnyTrade },
        mismatch: null,
        outcome: InactivityOutcome.Closure,
        source: CONFIRMED_SOURCE,
    };
}

function calendarWeekPolicy(sessionsPerWeek: number): InactivityPolicy {
    return {
        kind: InactivityBasisKind.CalendarWeek,
        minimumQualifying: { kind: InactivityMinimumQualifyingKind.AnyTrade },
        mismatch: null,
        outcome: InactivityOutcome.DiscretionaryClosure,
        sessionsPerWeek,
        source: CONFIRMED_SOURCE,
    };
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

describe('CalendarInactivityRule', () => {
    it('is silent for an unverified calendar policy', () => {
        const account = accountFor(ENTRY);
        const policy = new StubInactivityPolicy({
            kind: InactivityBasisKind.CalendarDays,
            maxIdleDays: 7,
            minimumQualifying: {
                kind: InactivityMinimumQualifyingKind.AnyTrade,
            },
            mismatch: null,
            outcome: InactivityOutcome.Closure,
            source: undefined,
        });
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account],
                snapshots: [
                    snapshotFor(account, { lastTradedOn: '2026-09-16' }),
                ],
            }),
        );
        expect(alerts).toEqual([]);
    });

    it('warns 2 days before a confirmed calendar/trading-days limit and quotes the firm', () => {
        const account = accountFor(ENTRY);
        const policy = new StubInactivityPolicy(calendarDaysPolicy());
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account],
                snapshots: [
                    snapshotFor(account, { lastTradedOn: '2026-09-18' }),
                ],
            }),
        );
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.CalendarInactivity);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.subject).toEqual({
            accountId: account.id,
            kind: AlertSubjectKind.Account,
            label: account.label,
        });
        expect(alert?.message).toContain(CONFIRMED_QUOTE_TEXT);
    });

    it('is critical once the confirmed limit is reached', () => {
        const account = accountFor(ENTRY);
        const policy = new StubInactivityPolicy(calendarDaysPolicy());
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account],
                snapshots: [
                    snapshotFor(account, { lastTradedOn: '2026-09-16' }),
                ],
            }),
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
    });

    it('warns at 7 idle days for the calendar-week basis with discretionary wording and the quote', () => {
        const account = accountFor(ENTRY);
        const policy = new StubInactivityPolicy(calendarWeekPolicy(1));
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account],
                snapshots: [
                    snapshotFor(account, { lastTradedOn: '2026-09-16' }),
                ],
            }),
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('discretionary');
        expect(alerts[0]?.message).toContain(CONFIRMED_QUOTE_TEXT);
    });

    it('gives an info "not checked" alert when no last-traded date is on file', () => {
        const account = accountFor(ENTRY);
        const policy = new StubInactivityPolicy(calendarDaysPolicy());
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, { accounts: [account] }),
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
        expect(alerts[0]?.message).toContain('not checked');
    });

    it('does not crash on a malformed stored last-traded date; it reports "not checked" instead', () => {
        const account = accountFor(ENTRY);
        const policy = new StubInactivityPolicy(calendarDaysPolicy());
        const run = () =>
            withStubbedPolicy(policy, () =>
                alertsOf(rule, {
                    accounts: [account],
                    snapshots: [
                        snapshotFor(account, { lastTradedOn: 'not-a-date' }),
                    ],
                }),
            );
        expect(run).not.toThrow();
        const alerts = run();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
        expect(alerts[0]?.message).toContain('not checked');
    });

    it('skips a live-stage account', () => {
        const account = accountFor(ENTRY, { stage: AccountStage.Live });
        const policy = new StubInactivityPolicy(calendarDaysPolicy());
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [account],
                snapshots: [
                    snapshotFor(account, { lastTradedOn: '2026-09-16' }),
                ],
            }),
        );
        expect(alerts).toEqual([]);
    });

    it('skips a sim/eval sibling a confirmed dormant-while-live policy makes dormant', () => {
        const live = accountFor(ENTRY, { stage: AccountStage.Live });
        const sibling = accountFor(ENTRY);
        const policy = new StubInactivityPolicy(calendarDaysPolicy(), {
            cooldown: new UnknownCooldown(),
            evalPurchaseEffect: EvalPurchaseEffect.Unknown,
            household: false,
            simAccountEffect: SimAccountEffect.Dormant,
            source: CONFIRMED_SOURCE,
        });
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, {
                accounts: [live, sibling],
                snapshots: [
                    snapshotFor(sibling, { lastTradedOn: '2026-09-16' }),
                ],
            }),
        );
        expect(alerts).toEqual([]);
    });
});
