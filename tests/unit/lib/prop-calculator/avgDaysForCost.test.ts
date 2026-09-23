import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    FirmId,
    type Plan,
    type PlanId,
    RungSizing,
    type SimInputs,
    TopStepVariant,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';
import { simulate } from '~/lib/prop-calculator/simulator';

function lowPassInputs(plan: Plan, winrate: number): SimInputs {
    return {
        fundedHorizonDays: 252,
        maxEvalDays: 150,
        plan,
        riskPerTrade: 900,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: 2,
        trials: 400,
        winrate,
    };
}

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error(`plan not found for ${id.firm}`);
    return plan;
}

const topstep = planFor({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});

describe('N-48: the cost breakdown bills the same renewal-chain subscription as the D1 cost per funded account', () => {
    const out = simulate(lowPassInputs(topstep, 0.4));
    const attemptsPerFundedAccount =
        out.expectedAttempts / out.evalPassProbability;
    const renewalChainSubscription =
        out.costPerFundedAccount -
        topstep.fees.oneTimeEval -
        (attemptsPerFundedAccount - 1) * topstep.retryFee() -
        topstep.fees.activation;

    it('uses a subscription plan with a low eval pass rate', () => {
        expect(topstep.fees.monthlySubscription).toBeGreaterThan(0);
        expect(out.evalPassProbability).toBeGreaterThan(0);
        expect(out.evalPassProbability).toBeLessThan(0.5);
    });

    it('matches the subscription part of the cost per funded account, failed-attempt days included', () => {
        expect(out.costBreakdown.monthlySubsTotal).toBeCloseTo(
            renewalChainSubscription,
            6,
        );
    });

    it('bills more than the months of the mean passing attempt alone', () => {
        const passingAttemptMonths = Math.max(
            1,
            Math.ceil(out.expectedDaysToPass / TRADING_DAYS_PER_MONTH),
        );
        expect(out.costBreakdown.monthlySubsTotal).toBeGreaterThan(
            topstep.fees.monthlySubscription * passingAttemptMonths,
        );
    });

    it('reports the subscription per funded account, not multiplied by the copy count', () => {
        const fiveCopies = simulate({
            ...lowPassInputs(topstep, 0.4),
            copyAccounts: 5,
        });
        expect(fiveCopies.costBreakdown.monthlySubsTotal).toBeCloseTo(
            out.costBreakdown.monthlySubsTotal,
            6,
        );
        expect(fiveCopies.costBreakdown.monthlySubsTotal).toBeLessThan(
            fiveCopies.costPerFundedAccount,
        );
    });

    it('reports an unbounded subscription bill when no attempt ever passes', () => {
        const never = simulate(lowPassInputs(topstep, 0));
        expect(never.evalPassProbability).toBe(0);
        expect(never.costPerFundedAccount).toBe(Infinity);
        expect(never.costBreakdown.monthlySubsTotal).toBe(Infinity);
    });

    it('bills no subscription on a plan without one, even when no attempt passes', () => {
        const apex = planFor({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        const never = simulate(lowPassInputs(apex, 0));
        expect(apex.fees.monthlySubscription).toBe(0);
        expect(never.evalPassProbability).toBe(0);
        expect(never.costBreakdown.monthlySubsTotal).toBe(0);
    });
});
