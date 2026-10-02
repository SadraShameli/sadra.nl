import { z } from 'zod';

import { type Dollars } from '~/lib/prop-calculator';

import {
    positiveUsdCentsSchema,
    type UsdCents,
    usdCentsToDollars,
} from './UsdCents';

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

export function personalMaxRiskOf(
    personalRules: null | PersonalRules,
): Dollars | null {
    const cents = personalRules?.maxRiskPerTradeCents;
    return cents === undefined ? null : usdCentsToDollars(cents);
}
