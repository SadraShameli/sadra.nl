import { describe, expect, it } from 'vitest';

import {
    attemptEconomicsCardModel,
    type AttemptEconomicsRunOutputs,
} from '~/app/(app)/prop-calculator/_components/economics/attemptEconomicsModel';
import { NOT_APPLICABLE } from '~/lib/format';
import { EconomicsReason } from '~/lib/prop-calculator/economics';

function sentinelOutputs(
    overrides: Partial<AttemptEconomicsRunOutputs> = {},
): AttemptEconomicsRunOutputs {
    return {
        anyPayoutGivenFundedProbability: 0.6,
        attemptPassProbability: 0.4,
        copyAccounts: 1,
        costPerAttempt: 140,
        estimates: {
            anyPayoutGivenFundedProbability: {
                standardError: 0.03,
                value: 0.6,
            },
            attemptPassProbability: { standardError: 0.025, value: 0.4 },
            costPerAttempt: { standardError: 5, value: 140 },
            expectedNetPerAttempt: { standardError: 10, value: 220 },
            payoutsPerFundedAccount: { standardError: 0.08, value: 1.2 },
        },
        expectedNetPerAttempt: 220,
        expectedPayoutPerFundedAccount: 900,
        payoutsPerFundedAccount: 1.2,
        ...overrides,
    };
}

describe('attemptEconomicsCardModel (F-V9, PT-61)', () => {
    it('builds the decomposition rows from typed fields only, with SEs from PT-44', () => {
        const model = attemptEconomicsCardModel(sentinelOutputs(), 63);
        if (model.reason !== null) throw new Error('expected a value');
        expect(model.decomposition).toEqual([
            { label: 'Per-attempt pass', valueText: '40.0% (± 2.5%)' },
            {
                label: 'P(payout | funded)',
                valueText: '60.0% (± 3.0%)',
            },
            { label: 'Payouts per paid funded', valueText: '2.00' },
            { label: 'Average payout', valueText: '$750' },
            {
                label: 'Funded value (63-day horizon, credit-free net)',
                valueText: '$900',
            },
        ]);
    });

    it('fills the formula text from typed numeric fields only (PD-32 style sentinels)', () => {
        const model = attemptEconomicsCardModel(sentinelOutputs(), 63);
        if (model.reason !== null) throw new Error('expected a value');
        expect(model.formula).toBe(
            'EV per attempt = pass 40.0% × funded value $900 − attempt cost $140 = $220 (± $10)',
        );
    });

    it('labels funded value / attempt cost with its net form', () => {
        const model = attemptEconomicsCardModel(sentinelOutputs(), 63);
        if (model.reason !== null) throw new Error('expected a value');
        expect(model.economics.fundedValueToAttemptCost.value?.label).toBe(
            'funded value / attempt cost; net 5.43:1',
        );
    });

    it('carries no funded value to attempt cost ratio when the attempt costs nothing', () => {
        const model = attemptEconomicsCardModel(
            sentinelOutputs({
                costPerAttempt: 0,
                estimates: {
                    ...sentinelOutputs().estimates,
                    costPerAttempt: { standardError: 0, value: 0 },
                },
            }),
            63,
        );
        if (model.reason !== null) throw new Error('expected a value');
        expect(model.economics.fundedValueToAttemptCost.value).toBeNull();
        expect(model.economics.fundedValueToAttemptCost.reason).toBe(
            EconomicsReason.ZeroAttemptCost,
        );
    });

    it('shows n/a for payouts per paid funded when P(payout | funded) is zero', () => {
        const model = attemptEconomicsCardModel(
            sentinelOutputs({
                anyPayoutGivenFundedProbability: 0,
                estimates: {
                    ...sentinelOutputs().estimates,
                    anyPayoutGivenFundedProbability: {
                        standardError: 0,
                        value: 0,
                    },
                },
            }),
            63,
        );
        if (model.reason !== null) throw new Error('expected a value');
        const row = model.decomposition.find(
            (candidate) => candidate.label === 'Payouts per paid funded',
        );
        expect(row?.valueText).toBe(NOT_APPLICABLE);
    });

    it('shows n/a for average payout when payouts per funded account is zero', () => {
        const model = attemptEconomicsCardModel(
            sentinelOutputs({
                estimates: {
                    ...sentinelOutputs().estimates,
                    payoutsPerFundedAccount: { standardError: 0, value: 0 },
                },
                payoutsPerFundedAccount: 0,
            }),
            63,
        );
        if (model.reason !== null) throw new Error('expected a value');
        const row = model.decomposition.find(
            (candidate) => candidate.label === 'Average payout',
        );
        expect(row?.valueText).toBe(NOT_APPLICABLE);
    });

    it('carries a reason instead of a value on invalid input', () => {
        const model = attemptEconomicsCardModel(
            sentinelOutputs({ copyAccounts: 0 }),
            63,
        );
        expect(model.reason).not.toBeNull();
        if (model.reason === null) throw new Error('expected a reason');
        expect(model.reason).toContain('missing, negative or out of range');
    });

    it('reports the InvalidInput reason from the shared economics text, not a duplicated string', () => {
        const model = attemptEconomicsCardModel(
            sentinelOutputs({ copyAccounts: 0 }),
            63,
        );
        expect(model.reasonCode).toBe(EconomicsReason.InvalidInput);
    });
});
