import { describe, expect, it } from 'vitest';

import {
    computedDayPolicy,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type FundedCycleSnapshot,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { simulate } from '~/lib/prop-calculator/simulator';

function payoutCapToyPlan(): Plan {
    const base = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('MFF Rapid EOD 50K plan not found');
    return base.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        isInstantFunded: true,
        maxConsecutiveIdleDays: undefined,
        maxLifetimePayouts: 2,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(300),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: dollars(150),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

describe('the funded day loop hands the day policy the balance left after the last payout', () => {
    it('passes the starting balance before any payout and the post-debit balance after one', () => {
        const recorded: {
            balance: number;
            fundedCycle: FundedCycleSnapshot | undefined;
        }[] = [];
        const dayPolicy = computedDayPolicy(
            (state, _tradeIndexToday, fundedCycle) => {
                recorded.push({ balance: state.balance, fundedCycle });
                return 100;
            },
            1,
        );

        const out = simulate({
            fundedDayPolicy: dayPolicy,
            fundedHorizonDays: 50,
            maxEvalDays: 1,
            plan: payoutCapToyPlan(),
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 7,
            tradesPerDay: 1,
            trials: 1,
            winrate: fraction(1),
        });

        expect(out.expectedGrossPayout).toBeCloseTo(250, 10);
        expect(recorded).toStrictEqual([
            {
                balance: 1000,
                fundedCycle: {
                    cycleBestDayProfit: 0,
                    lastPayoutBalance: 1000,
                    payoutsIssued: 0,
                    qualifyingDaysSincePayout: 0,
                },
            },
            {
                balance: 1100,
                fundedCycle: {
                    cycleBestDayProfit: 100,
                    lastPayoutBalance: 1000,
                    payoutsIssued: 0,
                    qualifyingDaysSincePayout: 1,
                },
            },
            {
                balance: 1200,
                fundedCycle: {
                    cycleBestDayProfit: 100,
                    lastPayoutBalance: 1000,
                    payoutsIssued: 0,
                    qualifyingDaysSincePayout: 2,
                },
            },
            {
                balance: 1150,
                fundedCycle: {
                    cycleBestDayProfit: 0,
                    lastPayoutBalance: 1150,
                    payoutsIssued: 1,
                    qualifyingDaysSincePayout: 0,
                },
            },
        ]);
    });
});
