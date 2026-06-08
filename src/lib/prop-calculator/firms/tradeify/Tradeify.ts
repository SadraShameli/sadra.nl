import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanInit,
    PropFirm,
} from '~/lib/prop-calculator/core';

class TradeifyPlan extends Plan {}

const GROWTH_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 99,
        maxDrawdown: 1000,
        minPayoutProfit: 1500,
    },
    {
        accountSize: 50_000,
        evalCost: 145,
        maxDrawdown: 2000,
        minPayoutProfit: 3000,
    },
    {
        accountSize: 100_000,
        evalCost: 255,
        maxDrawdown: 3500,
        minPayoutProfit: 4500,
    },
    {
        accountSize: 150_000,
        evalCost: 369,
        maxDrawdown: 5000,
        minPayoutProfit: 6500,
    },
] as const;

const SELECT_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 109,
        maxDrawdown: 1000,
        minPayoutProfit: 1100,
    },
    {
        accountSize: 50_000,
        evalCost: 165,
        maxDrawdown: 2000,
        minPayoutProfit: 2100,
    },
    {
        accountSize: 100_000,
        evalCost: 265,
        maxDrawdown: 3000,
        minPayoutProfit: 2600,
    },
    {
        accountSize: 150_000,
        evalCost: 369,
        maxDrawdown: 4500,
        minPayoutProfit: 3600,
    },
] as const;

const LIGHTNING_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 345,
        maxDrawdown: 1000,
        minPayoutProfit: 1500,
    },
    {
        accountSize: 50_000,
        evalCost: 492,
        maxDrawdown: 2000,
        minPayoutProfit: 3000,
    },
    {
        accountSize: 100_000,
        evalCost: 660,
        maxDrawdown: 4000,
        minPayoutProfit: 6000,
    },
    {
        accountSize: 150_000,
        evalCost: 796,
        maxDrawdown: 5250,
        minPayoutProfit: 9000,
    },
] as const;

type TradeifyGrowthSize = (typeof GROWTH_SIZES)[number];
type TradeifyLightningSize = (typeof LIGHTNING_SIZES)[number];
type TradeifySelectSize = (typeof SELECT_SIZES)[number];

export class Tradeify extends PropFirm {
    readonly displayName = 'Tradeify';
    readonly id = FirmId.Tradeify;
    readonly plans = [
        ...GROWTH_SIZES.map((s) => new TradeifyPlan(buildGrowthPlan(s))),
        ...SELECT_SIZES.map((s) => new TradeifyPlan(buildSelectPlan(s))),
        ...LIGHTNING_SIZES.map((s) => new TradeifyPlan(buildLightningPlan(s))),
    ] as readonly Plan[];
    readonly website = 'https://tradeify.co';

    maxFundedAccounts(): number {
        return 5;
    }
}

function buildGrowthPlan(size: TradeifyGrowthSize): PlanInit {
    const profitTarget = size.accountSize * 0.06;
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('funded', 0.35),
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown + 100,
                lockedThreshold: (start) => start + 100,
            },
        }),
        fees: {
            activation: 0,
            monthlySubscription: 0,
            oneTimeEval: size.evalCost,
            reset: 50,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.Tradeify,
            variant: 'growth',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Growth`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 1,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget,
    };
}

function buildLightningPlan(size: TradeifyLightningSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('funded', 0.2),
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown + 100,
                lockedThreshold: (start) => start + 100,
            },
        }),
        fees: {
            activation: 0,
            monthlySubscription: 0,
            oneTimeEval: size.evalCost,
            reset: size.evalCost,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.Tradeify,
            variant: 'lightning',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Lightning Funded`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 0,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget: 0,
    };
}

function buildSelectPlan(size: TradeifySelectSize): PlanInit {
    const profitTarget = size.accountSize * 0.06;
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.4),
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown + 100,
                lockedThreshold: (start) => start + 100,
            },
        }),
        fees: {
            activation: 0,
            monthlySubscription: 0,
            oneTimeEval: size.evalCost,
            reset: 50,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.Tradeify,
            variant: 'select',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Select`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 3,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget,
    };
}
