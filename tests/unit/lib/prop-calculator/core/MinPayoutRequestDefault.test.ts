import { describe, expect, it } from 'vitest';

import { AlphaFuturesVariant, FirmId } from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';

describe('Plan.minPayoutRequest defaults to $0, never to minPayoutProfit', () => {
    it('Alpha Futures sets its Payout Policy minimum request explicitly on every plan', () => {
        const expected = {
            [AlphaFuturesVariant.Advanced]: 1000,
            [AlphaFuturesVariant.Standard]: 500,
            [AlphaFuturesVariant.Zero]: 200,
        };
        const plans = new AlphaFutures().plans;
        expect(plans).toHaveLength(3);
        for (const plan of plans) {
            if (plan.id.firm !== FirmId.AlphaFutures) {
                throw new Error('expected an Alpha Futures plan id');
            }
            expect(plan.minPayoutRequest).toBe(expected[plan.id.variant]);
        }
    });

    it("stripping an explicit minPayoutRequest via withOverrides falls back to $0, not the plan's own minPayoutProfit", () => {
        const tpt = findFirm(FirmId.Tpt);
        if (!tpt) throw new Error('TPT not registered');
        const plan = tpt.findPlan({ accountSize: 50_000, firm: FirmId.Tpt });
        if (!plan) throw new Error('TPT 50K plan not found');

        expect(plan.minPayoutProfit).toBe(2000);
        expect(plan.minPayoutRequest).toBe(0.01);

        const stripped = plan.withOverrides({ minPayoutRequest: undefined });
        expect(stripped.minPayoutRequest).toBe(0);
        expect(stripped.minPayoutRequest).not.toBe(stripped.minPayoutProfit);
    });

    it('stripping the Alpha Futures minimum via withOverrides falls back to the $0 default', () => {
        const alpha = new AlphaFutures().plans[0];
        if (!alpha) throw new Error('Alpha Futures has no plans');
        expect(
            alpha.withOverrides({ minPayoutRequest: undefined })
                .minPayoutRequest,
        ).toBe(0);
    });

    it('Take Profit Trader keeps its explicit one-cent minimum request', () => {
        expect(new TakeProfitTrader().plans[0]?.minPayoutRequest).toBe(0.01);
    });
});
