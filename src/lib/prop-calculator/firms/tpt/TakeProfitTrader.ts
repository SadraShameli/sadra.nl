import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanId,
    type PlanInit,
    PropFirm,
} from '../../core';

class TptPlan extends Plan {}

interface TptSize {
    accountSize: number;
    monthlySubscription: number;
    profitTarget: number;
    maxDrawdown: number;
}

const SIZES: readonly TptSize[] = [
    {
        accountSize: 25_000,
        monthlySubscription: 150,
        profitTarget: 1_500,
        maxDrawdown: 1_500,
    },
    {
        accountSize: 50_000,
        monthlySubscription: 170,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
    },
    {
        accountSize: 75_000,
        monthlySubscription: 245,
        profitTarget: 4_500,
        maxDrawdown: 2_500,
    },
    {
        accountSize: 100_000,
        monthlySubscription: 330,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
    },
    {
        accountSize: 150_000,
        monthlySubscription: 360,
        profitTarget: 9_000,
        maxDrawdown: 4_500,
    },
] as const;

function buildPlan(size: TptSize): PlanInit {
    return {
        id: `tpt-${size.accountSize}` as PlanId,
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Test → PRO`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 5,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('eval', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        payoutSchedule: { kind: 'biweekly' },
        fees: {
            oneTimeEval: 0,
            activation: 130,
            monthlySubscription: size.monthlySubscription,
            reset: 0,
        },
        minPayoutProfit: 250,
        minDaysAfterPassForPayout: 5,
    };
}

export class TakeProfitTrader extends PropFirm {
    readonly id = FirmId.Tpt;
    readonly displayName = 'Take Profit Trader';
    readonly website = 'https://takeprofittrader.com';
    readonly plans = SIZES.map(
        (s) => new TptPlan(buildPlan(s)),
    ) as readonly Plan[];

    maxFundedAccounts(): number {
        return 5;
    }
}
