import {
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    PayoutBuffer,
    PayoutFloorEffect,
    type PlanInit,
    TradeifyVariant,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const PROFIT_TARGET_RATIO = 0.06;
const LOCK_OFFSET = 100;
const SELECT_RESET_FEE = 109;

const CONTRACT_LIMITS = {
    evalMicros: contracts(40),
    evalMinis: contracts(4),
    fundedMicros: {
        kind: ContractLimitKind.Flat,
        maxContracts: contracts(40),
    },
    fundedMinis: {
        kind: ContractLimitKind.Flat,
        maxContracts: contracts(4),
    },
} as const;

const SCALING_FUNDED_DLL: DailyLossLimitConfig = {
    kind: DailyLossLimitKind.Tiered,
    tiers: [
        {
            dailyLossLimit: dollars(1250),
            maxContracts: contracts(4),
            minProfit: 0,
        },
        {
            dailyLossLimit: dollars(2000),
            maxContracts: contracts(4),
            minProfit: 3000,
        },
    ],
};

const GROWTH_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 145,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(3000),
        resetFee: 95,
    },
] as const;

const SELECT_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 165,
        maxDrawdown: dollars(2000),
        resetFee: SELECT_RESET_FEE,
    },
] as const;

const LIGHTNING_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 492,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(3000),
        resetFee: 492,
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
        ...SELECT_SIZES.map((s) => this.buildPlan(buildSelectFlexPlan(s))),
        ...SELECT_SIZES.map((s) => this.buildPlan(buildSelectDailyPlan(s))),
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
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: {
            amount: dollars(1250),
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        fundedDailyLossLimit: SCALING_FUNDED_DLL,
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Growth,
        },
        label: planLabel(size.accountSize, 'Growth'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(500),
        minQualifyingDayProfit: dollars(150),
        minTradingDays: 1,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutLadder: {
            capsAtLastStep: true,
            minRequestAmount: 500,
            steps: [1500, 2000, 2500, 3000],
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}

function buildLightningPlan(size: TradeifyLightningSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: null,
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: SCALING_FUNDED_DLL,
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.evalCost),
        },
        fundedConsistencyLadder: {
            steps: [fraction(0.2), fraction(0.25), fraction(0.3)],
        },
        fundedDailyLossLimit: SCALING_FUNDED_DLL,
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Lightning,
        },
        isInstantFunded: true,
        label: planLabel(size.accountSize, 'Lightning Funded'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: size.minPayoutProfit,
        minPayoutProfitPerCycle: dollars(2000),
        minTradingDays: 0,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutLadder: {
            capsAtLastStep: true,
            minRequestAmount: 1000,
            steps: [2000, 2000, 2000, 2500],
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: dollars(0),
    };
}

function buildSelectDailyPlan(size: TradeifySelectSize): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        fundedDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectDaily,
        },
        label: planLabel(size.accountSize, 'Select Daily'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0.01),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(250),
        minTradingDays: 3,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutProfitShare: fraction(2),
        payoutRequestCap: dollars(1250),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}

function buildSelectFlexPlan(size: TradeifySelectSize): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectFlex,
        },
        label: planLabel(size.accountSize, 'Select Flex'),
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(0.01),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(250),
        minQualifyingDayProfit: dollars(150),
        minTradingDays: 3,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutProfitShare: fraction(0.5),
        payoutRequestCap: dollars(2500),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}
