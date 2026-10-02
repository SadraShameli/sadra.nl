import { effectivePayoutRequest, type Plan } from '~/lib/prop-calculator/core';
import {
    type FromStateSimOutputs,
    SIM_INPUTS_REFUSAL_PREFIX,
    type SimOutputs,
    simulate,
    simulateFromState,
} from '~/lib/prop-calculator/simulator';
import { noiseVerdict, NoiseVerdict } from '~/lib/prop-calculator/stats';

import { type AdviceSource } from './AdviceSource';
import { documentedRetainedCushionResolution } from './DocumentedRetainedCushion';
import { type RetainedCushionBasis } from './PayoutRequestDecision';
import {
    type DocumentedPolicySpec,
    documentedPolicySpecSchema,
    toSimInputs,
} from './policy';
import { StartBasis } from './StartBasis';

export const PAYOUT_SIZE_SWEEP_GRID: readonly number[] = [
    500, 750, 1000, 1500, 2000, 3000, 6000,
];

export enum PayoutSizeSweepObjective {
    CreditInclusiveMonthlyNet = 'credit-inclusive-monthly-net',
}

export const PAYOUT_SIZE_SWEEP_OBJECTIVE =
    PayoutSizeSweepObjective.CreditInclusiveMonthlyNet;

export enum PayoutSizeSweepResultKind {
    NoOptimum = 'no-optimum',
    Optimum = 'optimum',
}

export interface FirmMinimumAboveRequestNote {
    readonly minimum: number;
    readonly requested: number;
}

export interface PayoutSizeSweepFoundResult {
    readonly kind: PayoutSizeSweepResultKind.Optimum;
    readonly optimum: PayoutSizeSweepOptimum;
}

export interface PayoutSizeSweepFreshRow {
    readonly anyPayoutGivenFundedProbability: number;
    readonly attemptPaysProbability: number;
    readonly firmMinimumAboveRequest: FirmMinimumAboveRequestNote | null;
    readonly kind: StartBasis.Fresh;
    readonly out: SimOutputs;
    readonly requestedSizes: readonly number[];
    readonly requestSize: number;
}

export interface PayoutSizeSweepFromStateRow {
    readonly anyPayoutGivenFundedProbability: number;
    readonly attemptPaysProbability: number;
    readonly firmMinimumAboveRequest: FirmMinimumAboveRequestNote | null;
    readonly kind: StartBasis.FromState;
    readonly out: FromStateSimOutputs;
    readonly requestedSizes: readonly number[];
    readonly requestSize: number;
}

export interface PayoutSizeSweepNoOptimumResult {
    readonly issue: string;
    readonly kind: PayoutSizeSweepResultKind.NoOptimum;
}

export interface PayoutSizeSweepOptimum {
    readonly creditSensitive: boolean;
    readonly objective: PayoutSizeSweepObjective;
    readonly personalOverride: null | PersonalPayoutOverrideResult;
    readonly rows: readonly PayoutSizeSweepRow[];
    readonly winner: PayoutSizeSweepRow;
}

export interface PayoutSizeSweepRequest {
    readonly personalOverrideRequest?: null | number;
    readonly source: AdviceSource.PayoutSizeSweep;
    readonly spec: DocumentedPolicySpec;
}

export type PayoutSizeSweepResult =
    PayoutSizeSweepFoundResult | PayoutSizeSweepNoOptimumResult;

export type PayoutSizeSweepRow =
    PayoutSizeSweepFreshRow | PayoutSizeSweepFromStateRow;

export interface PersonalPayoutOverrideResult {
    readonly row: PayoutSizeSweepRow;
    readonly warning: null | PersonalPayoutOverrideWarning;
}

export interface PersonalPayoutOverrideWarning {
    readonly horizonDays: number;
    readonly optimumBustProbability: number;
    readonly optimumMonthlyNet: number;
    readonly optimumRequestSize: number;
    readonly overrideBustProbability: number;
    readonly overrideMonthlyNet: number;
    readonly overrideRequestSize: number;
    readonly retainedCushion: number;
    readonly retainedCushionBasis: RetainedCushionBasis;
}

