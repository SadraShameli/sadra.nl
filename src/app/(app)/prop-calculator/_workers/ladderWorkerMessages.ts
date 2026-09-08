import type {
    DayStopRule,
    LadderScore,
    PlanId,
    RungSizing,
} from '~/lib/prop-calculator';

export interface LadderWorkerRequest {
    cushion: number;
    evalPrice: number;
    firstIndex: number;
    ladders: number[][];
    maxDays: number;
    planId: PlanId;
    requestId: number;
    rrRatio: number;
    rungSizing: RungSizing;
    seed: number;
    sims: number;
    stopRule: DayStopRule;
    winrate: number;
}

export interface LadderWorkerResponse {
    requestId: number;
    scores: LadderScore[];
}
