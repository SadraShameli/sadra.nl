import { describe, expect, it } from 'vitest';

import {
    formatConjunctionList,
    formatCount,
    formatCurrency,
    formatDays,
    formatFiniteCurrency,
    formatFixedNumber,
    formatNumber,
    formatOptionalPercent,
    formatWholeOrCentsCurrency,
    NOT_APPLICABLE,
} from '~/lib/format';

describe('NOT_APPLICABLE', () => {
    it("is the 'n/a' placeholder every optional formatter prints", () => {
        expect(NOT_APPLICABLE).toBe('n/a');
    });
});

describe('formatDays (WP21b: no em dash placeholder)', () => {
    it.each([0, -1, NaN, Infinity])(
        "prints 'n/a' for a missing day count %s",
        (value) => {
            expect(formatDays(value)).toBe(NOT_APPLICABLE);
        },
    );

    it('formats a positive day count to one decimal', () => {
        expect(formatDays(12.34)).toBe('12.3 d');
    });
});

describe('formatOptionalPercent', () => {
    it("prints 'n/a' for a missing ratio", () => {
        expect(formatOptionalPercent(null)).toBe(NOT_APPLICABLE);
    });

    it('formats a present ratio exactly like formatPercent', () => {
        expect(formatOptionalPercent(0.123)).toBe('12.3%');
        expect(formatOptionalPercent(0)).toBe('0.0%');
        expect(formatOptionalPercent(-0.5)).toBe('-50.0%');
    });

    it('honours the fraction digits', () => {
        expect(formatOptionalPercent(0.12345, 2)).toBe('12.35%');
    });
});

describe('formatCurrency', () => {
    it.each([
        [0, 0, '$0'],
        [1234.56, 0, '$1,235'],
        [-1234.56, 2, '-$1,234.56'],
        [250, 2, '$250.00'],
        [0.0123, 4, '$0.0123'],
        [1_000_000.5, 1, '$1,000,000.5'],
        [-0.004, 2, '-$0.00'],
    ])('formats %s with %s decimals as %s', (value, digits, expected) => {
        expect(formatCurrency(value, digits)).toBe(expected);
    });

    it('prints the same text on every call for each number of decimals', () => {
        const values = [0, 7, -12.345, 9_876_543.21];
        for (const digits of [0, 1, 2, 4]) {
            const first = values.map((value) => formatCurrency(value, digits));
            const again = values.map((value) => formatCurrency(value, digits));
            expect(again).toEqual(first);
        }
    });
});

describe('formatFiniteCurrency', () => {
    it.each([Infinity, -Infinity, NaN])("prints 'n/a' for %s", (value) => {
        expect(formatFiniteCurrency(value)).toBe(NOT_APPLICABLE);
        expect(formatFiniteCurrency(value, 4)).toBe(NOT_APPLICABLE);
    });

    it('never prints an infinity symbol', () => {
        expect(formatFiniteCurrency(Infinity)).not.toContain('\u{221E}');
    });

    it.each([0, 1234, -56.5, 0.0123])(
        'formats a finite %s exactly like formatCurrency',
        (value) => {
            expect(formatFiniteCurrency(value)).toBe(formatCurrency(value));
            expect(formatFiniteCurrency(value, 4)).toBe(
                formatCurrency(value, 4),
            );
        },
    );

    it('defaults to whole dollars', () => {
        expect(formatFiniteCurrency(1234.56)).toBe('$1,235');
        expect(formatFiniteCurrency(0.0123, 4)).toBe('$0.0123');
    });
});

describe('formatWholeOrCentsCurrency (R-8: one whole-dollars-or-cents gate formatter)', () => {
    it('prints a whole-dollar gate with no cents', () => {
        expect(formatWholeOrCentsCurrency(500)).toBe('$500');
        expect(formatWholeOrCentsCurrency(1500)).toBe('$1,500');
    });

    it('prints a sub-dollar or fractional gate in cents', () => {
        expect(formatWholeOrCentsCurrency(0.01)).toBe('$0.01');
        expect(formatWholeOrCentsCurrency(250.5)).toBe('$250.50');
    });

    it('compacts a whole-dollar gate of $1,000 or more when asked', () => {
        expect(formatWholeOrCentsCurrency(1500, { compact: true })).toBe(
            '$1.5K',
        );
        expect(formatWholeOrCentsCurrency(500, { compact: true })).toBe('$500');
    });

    it('keeps cents for a fractional gate even when compact', () => {
        expect(formatWholeOrCentsCurrency(0.01, { compact: true })).toBe(
            '$0.01',
        );
        expect(formatWholeOrCentsCurrency(1500.25, { compact: true })).toBe(
            '$1,500.25',
        );
    });
});

describe('formatConjunctionList (WP39f: one list formatter for the CLI and the web)', () => {
    it.each([
        [[], ''],
        [['$150'], '$150'],
        [['$150', '$1,000'], '$150 and $1,000'],
        [
            ['transition credit', 'capital returned', 'liquidation payout'],
            'transition credit, capital returned and liquidation payout',
        ],
    ] as const)('joins %j as %j with no Oxford comma', (items, expected) => {
        expect(formatConjunctionList(items)).toBe(expected);
    });
});

describe('number formatters', () => {
    it('groups a whole count and rounds away decimals', () => {
        expect(formatCount(12_345)).toBe('12,345');
        expect(formatCount(2.6)).toBe('3');
    });

    it('keeps up to the given decimals and drops trailing zeros', () => {
        expect(formatNumber(1234.5)).toBe('1,234.5');
        expect(formatNumber(0.123456, 3)).toBe('0.123');
    });

    it('always shows the given decimals, without a currency symbol', () => {
        expect(formatFixedNumber(1234.5)).toBe('1,234.50');
        expect(formatFixedNumber(7, 0)).toBe('7');
    });
});
