import { describe, expect, it } from 'vitest';

import { simSummaryRows } from '~/cli/commands/prop/sim/command';
import { formatCurrency, formatFiniteCurrency } from '~/lib/format';
import {
    FirmId,
    MffuVariant,
    type Plan,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

const COST_PER_FUNDED_LABEL = 'cost / funded acct';

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

const BASE: SimOutputs = simulate({
    fundedHorizonDays: 20,
    maxEvalDays: 30,
    plan: rapidEodPlan(),
    riskPerTrade: 250,
    rrRatio: 2,
    seed: 1,
    tradesPerDay: 4,
    trials: 20,
    winrate: 0.5,
});

function costPerFundedCell(costPerFundedAccount: number): string | undefined {
    return simSummaryRows({ ...BASE, costPerFundedAccount }).find(
        ([label]) => label === COST_PER_FUNDED_LABEL,
    )?.[1];
}

describe('sim cost per funded account when no eval passes', () => {
    it.each([Infinity, NaN])("prints 'n/a' for %s", (cost) => {
        expect(costPerFundedCell(cost)).toBe('n/a');
    });

    it('never prints an infinity symbol', () => {
        expect(costPerFundedCell(Infinity)).not.toContain('∞');
    });

    it('prints a finite cost as currency', () => {
        expect(costPerFundedCell(1234)).toBe(formatCurrency(1234));
    });

    it.each([Infinity, NaN, 0, 1234])(
        'prints %s through the shared finite-currency helper',
        (cost) => {
            expect(costPerFundedCell(cost)).toBe(formatFiniteCurrency(cost));
        },
    );
});
