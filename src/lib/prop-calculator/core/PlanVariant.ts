import { Plan, type PlanInit } from './Plan';

class VariantPlan extends Plan {}

export function withPlanOverrides(
    plan: Plan,
    overrides: Partial<PlanInit>,
): Plan {
    const baseInit: PlanInit = {
        accountSize: plan.accountSize,
        consistency: plan.consistency,
        drawdown: plan.drawdown,
        evalDailyLossLimit: plan.evalDailyLossLimit,
        fees: plan.fees,
        fundedDailyLossLimit: plan.fundedDailyLossLimit,
        id: plan.id,
        label: plan.label,
        maxFundedAccounts: plan.maxFundedAccounts,
        minDaysAfterPassForPayout: plan.minDaysAfterPassForPayout,
        minPayoutProfit: plan.minPayoutProfit,
        minQualifyingDayProfit: plan.minQualifyingDayProfit,
        minTradingDays: plan.minTradingDays,
        payoutLadder: plan.payoutLadder,
        payoutTiers: plan.payoutTiers,
        profitTarget: plan.profitTarget,
    };

    return new VariantPlan({ ...baseInit, ...overrides });
}
