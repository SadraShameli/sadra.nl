import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanInit,
    PropFirm,
} from '../../core';

class TradeifyPlan extends Plan {}

const GROWTH_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 99,
        maxDrawdown: 1_000,
        minPayoutProfit: 1_500,
    },
    {
        accountSize: 50_000,
        evalCost: 145,
        maxDrawdown: 2_000,
        minPayoutProfit: 3_000,
    },
    {
        accountSize: 100_000,
        evalCost: 255,
        maxDrawdown: 3_500,
        minPayoutProfit: 4_500,
    },
    {
        accountSize: 150_000,
        evalCost: 369,
        maxDrawdown: 5_000,
        minPayoutProfit: 6_500,
    },
] as const;

const SELECT_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 109,
        maxDrawdown: 1_000,
        minPayoutProfit: 1_100,
    },
    {
        accountSize: 50_000,
        evalCost: 165,
        maxDrawdown: 2_000,
        minPayoutProfit: 2_100,
    },
    {
        accountSize: 100_000,
        evalCost: 265,
        maxDrawdown: 3_000,
        minPayoutProfit: 2_600,
    },
    {
        accountSize: 150_000,
        evalCost: 369,
        maxDrawdown: 4_500,
        minPayoutProfit: 3_600,
    },
] as const;

const LIGHTNING_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 345,
        maxDrawdown: 1_000,
        minPayoutProfit: 1_500,
    },
    {
        accountSize: 50_000,
        evalCost: 492,
        maxDrawdown: 2_000,
        minPayoutProfit: 3_000,
    },
    {
        accountSize: 100_000,
        evalCost: 660,
        maxDrawdown: 4_000,
        minPayoutProfit: 6_000,
    },
    {
        accountSize: 150_000,
        evalCost: 796,
        maxDrawdown: 5_250,
        minPayoutProfit: 9_000,
    },
] as const;

type TradeifyGrowthSize = (typeof GROWTH_SIZES)[number];
type TradeifySelectSize = (typeof SELECT_SIZES)[number];
type TradeifyLightningSize = (typeof LIGHTNING_SIZES)[number];

function buildGrowthPlan(size: TradeifyGrowthSize): PlanInit {
    const profitTarget = size.accountSize * 0.06;
    return {
        id: {
            firm: FirmId.Tradeify,
            accountSize: size.accountSize,
            variant: 'growth',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Growth`,
        accountSize: size.accountSize,
        profitTarget,
        minTradingDays: 1,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown + 100,
                lockedThreshold: (start) => start + 100,
            },
        }),
        consistency: new ConsistencyRule('funded', 0.35),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: size.evalCost,
            activation: 0,
            monthlySubscription: 0,
            reset: 50,
        },
        minPayoutProfit: size.minPayoutProfit,
        minDaysAfterPassForPayout: 5,
    };
}

function buildSelectPlan(size: TradeifySelectSize): PlanInit {
    const profitTarget = size.accountSize * 0.06;
    return {
        id: {
            firm: FirmId.Tradeify,
            accountSize: size.accountSize,
            variant: 'select',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Select`,
        accountSize: size.accountSize,
        profitTarget,
        minTradingDays: 3,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown + 100,
                lockedThreshold: (start) => start + 100,
            },
        }),
        consistency: new ConsistencyRule('eval', 0.4),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: size.evalCost,
            activation: 0,
            monthlySubscription: 0,
            reset: 50,
        },
        minPayoutProfit: size.minPayoutProfit,
        minDaysAfterPassForPayout: 5,
    };
}

function buildLightningPlan(size: TradeifyLightningSize): PlanInit {
    return {
        id: {
            firm: FirmId.Tradeify,
            accountSize: size.accountSize,
            variant: 'lightning',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Lightning Funded`,
        accountSize: size.accountSize,
        profitTarget: 0,
        minTradingDays: 0,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown + 100,
                lockedThreshold: (start) => start + 100,
            },
        }),
        consistency: new ConsistencyRule('funded', 0.2),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: size.evalCost,
            activation: 0,
            monthlySubscription: 0,
            reset: size.evalCost,
        },
        minPayoutProfit: size.minPayoutProfit,
        minDaysAfterPassForPayout: 5,
    };
}

export class Tradeify extends PropFirm {
    readonly id = FirmId.Tradeify;
    readonly displayName = 'Tradeify';
    readonly website = 'https://tradeify.co';
    readonly plans = [
        ...GROWTH_SIZES.map((s) => new TradeifyPlan(buildGrowthPlan(s))),
        ...SELECT_SIZES.map((s) => new TradeifyPlan(buildSelectPlan(s))),
        ...LIGHTNING_SIZES.map((s) => new TradeifyPlan(buildLightningPlan(s))),
    ] as readonly Plan[];

    maxFundedAccounts(): number {
        return 5;
    }
}
