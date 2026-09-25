import {
    AlphaFuturesVariant,
    ConsistencyBasis,
    ConsistencyBoundary,
    ConsistencyNonPositiveProfit,
    ConsistencyRule,
    ConsistencyScope,
    ConsistencyViolationEffect,
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    dollars,
    type Dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    FundedResetEligibility,
    type FundedResetPolicy,
    type PayoutCountSplitTier,
    PayoutProfitPool,
    type PayoutTier,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const ZERO_SIZES = [
    {
        accountSize: dollars(50_000),
        dailyLossLimit: dollars(1000),
        maxDrawdown: dollars(2000),
        minPayoutRequest: dollars(200),
        monthlyFee: 139,
        payoutRequestCap: dollars(1500),
        profitTarget: dollars(3000),
        qualifiedResetFee: dollars(499),
        resetFee: 119,
    },
] as const;

const ADVANCED_SIZES = [
    {
        accountSize: dollars(50_000),
        fundedMaxDrawdown: dollars(2000),
        maxDrawdown: dollars(1750),
        minPayoutRequest: dollars(1000),
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
        minPayoutRequest: dollars(500),
        monthlyFee: 129,
        payoutRequestCap: dollars(3000),
        profitTarget: dollars(3000),
        qualifiedResetFee: dollars(599),
        resetFee: 109,
    },
] as const;

const QUALIFIED_FIRST_PAYOUT_TIERS: readonly PayoutTier[] = [
    { thresholdProfit: dollars(0), traderShare: fraction(0.7) },
];

const QUALIFIED_LATER_PAYOUT_TIERS: readonly PayoutCountSplitTier[] = [
    {
        fromPayoutIndex: 2,
        tiers: [{ thresholdProfit: dollars(0), traderShare: fraction(0.8) }],
    },
    {
        fromPayoutIndex: 4,
        tiers: [{ thresholdProfit: dollars(0), traderShare: fraction(0.9) }],
    },
];

const QUALIFIED_CONSISTENCY = new ConsistencyRule(
    ConsistencyScope.Funded,
    fraction(0.4),
    ConsistencyBasis.Cycle,
    ConsistencyViolationEffect.Fail,
    ConsistencyBoundary.Inclusive,
    ConsistencyNonPositiveProfit.Violates,
);

const QUALIFIED_PAYOUT_RULES = {
    minDaysAfterPassForPayout: 5,
    minQualifyingDayProfit: dollars(200),
    payoutBalanceShareCap: fraction(0.5),
    payoutProfitPool: PayoutProfitPool.AccountProfit,
    payoutTiers: QUALIFIED_FIRST_PAYOUT_TIERS,
    payoutTiersFromPayout: QUALIFIED_LATER_PAYOUT_TIERS,
} satisfies Partial<PlanInit>;

const QUALIFIED_RESET_RULES = {
    eligibility: FundedResetEligibility.NoPayoutEverRequested,
    label: 'Qualified Reset',
    maxPerAccount: 2,
    windowCalendarDays: 7,
} satisfies Omit<FundedResetPolicy, 'fee'>;

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
        "help.alpha-futures.com's Payout Policy article (updated 2026-07-27, fetched live 2026-09-23) states a standing minimum withdrawal request on every payout, not only the first: 'The minimum withdrawal request on Zero Accounts is $200', 'on Standard Accounts is $500', 'on Advanced Qualified Accounts is $1,000'. Modeled as minPayoutRequest $200/$500/$1,000. The old minPayoutProfit first-payout gate at the same figures is removed: no source states a separate first-payout profit gate beyond the 5 winning days of $200, and with the 50% request cap any request at the minimum already needs twice the minimum in profit.",
        "Payout Policy: 'You may request up to 50% of the profit in your account each withdrawal request (up to withdrawal limit), the rest of the balance stays on the account for drawdown or future withdrawals.' Modeled as payoutBalanceShareCap 0.5 on account profit with payoutProfitPool AccountProfit, so profit left in the account by an earlier request can be drawn on later. Previously modeled as 50% of the current cycle's profit only (payoutProfitShare), which undercounted every payout after the first.",
        "The trader split follows the signed General Service Agreement's Virtual Performance Fees clause, fetched live 2026-09-23: 'First two virtual payouts on the account the User receives a 70% Performance Fee, virtual payouts 3 and 4 80%, virtual payouts 5+ on the account the User receives a 90% Performance Fee.' Modeled with payoutTiers 70% plus payoutTiersFromPayout 80% from the 3rd and 90% from the 5th payout, counted per account (a re-bought account starts again at 70%). The help center (Payout Policy, plan overviews) and Terms Schedule 2 still say a flat 90%; the doc tree resolves the conflict in favor of the signed Agreement, which the user should re-confirm because it lowers every Alpha Futures ranking.",
        "Advanced Qualified uses a $2,000 Maximum Loss Limit (Terms and Conditions Schedule 2, 'Advanced Qualified ... 4%' of $50,000), trailing from $48,000 and locking at the $50,000 starting balance once the EOD balance reaches $52,000. The Advanced Evaluation keeps its $1,750 limit (Schedule 1, 3.5%). Previously the Qualified stage silently reused the Evaluation's $1,750 drawdown.",
        'help.alpha-futures.com\'s Payout Policy article confirms Zero, Standard, and Advanced plans have no recurring per-cycle profit requirement (only "Direct Qualified Accounts", a product not modeled here, have a resetting per-cycle profit target), so minPayoutProfitPerCycle is left unset rather than guessed; it defaults to $0.',
        "Two typed coupon codes are advertised, and neither is applied without typing it: TRADINGVIEW, advertised on the product pages at 50% off all evaluations, and APP50, on the site-wide banner ('50% OFF USE CODE: APP50', fetched 2026-09-23). The fee basis is the checkout price with no code, so the engine keeps the list prices ($139 Zero, $129 Standard, $209 Advanced monthly; resets $119 / $109 / $189) and models either code only through the user-set discount flags. Unconfirmed: whether a code covers only the first month or every rebill, and whether it covers resets (the reset modal has its own coupon box).",
        "Zero and Standard Qualified accounts use the 40% Consistency Rule of help.alpha-futures.com article 9492048 (updated 2026-07-27): 'profits from any single trading day cannot be greater than or equal to 40% of net profits accumulated since last withdrawal request'. The same article elsewhere says 'greater than 40%'; the engine takes the stricter inclusive reading (ConsistencyBoundary.Inclusive), so a best day of exactly 40% of the cycle's net profit blocks the request. Because requests draw on account profit, a request can follow a cycle that netted zero or a loss; the ratio is undefined there, so such a cycle fails the rule (ConsistencyNonPositiveProfit.Violates) and the trader keeps trading until the cycle is net positive and consistent. The Evaluation rules (Standard 50%, Advanced 40%, worded 'cannot be larger than') keep the exclusive boundary.",
        "The funded dynamic program behind the optimal-risk and state-value figures carries the balance at the last request as part of its state, so from the second request on it applies the net-losing cycle rule and scores the 40% ratio on the real cycle's net profit. Its cycle best day and that balance are bucketed, though, so its figures for Zero and Standard are approximate (on a toy account its value differs from simulated trials of its own policy by up to about 20% on a fine grid, and more on the default grid); the simulated trials track the exact best day and cycle and apply both rules exactly.",
        "The Qualified Account Reset (Reset article 9492077, updated 2026-08-12, fetched live 2026-09-24): 'Qualified Resets are only available on Zero and Standard Accounts. Traders may use a Qualified Reset 2 times on a singular account, if the account has never reached payout request. Traders have up to 7 days to utilize a Qualified Reset after an account is breached.' It costs $499 for a 50K Zero and $599 for a 50K Standard Qualified account, and restores 'starting Account Balance, Maximum Loss Limit, and Trading Days'. Modeled as the plan's fundedReset rule, an opt-in that is off by default (CLI --funded-reset, the web toggle), since buying it is the trader's choice. When on, every Qualified breach of the Maximum Loss Limit (the daily loss limit only ends the day, so it is not a breach here) is reset on the same day, which is inside the 7-day window, while the account never requested a payout and has used fewer than 2 resets; an inactivity closure is not a breach and is never reset. The reset returns the account to its funded starting state and restarts the payout cycle, the funded horizon keeps running, and the reset fee (less the reset discount flag) counts toward net, expected spend and cost per funded account (the reset fees per account that passed the evaluation are added to the evaluation cost). A reset account that then survives counts as surviving. The optimal-risk dynamic program (optimize dp) does not model the reset and scores a breach before the first payout as closure. The engine's fees.reset stays the Evaluation Reset only ($119 Zero, $109 Standard, $189 Advanced).",
        'Separately, with lower confidence: a company blog post describes a second code, DIRECT35 (35% off), scoped specifically to the $50K "Direct Qualified" account -- noted as a distinct, lower-confidence secondary offer rather than folded into the sitewide TRADINGVIEW figure.',
        "None of the three plan builders previously set contractLimits, so plan.contractLimits resolved to null for every Alpha Futures plan and per-trade risk sizing was never capped against a max-contracts rule. This repo's own doc tree directly confirms per-plan Max Contracts figures: Zero eval flat 3 minis/30 micros, Zero funded scaling 1/10 (<$1,500 profit) -> 2/20 ($1,500-2,000) -> 3/30 ($2,000+); Standard eval flat 5 minis/50 micros, Standard funded scaling 2/20 (<$1,500 profit) -> 3/30 ($1,500-2,000) -> 5/50 ($2,000+, ceiling); Advanced flat 5 minis/50 micros both stages (no scaling plan). Corrected: added ADVANCED_CONTRACT_LIMITS/STANDARD_CONTRACT_LIMITS/ZERO_*_CONTRACT_LIMITS using ContractLimitKind.Flat/Tiered, tiers keyed on accountProfit (not raw balance) matching this codebase's existing convention (see PositionSizing.ts's contractLimitAt, which resolves a tiered funded cap through maxContractsAt with the full TierProfitContext).",
        "The post-Qualified LIVE stage (live.md), previously entirely unmodeled, is now built in AlphaFuturesLive.ts for the 50K-eligible-Qualified-Account tier only, mirroring the LivePlan pattern already used by 6 other firms. Modeled: $0 starting balance, $2,000 EOD-trailing MLL that stops trailing at the $0 live starting balance (help.alpha-futures.com article 9491999, updated 2026-07-15: 'Maximum Loss Limit stops trailing at the account starting balance on all of our accounts'), a contract limit of 2 minis / 20 micros until the MLL locks at $0 and 4 minis / 40 micros from then on (Path To Live Structure, article 10743344: 'Contracts (after MLL reaches $0 balance)'; keyed on the drawdown lock itself, so a later withdrawal never drops the tier, and an intraday balance above $2,000 does not raise it before the end-of-day lock), and the 80%-split 'Alpha Futures Live Program' path only. `payoutFloor: dollars(0)` plus `requiresLockForWithdrawal: false` together model live.md's own confirmed payout rule ('daily, uncapped withdrawals on any of their gains above starting live balance') exactly -- this is a materially different, more permissive formula than TptLive.ts's 'withdraw down to the current trailing floor' rule, not the same mechanism reused. Two confirmed-but-unmodeled gaps, both deliberate: (1) the alternative 60%-split 'Alpha Prime Program' path has its own separate, uncapped-here salary mechanic (50% of Qualified-stage sim profit, up to $75,000, paid as a 12-month salary) with no equivalent concept anywhere in LivePlan -- modeling it would require a new capability, not a config tweak, so only the simpler 80% path is built; (2) live.md's own DLL row describes a 'Scaling Daily Loss Limit (30% of account)' for Live, but LivePlan's constructor only allows liveDrawdown XOR liveDailyLossLimit, never both, and this plan already needs the MLL drawdown to represent the confirmed bust condition -- the scaling DLL cannot be represented alongside it under the current class shape (compounded by live.md's own admission that no starting dollar floor is stated for the DLL under the current $0-start structure). maxConsecutiveIdleDays is left unset: live.md confirms Live's inactivity handling is discretionary Performance-Team review, not a fixed day-count, so inventing one would be less accurate than modeling none.",
        "STANDARD_CONTRACT_LIMITS' and ZERO_FUNDED_CONTRACT_LIMITS' Tiered tiers were checked against this session's own general tierBasis fix (ContractLimits.ts, closing a real bug where the shared simulator recomputed a Tiered funded contract limit on every trade within a day using live intraday profit, rather than freezing it for the session as several other firms' own sources confirm -- see e.g. LucidFlex's/TopStep's/E8 Zero's own notes). Left at the default (TierBasis.LiveProfit, current live-recompute behavior) for both Standard and Zero: neither standard.md nor zero.md states the recalculation timing for its own Scaling Plan one way or the other, and this file's own sourcing convention is to not assume a sibling firm's confirmed timing carries over by analogy. Not modeled as TierBasis.SessionOpenProfit, not asserted as confirmed-intraday either -- genuinely unconfirmed.",
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
        drawdown: trailingLockedAtStart(size.maxDrawdown),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(size.monthlyFee),
            oneTimeEval: dollars(0),
            reset: dollars(size.resetFee),
        },
        fundedDrawdown: trailingLockedAtStart(size.fundedMaxDrawdown),
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Advanced,
        },
        label: planLabel(size.accountSize, 'Advanced'),
        maxFundedAccounts: 3,
        minPayoutRequest: size.minPayoutRequest,
        minTradingDays: 3,
        payoutRequestCap: size.payoutRequestCap,
        profitTarget: size.profitTarget,
        ...QUALIFIED_PAYOUT_RULES,
    };
}

