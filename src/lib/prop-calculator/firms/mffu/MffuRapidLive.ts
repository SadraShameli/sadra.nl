import {
    ContractLimitKind,
    contracts,
    dollars,
    EodTrailingDrawdown,
    fraction,
    type LiveCushionPercent,
    LivePlan,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt } from '../shared';

export const MFFU_RAPID_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

const DRAWDOWN_AMOUNT = dollars(2000);
const MAX_MINI_CONTRACTS = contracts(3);
const MAX_MICRO_CONTRACTS = contracts(30);
const MIN_LIVE_WITHDRAWAL = dollars(250);

export function buildMffuRapidLivePlan(
    cushionPercent: LiveCushionPercent = MFFU_RAPID_LIVE_DEFAULT_CUSHION_PERCENT,
): LivePlan {
    return new LivePlan({
        contractLimits: {
            micros: {
                kind: ContractLimitKind.Flat,
                maxContracts: MAX_MICRO_CONTRACTS,
            },
            minis: {
                kind: ContractLimitKind.Flat,
                maxContracts: MAX_MINI_CONTRACTS,
            },
        },
        cushionPercent,
        label: 'MyFundedFutures Rapid Live',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({
            amount: DRAWDOWN_AMOUNT,
            lock: {
                atProfit: DRAWDOWN_AMOUNT,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        minPayoutRequest: MIN_LIVE_WITHDRAWAL,
        payoutFloor: dollars(0),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        requiresLockForWithdrawal: false,
    });
}
