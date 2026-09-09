import {
    AlphaFuturesVariant,
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const RESET_FEE_DISCOUNT = 0.9;

const ZERO_SIZES = [
    {
        accountSize: dollars(50_000),
        dailyLossLimit: dollars(1000),
        maxDrawdown: dollars(2000),
        monthlyFee: 119,
        profitTarget: dollars(3000),
    },
] as const;

const ADVANCED_SIZES = [
    {
        accountSize: dollars(50_000),
        maxDrawdown: dollars(1750),
        monthlyFee: 139,
        profitTarget: dollars(4000),
    },
] as const;

const PREMIUM_SIZES = [
    {
        accountSize: dollars(50_000),
        maxDrawdown: dollars(2000),
        monthlyFee: 79,
        profitTarget: dollars(3000),
    },
] as const;

const EXPRESS_SIZES = [
    {
        accountSize: dollars(50_000),
        maxDrawdown: dollars(2000),
        monthlyFee: 159,
        profitTarget: dollars(3000),
    },
] as const;

type AfAdvancedSize = (typeof ADVANCED_SIZES)[number];
type AfExpressSize = (typeof EXPRESS_SIZES)[number];
type AfPremiumSize = (typeof PREMIUM_SIZES)[number];
type AfZeroSize = (typeof ZERO_SIZES)[number];

export class AlphaFutures extends TradingFirm {
    readonly displayName = 'Alpha Futures';
    readonly id = FirmId.AlphaFutures;
    readonly plans = [
        ...ZERO_SIZES.map((s) => this.buildPlan(buildZeroPlan(s))),
        ...PREMIUM_SIZES.map((s) => this.buildPlan(buildPremiumPlan(s))),
        ...EXPRESS_SIZES.map((s) => this.buildPlan(buildExpressPlan(s))),
        ...ADVANCED_SIZES.map((s) => this.buildPlan(buildAdvancedPlan(s))),
    ];
    readonly website = 'https://alpha-futures.com';
}

const ALLOCATION_CAP = 450_000;
const MAX_FUNDED_ACCOUNTS_HARD_CAP = 5;

function buildAdvancedPlan(size: AfAdvancedSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(size.monthlyFee),
            oneTimeEval: dollars(0),
            reset: dollars(Math.round(size.monthlyFee * RESET_FEE_DISCOUNT)),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Advanced,
        },
        label: planLabel(size.accountSize, 'Advanced'),
        maxFundedAccounts: maxFundedAccountsByAllocation(size.accountSize),
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(1000),
        minTradingDays: 2,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildExpressPlan(size: AfExpressSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(size.monthlyFee),
            oneTimeEval: dollars(0),
            reset: dollars(Math.round(size.monthlyFee * RESET_FEE_DISCOUNT)),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Express,
        },
        label: planLabel(size.accountSize, 'Premium Express'),
        maxFundedAccounts: maxFundedAccountsByAllocation(size.accountSize),
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(500),
        minTradingDays: 2,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildPremiumPlan(size: AfPremiumSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(149),
            monthlySubscription: dollars(size.monthlyFee),
            oneTimeEval: dollars(0),
            reset: dollars(Math.round(size.monthlyFee * RESET_FEE_DISCOUNT)),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Premium,
        },
        label: planLabel(size.accountSize, 'Premium'),
        maxFundedAccounts: maxFundedAccountsByAllocation(size.accountSize),
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(500),
        minTradingDays: 2,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildZeroPlan(size: AfZeroSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.4),
        ),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: {
            amount: size.dailyLossLimit,
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(size.monthlyFee),
            oneTimeEval: dollars(0),
            reset: dollars(Math.round(size.monthlyFee * RESET_FEE_DISCOUNT)),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Zero,
        },
        label: planLabel(size.accountSize, 'Zero'),
        maxFundedAccounts: maxFundedAccountsByAllocation(size.accountSize),
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(200),
        minTradingDays: 1,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}

function maxFundedAccountsByAllocation(accountSize: number): number {
    const byAllocation = Math.floor(ALLOCATION_CAP / accountSize);
    return Math.max(1, Math.min(MAX_FUNDED_ACCOUNTS_HARD_CAP, byAllocation));
}
