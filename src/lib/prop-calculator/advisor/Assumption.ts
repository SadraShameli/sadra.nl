import { z } from 'zod';

import { formatCurrency } from '~/lib/format';
import { type VerifiedCumulativeTrigger } from '~/lib/prop-calculator/core';
import {
    LIVE_TRANSFER_CONTINUATION_TEXT,
    liveTransferContinuationKindFor,
    liveTransferContinuationNotes,
    liveTransferDisclosureLines,
    type SimInputs,
} from '~/lib/prop-calculator/simulator';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator/types';

import { AssumptionKind } from './AssumptionKind';
import { SIZING_ASSUMPTION_TEXT } from './DifferenceReasons';
import { SizingAssumption } from './DocumentedSizing';
import { type PolicyCitation } from './PayoutBlockReason';

export enum AssumptionBias {
    Conservative = 'conservative',
    Neutral = 'neutral',
    Optimistic = 'optimistic',
}

export type Assumption =
    | CumulativePayoutTriggerAssumption
    | InputAssumption
    | LadderStepWidenedAssumption
    | LiveTransferHazardAssumption
    | SizingRuleAssumption;

export interface CumulativePayoutTriggerAssumption {
    readonly amount: number;
    readonly bias: AssumptionBias;
    readonly continuation: LiveTransferAssumptionContinuationKind;
    readonly kind: AssumptionKind.CumulativePayoutTriggerPriced;
    readonly notes: readonly string[];
    readonly source: PolicyCitation;
}

export type CumulativePayoutTriggerInputs = Pick<
    SimInputs,
    'instrument' | 'plan' | 'stopPoints'
>;

export interface InputAssumption {
    readonly bias: AssumptionBias;
    readonly kind: InputAssumptionKind;
}

export type InputAssumptionKind = Exclude<
    AssumptionKind,
    | AssumptionKind.CumulativePayoutTriggerPriced
    | AssumptionKind.LadderStepWidened
    | AssumptionKind.LiveTransferHazard
    | AssumptionKind.SizingRule
>;

export interface LadderStepWidenedAssumption {
    readonly bias: AssumptionBias;
    readonly kind: AssumptionKind.LadderStepWidened;
    readonly step: number;
}

export type LiveTransferAssumptionInputs = Pick<
    SimInputs,
    'instrument' | 'liveTransferHazard' | 'plan' | 'stopPoints'
>;

export interface LiveTransferHazardAssumption {
    readonly bias: AssumptionBias;
    readonly continuation: LiveTransferAssumptionContinuationKind;
    readonly hazard: number;
    readonly kind: AssumptionKind.LiveTransferHazard;
    readonly notes: readonly string[];
    readonly sentLiveShare: null | number;
}

export interface SizingRuleAssumption {
    readonly bias: AssumptionBias;
    readonly kind: AssumptionKind.SizingRule;
    readonly sizingAssumption: SizingAssumption;
}

type LiveTransferAssumptionContinuationKind = Exclude<
    LiveTransferContinuationKind,
    LiveTransferContinuationKind.Off
>;

const liveTransferAssumptionContinuationSchema = z
    .enum(LiveTransferContinuationKind)
    .exclude(['Off']);

const inputAssumptionKindSchema = z
    .enum(AssumptionKind)
    .exclude([
        'CumulativePayoutTriggerPriced',
        'LadderStepWidened',
        'LiveTransferHazard',
        'SizingRule',
    ]);

export type AssumptionTextKind = Exclude<
    AssumptionKind,
    | AssumptionKind.CumulativePayoutTriggerPriced
    | AssumptionKind.LiveTransferHazard
    | AssumptionKind.SizingRule
>;

const CUMULATIVE_TRIGGER_CROSSING_PAYOUT_TEXT =
    'The payout that reaches the amount is still paid.';

const CUMULATIVE_TRIGGER_NOT_CHECKED_TEXT =
    'The documented payout request is not checked against this trigger.';

