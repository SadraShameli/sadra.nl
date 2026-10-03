import { describeUnscorableLadderRun } from '~/app/(app)/prop-calculator/_components/ladderUnscorable';
import { payoutBlockReasonText } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    formatConjunctionList,
    formatCurrency,
    formatPercent,
} from '~/lib/format';
import {
    type Dollars,
    oneContractRisk,
    type Plan,
    resolvePositionSizing,
    wholeContractCount,
} from '~/lib/prop-calculator';
import {
    type AccountAction,
    type Advice,
    type AdviceProvenance,
    AdviceSource,
    AdviceStalenessKind,
    AdviceStalenessReason,
    type Assumption,
    type AssumptionBias,
    assumptionText,
    type CappedAmount,
    CONSISTENCY_CEILING_NOTE_TEXT,
    type DailyPlanCard,
    DAY_STOP_REASON_TEXT,
    DayStopReason,
    DifferenceReason,
    differenceReasonText,
    type DocumentedSizing,
    type DpAdviceRow,
    type DpAdviceSamples,
    DpAdviceStalenessReason,
    type DpRiskSample,
    DpSamplesKind,
    DpSampleStage,
    DpSamplesUnavailableReason,
    type EngineOptimum,
    type EngineOptimumRequest,
    type EngineOptimumRunnerResult,
    type FirmMinimumAboveRequestNotice,
    FundedFromStateOptimumResultKind,
    FundedSweepOptimumResultKind,
    fundedWinnerRiskAt,
    type LadderEngineOptimumResult,
    LadderEngineOptimumResultKind,
    ladderRefusalText,
    type LadderScoredEngineOptimumResult,
    type LedgerLadderRow,
    ledgerRecordedLadderFor,
    NEXT_PAYOUT_AMONG_PAYING_TEXT,
    NEXT_PAYOUT_ELIGIBLE_NOW_TEXT,
    NEXT_PAYOUT_NO_TRIAL_PAID_TEXT,
    nextPayoutEvidenceText,
    type NextPayoutProjectionEngineOptimumResult,
    NextPayoutTimingKind,
    nextPayoutTimingOf,
    type PayoutAdvice,
    type PayoutCap,
    PayoutCapKind,
    type PayoutRequestDecision,
    PayoutRequestDecisionKind,
    type PayoutSizeSweepEngineOptimumResult,
    PayoutSizeSweepResultKind,
    type PayoutSizeSweepRow,
    type PayoutWait,
    PayoutWaitBasis,
    type PersonalCaps,
    personalPayoutOverrideWarningText,
    RETAINED_CUSHION_BASIS_TEXT,
    type RungPlacement,
    SIZING_CONSTRAINT_TEXT,
    SIZING_OBJECTIVE_LABEL,
    SizingConstraint,
    sizingObjectiveText,
    type SizingPlacement,
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    DP_SAMPLES_UNAVAILABLE_TEXT,
    dpAdviceGapText,
    dpGateFailureText,
    dpMoney,
} from '~/lib/prop-calculator/advisor/DpAdviceText';
import {
    FundedCandidateRefusal,
    type FundedCandidateRefusalDetail,
} from '~/lib/prop-calculator/optimize';
import {
    type DpValueSample,
    DpValueStateKind,
} from '~/lib/schemas/propAccountOutputs';

import { accountActionFor } from './accountActionModel';

export { payoutBlockReasonText } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';

export enum AdviceDisplayKind {
    Ready = 'ready',
    Stale = 'stale',
}

export enum OptimumFigureKind {
    BustRate = 'bust-rate',
    CostPerFunded = 'cost-per-funded',
    CreditFreeMonthlyNet = 'credit-free-monthly-net',
    DaysToFunded = 'days-to-funded',
    FreshAttemptPassRate = 'fresh-attempt-pass-rate',
    MonthlyNet = 'monthly-net',
    PassRate = 'pass-rate',
    SessionsToFirstPayout = 'sessions-to-first-payout',
}

export enum OptimumRowStatus {
    LeftOut = 'left-out',
    Ready = 'ready',
}

enum FigureUnit {
    Currency = 'currency',
    Days = 'days',
    Percent = 'percent',
}

export interface AdviceViewContext {
    readonly placement: null | SizingPlacement;
    readonly plan: Plan;
}

export type AdviceViewModel = ReadyAdviceViewModel | StaleAdviceViewModel;

export interface AssumptionView {
    readonly bias: AssumptionBias;
    readonly text: string;
}

export interface CappedAmountView {
    readonly amount: number;
    readonly constraint: SizingConstraint;
    readonly text: string;
}

export interface DailyPlanCardViewModel {
    readonly consistencyNoteText: null | string;
    readonly cushion: number;
    readonly dailyLossCap: CappedAmountView;
    readonly dailyLossRoom: null | number;
    readonly dailyProfitCeiling: CappedAmountView | null;
    readonly emptyText: string;
    readonly maxTradesPerWindow: number;
    readonly oneContractRisk: null | number;
    readonly profitCeiling: CappedAmountView | null;
    readonly rungPlacements: readonly RungPlacement[];
    readonly rungs: readonly RungView[];
    readonly stopCappedByText: readonly string[];
    readonly stopReasonText: string;
    readonly valueAfterLoss: null | number;
    readonly valueAfterWin: null | number;
    readonly valueNow: null | number;
    readonly windowRuleText: string;
}

export interface OptimumFigureView {
    readonly kind: OptimumFigureKind;
    readonly label: string;
    readonly standardError: null | number;
    readonly standardErrorText: null | string;
    readonly value: number;
    readonly valueText: string;
}

export interface OptimumRowView {
    readonly figures: readonly OptimumFigureView[];
    readonly label: string;
    readonly ladder: null | readonly number[];
    readonly source: AdviceSource;
    readonly standardError: null | number;
    readonly status: OptimumRowStatus;
    readonly text: string;
    readonly value: null | number;
}

export interface PayoutAdviceViewModel {
    readonly capTexts: readonly string[];
    readonly documentedText: string;
    readonly engineHorizonCredit: null | number;
    readonly netAfterSplit: null | number;
    readonly noticeText: null | string;
    readonly personalOverrideWarningText: null | string;
    readonly ruleCappedWithdrawable: null | number;
    readonly withdrawableText: null | string;
}

export interface PersonalLimits {
    readonly caps: PersonalCaps;
    readonly dailyLossLimit: Dollars | null;
    readonly viewContext?: AdviceViewContext;
}

