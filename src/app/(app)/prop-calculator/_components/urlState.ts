import { z } from 'zod';

import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    InstrumentSymbol,
    parseFirmId,
    RungSizing,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    CALCULATOR_SCALAR_BOUNDS,
    calculatorScalarFieldsSchema,
    CalculatorUrlParameter,
    dayPolicySchema,
    dayStopRuleSchema,
    INSTRUMENT_STOP_PAIR_RULE,
    LAB_SCENARIO_BOUNDS,
    labScenarioSchema,
    MAX_LAB_SCENARIOS,
    portfolioEntrySchema,
    type SavedScenarioRecord as SavedScenarioRecordSchema,
    savedScenarioRecordSchema,
    UrlFlag,
} from '~/lib/schemas/url';

import type {
    CalculatorState,
    LabLinkOutcome,
    LabScenario,
    LinkParameterOutcomes,
    PortfolioEntry,
} from './types';

import { clampNumber, clampStateToPlan } from './clamp';
import { LabLinkStatus, LinkParameter, SizingMode } from './types';

export type LabLinkDecode = LabLinkOutcome & { scenarios: LabScenario[] };

type BlobDecode<T> =
    | { issue: string; status: LabLinkStatus.Rejected }
    | { status: LabLinkStatus.Absent }
    | { status: LabLinkStatus.Accepted; value: T };

interface EntryWording<Field extends string> {
    fieldRules: Readonly<Record<Field, string>>;
    item: string;
    kind: string;
}

type ParameterRead<T> = { issue: string } | { value: T };

type SharedLab = Pick<CalculatorState, 'labLink' | 'labScenarios'>;

export const LINK_PARAMETER_LABELS: Readonly<Record<LinkParameter, string>> = {
    [LinkParameter.DayStop]: 'day stop rule',
    [LinkParameter.EvalDayPolicy]: 'eval ladder',
    [LinkParameter.Portfolio]: 'portfolio',
};

const UNREADABLE_LAB_PARAMETER = unreadableParameter('lab');
const NOT_A_SCENARIO_LIST = 'the lab parameter is not a list of scenarios';
const SCENARIO_COUNT_OUT_OF_RANGE = `the lab parameter must hold 1 to ${plainNumber(MAX_LAB_SCENARIOS)} scenarios`;
const NOT_A_PORTFOLIO =
    'the portfolio parameter is not a list of portfolio entries';
const UNKNOWN_DAY_STOP = 'the day stop rule is not one the calculator knows';
const UNUSABLE_EVAL_LADDER =
    'the eval ladder is not one the calculator can use';
const UNKNOWN_FIRM = 'firm is not one the calculator knows';

const INSTRUMENT_SYMBOLS: readonly InstrumentSymbol[] =
    Object.values(InstrumentSymbol);

const INSTRUMENT_RULE = `instrument must be empty or one of ${INSTRUMENT_SYMBOLS.join(', ')}`;
const STOP_POINTS_RULE = `stop points must be empty or between ${plainNumber(CALCULATOR_SCALAR_BOUNDS.sp.min)} and ${plainNumber(CALCULATOR_SCALAR_BOUNDS.sp.max)} points`;

const LAB_ENTRY_WORDING: EntryWording<keyof LabScenario> = {
    fieldRules: {
        accounts: `accounts must be a whole number from ${plainNumber(LAB_SCENARIO_BOUNDS.accounts.min)} to ${plainNumber(LAB_SCENARIO_BOUNDS.accounts.max)}`,
        correlation: 'account mode is not one the lab knows',
        dayStop: 'day-stop rule is not one the lab knows',
        groups: 'groups must be a whole number from 1 up to the number of accounts',
        id: 'id must be text',
        instrument: INSTRUMENT_RULE,
        label: 'name must be text',
        riskPerTrade: `risk per trade must be between ${formatCurrency(LAB_SCENARIO_BOUNDS.riskPerTrade.min)} and ${formatCurrency(LAB_SCENARIO_BOUNDS.riskPerTrade.max)}`,
        rrRatio: `reward to risk must be between ${plainNumber(CALCULATOR_SCALAR_BOUNDS.rr.min)} and ${plainNumber(CALCULATOR_SCALAR_BOUNDS.rr.max)}`,
        stopPoints: STOP_POINTS_RULE,
        tradesPerDay: `trades per day must be a whole number from ${plainNumber(CALCULATOR_SCALAR_BOUNDS.tpd.min)} to ${plainNumber(CALCULATOR_SCALAR_BOUNDS.tpd.max)}`,
        winrate: `win rate must be between ${formatPercent(CALCULATOR_SCALAR_BOUNDS.wr.min, 0)} and ${formatPercent(CALCULATOR_SCALAR_BOUNDS.wr.max, 0)}`,
    },
    item: 'scenario',
    kind: 'a lab scenario',
};

