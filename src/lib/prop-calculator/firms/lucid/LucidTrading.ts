import {
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    type ContractLimits,
    contracts,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    type Dollars,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    IntradayTrailingDrawdown,
    LucidVariant,
    PayoutBuffer,
    PayoutFloorEffect,
    type PlanInit,
    profitShareMultiplier,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const PROFIT_TARGET_RATIO = 0.06;
const LOCK_OFFSET = 100;
const FIXED_DLL = dollars(1200);
const SCALING_DLL_SHARE = 0.6;
const INACTIVITY_CLOSURE_DAYS = 30;

const CONTRACT_LIMITS: ContractLimits = {
    evalMicros: contracts(40),
    evalMinis: contracts(4),
    fundedMicros: { kind: ContractLimitKind.Flat, maxContracts: contracts(40) },
    fundedMinis: { kind: ContractLimitKind.Flat, maxContracts: contracts(4) },
};

interface LucidDailySize {
    readonly accountSize: Dollars;
    readonly evalCost: number;
    readonly maxDrawdown: Dollars;
    readonly resetFee: number;
}

function flatDailyLossLimitOf(
    dailyLossLimit: Dollars | null,
): DailyLossLimitConfig {
    return dailyLossLimit === null
        ? { kind: DailyLossLimitKind.None }
        : { amount: dailyLossLimit, kind: DailyLossLimitKind.Flat };
}

function scalingDllAfterTrail(fixedDll: Dollars | null): DailyLossLimitConfig {
    return {
        afterLock: {
            kind: DailyLossLimitKind.PeakProfitShare,
            share: fraction(SCALING_DLL_SHARE),
        },
        beforeLock: flatDailyLossLimitOf(fixedDll),
        kind: DailyLossLimitKind.AfterThresholdLock,
    };
}

const DAILY_EOD_SIZES: readonly LucidDailySize[] = [
    {
        accountSize: dollars(50_000),
        evalCost: 165,
        maxDrawdown: dollars(2000),
        resetFee: 115,
    },
];

const DAILY_INTRADAY_SIZES: readonly LucidDailySize[] = [
    {
        accountSize: dollars(50_000),
        evalCost: 136,
        maxDrawdown: dollars(2000),
        resetFee: 95,
    },
];

const FLEX_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 136,
        maxDrawdown: dollars(2000),
        resetFee: 95,
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 172,
        maxDrawdown: dollars(2000),
        resetFee: 120,
    },
] as const;

const DIRECT_SIZES = [
    { accountSize: dollars(50_000), evalCost: 515, maxDrawdown: dollars(2000) },
] as const;

type LucidDirectSize = (typeof DIRECT_SIZES)[number];
type LucidFlexSize = (typeof FLEX_SIZES)[number];
type LucidProSize = (typeof PRO_SIZES)[number];