export interface ProvenanceText {
    readonly openItems: readonly string[];
    readonly openItemsSummary: string;
    readonly parts: readonly string[];
}

export type ProvenanceView = AdviceProvenance;

export interface ReadyAdviceViewModel {
    readonly action: AccountAction;
    readonly assumptions: readonly AssumptionView[];
    readonly dailyPlanCard: DailyPlanCardViewModel | null;
    readonly documented: DocumentedSizing | null;
    readonly headline: string;
    readonly kind: AdviceDisplayKind.Ready;
    readonly optima: readonly OptimumRowView[];
    readonly payoutAdvice: null | PayoutAdviceViewModel;
    readonly provenance: ProvenanceView;
    readonly reasons: readonly ReasonView[];
    readonly stage: SizingStage;
}

export interface ReasonView {
    readonly kind: DifferenceReason;
    readonly text: string;
}

export interface RungView {
    readonly cappedByText: readonly string[];
    readonly risk: number;
    readonly runningLossAfter: number;
    readonly takeProfit: number;
}

export interface StaleAdviceViewModel {
    readonly action: AccountAction;
    readonly headline: string;
    readonly kind: AdviceDisplayKind.Stale;
    readonly message: string;
    readonly provenance: ProvenanceView;
    readonly reasonTexts: readonly string[];
    readonly stage: SizingStage;
}

interface OptimumContext {
    readonly cushion: null | number;
    readonly placement: null | SizingPlacement;
}

interface PayoutRowFigures {
    readonly figures: readonly OptimumFigureView[];
    readonly headlineStandardError: null | number;
    readonly headlineValue: number;
    readonly text: string;
}

export const STALE_ADVICE_MESSAGE =
    "Enter today's balance to see sized amounts again.";

const STALE_REASON_TEXT: Readonly<Record<AdviceStalenessReason, string>> = {
    [AdviceStalenessReason.FundedSnapshotStale]:
        'The funded balance snapshot is older than your review cadence allows.',
    [AdviceStalenessReason.PlanRulesChanged]:
        "Plan rules changed since purchase: this plan's rules are not the ones the account was bought under.",
    [AdviceStalenessReason.SessionSnapshotStale]:
        'More than one trading session has passed since the last balance entry.',
};

const CLAUSE_LIST = new Intl.ListFormat('en', {
    style: 'long',
    type: 'conjunction',
});

const LADDER_LIMITS_TEXT =
    'The ladder is cut to fit: every win and loss path of the day stays inside the limits, and rungs are not rounded to the grid step.';

const ADVICE_SOURCE_LABEL: Readonly<Record<AdviceSource, string>> = {
    [AdviceSource.Documented]: 'Documented rule',
    [AdviceSource.DpAtState]: 'DP solve at your state',
    [AdviceSource.FundedSweepFresh]: 'Fresh funded sweep',
    [AdviceSource.FundedSweepFromState]: 'From-state funded sweep',
    [AdviceSource.LadderSearchFresh]: 'Ladder search (fresh start)',
    [AdviceSource.LadderSearchFromState]: 'Ladder search (from state)',
    [AdviceSource.LedgerRecordedLadder]: 'Ledger-recorded ladder',
    [AdviceSource.NextPayoutProjection]: 'Next payout projection',
    [AdviceSource.PayoutSizeSweep]: 'Payout-size sweep',
};

const START_BASIS_LABEL: Readonly<Record<StartBasis, string>> = {
    [StartBasis.Fresh]: 'fresh start',
    [StartBasis.FromState]: 'from your current state',
};

const DP_CONFIG_KEY_PREFIX_LENGTH = 12;

const MS_PER_SECOND = 1000;

const DP_NOT_VALIDATED_SUFFIX =
    'Treat these figures as an unvalidated estimate, never as the sizing rule.';

const DP_NOT_VALIDATED_NOT_ELIGIBLE_TEXT = `${DP_SAMPLES_UNAVAILABLE_TEXT[DpSamplesUnavailableReason.NotEligible]}, so no gate run applies`;

const DP_NOT_VALIDATED_NOT_STORED_TEXT =
    'the gate result was not stored with this row';

const DP_PLACEMENT_ASSUMPTION_TEXT =
    'Placed risk is whole contracts at the instrument and stop the solve assumed. Neither is stored with this row, so it does not follow the instrument and stop entered above.';

const DP_VALUES_HIDDEN_TEXT =
    'Value figures are stored with this row but are shown only once the DP is validated.';

const DP_STALE_TEXT: Readonly<Record<DpAdviceStalenessReason, string>> = {
    [DpAdviceStalenessReason.NewerSnapshot]:
        'A newer balance snapshot exists, so this solve is for an earlier state.',
    [DpAdviceStalenessReason.PlanRulesChanged]:
        "The plan's rules changed since this solve.",
    [DpAdviceStalenessReason.SolverVersionChanged]:
        'The DP solver changed since this solve.',
};

const DP_STAGE_TEXT: Readonly<Record<DpSampleStage, string>> = {
    [DpSampleStage.Eval]: 'Eval risk per trade, after each loss in order',
    [DpSampleStage.Funded]: 'Funded risk per trade, after each loss in order',
};

const NO_TRADE_TEXT = 'No trade is placeable today.';

const CONSISTENCY_ONLY_EMPTY_TEXT =
    "No rung fits under today's consistency ceiling. This is not a ban on trading: a day above the ceiling only pushes the payout out.";

const LADDER_CERTAIN_PASS_TEXT =
    'Every simulated attempt from this state passed, so the pass chance and cost standard errors read 0; that is the limit of the sample, not certainty.';

const NO_LIMITING_CAP_TEXT = 'the post-payout floor and your retained cushion';

export enum DpSamplesViewKind {
    Sampled = 'sampled',
    Unavailable = 'unavailable',
}

export interface DpAdviceRecordInput extends Pick<
    DpAdviceRow,
    | 'assumedInstrument'
    | 'assumedStopPoints'
    | 'configKey'
    | 'eligible'
    | 'gaps'
    | 'gateFailure'
    | 'gateResult'
    | 'ineligibleReason'
    | 'objective'
    | 'runtimeMs'
    | 'samples'
    | 'solverVersion'
    | 'validated'
    | 'validationRef'
> {
    readonly id: string;
    readonly solvedAt: Date;
    readonly staleness: readonly DpAdviceStalenessReason[];
    readonly valueSamples: readonly DpValueSample[];
}

