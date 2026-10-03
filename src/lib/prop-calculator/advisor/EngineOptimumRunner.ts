import {
    DayStopRuleKind,
    LadderGridSizeError,
    type LadderScore,
    type LadderSearchResult,
    ladderTrialStreams,
    type Plan,
    runLadderSearch,
    scoreLadder,
} from '~/lib/prop-calculator/core';
import {
    buildFundedCandidates,
    type FundedCandidate,
    FundedCandidateBuildKind,
    FundedSortKey,
    sortFundedResults,
    survivorCount,
} from '~/lib/prop-calculator/optimize';
import { type SimInputs, simulate } from '~/lib/prop-calculator/simulator';

import { AdviceSource } from './AdviceSource';
import {
    liveTransferAssumptionOf,
    type LiveTransferHazardAssumption,
} from './Assumption';
import {
    type EngineOptimum,
    type EngineOptimumPlacedRow,
    EngineOptimumRefusalKind,
    type EngineOptimumRefusedRow,
    EngineOptimumRowKind,
    type FundedSweepOptimumResult,
    FundedSweepOptimumResultKind,
    type FundedWinnerPolicy,
    FundedWinnerPolicyKind,
} from './EngineOptimum';
import {
    type EngineOptimumRequest,
    type FundedSweepFreshRequest,
    type LadderSearchRequest,
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
import { applyPersonalDayLimits, ladderUnderPersonalDayLimits } from './policy';

const DOCUMENTED_LADDER_SEED_OFFSET = 1;
const PERCENT_PER_FRACTION = 100;
const PERCENT_SIGNIFICANT_DIGITS = 12;

export enum LadderEngineOptimumResultKind {
    Refused = 'refused',
    Scored = 'scored',
}

export enum LadderRefusalKind {
    GridTooLarge = 'grid-too-large',
}

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
    readonly liveTransfer?: LiveTransferHazardAssumption;
    readonly source: AdviceSource.FundedSweepFresh;
    readonly sweep: FundedSweepOptimumResult;
}

export type LadderEngineOptimumResult =
    LadderRefusedEngineOptimumResult | LadderScoredEngineOptimumResult;

export interface LadderGridRefusal {
    readonly kind: LadderRefusalKind.GridTooLarge;
    readonly limit: number;
    readonly size: number;
}

export interface LadderRefusedEngineOptimumResult {
    readonly kind: LadderEngineOptimumResultKind.Refused;
    readonly refusal: LadderGridRefusal;
    readonly source: LadderSearchRequestSource;
}

