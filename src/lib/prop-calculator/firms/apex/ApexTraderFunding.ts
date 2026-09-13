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
        "support.apextraderfunding.com's 'Inactivity Policy on Performance Accounts (PA)' (live-confirmed via search, apextraderfunding.com's own primary help-center pages return HTTP 403 to automated fetch) states funded PA accounts on both EOD and Intraday plans are closed after failing to record at least 2 trading days with $50+ net profit within any rolling 30 calendar days (dormant at day 15, second notice at day 20, permanent closure at day 30; evaluation accounts are explicitly exempt). Previously unmodeled (maxConsecutiveIdleDays was left unset). Set to 30 for both funded plans, matching the mechanism used for MFFU/E8/FundedNext/TopStep/Lucid. Two known approximations, same shape as TopStep's: (a) this engine's field resets on ANY traded day regardless of profitability, while Apex's real rule specifically requires profitable ($50+) days, so it understates closure risk for an actively-trading-but-unprofitable account; (b) the field is Plan-wide with no eval/funded split, so it nominally also applies during the simulated eval phase, which has no such rule in reality -- inert there at the default idleDayProbability of 0.",
        "apextraderfunding.com/help-center/eod-trailing-drawdown-accounts/eod-drawdown-explained/ and .../intraday-trailing-drawdown-accounts/intraday-trailing-drawdown-explained/ (live-confirmed via search plus an independent third-party quote, primary pages blocked by HTTP 403) describe platform-dependent eval-phase drawdown behavior: on Rithmic and Wealthcharts, the EOD/Intraday trailing threshold stops trailing and freezes at the Target Profit Balance (accountSize + profitTarget = $53,000 for this $50K plan) once the highest balance reaches Target Profit Balance + Max Drawdown ($55,000); on Tradovate it trails indefinitely with no lock. Both eval drawdowns here were previously configured with no lock at all (an unconditional never-locks model), which silently modeled only the Tradovate case. Now locked per the Rithmic/Wealthcharts rule via evalLockOf(); the engine has no per-platform axis, so Tradovate's genuinely-unlocked eval variant is not separately modeled -- this is a deliberate, disclosed simplification, not an oversight.",
        "apextraderfunding.com's Scaling Levels (PA) / Daily Loss Limit help-center articles (live-confirmed via search, primary pages blocked by HTTP 403) state PA position size and Daily Loss Limit are assigned together from the same profit-tiered Level system (Level 1-4), not granted at full size from day one. fundedMinis/fundedMicros were previously ContractLimitKind.Flat (constant 4/40 regardless of funded profit); switched to Tiered, derived directly from the same fundedDllTiers breakpoints ($0/$1,500/$3,000/$6,000 profit -> 2/3/4/4 minis) already modeled here for the Daily Loss Limit, since Apex's own help center confirms both are tied to the identical Level system (micros scaled x10, matching this plan's existing eval 60/6 and prior flat 40/4 ratio).",
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
