import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    FirmId,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import {
    CorrelationMode,
    type PortfolioSimInputs,
    simulatePortfolio,
} from '~/lib/prop-calculator/simulator';

function portfolio(
    overrides: Pick<PortfolioSimInputs, 'accounts' | 'correlation' | 'groups'>,
) {
    return simulatePortfolio({
        dayStop: { kind: DayStopRuleKind.None },
        fundedHorizonDays: 20,
        maxEvalDays: 30,
        plan: rapidEod(),
        riskPerTrade: 300,
        rrRatio: 2,
        seed: 11,
        tradesPerDay: 1,
        trials: 200,
        winrate: 0.45,
        ...overrides,
    });
}

function rapidEod(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

describe('N-13 deferred clamp: simulatePortfolio rejects a group count it cannot split the accounts into', () => {
    it.each([0, -1, 1.5, NaN, 5])(
        'rejects %s groups for 4 grouped accounts instead of clamping',
        (groups) => {
            expect(() =>
                portfolio({
                    accounts: 4,
                    correlation: CorrelationMode.Grouped,
                    groups,
                }),
            ).toThrow(/groups must be/);
        },
    );

    it('splits 4 accounts into 2 groups the same way as before', () => {
        const out = portfolio({
            accounts: 4,
            correlation: CorrelationMode.Grouped,
            groups: 2,
        });

        expect(out.accountsPassDistribution).toHaveLength(5);
        expect(out.accountsPassDistribution[1]).toBe(0);
        expect(out.accountsPassDistribution[3]).toBe(0);
    });

    it('accepts one group per account, the independent split', () => {
        expect(() =>
            portfolio({
                accounts: 4,
                correlation: CorrelationMode.Grouped,
                groups: 4,
            }),
        ).not.toThrow();
    });

    it('ignores the group count outside the grouped mode', () => {
        expect(() =>
            portfolio({
                accounts: 4,
                correlation: CorrelationMode.Copy,
                groups: 1,
            }),
        ).not.toThrow();
    });
});
