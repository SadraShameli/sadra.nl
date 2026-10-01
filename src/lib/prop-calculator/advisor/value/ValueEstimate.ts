import { type UncertainValue } from '~/lib/prop-calculator/stats';

export enum ValueResultKind {
    Candidates = 'candidates',
    NotModeled = 'not-modeled',
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
    readonly kind: ValueResultKind.Value;
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

export function valueGap(from: ValueResult, to: ValueResult): UncertainValue {
    return {
        standardError: conservativeGapStandardError(
            from.creditInclusive.standardError,
            to.creditInclusive.standardError,
        ),
        value: to.creditInclusive.value - from.creditInclusive.value,
    };
}

export function valueResult(
    estimate: DualValueEstimate,
    seed: number,
    trials: number,
): ValueResult {
    return { ...estimate, kind: ValueResultKind.Value, seed, trials };
}
