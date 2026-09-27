import { z } from 'zod';

import { type Dollars, dollarsSchema } from '../core';

export const positiveDollarsSchema = dollarsSchema.refine(
    (amount) => amount > 0,
    { message: 'must be more than zero' },
);

export interface PersonalCaps {
    readonly dailyProfitCap: Dollars | null;
    readonly maxRiskPerTrade: Dollars | null;
    readonly maxTradesPerDay: null | number;
}

export const NO_PERSONAL_CAPS: PersonalCaps = {
    dailyProfitCap: null,
    maxRiskPerTrade: null,
    maxTradesPerDay: null,
};

export const personalCapsSchema = z.strictObject({
    dailyProfitCap: positiveDollarsSchema.nullable(),
    maxRiskPerTrade: positiveDollarsSchema.nullable(),
    maxTradesPerDay: z.number().int().positive().nullable(),
}) satisfies z.ZodType<PersonalCaps>;
