import { Plan, type PlanInit } from './Plan';

// Module-private, un-exported `Plan` subclass with zero overrides — mirrors
// every firm file's own `class FooPlan extends Plan {}` (e.g. Apex's
// `ApexPlan`), since `Plan` has no abstract members left to implement.
class VariantPlan extends Plan {}

/**
 * Clones a `Plan` with a partial set of `PlanInit` overrides applied,
 * returning a brand-new `Plan` instance. The original `plan` is left
 * completely untouched.
 *
 * Safe by construction: every `Plan` method reads exclusively from
 * `this.init.*`, so an overridden field flows through `isBust`/`isPassed`/
 * `payoutFromProfit`/`totalCostThroughDay` automatically — no changes to
 * `Plan`, `DrawdownStrategy`, `PayoutTiers`, or `simulator.ts` are needed.
 */
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
        minDaysAfterPassForPayout: plan.minDaysAfterPassForPayout,
        minPayoutProfit: plan.minPayoutProfit,
        minQualifyingDayProfit: plan.minQualifyingDayProfit,
        minTradingDays: plan.minTradingDays,
        payoutLadder: plan.payoutLadder,
        payoutSchedule: plan.payoutSchedule,
        payoutTiers: plan.payoutTiers,
        profitTarget: plan.profitTarget,
    };

    return new VariantPlan({ ...baseInit, ...overrides });
}
