import { type InstrumentSymbol, type PayoutRequestPolicy } from '~/lib/prop-calculator/core';
import { type RateSearchStatus } from '~/lib/prop-calculator/core/AverageRewardSolver';

import { type DpNotValidatedCause } from '../DifferenceReason';

export const DP_GATE_MIN_ITERATIONS = 12;

export enum DpEvalObjective {
    CashAtPass = 'cash-at-pass',
    PassProbability = 'pass-probability',
}

export enum DpGateFailure {
    BelowBestFlat = 'below-best-flat',
    InstrumentMismatch = 'instrument-mismatch',
    NoGateRun = 'no-gate-run',
    PayoutPolicyMismatch = 'payout-policy-mismatch',
    RetainedCushionMismatch = 'retained-cushion-mismatch',
    SolveNotConverged = 'solve-not-converged',
    StaleTree = 'stale-tree',
    StopMismatch = 'stop-mismatch',
}

export interface DpGateBasis {
    readonly instrument: InstrumentSymbol | null;
    readonly payoutRequestPolicy: PayoutRequestPolicy;
    readonly payoutRequestSize: null | number;
    readonly retainedCushion: number;
    readonly stopPoints: null | number;
}

export interface DpGateCitation {
    readonly date: string;
    readonly file: string;
    readonly row: string;
}

export interface DpGateMonthlyNet {
    readonly creditFree: number;
    readonly creditInclusive: number;
}

export interface DpGateRun {
    readonly citation: DpGateCitation;
    readonly dp: DpGateMonthlyNet;
    readonly dpBasis: DpGateBasis;
    readonly engineRef: string;
    readonly evalObjective: DpEvalObjective;
    readonly flat: DpGateMonthlyNet;
    readonly flatBasis: DpGateBasis;
    readonly planSerial: string;
    readonly ranOn: string;
    readonly solve: DpGateSolveRecord;
}

export interface DpGateSolveRecord {
    readonly exitCode: number;
    readonly iterations: number;
    readonly status: RateSearchStatus;
    readonly unconvergedLevels: number;
}

export type DpValidationVerdict =
    | {
          readonly citation: DpGateCitation;
          readonly evalObjective: DpEvalObjective;
          readonly ratios: {
              readonly creditFree: null | number;
              readonly creditInclusive: null | number;
          };
          readonly validated: true;
      }
    | {
          readonly citation: DpGateCitation | null;
          readonly failure: DpGateFailure;
          readonly result: null | string;
          readonly validated: false;
      };

export function dpNotValidatedCauseOf(
    _failure: DpGateFailure,
): DpNotValidatedCause | null {
    throw new Error('not implemented');
}

export function evaluateDpGateRun(
    _run: DpGateRun,
    _g2RecordedOn: null | string,
): DpValidationVerdict {
    throw new Error('not implemented');
}
