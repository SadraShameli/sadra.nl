import { describe, expect, it } from 'vitest';

import {
    roundBudgetStatus,
    willExceedRoundBudget,
} from '~/lib/prop-accounts/bankroll';

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

describe('willExceedRoundBudget', () => {
    it('never exceeds when no budget is set', () => {
        expect(willExceedRoundBudget(null, 1_000_000, 1_000_000)).toBe(false);
    });

    it('is false exactly at the budget', () => {
        expect(willExceedRoundBudget(10_000, 5000, 5000)).toBe(false);
    });

    it('is true just past the budget', () => {
        expect(willExceedRoundBudget(10_000, 5000, 5001)).toBe(true);
    });

    it('is true when already over budget before the new spend', () => {
        expect(willExceedRoundBudget(10_000, 11_000, 0)).toBe(true);
    });
});
