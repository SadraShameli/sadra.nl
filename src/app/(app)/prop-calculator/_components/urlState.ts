import { z } from 'zod';

import {
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    InstrumentSymbol,
    parseFirmId,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    CALCULATOR_SCALAR_BOUNDS,
    calculatorScalarFieldsSchema,
    dayPolicySchema,
    dayStopRuleSchema,
    labScenarioSchema,
    portfolioEntrySchema,
    type SavedScenarioRecord as SavedScenarioRecordSchema,
    savedScenarioRecordSchema,
} from '~/lib/schemas/url';

import type { CalculatorState, LabScenario, PortfolioEntry } from './types';

import { clampNumber, clampStateToPlan } from './clamp';
import { SizingMode } from './types';

const INSTRUMENT_SYMBOLS: readonly InstrumentSymbol[] =
    Object.values(InstrumentSymbol);

function base64UrlDecode(s: string): string {
    try {
        const padded =
            s.replaceAll('-', '+').replaceAll('_', '/') +
            '==='.slice((s.length + 3) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++)
            bytes[index] = binary.codePointAt(index) ?? 0;
        return new TextDecoder().decode(bytes);
    } catch {
        return '';
    }
}

function base64UrlEncode(s: string): string {
    try {
        const bytes = new TextEncoder().encode(s);
        let binary = '';
        for (const b of bytes) binary += String.fromCodePoint(b);
        return btoa(binary)
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replace(/=+$/, '');
    } catch {
        return '';
    }
}

function parseInstrumentSymbol(raw: null | string): InstrumentSymbol | null {
    return INSTRUMENT_SYMBOLS.find((symbol) => symbol === raw) ?? null;
}

const labScenarioArraySchema = z.array(labScenarioSchema);
const portfolioEntryArraySchema = z.array(portfolioEntrySchema);
const savedScenarioArraySchema = z.array(savedScenarioRecordSchema);

