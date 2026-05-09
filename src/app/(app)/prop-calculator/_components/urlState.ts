import { type FirmId, type PropFirm } from '~/lib/prop-calculator';

import type { CalculatorState } from './types';
import { SizingMode } from './types';

export function encodeState(state: CalculatorState): URLSearchParams {
    const p = new URLSearchParams();
    p.set('firm', state.firm.id);
    p.set('plan', state.plan.id);
    p.set('wr', state.winrate.toFixed(3));
    p.set('rr', state.rrRatio.toFixed(2));
    p.set('tpd', String(state.tradesPerDay));
    p.set('mode', state.sizingMode);
    p.set('rd', String(state.riskDollars));
    p.set('rp', state.riskPercent.toFixed(3));
    p.set('seed', String(state.seed));
    p.set('trials', String(state.trials));
    p.set('eval', String(state.evalDiscountPercent));
    p.set('act', String(state.activationDiscountPercent));
    p.set('linkAct', state.linkActivationDiscount ? '1' : '0');
    p.set('comm', String(state.commissionPerRoundTrip));
    p.set('attempts', String(state.maxAttempts));
    p.set('copy', String(state.copyAccounts));
    return p;
}

export function decodeState(
    params: URLSearchParams,
    firms: readonly PropFirm[],
    fallback: CalculatorState,
): CalculatorState {
    const firmId = params.get('firm') as FirmId | null;
    const planId = params.get('plan');
    const firm = firmId ? firms.find((f) => f.id === firmId) : undefined;
    const plan = firm && planId ? firm.findPlan(planId) : undefined;

    const num = (key: string, def: number): number => {
        const v = params.get(key);
        if (v === null) return def;
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    };
    const intNum = (key: string, def: number): number =>
        Math.floor(num(key, def));
    const sizingMode =
        params.get('mode') === SizingMode.Percent
            ? SizingMode.Percent
            : SizingMode.Dollar;

    return {
        firm: firm ?? fallback.firm,
        plan: plan ?? fallback.plan,
        winrate: num('wr', fallback.winrate),
        rrRatio: num('rr', fallback.rrRatio),
        tradesPerDay: intNum('tpd', fallback.tradesPerDay),
        sizingMode,
        riskDollars: num('rd', fallback.riskDollars),
        riskPercent: num('rp', fallback.riskPercent),
        seed: intNum('seed', fallback.seed),
        trials: intNum('trials', fallback.trials),
        maxEvalDays: fallback.maxEvalDays,
        fundedHorizonDays: fallback.fundedHorizonDays,
        evalDiscountPercent: num('eval', fallback.evalDiscountPercent),
        activationDiscountPercent: num(
            'act',
            fallback.activationDiscountPercent,
        ),
        linkActivationDiscount: params.get('linkAct') === '1',
        commissionPerRoundTrip: num('comm', fallback.commissionPerRoundTrip),
        maxAttempts: intNum('attempts', fallback.maxAttempts),
        copyAccounts: intNum('copy', fallback.copyAccounts),
        firmMemory: fallback.firmMemory,
    };
}

const SCENARIOS_KEY = 'propCalc.scenarios.v1';

export interface SavedScenarioRecord {
    name: string;
    savedAt: number;
    params: string;
}

export function loadScenarios(): SavedScenarioRecord[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(SCENARIOS_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (item): item is SavedScenarioRecord =>
                typeof item === 'object' &&
                item !== null &&
                'name' in item &&
                'savedAt' in item &&
                'params' in item,
        );
    } catch {
        return [];
    }
}

export function persistScenarios(scenarios: SavedScenarioRecord[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    } catch {
        return;
    }
}
