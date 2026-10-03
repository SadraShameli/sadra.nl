import { dollars, fraction, type Plan } from '~/lib/prop-calculator';

export function withoutPayoutStructure(plan: Plan): Plan {
    return plan.withOverrides({
        consistency: null,
        fundedConsistency: { kind: 'set', rule: null },
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}
