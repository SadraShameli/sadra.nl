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
    type FeeSchedule,
    FirmId,
    fraction,
    IntradayTrailingDrawdown,
    LucidVariant,
    PayoutBuffer,
    PayoutFloorEffect,
    PlanAvailability,
    type PlanInit,
    profitShareMultiplier,
    TierBasis,
    TradingFirm,
} from '~/lib/prop-calculator/core';
import { lockThresholdAt, planLabel } from '~/lib/prop-calculator/firms/shared';

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

interface LucidCheckoutProduct {
    readonly dllOnPromo: number;
    readonly listPrice: number;
    readonly noDllAddOn: number;
}

interface LucidDllToggleSize {
    readonly accountSize: Dollars;
    readonly evaluation: LucidCheckoutProduct;
    readonly maxDrawdown: Dollars;
    readonly reset: LucidCheckoutProduct;
}

function checkoutPrice(
    product: LucidCheckoutProduct,
    dailyLossLimit: Dollars | null,
): Dollars {
    return dollars(
        product.listPrice + dllToggleAdjustment(product, dailyLossLimit),
    );
}

function dllToggleAdjustment(
    product: LucidCheckoutProduct,
    dailyLossLimit: Dollars | null,
): Dollars {
    return dollars(
        dailyLossLimit === null ? product.noDllAddOn : -product.dllOnPromo,
    );
}

