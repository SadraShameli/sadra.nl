import { describe, expect, it } from 'vitest';

import {
    roundBudgetStatus,
    willExceedRoundBudget,
} from '~/lib/prop-accounts/bankroll';

describe('roundBudgetStatus', () => {
    it('is null remaining with no budget set', () => {
        expect(roundBudgetStatus(null, 5000)).toEqual({
            budgetCents: null,
            remainingCents: null,
            spentCents: 5000,
        });
    });

    it('computes the remaining amount against a set budget', () => {
        expect(roundBudgetStatus(10_000, 4000)).toEqual({
            budgetCents: 10_000,
            remainingCents: 6000,
            spentCents: 4000,
        });
    });

    it('can go negative once the budget is overspent', () => {
        expect(roundBudgetStatus(10_000, 12_000).remainingCents).toBe(-2000);
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
