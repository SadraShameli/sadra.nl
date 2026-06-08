'use client';

import { useEffect, useMemo, useState } from 'react';

import {
    type MultiAccountResult,
    type Plan,
    simulatePortfolio,
} from '~/lib/prop-calculator';

import { gamblersRuinAsymmetric } from './lab/labMath';
import { type LabScenario } from './types';

interface Args {
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

interface LabResult {
    result: MultiAccountResult;
    scenarioId: string;
}

const DEBOUNCE_MS = 600;
const TRIALS_BASE = 400;
const TRIALS_INDEPENDENT = 250;

export function useLabSimulation(args: Args): {
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
    } = args;

    const key = useMemo(
        () =>
            JSON.stringify({
                actDiscount: activationDiscountPercent,
                commission: commissionPerRoundTrip,
                evalDiscount: discountPercent,
                fundedHorizonDays,
                linkAct: linkActivationDiscount,
                maxEvalDays,
                planId: plan.id,
                scenarios: scenarios.map((s) => ({
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
                seed,
            }),
        [
            plan.id,
            seed,
            maxEvalDays,
            fundedHorizonDays,
            commissionPerRoundTrip,
            discountPercent,
            activationDiscountPercent,
            linkActivationDiscount,
            scenarios,
        ],
    );

    const [debouncedKey, setDebouncedKey] = useState(key);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedKey(key), DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [key]);

    const [results, setResults] = useState<Map<string, MultiAccountResult>>(
        () => new Map(),
    );
    const [pending, setPending] = useState(false);

    useEffect(() => {
        if (scenarios.length === 0) {
            setResults(new Map());
            setPending(false);
            return;
        }
        let cancelled = false;
        setPending(true);
        const handle = setTimeout(() => {
            const next = new Map<string, MultiAccountResult>();
            const out: LabResult[] = [];
            const dd = plan.drawdown.amount;
            const target = plan.profitTarget;
            for (const sc of scenarios) {
                const trials =
                    sc.correlation === 'independent'
                        ? TRIALS_INDEPENDENT
                        : TRIALS_BASE;
                const r = simulatePortfolio({
                    accounts: sc.accounts,
                    commissionPerRoundTrip,
                    correlation: sc.correlation,
                    dayStop: sc.dayStop,
                    discounts: {
                        activationPercent: linkActivationDiscount
                            ? discountPercent
                            : activationDiscountPercent,
                        evalPercent: discountPercent,
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
                const enriched: MultiAccountResult = {
                    ...r,
                    theoreticalPassProb: theoretical,
                };
                next.set(sc.id, enriched);
                out.push({ result: enriched, scenarioId: sc.id });
            }
            if (!cancelled) {
                setResults(next);
                setPending(false);
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [debouncedKey]);

    return { pending, results };
}