const PORTFOLIO_ENTRY_WORDING: EntryWording<keyof PortfolioEntry> = {
    fieldRules: {
        activationDiscountPercent: discountRule(
            'activation fee discount',
            CALCULATOR_SCALAR_BOUNDS.act,
        ),
        count: 'count must be a whole number of 1 or more',
        evalDiscountPercent: discountRule(
            'eval fee discount',
            CALCULATOR_SCALAR_BOUNDS.eval,
        ),
        firmId: 'firm must be text',
        id: 'id must be text',
        instrument: INSTRUMENT_RULE,
        linkActivationDiscount: 'linked activation discount must be on or off',
        monthlySubscriptionDiscountPercent: discountRule(
            'monthly subscription discount',
            CALCULATOR_SCALAR_BOUNDS.msub,
        ),
        planId: 'plan must be text',
        resetDiscountPercent: discountRule(
            'reset fee discount',
            CALCULATOR_SCALAR_BOUNDS.rstd,
        ),
        stopPoints: STOP_POINTS_RULE,
    },
    item: 'portfolio entry',
    kind: 'a portfolio entry',
};

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

function decodeBlobParameter<T>(
    raw: null | string,
    unreadable: string,
    read: (parsed: unknown) => ParameterRead<T>,
): BlobDecode<T> {
    if (!raw) return { status: LabLinkStatus.Absent };
    let parsed: unknown;
    try {
        parsed = JSON.parse(base64UrlDecode(raw));
    } catch {
        return { issue: unreadable, status: LabLinkStatus.Rejected };
    }
    const result = read(parsed);
    return 'issue' in result
        ? { issue: result.issue, status: LabLinkStatus.Rejected }
        : { status: LabLinkStatus.Accepted, value: result.value };
}

function decodeLinkParameter<T>(
    parameters: URLSearchParams,
    parameter: LinkParameter,
    read: (parsed: unknown) => ParameterRead<T>,
): BlobDecode<T> {
    return decodeBlobParameter(
        parameters.get(parameter),
        unreadableParameter(LINK_PARAMETER_LABELS[parameter]),
        read,
    );
}

function describeEntryIssue<Field extends string>(
    issue: z.core.$ZodIssue,
    index: number,
    { fieldRules, item, kind }: EntryWording<Field>,
): string {
    const entry = `${item} ${String(index + 1)}`;
    if (issue.code === 'custom' && issue.message === INSTRUMENT_STOP_PAIR_RULE)
        return `${entry}: ${INSTRUMENT_STOP_PAIR_RULE}`;
    const [, field] = issue.path;
    return isRuleField(fieldRules, field)
        ? `${entry}: ${fieldRules[field]}`
        : `${entry} is not ${kind}`;
}

function describeLabLinkIssue(issues: readonly z.core.$ZodIssue[]): string {
    const [issue] = issues;
    if (!issue) return UNREADABLE_LAB_PARAMETER;
    const [index] = issue.path;
    if (typeof index !== 'number')
        return issue.code === 'too_big' || issue.code === 'too_small'
            ? SCENARIO_COUNT_OUT_OF_RANGE
            : NOT_A_SCENARIO_LIST;
    return describeEntryIssue(issue, index, LAB_ENTRY_WORDING);
}

