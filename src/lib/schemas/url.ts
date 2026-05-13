import { z } from 'zod';

export const profileTabSchema = z
    .enum(['account', 'trading-plan'])
    .catch('account');

export type ProfileTab = z.infer<typeof profileTabSchema>;

export const loginSearchSchema = z.object({
    error: z.string().optional(),
    success: z.string().optional(),
});

export const signupSearchSchema = z.object({
    error: z.string().optional(),
});

export const forgotPasswordSearchSchema = z.object({
    sent: z.string().optional(),
});

export const resetPasswordSearchSchema = z.object({
    token: z.string().optional(),
    error: z.string().optional(),
});

export const profileSearchSchema = z.object({
    error: z.string().optional(),
    success: z.string().optional(),
    tab: profileTabSchema.optional(),
});

export const tradingPlanSearchSchema = z.object({
    plan: z.string().optional(),
    success: z.string().optional(),
    error: z.string().optional(),
});

export const dayStopRuleSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('first-win') }),
    z.object({ kind: z.literal('after-k-losses'), k: z.number() }),
    z.object({ kind: z.literal('after-target'), dollars: z.number() }),
]);

export const labScenarioSchema = z.object({
    id: z.string(),
    label: z.string(),
    riskPerTrade: z.number(),
    winrate: z.number(),
    rrRatio: z.number(),
    tradesPerDay: z.number(),
    accounts: z.number(),
    correlation: z.enum(['copy', 'grouped', 'independent']),
    groups: z.number(),
    dayStop: dayStopRuleSchema,
});

export const savedScenarioRecordSchema = z.object({
    name: z.string(),
    savedAt: z.number(),
    params: z.string(),
});

export type SavedScenarioRecord = z.infer<typeof savedScenarioRecordSchema>;
