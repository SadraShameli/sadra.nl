import { z } from 'zod';

import {
    CENTS_PER_DOLLAR,
    type DayStopRule,
    DayStopRuleKind,
    fraction,
    type LiveCushionPercent,
    MAX_LADDER_SLOTS,
} from '../core';

export enum EvalSizingMode {
    Ladder = 'ladder',
    MaxRisk = 'max-risk',
}

export enum LadderFractionSource {
    GeneralDerivation = 'general-derivation',
    MffRapidEodSearch = 'mff-rapid-eod-search',
}

export enum ReviewWeekday {
    Friday = 'friday',
    Monday = 'monday',
    Saturday = 'saturday',
    Sunday = 'sunday',
    Thursday = 'thursday',
    Tuesday = 'tuesday',
    Wednesday = 'wednesday',
}

export const RULEBOOK_SCHEMA_VERSION = 1;
export const HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS = 200_000;
export const LADDER_FRACTION_SUM_TOLERANCE = 1e-9;

export interface AlertThresholds {
    readonly evalDaysRemainingWarning: number;
    readonly evalNearFloorDrawdownFraction: number;
    readonly fundedNearFloorRiskMultiple: number;
}

export interface EvalSizingParameters {
    readonly generalDerivation: GeneralDerivationLadder;
    readonly ladderFractionSource: LadderFractionSource;
    readonly maxRiskDailyCapMultiple: number;
    readonly mffSearchFractions: readonly number[];
    readonly mode: EvalSizingMode;
    readonly roundingStepCents: number;
}

export interface ExecutionParameters {
    readonly maxTradesPerWindow: number;
}

export interface FundedSizingParameters {
    readonly riskCents: number;
    readonly stopRule: FundedStopRule;
    readonly takeProfitCents: number;
    readonly tradesPerDayMax: number;
}

export type FundedStopRule =
    | { readonly k: number; readonly kind: DayStopRuleKind.AfterKLosses }
    | {
          readonly kind: DayStopRuleKind.AfterTarget;
          readonly targetCents: number;
      }
    | { readonly kind: DayStopRuleKind.DayGreen }
    | { readonly kind: DayStopRuleKind.FirstWin }
    | { readonly kind: DayStopRuleKind.None };

export interface GeneralDerivationLadder {
    readonly escalation: number;
    readonly firstRungFraction: number;
}

export interface LiveSizingParameters {
    readonly cushionPercent: LiveCushionPercent;
}

export interface PayoutParameters {
    readonly allowBelowHardRule2: boolean;
    readonly requestCents: number;
    readonly retainedCushionCents: number;
}

export interface ReviewParameters {
    readonly fundedStaleDays: number;
    readonly weekday: ReviewWeekday;
}

export interface RulebookParameters {
    readonly alerts: AlertThresholds;
    readonly eval: EvalSizingParameters;
    readonly execution: ExecutionParameters;
    readonly funded: FundedSizingParameters;
    readonly live: LiveSizingParameters;
    readonly payout: PayoutParameters;
    readonly review: ReviewParameters;
    readonly schemaVersion: typeof RULEBOOK_SCHEMA_VERSION;
    readonly strategy: StrategyAssumptions;
}

export interface StrategyAssumptions {
    readonly rr: number;
    readonly tradesPerDayMax: number;
    readonly winrate: number;
}

export const DEFAULT_RULEBOOK: RulebookParameters = {
    alerts: {
        evalDaysRemainingWarning: 5,
        evalNearFloorDrawdownFraction: 0.25,
        fundedNearFloorRiskMultiple: 2,
    },
    eval: {
        generalDerivation: { escalation: 1.5, firstRungFraction: 0.2 },
        ladderFractionSource: LadderFractionSource.GeneralDerivation,
        maxRiskDailyCapMultiple: 2,
        mffSearchFractions: [0.2, 0.3, 0.4, 0.1],
        mode: EvalSizingMode.Ladder,
        roundingStepCents: 5000,
    },
    execution: { maxTradesPerWindow: 1 },
    funded: {
        riskCents: 25_000,
        stopRule: { kind: DayStopRuleKind.None },
        takeProfitCents: 50_000,
        tradesPerDayMax: 4,
    },
    live: {
        cushionPercent: { postLock: fraction(0.1), preLock: fraction(0.05) },
    },
    payout: {
        allowBelowHardRule2: false,
        requestCents: 50_000,
        retainedCushionCents: HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    },
    review: { fundedStaleDays: 7, weekday: ReviewWeekday.Monday },
    schemaVersion: RULEBOOK_SCHEMA_VERSION,
    strategy: { rr: 2, tradesPerDayMax: 4, winrate: 0.4 },
};

const MAX_AMOUNT_CENTS = 10_000_000;
const MAX_ROUNDING_STEP_CENTS = 100_000;
const MAX_DAY_COUNT = 365;
const MAX_ESCALATION = 10;
const MAX_RR = 20;
const MAX_RISK_MULTIPLE = 10;
const UNION_DISCRIMINANT_KEY = 'kind';

export function fundedStopRuleToDayStopRule(rule: FundedStopRule): DayStopRule {
    switch (rule.kind) {
        case DayStopRuleKind.AfterKLosses: {
            return { k: rule.k, kind: rule.kind };
        }
        case DayStopRuleKind.AfterTarget: {
            return {
                dollars: rule.targetCents / CENTS_PER_DOLLAR,
                kind: rule.kind,
            };
        }
        case DayStopRuleKind.DayGreen:
        case DayStopRuleKind.FirstWin:
        case DayStopRuleKind.None: {
            return { kind: rule.kind };
        }
    }
}