function buildStandardPlan(size: AfStandardSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        contractLimits: STANDARD_CONTRACT_LIMITS,
        drawdown: trailingLockedAtStart(size.maxDrawdown),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(size.monthlyFee),
            oneTimeEval: dollars(0),
            reset: dollars(size.resetFee),
        },
        fundedConsistency: { kind: 'set', rule: QUALIFIED_CONSISTENCY },
        fundedDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        fundedReset: { ...QUALIFIED_RESET_RULES, fee: size.qualifiedResetFee },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Standard,
        },
        label: planLabel(size.accountSize, 'Standard'),
        maxFundedAccounts: 5,
        minPayoutRequest: size.minPayoutRequest,
        minTradingDays: 2,
        payoutRequestCap: size.payoutRequestCap,
        profitTarget: size.profitTarget,
        ...QUALIFIED_PAYOUT_RULES,
    };
}

function buildZeroPlan(size: AfZeroSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: QUALIFIED_CONSISTENCY,
        contractLimits: {
            ...ZERO_EVAL_CONTRACT_LIMITS,
            ...ZERO_FUNDED_CONTRACT_LIMITS,
        },
        drawdown: trailingLockedAtStart(size.maxDrawdown),
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
        fundedReset: { ...QUALIFIED_RESET_RULES, fee: size.qualifiedResetFee },
        id: {
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Zero,
        },
        label: planLabel(size.accountSize, 'Zero'),
        maxFundedAccounts: 5,
        minPayoutRequest: size.minPayoutRequest,
        minTradingDays: 1,
        payoutRequestCap: size.payoutRequestCap,
        profitTarget: size.profitTarget,
        ...QUALIFIED_PAYOUT_RULES,
    };
}

function trailingLockedAtStart(amount: Dollars): EodTrailingDrawdown {
    return new EodTrailingDrawdown({
        amount,
        lock: { atProfit: amount, lockedThreshold: lockThresholdAt(0) },
    });
}
