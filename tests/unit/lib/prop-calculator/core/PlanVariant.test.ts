import { describe, expect, it } from 'vitest';

import {
    FirmId,
    type Plan,
    withPlanOverrides,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';

const firm = new ApexTraderFunding();

function findPlan(accountSize: 25_000, variant: 'eod') {
    const plan = firm.findPlan({ accountSize, firm: FirmId.Apex, variant });
    if (!plan) {
        throw new Error(`Apex plan not found: ${accountSize} ${variant}`);
    }
    return plan;
}

// Every public field currently on `Plan` (post Part A), used to prove the
// original plan is left completely unmutated by `withPlanOverrides`.
function snapshotOf(plan: Plan) {
    return {
        accountSize: plan.accountSize,
        consistency: plan.consistency,
        drawdown: plan.drawdown,
        evalDailyLossLimit: plan.evalDailyLossLimit,
        fees: plan.fees,
        fundedDailyLossLimit: plan.fundedDailyLossLimit,
        id: plan.id,
        label: plan.label,
        minDaysAfterPassForPayout: plan.minDaysAfterPassForPayout,
        minPayoutProfit: plan.minPayoutProfit,
        minQualifyingDayProfit: plan.minQualifyingDayProfit,
        minTradingDays: plan.minTradingDays,
        payoutLadder: plan.payoutLadder,
        payoutSchedule: plan.payoutSchedule,
        payoutTiers: plan.payoutTiers,
        profitTarget: plan.profitTarget,
    };
}

describe('withPlanOverrides', () => {
    // 25K EOD: profitTarget 1500, minTradingDays 0, evalDailyLossLimit
    // { amount: 500, kind: 'flat' }, payoutTiers [{ thresholdProfit: 0,
    // traderShare: 1 }] (100% share, per Apex's post-Part-A ladder model).
    const basePlan = findPlan(25_000, 'eod');

    it('flows an overridden profitTarget through isPassed', () => {
        const state = basePlan.initialState();
        state.balance = state.startingBalance + 1000; // $1,000 profit
        state.tradingDays = 5;

        // Baseline: $1,000 profit is below the 25K plan's $1,500 target.
        expect(basePlan.isPassed(state)).toBe(false);

        const loweredTarget = withPlanOverrides(basePlan, {
            profitTarget: 500,
        });

        // Same state, lowered target: now clears it.
        expect(loweredTarget.isPassed(state)).toBe(true);
        // Baseline plan itself must be untouched by the variant's creation.
        expect(basePlan.profitTarget).toBe(1500);
        expect(basePlan.isPassed(state)).toBe(false);
    });

    it('flows an overridden evalDailyLossLimit through isBust', () => {
        const lossState = basePlan.initialState();
        lossState.todayPnL = -300;

        // Baseline flat $500 eval DLL: a $300 loss doesn't breach it (and
        // doesn't breach the $1,000 trailing drawdown either).
        expect(basePlan.isBust(lossState, 'eval')).toBe(false);

        const stricterDll = withPlanOverrides(basePlan, {
            evalDailyLossLimit: { amount: 200, kind: 'flat' },
        });

        // Same loss, tightened $200 eval DLL: now busts.
        expect(stricterDll.isBust(lossState, 'eval')).toBe(true);
        expect(basePlan.isBust(lossState, 'eval')).toBe(false);
    });

    it('flows overridden payoutTiers through payoutFromProfit', () => {
        // Baseline: Apex's post-Part-A payoutTiers is a flat 100% share.
        expect(basePlan.payoutFromProfit(1000)).toBe(1000);

        const halfShare = withPlanOverrides(basePlan, {
            payoutTiers: [{ thresholdProfit: 0, traderShare: 0.5 }],
        });

        expect(halfShare.payoutFromProfit(1000)).toBe(500);
        expect(basePlan.payoutFromProfit(1000)).toBe(1000);
    });

    it('flows overridden fees through totalCostThroughDay', () => {
        const baseCost = basePlan.totalCostThroughDay(21);

        const cheaperEval = withPlanOverrides(basePlan, {
            fees: { ...basePlan.fees, oneTimeEval: 1 },
        });

        expect(cheaperEval.totalCostThroughDay(21)).toBeLessThan(baseCost);
        expect(basePlan.totalCostThroughDay(21)).toBe(baseCost);
        expect(basePlan.fees.oneTimeEval).not.toBe(1);
    });

    it('leaves the original plan object completely unmutated', () => {
        const before = snapshotOf(basePlan);
        const feesReference = basePlan.fees;
        const payoutTiersReference = basePlan.payoutTiers;
        const drawdownReference = basePlan.drawdown;

        withPlanOverrides(basePlan, {
            evalDailyLossLimit: { amount: 1, kind: 'flat' },
            fees: {
                activation: 0,
                monthlySubscription: 0,
                oneTimeEval: 0,
                reset: 0,
            },
            label: 'stressed variant',
            minPayoutProfit: 999_999,
            payoutTiers: [{ thresholdProfit: 0, traderShare: 0 }],
            profitTarget: 1,
        });

        expect(snapshotOf(basePlan)).toEqual(before);
        // Reference equality too, not just value equality: the original
        // plan's own object graph was never touched or replaced.
        expect(basePlan.fees).toBe(feesReference);
        expect(basePlan.payoutTiers).toBe(payoutTiersReference);
        expect(basePlan.drawdown).toBe(drawdownReference);
    });

    it('returns a distinct Plan instance from the original', () => {
        const variant = withPlanOverrides(basePlan, { profitTarget: 1 });
        expect(variant).not.toBe(basePlan);
        expect(variant.profitTarget).toBe(1);
        expect(basePlan.profitTarget).toBe(1500);
    });
});