function describePortfolioIssue(issues: readonly z.core.$ZodIssue[]): string {
    const [issue] = issues;
    const index = issue?.path[0];
    return issue && typeof index === 'number'
        ? describeEntryIssue(issue, index, PORTFOLIO_ENTRY_WORDING)
        : NOT_A_PORTFOLIO;
}

function discountRule(
    name: string,
    { max, min }: { max: number; min: number },
): string {
    return `${name} must be between ${plainNumber(min)}% and ${plainNumber(max)}%`;
}

function isRuleField<Field extends string>(
    fieldRules: Readonly<Record<Field, string>>,
    field: PropertyKey | undefined,
): field is Field {
    return typeof field === 'string' && Object.hasOwn(fieldRules, field);
}

function linkOutcome<T>(decoded: BlobDecode<T>): LabLinkOutcome {
    return decoded.status === LabLinkStatus.Rejected
        ? { issue: decoded.issue, status: decoded.status }
        : { status: decoded.status };
}

function parseInstrumentSymbol(raw: null | string): InstrumentSymbol | null {
    return INSTRUMENT_SYMBOLS.find((symbol) => symbol === raw) ?? null;
}

function plainNumber(value: number): string {
    return value.toLocaleString('en-US');
}

function readLabScenarios(parsed: unknown): ParameterRead<LabScenario[]> {
    const ok = labScenarioArraySchema.safeParse(parsed);
    return ok.success
        ? { value: ok.data }
        : { issue: describeLabLinkIssue(ok.error.issues) };
}

function readPortfolio(
    parsed: unknown,
    firms: readonly TradingFirm[],
): ParameterRead<PortfolioEntry[]> {
    const ok = portfolioEntryArraySchema.safeParse(parsed);
    if (!ok.success) return { issue: describePortfolioIssue(ok.error.issues) };
    const entries: PortfolioEntry[] = [];
    for (const [index, wire] of ok.data.entries()) {
        const resolved = resolvePortfolioEntry(wire, firms);
        if ('issue' in resolved)
            return {
                issue: `${PORTFOLIO_ENTRY_WORDING.item} ${String(index + 1)}: ${resolved.issue}`,
            };
        entries.push(resolved.value);
    }
    return { value: entries };
}

function readSharedLab(
    parameters: URLSearchParams,
    fallback: LabScenario[],
): SharedLab {
    const { scenarios, ...labLink } = decodeLabLink(parameters, fallback);
    return { labLink, labScenarios: scenarios };
}

function readWith<T>(
    schema: z.ZodType<T>,
    issue: string,
): (parsed: unknown) => ParameterRead<T> {
    return (parsed) => {
        const ok = schema.safeParse(parsed);
        return ok.success ? { value: ok.data } : { issue };
    };
}

function resolvePortfolioEntry(
    wire: z.infer<typeof portfolioEntrySchema>,
    firms: readonly TradingFirm[],
): ParameterRead<PortfolioEntry> {
    const wireFirmId = parseFirmId(wire.firmId);
    const firm = firms.find((f) => f.id === wireFirmId);
    if (!firm) return { issue: UNKNOWN_FIRM };
    const plan = firm.findPlanBySerial(wire.planId);
    if (!plan) return { issue: `plan is not one ${firm.displayName} offers` };
    return {
        value: {
            activationDiscountPercent: wire.activationDiscountPercent,
            count: wire.count,
            evalDiscountPercent: wire.evalDiscountPercent,
            firmId: firm.id,
            id: wire.id,
            instrument: wire.instrument,
            linkActivationDiscount: wire.linkActivationDiscount,
            monthlySubscriptionDiscountPercent:
                wire.monthlySubscriptionDiscountPercent,
            planId: plan.id,
            resetDiscountPercent: wire.resetDiscountPercent,
            stopPoints: wire.stopPoints,
        },
    };
}

function unreadableParameter(label: string): string {
    return `the ${label} parameter is not readable base64 JSON`;
}

