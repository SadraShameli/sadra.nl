import { describe, expect, it } from 'vitest';

import {
    ConsistencyStatusKind,
    consistencyStatusOf,
    evalConsistencyStatus,
    fundedConsistencyStatus,
} from '~/lib/prop-accounts/metrics';
import {
    ConsistencyBasis,
    ConsistencyRule,
    ConsistencyScope,
    ConsistencyViolationEffect,
    findFirm,
    FirmId,
    fraction,
    FundedNextVariant,
    MffuVariant,
    type Plan,
    type PlanId,
} from '~/lib/prop-calculator';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

function mffPro(): Plan {
    const plan = findFirm(MFF_PRO_ID.firm)?.findPlan(MFF_PRO_ID);
    if (!plan) throw new Error('MFF Pro plan missing from the registry');
    return plan;
}

describe('consistencyStatusOf', () => {
    it('reports no rule when the plan has none for the stage', () => {
        expect(consistencyStatusOf(null, 100, 500)).toEqual({
            kind: ConsistencyStatusKind.NoRule,
        });
    });

    it('reports not evaluated when there is a rule but no best day yet', () => {
        const rule = new ConsistencyRule(ConsistencyScope.Funded, fraction(0.4));
        expect(consistencyStatusOf(rule, undefined, 500)).toEqual({
            kind: ConsistencyStatusKind.NotEvaluated,
            rule,
        });
    });

    it('reports the evaluated status, including whether the rule is violated', () => {
        const rule = new ConsistencyRule(ConsistencyScope.Funded, fraction(0.4));
        expect(consistencyStatusOf(rule, 300, 500)).toEqual({
            bestDayProfit: 300,
            isViolated: true,
            kind: ConsistencyStatusKind.Evaluated,
            rule,
            totalProfit: 500,
            violationEffectLabel: null,
        });
        expect(consistencyStatusOf(rule, 100, 500)).toMatchObject({
            isViolated: false,
            kind: ConsistencyStatusKind.Evaluated,
        });
    });

    it('labels a double-target violation effect as "target doubles"', () => {
        const rule = new ConsistencyRule(
            ConsistencyScope.Eval,
            fraction(0.5),
            ConsistencyBasis.Cycle,
            ConsistencyViolationEffect.DoubleTarget,
        );
        const status = consistencyStatusOf(rule, 400, 500);
        expect(status).toMatchObject({ violationEffectLabel: 'target doubles' });
    });
});

describe('fundedConsistencyStatus', () => {
    it('reads the tracker cycle best day and cycle profit against the plan rule', () => {
        const id: PlanId = {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Builder,
        };
        const plan = findFirm(id.firm)?.findPlan(id);
        if (!plan) throw new Error('MFF Builder plan missing');
        const status = fundedConsistencyStatus(plan, 0, 800, 2000);
        if (status.kind !== ConsistencyStatusKind.Evaluated) {
            throw new Error('expected an evaluated status');
        }
        expect(status.bestDayProfit).toBe(800);
        expect(status.totalProfit).toBe(2000);
        expect(status.rule).toBe(plan.fundedConsistencyRule(0));
    });

    it('reports no rule for a plan whose funded stage carries none', () => {
        const plan = mffPro();
        expect(plan.fundedConsistencyRule(0)).toBeNull();
        expect(fundedConsistencyStatus(plan, 0, 800, 2000)).toEqual({
            kind: ConsistencyStatusKind.NoRule,
        });
    });

    it('stays evaluable on the perpetual basis, where the best day never resets on payout', () => {
        const id: PlanId = {
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.Fnl003,
        };
        const plan = findFirm(id.firm)?.findPlan(id);
        if (!plan) throw new Error('FundedNext FNL:003 plan missing');
        const rule = plan.fundedConsistencyRule(1);
        if (rule === null) throw new Error('expected a funded consistency rule');
        expect(rule.isPerpetual()).toBe(true);
        const status = fundedConsistencyStatus(plan, 1, 900, 3000);
        expect(status).toMatchObject({
            bestDayProfit: 900,
            kind: ConsistencyStatusKind.Evaluated,
            totalProfit: 3000,
        });
    });
});

describe('evalConsistencyStatus', () => {
    it('reads the eval best day against the eval consistency rule', () => {
        const plan = mffPro();
        const status = evalConsistencyStatus(plan, 900, 3000);
        if (status.kind !== ConsistencyStatusKind.Evaluated) {
            throw new Error('expected an evaluated status');
        }
        expect(status.bestDayProfit).toBe(900);
        expect(status.totalProfit).toBe(3000);
        expect(status.rule).toBe(plan.evalConsistencyRule());
    });

    it('reports not evaluated without a recorded eval best day', () => {
        const plan = mffPro();
        const status = evalConsistencyStatus(plan, undefined, 3000);
        expect(status.kind).toBe(ConsistencyStatusKind.NotEvaluated);
    });
});
