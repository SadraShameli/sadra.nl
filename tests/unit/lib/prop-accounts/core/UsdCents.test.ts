import { describe, expect, it } from 'vitest';

import {
    CentsDisplay,
    formatUsdCents,
    INT4_MAX,
    INT4_MIN,
    nonNegativeUsdCentsSchema,
    parseUsdCents,
    positiveUsdCentsSchema,
    sumUsdCents,
    usdCents,
    usdCentsFromDollars,
    usdCentsSchema,
    usdCentsToDollars,
    usdCentsToText,
} from '~/lib/prop-accounts';
import { dollars } from '~/lib/prop-calculator';

describe('usdCentsSchema', () => {
    it('accepts int4 integers', () => {
        for (const value of [0, 1, -1, 123_456, INT4_MAX, INT4_MIN]) {
            expect(usdCentsSchema.safeParse(value).success).toBe(true);
        }
    });

    it('rejects fractions, NaN, infinities and values outside int4', () => {
        for (const value of [
            1.5,
            NaN,
            Infinity,
            -Infinity,
            2 ** 31,
            -(2 ** 31) - 1,
        ]) {
            expect(usdCentsSchema.safeParse(value).success).toBe(false);
        }
    });

    it('rejects non-numbers', () => {
        expect(usdCentsSchema.safeParse('100').success).toBe(false);
        expect(usdCentsSchema.safeParse(null).success).toBe(false);
    });
});

describe('nonNegativeUsdCentsSchema', () => {
    it('accepts zero and rejects -1', () => {
        expect(nonNegativeUsdCentsSchema.safeParse(0).success).toBe(true);
        expect(nonNegativeUsdCentsSchema.safeParse(-1).success).toBe(false);
        expect(nonNegativeUsdCentsSchema.safeParse(2 ** 31).success).toBe(
            false,
        );
    });
});

describe('positiveUsdCentsSchema', () => {
    it('rejects zero and accepts one cent', () => {
        expect(positiveUsdCentsSchema.safeParse(0).success).toBe(false);
        expect(positiveUsdCentsSchema.safeParse(1).success).toBe(true);
    });
});

describe('usdCents', () => {
    it('brands a whole cent amount', () => {
        expect(usdCents(250)).toBe(250);
    });

    it('throws on a fractional or non-finite amount, naming the value', () => {
        expect(() => usdCents(1.5)).toThrow(/1\.5/);
        expect(() => usdCents(NaN)).toThrow(/NaN/);
        expect(() => usdCents(Infinity)).toThrow(/Infinity/);
    });
});

describe('parseUsdCents', () => {
    it('parses a decimal dollar string exactly', () => {
        expect(parseUsdCents('1234.56')).toBe(123_456);
        expect(parseUsdCents('0.1')).toBe(10);
        expect(parseUsdCents('0.10')).toBe(10);
        expect(parseUsdCents('50000')).toBe(5_000_000);
        expect(parseUsdCents('0.07')).toBe(7);
        expect(parseUsdCents('-500.25')).toBe(-50_025);
        expect(parseUsdCents(' 12.3 ')).toBe(1230);
    });

    it('never returns negative zero', () => {
        expect(Object.is(parseUsdCents('-0'), 0)).toBe(true);
        expect(Object.is(parseUsdCents('-0.00'), 0)).toBe(true);
    });

    it('throws naming the value for anything that is not an exact dollar amount', () => {
        for (const text of [
            '1.005',
            '1,234',
            '',
            ' '.repeat(3),
            'abc',
            '1e3',
            '.5',
            '1.',
            '$5',
            '+5',
            '--1',
            '21474836.48',
        ]) {
            expect(() => parseUsdCents(text)).toThrow(`"${text}"`);
        }
    });

    it('accepts the int4 bounds exactly', () => {
        expect(parseUsdCents('21474836.47')).toBe(INT4_MAX);
        expect(parseUsdCents('-21474836.48')).toBe(INT4_MIN);
    });
});

describe('sumUsdCents', () => {
    it('sums integer cents exactly', () => {
        expect(sumUsdCents([usdCents(10), usdCents(20)])).toBe(30);
        expect(sumUsdCents([])).toBe(0);
        expect(sumUsdCents([usdCents(10), usdCents(20), usdCents(-5)])).toBe(
            25,
        );
    });

    it('stays exact where summing float dollars drifts', () => {
        const tenCents = Array.from({ length: 10 }, () => usdCents(10));
        expect(sumUsdCents(tenCents)).toBe(100);
    });

    it('throws when the total leaves the safe integer range', () => {
        expect(() =>
            sumUsdCents([usdCents(Number.MAX_SAFE_INTEGER), usdCents(1)]),
        ).toThrow(/safe integer/);
    });
});

describe('usdCentsToDollars', () => {
    it('converts to engine dollars at the boundary', () => {
        expect(usdCentsToDollars(usdCents(123_456))).toBe(dollars(1234.56));
        expect(usdCentsToDollars(usdCents(-50))).toBe(dollars(-0.5));
        expect(usdCentsToDollars(usdCents(0))).toBe(dollars(0));
    });
});