function urlFlag(isOn: boolean): UrlFlag {
    return isOn ? UrlFlag.On : UrlFlag.Off;
}

function valueOr<T>(decoded: BlobDecode<T>, fallback: T): T {
    return decoded.status === LabLinkStatus.Accepted ? decoded.value : fallback;
}

const labScenarioArraySchema = z
    .array(labScenarioSchema)
    .min(1)
    .max(MAX_LAB_SCENARIOS);
const portfolioEntryArraySchema = z.array(portfolioEntrySchema);
const savedScenarioArraySchema = z.array(savedScenarioRecordSchema);

export function decodeLabLink(
    parameters: URLSearchParams,
    fallback: LabScenario[],
): LabLinkDecode {
    const decoded = decodeBlobParameter(
        parameters.get('lab'),
        UNREADABLE_LAB_PARAMETER,
        readLabScenarios,
    );
    return { ...linkOutcome(decoded), scenarios: valueOr(decoded, fallback) };
}

export function decodeState(
    parameters: URLSearchParams,
    firms: readonly TradingFirm[],
    fallback: CalculatorState,
): CalculatorState {
    const firmId = parameters.get(CalculatorUrlParameter.Firm);
    const planSerial = parameters.get(CalculatorUrlParameter.Plan);
    const parsedFirmId = firmId ? parseFirmId(firmId) : undefined;
    const firm = parsedFirmId
        ? firms.find((f) => f.id === parsedFirmId)
        : undefined;
    const plan = firm && planSerial ? firm.findPlanBySerial(planSerial) : null;

    const scalarFields = calculatorScalarFieldsSchema.parse({
        ...Object.fromEntries(parameters),
        [CalculatorUrlParameter.IdleDayProbability]:
            parameters.get(CalculatorUrlParameter.IdleDayProbability) ??
            parameters.get(CalculatorUrlParameter.LegacyIdleDayProbability) ??
            undefined,
    });
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
    const payoutRequestSize = parameters.has('pr')
        ? clampNumber(
              Number(parameters.get('pr')),
              CALCULATOR_SCALAR_BOUNDS.pr.min,
              CALCULATOR_SCALAR_BOUNDS.pr.max,
              CALCULATOR_SCALAR_BOUNDS.pr.fallback,
          )
        : null;
    const rungSizing =
        parameters.get('rung') === RungSizing.SkipIfUnaffordable
            ? RungSizing.SkipIfUnaffordable
            : RungSizing.CapToCushion;

    const resolvedFirm = firm ?? fallback.firm;
    const resolvedPlan = plan ?? (firm ? firm.plans[0] : null) ?? fallback.plan;

    const dayStopLink = decodeLinkParameter(
        parameters,
        LinkParameter.DayStop,
        readWith(dayStopRuleSchema, UNKNOWN_DAY_STOP),
    );
    const evalDayPolicyLink = decodeLinkParameter(
        parameters,
        LinkParameter.EvalDayPolicy,
        readWith(dayPolicySchema, UNUSABLE_EVAL_LADDER),
    );
    const portfolioLink = decodeLinkParameter(
        parameters,
        LinkParameter.Portfolio,
        (parsed) => readPortfolio(parsed, firms),
    );
    const linkParameters: LinkParameterOutcomes = {
        [LinkParameter.DayStop]: linkOutcome(dayStopLink),
        [LinkParameter.EvalDayPolicy]: linkOutcome(evalDayPolicyLink),
        [LinkParameter.Portfolio]: linkOutcome(portfolioLink),
    };

    const { labLink, labScenarios } = readSharedLab(
        parameters,
        fallback.labScenarios,
    );

    return clampStateToPlan({
        activationDiscountPercent: scalarFields.act,
        commissionPerRoundTrip: scalarFields.comm,
        copyAccounts: scalarFields.copy,
        dayStop: valueOr<DayStopRule>(dayStopLink, fallback.dayStop),
        evalDayPolicy: valueOr<DayPolicy | null>(
            evalDayPolicyLink,
            fallback.evalDayPolicy,
        ),
        evalDiscountPercent: scalarFields.eval,
        firm: resolvedFirm,
        firmMemory: fallback.firmMemory,
        fundedHorizonDays: scalarFields.fundedDays,
        idleDayProbability: scalarFields.idle,
        instrument,
        labLink,
        labScenarios,
        linkActivationDiscount: parameters.get('linkAct') === UrlFlag.On,
        linkParameters,
        maxAttempts: scalarFields.attempts,
        maxEvalDays: scalarFields.maxDays,
        monthlySubscriptionDiscountPercent: scalarFields.msub,
        payoutRequestSize,
        plan: resolvedPlan,
        portfolio: valueOr(portfolioLink, fallback.portfolio),
        resetDiscountPercent: scalarFields.rstd,
        retainedCushion,
        riskDollars: scalarFields.rd,
        riskPercent: scalarFields.rp,
        rrRatio: scalarFields.rr,
        rungSizing,
        seed: scalarFields.seed,
        sizingMode,
        stopPoints,
        takesFundedReset:
            parameters.get(CalculatorUrlParameter.FundedReset) === UrlFlag.On,
        takesOneTimeEarlyWithdrawal:
            parameters.get(CalculatorUrlParameter.EarlyWithdrawal) ===
            UrlFlag.On,
        tradesPerDay: scalarFields.tpd,
        trials: scalarFields.trials,
        winrate: scalarFields.wr,
    });
}

