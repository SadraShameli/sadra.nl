import { describe, expect, it } from 'vitest';

import {
    FirmId,
    RungSizing,
    TopStepVariant,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { simulate } from '~/lib/prop-calculator/simulator';

describe('the cost-breakdown month count uses the same trial population as expectedDaysToPass', () => {
    it('matches plan.fees.monthlySubscription times ceil(expectedDaysToPass / trading days per month)', () => {
        const firm = findFirm(FirmId.TopStep);
        if (!firm) throw new Error('TopStep not registered');
        const plan = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        if (!plan) throw new Error('TopStep Standard XFA 50K plan not found');

        const out = simulate({
            fundedHorizonDays: 252,
            maxEvalDays: 150,
            plan,
            riskPerTrade: 900,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            seed: 42,
            tradesPerDay: 2,
            trials: 400,
            winrate: 0.4,
        });

        const expectedMonths = Math.max(
            1,
            Math.ceil(out.expectedDaysToPass / TRADING_DAYS_PER_MONTH),
        );

        expect(out.costBreakdown.monthlySubsTotal).toBeCloseTo(
            plan.fees.monthlySubscription * expectedMonths,
            6,
        );
    });
});
