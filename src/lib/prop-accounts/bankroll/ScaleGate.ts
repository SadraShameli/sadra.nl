import {
    sampleAdequacy,
    SampleKind,
    SampleLevel,
} from '~/lib/prop-accounts/core';
import {
    attemptsOf,
    type CentsEstimate,
    type CohortMultiple,
    fundedSince,
    pooledEndedCohortMultiple,
    type PortfolioLedger,
    realizedNetPerSlot,
} from '~/lib/prop-accounts/metrics';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';
import { NOISE_STANDARD_ERRORS } from '~/lib/prop-calculator/stats';

export enum ScaleGateStatus {
    NotEnoughSample = 'not-enough-sample',
    NotPositiveAfterCost = 'not-positive-after-cost',
    Ready = 'ready',
    ThresholdsNotSet = 'thresholds-not-set',
}

export enum ScaleGateUnmetCondition {
    CohortMultipleNotAboveOne = 'cohort-multiple-not-above-one',
    CohortSampleBelowThreshold = 'cohort-sample-below-threshold',
    EvalAttemptsBelowThreshold = 'eval-attempts-below-threshold',
    FundedAccountsBelowThreshold = 'funded-accounts-below-threshold',
    PooledNetNotBeyondNoise = 'pooled-net-not-beyond-noise',
    TradesBelowThreshold = 'trades-below-threshold',
}

export interface ScaleGate {
    readonly status: ScaleGateStatus;
    readonly unmetConditions: readonly ScaleGateUnmetCondition[];
}

export interface ScaleGateInputs {
    readonly cohortMultiple: CohortMultiple | null;
    readonly evalAttempts: number;
    readonly fundedAccounts: number;
    readonly pooledNetPerSlot: CentsEstimate | null;
    readonly thresholds: SampleThresholds;
    readonly trades: number;
}

export const SCALE_GATE_STATUS_TEXT: Readonly<Record<ScaleGateStatus, string>> =
    {
        [ScaleGateStatus.NotEnoughSample]: 'Not enough sample',
        [ScaleGateStatus.NotPositiveAfterCost]: 'Not positive after cost',
        [ScaleGateStatus.Ready]: 'Ready to scale',
        [ScaleGateStatus.ThresholdsNotSet]: 'Sample thresholds not set',
    };

const SAMPLE_UNMET_CONDITIONS: ReadonlySet<ScaleGateUnmetCondition> = new Set([
    ScaleGateUnmetCondition.CohortSampleBelowThreshold,
    ScaleGateUnmetCondition.EvalAttemptsBelowThreshold,
    ScaleGateUnmetCondition.FundedAccountsBelowThreshold,
    ScaleGateUnmetCondition.TradesBelowThreshold,
]);

export function scaleGateFromLedger(
    ledger: PortfolioLedger,
    asOf: string,
    thresholds: SampleThresholds,
    trades: number,
): ScaleGate {
    const evalAttempts = ledger.accounts.reduce(
        (sum, entry) => sum + attemptsOf(entry),
        0,
    );
    const fundedAccounts = ledger.resolvedAccounts.filter(
        (entry) => fundedSince(entry) !== null,
    ).length;
    return scaleGateOf({
        cohortMultiple: pooledEndedCohortMultiple(ledger),
        evalAttempts,
        fundedAccounts,
        pooledNetPerSlot: realizedNetPerSlot(ledger, asOf).pooled,
        thresholds,
        trades,
    });
}

export function scaleGateOf(inputs: ScaleGateInputs): ScaleGate {
    const { thresholds } = inputs;
    const areThresholdsSet =
        thresholds.minEvalAttempts !== null &&
        thresholds.minFundedAccounts !== null &&
        thresholds.minTrades !== null;
    if (!areThresholdsSet) {
        return {
            status: ScaleGateStatus.ThresholdsNotSet,
            unmetConditions: [],
        };
    }
    const unmetConditions: ScaleGateUnmetCondition[] = [];
    if (
        sampleAdequacy(
            SampleKind.EvalAttempts,
            inputs.evalAttempts,
            thresholds,
        ) !== SampleLevel.Adequate
    ) {
        unmetConditions.push(
            ScaleGateUnmetCondition.EvalAttemptsBelowThreshold,
        );
    }
    if (
        sampleAdequacy(
            SampleKind.FundedAccounts,
            inputs.fundedAccounts,
            thresholds,
        ) !== SampleLevel.Adequate
    ) {
        unmetConditions.push(
            ScaleGateUnmetCondition.FundedAccountsBelowThreshold,
        );
    }
    if (
        sampleAdequacy(SampleKind.Trades, inputs.trades, thresholds) !==
        SampleLevel.Adequate
    ) {
        unmetConditions.push(ScaleGateUnmetCondition.TradesBelowThreshold);
    }
    if (!isPooledNetBeyondNoise(inputs.pooledNetPerSlot)) {
        unmetConditions.push(ScaleGateUnmetCondition.PooledNetNotBeyondNoise);
    }
    if (
        sampleAdequacy(
            SampleKind.EndedAccounts,
            inputs.cohortMultiple?.n ?? 0,
            thresholds,
        ) !== SampleLevel.Adequate
    ) {
        unmetConditions.push(
            ScaleGateUnmetCondition.CohortSampleBelowThreshold,
        );
    }
    if (!isCohortMultipleAboveOne(inputs.cohortMultiple)) {
        unmetConditions.push(ScaleGateUnmetCondition.CohortMultipleNotAboveOne);
    }
    if (unmetConditions.length === 0) {
        return { status: ScaleGateStatus.Ready, unmetConditions: [] };
    }
    const status = unmetConditions.some((condition) =>
        SAMPLE_UNMET_CONDITIONS.has(condition),
    )
        ? ScaleGateStatus.NotEnoughSample
        : ScaleGateStatus.NotPositiveAfterCost;
    return { status, unmetConditions };
}

function isCohortMultipleAboveOne(
    cohortMultiple: CohortMultiple | null,
): boolean {
    return (
        cohortMultiple !== null &&
        cohortMultiple.value !== null &&
        cohortMultiple.value > 1
    );
}

function isPooledNetBeyondNoise(
    pooledNetPerSlot: CentsEstimate | null,
): boolean {
    return (
        pooledNetPerSlot?.standardError != null &&
        pooledNetPerSlot.value >
            NOISE_STANDARD_ERRORS * pooledNetPerSlot.standardError
    );
}
