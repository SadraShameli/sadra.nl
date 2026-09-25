import { describe, expect, it } from 'vitest';

import * as labMath from '~/app/(app)/prop-calculator/_components/lab/labMath';

describe('lab math leaves the account group split to the engine', () => {
    it('has no grouped pass distribution of its own, so no silent group clamp can drift from the engine check', () => {
        expect(labMath).not.toHaveProperty('groupedPassDistribution');
    });
});
