import * as currencies from 'dinero.js/currencies';
import { z } from 'zod';

const KNOWN_CURRENCY_CODES = new Set<string>(
    Object.values(currencies).map((c) => c.code),
);

export const currencyCodeSchema = z
    .string()
    .refine((value) => KNOWN_CURRENCY_CODES.has(value), {
        message: 'Not a known ISO 4217 currency code',
    })
    .brand('CurrencyCode');
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

export const EUR_CODE = currencyCodeSchema.parse(currencies.EUR.code);
export const USD_CODE = currencyCodeSchema.parse(currencies.USD.code);