describe('usdCentsFromDollars', () => {
    it('rounds half away from zero', () => {
        expect(usdCentsFromDollars(1234.56)).toBe(123_456);
        expect(usdCentsFromDollars(1.005)).toBe(101);
        expect(usdCentsFromDollars(-1.005)).toBe(-101);
        expect(usdCentsFromDollars(0.125)).toBe(13);
        expect(usdCentsFromDollars(-0.125)).toBe(-13);
        expect(usdCentsFromDollars(0.124)).toBe(12);
        expect(usdCentsFromDollars(-0.124)).toBe(-12);
    });

    it('never returns negative zero', () => {
        expect(Object.is(usdCentsFromDollars(-0.001), 0)).toBe(true);
    });

    it('never moves a value just under half a cent up to the next cent', () => {
        expect(usdCentsFromDollars(0.00499999)).toBe(0);
        expect(usdCentsFromDollars(-0.00499999)).toBe(0);
        expect(usdCentsFromDollars(0.0049999999)).toBe(0);
        expect(usdCentsFromDollars(12.34499999)).toBe(1234);
        expect(usdCentsFromDollars(1_234_567.004999)).toBe(123_456_700);
    });

    it('rounds the shortest decimal form of the number, so a written half always rounds away from zero', () => {
        expect(usdCentsFromDollars(1.005)).toBe(101);
        expect(usdCentsFromDollars(1.115)).toBe(112);
        expect(usdCentsFromDollars(2.675)).toBe(268);
        expect(usdCentsFromDollars(10.005)).toBe(1001);
        expect(usdCentsFromDollars(1_234_567.005)).toBe(123_456_701);
        for (let cents = 0; cents <= 200_000; cents += 1) {
            expect(usdCentsFromDollars((cents + 0.5) / 100)).toBe(cents + 1);
        }
    });

    it.each([
        [1.005, 101],
        [-1.005, -101],
        [0.00499999, 0],
        [-0.00499999, 0],
        [1_234_567.895, 123_456_790],
        [-1_234_567.895, -123_456_790],
        [1.0049999999999997, 100],
        [-1.0049999999999997, -100],
        [21_474_836.47, INT4_MAX],
        [-21_474_836.48, INT4_MIN],
        [21_474_836.465, INT4_MAX],
        [-21_474_836.475, INT4_MIN],
        [21_474_836.464999, INT4_MAX - 1],
        [0.005, 1],
        [-0.005, -1],
        [5e-7, 0],
        [1e-7, 0],
        [0, 0],
    ])('converts %d dollars to exactly %d cents', (value, cents) => {
        expect(usdCentsFromDollars(value)).toBe(cents);
    });

    it.each([
        [0.0049999999999999, 0],
        [0.0149999999999999, 1],
        [12.3449999999999, 1234],
        [100.004999999999, 10_000],
        [123_456.784999999, 12_345_678],
        [21_474_836.4649999, INT4_MAX - 1],
    ])(
        'decides %d by its decimal digits, not by a tolerance, just below a half',
        (value, cents) => {
            expect(usdCentsFromDollars(value)).toBe(cents);
            expect(usdCentsFromDollars(-value)).toBe(cents === 0 ? 0 : -cents);
        },
    );

    it('fails loud on an amount outside the safe cent range', () => {
        expect(() => usdCentsFromDollars(1e21)).toThrow(RangeError);
        expect(() => usdCentsFromDollars(-1e21)).toThrow(RangeError);
    });

    it('throws on non-finite input', () => {
        expect(() => usdCentsFromDollars(NaN)).toThrow(/NaN/);
        expect(() => usdCentsFromDollars(Infinity)).toThrow(/Infinity/);
        expect(() => usdCentsFromDollars(-Infinity)).toThrow(/Infinity/);
    });

    it('round-trips every cent amount through dollars', () => {
        for (let cents = -1000; cents <= 1000; cents += 7) {
            const asDollars = usdCentsToDollars(usdCents(cents));
            expect(usdCentsFromDollars(asDollars)).toBe(cents);
        }
    });
});

describe('formatUsdCents', () => {
    it('shows whole dollars without decimals and other amounts with two', () => {
        expect(formatUsdCents(usdCents(5_000_000))).toBe('$50,000');
        expect(formatUsdCents(usdCents(12_345))).toBe('$123.45');
        expect(formatUsdCents(usdCents(5))).toBe('$0.05');
        expect(formatUsdCents(usdCents(-125_050))).toBe('-$1,250.50');
        expect(formatUsdCents(usdCents(-100))).toBe('-$1');
        expect(formatUsdCents(usdCents(0))).toBe('$0');
    });

    it('always shows two decimals when asked, for amounts compared side by side', () => {
        expect(formatUsdCents(usdCents(90_000), CentsDisplay.Always)).toBe(
            '$900.00',
        );
        expect(formatUsdCents(usdCents(90_101), CentsDisplay.Always)).toBe(
            '$901.01',
        );
        expect(formatUsdCents(usdCents(0), CentsDisplay.Always)).toBe('$0.00');
        expect(formatUsdCents(usdCents(-5), CentsDisplay.WhenFractional)).toBe(
            '-$0.05',
        );
    });

    it('formats the int4 extremes exactly', () => {
        expect(formatUsdCents(usdCents(INT4_MAX))).toBe('$21,474,836.47');
        expect(formatUsdCents(usdCents(INT4_MIN))).toBe('-$21,474,836.48');
    });
});

describe('usdCentsToText', () => {
    it('writes whole dollars without decimals and cents with two digits', () => {
        expect(usdCentsToText(usdCents(5_000_000))).toBe('50000');
        expect(usdCentsToText(usdCents(5))).toBe('0.05');
        expect(usdCentsToText(usdCents(-125_050))).toBe('-1250.50');
        expect(usdCentsToText(usdCents(-5))).toBe('-0.05');
        expect(usdCentsToText(usdCents(0))).toBe('0');
    });

    it('is the inverse of parseUsdCents over the whole int4 range', () => {
        for (const cents of [
            INT4_MIN,
            -125_050,
            -100,
            -1,
            0,
            1,
            99,
            100,
            101,
            12_345,
            INT4_MAX,
        ]) {
            const text = usdCentsToText(usdCents(cents));
            expect(parseUsdCents(text)).toBe(cents);
        }
    });
});
