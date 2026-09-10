import type {
    DayStopRule,
    LadderScore,
    PlanId,
    RungSizing,
} from '~/lib/prop-calculator';

export enum LadderWorkerRequestKind {
    ScoreLadders = 'score-ladders',
}

export enum LadderWorkerResponseKind {
    Failed = 'failed',
    Scored = 'scored',
}

export type LadderWorkerRequest = ScoreLaddersRequest;

export type LadderWorkerResponse = LadderScoredResponse | LadderWorkerFailure;

interface LadderScoredResponse {
    firstIndex: number;
    kind: LadderWorkerResponseKind.Scored;
    runId: number;
    scores: LadderScore[];
}

interface LadderWorkerFailure {
    kind: LadderWorkerResponseKind.Failed;
    reason: string;
    runId: number;
}

interface ScoreLaddersRequest {
    cushion: number;
    evalPrice: number;
    firstIndex: number;
    kind: LadderWorkerRequestKind.ScoreLadders;
    ladders: number[][];
    maxDays: number;
    planId: PlanId;
    rrRatio: number;
    rungSizing: RungSizing;
    runId: number;
    seed: number;
    sims: number;
    stopRule: DayStopRule;
    winrate: number;
}
