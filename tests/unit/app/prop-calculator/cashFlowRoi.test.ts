import { describe, expect, it } from 'vitest';

import { cashFlowRoiOnSpend } from '~/app/(app)/prop-calculator/_components/cashFlowRoi';
import { KpiAccent } from '~/app/(app)/prop-calculator/_components/kpiAccent';

describe('cashFlowRoiOnSpend (R1-29)', () => {
    it('shows n/a with a neutral accent at zero spend instead of a green 0%', () => {
        expect(cashFlowRoiOnSpend(1500, 0)).toEqual({
            accent: KpiAccent.Neutral,
            text: 'n/a',
        });
    });

    it('shows n/a with a neutral accent at zero spend and a loss', () => {
        expect(cashFlowRoiOnSpend(-200, 0)).toEqual({
            accent: KpiAccent.Neutral,
            text: 'n/a',
        });
    });

    it('shows n/a when there is no result yet', () => {
        expect(cashFlowRoiOnSpend(0, 0)).toEqual({
            accent: KpiAccent.Neutral,
            text: 'n/a',
        });
    });

    it('divides median net by median spend when spend is positive', () => {
        expect(cashFlowRoiOnSpend(1500, 600)).toEqual({
            accent: KpiAccent.Positive,
            text: '250.0%',
        });
    });

    it('marks a negative return as negative', () => {
        expect(cashFlowRoiOnSpend(-300, 600)).toEqual({
            accent: KpiAccent.Negative,
            text: '-50.0%',
        });
    });

    it('marks an exact break-even as neutral, matching the results panel', () => {
        expect(cashFlowRoiOnSpend(0, 600)).toEqual({
            accent: KpiAccent.Neutral,
            text: '0.0%',
        });
    });
});
