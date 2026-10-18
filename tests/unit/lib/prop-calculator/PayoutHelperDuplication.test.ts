import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

const OWNED_FILES = [
    'src/lib/prop-calculator/core/FundedPayoutCycle.ts',
    'src/lib/prop-calculator/advisor/PayoutReadiness.ts',
    'src/lib/prop-calculator/advisor/PayoutRequestRule.ts',
] as const;

function occurrencesAcrossOwnedFiles(pattern: RegExp): number {
    return OWNED_FILES.reduce((total, relativePath) => {
        const text = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
        const matches = text.match(new RegExp(pattern, 'g')) ?? [];
        return total + matches.length;
    }, 0);
}

describe('payout helper duplication (PT-46b)', () => {
    it('switches on the pool-profit basis in exactly one place', () => {
        expect(
            occurrencesAcrossOwnedFiles(/switch \(plan\.payoutProfitPool\)/),
        ).toBe(1);
    });

    it('computes the day-gate required-days count in exactly one place', () => {
        expect(
            occurrencesAcrossOwnedFiles(
                /\(plan\.minDaysAfterPassForPayoutPerCycle \?\?/,
            ),
        ).toBe(1);
    });

    it('wraps payoutPoolProfit with the cycle-since-last-payout profit in exactly one place', () => {
        expect(
            occurrencesAcrossOwnedFiles(
                /payoutPoolProfit\(\s*plan,\s*state,\s*state\.balance - tracker\.lastPayoutBalance,?\s*\)/,
            ),
        ).toBe(1);
    });
});
