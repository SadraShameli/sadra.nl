import { z } from 'zod';

import {
    CorrelationMode,
    InstrumentSymbol,
    ladderRungsSchema,
    PolicySizing,
    stopLossCountSchema,
    stopTargetDollarsSchema,
} from '~/lib/prop-calculator';
import { DayStopRuleKind } from '~/lib/prop-calculator/core';

export {
    CalculatorUrlParameter,
    UrlFlag,
} from '~/lib/schemas/calculatorUrlParameter';

export const PROFILE_TAB_VALUES = [
    'account',
    'lifting',
    'sensor-hub',
    'trading',
    'users',
] as const;

export const profileTabSchema = z.enum(PROFILE_TAB_VALUES).catch('account');

export type ProfileTab = z.infer<typeof profileTabSchema>;

export const loginSearchSchema = z.object({
    callbackUrl: z.string().optional(),
    error: z.string().optional(),
    success: z.string().optional(),
});

export const signupSearchSchema = z.object({
    callbackUrl: z.string().optional(),
    error: z.string().optional(),
});

export const forgotPasswordSearchSchema = z.object({
    sent: z.string().optional(),
});

export const resetPasswordSearchSchema = z.object({
    error: z.string().optional(),
    token: z.string().optional(),
});

export const verifyRequestSearchSchema = z.object({
    email: z.string().optional(),
});

export const authErrorSearchSchema = z.object({
    error: z.string().optional(),
});

export const profileSearchSchema = z.object({
    error: z.string().optional(),
    success: z.string().optional(),
    tab: profileTabSchema.optional(),
});

export const tradingPlanSearchSchema = z.object({
    error: z.string().optional(),
    plan: z.string().optional(),
    success: z.string().optional(),
});

export const dayStopRuleSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal(DayStopRuleKind.None) }),
    z.object({ kind: z.literal(DayStopRuleKind.FirstWin) }),
    z.object({ kind: z.literal(DayStopRuleKind.DayGreen) }),
    z.object({
        k: stopLossCountSchema,
        kind: z.literal(DayStopRuleKind.AfterKLosses),
    }),
    z.object({
        dollars: stopTargetDollarsSchema,
        kind: z.literal(DayStopRuleKind.AfterTarget),
    }),
]);

export const dayPolicySchema = z.object({
    ladder: ladderRungsSchema,
    maxLossesPerDay: stopLossCountSchema.nullable(),
    sizing: z
        .literal(PolicySizing.ContractCapped)
        .catch(PolicySizing.ContractCapped),
    stopRule: dayStopRuleSchema,
});

export const savedScenarioRecordSchema = z.object({
    name: z.string(),
    params: z.string(),
    savedAt: z.number(),
});

export type SavedScenarioRecord = z.infer<typeof savedScenarioRecordSchema>;

interface ScalarBound {
    fallback: number;
    isInteger: boolean;
    max: number;
    min: number;
}

function bound(
    fallback: number,
    min: number,
    max: number,
    isInteger: boolean,
): ScalarBound {
    return { fallback, isInteger, max, min };
}

export const CALCULATOR_SCALAR_BOUNDS = {
    act: bound(0, 0, 100, false),
    attempts: bound(1, 1, 10, true),
    comm: bound(0, 0, 50, false),
    eval: bound(0, 0, 100, false),
    fundedDays: bound(60, 1, 3650, true),
    idle: bound(0, 0, 1, false),
    maxDays: bound(60, 10, 365, true),
    msub: bound(0, 0, 100, false),
    pr: bound(0, 0, 1_000_000, false),
    rc: bound(0, 0, 100_000, false),
    rp: bound(0.5, 0.05, 100, false),
    rr: bound(2, 0.5, 10, false),
    rstd: bound(0, 0, 100, false),
    seed: bound(42, 0, Number.MAX_SAFE_INTEGER, true),
    sp: bound(10, 0.25, 10_000, false),
    tpd: bound(1, 1, 50, true),
    trials: bound(2000, 100, 5000, true),
    wr: bound(0.4, 0.05, 0.95, false),
} as const satisfies Record<string, ScalarBound>;

