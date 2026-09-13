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
const INACTIVITY_CLOSURE_DAYS = 30;

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
    readonly notes = [
        "Pro's minPayoutRequest is set explicitly to match its own payoutLadder.minRequestAmount ($500), rather than left to silently inherit minPayoutProfit's value by coincidence (currently also $500). Closes the same fallback-chain bug shape confirmed and fixed for Take Profit Trader before an unrelated future change to minPayoutProfit could silently desync it.",
        "Flex's minPayoutProfit and minPayoutProfitPerCycle are both set explicitly to $0.01: support.lucidtrading.com's LucidFlex Payouts article requires positive net profit (even $1) during each payout cycle with no first-vs-subsequent distinction ('Net Profit in Payout Cycle... during each payout cycle'), so the first payout must clear the same $0.01 floor as every later one rather than silently defaulting to $0. Pro's minPayoutProfitPerCycle is set to $500 (50K tier), matching Pro's own minPayoutProfit: support.lucidtrading.com's LucidPro Payouts article publishes a 'Minimum Profit Goal' table ($250/$500/$750/$1,000 for the 25K/50K/100K/150K tiers) stating 'This profit goal resets after each payout,' confirming the requirement recurs identically for every cycle, not only the first.",
        "support.lucidtrading.com's Inactivity Policy article states accounts across LucidPro, LucidFlex, and LucidDirect are deemed abandoned and permanently deleted after 30 calendar days with no trade resulting in at least $1 of net profit or loss. This was previously unmodeled for all three Lucid plans (maxConsecutiveIdleDays was left unset); now set to 30 for all three, matching the mechanism already used for E8 Futures/MyFundedFutures/FundedNext/TopStep.",
    ];
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
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
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
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(0.01),
        minPayoutProfitPerCycle: dollars(0.01),
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
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(500),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(500),
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
