import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    type EvalStateValueConfig,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

export function baseBuilderPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Builder,
    });
    if (!plan) throw new Error('MFF Builder 50K plan not found');
    return plan;
}

export function toyDpConfig(
    plan: Plan,
    maxEvalDays: number,
    maxActionDollars: number,
): EvalStateValueConfig {
    return {
        actionStepDollars: 50,
        cushionStepDollars: 50,
        maxActionDollars,
        maxEvalDays,
        plan,
        profitStepDollars: 50,
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: fraction(0.5),
    };
}

export function toyPlan(profitTarget: number): Plan {
    return baseBuilderPlan().withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        maxEvalTradingDays: undefined,
        minTradingDays: 0,
        profitTarget: dollars(profitTarget),
    });
}
