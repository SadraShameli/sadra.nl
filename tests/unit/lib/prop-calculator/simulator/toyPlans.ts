import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    FundedResetEligibility,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

export const TOY_FUNDED_RESET_FEE = 20;

export function evalToyPlan(): Plan {
    return payoutCapToyPlan().withOverrides({
        fees: {
            activation: dollars(50),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(100),
            reset: dollars(40),
        },
        isInstantFunded: false,
        maxEvalTradingDays: undefined,
        profitTarget: dollars(300),
    });
}

export function fundedResetToyPlan(): Plan {
    return payoutCapToyPlan().withOverrides({
        fundedReset: {
            eligibility: FundedResetEligibility.NoPayoutEverRequested,
            fee: dollars(TOY_FUNDED_RESET_FEE),
            label: 'Toy Reset',
            maxPerAccount: 2,
            windowCalendarDays: 7,
        },
        takesFundedReset: true,
    });
}

export function payoutCapToyPlan(): Plan {
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
