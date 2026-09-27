import { describe, expect, it } from 'vitest';

import {
    accountCapHeadroomFor,
    type AccountCapPolicy,
    AccountCapPolicyKind,
    PER_PLAN_CAP_POLICY,
    type PlanAccountCounts,
    serializePlanId,
    sharedPoolHeadroom,
    type SharedPoolPolicy,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

const ALL_PLANS = ALL_FIRMS.flatMap((firm) => firm.plans);

describe('PerPlanCapPolicy', () => {
    it('gives every registry plan headroom equal to its own maxFundedAccounts when no accounts are held', () => {
        for (const plan of ALL_PLANS) {
            expect(
                accountCapHeadroomFor(plan, PER_PLAN_CAP_POLICY, new Map()),
            ).toBe(plan.maxFundedAccounts);
        }
    });

    it('shrinks as accounts are held, for every registry plan', () => {
        for (const plan of ALL_PLANS) {
            const serial = serializePlanId(plan.id);
            const counts: PlanAccountCounts = new Map([[serial, 1]]);
            expect(
                accountCapHeadroomFor(plan, PER_PLAN_CAP_POLICY, counts),
            ).toBe(Math.max(0, plan.maxFundedAccounts - 1));
        }
    });
});

const RAPID = 'rapid';
const RAPID_EOD = 'rapid-eod';
const BUILDER = 'builder';
const PRO = 'pro';

function poolPolicy(): SharedPoolPolicy {
    return {
        excludedPlans: [],
        household: false,
        kind: AccountCapPolicyKind.SharedPool,
        members: [RAPID, RAPID_EOD, BUILDER, PRO],
        poolSize: 5,
        reduction: null,
        subCaps: [
            { cap: 3, planSerial: RAPID_EOD },
            { cap: 1, planSerial: BUILDER },
        ],
    };
}

describe('SharedPoolPolicy.headroom (pure, keyed by plan serial)', () => {
    it('gives every member 0 when the pool and a sub-cap are both full: 3 Rapid EOD plus 2 Rapid', () => {
        const counts: PlanAccountCounts = new Map([
            [RAPID, 2],
            [RAPID_EOD, 3],
        ]);
        const headroom = sharedPoolHeadroom(poolPolicy(), counts);
        expect(headroom.get(RAPID)).toBe(0);
        expect(headroom.get(RAPID_EOD)).toBe(0);
        expect(headroom.get(BUILDER)).toBe(0);
        expect(headroom.get(PRO)).toBe(0);
    });

    it('gives Rapid EOD 0 (its own sub-cap is full) and Pro 1 (pool room remains): 3 Rapid EOD plus 1 Pro', () => {
        const counts: PlanAccountCounts = new Map([
            [PRO, 1],
            [RAPID_EOD, 3],
        ]);
        const headroom = sharedPoolHeadroom(poolPolicy(), counts);
        expect(headroom.get(RAPID_EOD)).toBe(0);
        expect(headroom.get(PRO)).toBe(1);
    });

    it('never lets a sub-cap headroom exceed the remaining pool room', () => {
        const counts: PlanAccountCounts = new Map([[PRO, 5]]);
        const headroom = sharedPoolHeadroom(poolPolicy(), counts);
        expect(headroom.get(BUILDER)).toBe(0);
    });

    it('never consumes pool room for an excluded plan, and bounds it only by its own cap', () => {
        const withExclusion: SharedPoolPolicy = {
            ...poolPolicy(),
            excludedPlans: [{ cap: 3, planSerial: 'fnl003' }],
            members: [...poolPolicy().members, 'fnl003'],
        };
        const counts: PlanAccountCounts = new Map([
            ['fnl003', 2],
            [RAPID, 5],
        ]);
        const headroom = sharedPoolHeadroom(withExclusion, counts);
        expect(headroom.get('fnl003')).toBe(1);
        expect(headroom.get(RAPID)).toBe(0);
    });

    it('the reduction rule is inert without a trigger plan held', () => {
        const withReduction: SharedPoolPolicy = {
            ...poolPolicy(),
            reduction: { reducedPoolSize: 3, triggerPlanSerial: 'advanced' },
        };
        const noTrigger: PlanAccountCounts = new Map([[RAPID, 4]]);
        expect(sharedPoolHeadroom(withReduction, noTrigger).get(PRO)).toBe(1);

        const withTrigger: PlanAccountCounts = new Map([
            ['advanced', 1],
            [RAPID, 2],
        ]);
        expect(sharedPoolHeadroom(withReduction, withTrigger).get(PRO)).toBe(
            1,
        );
    });

    it('reduces pool room once the trigger plan is held', () => {
        const withReduction: SharedPoolPolicy = {
            ...poolPolicy(),
            reduction: { reducedPoolSize: 3, triggerPlanSerial: 'advanced' },
        };
        const withTrigger: PlanAccountCounts = new Map([
            ['advanced', 1],
            [RAPID, 3],
        ]);
        expect(sharedPoolHeadroom(withReduction, withTrigger).get(RAPID)).toBe(
            0,
        );
        const sameCountsNoTrigger: PlanAccountCounts = new Map([[RAPID, 3]]);
        expect(
            sharedPoolHeadroom(withReduction, sameCountsNoTrigger).get(RAPID),
        ).toBe(2);
    });
});

describe('accountCapHeadroomFor(SharedPoolPolicy) data-wiring guard', () => {
    it('throws, naming the plan serial, when the plan is not a member of the pool', () => {
        const outsidePlan = ALL_PLANS[0];
        if (outsidePlan === undefined) throw new Error('registry has no plans');
        const outsideSerial = serializePlanId(outsidePlan.id);
        expect(poolPolicy().members.includes(outsideSerial)).toBe(false);
        expect(() =>
            accountCapHeadroomFor(outsidePlan, poolPolicy(), new Map()),
        ).toThrow(outsideSerial);
    });
});

describe('AccountCapPolicy union', () => {
    it('discriminates by kind', () => {
        const policies: AccountCapPolicy[] = [PER_PLAN_CAP_POLICY, poolPolicy()];
        expect(policies[0]?.kind).toBe(AccountCapPolicyKind.PerPlan);
        expect(policies[1]?.kind).toBe(AccountCapPolicyKind.SharedPool);
    });
});
