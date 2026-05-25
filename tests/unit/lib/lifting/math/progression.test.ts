import { describe, expect, it } from 'vitest';

import {
    DoubleProgression,
    LinearProgression,
    PercentageProgression,
    RpeTargetProgression,
    type SessionSummary,
} from '~/lib/lifting/math/progression';

function session(overrides: Partial<SessionSummary>): SessionSummary {
    return {
        allCompleted: true,
        sets: [
            { completed: true, reps: 5, weightKg: 100 },
            { completed: true, reps: 5, weightKg: 100 },
            { completed: true, reps: 5, weightKg: 100 },
        ],
        ...overrides,
    };
}

describe('LinearProgression', () => {
    it('advances when all sets are completed', () => {
        const rule = new LinearProgression({
            incrementKg: 2.5,
            minReps: 5,
            targetReps: 5,
        });
        const suggestion = rule.suggest([session({})]);
        expect(suggestion.weightKg).toBe(102.5);
        expect(suggestion.reps).toBe(5);
    });

    it('holds when reps were missed', () => {
        const rule = new LinearProgression({
            incrementKg: 2.5,
            minReps: 5,
            targetReps: 5,
        });
        const suggestion = rule.suggest([
            session({
                allCompleted: false,
                sets: [{ completed: true, reps: 3, weightKg: 100 }],
            }),
        ]);
        expect(suggestion.weightKg).toBe(100);
    });
});

describe('DoubleProgression', () => {
    it('adds a rep at the same weight when below the top of the range', () => {
        const rule = new DoubleProgression({
            incrementKg: 2.5,
            maxReps: 10,
            minReps: 8,
        });
        const suggestion = rule.suggest([
            session({
                sets: [{ completed: true, reps: 8, weightKg: 60 }],
            }),
        ]);
        expect(suggestion.weightKg).toBe(60);
        expect(suggestion.reps).toBe(9);
    });

    it('bumps weight and resets reps when the top is hit', () => {
        const rule = new DoubleProgression({
            incrementKg: 2.5,
            maxReps: 10,
            minReps: 8,
        });
        const suggestion = rule.suggest([
            session({
                sets: [{ completed: true, reps: 10, weightKg: 60 }],
            }),
        ]);
        expect(suggestion.weightKg).toBe(62.5);
        expect(suggestion.reps).toBe(8);
    });
});

describe('PercentageProgression', () => {
    it('returns target % of 1RM', () => {
        const rule = new PercentageProgression({
            oneRepMaxKg: 200,
            pct1rm: 70,
            targetReps: 5,
        });
        const suggestion = rule.suggest();
        expect(suggestion.weightKg).toBeCloseTo(140, 6);
        expect(suggestion.reps).toBe(5);
    });
});

describe('RpeTargetProgression', () => {
    it('adjusts weight up when last RPE was below target', () => {
        const rule = new RpeTargetProgression({ targetReps: 5, targetRpe: 8 });
        const suggestion = rule.suggest([
            session({
                sets: [
                    {
                        completed: true,
                        reps: 5,
                        rpe: 6,
                        weightKg: 100,
                    },
                ],
            }),
        ]);
        expect(suggestion.weightKg).toBeGreaterThan(100);
    });

    it('adjusts weight down when last RPE was above target', () => {
        const rule = new RpeTargetProgression({ targetReps: 5, targetRpe: 7 });
        const suggestion = rule.suggest([
            session({
                sets: [
                    {
                        completed: true,
                        reps: 5,
                        rpe: 9,
                        weightKg: 100,
                    },
                ],
            }),
        ]);
        expect(suggestion.weightKg).toBeLessThan(100);
    });
});
