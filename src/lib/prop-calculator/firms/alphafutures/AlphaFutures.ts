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

const ZERO_SIZES = [
    {
        accountSize: dollars(50_000),
        dailyLossLimit: dollars(1000),
        maxDrawdown: dollars(2000),
        monthlyFee: 139,
        payoutRequestCap: dollars(1500),
        profitTarget: dollars(3000),
        resetFee: 119,
    },
] as const;

const ADVANCED_SIZES = [
    {
        accountSize: dollars(50_000),
        maxDrawdown: dollars(1750),
        monthlyFee: 209,
        payoutRequestCap: dollars(15_000),
        profitTarget: dollars(4000),
        resetFee: 189,
    },
] as const;

const STANDARD_SIZES = [
    {
        accountSize: dollars(50_000),
        maxDrawdown: dollars(2000),
        monthlyFee: 129,
        payoutRequestCap: dollars(3000),
        profitTarget: dollars(3000),
        resetFee: 109,
    },
] as const;

type AfAdvancedSize = (typeof ADVANCED_SIZES)[number];
type AfStandardSize = (typeof STANDARD_SIZES)[number];
type AfZeroSize = (typeof ZERO_SIZES)[number];

export class AlphaFutures extends TradingFirm {
    readonly displayName = 'Alpha Futures';
    readonly id = FirmId.AlphaFutures;
    readonly plans = [
        ...ZERO_SIZES.map((s) => this.buildPlan(buildZeroPlan(s))),
        ...STANDARD_SIZES.map((s) => this.buildPlan(buildStandardPlan(s))),
        ...ADVANCED_SIZES.map((s) => this.buildPlan(buildAdvancedPlan(s))),
    ];
    readonly website = 'https://alpha-futures.com';
}

function buildAdvancedPlan(size: AfAdvancedSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
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
            reset: dollars(size.resetFee),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Advanced,
        },
        label: planLabel(size.accountSize, 'Advanced'),
        maxFundedAccounts: 3,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(1000),
        minQualifyingDayProfit: dollars(200),
        minTradingDays: 3,
        payoutProfitShare: fraction(0.5),
        payoutRequestCap: size.payoutRequestCap,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildStandardPlan(size: AfStandardSize): PlanInit {
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
            reset: dollars(size.resetFee),
        },
        fundedConsistency: {
            kind: 'set',
            rule: new ConsistencyRule(ConsistencyScope.Funded, fraction(0.4)),
        },
        fundedDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Standard,
        },
        label: planLabel(size.accountSize, 'Standard'),
        maxFundedAccounts: 5,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(500),
        minQualifyingDayProfit: dollars(200),
        minTradingDays: 2,
        payoutProfitShare: fraction(0.5),
        payoutRequestCap: size.payoutRequestCap,
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
            reset: dollars(size.resetFee),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Zero,
        },
        label: planLabel(size.accountSize, 'Zero'),
        maxFundedAccounts: 5,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(200),
        minQualifyingDayProfit: dollars(200),
        minTradingDays: 1,
        payoutProfitShare: fraction(0.5),
        payoutRequestCap: size.payoutRequestCap,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}
