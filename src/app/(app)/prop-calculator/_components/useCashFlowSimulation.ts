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

import { simInputsCacheKey } from './simInputsCacheKey';
import { useDebouncedComputation } from './useDebouncedSimulation';

export interface CashFlowSimulationArguments {
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

export function cashFlowSimulationCacheKey(
    arguments_: CashFlowSimulationArguments,
): string {
    const {
        accounts,
        dayBudget = DEFAULT_DAY_BUDGET,
        tradesPerDay,
        ...inputs
    } = arguments_;
    return simInputsCacheKey(
        {
            ...inputs,
            tradesPerDay: effectiveCashFlowTradesPerDay(tradesPerDay),
        },
        { extra: { accounts, dayBudget } },
    );
}

export function useCashFlowSimulation(
    arguments_: CashFlowSimulationArguments,
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

    const effectiveTradesPerDay = effectiveCashFlowTradesPerDay(tradesPerDay);
    const isTradesPerDayCapped = tradesPerDay > CASH_FLOW_MAX_TRADES_PER_DAY;

    const key = cashFlowSimulationCacheKey(arguments_);

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

function effectiveCashFlowTradesPerDay(tradesPerDay: number): number {
    return Math.min(
        CASH_FLOW_MAX_TRADES_PER_DAY,
        Math.max(1, Math.floor(tradesPerDay)),
    );
}
