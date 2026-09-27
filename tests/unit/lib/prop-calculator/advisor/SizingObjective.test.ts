import { describe, expect, it } from 'vitest';

import {
    SizingObjective,
    sizingObjectiveText,
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
});
