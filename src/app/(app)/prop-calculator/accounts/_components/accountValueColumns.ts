import type {
    AccountFromStateFigures,
    DocumentedRunFigures,
    PlanValuesFigures,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';

import {
    ACCOUNT_ACTION_TEXT,
    accountActionFor,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/accountActionModel';
import {
    type EngineSlot,
    EngineSlotKind,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/engineSlot';
import {
    estimateCurrency,
    estimatePercent,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/uncertainText';
import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    AdviceUnavailableReason,
    sampleAdequacy,
    SampleKind,
    SampleLevel,
} from '~/lib/prop-accounts';
import { dollars, fraction, TradingPhase } from '~/lib/prop-calculator';
import {
    AccountAction,
    type Advice,
    AdviceStalenessKind,
    type DocumentedSizing,
    NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT,
    NEXT_PAYOUT_ELIGIBLE_NOW_TEXT,
    NEXT_PAYOUT_NO_TRIAL_PAID_TEXT,
    nextPayoutEvidenceText,
    type NextPayoutProjection,
    NextPayoutTimingKind,
    nextPayoutTimingOf,
    PayoutRequestDecisionKind,
    type SampleThresholds,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    bustCost,
    ECONOMICS_DISCLOSURE_TEXT,
    ECONOMICS_REASON_TEXT,
    expectedNetPerAttemptOf,
} from '~/lib/prop-calculator/economics';

export enum AccountValueInputKind {
    LedgerOnly = 'ledger-only',
    Modeled = 'modeled',
    NotValued = 'not-valued',
}

export enum AtRiskKind {
    AtLeast = 'at-least',
    Exact = 'exact',
    Unavailable = 'unavailable',
}

export enum EvPerAttemptKind {
    Pending = 'pending',
    Ready = 'ready',
    Unavailable = 'unavailable',
}

export enum ExpectedPayoutsKind {
    NotValued = 'not-valued',
    Pending = 'pending',
    Ready = 'ready',
}

export enum FigureBasis {
    Modeled = 'modeled',
    Realized = 'realized',
}

export enum NextActionSourceKind {
    Advice = 'advice',
    EnterSnapshot = 'enter-snapshot',
    LedgerOnly = 'ledger-only',
    NotModeled = 'not-modeled',
}

export enum NextPayoutKind {
    InDays = 'in-days',
    NoPayout = 'no-payout',
    NotFunded = 'not-funded',
    NotValued = 'not-valued',
    Now = 'now',
    Pending = 'pending',
}

export interface AccountValueColumns {
    readonly action: NextActionView;
    readonly atRisk: AtRiskView | null;
    readonly evPerAttempt: EvPerAttemptView | null;
    readonly expectedPayouts: ExpectedPayoutsView;
    readonly nextPayout: NextPayoutView;
}

export type AccountValueInput =
    | AccountValueLedgerOnlyInput
    | AccountValueModeledInput
    | AccountValueNotValuedInput;

export interface AccountValueLedgerOnlyInput {
    readonly kind: AccountValueInputKind.LedgerOnly;
    readonly reason: AdviceUnavailableReason;
}

export interface AccountValueModeledInput {
    readonly action: NextActionView;
    readonly documented: EngineSlot<DocumentedRunFigures>;
    readonly fromState: EngineSlot<AccountFromStateFigures>;
    readonly kind: AccountValueInputKind.Modeled;
    readonly planValues: EngineSlot<PlanValuesFigures>;
    readonly realized: null | RealizedAttemptFigures;
    readonly retryFee: number;
    readonly stage: SizingStage.Eval | SizingStage.Funded;
}

export interface AccountValueNotValuedInput {
    readonly action: NextActionView;
    readonly kind: AccountValueInputKind.NotValued;
    readonly reason: string;
}

export interface AccountValueOptions {
    readonly highlightWithinDays: number;
    readonly sampleThresholds: SampleThresholds;
}

export interface AtRiskView {
    readonly kind: AtRiskKind;
    readonly note: null | string;
    readonly text: string;
}

export type EvPerAttemptView =
    | {
          readonly fundedValueBasis: FigureBasis;
          readonly kind: EvPerAttemptKind.Ready;
          readonly note: string;
          readonly passBasis: FigureBasis;
          readonly text: string;
      }
    | { readonly kind: EvPerAttemptKind.Pending }
    | { readonly kind: EvPerAttemptKind.Unavailable; readonly reason: string };

export type ExpectedPayoutsView =
    | {
          readonly creditFree: number;
          readonly kind: ExpectedPayoutsKind.Ready;
          readonly text: string;
      }
    | { readonly kind: ExpectedPayoutsKind.NotValued; readonly reason: string }
    | { readonly kind: ExpectedPayoutsKind.Pending };

export interface NextActionView {
    readonly action: AccountAction;
    readonly reason: null | string;
    readonly text: string;
}

export interface NextPayoutView {
    readonly days: null | number;
    readonly isSoon: boolean;
    readonly kind: NextPayoutKind;
    readonly note: null | string;
    readonly payingShare: null | number;
    readonly text: string;
}

export interface RealizedAttemptFigures {
    readonly fundedValue: null | RealizedFigure;
    readonly passRate: null | RealizedFigure;
}

type NextActionSource =
    | { readonly advice: Advice; readonly kind: NextActionSourceKind.Advice }
    | {
          readonly kind: NextActionSourceKind.LedgerOnly;
          readonly reason: AdviceUnavailableReason;
      }
    | {
          readonly kind:
              | NextActionSourceKind.EnterSnapshot
              | NextActionSourceKind.NotModeled;
          readonly reason: string;
      };

interface RealizedFigure {
    readonly n: number;
    readonly value: number;
}

export const MIN_PAYING_SHARE_FOR_NEXT_PAYOUT_HIGHLIGHT = 0.5;

const AT_RISK_LABEL = 'At risk if busted: ';

const AT_RISK_UNAVAILABLE_LABEL = 'At risk if busted is not available: ';

const AVERAGED_OVER_PAYING_TRIALS_TEXT =
    'Days are averaged over the trials that reached a payout.';

const ELIGIBLE_NOW_NOTE = `By the engine's payout check on the latest snapshot, at the retained cushion and payout request of your rulebook or personal rules; ${NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT}.`;

const EV_LABEL = 'EV per attempt: ';

const LEDGER_ONLY_TEXT: Readonly<Record<AdviceUnavailableReason, string>> = {
    [AdviceUnavailableReason.LedgerOnly]:
        'Ledger only: the engine does not model this account, so it is not valued or sized.',
};

const NO_DOCUMENTED_SIZING_TEXT =
    'The engine documents no sizing for this account.';

const NO_NEXT_PAYOUT_TEXT = 'No next payout figure for this account.';

const NOT_FUNDED_TEXT = 'Not funded yet';

const PENDING_TEXT = 'Computing';

const EV_PER_ATTEMPT_NOTE =
    'Per attempt, ignores time; not the ranking objective.';

const FRESH_EVAL_WORTH_MORE_TEXT =
    'A fresh eval is worth more than this account net of the retry fee, so the bust cost is shown as $0';

const STOP_FOR_TODAY_TEXT =
    'The documented day plan has no risk room left today.';

export function accountValueColumnsOf(
    input: AccountValueInput,
    options: AccountValueOptions,
): AccountValueColumns {
    switch (input.kind) {
        case AccountValueInputKind.LedgerOnly: {
            return notValuedColumns(
                nextActionOf({
                    kind: NextActionSourceKind.LedgerOnly,
                    reason: input.reason,
                }),
                LEDGER_ONLY_TEXT[input.reason],
            );
        }
        case AccountValueInputKind.Modeled: {
            return {
                action: input.action,
                atRisk: atRiskOf(input),
                evPerAttempt: evPerAttemptOf(input, options),
                expectedPayouts: expectedPayoutsOf(input.fromState),
                nextPayout: nextPayoutOf(input.fromState, options),
            };
        }
        case AccountValueInputKind.NotValued: {
            return notValuedColumns(input.action, input.reason);
        }
    }
}

export function expectedValueOf(
    columns: AccountValueColumns | undefined,
): null | number {
    return columns?.expectedPayouts.kind === ExpectedPayoutsKind.Ready
        ? columns.expectedPayouts.creditFree
        : null;
}

export function nextActionOf(source: NextActionSource): NextActionView {
    switch (source.kind) {
        case NextActionSourceKind.Advice: {
            return adviceActionOf(source.advice);
        }
        case NextActionSourceKind.EnterSnapshot: {
            return actionView(AccountAction.EnterSnapshot, source.reason);
        }
        case NextActionSourceKind.LedgerOnly: {
            return actionView(
                AccountAction.NotModeled,
                LEDGER_ONLY_TEXT[source.reason],
            );
        }
        case NextActionSourceKind.NotModeled: {
            return actionView(AccountAction.NotModeled, source.reason);
        }
    }
}

function actionView(
    action: AccountAction,
    reason: null | string,
): NextActionView {
    return { action, reason, text: ACCOUNT_ACTION_TEXT[action] };
}

function adequateFigureOf(
    figure: null | RealizedFigure,
    kind: SampleKind,
    thresholds: SampleThresholds,
): null | RealizedFigure {
    return figure !== null &&
        sampleAdequacy(kind, figure.n, thresholds) === SampleLevel.Adequate
        ? figure
        : null;
}

function adviceActionOf(advice: Advice): NextActionView {
    const { action } = accountActionFor(advice);
    switch (action) {
        case AccountAction.EnterSnapshot: {
            return actionView(
                action,
                advice.staleness.kind === AdviceStalenessKind.Stale
                    ? `The latest snapshot (${advice.staleness.snapshotAsOf}) is out of date.`
                    : null,
            );
        }
        case AccountAction.NotModeled: {
            return actionView(action, NO_DOCUMENTED_SIZING_TEXT);
        }
        case AccountAction.RequestPayout: {
            return actionView(
                action,
                joinedSentences([
                    payoutRequestTextOf(advice),
                    documentedSizingTextOf(
                        advice.documented,
                        (risk) =>
                            `Documented sizing is unchanged: ${formatCurrency(risk)} risk per trade.`,
                    ),
                ]),
            );
        }
        case AccountAction.Retire:
        case AccountAction.Trade: {
            return actionView(
                action,
                documentedSizingTextOf(
                    advice.documented,
                    (risk) =>
                        `Documented risk per trade: ${formatCurrency(risk)}.`,
                ),
            );
        }
        case AccountAction.StopForToday: {
            return actionView(action, STOP_FOR_TODAY_TEXT);
        }
    }
}

function atRiskOf(input: AccountValueModeledInput): AtRiskView | null {
    if (input.stage !== SizingStage.Eval) return null;
    const { fromState, planValues } = input;
    const failure = failureReasonOf(fromState, planValues);
    if (failure !== null) return atRiskUnavailable(failure);
    if (
        fromState.kind !== EngineSlotKind.Ready ||
        planValues.kind !== EngineSlotKind.Ready
    ) {
        return {
            kind: AtRiskKind.AtLeast,
            note: null,
            text: `${AT_RISK_LABEL}at least ${formatCurrency(input.retryFee)} (the retry fee; exact only at a fresh eval)`,
        };
    }
    const bust = bustCost({
        phase: TradingPhase.Eval,
        retryFee: dollars(planValues.figures.retryFee),
        valueFreshEval: dollars(
            planValues.figures.valueFreshEval.creditFree.value,
        ),
        valueNow: dollars(fromState.figures.valueNow.creditFree.value),
    });
    if (bust.value === null) {
        return atRiskUnavailable(ECONOMICS_REASON_TEXT[bust.reason]);
    }
    const disclosure = bust.disclosures
        .map((entry) => ECONOMICS_DISCLOSURE_TEXT[entry])
        .join('; ');
    return bust.value < 0
        ? {
              kind: AtRiskKind.Exact,
              note: `${FRESH_EVAL_WORTH_MORE_TEXT} (the unclamped figure is ${formatCurrency(bust.value)}). ${disclosure}`,
              text: `${AT_RISK_LABEL}${formatCurrency(0)}`,
          }
        : {
              kind: AtRiskKind.Exact,
              note: disclosure,
              text: `${AT_RISK_LABEL}${formatCurrency(bust.value)}`,
          };
}

function atRiskUnavailable(reason: string): AtRiskView {
    return {
        kind: AtRiskKind.Unavailable,
        note: null,
        text: `${AT_RISK_UNAVAILABLE_LABEL}${reason}`,
    };
}

function basisTextOf(figure: null | RealizedFigure): string {
    return figure === null ? 'modeled' : `realized, n = ${String(figure.n)}`;
}

function documentedSizingTextOf(
    documented: DocumentedSizing | null,
    leadOf: (risk: number) => string,
): null | string {
    const rung = documented?.rungs[0];
    if (documented === null || rung === undefined) return null;
    return joinedSentences([
        leadOf(rung.risk),
        `Basis: ${documented.provenance}.`,
        ...rung.cappedBy.map(
            (constraint) => SIZING_CONSTRAINT_TEXT[constraint],
        ),
        ...documented.assumptions.map(
            (assumption) => SIZING_ASSUMPTION_TEXT[assumption],
        ),
    ]);
}

function evPerAttemptOf(
    input: AccountValueModeledInput,
    options: AccountValueOptions,
): EvPerAttemptView | null {
    if (input.stage !== SizingStage.Eval) return null;
    const slot = input.documented;
    switch (slot.kind) {
        case EngineSlotKind.Failed:
        case EngineSlotKind.Refused: {
            return {
                kind: EvPerAttemptKind.Unavailable,
                reason: slot.reason,
            };
        }
        case EngineSlotKind.Pending: {
            return { kind: EvPerAttemptKind.Pending };
        }
        case EngineSlotKind.Ready: {
            return readyEvPerAttemptOf(slot.figures, input.realized, options);
        }
    }
}

function expectedPayoutsOf(
    slot: EngineSlot<AccountFromStateFigures>,
): ExpectedPayoutsView {
    switch (slot.kind) {
        case EngineSlotKind.Failed:
        case EngineSlotKind.Refused: {
            return {
                kind: ExpectedPayoutsKind.NotValued,
                reason: slot.reason,
            };
        }
        case EngineSlotKind.Pending: {
            return { kind: ExpectedPayoutsKind.Pending };
        }
        case EngineSlotKind.Ready: {
            const { creditFree } = slot.figures.valueNow;
            return {
                creditFree: creditFree.value,
                kind: ExpectedPayoutsKind.Ready,
                text: estimateCurrency(creditFree),
            };
        }
    }
}

function failureReasonOf(
    ...slots: readonly EngineSlot<unknown>[]
): null | string {
    for (const slot of slots) {
        if (
            slot.kind === EngineSlotKind.Failed ||
            slot.kind === EngineSlotKind.Refused
        ) {
            return slot.reason;
        }
    }
    return null;
}

function joinedSentences(sentences: readonly (null | string)[]): null | string {
    const present = sentences.filter((sentence) => sentence !== null);
    return present.length === 0 ? null : present.join(' ');
}

function moneyText(amount: number): string {
    return formatCurrency(amount, Number.isSafeInteger(amount) ? 0 : 2);
}

function nextPayoutDisclosureOf(
    projection: NextPayoutProjection,
    payingShare: number,
    options: AccountValueOptions,
): string {
    const lost = projection.accountLostBeforeFirstPayoutProbability;
    const breach = projection.firstPayoutCausedBreachProbability;
    return [
        `${nextPayoutEvidenceText(projection)}.`,
        lost === null
            ? null
            : `Account lost before the first payout: ${estimatePercent({ standardError: projection.accountLostBeforeFirstPayoutStandardError, value: lost })}.`,
        breach === null
            ? null
            : `The first payout caused a breach: ${estimatePercent({ standardError: projection.firstPayoutCausedBreachStandardError, value: breach })}.`,
        payingShare < 1 ? AVERAGED_OVER_PAYING_TRIALS_TEXT : null,
        `Highlighted when the first payout is expected within ${String(options.highlightWithinDays)} calendar days and at least ${formatPercent(MIN_PAYING_SHARE_FOR_NEXT_PAYOUT_HIGHLIGHT)} of the simulated trials reach one.`,
    ]
        .filter((sentence) => sentence !== null)
        .join(' ');
}

function nextPayoutOf(
    slot: EngineSlot<AccountFromStateFigures>,
    options: AccountValueOptions,
): NextPayoutView {
    switch (slot.kind) {
        case EngineSlotKind.Failed:
        case EngineSlotKind.Refused: {
            return nextPayoutView(NextPayoutKind.NotValued, slot.reason);
        }
        case EngineSlotKind.Pending: {
            return nextPayoutView(NextPayoutKind.Pending, PENDING_TEXT);
        }
        case EngineSlotKind.Ready: {
            return readyNextPayoutOf(slot.figures, options);
        }
    }
}

function nextPayoutView(
    kind: NextPayoutKind,
    text: string,
    extras: Partial<Omit<NextPayoutView, 'kind' | 'text'>> = {},
): NextPayoutView {
    return {
        days: null,
        isSoon: false,
        note: null,
        payingShare: null,
        ...extras,
        kind,
        text,
    };
}

function notValuedColumns(
    action: NextActionView,
    reason: string,
): AccountValueColumns {
    return {
        action,
        atRisk: null,
        evPerAttempt: null,
        expectedPayouts: { kind: ExpectedPayoutsKind.NotValued, reason },
        nextPayout: nextPayoutView(NextPayoutKind.NotValued, reason),
    };
}

function payoutRequestTextOf(advice: Advice): null | string {
    const decision = advice.payoutAdvice?.documented;
    if (decision?.kind !== PayoutRequestDecisionKind.Request) return null;
    const net = advice.payoutAdvice?.netAfterSplit ?? null;
    const receives =
        net === null ? '' : `, you receive ${moneyText(net)} after the split`;
    return `Request ${moneyText(decision.requestAmount)}${receives}; ${moneyText(decision.retainedCushion)} stays in the account as cushion.`;
}

function readyEvPerAttemptOf(
    figures: DocumentedRunFigures,
    realized: null | RealizedAttemptFigures,
    options: AccountValueOptions,
): EvPerAttemptView {
    const passRealized = adequateFigureOf(
        realized?.passRate ?? null,
        SampleKind.EvalAttempts,
        options.sampleThresholds,
    );
    const fundedRealized = adequateFigureOf(
        realized?.fundedValue ?? null,
        SampleKind.FundedAccounts,
        options.sampleThresholds,
    );
    const passBasis =
        passRealized === null ? FigureBasis.Modeled : FigureBasis.Realized;
    const fundedValueBasis =
        fundedRealized === null ? FigureBasis.Modeled : FigureBasis.Realized;
    const note = [
        EV_PER_ATTEMPT_NOTE,
        `Pass rate: ${basisTextOf(passRealized)}.`,
        `Funded value: ${fundedRealized === null ? 'engine' : basisTextOf(fundedRealized)}.`,
    ].join(' ');
    if (passRealized === null && fundedRealized === null) {
        return {
            fundedValueBasis,
            kind: EvPerAttemptKind.Ready,
            note,
            passBasis,
            text: `${EV_LABEL}${estimateCurrency(figures.expectedNetPerAttempt)}`,
        };
    }
    const net = expectedNetPerAttemptOf({
        attemptCost: dollars(figures.costPerAttempt.value),
        fundedValue: dollars(
            fundedRealized?.value ??
                figures.expectedPayoutPerFundedAccount.value,
        ),
        passProbability: fraction(
            passRealized?.value ?? figures.attemptPassProbability.value,
        ),
    });
    return net.value === null
        ? {
              kind: EvPerAttemptKind.Unavailable,
              reason: ECONOMICS_REASON_TEXT[net.reason],
          }
        : {
              fundedValueBasis,
              kind: EvPerAttemptKind.Ready,
              note,
              passBasis,
              text: `${EV_LABEL}${formatCurrency(net.value)}`,
          };
}

function readyNextPayoutOf(
    figures: AccountFromStateFigures,
    options: AccountValueOptions,
): NextPayoutView {
    if (figures.stage === SizingStage.Eval) {
        return nextPayoutView(NextPayoutKind.NotFunded, NOT_FUNDED_TEXT);
    }
    const { nextPayout } = figures;
    if (nextPayout === null) {
        return nextPayoutView(NextPayoutKind.NotValued, NO_NEXT_PAYOUT_TEXT);
    }
    const payingShare = nextPayout.payingTrials / nextPayout.trials;
    const timing = nextPayoutTimingOf(nextPayout);
    switch (timing.kind) {
        case NextPayoutTimingKind.AlreadyEligible: {
            return nextPayoutView(
                NextPayoutKind.Now,
                NEXT_PAYOUT_ELIGIBLE_NOW_TEXT,
                {
                    days: 0,
                    isSoon: false,
                    note: ELIGIBLE_NOW_NOTE,
                    payingShare,
                },
            );
        }
        case NextPayoutTimingKind.InDays: {
            const days = timing.calendarDays;
            const standardError =
                days.standardError === null
                    ? NOT_APPLICABLE
                    : days.standardError.toFixed(1);
            return nextPayoutView(
                NextPayoutKind.InDays,
                `${days.value.toFixed(1)} calendar days (SE ${standardError})`,
                {
                    days: days.value,
                    isSoon:
                        days.value <= options.highlightWithinDays &&
                        payingShare >=
                            MIN_PAYING_SHARE_FOR_NEXT_PAYOUT_HIGHLIGHT,
                    note: nextPayoutDisclosureOf(
                        nextPayout,
                        payingShare,
                        options,
                    ),
                    payingShare,
                },
            );
        }
        case NextPayoutTimingKind.NoTrialPaid: {
            return nextPayoutView(
                NextPayoutKind.NoPayout,
                NEXT_PAYOUT_NO_TRIAL_PAID_TEXT,
                { payingShare },
            );
        }
    }
}
