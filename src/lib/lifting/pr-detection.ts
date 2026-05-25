import type { PrKind } from '~/lib/lifting/types';

import { oneRepMaxCalculator } from '~/lib/lifting/math/one-rep-max';

export interface PrSet {
    completedAt: Date;
    id: string;
    reps: number;
    weightKg: number;
}

export interface PrUnlocked {
    achievedAt: Date;
    kind: PrKind;
    reps: number;
    setId: string;
    valueNumeric: number;
    weightKg: number;
}

export abstract class PrDetector {
    abstract readonly kind: PrKind;
    abstract detect(
        history: readonly PrSet[],
        candidate: PrSet,
    ): null | PrUnlocked;

    protected unlocked(candidate: PrSet, valueNumeric: number): PrUnlocked {
        return {
            achievedAt: candidate.completedAt,
            kind: this.kind,
            reps: candidate.reps,
            setId: candidate.id,
            valueNumeric,
            weightKg: candidate.weightKg,
        };
    }
}

export class BestVolumeSetPrDetector extends PrDetector {
    readonly kind = 'best_volume_set' as const;

    detect(history: readonly PrSet[], candidate: PrSet): null | PrUnlocked {
        if (candidate.weightKg <= 0 || candidate.reps <= 0) return null;
        const candidateVolume = candidate.weightKg * candidate.reps;
        const best = history.reduce((acc, s) => {
            const v = s.weightKg * s.reps;
            return Math.max(v, acc);
        }, 0);
        if (candidateVolume <= best) return null;
        return this.unlocked(candidate, candidateVolume);
    }
}

export class EstimatedOneRepMaxPrDetector extends PrDetector {
    readonly kind = 'estimated_1rm' as const;

    detect(history: readonly PrSet[], candidate: PrSet): null | PrUnlocked {
        const candidateValue = oneRepMaxCalculator.estimate(
            candidate.weightKg,
            candidate.reps,
        );
        if (candidateValue <= 0) return null;
        const best = history.reduce((acc, s) => {
            const v = oneRepMaxCalculator.estimate(s.weightKg, s.reps);
            return Math.max(v, acc);
        }, 0);
        if (candidateValue <= best) return null;
        return this.unlocked(candidate, candidateValue);
    }
}

export class HeaviestWeightPrDetector extends PrDetector {
    readonly kind = 'heaviest_weight' as const;

    detect(history: readonly PrSet[], candidate: PrSet): null | PrUnlocked {
        if (candidate.weightKg <= 0 || candidate.reps <= 0) return null;
        const best = history.reduce((acc, s) => Math.max(s.weightKg, acc), 0);
        if (candidate.weightKg <= best) return null;
        return this.unlocked(candidate, candidate.weightKg);
    }
}

export class RepsAtWeightPrDetector extends PrDetector {
    readonly kind = 'reps_at_weight' as const;

    detect(history: readonly PrSet[], candidate: PrSet): null | PrUnlocked {
        if (candidate.weightKg <= 0 || candidate.reps <= 0) return null;
        const bestAtWeight = history
            .filter((s) => Math.abs(s.weightKg - candidate.weightKg) < 1e-3)
            .reduce((acc, s) => Math.max(s.reps, acc), 0);
        if (candidate.reps <= bestAtWeight) return null;
        return this.unlocked(candidate, candidate.reps);
    }
}

export const PR_DETECTORS: readonly PrDetector[] = [
    new EstimatedOneRepMaxPrDetector(),
    new HeaviestWeightPrDetector(),
    new RepsAtWeightPrDetector(),
    new BestVolumeSetPrDetector(),
];

export class PrDetectionPipeline {
    constructor(
        private readonly detectors: readonly PrDetector[] = PR_DETECTORS,
    ) {}

    run(history: readonly PrSet[], candidate: PrSet): PrUnlocked[] {
        const out: PrUnlocked[] = [];
        for (const d of this.detectors) {
            const result = d.detect(history, candidate);
            if (result) out.push(result);
        }
        return out;
    }
}
