import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
    ACCOUNT_TYPE_VALUES,
    BIAS_DIRECTION_VALUES,
    DAY_TYPE_VALUES,
    DISPLACEMENT_DIRECTION_VALUES,
    DOL_CONFLUENCE_KEYS,
    DOL_TYPE_VALUES,
    ENTRY_CONFLUENCE_KEYS,
    EXECUTION_DEVIATION_VALUES,
    GRADE_VALUES,
    OUTCOME_VALUES,
    RECOMMENDATION_VALUES,
    SETUP_TYPE_VALUES,
    WEIGHT_CATEGORY_VALUES,
} from '~/lib/trading/types';
import {
    dailyPreparations,
    tradeAssessments,
    tradingPlans,
} from '~/server/db/schemas/trading';

export const accountTypeSchema = z.enum(ACCOUNT_TYPE_VALUES);
export const biasDirectionSchema = z.enum(BIAS_DIRECTION_VALUES);
export const dayTypeSchema = z.enum(DAY_TYPE_VALUES);
export const setupTypeSchema = z.enum(SETUP_TYPE_VALUES);
export const displacementDirectionSchema = z.enum(
    DISPLACEMENT_DIRECTION_VALUES,
);
export const dolTypeSchema = z.enum(DOL_TYPE_VALUES);
export const gradeSchema = z.enum(GRADE_VALUES);
export const recommendationSchema = z.enum(RECOMMENDATION_VALUES);
export const outcomeSchema = z.enum(OUTCOME_VALUES);
export const weightCategorySchema = z.enum(WEIGHT_CATEGORY_VALUES);
export const executionDeviationSchema = z.enum(EXECUTION_DEVIATION_VALUES);

const CONFLUENCE_KEY_VALUES = [
    ...ENTRY_CONFLUENCE_KEYS,
    ...DOL_CONFLUENCE_KEYS,
] as const;

export const confluenceKeySchema = z.enum(CONFLUENCE_KEY_VALUES);

export const timeWindowSchema = z
    .object({
        end: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM'),
        id: z.string().min(1),
        label: z.string().max(64),
        start: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM'),
    })
    .refine((w) => w.start < w.end, {
        message: 'Start must be before end',
        path: ['start'],
    });

export type TimeWindow = z.infer<typeof timeWindowSchema>;

export const tradingPlanConfigSchema = z.object({
    knockouts: z.object({
        boredomHunt: z.boolean(),
        bothSidedLiquidity: z.boolean(),
        distracted: z.boolean(),
        dolAlreadyTaken: z.boolean(),
        outsideMacroWindow: z.boolean(),
        revengeOrFomo: z.boolean(),
        slNotProtected: z.boolean(),
    }),
    risk: z.object({
        evalDollars: z.number().nonnegative(),
        fundedDollars: z.number().nonnegative(),
        maxTradesPerWindow: z.number().nonnegative(),
    }),
    setup: z.object({
        allowedConfluences: z.array(confluenceKeySchema),
        allowedDolTypes: z.array(dolTypeSchema),
        minRR: z.number().positive(),
        requiredPdArrays: z.number().int().min(1),
    }),
    weights: z.object({
        bias: z.number().nonnegative(),
        context: z.number().nonnegative(),
        dol: z.number().nonnegative(),
        entry: z.number().nonnegative(),
        mental: z.number().nonnegative(),
        rr: z.number().nonnegative(),
        sl: z.number().nonnegative(),
        state: z.number().nonnegative(),
    }),
    windows: z.array(timeWindowSchema).min(1),
});

export type TradingPlanConfig = z.infer<typeof tradingPlanConfigSchema>;

const entryAnswerSchema = z.object({
    confluences: z.array(z.string()),
    onFvg: z.boolean(),
});

export const answersSchema = z.object({
    bias: z.object({
        conviction: z.number().min(1).max(10),
        daily: biasDirectionSchema,
        fifteenMin: biasDirectionSchema,
        fourHour: biasDirectionSchema,
        oneHour: biasDirectionSchema,
        weekly: biasDirectionSchema,
    }),
    context: z.object({
        accountType: accountTypeSchema,
        windowId: z.string().nullable(),
        windowQuotaUsed: z.boolean(),
    }),
    dol: z.object({
        bothSided: z.boolean(),
        distanceR: z.number().min(0),
        singular: z.boolean(),
        type: dolTypeSchema,
    }),
    entry: entryAnswerSchema,
    finals: z.object({
        dolAlreadyTaken: z.boolean(),
        notes: z.string(),
        overExtended: z.boolean(),
    }),
    mental: z.object({
        boredomHunt: z.boolean(),
        distracted: z.boolean(),
        hesitation: z.boolean(),
        revengeOrFomo: z.boolean(),
    }),
    rr: z.object({
        slippageR: z.number().min(0),
        targetR: z.number().min(0),
    }),
    sl: z.object({
        bb: z.boolean(),
        ob: z.boolean(),
        swing: z.boolean(),
    }),
    state: z.object({
        dayType: dayTypeSchema,
        displacement: displacementDirectionSchema,
        opposingSweep: z.boolean(),
        setupType: setupTypeSchema,
    }),
});

