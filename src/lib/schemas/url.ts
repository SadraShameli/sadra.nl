import { z } from 'zod';

export const profileTabSchema = z
    .enum(['account', 'security', 'trading-plan'])
    // eslint-disable-next-line unicorn/prefer-top-level-await
    .catch('account');

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
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('first-win') }),
    z.object({ k: z.number(), kind: z.literal('after-k-losses') }),
    z.object({ dollars: z.number(), kind: z.literal('after-target') }),
]);

export const labScenarioSchema = z.object({
    accounts: z.number(),
    correlation: z.enum(['copy', 'grouped', 'independent']),
    dayStop: dayStopRuleSchema,
    groups: z.number(),
    id: z.string(),
    label: z.string(),
    riskPerTrade: z.number(),
    rrRatio: z.number(),
    tradesPerDay: z.number(),
    winrate: z.number(),
});

export const savedScenarioRecordSchema = z.object({
    name: z.string(),
    params: z.string(),
    savedAt: z.number(),
});

export type SavedScenarioRecord = z.infer<typeof savedScenarioRecordSchema>;
