import { describe, expect, it } from 'vitest';

import {
    type MeasuredRebuyLag,
    measuredRebuyLagFrom,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor';

describe('measuredRebuyLagFrom (PT-19f)', () => {
    it('carries the measured days with one sample when the basis is measured', () => {
        const resolution: MeasuredRebuyLag = measuredRebuyLagFrom({
            basis: RebuyLagBasis.Measured,
            days: 12,
        });

        expect(resolution).toEqual({ days: 12, samples: 1 });
    });

    it('reports zero samples when the basis is assumed zero, regardless of the days field', () => {
        const resolution = measuredRebuyLagFrom({
            basis: RebuyLagBasis.AssumedZero,
            days: 0,
        });

        expect(resolution).toEqual({ days: 0, samples: 0 });
    });
});
