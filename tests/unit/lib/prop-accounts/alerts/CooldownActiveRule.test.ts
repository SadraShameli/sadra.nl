import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    CooldownActiveRule,
} from '~/lib/prop-accounts/alerts';
import { AccountEventKind } from '~/lib/prop-accounts/core';
import {
    ALL_FIRMS,
    EvalPurchaseEffect,
    FirmAccountPolicy,
    FixedCooldown,
    type LiveExclusivityPolicy,
    PolicySourceKind,
    PolicyVerification,
    SimAccountEffect,
} from '~/lib/prop-calculator';

import { accountFor, alertsOf, planWhere } from './alertFixtures';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const ENTRY = planWhere(() => true);
const rule = new CooldownActiveRule();

class StubCooldownPolicy extends FirmAccountPolicy {
    constructor(private readonly policy: LiveExclusivityPolicy) {
        super();
    }

    override liveExclusivityFor(): LiveExclusivityPolicy {
        return this.policy;
    }
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

const cooldownPolicy = new StubCooldownPolicy({
    cooldown: new FixedCooldown(21),
    evalPurchaseEffect: EvalPurchaseEffect.Unknown,
    household: false,
    simAccountEffect: SimAccountEffect.Unknown,
    source: CONFIRMED_SOURCE,
});

describe('CooldownActiveRule', () => {
    it('warns while inside the verified cooldown window after a live bust', () => {
        const account = accountFor(ENTRY);
        const alerts = withStubbedPolicy(cooldownPolicy, () =>
            alertsOf(rule, {
                accounts: [account],
                events: [
                    {
                        accountId: account.id,
                        kind: AccountEventKind.MovedLive,
                        occurredOn: '2026-08-01',
                    },
                    {
                        accountId: account.id,
                        kind: AccountEventKind.Busted,
                        occurredOn: '2026-09-10',
                    },
                ],
                today: '2026-09-20',
            }),
        );
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.CooldownActive);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.subject).toEqual({
            accountId: account.id,
            kind: AlertSubjectKind.Account,
            label: account.label,
        });
        expect(alert?.message).toContain('2026-09-10');
    });

    it('gives an info notice once the cooldown window has just ended', () => {
        const account = accountFor(ENTRY);
        const alerts = withStubbedPolicy(cooldownPolicy, () =>
            alertsOf(rule, {
                accounts: [account],
                events: [
                    {
                        accountId: account.id,
                        kind: AccountEventKind.MovedLive,
                        occurredOn: '2026-08-01',
                    },
                    {
                        accountId: account.id,
                        kind: AccountEventKind.Busted,
                        occurredOn: '2026-08-10',
                    },
                ],
                today: '2026-09-05',
            }),
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
        expect(alerts[0]?.message).toContain('cooldown over');
    });

    it('is silent long after the cooldown window has passed', () => {
        const account = accountFor(ENTRY);
        const alerts = withStubbedPolicy(cooldownPolicy, () =>
            alertsOf(rule, {
                accounts: [account],
                events: [
                    {
                        accountId: account.id,
                        kind: AccountEventKind.MovedLive,
                        occurredOn: '2026-08-01',
                    },
                    {
                        accountId: account.id,
                        kind: AccountEventKind.Busted,
                        occurredOn: '2026-08-10',
                    },
                ],
                today: '2026-12-01',
            }),
        );
        expect(alerts).toEqual([]);
    });

    it('is silent without a recorded bust', () => {
        const account = accountFor(ENTRY);
        const alerts = withStubbedPolicy(cooldownPolicy, () =>
            alertsOf(rule, {
                accounts: [account],
                events: [
                    {
                        accountId: account.id,
                        kind: AccountEventKind.MovedLive,
                        occurredOn: '2026-08-01',
                    },
                ],
                today: '2026-09-20',
            }),
        );
        expect(alerts).toEqual([]);
    });

    it('is silent for an unverified live-exclusivity policy', () => {
        const account = accountFor(ENTRY);
        const alerts = alertsOf(rule, {
            accounts: [account],
            events: [
                {
                    accountId: account.id,
                    kind: AccountEventKind.MovedLive,
                    occurredOn: '2026-08-01',
                },
                {
                    accountId: account.id,
                    kind: AccountEventKind.Busted,
                    occurredOn: '2026-09-10',
                },
            ],
            today: '2026-09-20',
        });
        expect(alerts).toEqual([]);
    });
});
