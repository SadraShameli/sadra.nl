import { describe, expect, it } from 'vitest';

import { cashFlowRoiOnSpend } from '~/app/(app)/prop-calculator/_components/cashFlowRoi';

describe('cashFlowRoiOnSpend (R1-29)', () => {
    it('leaves the figure empty, not n/a text, at zero spend instead of a 0%', () => {
        expect(cashFlowRoiOnSpend(1500, 0)).toBeNull();
    });

    it('leaves the figure empty, not n/a text, at zero spend and a loss', () => {
        expect(cashFlowRoiOnSpend(-200, 0)).toBeNull();
    });

    it('leaves the figure empty, not n/a text, when there is no result yet', () => {
        expect(cashFlowRoiOnSpend(0, 0)).toBeNull();
    });

    it('divides median net by median spend when spend is positive', () => {
        expect(cashFlowRoiOnSpend(1500, 600)).toBe('250.0%');
    });

    it('keeps the minus sign on a negative return', () => {
        expect(cashFlowRoiOnSpend(-300, 600)).toBe('-50.0%');
    });

    it('shows an exact break-even as 0.0%', () => {
        expect(cashFlowRoiOnSpend(0, 600)).toBe('0.0%');
    });
});
