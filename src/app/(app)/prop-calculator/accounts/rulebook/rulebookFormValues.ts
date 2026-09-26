import { z } from 'zod';

import {
    EntryTextKind,
    formatUsdCents,
    parseMoneyText,
    usdCents,
    usdCentsToText,
} from '~/lib/prop-accounts';
import { DayStopRuleKind, findFirm, FirmId } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalSizingMode,
    type FundedStopRule,
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    LadderFractionSource,
    ReviewWeekday,
    RiskDisplayUnit,
    RULEBOOK_SCHEMA_VERSION,
    type RulebookParameters,
    rulebookSchema,
    RuleSource,
} from '~/lib/prop-calculator/advisor';

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

export type HazardFieldName =
    `liveTransfer.hazardPerPaidPayoutByFirm.${FirmId}`;

export interface RulebookDraft {
    readonly candidate: unknown;
    readonly issues: readonly FormIssue[];
}

export type RulebookFormValues = z.infer<typeof rulebookFormTextSchema>;

export type TextFieldName =
    | 'alerts.dayLossBankrollFraction'
    | 'alerts.evalDaysRemainingWarning'
    | 'alerts.evalNearFloorDrawdownFraction'
    | 'alerts.firmProfitConcentrationCount'
    | 'alerts.firmProfitConcentrationShare'
    | 'alerts.fundedNearFloorRiskMultiple'
    | 'alerts.payoutReadyLossFraction'
    | 'alerts.payoutReadyRiskAboveRungCents'
    | 'bankroll.accountsPerSession'
    | 'bankroll.dailyAccountCapacity'
    | 'bankroll.defaultRoundBudgetCents'
    | 'bankroll.lossRiskThreshold'
    | 'bankroll.objectiveSwitchCents'
    | 'bankroll.roundGapDays'
    | 'bankroll.sessionHoursPerDay'
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
    | 'plausibility.strongMaxExpectancyR'
    | 'plausibility.typicalMaxExpectancyR'
    | 'review.fundedStaleDays'
    | 'review.monthlyPayoutTargetCents'
    | 'review.targetMonthlyMultiple'
    | 'samples.minClosedRounds'
    | 'samples.minEvalAttempts'
    | 'samples.minFundedAccounts'
    | 'samples.minTrades'
    | 'strategy.rr'
    | 'strategy.tradesPerDayMax'
    | 'strategy.winrate';

