import {
    ConsistencyRule,
    ConsistencyScope,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    type Dollars,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    LucidVariant,
    PayoutBuffer,
    PayoutFloorEffect,
    type PlanInit,
    profitShareMultiplier,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const PROFIT_TARGET_RATIO = 0.06;
const LOCK_OFFSET = 100;
const FIXED_DLL = dollars(1200);
const SCALING_DLL_SHARE = 0.6;

function scalingDllAfterTrail(fixedDll: Dollars): DailyLossLimitConfig {
    return {
        afterLock: {
            kind: DailyLossLimitKind.PeakProfitShare,
            share: fraction(SCALING_DLL_SHARE),
        },
        beforeLock: { amount: fixedDll, kind: DailyLossLimitKind.Flat },
        kind: DailyLossLimitKind.AfterThresholdLock,
    };
}

const FLEX_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 136,
        maxDrawdown: dollars(2000),
        resetFee: 95,
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: dollars(50_000),
        dailyLossLimit: dollars(1200) as Dollars | null,
        evalCost: 172,
        maxDrawdown: dollars(2000),
        resetFee: 120,
    },
] as const;

const DIRECT_SIZES = [
    { accountSize: dollars(50_000), evalCost: 515, maxDrawdown: dollars(2000) },
] as const;

type LucidDirectSize = (typeof DIRECT_SIZES)[number];
type LucidFlexSize = (typeof FLEX_SIZES)[number];
type LucidProSize = (typeof PRO_SIZES)[number];

export class LucidTrading extends TradingFirm {
    readonly displayName = 'Lucid Trading';
    readonly id = FirmId.Lucid;
    readonly plans = [
        ...FLEX_SIZES.map((s) => this.buildPlan(buildFlexPlan(s))),
        ...PRO_SIZES.map((s) => this.buildPlan(buildProPlan(s))),
        ...DIRECT_SIZES.map((s) => this.buildPlan(buildDirectPlan(s))),
    ];
    readonly website = 'https://lucidtrading.com';
}

const MAX_FUNDED_ACCOUNTS = 5;
const MAX_LIFETIME_PAYOUTS = 5;

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
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: {
            amount: FIXED_DLL,
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.evalCost),
        },
        fundedDailyLossLimit: scalingDllAfterTrail(FIXED_DLL),
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Direct,
        },
        isInstantFunded: true,
        label: planLabel(size.accountSize, 'LucidDirect'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(3000),
        minPayoutProfitPerCycle: dollars(2500),
        minPayoutRequest: dollars(500),
        minTradingDays: 0,
        payoutLadder: {
            minRequestAmount: dollars(500),
            steps: [2000, 2000, 2000, 2500, 2500],
        },
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
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
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
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(0),
        minPayoutRequest: dollars(500),
        minQualifyingDayProfit: dollars(150),
        minTradingDays: 2,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutProfitShare: profitShareMultiplier(0.5),
        payoutRequestCap: dollars(2000),
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
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
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
        fundedDailyLossLimit: scalingDllAfterTrail(
            size.dailyLossLimit ?? FIXED_DLL,
        ),
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Pro,
        },
        label: planLabel(size.accountSize, 'LucidPro'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(500),
        minTradingDays: 1,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
        payoutLadder: {
            capsAtLastStep: true,
            minRequestAmount: dollars(500),
            steps: [2000, 2500],
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}