export interface DpAdviceRowsView {
    readonly hiddenCount: number;
    readonly hiddenText: null | string;
    readonly rows: readonly DpAdviceRowView[];
}

export interface DpAdviceRowView {
    readonly assumptionTexts: readonly string[];
    readonly eligibilityText: string;
    readonly gapTexts: readonly string[];
    readonly id: string;
    readonly isStale: boolean;
    readonly isValidated: boolean;
    readonly provenanceText: string;
    readonly samples: DpSamplesView;
    readonly staleTexts: readonly string[];
    readonly validationText: string;
    readonly valueNote: null | string;
    readonly valueTexts: readonly string[];
}

export interface DpSampleLineView {
    readonly cushionText: string;
    readonly label: string;
    readonly riskTexts: readonly string[];
}

export type DpSamplesView =
    | {
          readonly kind: DpSamplesViewKind.Sampled;
          readonly lines: readonly DpSampleLineView[];
          readonly stageText: string;
      }
    | { readonly kind: DpSamplesViewKind.Unavailable; readonly text: string };

export function adviceViewModel(
    advice: Advice,
    limits: PersonalLimits,
): AdviceViewModel {
    const headline = `${advice.headline}, as of ${advice.provenance.snapshotDate}`;
    const { action } = accountActionFor(advice);
    if (advice.staleness.kind === AdviceStalenessKind.Stale) {
        return {
            action,
            headline,
            kind: AdviceDisplayKind.Stale,
            message: STALE_ADVICE_MESSAGE,
            provenance: advice.provenance,
            reasonTexts: advice.staleness.reasons.map(
                (reason) => STALE_REASON_TEXT[reason],
            ),
            stage: advice.stage,
        };
    }
    const context = optimumContextOf(advice, limits);
    return {
        action,
        assumptions: advice.assumptions.map((assumption) =>
            assumptionViewOf(assumption),
        ),
        dailyPlanCard:
            advice.dailyPlanCard === null
                ? null
                : dailyPlanCardViewOf(advice.dailyPlanCard),
        documented: advice.documented,
        headline,
        kind: AdviceDisplayKind.Ready,
        optima: [
            ...advice.optima.flatMap((result) =>
                optimumRowsOf(result, context).map((row) =>
                    withLimitsNote(row, result.source, limits),
                ),
            ),
            ...ledgerRowsOf(advice.stage, limits),
        ],
        payoutAdvice:
            advice.payoutAdvice === null
                ? null
                : payoutAdviceViewOf(advice.payoutAdvice),
        provenance: advice.provenance,
        reasons: advice.differenceReasons.map((detail) => ({
            kind: detail.kind,
            text: differenceReasonText(detail),
        })),
        stage: advice.stage,
    };
}

export const DP_ADVICE_ROWS_SHOWN = 4;

export function dpAdviceRowViewsOf(
    records: readonly DpAdviceRecordInput[],
): DpAdviceRowsView {
    const seenConfigKeys = new Set<string>();
    const latest = records
        .toSorted((a, b) => b.solvedAt.getTime() - a.solvedAt.getTime())
        .filter((record) => {
            if (seenConfigKeys.has(record.configKey)) return false;
            seenConfigKeys.add(record.configKey);
            return true;
        });
    const hiddenCount = Math.max(0, latest.length - DP_ADVICE_ROWS_SHOWN);
    return {
        hiddenCount,
        hiddenText: hiddenCount === 0 ? null : dpHiddenText(hiddenCount),
        rows: latest
            .slice(0, DP_ADVICE_ROWS_SHOWN)
            .map((record) => dpAdviceRowViewOf(record)),
    };
}

export function figureTextOf(figure: OptimumFigureView): string {
    return figure.standardErrorText === null
        ? figure.valueText
        : `${figure.valueText} (SE ${figure.standardErrorText})`;
}

export function ledgerRecordedLadderRowOf(
    row: LedgerLadderRow,
): OptimumRowView {
    const staleNote = row.stale ? ' This ledger run is stale.' : '';
    return {
        figures: [],
        label: ADVICE_SOURCE_LABEL[AdviceSource.LedgerRecordedLadder],
        ladder: row.ladder,
        source: AdviceSource.LedgerRecordedLadder,
        standardError: null,
        status: OptimumRowStatus.Ready,
        text: `Ledger-recorded ladder ${ladderText(row.ladder)}. Pass rate ${formatPercent(row.passRate)}, ${row.daysToFunded.toFixed(1)} days to funded, cost per funded ${wholeOrCents(row.costPerFundedAccount)}. From ${row.provenance.file}, section ${row.provenance.section}, row ${row.provenance.row}.${staleNote}`,
        value: row.daysToFunded,
    };
}

export function leftOutOptimumRow(
    source: EngineOptimumRequest['source'],
    reason: string,
): OptimumRowView {
    return leftOutRow(source, ADVICE_SOURCE_LABEL[source], reason);
}

export function provenanceTextOf(
    provenance: ProvenanceView,
    openItems: readonly string[],
): ProvenanceText {
    return {
        openItems,
        openItemsSummary: openItemsSummaryOf(openItems.length),
        parts: [
            ADVICE_SOURCE_LABEL[provenance.source],
            START_BASIS_LABEL[provenance.startBasis],
            sizingObjectiveText(provenance.objective),
            `computed ${provenance.computedAt}`,
            `snapshot ${provenance.snapshotDate}`,
            simulationTextOf(provenance),
            ...(provenance.solverVersion === null
                ? []
                : [`solver ${provenance.solverVersion}`]),
            ...(provenance.planRulesFingerprint === null
                ? []
                : [
                      `plan rules fingerprint ${provenance.planRulesFingerprint}`,
                  ]),
            provenance.firmDataDate === null
                ? 'firm data unverified'
                : `firm data verified ${provenance.firmDataDate}`,
        ],
    };
}

function appliedLimitsNoteOf(limits: PersonalLimits): null | string {
    const parts = dayLimitParts(limits);
    if (parts.length === 0) return null;
    const reaches = parts.length === 2 ? 'either' : 'it';
    const clauses = [
        `a day ends once it reaches ${reaches}`,
        `the last trade is sized so it cannot cross ${reaches}`,
        ...(limits.dailyLossLimit === null
            ? []
            : [
                  'a win does not give loss room back',
                  'commission is not counted against the loss limit',
                  "the plan's own daily loss limit and cushion are handled by the simulator",
              ]),
    ];
    return `Simulated under your ${parts.join(' and ')}: ${CLAUSE_LIST.format(clauses)}.`;
}

