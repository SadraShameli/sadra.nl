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
        evalCost: 109,
        maxDrawdown: 1000,
        minPayoutProfit: 1100,
        profitTarget: 1500,
    },
    {
        accountSize: 50_000,
        evalCost: 157,
        maxDrawdown: 2000,
        minPayoutProfit: 2100,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        evalCost: 267,
        maxDrawdown: 3000,
        minPayoutProfit: 3100,
        profitTarget: 6000,
    },
    {
        accountSize: 150_000,
        evalCost: 347,
        maxDrawdown: 4500,
        minPayoutProfit: 4600,
        profitTarget: 9000,
    },
] as const;

const FLEX_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 84,
        maxDrawdown: 1000,
        minPayoutProfit: 250,
        minQualifyingDayProfit: 100,
        payoutCap: 1000,
        profitTarget: 1500,
    },
    {
        accountSize: 50_000,
        evalCost: 127,
        maxDrawdown: 2000,
        minPayoutProfit: 500,
        minQualifyingDayProfit: 150,
        payoutCap: 2000,
        profitTarget: 3000,
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: 50_000,
        evalCost: 227,
        maxDrawdown: 2000,
        minPayoutProfit: 2100,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        evalCost: 344,
        maxDrawdown: 3000,
        minPayoutProfit: 3100,
        profitTarget: 6000,
    },
    {
        accountSize: 150_000,
        evalCost: 477,
        maxDrawdown: 4500,
        minPayoutProfit: 4600,
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
        new MffuPlan(buildRapidEodPlan()),
        ...FLEX_SIZES.map((s) => new MffuPlan(buildFlexPlan(s))),
        ...PRO_SIZES.map((s) => new MffuPlan(buildProPlan(s))),
        new MffuPlan(buildBuilderPlan()),
    ] as readonly Plan[];
    readonly website = 'https://myfundedfutures.com';

    maxFundedAccounts(plan: Plan): number {
        const id = plan.id as Extract<PlanId, { firm: FirmId.Mffu }>;
        if (id.variant === 'builder') return 1;
        if (id.variant === 'flex' && plan.accountSize === 50_000) return 3;
        if (id.variant === 'pro' && plan.accountSize >= 100_000) return 3;
        return 5;
    }
}

function buildBuilderPlan(): PlanInit {
    return {
        accountSize: 50_000,
        consistency: new ConsistencyRule('funded', 0.5),
        drawdown: new EodTrailingDrawdown({
            amount: 2000,
            lock: { atProfit: 2100, lockedThreshold: LOCK },
        }),
        evalDailyLossLimit: { amount: 1000, kind: 'flat' },
        fees: {
            activation: 0,
            monthlySubscription: 0,
            oneTimeEval: 153,
            reset: 0,
        },
        id: { accountSize: 50_000, firm: FirmId.Mffu, variant: 'builder' },
        label: '$50K — Builder',
        minDaysAfterPassForPayout: 2,
        minPayoutProfit: 2600,
        minTradingDays: 1,
        payoutLadder: {
            minRequestAmount: 500,
            steps: [2000, 2000, 2000, 2000, 2000],
        },
        payoutSchedule: { days: 2, kind: 'per-cycle' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        profitTarget: 3000,
    };
}

function buildFlexPlan(size: MffuFlexSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: { atProfit: size.maxDrawdown + 100, lockedThreshold: LOCK },
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
            firm: FirmId.Mffu,
            variant: 'flex',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Flex`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minQualifyingDayProfit: size.minQualifyingDayProfit,
        minTradingDays: 2,
        payoutLadder: {
            minRequestAmount: size.minPayoutProfit,
            steps: [
                size.payoutCap,
                size.payoutCap,
                size.payoutCap,
                size.payoutCap,
                size.payoutCap,
            ],
        },
        payoutSchedule: { kind: 'every-n-win-days', n: 5 },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        profitTarget: size.profitTarget,
    };
}

function buildProPlan(size: MffuProSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: { atProfit: size.maxDrawdown + 100, lockedThreshold: LOCK },
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
            firm: FirmId.Mffu,
            variant: 'pro',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Pro`,
        minDaysAfterPassForPayout: 10,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 2,
        payoutSchedule: { kind: 'biweekly' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        profitTarget: size.profitTarget,
    };
}

function buildRapidEodPlan(): PlanInit {
    const maxDrawdown = 2000;
    return {
        accountSize: 50_000,
        consistency: new ConsistencyRule('eval', 0.3),
        drawdown: new EodTrailingDrawdown({
            amount: maxDrawdown,
            lock: { atProfit: maxDrawdown + 100, lockedThreshold: LOCK },
        }),
        evalDailyLossLimit: { kind: 'none' },
        fees: {
            activation: 0,
            monthlySubscription: 0,
            oneTimeEval: 157,
            reset: 157,
        },
        id: { accountSize: 50_000, firm: FirmId.Mffu, variant: 'rapid-eod' },
        label: '$50K — Rapid EOD',
        minDaysAfterPassForPayout: 3,
        minPayoutProfit: maxDrawdown + 100,
        minTradingDays: 4,
        payoutSchedule: { kind: 'daily' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        profitTarget: 3000,
    };
}

function buildRapidPlan(size: MffuRapidSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.5),
        drawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: { atProfit: size.maxDrawdown + 100, lockedThreshold: LOCK },
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
