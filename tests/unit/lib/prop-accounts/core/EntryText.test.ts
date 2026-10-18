import { describe, expect, it } from 'vitest';

import {
    COUNT_ENTRY_MESSAGE,
    EntryTextKind,
    INT4_MAX,
    MONEY_ENTRY_MESSAGE,
    parseCountText,
    parseMoneyText,
    usdCents,
    usdCentsToText,
} from '~/lib/prop-accounts';

describe('parseMoneyText', () => {
    it.each([
        ['$52,400.00', 5_240_000],
        ['52400', 5_240_000],
        ['52,400.5', 5_240_050],
        ['-12.34', -1234],
        [' $0.01 ', 1],
        ['-$1,250', -125_000],
        ['-1,250', -125_000],
        ['52100.5', 5_210_050],
    ])('reads "%s" as exact cents', (text, cents) => {
        expect(parseMoneyText(text)).toEqual({
            cents,
            kind: EntryTextKind.Valid,
        });
    });

    it('reads a blank entry as empty', () => {
        expect(parseMoneyText('')).toEqual({ kind: EntryTextKind.Empty });
        expect(parseMoneyText(' '.repeat(3))).toEqual({
            kind: EntryTextKind.Empty,
        });
    });

    it.each(['1.234', '12.345', 'abc', '1,2,3', '1e5', '5.', '$', '--5'])(
        'rejects "%s" with the entry message',
        (text) => {
            expect(parseMoneyText(text)).toEqual({
                kind: EntryTextKind.Invalid,
                message: MONEY_ENTRY_MESSAGE,
            });
        },
    );

    it.each(['21474836.48', '-21474836.49', '$21,474,836.48'])(
        'rejects "%s", one cent past the storable range, as out of range',
        (text) => {
            const result = parseMoneyText(text);
            expect(result.kind).toBe(EntryTextKind.Invalid);
            if (result.kind !== EntryTextKind.Invalid) return;
            expect(result.message).toContain('out of range');
        },
    );

    it('accepts the largest storable amount', () => {
        const largest = usdCentsToText(usdCents(INT4_MAX));
        expect(parseMoneyText(largest)).toEqual({
            cents: INT4_MAX,
            kind: EntryTextKind.Valid,
        });
    });

    it('keeps the entry message wording of the form', () => {
        expect(MONEY_ENTRY_MESSAGE).toBe(
            'Enter a dollar amount with at most 2 decimals',
        );
    });
});

describe('parseCountText', () => {
    it('reads a whole number of 0 or more', () => {
        expect(parseCountText('0')).toEqual({
            count: 0,
            kind: EntryTextKind.Valid,
        });
        expect(parseCountText(' 12 ')).toEqual({
            count: 12,
            kind: EntryTextKind.Valid,
        });
    });

    it('reads a blank entry as empty', () => {
        expect(parseCountText('')).toEqual({ kind: EntryTextKind.Empty });
        expect(parseCountText(' ')).toEqual({ kind: EntryTextKind.Empty });
    });

    it.each(['1.5', '-1', 'ten', '1e3', '9007199254740993'])(
        'rejects "%s" with the entry message',
        (text) => {
            expect(parseCountText(text)).toEqual({
                kind: EntryTextKind.Invalid,
                message: COUNT_ENTRY_MESSAGE,
            });
        },
    );

    it('keeps the entry message wording of the form', () => {
        expect(COUNT_ENTRY_MESSAGE).toBe('Enter a whole number of 0 or more');
    });
});
