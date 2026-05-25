import type { VatCode } from '../providers/eboekhouden/enums';
import type { LedgerRef } from './types';

export interface MerchantRule {
    display: string;
    ledger: LedgerRef;
    match: string;
    vatCode: VatCode;
}

export type PayoutRule = MerchantRule;

const normalise = (s: null | string): string =>
    (s ?? '').toLowerCase().replaceAll(' ', '');

export function findRule(
    rules: readonly MerchantRule[],
    candidate: null | string,
): MerchantRule | null {
    for (const rule of rules) {
        if (ruleMatches(rule, candidate)) return rule;
    }
    return null;
}

export function ruleMatches(
    rule: MerchantRule,
    candidate: null | string,
): boolean {
    if (!candidate) return false;
    return normalise(candidate).includes(rule.match);
}
