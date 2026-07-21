import type { MuscleGroup, SetType } from '~/lib/lifting/types';

export interface RepRangeBucket {
    id: string;
    label: string;
    max: number;
    min: number;
}

export interface VolumeSet {
    primaryMuscle: MuscleGroup;
    reps: null | number;
    secondaryMuscles: readonly MuscleGroup[];
    type: SetType;
    weightKg: null | number;
}

export const REP_RANGE_BUCKETS = [
    { id: 'strength', label: '1-5', max: 5, min: 1 },
    { id: 'low_hypertrophy', label: '6-8', max: 8, min: 6 },
    { id: 'hypertrophy', label: '9-12', max: 12, min: 9 },
    { id: 'endurance', label: '13-20', max: 20, min: 13 },
    { id: 'max_endurance', label: '20+', max: Infinity, min: 21 },
] as const;

export type RepRangeBucketId = (typeof REP_RANGE_BUCKETS)[number]['id'];

const WORKING_SET_TYPES: ReadonlySet<SetType> = new Set([
    'amrap',
    'backoff',
    'topset',
    'working',
]);

export class VolumeAnalyzer {
    constructor(
        private readonly buckets: readonly RepRangeBucket[] = REP_RANGE_BUCKETS,
    ) {}

    setsByRepRange(
        sets: readonly VolumeSet[],
    ): Record<RepRangeBucketId, number> {
        const counts: Record<RepRangeBucketId, number> = {
            endurance: 0,
            hypertrophy: 0,
            low_hypertrophy: 0,
            max_endurance: 0,
            strength: 0,
        };
        for (const s of this.workingSets(sets)) {
            if (s.reps === null || s.reps <= 0) continue;
            const bucket = this.buckets.find(
                (b) => s.reps !== null && s.reps >= b.min && s.reps <= b.max,
            );
            if (bucket) counts[bucket.id as RepRangeBucketId] += 1;
        }
        return counts;
    }

    setsPerMuscle(sets: readonly VolumeSet[]): Record<MuscleGroup, number> {
        const counts = emptyMuscleCounter();
        for (const s of this.workingSets(sets)) {
            counts[s.primaryMuscle] += 1;
            applySecondaryMuscles(counts, s);
        }
        return counts;
    }

    tonnage(sets: readonly VolumeSet[]): number {
        return sets.reduce((accumulator, s) => {
            if (s.weightKg === null || s.reps === null) return accumulator;
            if (s.weightKg <= 0 || s.reps <= 0) return accumulator;
            return accumulator + s.weightKg * s.reps;
        }, 0);
    }

    workingSets(sets: readonly VolumeSet[]): VolumeSet[] {
        return sets.filter((s) => WORKING_SET_TYPES.has(s.type));
    }
}

function applySecondaryMuscles(
    counts: Record<MuscleGroup, number>,
    set: VolumeSet,
): void {
    const seen = new Set<MuscleGroup>();
    for (const m of set.secondaryMuscles) {
        if (m === set.primaryMuscle || seen.has(m)) continue;
        seen.add(m);
        counts[m] += 0.5;
    }
}

function emptyMuscleCounter(): Record<MuscleGroup, number> {
    return {
        abs: 0,
        back: 0,
        biceps: 0,
        calves: 0,
        chest: 0,
        forearms: 0,
        glutes: 0,
        hamstrings: 0,
        lats: 0,
        quads: 0,
        shoulders: 0,
        traps: 0,
        triceps: 0,
    };
}

export const volumeAnalyzer = new VolumeAnalyzer();