const ASSUMPTION_KIND_TEXT: Readonly<Record<AssumptionTextKind, string>> = {
    [AssumptionKind.CalendarAnchorMissing]:
        'No firm trade or payout date was recorded, so the payout day gate starts from zero.',
    [AssumptionKind.CalendarWeekProgressDefaulted]:
        'How many sessions of the current calendar week have passed, and whether any was traded, was not recorded, so the weekly trading requirement starts from a fresh week.',
    [AssumptionKind.ContractCapInstrumentAssumed]:
        'The contract cap is estimated at the plan default instrument.',
    [AssumptionKind.CumulativePayoutDefaulted]:
        'Payouts were taken but no cumulative payout total was entered, so the total received is counted as zero, which can understate how close the account is to a lifetime cap or trigger.',
    [AssumptionKind.CumulativeQualifyingDaysAssumed]:
        'Qualifying days since the last payout were entered directly, not derived from trade dates.',
    [AssumptionKind.CycleBestDayProfitAssumedWorstCase]:
        "No cycle best day was entered, so the worst case (today's profit since the last payout) is assumed.",
    [AssumptionKind.DashboardFloorMismatch]:
        'The entered dashboard floor was higher than the reconstructed floor, so the higher, safer floor is used.',
    [AssumptionKind.ElapsedDaysApproximatedFromTradingDays]:
        'Elapsed days were approximated from trading days, not the real attempt start date.',
    [AssumptionKind.EvalBestDayProfitDefaulted]:
        'No best day profit was entered for this evaluation, so it is counted as zero and the consistency rule looks satisfied.',
    [AssumptionKind.FirmPayoutCountNotChecked]:
        "The firm's payout ledger could not be read, so requested payouts at your other accounts of this firm are counted as none, which can overstate how far the firm is from a live trigger.",
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
    [AssumptionKind.LiveStartBalanceDefaulted]:
        "No usable live start balance was entered, so the live plan's own default start is used and tier profit may be wrong.",
    [AssumptionKind.LiveTransferHazardNotPriced]:
        'You entered a live-transfer hazard for a firm in this simulation, but it runs as if no account is ever sent live, so its figures do not move with that hazard.',
    [AssumptionKind.LiveTriggersNotChecked]:
        'Live triggers on the lifetime payout cap are not checked yet, so engine numbers here are optimistic.',
    [AssumptionKind.NoHolidayCalendar]:
        'Calendar-day gates use weekdays only; holidays are not excluded.',
    [AssumptionKind.PayoutsTakenDefaulted]:
        'No payout count was entered, so no payout is assumed to have been taken.',
    [AssumptionKind.PeakOrderAssumed]:
        'Without a floor at the last payout, the conservative, higher floor order is assumed.',
    [AssumptionKind.PeakProfitApproximated]:
        'The highest profit reached was not fully entered, so the profit tier for limits that scale on it is approximated from the balances entered and may be lower than the real one.',
    [AssumptionKind.PeakReplacedByDashboardFloor]:
        'No highest balance was entered, so the entered dashboard floor stands in for the reconstructed floor and the lock state is assumed unlocked.',
    [AssumptionKind.PendingPayoutAssumedInBalance]:
        'A payout request dated on or before the snapshot is assumed to be in the balance, so it is not deducted again, and a request the firm has not yet debited would overstate readiness.',
    [AssumptionKind.PendingPayoutDeducted]:
        'A pending payout request was deducted from the balance.',
    [AssumptionKind.PercentCandidatesLeftOut]:
        'Percent-of-cushion candidates are left out without a stop distance.',
    [AssumptionKind.PositionSizingUnspecified]:
        'Position sizing (instrument and stop) was not specified, so sizing is fractional and not rounded to whole contracts or limited by the contract cap.',
    [AssumptionKind.QualifyingDaysDefaulted]:
        'No qualifying days since the last payout were entered, so none are counted toward the payout day gate.',
    [AssumptionKind.RebuyLagAssumed]:
        'The rebuy lag is assumed to be zero days, not measured.',
    [AssumptionKind.TopStepLfaProgressDefaulted]:
        "TopStep's LFA progress is defaulted, not stored.",
    [AssumptionKind.TopStepLiveReserveDefaulted]:
        "TopStep's live reserve progress is defaulted, not stored.",
    [AssumptionKind.TradingDaysDefaulted]:
        'No trading day count was entered for this evaluation, so none are counted toward the minimum trading days.',
};

const policyCitationSchema = z.strictObject({
    fetchedOn: z.string().min(1),
    quote: z.string().min(1),
    url: z.string().min(1),
}) satisfies z.ZodType<PolicyCitation>;

