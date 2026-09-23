import { describe, expect, it } from 'vitest';

import {
    formatCurrency,
    formatFiniteCurrency,
    formatOptionalPercent,
    NOT_APPLICABLE,
} from '~/lib/format';

describe('NOT_APPLICABLE', () => {
    it("is the 'n/a' placeholder every optional formatter prints", () => {
        expect(NOT_APPLICABLE).toBe('n/a');
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
