import {
    type ContractCount,
    type ContractLimitConfig,
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    type DllTier,
    dollars,
    type Dollars,
    floorToWholeCents,
    fraction,
    type InstrumentSpec,
    type LiveAccountState,
    type LiveCushionPercent,
    type ReserveLiveAccountState,
    ReserveLivePlan,
    StaticDrawdown,
    TierBasis,
    type TierProfitContext,
} from '~/lib/prop-calculator/core';
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
const SESSIONS_PER_WEEK = 5;
const RESERVE_REVIEW_INTERVAL_SESSIONS = SESSIONS_PER_WEEK;
const RESERVE_DEPOSIT_LAG_SESSIONS = 2;
const ACTIVE_TRADING_DAYS_PER_TIER = 10;
const WINNING_DAY_PAYOUT_GATE = {
    dailyPayoutsAfterWinningDays:
        TOPSTEP_PAYOUT_POLICY.dailyPayoutsAfterWinningDays,
    minWinningDayProfit: TOPSTEP_PAYOUT_POLICY.minWinningDayProfit,
    requestBalanceShareCap: TOPSTEP_PAYOUT_POLICY.requestBalanceShareCap,
    winningDaysPerRequest: TOPSTEP_PAYOUT_POLICY.winningDaysPerRequest,
};

const BASE_DLL_TIER: DllTier = {
    dailyLossLimit: dollars(2000),
    maxContracts: contracts(5),
    minProfit: dollars(0),
};

