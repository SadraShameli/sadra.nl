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
    ONE_CENT,
} from '~/lib/prop-calculator/core';
import { lockThresholdAt } from '~/lib/prop-calculator/firms/shared';

export const FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

const STARTING_BALANCE = dollars(2000);
const LOCK_OFFSET = -1000;
const FULL_SPLIT_WITHDRAWAL_CAP = dollars(5000);
const MIN_PAYOUT_REQUEST = dollars(100);
const WITHDRAWAL_LIQUIDATION_FLOOR = dollars(STARTING_BALANCE + ONE_CENT);
const STANDARD_MINIS = 3;
const LOCKED_MINIS = 6;
const MICROS_PER_MINI = 10;

const LOCKED_CONTRACT_CAPS: LockedContractCaps = {
    micros: contracts(LOCKED_MINIS * MICROS_PER_MINI),
    minis: contracts(LOCKED_MINIS),
};

export function buildFundedNextLivePlan(
    cushionPercent: LiveCushionPercent = FUNDEDNEXT_LIVE_DEFAULT_CUSHION_PERCENT,
): LivePlan {
    return new LockKeyedContractCapLivePlan({
        contractLimits: {
            micros: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(STANDARD_MINIS * MICROS_PER_MINI),
            },
            minis: {
                kind: ContractLimitKind.Flat,
                maxContracts: contracts(STANDARD_MINIS),
            },
        },
        cushionPercent,
        label: 'FundedNext Live',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({
            amount: STARTING_BALANCE,
            lock: {
                atProfit: STARTING_BALANCE,
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        lockedContractCaps: LOCKED_CONTRACT_CAPS,
        minPayoutRequest: MIN_PAYOUT_REQUEST,
        payoutFloor: WITHDRAWAL_LIQUIDATION_FLOOR,
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
