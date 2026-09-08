import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

class LucidPlan extends Plan {}

const FLEX_SIZES = [
    {
        accountSize: 50_000,
        evalCost: 140,
        maxDrawdown: 2000,
        resetFee: 95,
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: 50_000,
        dailyLossLimit: 1200 as null | number,
        evalCost: 185,
        maxDrawdown: 2000,
        resetFee: 120,
    },
] as const;

const DIRECT_SIZES = [
    { accountSize: 50_000, evalCost: 520, maxDrawdown: 2000 },
] as const;

type LucidDirectSize = (typeof DIRECT_SIZES)[number];
type LucidFlexSize = (typeof FLEX_SIZES)[number];
type LucidProSize = (typeof PRO_SIZES)[number];

export class LucidTrading extends TradingFirm {
    readonly displayName = 'Lucid Trading';
    readonly id = FirmId.Lucid;
    readonly plans = [
        ...FLEX_SIZES.map((s) => new LucidPlan(buildFlexPlan(s))),
        ...PRO_SIZES.map((s) => new LucidPlan(buildProPlan(s))),
        ...DIRECT_SIZES.map((s) => new LucidPlan(buildDirectPlan(s))),
    ] as readonly Plan[];
    readonly website = 'https://lucidtrading.com';

    maxFundedAccounts(): number {
        return 5;
    }
}

function buildDirectPlan(size: LucidDirectSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('funded', 0.2),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        evalDailyLossLimit: { kind: 'none' },
        fees: {
            activation: 0,
            monthlySubscription: 0,
            oneTimeEval: size.evalCost,
            reset: size.evalCost,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.Lucid,
            variant: 'direct',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — LucidDirect`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: 500,
        minTradingDays: 0,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget: 0,
    };
}

function buildFlexPlan(size: LucidFlexSize): PlanInit {
    const profitTarget = size.accountSize * 0.06;
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
            activation: 0,
            monthlySubscription: 0,
            oneTimeEval: size.evalCost,
            reset: size.resetFee,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.Lucid,
            variant: 'flex',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — LucidFlex`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: 500,
        minTradingDays: 2,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget,
    };
}

function buildProPlan(size: LucidProSize): PlanInit {
    const profitTarget = size.accountSize * 0.06;
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('funded', 0.4),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        evalDailyLossLimit:
            size.dailyLossLimit === null
                ? { kind: 'none' }
                : { amount: size.dailyLossLimit, kind: 'flat' },
        fees: {
            activation: 0,
            monthlySubscription: 0,
            oneTimeEval: size.evalCost,
            reset: size.resetFee,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.Lucid,
            variant: 'pro',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — LucidPro`,
        minDaysAfterPassForPayout: 3,
        minPayoutProfit: 500,
        minTradingDays: 1,
        payoutSchedule: { days: 3, kind: 'per-cycle' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget,
    };
}
