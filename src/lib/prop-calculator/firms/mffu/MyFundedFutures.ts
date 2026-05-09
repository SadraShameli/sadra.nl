import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanId,
    type PlanInit,
    PropFirm,
} from '../../core';

class MffuPlan extends Plan {}

interface MffuSize {
    accountSize: number;
    monthlyFee: number;
    profitTarget: number;
    maxDrawdown: number;
}

const LOCK = (start: number) => start + 100;

const RAPID_SIZES: readonly MffuSize[] = [
    {
        accountSize: 25_000,
        monthlyFee: 109,
        profitTarget: 1_500,
        maxDrawdown: 1_000,
    },
    {
        accountSize: 50_000,
        monthlyFee: 157,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
    },
    {
        accountSize: 100_000,
        monthlyFee: 267,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
    },
    {
        accountSize: 150_000,
        monthlyFee: 347,
        profitTarget: 9_000,
        maxDrawdown: 4_500,
    },
] as const;

const FLEX_SIZES: readonly MffuSize[] = [
    {
        accountSize: 25_000,
        monthlyFee: 84,
        profitTarget: 1_500,
        maxDrawdown: 1_000,
    },
    {
        accountSize: 50_000,
        monthlyFee: 107,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
    },
] as const;

const PRO_SIZES: readonly MffuSize[] = [
    {
        accountSize: 50_000,
        monthlyFee: 227,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
    },
    {
        accountSize: 100_000,
        monthlyFee: 344,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
    },
    {
        accountSize: 150_000,
        monthlyFee: 477,
        profitTarget: 9_000,
        maxDrawdown: 4_500,
    },
] as const;

function buildRapidPlan(size: MffuSize): PlanInit {
    return {
        id: `mffu-rapid-${size.accountSize}` as PlanId,
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Rapid`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 2,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
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
        minPayoutProfit: 500,
        minDaysAfterPassForPayout: 3,
    };
}

function buildFlexPlan(size: MffuSize): PlanInit {
    return {
        id: `mffu-flex-${size.accountSize}` as PlanId,
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

function buildProPlan(size: MffuSize): PlanInit {
    return {
        id: `mffu-pro-${size.accountSize}` as PlanId,
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
        minPayoutProfit: 1_000,
        minDaysAfterPassForPayout: 5,
    };
}

function buildBuilderPlan(): PlanInit {
    return {
        id: 'mffu-builder-50000' as PlanId,
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
        if (plan.id.includes('builder')) return 1;
        if (plan.id.includes('flex')) return 3;
        if (plan.id.includes('pro') && plan.accountSize >= 100_000) return 3;
        return 5;
    }
}
