import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

export const TOY_DRAWDOWN = 100;

export function lockAtOneFiftyToyPlan(): Plan {
    return paysTheFirstWinningCloseToyPlan().withOverrides({
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(TOY_DRAWDOWN),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        minRetainedCushionOverride: undefined,
    });
}

export function paysTheFirstWinningCloseToyPlan(): Plan {
    const rapidEod = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!rapidEod) throw new Error('MFF Rapid EOD 50K plan not found');
    return rapidEod.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(TOY_DRAWDOWN) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(TOY_DRAWDOWN),
            lock: {
                atProfit: dollars(-1000),
                lockedThreshold: (startingBalance) =>
                    startingBalance - TOY_DRAWDOWN,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minRetainedCushionOverride: dollars(0),
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}
