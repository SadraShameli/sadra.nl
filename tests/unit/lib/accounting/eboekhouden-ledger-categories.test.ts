import { describe, expect, it } from 'vitest';

import {
    LEDGER_CATEGORY_LABEL,
    LedgerCategory,
} from '~/lib/accounting/providers/eboekhouden/enums';

describe('e-Boekhouden ledger category labels', () => {
    it('names the turnover tax categories as VAT payable, as the e-Boekhouden API documents them', () => {
        expect(LEDGER_CATEGORY_LABEL[LedgerCategory.Af]).toBe('VAT payable');
        expect(LEDGER_CATEGORY_LABEL[LedgerCategory.Af6]).toBe(
            'VAT payable, low rate',
        );
        expect(LEDGER_CATEGORY_LABEL[LedgerCategory.Af19]).toBe(
            'VAT payable, high rate',
        );
        expect(LEDGER_CATEGORY_LABEL[LedgerCategory.AfOverig]).toBe(
            'VAT payable, other',
        );
    });

    it('names VOOR as input VAT and FIN as liquid assets', () => {
        expect(LEDGER_CATEGORY_LABEL[LedgerCategory.Voor]).toBe('Input VAT');
        expect(LEDGER_CATEGORY_LABEL[LedgerCategory.Fin]).toBe('Liquid assets');
    });

    it('never calls a tax category depreciation or inventory', () => {
        for (const label of Object.values(LEDGER_CATEGORY_LABEL)) {
            expect(label).not.toMatch(/depreciation|inventory/i);
        }
    });
});
