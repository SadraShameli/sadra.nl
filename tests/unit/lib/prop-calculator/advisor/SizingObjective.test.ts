import { describe, expect, it } from 'vitest';

import {
    SizingObjective,
    sizingObjectiveText,
    SpeedObjective,
} from '~/lib/prop-calculator/advisor/SizingObjective';

describe('SizingObjective (F-118..F-121, PD-42 type declaration)', () => {
    it('declares the objectives the engine optima and the ladder/sweep sources rank by', () => {
        expect(new Set(Object.values(SizingObjective))).toEqual(
            new Set(['cycle-cash', 'monthly-net', 'ruin-first']),
        );
    });

    it('says RuinFirst ranks which plan to buy only', () => {
        expect(sizingObjectiveText(SizingObjective.RuinFirst)).toMatch(
            /ranks (which )?plans? to buy only/i,
        );
    });

    it('gives every objective non-empty text', () => {
        for (const objective of Object.values(SizingObjective)) {
            expect(sizingObjectiveText(objective).length).toBeGreaterThan(0);
        }
    });

    it('keeps speed to funded out of SizingObjective so no objective switch gains a member (PT-104, F-126)', () => {
        expect(Object.values(SizingObjective)).not.toContain(
            SpeedObjective.SpeedToFunded,
        );
        expect(Object.values(SpeedObjective)).toStrictEqual([
            'speed-to-funded',
        ]);
    });

    it('says SpeedToFunded ranks by speed to funded, not by expected monthly net', () => {
        const text = sizingObjectiveText(SpeedObjective.SpeedToFunded);

        expect(text).toMatch(/speed to funded/i);
        expect(text).toMatch(/not .*monthly net/i);
    });
});
