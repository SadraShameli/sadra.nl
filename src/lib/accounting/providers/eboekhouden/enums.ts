export const VAT_CODES = [
    'HOOG_VERK_21',
    'LAAG_VERK_9',
    'VERL_VERK',
    'VERL_VERK_L9',
    'AFW',
    'BU_EU_VERK',
    'BI_EU_VERK',
    'BI_EU_VERK_D',
    'AFST_VERK',
    'LAAG_INK_9',
    'HOOG_INK_21',
    'VERL_INK',
    'AFW_VERK',
    'BU_EU_INK',
    'BI_EU_INK',
    'GEEN',
] as const;
export type VatCode = (typeof VAT_CODES)[number];

export const VAT_CODE_LABEL: Record<VatCode, string> = {
    AFST_VERK: 'Distance sales',
    AFW: 'Deviating',
    AFW_VERK: 'Deviating sales',
    BI_EU_INK: 'Purchase — within EU',
    BI_EU_VERK: 'Sales — within EU',
    BI_EU_VERK_D: 'Sales — within EU (digital)',
    BU_EU_INK: 'Purchase — outside EU',
    BU_EU_VERK: 'Sales — outside EU',
    GEEN: 'No VAT',
    HOOG_INK_21: 'Purchase 21%',
    HOOG_VERK_21: 'Sales 21%',
    LAAG_INK_9: 'Purchase 9%',
    LAAG_VERK_9: 'Sales 9%',
    VERL_INK: 'Reverse charge purchase',
    VERL_VERK: 'Reverse charge sales',
    VERL_VERK_L9: 'Reverse charge sales 9%',
};

const REVERSE_CHARGE_CODES = new Set<VatCode>([
    'BI_EU_INK',
    'BU_EU_INK',
    'VERL_INK',
]);

const EXCLUDING_VAT_CODES = new Set<VatCode>([
    'AFST_VERK',
    'BI_EU_INK',
    'BI_EU_VERK',
    'BI_EU_VERK_D',
    'BU_EU_INK',
    'BU_EU_VERK',
    'GEEN',
    'VERL_INK',
    'VERL_VERK',
    'VERL_VERK_L9',
]);

export const isReverseChargeVat = (code: VatCode): boolean =>
    REVERSE_CHARGE_CODES.has(code);

export const requiresExcludingVat = (code: VatCode): boolean =>
    EXCLUDING_VAT_CODES.has(code);

export const BOOKING_DIRECTIONS = ['IN', 'OUT'] as const;
export type BookingDirection = (typeof BOOKING_DIRECTIONS)[number];

export const MUTATION_TYPES = {
    GENERAL_JOURNAL: '7',
    INVOICE_PAYMENT_RECEIVED: '3',
    INVOICE_PAYMENT_SENT: '4',
    INVOICE_RECEIVED: '1',
    INVOICE_SENT: '2',
    MONEY_RECEIVED: '5',
    MONEY_SENT: '6',
} as const;
export type MutationType = (typeof MUTATION_TYPES)[keyof typeof MUTATION_TYPES];

export const LEDGER_CATEGORIES = [
    'BAL',
    'VW',
    'AF6',
    'AF19',
    'AFOVERIG',
    'VOOR',
    'BTWRC',
    'FIN',
    'DEB',
    'CRED',
    'AF',
] as const;
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

export const IN_EX_VAT = { EXCLUDING: 'EX', INCLUDING: 'IN' } as const;
export type InExVat = (typeof IN_EX_VAT)[keyof typeof IN_EX_VAT];

export const RELATION_TYPES = { BUSINESS: 'B', PRIVATE: 'P' } as const;
export type RelationType = (typeof RELATION_TYPES)[keyof typeof RELATION_TYPES];

export const SECURITY_ERROR_TYPES = [
    'unauthorized',
    'forbidden',
    'invalid_token',
    'expired_token',
] as const;
export type SecurityErrorType = (typeof SECURITY_ERROR_TYPES)[number];
