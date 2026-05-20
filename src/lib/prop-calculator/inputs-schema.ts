import { z } from 'zod';

export const simInputsRawSchema = z.object({
    commissionPerRoundTrip: z.number().nonnegative().max(1000).optional(),
    copyAccounts: z.number().int().min(1).max(100).optional(),
    fundedHorizonDays: z.number().int().min(1).max(365).default(60),
    maxAttempts: z.number().int().min(1).max(100).optional(),
    maxEvalDays: z.number().int().min(1).max(365).default(60),
    riskPerTrade: z
        .number()
        .min(0.0001, 'Risk per trade must be > 0')
        .max(0.2, 'Risk per trade is capped at 20% for safety'),
    rrRatio: z
        .number()
        .min(0.1, 'RR ratio must be at least 0.1')
        .max(20, 'RR ratio above 20 is unrealistic'),
    seed: z.number().int().default(1),
    tradesPerDay: z
        .number()
        .int()
        .min(1, 'At least 1 trade/day')
        .max(50, 'Cap is 50 trades/day'),
    trials: z.number().int().min(50).max(10_000).default(500),
    winrate: z.number().min(0).max(1),
});

export type SimInputsRaw = z.infer<typeof simInputsRawSchema>;
