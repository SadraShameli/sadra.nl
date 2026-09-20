import {
    ApexVariant,
    ConsistencyRule,
    ConsistencyScope,
    type ContractLimitConfig,
    ContractLimitKind,
    contracts,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    IntradayTrailingDrawdown,
    PayoutBuffer,
    type PlanInit,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const LOCK_OFFSET = 100;

const SIZES = [
    {
        accountSize: dollars(50_000),
        contractLimits: {
            evalMicros: contracts(60),
            evalMinis: contracts(6),
        },
        eod: {
            activation: 139,
            evalCost: 550,
            minQualifyingDayProfit: dollars(250),
            payoutLadderSteps: [1500, 1500, 2000, 2500, 2500, 3000],
        },
        evalDailyLossLimit: dollars(1000),
        fundedDllTiers: [
            {
                dailyLossLimit: dollars(1000),
                maxContracts: contracts(2),
                minProfit: dollars(0),
            },
            {
                dailyLossLimit: dollars(1000),
                maxContracts: contracts(3),
                minProfit: dollars(1500),
            },
            {
                dailyLossLimit: dollars(2000),
                maxContracts: contracts(4),
                minProfit: dollars(3000),
            },
            {
                dailyLossLimit: dollars(3000),
                maxContracts: contracts(4),
                minProfit: dollars(6000),
            },
        ],
        intraday: {
            activation: 59,
            evalCost: 249,
            minQualifyingDayProfit: dollars(200),
            payoutLadderSteps: [1500, 2000, 2500, 2500, 3000, 3000],
        },
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
    },
] as const;

const MIN_REQUEST_AMOUNT = 500;
const MAX_LIFETIME_PAYOUTS = 6;
const EVAL_ACCESS_CALENDAR_DAYS = 30;
const TRADING_DAYS_PER_CALENDAR_WEEK = 5;
const MAX_EVAL_TRADING_DAYS = Math.round(
    (EVAL_ACCESS_CALENDAR_DAYS * TRADING_DAYS_PER_CALENDAR_WEEK) / 7,
);
const INACTIVITY_CLOSURE_DAYS = 30;

type ApexSize = (typeof SIZES)[number];

export class ApexTraderFunding extends TradingFirm {
    readonly displayName = 'Apex Trader Funding';
    readonly id = FirmId.Apex;
    readonly notes = [
        "minPayoutRequest is set explicitly to match this plan's own payoutLadder.minRequestAmount ($500). Left unset, it would silently inherit minPayoutProfit's unrelated $2,600 buffer-zone value instead, which the CLI displays as the minimum request even though the ladder already governs the actual withdrawal floor at runtime, the same fallback-chain bug shape confirmed and fixed for Take Profit Trader.",
        "No recurring per-cycle profit requirement distinct from the 5-qualifying-day ($250/day EOD, $200/day Intraday) and 50% consistency checks was found in Apex's help center, so minPayoutProfitPerCycle is left unset rather than guessed; it defaults to $0 (both of those other gates are already enforced separately by this engine).",
        "support.apextraderfunding.com's 'Inactivity Policy on Performance Accounts (PA)' (checked via search, apextraderfunding.com's own primary help-center pages return HTTP 403 to automated fetch; this repo's own re-audited eod.md doc tree has since cited this identical article directly at apextraderfunding.com/help-center/billing/inactivity-policy-on-performance-accounts-pa, fetched 2026-09-19 as a logged-in browser dump -- not via search, not 403-blocked, and not on the support subdomain) states funded PA accounts on both EOD and Intraday plans are closed after failing to record at least 2 trading days with $50+ net profit within any rolling 30 calendar days (dormant at day 15, second notice at day 20, permanent closure at day 30; evaluation accounts are explicitly exempt). Previously unmodeled (maxConsecutiveIdleDays was left unset). Set to 30 for both funded plans, matching the mechanism used for MFFU/E8/FundedNext/TopStep/Lucid. Two known approximations, same shape as TopStep's: (a) this engine's field resets on ANY traded day regardless of profitability, while Apex's real rule specifically requires profitable ($50+) days, so it understates closure risk for an actively-trading-but-unprofitable account; (b) the field is Plan-wide with no eval/funded split, so it nominally also applies during the simulated eval phase, which has no such rule in reality -- inert there at the default idleDayProbability of 0.",
        "apextraderfunding.com/help-center/eod-trailing-drawdown-accounts/eod-drawdown-explained/ and .../intraday-trailing-drawdown-accounts/intraday-trailing-drawdown-explained/ (live-confirmed via search plus an independent third-party quote, primary pages blocked by HTTP 403) describe platform-dependent eval-phase drawdown behavior: on Rithmic and Wealthcharts, the EOD/Intraday trailing threshold stops trailing and freezes at the Target Profit Balance (accountSize + profitTarget = $53,000 for this $50K plan) once the highest balance reaches Target Profit Balance + Max Drawdown ($55,000); on Tradovate it trails indefinitely with no lock. Both eval drawdowns here were previously configured with no lock at all (an unconditional never-locks model), which silently modeled only the Tradovate case. Now locked per the Rithmic/Wealthcharts rule via evalLockOf(); the engine has no per-platform axis, so Tradovate's genuinely-unlocked eval variant is not separately modeled -- this is a deliberate, disclosed simplification, not an oversight.",
        "apextraderfunding.com's Scaling Levels (PA) / Daily Loss Limit help-center articles (live-confirmed via search, primary pages blocked by HTTP 403) state PA position size and Daily Loss Limit are assigned together from the same profit-tiered Level system (Level 1-4), not granted at full size from day one. fundedMinis/fundedMicros were previously ContractLimitKind.Flat (constant 4/40 regardless of funded profit); switched to Tiered, derived directly from the same fundedDllTiers breakpoints ($0/$1,500/$3,000/$6,000 profit -> 2/3/4/4 minis) already modeled here for the Daily Loss Limit, since Apex's own help center confirms both are tied to the identical Level system (micros scaled x10, matching this plan's existing eval 60/6 and prior flat 40/4 ratio).",
        "The confirmed SAVENOW coupon (up to 90% off, and per the coupon page's own terms, explicitly excluded from resets and PA activation fees) applies to Apex's revived Legacy subscription product line, not the current one-time-fee flagship this codebase models -- a user should not apply a 90% discount to the modeled plan.",
        'The confirmed March 1, 2026 fee-model change itself (one-time fee, no subscription, no reset fee -- Apex\'s own FAQ: "Are there reset fees? There are no reset fees. If an Evaluation fails, the only way to continue is by purchasing a new one.") is the reason monthlySubscription/reset are already $0/= evalCost in this codebase, so a future re-verification pass doesn\'t mistake that for stale data.',
        "The confirmed 5-Pack Evaluation Bundle (Apex's own help article confirms it exists and covers 50K, for both Intraday and EOD) previously had its exact discount percentage flagged as unconfirmed because the article pointed to a client-side-rendered product picker this sweep couldn't read. This repo's own re-audited eod.md doc tree has since read the homepage's `window.productPickerConfig` catalog JSON directly and states exact, per-size, per-path 5-Pack dollar prices (standard path 25K $1,950/50K $2,450/100K $4,450/150K $8,950; No-Activation-Fee path 25K $4,450/50K $5,450, unavailable for 100K/150K) -- the underlying data is no longer unreadable, though the decision not to build a bulk-purchase mechanism for Apex remains unchanged (a scope choice, not a data-availability one).",
        "ApexLive.ts's withdrawableAmount (via core/LivePlan.ts) previously computed the post-lock payout floor as balance minus the drawdown lock's own lockedThreshold (start + $100), understating the real floor by $3,000: this repo's own re-audited live.md doc tree confirms twice verbatim that payout-eligible profit is balance minus the $3,100 Buffer Requirement/Safety Net, a distinct concept from the $100 drawdown-lock floor. Corrected by adding a `payoutFloor` field to LivePlanInit/LivePlan (defaulting to null, i.e. falling back to the old lockedThreshold-based behavior for every other live firm, none of which have a confirmed distinct payout floor), and setting ApexLive.ts's payoutFloor to dollars(DRAWDOWN_AMOUNT + LOCK_OFFSET) (=$3,100).",
    ];
    readonly plans = SIZES.flatMap((s) => [
        this.buildPlan(buildEodPlan(s)),
        this.buildPlan(buildIntradayPlan(s)),
    ]);
    readonly website = 'https://apextraderfunding.com';
}

const MAX_FUNDED_ACCOUNTS = 20;

function buildEodPlan(size: ApexSize): PlanInit {
    const pricing = size.eod;
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.5),
        ),
        contractLimits: {
            ...size.contractLimits,
            ...fundedContractLimitsOf(size),
        },
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: evalLockOf(size),
        }),
        evalDailyLossLimit: {
            amount: size.evalDailyLossLimit,
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(pricing.activation),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(pricing.evalCost),
            reset: dollars(pricing.evalCost),
        },
        fundedDailyLossLimit: fundedDailyLossLimitOf(size),
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: lockOf(size),
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        },
        label: planLabel(size.accountSize, 'EOD trailing'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxEvalTradingDays: MAX_EVAL_TRADING_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(size.maxDrawdown + 600),
        minPayoutRequest: dollars(MIN_REQUEST_AMOUNT),
        minQualifyingDayProfit: pricing.minQualifyingDayProfit,
        minTradingDays: 0,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
        payoutLadder: {
            deniesIfUnaffordable: true,
            minRequestAmount: dollars(MIN_REQUEST_AMOUNT),
            steps: pricing.payoutLadderSteps,
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        profitTarget: size.profitTarget,
    };
}

