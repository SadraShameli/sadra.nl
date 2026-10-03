import { describe, expect, it } from 'vitest';

import {
    bankrollBudgetCheck,
    BankrollBudgetCheckKind,
    bankrollBudgetShortText,
} from '~/app/(app)/prop-calculator/_components/bankroll/bankrollBudgetCheck';
import { dollars } from '~/lib/prop-calculator';
import {
    type BankrollMinimumBudget,
    EconomicsReason,
    type Quantity,
} from '~/lib/prop-calculator/economics';

function minimum(
    budget: number,
    attempts: number,
): Quantity<BankrollMinimumBudget> {
    return {
        disclosures: [],
        reason: null,
        value: { attempts, budget: dollars(budget) },
    };
}

function missing(reason: EconomicsReason): Quantity<BankrollMinimumBudget> {
    return { disclosures: [], reason, value: null };
}

describe('bankrollBudgetCheck (PT-81 step 1)', () => {
    it('flags a budget below the minimum with the minimum budget and its attempts', () => {
        const check = bankrollBudgetCheck(dollars(500), minimum(1200, 12));
        expect(check).toEqual({
            attempts: 12,
            kind: BankrollBudgetCheckKind.Short,
            minimumBudget: 1200,
        });
        if (check.kind !== BankrollBudgetCheckKind.Short) return;
        expect(bankrollBudgetShortText(check)).toBe(
            'you need at least $1,200 (12 attempts) at this plan for your threshold',
        );
    });

    it('says attempt in the singular for one attempt', () => {
        const check = bankrollBudgetCheck(dollars(50), minimum(165, 1));
        expect(check.kind).toBe(BankrollBudgetCheckKind.Short);
        if (check.kind !== BankrollBudgetCheckKind.Short) return;
        expect(bankrollBudgetShortText(check)).toBe(
            'you need at least $165 (1 attempt) at this plan for your threshold',
        );
    });

    it('flags nothing at the minimum or above it', () => {
        expect(bankrollBudgetCheck(dollars(1200), minimum(1200, 12)).kind).toBe(
            BankrollBudgetCheckKind.Sufficient,
        );
        expect(bankrollBudgetCheck(dollars(5000), minimum(1200, 12)).kind).toBe(
            BankrollBudgetCheckKind.Sufficient,
        );
    });

    it('flags nothing without a budget', () => {
        expect(bankrollBudgetCheck(null, minimum(1200, 12)).kind).toBe(
            BankrollBudgetCheckKind.NotChecked,
        );
    });

    it('flags nothing without a threshold or without a positive edge', () => {
        expect(
            bankrollBudgetCheck(
                dollars(500),
                missing(EconomicsReason.ThresholdNotSet),
            ).kind,
        ).toBe(BankrollBudgetCheckKind.NotChecked);
        expect(
            bankrollBudgetCheck(
                dollars(500),
                missing(EconomicsReason.NoPositiveEdge),
            ).kind,
        ).toBe(BankrollBudgetCheckKind.NotChecked);
    });
});
