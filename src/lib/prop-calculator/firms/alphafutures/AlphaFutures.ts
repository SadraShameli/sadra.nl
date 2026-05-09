import {
    ConsistencyRule,
    EodTrailingDrawdown,
    FirmId,
    Plan,
    type PlanInit,
    PropFirm,
} from '../../core';

class AlphaFuturesPlan extends Plan {}

interface AfSize {
    accountSize: number;
    profitTarget: number;
    maxDrawdown: number;
    monthlyFee: number;
}

const ZERO_SIZES: readonly AfSize[] = [
    { accountSize: 25_000, profitTarget: 1_500, maxDrawdown: 1_000, monthlyFee: 79 },
    { accountSize: 50_000, profitTarget: 3_000, maxDrawdown: 2_000, monthlyFee: 119 },
    { accountSize: 100_000, profitTarget: 6_000, maxDrawdown: 3_000, monthlyFee: 239 },
] as const;

const ADVANCED_SIZES: readonly AfSize[] = [
    { accountSize: 50_000, profitTarget: 4_000, maxDrawdown: 1_750, monthlyFee: 139 },
    { accountSize: 100_000, profitTarget: 8_000, maxDrawdown: 3_500, monthlyFee: 279 },
    { accountSize: 150_000, profitTarget: 12_000, maxDrawdown: 5_250, monthlyFee: 419 },
] as const;

function buildZeroPlan(size: AfSize): PlanInit {
    return {
        id: `alphafutures-zero-${size.accountSize}`,
        label: `$${(size.accountSize / 1_000).toFixed(0)}K — Zero`,
        accountSize: size.accountSize,
        profitTarget: size.profitTarget,
        minTradingDays: 1,
        dailyLossLimit: null,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: (start) => start,
            },
        }),
        consistency: new ConsistencyRule('funded', 0.4),
        payoutTiers: [{ thresholdProfit: 0, traderShare: 0.9 }],
        payoutSchedule: { kind: 'daily' },
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

function buildAdvancedPlan(size: AfSize): PlanInit {
    return {
        id: `alphafutures-advanced-${size.accountSize}`,
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
        payoutSchedule: { kind: 'daily' },
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
        ...ADVANCED_SIZES.map((s) => new AlphaFuturesPlan(buildAdvancedPlan(s))),
    ] as readonly Plan[];

    maxFundedAccounts(plan: Plan): number {
        return plan.id.includes('advanced') ? 3 : 5;
    }
}
