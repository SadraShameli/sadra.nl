import { type z } from 'zod';

import { type FundedDpModelGap } from '~/lib/prop-calculator/core';

import { type SizingObjective } from './SizingObjective';

export const DP_ADVICE_SOLVER_VERSION = 1;

export enum DpAdviceGap {
    ConsistencyGridTruncates = 'consistency-grid-truncates',
    ContinuousRiskAssumed = 'continuous-risk-assumed',
    DayStopRuleNotModeled = 'day-stop-rule-not-modeled',
    EvalGridMisaligned = 'eval-grid-misaligned',
    StateAtGridTop = 'state-at-grid-top',
}

export enum DpAdviceStalenessReason {
    NewerSnapshot = 'newer-snapshot',
    PlanRulesChanged = 'plan-rules-changed',
    SolverVersionChanged = 'solver-version-changed',
}

export enum DpSampleStage {
    Eval = 'eval',
    Funded = 'funded',
}

export enum DpSamplesKind {
    Sampled = 'sampled',
    Unavailable = 'unavailable',
}

export enum DpSamplesUnavailableReason {
    EvalDayPastHorizon = 'eval-day-past-horizon',
    EvalElapsedDaysMissing = 'eval-elapsed-days-missing',
    EvalRowsSuppressed = 'eval-rows-suppressed',
    EvalStateUnreached = 'eval-state-unreached',
    FundedCycleCountsInvalid = 'funded-cycle-counts-invalid',
    FundedLevelUnreachable = 'funded-level-unreachable',
    NotEligible = 'not-eligible',
}

export type DpAdviceGapEntry =
    | FundedDpModelGap
    | {
          readonly drawdownCents: number;
          readonly kind: DpAdviceGap.EvalGridMisaligned;
          readonly stepCents: number;
      }
    | {
          readonly kind: DpAdviceGap.ConsistencyGridTruncates;
          readonly lockedTopCents: number;
      }
    | {
          readonly kind:
              | DpAdviceGap.ContinuousRiskAssumed
              | DpAdviceGap.DayStopRuleNotModeled
              | DpAdviceGap.StateAtGridTop;
      };

export interface DpAdviceRow {
    readonly configKey: string;
    readonly eligible: boolean;
    readonly gaps: readonly DpAdviceGapEntry[];
    readonly ineligibleReason: null | string;
    readonly objective: SizingObjective;
    readonly planRulesFingerprint: null | string;
    readonly planSerial: string;
    readonly runtimeMs: number;
    readonly samples: DpAdviceSamples;
    readonly snapshotId: string;
    readonly solvedAt: string;
    readonly solverVersion: number;
    readonly validated: boolean;
    readonly validationRef: null | string;
}

export interface DpAdviceStalenessInput {
    readonly currentPlanRulesFingerprint: string;
    readonly currentSolverVersion?: number;
    readonly latestSnapshotId: string;
}

export type DpAdviceSamples =
    | {
          readonly kind: DpSamplesKind.Sampled;
          readonly samples: readonly DpRiskSample[];
          readonly stage: DpSampleStage;
      }
    | {
          readonly kind: DpSamplesKind.Unavailable;
          readonly reason: DpSamplesUnavailableReason;
          readonly stage: DpSampleStage;
      };

export interface DpRiskSample {
    readonly cushionCents: number;
    readonly placedRiskCents: null | number;
    readonly riskCents: number;
    readonly rungOffset: number;
    readonly tradeIndex: number;
}

const NOT_IMPLEMENTED = 'not implemented';

export const dpAdviceGapsSchema = {
    parse(): never {
        throw new Error(NOT_IMPLEMENTED);
    },
    safeParse(): never {
        throw new Error(NOT_IMPLEMENTED);
    },
} as unknown as z.ZodType<readonly DpAdviceGapEntry[]>;

export const dpAdviceSamplesSchema = {
    parse(): never {
        throw new Error(NOT_IMPLEMENTED);
    },
    safeParse(): never {
        throw new Error(NOT_IMPLEMENTED);
    },
} as unknown as z.ZodType<DpAdviceSamples>;

export function dpAdviceStaleness(
    _row: Pick<
        DpAdviceRow,
        'planRulesFingerprint' | 'snapshotId' | 'solverVersion'
    >,
    _input: DpAdviceStalenessInput,
): readonly DpAdviceStalenessReason[] {
    throw new Error(NOT_IMPLEMENTED);
}
