import {
    type CumulativePayoutTriggerAssumption,
    liveTransferAssumptionOf,
    type LiveTransferHazardAssumption,
} from '~/lib/prop-calculator/advisor/Assumption';
import {
    type DocumentedPolicySpec,
    pricedCumulativeTriggerAssumptionOf,
    toSimInputs,
} from '~/lib/prop-calculator/advisor/policy';
import { type Plan } from '~/lib/prop-calculator/core';
import {
    type FromStateSimInputs,
    simulateFromState,
} from '~/lib/prop-calculator/simulator';
import {
    NINETY_FIVE_PERCENT_Z,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

import { startStateOf } from './ValueAtState';
import { freshFundedAccount } from './ValueChain';

export const FUNDED_VALUE_SAMPLE_RANGE_LABEL =
    'what your own n accounts could show by chance';

export interface FundedValueEstimateResult {
    readonly cumulativePayoutTrigger?: CumulativePayoutTriggerAssumption;
    readonly liveTransfer?: LiveTransferHazardAssumption;
    readonly meanPayoutsPerAccount: UncertainValue;
    readonly payoutCountDistribution: readonly number[];
    readonly probabilityZeroPayouts: UncertainValue;
    readonly sampleRange: FundedValueSampleRange | null;
    readonly seed: number;
    readonly trials: number;
}

export interface FundedValueSampleRange {
    readonly label: typeof FUNDED_VALUE_SAMPLE_RANGE_LABEL;
    readonly lower: number;
    readonly sampleSize: number;
    readonly upper: number;
}

export function fundedValueEstimate(
    plan: Plan,
    spec: DocumentedPolicySpec,
    sampleSize: null | number,
): FundedValueEstimateResult {
    if (
        sampleSize !== null &&
        (!Number.isSafeInteger(sampleSize) || sampleSize <= 0)
    ) {
        throw new RangeError(
            `fundedValueEstimate: sampleSize must be a positive integer or null, got ${sampleSize}`,
        );
    }
    const account = freshFundedAccount(plan);
    const base = toSimInputs(plan, spec);
    const inputs: FromStateSimInputs = {
        ...base,
        start: startStateOf(base.plan, account),
    };
    const out = simulateFromState(inputs);
    const distribution = out.fundedPayoutCountDistribution;
    const mean = out.estimates.payoutsPerFundedAccount.value;
    const anyPayoutGivenFunded = out.estimates.anyPayoutGivenFundedProbability;
    const liveTransfer = liveTransferAssumptionOf(
        base,
        out.liveTransferProbability,
    );
    const cumulativePayoutTrigger = pricedCumulativeTriggerAssumptionOf(base);
    return {
        ...(cumulativePayoutTrigger !== undefined && {
            cumulativePayoutTrigger,
        }),
        ...(liveTransfer !== undefined && { liveTransfer }),
        meanPayoutsPerAccount: out.estimates.payoutsPerFundedAccount,
        payoutCountDistribution: distribution,
        probabilityZeroPayouts: {
            standardError: anyPayoutGivenFunded.standardError,
            value: 1 - anyPayoutGivenFunded.value,
        },
        sampleRange:
            sampleSize === null
                ? null
                : sampleRangeFor(
                      mean,
                      standardDeviationOfDistribution(distribution, mean),
                      sampleSize,
                  ),
        seed: spec.run.seed,
        trials: spec.run.trials,
    };
}

function sampleRangeFor(
    mean: number,
    standardDeviationOfDistribution: number,
    sampleSize: number,
): FundedValueSampleRange {
    const halfWidth =
        NINETY_FIVE_PERCENT_Z *
        (standardDeviationOfDistribution / Math.sqrt(sampleSize));
    return {
        label: FUNDED_VALUE_SAMPLE_RANGE_LABEL,
        lower: mean - halfWidth,
        sampleSize,
        upper: mean + halfWidth,
    };
}

function standardDeviationOfDistribution(
    distribution: readonly number[],
    mean: number,
): number {
    const variance = distribution.reduce(
        (accumulator, probability, payoutCount) =>
            accumulator + probability * (payoutCount - mean) ** 2,
        0,
    );
    return Math.sqrt(Math.max(0, variance));
}