const DLL_TIERS: readonly DllTier[] = [
    BASE_DLL_TIER,
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

const TIER_PROFITS: readonly number[] = DLL_TIERS.map((tier) => tier.minProfit);

const EXPANSION_POSITION_LIMITS: ContractLimitConfig = {
    kind: ContractLimitKind.Tiered,
    tierBasis: TierBasis.SessionOpenProfit,
    tiers: DLL_TIERS.map((tier) => ({
        maxContracts: tier.maxContracts,
        minBalance: dollars(tier.minProfit),
    })),
};

interface BalanceSafeguard {
    readonly atOrBelowBalance: Dollars;
    readonly dailyLossLimit: Dollars;
    readonly maxContracts: ContractCount;
}

const BALANCE_SAFEGUARDS: readonly BalanceSafeguard[] = [
    {
        atOrBelowBalance: dollars(10_000),
        dailyLossLimit: dollars(2000),
        maxContracts: contracts(5),
    },
    {
        atOrBelowBalance: dollars(5000),
        dailyLossLimit: dollars(1000),
        maxContracts: contracts(3),
    },
];

interface LfaProgress {
    activeDaysInNextTier: number;
    safeguard: BalanceSafeguard | null;
    unlockedTierProfit: number;
    withdrawn: number;
}

interface TopStepLiveAccountState extends ReserveLiveAccountState {
    readonly lfa: LfaProgress;
}

class TopStepLivePlan extends ReserveLivePlan {
    private lfaProgressOf(state: LiveAccountState): LfaProgress {
        if (!isTopStepLiveAccountState(state)) {
            throw new Error(
                `${this.label}: needs the LFA progress that initialState() creates`,
            );
        }
        return state.lfa;
    }

    protected override tierContextOf(
        state: LiveAccountState,
    ): TierProfitContext {
        return {
            ...super.tierContextOf(state),
            sessionOpenProfit: this.lfaProgressOf(state).unlockedTierProfit,
        };
    }

    protected override tierProfitOf(state: LiveAccountState): number {
        return super.tierProfitOf(state) + this.lfaProgressOf(state).withdrawn;
    }

    override dailyLossLimitFor(state: LiveAccountState): null | number {
        const tiered = super.dailyLossLimitFor(state);
        const { safeguard } = this.lfaProgressOf(state);
        return safeguard === null
            ? tiered
            : Math.min(tiered ?? Infinity, safeguard.dailyLossLimit);
    }

    override initialState(): TopStepLiveAccountState {
        return {
            ...super.initialState(),
            lfa: {
                activeDaysInNextTier: 0,
                safeguard: null,
                unlockedTierProfit: BASE_DLL_TIER.minProfit,
                withdrawn: 0,
            },
        };
    }

    override maxContractsFor(
        state: LiveAccountState,
        instrument: InstrumentSpec,
    ): ContractCount | null {
        const tiered = super.maxContractsFor(state, instrument);
        const { safeguard } = this.lfaProgressOf(state);
        return safeguard === null
            ? tiered
            : contracts(Math.min(tiered ?? Infinity, safeguard.maxContracts));
    }

    override payoutOnLiquidation(state: LiveAccountState): number {
        return Math.max(0, state.balance);
    }

    override recordDayClose(state: LiveAccountState, isTraded: boolean): void {
        super.recordDayClose(state, isTraded);
        const progress = this.lfaProgressOf(state);
        advanceTier(progress, this.tierProfitOf(state), isTraded);
        const observed = safeguardAt(state.balance);
        const { sessions } = this.reserveProgressOf(state, 'the weekday clock');
        progress.safeguard =
            sessions % SESSIONS_PER_WEEK === 0
                ? observed
                : stricterSafeguard(progress.safeguard, observed);
    }

    override withdraw(state: LiveAccountState, amount: number): void {
        super.withdraw(state, amount);
        const progress = this.lfaProgressOf(state);
        progress.withdrawn += amount;
        progress.safeguard = stricterSafeguard(
            progress.safeguard,
            safeguardAt(state.balance),
        );
    }
}

export function buildTopStepLivePlan(
    cushionPercent: LiveCushionPercent = TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT,
    cumulativeXfaBalance: Dollars = ACCOUNT_SIZE_TIER,
): ReserveLivePlan {
    const startingBalance = computeTopStepLiveStartingBalance(
        cumulativeXfaBalance,
        ACCOUNT_SIZE_TIER,
    );
    return new TopStepLivePlan({
        contractLimits: {
            micros: EXPANSION_POSITION_LIMITS,
            minis: EXPANSION_POSITION_LIMITS,
        },
        cushionPercent,
        label: 'TopStep Live Funded Account (LFA)',
        liveDailyLossLimit: {
            kind: DailyLossLimitKind.Tiered,
            tierBasis: TierBasis.SessionOpenProfit,
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

function advanceTier(
    progress: LfaProgress,
    tierProfit: number,
    isActiveTradingDay: boolean,
): void {
    const reached =
        TIER_PROFITS.findLast((minProfit) => tierProfit >= minProfit) ??
        BASE_DLL_TIER.minProfit;
    const next = TIER_PROFITS.find(
        (minProfit) => minProfit > progress.unlockedTierProfit,
    );
    if (next === undefined || reached < next) {
        progress.unlockedTierProfit = Math.min(
            progress.unlockedTierProfit,
            reached,
        );
        progress.activeDaysInNextTier = 0;
        return;
    }
    if (!isActiveTradingDay) return;
    progress.activeDaysInNextTier += 1;
    if (progress.activeDaysInNextTier < ACTIVE_TRADING_DAYS_PER_TIER) return;
    progress.unlockedTierProfit = next;
    progress.activeDaysInNextTier = 0;
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

function isTopStepLiveAccountState(
    state: LiveAccountState,
): state is TopStepLiveAccountState {
    return 'lfa' in state;
}

function safeguardAt(balance: number): BalanceSafeguard | null {
    const balanceInWholeCents = floorToWholeCents(balance);
    let strictest: BalanceSafeguard | null = null;
    for (const safeguard of BALANCE_SAFEGUARDS) {
        if (balanceInWholeCents <= safeguard.atOrBelowBalance) {
            strictest = stricterSafeguard(strictest, safeguard);
        }
    }
    return strictest;
}

function stricterSafeguard(
    current: BalanceSafeguard | null,
    candidate: BalanceSafeguard | null,
): BalanceSafeguard | null {
    if (current === null) return candidate;
    if (candidate === null) return current;
    return candidate.atOrBelowBalance < current.atOrBelowBalance
        ? candidate
        : current;
}
