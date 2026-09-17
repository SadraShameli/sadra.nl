import {
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    PayoutBuffer,
    PayoutFloorEffect,
    type PlanInit,
    profitShareMultiplier,
    TradeifyVariant,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const PROFIT_TARGET_RATIO = 0.06;
const LOCK_OFFSET = 100;
const SELECT_RESET_FEE = 99;

const CONTRACT_LIMITS = {
    evalMicros: contracts(40),
    evalMinis: contracts(4),
    fundedMicros: {
        kind: ContractLimitKind.Flat,
        maxContracts: contracts(40),
    },
    fundedMinis: {
        kind: ContractLimitKind.Flat,
        maxContracts: contracts(4),
    },
} as const;

const SCALING_FUNDED_DLL: DailyLossLimitConfig = {
    kind: DailyLossLimitKind.Tiered,
    tiers: [
        {
            dailyLossLimit: dollars(1250),
            maxContracts: contracts(4),
            minProfit: dollars(0),
        },
        {
            dailyLossLimit: dollars(2000),
            maxContracts: contracts(4),
            minProfit: dollars(3000),
        },
    ],
};

const GROWTH_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 145,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(3000),
        resetFee: 95,
    },
] as const;

const SELECT_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 165,
        maxDrawdown: dollars(2000),
        resetFee: SELECT_RESET_FEE,
    },
] as const;

const LIGHTNING_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 492,
        maxDrawdown: dollars(2000),
        minPayoutProfit: dollars(3000),
        resetFee: 492,
    },
] as const;

type TradeifyGrowthSize = (typeof GROWTH_SIZES)[number];
type TradeifyLightningSize = (typeof LIGHTNING_SIZES)[number];
type TradeifySelectSize = (typeof SELECT_SIZES)[number];

export class Tradeify extends TradingFirm {
    readonly displayName = 'Tradeify';
    readonly id = FirmId.Tradeify;
    readonly notes = [
        'Select Daily funded payouts can be requested up to 2x the fresh profit earned since the prior payout, not a flat percentage of profit like Select Flex. That multiplier is payoutProfitShare; the hard per-account dollar ceiling is payoutRequestCap; the required balance buffer above starting balance is payoutBuffer.',
        "Select Daily's payoutRequestCap was $1,250, flagged in an earlier pass as possibly $1,000 pending primary-source access. A scripted, panel-based extraction of propfirmmatch.com (2026-09-14), cross-checked directly against Tradeify's own Overview tab Payout Policy table, confirms $1,000 -- corrected.",
        "Select Flex's payoutRequestCap was $2,500; the same 2026-09-14 extraction confirms $3,000 ('up to 50% of total profit... capped at $3,000 per payout for a 50K account'), matching Tradeify's own Overview tab exactly. Corrected.",
        "Lightning's minDaysAfterPassForPayout was 5; Tradeify's own detail panel states payouts are 'Not Fixed (Payout Profit Goals are the profits required between payout requests)' with 'No minimum trading days required' -- corrected to 0.",
        "Lightning's minPayoutRequest is set explicitly to match its own payoutLadder.minRequestAmount ($1,000). Left unset, it would silently inherit minPayoutProfit's unrelated value instead, the same fallback-chain bug shape confirmed and fixed for Take Profit Trader.",
        "All four plans require at least one trade per calendar week (Monday-Friday) to stay active, previously unmodeled (maxConsecutiveIdleDays was unset firm-wide). Set to 7 for all four plans, matching the same mechanism used elsewhere in this codebase. An earlier pass here framed this as a funded-stage-only rule (citing Tradeify's in-app Overview tab, 'Maximum Account Idle Time (Funded Accounts)'); Tradeify's own public Guidelines for Traders help article was since re-read directly and states the rule applies to both evaluation and funded accounts ('To keep your funded or evaluation account active, you must place at least one trade per week'), corroborated by Tradeify's Funded Trader Agreement (Section 6.9). This field has no eval/funded split in this codebase regardless, so the numeric value (7) and its effect are unchanged either way -- only the note's characterization of scope was wrong, now corrected. The in-app Overview tab panel this note previously cited could not be independently re-checked (JS-rendered, blocked to every fetch method tried), so it's unknown whether Tradeify's own two surfaces actually agree with each other.",
        "Select's evaluation-phase 40% consistency rule can be paid-upgraded to a looser 50% limit (with a 2-day minimum pass period) for an extra fee that scales by account size (+$40 at 50K), confirmed on Tradeify's own Overview tab but not modeled -- a purchasable rule-variant choice, not a price discount, the same judgement call already made for Lucid's DLL toggle and MyFundedFutures' Flex DLL add-on.",
        "Select Daily and Select Flex may be the same underlying evaluation product previewed under two different post-pass payout tracks rather than two genuinely separate purchasable challenges -- both are priced identically ($165 list) with an identical reset fee, and Tradeify's own Overview tab states 'You do NOT choose your payout policy until after you pass the evaluation.' Modeled here as two independently simulatable plan variants (a trader picks which payout track to assume in advance for simulation purposes), not as two separate purchases a trader would make simultaneously.",
        "Select's reset fee was $109 with no clean primary-source confirmation (secondary sources scattered across $85/$95/$99/$109 and two incompatible business models). Resolved 2026-09-14 by reading tradeify.co/select-plan's own live pricing data directly (the page bakes its pricing tables into inline JS objects server-rendered into the static HTML, retrievable via a plain fetch once the right script tag is found): Select 50K's own panel reads 'Reset Fee: $99 -- Allowed up to 10 resets per month' across all three broker tabs (Tradovate/WealthCharts/Tradesea), with Profit Target $3,000 / Drawdown $2,000 / Consistency 40% matching every other already-confirmed Select 50K figure in this file. Corrected from $109 to $99. The $159/month-subscription-with-free-reset story some secondary sources described turned out to belong to Tradeify's separate Lightning product, not Select.",
        "A monthly-renamed promo code is confirmed running 4+ consecutive months at 30-50% off, standing rather than seasonal -- the bulkDiscount mechanism already modeled on this file's Growth/Select plans is self-documenting in code, so this note is about the separate coupon-code discount only.",
        "The site's own live pricing data explicitly tags $50K Growth/Select/Lightning as `subscription: 'one time'` -- no monthly fee exists for any of them, matching this codebase's existing model exactly; no change needed.",
        "A separate, unrelated $359-to-$251 'before/after' banner appears on the same pricing page and is likely a non-functional template artifact rather than real per-tier pricing (the identical pair appears on every account-size card regardless of the labeled size, and is static across snapshots months apart) -- not encoded anywhere, flagged here only so a future re-check doesn't mistake it for a real, missed discount.",
    ];
    readonly plans = [
        ...GROWTH_SIZES.map((s) => this.buildPlan(buildGrowthPlan(s))),
        ...SELECT_SIZES.map((s) => this.buildPlan(buildSelectFlexPlan(s))),
        ...SELECT_SIZES.map((s) => this.buildPlan(buildSelectDailyPlan(s))),
        ...LIGHTNING_SIZES.map((s) => this.buildPlan(buildLightningPlan(s))),
    ];
    readonly website = 'https://tradeify.co';
}

