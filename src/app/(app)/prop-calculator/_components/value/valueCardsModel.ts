import { z } from 'zod';

import { planReferenceOf } from '~/app/(app)/prop-calculator/_components/bankroll/bankrollModel';
import { CALCULATOR_FIELD_LABELS } from '~/app/(app)/prop-calculator/_components/calculatorFieldLabels';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import {
    ToolsWorkerPhase,
    type ToolsWorkerState,
} from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import {
    type BankrollPlanReference,
    type FundedValueEstimateToolsRequest,
    ToolsRequestKind,
    type ValueChainToolsRequest,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { formatGateCurrency } from '~/lib/format';
import {
    CENTS_PER_DOLLAR,
    findFirm,
    points,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    type CumulativePayoutTriggerAssumption,
    type DocumentedPolicySpec,
    type EnginePolicy,
    enginePolicySchema,
    type LiveTransferHazardAssumption,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import {
    CreditBasis,
    type FundedValueSampleRange,
    VALUE_CHAIN_STEP_ORDER,
    type ValueChainResult,
    type ValueChainStepKind,
    valueGap,
} from '~/lib/prop-calculator/advisor/value';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

import { VALUE_CHAIN_STEP_LABEL } from './valueChainStepLabels';

export enum ValueCardsInputKind {
    Ready = 'ready',
    Refused = 'refused',
}

export type ValueCardsCalculatorInputs = Pick<
    CalculatorState,
    | 'fundedHorizonDays'
    | 'instrument'
    | 'maxEvalDays'
    | 'payoutRequestSize'
    | 'plan'
    | 'retainedCushion'
    | 'seed'
    | 'stopPoints'
    | 'takesFundedReset'
    | 'takesOneTimeEarlyWithdrawal'
    | 'trials'
>;

export type ValueCardsInput =
    | {
          readonly cards: ValueCardsSpec;
          readonly kind: ValueCardsInputKind.Ready;
      }
    | { readonly kind: ValueCardsInputKind.Refused; readonly reason: string };

export interface ValueCardsSpec {
    readonly plan: BankrollPlanReference;
    readonly spec: DocumentedPolicySpec;
}

export interface ValueChainCardFailure {
    readonly kind: ValueChainStepKind;
    readonly text: string;
}

export interface ValueChainCardStep {
    readonly assumptions: readonly string[];
    readonly creditFree: UncertainValue;
    readonly creditInclusive: UncertainValue;
    readonly cumulativePayoutTrigger:
        | CumulativePayoutTriggerAssumption
        | undefined;
    readonly gapFromPrevious: null | UncertainValue;
    readonly kind: ValueChainStepKind;
    readonly liveTransfer: LiveTransferHazardAssumption | undefined;
}

const positiveIntSchema = z.coerce.number().int().positive();

const UNLABELLED_FIELD_TEXT = 'Engine policy';

export function calculatorFieldLabelOf(path: readonly PropertyKey[]): string {
    const [key] = path;
    if (key === undefined) return UNLABELLED_FIELD_TEXT;
    const labelled = Object.entries(CALCULATOR_FIELD_LABELS).find(
        ([field]) => field === key,
    );
    return labelled?.[1] ?? path.map(String).join('.');
}

export function fundedValueEstimateToolsRequest(
    cards: ValueCardsSpec,
    sampleSize: null | number,
    runId: number,
): FundedValueEstimateToolsRequest {
    return {
        kind: ToolsRequestKind.FundedValueEstimate,
        plan: cards.plan,
        runId,
        sampleSize,
        spec: cards.spec,
    };
}

export function fundedValueSampleSize(
    rulebookThreshold: null | number,
    entered: null | number,
): null | number {
    return entered ?? rulebookThreshold;
}

export function isInvalidSampleSizeField(raw: string): boolean {
    return raw.trim() !== '' && parseFundedValueSampleSizeField(raw) === null;
}

export function parseFundedValueSampleSizeField(raw: string): null | number {
    const parsed = positiveIntSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
}

export function sampleRangeSubText(
    range: FundedValueSampleRange | null,
): string {
    return range === null
        ? 'enter a sample size'
        : `${range.label}, n = ${String(range.sampleSize)}`;
}

export function sampleRangeText(
    range: FundedValueSampleRange | null,
): null | string {
    return range === null
        ? null
        : `${range.lower.toFixed(2)} to ${range.upper.toFixed(2)}`;
}

export function signedCurrencyText(amount: number): string {
    return `${amount >= 0 ? '+' : ''}${formatGateCurrency(amount)}`;
}

export function toolsWorkerFailureReason(
    state: ToolsWorkerState,
): null | string {
    return state.phase === ToolsWorkerPhase.Failed ? state.reason : null;
}

export function toolsWorkerPendingText(state: ToolsWorkerState): null | string {
    switch (state.phase) {
        case ToolsWorkerPhase.Cancelled: {
            return 'Computation cancelled.';
        }
        case ToolsWorkerPhase.Failed:
        case ToolsWorkerPhase.Idle:
        case ToolsWorkerPhase.Succeeded: {
            return null;
        }
        case ToolsWorkerPhase.Running: {
            return 'Computing...';
        }
    }
}

export function uncertainCountText(value: UncertainValue): string {
    return value.standardError === null
        ? value.value.toFixed(2)
        : `${value.value.toFixed(2)} ± ${value.standardError.toFixed(2)}`;
}

export function uncertainCurrencyText(value: UncertainValue): string {
    return value.standardError === null
        ? formatGateCurrency(value.value)
        : `${formatGateCurrency(value.value)} ± ${formatGateCurrency(value.standardError)}`;
}

export function valueCardsInputFor(
    inputs: ValueCardsCalculatorInputs,
    rulebook: RulebookParameters,
): ValueCardsInput {
    const plan = withPlanOptIns(inputs.plan, {
        takesFundedReset: inputs.takesFundedReset,
        takesOneTimeEarlyWithdrawal: inputs.takesOneTimeEarlyWithdrawal,
    });
    const { policy: builtPolicy } = buildEnginePolicy({
        accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
        fundedHorizonDays: inputs.fundedHorizonDays,
        measuredRebuyLag: null,
        plan,
        positionSizing:
            inputs.instrument === null || inputs.stopPoints === null
                ? null
                : {
                      instrument: inputs.instrument,
                      stopPoints: points(inputs.stopPoints),
                  },
        rulebook,
    });
    const effectivePayoutRequestSize =
        inputs.payoutRequestSize ??
        rulebook.payout.requestCents / CENTS_PER_DOLLAR;
    const parsedPolicy = enginePolicySchema.safeParse({
        ...builtPolicy,
        payoutRequestOverride: effectivePayoutRequestSize,
        retainedCushionRequest:
            inputs.retainedCushion ?? builtPolicy.retainedCushionRequest,
    });
    if (!parsedPolicy.success) {
        return {
            kind: ValueCardsInputKind.Refused,
            reason: parsedPolicy.error.issues
                .map(
                    (issue) =>
                        `${calculatorFieldLabelOf(issue.path)}: ${issue.message}`,
                )
                .join('; '),
        };
    }
    const policy: EnginePolicy = parsedPolicy.data;
    const cards: ValueCardsSpec = {
        plan: planReferenceOf(plan),
        spec: {
            enginePolicy: policy,
            rulebook,
            run: {
                maxEvalDays: inputs.maxEvalDays,
                seed: inputs.seed,
                trials: inputs.trials,
            },
        },
    };
    return { cards, kind: ValueCardsInputKind.Ready };
}

export function valueChainCardFailures(
    result: ValueChainResult,
): readonly ValueChainCardFailure[] {
    return result.failedSteps
        .toSorted(
            (left, right) =>
                VALUE_CHAIN_STEP_ORDER.indexOf(left.kind) -
                VALUE_CHAIN_STEP_ORDER.indexOf(right.kind),
        )
        .map((failure) => ({
            kind: failure.kind,
            text: `${VALUE_CHAIN_STEP_LABEL[failure.kind]}: ${failure.reason}`,
        }));
}

export function valueChainCardSteps(
    result: ValueChainResult,
): readonly ValueChainCardStep[] {
    return result.steps.map((step) => {
        const precedingKind =
            VALUE_CHAIN_STEP_ORDER[
                VALUE_CHAIN_STEP_ORDER.indexOf(step.kind) - 1
            ];
        const previous =
            precedingKind === undefined
                ? null
                : (result.steps.find(
                      (candidate) => candidate.kind === precedingKind,
                  ) ?? null);
        return {
            assumptions: step.assumptions,
            creditFree: step.value.creditFree,
            creditInclusive: step.value.creditInclusive,
            cumulativePayoutTrigger: step.value.cumulativePayoutTrigger,
            gapFromPrevious:
                previous === null
                    ? null
                    : valueGap(
                          previous.value,
                          step.value,
                          CreditBasis.CreditFree,
                      ),
            kind: step.kind,
            liveTransfer: step.value.liveTransfer,
        };
    });
}

export function valueChainToolsRequest(
    cards: ValueCardsSpec,
    runId: number,
): ValueChainToolsRequest {
    return {
        kind: ToolsRequestKind.ValueChain,
        plan: cards.plan,
        runId,
        spec: cards.spec,
    };
}