export interface LadderScoredEngineOptimumResult {
    readonly documentedScore?: LadderScore;
    readonly kind: LadderEngineOptimumResultKind.Scored;
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

export function ladderRefusalText(refusal: LadderGridRefusal): string {
    return `ladder search not run: grid too large (${refusal.size.toLocaleString('en-US')} ladders, above the ${refusal.limit.toLocaleString('en-US')} limit)`;
}

export function runEngineOptimum(
    plan: Plan,
    request: EngineOptimumRequest,
): EngineOptimumRunnerResult {
    switch (request.source) {
        case AdviceSource.FundedSweepFresh: {
            const { liveTransfer, sweep } = runFundedSweepOptimum(
                plan,
                request,
            );
            return {
                ...(liveTransfer !== undefined && { liveTransfer }),
                source: request.source,
                sweep,
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
            return runLadderOptimum(plan, request);
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

function documentedLadderScoreOf(
    plan: Plan,
    request: LadderSearchRequest,
    documentedLadder: readonly number[],
): LadderScore {
    const { dayLimits } = request;
    const ladder =
        dayLimits === undefined
            ? documentedLadder
            : ladderUnderPersonalDayLimits(
                  documentedLadder,
                  dayLimits,
                  request.score.rrRatio,
              );
    return scoreLadder(
        ladder,
        { ...request.score, plan },
        ladderTrialStreams(request.seed + DOCUMENTED_LADDER_SEED_OFFSET),
    );
}

function fundedWinnerPolicyOf(
    candidates: readonly FundedCandidate[],
    label: string,
): FundedWinnerPolicy {
    const overrides = candidates.find(
        (candidate) => candidate.label === label,
    )?.overrides;
    if (overrides === undefined) {
        throw new Error(
            `runEngineOptimum: the winning candidate "${label}" is not among the built candidates`,
        );
    }
    const { fundedCushionPercent, fundedDayPolicy, fundedRiskPerTrade } =
        overrides;
    if (fundedRiskPerTrade !== undefined) {
        return {
            dollars: fundedRiskPerTrade,
            kind: FundedWinnerPolicyKind.Flat,
        };
    }
    if (fundedCushionPercent !== undefined) {
        return {
            kind: FundedWinnerPolicyKind.PercentOfCushion,
            percent: Number(
                (fundedCushionPercent * PERCENT_PER_FRACTION).toPrecision(
                    PERCENT_SIGNIFICANT_DIGITS,
                ),
            ),
        };
    }
    return {
        kind: FundedWinnerPolicyKind.Ladder,
        rungs: fundedDayPolicy?.ladder ?? [],
    };
}

function ladderSearchOf(
    plan: Plan,
    request: LadderSearchRequest,
): LadderSearchResult {
    const { dayLimits } = request;
    if (
        dayLimits !== undefined &&
        request.score.stopRule.kind !== DayStopRuleKind.DayGreen
    ) {
        throw new Error(
            `a ladder search under personal day limits walks the ${DayStopRuleKind.DayGreen} stop rule only, but this request stops the day with ${request.score.stopRule.kind}`,
        );
    }
    return runLadderSearch({
        grid: request.grid,
        maxGridSize: request.maxGridSize,
        score: { ...request.score, plan },
        seed: request.seed,
        topN: request.topN,
        transformLadder:
            dayLimits === undefined
                ? undefined
                : (ladder) =>
                      ladderUnderPersonalDayLimits(
                          ladder,
                          dayLimits,
                          request.score.rrRatio,
                      ),
    });
}

function refusedLadderSearch(
    request: LadderSearchRequest,
    error: LadderGridSizeError,
): LadderRefusedEngineOptimumResult {
    return {
        kind: LadderEngineOptimumResultKind.Refused,
        refusal: {
            kind: LadderRefusalKind.GridTooLarge,
            limit: error.limit,
            size: error.size,
        },
        source: request.source,
    };
}

function runFundedSweepOptimum(
    plan: Plan,
    request: FundedSweepFreshRequest,
): {
    readonly liveTransfer?: LiveTransferHazardAssumption;
    readonly sweep: FundedSweepOptimumResult;
} {
    const build = buildFundedCandidates({ ...request.candidates, plan });
    if (build.kind === FundedCandidateBuildKind.Refused) {
        return {
            sweep: {
                kind: FundedSweepOptimumResultKind.NoCandidates,
                refusal: build.refusal,
            },
        };
    }

    const inputsByRow = new Map<EngineOptimumPlacedRow, SimInputs>();
    const placedRows: EngineOptimumPlacedRow[] = build.candidates.map(
        (candidate): EngineOptimumPlacedRow => {
            const inputs = applyPersonalDayLimits(
                request.policy,
                applyEnginePolicy(plan, request.policy, {
                    ...request.base,
                    plan,
                    ...candidate.overrides,
                }),
            );
            const row: EngineOptimumPlacedRow = {
                kind: EngineOptimumRowKind.Placed,
                label: candidate.label,
                out: simulate(inputs),
            };
            inputsByRow.set(row, inputs);
            return row;
        },
    );
    const refusedRows: EngineOptimumRefusedRow[] =
        build.flatsBelowOneContract.map((dollar): EngineOptimumRefusedRow => ({
            kind: EngineOptimumRowKind.Refused,
            label: `flat $${dollar}`,
            reason: {
                dollar,
                kind: EngineOptimumRefusalKind.FlatBelowOneContract,
            },
        }));

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
        policy: fundedWinnerPolicyOf(build.candidates, winner.label),
        rows: [...ranked, ...refusedRows],
        survivors: survivorCount(winner.out, request.base.trials),
    };
    const winnerInputs = inputsByRow.get(winner);
    const liveTransfer =
        winnerInputs === undefined
            ? undefined
            : liveTransferAssumptionOf(
                  winnerInputs,
                  winner.out.liveTransferProbability,
              );
    return {
        ...(liveTransfer !== undefined && { liveTransfer }),
        sweep: { kind: FundedSweepOptimumResultKind.Optimum, optimum },
    };
}

function runLadderOptimum(
    plan: Plan,
    request: LadderSearchRequest,
): LadderEngineOptimumResult {
    try {
        const ladder = ladderSearchOf(plan, request);
        return {
            ...(request.documentedLadder !== undefined && {
                documentedScore: documentedLadderScoreOf(
                    plan,
                    request,
                    request.documentedLadder,
                ),
            }),
            kind: LadderEngineOptimumResultKind.Scored,
            ladder,
            source: request.source,
        };
    } catch (error) {
        if (error instanceof LadderGridSizeError) {
            return refusedLadderSearch(request, error);
        }
        throw error;
    }
}
