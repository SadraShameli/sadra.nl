import type { BookingDirection, BookingRule } from './types';

const normalise = (s: null | string): string =>
    (s ?? '').toLowerCase().replaceAll(' ', '');

export function findRule(
    rules: readonly BookingRule[],
    tx: {
        direction: BookingDirection;
        isRefund?: boolean;
        merchant: null | string;
    },
): BookingRule | null {
    const lookup = {
        direction: tx.isRefund ? ('OUT' as const) : tx.direction,
        merchant: tx.merchant,
    };
    for (const rule of rules) {
        if (ruleMatches(rule, lookup)) return rule;
    }
    return null;
}

export function ruleMatches(
    rule: BookingRule,
    tx: { direction: BookingDirection; merchant: null | string },
): boolean {
    if (rule.direction !== tx.direction) return false;
    if (!tx.merchant) return false;
    return normalise(tx.merchant).includes(normalise(rule.match));
}
