import {
    AlphaFuturesVariant,
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type PlanInit,
    profitShareMultiplier,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const ZERO_SIZES = [
    {
        accountSize: dollars(50_000),
        dailyLossLimit: dollars(1000),
        maxDrawdown: dollars(2000),
        monthlyFee: 139,
        payoutRequestCap: dollars(1500),
        profitTarget: dollars(3000),
        resetFee: 119,
    },
] as const;

const ADVANCED_SIZES = [
    {
        accountSize: dollars(50_000),
        maxDrawdown: dollars(1750),
        monthlyFee: 209,
        payoutRequestCap: dollars(15_000),
        profitTarget: dollars(4000),
        resetFee: 189,
    },
] as const;

const STANDARD_SIZES = [
    {
        accountSize: dollars(50_000),
        maxDrawdown: dollars(2000),
        monthlyFee: 129,
        payoutRequestCap: dollars(3000),
        profitTarget: dollars(3000),
        resetFee: 109,
    },
] as const;

type AfAdvancedSize = (typeof ADVANCED_SIZES)[number];
type AfStandardSize = (typeof STANDARD_SIZES)[number];
type AfZeroSize = (typeof ZERO_SIZES)[number];

const ADVANCED_CONTRACT_LIMITS = {
    evalMicros: contracts(50),
    evalMinis: contracts(5),
    fundedMicros: { kind: ContractLimitKind.Flat, maxContracts: contracts(50) },
    fundedMinis: { kind: ContractLimitKind.Flat, maxContracts: contracts(5) },
} as const;

const STANDARD_CONTRACT_LIMITS = {
    evalMicros: contracts(50),
    evalMinis: contracts(5),
    fundedMicros: {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(20), minBalance: dollars(0) },
            { maxContracts: contracts(30), minBalance: dollars(1500) },
            { maxContracts: contracts(50), minBalance: dollars(2000) },
        ],
    },
    fundedMinis: {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(2), minBalance: dollars(0) },
            { maxContracts: contracts(3), minBalance: dollars(1500) },
            { maxContracts: contracts(5), minBalance: dollars(2000) },
        ],
    },
} as const;

const ZERO_EVAL_CONTRACT_LIMITS = {
    evalMicros: contracts(30),
    evalMinis: contracts(3),
};

const ZERO_FUNDED_CONTRACT_LIMITS = {
    fundedMicros: {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(10), minBalance: dollars(0) },
            { maxContracts: contracts(20), minBalance: dollars(1500) },
            { maxContracts: contracts(30), minBalance: dollars(2000) },
        ],
    },
    fundedMinis: {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(1), minBalance: dollars(0) },
            { maxContracts: contracts(2), minBalance: dollars(1500) },
            { maxContracts: contracts(3), minBalance: dollars(2000) },
        ],
    },
} as const;

