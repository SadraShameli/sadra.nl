import { describe, expect, it } from 'vitest';

import type { RawTransaction } from '~/lib/accounting/core/types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { isoDateSchema } from '~/lib/accounting/core/date';
import { AmountRangeCondition } from '~/lib/accounting/core/rules/condition';
import { ruleCreateSchema } from '~/lib/schemas/accounting';

function transactionOf(sourceAmount: number): RawTransaction {
    return {
        date: isoDateSchema.parse('2026-02-01'),
        direction: 'OUT',
        merchant: 'Coffee bar',
        sourceAmount,
        sourceCurrency: currencyCodeSchema.parse('EUR'),
        sourceFee: 0,
        sourceFeeCurrency: null,
        sourceId: 'test',
        txnId: 't-1',
    };
}

describe('AmountRangeCondition', () => {
    it('treats an amount equal to the bound in cents as inside the range', () => {
        const condition = new AmountRangeCondition(0.3, 0.3);

        expect(condition.isSatisfiedBy(transactionOf(0.1 + 0.2))).toBe(true);
    });

    it('still excludes an amount one cent past the bound', () => {
        const condition = new AmountRangeCondition(null, 9.99);

        expect(condition.isSatisfiedBy(transactionOf(10))).toBe(false);
    });
});

describe('rule amount input', () => {
    it('refuses a threshold finer than a cent', () => {
        expect(
            ruleCreateSchema.safeParse({
                credentialId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
                direction: 'OUT',
                display: 'Coffee',
                ledger: { id: '1', label: 'Costs' },
                match: 'coffee',
                minAmount: 0.005,
                taxCode: 'NONE',
            }).success,
        ).toBe(false);
    });
});
