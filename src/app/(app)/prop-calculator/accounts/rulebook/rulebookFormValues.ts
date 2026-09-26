import { z } from 'zod';

import { formatUsdCents, usdCents, usdCentsToText } from '~/lib/prop-accounts';
import { DayStopRuleKind } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalSizingMode,
    type FundedStopRule,
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    LadderFractionSource,
    ReviewWeekday,
    RULEBOOK_SCHEMA_VERSION,
    type RulebookParameters,
    rulebookSchema,
    RuleSource,
} from '~/lib/prop-calculator/advisor';

import {
    EntryTextKind,
    parseMoneyText,
} from '../_components/snapshotFieldRules';

export enum FieldKind {
    Count = 'count',
    Decimal = 'decimal',
    Fractions = 'fractions',
    Money = 'money',
    Percent = 'percent',
}

export interface FormIssue {
    readonly message: string;
    readonly path: readonly string[];
}

export interface RulebookDraft {
    readonly candidate: unknown;
    readonly issues: readonly FormIssue[];
}

export type RulebookFormValues = z.infer<typeof rulebookFormTextSchema>;

export type TextFieldName =
    | 'alerts.evalDaysRemainingWarning'
    | 'alerts.evalNearFloorDrawdownFraction'
    | 'alerts.fundedNearFloorRiskMultiple'
    | 'eval.generalDerivation.escalation'
    | 'eval.generalDerivation.firstRungFraction'
    | 'eval.maxRiskDailyCapMultiple'
    | 'eval.mffSearchFractions'
    | 'eval.roundingStepCents'
    | 'execution.maxTradesPerWindow'
    | 'funded.riskCents'
    | 'funded.stopRule.k'
    | 'funded.stopRule.targetCents'
    | 'funded.takeProfitCents'
    | 'funded.tradesPerDayMax'
    | 'live.cushionPercent.postLock'
    | 'live.cushionPercent.preLock'
    | 'payout.requestCents'
    | 'payout.retainedCushionCents'
    | 'review.fundedStaleDays'
    | 'strategy.rr'
    | 'strategy.tradesPerDayMax'
    | 'strategy.winrate';

export interface TextFieldSpec {
    readonly hint: string;
    readonly kind: FieldKind;
    readonly label: string;
    readonly read: (values: RulebookFormValues) => string;
    readonly source: null | RuleSource;
}

export type TextParse =
    | { readonly message: string; readonly ok: false }
    | { readonly ok: true; readonly value: number | readonly number[] };

const PERCENT = 100;
const PERCENT_PRECISION = 12;

const evalFormTextSchema = z.object({
    generalDerivation: z.object({
        escalation: z.string(),
        firstRungFraction: z.string(),
    }),
    ladderFractionSource: z.enum(LadderFractionSource),
    maxRiskDailyCapMultiple: z.string(),
    mffSearchFractions: z.string(),
    mode: z.enum(EvalSizingMode),
    roundingStepCents: z.string(),
});

const fundedFormTextSchema = z.object({
    riskCents: z.string(),
    stopRule: z.object({
        k: z.string(),
        kind: z.enum(DayStopRuleKind),
        targetCents: z.string(),
    }),
    takeProfitCents: z.string(),
    tradesPerDayMax: z.string(),
});

const liveFormTextSchema = z.object({
    cushionPercent: z.object({ postLock: z.string(), preLock: z.string() }),
});

const rulebookFormTextSchema = z.object({
    alerts: z.object({
        evalDaysRemainingWarning: z.string(),
        evalNearFloorDrawdownFraction: z.string(),
        fundedNearFloorRiskMultiple: z.string(),
    }),
    eval: evalFormTextSchema,
    execution: z.object({ maxTradesPerWindow: z.string() }),
    funded: fundedFormTextSchema,
    live: liveFormTextSchema,
    payout: z.object({
        allowBelowHardRule2: z.boolean(),
        requestCents: z.string(),
        retainedCushionCents: z.string(),
    }),
    review: z.object({
        fundedStaleDays: z.string(),
        weekday: z.enum(ReviewWeekday),
    }),
    strategy: z.object({
        rr: z.string(),
        tradesPerDayMax: z.string(),
        winrate: z.string(),
    }),
});

