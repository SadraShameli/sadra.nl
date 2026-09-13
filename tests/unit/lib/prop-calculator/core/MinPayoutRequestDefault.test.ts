import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';

describe('Plan.minPayoutRequest defaults to $0, never to minPayoutProfit', () => {
    it('AlphaFutures plans (the one firm that omits minPayoutRequest) resolve to $0, not their minPayoutProfit value', () => {
        const plans = new AlphaFutures().plans;
        for (const plan of plans) {
            expect(plan.minPayoutRequest).toBe(0);
            expect(plan.minPayoutRequest).not.toBe(plan.minPayoutProfit);
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

    it('every registered firm sets minPayoutRequest explicitly, except AlphaFutures which deliberately leaves it unset', () => {
        expect(new TakeProfitTrader().plans[0]?.minPayoutRequest).toBe(0.01);
        expect(new AlphaFutures().plans[0]?.minPayoutRequest).toBe(0);
    });
});