export class LucidTrading extends TradingFirm {
    readonly displayName = 'Lucid Trading';
    readonly id = FirmId.Lucid;
    readonly notes = [
        "Pro's minPayoutRequest is set explicitly to match its own payoutLadder.minRequestAmount ($500), rather than left to silently inherit minPayoutProfit's value by coincidence (currently also $500). Closes the same fallback-chain bug shape confirmed and fixed for Take Profit Trader before an unrelated future change to minPayoutProfit could silently desync it.",
        "Flex's minPayoutProfit and minPayoutProfitPerCycle are both set explicitly to $0.01: support.lucidtrading.com's LucidFlex Payouts article requires positive net profit (even $1) during each payout cycle with no first-vs-subsequent distinction ('Net Profit in Payout Cycle... during each payout cycle'), so the first payout must clear the same $0.01 floor as every later one rather than silently defaulting to $0. Pro's minPayoutProfitPerCycle is set to $500 (50K tier), matching Pro's own minPayoutProfit: support.lucidtrading.com's LucidPro Payouts article publishes a 'Minimum Profit Goal' table ($250/$500/$750/$1,000 for the 25K/50K/100K/150K tiers) stating 'This profit goal resets after each payout,' confirming the requirement recurs identically for every cycle, not only the first.",
        "support.lucidtrading.com's Inactivity Policy article states accounts across LucidPro, LucidFlex, and LucidDirect are deemed abandoned and permanently deleted after 30 calendar days with no trade resulting in at least $1 of net profit or loss. This was previously unmodeled for all three Lucid plans (maxConsecutiveIdleDays was left unset); now set to 30 for all three, matching the mechanism already used for E8 Futures/MyFundedFutures/FundedNext/TopStep.",
        "LucidPro's minDaysAfterPassForPayout was 0; live-verified 2026-09-14 via lucidtrading.com's own checkout/rules pages, whose Funded Rules panel lists 'Days to Payout: 3' as its own field, distinct from the $500 Payout Profit Target. Corrected to 3, the same payout-cadence-never-wired bug shape already found and fixed for FundedNext Rapid Pro this session.",
        "Both LucidPro and LucidFlex's eval checkout offer a purchasable Daily Loss Limit toggle, live-verified 2026-09-14 via lucidtrading.com's own checkout/rules pages: OFF (no DLL) or ON at $1,200. Modeled as two independently selectable plan variants per size (LucidVariant.Pro/ProNoDll, LucidVariant.FlexDll/Flex) rather than a note, since both configurations are real, purchasable products, not a cosmetic checkout option. Pro's funded rules page shows the $1,200 pre-lock DLL paired with a 'LucidScale DLL' of 60% of peak EOD balance once the drawdown floor locks, and the OFF variant's funded rules page shows the identical 60%-of-peak row with only the pre-lock DLL itself replaced by NONE -- both LucidVariant.Pro and LucidVariant.ProNoDll therefore share the same scalingDllAfterTrail post-lock mechanism, differing only in the pre-lock flat amount. Flex's funded rules page shows no equivalent post-lock scaling row for either DLL choice, so LucidVariant.FlexDll models a single flat $1,200 DLL for both eval and funded (inherited via the existing fundedDailyLossLimit ?? evalDailyLossLimit fallback), distinct from LucidVariant.Flex's no-DLL default.",
        "The DLL toggle IS price-neutral at the list-price level, confirmed and re-confirmed: a real checkout receipt for LucidFlex 50K with DLL ON selected shows a subtotal of exactly $136.00 (the plan's base list price, no addon line item of any kind) plus a standing 30%-off coupon (-$40.80) plus a separate 'DLL ON Promo' discount of -$5.00, totaling $90.20 -- a discount for choosing DLL ON, not a surcharge for choosing it OFF. This directly overturned an earlier, wrong reading of a backend addon-fee API table (fields named 'no-dll'/'fee'/'promoDiscount') that had been (incorrectly) interpreted as 'removing the DLL costs an extra $10-20 addon fee,' briefly landing here as base+addon pricing before being reverted once the real checkout receipt contradicted it directly. evalCost/resetFee for every DLL/no-DLL pair (Pro 172/120, Flex 136/95, Daily EOD 165/115, Daily Intraday 136/95) are identical regardless of the DLL toggle, exactly as first modeled.",
        "LucidPro's funded consistency rule was briefly changed to 35% based on lucidtrading.com's own backend plan-config API (fundConsistency: 0.35), which contradicted the 40% shown on the rendered LucidPro Funded Rules marketing page. Reverted back to 40% once a third, independent source -- propfirmmatch.com's own challenge-comparison table for LucidPro 50K, which states it verifies data 'from the firms themselves' -- also read 40%, not 35%. With two of three independent readings (the firm's own rendered page, and an independent third-party verifier) agreeing on 40% against a single internal JSON field, 40% is the better-supported value; the backend field likely reflects something other than the customer-facing consistency percentage, or is simply stale. Kept as its own note rather than silently folded into the original figure, since a genuine three-way source conflict and its resolution is exactly the kind of thing worth a future re-checker seeing.",
        "All four Lucid plan families (Direct, Flex, Pro, Daily) show an identical 'Max Size: 4 Mini OR 40 Micro(s)' contract limit on both their eval and funded-rules pages, live-verified 2026-09-14 directly from lucidtrading.com's rendered plan-card markup. Previously unmodeled firm-wide (contractLimits was left unset on every Lucid plan, displaying as 'contracts not recorded' in this tool). Set identically (4 minis/40 micros, both eval and funded, no scaling by profit) across every plan and every DLL/drawdown variant.",
        "LucidDirect's minDaysAfterPassForPayout was 0; the same live plan-card markup that confirmed the contract limit above also lists 'Min Day to Payout: 5' as its own field. Corrected to 5, the same payout-cadence-never-wired bug shape already found and fixed for FundedNext Rapid Pro and LucidPro this session.",
        "LucidDaily (50K), previously entirely unmodeled, added from live-read plan-card markup 2026-09-14: $3,000 target, $2,000 max loss, 50% eval-only consistency (explicit 'No Consistency in Funded'), a 'Daily Payouts' badge (modeled as minDaysAfterPassForPayout: 0, matching how FundedNext's own Rapid Daily plan is modeled in this codebase). Two independent checkout toggles, confirmed as separate button groups in the page markup: eval drawdown type (EOD or Intraday) and Daily Loss Limit (OFF or $1,200 ON, identical mechanism to Pro/Flex's toggle). Modeled as four independent plan variants (LucidVariant.DailyEod/DailyEodDll/DailyIntraday/DailyIntradayDll) rather than collapsing to one. Funded-side rules (payout split, payout ladder/cap, minPayoutProfit, funded minTradingDays) were not visible on the eval card fetched and are not independently confirmed for Daily; defaulted to this firm's own already-established, firm-wide figures (90% split, $500 min request, no explicit profit-per-cycle floor) by analogy rather than guessed at from nothing, and flagged here rather than presented as confirmed.",
        "LucidDaily's EOD and Intraday drawdown-type variants are priced differently, not identically as first modeled: live-verified 2026-09-14 directly against lucidtrading.com's own pricing-config JSON (planCode LDE050/LDI050), EOD costs $165 eval / $115 reset, Intraday costs $136 eval / $95 reset -- the DLL toggle within each drawdown type does not change price, mirroring the already-confirmed price-invariant DLL toggle on Pro/Flex. The same pricing-config JSON independently confirmed LucidPro ($172/$120), LucidFlex ($136/$95), and LucidDirect ($515, no separate reset SKU) are all already correct in this file.",
    ];
    readonly plans = [
        ...DAILY_EOD_SIZES.flatMap((s) => [
            this.buildPlan(buildDailyPlan(s, false, null)),
            this.buildPlan(buildDailyPlan(s, false, FIXED_DLL)),
        ]),
        ...DAILY_INTRADAY_SIZES.flatMap((s) => [
            this.buildPlan(buildDailyPlan(s, true, null)),
            this.buildPlan(buildDailyPlan(s, true, FIXED_DLL)),
        ]),
        ...FLEX_SIZES.flatMap((s) => [
            this.buildPlan(buildFlexPlan(s, null)),
            this.buildPlan(buildFlexPlan(s, FIXED_DLL)),
        ]),
        ...PRO_SIZES.flatMap((s) => [
            this.buildPlan(buildProPlan(s, FIXED_DLL)),
            this.buildPlan(buildProPlan(s, null)),
        ]),
        ...DIRECT_SIZES.map((s) => this.buildPlan(buildDirectPlan(s))),
    ];
    readonly website = 'https://lucidtrading.com';
}