const MAX_FUNDED_ACCOUNTS = 5;
const INACTIVITY_CLOSURE_DAYS = 7;

function buildGrowthPlan(size: TradeifyGrowthSize): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
    return {
        accountSize: size.accountSize,
        bulkDiscount: { minAccounts: 5, percent: fraction(0.05) },
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.35),
        ),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: {
            amount: dollars(1250),
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        fundedDailyLossLimit: SCALING_FUNDED_DLL,
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Growth,
        },
        label: planLabel(size.accountSize, 'Growth'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: size.minPayoutProfit,
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(500),
        minQualifyingDayProfit: dollars(150),
        minTradingDays: 1,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutLadder: {
            capsAtLastStep: true,
            minRequestAmount: dollars(500),
            steps: [1500, 2000, 2500, 3000],
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}

function buildLightningPlan(size: TradeifyLightningSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: null,
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: SCALING_FUNDED_DLL,
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        fundedConsistencyLadder: {
            steps: [fraction(0.2), fraction(0.25), fraction(0.3)],
        },
        fundedDailyLossLimit: SCALING_FUNDED_DLL,
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Lightning,
        },
        isInstantFunded: true,
        label: planLabel(size.accountSize, 'Lightning Funded'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: size.minPayoutProfit,
        minPayoutProfitPerCycle: dollars(2000),
        minPayoutRequest: dollars(1000),
        minTradingDays: 0,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutLadder: {
            capsAtLastStep: true,
            minRequestAmount: dollars(1000),
            steps: [2000, 2000, 2000, 2500],
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: dollars(0),
    };
}

function buildSelectDailyPlan(size: TradeifySelectSize): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
    return {
        accountSize: size.accountSize,
        bulkDiscount: { minAccounts: 5, percent: fraction(0.05) },
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        fundedDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectDaily,
        },
        label: planLabel(size.accountSize, 'Select Daily'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0.01),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(250),
        minTradingDays: 3,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutProfitShare: profitShareMultiplier(2),
        payoutRequestCap: dollars(1000),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}

function buildSelectFlexPlan(size: TradeifySelectSize): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
    return {
        accountSize: size.accountSize,
        bulkDiscount: { minAccounts: 5, percent: fraction(0.05) },
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectFlex,
        },
        label: planLabel(size.accountSize, 'Select Flex'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(0.01),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(250),
        minQualifyingDayProfit: dollars(150),
        minTradingDays: 3,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutProfitShare: profitShareMultiplier(0.5),
        payoutRequestCap: dollars(3000),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}
