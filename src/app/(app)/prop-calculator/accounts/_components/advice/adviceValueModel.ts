import { formatRiskDisplay, type RiskDisplayFormatted } from '~/app/(app)/prop-calculator/_components/riskDisplay';
import {
    AdvisorRequestOutcomeKind,
    type AdvisorValueRequest,
    type AdvisorValueResult,
    type AdvisorValueSlot,
    type AdvisorValueSwing,
} from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    CENTS_PER_DOLLAR,
    type Dollars,
    dollars,
    type FirmAccountPolicy,
    floorToWholeCents,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountAction,
    type Advice,
    buildEnginePolicy,
    type DailyPlanCard,
    DEFAULT_FUNDED_HORIZON_DAYS,
    DEFAULT_MAX_EVAL_DAYS,
    type DifferenceReasonDetail,
    type DocumentedPolicySpec,
    type MeasuredRebuyLag,
    RebuyLagBasis,
    type ReconstructedAccount,
    ReconstructedLiveKind,
    RiskDisplayUnit,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import { flatRiskIgnoresStateReason } from '~/lib/prop-calculator/advisor/actions';
import {
    conservativeGapStandardError,
    continuationValue,
    CreditBasis,
    type PayoutStakeComparisonOutcome,
    type PayoutStakeComparisonResult,
    type RiskCandidateRow,
    type RiskCandidateValuesOutcome,
    type RiskCandidateValuesResult,
    startStateOf,
    type TradeValueSwingResult,
    valueGap,
    type ValueNotModeledResult,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { bustCost, feeEquivalentTradeRisk } from '~/lib/prop-calculator/economics';
import { isBeyondNoise, type UncertainValue } from '~/lib/prop-calculator/stats';

import { accountActionFor } from './accountActionModel';

export enum AdviceValueRequestKind {
    Failed = 'failed',
    NotRequested = 'not-requested',
    Ready = 'ready',
}

export enum ValueSectionKind {
    Failed = 'failed',
    NotModeled = 'not-modeled',
    Ready = 'ready',
}

export interface AdviceValueRequestInput {
    readonly account: ReconstructedAccount;
    readonly accountPolicy?: FirmAccountPolicy;
    readonly advice: Advice;
    readonly measuredRebuyLag?: MeasuredRebuyLag | null;
    readonly personalPayoutOverride?: Dollars | null;
    readonly personalRetainedCushion?: Dollars | null;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters;
}

export type AdviceValueRequestResult =
    | { readonly kind: AdviceValueRequestKind.Failed; readonly reason: string }
    | { readonly kind: AdviceValueRequestKind.NotRequested }
    | {
          readonly kind: AdviceValueRequestKind.Ready;
          readonly request: AdvisorValueRequest;
      };

export interface AdviceValueView {
    readonly candidates: null | ValueSection<RiskCandidatesView>;
    readonly firstSwing: null | TradeValueSwingResult;
    readonly flatRiskReason: DifferenceReasonDetail | null;
    readonly replacementFee: number;
    readonly stake: null | ValueSection<PayoutStakeView>;
    readonly swings: readonly EvSwingView[];
    readonly tree: null | OneStepTreeView;
}

export interface EvSwingRowView {
    readonly bust: null | {
        readonly rebuyLagDays: number;
        readonly replacementFee: number;
    };
    readonly index: number;
    readonly lossDelta: UncertainValue;
    readonly risk: RiskDisplayFormatted;
    readonly riskDollars: number;
    readonly rr: number;
    readonly winDelta: UncertainValue;
    readonly winProbability: number;
}

export type EvSwingView =
    | {
          readonly index: number;
          readonly kind: ValueSectionKind.Failed;
          readonly reason: string;
      }
    | { readonly index: number; readonly kind: ValueSectionKind.NotModeled }
    | { readonly kind: ValueSectionKind.Ready; readonly row: EvSwingRowView };

export interface OneStepTreeView {
    readonly continuation: UncertainValue;
    readonly replacementFee: null | number;
    readonly valueAfterLoss: UncertainValue;
    readonly valueAfterWin: UncertainValue;
    readonly valueNow: UncertainValue;
    readonly winProbability: number;
}

export interface PayoutStakeView {
    readonly continueNow: UncertainValue;
    readonly evAtStake: UncertainValue;
    readonly requestedAmount: number;
    readonly requestNow: UncertainValue;
    readonly traderReceivesNow: number;
    readonly whatIf: null | {
        readonly label: string;
        readonly risk: number;
        readonly value: UncertainValue;
    };
}

export interface RiskCandidateRowView {
    readonly continuation: UncertainValue;
    readonly contractsText: null | string;
    readonly isDocumented: boolean;
    readonly monthlyNetCharge: number;
    readonly netOfDurationCharge: number;
    readonly rank: number;
    readonly risk: RiskDisplayFormatted;
    readonly riskDollars: number;
}

export interface RiskCandidatesView {
    readonly label: string;
    readonly rows: readonly RiskCandidateRowView[];
}

export interface ValueFigureContext {
    readonly phase: TradingPhase;
    readonly plan: Plan;
    readonly unit: RiskDisplayUnit;
}

export type ValueSection<T> =
    | { readonly kind: ValueSectionKind.Failed; readonly reason: string }
    | { readonly kind: ValueSectionKind.NotModeled }
    | { readonly kind: ValueSectionKind.Ready; readonly view: T };

export const CANDIDATE_VALUE_BASIS_TEXT =
    'includes the end-of-horizon credit, net of the expected duration charge';

export const EVAL_NEXT_TRADE_NOT_MODELED_TEXT =
    'The value of the next trade is not modeled for eval accounts yet.';

export const NO_LIVE_VALUE_TEXT =
    'Value views are not modeled for a live account.';

export const VALUE_BASIS_TEXT =
    'Expected cash from the account as it stands, credit-free: the end-of-horizon credit is left out.';

const CANDIDATE_RISK_FRACTIONS: readonly number[] = [0.25, 0.5, 0.75, 1];

const DOCUMENTED_RISK_MATCH_TOLERANCE = 0.005;

const EVAL_NEXT_TRADE_ENGINE_LIMITS: readonly string[] = [
    'todayPnL must be 0 at the start of a session',
    'has already passed the eval',
];

const VALUE_RUN_SEED = 42;

const VALUE_RUN_TRIALS = 1000;

export function adviceValueRequestOf(
    input: AdviceValueRequestInput,
): AdviceValueRequestResult {
    const { account, advice, plan, rulebook } = input;
    if (
        account.kind === ReconstructedLiveKind.Live ||
        advice.staleness.kind === 'stale'
    ) {
        return { kind: AdviceValueRequestKind.NotRequested };
    }
    const start = startOf(plan, account);
    if (start.kind === AdviceValueRequestKind.Failed) return start;
    const rungs = (advice.dailyPlanCard?.rungs ?? []).filter(
        (rung) => rung.risk > 0,
    );
    const isPayoutEligible =
        account.kind === TradingPhase.Funded &&
        accountActionFor(advice).action === AccountAction.RequestPayout;
    return {
        kind: AdviceValueRequestKind.Ready,
        request: {
            candidateRiskGrid: candidateRiskGridOf(rungs[0]?.risk ?? 0),
            payoutStake: isPayoutEligible ? {} : null,
            rr: rulebook.strategy.rr,
            rungs: rungs.map((rung) => ({
                risk: rung.risk,
                rr: rung.takeProfit / rung.risk,
            })),
            spec: valueSpecOf(input),
            start: start.start,
        },
    };
}

export function adviceValueViewOf(args: {
    readonly context: ValueFigureContext;
    readonly documentedRisk: null | number;
    readonly outcome: AdvisorValueResult | null;
}): AdviceValueView {
    const { context, documentedRisk, outcome } = args;
    const replacementFee = context.plan.retryFee();
    if (outcome === null) {
        return {
            candidates: null,
            firstSwing: null,
            flatRiskReason: null,
            replacementFee,
            stake: null,
            swings: [],
            tree: null,
        };
    }
    const firstSwing = firstSwingOf(outcome.swings);
    const candidatesOutcome =
        outcome.candidates.kind === AdvisorRequestOutcomeKind.Succeeded &&
        outcome.candidates.value.kind === ValueResultKind.Candidates
            ? outcome.candidates.value
            : null;
    return {
        candidates: candidatesSectionOf(
            outcome.candidates,
            documentedRisk,
            context,
        ),
        firstSwing,
        flatRiskReason:
            documentedRisk === null ||
            candidatesOutcome === null ||
            context.phase === TradingPhase.Eval
                ? null
                : flatRiskReasonOf(
                      candidatesOutcome,
                      documentedRisk,
                      replacementFee,
                  ),
        replacementFee,
        stake:
            outcome.payoutStake === null
                ? null
                : stakeSectionOf(outcome.payoutStake),
        swings: evSwingViewsOf(outcome.swings, context),
        tree:
            firstSwing === null
                ? null
                : oneStepTreeOf(firstSwing, replacementFee),
    };
}

export function adviceWithValues(
    advice: Advice,
    values: {
        readonly firstSwing: null | TradeValueSwingResult;
        readonly flatRiskReason: DifferenceReasonDetail | null;
        readonly replacementFee: number;
    },
): Advice {
    return {
        ...advice,
        dailyPlanCard:
            advice.dailyPlanCard === null
                ? null
                : filledDailyPlanCard(
                      advice.dailyPlanCard,
                      values.firstSwing,
                      values.replacementFee,
                  ),
        differenceReasons:
            values.flatRiskReason === null
                ? advice.differenceReasons
                : [...advice.differenceReasons, values.flatRiskReason],
    };
}

export function candidateRiskGridOf(documentedRisk: number): readonly number[] {
    const grid = new Set(
        CANDIDATE_RISK_FRACTIONS.map((fraction) =>
            floorToWholeCents(documentedRisk * fraction),
        ).filter((risk) => risk > 0),
    );
    return [...grid];
}

export function evSwingViewsOf(
    swings: readonly AdvisorValueSwing[],
    context: ValueFigureContext,
): readonly EvSwingView[] {
    return swings.map((swing, position): EvSwingView => {
        const index = position + 1;
        if (swing.outcome.kind === AdvisorRequestOutcomeKind.Failed) {
            return {
                index,
                kind: ValueSectionKind.Failed,
                reason: swing.outcome.reason,
            };
        }
        const result = swing.outcome.value;
        if (result.kind === ValueResultKind.NotModeled) {
            return { index, kind: ValueSectionKind.NotModeled };
        }
        return {
            kind: ValueSectionKind.Ready,
            row: {
                bust: result.afterLossBusted
                    ? { rebuyLagDays: result.afterLossRebuyLagDays ?? 0 }
                    : null,
                index,
                lossDelta: valueGap(
                    result.now,
                    result.afterLoss,
                    CreditBasis.CreditFree,
                ),
                risk: riskFigureOf(swing.rung.risk, result, context),
                riskDollars: swing.rung.risk,
                rr: swing.rung.rr,
                winDelta: valueGap(
                    result.now,
                    result.afterWin,
                    CreditBasis.CreditFree,
                ),
                winProbability: result.winProbability,
            },
        };
    });
}

export function filledDailyPlanCard(
    card: DailyPlanCard,
    swing: null | TradeValueSwingResult,
): DailyPlanCard {
    return swing === null
        ? card
        : {
              ...card,
              valueAfterLoss: swing.afterLoss.creditFree.value,
              valueAfterWin: swing.afterWin.creditFree.value,
              valueNow: swing.now.creditFree.value,
          };
}

export function flatRiskReasonOf(
    candidates: RiskCandidateValuesResult,
    documentedRisk: number,
): DifferenceReasonDetail | null {
    const { rows } = candidates;
    const best = rows[0];
    const documented = rows.find((row) =>
        isDocumentedRow(row, documentedRisk),
    );
    if (best === undefined || documented === undefined || best === documented) {
        return null;
    }
    const bestValue: UncertainValue = {
        standardError: best.continuationValue.standardError,
        value: best.netOfDurationCharge,
    };
    const documentedValue: UncertainValue = {
        standardError: documented.continuationValue.standardError,
        value: documented.netOfDurationCharge,
    };
    const combined = conservativeGapStandardError(
        bestValue.standardError,
        documentedValue.standardError,
    );
    if (
        combined === null ||
        !isBeyondNoise(bestValue, documentedValue, { sharedSeed: false })
    ) {
        return null;
    }
    const gapInCombinedSEs =
        combined === 0
            ? null
            : Math.abs(bestValue.value - documentedValue.value) / combined;
    const riskStandardError =
        gapInCombinedSEs === null
            ? 0
            : Math.abs(best.placement.placedRisk - documentedRisk) /
              gapInCombinedSEs;
    return flatRiskIgnoresStateReason(dollars(documentedRisk), {
        standardError: riskStandardError,
        value: best.placement.placedRisk,
    });
}

export function oneStepTreeOf(swing: TradeValueSwingResult): OneStepTreeView {
    const { afterLoss, afterWin, now, winProbability } = swing;
    return {
        continuation: {
            standardError: conservativeGapStandardError(
                afterWin.creditFree.standardError,
                afterLoss.creditFree.standardError,
            ),
            value: continuationValue(
                winProbability,
                afterWin.creditFree.value,
                afterLoss.creditFree.value,
            ),
        },
        valueAfterLoss: afterLoss.creditFree,
        valueAfterWin: afterWin.creditFree,
        valueNow: now.creditFree,
        winProbability,
    };
}

export function payoutStakeViewOf(
    stake: PayoutStakeComparisonResult,
): PayoutStakeView {
    const requestNow = stake.requestNow.creditFree;
    const continueNow = stake.continueNow.creditFree;
    return {
        continueNow,
        evAtStake: {
            standardError: conservativeGapStandardError(
                requestNow.standardError,
                continueNow.standardError,
            ),
            value: requestNow.value - continueNow.value,
        },
        requestedAmount: stake.requestedAmount,
        requestNow,
        traderReceivesNow: stake.traderReceivesNow,
        whatIf:
            stake.reducedRiskWhatIf === null
                ? null
                : {
                      label: stake.reducedRiskWhatIf.label,
                      risk: stake.reducedRiskWhatIf.risk,
                      value: stake.reducedRiskWhatIf.value.creditFree,
                  },
    };
}

export function riskCandidatesViewOf(
    candidates: RiskCandidateValuesResult,
    documentedRisk: null | number,
    context: ValueFigureContext,
): RiskCandidatesView {
    return {
        label: candidates.label,
        rows: candidates.rows.map((row, position) => ({
            continuation: row.continuationValue,
            contractsText:
                row.placement.contracts === null
                    ? null
                    : `${String(row.placement.contracts)} contract${row.placement.contracts === 1 ? '' : 's'}`,
            isDocumented:
                documentedRisk !== null && isDocumentedRow(row, documentedRisk),
            monthlyNetCharge: row.monthlyNetCharge,
            netOfDurationCharge: row.netOfDurationCharge,
            rank: position + 1,
            risk: riskFigureOf(row.placement.placedRisk, row.swing, context),
            riskDollars: row.placement.placedRisk,
        })),
    };
}

export function valueSpecOf(input: AdviceValueRequestInput): DocumentedPolicySpec {
    const { accountPolicy, measuredRebuyLag, plan, rulebook } = input;
    const { policy } = buildEnginePolicy({
        accountPolicy,
        fundedHorizonDays: DEFAULT_FUNDED_HORIZON_DAYS,
        measuredRebuyLag,
        plan,
        positionSizing: null,
        rulebook,
    });
    return {
        enginePolicy: policy,
        rulebook,
        run: {
            maxEvalDays: DEFAULT_MAX_EVAL_DAYS,
            seed: VALUE_RUN_SEED,
            trials: VALUE_RUN_TRIALS,
        },
    };
}

function candidatesSectionOf(
    slot: AdvisorValueSlot<RiskCandidateValuesOutcome>,
    documentedRisk: null | number,
    context: ValueFigureContext,
): ValueSection<RiskCandidatesView> {
    if (slot.kind === AdvisorRequestOutcomeKind.Failed) {
        return { kind: ValueSectionKind.Failed, reason: slot.reason };
    }
    if (slot.value.kind === ValueResultKind.NotModeled) {
        return { kind: ValueSectionKind.NotModeled };
    }
    return {
        kind: ValueSectionKind.Ready,
        view: riskCandidatesViewOf(slot.value, documentedRisk, context),
    };
}

function evAtStakeOf(
    swing: TradeValueSwingResult,
    context: ValueFigureContext,
): null | number {
    const valueNow = swing.now.creditFree.value;
    const valueAfterLoss = swing.afterLoss.creditFree.value;
    if (!swing.afterLossBusted) return Math.max(0, valueNow - valueAfterLoss);
    const retryFee = dollars(context.plan.retryFee());
    const bust =
        bustCost(context.phase === TradingPhase.Eval ? {
                  phase: TradingPhase.Eval,
                  retryFee,
                  valueFreshEval: dollars(valueAfterLoss),
                  valueNow: dollars(valueNow),
              } : {
                  phase: TradingPhase.Funded,
                  rebuyFee: retryFee,
                  valueFreshEval: dollars(valueAfterLoss),
                  valueNow: dollars(valueNow),
              });
    return bust.value;
}

function feeEquivalentOf(
    risk: number,
    context: ValueFigureContext,
): null | number {
    if (context.phase !== TradingPhase.Eval) return null;
    return feeEquivalentTradeRisk({
        evalDrawdown: dollars(context.plan.drawdown.amount),
        retryFee: dollars(context.plan.retryFee()),
        risk: dollars(risk),
    }).value;
}

function firstSwingOf(
    swings: readonly AdvisorValueSwing[],
): null | TradeValueSwingResult {
    const first = swings[0]?.outcome;
    return first === undefined ||
        first.kind === AdvisorRequestOutcomeKind.Failed ||
        first.value.kind === ValueResultKind.NotModeled ? null : first.value;
}

function isDocumentedRow(row: RiskCandidateRow, documentedRisk: number): boolean {
    return (
        Math.abs(row.placement.placedRisk - documentedRisk) <
        DOCUMENTED_RISK_MATCH_TOLERANCE
    );
}

function riskFigureOf(
    risk: number,
    swing: TradeValueSwingResult,
    context: ValueFigureContext,
): RiskDisplayFormatted {
    return formatRiskDisplay(context.unit, {
        accountDollars: risk,
        evAtStake:
            context.unit === RiskDisplayUnit.EvAtStake
                ? evAtStakeOf(swing, context)
                : null,
        feeEquivalent: feeEquivalentOf(risk, context),
    });
}

function stakeSectionOf(
    slot: AdvisorValueSlot<PayoutStakeComparisonOutcome>,
): ValueSection<PayoutStakeView> {
    if (slot.kind === AdvisorRequestOutcomeKind.Failed) {
        return { kind: ValueSectionKind.Failed, reason: slot.reason };
    }
    if ('reason' in slot.value) return { kind: ValueSectionKind.NotModeled };
    return {
        kind: ValueSectionKind.Ready,
        view: payoutStakeViewOf(slot.value),
    };
}