function assumptionViewOf(assumption: Assumption): AssumptionView {
    return { bias: assumption.bias, text: assumptionText(assumption) };
}

function cappedAmountViewOf(capped: CappedAmount): CappedAmountView {
    return {
        amount: capped.amount,
        constraint: capped.constraint,
        text:
            capped.constraint === SizingConstraint.ConsistencyCap
                ? differenceReasonText({
                      kind: DifferenceReason.ConsistencyCap,
                      maxDayProfit: capped.amount,
                  })
                : SIZING_CONSTRAINT_TEXT[capped.constraint],
    };
}

function contractsAtStopText(
    risk: number,
    placement: null | SizingPlacement,
): string {
    const resolved =
        placement === null
            ? null
            : resolvePositionSizing(placement.instrument, placement.stopPoints);
    if (resolved === null) return '';
    const contracts = wholeContractCount(risk, resolved);
    const { symbol } = resolved.instrument;
    const stop = `${String(resolved.stopPoints)}-point stop`;
    if (contracts === 0) {
        return `, which is below one ${symbol} contract at your ${stop}`;
    }
    return `, which is ${String(contracts)} ${symbol} contract${contracts === 1 ? '' : 's'} (${wholeOrCents(contracts * oneContractRisk(resolved))}) at your ${stop}`;
}

function dailyPlanCardViewOf(card: DailyPlanCard): DailyPlanCardViewModel {
    return {
        consistencyNoteText:
            card.consistencyNote === null
                ? null
                : CONSISTENCY_CEILING_NOTE_TEXT[card.consistencyNote],
        cushion: card.cushion,
        dailyLossCap: cappedAmountViewOf(card.dailyLossCap),
        dailyLossRoom: card.dailyLossRoom,
        dailyProfitCeiling:
            card.dailyProfitCeiling === null
                ? null
                : cappedAmountViewOf(card.dailyProfitCeiling),
        emptyText: emptyCardTextOf(card),
        maxTradesPerWindow: card.maxTradesPerWindow,
        oneContractRisk: card.oneContractRisk,
        profitCeiling:
            card.profitCeiling === null
                ? null
                : cappedAmountViewOf(card.profitCeiling),
        rungPlacements: card.rungPlacements,
        rungs: card.rungs.map((rung) => ({
            cappedByText: rung.cappedBy.map(
                (constraint) => SIZING_CONSTRAINT_TEXT[constraint],
            ),
            risk: rung.risk,
            runningLossAfter: rung.runningLossAfter,
            takeProfit: rung.takeProfit,
        })),
        stopCappedByText: card.stopCappedBy.map(
            (constraint) => SIZING_CONSTRAINT_TEXT[constraint],
        ),
        stopReasonText: DAY_STOP_REASON_TEXT[card.stopReason],
        valueAfterLoss: card.valueAfterLoss,
        valueAfterWin: card.valueAfterWin,
        valueNow: card.valueNow,
        windowRuleText: windowRuleTextOf(card.maxTradesPerWindow),
    };
}

function dayLimitParts(limits: PersonalLimits): readonly string[] {
    const { caps, dailyLossLimit } = limits;
    return [
        ...(dailyLossLimit === null
            ? []
            : [`daily loss limit ${formatCurrency(dailyLossLimit, 2)}`]),
        ...(caps.dailyProfitCap === null
            ? []
            : [`daily profit cap ${formatCurrency(caps.dailyProfitCap, 2)}`]),
    ];
}

function dpAdviceRowViewOf(record: DpAdviceRecordInput): DpAdviceRowView {
    return {
        assumptionTexts: dpAssumptionTextsOf(record),
        eligibilityText: dpEligibilityTextOf(record),
        gapTexts: record.gaps.map((gap) => dpAdviceGapText(gap)),
        id: record.id,
        isStale: record.staleness.length > 0,
        isValidated: record.validated,
        provenanceText: dpProvenanceTextOf(record),
        samples: dpSamplesViewOf(record.samples),
        staleTexts: record.staleness.map((reason) => DP_STALE_TEXT[reason]),
        validationText: dpValidationTextOf(record),
        valueNote:
            !record.validated && record.valueSamples.length > 0
                ? DP_VALUES_HIDDEN_TEXT
                : null,
        valueTexts: record.validated
            ? record.valueSamples.map((sample) => dpValueText(sample))
            : [],
    };
}

function dpAssumptionTextsOf(record: DpAdviceRecordInput): readonly string[] {
    if (
        record.assumedInstrument !== null &&
        record.assumedStopPoints !== null
    ) {
        return [
            `Placed risk is whole contracts of ${record.assumedInstrument} with a ${String(record.assumedStopPoints)}-point stop, the instrument and stop the solve assumed. It does not follow the instrument and stop entered above.`,
        ];
    }
    return record.samples.kind === DpSamplesKind.Sampled &&
        record.samples.samples.some((sample) => sample.placedRiskCents !== null)
        ? [DP_PLACEMENT_ASSUMPTION_TEXT]
        : [];
}

function dpEligibilityTextOf(record: DpAdviceRecordInput): string {
    if (record.eligible) return 'Eligible for the DP solve.';
    return record.ineligibleReason === null
        ? 'Not eligible for the DP solve.'
        : `Not eligible for the DP solve: ${record.ineligibleReason}`;
}

function dpHiddenText(count: number): string {
    return count === 1
        ? '1 more DP solve with other settings is not shown.'
        : `${String(count)} more DP solves with other settings are not shown.`;
}

function dpNotValidatedReasonOf(record: DpAdviceRecordInput): string {
    if (record.gateFailure !== null) {
        return dpGateFailureText(record.gateFailure, record.gateResult);
    }
    return record.eligible
        ? DP_NOT_VALIDATED_NOT_STORED_TEXT
        : DP_NOT_VALIDATED_NOT_ELIGIBLE_TEXT;
}

function dpProvenanceTextOf(record: DpAdviceRecordInput): string {
    const solvedOn = record.solvedAt.toISOString().slice(0, 10);
    const solved =
        record.runtimeMs > 0
            ? `Solved ${solvedOn} in ${(record.runtimeMs / MS_PER_SECOND).toFixed(1)}s`
            : `Recorded ${solvedOn} without a solve`;
    return `${solved}, solver ${String(record.solverVersion)}, config ${record.configKey.slice(0, DP_CONFIG_KEY_PREFIX_LENGTH)}, objective ${SIZING_OBJECTIVE_LABEL[record.objective]}`;
}