export const TEXT_FIELDS: Readonly<Record<TextFieldName, TextFieldSpec>> = {
    'alerts.evalDaysRemainingWarning': {
        hint: 'Warn when an eval has this many days or fewer left.',
        kind: FieldKind.Count,
        label: 'Eval days remaining warning',
        read: (v) => v.alerts.evalDaysRemainingWarning,
        source: null,
    },
    'alerts.evalNearFloorDrawdownFraction': {
        hint: 'Warn when the eval cushion is below this share of the drawdown.',
        kind: FieldKind.Percent,
        label: 'Eval near-floor warning',
        read: (v) => v.alerts.evalNearFloorDrawdownFraction,
        source: null,
    },
    'alerts.fundedNearFloorRiskMultiple': {
        hint: 'Warn when the funded cushion is below this many funded risks.',
        kind: FieldKind.Decimal,
        label: 'Funded near-floor warning (x risk)',
        read: (v) => v.alerts.fundedNearFloorRiskMultiple,
        source: null,
    },
    'eval.generalDerivation.escalation': {
        hint: 'Each next rung is this multiple of the previous one.',
        kind: FieldKind.Decimal,
        label: 'Rung escalation (x)',
        read: (v) => v.eval.generalDerivation.escalation,
        source: RuleSource.GeneralDerivation,
    },
    'eval.generalDerivation.firstRungFraction': {
        hint: 'Rung 1 risks this share of the day-start cushion.',
        kind: FieldKind.Percent,
        label: 'First rung',
        read: (v) => v.eval.generalDerivation.firstRungFraction,
        source: RuleSource.GeneralDerivation,
    },
    'eval.maxRiskDailyCapMultiple': {
        hint: 'Max-risk mode only: the daily cap is this multiple of the risk. Must be at least the rr.',
        kind: FieldKind.Decimal,
        label: 'Daily cap multiple (x risk)',
        read: (v) => v.eval.maxRiskDailyCapMultiple,
        source: RuleSource.HardRule4,
    },
    'eval.mffSearchFractions': {
        hint: 'MFF search ladder only: rung fractions of the cushion, separated by commas, summing to 1.',
        kind: FieldKind.Fractions,
        label: 'MFF search rung fractions',
        read: (v) => v.eval.mffSearchFractions,
        source: RuleSource.EvalLadder,
    },
    'eval.roundingStepCents': {
        hint: 'Rungs are rounded down to this step.',
        kind: FieldKind.Money,
        label: 'Rung rounding step',
        read: (v) => v.eval.roundingStepCents,
        source: RuleSource.GeneralDerivation,
    },
    'execution.maxTradesPerWindow': {
        hint: 'Trades per trading window per account.',
        kind: FieldKind.Count,
        label: 'Max trades per window',
        read: (v) => v.execution.maxTradesPerWindow,
        source: RuleSource.HardRule6,
    },
    'funded.riskCents': {
        hint: 'Fixed risk per funded trade, not a percentage of the cushion.',
        kind: FieldKind.Money,
        label: 'Funded risk per trade',
        read: (v) => v.funded.riskCents,
        source: RuleSource.HardRule5,
    },
    'funded.stopRule.k': {
        hint: 'Stop the funded day after this many losses.',
        kind: FieldKind.Count,
        label: 'Losses before stopping',
        read: (v) => v.funded.stopRule.k,
        source: RuleSource.HisNumbers,
    },
    'funded.stopRule.targetCents': {
        hint: 'Stop the funded day once it is up this much.',
        kind: FieldKind.Money,
        label: 'Day profit target',
        read: (v) => v.funded.stopRule.targetCents,
        source: RuleSource.HisNumbers,
    },
    'funded.takeProfitCents': {
        hint: 'Take profit per funded trade.',
        kind: FieldKind.Money,
        label: 'Funded take profit',
        read: (v) => v.funded.takeProfitCents,
        source: RuleSource.HardRule5,
    },
    'funded.tradesPerDayMax': {
        hint: 'Most funded trades in one day.',
        kind: FieldKind.Count,
        label: 'Funded trades per day',
        read: (v) => v.funded.tradesPerDayMax,
        source: RuleSource.HisNumbers,
    },
    'live.cushionPercent.postLock': {
        hint: 'Live risk as a share of the cushion once the drawdown has locked.',
        kind: FieldKind.Percent,
        label: 'Live risk after lock',
        read: (v) => v.live.cushionPercent.postLock,
        source: RuleSource.LiveSizing,
    },
    'live.cushionPercent.preLock': {
        hint: 'Live risk as a share of the cushion before the drawdown locks.',
        kind: FieldKind.Percent,
        label: 'Live risk before lock',
        read: (v) => v.live.cushionPercent.preLock,
        source: RuleSource.LiveSizing,
    },
    'payout.requestCents': {
        hint: 'The payout you request. A firm minimum above it wins.',
        kind: FieldKind.Money,
        label: 'Payout request',
        read: (v) => v.payout.requestCents,
        source: RuleSource.PayoutSize,
    },
    'payout.retainedCushionCents': {
        hint: `Cushion left after every payout. At least ${formatUsdCents(usdCents(HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS))} unless the override below is on.`,
        kind: FieldKind.Money,
        label: 'Retained cushion',
        read: (v) => v.payout.retainedCushionCents,
        source: RuleSource.HardRule2,
    },
    'review.fundedStaleDays': {
        hint: 'Funded advice is stale after this many days without a snapshot.',
        kind: FieldKind.Count,
        label: 'Funded snapshot stale after (days)',
        read: (v) => v.review.fundedStaleDays,
        source: RuleSource.ReassessmentCadence,
    },
    'strategy.rr': {
        hint: 'Reward to risk of every trade.',
        kind: FieldKind.Decimal,
        label: 'Reward to risk (rr)',
        read: (v) => v.strategy.rr,
        source: RuleSource.HisNumbers,
    },
    'strategy.tradesPerDayMax': {
        hint: 'Most trades in one day, and the most eval ladder rungs.',
        kind: FieldKind.Count,
        label: 'Trades per day',
        read: (v) => v.strategy.tradesPerDayMax,
        source: RuleSource.HisNumbers,
    },
    'strategy.winrate': {
        hint: 'Your win rate.',
        kind: FieldKind.Percent,
        label: 'Win rate',
        read: (v) => v.strategy.winrate,
        source: RuleSource.HisNumbers,
    },
};