export type Answers = z.infer<typeof answersSchema>;

export const componentScoreSchema = z.object({
    earned: z.number(),
    label: z.string(),
    max: z.number(),
    note: z.string(),
});

export type ComponentScore = z.infer<typeof componentScoreSchema>;

export const assessmentResultSchema = z.object({
    componentScores: z.object({
        bias: componentScoreSchema,
        context: componentScoreSchema,
        dol: componentScoreSchema,
        entry: componentScoreSchema,
        mental: componentScoreSchema,
        rr: componentScoreSchema,
        sl: componentScoreSchema,
        state: componentScoreSchema,
    }),
    grade: gradeSchema,
    improvements: z.array(z.string()),
    recommendation: recommendationSchema,
    redFlags: z.array(z.string()),
    score: z.number(),
    strengths: z.array(z.string()),
    suggestedSizeMultiplier: z.number(),
    weaknesses: z.array(z.string()),
});

export type AssessmentResult = z.infer<typeof assessmentResultSchema>;

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

export const planIdSchema = z.uuid();

export const tradingPlanCreationSchema = z.object({
    name: z.string().trim().min(1, 'Plan name is required').max(128),
});

export type CreateTradingPlanInput = z.infer<typeof tradingPlanCreationSchema>;

export const updateTradingPlanInputSchema = z.object({
    config: tradingPlanConfigSchema,
    name: z.string().trim().min(1, 'Plan name is required').max(128),
    planId: planIdSchema,
});

export type UpdateTradingPlanInput = z.infer<
    typeof updateTradingPlanInputSchema
>;

export const planIdActionSchema = z.object({ planId: planIdSchema });
export type PlanIdActionInput = z.infer<typeof planIdActionSchema>;

export const reorderTradingPlansInputSchema = z.object({
    orderedIds: z.array(planIdSchema).min(1),
});

export type ReorderTradingPlansInput = z.infer<
    typeof reorderTradingPlansInputSchema
>;

export const saveAssessmentInputSchema = z.object({
    answers: answersSchema,
    planId: planIdSchema.nullable(),
    planSnapshot: tradingPlanConfigSchema,
    result: assessmentResultSchema,
});

export type SaveAssessmentInput = z.infer<typeof saveAssessmentInputSchema>;

export const assessmentIdSchema = z.uuid();

export const recordAssessmentOutcomeInputSchema = z.object({
    actualRiskTaken: z.number().nullable(),
    executionDeviations: z.array(executionDeviationSchema).nullable(),
    followedPlan: z.boolean().nullable(),
    id: assessmentIdSchema,
    notes: z.string().nullable(),
    outcome: outcomeSchema,
    outcomeR: z.number().nullable(),
});

export type RecordAssessmentOutcomeInput = z.infer<
    typeof recordAssessmentOutcomeInputSchema
>;

export const assessmentIdActionSchema = z.object({ id: assessmentIdSchema });
export type AssessmentIdActionInput = z.infer<typeof assessmentIdActionSchema>;

export const prepChecksSchema = z.object({
    accountRiskReset: z.boolean(),
    economicEventsChecked: z.boolean(),
    htfBiasConfirmed: z.boolean(),
    journalReviewed: z.boolean(),
    keyLevelsMarked: z.boolean(),
    mentalCheckIn: z.boolean(),
    setupPlanWritten: z.boolean(),
});

export type PrepChecksParsed = z.infer<typeof prepChecksSchema>;

export const dailyPreparationRowSchema = createSelectSchema(dailyPreparations, {
    checks: prepChecksSchema,
});

export type DailyPreparationRow = z.infer<typeof dailyPreparationRowSchema>;

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const savePrepInputSchema = z.object({
    checks: prepChecksSchema,
    date: dateStringSchema,
    notes: z.string().nullable(),
    planId: planIdSchema.nullable(),
});

export type SavePrepInput = z.infer<typeof savePrepInputSchema>;

export const prepDeletionSchema = z.object({ date: dateStringSchema });
export type DeletePrepInput = z.infer<typeof prepDeletionSchema>;
