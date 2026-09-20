import {
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    fraction,
    type LiveCushionPercent,
    LivePlan,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt } from '../shared';

export const TPT_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

const DRAWDOWN_AMOUNT = dollars(2000);
const MAX_CONSECUTIVE_IDLE_DAYS = 7;

const DEVELOPMENT_DRAWDOWN_AMOUNT = dollars(1250);
const DEVELOPMENT_DAILY_LOSS_LIMIT = dollars(1000);
const DEVELOPMENT_MAX_CONTRACTS = contracts(2);

export function buildTptLiveDevelopmentPlan(
    cushionPercent: LiveCushionPercent = TPT_LIVE_DEFAULT_CUSHION_PERCENT,
): LivePlan {
    return new LivePlan({
        contractLimit: {
            kind: ContractLimitKind.Flat,
            maxContracts: DEVELOPMENT_MAX_CONTRACTS,
        },
        cushionPercent,
        label: 'Take Profit Trader PRO+ Development',
        liveDailyLossLimit: {
            amount: DEVELOPMENT_DAILY_LOSS_LIMIT,
            kind: DailyLossLimitKind.Flat,
        },
        liveDrawdown: new EodTrailingDrawdown({
            amount: DEVELOPMENT_DRAWDOWN_AMOUNT,
            lock: {
                atProfit: DEVELOPMENT_DRAWDOWN_AMOUNT,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        maxConsecutiveIdleDays: MAX_CONSECUTIVE_IDLE_DAYS,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        requiresLockForWithdrawal: false,
    });
}

export function buildTptLivePlan(
    cushionPercent: LiveCushionPercent = TPT_LIVE_DEFAULT_CUSHION_PERCENT,
): LivePlan {
    return new LivePlan({
        cushionPercent,
        label: 'Take Profit Trader PRO+',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({
            amount: DRAWDOWN_AMOUNT,
            lock: {
                atProfit: DRAWDOWN_AMOUNT,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        maxConsecutiveIdleDays: MAX_CONSECUTIVE_IDLE_DAYS,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        requiresLockForWithdrawal: false,
    });
}