export function hardRule4Violation(
    rulebook: Pick<RulebookParameters, 'eval' | 'strategy'>,
): null | string {
    const { maxRiskDailyCapMultiple, mode } = rulebook.eval;
    const { rr } = rulebook.strategy;
    return mode === EvalSizingMode.MaxRisk && rr > maxRiskDailyCapMultiple
        ? `Hard Rule 4 needs the daily cap multiple (${maxRiskDailyCapMultiple}) to be at least the rr (${rr}), or one win overshoots the daily cap`
        : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function withRulebookDefaults(stored: unknown): unknown {
    return mergeDefaults(DEFAULT_RULEBOOK, stored);
}

const positiveCentsSchema = z.number().int().positive().max(MAX_AMOUNT_CENTS);

const tradeCountSchema = z.number().int().min(1).max(MAX_LADDER_SLOTS);

const openUnitIntervalSchema = z.number().gt(0).lt(1);

export const liveFractionSchema = z.number().gt(0).max(1).transform(fraction);

const ladderFractionsSchema = z
    .array(z.number().gt(0))
    .min(1)
    .max(MAX_LADDER_SLOTS)
    .superRefine((fractions, context) => {
        const total = fractions.reduce((sum, value) => sum + value, 0);
        if (Math.abs(total - 1) > LADDER_FRACTION_SUM_TOLERANCE) {
            context.addIssue({
                code: 'custom',
                message: `ladder fractions must sum to 1, got ${total}`,
            });
        }
    })
    .readonly();

const riskMultipleSchema = z.number().positive().max(MAX_RISK_MULTIPLE);

const fundedStopRuleSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal(DayStopRuleKind.None) }),
    z.object({ kind: z.literal(DayStopRuleKind.FirstWin) }),
    z.object({ kind: z.literal(DayStopRuleKind.DayGreen) }),
    z.object({
        k: tradeCountSchema,
        kind: z.literal(DayStopRuleKind.AfterKLosses),
    }),
    z.object({
        kind: z.literal(DayStopRuleKind.AfterTarget),
        targetCents: positiveCentsSchema,
    }),
]);

const alertThresholdsSchema = z.object({
    evalDaysRemainingWarning: z.number().int().min(0).max(MAX_DAY_COUNT),
    evalNearFloorDrawdownFraction: z.number().gt(0).max(1),
    fundedNearFloorRiskMultiple: riskMultipleSchema,
});

const evalSizingSchema = z.object({
    generalDerivation: z.object({
        escalation: z.number().positive().max(MAX_ESCALATION),
        firstRungFraction: openUnitIntervalSchema,
    }),
    ladderFractionSource: z.enum(LadderFractionSource),
    maxRiskDailyCapMultiple: riskMultipleSchema,
    mffSearchFractions: ladderFractionsSchema,
    mode: z.enum(EvalSizingMode),
    roundingStepCents: positiveCentsSchema.max(MAX_ROUNDING_STEP_CENTS),
});

const fundedSizingSchema = z.object({
    riskCents: positiveCentsSchema,
    stopRule: fundedStopRuleSchema,
    takeProfitCents: positiveCentsSchema,
    tradesPerDayMax: tradeCountSchema,
});

const liveSizingSchema = z.object({
    cushionPercent: z.object({
        postLock: liveFractionSchema,
        preLock: liveFractionSchema,
    }),
});

const payoutSchema = z.object({
    allowBelowHardRule2: z.boolean(),
    requestCents: positiveCentsSchema,
    retainedCushionCents: z.number().int().min(0).max(MAX_AMOUNT_CENTS),
});

const reviewSchema = z.object({
    fundedStaleDays: z.number().int().min(1).max(MAX_DAY_COUNT),
    weekday: z.enum(ReviewWeekday),
});

const strategySchema = z.object({
    rr: z.number().positive().max(MAX_RR),
    tradesPerDayMax: tradeCountSchema,
    winrate: openUnitIntervalSchema,
});

export const rulebookSchema = z
    .object({
        alerts: alertThresholdsSchema,
        eval: evalSizingSchema,
        execution: z.object({ maxTradesPerWindow: tradeCountSchema }),
        funded: fundedSizingSchema,
        live: liveSizingSchema,
        payout: payoutSchema,
        review: reviewSchema,
        schemaVersion: z.literal(RULEBOOK_SCHEMA_VERSION),
        strategy: strategySchema,
    })
    .superRefine((rulebook, context) => {
        if (
            !rulebook.payout.allowBelowHardRule2 &&
            rulebook.payout.retainedCushionCents <
                HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS
        ) {
            context.addIssue({
                code: 'custom',
                message: `retained cushion below $${HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS / CENTS_PER_DOLLAR} breaks Hard Rule 2; set allowBelowHardRule2 to keep it`,
                path: ['payout', 'retainedCushionCents'],
            });
        }
        const overshoot = hardRule4Violation(rulebook);
        if (overshoot !== null) {
            context.addIssue({
                code: 'custom',
                message: overshoot,
                path: ['eval', 'maxRiskDailyCapMultiple'],
            });
        }
    }) satisfies z.ZodType<RulebookParameters>;

function mergeDefaults(defaults: unknown, stored: unknown): unknown {
    if (stored === undefined) return defaults;
    if (
        !isRecord(defaults) ||
        !isRecord(stored) ||
        Object.hasOwn(defaults, UNION_DISCRIMINANT_KEY)
    ) {
        return stored;
    }
    const merged: Record<string, unknown> = { ...stored };
    for (const [key, value] of Object.entries(defaults)) {
        merged[key] = mergeDefaults(value, stored[key]);
    }
    return merged;
}
