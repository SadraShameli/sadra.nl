import { AdviceSource } from './AdviceSource';
import { type EngineOptimumRequest } from './EngineOptimumRequest';
import { type SizingObjective, type SpeedObjective } from './SizingObjective';
import { type StartBasis } from './StartBasis';

export interface AdviceProvenance {
    readonly computedAt: string;
    readonly firmDataDate: null | string;
    readonly objective: SizingObjective | SpeedObjective;
    readonly planRulesFingerprint: null | string;
    readonly seed: null | number;
    readonly snapshotDate: string;
    readonly solverVersion: null | string;
    readonly source: AdviceSource;
    readonly startBasis: StartBasis;
    readonly trials: null | number;
}

export interface AdviceProvenanceInput {
    readonly computedAt: string;
    readonly firmDataDate: null | string;
    readonly objective: SizingObjective | SpeedObjective;
    readonly planRulesFingerprint: null | string;
    readonly seed?: null | number;
    readonly snapshotDate: string;
    readonly solverVersion?: null | string;
    readonly source: AdviceSource;
    readonly startBasis: StartBasis;
    readonly trials?: null | number;
}

export interface EngineRun {
    readonly seed: null | number;
    readonly trials: null | number;
}

export function adviceProvenance(
    input: AdviceProvenanceInput,
): AdviceProvenance {
    return {
        computedAt: input.computedAt,
        firmDataDate: input.firmDataDate,
        objective: input.objective,
        planRulesFingerprint: input.planRulesFingerprint,
        seed: input.seed ?? null,
        snapshotDate: input.snapshotDate,
        solverVersion: input.solverVersion ?? null,
        source: input.source,
        startBasis: input.startBasis,
        trials: input.trials ?? null,
    };
}

export function engineRunOf(
    requests: readonly EngineOptimumRequest[],
): EngineRun {
    const [request] = requests;
    if (request === undefined) return { seed: null, trials: null };
    switch (request.source) {
        case AdviceSource.FundedSweepFresh:
        case AdviceSource.FundedSweepFromState:
        case AdviceSource.NextPayoutProjection: {
            return { seed: request.base.seed, trials: request.base.trials };
        }
        case AdviceSource.LadderSearchFresh:
        case AdviceSource.LadderSearchFromState: {
            return { seed: request.seed, trials: request.score.sims };
        }
        case AdviceSource.PayoutSizeSweep: {
            return {
                seed: request.spec.run.seed,
                trials: request.spec.run.trials,
            };
        }
    }
}
