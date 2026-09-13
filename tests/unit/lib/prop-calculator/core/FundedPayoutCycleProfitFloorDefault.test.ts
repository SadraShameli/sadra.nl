import { describe, expect, it } from 'vitest';

import { ApexVariant, FirmId, MffuVariant } from '~/lib/prop-calculator/core';
import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const apex = new ApexTraderFunding();
const mffu = new MyFundedFutures();

describe('requiredProfit no longer borrows the withdrawal-size minimum as a stand-in profit-accrual gate', () => {
    it('Apex EOD: a $200 cycle profit that the old ladder.minRequestAmount ($500) fallback would have blocked now clears the gate, since no confirmed per-cycle profit floor exists', () => {
        const eod = apex.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        if (!eod) throw new Error('apex eod missing');
        expect(eod.minPayoutProfitPerCycle).toBeNull();
        expect(eod.payoutLadder?.minRequestAmount).toBe(500);

        const state = eod.initialState();
        state.balance = state.startingBalance + 10_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 1;
        tracker.lastPayoutBalance = state.balance - 200;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: eod,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBe(1500);
    });

    it('firms with no confirmed recurring per-cycle profit floor leave minPayoutProfitPerCycle unset (null), not fabricated from the request-size or ladder minimum', () => {
        const alphaFuturesPlans = new AlphaFutures().plans;
        for (const plan of alphaFuturesPlans) {
            expect(plan.minPayoutProfitPerCycle).toBeNull();
        }
        const mffuPro = mffu.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Pro,
        });
        const mffuRapid = mffu.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Rapid,
        });
        expect(mffuPro?.minPayoutProfitPerCycle).toBeNull();
        expect(mffuRapid?.minPayoutProfitPerCycle).toBeNull();
    });
});
