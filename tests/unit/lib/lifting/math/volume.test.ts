import { describe, expect, it } from 'vitest';

import { VolumeAnalyzer, type VolumeSet } from '~/lib/lifting/math/volume';

const analyzer = new VolumeAnalyzer();

function set(overrides: Partial<VolumeSet>): VolumeSet {
    return {
        primaryMuscle: 'chest',
        reps: 5,
        secondaryMuscles: [],
        type: 'working',
        weightKg: 100,
        ...overrides,
    };
}

describe('analyzer.tonnage', () => {
    it('returns 0 for empty', () => {
        expect(analyzer.tonnage([])).toBe(0);
    });

    it('sums weight * reps', () => {
        expect(
            analyzer.tonnage([
                set({ reps: 5, weightKg: 100 }),
                set({ reps: 8, weightKg: 50 }),
            ]),
        ).toBe(900);
    });

    it('skips null weight or reps', () => {
        expect(
            analyzer.tonnage([
                set({ reps: null, weightKg: 100 }),
                set({ reps: 5, weightKg: null }),
                set({ reps: 5, weightKg: 100 }),
            ]),
        ).toBe(500);
    });
});

describe('analyzer.workingSets', () => {
    it('includes working, topset, backoff, amrap', () => {
        const sets = [
            set({ type: 'warmup' }),
            set({ type: 'working' }),
            set({ type: 'topset' }),
            set({ type: 'backoff' }),
            set({ type: 'amrap' }),
            set({ type: 'failure' }),
        ];
        const working = analyzer.workingSets(sets);
        expect(working.map((s) => s.type)).toEqual([
            'working',
            'topset',
            'backoff',
            'amrap',
        ]);
    });
});

describe('analyzer.setsPerMuscle', () => {
    it('counts primary as 1 and each secondary as 0.5', () => {
        const counts = analyzer.setsPerMuscle([
            set({ primaryMuscle: 'chest', secondaryMuscles: ['triceps'] }),
            set({
                primaryMuscle: 'chest',
                secondaryMuscles: ['triceps', 'shoulders'],
            }),
        ]);
        expect(counts.chest).toBe(2);
        expect(counts.triceps).toBe(1);
        expect(counts.shoulders).toBe(0.5);
        expect(counts.back).toBe(0);
    });

    it('ignores warmups', () => {
        const counts = analyzer.setsPerMuscle([
            set({ primaryMuscle: 'chest', type: 'warmup' }),
        ]);
        expect(counts.chest).toBe(0);
    });
});

describe('analyzer.setsByRepRange', () => {
    it('buckets reps into known bands', () => {
        const counts = analyzer.setsByRepRange([
            set({ reps: 3 }),
            set({ reps: 7 }),
            set({ reps: 10 }),
            set({ reps: 15 }),
            set({ reps: 25 }),
        ]);
        expect(counts.strength).toBe(1);
        expect(counts.low_hypertrophy).toBe(1);
        expect(counts.hypertrophy).toBe(1);
        expect(counts.endurance).toBe(1);
        expect(counts.max_endurance).toBe(1);
    });
});
