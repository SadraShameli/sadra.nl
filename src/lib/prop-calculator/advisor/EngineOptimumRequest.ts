import { type LadderGridConfig, type LadderScoreConfig } from '../core';
import { type FundedCandidateOptions } from '../optimize';
import { type SimInputs } from '../simulator';
import { type AdviceSource } from './AdviceSource';
import { type FundedFromStateSweepRequest } from './FundedFromStateSweep';
import { type NextPayoutProjectionRequest } from './NextPayoutProjection';
import { type PayoutSizeSweepRequest } from './PayoutSizeSweep';
import { type EnginePolicy } from './policy';

export type EngineLadderScoreConfig = Omit<LadderScoreConfig, 'plan'>;

export type EngineOptimumRequest =
    | FundedFromStateSweepRequest
    | FundedSweepFreshRequest
    | LadderSearchRequest
    | NextPayoutProjectionRequest
    | PayoutSizeSweepRequest;

export interface FundedSweepFreshRequest {
    readonly base: Omit<SimInputs, 'plan'>;
    readonly candidates: Omit<FundedCandidateOptions, 'plan'>;
    readonly policy: EnginePolicy;
    readonly source: AdviceSource.FundedSweepFresh;
}

export interface LadderSearchRequest {
    readonly grid: LadderGridConfig;
    readonly maxGridSize?: number;
    readonly score: EngineLadderScoreConfig;
    readonly seed: number;
    readonly source: LadderSearchRequestSource;
    readonly topN?: number;
}

export type LadderSearchRequestSource =
    | AdviceSource.LadderSearchFresh
    | AdviceSource.LadderSearchFromState;

export { type FundedFromStateSweepRequest } from './FundedFromStateSweep';
export { type NextPayoutProjectionRequest } from './NextPayoutProjection';
export { type PayoutSizeSweepRequest } from './PayoutSizeSweep';