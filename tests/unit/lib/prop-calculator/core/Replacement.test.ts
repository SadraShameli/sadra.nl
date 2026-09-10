import { describe, expect, it } from 'vitest';

import { replacementEconomics } from '~/lib/prop-calculator/core/Replacement';

describe('replacementEconomics', () => {
    it('derives attempts/cost/days from evalPrice, passRate, and mean days', () => {
        const result = replacementEconomics({
            evalPrice: 200,
            meanDaysOnFail: 10,
            meanDaysOnPass: 6,
            passRate: 0.4,
        });

        expect(result.attemptsPerFundedAccount).toBeCloseTo(2.5, 10);
        expect(result.costPerFundedAccount).toBeCloseTo(500, 10);
        expect(result.daysPerFundedAccount).toBeCloseTo(21, 10);
    });

    it('collapses to a single attempt at a 100% pass rate', () => {
        const result = replacementEconomics({
            evalPrice: 150,
            meanDaysOnFail: 999,
            meanDaysOnPass: 8,
            passRate: 1,
        });

        expect(result.attemptsPerFundedAccount).toBe(1);
        expect(result.costPerFundedAccount).toBe(150);
        expect(result.daysPerFundedAccount).toBe(8);
    });

    it('is infinite across the board when nobody ever passes', () => {
        const result = replacementEconomics({
            evalPrice: 200,
            meanDaysOnFail: 10,
            meanDaysOnPass: 6,
            passRate: 0,
        });

        expect(result.attemptsPerFundedAccount).toBe(Infinity);
        expect(result.costPerFundedAccount).toBe(Infinity);
        expect(result.daysPerFundedAccount).toBe(Infinity);
    });
});
