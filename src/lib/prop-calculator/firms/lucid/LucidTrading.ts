import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanInit,
    PropFirm,
} from '../../core';

class LucidPlan extends Plan {}

const FLEX_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 100,
        resetFee: 60,
        maxDrawdown: 1_000,
    },
    {
        accountSize: 50_000,
        evalCost: 140,
        resetFee: 95,
        maxDrawdown: 2_000,
    },
    {
        accountSize: 100_000,
        evalCost: 225,
        resetFee: 140,
        maxDrawdown: 3_000,
    },
    {
        accountSize: 150_000,
        evalCost: 420,
        resetFee: 280,
        maxDrawdown: 4_500,
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 135,
        resetFee: 90,
        maxDrawdown: 1_000,
        dailyLossLimit: null as number | null,
    },
    {
        accountSize: 50_000,
        evalCost: 185,
        resetFee: 120,
        maxDrawdown: 2_000,
        dailyLossLimit: 1_200 as number | null,
    },
    {
        accountSize: 100_000,
        evalCost: 285,
        resetFee: 180,
        maxDrawdown: 3_000,
        dailyLossLimit: 1_800 as number | null,
    },
    {
        accountSize: 150_000,
        evalCost: 370,
        resetFee: 245,
        maxDrawdown: 4_500,
        dailyLossLimit: 2_700 as number | null,
    },
] as const;

const DIRECT_SIZES = [
    { accountSize: 25_000, evalCost: 340, maxDrawdown: 1_000 },
    { accountSize: 50_000, evalCost: 520, maxDrawdown: 2_000 },
    { accountSize: 100_000, evalCost: 700, maxDrawdown: 3_500 },
    { accountSize: 150_000, evalCost: 840, maxDrawdown: 5_000 },
] as const;

type LucidFlexSize = (typeof FLEX_SIZES)[number];
type LucidProSize = (typeof PRO_SIZES)[number];
type LucidDirectSize = (typeof DIRECT_SIZES)[number];

function buildFlexPlan(size: LucidFlexSize): PlanInit {
    const profitTarget = size.accountSize * 0.06;
    return {
        id: {
            firm: FirmId.Lucid,
            accountSize: size.accountSize,
            variant: 'flex',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — LucidFlex`,
        accountSize: size.accountSize,
        profitTarget,
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
            oneTimeEval: size.evalCost,
            activation: 0,
            monthlySubscription: 0,
            reset: size.resetFee,
        },
        minPayoutProfit: 500,
        minDaysAfterPassForPayout: 5,
    };
}

function buildProPlan(size: LucidProSize): PlanInit {
    const profitTarget = size.accountSize * 0.06;
    return {
        id: {
            firm: FirmId.Lucid,
            accountSize: size.accountSize,
            variant: 'pro',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — LucidPro`,
        accountSize: size.accountSize,
        profitTarget,
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
        payoutSchedule: { kind: 'per-cycle', days: 3 },
        fees: {
            oneTimeEval: size.evalCost,
            activation: 0,
            monthlySubscription: 0,
            reset: size.resetFee,
        },
        minPayoutProfit: 500,
        minDaysAfterPassForPayout: 3,
    };
}

function buildDirectPlan(size: LucidDirectSize): PlanInit {
    return {
        id: {
            firm: FirmId.Lucid,
            accountSize: size.accountSize,
            variant: 'direct',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — LucidDirect`,
        accountSize: size.accountSize,
        profitTarget: 0,
        minTradingDays: 0,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
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
        minPayoutProfit: 500,
        minDaysAfterPassForPayout: 5,
    };
}

export class LucidTrading extends PropFirm {
    readonly id = FirmId.Lucid;
    readonly displayName = 'Lucid Trading';
    readonly website = 'https://lucidtrading.com';
    readonly plans = [
        ...FLEX_SIZES.map((s) => new LucidPlan(buildFlexPlan(s))),
        ...PRO_SIZES.map((s) => new LucidPlan(buildProPlan(s))),
        ...DIRECT_SIZES.map((s) => new LucidPlan(buildDirectPlan(s))),
    ] as readonly Plan[];

    maxFundedAccounts(): number {
        return 5;
    }
}
