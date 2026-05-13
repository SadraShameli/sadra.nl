import { z } from 'zod';
import {
    serializePlanId,
    type DayStopRule,
    type PropFirm,
} from '~/lib/prop-calculator';
import {
    dayStopRuleSchema,
    labScenarioSchema,
    savedScenarioRecordSchema,
    type SavedScenarioRecord as SavedScenarioRecordSchema,
} from '~/lib/schemas/url';

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

const labScenarioArraySchema = z.array(labScenarioSchema);
const savedScenarioArraySchema = z.array(savedScenarioRecordSchema);

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
    const firm = firmId
        ? firms.find((f) => (f.id as string) === firmId)
        : undefined;
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
            const ok = dayStopRuleSchema.safeParse(parsed);
            if (ok.success) dayStop = ok.data;
        } catch {}
    }

    let labScenarios: LabScenario[] = fallback.labScenarios;
    const labParam = params.get('lab');
    if (labParam) {
        try {
            const parsed: unknown = JSON.parse(base64UrlDecode(labParam));
            const ok = labScenarioArraySchema.safeParse(parsed);
            if (ok.success) labScenarios = ok.data;
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

export type SavedScenarioRecord = SavedScenarioRecordSchema;

export function loadScenarios(): SavedScenarioRecord[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(SCENARIOS_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        const ok = savedScenarioArraySchema.safeParse(parsed);
        return ok.success ? ok.data : [];
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
