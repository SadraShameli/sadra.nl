import { payoutBlockReasonText } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import { assumptionLabel } from '~/app/(app)/prop-calculator/accounts/_components/detail/detailState';
import { formatCurrency } from '~/lib/format';
import {
    type AccountAction,
    type Advice,
    type AdviceProvenance,
    AdviceSource,
    AdviceStalenessReason,
    type Assumption,
    type AssumptionBias,
    AssumptionKind,
    type DailyPlanCard,
    DAY_STOP_REASON_TEXT,
    type DifferenceReason,
    differenceReasonText,
    type DocumentedSizing,
    type EngineOptimumRequest,
    type EngineOptimumRunnerResult,
    type FirmMinimumAboveRequestNotice,
    FundedFromStateOptimumResultKind,
    FundedSweepOptimumResultKind,
    type LadderGridRefusal,
    type PayoutAdvice,
    type PayoutRequestDecision,
    PayoutRequestDecisionKind,
    PayoutSizeSweepResultKind,
    type PayoutWait,
    PayoutWaitBasis,
    RetainedCushionBasis,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
    type SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    FundedCandidateRefusal,
    type FundedCandidateRefusalDetail,
} from '~/lib/prop-calculator/optimize';

import { accountActionFor } from './accountActionModel';

export { payoutBlockReasonText } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';

export enum AdviceDisplayKind {
    Ready = 'ready',
    Stale = 'stale',
}

export enum OptimumRowStatus {
    LeftOut = 'left-out',
    Ready = 'ready',
}

export type AdviceViewModel = ReadyAdviceViewModel | StaleAdviceViewModel;

export interface AssumptionView {
    readonly bias: AssumptionBias;
    readonly text: string;
}

export interface DailyPlanCardViewModel {
    readonly rungs: readonly RungView[];
    readonly stopCappedByText: readonly string[];
    readonly stopReasonText: string;
    readonly valueAfterLoss: null | number;
    readonly valueAfterWin: null | number;
    readonly valueNow: null | number;
}

export interface OptimumRowView {
    readonly label: string;
    readonly source: AdviceSource;
    readonly standardError: null | number;
    readonly status: OptimumRowStatus;
    readonly text: string;
    readonly value: null | number;
}

