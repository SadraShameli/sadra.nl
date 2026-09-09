import {
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type PlanInit,
    TradeifyVariant,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const PROFIT_TARGET_RATIO = 0.06;
const LOCK_OFFSET = 100;

const GROWTH_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 145,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(3000),
    },
] as const;

const SELECT_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 165,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(2100),
    },
] as const;

const LIGHTNING_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 492,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(3000),
    },
] as const;

type TradeifyGrowthSize = (typeof GROWTH_SIZES)[number];
type TradeifyLightningSize = (typeof LIGHTNING_SIZES)[number];
type TradeifySelectSize = (typeof SELECT_SIZES)[number];

export class Tradeify extends TradingFirm {
    readonly displayName = 'Tradeify';
    readonly id = FirmId.Tradeify;
    readonly plans = [
        ...GROWTH_SIZES.map((s) => this.buildPlan(buildGrowthPlan(s))),
        ...SELECT_SIZES.map((s) => this.buildPlan(buildSelectPlan(s))),
        ...LIGHTNING_SIZES.map((s) => this.buildPlan(buildLightningPlan(s))),
    ];
    readonly website = 'https://tradeify.co';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildGrowthPlan(size: TradeifyGrowthSize): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.35),
        ),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(50),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Growth,
        },
        label: planLabel(size.accountSize, 'Growth'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 1,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}

function buildLightningPlan(size: TradeifyLightningSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.2),
        ),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.evalCost),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Lightning,
        },
        label: planLabel(size.accountSize, 'Lightning Funded'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 0,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: dollars(0),
    };
}

function buildSelectPlan(size: TradeifySelectSize): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(50),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Select,
        },
        label: planLabel(size.accountSize, 'Select'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minTradingDays: 3,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}
