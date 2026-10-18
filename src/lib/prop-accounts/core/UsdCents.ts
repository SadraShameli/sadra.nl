import { z } from 'zod';

import { formatCurrency } from '~/lib/format';
import { CENTS_PER_DOLLAR, type Dollars, dollars } from '~/lib/prop-calculator';

export enum CentsDisplay {
    Always = 'always',
    WhenFractional = 'when-fractional',
}

export type UsdCents = number & { readonly __brand: 'UsdCents' };

export const INT4_MAX = 2_147_483_647;
export const INT4_MIN = -2_147_483_648;

const CENT_DIGITS = 2;
const HALF_DIGIT = 5;
const DOLLAR_AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;
const SHORTEST_DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/;

function brand(value: number): UsdCents {
    return value as UsdCents;
}

export const usdCentsSchema = z
    .number()
    .int()
    .min(INT4_MIN)
    .max(INT4_MAX)
    .transform(brand);

export const nonNegativeUsdCentsSchema = z
    .number()
    .int()
    .min(0)
    .max(INT4_MAX)
    .transform(brand);

export const positiveUsdCentsSchema = z
    .number()
    .int()
    .min(1)
    .max(INT4_MAX)
    .transform(brand);

export function formatUsdCents(
    cents: UsdCents,
    display = CentsDisplay.WhenFractional,
): string {
    return formatCurrency(
        usdCentsToDollars(cents),
        display === CentsDisplay.WhenFractional &&
            cents % CENTS_PER_DOLLAR === 0
            ? 0
            : CENT_DIGITS,
    );
}

export function parseUsdCents(text: string): UsdCents {
    const match = DOLLAR_AMOUNT_PATTERN.exec(text.trim());
    if (match === null) {
        throw new RangeError(
            `Not a dollar amount with at most ${CENT_DIGITS} decimals: "${text}"`,
        );
    }
    const [, sign = '', whole = '', fractionDigits = ''] = match;
    const magnitude =
        Number(whole) * CENTS_PER_DOLLAR +
        Number(fractionDigits.padEnd(CENT_DIGITS, '0'));
    const cents = sign === '-' && magnitude !== 0 ? -magnitude : magnitude;
    if (cents < INT4_MIN || cents > INT4_MAX) {
        throw new RangeError(`Dollar amount out of range: "${text}"`);
    }
    return brand(cents);
}

export function sumUsdCents(values: readonly UsdCents[]): UsdCents {
    let total = 0;
    for (const value of values) {
        total += value;
        if (!Number.isSafeInteger(total)) {
            throw new RangeError(
                `A cent total left the safe integer range at ${total}`,
            );
        }
    }
    return brand(total);
}

export function usdCents(value: number): UsdCents {
    if (!Number.isSafeInteger(value)) {
        throw new RangeError(
            `A cent amount must be a whole safe integer, got ${value}`,
        );
    }
    return brand(value);
}

export function usdCentsFromDollars(value: number): UsdCents {
    if (!Number.isFinite(value)) {
        throw new RangeError(
            `A dollar amount must be finite to convert to cents, got ${value}`,
        );
    }
    const magnitude = roundedCentMagnitude(Math.abs(value));
    if (magnitude === 0) return brand(0);
    return usdCents(value < 0 ? -magnitude : magnitude);
}

export function usdCentsToDollars(value: UsdCents): Dollars {
    return dollars(value / CENTS_PER_DOLLAR);
}

export function usdCentsToText(cents: UsdCents): string {
    const sign = cents < 0 ? '-' : '';
    const magnitude = Math.abs(cents);
    const whole = Math.floor(magnitude / CENTS_PER_DOLLAR);
    const fraction = magnitude % CENTS_PER_DOLLAR;
    return fraction === 0
        ? `${sign}${whole}`
        : `${sign}${whole}.${String(fraction).padStart(CENT_DIGITS, '0')}`;
}

function roundedCentMagnitude(dollarMagnitude: number): number {
    const match = SHORTEST_DECIMAL_PATTERN.exec(String(dollarMagnitude));
    if (match === null) {
        throw new RangeError(
            `Cannot read ${dollarMagnitude} as a decimal dollar amount`,
        );
    }
    const [, whole = '', fraction = '', exponent = '0'] = match;
    const digits = `${whole}${fraction}`;
    const centPoint = whole.length + Number(exponent) + CENT_DIGITS;
    const wholeCents =
        centPoint <= 0
            ? 0
            : Number(digits.slice(0, centPoint).padEnd(centPoint, '0'));
    const roundingDigit =
        centPoint < 0 ? 0 : Number(digits.charAt(centPoint) || '0');
    return roundingDigit >= HALF_DIGIT ? wholeCents + 1 : wholeCents;
}
