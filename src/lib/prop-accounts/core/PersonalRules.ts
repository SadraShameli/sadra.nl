import { z } from 'zod';

import { positiveUsdCentsSchema, type UsdCents } from './UsdCents';

export const MAX_PERSONAL_TRADES_PER_DAY = 20;

export interface PersonalRules {
    readonly dailyLossLimitCents?: UsdCents;
    readonly dailyProfitCapCents?: UsdCents;
    readonly maxRiskPerTradeCents?: UsdCents;
    readonly maxTradesPerDay?: number;
    readonly payoutRequestOverrideCents?: UsdCents;
    readonly retainedCushionCents?: UsdCents;
}

export const personalRulesSchema = z.object({
    dailyLossLimitCents: positiveUsdCentsSchema.optional(),
    dailyProfitCapCents: positiveUsdCentsSchema.optional(),
    maxRiskPerTradeCents: positiveUsdCentsSchema.optional(),
    maxTradesPerDay: z
        .number()
        .int()
        .min(1)
        .max(MAX_PERSONAL_TRADES_PER_DAY)
        .optional(),
    payoutRequestOverrideCents: positiveUsdCentsSchema.optional(),
    retainedCushionCents: positiveUsdCentsSchema.optional(),
}) satisfies z.ZodType<PersonalRules>;
