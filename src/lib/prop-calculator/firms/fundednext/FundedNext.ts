import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanInit,
    PropFirm,
} from '../../core';

class FundedNextPlan extends Plan {}

const LEGACY_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 80,
        maxDrawdown: 1000,
        profitTarget: 1250,
    },
    {
        accountSize: 50_000,
        evalCost: 150,
        maxDrawdown: 2000,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        evalCost: 250,
        maxDrawdown: 3000,
        profitTarget: 6000,
    },
] as const;

const RAPID_SIZES = [
    {
        accountSize: 25_000,
        evalCost: 100,
        maxDrawdown: 1000,
        minPayoutProfit: 250,
        profitTarget: 1500,
    },
    {
        accountSize: 50_000,
        evalCost: 200,
        maxDrawdown: 2000,
        minPayoutProfit: 250,
        profitTarget: 3000,
    },
    {
        accountSize: 100_000,
        evalCost: 280,
        maxDrawdown: 2500,
        minPayoutProfit: 500,
        profitTarget: 5000,
    },
] as const;

const BOLT_SIZES = [
    {
        accountSize: 50_000,
        dailyLossLimit: 1000,
        evalCost: 100,
        maxDrawdown: 2000,
        profitTarget: 3000,
        resetCost: 92,
    },
] as const;

type FnBoltSize = (typeof BOLT_SIZES)[number];
type FnLegacySize = (typeof LEGACY_SIZES)[number];
type FnRapidSize = (typeof RAPID_SIZES)[number];

export class FundedNext extends PropFirm {
    readonly displayName = 'FundedNext';
    readonly id = FirmId.FundedNext;
    readonly plans = [
        ...LEGACY_SIZES.map((s) => new FundedNextPlan(buildLegacyPlan(s))),
        ...RAPID_SIZES.map((s) => new FundedNextPlan(buildRapidPlan(s))),
        ...BOLT_SIZES.map((s) => new FundedNextPlan(buildBoltPlan(s))),
    ] as readonly Plan[];
    readonly website = 'https://fundednext.com';

    maxFundedAccounts(): number {
        return 5;
    }
}

function buildBoltPlan(size: FnBoltSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.4),
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
            monthlySubscription: 0,
            oneTimeEval: size.evalCost,
            reset: size.resetCost,
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.FundedNext,
            variant: 'bolt',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Bolt`,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: 250,
        minTradingDays: 0,
        payoutSchedule: { kind: 'daily' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        profitTarget: size.profitTarget,
    };
}

function buildLegacyPlan(size: FnLegacySize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('eval', 0.4),
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
            monthlySubscription: 0,
            oneTimeEval: size.evalCost,
            reset: Math.round(size.evalCost * 0.9),
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.FundedNext,
            variant: 'legacy',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Legacy`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: 250,
        minTradingDays: 3,
        payoutSchedule: { kind: 'biweekly' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        profitTarget: size.profitTarget,
    };
}

function buildRapidPlan(size: FnRapidSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule('funded', 0.4),
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
            monthlySubscription: 0,
            oneTimeEval: size.evalCost,
            reset: Math.round(size.evalCost * 0.9),
        },
        id: {
            accountSize: size.accountSize,
            firm: FirmId.FundedNext,
            variant: 'rapid',
        },
        label: `$${(size.accountSize / 1000).toFixed(0)}K — Rapid`,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 0,
        payoutSchedule: { days: 3, kind: 'per-cycle' },
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        profitTarget: size.profitTarget,
    };
}
