import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanId,
    type PlanInit,
    PropFirm,
} from '../../core';

class TradeifyPlan extends Plan {}

interface TradeifySize {
    accountSize: number;
    evalCost: number;
    maxDrawdown: number;
    dailyLossLimit: number;
}

const SIZES: readonly TradeifySize[] = [
    {
        accountSize: 25_000,
        evalCost: 99,
        maxDrawdown: 1_000,
        dailyLossLimit: 600,
    },
    {
        accountSize: 50_000,
        evalCost: 129,
        maxDrawdown: 2_000,
        dailyLossLimit: 1_250,
    },
    {
        accountSize: 100_000,
        evalCost: 215,
        maxDrawdown: 3_500,
        dailyLossLimit: 2_500,
    },
    {
        accountSize: 150_000,
        evalCost: 299,
        maxDrawdown: 5_000,
        dailyLossLimit: 3_750,
    },
] as const;

function buildPlan(size: TradeifySize): PlanInit {
    const profitTarget = size.accountSize * 0.06;
    return {
        id: `tradeify-${size.accountSize}` as PlanId,
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Growth`,
        accountSize: size.accountSize,
        profitTarget,
        minTradingDays: 1,
        dailyLossLimit: size.dailyLossLimit,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown + 100,
                lockedThreshold: (start) => start + 100,
            },
        }),
        consistency: new ConsistencyRule('funded', 0.35),
        payoutTiers: [
            { thresholdProfit: 0, traderShare: 1.0 },
            { thresholdProfit: 15_000, traderShare: 0.9 },
        ],
        payoutSchedule: { kind: 'daily' },
        fees: {
            oneTimeEval: size.evalCost,
            activation: 0,
            monthlySubscription: 0,
            reset: 50,
        },
        minPayoutProfit: 250,
        minDaysAfterPassForPayout: 5,
    };
}

export class Tradeify extends PropFirm {
    readonly id = FirmId.Tradeify;
    readonly displayName = 'Tradeify';
    readonly website = 'https://tradeify.co';
    readonly plans = SIZES.map(
        (s) => new TradeifyPlan(buildPlan(s)),
    ) as readonly Plan[];

    maxFundedAccounts(): number {
        return 5;
    }
}
