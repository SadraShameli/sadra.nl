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
    readonly evalCostDll: number;
    readonly evalCostNoDll: number;
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
        evalCostDll: 165,
        evalCostNoDll: 185,
        maxDrawdown: dollars(2000),
        resetFee: 115,
    },
];

const DAILY_INTRADAY_SIZES: readonly LucidDailySize[] = [
    {
        accountSize: dollars(50_000),
        evalCostDll: 136,
        evalCostNoDll: 156,
        maxDrawdown: dollars(2000),
        resetFee: 95,
    },
];

const FLEX_FUNDED_CONTRACT_LIMITS = {
    fundedMicros: {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(20), minBalance: dollars(0) },
            { maxContracts: contracts(30), minBalance: dollars(1000) },
            { maxContracts: contracts(40), minBalance: dollars(2000) },
        ],
    },
    fundedMinis: {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(2), minBalance: dollars(0) },
            { maxContracts: contracts(3), minBalance: dollars(1000) },
            { maxContracts: contracts(4), minBalance: dollars(2000) },
        ],
    },
} as const;

const FLEX_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCostDll: 136,
        evalCostNoDll: 146,
        maxDrawdown: dollars(2000),
        resetFee: 95,
    },
] as const;

const PRO_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCostDll: 172,
        evalCostNoDll: 192,
        maxDrawdown: dollars(2000),
        resetFee: 120,
    },
] as const;

const DIRECT_SIZES = [
    { accountSize: dollars(50_000), evalCost: 515, maxDrawdown: dollars(2000) },
] as const;

const MAXX_SIZES = [
    {
        accountSize: dollars(50_000),
        evalCost: 180,
        maxDrawdown: dollars(2000),
        profitTarget: dollars(3000),
    },
] as const;

