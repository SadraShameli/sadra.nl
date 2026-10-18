import { describe, expect, it } from 'vitest';

import {
    attemptEconomicsCardModel,
    type AttemptEconomicsRunOutputs,
} from '~/app/(app)/prop-calculator/_components/economics/attemptEconomicsModel';
import { kpiDescriptions } from '~/app/(app)/prop-calculator/_components/kpiDescriptions';
import { NOT_APPLICABLE } from '~/lib/format';
import { EconomicsReason } from '~/lib/prop-calculator/economics';

const FUNDED_TRIALS = 90;
const TRIALS = 200;

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
            expectedPayoutPerFundedAccount: { standardError: 40, value: 900 },
            payoutsPerFundedAccount: { standardError: 0.08, value: 1.2 },
        },
        expectedAttempts: 2,
        expectedLiveTransferCash: 0,
        expectedNetPerAttempt: 220,
        expectedPayoutPerFundedAccount: 900,
        fundedPayoutValues: Array.from({ length: FUNDED_TRIALS }, () => 900),
        netValues: Array.from({ length: TRIALS }, () => 0),
        payoutsPerFundedAccount: 1.2,
        ...overrides,
    };
}

describe('attemptEconomicsCardModel (F-V9, PT-61)', () => {
    it('builds the decomposition rows from typed fields only, with an SE or an n on every row', () => {
        const model = attemptEconomicsCardModel(sentinelOutputs(), 63);
        if (model.reason !== null) throw new Error('expected a value');
        expect(
            model.decomposition.map(({ label, valueText }) => ({
                label,
                valueText,
            })),
        ).toEqual([
            { label: 'Attempt price', valueText: '$140 (± $5)' },
            { label: 'Per-attempt pass', valueText: '40.0% (± 2.5%)' },
            { label: 'P(payout | funded)', valueText: '60.0% (± 3.0%)' },
            {
                label: 'Payouts per paid funded',
                valueText: '2.00 (n = 90 funded trials)',
            },
            {
                label: 'Average payout',
                valueText: '$750 (n = 90 funded trials)',
            },
            {
                label: 'Funded value (63-day horizon, credit-free net)',
                valueText: '$900 (± $40)',
            },
            {
                label: 'Breakeven pass rate',
                valueText: '15.6% (n = 200 trials)',
            },
            {
                label: 'Funded value / attempt cost',
                valueText: '6.43:1, net 5.43:1 (n = 200 trials)',
            },
        ]);
    });

    it('scales the funded value standard error by the copy accounts like the funded value itself', () => {
        const model = attemptEconomicsCardModel(
            sentinelOutputs({ copyAccounts: 3, costPerAttempt: 420 }),
            63,
        );
        if (model.reason !== null) throw new Error('expected a value');
        const row = model.decomposition.find((candidate) =>
            candidate.label.startsWith('Funded value ('),
        );
        expect(row?.valueText).toBe('$2,700 (± $120)');
    });

    it('falls back to n when the engine carries no standard error for a row', () => {
        const base = sentinelOutputs();
        const model = attemptEconomicsCardModel(
            sentinelOutputs({
                estimates: {
                    ...base.estimates,
                    anyPayoutGivenFundedProbability: {
                        standardError: null,
                        value: 0.6,
                    },
                    expectedPayoutPerFundedAccount: {
                        standardError: null,
                        value: 900,
                    },
                },
            }),
            63,
        );
        if (model.reason !== null) throw new Error('expected a value');
        const byLabel = new Map(
            model.decomposition.map((row) => [row.label, row.valueText]),
        );
        expect(byLabel.get('P(payout | funded)')).toBe(
            '60.0% (n = 90 funded trials)',
        );
        expect(
            byLabel.get('Funded value (63-day horizon, credit-free net)'),
        ).toBe('$900 (n = 90 funded trials)');
    });

    it('gives every decomposition row a standard error or an n', () => {
        const model = attemptEconomicsCardModel(sentinelOutputs(), 63);
        if (model.reason !== null) throw new Error('expected a value');
        for (const row of model.decomposition) {
            expect(row.valueText).toMatch(/\(± .+\)|\(n = \d+ .*\)/);
        }
    });

    it('explains the breakeven pass rate with the shared KPI text', () => {
        const model = attemptEconomicsCardModel(sentinelOutputs(), 63);
        if (model.reason !== null) throw new Error('expected a value');
        const row = model.decomposition.find(
            (candidate) => candidate.label === 'Breakeven pass rate',
        );
        expect(row?.infoText).toBe(kpiDescriptions.breakevenPassRate);
    });

    it('shows n/a for the breakeven and the ratio rows when the funded value is zero or the attempt costs nothing', () => {
        const free = attemptEconomicsCardModel(
            sentinelOutputs({ costPerAttempt: 0 }),
            63,
        );
        if (free.reason !== null) throw new Error('expected a value');
        expect(
            free.decomposition.find(
                (row) => row.label === 'Funded value / attempt cost',
            )?.valueText,
        ).toBe(NOT_APPLICABLE);
        const worthless = attemptEconomicsCardModel(
            sentinelOutputs({ expectedPayoutPerFundedAccount: 0 }),
            63,
        );
        if (worthless.reason !== null) throw new Error('expected a value');
        expect(
            worthless.decomposition.find(
                (row) => row.label === 'Breakeven pass rate',
            )?.valueText,
        ).toBe(NOT_APPLICABLE);
    });

    it('fills the formula text from typed numeric fields only (PD-32 style sentinels)', () => {
        const model = attemptEconomicsCardModel(sentinelOutputs(), 63);
        if (model.reason !== null) throw new Error('expected a value');
        expect(model.formula).toBe(
            'EV per attempt = pass 40.0% × funded value $900 − attempt cost $140 = $220 (± $10)',
        );
    });

    it('adds the live transfer cash per attempt to the formula so its terms sum to the printed EV', () => {
        const model = attemptEconomicsCardModel(
            sentinelOutputs({
                expectedLiveTransferCash: 60,
                expectedNetPerAttempt: 250,
            }),
            63,
        );
        if (model.reason !== null) throw new Error('expected a value');
        expect(model.formula).toBe(
            'EV per attempt = pass 40.0% × funded value $900 + live transfer cash per attempt $30 − attempt cost $140 = $250 (± $10)',
        );
    });

    it('prints the breakeven pass rate and the ratio rows with the live transfer cash folded in on a live-transfer run', () => {
        const model = attemptEconomicsCardModel(
            sentinelOutputs({
                expectedLiveTransferCash: 60,
                expectedNetPerAttempt: 250,
            }),
            63,
        );
        if (model.reason !== null) throw new Error('expected a value');
        const byLabel = new Map(
            model.decomposition.map((row) => [row.label, row]),
        );
        expect(
            byLabel.get('Breakeven pass rate (incl. live transfer cash)')
                ?.valueText,
        ).toBe('14.4% (n = 200 trials)');
        expect(
            byLabel.get('Breakeven pass rate (incl. live transfer cash)')
                ?.infoText,
        ).toBe(kpiDescriptions.breakevenPassRate);
        expect(
            byLabel.get(
                'Funded value / attempt cost (incl. live transfer cash)',
            )?.valueText,
        ).toBe('6.96:1, net 5.96:1 (n = 200 trials)');
        expect(byLabel.has('Breakeven pass rate')).toBe(false);
        expect(byLabel.has('Funded value / attempt cost')).toBe(false);
    });

    it('makes the breakeven pass rate the pass rate where the printed EV identity is zero on a live-transfer run', () => {
        const model = attemptEconomicsCardModel(
            sentinelOutputs({
                expectedLiveTransferCash: 60,
                expectedNetPerAttempt: 250,
            }),
            63,
        );
        if (model.reason !== null) throw new Error('expected a value');
        const { economics } = model;
        const breakeven = economics.breakevenPassRate.value ?? NaN;
        const evAtBreakeven =
            breakeven * economics.fundedValue +
            (breakeven / economics.passProbability) *
                economics.liveTransferCashPerAttempt -
            economics.attemptCost;
        expect(evAtBreakeven).toBeCloseTo(0, 9);
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
