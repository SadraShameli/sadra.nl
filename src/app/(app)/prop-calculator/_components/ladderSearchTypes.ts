import {
    type CouponDiscounts,
    type DayStopRule,
    type InstrumentSymbol,
    type LadderGridConfig,
    type LadderScore,
    type Plan,
    type RungSizing,
} from '~/lib/prop-calculator';

export enum LadderRunPhase {
    Cancelled = 'cancelled',
    Failed = 'failed',
    Idle = 'idle',
    Running = 'running',
    Succeeded = 'succeeded',
}

export interface LadderProgress {
    completed: number;
    elapsedMs: number;
    etaMs: null | number;
    total: number;
}

export interface LadderSearchInputs {
    commission: number;
    copyAccounts: number;
    discounts: CouponDiscounts | undefined;
    grid: LadderGridConfig;
    instrument: InstrumentSymbol | undefined;
    maxDays: number;
    plan: Plan;
    rrRatio: number;
    rungSizing: RungSizing;
    seed: number;
    sims: number;
    stopPoints: number | undefined;
    stopRule: DayStopRule;
    winrate: number;
}

export interface LadderSearchRun {
    byCost: readonly LadderScore[];
    byPassRate: readonly LadderScore[];
    bySpeed: readonly LadderScore[];
    droppedAliasCount: number;
    frontier: readonly LadderScore[];
    gridSize: number;
    laddersScored: number;
    unscorableCount: number;
}

export type LadderSearchState =
    | { phase: LadderRunPhase.Cancelled; progress: LadderProgress }
    | { phase: LadderRunPhase.Failed; reason: string }
    | { phase: LadderRunPhase.Idle }
    | { phase: LadderRunPhase.Running; progress: LadderProgress }
    | {
          phase: LadderRunPhase.Succeeded;
          progress: LadderProgress;
          result: LadderSearchRun;
      };
