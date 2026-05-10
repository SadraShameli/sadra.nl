import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    IntradayTrailingDrawdown,
    Plan,
    type PlanId,
    type PlanInit,
    PropFirm,
} from '../../core';

class MffuPlan extends Plan {}

const LOCK = (start: number) => start + 100;

const RAPID_SIZES = [
    {
        accountSize: 25_000,
        monthlyFee: 109,
        profitTarget: 1_500,
        maxDrawdown: 1_000,
        minPayoutProfit: 1_100,
    },
    {
        accountSize: 50_000,
        monthlyFee: 157,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
        minPayoutProfit: 2_100,
    },
    {
        accountSize: 100_000,
        monthlyFee: 267,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
        minPayoutProfit: 3_100,
    },
    {
        accountSize: 150_000,
        monthlyFee: 347,
        profitTarget: 9_000,
        maxDrawdown: 4_500,
        minPayoutProfit: 4_600,
    },
] as const;

const FLEX_SIZES = [
    {
        accountSize: 25_000,
        monthlyFee: 84,
        profitTarget: 1_500,
        maxDrawdown: 1_000,
    },
    {
        accountSize: 50_000,
        monthlyFee: 127,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: 50_000,
        monthlyFee: 227,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
        minPayoutProfit: 2_100,
    },
    {
        accountSize: 100_000,
        monthlyFee: 344,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
        minPayoutProfit: 3_100,
    },
    {
        accountSize: 150_000,
        monthlyFee: 477,
        profitTarget: 9_000,
        maxDrawdown: 4_500,
        minPayoutProfit: 4_600,
    },
] as const;

type MffuRapidSize = (typeof RAPID_SIZES)[number];
type MffuFlexSize = (typeof FLEX_SIZES)[number];
type MffuProSize = (typeof PRO_SIZES)[number];

function buildRapidPlan(size: MffuRapidSize): PlanInit {
    return {
        id: {
            firm: FirmId.Mffu,
            accountSize: size.accountSize,
            variant: 'rapid',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Rapid`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 2,
        dailyLossLimit: null,
        drawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: { atProfit: size.maxDrawdown + 100, lockedThreshold: LOCK },
        }),
        consistency: new ConsistencyRule('eval', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'daily' },
        fees: {
            oneTimeEval: 0,
            activation: 0,
            monthlySubscription: size.monthlyFee,
            reset: size.monthlyFee,
        },
        minPayoutProfit: size.minPayoutProfit,
        minDaysAfterPassForPayout: 3,
    };
}

function buildFlexPlan(size: MffuFlexSize): PlanInit {
    return {
        id: {
            firm: FirmId.Mffu,
            accountSize: size.accountSize,
            variant: 'flex',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Flex`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 2,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: { atProfit: size.maxDrawdown + 100, lockedThreshold: LOCK },
        }),
        consistency: new ConsistencyRule('eval', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        fees: {
            oneTimeEval: 0,
            activation: 0,
            monthlySubscription: size.monthlyFee,
            reset: size.monthlyFee,
        },
        minPayoutProfit: 250,
        minDaysAfterPassForPayout: 5,
    };
}

function buildProPlan(size: MffuProSize): PlanInit {
    return {
        id: {
            firm: FirmId.Mffu,
            accountSize: size.accountSize,
            variant: 'pro',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Pro`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 2,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: { atProfit: size.maxDrawdown + 100, lockedThreshold: LOCK },
        }),
        consistency: new ConsistencyRule('eval', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        payoutSchedule: { kind: 'biweekly' },
        fees: {
            oneTimeEval: 0,
            activation: 0,
            monthlySubscription: size.monthlyFee,
            reset: size.monthlyFee,
        },
        minPayoutProfit: size.minPayoutProfit,
        minDaysAfterPassForPayout: 5,
    };
}

function buildBuilderPlan(): PlanInit {
    return {
        id: { firm: FirmId.Mffu, accountSize: 50_000, variant: 'builder' },
        label: '$50K — Builder',
        accountSize: 50_000,
        profitTarget: 3_000,
        minTradingDays: 1,
        dailyLossLimit: 1_000,
        drawdown: new EodTrailingDrawdown({
            amount: 2_000,
            lock: { atProfit: 2_100, lockedThreshold: LOCK },
        }),
        consistency: new ConsistencyRule('funded', 0.5),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        payoutSchedule: { kind: 'per-cycle', days: 2 },
        fees: {
            oneTimeEval: 153,
            activation: 0,
            monthlySubscription: 0,
            reset: 0,
        },
        minPayoutProfit: 500,
        minDaysAfterPassForPayout: 2,
    };
}

export class MyFundedFutures extends PropFirm {
    readonly id = FirmId.Mffu;
    readonly displayName = 'My Funded Futures';
    readonly website = 'https://myfundedfutures.com';
    readonly plans = [
        ...RAPID_SIZES.map((s) => new MffuPlan(buildRapidPlan(s))),
        ...FLEX_SIZES.map((s) => new MffuPlan(buildFlexPlan(s))),
        ...PRO_SIZES.map((s) => new MffuPlan(buildProPlan(s))),
        new MffuPlan(buildBuilderPlan()),
    ] as readonly Plan[];

    maxFundedAccounts(plan: Plan): number {
        const id = plan.id as Extract<PlanId, { firm: FirmId.Mffu }>;
        if (id.variant === 'builder') return 1;
        if (id.variant === 'flex') return 3;
        if (id.variant === 'pro' && plan.accountSize >= 100_000) return 3;
        return 5;
    }
}