const MAX_FUNDED_ACCOUNTS = 5;
const MAX_LIFETIME_PAYOUTS = 5;

function buildDailyPlan(
    size: LucidDailySize,
    isIntraday: boolean,
    dailyLossLimit: Dollars | null,
): PlanInit {
    const variant = isIntraday
        ? dailyLossLimit === null
            ? LucidVariant.DailyIntraday
            : LucidVariant.DailyIntradayDll
        : dailyLossLimit === null
          ? LucidVariant.DailyEod
          : LucidVariant.DailyEodDll;
    const lock = {
        atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
        lockedThreshold: lockThresholdAt(LOCK_OFFSET),
    };
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        contractLimits: CONTRACT_LIMITS,
        drawdown: isIntraday
            ? new IntradayTrailingDrawdown({ amount: size.maxDrawdown, lock })
            : new EodTrailingDrawdown({ amount: size.maxDrawdown, lock }),
        evalDailyLossLimit: flatDailyLossLimitOf(dailyLossLimit),
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        id: { accountSize: 50_000, firm: FirmId.Lucid, variant },
        label: planLabel(
            size.accountSize,
            `LucidDaily (${isIntraday ? 'Intraday' : 'EOD'}${
                dailyLossLimit === null ? '' : ', DLL'
            })`,
        ),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 0,
        minPayoutRequest: dollars(500),
        minTradingDays: 0,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: dollars(3000),
    };
}

