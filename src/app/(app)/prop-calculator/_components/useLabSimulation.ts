'use client';

import {
    CorrelationMode,
    type MultiAccountResult,
    percent,
    type Plan,
    simulatePortfolio,
} from '~/lib/prop-calculator';

import { gamblersRuinAsymmetric } from './lab/labMath';
import { type LabScenario } from './types';
import { useDebouncedComputation } from './useDebouncedSimulation';

interface Arguments {
    activationDiscountPercent?: number;
    commissionPerRoundTrip: number;
    discountPercent?: number;
    fundedHorizonDays: number;
    linkActivationDiscount?: boolean;
    maxEvalDays: number;
    plan: Plan;
    scenarios: LabScenario[];
    seed: number;
}

const DEBOUNCE_MS = 600;
const TRIALS_BASE = 400;
const TRIALS_INDEPENDENT = 250;
const EMPTY_RESULTS = new Map<string, MultiAccountResult>();

export function useLabSimulation(arguments_: Arguments): {
    pending: boolean;
    results: Map<string, MultiAccountResult>;
} {
    const {
        activationDiscountPercent = 0,
        commissionPerRoundTrip,
        discountPercent = 0,
        fundedHorizonDays,
        linkActivationDiscount = false,
        maxEvalDays,
        plan,
        scenarios,
        seed,
    } = arguments_;

    const key = buildCacheKey({
        activationDiscountPercent,
        commissionPerRoundTrip,
        discountPercent,
        fundedHorizonDays,
        linkActivationDiscount,
        maxEvalDays,
        plan,
        scenarios,
        seed,
    });

    const computation = useDebouncedComputation<
        Map<string, MultiAccountResult>
    >(
        key,
        DEBOUNCE_MS,
        () => {
            const next = new Map<string, MultiAccountResult>();
            const dd = plan.drawdown.amount;
            const target = plan.profitTarget;
            for (const sc of scenarios) {
                const trials =
                    sc.correlation === CorrelationMode.Independent
                        ? TRIALS_INDEPENDENT
                        : TRIALS_BASE;
                const r = simulatePortfolio({
                    accounts: sc.accounts,
                    commissionPerRoundTrip,
                    correlation: sc.correlation,
                    dayStop: sc.dayStop,
                    discounts: {
                        activationPercent: percent(
                            linkActivationDiscount
                                ? discountPercent
                                : activationDiscountPercent,
                        ),
                        evalPercent: percent(discountPercent),
                    },
                    fundedHorizonDays,
                    groups: sc.groups,
                    maxAttempts: 1,
                    maxEvalDays,
                    plan,
                    riskPerTrade: sc.riskPerTrade,
                    rrRatio: sc.rrRatio,
                    seed,
                    tradesPerDay: sc.tradesPerDay,
                    trials,
                    winrate: sc.winrate,
                });
                const targetUnits =
                    sc.riskPerTrade > 0 ? target / sc.riskPerTrade : 0;
                const ddUnits = sc.riskPerTrade > 0 ? dd / sc.riskPerTrade : 0;
                const theoretical = gamblersRuinAsymmetric(
                    sc.winrate,
                    sc.rrRatio,
                    targetUnits,
                    ddUnits,
                );
                next.set(sc.id, { ...r, theoreticalPassProb: theoretical });
            }
            return next;
        },
        EMPTY_RESULTS,
    );
    const isPending = scenarios.length === 0 ? false : computation.pending;
    const results = scenarios.length === 0 ? EMPTY_RESULTS : computation.result;

    return { pending: isPending, results };
}

function buildCacheKey(fields: {
    activationDiscountPercent: number;
    commissionPerRoundTrip: number;
    discountPercent: number;
    fundedHorizonDays: number;
    linkActivationDiscount: boolean;
    maxEvalDays: number;
    plan: Plan;
    scenarios: LabScenario[];
    seed: number;
}): string {
    return JSON.stringify({
        actDiscount: fields.activationDiscountPercent,
        commission: fields.commissionPerRoundTrip,
        evalDiscount: fields.discountPercent,
        fundedHorizonDays: fields.fundedHorizonDays,
        linkAct: fields.linkActivationDiscount,
        maxEvalDays: fields.maxEvalDays,
        planId: fields.plan.id,
        scenarios: fields.scenarios.map((s) => ({
            a: s.accounts,
            c: s.correlation,
            ds: s.dayStop,
            g: s.groups,
            id: s.id,
            risk: s.riskPerTrade,
            rr: s.rrRatio,
            tpd: s.tradesPerDay,
            wr: s.winrate,
        })),
        seed: fields.seed,
    });
}