function dpRungLabel(offset: number): string {
    if (offset === 0) return 'At your state';
    const rungs = Math.abs(offset);
    return `${String(rungs)} documented rung${rungs === 1 ? '' : 's'} ${offset > 0 ? 'up' : 'down'}`;
}

function dpSampleLineViewOf(
    offset: number,
    samples: readonly DpRiskSample[],
): DpSampleLineView {
    const ordered = samples.toSorted((a, b) => a.tradeIndex - b.tradeIndex);
    return {
        cushionText: dpMoney(ordered[0]?.cushionCents ?? 0),
        label: dpRungLabel(offset),
        riskTexts: ordered.map((sample) =>
            sample.placedRiskCents === null
                ? `Trade ${String(sample.tradeIndex + 1)}: ${dpMoney(sample.riskCents)}`
                : `Trade ${String(sample.tradeIndex + 1)}: ${dpMoney(sample.riskCents)} intended, ${dpMoney(sample.placedRiskCents)} placed`,
        ),
    };
}

function dpSamplesViewOf(samples: DpAdviceSamples): DpSamplesView {
    if (samples.kind === DpSamplesKind.Unavailable) {
        return {
            kind: DpSamplesViewKind.Unavailable,
            text: `DP risk is not shown: ${DP_SAMPLES_UNAVAILABLE_TEXT[samples.reason]}.`,
        };
    }
    const offsets = [
        ...new Set(samples.samples.map((sample) => sample.rungOffset)),
    ].toSorted((a, b) => a - b);
    return {
        kind: DpSamplesViewKind.Sampled,
        lines: offsets.map((offset) =>
            dpSampleLineViewOf(
                offset,
                samples.samples.filter(
                    (sample) => sample.rungOffset === offset,
                ),
            ),
        ),
        stageText: DP_STAGE_TEXT[samples.stage],
    };
}

function dpValidationTextOf(record: DpAdviceRecordInput): string {
    if (!record.validated) {
        return `Not validated: ${dpNotValidatedReasonOf(record)}. ${DP_NOT_VALIDATED_SUFFIX}`;
    }
    return record.validationRef === null
        ? 'Validated by a recorded gate run (no citation was stored).'
        : `Validated by ${record.validationRef}.`;
}

function dpValueText(sample: DpValueSample): string {
    const risk = sample.riskCents === null ? null : dpMoney(sample.riskCents);
    const adjusted =
        sample.rateAdjustedValueCents === null
            ? ''
            : ` (rate-adjusted ${dpMoney(sample.rateAdjustedValueCents)})`;
    const value = `value ${dpMoney(sample.valueCents)}${adjusted}`;
    switch (sample.kind) {
        case DpValueStateKind.AfterLoss: {
            return `After a loss${risk === null ? '' : ` at ${risk}`}: ${value}`;
        }
        case DpValueStateKind.AfterWin: {
            return `After a win${risk === null ? '' : ` at ${risk}`}: ${value}`;
        }
        case DpValueStateKind.Candidate: {
            return `Candidate risk${risk === null ? '' : ` ${risk}`}: ${value}`;
        }
        case DpValueStateKind.Current: {
            return `Your state: ${value}`;
        }
    }
}

function emptyCardTextOf(card: DailyPlanCard): string {
    const binding = card.dailyProfitCeiling ?? card.profitCeiling;
    return card.rungs.length === 0 &&
        card.stopReason === DayStopReason.CeilingReached &&
        binding?.constraint === SizingConstraint.ConsistencyCap
        ? CONSISTENCY_ONLY_EMPTY_TEXT
        : NO_TRADE_TEXT;
}

function figureOf(
    kind: OptimumFigureKind,
    label: string,
    unit: FigureUnit,
    value: number,
    standardError: null | number,
): OptimumFigureView {
    return {
        kind,
        label,
        standardError,
        standardErrorText:
            standardError === null || !Number.isFinite(standardError)
                ? null
                : figureValueText(unit, standardError),
        value,
        valueText: figureValueText(unit, value),
    };
}

function figureValueText(unit: FigureUnit, value: number): string {
    switch (unit) {
        case FigureUnit.Currency: {
            return formatCurrency(value, 2);
        }
        case FigureUnit.Days: {
            return value.toFixed(1);
        }
        case FigureUnit.Percent: {
            return formatPercent(value);
        }
    }
}

function firmMinimumNoticeText(notice: FirmMinimumAboveRequestNotice): string {
    return `Raised to the firm's ${formatCurrency(notice.minimumRequestAmount, 2)} minimum (requested ${formatCurrency(notice.requestedAmount, 2)}).`;
}

function fundedRefusalText(refusal: FundedCandidateRefusalDetail): string {
    switch (refusal.kind) {
        case FundedCandidateRefusal.InvalidLists: {
            return refusal.issues;
        }
        case FundedCandidateRefusal.LadderRungBelowOneContract: {
            return 'A ladder rung places below one contract at this stop.';
        }
        case FundedCandidateRefusal.NoCandidates: {
            return 'No funded candidate could be built for this plan and stop.';
        }
        case FundedCandidateRefusal.PercentNeedsStop: {
            return 'A percent-of-cushion candidate needs an instrument and stop.';
        }
    }
}

function fundedWinnerSentence(
    optimum: Pick<EngineOptimum, 'label' | 'policy'>,
    context: OptimumContext,
): string {
    if (context.cushion === null) return '';
    const risk = fundedWinnerRiskAt(optimum.policy, context.cushion);
    return ` Winner ${optimum.label} = ${wholeOrCents(risk)} at your cushion of ${wholeOrCents(context.cushion)}${contractsAtStopText(risk, context.placement)}.`;
}

function ladderOptimumRowOf(result: LadderEngineOptimumResult): OptimumRowView {
    switch (result.kind) {
        case LadderEngineOptimumResultKind.Refused: {
            return leftOutRow(
                result.source,
                ADVICE_SOURCE_LABEL[result.source],
                `${ladderRefusalText(result.refusal)}.`,
            );
        }
        case LadderEngineOptimumResultKind.Scored: {
            return scoredLadderRowOf(result);
        }
    }
}

