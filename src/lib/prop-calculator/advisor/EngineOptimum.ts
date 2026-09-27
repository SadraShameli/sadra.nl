import { type FundedCandidateRefusalDetail } from '../optimize';
import { type SimOutputs } from '../simulator';

export enum EngineOptimumRefusalKind {
    FlatBelowOneContract = 'flat-below-one-contract',
}

export enum EngineOptimumRowKind {
    Placed = 'placed',
    Refused = 'refused',
}

export enum FundedSweepOptimumResultKind {
    NoCandidates = 'no-candidates',
    Optimum = 'optimum',
}

export interface EngineOptimum {
    readonly expectedHorizonCredit: number;
    readonly expectedHorizonCreditStandardError: null | number;
    readonly expectedMonthlyNet: number;
    readonly expectedMonthlyNetStandardError: null | number;
    readonly expectedMonthlyRealizedNet: number;
    readonly expectedMonthlyRealizedNetStandardError: null | number;
    readonly label: string;
    readonly rows: readonly EngineOptimumRow[];
    readonly survivors: number;
}

export interface EngineOptimumPlacedRow {
    readonly kind: EngineOptimumRowKind.Placed;
    readonly label: string;
    readonly out: SimOutputs;
}

export interface EngineOptimumRefusal {
    readonly dollar: number;
    readonly kind: EngineOptimumRefusalKind.FlatBelowOneContract;
}

export interface EngineOptimumRefusedRow {
    readonly kind: EngineOptimumRowKind.Refused;
    readonly label: string;
    readonly reason: EngineOptimumRefusal;
}

export type EngineOptimumRow = EngineOptimumPlacedRow | EngineOptimumRefusedRow;

export interface FundedSweepNoCandidatesResult {
    readonly kind: FundedSweepOptimumResultKind.NoCandidates;
    readonly refusal: FundedCandidateRefusalDetail;
}

export interface FundedSweepOptimumFoundResult {
    readonly kind: FundedSweepOptimumResultKind.Optimum;
    readonly optimum: EngineOptimum;
}

export type FundedSweepOptimumResult =
    | FundedSweepNoCandidatesResult
    | FundedSweepOptimumFoundResult;