function buildIntradayPlan(size: ApexSize): PlanInit {
    const pricing = size.intraday;
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.5),
        ),
        contractLimits: {
            ...size.contractLimits,
            ...fundedContractLimitsOf(size),
        },
        drawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: evalLockOf(size),
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(pricing.activation),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(pricing.evalCost),
            reset: dollars(pricing.evalCost),
        },
        fundedDailyLossLimit: fundedDailyLossLimitOf(size),
        fundedDrawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: lockOf(size),
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Intraday,
        },
        label: planLabel(size.accountSize, 'Intraday trailing'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxEvalTradingDays: MAX_EVAL_TRADING_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(size.maxDrawdown + 600),
        minPayoutRequest: dollars(MIN_REQUEST_AMOUNT),
        minQualifyingDayProfit: pricing.minQualifyingDayProfit,
        minTradingDays: 0,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
        payoutLadder: {
            deniesIfUnaffordable: true,
            minRequestAmount: dollars(MIN_REQUEST_AMOUNT),
            steps: pricing.payoutLadderSteps,
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        profitTarget: size.profitTarget,
    };
}

function evalLockOf(size: ApexSize) {
    return {
        atProfit: dollars(size.profitTarget + size.maxDrawdown),
        lockedThreshold: lockThresholdAt(size.profitTarget),
    };
}

function fundedContractLimitsOf(size: ApexSize): {
    fundedMicros: ContractLimitConfig;
    fundedMinis: ContractLimitConfig;
} {
    return {
        fundedMicros: {
            kind: ContractLimitKind.Tiered,
            tiers: size.fundedDllTiers.map((tier) => ({
                maxContracts: contracts(tier.maxContracts * 10),
                minBalance: dollars(tier.minProfit),
            })),
        },
        fundedMinis: {
            kind: ContractLimitKind.Tiered,
            tiers: size.fundedDllTiers.map((tier) => ({
                maxContracts: tier.maxContracts,
                minBalance: dollars(tier.minProfit),
            })),
        },
    };
}

function fundedDailyLossLimitOf(size: ApexSize): DailyLossLimitConfig {
    return { kind: DailyLossLimitKind.Tiered, tiers: size.fundedDllTiers };
}

function lockOf(size: ApexSize) {
    return {
        atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
        lockedThreshold: lockThresholdAt(LOCK_OFFSET),
    };
}
