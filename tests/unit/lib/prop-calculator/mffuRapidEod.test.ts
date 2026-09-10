import { describe, expect, it } from 'vitest';

import {
    ConsistencyScope,
    ContractLimitKind,
    DailyLossLimitKind,
    FirmId,
    fraction,
    MffuVariant,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const mffu = new MyFundedFutures();

function rapidEod() {
    const plan = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

describe('MFFU Rapid EOD 50K (live-verified 2026-09-10 against help.myfundedfutures.com)', () => {
    it(
        'caps concurrent funded accounts at 3, not 5 — corrected against the ' +
            'plan-specific Rapid EOD 50k/25k articles, which both independently ' +
            'say "Three (3)"; a separate generic cross-plan MFFU page claims 5 ' +
            'but never names Rapid EOD as one of its counted plans',
        () => {
            expect(rapidEod().maxFundedAccounts).toBe(3);
        },
    );

    it('has no daily loss limit in either the evaluation or funded phase', () => {
        const plan = rapidEod();
        expect(plan.evalDailyLossLimit.kind).toBe(DailyLossLimitKind.None);
        expect(plan.fundedDailyLossLimit.kind).toBe(DailyLossLimitKind.None);
    });

    it('applies a 30% consistency cap during the evaluation only, not once funded', () => {
        const plan = rapidEod();
        const evalRule = plan.evalConsistencyRule();
        expect(evalRule).not.toBeNull();
        expect(evalRule?.maxBestDayShare).toBe(fraction(0.3));
        expect(evalRule?.scope).toBe(ConsistencyScope.Eval);
        expect(plan.fundedConsistencyRule()).toBeNull();
    });

    it('requires 4 minimum trading days before the evaluation can pass', () => {
        expect(rapidEod().minTradingDays).toBe(4);
    });

    it('caps both eval and funded contracts at 3 minis / 30 micros, flat (not tiered)', () => {
        const limits = rapidEod().contractLimits;
        expect(limits?.evalMinis).toBe(3);
        expect(limits?.evalMicros).toBe(30);
        expect(limits?.fundedMinis).toStrictEqual({
            kind: ContractLimitKind.Flat,
            maxContracts: 3,
        });
        expect(limits?.fundedMicros).toStrictEqual({
            kind: ContractLimitKind.Flat,
            maxContracts: 30,
        });
    });

    it('pays a flat 90% profit share from the first dollar, with no request cap or ladder', () => {
        const plan = rapidEod();
        expect(plan.payoutTiers).toStrictEqual([
            { thresholdProfit: 0, traderShare: fraction(0.9) },
        ]);
        expect(plan.payoutLadder).toBeNull();
        expect(plan.payoutRequestCap).toBeNull();
        expect(plan.payoutBalanceShareCap).toBeNull();
        expect(plan.maxLifetimePayouts).toBeNull();
    });

    it('requires $2,100 profit before the first payout and $500 profit per cycle after that', () => {
        const plan = rapidEod();
        expect(plan.minPayoutProfit).toBe(2100);
        expect(plan.minPayoutProfitPerCycle).toBe(500);
        expect(plan.minPayoutRequest).toBe(500);
    });

    it('closes both the evaluation and funded account after 7 consecutive days without a trade', () => {
        expect(rapidEod().maxConsecutiveIdleDays).toBe(7);
    });
});
