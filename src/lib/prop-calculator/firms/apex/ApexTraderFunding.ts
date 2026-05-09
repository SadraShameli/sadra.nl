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
        evalCostEod: 177,
        evalCostIntraday: 118,
    },
    {
        accountSize: 50_000,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
        dailyLossLimit: 1_000,
        evalCostEod: 197,
        evalCostIntraday: 131,
    },
    {
        accountSize: 100_000,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
        dailyLossLimit: 1_500,
        evalCostEod: 297,
        evalCostIntraday: 198,
    },
    {
        accountSize: 150_000,
        profitTarget: 9_000,
        maxDrawdown: 4_000,
        dailyLossLimit: 2_000,
        evalCostEod: 397,
        evalCostIntraday: 265,
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
        payoutTiers: [{ thresholdProfit: 0, traderShare: 1.0 }],
        payoutSchedule: { kind: 'biweekly' },
        fees: {
            oneTimeEval: isEod ? size.evalCostEod : size.evalCostIntraday,
            activation: isEod ? 99 : 79,
            monthlySubscription: 0,
            reset: 80,
        },
        minPayoutProfit: 1_000,
        minDaysAfterPassForPayout: 8,
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
