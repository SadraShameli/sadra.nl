import {
    type AccountState,
    type FundedCycleSeed,
    type FundedCycleTracker,
    PayoutDayGateBasis,
    type Plan,
} from '../core';
import {
    buildFundedCandidates,
    FundedCandidateBuildKind,
    type FundedCandidateOptions,
    type FundedCandidateRefusalDetail,
    survivorCount,
} from '../optimize';
import {
    type FromStateSimInputs,
    type FromStateSimOutputs,
    type FundedSimStart,
    type SimInputs,
    simulateFromState,
} from '../simulator';
import { type AdviceSource } from './AdviceSource';
import {
    type EngineOptimumRefusal,
    EngineOptimumRefusalKind,
    type EngineOptimumRefusedRow,
    EngineOptimumRowKind,
} from './EngineOptimum';
import { applyEnginePolicy } from './EnginePolicyBuilder';
import { type EnginePolicy } from './policy';

export enum FundedFromStateOptimumResultKind {
    NoCandidates = 'no-candidates',
    Optimum = 'optimum',
}

export interface FundedFromStateNoCandidatesResult {
    readonly kind: FundedFromStateOptimumResultKind.NoCandidates;
    readonly refusal: FundedCandidateRefusalDetail;
}

export interface FundedFromStateOptimum {
    readonly fromStateExpectedCash: number;
    readonly fromStateExpectedCashStandardError: null | number;
    readonly fromStateExpectedRealizedCash: number;
    readonly fromStateExpectedRealizedCashStandardError: null | number;
    readonly label: string;
    readonly rows: readonly FundedFromStateRow[];
    readonly survivors: number;
}

export interface FundedFromStateOptimumFoundResult {
    readonly kind: FundedFromStateOptimumResultKind.Optimum;
    readonly optimum: FundedFromStateOptimum;
}

export interface FundedFromStatePlacedRow {
    readonly kind: EngineOptimumRowKind.Placed;
    readonly label: string;
    readonly out: FromStateSimOutputs;
}

export type FundedFromStateRow = EngineOptimumRefusedRow | FundedFromStatePlacedRow;

export interface FundedFromStateSweepRequest {
    readonly base: Omit<SimInputs, 'plan'>;
    readonly candidates: Omit<FundedCandidateOptions, 'plan'>;
    readonly policy: EnginePolicy;
    readonly source: AdviceSource.FundedSweepFromState;
    readonly start: FundedSimStart;
}

export type FundedFromStateSweepResult =
    | FundedFromStateNoCandidatesResult
    | FundedFromStateOptimumFoundResult;

export function fundedCycleSeedFromTracker(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
): FundedCycleSeed {
    return {
        calendarDayGateProgress:
            plan.payoutDayGateBasis ===
            PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout
                ? tracker.dayGateProgress(plan, state)
                : 0,
        cumulativePayout: tracker.cumulativePayout,
        cycleBestDayProfit: tracker.cycleBestDayProfit,
        fundedResetsUsed: tracker.fundedResetsUsed,
        lastPayoutBalance: tracker.lastPayoutBalance,
        payoutsIssued: tracker.payoutsIssued,
        qualifyingDaysAtLastPayout: tracker.qualifyingDaysAtLastPayout,
    };
}

export function runFundedFromStateSweep(
    plan: Plan,
    request: FundedFromStateSweepRequest,
): FundedFromStateSweepResult {
    const build = buildFundedCandidates({ ...request.candidates, plan });
    if (build.kind === FundedCandidateBuildKind.Refused) {
        return {
            kind: FundedFromStateOptimumResultKind.NoCandidates,
            refusal: build.refusal,
        };
    }

    const placedRows: FundedFromStatePlacedRow[] = build.candidates.map(
        (candidate): FundedFromStatePlacedRow => ({
            kind: EngineOptimumRowKind.Placed,
            label: candidate.label,
            out: simulateFromState(
                applyEnginePolicyFromState(plan, request.policy, {
                    ...request.base,
                    plan,
                    start: request.start,
                    ...candidate.overrides,
                }),
            ),
        }),
    );
    const refusedRows: EngineOptimumRefusedRow[] = build.flatsBelowOneContract.map(
        (dollar): EngineOptimumRefusedRow => ({
            kind: EngineOptimumRowKind.Refused,
            label: `flat $${dollar}`,
            reason: flatBelowOneContractRefusal(dollar),
        }),
    );

    const ranked = placedRows.toSorted(
        (a, b) => b.out.fromStateExpectedCash - a.out.fromStateExpectedCash,
    );
    const winner = ranked[0];
    if (winner === undefined) {
        throw new Error(
            'runFundedFromStateSweep: buildFundedCandidates returned a built result with no candidates',
        );
    }

    const optimum: FundedFromStateOptimum = {
        fromStateExpectedCash: winner.out.fromStateExpectedCash,
        fromStateExpectedCashStandardError:
            winner.out.estimates.fromStateExpectedCash.standardError,
        fromStateExpectedRealizedCash: winner.out.fromStateExpectedRealizedCash,
        fromStateExpectedRealizedCashStandardError:
            winner.out.estimates.fromStateExpectedRealizedCash.standardError,
        label: winner.label,
        rows: [...ranked, ...refusedRows],
        survivors: survivorCount(winner.out, request.base.trials),
    };
    return { kind: FundedFromStateOptimumResultKind.Optimum, optimum };
}

function applyEnginePolicyFromState(
    plan: Plan,
    policy: EnginePolicy,
    base: FromStateSimInputs,
): FromStateSimInputs {
    return { ...applyEnginePolicy(plan, policy, base), start: base.start };
}

function flatBelowOneContractRefusal(dollar: number): EngineOptimumRefusal {
    return { dollar, kind: EngineOptimumRefusalKind.FlatBelowOneContract };
}
