import { z } from 'zod';

import {
    CENTS_PER_DOLLAR,
    type DayStopRule,
    DayStopRuleKind,
    FirmId,
    fraction,
    type LiveCushionPercent,
    MAX_LADDER_SLOTS,
} from '~/lib/prop-calculator/core';
import { type PlausibilityThresholds } from '~/lib/prop-calculator/economics';

import { RiskDisplayUnit } from './RiskDisplayUnit';

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
export const HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS =
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS / CENTS_PER_DOLLAR;
export const LADDER_FRACTION_SUM_TOLERANCE = 1e-9;

export interface AlertThresholds {
    readonly dayLossBankrollFraction: null | number;
    readonly evalDaysRemainingWarning: number;
    readonly evalNearFloorDrawdownFraction: number;
    readonly firmProfitConcentrationCount: null | number;
    readonly firmProfitConcentrationShare: null | number;
    readonly fundedNearFloorRiskMultiple: number;
    readonly payoutReadyLossFraction: null | number;
    readonly payoutReadyRiskAboveRungCents: null | number;
}

export interface BankrollParameters {
    readonly accountsPerSession: null | number;
    readonly dailyAccountCapacity: null | number;
    readonly defaultRoundBudgetCents: null | number;
    readonly lossRiskThreshold: null | number;
    readonly objectiveSwitchCents: null | number;
    readonly roundGapDays: number;
    readonly sessionHoursPerDay: null | number;
}

export interface DisplayPreferences {
    readonly nextPayoutHighlightDays: number;
    readonly riskUnit: RiskDisplayUnit;
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

export interface LiveTransferAssumptions {
    readonly hazardPerPaidPayoutByFirm: Readonly<
        Partial<Record<FirmId, number>>
    >;
}

export interface PayoutParameters {
    readonly allowBelowHardRule2: boolean;
    readonly requestCents: number;
    readonly retainedCushionCents: number;
}

export interface ReviewParameters {
    readonly fundedStaleDays: number;
    readonly monthlyPayoutTargetCents: null | number;
    readonly targetMonthlyMultiple: null | number;
    readonly weekday: ReviewWeekday;
}

export interface RulebookParameters {
    readonly alerts: AlertThresholds;
    readonly bankroll: BankrollParameters;
    readonly display: DisplayPreferences;
    readonly eval: EvalSizingParameters;
    readonly execution: ExecutionParameters;
    readonly funded: FundedSizingParameters;
    readonly live: LiveSizingParameters;
    readonly liveTransfer: LiveTransferAssumptions;
    readonly payout: PayoutParameters;
    readonly plausibility: Readonly<PlausibilityThresholds>;
    readonly review: ReviewParameters;
    readonly samples: SampleThresholds;
    readonly schemaVersion: typeof RULEBOOK_SCHEMA_VERSION;
    readonly strategy: StrategyAssumptions;
}

export interface SampleThresholds {
    readonly minClosedRounds: null | number;
    readonly minEndedAccounts: null | number;
    readonly minEvalAttempts: null | number;
    readonly minFundedAccounts: null | number;
    readonly minTrades: null | number;
}

export interface StrategyAssumptions {
    readonly rr: number;
    readonly tradesPerDayMax: number;
    readonly winrate: number;
}

export const DEFAULT_RULEBOOK: RulebookParameters = {
    alerts: {
        dayLossBankrollFraction: null,
        evalDaysRemainingWarning: 5,
        evalNearFloorDrawdownFraction: 0.25,
        firmProfitConcentrationCount: null,
        firmProfitConcentrationShare: null,
        fundedNearFloorRiskMultiple: 2,
        payoutReadyLossFraction: null,
        payoutReadyRiskAboveRungCents: null,
    },
    bankroll: {
        accountsPerSession: null,
        dailyAccountCapacity: null,
        defaultRoundBudgetCents: null,
        lossRiskThreshold: null,
        objectiveSwitchCents: null,
        roundGapDays: 14,
        sessionHoursPerDay: null,
    },
    display: {
        nextPayoutHighlightDays: 7,
        riskUnit: RiskDisplayUnit.AccountDollars,
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
    liveTransfer: { hazardPerPaidPayoutByFirm: {} },
    payout: {
        allowBelowHardRule2: false,
        requestCents: 50_000,
        retainedCushionCents: HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    },
    plausibility: { strongMaxExpectancyR: 0.35, typicalMaxExpectancyR: 0.3 },
    review: {
        fundedStaleDays: 7,
        monthlyPayoutTargetCents: null,
        targetMonthlyMultiple: null,
        weekday: ReviewWeekday.Monday,
    },
    samples: {
        minClosedRounds: null,
        minEndedAccounts: null,
        minEvalAttempts: null,
        minFundedAccounts: null,
        minTrades: null,
    },
    schemaVersion: RULEBOOK_SCHEMA_VERSION,
    strategy: { rr: 2, tradesPerDayMax: 4, winrate: 0.4 },
};

const MAX_AMOUNT_CENTS = 10_000_000;
const MAX_ROUNDING_STEP_CENTS = 100_000;
const MAX_DAY_COUNT = 365;
const MAX_ESCALATION = 10;
const MAX_RR = 20;
const MAX_RISK_MULTIPLE = 10;
const MAX_LOSS_RISK_THRESHOLD = 0.5;
const MAX_SAMPLE_MINIMUM = 10_000;
const MAX_ACCOUNT_COUNT = 200;
const MAX_SESSION_HOURS = 16;
const MAX_TARGET_MULTIPLE = 100;
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

const unitFractionSchema = z.number().gt(0).max(1);

const accountCountSchema = z.number().int().min(1).max(MAX_ACCOUNT_COUNT);

const sampleMinimumSchema = z.number().int().min(1).max(MAX_SAMPLE_MINIMUM);

const expectancyRSchema = z.number().positive().max(MAX_RR);

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
    dayLossBankrollFraction: unitFractionSchema.nullable(),
    evalDaysRemainingWarning: z.number().int().min(0).max(MAX_DAY_COUNT),
    evalNearFloorDrawdownFraction: unitFractionSchema,
    firmProfitConcentrationCount: accountCountSchema.nullable(),
    firmProfitConcentrationShare: unitFractionSchema.nullable(),
    fundedNearFloorRiskMultiple: riskMultipleSchema,
    payoutReadyLossFraction: unitFractionSchema.nullable(),
    payoutReadyRiskAboveRungCents: positiveCentsSchema.nullable(),
});

