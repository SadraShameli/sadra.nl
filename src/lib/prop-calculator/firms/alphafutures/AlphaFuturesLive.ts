import {
    ContractLimitKind,
    contracts,
    dollars,
    EodTrailingDrawdown,
    fraction,
    type LiveCushionPercent,
    LivePlan,
} from '~/lib/prop-calculator/core';

export const ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

const DRAWDOWN_AMOUNT = dollars(2000);
const CONTRACT_SCALE_PROFIT = dollars(2000);

export function buildAlphaFuturesLivePlan(
    cushionPercent: LiveCushionPercent = ALPHAFUTURES_LIVE_DEFAULT_CUSHION_PERCENT,
): LivePlan {
    return new LivePlan({
        contractLimit: {
            kind: ContractLimitKind.Tiered,
            tiers: [
                { maxContracts: contracts(2), minBalance: dollars(0) },
                {
                    maxContracts: contracts(4),
                    minBalance: CONTRACT_SCALE_PROFIT,
                },
            ],
        },
        cushionPercent,
        label: 'Alpha Futures Live',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({ amount: DRAWDOWN_AMOUNT }),
        payoutFloor: dollars(0),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
        requiresLockForWithdrawal: false,
    });
}
