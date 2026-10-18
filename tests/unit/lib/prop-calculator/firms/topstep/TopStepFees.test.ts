import { describe, expect, it } from 'vitest';

import { FirmId, TopStepVariant } from '~/lib/prop-calculator/core';
import {
    TopStep,
    TOPSTEP_PAYOUT_POLICY,
} from '~/lib/prop-calculator/firms/topstep/TopStep';
import { buildTopStepLivePlan } from '~/lib/prop-calculator/firms/topstep/TopStepLive';

const topStep = new TopStep();

function plan(variant: TopStepVariant) {
    const found = topStep.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant,
    });
    if (!found) throw new Error(`topstep ${variant} missing`);
    return found;
}

describe('TopStep 50K reset fees follow the published Reset Pricing table (help article 14289835: Standard $49, No Activation Fee $95); the DLL discount is published for the subscription only', () => {
    it.each([
        [TopStepVariant.StandardStandard, 49],
        [TopStepVariant.StandardConsistency, 49],
        [TopStepVariant.StandardStandardDll, 49],
        [TopStepVariant.StandardConsistencyDll, 49],
        [TopStepVariant.NoFeeStandard, 95],
        [TopStepVariant.NoFeeConsistency, 95],
        [TopStepVariant.NoFeeStandardDll, 95],
        [TopStepVariant.NoFeeConsistencyDll, 95],
    ])('%s resets for $%d', (variant, reset) => {
        expect(plan(variant).fees.reset).toBe(reset);
    });

    it('the Pro Account is call-up only and carries no activation, subscription, evaluation or reset fee', () => {
        expect(plan(TopStepVariant.ProAccount).fees).toStrictEqual({
            activation: 0,
            monthlySubscription: 0,
            oneTimeEval: 0,
            reset: 0,
        });
    });

    it('the No-fee DLL path still gets the automatic $10 Responsible Trading Discount on its $85 monthly subscription', () => {
        expect(
            plan(TopStepVariant.NoFeeStandardDll).fees.monthlySubscription,
        ).toBe(85);
        expect(
            plan(TopStepVariant.NoFeeConsistencyDll).fees.monthlySubscription,
        ).toBe(85);
    });
});

describe('TopStep payout policy figures live in one shared constant set used by the XFA plans and the LFA (help article 8284233)', () => {
    it('publishes the $125 minimum, the $150 winning day, the 50% per-request cap and the 30-winning-day daily-payout unlock', () => {
        expect(TOPSTEP_PAYOUT_POLICY.minPayoutRequest).toBe(125);
        expect(TOPSTEP_PAYOUT_POLICY.minWinningDayProfit).toBe(150);
        expect(TOPSTEP_PAYOUT_POLICY.requestBalanceShareCap).toBe(0.5);
        expect(TOPSTEP_PAYOUT_POLICY.dailyPayoutsAfterWinningDays).toBe(30);
        expect(TOPSTEP_PAYOUT_POLICY.winningDaysPerRequest).toBe(5);
        expect(TOPSTEP_PAYOUT_POLICY.traderShare).toBe(0.9);
    });

    it('every XFA plan uses the shared minimum, balance-share cap and trader share', () => {
        for (const variant of [
            TopStepVariant.StandardStandard,
            TopStepVariant.StandardConsistencyDll,
            TopStepVariant.NoFeeStandard,
            TopStepVariant.NoFeeConsistencyDll,
        ]) {
            const xfa = plan(variant);
            expect(xfa.minPayoutRequest).toBe(
                TOPSTEP_PAYOUT_POLICY.minPayoutRequest,
            );
            expect(xfa.payoutBalanceShareCap).toBe(
                TOPSTEP_PAYOUT_POLICY.requestBalanceShareCap,
            );
            expect(xfa.payoutTiers[0]?.traderShare).toBe(
                TOPSTEP_PAYOUT_POLICY.traderShare,
            );
        }
        expect(
            plan(TopStepVariant.StandardStandard).minQualifyingDayProfit,
        ).toBe(TOPSTEP_PAYOUT_POLICY.minWinningDayProfit);
        expect(plan(TopStepVariant.ProAccount).minQualifyingDayProfit).toBe(
            TOPSTEP_PAYOUT_POLICY.minWinningDayProfit,
        );
    });

    it('the LFA uses the same shared minimum, winning-day gate and trader share', () => {
        const live = buildTopStepLivePlan();
        expect(live.minPayoutRequest).toBe(
            TOPSTEP_PAYOUT_POLICY.minPayoutRequest,
        );
        expect(live.winningDayPayoutGate).toStrictEqual({
            dailyPayoutsAfterWinningDays:
                TOPSTEP_PAYOUT_POLICY.dailyPayoutsAfterWinningDays,
            minWinningDayProfit: TOPSTEP_PAYOUT_POLICY.minWinningDayProfit,
            requestBalanceShareCap:
                TOPSTEP_PAYOUT_POLICY.requestBalanceShareCap,
            winningDaysPerRequest: TOPSTEP_PAYOUT_POLICY.winningDaysPerRequest,
        });
        expect(live.payoutTiers[0]?.traderShare).toBe(
            TOPSTEP_PAYOUT_POLICY.traderShare,
        );
    });
});
