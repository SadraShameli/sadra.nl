import {
    BaseTaxCodeCatalog,
    TaxCode,
    type TaxCodeOption,
} from '~/lib/accounting/core/tax-code';

export enum VatCode {
    AfstVerk = 'AFST_VERK',
    Afw = 'AFW',
    AfwVerk = 'AFW_VERK',
    BiEuInk = 'BI_EU_INK',
    BiEuVerk = 'BI_EU_VERK',
    BiEuVerkD = 'BI_EU_VERK_D',
    BuEuInk = 'BU_EU_INK',
    BuEuVerk = 'BU_EU_VERK',
    Geen = 'GEEN',
    HoogInk21 = 'HOOG_INK_21',
    HoogVerk21 = 'HOOG_VERK_21',
    LaagInk9 = 'LAAG_INK_9',
    LaagVerk9 = 'LAAG_VERK_9',
    VerlInk = 'VERL_INK',
    VerlVerk = 'VERL_VERK',
    VerlVerkL9 = 'VERL_VERK_L9',
}

export const VAT_CODE_LABEL: Record<VatCode, string> = {
    [VatCode.AfstVerk]: 'Distance sales',
    [VatCode.Afw]: 'Deviating',
    [VatCode.AfwVerk]: 'Deviating sales',
    [VatCode.BiEuInk]: 'Purchase — within EU',
    [VatCode.BiEuVerk]: 'Sales — within EU',
    [VatCode.BiEuVerkD]: 'Sales — within EU (digital)',
    [VatCode.BuEuInk]: 'Purchase — outside EU',
    [VatCode.BuEuVerk]: 'Sales — outside EU',
    [VatCode.Geen]: 'No VAT',
    [VatCode.HoogInk21]: 'Purchase 21%',
    [VatCode.HoogVerk21]: 'Sales 21%',
    [VatCode.LaagInk9]: 'Purchase 9%',
    [VatCode.LaagVerk9]: 'Sales 9%',
    [VatCode.VerlInk]: 'Reverse charge purchase',
    [VatCode.VerlVerk]: 'Reverse charge sales',
    [VatCode.VerlVerkL9]: 'Reverse charge sales 9%',
};

const REVERSE_CHARGE_CODES = new Set<VatCode>([
    VatCode.BiEuInk,
    VatCode.BuEuInk,
    VatCode.VerlInk,
]);

const EXCLUDING_VAT_CODES = new Set<VatCode>([
    VatCode.AfstVerk,
    VatCode.BiEuInk,
    VatCode.BiEuVerk,
    VatCode.BiEuVerkD,
    VatCode.BuEuInk,
    VatCode.BuEuVerk,
    VatCode.Geen,
    VatCode.VerlInk,
    VatCode.VerlVerk,
    VatCode.VerlVerkL9,
]);

export class EBoekhoudenTaxCodeCatalog extends BaseTaxCodeCatalog {
    readonly providerId = 'eboekhouden';

    protected options(): readonly TaxCodeOption[] {
        return Object.values(VatCode).map((code) => ({
            code: TaxCode.of(code),
            label: VAT_CODE_LABEL[code],
        }));
    }
}

export function isReverseChargeVat(code: VatCode): boolean {
    return REVERSE_CHARGE_CODES.has(code);
}

export function isVatCode(value: string): value is VatCode {
    return Object.values(VatCode).includes(value as VatCode);
}

export function parseVatCode(value: string): VatCode {
    if (!isVatCode(value)) {
        throw new Error(`Invalid eBoekhouden VAT code: "${value}"`);
    }
    return value;
}

export function requiresExcludingVat(code: VatCode): boolean {
    return EXCLUDING_VAT_CODES.has(code);
}

export const eboekhoudenTaxCodes = new EBoekhoudenTaxCodeCatalog();

export enum InExVat {
    Excluding = 'EX',
    Including = 'IN',
}

export enum LedgerCategory {
    Af = 'AF',
    Af6 = 'AF6',
    Af19 = 'AF19',
    AfOverig = 'AFOVERIG',
    Bal = 'BAL',
    Btwrc = 'BTWRC',
    Cred = 'CRED',
    Deb = 'DEB',
    Fin = 'FIN',
    Voor = 'VOOR',
    Vw = 'VW',
}

export enum MutationType {
    GeneralJournal = '7',
    InvoicePaymentReceived = '3',
    InvoicePaymentSent = '4',
    InvoiceReceived = '1',
    InvoiceSent = '2',
    MoneyReceived = '5',
    MoneySent = '6',
}

export enum RelationType {
    Business = 'B',
    Private = 'P',
}

export enum SecurityErrorType {
    ExpiredToken = 'expired_token',
    Forbidden = 'forbidden',
    InvalidToken = 'invalid_token',
    Unauthorized = 'unauthorized',
}
