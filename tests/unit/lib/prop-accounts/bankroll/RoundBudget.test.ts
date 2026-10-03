import { describe, expect, it } from 'vitest';

import * as bankroll from '~/lib/prop-accounts/bankroll';
import { roundBudgetStatus } from '~/lib/prop-accounts/bankroll';

describe('roundBudgetStatus', () => {
    it('is null remaining with no budget set', () => {
        expect(roundBudgetStatus(null, 5000)).toEqual({
            budgetCents: null,
            isSpent: false,
            remainingCents: null,
            spentCents: 5000,
        });
    });

    it('computes the remaining amount against a set budget', () => {
        expect(roundBudgetStatus(10_000, 4000)).toEqual({
            budgetCents: 10_000,
            isSpent: false,
            remainingCents: 6000,
            spentCents: 4000,
        });
    });

    it('can go negative once the budget is overspent', () => {
        expect(roundBudgetStatus(10_000, 12_000).remainingCents).toBe(-2000);
    });
});

describe('roundBudgetStatus isSpent', () => {
    it('is false with no budget set, however much is spent', () => {
        expect(roundBudgetStatus(null, 1_000_000).isSpent).toBe(false);
    });

    it('is false one cent below the budget', () => {
        expect(roundBudgetStatus(100_000, 99_999).isSpent).toBe(false);
    });

    it('is true exactly at the budget', () => {
        expect(roundBudgetStatus(100_000, 100_000).isSpent).toBe(true);
    });

    it('is true past the budget', () => {
        expect(roundBudgetStatus(100_000, 100_001).isSpent).toBe(true);
    });
});

describe('the bankroll barrel', () => {
    it('exports one round budget predicate, isSpent, and no looser look-ahead variant', () => {
        expect(Object.keys(bankroll)).not.toContain('willExceedRoundBudget');
        expect(Object.keys(bankroll)).toContain('roundBudgetStatus');
    });
});
