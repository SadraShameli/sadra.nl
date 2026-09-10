import { z } from 'zod';

import { CorrelationMode, InstrumentSymbol } from '~/lib/prop-calculator';
import { DayStopRuleKind } from '~/lib/prop-calculator/core';

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
        k: z.number(),
        kind: z.literal(DayStopRuleKind.AfterKLosses),
    }),
    z.object({
        dollars: z.number(),
        kind: z.literal(DayStopRuleKind.AfterTarget),
    }),
]);

export const dayPolicySchema = z.object({
    ladder: z.array(z.number()),
    maxLossesPerDay: z.number().nullable(),
    stopRule: dayStopRuleSchema,
});

export const labScenarioSchema = z.object({
    accounts: z.number(),
    correlation: z.enum(CorrelationMode),
    dayStop: dayStopRuleSchema,
    groups: z.number(),
    id: z.string(),
    instrument: z.enum(InstrumentSymbol).nullable().catch(null),
    label: z.string(),
    riskPerTrade: z.number(),
    rrRatio: z.number(),
    stopPoints: z.number().nullable().catch(null),
    tradesPerDay: z.number(),
    winrate: z.number(),
});

export const portfolioEntrySchema = z.object({
    activationDiscountPercent: z.number(),
    count: z.number(),
    evalDiscountPercent: z.number(),
    firmId: z.string(),
    id: z.string(),
    instrument: z.enum(InstrumentSymbol).nullable().catch(null),
    linkActivationDiscount: z.boolean(),
    planId: z.string(),
    stopPoints: z.number().nullable().catch(null),
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
    rc: bound(0, 0, 100_000, false),
    rp: bound(0.5, 0.05, 100, false),
    rr: bound(2, 0.5, 10, false),
    seed: bound(42, 0, Number.MAX_SAFE_INTEGER, true),
    sp: bound(10, 0.25, 10_000, false),
    tpd: bound(1, 1, 50, true),
    trials: bound(2000, 100, 5000, true),
    wr: bound(0.4, 0.05, 0.95, false),
} as const satisfies Record<string, ScalarBound>;

const COPY_ACCOUNTS_URL_CEILING = bound(1, 1, 20, true);
const RISK_DOLLARS_URL_CEILING = bound(250, 1, 1_000_000, false);

function schemaFromBound({ fallback, isInteger, max, min }: ScalarBound) {
    const base = z.coerce.number().min(min).max(max);
    return (isInteger ? base.transform(Math.floor) : base).catch(fallback);
}

export const calculatorScalarFieldsSchema = z.object({
    act: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.act),
    attempts: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.attempts),
    comm: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.comm),
    copy: schemaFromBound(COPY_ACCOUNTS_URL_CEILING),
    eval: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.eval),
    fundedDays: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.fundedDays),
    idle: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.idle),
    maxDays: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.maxDays),
    rd: schemaFromBound(RISK_DOLLARS_URL_CEILING),
    rp: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.rp),
    rr: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.rr),
    seed: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.seed),
    tpd: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.tpd),
    trials: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.trials),
    wr: schemaFromBound(CALCULATOR_SCALAR_BOUNDS.wr),
});

export type CalculatorScalarFields = z.infer<
    typeof calculatorScalarFieldsSchema
>;
