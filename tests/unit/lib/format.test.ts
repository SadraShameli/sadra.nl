import { describe, expect, it } from 'vitest';

import {
    formatCurrency,
    formatFiniteCurrency,
    formatGateCurrency,
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

describe('formatGateCurrency (R-8: one whole-dollars-or-cents gate formatter)', () => {
    it('prints a whole-dollar gate with no cents', () => {
        expect(formatGateCurrency(500)).toBe('$500');
        expect(formatGateCurrency(1500)).toBe('$1,500');
    });

    it('prints a sub-dollar or fractional gate in cents', () => {
        expect(formatGateCurrency(0.01)).toBe('$0.01');
        expect(formatGateCurrency(250.5)).toBe('$250.50');
    });

    it('compacts a whole-dollar gate of $1,000 or more when asked', () => {
        expect(formatGateCurrency(1500, { compact: true })).toBe('$1.5K');
        expect(formatGateCurrency(500, { compact: true })).toBe('$500');
    });

    it('keeps cents for a fractional gate even when compact', () => {
        expect(formatGateCurrency(0.01, { compact: true })).toBe('$0.01');
        expect(formatGateCurrency(1500.25, { compact: true })).toBe(
            '$1,500.25',
        );
    });
});
