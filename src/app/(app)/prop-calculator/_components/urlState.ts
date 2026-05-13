import {
    serializePlanId,
    type DayStopRule,
    type PropFirm,
} from '~/lib/prop-calculator';

import type { CalculatorState, LabScenario } from './types';
import { SizingMode } from './types';

function base64UrlEncode(s: string): string {
    if (typeof window === 'undefined') return '';
    try {
        const bytes = new TextEncoder().encode(s);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return window
            .btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    } catch {
        return '';
    }
}

function base64UrlDecode(s: string): string {
    if (typeof window === 'undefined') return '';
    try {
        const padded =
            s.replace(/-/g, '+').replace(/_/g, '/') +
            '==='.slice((s.length + 3) % 4);
        const binary = window.atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    } catch {
        return '';
    }
}

function isDayStopRule(v: unknown): v is DayStopRule {
    if (!v || typeof v !== 'object') return false;
    const kind = (v as { kind?: unknown }).kind;
    if (kind === 'none' || kind === 'first-win') return true;
    if (kind === 'after-k-losses')
        return typeof (v as { k?: unknown }).k === 'number';
    if (kind === 'after-target')
        return typeof (v as { dollars?: unknown }).dollars === 'number';
    return false;
}

function isLabScenario(v: unknown): v is LabScenario {
    if (!v || typeof v !== 'object') return false;
    const o = v as Partial<LabScenario>;
    return (
        typeof o.id === 'string' &&
        typeof o.label === 'string' &&
        typeof o.riskPerTrade === 'number' &&
        typeof o.winrate === 'number' &&
        typeof o.rrRatio === 'number' &&
        typeof o.tradesPerDay === 'number' &&
        typeof o.accounts === 'number' &&
        (o.correlation === 'copy' ||
            o.correlation === 'grouped' ||
            o.correlation === 'independent') &&
        typeof o.groups === 'number' &&
        isDayStopRule(o.dayStop)
    );
}

export function encodeState(state: CalculatorState): URLSearchParams {
    const p = new URLSearchParams();
    p.set('firm', state.firm.id);
    p.set('plan', serializePlanId(state.plan.id));
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
    p.set('maxDays', String(state.maxEvalDays));
    p.set('fundedDays', String(state.fundedHorizonDays));
    if (state.dayStop.kind !== 'none') {
        const ds = base64UrlEncode(JSON.stringify(state.dayStop));
        if (ds) p.set('ds', ds);
    }
    if (state.labScenarios.length > 0) {
        const lab = base64UrlEncode(JSON.stringify(state.labScenarios));
        if (lab) p.set('lab', lab);
    }
    return p;
}

export function decodeState(
    params: URLSearchParams,
    firms: readonly PropFirm[],
    fallback: CalculatorState,
): CalculatorState {
    const firmId = params.get('firm');
    const planSerial = params.get('plan');
    const firm = firmId ? firms.find((f) => f.id === firmId) : undefined;
    const plan =
        firm && planSerial
            ? firm.plans.find((p) => serializePlanId(p.id) === planSerial)
            : undefined;

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

    const resolvedFirm = firm ?? fallback.firm;
    const resolvedPlan = plan ?? (firm ? firm.plans[0] : null) ?? fallback.plan;

    let dayStop: DayStopRule = fallback.dayStop;
    const dsParam = params.get('ds');
    if (dsParam) {
        try {
            const parsed: unknown = JSON.parse(base64UrlDecode(dsParam));
            if (isDayStopRule(parsed)) dayStop = parsed;
        } catch {}
    }

    let labScenarios: LabScenario[] = fallback.labScenarios;
    const labParam = params.get('lab');
    if (labParam) {
        try {
            const parsed: unknown = JSON.parse(base64UrlDecode(labParam));
            if (Array.isArray(parsed) && parsed.every(isLabScenario))
                labScenarios = parsed;
        } catch {}
    }

    return {
        firm: resolvedFirm,
        plan: resolvedPlan,
        winrate: num('wr', fallback.winrate),
        rrRatio: num('rr', fallback.rrRatio),
        tradesPerDay: intNum('tpd', fallback.tradesPerDay),
        sizingMode,
        riskDollars: num('rd', fallback.riskDollars),
        riskPercent: num('rp', fallback.riskPercent),
        seed: intNum('seed', fallback.seed),
        trials: intNum('trials', fallback.trials),
        maxEvalDays: intNum('maxDays', fallback.maxEvalDays),
        fundedHorizonDays: intNum('fundedDays', fallback.fundedHorizonDays),
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
        dayStop,
        labScenarios,
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