export class AlphaFutures extends TradingFirm {
    readonly displayName = 'Alpha Futures';
    readonly id = FirmId.AlphaFutures;
    readonly notes = [
        "No per-request payout minimum was confirmed for any plan, so minPayoutRequest is left unset (resolves to $0, i.e. no additional floor beyond payoutRequestCap/minPayoutProfit) rather than guessed. It previously silently inherited minPayoutProfit's value by an engine-level fallback that has since been removed for representing a different real-world concept (the one-time first-payout profit gate, not a recurring per-request minimum).",
        'help.alpha-futures.com\'s Payout Policy article confirms Zero, Standard, and Advanced plans have no recurring per-cycle profit requirement (only "Direct Qualified Accounts", a product not modeled here, have a resetting per-cycle profit target), so minPayoutProfitPerCycle is left unset rather than guessed; it defaults to $0.',
        'The TRADINGVIEW coupon code is confirmed sitewide at 50% off all evaluations, with no expiry markup found on any page checked.',
        'Separately, with lower confidence: a company blog post describes a second code, DIRECT35 (35% off), scoped specifically to the $50K "Direct Qualified" account -- noted as a distinct, lower-confidence secondary offer rather than folded into the sitewide TRADINGVIEW figure.',
        "None of the three plan builders previously set contractLimits, so plan.contractLimits resolved to null for every Alpha Futures plan and per-trade risk sizing was never capped against a max-contracts rule. This repo's own doc tree directly confirms per-plan Max Contracts figures: Zero eval flat 3 minis/30 micros, Zero funded scaling 1/10 (<$1,500 profit) -> 2/20 ($1,500-2,000) -> 3/30 ($2,000+); Standard eval flat 5 minis/50 micros, Standard funded scaling 2/20 (<$1,500 profit) -> 3/30 ($1,500-2,000) -> 5/50 ($2,000+, ceiling); Advanced flat 5 minis/50 micros both stages (no scaling plan). Corrected: added ADVANCED_CONTRACT_LIMITS/STANDARD_CONTRACT_LIMITS/ZERO_*_CONTRACT_LIMITS using ContractLimitKind.Flat/Tiered, tiers keyed on accountProfit (not raw balance) matching this codebase's existing convention (see PositionSizing.ts's resolveContractLimit).",
        "The post-Qualified LIVE stage (live.md), previously entirely unmodeled, is now built in AlphaFuturesLive.ts for the 50K-eligible-Qualified-Account tier only, mirroring the LivePlan pattern already used by 6 other firms. Modeled: $0 starting balance, $2,000 EOD-trailing MLL with NO lock (live.md's own Not Confirmed section states the Live-specific lock trigger/locked-value are unconfirmed by any source -- left unset rather than guessed, so the floor trails indefinitely), a contract limit tiered 2 minis before $2,000 simulated profit / 4 minis at or above it (raw balance and profit are identical here since starting balance is $0, so the existing balance-keyed ContractLimitKind.Tiered mechanism needs no adjustment), and the 80%-split 'Alpha Futures Live Program' path only. `payoutFloor: dollars(0)` plus `requiresLockForWithdrawal: false` together model live.md's own confirmed payout rule ('daily, uncapped withdrawals on any of their gains above starting live balance') exactly -- this is a materially different, more permissive formula than TptLive.ts's 'withdraw down to the current trailing floor' rule, not the same mechanism reused. Two confirmed-but-unmodeled gaps, both deliberate: (1) the alternative 60%-split 'Alpha Prime Program' path has its own separate, uncapped-here salary mechanic (50% of Qualified-stage sim profit, up to $75,000, paid as a 12-month salary) with no equivalent concept anywhere in LivePlan -- modeling it would require a new capability, not a config tweak, so only the simpler 80% path is built; (2) live.md's own DLL row describes a 'Scaling Daily Loss Limit (30% of account)' for Live, but LivePlan's constructor only allows liveDrawdown XOR liveDailyLossLimit, never both, and this plan already needs the MLL drawdown to represent the confirmed bust condition -- the scaling DLL cannot be represented alongside it under the current class shape (compounded by live.md's own admission that no starting dollar floor is stated for the DLL under the current $0-start structure). maxConsecutiveIdleDays is left unset: live.md confirms Live's inactivity handling is discretionary Performance-Team review, not a fixed day-count, so inventing one would be less accurate than modeling none.",
        "STANDARD_CONTRACT_LIMITS' and ZERO_FUNDED_CONTRACT_LIMITS' Tiered tiers were checked against this session's own general isEffectiveNextSession fix (ContractLimits.ts, closing a real bug where the shared simulator recomputed a Tiered funded contract limit on every trade within a day using live intraday profit, rather than freezing it for the session as several other firms' own sources confirm -- see e.g. LucidFlex's/TopStep's/E8 Zero's own notes). Left at the default (false, current live-recompute behavior) for both Standard and Zero: neither standard.md nor zero.md states the recalculation timing for its own Scaling Plan one way or the other, and this file's own sourcing convention is to not assume a sibling firm's confirmed timing carries over by analogy. Not modeled as true, not asserted as confirmed-intraday either -- genuinely unconfirmed.",
    ];
    readonly plans = [
        ...ZERO_SIZES.map((s) => this.buildPlan(buildZeroPlan(s))),
        ...STANDARD_SIZES.map((s) => this.buildPlan(buildStandardPlan(s))),
        ...ADVANCED_SIZES.map((s) => this.buildPlan(buildAdvancedPlan(s))),
    ];
    readonly website = 'https://alpha-futures.com';
}

function buildAdvancedPlan(size: AfAdvancedSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        contractLimits: ADVANCED_CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(size.monthlyFee),
            oneTimeEval: dollars(0),
            reset: dollars(size.resetFee),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Advanced,
        },
        label: planLabel(size.accountSize, 'Advanced'),
        maxFundedAccounts: 3,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(1000),
        minQualifyingDayProfit: dollars(200),
        minTradingDays: 3,
        payoutProfitShare: profitShareMultiplier(0.5),
        payoutRequestCap: size.payoutRequestCap,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildStandardPlan(size: AfStandardSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        contractLimits: STANDARD_CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(size.monthlyFee),
            oneTimeEval: dollars(0),
            reset: dollars(size.resetFee),
        },
        fundedConsistency: {
            kind: 'set',
            rule: new ConsistencyRule(ConsistencyScope.Funded, fraction(0.4)),
        },
        fundedDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Standard,
        },
        label: planLabel(size.accountSize, 'Standard'),
        maxFundedAccounts: 5,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(500),
        minQualifyingDayProfit: dollars(200),
        minTradingDays: 2,
        payoutProfitShare: profitShareMultiplier(0.5),
        payoutRequestCap: size.payoutRequestCap,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildZeroPlan(size: AfZeroSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.4),
        ),
        contractLimits: {
            ...ZERO_EVAL_CONTRACT_LIMITS,
            ...ZERO_FUNDED_CONTRACT_LIMITS,
        },
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: size.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: {
            amount: size.dailyLossLimit,
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(size.monthlyFee),
            oneTimeEval: dollars(0),
            reset: dollars(size.resetFee),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Zero,
        },
        label: planLabel(size.accountSize, 'Zero'),
        maxFundedAccounts: 5,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(200),
        minQualifyingDayProfit: dollars(200),
        minTradingDays: 1,
        payoutProfitShare: profitShareMultiplier(0.5),
        payoutRequestCap: size.payoutRequestCap,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
    };
}