const FORM_FIELD_NAMES: readonly string[] = [
    ...Object.keys(TEXT_FIELDS),
    'eval.ladderFractionSource',
    'eval.mode',
    'funded.stopRule.kind',
    'payout.allowBelowHardRule2',
    'review.weekday',
];

export const DEFAULT_FORM_VALUES = rulebookToFormValues(DEFAULT_RULEBOOK);

export const rulebookFormSchema = rulebookFormTextSchema.transform(
    (values, context): RulebookParameters => {
        const draft = readRulebookDraft(values);
        const parsed =
            draft.issues.length === 0
                ? rulebookSchema.safeParse(draft.candidate)
                : null;
        if (parsed?.success === true) return parsed.data;
        const issues =
            parsed === null
                ? draft.issues
                : parsed.error.issues.map((issue) => ({
                      message: issue.message,
                      path: formPathOf(issue.path),
                  }));
        for (const issue of issues) {
            context.addIssue({
                code: 'custom',
                message: issue.message,
                path: [...issue.path],
            });
        }
        return z.NEVER;
    },
);

export function comparableText(kind: FieldKind, text: string): null | string {
    const parsed = parseText(kind, text);
    return parsed.ok ? JSON.stringify(parsed.value) : null;
}

export function formPathOf(path: readonly PropertyKey[]): string[] {
    const segments: string[] = [];
    for (const segment of path) {
        if (typeof segment !== 'string') break;
        segments.push(segment);
    }
    const joined = segments.join('.');
    if (FORM_FIELD_NAMES.includes(joined)) return segments;
    const nested = FORM_FIELD_NAMES.find((name) =>
        name.startsWith(`${joined}.`),
    );
    return nested === undefined || joined === '' ? ['root'] : nested.split('.');
}

