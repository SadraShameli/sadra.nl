import { type LadderSearchResult, type Plan, runLadderSearch } from '../core';
import {
    buildFundedCandidates,
    FundedCandidateBuildKind,
    FundedSortKey,
    sortFundedResults,
    survivorCount,
} from '../optimize';
import { simulate } from '../simulator';
import { AdviceSource } from './AdviceSource';
import {
    type EngineOptimum,
    type EngineOptimumPlacedRow,
    EngineOptimumRefusalKind,
    type EngineOptimumRefusedRow,
    EngineOptimumRowKind,
    type FundedSweepOptimumResult,
    FundedSweepOptimumResultKind,
} from './EngineOptimum';
import {
    type EngineOptimumRequest,
    type FundedSweepFreshRequest,
    type LadderSearchRequestSource,
} from './EngineOptimumRequest';
import { applyEnginePolicy } from './EnginePolicyBuilder';
import {
    type FundedFromStateSweepResult,
    runFundedFromStateSweep,
} from './FundedFromStateSweep';
import {
    type NextPayoutProjection,
    runNextPayoutProjection,
} from './NextPayoutProjection';
import {
    type PayoutSizeSweepResult,
    runPayoutSizeSweep,
} from './PayoutSizeSweep';

export type EngineOptimumRunnerResult =
    | FundedFromStateEngineOptimumResult
    | FundedSweepEngineOptimumResult
    | LadderEngineOptimumResult
    | NextPayoutProjectionEngineOptimumResult
    | PayoutSizeSweepEngineOptimumResult;

export interface FundedFromStateEngineOptimumResult {
    readonly source: AdviceSource.FundedSweepFromState;
    readonly sweep: FundedFromStateSweepResult;
}

export interface FundedSweepEngineOptimumResult {
    readonly source: AdviceSource.FundedSweepFresh;
    readonly sweep: FundedSweepOptimumResult;
}

export interface LadderEngineOptimumResult {
    readonly ladder: LadderSearchResult;
    readonly source: LadderSearchRequestSource;
}

export interface NextPayoutProjectionEngineOptimumResult {
    readonly projection: NextPayoutProjection;
    readonly source: AdviceSource.NextPayoutProjection;
}

export interface PayoutSizeSweepEngineOptimumResult {
    readonly source: AdviceSource.PayoutSizeSweep;
    readonly sweep: PayoutSizeSweepResult;
}

export function runEngineOptimum(
    plan: Plan,
    request: EngineOptimumRequest,
): EngineOptimumRunnerResult {
    switch (request.source) {
        case AdviceSource.FundedSweepFresh: {
            return {
                source: request.source,
                sweep: runFundedSweepOptimum(plan, request),
            };
        }
        case AdviceSource.FundedSweepFromState: {
            return {
                source: request.source,
                sweep: runFundedFromStateSweep(plan, request),
            };
        }
        case AdviceSource.LadderSearchFresh:
        case AdviceSource.LadderSearchFromState: {
            return {
                ladder: runLadderSearch({
                    grid: request.grid,
                    maxGridSize: request.maxGridSize,
                    score: { ...request.score, plan },
                    seed: request.seed,
                    topN: request.topN,
                }),
                source: request.source,
            };
        }
        case AdviceSource.NextPayoutProjection: {
            return {
                projection: runNextPayoutProjection(plan, request),
                source: request.source,
            };
        }
        case AdviceSource.PayoutSizeSweep: {
            return {
                source: request.source,
                sweep: runPayoutSizeSweep(plan, request),
            };
        }
    }
}

function runFundedSweepOptimum(
    plan: Plan,
    request: FundedSweepFreshRequest,
): FundedSweepOptimumResult {
    const build = buildFundedCandidates({ ...request.candidates, plan });
    if (build.kind === FundedCandidateBuildKind.Refused) {
        return {
            kind: FundedSweepOptimumResultKind.NoCandidates,
            refusal: build.refusal,
        };
    }

    const placedRows: EngineOptimumPlacedRow[] = build.candidates.map(
        (candidate): EngineOptimumPlacedRow => ({
            kind: EngineOptimumRowKind.Placed,
            label: candidate.label,
            out: simulate(
                applyEnginePolicy(plan, request.policy, {
                    ...request.base,
                    plan,
                    ...candidate.overrides,
                }),
            ),
        }),
    );
    const refusedRows: EngineOptimumRefusedRow[] =
        build.flatsBelowOneContract.map(
            (dollar): EngineOptimumRefusedRow => ({
                kind: EngineOptimumRowKind.Refused,
                label: `flat $${dollar}`,
                reason: {
                    dollar,
                    kind: EngineOptimumRefusalKind.FlatBelowOneContract,
                },
            }),
        );

    const ranked = sortFundedResults(placedRows, FundedSortKey.Monthly);
    const winner = ranked[0];
    if (winner === undefined) {
        throw new Error(
            'runEngineOptimum: buildFundedCandidates returned a built result with no candidates',
        );
    }

    const optimum: EngineOptimum = {
        expectedHorizonCredit: winner.out.expectedHorizonCredit,
        expectedHorizonCreditStandardError:
            winner.out.estimates.expectedHorizonCredit.standardError,
        expectedMonthlyNet: winner.out.expectedMonthlyNet,
        expectedMonthlyNetStandardError:
            winner.out.estimates.expectedMonthlyNet.standardError,
        expectedMonthlyRealizedNet: winner.out.expectedMonthlyRealizedNet,
        expectedMonthlyRealizedNetStandardError:
            winner.out.estimates.expectedMonthlyRealizedNet.standardError,
        label: winner.label,
        rows: [...ranked, ...refusedRows],
        survivors: survivorCount(winner.out, request.base.trials),
    };
    return { kind: FundedSweepOptimumResultKind.Optimum, optimum };
}
