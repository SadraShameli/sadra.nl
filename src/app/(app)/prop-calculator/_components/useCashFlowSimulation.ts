'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
    type CouponDiscounts,
    type DayStopRule,
    type Plan,
} from '~/lib/prop-calculator';
import {
    DEFAULT_DAY_BUDGET,
    type PortfolioTimelineResult,
    simulatePortfolioTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';

interface Arguments {
    accounts: number;
    commissionPerRoundTrip?: number;
    dayBudget?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    maxEvalDays: number;
    plan: Plan;
    riskPerTrade: number;
    rrRatio: number;
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

// This panel has no web workers available (everything runs main-thread), so
// `tradesPerDay` is capped independently of the global calculator's slider
// (which allows up to 50) to keep the worst-case cost bounded — see
// `portfolioTimeline.ts`'s own perf-guardrail comments for the arithmetic
// this is based on.
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
        maxEvalDays,
        plan,
        riskPerTrade,
        rrRatio,
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

    const latest = useRef({
        accounts,
        commissionPerRoundTrip,
        dayBudget,
        dayStop,
        discounts,
        effectiveTradesPerDay,
        maxEvalDays,
        plan,
        riskPerTrade,
        rrRatio,
        seed,
        trials,
        winrate,
    });
    latest.current = {
        accounts,
        commissionPerRoundTrip,
        dayBudget,
        dayStop,
        discounts,
        effectiveTradesPerDay,
        maxEvalDays,
        plan,
        riskPerTrade,
        rrRatio,
        seed,
        trials,
        winrate,
    };

    const key = useMemo(
        () =>
            JSON.stringify({
                accounts,
                commission: commissionPerRoundTrip ?? 0,
                dayBudget,
                dayStop,
                discActivation: discounts?.activationPercent ?? 0,
                discEval: discounts?.evalPercent ?? 0,
                maxEvalDays,
                planId: plan.id,
                risk: riskPerTrade,
                rr: rrRatio,
                seed,
                tpd: effectiveTradesPerDay,
                trials,
                winrate,
            }),
        [
            accounts,
            commissionPerRoundTrip,
            dayBudget,
            dayStop,
            discounts?.activationPercent,
            discounts?.evalPercent,
            maxEvalDays,
            plan.id,
            riskPerTrade,
            rrRatio,
            seed,
            effectiveTradesPerDay,
            trials,
            winrate,
        ],
    );

    const [debouncedKey, setDebouncedKey] = useState(key);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedKey(key), DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [key]);

    const [result, setResult] = useState<null | PortfolioTimelineResult>(null);
    const [pending, setPending] = useState(true);

    useEffect(() => {
        const {
            accounts,
            commissionPerRoundTrip,
            dayBudget,
            dayStop,
            discounts,
            effectiveTradesPerDay,
            maxEvalDays,
            plan,
            riskPerTrade,
            rrRatio,
            seed,
            trials,
            winrate,
        } = latest.current;
        let isCancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const next = simulatePortfolioTimeline({
                accounts,
                commissionPerRoundTrip,
                dayBudget,
                dayStop,
                discounts,
                maxEvalDays,
                plan,
                riskPerTrade,
                rrRatio,
                seed,
                tradesPerDay: effectiveTradesPerDay,
                trials,
                winrate,
            });
            if (!isCancelled) {
                setResult(next);
                setPending(false);
            }
        }, 0);
        return () => {
            isCancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey]);

    return { effectiveTradesPerDay, isTradesPerDayCapped, pending, result };
}