function buildDirectPlan(size: LucidDirectSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.2),
        ),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: {
            amount: FIXED_DLL,
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.evalCost),
        },
        fundedDailyLossLimit: scalingDllAfterTrail(FIXED_DLL),
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Direct,
        },
        isInstantFunded: true,
        label: planLabel(size.accountSize, 'LucidDirect'),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(3000),
        minPayoutProfitPerCycle: dollars(2500),
        minPayoutRequest: dollars(500),
        minTradingDays: 0,
        payoutLadder: {
            minRequestAmount: dollars(500),
            steps: [2000, 2000, 2000, 2500, 2500],
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: dollars(0),
    };
}

function buildFlexPlan(
    size: LucidFlexSize,
    dailyLossLimit: Dollars | null,
): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.5)),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: flatDailyLossLimitOf(dailyLossLimit),
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant:
                dailyLossLimit === null
                    ? LucidVariant.Flex
                    : LucidVariant.FlexDll,
        },
        label: planLabel(
            size.accountSize,
            dailyLossLimit === null ? 'LucidFlex' : 'LucidFlex (DLL)',
        ),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 5,
        minPayoutProfit: dollars(0.01),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(500),
        minQualifyingDayProfit: dollars(150),
        minTradingDays: 2,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutProfitShare: profitShareMultiplier(0.5),
        payoutRequestCap: dollars(2000),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}

function buildProPlan(
    size: LucidProSize,
    dailyLossLimit: Dollars | null,
): PlanInit {
    const profitTarget = dollars(size.accountSize * PROFIT_TARGET_RATIO);
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.4),
        ),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown + LOCK_OFFSET),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        evalDailyLossLimit: flatDailyLossLimitOf(dailyLossLimit),
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.resetFee),
        },
        fundedDailyLossLimit: scalingDllAfterTrail(dailyLossLimit),
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant:
                dailyLossLimit === null
                    ? LucidVariant.ProNoDll
                    : LucidVariant.Pro,
        },
        label: planLabel(
            size.accountSize,
            dailyLossLimit === null ? 'LucidPro (no DLL)' : 'LucidPro',
        ),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        maxLifetimePayouts: MAX_LIFETIME_PAYOUTS,
        minDaysAfterPassForPayout: 3,
        minPayoutProfit: dollars(500),
        minPayoutProfitPerCycle: dollars(500),
        minPayoutRequest: dollars(500),
        minTradingDays: 1,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
        payoutLadder: {
            capsAtLastStep: true,
            minRequestAmount: dollars(500),
            steps: [2000, 2500],
        },
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}