function dllToggleFeesOf(
    size: LucidDllToggleSize,
    dailyLossLimit: Dollars | null,
): FeeSchedule {
    return {
        activation: dollars(0),
        monthlySubscription: dollars(0),
        oneTimeEval: checkoutPrice(size.evaluation, dailyLossLimit),
        reset: checkoutPrice(size.reset, dailyLossLimit),
        undiscountableEval: dllToggleAdjustment(
            size.evaluation,
            dailyLossLimit,
        ),
        undiscountableReset: dllToggleAdjustment(size.reset, dailyLossLimit),
    };
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

const DAILY_EOD_SIZES: readonly LucidDllToggleSize[] = [
    {
        accountSize: dollars(50_000),
        evaluation: { dllOnPromo: 5, listPrice: 165, noDllAddOn: 20 },
        maxDrawdown: dollars(2000),
        reset: { dllOnPromo: 5, listPrice: 115, noDllAddOn: 20 },
    },
];

const DAILY_INTRADAY_SIZES: readonly LucidDllToggleSize[] = [
    {
        accountSize: dollars(50_000),
        evaluation: { dllOnPromo: 5, listPrice: 136, noDllAddOn: 20 },
        maxDrawdown: dollars(2000),
        reset: { dllOnPromo: 5, listPrice: 95, noDllAddOn: 20 },
    },
];

const FLEX_FUNDED_CONTRACT_LIMITS = {
    fundedMicros: {
        kind: ContractLimitKind.Tiered,
        tierBasis: TierBasis.SessionOpenProfit,
        tiers: [
            { maxContracts: contracts(20), minBalance: dollars(0) },
            { maxContracts: contracts(30), minBalance: dollars(1000) },
            { maxContracts: contracts(40), minBalance: dollars(2000) },
        ],
    },
    fundedMinis: {
        kind: ContractLimitKind.Tiered,
        tierBasis: TierBasis.SessionOpenProfit,
        tiers: [
            { maxContracts: contracts(2), minBalance: dollars(0) },
            { maxContracts: contracts(3), minBalance: dollars(1000) },
            { maxContracts: contracts(4), minBalance: dollars(2000) },
        ],
    },
} as const;

const FLEX_SIZES: readonly LucidDllToggleSize[] = [
    {
        accountSize: dollars(50_000),
        evaluation: { dllOnPromo: 5, listPrice: 136, noDllAddOn: 10 },
        maxDrawdown: dollars(2000),
        reset: { dllOnPromo: 5, listPrice: 95, noDllAddOn: 10 },
    },
];

const PRO_SIZES: readonly LucidDllToggleSize[] = [
    {
        accountSize: dollars(50_000),
        evaluation: { dllOnPromo: 5, listPrice: 172, noDllAddOn: 20 },
        maxDrawdown: dollars(2000),
        reset: { dllOnPromo: 5, listPrice: 120, noDllAddOn: 20 },
    },
];

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
type LucidMaxxSize = (typeof MAXX_SIZES)[number];

export class LucidTrading extends TradingFirm {
    readonly displayName = 'Lucid Trading';
    readonly id = FirmId.Lucid;
    readonly notes = [
        "Pro's minPayoutRequest is set explicitly to match its own payoutLadder.minRequestAmount ($500). The payout engine reads the ladder's minRequestAmount before plan.minPayoutRequest, so the explicit value keeps the `prop plans` min request line accurate; left unset, it would default to $0 (the Plan default).",
        "Flex's minPayoutProfit and minPayoutProfitPerCycle are both set explicitly to $0.01: support.lucidtrading.com's LucidFlex Payouts article requires positive net profit (even $1) during each payout cycle with no first-vs-subsequent distinction ('Net Profit in Payout Cycle... during each payout cycle'), so the first payout must clear the same $0.01 floor as every later one rather than silently defaulting to $0. Pro's minPayoutProfitPerCycle is set to $500 (50K tier), matching Pro's own minPayoutProfit: support.lucidtrading.com's LucidPro Payouts article publishes a 'Minimum Profit Goal' table ($250/$500/$750/$1,000 for the 25K/50K/100K/150K tiers) stating 'This profit goal resets after each payout,' confirming the requirement recurs identically for every cycle, not only the first.",
        "support.lucidtrading.com's Inactivity Policy article states accounts across LucidPro, LucidFlex, and LucidDirect are deemed abandoned and permanently deleted after 30 calendar days with no trade resulting in at least $1 of net profit or loss. This was previously unmodeled for all three Lucid plans (maxConsecutiveIdleDays was left unset); now set to 30 for all three, matching the mechanism already used for E8 Futures/MyFundedFutures/FundedNext/TopStep.",
        "LucidPro's minDaysAfterPassForPayout is 0 for Pro and Pro no-DLL. A 2026-09-14 read of lucidtrading.com's checkout/rules pages showed a Funded Rules panel field 'Days to Payout: 3', and the engine briefly gated the first payout behind 3 qualifying days. That checkout field is superseded: support.lucidtrading.com's LucidPro Payouts article 12890092 (dateModified 2026-08-06, re-fetched 2026-09-26) states 'There is no fixed payout window, you may request a payout any day after meeting all eligibility criteria', so the Minimum Profit Goal, the 40% consistency and the buffer are the only gates. LucidDirect's identical conflict was resolved the same way (see its note below). lucidtrading.com returns HTTP 403 to direct fetches, so the checkout panel could not be re-read.",
        "Both LucidPro and LucidFlex's eval checkout offer a purchasable Daily Loss Limit toggle: OFF (no DLL) or ON. Modeled as two independently selectable plan variants per size (LucidVariant.Pro/ProNoDll, LucidVariant.FlexDll/Flex) rather than a note, since both configurations are real, purchasable products, not a cosmetic checkout option. Pro's own $1,200 dollar figure is live-verified 2026-09-14 via lucidtrading.com's own checkout/rules pages, whose funded rules page shows the $1,200 pre-lock DLL paired with a 'LucidScale DLL' of 60% of peak EOD balance once the drawdown floor locks, and the OFF variant's funded rules page shows the identical 60%-of-peak row with only the pre-lock DLL itself replaced by NONE. The engine does not follow that reading for the OFF variant: only LucidVariant.Pro routes its funded DLL through scalingDllAfterTrail, while LucidVariant.ProNoDll gets flatDailyLossLimitOf(null) and has no DLL in either stage, following pro.md's 'Off: none' (see the ProNoDll note below). Flex's $1,200 is confirmed by Lucid's own homepage pricing config (lucidtrading.com's embedded LucidPricingConfig, dateModified 2026-09-21, user-pasted 2026-09-23): the LucidFlex card's no-dll add-on and its eval 'DLL' and funded 'DLL (Below Initial Trail)' cells read $600/$1,200/$1,800/$2,700 for 25K/50K/100K/150K, the same figures as LucidPro's. LucidFlex's help center still has no DLL article of its own (a full sitemap sweep of support.lucidtrading.com, see flex.md and SOURCES.md), so the homepage config is the only source. LucidVariant.FlexDll models a single flat $1,200 DLL for both eval and funded (inherited via the existing fundedDailyLossLimit ?? evalDailyLossLimit fallback). What stays unconfirmed is narrower: whether anything replaces Flex's DLL once the funded drawdown locks past the Initial Trail Balance, since Flex's funded config carries no LucidScale-style post-lock row the way Pro's does; the engine keeps the flat $1,200 there.",
        "The DLL toggle is NOT price-neutral for any Lucid plan that offers it, correcting an earlier note here that claimed uniform price parity. Confirmed for LucidDaily first (two independent third-party pricing tables: $136/$156 Intraday on/off, $165/$185 EOD on/off), then confirmed directly against Lucid's own live pricing engine for Pro and Flex too: a Wayback Machine capture of lucidtrading.com (2026-09-05, re-fetched 2026-09-14) embeds the site's own `LucidPricingConfig` JS object with per-product `productPrices`/`addonFees` maps -- the DLL toggle's own addon slug is literally `'no-dll'`, and the config's arithmetic (validated against LucidDaily's already-confirmed numbers before trusting it for Pro/Flex: 136+20=156, 165+20=185, both exact) gives LucidPro 50K $172 DLL-on / $192 DLL-off (a $20 premium, matching Daily's) and LucidFlex 50K $136 DLL-on / $146 DLL-off (a $10 premium, half of Daily's/Pro's). Corrected: Pro and Flex now use DLL-dependent eval and reset prices the same way Daily does; the fee-basis note below gives the modeled checkout figures, including the automatic DLL-ON promo from the same config's `addonPromos` map, layered on top of this base ON/OFF price difference.",
        "LucidFlex's funded contract limit is NOT flat 4 mini/40 micro like the other three plan families -- support.lucidtrading.com's dedicated 'LucidFlex Funded Account Scaling Plan' article (fetched directly, HTTP 200) documents a real profit-gated ramp for the 50K tier: 2 minis/20 micros at $0-999 simulated profit, 3/30 at $1,000-1,999, reaching the 4/40 ceiling only at $2,000+ profit. The article explicitly states eval has 'no scaling plan... full max contract size from your first trade,' so evalMinis/evalMicros stay flat at 4/40 as before -- only fundedMinis/fundedMicros changed, from Flat to Tiered (ContractLimitKind.Tiered, keyed on simulated profit via the same accountProfit-not-balance convention already used for TopStep's tiered contract limits). LucidPro/LucidDirect/LucidDaily's funded sides ARE confirmed genuinely flat (not also scaling): both LucidPro's and LucidDirect's own Funded Account articles state verbatim 'No scaling plan, access to max contract size immediately' (distinct from an unrelated 'Scaling DLL' bullet on the same page, which refers to the daily-loss-limit mechanism above, not contract size); LucidDaily's own Funded Account article and its full help-center collection contain zero scaling-related language anywhere, and unlike Flex (which has a dedicated 'Scaling Plan' article), Pro/Direct/Daily's help-center collections have no such article at all -- Lucid's own site convention is that a plan which scales gets a dedicated article, and only Flex (and LucidBlack, not modeled here) has one.",
        "LucidPro's funded consistency rule briefly read 35% against lucidtrading.com's own backend plan-config API (fundConsistency: 0.35), contradicting the 40% shown on the rendered LucidPro Funded Rules marketing page and on propfirmmatch.com's own challenge-comparison table for LucidPro 50K. At the time this was resolved to 40% by majority vote across three independent readings, on the theory that the backend field likely reflected something other than the customer-facing figure, or was simply stale -- that theory is now known to be wrong, not merely unconfirmed. A fresh user-pasted dump of 'LucidPro Consistency Percentage' (2026-09-20) states plainly: 'We adjusted the LucidPro funded consistency percentage from 35% to 40%... It applies only to accounts purchased or reset on or after 11/28/2025 at 3:00 PM EST. All accounts purchased or reset on or before still have 35% consistency.' The 0.35 backend reading was neither stale nor measuring something unrelated -- it was accurately reporting the real, still-valid legacy rate for a defined pre-cutoff account cohort, while the two 40%-reading sources reflect the current rate. Both figures were correct all along, for different account vintages; only the resolution story was wrong. This does not change the modeled number: buildProPlan's flat fraction(0.4) remains correct for new/reset accounts, since today (2026-09-20) is well past the 11/28/2025 cutoff and this engine has no notion of purchase/reset date anywhere -- see the next note for the same cutoff's other, previously-undisclosed consequence.",
        "buildProPlan's flat 90% payoutTiers and flat fraction(0.4) consistency were both, until now, silently correct-but-undisclosed simplifications rather than the full rule: LucidPro Payouts' own Profit Split Structure states 'Accounts purchased or reset before 11/28/2025 at 3:00 PM EST are still eligible for 100% on the first $10k,' and LucidPro Consistency Percentage's own grandfather clause (see the previous note) keeps pre-cutoff accounts at 35%. Neither carve-out is modeled, for the same reason TopStep.ts's own analogous 100%-of-first-$10,000 perk is left unmodeled and disclosed there: this engine has no purchase/reset-date concept anywhere in PlanInit, and today (2026-09-20) is well past the 11/28/2025 cutoff, so a new or reset LucidPro account is genuinely on the flat 90/10 split and flat 40% consistency from day one. Disclosed here per this file's own established convention (this exact carveout was previously undisclosed, unlike TopStep's own sibling case) rather than left as a silent gap.",
        "buildProPlan's maxLifetimePayouts was set to the shared MAX_LIFETIME_PAYOUTS (5). This is the same unconfirmed-carryover-from-Flex bug already found and fixed for LucidDaily and LucidDirect (see their own notes below), but it was never revisited for Pro, even though pro.md's own Not Confirmed section already flagged '5' as unconfirmed for LucidPro and the source's own 'No simulated payout caps' benefit contradicts it outright. Plan.isAccountConcluded checks maxLifetimePayouts before ever reaching payoutLadder.capsAtLastStep, so this silently cut the simulated funded phase off after 5 payouts, understating LucidPro's true lifetime extraction. Removed (left unset), matching Daily's and Direct's own fix.",
        "All four Lucid plan families show an identical 4 mini/40 micro contract limit on the EVAL side, live-verified 2026-09-14 directly from lucidtrading.com's rendered plan-card markup. Previously unmodeled firm-wide (contractLimits was left unset on every Lucid plan). Set identically on the eval side (4 minis/40 micros) across every LucidDaily, LucidFlex, LucidPro and LucidDirect plan and every DLL/drawdown variant, while LucidMaxx, added later, leaves contractLimits unset (see its own note below); the funded side is NOT uniform across all four plans: see LucidFlex's own note above for its confirmed profit-gated scaling, which this plan-card-level reading missed.",
        "LucidDirect's minDaysAfterPassForPayout was briefly set to 5 from the live plan-card markup's 'Min Day to Payout: 5' field (the same markup that confirmed the contract limit above). LucidDirect's own Payout Objectives article later showed there is no fixed payout window, so the engine now sets it to 0 (see the LucidDirect carryover note below).",
        "LucidDaily (50K), previously entirely unmodeled, added from live-read plan-card markup 2026-09-14: $3,000 target, $2,000 max loss, 50% eval-only consistency (explicit 'No Consistency in Funded'), a 'Daily Payouts' badge (modeled as minDaysAfterPassForPayout: 0, matching how FundedNext's own Rapid Daily plan is modeled in this codebase). Two independent checkout toggles, confirmed as separate button groups in the page markup: eval drawdown type (EOD or Intraday) and Daily Loss Limit (OFF or $1,200 ON, identical mechanism to Pro/Flex's toggle). Modeled as four independent plan variants (LucidVariant.DailyEod/DailyEodDll/DailyIntraday/DailyIntradayDll) rather than collapsing to one. Funded-side rules were originally defaulted by analogy rather than confirmed; support.lucidtrading.com's dedicated 'LucidDaily Payouts' article has since been read directly and confirms that the 90% split, the $500 minPayoutRequest floor, the absence of a minimum trading-day count and the absence of a per-request payout cap were all correct by analogy, but the profit-per-cycle floor was not: the article states 'traders must have positive net profit (even just $1) between each payout request,' the same recurring-$0.01-per-cycle rule already modeled for LucidFlex, not the 'no explicit floor' this file originally guessed. Corrected: minPayoutProfit/minPayoutProfitPerCycle both set to $0.01. The same article also documents a buffer requirement previously missed entirely: 'the buffer is equal to: Initial Max Loss Limit + $100' ($52,100 required balance at the 50K tier) -- added as payoutBuffer: new PayoutBuffer(dollars(LOCK_OFFSET)), the same mechanism and offset already used for LucidPro.",
        "LucidDaily's EOD and Intraday drawdown-type variants are priced differently, not identically as first modeled: live-verified 2026-09-14 directly against lucidtrading.com's own pricing-config JSON (planCode LDE050/LDI050), EOD lists $165 eval / $115 reset and Intraday lists $136 eval / $95 reset. The same pricing-config JSON lists LucidPro ($172/$120), LucidFlex ($136/$95), and LucidDirect ($515, no separate reset SKU). These are list prices before the DLL-ON promo or the no-DLL add-on; the fee-basis note below gives the modeled checkout prices.",
        "Fee basis (T4: the checkout price with no typed code), re-derived 2026-09-23 from lucidtrading.com's own LucidPricingConfig (homepage dateModified 2026-09-21, user-pasted, since the site returns HTTP 403 to direct fetches). The site's pricing script charges every DLL-toggle product listPrice - addonPromos when the DLL stays ON (a 'Limited time' automatic promo that needs no code, matching an earlier real LucidFlex receipt with $136.00 list and a separate -$5 'DLL ON Promo' line) and listPrice + addonFees when the DLL is OFF, for evals and resets alike ('reset x (1 - resetDiscount%) + fee when No-DLL, - promo when kept', with a global resetDiscountPct of 0). The 50K product ids map as: LucidPro eval 1661 ($172, +$20 off / -$5 on) and reset 9789 ($120, +$20 / -$5); LucidFlex eval 204746 ($136, +$10 / -$5) and reset 204749 ($95, +$10 / -$5); LucidDaily EOD eval 6888113 ($165, +$20 / -$5) and reset 6888128 ($115, +$20 / -$5); LucidDaily Intraday eval 6888116 ($136, +$20 / -$5) and reset 6888120 ($95, +$20 / -$5). Modeled DLL ON / OFF prices: Pro $167 / $192 eval and $115 / $140 reset; Flex $131 / $146 and $90 / $105; Daily EOD $160 / $185 and $110 / $135; Daily Intraday $131 / $156 and $90 / $115. LucidDirect (6961, $515) has no add-on fee, no promo and no reset product, so it stays a $515 re-buy; LucidMaxx is not in this config and keeps its $180 Tier 1 price (support article 14316866: 'No discounts are offered'). The 30% / 40% card discount needs the typed code VAULT, so it is not in the modeled fee; model it with --eval-discount. On the site the code cuts the list price only: it never touches the no-DLL add-on, the DLL-ON promo or a reset (Pro no-DLL at 30% is 172 x 0.7 + 20 = $140.40). The engine matches this: the add-on or promo is the eval's undiscountableEval component, which no percentage discount scales, so --eval-discount cuts only the list price of an eval or a re-buy and never the reset. A reset discount follows the site's reset formula the same way: the reset's add-on or promo is its undiscountableReset component, so the discount cuts only the reset list price. A discounted checkout is never below $0, so a 100% code on a DLL-ON plan costs $0, not -$5. Runs with or without a code are exact at 50K. Resets are bought from the logged-in dashboard and the checkout is Cloudflare-blocked, so the promo is read from the site's own pricing script, not from a cart.",
        "LucidDaily's funded stage is always Intraday regardless of which eval-stage drawdown type (EOD or Intraday) was purchased, per two independent support articles ('LucidDaily Customization' and 'LucidDaily Drawdown'). Previously the DailyEod/DailyEodDll variants left `fundedDrawdown` unset, so they silently inherited the EOD eval drawdown for the funded stage too (via Plan.ts's `fundedDrawdown ?? drawdown` fallback). Corrected: `fundedDrawdown` is now explicitly set to `IntradayTrailingDrawdown` for every LucidDaily variant, matching the confirmed always-Intraday funded rule.",
        "LucidDaily has no payout-count-based lifetime cap at all -- its real mechanic is an unrelated same-day dollar trigger, 'Maximum Daily Profit' ($8,000 at 50K), which auto-triggers a live-transition review if hit in a single day, not a count of payout requests. `maxLifetimePayouts` was previously set to the shared MAX_LIFETIME_PAYOUTS (5) for every LucidDaily variant by pattern-matching against Pro/Flex/Direct; removed (left unset) since no payout-count cap exists for Daily. The Maximum Daily Profit trigger itself remains unmodeled (a different mechanic, not a lifetime-payout-count field).",
        "LucidVariant.ProNoDll (DLL toggle OFF) was routing through the same `scalingDllAfterTrail` post-lock mechanism as the DLL-ON variant, giving the no-DLL configuration a 60%-of-peak-profit funded DLL once the drawdown locked. pro.md's Sim Funded table states the Off configuration's Daily Loss Limit plainly as 'Off: none' with no post-lock-scaling clause. Corrected: `fundedDailyLossLimit` now only routes through `scalingDllAfterTrail` when an eval-stage DLL was purchased; the no-DLL variant gets `flatDailyLossLimitOf(null)` (no DLL at all, either stage).",
        "LucidFlex's minTradingDays was hardcoded to 2, but no source confirms a formal minimum-trading-days rule for Flex -- the '2 days' figure was only the fastest-possible pass time implied by the 50% consistency math, not a stated rule (the consistency article's own 'cushion' language). Corrected to 0 (no gate), matching how LucidDaily already models its own identically-unconfirmed minimum-trading-days field.",
        "LucidDirect's `maxLifetimePayouts` was set to the same shared MAX_LIFETIME_PAYOUTS constant Flex uses, but LucidDirect's own payout-cap status is separately unconfirmed -- no source states Direct shares Flex's specific cap. Removed (left unset) rather than silently assuming another plan's confirmed figure carries over.",
        "Two further LucidDirect fields turned out to be the same kind of unconfirmed carryover from LucidFlex, caught via a fresh user-pasted dump of LucidDirect's own dedicated help-center articles (2026-09-20): (1) `minDaysAfterPassForPayout` was 5 (matching Flex's own confirmed figure), but LucidDirect's own Payout Objectives article states plainly 'There is no fixed payout window, you may request a payout any day after meeting all eligibility criteria' -- no day-count gate exists distinct from the Profit Goal/Consistency checks. Corrected to 0. (2) The payoutLadder (steps: 2000/2000/2000/2500/2500, matching the source's own Payouts-1-3/Payouts-4-5 table exactly) had no `capsAtLastStep`, so the engine's `ladderStepLookup` returned 'exhausted' and silently blocked every payout past the 5th -- directly contradicting the same article's own explicit 'No simulated payout caps' benefit, already correctly transcribed into this repo's direct.md but never checked against the engine's actual ladder-exhaustion behavior. Added `capsAtLastStep: true` so payouts 6+ continue at the $2,500 rate indefinitely, matching the confirmed no-cap policy.",
        "LucidMaxx (lucidmaxx.md), previously entirely unmodeled, is now built for the 50K tier only. Unlike every other Lucid plan, LucidMaxx has no separate Sim Funded stage at all -- passing its eval moves the trader directly into a real live account. This engine's Plan class has no notion of 'simulated' vs 'real' capital in the first place (funded-phase mechanics are the same balance/drawdown/payout math either way), so LucidMaxx's live stage is modeled as an ordinary funded phase, not a new capability: fundedDrawdown uses the confirmed 'same as the standard Lucid live structure' cross-reference ($2,000 EOD drawdown at 50K, locking at a flat $100-above-start once cumulative profit reaches $2,000), and payoutFloorEffect: LockAtPlanFloor reuses the existing forced-lock-on-first-payout mechanism (already used for FundedNext's Legacy/Rapid Pro/Rapid Daily) to model the source's own 'or the trader requests a payout, whichever comes first' lock trigger. Eval-stage Drawdown Type is itself marked Unconfirmed by the source (only the live-stage mechanic is confirmed by cross-reference); modeled as EOD trailing by analogy to every other Lucid plan's own eval-stage mechanic, since `drawdown` is a required field with no 'leave unset' option -- a structural best-guess, not a confirmed figure, and disclosed as such here per this file's own sourcing convention. LucidMaxx's own eval/reset fee is not a fixed price but a dynamic, 4-tier figure keyed to a trader's own prior blown-live-account count ($180/$215/$250/$290 at 50K for tiers 1-4); modeled at Tier 1 ($180), the rate a trader with 0-4 blown live accounts pays, since that is the natural starting point for a newly LucidMaxx-eligible trader -- not a confirmed 'the' price, since the real price moves with each trader's own track record. Eval-stage Max Contracts and Daily Loss Limit are both Unconfirmed: contractLimits is left unset, so there is no contract cap in either phase, and evalDailyLossLimit, a required field, is set to DailyLossLimitKind.None, so the engine applies no daily loss limit in either phase. maxFundedAccounts models the confirmed 'up to 5 simultaneous accounts' cap; whether this pool is shared with the standard LucidLive household cap is unconfirmed and not modeled either way.",
        "LucidLive (live.md) had NO engine model at all until now -- Lucid was the only firm in this repo with a fully documented, real live-transition program and zero entry in `LIVE_PLAN_BUILDERS`, so every Lucid plan's post-transition economics silently evaluated to nothing while Apex/FundedNext/MFFU/TopStep/TPT/Tradeify/AlphaFutures all had one. The gap was found by checking the engine against a fresh user-pasted dump of Lucid's own 'New Live Structure' and 'New Live Scaling Plan' articles (2026-09-20), which live.md itself already transcribed accurately -- the docs were right, the engine simply never consumed them. Built as LucidLive.ts at the 50K tier only, per the same 50K-only scope as every other plan added this session: $2,000 EOD trailing drawdown from a $0 starting balance, locking at a flat $100 once live profit reaches $2,000, no live daily loss limit, and no live consistency rule. Three modeling decisions are NOT directly confirmed and are called out here rather than folded into the numbers. (1) Profit split: live.md's own Not Confirmed section states plainly that no cited source gives the split rate for ordinary, non-bonus live profit, and warns specifically against assuming the Live Bonus's 90/10 rate generalizes. Modeled at 90/10 anyway, matching both Lucid's own funded-stage split across all four plan families and every other firm's live plan in this repo -- an inference from sibling convention, not a sourced figure. (2) Contract limits: the two source articles are complementary, not in conflict. 'New Live Structure' gives a flat 4 mini/40 micro at 50K, and 'New Live Scaling Plan' (article 15245873, dated 2026-05-26, re-fetched directly 2026-09-26) gives a profit-gated ramp (2/20 at $0-1,999.99, 3/30 at $2,000-3,999, 4/40 at $4,000+) further split by exchange group. They state the maximum contract size versus the size currently available: the flat figure equals the scaling plan's top 50K CME tier, and the scaling article says the plan 'controls how much of your max size is available to trade'. The tiers move at the end of each trading day ('your max tradable contract size moves up and down in direct correlation at the end of each trading day'), so both Tiered configs in LivePlan.contractLimits set tierBasis: TierBasis.SessionOpenProfit: a mid-day cross of the $2,000 or $4,000 tier neither raises nor lowers the cap until the next session. The engine has no exchange-group dimension, so only the 50K CME column is modeled (2/3/4 minis and 20/30/40 micros, the same as CBOT and NYMEX at 50K). COMEX limits are lower at every tier (1/1/2 minis and 10/15/20 micros at 50K; the article: 'Certain extremely volatile contracts have adjusted position sizing to ensure traders do not exceed the live drawdown'), but the engine has no COMEX instrument (its instruments are ES, MNQ and NQ only), so the lower COMEX limits cannot apply to any modeled trade. (3) The one-time Live Bonus ($2,000 gross / $1,800 net at 90/10, paid the first time a trader reaches the $2,100 Live Target after a first-ever transition, excluded for LucidMaxx traders) is deliberately NOT modeled, following this repo's own established v1 precedent of excluding one-time bonus/vault mechanics for every firm that has one (Apex's Bonus Vault, MFF's Reserve, Tradeify's Accelerator Reward Pool are all already deferred the same way). Its omission makes LucidLive's modeled value conservative, not optimistic. The source's alternate lock trigger -- requesting a live payout BEFORE profit reaches the drawdown amount also locks the floor immediately -- IS now exercised by this model; see the next note for how.",
        "LivePlan gained its own payoutFloorEffect field (mirroring the funded-phase Plan.payoutFloorEffect/FundedPayoutCycle.ts mechanism, with a new LivePlan.withdraw method as the counterpart of the funded-side FundedCycleTracker.tryPayout), closing the gap that an earlier version of the previous note flagged as deliberately unbuilt: LucidLive.ts now sets payoutFloorEffect: LockAtPlanFloor and requiresLockForWithdrawal: false, so a live payout request before profit reaches $2,000 force-locks the MLL to the flat $100 floor immediately via DrawdownStrategy.forceLock, exactly matching live.md's 'either path locks the MLL immediately' rule, instead of silently requiring the $2,000 profit trigger to fire first. Tests: core/LivePlan.test.ts and simulator/livePhase.test.ts. One deviation carried over unchanged from the pre-existing engine, not introduced by this change: LivePlan.maxContractsFor keys LucidLive's tiered contract limits on current live profit (balance minus startingBalance, read at the session open through TierBasis.SessionOpenProfit), not on cumulative live profit, and for LucidLive's $0 starting balance that is the balance net of every withdrawal. This does not matter before the first withdrawal. After it, a withdrawal (including the lock-on-withdrawal path just described) drops the balance below cumulative profit, so the modeled contract tier can under-scale relative to live.md's profit-keyed scaling table. Left as-is and disclosed here rather than fixed.",
        "LucidDaily's confirmed live-transition sim-profit handling is now modeled, closing the gap the previous version of this note disclosed as deliberately unbuilt (found while re-verifying daily.md against a fresh user-pasted dump of 'LucidDaily Live', 2026-09-20). Half of the rule was already correct: the funded buffer balance funding the starting live drawdown and never being withdrawn is exactly what LucidLive.ts's $0 starting balance plus $2,000 EOD drawdown locking at starting balance + $100 already encodes. The missing half, sim profit above the buffer paid out once at transition and capped at a flat $15,000 total regardless of account size or count, is built as a new general `LivePlan.transitionPayout` primitive (core/LivePlan.ts) rather than a Lucid-only special case: it defaults to $0, so every other firm's live economics are bit-for-bit unchanged, and `runLiveHorizon` seeds its cumulative-payout state from it before day 1, so the credit is realized at the moment of transition and any later ordinary withdrawal layers on top as an incremental gross-to-net delta instead of re-paying it. `buildLucidDailyLivePlan(cushionPercent, simProfitAboveBuffer)` applies the cap with `Math.min(simProfitAboveBuffer, LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP)` and routes the result through the existing `payoutFromProfit` payout-tier walk, so the 90/10 split is not duplicated anywhere. The credit is deliberately NOT folded into `startingBalance`: it is already-earned cash released on transition, and adding it there would put realized money at risk of the live drawdown and inflate every cushion-percent position size. CLI route: `LIVE_PLAN_BUILDERS` is one builder per FirmId and FirmId.Lucid still maps to `buildLucidLivePlan`, but `LIVE_TRANSITION_PLAN_BUILDERS` maps FirmId.Lucid to `buildLucidDailyLivePlan`, so `prop live --firm lucid --transition-profit <amount>` builds the LucidDaily live plan with the one-off credit (the amount is the sim profit above the buffer, capped at $15,000 by the builder) and prints it on its own non-annualized line; without --transition-profit, `prop live --firm lucid` keeps the standard Lucid live plan. `buildTptLiveDevelopmentPlan` is still reachable only by direct construction.",
        "FLEX_FUNDED_CONTRACT_LIMITS' Tiered tiers now set tierBasis: TierBasis.SessionOpenProfit: support.lucidtrading.com's dedicated 'LucidFlex Funded Account Scaling Plan' article states plainly 'The scaling plan updates at the end of each session, so your limits will not update in real-time throughout the day,' independently repeated in its own FAQ ('When does my contract limit update? At the end of each trading session. It does not update in real-time during the day'). Previously this simulator recomputed the tier on every trade within a day using live, intraday-accruing profit -- a real bug this session found via a fresh doc-vs-engine verification pass, fixed generally via ContractLimits.ts's new tierBasis setting (the same TierBasis setting Tiered daily-loss-limit configs carry, chosen per config rather than shared: these contract tiers use TierBasis.SessionOpenProfit, while Tradeify's scaling daily loss limit uses TierBasis.PeakIntradayProfit) rather than special-cased for Lucid.",
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
    size: LucidDllToggleSize,
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
        fees: dllToggleFeesOf(size, dailyLossLimit),
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
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(3000),
        minPayoutProfitPerCycle: dollars(2500),
        minPayoutRequest: dollars(500),
        minTradingDays: 0,
        payoutLadder: {
            capsAtLastStep: true,
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
    size: LucidDllToggleSize,
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
        fees: dllToggleFeesOf(size, dailyLossLimit),
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
        availability: PlanAvailability.CallUpOnly,
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
    size: LucidDllToggleSize,
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
        fees: dllToggleFeesOf(size, dailyLossLimit),
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
        minDaysAfterPassForPayout: 0,
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
