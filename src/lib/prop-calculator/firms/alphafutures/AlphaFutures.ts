import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

class AlphaFuturesPlan extends Plan {}

const ZERO_SIZES = [
    {
        accountSize: 25_000,
        dailyLossLimit: 500,
        maxDrawdown: 1000,
        monthlyFee: 79,
        profitTarget: 1500,
    },
    {
        accountSize: 50_000,
        dailyLossLimit: 1000,
        maxDrawdown: 2000,
        monthlyFee: 119,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        dailyLossLimit: 2000,
        maxDrawdown: 3000,
        monthlyFee: 239,
        profitTarget: 6000,
    },
] as const;

const ADVANCED_SIZES = [
    {
        accountSize: 50_000,
        maxDrawdown: 1750,
        monthlyFee: 139,
        profitTarget: 4000,
    },
    {
        accountSize: 100_000,
        maxDrawdown: 3500,
        monthlyFee: 279,
        profitTarget: 8000,
    },
    {
        accountSize: 150_000,
        maxDrawdown: 5250,
        monthlyFee: 419,
        profitTarget: 12_000,
    },
] as const;

const PREMIUM_SIZES = [
    {
        accountSize: 50_000,
        maxDrawdown: 2000,
        monthlyFee: 79,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        maxDrawdown: 3000,
        monthlyFee: 159,
        profitTarget: 6000,
    },
    {
        accountSize: 150_000,
        maxDrawdown: 4500,
        monthlyFee: 239,
        profitTarget: 9000,
    },
] as const;

const EXPRESS_SIZES = [
    {
        accountSize: 50_000,
        maxDrawdown: 2000,
        monthlyFee: 159,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        maxDrawdown: 3000,
        monthlyFee: 269,
        profitTarget: 6000,
    },
    {
        accountSize: 150_000,
        maxDrawdown: 4500,
        monthlyFee: 379,
        profitTarget: 9000,
    },
] as const;

type AfAdvancedSize = (typeof ADVANCED_SIZES)[number];
type AfExpressSize = (typeof EXPRESS_SIZES)[number];
type AfPremiumSize = (typeof PREMIUM_SIZES)[number];
type AfZeroSize = (typeof ZERO_SIZES)[number];

export class AlphaFutures extends TradingFirm {
    readonly displayName = 'Alpha Futures';
    readonly id = FirmId.AlphaFutures;
    readonly plans = [
        ...ZERO_SIZES.map((s) => new AlphaFuturesPlan(buildZeroPlan(s))),
        ...PREMIUM_SIZES.map((s) => new AlphaFuturesPlan(buildPremiumPlan(s))),
        ...EXPRESS_SIZES.map((s) => new AlphaFuturesPlan(buildExpressPlan(s))),
        ...ADVANCED_SIZES.map(
            (s) => new AlphaFuturesPlan(buildAdvancedPlan(s)),
        ),
    ] as readonly Plan[];
    readonly website = 'https://alpha-futures.com';

    maxFundedAccounts(plan: Plan): number {
        const allocationCap = 450_000;
        const hardCap = 5;
        const byAllocation = Math.floor(allocationCap / plan.accountSize);
        return Math.max(1, Math.min(hardCap, byAllocation));
    }
}

function buildAdvancedPlan(size: AfAdvancedSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        fees: {
            activation: 149,
            monthlySubscription: size.monthlyFee,
            oneTimeEval: 0,
            reset: Math.round(size.monthlyFee * 0.9),
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.AlphaFutures,
            variant: 'advanced',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Advanced`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: 1000,
        minTradingDays: 2,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget: size.profitTarget,
    };
}

function buildExpressPlan(size: AfExpressSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        fees: {
            activation: 0,
            monthlySubscription: size.monthlyFee,
            oneTimeEval: 0,
            reset: Math.round(size.monthlyFee * 0.9),
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.AlphaFutures,
            variant: 'express',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Premium Express`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: 500,
        minTradingDays: 2,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget: size.profitTarget,
    };
}

function buildPremiumPlan(size: AfPremiumSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        fees: {
            activation: 149,
            monthlySubscription: size.monthlyFee,
            oneTimeEval: 0,
            reset: Math.round(size.monthlyFee * 0.9),
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.AlphaFutures,
            variant: 'premium',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Premium`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: 500,
        minTradingDays: 2,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget: size.profitTarget,
    };
}

function buildZeroPlan(size: AfZeroSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('funded', 0.4),
        dailyLossLimit: size.dailyLossLimit,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        fees: {
            activation: 0,
            monthlySubscription: size.monthlyFee,
            oneTimeEval: 0,
            reset: Math.round(size.monthlyFee * 0.9),
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.AlphaFutures,
            variant: 'zero',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Zero`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: 200,
        minTradingDays: 1,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget: size.profitTarget,
    };
}
