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
        profitTarget: 1_250,
        maxDrawdown: 1_000,
        evalCost: 80,
    },
    {
        accountSize: 50_000,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
        evalCost: 150,
    },
    {
        accountSize: 100_000,
        profitTarget: 6_000,
        maxDrawdown: 3_000,
        evalCost: 250,
    },
] as const;

const RAPID_SIZES = [
    {
        accountSize: 25_000,
        profitTarget: 1_500,
        maxDrawdown: 1_000,
        evalCost: 110,
    },
    {
        accountSize: 50_000,
        profitTarget: 3_000,
        maxDrawdown: 2_000,
        evalCost: 200,
    },
    {
        accountSize: 100_000,
        profitTarget: 5_000,
        maxDrawdown: 2_500,
        evalCost: 280,
    },
] as const;

type FnLegacySize = (typeof LEGACY_SIZES)[number];
type FnRapidSize = (typeof RAPID_SIZES)[number];

function buildLegacyPlan(size: FnLegacySize): PlanInit {
    return {
        id: {
            firm: FirmId.FundedNext,
            accountSize: size.accountSize,
            variant: 'legacy',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Legacy`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 0,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('eval', 0.4),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        payoutSchedule: { kind: 'biweekly' },
        fees: {
            oneTimeEval: size.evalCost,
            activation: 0,
            monthlySubscription: 0,
            reset: Math.round(size.evalCost * 0.9),
        },
        minPayoutProfit: 250,
        minDaysAfterPassForPayout: 5,
    };
}

function buildRapidPlan(size: FnRapidSize): PlanInit {
    return {
        id: {
            firm: FirmId.FundedNext,
            accountSize: size.accountSize,
            variant: 'rapid',
        },
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Rapid`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 0,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('funded', 0.4),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.8 }],
        payoutSchedule: { kind: 'per-cycle', days: 3 },
        fees: {
            oneTimeEval: size.evalCost,
            activation: 0,
            monthlySubscription: 0,
            reset: Math.round(size.evalCost * 0.9),
        },
        minPayoutProfit: 250,
        minDaysAfterPassForPayout: 5,
    };
}

export class FundedNext extends PropFirm {
    readonly id = FirmId.FundedNext;
    readonly displayName = 'FundedNext';
    readonly website = 'https://fundednext.com';
    readonly plans = [
        ...LEGACY_SIZES.map((s) => new FundedNextPlan(buildLegacyPlan(s))),
        ...RAPID_SIZES.map((s) => new FundedNextPlan(buildRapidPlan(s))),
    ] as readonly Plan[];

    maxFundedAccounts(): number {
        return 5;
    }
}
