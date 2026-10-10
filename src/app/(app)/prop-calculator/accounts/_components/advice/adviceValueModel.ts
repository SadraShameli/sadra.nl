import {
    formatRiskDisplay,
    type RiskDisplayFormatted,
} from '~/app/(app)/prop-calculator/_components/riskDisplay';
import {
    AdvisorRequestOutcomeKind,
    type AdvisorValueRequest,
    type AdvisorValueResult,
    type AdvisorValueSlot,
    type AdvisorValueSwing,
} from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import { buildDocumentedSpec } from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { formatCurrency } from '~/lib/format';
import {
    ALL_FIRMS,
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
    AdviceStalenessKind,
    assumptionText,
    type CumulativePayoutTriggerAssumption,
    type DailyPlanCard,
    DEFAULT_FUNDED_HORIZON_DAYS,
    DEFAULT_MAX_EVAL_DAYS,
    type DifferenceReasonDetail,
    type DocumentedPolicySpec,
    type DocumentedRung,
    type EnginePolicy,
    liveTransferAssumptionLines,
    type MeasuredRebuyLag,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    RebuyLagBasis,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
    RiskDisplayUnit,
    type RulebookParameters,
    SIZING_ASSUMPTION_TEXT,
    SizingAssumption,
} from '~/lib/prop-calculator/advisor';
import { flatRiskIgnoresStateReason } from '~/lib/prop-calculator/advisor/actions';
import {
    documentedFundedRisk,
    documentedLiveTransferHazard,
    hasDayLimits,
} from '~/lib/prop-calculator/advisor/policy';
import {
    conservativeGapStandardError,
    continuationValue,
    CreditBasis,
    netOfReplacementFee,
    type PayoutStakeComparisonOutcome,
    type PayoutStakeComparisonResult,
    type RiskCandidateRow,
    type RiskCandidateValuesOutcome,
    type RiskCandidateValuesResult,
    startStateOf,
    type TradeValueSwingResult,
    valueGap,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import {
    bustCost,
    feeEquivalentTradeRisk,
} from '~/lib/prop-calculator/economics';
import {
    liveTransferHazardLines,
    liveTransferSentLiveText,
    type SimStart,
} from '~/lib/prop-calculator/simulator';
import {
    isBeyondNoise,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

import { accountActionFor } from './accountActionModel';
import { personalPolicyOverridesOfOptions } from './personalRuleOptions';

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
    readonly personalCaps: PersonalCaps;
    readonly personalDll: Dollars | null;
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
    readonly boundaryNote: null | string;
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
    readonly liveTransferNotes: readonly string[];
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
    readonly isEngineOptimum: boolean;
    readonly monthlyNetCharge: number;
    readonly netOfDurationCharge: number;
    readonly rank: number;
    readonly risk: RiskDisplayFormatted;
    readonly riskDollars: number;
}

export interface RiskCandidatesView {
    readonly isRanked: boolean;
    readonly label: string;
    readonly liveTransferNotes: readonly string[];
    readonly rows: readonly RiskCandidateRowView[];
    readonly sizingNote: null | string;
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

export const EVAL_CANDIDATES_NOTE_TEXT =
    'Eval sizing is the maximum allowed risk under a daily cap, for speed to funded. This table values one trade at smaller sizes; it is not a smaller eval size to take.';

const LIVE_TRANSFER_UNIDENTIFIED_PLAN_TEXT =
    'Live transfer: a hazard is entered in your rulebook, but the plan for these runs could not be identified, so this note cannot say whether it was priced.';

export const NO_LIVE_VALUE_TEXT =
    'Value views are not modeled for a live account.';

export const PAYOUT_STAKE_REQUEST_NOW_TRANSFER_TEXT =
    "The request-now figure prices the requested payout's own transfer chance at this hazard.";

export const SESSION_BOUNDARY_CONTINUES_TEXT =
    "The documented rule keeps trading after a loss, and the rest of today's rungs are not in the after-loss value. Each later rung is priced as reached after the earlier rungs lost.";

export const VALUE_BASIS_TEXT =
    'Expected cash from the account as it stands, credit-free: the end-of-horizon credit is left out.';

const CANDIDATE_RISK_FRACTIONS: readonly number[] = [0.25, 0.5, 0.75, 1];

const DOCUMENTED_RISK_MATCH_TOLERANCE = 0.005;

const VALUE_RUN_SEED = 42;

const VALUE_RUN_TRIALS = 1000;

export function adviceValueRequestOf(
    input: AdviceValueRequestInput,
): AdviceValueRequestResult {
    const { account, advice, plan, rulebook } = input;
    if (
        account.kind === ReconstructedLiveKind.Live ||
        advice.staleness.kind === AdviceStalenessKind.Stale ||
        advice.documented === null
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
    const spec = valueSpecOf(input);
    return {
        kind: AdviceValueRequestKind.Ready,
        request: {
            candidateRiskGrid: candidateRiskGridOf(rungs[0]?.risk ?? 0),
            payoutStake: isPayoutEligible
                ? {
                      reducedRiskDollars:
                          documentedFundedRisk(rulebook, spec.enginePolicy) / 2,
                  }
                : null,
            rr: documentedRewardMultipleOf(rungs[0], rulebook.strategy.rr),
            rungs: rungs.map((rung) => ({
                risk: rung.risk,
                rr: rung.takeProfit / rung.risk,
            })),
            spec,
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
            boundaryNote: null,
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
        boundaryNote: boundaryNoteOf(firstSwing, outcome.swings.length),
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
    const replacementFee = context.plan.retryFee();
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
        const netOfFee = netOfReplacementFee(result, replacementFee);
        return {
            kind: ValueSectionKind.Ready,
            row: {
                bust: result.afterLossBusted
                    ? {
                          rebuyLagDays: result.afterLossRebuyLagDays ?? 0,
                          replacementFee,
                      }
                    : null,
                index,
                lossDelta: valueGap(
                    netOfFee.now,
                    netOfFee.afterLoss,
                    CreditBasis.CreditFree,
                ),
                risk: riskFigureOf(swing.rung.risk, result, context),
                riskDollars: swing.rung.risk,
                rr: swing.rung.rr,
                winDelta: valueGap(
                    netOfFee.now,
                    netOfFee.afterWin,
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
    replacementFee: number,
): DailyPlanCard {
    if (swing === null) return card;
    const netOfFee = netOfReplacementFee(swing, replacementFee);
    return {
        ...card,
        valueAfterLoss: netOfFee.afterLoss.creditFree.value,
        valueAfterWin: netOfFee.afterWin.creditFree.value,
        valueNow: netOfFee.now.creditFree.value,
    };
}

export function flatRiskReasonOf(
    candidates: RiskCandidateValuesResult,
    documentedRisk: number,
    replacementFee: number,
): DifferenceReasonDetail | null {
    const { rows } = candidatesNetOfReplacementFee(candidates, replacementFee);
    const best = rows[0];
    const documented = rows.find((row) => isDocumentedRow(row, documentedRisk));
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

export function oneStepTreeOf(
    swing: TradeValueSwingResult,
    replacementFee: number,
): OneStepTreeView {
    const { afterLoss, afterWin, now, winProbability } = netOfReplacementFee(
        swing,
        replacementFee,
    );
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
        replacementFee: swing.afterLossBusted ? replacementFee : null,
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
        liveTransferNotes: payoutStakeLiveTransferNotesOf(stake),
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
    const { label, rows } = candidatesNetOfReplacementFee(
        candidates,
        context.plan.retryFee(),
    );
    const isRanked = context.phase !== TradingPhase.Eval;
    const views = rows.map((row, position): RiskCandidateRowView => ({
        continuation: row.continuationValue,
        contractsText:
            row.placement.contracts === null
                ? null
                : `${String(row.placement.contracts)} contract${row.placement.contracts === 1 ? '' : 's'}`,
        isDocumented:
            documentedRisk !== null && isDocumentedRow(row, documentedRisk),
        isEngineOptimum: position === 0,
        monthlyNetCharge: row.monthlyNetCharge,
        netOfDurationCharge: row.netOfDurationCharge,
        rank: position + 1,
        risk: riskFigureOf(row.placement.placedRisk, row.swing, context),
        riskDollars: row.placement.placedRisk,
    }));
    return {
        isRanked,
        label,
        liveTransferNotes: [
            ...(candidates.liveTransfer === undefined
                ? []
                : liveTransferAssumptionLines(candidates.liveTransfer)),
            ...(candidates.cumulativePayoutTrigger === undefined
                ? []
                : [assumptionText(candidates.cumulativePayoutTrigger)]),
        ],
        rows: isRanked
            ? views
            : views.toSorted(
                  (a, b) => Number(b.isDocumented) - Number(a.isDocumented),
              ),
        sizingNote: isRanked ? null : EVAL_CANDIDATES_NOTE_TEXT,
    };
}

export function valueCumulativeTriggerOf(
    outcome: AdvisorValueResult | null,
): CumulativePayoutTriggerAssumption | null {
    const now = outcome?.now;
    if (
        now?.kind === AdvisorRequestOutcomeKind.Succeeded &&
        now.value.kind === ValueResultKind.Value &&
        now.value.cumulativePayoutTrigger !== undefined
    ) {
        return now.value.cumulativePayoutTrigger;
    }
    const swing = firstSwingOf(outcome?.swings ?? []);
    return swing?.now.cumulativePayoutTrigger ?? null;
}

export function valueRunBasisNoteOf(request: AdvisorValueRequest): string {
    const { enginePolicy, run } = request.spec;
    const rebuyLag =
        enginePolicy.rebuyLagBasis === RebuyLagBasis.Measured
            ? `measured at ${String(enginePolicy.rebuyLagDays)} days`
            : 'assumed zero (optimistic)';
    return `Value runs: ${String(run.trials)} trials, seed ${String(run.seed)}, ${String(enginePolicy.fundedHorizonDays)}-day funded horizon, ${String(run.maxEvalDays)}-day eval limit; rebuy lag ${rebuyLag}; commission ${formatCurrency(enginePolicy.commissionPerRoundTrip, 2)} per round trip.${appliedLimitsNoteOf(enginePolicy)}`;
}

export function valueRunNoteOf(
    request: AdvisorValueRequest,
    sentLiveShare: null | number,
    cumulativePayoutTrigger: CumulativePayoutTriggerAssumption | null = null,
): string {
    const triggerNote =
        cumulativePayoutTrigger === null
            ? ''
            : ` ${assumptionText(cumulativePayoutTrigger)}`;
    return `${valueRunBasisNoteOf(request)}${liveTransferNoteOf(request.spec, sentLiveShare)}${triggerNote}`;
}

export function valueSentLiveShareOf(
    outcome: AdvisorValueResult | null,
): null | number {
    const now = outcome?.now;
    return now?.kind === AdvisorRequestOutcomeKind.Succeeded &&
        now.value.kind === ValueResultKind.Value
        ? (now.value.liveTransfer?.sentLiveShare ?? null)
        : null;
}

export function valueSpecOf(
    input: AdviceValueRequestInput,
): DocumentedPolicySpec {
    return buildDocumentedSpec({
        accountPolicy: input.accountPolicy,
        fundedHorizonDays: DEFAULT_FUNDED_HORIZON_DAYS,
        measuredRebuyLag: input.measuredRebuyLag,
        overrides: personalPolicyOverridesOfOptions(input),
        plan: input.plan,
        rulebook: input.rulebook,
        run: {
            maxEvalDays: DEFAULT_MAX_EVAL_DAYS,
            seed: VALUE_RUN_SEED,
            trials: VALUE_RUN_TRIALS,
        },
    }).spec;
}

function appliedLimitsNoteOf(enginePolicy: EnginePolicy): string {
    const caps = enginePolicy.personalCaps ?? NO_PERSONAL_CAPS;
    const dailyLossLimit = enginePolicy.personalDll ?? null;
    const parts = [
        ...(caps.maxRiskPerTrade === null
            ? []
            : [
                  `max risk per trade ${formatCurrency(caps.maxRiskPerTrade, 2)}`,
              ]),
        ...(caps.maxTradesPerDay === null
            ? []
            : [`max ${String(caps.maxTradesPerDay)} trades per day`]),
        ...(caps.dailyProfitCap === null
            ? []
            : [`daily profit cap ${formatCurrency(caps.dailyProfitCap, 2)}`]),
        ...(dailyLossLimit === null
            ? []
            : [`daily loss limit ${formatCurrency(dailyLossLimit, 2)}`]),
    ];
    if (parts.length === 0) return '';
    const documentedRule = hasDayLimits(enginePolicy)
        ? ` The funded day follows the documented rule. ${SIZING_ASSUMPTION_TEXT[SizingAssumption.WinsAddNoLossRoom]}`
        : '';
    return ` Personal limits applied: ${parts.join(', ')}.${documentedRule}`;
}

function boundaryNoteOf(
    firstSwing: null | TradeValueSwingResult,
    rungCount: number,
): null | string {
    if (firstSwing === null) return null;
    const assumption = `Assumption: ${firstSwing.assumption}.`;
    return rungCount > 1
        ? `${assumption} ${SESSION_BOUNDARY_CONTINUES_TEXT}`
        : assumption;
}

function candidatesNetOfReplacementFee(
    candidates: RiskCandidateValuesResult,
    replacementFee: number,
): RiskCandidateValuesResult {
    return {
        ...candidates,
        rows: candidates.rows
            .map((row): RiskCandidateRow => {
                if (!row.swing.afterLossBusted) return row;
                const charge = (1 - row.swing.winProbability) * replacementFee;
                return {
                    ...row,
                    continuationValue: {
                        ...row.continuationValue,
                        value: row.continuationValue.value - charge,
                    },
                    netOfDurationCharge: row.netOfDurationCharge - charge,
                };
            })
            .toSorted((a, b) => b.netOfDurationCharge - a.netOfDurationCharge),
    };
}

function candidatesSectionOf(
    slot: AdvisorValueSlot<RiskCandidateValuesOutcome>,
    documentedRisk: null | number,
    context: ValueFigureContext,
): ValueSection<RiskCandidatesView> {
    if (slot.kind === AdvisorRequestOutcomeKind.Failed) {
        return {
            kind: ValueSectionKind.Failed,
            reason: slot.reason,
        };
    }
    if (slot.value.kind === ValueResultKind.NotModeled) {
        return { kind: ValueSectionKind.NotModeled };
    }
    return {
        kind: ValueSectionKind.Ready,
        view: riskCandidatesViewOf(slot.value, documentedRisk, context),
    };
}

function documentedRewardMultipleOf(
    rung: DocumentedRung | undefined,
    fallback: number,
): number {
    return rung === undefined ? fallback : rung.takeProfit / rung.risk;
}

function evAtStakeOf(
    swing: TradeValueSwingResult,
    context: ValueFigureContext,
): null | number {
    const valueNow = swing.now.creditFree.value;
    const valueAfterLoss = swing.afterLoss.creditFree.value;
    if (!swing.afterLossBusted) return Math.max(0, valueNow - valueAfterLoss);
    const retryFee = dollars(context.plan.retryFee());
    const bust = bustCost(
        context.phase === TradingPhase.Eval
            ? {
                  phase: TradingPhase.Eval,
                  retryFee,
                  valueFreshEval: dollars(valueAfterLoss),
                  valueNow: dollars(valueNow),
              }
            : {
                  phase: TradingPhase.Funded,
                  rebuyFee: retryFee,
                  valueFreshEval: dollars(valueAfterLoss),
                  valueNow: dollars(valueNow),
              },
    );
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
        first.value.kind === ValueResultKind.NotModeled
        ? null
        : first.value;
}

function isDocumentedRow(
    row: RiskCandidateRow,
    documentedRisk: number,
): boolean {
    return (
        Math.abs(row.placement.placedRisk - documentedRisk) <
        DOCUMENTED_RISK_MATCH_TOLERANCE
    );
}

function liveTransferNoteOf(
    spec: DocumentedPolicySpec,
    sentLiveShare: null | number,
): string {
    const { planSerial, rulebook } = spec;
    const { hazardPerPaidPayoutByFirm } = rulebook.liveTransfer;
    if (Object.keys(hazardPerPaidPayoutByFirm).length === 0) return '';
    const plan = planSerial === undefined ? null : planOfSerial(planSerial);
    if (plan === null) return ` ${LIVE_TRANSFER_UNIDENTIFIED_PLAN_TEXT}`;
    const hazard = documentedLiveTransferHazard(rulebook, plan.id.firm);
    if (hazard === undefined) return '';
    return ` ${liveTransferHazardLines(
        plan,
        hazard,
        spec.enginePolicy.instrument,
        spec.enginePolicy.stopPoints,
        sentLiveShare,
    ).join(' ')}`;
}

function payoutStakeHazardNotesOf(
    stake: PayoutStakeComparisonResult,
): readonly string[] {
    const { liveTransfer } = stake.continueNow;
    if (liveTransfer === undefined) return [];
    return [
        ...liveTransferAssumptionLines({
            ...liveTransfer,
            sentLiveShare: null,
        }),
        ...sentLiveShareLine('Continuing', liveTransfer.sentLiveShare),
        ...sentLiveShareLine(
            'Request now',
            stake.requestNow.liveTransfer?.sentLiveShare ?? null,
        ),
        PAYOUT_STAKE_REQUEST_NOW_TRANSFER_TEXT,
        ...(stake.requestNow.liveTransfer?.notes ?? []).filter(
            (note) => !liveTransfer.notes.includes(note),
        ),
    ];
}

function payoutStakeLiveTransferNotesOf(
    stake: PayoutStakeComparisonResult,
): readonly string[] {
    const cumulativePayoutTrigger =
        stake.continueNow.cumulativePayoutTrigger ??
        stake.requestNow.cumulativePayoutTrigger;
    return [
        ...payoutStakeHazardNotesOf(stake),
        ...(cumulativePayoutTrigger === undefined
            ? []
            : [assumptionText(cumulativePayoutTrigger)]),
    ];
}

function planOfSerial(planSerial: string): null | Plan {
    for (const firm of ALL_FIRMS) {
        const plan = firm.findPlanBySerial(planSerial);
        if (plan !== null) return plan;
    }
    return null;
}

function riskFigureOf(
    risk: number,
    swing: TradeValueSwingResult,
    context: ValueFigureContext,
): RiskDisplayFormatted {
    const formatted = formatRiskDisplay(context.unit, {
        accountDollars: risk,
        evAtStake:
            context.unit === RiskDisplayUnit.EvAtStake
                ? evAtStakeOf(swing, context)
                : null,
        feeEquivalent: feeEquivalentOf(risk, context),
    });
    return formatted.disclosure === null
        ? formatted
        : {
              ...formatted,
              label: `${formatted.label}, ${formatted.disclosure}`,
          };
}

function sentLiveShareLine(
    label: string,
    sentLiveShare: null | number,
): readonly string[] {
    return sentLiveShare === null
        ? []
        : [`${label}: ${liveTransferSentLiveText(sentLiveShare)}`];
}

function stakeSectionOf(
    slot: AdvisorValueSlot<PayoutStakeComparisonOutcome>,
): ValueSection<PayoutStakeView> {
    if (slot.kind === AdvisorRequestOutcomeKind.Failed) {
        return { kind: ValueSectionKind.Failed, reason: slot.reason };
    }
    switch (slot.value.kind) {
        case ValueResultKind.NotModeled: {
            return { kind: ValueSectionKind.NotModeled };
        }
        case ValueResultKind.PayoutStake: {
            return {
                kind: ValueSectionKind.Ready,
                view: payoutStakeViewOf(slot.value),
            };
        }
    }
}

function startOf(
    plan: Plan,
    account: ReconstructedFundedOrEvalAccount,
):
    | { readonly kind: AdviceValueRequestKind.Failed; readonly reason: string }
    | {
          readonly kind: AdviceValueRequestKind.Ready;
          readonly start: SimStart;
      } {
    try {
        return {
            kind: AdviceValueRequestKind.Ready,
            start: startStateOf(plan, account),
        };
    } catch (error) {
        return {
            kind: AdviceValueRequestKind.Failed,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}
