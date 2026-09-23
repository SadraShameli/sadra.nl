import {
    contracts,
    DailyLossLimitKind,
    type DllTier,
    dollars,
    type Dollars,
    fraction,
    type LiveCushionPercent,
    StaticDrawdown,
} from '~/lib/prop-calculator/core';
import { ReserveLivePlan } from '~/lib/prop-calculator/core/LivePlan';
import { TOPSTEP_PAYOUT_POLICY } from '~/lib/prop-calculator/firms/topstep/TopStep';

export const TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT: LiveCushionPercent = {
    postLock: fraction(0.05),
    preLock: fraction(0.05),
};

const ACCOUNT_SIZE_TIER = dollars(50_000);
const MIN_STARTING_BALANCE = dollars(10_000);
const STARTING_BALANCE_SHARE = fraction(0.2);
const INACTIVITY_CLOSURE_DAYS = 30;
const AUTO_LIQUIDATION_BALANCE = dollars(1000);
const RESERVE_INCREMENTS = 4;
const RESERVE_PROFIT_TARGET = dollars(3000);
const RESERVE_REVIEW_INTERVAL_SESSIONS = 5;
const RESERVE_DEPOSIT_LAG_SESSIONS = 2;
const WINNING_DAY_PAYOUT_GATE = {
    dailyPayoutsAfterWinningDays:
        TOPSTEP_PAYOUT_POLICY.dailyPayoutsAfterWinningDays,
    minWinningDayProfit: TOPSTEP_PAYOUT_POLICY.minWinningDayProfit,
    requestBalanceShareCap: TOPSTEP_PAYOUT_POLICY.requestBalanceShareCap,
    winningDaysPerRequest: TOPSTEP_PAYOUT_POLICY.winningDaysPerRequest,
};

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
): ReserveLivePlan {
    const startingBalance = computeTopStepLiveStartingBalance(
        cumulativeXfaBalance,
        ACCOUNT_SIZE_TIER,
    );
    return new ReserveLivePlan({
        cushionPercent,
        label: 'TopStep Live Funded Account (LFA)',
        liveDailyLossLimit: {
            kind: DailyLossLimitKind.Tiered,
            tiers: DLL_TIERS,
        },
        liveDrawdown: new StaticDrawdown({
            amount: dollars(startingBalance - AUTO_LIQUIDATION_BALANCE),
        }),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        minPayoutRequest: TOPSTEP_PAYOUT_POLICY.minPayoutRequest,
        payoutTiers: [
            {
                thresholdProfit: dollars(0),
                traderShare: TOPSTEP_PAYOUT_POLICY.traderShare,
            },
        ],
        requiresLockForWithdrawal: false,
        seedReserve: {
            amount: computeTopStepLiveReserve(
                cumulativeXfaBalance,
                ACCOUNT_SIZE_TIER,
            ),
            depositLagSessions: RESERVE_DEPOSIT_LAG_SESSIONS,
            increments: RESERVE_INCREMENTS,
            profitTargetPerIncrement: RESERVE_PROFIT_TARGET,
            reviewIntervalSessions: RESERVE_REVIEW_INTERVAL_SESSIONS,
        },
        startingBalance,
        winningDayPayoutGate: WINNING_DAY_PAYOUT_GATE,
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

function computeTopStepLiveReserve(
    cumulativeXfaBalance: Dollars,
    accountSizeTier: Dollars,
): Dollars {
    return dollars(
        Math.max(
            0,
            Math.min(cumulativeXfaBalance, accountSizeTier) -
                computeTopStepLiveStartingBalance(
                    cumulativeXfaBalance,
                    accountSizeTier,
                ),
        ),
    );
}
