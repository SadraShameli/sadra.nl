import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    LiveExclusivityRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage, AccountStatus } from '~/lib/prop-accounts/core';
import {
    ALL_FIRMS,
    EvalPurchaseEffect,
    FirmAccountPolicy,
    type LiveExclusivityPolicy,
    PolicySourceKind,
    PolicyVerification,
    SimAccountEffect,
    UnknownCooldown,
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
const rule = new LiveExclusivityRule();

class StubExclusivityPolicy extends FirmAccountPolicy {
    constructor(private readonly policy: LiveExclusivityPolicy) {
        super();
    }

    override liveExclusivityFor(): LiveExclusivityPolicy {
        return this.policy;
    }
}

function policyWith(
    overrides: Partial<LiveExclusivityPolicy> = {},
): LiveExclusivityPolicy {
    return {
        cooldown: new UnknownCooldown(),
        evalPurchaseEffect: EvalPurchaseEffect.Unknown,
        household: false,
        simAccountEffect: SimAccountEffect.Unknown,
        source: undefined,
        ...overrides,
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

describe('LiveExclusivityRule', () => {
    it('warns that siblings are dormant while live under a confirmed dormant policy', () => {
        const live = accountFor(ENTRY, { stage: AccountStage.Live });
        const sibling = accountFor(ENTRY);
        const policy = new StubExclusivityPolicy(
            policyWith({
                simAccountEffect: SimAccountEffect.Dormant,
                source: CONFIRMED_SOURCE,
            }),
        );
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, { accounts: [live, sibling] }),
        );
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.LiveExclusivity);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.message).toContain('dormant while live');
        expect(alert?.subject).toMatchObject({
            accountIds: [live.id, sibling.id],
            kind: AlertSubjectKind.Portfolio,
        });
    });

    it('warns that siblings are flagged and on hold under a confirmed upgraded-on-hold policy', () => {
        const live = accountFor(ENTRY, { stage: AccountStage.Live });
        const sibling = accountFor(ENTRY, { stage: AccountStage.Funded });
        const policy = new StubExclusivityPolicy(
            policyWith({
                simAccountEffect: SimAccountEffect.UpgradedAccountOnHold,
                source: CONFIRMED_SOURCE,
            }),
        );
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, { accounts: [live, sibling] }),
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('flagged and put on hold');
    });

    it('is silent when the verified effect is unknown', () => {
        const live = accountFor(ENTRY, { stage: AccountStage.Live });
        const sibling = accountFor(ENTRY);
        const policy = new StubExclusivityPolicy(
            policyWith({
                simAccountEffect: SimAccountEffect.Unknown,
                source: CONFIRMED_SOURCE,
            }),
        );
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, { accounts: [live, sibling] }),
        );
        expect(alerts).toEqual([]);
    });

    it('is silent when the policy is unverified', () => {
        const live = accountFor(ENTRY, { stage: AccountStage.Live });
        const sibling = accountFor(ENTRY);
        const alerts = alertsOf(rule, { accounts: [live, sibling] });
        expect(alerts).toEqual([]);
    });

    it('is silent when there is no live account at the firm', () => {
        const sibling = accountFor(ENTRY);
        const policy = new StubExclusivityPolicy(
            policyWith({
                simAccountEffect: SimAccountEffect.Dormant,
                source: CONFIRMED_SOURCE,
            }),
        );
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, { accounts: [sibling] }),
        );
        expect(alerts).toEqual([]);
    });

    it('does not name an already-ended sibling', () => {
        const live = accountFor(ENTRY, { stage: AccountStage.Live });
        const busted = accountFor(ENTRY, { status: AccountStatus.Busted });
        const policy = new StubExclusivityPolicy(
            policyWith({
                simAccountEffect: SimAccountEffect.Dormant,
                source: CONFIRMED_SOURCE,
            }),
        );
        const alerts = withStubbedPolicy(policy, () =>
            alertsOf(rule, { accounts: [live, busted] }),
        );
        expect(alerts).toEqual([]);
    });
});
