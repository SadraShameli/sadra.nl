import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    PooledCapReachedRule,
} from '~/lib/prop-accounts/alerts';
import {
    type AccountCapPolicy,
    AccountCapPolicyKind,
    ALL_FIRMS,
    FirmAccountPolicy,
    type FirmId,
    serializePlanId,
    type SharedPoolPolicy,
} from '~/lib/prop-calculator';

import { accountFor, alertsOf, planWhere } from './alertFixtures';

const FUNDED_ENTRY = planWhere((plan) => plan.isInstantFunded);
const FUNDED_PLAN_SERIAL = serializePlanId(FUNDED_ENTRY.plan.id);
const rule = new PooledCapReachedRule();

class StubCapPolicy extends FirmAccountPolicy {
    constructor(private readonly policy: AccountCapPolicy) {
        super();
    }

    override capPolicyFor(): AccountCapPolicy {
        return this.policy;
    }
}

function withStubbedPolicy<T>(
    firmId: FirmId,
    policy: FirmAccountPolicy,
    run: () => T,
): T {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === firmId);
    if (firm === undefined) throw new Error('expected the entry firm to be registered');
    const mutable = firm as { accountPolicy: FirmAccountPolicy };
    const original = mutable.accountPolicy;
    mutable.accountPolicy = policy;
    try {
        return run();
    } finally {
        mutable.accountPolicy = original;
    }
}

describe('PooledCapReachedRule: per-plan (default) cap', () => {
    it('is silent below the plan cap', () => {
        const cap = FUNDED_ENTRY.plan.maxFundedAccounts;
        const accounts = Array.from({ length: Math.max(1, cap - 1) }, () =>
            accountFor(FUNDED_ENTRY),
        );
        const alerts = alertsOf(rule, { accounts });
        expect(alerts).toEqual([]);
    });

    it('warns once every plan slot is used, naming the accounts (fires on a known, always-verified plan cap)', () => {
        const cap = FUNDED_ENTRY.plan.maxFundedAccounts;
        const accounts = Array.from({ length: cap }, () =>
            accountFor(FUNDED_ENTRY),
        );
        const alerts = alertsOf(rule, { accounts });
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.PooledCapReached);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.subject).toMatchObject({
            accountIds: accounts.map((account) => account.id),
            kind: AlertSubjectKind.Portfolio,
        });
    });
});

describe('PooledCapReachedRule: shared pool', () => {
    it('warns once the verified pool has no free slots', () => {
        const policy: SharedPoolPolicy = {
            excludedPlans: [],
            household: false,
            kind: AccountCapPolicyKind.SharedPool,
            members: [FUNDED_PLAN_SERIAL],
            poolSize: 2,
            reduction: null,
            subCaps: [],
        };
        const accounts = [
            accountFor(FUNDED_ENTRY),
            accountFor(FUNDED_ENTRY),
        ];
        const alerts = withStubbedPolicy(
            FUNDED_ENTRY.firmId,
            new StubCapPolicy(policy),
            () => alertsOf(rule, { accounts }),
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
    });

    it('is silent while the verified pool still has a free slot', () => {
        const policy: SharedPoolPolicy = {
            excludedPlans: [],
            household: false,
            kind: AccountCapPolicyKind.SharedPool,
            members: [FUNDED_PLAN_SERIAL],
            poolSize: 3,
            reduction: null,
            subCaps: [],
        };
        const accounts = [accountFor(FUNDED_ENTRY), accountFor(FUNDED_ENTRY)];
        const alerts = withStubbedPolicy(
            FUNDED_ENTRY.firmId,
            new StubCapPolicy(policy),
            () => alertsOf(rule, { accounts }),
        );
        expect(alerts).toEqual([]);
    });
});
