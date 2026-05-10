import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanInit,
    PropFirm,
} from '../../core';

class AlphaFuturesPlan extends Plan {}

const ZERO_SIZES = [
    {
        accountSize: 25_000,
        profitTarget: 1_500,
        maxDrawdown: 1_000,
        dailyLossLimit: 500,
        monthlyFee: 79,
    },
    {
        accountSize: 50_000,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
        dailyLossLimit: 1_000,
        monthlyFee: 119,
    },
    {
        accountSize: 100_000,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
        dailyLossLimit: 2_000,
        monthlyFee: 239,
    },
] as const;

const ADVANCED_SIZES = [
    {
        accountSize: 50_000,
        profitTarget: 4_000,
        maxDrawdown: 1_750,
        monthlyFee: 139,
    },
    {
        accountSize: 100_000,
        profitTarget: 8_000,
        maxDrawdown: 3_500,
        monthlyFee: 279,
    },
    {
        accountSize: 150_000,
        profitTarget: 12_000,
        maxDrawdown: 5_250,
        monthlyFee: 419,
    },
] as const;

const PREMIUM_SIZES = [
    {
        accountSize: 50_000,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
        monthlyFee: 79,
    },
    {
        accountSize: 100_000,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
        monthlyFee: 159,
    },
    {
        accountSize: 150_000,
        profitTarget: 9_000,
        maxDrawdown: 4_500,
        monthlyFee: 239,
    },
] as const;

const EXPRESS_SIZES = [
    {
        accountSize: 50_000,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
        monthlyFee: 159,
    },
    {
        accountSize: 100_000,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
        monthlyFee: 269,
    },
    {
        accountSize: 150_000,
        profitTarget: 9_000,
        maxDrawdown: 4_500,
        monthlyFee: 379,
    },
] as const;

type AfZeroSize = (typeof ZERO_SIZES)[number];
type AfAdvancedSize = (typeof ADVANCED_SIZES)[number];
type AfPremiumSize = (typeof PREMIUM_SIZES)[number];
type AfExpressSize = (typeof EXPRESS_SIZES)[number];

function buildZeroPlan(size: AfZeroSize): PlanInit {
    return {
        id: {
            firm: FirmId.AlphaFutures,
            accountSize: size.accountSize,
            variant: 'zero',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Zero`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 1,
        dailyLossLimit: size.dailyLossLimit,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('funded', 0.4),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: 0,
            activation: 0,
            monthlySubscription: size.monthlyFee,
            reset: Math.round(size.monthlyFee * 0.9),
        },
        minPayoutProfit: 200,
        minDaysAfterPassForPayout: 5,
    };
}

function buildExpressPlan(size: AfExpressSize): PlanInit {
    return {
        id: {
            firm: FirmId.AlphaFutures,
            accountSize: size.accountSize,
            variant: 'express',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Premium Express`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 2,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('eval', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: 0,
            activation: 0,
            monthlySubscription: size.monthlyFee,
            reset: Math.round(size.monthlyFee * 0.9),
        },
        minPayoutProfit: 500,
        minDaysAfterPassForPayout: 5,
    };
}

function buildPremiumPlan(size: AfPremiumSize): PlanInit {
    return {
        id: {
            firm: FirmId.AlphaFutures,
            accountSize: size.accountSize,
            variant: 'premium',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Premium`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 2,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('eval', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: 0,
            activation: 149,
            monthlySubscription: size.monthlyFee,
            reset: Math.round(size.monthlyFee * 0.9),
        },
        minPayoutProfit: 500,
        minDaysAfterPassForPayout: 5,
    };
}

function buildAdvancedPlan(size: AfAdvancedSize): PlanInit {
    return {
        id: {
            firm: FirmId.AlphaFutures,
            accountSize: size.accountSize,
            variant: 'advanced',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Advanced`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 2,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('eval', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: 0,
            activation: 149,
            monthlySubscription: size.monthlyFee,
            reset: Math.round(size.monthlyFee * 0.9),
        },
        minPayoutProfit: 1_000,
        minDaysAfterPassForPayout: 5,
    };
}

export class AlphaFutures extends PropFirm {
    readonly id = FirmId.AlphaFutures;
    readonly displayName = 'Alpha Futures';
    readonly website = 'https://alpha-futures.com';
    readonly plans = [
        ...ZERO_SIZES.map((s) => new AlphaFuturesPlan(buildZeroPlan(s))),
        ...PREMIUM_SIZES.map((s) => new AlphaFuturesPlan(buildPremiumPlan(s))),
        ...EXPRESS_SIZES.map((s) => new AlphaFuturesPlan(buildExpressPlan(s))),
        ...ADVANCED_SIZES.map(
            (s) => new AlphaFuturesPlan(buildAdvancedPlan(s)),
        ),
    ] as readonly Plan[];

    maxFundedAccounts(plan: Plan): number {
        const allocationCap = 450_000;
        const hardCap = 5;
        const byAllocation = Math.floor(allocationCap / plan.accountSize);
        return Math.max(1, Math.min(hardCap, byAllocation));
    }
}