export interface PayoutAdviceViewModel {
    readonly documentedText: string;
    readonly engineHorizonCredit: null | number;
    readonly netAfterSplit: null | number;
    readonly noticeText: null | string;
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

export const STALE_ADVICE_MESSAGE =
    "Enter today's balance to see sized amounts again.";

const STALE_REASON_TEXT: Readonly<Record<AdviceStalenessReason, string>> = {
    [AdviceStalenessReason.FundedSnapshotStale]:
        'The funded balance snapshot is older than your review cadence allows.',
    [AdviceStalenessReason.PlanRulesChanged]:
        "This plan's rules changed since this advice was computed.",
    [AdviceStalenessReason.SessionSnapshotStale]:
        'More than one trading session has passed since the last balance entry.',
};

const RETAINED_CUSHION_BASIS_TEXT: Readonly<
    Record<RetainedCushionBasis, string>
> = {
    [RetainedCushionBasis.HardRule2Default]: "Hard Rule 2's default",
    [RetainedCushionBasis.LiveOneDrawdown]: 'one live drawdown',
    [RetainedCushionBasis.PersonalOverride]: 'your personal override',
    [RetainedCushionBasis.RulebookSize]: 'your rulebook size',
};

const REQUEST_SOURCE_LABEL: Readonly<
    Record<EngineOptimumRequest['source'], string>
> = {
    [AdviceSource.FundedSweepFresh]: 'Fresh funded sweep',
    [AdviceSource.FundedSweepFromState]: 'From-state funded sweep',
    [AdviceSource.LadderSearchFresh]: 'Ladder search (fresh start)',
    [AdviceSource.LadderSearchFromState]: 'Ladder search (from state)',
    [AdviceSource.NextPayoutProjection]: 'Next payout projection',
    [AdviceSource.PayoutSizeSweep]: 'Payout-size sweep',
};

export function adviceViewModel(advice: Advice): AdviceViewModel {
    const headline = `${advice.headline}, as of ${advice.provenance.snapshotDate}`;
    const { action } = accountActionFor(advice);
    if (advice.staleness.kind === 'stale') {
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
    return {
        action,
        assumptions: advice.assumptions.map((assumption) =>
            assumptionViewOf(assumption, advice.requests),
        ),
        dailyPlanCard:
            advice.dailyPlanCard === null
                ? null
                : dailyPlanCardViewOf(advice.dailyPlanCard),
        documented: advice.documented,
        headline,
        kind: AdviceDisplayKind.Ready,
        optima: advice.optima.map(optimumRowOf),
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

export function leftOutOptimumRow(
    source: EngineOptimumRequest['source'],
    reason: string,
): OptimumRowView {
    return leftOutRow(source, REQUEST_SOURCE_LABEL[source], reason);
}

function assumptionTextOf(
    assumption: Assumption,
    requests: readonly EngineOptimumRequest[],
): string {
    if (assumption.kind === AssumptionKind.SizingRule) {
        return SIZING_ASSUMPTION_TEXT[assumption.sizingAssumption];
    }
    const label = assumptionLabel(assumption.kind);
    if (assumption.kind !== AssumptionKind.LadderStepWidened) return label;
    const step = ladderStepOf(requests);
    return step === null
        ? label
        : `${label} It searched in ${formatCurrency(step, 0)} steps.`;
}

function assumptionViewOf(
    assumption: Assumption,
    requests: readonly EngineOptimumRequest[],
): AssumptionView {
    return {
        bias: assumption.bias,
        text: assumptionTextOf(assumption, requests),
    };
}

function dailyPlanCardViewOf(card: DailyPlanCard): DailyPlanCardViewModel {
    return {
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
    };
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

function ladderRefusalText(refusal: LadderGridRefusal): string {
    return `ladder search not run: grid too large (${refusal.size.toLocaleString('en-US')} ladders, above the ${refusal.limit.toLocaleString('en-US')} limit).`;
}

function ladderStepOf(
    requests: readonly EngineOptimumRequest[],
): null | number {
    for (const request of requests) {
        if (
            request.source === AdviceSource.LadderSearchFresh ||
            request.source === AdviceSource.LadderSearchFromState
        ) {
            return request.grid.step;
        }
    }
    return null;
}

function leftOutRow(
    source: AdviceSource,
    label: string,
    issue: string,
): OptimumRowView {
    return {
        label,
        source,
        standardError: null,
        status: OptimumRowStatus.LeftOut,
        text: `Left out: ${issue}`,
        value: null,
    };
}

function optimumRowOf(result: EngineOptimumRunnerResult): OptimumRowView {
    switch (result.source) {
        case AdviceSource.FundedSweepFresh: {
            const { sweep } = result;
            if (sweep.kind === FundedSweepOptimumResultKind.NoCandidates) {
                return leftOutRow(
                    result.source,
                    REQUEST_SOURCE_LABEL[result.source],
                    fundedRefusalText(sweep.refusal),
                );
            }
            const { optimum } = sweep;
            return {
                label: `${REQUEST_SOURCE_LABEL[result.source]}: ${optimum.label}`,
                source: result.source,
                standardError: optimum.expectedMonthlyNetStandardError,
                status: OptimumRowStatus.Ready,
                text: `Expected monthly net ${formatCurrency(optimum.expectedMonthlyNet, 2)}, incl. one capped end-of-horizon request credit; realized ${formatCurrency(optimum.expectedMonthlyRealizedNet, 2)}.`,
                value: optimum.expectedMonthlyNet,
            };
        }
        case AdviceSource.FundedSweepFromState: {
            const { sweep } = result;
            if (sweep.kind === FundedFromStateOptimumResultKind.NoCandidates) {
                return leftOutRow(
                    result.source,
                    REQUEST_SOURCE_LABEL[result.source],
                    fundedRefusalText(sweep.refusal),
                );
            }
            const { optimum } = sweep;
            return {
                label: `${REQUEST_SOURCE_LABEL[result.source]}: ${optimum.label}`,
                source: result.source,
                standardError: optimum.fromStateExpectedCashStandardError,
                status: OptimumRowStatus.Ready,
                text: `Expected cash from here ${formatCurrency(optimum.fromStateExpectedCash, 2)}, incl. one capped end-of-horizon request credit; realized ${formatCurrency(optimum.fromStateExpectedRealizedCash, 2)}.`,
                value: optimum.fromStateExpectedCash,
            };
        }
        case AdviceSource.LadderSearchFresh:
        case AdviceSource.LadderSearchFromState: {
            if ('refusal' in result) {
                return leftOutRow(
                    result.source,
                    REQUEST_SOURCE_LABEL[result.source],
                    ladderRefusalText(result.refusal),
                );
            }
            const winner = result.ladder.bySpeed[0];
            if (winner === undefined) {
                return leftOutRow(
                    result.source,
                    REQUEST_SOURCE_LABEL[result.source],
                    'No ladder scored within the grid.',
                );
            }
            return {
                label: REQUEST_SOURCE_LABEL[result.source],
                source: result.source,
                standardError: winner.expectedDaysToFundedStandardError,
                status: OptimumRowStatus.Ready,
                text: `Pass rate ${(winner.passRate * 100).toFixed(1)}%, ${winner.expectedDaysToFunded.toFixed(1)} days to funded, cost per funded ${formatCurrency(winner.costPerFunded, 2)}.`,
                value: winner.expectedDaysToFunded,
            };
        }
        case AdviceSource.NextPayoutProjection: {
            const { projection } = result;
            return {
                label: REQUEST_SOURCE_LABEL[result.source],
                source: result.source,
                standardError:
                    projection.expectedSessionDaysToFirstPayout.standardError,
                status: OptimumRowStatus.Ready,
                text: `Expected ${projection.expectedSessionDaysToFirstPayout.value.toFixed(1)} sessions to the first payout (n=${String(projection.trials)}).`,
                value: projection.expectedSessionDaysToFirstPayout.value,
            };
        }
        case AdviceSource.PayoutSizeSweep: {
            const { sweep } = result;
            if (sweep.kind === PayoutSizeSweepResultKind.NoOptimum) {
                return leftOutRow(
                    result.source,
                    REQUEST_SOURCE_LABEL[result.source],
                    sweep.issue,
                );
            }
            const { winner } = sweep.optimum;
            const value =
                winner.kind === StartBasis.Fresh
                    ? winner.out.expectedMonthlyNet
                    : winner.out.fromStateExpectedCash;
            return {
                label: `${REQUEST_SOURCE_LABEL[result.source]}: request ${formatCurrency(winner.requestSize, 0)}`,
                source: result.source,
                standardError: null,
                status: OptimumRowStatus.Ready,
                text: `Best payout size ${formatCurrency(winner.requestSize, 0)}${sweep.optimum.creditSensitive ? ' (credit-sensitive: the credit-free ranking differs)' : ''}.`,
                value,
            };
        }
    }
}

function payoutAdviceViewOf(advice: PayoutAdvice): PayoutAdviceViewModel {
    const { documented } = advice;
    return {
        documentedText: payoutRequestDecisionText(documented),
        engineHorizonCredit: advice.engineHorizonCredit,
        netAfterSplit: advice.netAfterSplit,
        noticeText:
            documented.kind === PayoutRequestDecisionKind.Request &&
            documented.notice !== null
                ? firmMinimumNoticeText(documented.notice)
                : null,
    };
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
