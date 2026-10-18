import { describe, expect, it } from 'vitest';

import { dollars, TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator/core';
import {
    EconomicsReason,
    netPerScreenHour,
} from '~/lib/prop-calculator/economics';

describe('netPerScreenHour', () => {
    it('is monthly net x accounts per session / (trading days per month x session hours)', () => {
        const result = netPerScreenHour({
            accountsPerSession: 3,
            expectedMonthlyNet: dollars(1050),
            sessionHoursPerDay: 2,
        });
        expect(result.value?.value).toBeCloseTo(
            (1050 * 3) / (TRADING_DAYS_PER_MONTH * 2),
            12,
        );
        expect(result.value?.value).toBeCloseTo(75, 12);
        expect(result.value?.standardError).toBeNull();
    });

    it('carries the standard error through by the same factor', () => {
        const result = netPerScreenHour({
            accountsPerSession: 3,
            expectedMonthlyNet: dollars(1050),
            expectedMonthlyNetStandardError: 70,
            sessionHoursPerDay: 2,
        });
        expect(result.value?.standardError).toBeCloseTo(5, 12);
    });

    it('keeps a negative monthly net negative', () => {
        expect(
            netPerScreenHour({
                accountsPerSession: 1,
                expectedMonthlyNet: dollars(-210),
                sessionHoursPerDay: 1,
            }).value?.value,
        ).toBeCloseTo(-10, 12);
    });

    it.each([
        { accountsPerSession: 0, sessionHoursPerDay: 2 },
        { accountsPerSession: 1.5, sessionHoursPerDay: 2 },
        { accountsPerSession: 2, sessionHoursPerDay: 0 },
        { accountsPerSession: 2, sessionHoursPerDay: NaN },
    ])('refuses %o', (override) => {
        expect(
            netPerScreenHour({
                expectedMonthlyNet: dollars(1000),
                ...override,
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });

    it('refuses a negative standard error', () => {
        expect(
            netPerScreenHour({
                accountsPerSession: 1,
                expectedMonthlyNet: dollars(1000),
                expectedMonthlyNetStandardError: -1,
                sessionHoursPerDay: 1,
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });
});
