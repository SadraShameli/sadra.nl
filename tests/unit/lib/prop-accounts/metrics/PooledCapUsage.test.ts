import { describe, expect, it } from 'vitest';

import { AccountStage, AccountStatus } from '~/lib/prop-accounts/core';
import { pooledCapUsage } from '~/lib/prop-accounts/metrics';
import {
    AccountCapPolicyKind,
    FirmAccountPolicy,
    type SharedPoolPolicy,
} from '~/lib/prop-calculator';

import {
    account,
    EVAL_PLAN,
    ledger,
    SAME_FIRM_SECOND_EVAL_PLAN,
} from './ledgerFixtures';

class FixedPoolPolicy extends FirmAccountPolicy {
    constructor(private readonly pool: SharedPoolPolicy) {
        super();
    }

    override capPolicyFor(): SharedPoolPolicy {
        return this.pool;
    }
}

function withStubbedPolicy<T>(policy: FirmAccountPolicy, run: () => T): T {
    const firm = EVAL_PLAN.firm as { accountPolicy: FirmAccountPolicy };
    const original = firm.accountPolicy;
    firm.accountPolicy = policy;
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('pooledCapUsage', () => {
    it('falls back to per-plan caps and lists the firm as cap scope unverified when the firm has no verified pool', () => {
        const usage = pooledCapUsage(
            ledger({ accounts: [account(EVAL_PLAN, { stage: AccountStage.Funded })] }),
        );
        expect(usage.pooledCapsModeled).toBe(false);
        expect(usage.capScopeUnverifiedFirmIds).toEqual([EVAL_PLAN.firm.id]);
        expect(usage.plans).toEqual([
            expect.objectContaining({
                isVerified: false,
                planSerial: EVAL_PLAN.serial,
                poolFreeSlots: null,
                used: 1,
            }),
        ]);
    });

    it('pools headroom across member plans of the same verified firm, taking the minimum with the per-plan cap', () => {
        const pool: SharedPoolPolicy = {
            excludedPlans: [],
            household: false,
            kind: AccountCapPolicyKind.SharedPool,
            members: [EVAL_PLAN.serial, SAME_FIRM_SECOND_EVAL_PLAN.serial],
            poolSize: 5,
            reduction: null,
            subCaps: [],
        };
        const usage = withStubbedPolicy(new FixedPoolPolicy(pool), () =>
            pooledCapUsage(
                ledger({
                    accounts: [
                        ...Array.from({ length: 4 }, () =>
                            account(EVAL_PLAN, { stage: AccountStage.Funded }),
                        ),
                        account(SAME_FIRM_SECOND_EVAL_PLAN, {
                            stage: AccountStage.Funded,
                        }),
                    ],
                }),
            ),
        );
        expect(usage.pooledCapsModeled).toBe(true);
        expect(usage.capScopeUnverifiedFirmIds).toEqual([]);
        for (const row of usage.plans) {
            expect(row.poolFreeSlots).toBe(0);
            expect(row.freeSlots).toBe(0);
            expect(row.isVerified).toBe(true);
        }
    });

    it('counts a suspended funded account against pool headroom the same as an active one', () => {
        const pool: SharedPoolPolicy = {
            excludedPlans: [],
            household: false,
            kind: AccountCapPolicyKind.SharedPool,
            members: [EVAL_PLAN.serial, SAME_FIRM_SECOND_EVAL_PLAN.serial],
            poolSize: 5,
            reduction: null,
            subCaps: [],
        };
        const usage = withStubbedPolicy(new FixedPoolPolicy(pool), () =>
            pooledCapUsage(
                ledger({
                    accounts: [
                        account(EVAL_PLAN, {
                            stage: AccountStage.Funded,
                            status: AccountStatus.Suspended,
                        }),
                    ],
                }),
            ),
        );
        const row = usage.plans.find((p) => p.planSerial === EVAL_PLAN.serial);
        expect(row?.suspended).toBe(1);
        expect(row?.used).toBe(1);
        expect(row?.poolFreeSlots).toBe(4);
    });

    it('applies a sub-cap within the pool, taking the minimum of the sub-cap headroom and the shared pool headroom', () => {
        const pool: SharedPoolPolicy = {
            excludedPlans: [],
            household: false,
            kind: AccountCapPolicyKind.SharedPool,
            members: [EVAL_PLAN.serial, SAME_FIRM_SECOND_EVAL_PLAN.serial],
            poolSize: 5,
            reduction: null,
            subCaps: [{ cap: 3, planSerial: EVAL_PLAN.serial }],
        };
        const usage = withStubbedPolicy(new FixedPoolPolicy(pool), () =>
            pooledCapUsage(
                ledger({
                    accounts: Array.from({ length: 3 }, () =>
                        account(EVAL_PLAN, { stage: AccountStage.Funded }),
                    ),
                }),
            ),
        );
        const row = usage.plans.find((p) => p.planSerial === EVAL_PLAN.serial);
        expect(row?.poolFreeSlots).toBe(0);
    });

    it('throws instead of silently reporting zero free slots when a shared-pool policy omits the plan itself from members', () => {
        const pool: SharedPoolPolicy = {
            excludedPlans: [],
            household: false,
            kind: AccountCapPolicyKind.SharedPool,
            members: [SAME_FIRM_SECOND_EVAL_PLAN.serial],
            poolSize: 5,
            reduction: null,
            subCaps: [],
        };
        expect(() =>
            withStubbedPolicy(new FixedPoolPolicy(pool), () =>
                pooledCapUsage(
                    ledger({
                        accounts: [account(EVAL_PLAN, { stage: AccountStage.Funded })],
                    }),
                ),
            ),
        ).toThrow(/not a member of this SharedPoolPolicy/);
    });

    it('discloses household pooling without counting household accounts', () => {
        const pool: SharedPoolPolicy = {
            excludedPlans: [],
            household: true,
            kind: AccountCapPolicyKind.SharedPool,
            members: [EVAL_PLAN.serial],
            poolSize: 5,
            reduction: null,
            subCaps: [],
        };
        const usage = withStubbedPolicy(new FixedPoolPolicy(pool), () =>
            pooledCapUsage(
                ledger({ accounts: [account(EVAL_PLAN, { stage: AccountStage.Funded })] }),
            ),
        );
        expect(usage.householdDisclosedFirmIds).toEqual([EVAL_PLAN.firm.id]);
    });
});
