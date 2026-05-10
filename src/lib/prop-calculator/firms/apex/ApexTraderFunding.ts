import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    IntradayTrailingDrawdown,
    Plan,
    type PlanInit,
    PropFirm,
} from '../../core';

class ApexPlan extends Plan {}

const SIZES = [
    {
        accountSize: 25_000,
        profitTarget: 1_500,
        maxDrawdown: 1_000,
        dailyLossLimit: 500,
        evalCostEod: 299,
        evalCostIntraday: 199,
        activationEod: 109,
        activationIntraday: 89,
    },
    {
        accountSize: 50_000,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
        dailyLossLimit: 1_000,
        evalCostEod: 349,
        evalCostIntraday: 249,
        activationEod: 119,
        activationIntraday: 99,
    },
    {
        accountSize: 100_000,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
        dailyLossLimit: 1_500,
        evalCostEod: 599,
        evalCostIntraday: 399,
        activationEod: 139,
        activationIntraday: 119,
    },
    {
        accountSize: 150_000,
        profitTarget: 9_000,
        maxDrawdown: 4_000,
        dailyLossLimit: 2_000,
        evalCostEod: 799,
        evalCostIntraday: 599,
        activationEod: 159,
        activationIntraday: 139,
    },
] as const;

type ApexSize = (typeof SIZES)[number];

function buildPlan(size: ApexSize, variant: 'eod' | 'intraday'): PlanInit {
    const isEod = variant === 'eod';
    const drawdown = isEod
        ? new EodTrailingDrawdown({ amount: size.maxDrawdown })
        : new IntradayTrailingDrawdown({ amount: size.maxDrawdown });

    return {
        id: { firm: FirmId.Apex, accountSize: size.accountSize, variant },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — ${isEod ? 'EOD trailing' : 'Intraday trailing'}`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 0,
        dailyLossLimit: isEod ? size.dailyLossLimit : null,
        drawdown,
        consistency: new ConsistencyRule('funded', 0.5),
        payoutTiers: [
            { thresholdProfit: 0, traderShare: 1.0 },
            { thresholdProfit: 25_000, traderShare: 0.9 },
        ],
        payoutSchedule: { kind: 'biweekly' },
        fees: {
            oneTimeEval: isEod ? size.evalCostEod : size.evalCostIntraday,
            activation: isEod ? size.activationEod : size.activationIntraday,
            monthlySubscription: 0,
            reset: isEod ? size.evalCostEod : 80,
        },
        minPayoutProfit: size.maxDrawdown + 100,
        minDaysAfterPassForPayout: 5,
    };
}

export class ApexTraderFunding extends PropFirm {
    readonly id = FirmId.Apex;
    readonly displayName = 'Apex Trader Funding';
    readonly website = 'https://apextraderfunding.com';
    readonly plans = SIZES.flatMap((s) => [
        new ApexPlan(buildPlan(s, 'eod')),
        new ApexPlan(buildPlan(s, 'intraday')),
    ]) as readonly Plan[];

    maxFundedAccounts(): number {
        return 20;
    }
}