export function parseText(kind: FieldKind, text: string): TextParse {
    const trimmed = text.trim();
    switch (kind) {
        case FieldKind.Count: {
            return /^\d+$/.test(trimmed)
                ? { ok: true, value: Number(trimmed) }
                : { message: 'Enter a whole number', ok: false };
        }
        case FieldKind.Decimal: {
            return decimalOf(trimmed, 'Enter a number');
        }
        case FieldKind.Fractions: {
            const parts = trimmed.split(',').map((part) => part.trim());
            const values = parts.map(Number);
            return parts.every((part) => part !== '') &&
                values.every((value) => Number.isFinite(value))
                ? { ok: true, value: values }
                : {
                      message:
                          'Enter fractions separated by commas, for example 0.2, 0.3, 0.4, 0.1',
                      ok: false,
                  };
        }
        case FieldKind.Money: {
            return moneyOf(trimmed);
        }
        case FieldKind.Percent: {
            const percent = decimalOf(trimmed, 'Enter a percentage');
            return percent.ok && typeof percent.value === 'number'
                ? { ok: true, value: percent.value / PERCENT }
                : percent;
        }
    }
}

export function readRulebookDraft(values: RulebookFormValues): RulebookDraft {
    const issues: FormIssue[] = [];
    const numberAt = (name: TextFieldName): number => {
        const parsed = parseText(
            TEXT_FIELDS[name].kind,
            TEXT_FIELDS[name].read(values),
        );
        if (parsed.ok && typeof parsed.value === 'number') {
            return parsed.value;
        }
        issues.push({
            message: parsed.ok ? 'Enter a single value' : parsed.message,
            path: name.split('.'),
        });
        return NaN;
    };
    const fractions = parseText(
        FieldKind.Fractions,
        values.eval.mffSearchFractions,
    );
    if (!fractions.ok || typeof fractions.value === 'number') {
        issues.push({
            message: fractions.ok
                ? 'Enter every rung fraction'
                : fractions.message,
            path: ['eval', 'mffSearchFractions'],
        });
    }
    return {
        candidate: {
            alerts: {
                evalDaysRemainingWarning: numberAt(
                    'alerts.evalDaysRemainingWarning',
                ),
                evalNearFloorDrawdownFraction: numberAt(
                    'alerts.evalNearFloorDrawdownFraction',
                ),
                fundedNearFloorRiskMultiple: numberAt(
                    'alerts.fundedNearFloorRiskMultiple',
                ),
            },
            eval: {
                generalDerivation: {
                    escalation: numberAt('eval.generalDerivation.escalation'),
                    firstRungFraction: numberAt(
                        'eval.generalDerivation.firstRungFraction',
                    ),
                },
                ladderFractionSource: values.eval.ladderFractionSource,
                maxRiskDailyCapMultiple: numberAt(
                    'eval.maxRiskDailyCapMultiple',
                ),
                mffSearchFractions:
                    fractions.ok && typeof fractions.value !== 'number'
                        ? fractions.value
                        : [],
                mode: values.eval.mode,
                roundingStepCents: numberAt('eval.roundingStepCents'),
            },
            execution: {
                maxTradesPerWindow: numberAt('execution.maxTradesPerWindow'),
            },
            funded: {
                riskCents: numberAt('funded.riskCents'),
                stopRule: stopRuleFrom(values.funded.stopRule.kind, numberAt),
                takeProfitCents: numberAt('funded.takeProfitCents'),
                tradesPerDayMax: numberAt('funded.tradesPerDayMax'),
            },
            live: {
                cushionPercent: {
                    postLock: numberAt('live.cushionPercent.postLock'),
                    preLock: numberAt('live.cushionPercent.preLock'),
                },
            },
            payout: {
                allowBelowHardRule2: values.payout.allowBelowHardRule2,
                requestCents: numberAt('payout.requestCents'),
                retainedCushionCents: numberAt('payout.retainedCushionCents'),
            },
            review: {
                fundedStaleDays: numberAt('review.fundedStaleDays'),
                weekday: values.review.weekday,
            },
            schemaVersion: RULEBOOK_SCHEMA_VERSION,
            strategy: {
                rr: numberAt('strategy.rr'),
                tradesPerDayMax: numberAt('strategy.tradesPerDayMax'),
                winrate: numberAt('strategy.winrate'),
            },
        },
        issues,
    };
}

