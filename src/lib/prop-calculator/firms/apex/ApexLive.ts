import {
    type ContractLimitConfig,
    ContractLimitKind,
    contracts,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    fraction,
    type LiveCushionPercent,
    LivePlan,
    TierBasis,
} from '~/lib/prop-calculator/core';
import { lockThresholdAt } from '~/lib/prop-calculator/firms/shared';

export const APEX_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

const DRAWDOWN_AMOUNT = dollars(3000);
const LOCK_OFFSET = 100;
const MIN_PAYOUT_REQUEST = dollars(500);

const LIVE_LEVELS = [
    {
        dailyLossLimit: null,
        maxMicros: contracts(100),
        maxMinis: contracts(10),
        minProfit: dollars(0),
    },
    {
        dailyLossLimit: dollars(5000),
        maxMicros: contracts(250),
        maxMinis: contracts(25),
        minProfit: dollars(10_000),
    },
    {
        dailyLossLimit: dollars(10_000),
        maxMicros: contracts(300),
        maxMinis: contracts(30),
        minProfit: dollars(25_000),
    },
] as const;

const MINI_LIMITS: ContractLimitConfig = {
    kind: ContractLimitKind.Tiered,
    tierBasis: TierBasis.SessionOpenProfit,
    tiers: LIVE_LEVELS.map((level) => ({
        maxContracts: level.maxMinis,
        minBalance: level.minProfit,
    })),
};

const MICRO_LIMITS: ContractLimitConfig = {
    kind: ContractLimitKind.Tiered,
    tierBasis: TierBasis.SessionOpenProfit,
    tiers: LIVE_LEVELS.map((level) => ({
        maxContracts: level.maxMicros,
        minBalance: level.minProfit,
    })),
};

export const APEX_LIVE_DAILY_LOSS_LIMIT: DailyLossLimitConfig = {
    kind: DailyLossLimitKind.Tiered,
    tierBasis: TierBasis.SessionOpenProfit,
    tiers: LIVE_LEVELS.map((level) => ({
        dailyLossLimit: level.dailyLossLimit,
        maxContracts: level.maxMinis,
        minProfit: level.minProfit,
    })),
};

export function buildApexLivePlan(
    cushionPercent: LiveCushionPercent = APEX_LIVE_DEFAULT_CUSHION_PERCENT,
): LivePlan {
    return new LivePlan({
        contractLimits: { micros: MICRO_LIMITS, minis: MINI_LIMITS },
        cushionPercent,
        label: 'Apex Live',
        liveDailyLossLimit: APEX_LIVE_DAILY_LOSS_LIMIT,
        liveDrawdown: new EodTrailingDrawdown({
            amount: DRAWDOWN_AMOUNT,
            lock: {
                atProfit: dollars(DRAWDOWN_AMOUNT + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        minPayoutRequest: MIN_PAYOUT_REQUEST,
        payoutFloor: dollars(DRAWDOWN_AMOUNT + LOCK_OFFSET),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
    });
}
