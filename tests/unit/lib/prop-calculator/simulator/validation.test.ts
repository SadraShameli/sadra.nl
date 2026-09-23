import { describe, expect, it } from 'vitest';

import * as root from '~/lib/prop-calculator';
import {
    ConsistencyBoundary,
    ConsistencyNonPositiveProfit,
    TRADING_DAYS_PER_MONTH,
    TRADING_DAYS_PER_YEAR,
} from '~/lib/prop-calculator/core';
import {
    assertPositiveSafeInteger,
    oneOffLiveCredit,
} from '~/lib/prop-calculator/simulator';

describe('assertPositiveSafeInteger', () => {
    it.each([0, -5, 1.5, NaN, Infinity, -Infinity, 2 ** 53])(
        'rejects %s with the named field in the message',
        (value) => {
            expect(() => {
                assertPositiveSafeInteger(value, 'dayBudget');
            }).toThrow(/dayBudget must be a positive safe integer/);
        },
    );

    it.each([1, 252, Number.MAX_SAFE_INTEGER])('accepts %s', (value) => {
        expect(() => {
            assertPositiveSafeInteger(value, 'trials');
        }).not.toThrow();
    });
});

describe('the prop-calculator barrels surface the shared constants, consistency enums and live helpers', () => {
    it('exports TRADING_DAYS_PER_YEAR as twelve trading months', () => {
        expect(TRADING_DAYS_PER_YEAR).toBe(TRADING_DAYS_PER_MONTH * 12);
        expect(root.TRADING_DAYS_PER_YEAR).toBe(TRADING_DAYS_PER_YEAR);
    });

    it('re-exports the consistency boundary and non-positive profit enums from the root barrel', () => {
        expect(ConsistencyBoundary.Inclusive).toBe('inclusive');
        expect(ConsistencyNonPositiveProfit.Violates).toBe('violates');
        expect(root.ConsistencyBoundary).toBe(ConsistencyBoundary);
        expect(root.ConsistencyNonPositiveProfit).toBe(
            ConsistencyNonPositiveProfit,
        );
    });

    it('re-exports the simulator guard and one-off live credit from the root barrel', () => {
        expect(assertPositiveSafeInteger).toBeTypeOf('function');
        expect(oneOffLiveCredit).toBeTypeOf('function');
        expect(root.assertPositiveSafeInteger).toBe(assertPositiveSafeInteger);
        expect(root.oneOffLiveCredit).toBe(oneOffLiveCredit);
    });
});
