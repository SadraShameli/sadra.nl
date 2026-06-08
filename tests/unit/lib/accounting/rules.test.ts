import { describe, expect, it } from 'vitest';

import { MERCHANTS, PAYOUT_SOURCES } from '~/lib/accounting/config/rules';
import { findRule } from '~/lib/accounting/core/rules';

describe('rule matcher', () => {
    it('matches case- and space-insensitively against substrings', () => {
        const rule = findRule(MERCHANTS, 'Anthropic Ireland LTD');
        expect(rule?.display).toBe('Anthropic Ireland');
    });

    it('matches even with embedded whitespace removed', () => {
        const rule = findRule(MERCHANTS, 'TAKE  PROFIT  TRADER');
        expect(rule?.display).toBe('TakeProfitTrader');
    });

    it('returns null for unknown merchants', () => {
        expect(findRule(MERCHANTS, 'Some unknown vendor')).toBeNull();
        expect(findRule(MERCHANTS, '')).toBeNull();
        expect(findRule(MERCHANTS, null)).toBeNull();
    });

    it('payout rules match on incoming source names', () => {
        const rule = findRule(PAYOUT_SOURCES, 'apex trader funding');
        expect(rule?.vatCode).toBe('BU_EU_VERK');
    });
});
