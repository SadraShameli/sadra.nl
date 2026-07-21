import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    IntradayTrailingDrawdown,
    Plan,
    type PlanId,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

class MffuPlan extends Plan {}

const LOCK = (start: number) => start + 100;

const RAPID_SIZES = [
    {
        accountSize: 25_000,
        maxDrawdown: 1000,
        minPayoutProfit: 1100,
        monthlyFee: 109,
        profitTarget: 1500,
    },
    {
        accountSize: 50_000,
        maxDrawdown: 2000,
        minPayoutProfit: 2100,
        monthlyFee: 157,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        maxDrawdown: 3000,
        minPayoutProfit: 3100,
        monthlyFee: 267,
        profitTarget: 6000,
    },
    {
        accountSize: 150_000,
        maxDrawdown: 4500,
        minPayoutProfit: 4600,
        monthlyFee: 347,
        profitTarget: 9000,
    },
] as const;

const FLEX_SIZES = [
    {
        accountSize: 25_000,
        maxDrawdown: 1000,
        monthlyFee: 84,
        profitTarget: 1500,
    },
    {
        accountSize: 50_000,
        maxDrawdown: 2000,
        monthlyFee: 127,
        profitTarget: 3000,
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: 50_000,
        maxDrawdown: 2000,
        minPayoutProfit: 2100,
        monthlyFee: 227,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        maxDrawdown: 3000,
        minPayoutProfit: 3100,
        monthlyFee: 344,
        profitTarget: 6000,
    },
    {
        accountSize: 150_000,
        maxDrawdown: 4500,
        minPayoutProfit: 4600,
        monthlyFee: 477,
        profitTarget: 9000,
    },
] as const;

type MffuFlexSize = (typeof FLEX_SIZES)[number];
type MffuProSize = (typeof PRO_SIZES)[number];
type MffuRapidSize = (typeof RAPID_SIZES)[number];

export class MyFundedFutures extends TradingFirm {
    readonly displayName = 'My Funded Futures';
    readonly id = FirmId.Mffu;
    readonly plans = [
        ...RAPID_SIZES.map((s) => new MffuPlan(buildRapidPlan(s))),
        ...FLEX_SIZES.map((s) => new MffuPlan(buildFlexPlan(s))),
        ...PRO_SIZES.map((s) => new MffuPlan(buildProPlan(s))),
        new MffuPlan(buildBuilderPlan()),
    ] as readonly Plan[];
    readonly website = 'https://myfundedfutures.com';

    maxFundedAccounts(plan: Plan): number {
        const id = plan.id as Extract<PlanId, { firm: FirmId.Mffu }>;
        if (id.variant === 'builder') return 1;
        if (id.variant === 'flex') return 3;
        if (id.variant === 'pro' && plan.accountSize >= 100_000) return 3;
        return 5;
    }
}

function buildBuilderPlan(): PlanInit {
    return {
        accountSize: 50_000,
        consistency: new ConsistencyRule('funded', 0.5),
        dailyLossLimit: 1000,
        drawdown: new EodTrailingDrawdown({
            amount: 2000,
            lock: { atProfit: 2100, lockedThreshold: LOCK },
        }),
        fees: {
            activation: 0,
            monthlySubscription: 0,
            oneTimeEval: 153,
            reset: 0,
        },
        id: { accountSize: 50_000, firm: FirmId.Mffu, variant: 'builder' },
        label: '$50K — Builder',
        minDaysAfterPassForPayout: 2,
        minPayoutProfit: 500,
        minTradingDays: 1,
        payoutSchedule: { days: 2, kind: 'per-cycle' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        profitTarget: 3000,
    };
}

function buildFlexPlan(size: MffuFlexSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: { atProfit: size.maxDrawdown + 100, lockedThreshold: LOCK },
        }),
        fees: {
            activation: 0,
            monthlySubscription: size.monthlyFee,
            oneTimeEval: 0,
            reset: size.monthlyFee,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.Mffu,
            variant: 'flex',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Flex`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: 250,
        minTradingDays: 2,
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        profitTarget: size.profitTarget,
    };
}

function buildProPlan(size: MffuProSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: { atProfit: size.maxDrawdown + 100, lockedThreshold: LOCK },
        }),
        fees: {
            activation: 0,
            monthlySubscription: size.monthlyFee,
            oneTimeEval: 0,
            reset: size.monthlyFee,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.Mffu,
            variant: 'pro',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Pro`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 2,
        payoutSchedule: { kind: 'biweekly' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        profitTarget: size.profitTarget,
    };
}

function buildRapidPlan(size: MffuRapidSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        dailyLossLimit: null,
        drawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: { atProfit: size.maxDrawdown + 100, lockedThreshold: LOCK },
        }),
        fees: {
            activation: 0,
            monthlySubscription: size.monthlyFee,
            oneTimeEval: 0,
            reset: size.monthlyFee,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.Mffu,
            variant: 'rapid',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Rapid`,
        minDaysAfterPassForPayout: 3,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 2,
        payoutSchedule: { kind: 'daily' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget: size.profitTarget,
    };
}