function ladderText(ladder: readonly number[]): string {
    return ladder.map((rung) => wholeOrCents(rung)).join(', ');
}

function ledgerRowsOf(
    stage: SizingStage,
    limits: PersonalLimits,
): readonly OptimumRowView[] {
    const plan = limits.viewContext?.plan;
    if (plan === undefined || stage !== SizingStage.Eval) return [];
    const row = ledgerRecordedLadderFor(
        plan.id.firm,
        'variant' in plan.id ? plan.id.variant : null,
    );
    return row === null ? [] : [ledgerRecordedLadderRowOf(row)];
}

function leftOutRow(
    source: AdviceSource,
    label: string,
    issue: string,
): OptimumRowView {
    return {
        figures: [],
        label,
        ladder: null,
        source,
        standardError: null,
        status: OptimumRowStatus.LeftOut,
        text: `Left out: ${issue}`,
        value: null,
    };
}

function limitersTextOf(caps: readonly PayoutCap[]): string {
    const limiters = caps.flatMap((cap) => {
        switch (cap.kind) {
            case PayoutCapKind.BalanceShare: {
                return cap.limitsWithdrawable
                    ? [
                          `the ${formatPercent(cap.share, 0)} balance-share cap of ${formatCurrency(cap.amount, 2)}`,
                      ]
                    : [];
            }
            case PayoutCapKind.RemainingPayouts: {
                return [];
            }
            case PayoutCapKind.RequestCap: {
                return cap.limitsWithdrawable
                    ? [
                          `the per-request cap of ${formatCurrency(cap.amount, 2)}`,
                      ]
                    : [];
            }
        }
    });
    return limiters.length === 0
        ? NO_LIMITING_CAP_TEXT
        : formatConjunctionList(limiters);
}

function limitsNoteOf(
    source: EngineOptimumRunnerResult['source'],
    limits: PersonalLimits,
): null | string {
    switch (source) {
        case AdviceSource.FundedSweepFresh:
        case AdviceSource.FundedSweepFromState:
        case AdviceSource.NextPayoutProjection:
        case AdviceSource.PayoutSizeSweep: {
            return appliedLimitsNoteOf(limits);
        }
        case AdviceSource.LadderSearchFresh:
        case AdviceSource.LadderSearchFromState: {
            const note = appliedLimitsNoteOf(limits);
            return note === null ? null : `${note} ${LADDER_LIMITS_TEXT}`;
        }
    }
}

function limitsSuffixOf(isLimiting: boolean): string {
    return isLimiting ? ' (limits the withdrawable)' : '';
}

function nextPayoutProjectionRowOf(
    result: NextPayoutProjectionEngineOptimumResult,
): OptimumRowView {
    const { projection } = result;
    const timing = nextPayoutTimingOf(projection);
    const row = {
        figures: [],
        label: ADVICE_SOURCE_LABEL[result.source],
        ladder: null,
        source: result.source,
        status: OptimumRowStatus.Ready,
    };
    switch (timing.kind) {
        case NextPayoutTimingKind.AlreadyEligible: {
            return {
                ...row,
                standardError: null,
                text: `${NEXT_PAYOUT_ELIGIBLE_NOW_TEXT} (${nextPayoutEvidenceText(projection)}).`,
                value: null,
            };
        }
        case NextPayoutTimingKind.InDays: {
            return {
                ...row,
                figures: [
                    figureOf(
                        OptimumFigureKind.SessionsToFirstPayout,
                        'Sessions to the first payout',
                        FigureUnit.Days,
                        timing.sessionDays.value,
                        timing.sessionDays.standardError,
                    ),
                ],
                standardError: timing.sessionDays.standardError,
                text: `Expected ${timing.sessionDays.value.toFixed(1)} sessions to the first payout ${NEXT_PAYOUT_AMONG_PAYING_TEXT} (${nextPayoutEvidenceText(projection)}).`,
                value: timing.sessionDays.value,
            };
        }
        case NextPayoutTimingKind.NoTrialPaid: {
            return {
                ...row,
                standardError: null,
                text: `${NEXT_PAYOUT_NO_TRIAL_PAID_TEXT} (${nextPayoutEvidenceText(projection)}).`,
                value: null,
            };
        }
    }
}

function openItemsSummaryOf(count: number): string {
    if (count === 0) return 'no open items';
    return `${String(count)} open item${count === 1 ? '' : 's'}`;
}

function optimumContextOf(
    advice: Advice,
    limits: PersonalLimits,
): OptimumContext {
    return {
        cushion: advice.dailyPlanCard?.cushion ?? null,
        placement: limits.viewContext?.placement ?? null,
    };
}

