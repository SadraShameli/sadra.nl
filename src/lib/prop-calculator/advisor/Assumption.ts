import { z } from 'zod';

import { formatCurrency } from '~/lib/format';

import { AssumptionKind } from './AssumptionKind';
import { SIZING_ASSUMPTION_TEXT } from './DifferenceReasons';
import { SizingAssumption } from './DocumentedSizing';

export enum AssumptionBias {
    Conservative = 'conservative',
    Neutral = 'neutral',
    Optimistic = 'optimistic',
}

export type Assumption =
    | InputAssumption
    | LadderStepWidenedAssumption
    | SizingRuleAssumption;

export interface InputAssumption {
    readonly bias: AssumptionBias;
    readonly kind: InputAssumptionKind;
}

export type InputAssumptionKind = Exclude<
    AssumptionKind,
    AssumptionKind.LadderStepWidened | AssumptionKind.SizingRule
>;

export interface LadderStepWidenedAssumption {
    readonly bias: AssumptionBias;
    readonly kind: AssumptionKind.LadderStepWidened;
    readonly step: number;
}

export interface SizingRuleAssumption {
    readonly bias: AssumptionBias;
    readonly kind: AssumptionKind.SizingRule;
    readonly sizingAssumption: SizingAssumption;
}

const inputAssumptionKindSchema = z
    .enum(AssumptionKind)
    .exclude(['LadderStepWidened', 'SizingRule']);

export type AssumptionTextKind = Exclude<
    AssumptionKind,
    AssumptionKind.SizingRule
>;

const ASSUMPTION_KIND_TEXT: Readonly<Record<AssumptionTextKind, string>> = {
    [AssumptionKind.CalendarAnchorMissing]:
        'No firm trade or payout date was recorded, so the payout day gate starts from zero.',
    [AssumptionKind.ContractCapInstrumentAssumed]:
        'The contract cap is estimated at the plan default instrument.',
    [AssumptionKind.CumulativeQualifyingDaysAssumed]:
        'Qualifying days since the last payout were entered directly, not derived from trade dates.',
    [AssumptionKind.CycleBestDayProfitAssumedWorstCase]:
        "No cycle best day was entered, so the worst case (today's profit since the last payout) is assumed.",
    [AssumptionKind.DashboardFloorMismatch]:
        'The entered dashboard floor was higher than the reconstructed floor, so the higher, safer floor is used.',
    [AssumptionKind.ElapsedDaysApproximatedFromTradingDays]:
        'Elapsed days were approximated from trading days, not the real attempt start date.',
    [AssumptionKind.FundedResetsFromEvents]:
        'The funded reset count is as recorded or entered, not derived from a full history.',
    [AssumptionKind.GrossOnlyPayouts]:
        'At least one paid payout has no net amount, so its gross amount is counted as received.',
    [AssumptionKind.LadderStepWidened]:
        'The ladder grid uses a coarser risk step than the default so it stays within its size cap.',
    [AssumptionKind.LastPayoutBalanceAssumedCurrent]:
        'No balance at the last payout was entered, so the current balance is assumed.',
    [AssumptionKind.LiveModelApproximation]:
        'Only a firm-level live model exists for this plan, so its live rules are an approximation.',
    [AssumptionKind.LiveNotModeled]: 'No live stage is modeled for this plan.',
    [AssumptionKind.LiveTriggersNotChecked]:
        'Live triggers on the lifetime payout cap are not checked yet, so engine numbers here are optimistic.',
    [AssumptionKind.NoHolidayCalendar]:
        'Calendar-day gates use weekdays only; holidays are not excluded.',
    [AssumptionKind.PeakOrderAssumed]:
        'Without a floor at the last payout, the conservative, higher floor order is assumed.',
    [AssumptionKind.PendingPayoutDeducted]:
        'A pending payout request was deducted from the balance.',
    [AssumptionKind.PercentCandidatesLeftOut]:
        'Percent-of-cushion candidates are left out without a stop distance.',
    [AssumptionKind.PositionSizingUnspecified]:
        'Position sizing (instrument and stop) was not specified, so sizing is fractional and not rounded to whole contracts or limited by the contract cap.',
    [AssumptionKind.RebuyLagAssumed]:
        'The rebuy lag is assumed to be zero days, not measured.',
    [AssumptionKind.TopStepLfaProgressDefaulted]:
        "TopStep's LFA progress is defaulted, not stored.",
    [AssumptionKind.TopStepLiveReserveDefaulted]:
        "TopStep's live reserve progress is defaulted, not stored.",
};

export const assumptionSchema = z.union([
    z.strictObject({
        bias: z.enum(AssumptionBias),
        kind: inputAssumptionKindSchema,
    }),
    z.strictObject({
        bias: z.enum(AssumptionBias),
        kind: z.literal(AssumptionKind.LadderStepWidened),
        step: z.number().positive(),
    }),
    z.strictObject({
        bias: z.enum(AssumptionBias),
        kind: z.literal(AssumptionKind.SizingRule),
        sizingAssumption: z.enum(SizingAssumption),
    }),
]) satisfies z.ZodType<Assumption>;

export function assumptionKindText(kind: AssumptionTextKind): string {
    return ASSUMPTION_KIND_TEXT[kind];
}

export function assumptionText(assumption: Assumption): string {
    if (assumption.kind === AssumptionKind.SizingRule) {
        return SIZING_ASSUMPTION_TEXT[assumption.sizingAssumption];
    }
    return assumption.kind === AssumptionKind.LadderStepWidened
        ? ladderStepWidenedText(assumption.step)
        : ASSUMPTION_KIND_TEXT[assumption.kind];
}

export function inputAssumption(
    kind: InputAssumptionKind,
    bias: AssumptionBias,
): InputAssumption {
    if (!inputAssumptionKindSchema.safeParse(kind).success) {
        throw new Error(
            'A SizingRule assumption wraps a SizingAssumption and a LadderStepWidened assumption carries its step; build them with sizingRuleAssumption and ladderStepWidenedAssumption',
        );
    }
    return { bias, kind };
}

export function ladderStepWidenedAssumption(
    step: number,
    bias: AssumptionBias,
): LadderStepWidenedAssumption {
    if (!(Number.isFinite(step) && step > 0)) {
        throw new Error(`A widened ladder step must be positive, got ${step}`);
    }
    return { bias, kind: AssumptionKind.LadderStepWidened, step };
}

export function ladderStepWidenedText(step: number): string {
    return `${ASSUMPTION_KIND_TEXT[AssumptionKind.LadderStepWidened]} The grid step is ${formatCurrency(step, 0)}.`;
}

export function sizingRuleAssumption(
    sizingAssumption: SizingAssumption,
    bias: AssumptionBias,
): SizingRuleAssumption {
    return { bias, kind: AssumptionKind.SizingRule, sizingAssumption };
}
