import {
    ContractLimitKind,
    contracts,
    dollars,
    type Dollars,
    EodTrailingDrawdown,
    fraction,
    type LiveCushionPercent,
    LivePlan,
    PayoutFloorEffect,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt } from '../shared';

export const LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP = dollars(15_000);

export const LUCID_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

const DRAWDOWN_AMOUNT = dollars(2000);
const CONTRACT_SCALE_TIER_1_PROFIT = dollars(2000);
const CONTRACT_SCALE_TIER_2_PROFIT = dollars(4000);
const LOCK_OFFSET = 100;

export function buildLucidDailyLivePlan(
    cushionPercent: LiveCushionPercent = LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
    simProfitAboveBuffer: Dollars = LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP,
): LivePlan {
    return buildLucidLivePlan(
        cushionPercent,
        dollars(
            Math.min(
                simProfitAboveBuffer,
                LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP,
            ),
        ),
    );
}

export function buildLucidLivePlan(
    cushionPercent: LiveCushionPercent = LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
    transitionPayout: Dollars = dollars(0),
): LivePlan {
    return new LivePlan({
        contractLimit: {
            kind: ContractLimitKind.Tiered,
            tiers: [
                { maxContracts: contracts(2), minBalance: dollars(0) },
                {
                    maxContracts: contracts(3),
                    minBalance: CONTRACT_SCALE_TIER_1_PROFIT,
                },
                {
                    maxContracts: contracts(4),
                    minBalance: CONTRACT_SCALE_TIER_2_PROFIT,
                },
            ],
        },
        cushionPercent,
        label: 'Lucid Live',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({
            amount: DRAWDOWN_AMOUNT,
            lock: {
                atProfit: DRAWDOWN_AMOUNT,
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        requiresLockForWithdrawal: false,
        transitionPayout,
    });
}
