import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

class TptPlan extends Plan {}

const SIZES = [
    {
        accountSize: 50_000,
        maxDrawdown: 2000,
        monthlySubscription: 170,
        profitTarget: 3000,
    },
] as const;

type TptSize = (typeof SIZES)[number];

export class TakeProfitTrader extends TradingFirm {
    readonly displayName = 'Take Profit Trader';
    readonly id = FirmId.Tpt;
    readonly plans = SIZES.map(
        (s) => new TptPlan(buildPlan(s)),
    ) as readonly Plan[];
    readonly website = 'https://takeprofittrader.com';

    maxFundedAccounts(): number {
        return 5;
    }
}

function buildPlan(size: TptSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        evalDailyLossLimit: { kind: 'none' },
        fees: {
            activation: 130,
            monthlySubscription: size.monthlySubscription,
            oneTimeEval: 0,
            reset: 0,
        },
        id: { accountSize: size.accountSize, firm: FirmId.Tpt },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Test → PRO`,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: size.maxDrawdown,
        minTradingDays: 5,
        payoutSchedule: { kind: 'biweekly' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        profitTarget: size.profitTarget,
    };
}
