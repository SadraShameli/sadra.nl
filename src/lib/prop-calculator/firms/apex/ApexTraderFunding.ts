import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    IntradayTrailingDrawdown,
    Plan,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

class ApexPlan extends Plan {}

const SIZES = [
    {
        accountSize: 25_000,
        activationEod: 109,
        activationIntraday: 89,
        dailyLossLimit: 500,
        evalCostEod: 299,
        evalCostIntraday: 199,
        maxDrawdown: 1000,
        profitTarget: 1500,
    },
    {
        accountSize: 50_000,
        activationEod: 119,
        activationIntraday: 99,
        dailyLossLimit: 1000,
        evalCostEod: 349,
        evalCostIntraday: 249,
        maxDrawdown: 2000,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        activationEod: 139,
        activationIntraday: 119,
        dailyLossLimit: 1500,
        evalCostEod: 599,
        evalCostIntraday: 399,
        maxDrawdown: 3000,
        profitTarget: 6000,
    },
    {
        accountSize: 150_000,
        activationEod: 159,
        activationIntraday: 139,
        dailyLossLimit: 2000,
        evalCostEod: 799,
        evalCostIntraday: 599,
        maxDrawdown: 4000,
        profitTarget: 9000,
    },
] as const;

type ApexSize = (typeof SIZES)[number];

export class ApexTraderFunding extends TradingFirm {
    readonly displayName = 'Apex Trader Funding';
    readonly id = FirmId.Apex;
    readonly plans = SIZES.flatMap((s) => [
        new ApexPlan(buildPlan(s, 'eod')),
        new ApexPlan(buildPlan(s, 'intraday')),
    ]) as readonly Plan[];
    readonly website = 'https://apextraderfunding.com';

    maxFundedAccounts(): number {
        return 20;
    }
}

function buildPlan(size: ApexSize, variant: 'eod' | 'intraday'): PlanInit {
    const isEod = variant === 'eod';
    const drawdown = isEod
        ? new EodTrailingDrawdown({ amount: size.maxDrawdown })
        : new IntradayTrailingDrawdown({ amount: size.maxDrawdown });

    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('funded', 0.5),
        dailyLossLimit: isEod ? size.dailyLossLimit : null,
        drawdown,
        fees: {
            activation: isEod ? size.activationEod : size.activationIntraday,
            monthlySubscription: 0,
            oneTimeEval: isEod ? size.evalCostEod : size.evalCostIntraday,
            reset: isEod ? size.evalCostEod : 80,
        },
        id: { accountSize: size.accountSize, firm: FirmId.Apex, variant },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — ${isEod ? 'EOD trailing' : 'Intraday trailing'}`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.maxDrawdown + 100,
        minTradingDays: 0,
        payoutSchedule: { kind: 'biweekly' },
        payoutTiers: [
            { thresholdProfit: 0, traderShare: 1 },
            { thresholdProfit: 25_000, traderShare: 0.9 },
        ],
        profitTarget: size.profitTarget,
    };
}
