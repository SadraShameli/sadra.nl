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

const SELECT_CONTRACT_LIMITS = {
    evalMicros: contracts(40),
    evalMinis: contracts(4),
    fundedMicros: {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(20), minBalance: dollars(0) },
            { maxContracts: contracts(30), minBalance: dollars(1500) },
            { maxContracts: contracts(40), minBalance: dollars(2000) },
        ],
    },
    fundedMinis: {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(2), minBalance: dollars(0) },
            { maxContracts: contracts(3), minBalance: dollars(1500) },
            { maxContracts: contracts(4), minBalance: dollars(2000) },
        ],
    },
} as const;

const SCALING_FUNDED_DLL: DailyLossLimitConfig = {
    isEffectiveNextSession: true,
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
        "Select Daily's payoutRequestCap was $1,250, flagged in an earlier pass as possibly $1,000 pending primary-source access. A scripted, panel-based extraction of propfirmmatch.com (2026-09-14), cross-checked directly against Tradeify's own Overview tab Payout Policy table, confirmed $1,000 as of that pass. This repo's own re-audited select-daily.md doc tree (2026-09-20) has since found a Sep-1-2026 cutover: $1,000 for accounts purchased before that date, $1,250 for accounts purchased on/after it. Corrected back to $1,250 to match the currently-applicable figure for a new purchase.",
        "Select Flex's payoutRequestCap was $2,500; the 2026-09-14 extraction confirmed $3,000 ('up to 50% of total profit... capped at $3,000 per payout for a 50K account'), matching Tradeify's own Overview tab at the time. This repo's own re-audited select-flex.md doc tree (2026-09-20) has since found the mirror-image Sep-1-2026 cutover: $3,000 before that date, $2,500 on/after. Corrected back to $2,500 to match the currently-applicable figure for a new purchase.",
        "Lightning's minDaysAfterPassForPayout was 5; Tradeify's own detail panel states payouts are 'Not Fixed (Payout Profit Goals are the profits required between payout requests)' with 'No minimum trading days required' -- corrected to 0.",
        "Lightning's minPayoutRequest is set explicitly to match its own payoutLadder.minRequestAmount ($1,000). Left unset, it would silently inherit minPayoutProfit's unrelated value instead, the same fallback-chain bug shape confirmed and fixed for Take Profit Trader.",
        "All four plans require at least one trade per calendar week (Monday-Friday) to stay active, previously unmodeled (maxConsecutiveIdleDays was unset firm-wide). Set to 7 for all four plans, matching the same mechanism used elsewhere in this codebase. An earlier pass here framed this as a funded-stage-only rule (citing Tradeify's in-app Overview tab, 'Maximum Account Idle Time (Funded Accounts)'); Tradeify's own public Guidelines for Traders help article was since re-read directly and states the rule applies to both evaluation and funded accounts ('To keep your funded or evaluation account active, you must place at least one trade per week'), corroborated by Tradeify's Funded Trader Agreement (Section 6.9). This field has no eval/funded split in this codebase regardless, so the numeric value (7) and its effect are unchanged either way -- only the note's characterization of scope was wrong, now corrected. The in-app Overview tab panel this note previously cited could not be independently re-checked (JS-rendered, blocked to every fetch method tried), so it's unknown whether Tradeify's own two surfaces actually agree with each other.",
        "Select's evaluation-phase 40% consistency rule can be paid-upgraded to a looser 50% limit (with a 2-day minimum pass period) for an extra fee, confirmed on Tradeify's own Overview tab but not modeled -- a purchasable rule-variant choice, not a price discount, the same judgement call already made for Lucid's DLL toggle and MyFundedFutures' Flex DLL add-on. The dollar figure was previously recorded as +$40 at 50K; a live checkout screenshot (2026-09-17) shows the actual current price is +$200 at 50K -- corrected. The 'scales by account size' framing for the other three sizes remains unconfirmed (only 50K's checkout was observed directly).",
        "Select Daily and Select Flex may be the same underlying evaluation product previewed under two different post-pass payout tracks rather than two genuinely separate purchasable challenges -- both are priced identically ($165 list) with an identical reset fee, and Tradeify's own Overview tab states 'You do NOT choose your payout policy until after you pass the evaluation.' Modeled here as two independently simulatable plan variants (a trader picks which payout track to assume in advance for simulation purposes), not as two separate purchases a trader would make simultaneously.",
        "Select's reset fee was $109 with no clean primary-source confirmation (secondary sources scattered across $85/$95/$99/$109 and two incompatible business models). A 2026-09-14 pass reading tradeify.co/select-plan's own live pricing data directly (the page bakes its pricing tables into inline JS objects server-rendered into the static HTML, retrievable via a plain fetch once the right script tag is found) found Select 50K's own panel reading 'Reset Fee: $99 -- Allowed up to 10 resets per month' across all three broker tabs (Tradovate/WealthCharts/Tradesea), with Profit Target $3,000 / Drawdown $2,000 / Consistency 40% matching every other already-confirmed Select 50K figure in this file, and set the modeled fee to $99. This repo's own re-audited select-daily.md/select-flex.md doc tree (2026-09-20) treats this as a live, still-open conflict between Tradeify's own Pricing Reference article ($109) and its checkout panel ($99), not a settled question. $99 remains the engine's modeled figure pending Tradeify resolving the discrepancy between its own two current sources; do not treat it as a settled fact. The $159/month-subscription-with-free-reset story some secondary sources described turned out to belong to Tradeify's separate Lightning product, not Select.",
        "A monthly-renamed promo code is confirmed running 4+ consecutive months at 30-50% off, standing rather than seasonal -- the bulkDiscount mechanism already modeled on this file's Growth/Select plans is self-documenting in code, so this note is about the separate coupon-code discount only. A live checkout screenshot (2026-09-17) shows the exact current tiering: the banner reads '40% off, 5 time use, then 30% off', and a real 5x Select-50K bundle order in that same checkout applied exactly 30% (-$294.90 off a $983.00 pre-discount subtotal) -- confirming the code drops from 40% to 30% after its first 5 uses, not a vague 30-50% range. The same checkout independently reconfirms this file's modeled bulkDiscount percent exactly: 5 x $165 list = $825, 5% off = $41.25, matching the displayed 'save $42 extra' to the dollar, and the discount applied only to the account cost, not to the separate +$200 consistency-upgrade add-on -- consistent with this codebase's own scoping of bulkDiscountFactor to activationFee/evalFee only.",
        "The site's own live pricing data explicitly tags $50K Growth/Select/Lightning as `subscription: 'one time'` -- no monthly fee exists for any of them, matching this codebase's existing model exactly; no change needed.",
        "A separate, unrelated $359-to-$251 'before/after' banner appears on the same pricing page and is likely a non-functional template artifact rather than real per-tier pricing (the identical pair appears on every account-size card regardless of the labeled size, and is static across snapshots months apart) -- not encoded anywhere, flagged here only so a future re-check doesn't mistake it for a real, missed discount.",
        "Select Daily's and Select Flex's funded contract limit was flat 4 mini/40 micro from day one, matching Growth's and Lightning's convention. This repo's own re-audited select-daily.md/select-flex.md doc tree directly confirms both Select products instead have a progressive scaling ramp: 2 mini/20 micro from $0 simulated profit, 3/30 from $1,500 profit, 4/40 (ceiling) from $2,000 profit -- Growth and Lightning are unaffected (their docs confirm a flat 4/40 funded limit that matches the engine). Corrected: Select Daily/Flex now use a dedicated SELECT_CONTRACT_LIMITS with ContractLimitKind.Tiered funded minis/micros keyed on the same profit-threshold convention already used by Apex's/E8 Zero's own tiered limits (ContractLimitTier.minBalance is compared against accountProfit, not raw balance, per PositionSizing.ts's resolveContractLimit).",
        "Select Flex's 50% payout-eligibility cap was modeled via payoutProfitShare, which FundedCycleTracker computes against cycle-since-last-payout profit, not total account profit. select-flex.md's own worked payout example computes the 50% share against TOTAL profit since the account's starting balance, not cycle profit -- confirmed by re-deriving the doc's own second-payout example against the two formulas (cycle-based gave $1,375, the doc's stated figure is $2,000). Select Daily's own identical-looking payoutProfitShare usage is unaffected -- its own worked example explicitly bases its 2x multiplier on cycle-since-last-payout profit, so cycle-based is correct there. Corrected: Select Flex now uses payoutBalanceShareCap (fraction of total accountProfit, an existing PlanInit field) instead of payoutProfitShare.",
        "Growth's and Lightning's scaling funded Daily Loss Limit (SCALING_FUNDED_DLL, $1,250 up to $2,000 once EOD balance reaches $53,000/6% profit) was selecting its tier from live intraday profit, so the higher DLL could apply mid-day the instant balance crossed the threshold. Both plans' own sources state the increase is 'effective the next trading session, not immediately.' Corrected: TieredDailyLossLimit now supports an `isEffectiveNextSession` option (selecting the tier from the prior day's confirmed EOD close profit instead of today's live profit), set true on SCALING_FUNDED_DLL. Apex's and TopStep's own, unrelated uses of DailyLossLimitKind.Tiered are unaffected -- isEffectiveNextSession defaults to false, preserving their existing immediate-application behavior (TopStep's own notes explicitly disclose and rely on that immediate-application simplification).",
        "Lightning Funded has no reset mechanism at all per its own sources ('failure is permanent, must purchase a new account'), but fees.reset still models a $492 value (LIGHTNING_SIZES.resetFee) for Lightning, reused as the effective cost of purchasing a replacement account after a bust -- not a real per-reset charge. This repo's own re-audited lightning.md doc tree independently flags this as a genuine engine/doc disagreement; documented here rather than silently zeroed, since the simulator's own use of fees.reset for Lightning's isInstantFunded flow was not independently re-audited this pass.",
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
        contractLimits: SELECT_CONTRACT_LIMITS,
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
        payoutRequestCap: dollars(1250),
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
        contractLimits: SELECT_CONTRACT_LIMITS,
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
        payoutBalanceShareCap: fraction(0.5),
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutRequestCap: dollars(2500),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}
