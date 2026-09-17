'use client';

import {
    type CouponDiscounts,
    type DayPolicy,
    type DayStopRule,
    type Plan,
    type RungSizing,
} from '~/lib/prop-calculator';
import {
    DEFAULT_DAY_BUDGET,
    type PortfolioTimelineResult,
    simulatePortfolioTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';

import { useDebouncedComputation } from './useDebouncedSimulation';

interface Arguments {
    accounts: number;
    commissionPerRoundTrip?: number;
    dayBudget?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    evalDayPolicy?: DayPolicy;
    maxEvalDays: number;
    minRetainedCushion?: number;
    payoutRequestSize?: number;
    plan: Plan;
    riskPerTrade: number;
    rrRatio: number;
    rungSizing?: RungSizing;
    seed: number;
    tradesPerDay: number;
    trials: number;
    winrate: number;
}

interface UseCashFlowSimulationReturn {
    effectiveTradesPerDay: number;
    isTradesPerDayCapped: boolean;
    pending: boolean;
    result: null | PortfolioTimelineResult;
}

export const CASH_FLOW_MAX_TRADES_PER_DAY = 10;

const DEBOUNCE_MS = 550;

export function useCashFlowSimulation(
    arguments_: Arguments,
): UseCashFlowSimulationReturn {
    const {
        accounts,
        commissionPerRoundTrip,
        dayBudget = DEFAULT_DAY_BUDGET,
        dayStop,
        discounts,
        evalDayPolicy,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing,
        seed,
        tradesPerDay,
        trials,
        winrate,
    } = arguments_;

    const effectiveTradesPerDay = Math.min(
        CASH_FLOW_MAX_TRADES_PER_DAY,
        Math.max(1, Math.floor(tradesPerDay)),
    );
    const isTradesPerDayCapped = tradesPerDay > CASH_FLOW_MAX_TRADES_PER_DAY;

    const key = buildCacheKey({
        accounts,
        commissionPerRoundTrip,
        dayBudget,
        dayStop,
        discounts,
        effectiveTradesPerDay,
        evalDayPolicy,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing,
        seed,
        trials,
        winrate,
    });

    const { pending, result } =
        useDebouncedComputation<null | PortfolioTimelineResult>(
            key,
            DEBOUNCE_MS,
            () =>
                simulatePortfolioTimeline({
                    accounts,
                    commissionPerRoundTrip,
                    dayBudget,
                    dayStop,
                    discounts,
                    evalDayPolicy,
                    maxEvalDays,
                    minRetainedCushion,
                    payoutRequestSize,
                    plan,
                    riskPerTrade,
                    rrRatio,
                    rungSizing,
                    seed,
                    tradesPerDay: effectiveTradesPerDay,
                    trials,
                    winrate,
                }),
            null,
            true,
        );

    return { effectiveTradesPerDay, isTradesPerDayCapped, pending, result };
}

function buildCacheKey(fields: {
    accounts: number;
    commissionPerRoundTrip: number | undefined;
    dayBudget: number;
    dayStop: DayStopRule | undefined;
    discounts: CouponDiscounts | undefined;
    effectiveTradesPerDay: number;
    evalDayPolicy: DayPolicy | undefined;
    maxEvalDays: number;
    minRetainedCushion: number | undefined;
    payoutRequestSize: number | undefined;
    plan: Plan;
    riskPerTrade: number;
    rrRatio: number;
    rungSizing: RungSizing | undefined;
    seed: number;
    trials: number;
    winrate: number;
}): string {
    return JSON.stringify({
        accounts: fields.accounts,
        commission: fields.commissionPerRoundTrip ?? 0,
        dayBudget: fields.dayBudget,
        dayStop: fields.dayStop,
        discActivation: fields.discounts?.activationPercent ?? 0,
        discEval: fields.discounts?.evalPercent ?? 0,
        discMonthlySub: fields.discounts?.monthlySubscriptionPercent ?? 0,
        discReset: fields.discounts?.resetPercent ?? 0,
        evalDayPolicy: fields.evalDayPolicy,
        maxEvalDays: fields.maxEvalDays,
        minRetainedCushion: fields.minRetainedCushion ?? null,
        payoutRequestSize: fields.payoutRequestSize ?? null,
        planId: fields.plan.id,
        risk: fields.riskPerTrade,
        rr: fields.rrRatio,
        rungSizing: fields.rungSizing ?? null,
        seed: fields.seed,
        tpd: fields.effectiveTradesPerDay,
        trials: fields.trials,
        winrate: fields.winrate,
    });
}