const bankrollSchema = z.object({
    accountsPerSession: accountCountSchema.nullable(),
    dailyAccountCapacity: accountCountSchema.nullable(),
    defaultRoundBudgetCents: positiveCentsSchema.nullable(),
    lossRiskThreshold: z.number().gt(0).max(MAX_LOSS_RISK_THRESHOLD).nullable(),
    objectiveSwitchCents: positiveCentsSchema.nullable(),
    roundGapDays: z.number().int().min(1).max(MAX_DAY_COUNT),
    sessionHoursPerDay: z.number().gt(0).max(MAX_SESSION_HOURS).nullable(),
});

const displaySchema = z.object({
    nextPayoutHighlightDays: z.number().int().min(1).max(MAX_DAY_COUNT),
    riskUnit: z.enum(RiskDisplayUnit),
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

const liveTransferSchema = z.object({
    hazardPerPaidPayoutByFirm: z
        .partialRecord(z.enum(FirmId), openUnitIntervalSchema)
        .readonly(),
});

const plausibilitySchema = z.object({
    strongMaxExpectancyR: expectancyRSchema,
    typicalMaxExpectancyR: expectancyRSchema,
});

const reviewSchema = z.object({
    fundedStaleDays: z.number().int().min(1).max(MAX_DAY_COUNT),
    monthlyPayoutTargetCents: positiveCentsSchema.nullable(),
    targetMonthlyMultiple: z
        .number()
        .positive()
        .max(MAX_TARGET_MULTIPLE)
        .nullable(),
    weekday: z.enum(ReviewWeekday),
});

const samplesSchema = z.object({
    minClosedRounds: sampleMinimumSchema.nullable(),
    minEndedAccounts: sampleMinimumSchema.nullable(),
    minEvalAttempts: sampleMinimumSchema.nullable(),
    minFundedAccounts: sampleMinimumSchema.nullable(),
    minTrades: sampleMinimumSchema.nullable(),
});

const strategySchema = z.object({
    rr: z.number().positive().max(MAX_RR),
    tradesPerDayMax: tradeCountSchema,
    winrate: openUnitIntervalSchema,
});

export const rulebookSchema = z
    .object({
        alerts: alertThresholdsSchema,
        bankroll: bankrollSchema,
        display: displaySchema,
        eval: evalSizingSchema,
        execution: z.object({ maxTradesPerWindow: tradeCountSchema }),
        funded: fundedSizingSchema,
        live: liveSizingSchema,
        liveTransfer: liveTransferSchema,
        payout: payoutSchema,
        plausibility: plausibilitySchema,
        review: reviewSchema,
        samples: samplesSchema,
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
                message: `retained cushion below $${HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS} breaks Hard Rule 2; set allowBelowHardRule2 to keep it`,
                path: ['payout', 'retainedCushionCents'],
            });
        }
        const { strongMaxExpectancyR, typicalMaxExpectancyR } =
            rulebook.plausibility;
        if (typicalMaxExpectancyR > strongMaxExpectancyR) {
            context.addIssue({
                code: 'custom',
                message: `the typical expectancy ceiling (${typicalMaxExpectancyR}R) must not exceed the strong one (${strongMaxExpectancyR}R)`,
                path: ['plausibility', 'typicalMaxExpectancyR'],
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
