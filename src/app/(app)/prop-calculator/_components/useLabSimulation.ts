'use client';

import { useEffect, useMemo, useState } from 'react';

import {
    simulatePortfolio,
    type MultiAccountResult,
    type Plan,
} from '~/lib/prop-calculator';

import { gamblersRuinAsymmetric } from './lab/labMath';
import { type LabScenario } from './types';

interface Args {
    plan: Plan;
    seed: number;
    maxEvalDays: number;
    fundedHorizonDays: number;
    commissionPerRoundTrip: number;
    scenarios: LabScenario[];
    discountPercent?: number;
    activationDiscountPercent?: number;
    linkActivationDiscount?: boolean;
}

interface LabResult {
    scenarioId: string;
    result: MultiAccountResult;
}

const DEBOUNCE_MS = 600;
const TRIALS_BASE = 400;
const TRIALS_INDEPENDENT = 250;

export function useLabSimulation(args: Args): {
    results: Map<string, MultiAccountResult>;
    pending: boolean;
} {
    const {
        plan,
        seed,
        maxEvalDays,
        fundedHorizonDays,
        commissionPerRoundTrip,
        scenarios,
        discountPercent = 0,
        activationDiscountPercent = 0,
        linkActivationDiscount = false,
    } = args;

    const key = useMemo(
        () =>
            JSON.stringify({
                planId: plan.id,
                seed,
                maxEvalDays,
                fundedHorizonDays,
                commission: commissionPerRoundTrip,
                evalDiscount: discountPercent,
                actDiscount: activationDiscountPercent,
                linkAct: linkActivationDiscount,
                scenarios: scenarios.map((s) => ({
                    id: s.id,
                    risk: s.riskPerTrade,
                    wr: s.winrate,
                    rr: s.rrRatio,
                    tpd: s.tradesPerDay,
                    a: s.accounts,
                    c: s.correlation,
                    g: s.groups,
                    ds: s.dayStop,
                })),
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
                    plan,
                    winrate: sc.winrate,
                    rrRatio: sc.rrRatio,
                    riskPerTrade: sc.riskPerTrade,
                    tradesPerDay: sc.tradesPerDay,
                    maxEvalDays,
                    fundedHorizonDays,
                    trials,
                    seed,
                    discounts: {
                        evalPercent: discountPercent,
                        activationPercent: linkActivationDiscount
                            ? discountPercent
                            : activationDiscountPercent,
                    },
                    commissionPerRoundTrip,
                    maxAttempts: 1,
                    accounts: sc.accounts,
                    correlation: sc.correlation,
                    groups: sc.groups,
                    dayStop: sc.dayStop,
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
                out.push({ scenarioId: sc.id, result: enriched });
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedKey]);

    return { results, pending };
}