function optimumRowsOf(
    result: EngineOptimumRunnerResult,
    context: OptimumContext,
): readonly OptimumRowView[] {
    switch (result.source) {
        case AdviceSource.FundedSweepFresh: {
            const { sweep } = result;
            if (sweep.kind === FundedSweepOptimumResultKind.NoCandidates) {
                return [
                    leftOutRow(
                        result.source,
                        ADVICE_SOURCE_LABEL[result.source],
                        fundedRefusalText(sweep.refusal),
                    ),
                ];
            }
            const { optimum } = sweep;
            return [
                {
                    figures: [
                        figureOf(
                            OptimumFigureKind.MonthlyNet,
                            'Expected monthly net',
                            FigureUnit.Currency,
                            optimum.expectedMonthlyNet,
                            optimum.expectedMonthlyNetStandardError,
                        ),
                        figureOf(
                            OptimumFigureKind.CreditFreeMonthlyNet,
                            'Realized monthly net',
                            FigureUnit.Currency,
                            optimum.expectedMonthlyRealizedNet,
                            optimum.expectedMonthlyRealizedNetStandardError,
                        ),
                    ],
                    label: `${ADVICE_SOURCE_LABEL[result.source]}: ${optimum.label}`,
                    ladder: null,
                    source: result.source,
                    standardError: optimum.expectedMonthlyNetStandardError,
                    status: OptimumRowStatus.Ready,
                    text: `Expected monthly net ${formatCurrency(optimum.expectedMonthlyNet, 2)}, incl. one capped end-of-horizon request credit; realized ${formatCurrency(optimum.expectedMonthlyRealizedNet, 2)}.${fundedWinnerSentence(optimum, context)}`,
                    value: optimum.expectedMonthlyNet,
                },
            ];
        }
        case AdviceSource.FundedSweepFromState: {
            const { sweep } = result;
            if (sweep.kind === FundedFromStateOptimumResultKind.NoCandidates) {
                return [
                    leftOutRow(
                        result.source,
                        ADVICE_SOURCE_LABEL[result.source],
                        fundedRefusalText(sweep.refusal),
                    ),
                ];
            }
            const { optimum } = sweep;
            return [
                {
                    figures: [
                        figureOf(
                            OptimumFigureKind.MonthlyNet,
                            'Expected cash from here',
                            FigureUnit.Currency,
                            optimum.fromStateExpectedCash,
                            optimum.fromStateExpectedCashStandardError,
                        ),
                        figureOf(
                            OptimumFigureKind.CreditFreeMonthlyNet,
                            'Realized cash from here',
                            FigureUnit.Currency,
                            optimum.fromStateExpectedRealizedCash,
                            optimum.fromStateExpectedRealizedCashStandardError,
                        ),
                    ],
                    label: `${ADVICE_SOURCE_LABEL[result.source]}: ${optimum.label}`,
                    ladder: null,
                    source: result.source,
                    standardError: optimum.fromStateExpectedCashStandardError,
                    status: OptimumRowStatus.Ready,
                    text: `Expected cash from here ${formatCurrency(optimum.fromStateExpectedCash, 2)}, incl. one capped end-of-horizon request credit; realized ${formatCurrency(optimum.fromStateExpectedRealizedCash, 2)}.${fundedWinnerSentence(optimum, context)}`,
                    value: optimum.fromStateExpectedCash,
                },
            ];
        }
        case AdviceSource.LadderSearchFresh:
        case AdviceSource.LadderSearchFromState: {
            return [ladderOptimumRowOf(result)];
        }
        case AdviceSource.NextPayoutProjection: {
            return [nextPayoutProjectionRowOf(result)];
        }
        case AdviceSource.PayoutSizeSweep: {
            return payoutSizeSweepRowsOf(result);
        }
    }
}

function payoutAdviceViewOf(advice: PayoutAdvice): PayoutAdviceViewModel {
    const { documented } = advice;
    return {
        capTexts: advice.caps.map((cap) => payoutCapText(cap)),
        documentedText: payoutRequestDecisionText(documented),
        engineHorizonCredit: advice.engineHorizonCredit,
        netAfterSplit: advice.netAfterSplit,
        noticeText:
            documented.kind === PayoutRequestDecisionKind.Request &&
            documented.notice !== null
                ? firmMinimumNoticeText(documented.notice)
                : null,
        personalOverrideWarningText:
            advice.personalOverrideWarning === undefined
                ? null
                : personalPayoutOverrideWarningText(
                      advice.personalOverrideWarning,
                  ),
        ruleCappedWithdrawable: advice.ruleCappedWithdrawable,
        withdrawableText:
            advice.ruleCappedWithdrawable === null
                ? null
                : `Rule-capped withdrawable ${formatCurrency(advice.ruleCappedWithdrawable, 2)}, limited by ${limitersTextOf(advice.caps)}`,
    };
}

function payoutCapText(cap: PayoutCap): string {
    switch (cap.kind) {
        case PayoutCapKind.BalanceShare: {
            return `Balance-share cap ${formatPercent(cap.share, 0)} of profit, ${formatCurrency(cap.amount, 2)}${limitsSuffixOf(cap.limitsWithdrawable)}`;
        }
        case PayoutCapKind.RemainingPayouts: {
            return `${String(cap.remaining)} payout${cap.remaining === 1 ? '' : 's'} remaining`;
        }
        case PayoutCapKind.RequestCap: {
            return `Per-request cap ${formatCurrency(cap.amount, 2)}${limitsSuffixOf(cap.limitsWithdrawable)}`;
        }
    }
}

function payoutRequestDecisionText(decision: PayoutRequestDecision): string {
    switch (decision.kind) {
        case PayoutRequestDecisionKind.NotEligible: {
            return `Not eligible: ${payoutBlockReasonText(decision.reason)}`;
        }
        case PayoutRequestDecisionKind.Request: {
            return `Request ${formatCurrency(decision.requestAmount, 2)}, retained cushion ${formatCurrency(decision.retainedCushion, 2)} (${RETAINED_CUSHION_BASIS_TEXT[decision.retainedCushionBasis]}).`;
        }
        case PayoutRequestDecisionKind.Unreachable: {
            return 'This payout is not reachable under the documented policy.';
        }
        case PayoutRequestDecisionKind.Wait: {
            return `Wait: ${payoutWaitText(decision.wait)}`;
        }
    }
}

function payoutRowFiguresOf(row: PayoutSizeSweepRow): PayoutRowFigures {
    const isFresh = row.kind === StartBasis.Fresh;
    const inclusive = isFresh
        ? {
              standardError: row.out.estimates.expectedMonthlyNet.standardError,
              value: row.out.expectedMonthlyNet,
          }
        : {
              standardError:
                  row.out.estimates.fromStateExpectedCash.standardError,
              value: row.out.fromStateExpectedCash,
          };
    const creditFree = isFresh
        ? {
              standardError:
                  row.out.estimates.expectedMonthlyRealizedNet.standardError,
              value: row.out.expectedMonthlyRealizedNet,
          }
        : {
              standardError:
                  row.out.estimates.fromStateExpectedRealizedCash.standardError,
              value: row.out.fromStateExpectedRealizedCash,
          };
    const monthly = figureOf(
        OptimumFigureKind.MonthlyNet,
        isFresh ? 'Monthly net' : 'Expected cash from here',
        FigureUnit.Currency,
        inclusive.value,
        inclusive.standardError,
    );
    const free = figureOf(
        OptimumFigureKind.CreditFreeMonthlyNet,
        isFresh ? 'Credit-free monthly net' : 'Credit-free cash from here',
        FigureUnit.Currency,
        creditFree.value,
        creditFree.standardError,
    );
    const bust = figureOf(
        OptimumFigureKind.BustRate,
        'Bust rate',
        FigureUnit.Percent,
        row.out.bustProbability,
        null,
    );
    return {
        figures: [monthly, free, bust],
        headlineStandardError: inclusive.standardError,
        headlineValue: inclusive.value,
        text: `${monthly.label} ${figureTextOf(monthly)}, ${free.label.toLowerCase()} ${figureTextOf(free)}, bust rate ${bust.valueText}.`,
    };
}

