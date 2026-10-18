import { describe, expect, it } from 'vitest';

import {
    CreditBasis,
    valueGap,
    valueResult,
} from '~/lib/prop-calculator/advisor/value';

const FROM = valueResult(
    {
        creditFree: { standardError: 3, value: 90 },
        creditInclusive: { standardError: 5, value: 100 },
    },
    7,
    500,
);

const TO = valueResult(
    {
        creditFree: { standardError: 4, value: 400 },
        creditInclusive: { standardError: 12, value: 450 },
    },
    7,
    500,
);

describe('valueGap credit basis (PT-67 addendum)', () => {
    it('measures the credit-free gap with the credit-free standard errors', () => {
        const gap = valueGap(FROM, TO, CreditBasis.CreditFree);

        expect(gap.value).toBe(310);
        expect(gap.standardError).toBeCloseTo(Math.hypot(3, 4), 10);
    });

    it('measures the credit-inclusive gap with the credit-inclusive standard errors', () => {
        const gap = valueGap(FROM, TO, CreditBasis.CreditInclusive);

        expect(gap.value).toBe(350);
        expect(gap.standardError).toBeCloseTo(Math.hypot(5, 12), 10);
    });

    it('keeps the credit-inclusive gap as the default so the trade swing is unchanged', () => {
        expect(valueGap(FROM, TO)).toEqual(
            valueGap(FROM, TO, CreditBasis.CreditInclusive),
        );
    });

    it('reports an unknown standard error when either side has none on that basis', () => {
        const unknown = valueResult(
            {
                creditFree: { standardError: null, value: 1 },
                creditInclusive: { standardError: 2, value: 1 },
            },
            7,
            500,
        );

        expect(
            valueGap(unknown, TO, CreditBasis.CreditFree).standardError,
        ).toBeNull();
        expect(
            valueGap(unknown, TO, CreditBasis.CreditInclusive).standardError,
        ).not.toBeNull();
    });
});
