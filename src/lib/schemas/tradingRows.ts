import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
    answersSchema,
    assessmentResultSchema,
    executionDeviationSchema,
    outcomeSchema,
    prepChecksSchema,
    tradingPlanConfigSchema,
} from '~/lib/schemas/trading';
import {
    dailyPreparations,
    tradeAssessments,
    tradingPlans,
} from '~/server/db/schemas/trading';

export const tradingPlanRowSchema = createSelectSchema(tradingPlans, {
    config: tradingPlanConfigSchema,
});

export type TradingPlanRow = z.infer<typeof tradingPlanRowSchema>;

export const tradeAssessmentRowSchema = createSelectSchema(tradeAssessments, {
    answers: answersSchema,
    executionDeviations: z.array(executionDeviationSchema).nullable(),
    outcome: outcomeSchema.nullable(),
    planSnapshot: tradingPlanConfigSchema,
    result: assessmentResultSchema,
});

export type TradeAssessmentRow = z.infer<typeof tradeAssessmentRowSchema>;

export const dailyPreparationRowSchema = createSelectSchema(dailyPreparations, {
    checks: prepChecksSchema,
});

export type DailyPreparationRow = z.infer<typeof dailyPreparationRowSchema>;
