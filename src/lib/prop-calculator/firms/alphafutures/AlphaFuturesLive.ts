import {
    ContractLimitKind,
    contracts,
    dollars,
    EodTrailingDrawdown,
    fraction,
    type LiveCushionPercent,
    type LivePlan,
    type LockedContractCaps,
    LockKeyedContractCapLivePlan,
} from '~/lib/prop-calculator/core';
import { lockThresholdAt } from '~/lib/prop-calculator/firms/shared';

export const ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

const DRAWDOWN_AMOUNT = dollars(2000);

const LOCKED_CONTRACT_CAPS: LockedContractCaps = {
    micros: contracts(40),
    minis: contracts(4),
};

export function buildAlphaFuturesLivePlan(
    cushionPercent: LiveCushionPercent = ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT,
): LivePlan {
    return new LockKeyedContractCapLivePlan({
        contractLimits: {
            micros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(20),
            },
            minis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(2),
            },
        },
        cushionPercent,
        label: 'Alpha Futures Live',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({
            amount: DRAWDOWN_AMOUNT,
            lock: {
                atProfit: DRAWDOWN_AMOUNT,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        lockedContractCaps: LOCKED_CONTRACT_CAPS,
        payoutFloor: dollars(0),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        requiresLockForWithdrawal: false,
    });
}
