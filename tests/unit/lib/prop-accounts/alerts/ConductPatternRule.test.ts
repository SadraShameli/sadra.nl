import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    ConductPatternRule,
} from '~/lib/prop-accounts/alerts';
import { AccountEventKind } from '~/lib/prop-accounts/core';
import {
    ALL_FIRMS,
    ConductCategory,
    type ConductPattern,
    FirmAccountPolicy,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';

import { accountFor, alertsOf, planWhere } from './alertFixtures';

const REBUY_PATTERN_QUOTE = 'a synthetic test quote';

const CONFIRMED_REBUY_PATTERN: ConductPattern = {
    category: ConductCategory.RapidRebuys,
    consequence: 'flagged for rolling accounts',
    source: {
        fetchedOn: '2026-09-01',
        quote: REBUY_PATTERN_QUOTE,
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.test/policy',
        verification: PolicyVerification.Confirmed,
    },
};

class VerifiedRebuyPolicy extends FirmAccountPolicy {
    override conductPatterns(): readonly ConductPattern[] {
        return [CONFIRMED_REBUY_PATTERN];
    }
}

const ENTRY = planWhere(() => true);
const rule = new ConductPatternRule();

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

describe('ConductPatternRule', () => {
    it('flags a same-firm multi-bust on one date against a confirmed rebuy pattern', () => {
        const a = accountFor(ENTRY);
        const b = accountFor(ENTRY);
        const alerts = withStubbedPolicy(new VerifiedRebuyPolicy(), () =>
            alertsOf(rule, {
                accounts: [a, b],
                events: [
                    {
                        accountId: a.id,
                        kind: AccountEventKind.Busted,
                        occurredOn: '2026-09-10',
                    },
                    {
                        accountId: b.id,
                        kind: AccountEventKind.Busted,
                        occurredOn: '2026-09-10',
                    },
                ],
            }),
        );
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.ConductPattern);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.subject.kind).toBe(AlertSubjectKind.Portfolio);
        expect(alert?.subject).toMatchObject({ accountIds: [a.id, b.id] });
        expect(alert?.message).toContain(REBUY_PATTERN_QUOTE);
    });

    it('flags a re-buy within 7 days of a bust at a different account, same firm', () => {
        const busted = accountFor(ENTRY);
        const rebought = accountFor(ENTRY);
        const alerts = withStubbedPolicy(new VerifiedRebuyPolicy(), () =>
            alertsOf(rule, {
                accounts: [busted, rebought],
                events: [
                    {
                        accountId: busted.id,
                        kind: AccountEventKind.Busted,
                        occurredOn: '2026-09-01',
                    },
                    {
                        accountId: rebought.id,
                        kind: AccountEventKind.Purchased,
                        occurredOn: '2026-09-05',
                    },
                ],
            }),
        );
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.ConductPattern);
        expect(alert?.message).toContain('within 7 days of a bust');
        expect(alert?.subject.kind).toBe(AlertSubjectKind.Portfolio);
        expect(alert?.subject).toMatchObject({
            accountIds: [busted.id, rebought.id],
        });
    });

    it('is silent without a confirmed rebuy pattern (unverified firm, unchanged)', () => {
        const a = accountFor(ENTRY);
        const b = accountFor(ENTRY);
        const alerts = alertsOf(rule, {
            accounts: [a, b],
            events: [
                {
                    accountId: a.id,
                    kind: AccountEventKind.Busted,
                    occurredOn: '2026-09-10',
                },
                {
                    accountId: b.id,
                    kind: AccountEventKind.Busted,
                    occurredOn: '2026-09-10',
                },
            ],
        });
        expect(alerts).toEqual([]);
    });

    it('is silent for a lone bust with no matching same-day or re-buy pattern', () => {
        const a = accountFor(ENTRY);
        const alerts = withStubbedPolicy(new VerifiedRebuyPolicy(), () =>
            alertsOf(rule, {
                accounts: [a],
                events: [
                    {
                        accountId: a.id,
                        kind: AccountEventKind.Busted,
                        occurredOn: '2026-09-10',
                    },
                ],
            }),
        );
        expect(alerts).toEqual([]);
    });

    it('does not crash on a malformed stored bust date; it ignores that event instead of throwing across the whole evaluation', () => {
        const busted = accountFor(ENTRY);
        const rebought = accountFor(ENTRY);
        const run = () =>
            withStubbedPolicy(new VerifiedRebuyPolicy(), () =>
                alertsOf(rule, {
                    accounts: [busted, rebought],
                    events: [
                        {
                            accountId: busted.id,
                            kind: AccountEventKind.Busted,
                            occurredOn: 'not-a-date',
                        },
                        {
                            accountId: rebought.id,
                            kind: AccountEventKind.Purchased,
                            occurredOn: '2026-09-05',
                        },
                    ],
                }),
            );
        expect(run).not.toThrow();
        expect(run()).toEqual([]);
    });
});
