import { describe, expect, it } from 'vitest';

import {
    BestVolumeSetPrDetector,
    EstimatedOneRepMaxPrDetector,
    HeaviestWeightPrDetector,
    PrDetectionPipeline,
    type PrSet,
    RepsAtWeightPrDetector,
} from '~/lib/lifting/pr-detection';

function s(weightKg: number, reps: number, id = 'x'): PrSet {
    return { completedAt: new Date('2025-01-01'), id, reps, weightKg };
}

describe('HeaviestWeightPrDetector', () => {
    const det = new HeaviestWeightPrDetector();

    it('flags a new heaviest weight', () => {
        const pr = det.detect([s(100, 5)], s(110, 1, 'new'));
        expect(pr).not.toBeNull();
        expect(pr?.weightKg).toBe(110);
    });

    it('does not flag when weight is equal or lower', () => {
        expect(det.detect([s(100, 5)], s(100, 1, 'new'))).toBeNull();
        expect(det.detect([s(100, 5)], s(90, 1, 'new'))).toBeNull();
    });
});

describe('RepsAtWeightPrDetector', () => {
    const det = new RepsAtWeightPrDetector();

    it('flags more reps at the exact weight', () => {
        const pr = det.detect([s(100, 5)], s(100, 6, 'new'));
        expect(pr).not.toBeNull();
        expect(pr?.reps).toBe(6);
    });

    it('does not flag if reps are equal', () => {
        expect(det.detect([s(100, 5)], s(100, 5, 'new'))).toBeNull();
    });

    it('does not flag if no prior set at this weight', () => {
        const pr = det.detect([s(95, 8)], s(100, 6, 'new'));
        expect(pr).not.toBeNull();
        expect(pr?.reps).toBe(6);
    });
});

describe('BestVolumeSetPrDetector', () => {
    const det = new BestVolumeSetPrDetector();

    it('flags a new highest single-set volume', () => {
        const pr = det.detect([s(100, 5)], s(80, 10, 'new'));
        expect(pr).not.toBeNull();
        expect(pr?.valueNumeric).toBe(800);
    });

    it('does not flag equal volume', () => {
        expect(det.detect([s(100, 5)], s(50, 10, 'new'))).toBeNull();
    });
});

describe('EstimatedOneRepMaxPrDetector', () => {
    const det = new EstimatedOneRepMaxPrDetector();

    it('flags a higher estimated 1RM', () => {
        const pr = det.detect([s(100, 5)], s(110, 5, 'new'));
        expect(pr).not.toBeNull();
    });

    it('does not flag equal-or-lower estimated 1RM', () => {
        expect(det.detect([s(100, 5)], s(100, 5, 'new'))).toBeNull();
    });
});

describe('PrDetectionPipeline', () => {
    it('runs all detectors and aggregates unlocked PRs', () => {
        const pipeline = new PrDetectionPipeline();
        const unlocked = pipeline.run([s(100, 5)], s(105, 6, 'new'));
        const kinds = unlocked.map((u) => u.kind).toSorted();
        expect(kinds).toContain('estimated_1rm');
        expect(kinds).toContain('heaviest_weight');
        expect(kinds).toContain('best_volume_set');
    });

    it('returns empty when nothing improved', () => {
        const pipeline = new PrDetectionPipeline();
        const unlocked = pipeline.run([s(200, 5), s(100, 5)], s(100, 5, 'new'));
        expect(unlocked).toEqual([]);
    });

    it('returns empty for invalid candidate', () => {
        const pipeline = new PrDetectionPipeline();
        expect(pipeline.run([], s(0, 5, 'new'))).toEqual([]);
        expect(pipeline.run([], s(100, 0, 'new'))).toEqual([]);
    });
});
