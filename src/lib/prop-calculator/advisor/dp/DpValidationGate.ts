import { formatCurrency } from '~/lib/format';
import { DpNotValidatedCause } from '~/lib/prop-calculator/advisor';
import {
    type InstrumentSymbol,
    type PayoutRequestPolicy,
} from '~/lib/prop-calculator/core';
import { RateSearchStatus } from '~/lib/prop-calculator/core/AverageRewardSolver';

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

export interface DpGateRatios {
    readonly creditFree: null | number;
    readonly creditInclusive: null | number;
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

export interface DpNotValidatedVerdict {
    readonly citation: DpGateCitation | null;
    readonly failure: DpGateFailure;
    readonly result: null | string;
    readonly validated: false;
}

export interface DpValidatedVerdict {
    readonly citation: DpGateCitation;
    readonly evalObjective: DpEvalObjective;
    readonly ratios: DpGateRatios;
    readonly validated: true;
}

export type DpValidationVerdict = DpNotValidatedVerdict | DpValidatedVerdict;

interface MetricComparison {
    readonly dp: number;
    readonly flat: number;
    readonly label: string;
}

export function dpNotValidatedCauseOf(
    failure: DpGateFailure,
): DpNotValidatedCause | null {
    switch (failure) {
        case DpGateFailure.BelowBestFlat:
        case DpGateFailure.InstrumentMismatch:
        case DpGateFailure.PayoutPolicyMismatch:
        case DpGateFailure.StopMismatch: {
            return null;
        }
        case DpGateFailure.NoGateRun: {
            return DpNotValidatedCause.NoGateRun;
        }
        case DpGateFailure.RetainedCushionMismatch: {
            return DpNotValidatedCause.RetainedCushionMismatch;
        }
        case DpGateFailure.SolveNotConverged: {
            return DpNotValidatedCause.SolveCapReached;
        }
        case DpGateFailure.StaleTree: {
            return DpNotValidatedCause.StaleTree;
        }
    }
}

export function evaluateDpGateRun(
    run: DpGateRun,
    g2RecordedOn: null | string,
): DpValidationVerdict {
    const { citation, dpBasis, flatBasis } = run;
    const notValidated = (
        failure: DpGateFailure,
        result: null | string = null,
    ): DpNotValidatedVerdict => ({
        citation,
        failure,
        result,
        validated: false,
    });
    if (
        g2RecordedOn === null ||
        run.ranOn <= g2RecordedOn ||
        run.engineRef.trim() === ''
    ) {
        return notValidated(DpGateFailure.StaleTree);
    }
    const unconverged = unconvergedResult(run.solve);
    if (unconverged !== null) {
        return notValidated(DpGateFailure.SolveNotConverged, unconverged);
    }
    if (dpBasis.retainedCushion !== flatBasis.retainedCushion) {
        return notValidated(
            DpGateFailure.RetainedCushionMismatch,
            `DP retained cushion ${formatCurrency(dpBasis.retainedCushion)} against the flat baseline ${formatCurrency(flatBasis.retainedCushion)}`,
        );
    }
    if (
        dpBasis.payoutRequestPolicy !== flatBasis.payoutRequestPolicy ||
        dpBasis.payoutRequestSize !== flatBasis.payoutRequestSize
    ) {
        return notValidated(DpGateFailure.PayoutPolicyMismatch);
    }
    if (dpBasis.instrument !== flatBasis.instrument) {
        return notValidated(DpGateFailure.InstrumentMismatch);
    }
    if (dpBasis.stopPoints !== flatBasis.stopPoints) {
        return notValidated(DpGateFailure.StopMismatch);
    }
    const comparisons: readonly MetricComparison[] = [
        {
            dp: run.dp.creditInclusive,
            flat: run.flat.creditInclusive,
            label: 'credit-inclusive',
        },
        {
            dp: run.dp.creditFree,
            flat: run.flat.creditFree,
            label: 'credit-free',
        },
    ];
    const below = comparisons.find(({ dp, flat }) => dp < flat);
    if (below !== undefined) {
        return notValidated(
            DpGateFailure.BelowBestFlat,
            belowBestFlatResult(below),
        );
    }
    return {
        citation,
        evalObjective: run.evalObjective,
        ratios: {
            creditFree: ratioOf(run.dp.creditFree, run.flat.creditFree),
            creditInclusive: ratioOf(
                run.dp.creditInclusive,
                run.flat.creditInclusive,
            ),
        },
        validated: true,
    };
}

function belowBestFlatResult({ dp, flat, label }: MetricComparison): string {
    const ratio = ratioOf(dp, flat);
    return ratio === null
        ? `${formatCurrency(dp)} against a best flat of ${formatCurrency(flat)} (${label})`
        : `${ratio.toFixed(2)}x best flat (${label})`;
}

function ratioOf(dp: number, flat: number): null | number {
    return flat > 0 ? dp / flat : null;
}

function unconvergedResult(solve: DpGateSolveRecord): null | string {
    const { exitCode, iterations, status, unconvergedLevels } = solve;
    if (status !== RateSearchStatus.Converged) return status;
    if (unconvergedLevels > 0) {
        return `${unconvergedLevels} unconverged funded level${unconvergedLevels === 1 ? '' : 's'}`;
    }
    if (exitCode !== 0) return `exit ${exitCode}`;
    return iterations < DP_GATE_MIN_ITERATIONS
        ? `${iterations} of ${DP_GATE_MIN_ITERATIONS} iterations`
        : null;
}
