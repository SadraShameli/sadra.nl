import type { LedgerRef } from '../core/types';
export const LEDGERS = {
    BANK: { id: 46_557_223, label: '1010 Bank' },
    FUNDED: { id: 46_580_770, label: '0001 Funded accounts' },
    HARDWARE: { id: 46_724_292, label: '0003 Trading Hardware' },
    PAYOUTS: { id: 48_217_305, label: '0004 Payouts' },
    SOFTWARE: { id: 46_581_706, label: '0002 Trading Software' },
    WISE: { id: 51_974_064, label: '0007 Wise' },
    WISE_EUR: { id: 51_974_018, label: '0005 Wise Business - EUR' },
    WISE_USD: { id: 51_974_061, label: '0006 Wise Business - USD' },
} as const satisfies Record<string, LedgerRef>;

const WISE_BANK_BY_CURRENCY: Readonly<Record<string, LedgerRef>> = {
    EUR: LEDGERS.WISE_EUR,
    USD: LEDGERS.WISE_USD,
};

export function wiseBank(currency: string): LedgerRef {
    return WISE_BANK_BY_CURRENCY[currency] ?? LEDGERS.WISE;
}
