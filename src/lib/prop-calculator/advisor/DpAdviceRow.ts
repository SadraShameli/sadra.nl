import { z } from 'zod';

import {
    dollarsSchema,
    type FundedDpModelGap,
    FundedDpModelGapKind,
    type InstrumentSymbol,
} from '~/lib/prop-calculator/core';

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

export enum DpGateFailureCode {
    BelowBestFlat = 'below-best-flat',
    InstrumentMismatch = 'instrument-mismatch',
    NoGateRun = 'no-gate-run',
    PayoutPolicyMismatch = 'payout-policy-mismatch',
    RetainedCushionMismatch = 'retained-cushion-mismatch',
    SolveNotConverged = 'solve-not-converged',
    StaleTree = 'stale-tree',
    StopMismatch = 'stop-mismatch',
}

export enum DpSamplesKind {
    Sampled = 'sampled',
    Unavailable = 'unavailable',
}

export enum DpSampleStage {
    Eval = 'eval',
    Funded = 'funded',
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
    readonly assumedInstrument: InstrumentSymbol | null;
    readonly assumedStopPoints: null | number;
    readonly configKey: string;
    readonly eligible: boolean;
    readonly gaps: readonly DpAdviceGapEntry[];
    readonly gateFailure: DpGateFailureCode | null;
    readonly gateResult: null | string;
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

export interface DpAdviceStalenessInput {
    readonly currentPlanRulesFingerprint: string;
    readonly currentSolverVersion?: number;
    readonly latestSnapshotId: string;
}

export interface DpRiskSample {
    readonly cushionCents: number;
    readonly placedRiskCents: null | number;
    readonly riskCents: number;
    readonly rungOffset: number;
    readonly tradeIndex: number;
}

const wholeNumberSchema = z.number().int();

const dpFundedModelGapSchema = z.discriminatedUnion('kind', [
    z.strictObject({
        fromPayoutIndex: z.number().int().nonnegative(),
        kind: z.literal(FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap),
        payoutRegimeCap: z.number().int().nonnegative(),
    }),
    z.strictObject({
        kind: z.literal(FundedDpModelGapKind.CalendarWeekInactivityIgnored),
        message: z.string(),
    }),
    z.strictObject({
        kind: z.literal(FundedDpModelGapKind.FundedGridSaturationHigh),
        shareAtOrAboveTop: z.number().min(0).max(1),
    }),
    z.strictObject({
        kind: z.literal(FundedDpModelGapKind.LifetimeDollarCapIgnored),
        maxLifetimePayoutDollars: dollarsSchema,
    }),
    z.strictObject({
        kind: z.literal(FundedDpModelGapKind.PayoutFloorReleaseUnvalidated),
    }),
    z.strictObject({
        kind: z.literal(
            FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates,
        ),
    }),
]);

const dpAdviceOwnGapSchema = z.discriminatedUnion('kind', [
    z.strictObject({
        kind: z.literal(DpAdviceGap.ConsistencyGridTruncates),
        lockedTopCents: wholeNumberSchema,
    }),
    z.strictObject({ kind: z.literal(DpAdviceGap.ContinuousRiskAssumed) }),
    z.strictObject({ kind: z.literal(DpAdviceGap.DayStopRuleNotModeled) }),
    z.strictObject({
        drawdownCents: wholeNumberSchema,
        kind: z.literal(DpAdviceGap.EvalGridMisaligned),
        stepCents: wholeNumberSchema,
    }),
    z.strictObject({ kind: z.literal(DpAdviceGap.StateAtGridTop) }),
]);

const dpAdviceGapSchema = z.union([
    dpFundedModelGapSchema,
    dpAdviceOwnGapSchema,
]);

export const dpAdviceGapsSchema = z.array(
    dpAdviceGapSchema,
) satisfies z.ZodType<readonly DpAdviceGapEntry[]>;

const dpRiskSampleSchema = z.strictObject({
    cushionCents: wholeNumberSchema,
    placedRiskCents: wholeNumberSchema.nullable(),
    riskCents: wholeNumberSchema,
    rungOffset: wholeNumberSchema,
    tradeIndex: z.number().int().nonnegative(),
}) satisfies z.ZodType<DpRiskSample>;

export const dpAdviceSamplesSchema = z.discriminatedUnion('kind', [
    z.strictObject({
        kind: z.literal(DpSamplesKind.Sampled),
        samples: z.array(dpRiskSampleSchema),
        stage: z.enum(DpSampleStage),
    }),
    z.strictObject({
        kind: z.literal(DpSamplesKind.Unavailable),
        reason: z.enum(DpSamplesUnavailableReason),
        stage: z.enum(DpSampleStage),
    }),
]) satisfies z.ZodType<DpAdviceSamples>;

export function dpAdviceStaleness(
    row: Pick<
        DpAdviceRow,
        'planRulesFingerprint' | 'snapshotId' | 'solverVersion'
    >,
    input: DpAdviceStalenessInput,
): readonly DpAdviceStalenessReason[] {
    const reasons: DpAdviceStalenessReason[] = [];
    if (row.snapshotId !== input.latestSnapshotId) {
        reasons.push(DpAdviceStalenessReason.NewerSnapshot);
    }
    if (
        row.solverVersion !==
        (input.currentSolverVersion ?? DP_ADVICE_SOLVER_VERSION)
    ) {
        reasons.push(DpAdviceStalenessReason.SolverVersionChanged);
    }
    if (
        row.planRulesFingerprint !== null &&
        row.planRulesFingerprint !== input.currentPlanRulesFingerprint
    ) {
        reasons.push(DpAdviceStalenessReason.PlanRulesChanged);
    }
    return reasons;
}
