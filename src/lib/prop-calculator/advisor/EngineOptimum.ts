import {
    CENTS_PER_DOLLAR,
    type Dollars,
    dollars,
} from '~/lib/prop-calculator/core';
import { type FundedCandidateRefusalDetail } from '~/lib/prop-calculator/optimize';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';

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

export enum FundedWinnerPolicyKind {
    Flat = 'flat',
    Ladder = 'ladder',
    PercentOfCushion = 'percent-of-cushion',
}

export interface EngineOptimum {
    readonly expectedHorizonCredit: number;
    readonly expectedHorizonCreditStandardError: null | number;
    readonly expectedMonthlyNet: number;
    readonly expectedMonthlyNetStandardError: null | number;
    readonly expectedMonthlyRealizedNet: number;
    readonly expectedMonthlyRealizedNetStandardError: null | number;
    readonly label: string;
    readonly policy: FundedWinnerPolicy;
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
    FundedSweepNoCandidatesResult | FundedSweepOptimumFoundResult;

export type FundedWinnerPolicy =
    | {
          readonly dollars: number;
          readonly kind: FundedWinnerPolicyKind.Flat;
      }
    | {
          readonly kind: FundedWinnerPolicyKind.Ladder;
          readonly rungs: readonly number[];
      }
    | {
          readonly kind: FundedWinnerPolicyKind.PercentOfCushion;
          readonly percent: number;
      };

export function fundedWinnerRiskAt(
    policy: FundedWinnerPolicy,
    cushion: number,
): Dollars {
    switch (policy.kind) {
        case FundedWinnerPolicyKind.Flat: {
            return dollars(policy.dollars);
        }
        case FundedWinnerPolicyKind.Ladder: {
            return dollars(policy.rungs[0] ?? 0);
        }
        case FundedWinnerPolicyKind.PercentOfCushion: {
            return dollars(
                Math.round(
                    (policy.percent / 100) * cushion * CENTS_PER_DOLLAR,
                ) / CENTS_PER_DOLLAR,
            );
        }
    }
}