export interface TextFieldSpec {
    readonly hint: string;
    readonly isOptional: boolean;
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
const VIDEO_AUTHOR_CHOICE = "the video author's choice, not a default";

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

const bankrollFormTextSchema = z.object({
    accountsPerSession: z.string(),
    dailyAccountCapacity: z.string(),
    defaultRoundBudgetCents: z.string(),
    lossRiskThreshold: z.string(),
    objectiveSwitchCents: z.string(),
    roundGapDays: z.string(),
    sessionHoursPerDay: z.string(),
});

const FIRM_ID_TEXTS: readonly `${FirmId}`[] = Object.values(FirmId);

const hazardFormTextSchema = z.record(z.enum(FIRM_ID_TEXTS), z.string());

const rulebookFormTextSchema = z.object({
    alerts: z.object({
        dayLossBankrollFraction: z.string(),
        evalDaysRemainingWarning: z.string(),
        evalNearFloorDrawdownFraction: z.string(),
        firmProfitConcentrationCount: z.string(),
        firmProfitConcentrationShare: z.string(),
        fundedNearFloorRiskMultiple: z.string(),
        payoutReadyLossFraction: z.string(),
        payoutReadyRiskAboveRungCents: z.string(),
    }),
    bankroll: bankrollFormTextSchema,
    display: z.object({ riskUnit: z.enum(RiskDisplayUnit) }),
    eval: evalFormTextSchema,
    execution: z.object({ maxTradesPerWindow: z.string() }),
    funded: fundedFormTextSchema,
    live: liveFormTextSchema,
    liveTransfer: z.object({
        hazardPerPaidPayoutByFirm: hazardFormTextSchema,
    }),
    payout: z.object({
        allowBelowHardRule2: z.boolean(),
        requestCents: z.string(),
        retainedCushionCents: z.string(),
    }),
    plausibility: z.object({
        strongMaxExpectancyR: z.string(),
        typicalMaxExpectancyR: z.string(),
    }),
    review: z.object({
        fundedStaleDays: z.string(),
        monthlyPayoutTargetCents: z.string(),
        targetMonthlyMultiple: z.string(),
        weekday: z.enum(ReviewWeekday),
    }),
    samples: z.object({
        minClosedRounds: z.string(),
        minEvalAttempts: z.string(),
        minFundedAccounts: z.string(),
        minTrades: z.string(),
    }),
    strategy: z.object({
        rr: z.string(),
        tradesPerDayMax: z.string(),
        winrate: z.string(),
    }),
});

export const TEXT_FIELDS: Readonly<Record<TextFieldName, TextFieldSpec>> = {
    'alerts.dayLossBankrollFraction': {
        hint: 'Warn when one day loses more than this share of your available bankroll.',
        isOptional: true,
        kind: FieldKind.Percent,
        label: 'Large day loss warning',
        read: (v) => v.alerts.dayLossBankrollFraction,
        source: null,
    },
    'alerts.evalDaysRemainingWarning': {
        hint: 'Warn when an eval has this many days or fewer left.',
        isOptional: false,
        kind: FieldKind.Count,
        label: 'Eval days remaining warning',
        read: (v) => v.alerts.evalDaysRemainingWarning,
        source: null,
    },
    'alerts.evalNearFloorDrawdownFraction': {
        hint: 'Warn when the eval cushion is below this share of the drawdown.',
        isOptional: false,
        kind: FieldKind.Percent,
        label: 'Eval near-floor warning',
        read: (v) => v.alerts.evalNearFloorDrawdownFraction,
        source: null,
    },
    'alerts.firmProfitConcentrationCount': {
        hint: 'Warn when this many funded accounts in profit sit at one firm. No firm publishes a threshold.',
        isOptional: true,
        kind: FieldKind.Count,
        label: 'Firm concentration warning (accounts)',
        read: (v) => v.alerts.firmProfitConcentrationCount,
        source: null,
    },
    'alerts.firmProfitConcentrationShare': {
        hint: 'Warn when one firm holds this share of your withdrawable profit. No firm publishes a threshold.',
        isOptional: true,
        kind: FieldKind.Percent,
        label: 'Firm concentration warning (share)',
        read: (v) => v.alerts.firmProfitConcentrationShare,
        source: null,
    },
    'alerts.fundedNearFloorRiskMultiple': {
        hint: 'Warn when the funded cushion is below this many funded risks.',
        isOptional: false,
        kind: FieldKind.Decimal,
        label: 'Funded near-floor warning (x risk)',
        read: (v) => v.alerts.fundedNearFloorRiskMultiple,
        source: null,
    },
    'alerts.payoutReadyLossFraction': {
        hint: 'Critical alert when a payout-ready account loses more than this share of its withdrawable.',
        isOptional: true,
        kind: FieldKind.Percent,
        label: 'Payout-ready drop alert',
        read: (v) => v.alerts.payoutReadyLossFraction,
        source: null,
    },
    'alerts.payoutReadyRiskAboveRungCents': {
        hint: 'Warn when a payout-ready account risks more than its documented rung by over this amount.',
        isOptional: true,
        kind: FieldKind.Money,
        label: 'Payout-ready risk above rung warning',
        read: (v) => v.alerts.payoutReadyRiskAboveRungCents,
        source: null,
    },
    'bankroll.accountsPerSession': {
        hint: 'Accounts you trade side by side in one session, for net per screen hour.',
        isOptional: true,
        kind: FieldKind.Count,
        label: 'Accounts per session',
        read: (v) => v.bankroll.accountsPerSession,
        source: null,
    },
    'bankroll.dailyAccountCapacity': {
        hint: 'Most accounts you can trade in a day. A copy group counts once.',
        isOptional: true,
        kind: FieldKind.Count,
        label: 'Accounts you can trade per day',
        read: (v) => v.bankroll.dailyAccountCapacity,
        source: null,
    },
    'bankroll.defaultRoundBudgetCents': {
        hint: 'The budget a new round of purchases starts with.',
        isOptional: true,
        kind: FieldKind.Money,
        label: 'Default round budget',
        read: (v) => v.bankroll.defaultRoundBudgetCents,
        source: null,
    },
    'bankroll.lossRiskThreshold': {
        hint: `Highest chance you accept that a batch of attempts pays back less than it cost. The video author uses 0.5% (${VIDEO_AUTHOR_CHOICE}).`,
        isOptional: true,
        kind: FieldKind.Percent,
        label: 'Loss-risk threshold',
        read: (v) => v.bankroll.lossRiskThreshold,
        source: null,
    },
    'bankroll.objectiveSwitchCents': {
        hint: 'Below this available bankroll, the plan to buy next is ranked by the lowest loss risk. Eval rungs, funded risk and advice headlines never change.',
        isOptional: true,
        kind: FieldKind.Money,
        label: 'Rank by loss risk below',
        read: (v) => v.bankroll.objectiveSwitchCents,
        source: null,
    },
    'bankroll.roundGapDays': {
        hint: 'Purchases this many days apart are suggested as separate rounds.',
        isOptional: false,
        kind: FieldKind.Count,
        label: 'Days between rounds',
        read: (v) => v.bankroll.roundGapDays,
        source: null,
    },
    'bankroll.sessionHoursPerDay': {
        hint: 'Hours you spend trading in a day, for net per screen hour.',
        isOptional: true,
        kind: FieldKind.Decimal,
        label: 'Screen hours per day',
        read: (v) => v.bankroll.sessionHoursPerDay,
        source: null,
    },
    'eval.generalDerivation.escalation': {
        hint: 'Each next rung is this multiple of the previous one.',
        isOptional: false,
        kind: FieldKind.Decimal,
        label: 'Rung escalation (x)',
        read: (v) => v.eval.generalDerivation.escalation,
        source: RuleSource.GeneralDerivation,
    },
    'eval.generalDerivation.firstRungFraction': {
        hint: 'Rung 1 risks this share of the day-start cushion.',
        isOptional: false,
        kind: FieldKind.Percent,
        label: 'First rung',
        read: (v) => v.eval.generalDerivation.firstRungFraction,
        source: RuleSource.GeneralDerivation,
    },
    'eval.maxRiskDailyCapMultiple': {
        hint: 'Max-risk mode only: the daily cap is this multiple of the risk. Must be at least the rr.',
        isOptional: false,
        kind: FieldKind.Decimal,
        label: 'Daily cap multiple (x risk)',
        read: (v) => v.eval.maxRiskDailyCapMultiple,
        source: RuleSource.HardRule4,
    },
    'eval.mffSearchFractions': {
        hint: 'MFF search ladder only: rung fractions of the cushion, separated by commas, summing to 1.',
        isOptional: false,
        kind: FieldKind.Fractions,
        label: 'MFF search rung fractions',
        read: (v) => v.eval.mffSearchFractions,
        source: RuleSource.EvalLadder,
    },
    'eval.roundingStepCents': {
        hint: 'Rungs are rounded down to this step.',
        isOptional: false,
        kind: FieldKind.Money,
        label: 'Rung rounding step',
        read: (v) => v.eval.roundingStepCents,
        source: RuleSource.GeneralDerivation,
    },
    'execution.maxTradesPerWindow': {
        hint: 'Trades per trading window per account.',
        isOptional: false,
        kind: FieldKind.Count,
        label: 'Max trades per window',
        read: (v) => v.execution.maxTradesPerWindow,
        source: RuleSource.HardRule6,
    },
    'funded.riskCents': {
        hint: 'Fixed risk per funded trade, not a percentage of the cushion.',
        isOptional: false,
        kind: FieldKind.Money,
        label: 'Funded risk per trade',
        read: (v) => v.funded.riskCents,
        source: RuleSource.HardRule5,
    },
    'funded.stopRule.k': {
        hint: 'Stop the funded day after this many losses.',
        isOptional: false,
        kind: FieldKind.Count,
        label: 'Losses before stopping',
        read: (v) => v.funded.stopRule.k,
        source: RuleSource.HisNumbers,
    },
    'funded.stopRule.targetCents': {
        hint: 'Stop the funded day once it is up this much.',
        isOptional: false,
        kind: FieldKind.Money,
        label: 'Day profit target',
        read: (v) => v.funded.stopRule.targetCents,
        source: RuleSource.HisNumbers,
    },
    'funded.takeProfitCents': {
        hint: 'Take profit per funded trade.',
        isOptional: false,
        kind: FieldKind.Money,
        label: 'Funded take profit',
        read: (v) => v.funded.takeProfitCents,
        source: RuleSource.HardRule5,
    },
    'funded.tradesPerDayMax': {
        hint: 'Most funded trades in one day.',
        isOptional: false,
        kind: FieldKind.Count,
        label: 'Funded trades per day',
        read: (v) => v.funded.tradesPerDayMax,
        source: RuleSource.HisNumbers,
    },
    'live.cushionPercent.postLock': {
        hint: 'Live risk as a share of the cushion once the drawdown has locked.',
        isOptional: false,
        kind: FieldKind.Percent,
        label: 'Live risk after lock',
        read: (v) => v.live.cushionPercent.postLock,
        source: RuleSource.LiveSizing,
    },
    'live.cushionPercent.preLock': {
        hint: 'Live risk as a share of the cushion before the drawdown locks.',
        isOptional: false,
        kind: FieldKind.Percent,
        label: 'Live risk before lock',
        read: (v) => v.live.cushionPercent.preLock,
        source: RuleSource.LiveSizing,
    },
    'payout.requestCents': {
        hint: 'The payout you request. A firm minimum above it wins.',
        isOptional: false,
        kind: FieldKind.Money,
        label: 'Payout request',
        read: (v) => v.payout.requestCents,
        source: RuleSource.PayoutSize,
    },
    'payout.retainedCushionCents': {
        hint: `Cushion left after every payout. At least ${formatUsdCents(usdCents(HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS))} unless the override below is on.`,
        isOptional: false,
        kind: FieldKind.Money,
        label: 'Retained cushion',
        read: (v) => v.payout.retainedCushionCents,
        source: RuleSource.HardRule2,
    },
    'plausibility.strongMaxExpectancyR': {
        hint: 'Expectancy per trade up to this is called strong; above it, implausible. 70% at 1:1 is 0.4R.',
        isOptional: false,
        kind: FieldKind.Decimal,
        label: 'Strong edge up to (R per trade)',
        read: (v) => v.plausibility.strongMaxExpectancyR,
        source: null,
    },
    'plausibility.typicalMaxExpectancyR': {
        hint: 'Expectancy per trade up to this is called typical. 40% at 1:2 is 0.2R.',
        isOptional: false,
        kind: FieldKind.Decimal,
        label: 'Typical edge up to (R per trade)',
        read: (v) => v.plausibility.typicalMaxExpectancyR,
        source: null,
    },
    'review.fundedStaleDays': {
        hint: 'Funded advice is stale after this many days without a snapshot.',
        isOptional: false,
        kind: FieldKind.Count,
        label: 'Funded snapshot stale after (days)',
        read: (v) => v.review.fundedStaleDays,
        source: RuleSource.ReassessmentCadence,
    },
    'review.monthlyPayoutTargetCents': {
        hint: 'Drawn as a target line on the monthly statement.',
        isOptional: true,
        kind: FieldKind.Money,
        label: 'Monthly payout target',
        read: (v) => v.review.monthlyPayoutTargetCents,
        source: null,
    },
    'review.targetMonthlyMultiple': {
        hint: 'Monthly payouts divided by monthly spend that you aim for.',
        isOptional: true,
        kind: FieldKind.Decimal,
        label: 'Target monthly multiple (x spend)',
        read: (v) => v.review.targetMonthlyMultiple,
        source: null,
    },
    'samples.minClosedRounds': {
        hint: 'Closed purchase rounds before round results are called adequate.',
        isOptional: true,
        kind: FieldKind.Count,
        label: 'Closed rounds before a rate is adequate',
        read: (v) => v.samples.minClosedRounds,
        source: null,
    },
    'samples.minEvalAttempts': {
        hint: `Ended eval attempts before the pass rate is called adequate. The video author uses 50 (${VIDEO_AUTHOR_CHOICE}).`,
        isOptional: true,
        kind: FieldKind.Count,
        label: 'Eval attempts before a rate is adequate',
        read: (v) => v.samples.minEvalAttempts,
        source: null,
    },
    'samples.minFundedAccounts': {
        hint: `Funded accounts before the payout rate is called adequate. The video author uses 50 (${VIDEO_AUTHOR_CHOICE}).`,
        isOptional: true,
        kind: FieldKind.Count,
        label: 'Funded accounts before a rate is adequate',
        read: (v) => v.samples.minFundedAccounts,
        source: null,
    },
    'samples.minTrades': {
        hint: 'Journal trades before the measured win rate is called adequate.',
        isOptional: true,
        kind: FieldKind.Count,
        label: 'Trades before a rate is adequate',
        read: (v) => v.samples.minTrades,
        source: null,
    },
    'strategy.rr': {
        hint: 'Reward to risk of every trade.',
        isOptional: false,
        kind: FieldKind.Decimal,
        label: 'Reward to risk (rr)',
        read: (v) => v.strategy.rr,
        source: RuleSource.HisNumbers,
    },
    'strategy.tradesPerDayMax': {
        hint: 'Most trades in one day, and the most eval ladder rungs.',
        isOptional: false,
        kind: FieldKind.Count,
        label: 'Trades per day',
        read: (v) => v.strategy.tradesPerDayMax,
        source: RuleSource.HisNumbers,
    },
    'strategy.winrate': {
        hint: 'Your win rate.',
        isOptional: false,
        kind: FieldKind.Percent,
        label: 'Win rate',
        read: (v) => v.strategy.winrate,
        source: RuleSource.HisNumbers,
    },
};

const FORM_FIELD_NAMES: readonly string[] = [
    ...Object.keys(TEXT_FIELDS),
    ...Object.values(FirmId).map((firmId) => hazardFieldName(firmId)),
    'display.riskUnit',
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
                : parsed.error.issues.map((issue) => {
                      const path = formPathOf(issue.path);
                      return { message: formMessageOf(issue, path), path };
                  });
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

export function hazardFieldName(firmId: FirmId): HazardFieldName {
    return `liveTransfer.hazardPerPaidPayoutByFirm.${firmId}`;
}

export function hazardFieldSpec(firmId: FirmId): TextFieldSpec {
    return {
        hint: 'Chance per paid payout that this firm moves the account to live.',
        isOptional: true,
        kind: FieldKind.Percent,
        label: findFirm(firmId)?.displayName ?? firmId,
        read: (v) => v.liveTransfer.hazardPerPaidPayoutByFirm[firmId],
        source: null,
    };
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
    const numberOf = (spec: TextFieldSpec, path: readonly string[]): number => {
        const parsed = parseText(spec.kind, spec.read(values));
        if (parsed.ok && typeof parsed.value === 'number') {
            return parsed.value;
        }
        issues.push({
            message: parsed.ok ? 'Enter a single value' : parsed.message,
            path,
        });
        return NaN;
    };
    const numberAt = (name: TextFieldName): number =>
        numberOf(TEXT_FIELDS[name], name.split('.'));
    const optionalAt = (name: TextFieldName): null | number =>
        isBlank(TEXT_FIELDS[name].read(values)) ? null : numberAt(name);
    const hazards: Partial<Record<FirmId, number>> = {};
    for (const firmId of Object.values(FirmId)) {
        const spec = hazardFieldSpec(firmId);
        if (isBlank(spec.read(values))) continue;
        hazards[firmId] = numberOf(spec, hazardFieldName(firmId).split('.'));
    }
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
                dayLossBankrollFraction: optionalAt(
                    'alerts.dayLossBankrollFraction',
                ),
                evalDaysRemainingWarning: numberAt(
                    'alerts.evalDaysRemainingWarning',
                ),
                evalNearFloorDrawdownFraction: numberAt(
                    'alerts.evalNearFloorDrawdownFraction',
                ),
                firmProfitConcentrationCount: optionalAt(
                    'alerts.firmProfitConcentrationCount',
                ),
                firmProfitConcentrationShare: optionalAt(
                    'alerts.firmProfitConcentrationShare',
                ),
                fundedNearFloorRiskMultiple: numberAt(
                    'alerts.fundedNearFloorRiskMultiple',
                ),
                payoutReadyLossFraction: optionalAt(
                    'alerts.payoutReadyLossFraction',
                ),
                payoutReadyRiskAboveRungCents: optionalAt(
                    'alerts.payoutReadyRiskAboveRungCents',
                ),
            },
            bankroll: {
                accountsPerSession: optionalAt('bankroll.accountsPerSession'),
                dailyAccountCapacity: optionalAt(
                    'bankroll.dailyAccountCapacity',
                ),
                defaultRoundBudgetCents: optionalAt(
                    'bankroll.defaultRoundBudgetCents',
                ),
                lossRiskThreshold: optionalAt('bankroll.lossRiskThreshold'),
                objectiveSwitchCents: optionalAt(
                    'bankroll.objectiveSwitchCents',
                ),
                roundGapDays: numberAt('bankroll.roundGapDays'),
                sessionHoursPerDay: optionalAt('bankroll.sessionHoursPerDay'),
            },
            display: { riskUnit: values.display.riskUnit },
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
            liveTransfer: { hazardPerPaidPayoutByFirm: hazards },
            payout: {
                allowBelowHardRule2: values.payout.allowBelowHardRule2,
                requestCents: numberAt('payout.requestCents'),
                retainedCushionCents: numberAt('payout.retainedCushionCents'),
            },
            plausibility: {
                strongMaxExpectancyR: numberAt(
                    'plausibility.strongMaxExpectancyR',
                ),
                typicalMaxExpectancyR: numberAt(
                    'plausibility.typicalMaxExpectancyR',
                ),
            },
            review: {
                fundedStaleDays: numberAt('review.fundedStaleDays'),
                monthlyPayoutTargetCents: optionalAt(
                    'review.monthlyPayoutTargetCents',
                ),
                targetMonthlyMultiple: optionalAt(
                    'review.targetMonthlyMultiple',
                ),
                weekday: values.review.weekday,
            },
            samples: {
                minClosedRounds: optionalAt('samples.minClosedRounds'),
                minEvalAttempts: optionalAt('samples.minEvalAttempts'),
                minFundedAccounts: optionalAt('samples.minFundedAccounts'),
                minTrades: optionalAt('samples.minTrades'),
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
    const { alerts, bankroll, review, samples } = rulebook;
    return {
        alerts: {
            dayLossBankrollFraction: optionalText(
                alerts.dayLossBankrollFraction,
                percentText,
            ),
            evalDaysRemainingWarning: String(alerts.evalDaysRemainingWarning),
            evalNearFloorDrawdownFraction: percentText(
                alerts.evalNearFloorDrawdownFraction,
            ),
            firmProfitConcentrationCount: optionalText(
                alerts.firmProfitConcentrationCount,
                String,
            ),
            firmProfitConcentrationShare: optionalText(
                alerts.firmProfitConcentrationShare,
                percentText,
            ),
            fundedNearFloorRiskMultiple: String(
                alerts.fundedNearFloorRiskMultiple,
            ),
            payoutReadyLossFraction: optionalText(
                alerts.payoutReadyLossFraction,
                percentText,
            ),
            payoutReadyRiskAboveRungCents: optionalText(
                alerts.payoutReadyRiskAboveRungCents,
                centsText,
            ),
        },
        bankroll: {
            accountsPerSession: optionalText(
                bankroll.accountsPerSession,
                String,
            ),
            dailyAccountCapacity: optionalText(
                bankroll.dailyAccountCapacity,
                String,
            ),
            defaultRoundBudgetCents: optionalText(
                bankroll.defaultRoundBudgetCents,
                centsText,
            ),
            lossRiskThreshold: optionalText(
                bankroll.lossRiskThreshold,
                percentText,
            ),
            objectiveSwitchCents: optionalText(
                bankroll.objectiveSwitchCents,
                centsText,
            ),
            roundGapDays: String(bankroll.roundGapDays),
            sessionHoursPerDay: optionalText(
                bankroll.sessionHoursPerDay,
                String,
            ),
        },
        display: { riskUnit: rulebook.display.riskUnit },
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
        liveTransfer: {
            hazardPerPaidPayoutByFirm: hazardFormTextSchema.parse(
                Object.fromEntries(
                    Object.values(FirmId).map((firmId) => [
                        firmId,
                        optionalText(
                            rulebook.liveTransfer.hazardPerPaidPayoutByFirm[
                                firmId
                            ],
                            percentText,
                        ),
                    ]),
                ),
            ),
        },
        payout: {
            allowBelowHardRule2: rulebook.payout.allowBelowHardRule2,
            requestCents: centsText(rulebook.payout.requestCents),
            retainedCushionCents: centsText(
                rulebook.payout.retainedCushionCents,
            ),
        },
        plausibility: {
            strongMaxExpectancyR: String(
                rulebook.plausibility.strongMaxExpectancyR,
            ),
            typicalMaxExpectancyR: String(
                rulebook.plausibility.typicalMaxExpectancyR,
            ),
        },
        review: {
            fundedStaleDays: String(review.fundedStaleDays),
            monthlyPayoutTargetCents: optionalText(
                review.monthlyPayoutTargetCents,
                centsText,
            ),
            targetMonthlyMultiple: optionalText(
                review.targetMonthlyMultiple,
                String,
            ),
            weekday: review.weekday,
        },
        samples: {
            minClosedRounds: optionalText(samples.minClosedRounds, String),
            minEvalAttempts: optionalText(samples.minEvalAttempts, String),
            minFundedAccounts: optionalText(samples.minFundedAccounts, String),
            minTrades: optionalText(samples.minTrades, String),
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

function formMessageOf(
    issue: z.core.$ZodIssue,
    path: readonly string[],
): string {
    if (specAt(path.join('.'))?.kind !== FieldKind.Percent) {
        return issue.message;
    }
    if (issue.code === 'too_big') {
        const bound = percentText(Number(issue.maximum));
        return issue.inclusive === true
            ? `Enter a percentage of at most ${bound}%`
            : `Enter a percentage below ${bound}%`;
    }
    if (issue.code === 'too_small') {
        const bound = percentText(Number(issue.minimum));
        return issue.inclusive === true
            ? `Enter a percentage of at least ${bound}%`
            : `Enter a percentage above ${bound}%`;
    }
    return issue.message;
}

function isBlank(text: string): boolean {
    return text.trim() === '';
}

function isTextFieldName(name: string): name is TextFieldName {
    return Object.hasOwn(TEXT_FIELDS, name);
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

function optionalText(
    value: null | number | undefined,
    toText: (present: number) => string,
): string {
    return value === null || value === undefined ? '' : toText(value);
}

function percentText(fraction: number): string {
    return String(Number((fraction * PERCENT).toPrecision(PERCENT_PRECISION)));
}

function specAt(name: string): TextFieldSpec | undefined {
    if (isTextFieldName(name)) return TEXT_FIELDS[name];
    const firmId = Object.values(FirmId).find(
        (candidate) => hazardFieldName(candidate) === name,
    );
    return firmId === undefined ? undefined : hazardFieldSpec(firmId);
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
