import {
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    type Dollars,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    LucidVariant,
    Plan,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const PROFIT_TARGET_RATIO = 0.06;

class LucidPlan extends Plan {}

const FLEX_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 140,
        maxDrawdown: dollars(2000),
        resetFee: 95,
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: dollars(50_000),
        dailyLossLimit: dollars(1200) as Dollars | null,
        evalCost: 185,
        maxDrawdown: dollars(2000),
        resetFee: 120,
    },
] as const;

const DIRECT_SIZES = [
    { accountSize: dollars(50_000), evalCost: 520, maxDrawdown: dollars(2000) },
] as const;

type LucidDirectSize = (typeof DIRECT_SIZES)[number];
type LucidFlexSize = (typeof FLEX_SIZES)[number];
type LucidProSize = (typeof PRO_SIZES)[number];

export class LucidTrading extends TradingFirm {
    readonly displayName = 'Lucid Trading';
    readonly id = FirmId.Lucid;
    readonly plans = [
        ...FLEX_SIZES.map((s) => new LucidPlan(buildFlexPlan(s))),
        ...PRO_SIZES.map((s) => new LucidPlan(buildProPlan(s))),
        ...DIRECT_SIZES.map((s) => new LucidPlan(buildDirectPlan(s))),
    ];
    readonly website = 'https://lucidtrading.com';
}

const MAX_FUNDED_ACCOUNTS = 5;

function buildDirectPlan(size: LucidDirectSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.2),
        ),
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
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.evalCost),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Direct,
        },
        label: planLabel(size.accountSize, 'LucidDirect'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(500),
        minTradingDays: 0,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: dollars(0),
    };
}

function buildFlexPlan(size: LucidFlexSize): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
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
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Flex,
        },
        label: planLabel(size.accountSize, 'LucidFlex'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(500),
        minTradingDays: 2,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}

function buildProPlan(size: LucidProSize): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
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
        evalDailyLossLimit:
            size.dailyLossLimit === null
                ? { kind: DailyLossLimitKind.None }
                : {
                      amount: size.dailyLossLimit,
                      kind: DailyLossLimitKind.Flat,
                  },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Pro,
        },
        label: planLabel(size.accountSize, 'LucidPro'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 3,
        minPayoutProfit: dollars(500),
        minTradingDays: 1,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}
