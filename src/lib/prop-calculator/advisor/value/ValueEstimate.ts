import {
    type CumulativePayoutTriggerAssumption,
    type LiveTransferHazardAssumption,
} from '~/lib/prop-calculator/advisor/Assumption';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

export enum CreditBasis {
    CreditFree = 'credit-free',
    CreditInclusive = 'credit-inclusive',
}

export enum ValueResultKind {
    Candidates = 'candidates',
    NotModeled = 'not-modeled',
    PayoutStake = 'payout-stake',
    Swing = 'swing',
    Value = 'value',
}

export enum ValueUnavailableReason {
    LiveNotModeled = 'live-not-modeled',
}

export interface DualValueEstimate {
    readonly creditFree: UncertainValue;
    readonly creditInclusive: UncertainValue;
}

export interface ValueNotModeledResult {
    readonly kind: ValueResultKind.NotModeled;
    readonly reason: ValueUnavailableReason;
}

export type ValueOutcome = ValueNotModeledResult | ValueResult;

export interface ValueResult extends DualValueEstimate {
    readonly cumulativePayoutTrigger?: CumulativePayoutTriggerAssumption;
    readonly kind: ValueResultKind.Value;
    readonly liveTransfer?: LiveTransferHazardAssumption;
    readonly seed: number;
    readonly trials: number;
}

export function conservativeGapStandardError(
    a: null | number,
    b: null | number,
): null | number {
    return a === null || b === null ? null : Math.hypot(a, b);
}

export function isValueResult(outcome: ValueOutcome): outcome is ValueResult {
    return outcome.kind === ValueResultKind.Value;
}

export function notModeled(
    reason: ValueUnavailableReason,
): ValueNotModeledResult {
    return { kind: ValueResultKind.NotModeled, reason };
}

export function valueGap(
    from: ValueResult,
    to: ValueResult,
    basis: CreditBasis = CreditBasis.CreditInclusive,
): UncertainValue {
    const fromEstimate = estimateOn(from, basis);
    const toEstimate = estimateOn(to, basis);
    return {
        standardError: conservativeGapStandardError(
            fromEstimate.standardError,
            toEstimate.standardError,
        ),
        value: toEstimate.value - fromEstimate.value,
    };
}

export function valueResult(
    estimate: DualValueEstimate,
    seed: number,
    trials: number,
    liveTransfer?: LiveTransferHazardAssumption,
): ValueResult {
    return {
        ...estimate,
        kind: ValueResultKind.Value,
        ...(liveTransfer !== undefined && { liveTransfer }),
        seed,
        trials,
    };
}

export function withCashAdded(value: ValueResult, cash: number): ValueResult {
    return {
        ...value,
        creditFree: {
            standardError: value.creditFree.standardError,
            value: value.creditFree.value + cash,
        },
        creditInclusive: {
            standardError: value.creditInclusive.standardError,
            value: value.creditInclusive.value + cash,
        },
    };
}

function estimateOn(
    result: DualValueEstimate,
    basis: CreditBasis,
): UncertainValue {
    switch (basis) {
        case CreditBasis.CreditFree: {
            return result.creditFree;
        }
        case CreditBasis.CreditInclusive: {
            return result.creditInclusive;
        }
    }
}
