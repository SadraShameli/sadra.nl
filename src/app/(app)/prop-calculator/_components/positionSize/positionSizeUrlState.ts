import { z } from 'zod';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    ALL_FIRMS,
    dollars,
    type Dollars,
    floorToWholeCents,
    InstrumentSymbol,
    type Plan,
    points,
    type Points,
    serializePlanId,
    type TradingFirm,
    TradingPhase,
} from '~/lib/prop-calculator';
import { RiskDisplayUnit } from '~/lib/prop-calculator/advisor';
import { CALCULATOR_SCALAR_BOUNDS } from '~/lib/schemas/url';

import {
    normalizePositionSizeInput,
    type PositionSizeInput,
    positionSizePhases,
} from './positionSizeModel';

export enum PositionSizeUrlParameter {
    Instrument = 'psi',
    Phase = 'psph',
    Plan = 'psp',
    RetryFee = 'psf',
    Risk = 'psr',
    Stop = 'pss',
    Tier = 'pst',
    Unit = 'psu',
}

const DEFAULT_RISK = dollars(450);
const DEFAULT_STOP_POINTS = points(7.5);
const MAX_RISK = Number.MAX_SAFE_INTEGER / 100;

const finiteNumberSchema = z.string().trim().min(1).pipe(z.coerce.number());

const riskSchema = finiteNumberSchema
    .pipe(z.number().max(MAX_RISK))
    .transform(floorToWholeCents)
    .pipe(z.number().positive())
    .transform(dollars);

const retryFeeSchema = finiteNumberSchema
    .pipe(z.number().max(MAX_RISK))
    .transform(floorToWholeCents)
    .pipe(z.number().nonnegative())
    .transform(dollars);

const stopSchema = finiteNumberSchema
    .pipe(
        z
            .number()
            .min(CALCULATOR_SCALAR_BOUNDS.sp.min)
            .max(CALCULATOR_SCALAR_BOUNDS.sp.max),
    )
    .transform(points);

const tierProfitSchema = finiteNumberSchema.transform(dollars);

const instrumentSchema = z.enum(InstrumentSymbol);
const phaseSchema = z.enum(TradingPhase);
const riskUnitSchema = z.enum(RiskDisplayUnit);

export function decodePositionSize(
    parameters: URLSearchParams,
    firms: readonly TradingFirm[] = ALL_FIRMS,
): PositionSizeInput {
    const fallback = defaultPositionSize();
    const plan =
        planOf(parameters.get(PositionSizeUrlParameter.Plan), firms) ??
        fallback.plan;
    const retryFeeFallback =
        plan === fallback.plan ? fallback.retryFee : dollars(plan.retryFee());
    return normalizePositionSizeInput({
        instrument: parsed(
            instrumentSchema,
            parameters.get(PositionSizeUrlParameter.Instrument),
            fallback.instrument,
        ),
        phase: parsed(
            phaseSchema,
            parameters.get(PositionSizeUrlParameter.Phase),
            firstPhase(plan),
        ),
        plan,
        retryFee: parsed(
            retryFeeSchema,
            parameters.get(PositionSizeUrlParameter.RetryFee),
            retryFeeFallback,
        ),
        risk: parsed(
            riskSchema,
            parameters.get(PositionSizeUrlParameter.Risk),
            fallback.risk,
        ),
        stopPoints: parsed(
            stopSchema,
            parameters.get(PositionSizeUrlParameter.Stop),
            fallback.stopPoints,
        ),
        tierProfit: parsed(
            tierProfitSchema,
            parameters.get(PositionSizeUrlParameter.Tier),
            null,
        ),
        unit: parsed(
            riskUnitSchema,
            parameters.get(PositionSizeUrlParameter.Unit),
            fallback.unit,
        ),
    });
}

export function defaultPositionSize(): PositionSizeInput {
    const { plan } = defaultCalculatorState();
    return {
        instrument: InstrumentSymbol.NQ,
        phase: firstPhase(plan),
        plan,
        retryFee: dollars(plan.retryFee()),
        risk: DEFAULT_RISK,
        stopPoints: DEFAULT_STOP_POINTS,
        tierProfit: null,
        unit: RiskDisplayUnit.AccountDollars,
    };
}

export function encodePositionSize(
    state: PositionSizeInput,
    omitted: readonly PositionSizeUrlParameter[] = [],
): string {
    const parameters = new URLSearchParams();
    parameters.set(PositionSizeUrlParameter.Risk, String(state.risk));
    parameters.set(PositionSizeUrlParameter.Instrument, state.instrument);
    parameters.set(PositionSizeUrlParameter.Stop, String(state.stopPoints));
    parameters.set(
        PositionSizeUrlParameter.Plan,
        serializePlanId(state.plan.id),
    );
    parameters.set(PositionSizeUrlParameter.Phase, state.phase);
    parameters.set(
        PositionSizeUrlParameter.RetryFee,
        String(state.retryFee),
    );
    parameters.set(PositionSizeUrlParameter.Unit, state.unit);
    if (state.tierProfit !== null) {
        parameters.set(PositionSizeUrlParameter.Tier, String(state.tierProfit));
    }
    for (const key of omitted) parameters.delete(key);
    return parameters.toString();
}

export function parsePositionSizeInstrument(
    raw: string,
): InstrumentSymbol | null {
    return parsed(instrumentSchema, raw, null);
}

export function parsePositionSizePhase(raw: string): null | TradingPhase {
    return parsed(phaseSchema, raw, null);
}

export function parsePositionSizeRetryFee(raw: string): Dollars | null {
    return parsed(retryFeeSchema, raw, null);
}

export function parsePositionSizeRisk(raw: string): Dollars | null {
    return parsed(riskSchema, raw, null);
}

export function parsePositionSizeStop(raw: string): null | Points {
    return parsed(stopSchema, raw, null);
}

export function parsePositionSizeUnit(raw: string): null | RiskDisplayUnit {
    return parsed(riskUnitSchema, raw, null);
}

function firstPhase(plan: Plan): TradingPhase {
    return positionSizePhases(plan)[0] ?? TradingPhase.Funded;
}

function parsed<T, F>(
    schema: z.ZodType<T>,
    raw: null | string,
    fallback: F,
): F | T {
    const result = schema.safeParse(raw);
    return result.success ? result.data : fallback;
}

function planOf(
    serial: null | string,
    firms: readonly TradingFirm[],
): null | Plan {
    if (serial === null) return null;
    for (const firm of firms) {
        const plan = firm.findPlanBySerial(serial);
        if (plan !== null) return plan;
    }
    return null;
}