export function runPayoutSizeSweep(
    plan: Plan,
    request: PayoutSizeSweepRequest,
): PayoutSizeSweepResult {
    const spec = documentedPolicySpecSchema.parse(request.spec);
    const isFromState = spec.start !== undefined;

    let rows: PayoutSizeSweepRow[];
    try {
        rows = [...groupedSizes(plan, PAYOUT_SIZE_SWEEP_GRID)].map(
            ([effective, requestedSizes]) =>
                buildRow(plan, spec, effective, requestedSizes, isFromState),
        );
    } catch (error) {
        return refusalFrom(error);
    }

    const winner = rows.toSorted(
        (a, b) => creditInclusiveValue(b) - creditInclusiveValue(a),
    )[0];
    if (winner === undefined) {
        throw new Error(
            'runPayoutSizeSweep: PAYOUT_SIZE_SWEEP_GRID produced no rows',
        );
    }
    const creditFreeWinner = rows.toSorted(
        (a, b) => creditFreeValue(b) - creditFreeValue(a),
    )[0];
    const isCreditSensitive =
        creditFreeWinner !== undefined &&
        creditFreeWinner.requestSize !== winner.requestSize;

    let personalOverride: null | PersonalPayoutOverrideResult = null;
    if (
        request.personalOverrideRequest !== null &&
        request.personalOverrideRequest !== undefined
    ) {
        let overrideRow: PayoutSizeSweepRow;
        try {
            const effective = effectivePayoutRequest(
                plan,
                request.personalOverrideRequest,
            );
            overrideRow = buildRow(
                plan,
                spec,
                effective,
                [request.personalOverrideRequest],
                isFromState,
            );
        } catch (error) {
            return refusalFrom(error);
        }
        personalOverride = {
            row: overrideRow,
            warning: safeBandWarning(overrideRow, winner, spec),
        };
    }

    return {
        kind: PayoutSizeSweepResultKind.Optimum,
        optimum: {
            creditSensitive: isCreditSensitive,
            objective: PAYOUT_SIZE_SWEEP_OBJECTIVE,
            personalOverride,
            rows,
            winner,
        },
    };
}

function buildRow(
    plan: Plan,
    spec: DocumentedPolicySpec,
    effectiveRequest: number,
    requestedSizes: readonly number[],
    isFromState: boolean,
): PayoutSizeSweepRow {
    const candidateSpec: DocumentedPolicySpec = {
        ...spec,
        enginePolicy: {
            ...spec.enginePolicy,
            payoutRequestOverride: effectiveRequest,
        },
    };
    const inputs = toSimInputs(plan, candidateSpec);
    const firmMinimumAboveRequest = firmMinimumNoteFor(
        effectiveRequest,
        requestedSizes,
    );
    if (isFromState && spec.start !== undefined) {
        const out = simulateFromState({ ...inputs, start: spec.start });
        return {
            anyPayoutGivenFundedProbability:
                out.anyPayoutGivenFundedProbability,
            attemptPaysProbability: out.attemptPaysProbability,
            firmMinimumAboveRequest,
            kind: StartBasis.FromState,
            out,
            requestedSizes,
            requestSize: effectiveRequest,
        };
    }
    const out = simulate(inputs);
    return {
        anyPayoutGivenFundedProbability: out.anyPayoutGivenFundedProbability,
        attemptPaysProbability: out.attemptPaysProbability,
        firmMinimumAboveRequest,
        kind: StartBasis.Fresh,
        out,
        requestedSizes,
        requestSize: effectiveRequest,
    };
}

function creditFreeValue(row: PayoutSizeSweepRow): number {
    return row.kind === StartBasis.Fresh
        ? row.out.expectedMonthlyRealizedNet
        : row.out.fromStateExpectedRealizedCash;
}

