import { z } from 'zod';

import { CorrelationMode } from '~/lib/prop-calculator';
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
    label: z.string(),
    riskPerTrade: z.number(),
    rrRatio: z.number(),
    tradesPerDay: z.number(),
    winrate: z.number(),
});

export const portfolioEntrySchema = z.object({
    activationDiscountPercent: z.number(),
    count: z.number(),
    evalDiscountPercent: z.number(),
    firmId: z.string(),
    id: z.string(),
    linkActivationDiscount: z.boolean(),
    planId: z.string(),
});

export const savedScenarioRecordSchema = z.object({
    name: z.string(),
    params: z.string(),
    savedAt: z.number(),
});

export type SavedScenarioRecord = z.infer<typeof savedScenarioRecordSchema>;

const intFromQueryParameter = (fallback: number, min: number, max: number) =>
    z.coerce.number().min(min).max(max).transform(Math.floor).catch(fallback);

const numberFromQueryParameter = (fallback: number, min: number, max: number) =>
    z.coerce.number().min(min).max(max).catch(fallback);

export const calculatorScalarFieldsSchema = z.object({
    act: numberFromQueryParameter(0, 0, 100),
    attempts: intFromQueryParameter(1, 1, 10),
    comm: numberFromQueryParameter(0, 0, 50),
    copy: intFromQueryParameter(1, 1, 20),
    eval: numberFromQueryParameter(0, 0, 100),
    fundedDays: intFromQueryParameter(60, 1, 3650),
    maxDays: intFromQueryParameter(60, 10, 365),
    rd: numberFromQueryParameter(250, 1, 1_000_000),
    rp: numberFromQueryParameter(0.5, 0.05, 100),
    rr: numberFromQueryParameter(2, 0.5, 10),
    seed: intFromQueryParameter(42, 0, Number.MAX_SAFE_INTEGER),
    tpd: intFromQueryParameter(1, 1, 50),
    trials: intFromQueryParameter(2000, 100, 5000),
    wr: numberFromQueryParameter(0.4, 0.05, 0.95),
});

export type CalculatorScalarFields = z.infer<
    typeof calculatorScalarFieldsSchema
>;
