'use client';

import {
    CorrelationMode,
    type MultiAccountResult,
    percent,
    type Plan,
    type RungSizing,
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
    minRetainedCushion?: number;
    monthlySubscriptionDiscountPercent?: number;
    payoutRequestSize?: number;
    plan: Plan;
    resetDiscountPercent?: number;
    rungSizing?: RungSizing;
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
        minRetainedCushion,
        monthlySubscriptionDiscountPercent = 0,
        payoutRequestSize,
        plan,
        resetDiscountPercent = 0,
        rungSizing,
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
        minRetainedCushion,
        monthlySubscriptionDiscountPercent,
        payoutRequestSize,
        plan,
        resetDiscountPercent,
        rungSizing,
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
                        monthlySubscriptionPercent: percent(
                            monthlySubscriptionDiscountPercent,
                        ),
                        resetPercent: percent(resetDiscountPercent),
                    },
                    fundedHorizonDays,
                    groups: sc.groups,
                    instrument: sc.instrument ?? undefined,
                    maxAttempts: 1,
                    maxEvalDays,
                    minRetainedCushion,
                    payoutRequestSize,
                    plan,
                    riskPerTrade: sc.riskPerTrade,
                    rrRatio: sc.rrRatio,
                    rungSizing,
                    seed,
                    stopPoints: sc.stopPoints ?? undefined,
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
    const isPending = scenarios.length > 0 && computation.pending;
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
    minRetainedCushion: number | undefined;
    monthlySubscriptionDiscountPercent: number;
    payoutRequestSize: number | undefined;
    plan: Plan;
    resetDiscountPercent: number;
    rungSizing: RungSizing | undefined;
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
        minRetainedCushion: fields.minRetainedCushion ?? null,
        msubDiscount: fields.monthlySubscriptionDiscountPercent,
        payoutRequestSize: fields.payoutRequestSize ?? null,
        planId: fields.plan.id,
        resetDiscount: fields.resetDiscountPercent,
        rungSizing: fields.rungSizing ?? null,
        scenarios: fields.scenarios.map((s) => ({
            a: s.accounts,
            c: s.correlation,
            ds: s.dayStop,
            g: s.groups,
            id: s.id,
            instrument: s.instrument,
            risk: s.riskPerTrade,
            rr: s.rrRatio,
            sp: s.stopPoints,
            tpd: s.tradesPerDay,
            wr: s.winrate,
        })),
        seed: fields.seed,
    });
}
