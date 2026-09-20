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

export const APEX_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

const DRAWDOWN_AMOUNT = dollars(3000);
const LOCK_OFFSET = 100;
const MAX_MINI_CONTRACTS = contracts(10);

export function buildApexLivePlan(
    cushionPercent: LiveCushionPercent = APEX_LIVE_DEFAULT_CUSHION_PERCENT,
): LivePlan {
    return new LivePlan({
        contractLimit: {
            kind: ContractLimitKind.Flat,
            maxContracts: MAX_MINI_CONTRACTS,
        },
        cushionPercent,
        label: 'Apex Live',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({
            amount: DRAWDOWN_AMOUNT,
            lock: {
                atProfit: dollars(DRAWDOWN_AMOUNT + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        payoutFloor: dollars(DRAWDOWN_AMOUNT + LOCK_OFFSET),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
    });
}