function payoutSizeSweepRowsOf(
    result: PayoutSizeSweepEngineOptimumResult,
): readonly OptimumRowView[] {
    const { sweep } = result;
    if (sweep.kind === PayoutSizeSweepResultKind.NoOptimum) {
        return [
            leftOutRow(
                result.source,
                ADVICE_SOURCE_LABEL[result.source],
                sweep.issue,
            ),
        ];
    }
    const { creditSensitive, personalOverride, winner } = sweep.optimum;
    const sweepLabel = ADVICE_SOURCE_LABEL[result.source];
    const winnerFigures = payoutRowFiguresOf(winner);
    const winnerRow: OptimumRowView = {
        figures: winnerFigures.figures,
        label: `${sweepLabel}: request ${formatCurrency(winner.requestSize, 0)}`,
        ladder: null,
        source: result.source,
        standardError: winnerFigures.headlineStandardError,
        status: OptimumRowStatus.Ready,
        text: `Best payout size ${formatCurrency(winner.requestSize, 0)}${creditSensitive ? ' (credit-sensitive: the credit-free ranking differs)' : ''}. ${winnerFigures.text}`,
        value: winnerFigures.headlineValue,
    };
    if (personalOverride === null) return [winnerRow];
    const overrideFigures = payoutRowFiguresOf(personalOverride.row);
    return [
        winnerRow,
        {
            figures: overrideFigures.figures,
            label: `${sweepLabel}: your payout request ${formatCurrency(personalOverride.row.requestSize, 0)}`,
            ladder: null,
            source: result.source,
            standardError: overrideFigures.headlineStandardError,
            status: OptimumRowStatus.Ready,
            text: `Your payout request ${formatCurrency(personalOverride.row.requestSize, 0)}. ${overrideFigures.text}`,
            value: overrideFigures.headlineValue,
        },
    ];
}

function payoutWaitText(wait: PayoutWait): string {
    switch (wait.basis) {
        case PayoutWaitBasis.CalendarDays: {
            return `${String(wait.daysStillNeeded)} more calendar day${wait.daysStillNeeded === 1 ? '' : 's'} needed.`;
        }
        case PayoutWaitBasis.NoClosedForm: {
            return 'No closed-form wait estimate is available.';
        }
        case PayoutWaitBasis.Profit: {
            return `${formatCurrency(wait.profitStillNeeded, 2)} more profit needed.`;
        }
        case PayoutWaitBasis.QualifyingDays: {
            return `${String(wait.daysStillNeeded)} more qualifying day${wait.daysStillNeeded === 1 ? '' : 's'} needed.`;
        }
    }
}

function scoredLadderRowOf(
    result: LadderScoredEngineOptimumResult,
): OptimumRowView {
    const label = ADVICE_SOURCE_LABEL[result.source];
    const winner = result.ladder.bySpeed[0];
    const unscorableNote = describeUnscorableLadderRun(result.ladder);
    if (winner === undefined) {
        return leftOutRow(
            result.source,
            label,
            unscorableNote ?? 'No ladder scored within the grid.',
        );
    }
    const isFromState = result.source === AdviceSource.LadderSearchFromState;
    const costLabel = isFromState
        ? 'remaining cost to funded, sunk fees excluded'
        : 'cost per funded';
    const fresh = isFromState ? winner.freshAttempt : undefined;
    const sentences = [
        `Fastest-to-funded ladder ${ladderText(winner.ladder)}. Pass rate ${formatPercent(winner.passRate)}, ${winner.expectedDaysToFunded.toFixed(1)} days to funded, ${costLabel} ${formatCurrency(winner.costPerFunded, 2)}.`,
        ...(fresh === undefined
            ? []
            : [
                  `A fresh attempt from scratch: pass rate ${formatPercent(fresh.passRate)}, ${fresh.meanDaysOnPass.toFixed(1)} days on a pass, ${fresh.meanDaysOnFail.toFixed(1)} days on a fail.`,
              ]),
        ...(isFromState && winner.passRate === 1
            ? [LADDER_CERTAIN_PASS_TEXT]
            : []),
        ...(unscorableNote === null ? [] : [unscorableNote]),
    ];
    return {
        figures: [
            figureOf(
                OptimumFigureKind.PassRate,
                'Pass rate',
                FigureUnit.Percent,
                winner.passRate,
                winner.passRateStandardError,
            ),
            figureOf(
                OptimumFigureKind.DaysToFunded,
                'Days to funded',
                FigureUnit.Days,
                winner.expectedDaysToFunded,
                winner.expectedDaysToFundedStandardError,
            ),
            figureOf(
                OptimumFigureKind.CostPerFunded,
                isFromState
                    ? 'Remaining cost to funded, sunk fees excluded'
                    : 'Cost per funded',
                FigureUnit.Currency,
                winner.costPerFunded,
                winner.costPerFundedStandardError,
            ),
            ...(fresh === undefined
                ? []
                : [
                      figureOf(
                          OptimumFigureKind.FreshAttemptPassRate,
                          'Fresh attempt pass rate',
                          FigureUnit.Percent,
                          fresh.passRate,
                          fresh.passRateStandardError,
                      ),
                  ]),
        ],
        label,
        ladder: winner.ladder,
        source: result.source,
        standardError: winner.expectedDaysToFundedStandardError,
        status: OptimumRowStatus.Ready,
        text: sentences.join(' '),
        value: winner.expectedDaysToFunded,
    };
}

function simulationTextOf(provenance: ProvenanceView): string {
    if (provenance.trials === null) return 'no simulation run';
    const trials = `simulated, ${provenance.trials.toLocaleString('en-US')} trials`;
    return provenance.seed === null
        ? trials
        : `${trials}, seed ${String(provenance.seed)}`;
}

function wholeOrCents(amount: number): string {
    return formatCurrency(amount, Number.isSafeInteger(amount) ? 0 : 2);
}

function windowRuleTextOf(maxTradesPerWindow: number): string {
    return `Hard Rule 6: at most ${maxTradesPerWindow === 1 ? 'one trade' : `${String(maxTradesPerWindow)} trades`} per trading window`;
}

function withLimitsNote(
    row: OptimumRowView,
    source: EngineOptimumRunnerResult['source'],
    limits: PersonalLimits,
): OptimumRowView {
    if (row.status === OptimumRowStatus.LeftOut) return row;
    const note = limitsNoteOf(source, limits);
    return note === null ? row : { ...row, text: `${row.text} ${note}` };
}
