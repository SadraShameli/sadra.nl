import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    FirmId,
    FtmoFuturesVariant,
    MffuVariant,
    type Plan,
    type PlanId,
    RungSizing,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error(`plan not found for ${id.firm}`);
    return plan;
}

describe('costPerFundedAccount / costPerDrawdownDollar', () => {
    it('equals the one-time eval spend exactly when every trial passes cleanly', () => {
        const mffu = new MyFundedFutures();
        const plan = mffu.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Rapid,
        });
        if (!plan) throw new Error('MFFU Rapid 50K plan not found');

        const out = simulate({
            dayStop: { kind: DayStopRuleKind.None },
            fundedHorizonDays: 252,
            maxEvalDays: 150,
            plan,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 5,
            winrate: 1,
        });

        expect(out.passProbability).toBe(1);
        const evalPrice = plan.fees.activation + plan.fees.oneTimeEval;
        expect(out.costPerFundedAccount).toBeCloseTo(evalPrice, 10);
        expect(out.costPerDrawdownDollar).toBeCloseTo(
            evalPrice / plan.fundedDrawdown.amount,
            10,
        );
    });

    it('matches evalPrice * (1/passRate) for a real registered plan with a partial pass rate', () => {
        const plan = planFor({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });

        const out = simulate({
            fundedHorizonDays: 252,
            maxEvalDays: 150,
            minRetainedCushion: 2000,
            plan,
            riskPerTrade: 400,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            seed: 42,
            tradesPerDay: 2,
            trials: 200,
            winrate: 0.5,
        });

        expect(out.passProbability).toBeGreaterThan(0);
        expect(out.passProbability).toBeLessThan(1);

        const evalPrice = plan.fees.activation + plan.fees.oneTimeEval;
        const expectedCost = evalPrice * (1 / out.passProbability);
        expect(out.costPerFundedAccount).toBeCloseTo(expectedCost, 6);
        expect(out.costPerDrawdownDollar).toBeCloseTo(
            expectedCost / plan.fundedDrawdown.amount,
            6,
        );
        expect(out.costPerFundedAccount).toBeGreaterThan(evalPrice);
    });
});

describe('costPerFundedAccount on a subscription-priced plan (no activation, no one-time eval fee)', () => {
    it(
        'is nonzero and reflects the monthly subscription cost, not the ' +
            'old activation+oneTimeEval-only formula that silently priced ' +
            'FTMO Futures and AlphaFutures at $0 per funded account',
        () => {
            const plan = planFor({
                accountSize: 50_000,
                firm: FirmId.FtmoFutures,
                variant: FtmoFuturesVariant.Growth,
            });
            expect(plan.fees.activation).toBe(0);
            expect(plan.fees.oneTimeEval).toBe(0);
            expect(plan.fees.monthlySubscription).toBeGreaterThan(0);

            const out = simulate({
                dayStop: { kind: DayStopRuleKind.None },
                fundedHorizonDays: 60,
                maxEvalDays: 150,
                plan,
                riskPerTrade: 250,
                rrRatio: 2,
                seed: 1,
                tradesPerDay: 4,
                trials: 200,
                winrate: 0.45,
            });

            expect(out.passProbability).toBeGreaterThan(0);
            expect(out.costPerFundedAccount).toBeGreaterThan(0);
            expect(out.costPerFundedAccount).toBeGreaterThanOrEqual(
                plan.fees.monthlySubscription,
            );
            expect(out.costPerDrawdownDollar).toBeGreaterThan(0);
        },
    );
});