export function encodeState(state: CalculatorState): URLSearchParams {
    const p = new URLSearchParams();
    p.set(CalculatorUrlParameter.Firm, state.firm.id);
    p.set(CalculatorUrlParameter.Plan, serializePlanId(state.plan.id));
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
    p.set('linkAct', urlFlag(state.linkActivationDiscount));
    p.set('msub', String(state.monthlySubscriptionDiscountPercent));
    p.set('rstd', String(state.resetDiscountPercent));
    p.set('comm', String(state.commissionPerRoundTrip));
    p.set('attempts', String(state.maxAttempts));
    p.set('copy', String(state.copyAccounts));
    p.set('maxDays', String(state.maxEvalDays));
    p.set('fundedDays', String(state.fundedHorizonDays));
    p.set(
        CalculatorUrlParameter.IdleDayProbability,
        state.idleDayProbability.toFixed(3),
    );
    p.set('rung', state.rungSizing);
    p.set(
        CalculatorUrlParameter.EarlyWithdrawal,
        urlFlag(state.takesOneTimeEarlyWithdrawal),
    );
    p.set(CalculatorUrlParameter.FundedReset, urlFlag(state.takesFundedReset));
    if (state.instrument !== null && state.stopPoints !== null) {
        p.set('instr', state.instrument);
        p.set('sp', String(state.stopPoints));
    }
    if (state.retainedCushion !== null) {
        p.set('rc', String(state.retainedCushion));
    }
    if (state.payoutRequestSize !== null) {
        p.set('pr', String(state.payoutRequestSize));
    }
    if (state.dayStop.kind !== DayStopRuleKind.None) {
        const ds = base64UrlEncode(JSON.stringify(state.dayStop));
        if (ds) p.set(LinkParameter.DayStop, ds);
    }
    if (state.evalDayPolicy) {
        const dp = base64UrlEncode(JSON.stringify(state.evalDayPolicy));
        if (dp) p.set(LinkParameter.EvalDayPolicy, dp);
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
            monthlySubscriptionDiscountPercent:
                entry.monthlySubscriptionDiscountPercent,
            planId: serializePlanId(entry.planId),
            resetDiscountPercent: entry.resetDiscountPercent,
            stopPoints: entry.stopPoints,
        }));
        const pf = base64UrlEncode(JSON.stringify(wire));
        if (pf) p.set(LinkParameter.Portfolio, pf);
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

export function withSharedLab(
    state: CalculatorState,
    parameters: URLSearchParams,
): CalculatorState {
    return { ...state, ...readSharedLab(parameters, state.labScenarios) };
}