function creditInclusiveValue(row: PayoutSizeSweepRow): number {
    return row.kind === StartBasis.Fresh
        ? row.out.expectedMonthlyNet
        : row.out.fromStateExpectedCash;
}

function firmMinimumNoteFor(
    effective: number,
    requestedSizes: readonly number[],
): FirmMinimumAboveRequestNote | null {
    const requested = Math.min(...requestedSizes);
    return effective > requested ? { minimum: effective, requested } : null;
}

function groupedSizes(
    plan: Plan,
    grid: readonly number[],
): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    for (const requested of grid) {
        const effective = effectivePayoutRequest(plan, requested);
        const existing = groups.get(effective);
        if (existing === undefined) {
            groups.set(effective, [requested]);
        } else {
            existing.push(requested);
        }
    }
    return groups;
}

function isWithinSafeBand(
    a: number,
    b: number,
    seA: null | number,
    seB: null | number,
): boolean {
    return (
        noiseVerdict(
            { standardError: null, value: a },
            { standardError: null, value: b },
            {
                differenceStandardError: pairedDifferenceStandardError(
                    seA,
                    seB,
                ),
                sharedSeed: true,
            },
        ) === NoiseVerdict.WithinNoise
    );
}

function pairedDifferenceStandardError(
    seA: null | number,
    seB: null | number,
): null | number {
    return seA === null || seB === null ? null : Math.max(seA, seB);
}

function refusalFrom(error: unknown): PayoutSizeSweepNoOptimumResult {
    if (
        error instanceof Error &&
        error.message.startsWith(SIM_INPUTS_REFUSAL_PREFIX)
    ) {
        return {
            issue: error.message,
            kind: PayoutSizeSweepResultKind.NoOptimum,
        };
    }
    throw error;
}

function safeBandWarning(
    overrideRow: PayoutSizeSweepRow,
    winner: PayoutSizeSweepRow,
    spec: DocumentedPolicySpec,
): null | PersonalPayoutOverrideWarning {
    const overrideMonthlyNet = creditInclusiveValue(overrideRow);
    const optimumMonthlyNet = creditInclusiveValue(winner);
    const overrideBustProbability = overrideRow.out.fundedBustProbability;
    const optimumBustProbability = winner.out.fundedBustProbability;

    const overrideSe = standardErrorOf(overrideRow);
    const winnerSe = standardErrorOf(winner);
    const isMonthlyWithinBand = isWithinSafeBand(
        overrideMonthlyNet,
        optimumMonthlyNet,
        overrideSe.monthly,
        winnerSe.monthly,
    );
    const isBustNotWorse =
        overrideBustProbability <= optimumBustProbability ||
        isWithinSafeBand(
            overrideBustProbability,
            optimumBustProbability,
            overrideSe.bust,
            winnerSe.bust,
        );

    if (isMonthlyWithinBand && isBustNotWorse) return null;
    const cushion = documentedRetainedCushionResolution(spec);
    return {
        horizonDays: spec.enginePolicy.fundedHorizonDays,
        optimumBustProbability,
        optimumMonthlyNet,
        optimumRequestSize: winner.requestSize,
        overrideBustProbability,
        overrideMonthlyNet,
        overrideRequestSize: overrideRow.requestSize,
        retainedCushion: cushion.amount,
        retainedCushionBasis: cushion.basis,
    };
}

function standardErrorOf(row: PayoutSizeSweepRow): {
    bust: null | number;
    monthly: null | number;
} {
    return row.kind === StartBasis.Fresh
        ? {
              bust: row.out.estimates.fundedBustProbability.standardError,
              monthly: row.out.estimates.expectedMonthlyNet.standardError,
          }
        : {
              bust: row.out.estimates.fundedBustProbability.standardError,
              monthly: row.out.estimates.fromStateExpectedCash.standardError,
          };
}