const COPY_ACCOUNTS_URL_CEILING = bound(1, 1, 20, true);
const RISK_DOLLARS_URL_CEILING = bound(250, 1, 1_000_000, false);

export const LAB_SCENARIO_BOUNDS = {
    accounts: COPY_ACCOUNTS_URL_CEILING,
    riskPerTrade: RISK_DOLLARS_URL_CEILING,
} as const satisfies Record<string, ScalarBound>;

export const MAX_LAB_SCENARIOS = 20;

function schemaFromBound({ fallback, isInteger, max, min }: ScalarBound) {
    const base = z.coerce.number().min(min).max(max);
    return (isInteger ? base.transform(Math.floor) : base).catch(fallback);
}

function strictSchemaFromBound({ isInteger, max, min }: ScalarBound) {
    const base = z.number().min(min).max(max);
    return isInteger ? base.int() : base;
}

export const INSTRUMENT_STOP_PAIR_RULE =
    'instrument and stop points must both be set or both be empty';

interface InstrumentStop {
    instrument: InstrumentSymbol | null;
    stopPoints: null | number;
}

function hasPairedStop({ instrument, stopPoints }: InstrumentStop): boolean {
    return (instrument === null) === (stopPoints === null);
}

const wireInstrumentSchema = z.enum(InstrumentSymbol).nullable().default(null);
const wireStopPointsSchema = strictSchemaFromBound(CALCULATOR_SCALAR_BOUNDS.sp)
    .nullable()
    .default(null);

export const labScenarioSchema = z
    .object({
        accounts: strictSchemaFromBound(LAB_SCENARIO_BOUNDS.accounts),
        correlation: z.enum(CorrelationMode),
        dayStop: dayStopRuleSchema,
        groups: z.number().int().positive(),
        id: z.string(),
        instrument: wireInstrumentSchema,
        label: z.string(),
        riskPerTrade: strictSchemaFromBound(LAB_SCENARIO_BOUNDS.riskPerTrade),
        rrRatio: strictSchemaFromBound(CALCULATOR_SCALAR_BOUNDS.rr),
        stopPoints: wireStopPointsSchema,
        tradesPerDay: strictSchemaFromBound(CALCULATOR_SCALAR_BOUNDS.tpd),
        winrate: strictSchemaFromBound(CALCULATOR_SCALAR_BOUNDS.wr),
    })
    .refine((scenario) => scenario.groups <= scenario.accounts, {
        path: ['groups'],
    })
    .refine(hasPairedStop, { message: INSTRUMENT_STOP_PAIR_RULE });

export const portfolioEntrySchema = z
    .object({
        activationDiscountPercent: strictSchemaFromBound(
            CALCULATOR_SCALAR_BOUNDS.act,
        ),
        count: z.number().int().positive(),
        evalDiscountPercent: strictSchemaFromBound(
            CALCULATOR_SCALAR_BOUNDS.eval,
        ),
        firmId: z.string(),
        id: z.string(),
        instrument: wireInstrumentSchema,
        linkActivationDiscount: z.boolean(),
        monthlySubscriptionDiscountPercent: strictSchemaFromBound(
            CALCULATOR_SCALAR_BOUNDS.msub,
        ).default(0),
        planId: z.string(),
        resetDiscountPercent: strictSchemaFromBound(
            CALCULATOR_SCALAR_BOUNDS.rstd,
        ).default(0),
        stopPoints: wireStopPointsSchema,
    })
    .refine(hasPairedStop, { message: INSTRUMENT_STOP_PAIR_RULE });

export const calculatorScalarFieldsSchema = z.object({
    act: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.act),
    attempts: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.attempts),
    comm: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.comm),
    copy: schemaFromBound(COPY_ACCOUNTS_URL_CEILING),
    eval: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.eval),
    fundedDays: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.fundedDays),
    idle: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.idle),
    maxDays: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.maxDays),
    msub: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.msub),
    rd: schemaFromBound(RISK_DOLLARS_URL_CEILING),
    rp: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.rp),
    rr: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.rr),
    rstd: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.rstd),
    seed: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.seed),
    tpd: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.tpd),
    trials: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.trials),
    wr: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.wr),
});

export type CalculatorScalarFields = z.infer<
    typeof calculatorScalarFieldsSchema
>;
