import { z } from 'zod';

import {
    type DayStopRule,
    type PropFirm,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    dayStopRuleSchema,
    labScenarioSchema,
    type SavedScenarioRecord as SavedScenarioRecordSchema,
    savedScenarioRecordSchema,
} from '~/lib/schemas/url';

import type { CalculatorState, LabScenario } from './types';

import { SizingMode } from './types';

function base64UrlDecode(s: string): string {
    if (typeof window === 'undefined') return '';
    try {
        const padded =
            s.replaceAll('-', '+').replaceAll('_', '/') +
            '==='.slice((s.length + 3) % 4);
        const binary = window.atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.codePointAt(i) ?? 0;
        return new TextDecoder().decode(bytes);
    } catch {
        return '';
    }
}

function base64UrlEncode(s: string): string {
    if (typeof window === 'undefined') return '';
    try {
        const bytes = new TextEncoder().encode(s);
        let binary = '';
        for (const b of bytes) binary += String.fromCodePoint(b);
        return window
            .btoa(binary)
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replace(/=+$/, '');
    } catch {
        return '';
    }
}

const labScenarioArraySchema = z.array(labScenarioSchema);
const savedScenarioArraySchema = z.array(savedScenarioRecordSchema);

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
        activationDiscountPercent: num(
            'act',
            fallback.activationDiscountPercent,
        ),
        commissionPerRoundTrip: num('comm', fallback.commissionPerRoundTrip),
        copyAccounts: intNum('copy', fallback.copyAccounts),
        dayStop,
        evalDiscountPercent: num('eval', fallback.evalDiscountPercent),
        firm: resolvedFirm,
        firmMemory: fallback.firmMemory,
        fundedHorizonDays: intNum('fundedDays', fallback.fundedHorizonDays),
        labScenarios,
        linkActivationDiscount: params.get('linkAct') === '1',
        maxAttempts: intNum('attempts', fallback.maxAttempts),
        maxEvalDays: intNum('maxDays', fallback.maxEvalDays),
        plan: resolvedPlan,
        riskDollars: num('rd', fallback.riskDollars),
        riskPercent: num('rp', fallback.riskPercent),
        rrRatio: num('rr', fallback.rrRatio),
        seed: intNum('seed', fallback.seed),
        sizingMode,
        tradesPerDay: intNum('tpd', fallback.tradesPerDay),
        trials: intNum('trials', fallback.trials),
        winrate: num('wr', fallback.winrate),
    };
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
