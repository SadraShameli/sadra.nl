import { parseUsdCents, type UsdCents } from './UsdCents';

export enum EntryTextKind {
    Empty = 'empty',
    Invalid = 'invalid',
    Valid = 'valid',
}

export type CountText =
    | { readonly count: number; readonly kind: EntryTextKind.Valid }
    | { readonly kind: EntryTextKind.Empty }
    | { readonly kind: EntryTextKind.Invalid; readonly message: string };

export type MoneyText =
    | { readonly cents: UsdCents; readonly kind: EntryTextKind.Valid }
    | { readonly kind: EntryTextKind.Empty }
    | { readonly kind: EntryTextKind.Invalid; readonly message: string };

export const COUNT_ENTRY_MESSAGE = 'Enter a whole number of 0 or more';
export const MONEY_ENTRY_MESSAGE =
    'Enter a dollar amount with at most 2 decimals';

const COUNT_PATTERN = /^\d+$/;
const MONEY_PATTERN = /^(-?)\$?((?:\d{1,3}(?:,\d{3})+)|\d+)(\.\d{1,2})?$/;

export function parseCountText(text: string): CountText {
    const trimmed = text.trim();
    if (trimmed === '') return { kind: EntryTextKind.Empty };
    const count = Number(trimmed);
    return COUNT_PATTERN.test(trimmed) && Number.isSafeInteger(count)
        ? { count, kind: EntryTextKind.Valid }
        : { kind: EntryTextKind.Invalid, message: COUNT_ENTRY_MESSAGE };
}

export function parseMoneyText(text: string): MoneyText {
    const trimmed = text.trim();
    if (trimmed === '') return { kind: EntryTextKind.Empty };
    const match = MONEY_PATTERN.exec(trimmed);
    if (match === null) {
        return { kind: EntryTextKind.Invalid, message: MONEY_ENTRY_MESSAGE };
    }
    const [, sign = '', whole = '', fraction = ''] = match;
    try {
        return {
            cents: parseUsdCents(
                `${sign}${whole.replaceAll(',', '')}${fraction}`,
            ),
            kind: EntryTextKind.Valid,
        };
    } catch (error) {
        return {
            kind: EntryTextKind.Invalid,
            message:
                error instanceof RangeError
                    ? error.message
                    : MONEY_ENTRY_MESSAGE,
        };
    }
}