type LucidDirectSize = (typeof DIRECT_SIZES)[number];
type LucidFlexSize = (typeof FLEX_SIZES)[number];
type LucidMaxxSize = (typeof MAXX_SIZES)[number];
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
        "The DLL toggle is NOT price-neutral for any Lucid plan that offers it, correcting an earlier note here that claimed uniform price parity. Confirmed for LucidDaily first (two independent third-party pricing tables: $136/$156 Intraday on/off, $165/$185 EOD on/off), then confirmed directly against Lucid's own live pricing engine for Pro and Flex too: a Wayback Machine capture of lucidtrading.com (2026-09-05, re-fetched 2026-09-14) embeds the site's own `LucidPricingConfig` JS object with per-product `productPrices`/`addonFees` maps -- the DLL toggle's own addon slug is literally `'no-dll'`, and the config's arithmetic (validated against LucidDaily's already-confirmed numbers before trusting it for Pro/Flex: 136+20=156, 165+20=185, both exact) gives LucidPro 50K $172 DLL-on / $192 DLL-off (a $20 premium, matching Daily's) and LucidFlex 50K $136 DLL-on / $146 DLL-off (a $10 premium, half of Daily's/Pro's). Corrected: Pro and Flex now use DLL-dependent eval prices (evalCostDll/evalCostNoDll) the same way Daily already does; resetFee is left unchanged for all three pending a source that breaks out a DLL-off reset price specifically. The earlier checkout-receipt evidence (a LucidFlex DLL-ON receipt showing $136.00 list + a separate -$5 'DLL ON Promo' coupon) is consistent with this: the same pricing config has a distinct `addonPromos` map (a coupon-style discount applied only when DLL stays ON) layered on top of, not instead of, the base ON/OFF structural price difference found here.",
        "LucidFlex's funded contract limit is NOT flat 4 mini/40 micro like the other three plan families -- support.lucidtrading.com's dedicated 'LucidFlex Funded Account Scaling Plan' article (fetched directly, HTTP 200) documents a real profit-gated ramp for the 50K tier: 2 minis/20 micros at $0-999 simulated profit, 3/30 at $1,000-1,999, reaching the 4/40 ceiling only at $2,000+ profit. The article explicitly states eval has 'no scaling plan... full max contract size from your first trade,' so evalMinis/evalMicros stay flat at 4/40 as before -- only fundedMinis/fundedMicros changed, from Flat to Tiered (ContractLimitKind.Tiered, keyed on simulated profit via the same accountProfit-not-balance convention already used for TopStep's tiered contract limits). LucidPro/LucidDirect/LucidDaily's funded sides ARE confirmed genuinely flat (not also scaling): both LucidPro's and LucidDirect's own Funded Account articles state verbatim 'No scaling plan, access to max contract size immediately' (distinct from an unrelated 'Scaling DLL' bullet on the same page, which refers to the daily-loss-limit mechanism above, not contract size); LucidDaily's own Funded Account article and its full help-center collection contain zero scaling-related language anywhere, and unlike Flex (which has a dedicated 'Scaling Plan' article), Pro/Direct/Daily's help-center collections have no such article at all -- Lucid's own site convention is that a plan which scales gets a dedicated article, and only Flex (and LucidBlack, not modeled here) has one.",
        "LucidPro's funded consistency rule was briefly changed to 35% based on lucidtrading.com's own backend plan-config API (fundConsistency: 0.35), which contradicted the 40% shown on the rendered LucidPro Funded Rules marketing page. Reverted back to 40% once a third, independent source -- propfirmmatch.com's own challenge-comparison table for LucidPro 50K, which states it verifies data 'from the firms themselves' -- also read 40%, not 35%. With two of three independent readings (the firm's own rendered page, and an independent third-party verifier) agreeing on 40% against a single internal JSON field, 40% is the better-supported value; the backend field likely reflects something other than the customer-facing consistency percentage, or is simply stale. Kept as its own note rather than silently folded into the original figure, since a genuine three-way source conflict and its resolution is exactly the kind of thing worth a future re-checker seeing.",
        "All four Lucid plan families show an identical 4 mini/40 micro contract limit on the EVAL side, live-verified 2026-09-14 directly from lucidtrading.com's rendered plan-card markup. Previously unmodeled firm-wide (contractLimits was left unset on every Lucid plan). Set identically on the eval side (4 minis/40 micros) across every plan and every DLL/drawdown variant; the funded side is NOT uniform across all four plans -- see LucidFlex's own note above for its confirmed profit-gated scaling, which this plan-card-level reading missed.",
        "LucidDirect's minDaysAfterPassForPayout was 0; the same live plan-card markup that confirmed the contract limit above also lists 'Min Day to Payout: 5' as its own field. Corrected to 5, the same payout-cadence-never-wired bug shape already found and fixed for FundedNext Rapid Pro and LucidPro this session.",
        "LucidDaily (50K), previously entirely unmodeled, added from live-read plan-card markup 2026-09-14: $3,000 target, $2,000 max loss, 50% eval-only consistency (explicit 'No Consistency in Funded'), a 'Daily Payouts' badge (modeled as minDaysAfterPassForPayout: 0, matching how FundedNext's own Rapid Daily plan is modeled in this codebase). Two independent checkout toggles, confirmed as separate button groups in the page markup: eval drawdown type (EOD or Intraday) and Daily Loss Limit (OFF or $1,200 ON, identical mechanism to Pro/Flex's toggle). Modeled as four independent plan variants (LucidVariant.DailyEod/DailyEodDll/DailyIntraday/DailyIntradayDll) rather than collapsing to one. Funded-side rules were originally defaulted by analogy rather than confirmed; support.lucidtrading.com's dedicated 'LucidDaily Payouts' article has since been read directly and confirms the 90% split, $0 minPayoutRequest floor of $500, no minimum trading-day count, and no per-request payout cap were all correct by analogy -- but the profit-per-cycle floor was not: the article states 'traders must have positive net profit (even just $1) between each payout request,' the same recurring-$0.01-per-cycle rule already modeled for LucidFlex, not the 'no explicit floor' this file originally guessed. Corrected: minPayoutProfit/minPayoutProfitPerCycle both set to $0.01. The same article also documents a buffer requirement previously missed entirely: 'the buffer is equal to: Initial Max Loss Limit + $100' ($52,100 required balance at the 50K tier) -- added as payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)), the same mechanism and offset already used for LucidPro.",
        "LucidDaily's EOD and Intraday drawdown-type variants are priced differently, not identically as first modeled: live-verified 2026-09-14 directly against lucidtrading.com's own pricing-config JSON (planCode LDE050/LDI050), EOD costs $165 eval / $115 reset, Intraday costs $136 eval / $95 reset for the DLL-ON variants specifically -- see the DLL-toggle note above for the since-corrected DLL-OFF pricing ($185 EOD / $156 Intraday). The same pricing-config JSON independently confirmed LucidPro ($172/$120), LucidFlex ($136/$95), and LucidDirect ($515, no separate reset SKU) are all already correct in this file.",
        "Confirmed: the site's own pricing template supports a list-vs-discount price display, so a standing discount almost certainly exists, but the exact current dollar amounts could not be retrieved (Cloudflare-blocked, no sufficiently recent archive) -- flagged explicitly as unconfirmed rather than guessed, consistent with this whole project's live-source-only rule for firm data.",
        "LucidDaily's funded stage is always Intraday regardless of which eval-stage drawdown type (EOD or Intraday) was purchased, per two independent support articles ('LucidDaily Customization' and 'LucidDaily Drawdown'). Previously the DailyEod/DailyEodDll variants left `fundedDrawdown` unset, so they silently inherited the EOD eval drawdown for the funded stage too (via Plan.ts's `fundedDrawdown ?? drawdown` fallback). Corrected: `fundedDrawdown` is now explicitly set to `IntradayTrailingDrawdown` for every LucidDaily variant, matching the confirmed always-Intraday funded rule.",
        "LucidDaily has no payout-count-based lifetime cap at all -- its real mechanic is an unrelated same-day dollar trigger, 'Maximum Daily Profit' ($8,000 at 50K), which auto-triggers a live-transition review if hit in a single day, not a count of payout requests. `maxLifetimePayouts` was previously set to the shared MAX_LIFETIME_PAYOUTS (5) for every LucidDaily variant by pattern-matching against Pro/Flex/Direct; removed (left unset) since no payout-count cap exists for Daily. The Maximum Daily Profit trigger itself remains unmodeled (a different mechanic, not a lifetime-payout-count field).",
        "LucidVariant.ProNoDll (DLL toggle OFF) was routing through the same `scalingDllAfterTrail` post-lock mechanism as the DLL-ON variant, giving the no-DLL configuration a 60%-of-peak-profit funded DLL once the drawdown locked. pro.md's Sim Funded table states the Off configuration's Daily Loss Limit plainly as 'Off: none' with no post-lock-scaling clause. Corrected: `fundedDailyLossLimit` now only routes through `scalingDllAfterTrail` when an eval-stage DLL was purchased; the no-DLL variant gets `flatDailyLossLimitOf(null)` (no DLL at all, either stage).",
        "LucidFlex's minTradingDays was hardcoded to 2, but no source confirms a formal minimum-trading-days rule for Flex -- the '2 days' figure was only the fastest-possible pass time implied by the 50% consistency math, not a stated rule (the consistency article's own 'cushion' language). Corrected to 0 (no gate), matching how LucidDaily already models its own identically-unconfirmed minimum-trading-days field.",
        "LucidDirect's `maxLifetimePayouts` was set to the same shared MAX_LIFETIME_PAYOUTS constant Flex uses, but LucidDirect's own payout-cap status is separately unconfirmed -- no source states Direct shares Flex's specific cap. Removed (left unset) rather than silently assuming another plan's confirmed figure carries over.",
        "LucidMaxx (lucidmaxx.md), previously entirely unmodeled, is now built for the 50K tier only. Unlike every other Lucid plan, LucidMaxx has no separate Sim Funded stage at all -- passing its eval moves the trader directly into a real live account. This engine's Plan class has no notion of 'simulated' vs 'real' capital in the first place (funded-phase mechanics are the same balance/drawdown/payout math either way), so LucidMaxx's live stage is modeled as an ordinary funded phase, not a new capability: fundedDrawdown uses the confirmed 'same as the standard Lucid live structure' cross-reference ($2,000 EOD drawdown at 50K, locking at a flat $100-above-start once cumulative profit reaches $2,000), and payoutFloorEffect: LockAtPlanFloor reuses the existing forced-lock-on-first-payout mechanism (already used for FundedNext's Legacy/Rapid Pro/Rapid Daily) to model the source's own 'or the trader requests a payout, whichever comes first' lock trigger. Eval-stage Drawdown Type is itself marked Unconfirmed by the source (only the live-stage mechanic is confirmed by cross-reference); modeled as EOD trailing by analogy to every other Lucid plan's own eval-stage mechanic, since `drawdown` is a required field with no 'leave unset' option -- a structural best-guess, not a confirmed figure, and disclosed as such here per this file's own sourcing convention. LucidMaxx's own eval/reset fee is not a fixed price but a dynamic, 4-tier figure keyed to a trader's own prior blown-live-account count ($180/$215/$250/$290 at 50K for tiers 1-4); modeled at Tier 1 ($180), the rate a trader with 0-4 blown live accounts pays, since that is the natural starting point for a newly LucidMaxx-eligible trader -- not a confirmed 'the' price, since the real price moves with each trader's own track record. Eval-stage Max Contracts/Daily Loss Limit are both Unconfirmed and left unset (the sensible default, matching this file's own established convention for genuinely unconfirmed fields). maxFundedAccounts models the confirmed 'up to 5 simultaneous accounts' cap; whether this pool is shared with the standard LucidLive household cap is unconfirmed and not modeled either way.",
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
        ...MAXX_SIZES.map((s) => this.buildPlan(buildMaxxPlan(s))),
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
            oneTimeEval: dollars(
                dailyLossLimit === null ? size.evalCostNoDll : size.evalCostDll,
            ),
            reset: dollars(size.resetFee),
        },
        fundedDrawdown: new IntradayTrailingDrawdown({
            amount: size.maxDrawdown,
            lock,
        }),
        id: { accountSize: 50_000, firm: FirmId.Lucid, variant },
        label: planLabel(
            size.accountSize,
            `LucidDaily (${isIntraday ? 'Intraday' : 'EOD'}${
                dailyLossLimit === null ? '' : ', DLL'
            })`,
        ),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0.01),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(500),
        minTradingDays: 0,
        payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)),
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
        contractLimits: {
            evalMicros: CONTRACT_LIMITS.evalMicros,
            evalMinis: CONTRACT_LIMITS.evalMinis,
            ...FLEX_FUNDED_CONTRACT_LIMITS,
        },
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
            oneTimeEval: dollars(
                dailyLossLimit === null ? size.evalCostNoDll : size.evalCostDll,
            ),
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
        minTradingDays: 0,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutProfitShare: profitShareMultiplier(0.5),
        payoutRequestCap: dollars(2000),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget,
    };
}

function buildMaxxPlan(size: LucidMaxxSize): PlanInit {
    return {
        accountSize: size.accountSize,
        consistency: new ConsistencyRule(ConsistencyScope.Eval, fraction(0.4)),
        drawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(size.evalCost),
            reset: dollars(size.evalCost),
        },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: size.maxDrawdown,
            lock: {
                atProfit: dollars(size.maxDrawdown),
                lockedThreshold: lockThresholdAt(LOCK_OFFSET),
            },
        }),
        id: {
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Maxx,
        },
        label: planLabel(size.accountSize, 'LucidMaxx'),
        maxFundedAccounts: 5,
        minTradingDays: 5,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        profitTarget: size.profitTarget,
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
            oneTimeEval: dollars(
                dailyLossLimit === null ? size.evalCostNoDll : size.evalCostDll,
            ),
            reset: dollars(size.resetFee),
        },
        fundedDailyLossLimit:
            dailyLossLimit === null
                ? flatDailyLossLimitOf(null)
                : scalingDllAfterTrail(dailyLossLimit),
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
