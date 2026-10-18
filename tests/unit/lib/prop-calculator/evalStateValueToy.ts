import {
    type AccountState,
    applyTrade,
    closeTradingDay,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    type EvalStateValueConfig,
    type EvalStateValueResult,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
    recordBestDay,
    resetForNewDay,
    TradingPhase,
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

export function exactPolicyPassProbability(
    config: EvalStateValueConfig,
    result: EvalStateValueResult,
): number {
    const { computeRisk } = result.dayPolicy;
    if (!computeRisk) throw new Error('eval DP day policy has no computeRisk');
    const policyRisk: NonNullable<typeof computeRisk> = computeRisk;
    const { plan, rrRatio, winrate } = config;
    const slots = result.dayPolicy.ladder.length;
    const dayCap = plan.evalDayCap(config.maxEvalDays);

    function closeDay(state: AccountState, isTraded: boolean): number {
        const closed = { ...state };
        closeTradingDay(plan, TradingPhase.Eval, closed, isTraded);
        recordBestDay(closed);
        if (plan.isBust(closed, TradingPhase.Eval)) return 0;
        return plan.isPassed(closed) ? 1 : walkDay(closed);
    }

    function trade(
        state: AccountState,
        tradeIndex: number,
        pnl: number,
    ): number {
        const next = { ...state };
        applyTrade(plan, TradingPhase.Eval, next, pnl);
        if (plan.isBust(next, TradingPhase.Eval)) return 0;
        return plan.isDayLockedOut(next, TradingPhase.Eval)
            ? closeDay(next, true)
            : walkTrades(next, tradeIndex + 1);
    }

    function walkTrades(state: AccountState, tradeIndex: number): number {
        if (tradeIndex >= slots) return closeDay(state, true);
        const intended = policyRisk(state, tradeIndex);
        const room = plan.affordableRoom(
            state,
            TradingPhase.Eval,
            config.commission ?? 0,
        ).room;
        const risk = Math.min(intended, room);
        if (risk <= 0) return closeDay(state, tradeIndex > 0);
        const commission = config.commission ?? 0;
        return (
            winrate * trade(state, tradeIndex, rrRatio * risk - commission) +
            (1 - winrate) * trade(state, tradeIndex, -risk - commission)
        );
    }

    function walkDay(state: AccountState): number {
        if ((state.elapsedDays ?? 0) >= dayCap) return 0;
        const dayStart = { ...state };
        resetForNewDay(dayStart);
        return walkTrades(dayStart, 0);
    }

    return walkDay(plan.initialState());
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
