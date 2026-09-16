import {
    dollars,
    EodTrailingDrawdown,
    fraction,
    type LiveCushionPercent,
    LivePlan,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt } from '../shared';

export const FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

const STARTING_BALANCE = dollars(2000);
const LOCK_OFFSET = -1000;
const FULL_SPLIT_WITHDRAWAL_CAP = dollars(5000);

export function buildFundedNextLivePlan(
    cushionPercent: LiveCushionPercent = FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT,
): LivePlan {
    return new LivePlan({
        cushionPercent,
        label: 'FundedNext Live',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({
            amount: STARTING_BALANCE,
            lock: {
                atProfit: dollars(STARTING_BALANCE + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
            {
                thresholdProfit: FULL_SPLIT_WITHDRAWAL_CAP,
                traderShare: fraction(0.9),
            },
        ],
        startingBalance: STARTING_BALANCE,
    });
}
