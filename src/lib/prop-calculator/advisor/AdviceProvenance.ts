import { type AdviceSource } from './AdviceSource';
import { type SizingObjective } from './SizingObjective';
import { type StartBasis } from './StartBasis';

export interface AdviceProvenance {
    readonly computedAt: string;
    readonly firmDataDate: null | string;
    readonly objective: SizingObjective;
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
    readonly objective: SizingObjective;
    readonly planRulesFingerprint: null | string;
    readonly seed?: null | number;
    readonly snapshotDate: string;
    readonly solverVersion?: null | string;
    readonly source: AdviceSource;
    readonly startBasis: StartBasis;
    readonly trials?: null | number;
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