export function rulebookToFormValues(
    rulebook: RulebookParameters,
): RulebookFormValues {
    return {
        alerts: {
            evalDaysRemainingWarning: String(
                rulebook.alerts.evalDaysRemainingWarning,
            ),
            evalNearFloorDrawdownFraction: percentText(
                rulebook.alerts.evalNearFloorDrawdownFraction,
            ),
            fundedNearFloorRiskMultiple: String(
                rulebook.alerts.fundedNearFloorRiskMultiple,
            ),
        },
        eval: {
            generalDerivation: {
                escalation: String(rulebook.eval.generalDerivation.escalation),
                firstRungFraction: percentText(
                    rulebook.eval.generalDerivation.firstRungFraction,
                ),
            },
            ladderFractionSource: rulebook.eval.ladderFractionSource,
            maxRiskDailyCapMultiple: String(
                rulebook.eval.maxRiskDailyCapMultiple,
            ),
            mffSearchFractions: rulebook.eval.mffSearchFractions.join(', '),
            mode: rulebook.eval.mode,
            roundingStepCents: centsText(rulebook.eval.roundingStepCents),
        },
        execution: {
            maxTradesPerWindow: String(rulebook.execution.maxTradesPerWindow),
        },
        funded: {
            riskCents: centsText(rulebook.funded.riskCents),
            stopRule: stopRuleText(rulebook.funded.stopRule),
            takeProfitCents: centsText(rulebook.funded.takeProfitCents),
            tradesPerDayMax: String(rulebook.funded.tradesPerDayMax),
        },
        live: {
            cushionPercent: {
                postLock: percentText(rulebook.live.cushionPercent.postLock),
                preLock: percentText(rulebook.live.cushionPercent.preLock),
            },
        },
        payout: {
            allowBelowHardRule2: rulebook.payout.allowBelowHardRule2,
            requestCents: centsText(rulebook.payout.requestCents),
            retainedCushionCents: centsText(
                rulebook.payout.retainedCushionCents,
            ),
        },
        review: {
            fundedStaleDays: String(rulebook.review.fundedStaleDays),
            weekday: rulebook.review.weekday,
        },
        strategy: {
            rr: String(rulebook.strategy.rr),
            tradesPerDayMax: String(rulebook.strategy.tradesPerDayMax),
            winrate: percentText(rulebook.strategy.winrate),
        },
    };
}

function centsText(cents: number): string {
    return usdCentsToText(usdCents(cents));
}

function decimalOf(trimmed: string, message: string): TextParse {
    const value = Number(trimmed);
    return trimmed !== '' && Number.isFinite(value)
        ? { ok: true, value }
        : { message, ok: false };
}

function moneyOf(trimmed: string): TextParse {
    const money = parseMoneyText(trimmed);
    switch (money.kind) {
        case EntryTextKind.Empty: {
            return { message: 'Enter a dollar amount', ok: false };
        }
        case EntryTextKind.Invalid: {
            return { message: money.message, ok: false };
        }
        case EntryTextKind.Valid: {
            return { ok: true, value: money.cents };
        }
    }
}

function percentText(fraction: number): string {
    return String(Number((fraction * PERCENT).toPrecision(PERCENT_PRECISION)));
}

function stopRuleFrom(
    kind: DayStopRuleKind,
    numberAt: (name: TextFieldName) => number,
): FundedStopRule {
    switch (kind) {
        case DayStopRuleKind.AfterKLosses: {
            return { k: numberAt('funded.stopRule.k'), kind };
        }
        case DayStopRuleKind.AfterTarget: {
            return {
                kind,
                targetCents: numberAt('funded.stopRule.targetCents'),
            };
        }
        case DayStopRuleKind.DayGreen:
        case DayStopRuleKind.FirstWin:
        case DayStopRuleKind.None: {
            return { kind };
        }
    }
}

function stopRuleText(
    rule: FundedStopRule,
): RulebookFormValues['funded']['stopRule'] {
    switch (rule.kind) {
        case DayStopRuleKind.AfterKLosses: {
            return { k: String(rule.k), kind: rule.kind, targetCents: '' };
        }
        case DayStopRuleKind.AfterTarget: {
            return {
                k: '',
                kind: rule.kind,
                targetCents: centsText(rule.targetCents),
            };
        }
        case DayStopRuleKind.DayGreen:
        case DayStopRuleKind.FirstWin:
        case DayStopRuleKind.None: {
            return { k: '', kind: rule.kind, targetCents: '' };
        }
    }
}
