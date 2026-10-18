import { describe, expect, it } from 'vitest';

import * as labMath from '~/app/(app)/prop-calculator/_components/lab/labMath';

describe('lab math leaves the account group split to the engine', () => {
    it('has no grouped pass distribution of its own, so no silent group clamp can drift from the engine check', () => {
        expect(labMath).not.toHaveProperty('groupedPassDistribution');
    });
});

describe('lab math exports only what the web panels import (WP24)', () => {
    it('drops the binomial helpers and the expectedMaxLossStreak copy that nothing imports', () => {
        expect(
            Object.keys(labMath).toSorted((a, b) => a.localeCompare(b)),
        ).toStrictEqual(['gamblersRuinAsymmetric', 'probStreakAtLeast']);
    });
});
