import { describe, expect, it } from 'vitest';

import {
    isVatCode,
    parseVatCode,
    VatCode,
} from '~/lib/accounting/providers/eboekhouden/enums';

describe('isVatCode', () => {
    it('accepts every eBoekhouden VAT code', () => {
        for (const code of Object.values(VatCode)) {
            expect(isVatCode(code)).toBe(true);
        }
    });

    it('rejects a value that is not a VAT code, including a different letter case', () => {
        expect(isVatCode('NOT_A_CODE')).toBe(false);
        expect(isVatCode('')).toBe(false);
        expect(isVatCode(VatCode.AfstVerk.toLowerCase())).toBe(false);
    });
});

describe('parseVatCode', () => {
    it('returns a known VAT code unchanged', () => {
        expect(parseVatCode(VatCode.AfstVerk)).toBe(VatCode.AfstVerk);
    });

    it('throws naming the value when it is not a VAT code', () => {
        expect(() => parseVatCode('NOT_A_CODE')).toThrow(
            'Invalid eBoekhouden VAT code: "NOT_A_CODE"',
        );
    });
});