export function decodeState(
    parameters: URLSearchParams,
    firms: readonly TradingFirm[],
    fallback: CalculatorState,
): CalculatorState {
    const firmId = parameters.get('firm');
    const planSerial = parameters.get('plan');
    const parsedFirmId = firmId ? parseFirmId(firmId) : undefined;
    const firm = parsedFirmId
        ? firms.find((f) => f.id === parsedFirmId)
        : undefined;
    const plan =
        firm && planSerial
            ? firm.plans.find((p) => serializePlanId(p.id) === planSerial)
            : undefined;

    const scalarFields = calculatorScalarFieldsSchema.parse(
        Object.fromEntries(parameters),
    );
    const sizingMode =
        parameters.get('mode') === SizingMode.Percent
            ? SizingMode.Percent
            : SizingMode.Dollar;
    const instrument = parseInstrumentSymbol(parameters.get('instr'));
    const stopPoints =
        instrument === null
            ? null
            : clampNumber(
                  Number(parameters.get('sp')),
                  CALCULATOR_SCALAR_BOUNDS.sp.min,
                  CALCULATOR_SCALAR_BOUNDS.sp.max,
                  CALCULATOR_SCALAR_BOUNDS.sp.fallback,
              );
    const retainedCushion = parameters.has('rc')
        ? clampNumber(
              Number(parameters.get('rc')),
              CALCULATOR_SCALAR_BOUNDS.rc.min,
              CALCULATOR_SCALAR_BOUNDS.rc.max,
              CALCULATOR_SCALAR_BOUNDS.rc.fallback,
          )
        : null;

    const resolvedFirm = firm ?? fallback.firm;
    const resolvedPlan = plan ?? (firm ? firm.plans[0] : null) ?? fallback.plan;

    let dayStop: DayStopRule = fallback.dayStop;
    const dsParameter = parameters.get('ds');
    if (dsParameter) {
        try {
            const parsed: unknown = JSON.parse(base64UrlDecode(dsParameter));
            const ok = dayStopRuleSchema.safeParse(parsed);
            if (ok.success) dayStop = ok.data;
        } catch {}
    }

    let evalDayPolicy: DayPolicy | null = fallback.evalDayPolicy;
    const dpParameter = parameters.get('dp');
    if (dpParameter) {
        try {
            const parsed: unknown = JSON.parse(base64UrlDecode(dpParameter));
            const ok = dayPolicySchema.safeParse(parsed);
            if (ok.success) evalDayPolicy = ok.data;
        } catch {}
    }

    let labScenarios: LabScenario[] = fallback.labScenarios;
    const labParameter = parameters.get('lab');
    if (labParameter) {
        try {
            const parsed: unknown = JSON.parse(base64UrlDecode(labParameter));
            const ok = labScenarioArraySchema.safeParse(parsed);
            if (ok.success) labScenarios = ok.data;
        } catch {}
    }

    let portfolio: PortfolioEntry[] = fallback.portfolio;
    const portfolioParameter = parameters.get('pf');
    if (portfolioParameter) {
        try {
            const parsed: unknown = JSON.parse(
                base64UrlDecode(portfolioParameter),
            );
            const ok = portfolioEntryArraySchema.safeParse(parsed);
            if (ok.success) {
                portfolio = ok.data
                    .map((wire): null | PortfolioEntry => {
                        const wireFirmId = parseFirmId(wire.firmId);
                        const firm = firms.find((f) => f.id === wireFirmId);
                        const plan = firm?.plans.find(
                            (p) => serializePlanId(p.id) === wire.planId,
                        );
                        if (!firm || !plan) return null;
                        return {
                            activationDiscountPercent:
                                wire.activationDiscountPercent,
                            count: wire.count,
                            evalDiscountPercent: wire.evalDiscountPercent,
                            firmId: firm.id,
                            id: wire.id,
                            instrument: wire.instrument,
                            linkActivationDiscount: wire.linkActivationDiscount,
                            planId: plan.id,
                            stopPoints: wire.stopPoints,
                        };
                    })
                    .filter((entry): entry is PortfolioEntry => entry !== null);
            }
        } catch {}
    }

    return clampStateToPlan({
        activationDiscountPercent: scalarFields.act,
        commissionPerRoundTrip: scalarFields.comm,
        copyAccounts: scalarFields.copy,
        dayStop,
        evalDayPolicy,
        evalDiscountPercent: scalarFields.eval,
        firm: resolvedFirm,
        firmMemory: fallback.firmMemory,
        fundedHorizonDays: scalarFields.fundedDays,
        idleDayProbability: scalarFields.idle,
        instrument,
        labScenarios,
        linkActivationDiscount: parameters.get('linkAct') === '1',
        maxAttempts: scalarFields.attempts,
        maxEvalDays: scalarFields.maxDays,
        plan: resolvedPlan,
        portfolio,
        retainedCushion,
        riskDollars: scalarFields.rd,
        riskPercent: scalarFields.rp,
        rrRatio: scalarFields.rr,
        seed: scalarFields.seed,
        sizingMode,
        stopPoints,
        tradesPerDay: scalarFields.tpd,
        trials: scalarFields.trials,
        winrate: scalarFields.wr,
    });
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
    p.set('idp', state.idleDayProbability.toFixed(3));
    if (state.instrument !== null && state.stopPoints !== null) {
        p.set('instr', state.instrument);
        p.set('sp', String(state.stopPoints));
    }
    if (state.retainedCushion !== null) {
        p.set('rc', String(state.retainedCushion));
    }
    if (state.dayStop.kind !== DayStopRuleKind.None) {
        const ds = base64UrlEncode(JSON.stringify(state.dayStop));
        if (ds) p.set('ds', ds);
    }
    if (state.evalDayPolicy) {
        const dp = base64UrlEncode(JSON.stringify(state.evalDayPolicy));
        if (dp) p.set('dp', dp);
    }
    if (state.labScenarios.length > 0) {
        const lab = base64UrlEncode(JSON.stringify(state.labScenarios));
        if (lab) p.set('lab', lab);
    }
    if (state.portfolio.length > 0) {
        const wire = state.portfolio.map((entry) => ({
            activationDiscountPercent: entry.activationDiscountPercent,
            count: entry.count,
            evalDiscountPercent: entry.evalDiscountPercent,
            firmId: entry.firmId,
            id: entry.id,
            instrument: entry.instrument,
            linkActivationDiscount: entry.linkActivationDiscount,
            planId: serializePlanId(entry.planId),
            stopPoints: entry.stopPoints,
        }));
        const pf = base64UrlEncode(JSON.stringify(wire));
        if (pf) p.set('pf', pf);
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
