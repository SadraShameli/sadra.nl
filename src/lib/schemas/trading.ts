import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
    ACCOUNT_TYPE_VALUES,
    BIAS_DIRECTION_VALUES,
    DAY_TYPE_VALUES,
    DISPLACEMENT_DIRECTION_VALUES,
    DOL_TYPE_VALUES,
    GRADE_VALUES,
    OUTCOME_VALUES,
    RECOMMENDATION_VALUES,
    SETUP_TYPE_VALUES,
    WEIGHT_CATEGORY_VALUES,
} from '~/lib/trading-types';
import { tradeAssessments, tradingPlans } from '~/server/db/schemas/trading';

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

const ENTRY_CONFLUENCE_KEYS = [
    'OB',
    'BB',
    'IFVG',
    'OTE',
    'VAH',
    'VAL',
    'POC',
] as const;
const DOL_CONFLUENCE_KEYS = [
    'REH/REL',
    'Trendline liquidity',
    'NWOG',
    'NDOG',
    'ORG',
] as const;
const CONFLUENCE_KEY_VALUES = [
    ...ENTRY_CONFLUENCE_KEYS,
    ...DOL_CONFLUENCE_KEYS,
] as const;

export const confluenceKeySchema = z.enum(CONFLUENCE_KEY_VALUES);

export const timeWindowSchema = z.object({
    id: z.string().min(1),
    label: z.string().max(64),
    start: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM'),
});

export type TimeWindow = z.infer<typeof timeWindowSchema>;

export const tradingPlanConfigSchema = z.object({
    windows: z.array(timeWindowSchema).min(1),
    risk: z.object({
        fundedDollars: z.number().nonnegative(),
        evalDollars: z.number().nonnegative(),
        maxTradesPerWindow: z.number().nonnegative(),
    }),
    setup: z.object({
        minRR: z.number().nonnegative(),
        requiredPdArrays: z.number().nonnegative(),
        allowedConfluences: z.array(confluenceKeySchema),
        allowedDolTypes: z.array(dolTypeSchema),
    }),
    weights: z.object({
        mental: z.number().nonnegative(),
        context: z.number().nonnegative(),
        bias: z.number().nonnegative(),
        dol: z.number().nonnegative(),
        state: z.number().nonnegative(),
        entry: z.number().nonnegative(),
        sl: z.number().nonnegative(),
        rr: z.number().nonnegative(),
    }),
    knockouts: z.object({
        outsideMacroWindow: z.boolean(),
        bothSidedLiquidity: z.boolean(),
        slNotProtected: z.boolean(),
        dolAlreadyTaken: z.boolean(),
        revengeOrFomo: z.boolean(),
        distracted: z.boolean(),
        boredomHunt: z.boolean(),
    }),
});

export type TradingPlanConfig = z.infer<typeof tradingPlanConfigSchema>;

export const answersSchema = z.object({
    mental: z.object({
        hesitation: z.boolean(),
        boredomHunt: z.boolean(),
        revengeOrFomo: z.boolean(),
        distracted: z.boolean(),
    }),
    context: z.object({
        windowId: z.string().nullable(),
        accountType: accountTypeSchema,
        windowQuotaUsed: z.boolean(),
    }),
    bias: z.object({
        weekly: biasDirectionSchema,
        daily: biasDirectionSchema,
        fourHour: biasDirectionSchema,
        oneHour: biasDirectionSchema,
        fifteenMin: biasDirectionSchema,
        conviction: z.number().min(1).max(10),
    }),
    dol: z.object({
        type: dolTypeSchema,
        singular: z.boolean(),
        bothSided: z.boolean(),
        distanceR: z.number().min(0),
    }),
    state: z.object({
        opposingSweep: z.boolean(),
        displacement: displacementDirectionSchema,
        dayType: dayTypeSchema,
        setupType: setupTypeSchema,
    }),
    entry: z.object({
        onFvg: z.boolean(),
        confluences: z.array(z.string()),
    }),
    sl: z.object({
        ob: z.boolean(),
        bb: z.boolean(),
        swing: z.boolean(),
    }),
    rr: z.object({
        targetR: z.number().min(0),
        slippageR: z.number().min(0),
    }),
    finals: z.object({
        dolAlreadyTaken: z.boolean(),
        overExtended: z.boolean(),
        notes: z.string(),
    }),
});

export type Answers = z.infer<typeof answersSchema>;

export const componentScoreSchema = z.object({
    earned: z.number(),
    max: z.number(),
    label: z.string(),
    note: z.string(),
});

export type ComponentScore = z.infer<typeof componentScoreSchema>;

export const assessmentResultSchema = z.object({
    grade: gradeSchema,
    score: z.number(),
    recommendation: recommendationSchema,
    suggestedSizeMultiplier: z.number(),
    componentScores: z.object({
        mental: componentScoreSchema,
        context: componentScoreSchema,
        bias: componentScoreSchema,
        dol: componentScoreSchema,
        state: componentScoreSchema,
        entry: componentScoreSchema,
        sl: componentScoreSchema,
        rr: componentScoreSchema,
    }),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    redFlags: z.array(z.string()),
    improvements: z.array(z.string()),
});

export type AssessmentResult = z.infer<typeof assessmentResultSchema>;

export const tradingPlanRowSchema = createSelectSchema(tradingPlans, {
    config: tradingPlanConfigSchema,
});

export type TradingPlanRow = z.infer<typeof tradingPlanRowSchema>;

export const tradeAssessmentRowSchema = createSelectSchema(tradeAssessments, {
    planSnapshot: tradingPlanConfigSchema,
    answers: answersSchema,
    result: assessmentResultSchema,
    outcome: outcomeSchema.nullable(),
});

export type TradeAssessmentRow = z.infer<typeof tradeAssessmentRowSchema>;

export const planIdSchema = z.uuid();

export const createTradingPlanInputSchema = z.object({
    name: z.string().trim().min(1, 'Plan name is required').max(128),
});

export type CreateTradingPlanInput = z.infer<
    typeof createTradingPlanInputSchema
>;

export const updateTradingPlanInputSchema = z.object({
    planId: planIdSchema,
    name: z.string().trim().min(1, 'Plan name is required').max(128),
    config: tradingPlanConfigSchema,
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
    planId: planIdSchema.nullable(),
    planSnapshot: tradingPlanConfigSchema,
    answers: answersSchema,
    result: assessmentResultSchema,
});

export type SaveAssessmentInput = z.infer<typeof saveAssessmentInputSchema>;

export const assessmentIdSchema = z.uuid();

export const recordAssessmentOutcomeInputSchema = z.object({
    id: assessmentIdSchema,
    outcome: outcomeSchema,
    outcomeR: z.number().nullable(),
    notes: z.string().nullable(),
});

export type RecordAssessmentOutcomeInput = z.infer<
    typeof recordAssessmentOutcomeInputSchema
>;

export const assessmentIdActionSchema = z.object({ id: assessmentIdSchema });
export type AssessmentIdActionInput = z.infer<typeof assessmentIdActionSchema>;