export const assumptionSchema = z.union([
    z.strictObject({
        amount: z.number().positive(),
        bias: z.enum(AssumptionBias),
        continuation: liveTransferAssumptionContinuationSchema,
        kind: z.literal(AssumptionKind.CumulativePayoutTriggerPriced),
        notes: z.string().array().readonly(),
        source: policyCitationSchema,
    }),
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
        continuation: liveTransferAssumptionContinuationSchema,
        hazard: z.number().positive().max(1),
        kind: z.literal(AssumptionKind.LiveTransferHazard),
        notes: z.string().array().readonly(),
        sentLiveShare: z.number().min(0).max(1).nullable(),
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
    if (assumption.kind === AssumptionKind.CumulativePayoutTriggerPriced) {
        return cumulativePayoutTriggerText(assumption);
    }
    if (assumption.kind === AssumptionKind.SizingRule) {
        return SIZING_ASSUMPTION_TEXT[assumption.sizingAssumption];
    }
    if (assumption.kind === AssumptionKind.LiveTransferHazard) {
        return liveTransferAssumptionLines(assumption).join(' ');
    }
    return assumption.kind === AssumptionKind.LadderStepWidened
        ? ladderStepWidenedText(assumption.step)
        : ASSUMPTION_KIND_TEXT[assumption.kind];
}

export function cumulativePayoutTriggerAssumption(
    trigger: VerifiedCumulativeTrigger,
    inputs: CumulativePayoutTriggerInputs,
): CumulativePayoutTriggerAssumption {
    const { fetchedOn, quote, url } = trigger.source;
    const { instrument, plan, stopPoints } = inputs;
    const continuation = liveTransferContinuationKindFor(
        plan,
        instrument,
        stopPoints,
    );
    if (continuation === LiveTransferContinuationKind.Off) {
        throw new Error(
            'A priced cumulative trigger always has a live-transfer continuation',
        );
    }
    return {
        amount: trigger.amount,
        bias: AssumptionBias.Neutral,
        continuation,
        kind: AssumptionKind.CumulativePayoutTriggerPriced,
        notes: liveTransferContinuationNotes(plan, continuation),
        source: { fetchedOn, quote, url },
    };
}

export function inputAssumption(
    kind: InputAssumptionKind,
    bias: AssumptionBias,
): InputAssumption {
    if (!inputAssumptionKindSchema.safeParse(kind).success) {
        throw new Error(
            'A SizingRule assumption wraps a SizingAssumption, a LadderStepWidened assumption carries its step, a LiveTransferHazard assumption carries the priced hazard and a CumulativePayoutTriggerPriced assumption carries the trigger; build them with sizingRuleAssumption, ladderStepWidenedAssumption, liveTransferAssumptionOf and cumulativePayoutTriggerAssumption',
        );
    }
    return { bias, kind };
}

export function labelledAssumptionLines(
    label: string,
    assumption: Assumption | undefined,
): readonly string[] {
    return assumption === undefined
        ? []
        : [`${label}. ${assumptionText(assumption)}`];
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

export function liveTransferAssumptionLines(
    assumption: LiveTransferHazardAssumption,
): readonly string[] {
    return liveTransferDisclosureLines(assumption);
}

export function liveTransferAssumptionOf(
    inputs: LiveTransferAssumptionInputs,
    sentLiveShare: null | number,
): LiveTransferHazardAssumption | undefined {
    const { instrument, liveTransferHazard, plan, stopPoints } = inputs;
    if (liveTransferHazard === undefined || liveTransferHazard === 0) {
        return undefined;
    }
    const continuation = liveTransferContinuationKindFor(
        plan,
        instrument,
        stopPoints,
    );
    if (continuation === LiveTransferContinuationKind.Off) return undefined;
    return {
        bias: AssumptionBias.Neutral,
        continuation,
        hazard: liveTransferHazard,
        kind: AssumptionKind.LiveTransferHazard,
        notes: liveTransferContinuationNotes(plan, continuation),
        sentLiveShare,
    };
}

export function sizingRuleAssumption(
    sizingAssumption: SizingAssumption,
    bias: AssumptionBias,
): SizingRuleAssumption {
    return { bias, kind: AssumptionKind.SizingRule, sizingAssumption };
}

function cumulativePayoutTriggerText(
    assumption: CumulativePayoutTriggerAssumption,
): string {
    const { amount, continuation, notes, source } = assumption;
    return [
        `The simulation sends an account live once the payouts it receives, counted after the profit split, total ${formatCurrency(amount, 0)}, the firm's confirmed trigger (source: ${source.url}, fetched ${source.fetchedOn}, quote: "${source.quote}").`,
        CUMULATIVE_TRIGGER_CROSSING_PAYOUT_TEXT,
        LIVE_TRANSFER_CONTINUATION_TEXT[continuation],
        ...notes,
        CUMULATIVE_TRIGGER_NOT_CHECKED_TEXT,
    ].join(' ');
}
