import {
    contracts,
    DailyLossLimitKind,
    type DllTier,
    dollars,
    type Dollars,
    fraction,
    type LiveCushionPercent,
    LivePlan,
} from '~/lib/prop-calculator/core';

export const TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.05),
    preLock: fraction(0.05),
};

const ACCOUNT_SIZE_TIER = dollars(50_000);
const MIN_STARTING_BALANCE = dollars(10_000);
const STARTING_BALANCE_SHARE = fraction(0.2);
const TRADER_SHARE = 0.9;

const DLL_TIERS: readonly DllTier[] = [
    {
        dailyLossLimit: dollars(2000),
        maxContracts: contracts(5),
        minProfit: dollars(0),
    },
    {
        dailyLossLimit: dollars(5000),
        maxContracts: contracts(5),
        minProfit: dollars(15_000),
    },
    {
        dailyLossLimit: dollars(5500),
        maxContracts: contracts(5),
        minProfit: dollars(20_000),
    },
    {
        dailyLossLimit: dollars(6000),
        maxContracts: contracts(5),
        minProfit: dollars(50_000),
    },
    {
        dailyLossLimit: dollars(10_000),
        maxContracts: contracts(30),
        minProfit: dollars(100_000),
    },
    {
        dailyLossLimit: dollars(20_000),
        maxContracts: contracts(50),
        minProfit: dollars(200_000),
    },
    {
        dailyLossLimit: dollars(50_000),
        maxContracts: contracts(70),
        minProfit: dollars(550_000),
    },
    {
        dailyLossLimit: dollars(100_000),
        maxContracts: contracts(100),
        minProfit: dollars(1_000_000),
    },
];

export function buildTopStepLivePlan(
    cushionPercent: LiveCushionPercent = TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
    cumulativeXfaBalance: Dollars = ACCOUNT_SIZE_TIER,
): LivePlan {
    return new LivePlan({
        cushionPercent,
        label: 'TopStep Live Funded Account (LFA)',
        liveDailyLossLimit: {
            kind: DailyLossLimitKind.Tiered,
            tiers: DLL_TIERS,
        },
        liveDrawdown: null,
        payoutTiers: [
            {
                thresholdProfit: dollars(0),
                traderShare: fraction(TRADER_SHARE),
            },
        ],
        startingBalance: computeTopStepLiveStartingBalance(
            cumulativeXfaBalance,
            ACCOUNT_SIZE_TIER,
        ),
    });
}

export function computeTopStepLiveStartingBalance(
    cumulativeXfaBalance: Dollars,
    accountSizeTier: Dollars,
): Dollars {
    return dollars(
        Math.max(
            MIN_STARTING_BALANCE,
            STARTING_BALANCE_SHARE *
                Math.min(cumulativeXfaBalance, accountSizeTier),
        ),
    );
}
