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
        isEffectiveNextSession: true,
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(20), minBalance: dollars(0) },
            { maxContracts: contracts(30), minBalance: dollars(1000) },
            { maxContracts: contracts(40), minBalance: dollars(2000) },
        ],
    },
    fundedMinis: {
        isEffectiveNextSession: true,
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
        "Both LucidPro and LucidFlex's eval checkout offer a purchasable Daily Loss Limit toggle: OFF (no DLL) or ON. Modeled as two independently selectable plan variants per size (LucidVariant.Pro/ProNoDll, LucidVariant.FlexDll/Flex) rather than a note, since both configurations are real, purchasable products, not a cosmetic checkout option. Pro's own $1,200 dollar figure is live-verified 2026-09-14 via lucidtrading.com's own checkout/rules pages, whose funded rules page shows the $1,200 pre-lock DLL paired with a 'LucidScale DLL' of 60% of peak EOD balance once the drawdown floor locks, and the OFF variant's funded rules page shows the identical 60%-of-peak row with only the pre-lock DLL itself replaced by NONE -- both LucidVariant.Pro and LucidVariant.ProNoDll therefore share the same scalingDllAfterTrail post-lock mechanism, differing only in the pre-lock flat amount. Flex's own dollar figure is NOT independently confirmed anywhere: a full sitemap sweep of support.lucidtrading.com (see flex.md's own Not Confirmed section and SOURCES.md) turns up no LucidFlex-specific article or table stating a DLL dollar amount at any tier -- only that the toggle exists and shifts price. LucidVariant.FlexDll models a single flat $1,200 DLL for both eval and funded (inherited via the existing fundedDailyLossLimit ?? evalDailyLossLimit fallback, since Flex's funded rules page shows no post-lock scaling row for either DLL choice), reusing Pro's own confirmed figure as the single most defensible placeholder for a required, non-optional field -- an assumption by analogy, not a sourced number for Flex, and flagged as such here per this file's own established convention (see LucidMaxx's own note for the same disclosure shape) rather than presented with Pro's confidence.",
        "The DLL toggle is NOT price-neutral for any Lucid plan that offers it, correcting an earlier note here that claimed uniform price parity. Confirmed for LucidDaily first (two independent third-party pricing tables: $136/$156 Intraday on/off, $165/$185 EOD on/off), then confirmed directly against Lucid's own live pricing engine for Pro and Flex too: a Wayback Machine capture of lucidtrading.com (2026-09-05, re-fetched 2026-09-14) embeds the site's own `LucidPricingConfig` JS object with per-product `productPrices`/`addonFees` maps -- the DLL toggle's own addon slug is literally `'no-dll'`, and the config's arithmetic (validated against LucidDaily's already-confirmed numbers before trusting it for Pro/Flex: 136+20=156, 165+20=185, both exact) gives LucidPro 50K $172 DLL-on / $192 DLL-off (a $20 premium, matching Daily's) and LucidFlex 50K $136 DLL-on / $146 DLL-off (a $10 premium, half of Daily's/Pro's). Corrected: Pro and Flex now use DLL-dependent eval prices (evalCostDll/evalCostNoDll) the same way Daily already does; resetFee is left unchanged for all three pending a source that breaks out a DLL-off reset price specifically. The earlier checkout-receipt evidence (a LucidFlex DLL-ON receipt showing $136.00 list + a separate -$5 'DLL ON Promo' coupon) is consistent with this: the same pricing config has a distinct `addonPromos` map (a coupon-style discount applied only when DLL stays ON) layered on top of, not instead of, the base ON/OFF structural price difference found here.",
        "LucidFlex's funded contract limit is NOT flat 4 mini/40 micro like the other three plan families -- support.lucidtrading.com's dedicated 'LucidFlex Funded Account Scaling Plan' article (fetched directly, HTTP 200) documents a real profit-gated ramp for the 50K tier: 2 minis/20 micros at $0-999 simulated profit, 3/30 at $1,000-1,999, reaching the 4/40 ceiling only at $2,000+ profit. The article explicitly states eval has 'no scaling plan... full max contract size from your first trade,' so evalMinis/evalMicros stay flat at 4/40 as before -- only fundedMinis/fundedMicros changed, from Flat to Tiered (ContractLimitKind.Tiered, keyed on simulated profit via the same accountProfit-not-balance convention already used for TopStep's tiered contract limits). LucidPro/LucidDirect/LucidDaily's funded sides ARE confirmed genuinely flat (not also scaling): both LucidPro's and LucidDirect's own Funded Account articles state verbatim 'No scaling plan, access to max contract size immediately' (distinct from an unrelated 'Scaling DLL' bullet on the same page, which refers to the daily-loss-limit mechanism above, not contract size); LucidDaily's own Funded Account article and its full help-center collection contain zero scaling-related language anywhere, and unlike Flex (which has a dedicated 'Scaling Plan' article), Pro/Direct/Daily's help-center collections have no such article at all -- Lucid's own site convention is that a plan which scales gets a dedicated article, and only Flex (and LucidBlack, not modeled here) has one.",
        "LucidPro's funded consistency rule briefly read 35% against lucidtrading.com's own backend plan-config API (fundConsistency: 0.35), contradicting the 40% shown on the rendered LucidPro Funded Rules marketing page and on propfirmmatch.com's own challenge-comparison table for LucidPro 50K. At the time this was resolved to 40% by majority vote across three independent readings, on the theory that the backend field likely reflected something other than the customer-facing figure, or was simply stale -- that theory is now known to be wrong, not merely unconfirmed. A fresh user-pasted dump of 'LucidPro Consistency Percentage' (2026-09-20) states plainly: 'We adjusted the LucidPro funded consistency percentage from 35% to 40%... It applies only to accounts purchased or reset on or after 11/28/2025 at 3:00 PM EST. All accounts purchased or reset on or before still have 35% consistency.' The 0.35 backend reading was neither stale nor measuring something unrelated -- it was accurately reporting the real, still-valid legacy rate for a defined pre-cutoff account cohort, while the two 40%-reading sources reflect the current rate. Both figures were correct all along, for different account vintages; only the resolution story was wrong. This does not change the modeled number: buildProPlan's flat fraction(0.4) remains correct for new/reset accounts, since today (2026-09-20) is well past the 11/28/2025 cutoff and this engine has no notion of purchase/reset date anywhere -- see the next note for the same cutoff's other, previously-undisclosed consequence.",
        "buildProPlan's flat 90% payoutTiers and flat fraction(0.4) consistency were both, until now, silently correct-but-undisclosed simplifications rather than the full rule: LucidPro Payouts' own Profit Split Structure states 'Accounts purchased or reset before 11/28/2025 at 3:00 PM EST are still eligible for 100% on the first $10k,' and LucidPro Consistency Percentage's own grandfather clause (see the previous note) keeps pre-cutoff accounts at 35%. Neither carve-out is modeled, for the same reason TopStep.ts's own analogous 100%-of-first-$10,000 perk is left unmodeled and disclosed there: this engine has no purchase/reset-date concept anywhere in PlanInit, and today (2026-09-20) is well past the 11/28/2025 cutoff, so a new or reset LucidPro account is genuinely on the flat 90/10 split and flat 40% consistency from day one. Disclosed here per this file's own established convention (this exact carveout was previously undisclosed, unlike TopStep's own sibling case) rather than left as a silent gap.",
        "buildProPlan's maxLifetimePayouts was set to the shared MAX_LIFETIME_PAYOUTS (5), the same unconfirmed-carryover-from-Flex bug shape already found and fixed for LucidDaily and LucidDirect (see their own notes above) but never previously revisited for Pro, despite pro.md's own Not Confirmed section already flagging '5' as unconfirmed for LucidPro and the source's own 'No simulated payout caps' benefit contradicting it outright. Plan.isAccountConcluded checks maxLifetimePayouts before ever reaching payoutLadder.capsAtLastStep, so this silently cut the simulated funded phase off after 5 payouts, understating LucidPro's true lifetime extraction. Removed (left unset), matching Daily's and Direct's own fix.",
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
        "Two further LucidDirect fields turned out to be the same kind of unconfirmed carryover from LucidFlex, caught via a fresh user-pasted dump of LucidDirect's own dedicated help-center articles (2026-09-20): (1) `minDaysAfterPassForPayout` was 5 (matching Flex's own confirmed figure), but LucidDirect's own Payout Objectives article states plainly 'There is no fixed payout window, you may request a payout any day after meeting all eligibility criteria' -- no day-count gate exists distinct from the Profit Goal/Consistency checks. Corrected to 0. (2) The payoutLadder (steps: 2000/2000/2000/2500/2500, matching the source's own Payouts-1-3/Payouts-4-5 table exactly) had no `capsAtLastStep`, so the engine's `ladderStepLookup` returned 'exhausted' and silently blocked every payout past the 5th -- directly contradicting the same article's own explicit 'No simulated payout caps' benefit, already correctly transcribed into this repo's direct.md but never checked against the engine's actual ladder-exhaustion behavior. Added `capsAtLastStep: true` so payouts 6+ continue at the $2,500 rate indefinitely, matching the confirmed no-cap policy.",
        "LucidMaxx (lucidmaxx.md), previously entirely unmodeled, is now built for the 50K tier only. Unlike every other Lucid plan, LucidMaxx has no separate Sim Funded stage at all -- passing its eval moves the trader directly into a real live account. This engine's Plan class has no notion of 'simulated' vs 'real' capital in the first place (funded-phase mechanics are the same balance/drawdown/payout math either way), so LucidMaxx's live stage is modeled as an ordinary funded phase, not a new capability: fundedDrawdown uses the confirmed 'same as the standard Lucid live structure' cross-reference ($2,000 EOD drawdown at 50K, locking at a flat $100-above-start once cumulative profit reaches $2,000), and payoutFloorEffect: LockAtPlanFloor reuses the existing forced-lock-on-first-payout mechanism (already used for FundedNext's Legacy/Rapid Pro/Rapid Daily) to model the source's own 'or the trader requests a payout, whichever comes first' lock trigger. Eval-stage Drawdown Type is itself marked Unconfirmed by the source (only the live-stage mechanic is confirmed by cross-reference); modeled as EOD trailing by analogy to every other Lucid plan's own eval-stage mechanic, since `drawdown` is a required field with no 'leave unset' option -- a structural best-guess, not a confirmed figure, and disclosed as such here per this file's own sourcing convention. LucidMaxx's own eval/reset fee is not a fixed price but a dynamic, 4-tier figure keyed to a trader's own prior blown-live-account count ($180/$215/$250/$290 at 50K for tiers 1-4); modeled at Tier 1 ($180), the rate a trader with 0-4 blown live accounts pays, since that is the natural starting point for a newly LucidMaxx-eligible trader -- not a confirmed 'the' price, since the real price moves with each trader's own track record. Eval-stage Max Contracts/Daily Loss Limit are both Unconfirmed and left unset (the sensible default, matching this file's own established convention for genuinely unconfirmed fields). maxFundedAccounts models the confirmed 'up to 5 simultaneous accounts' cap; whether this pool is shared with the standard LucidLive household cap is unconfirmed and not modeled either way.",
        "LucidLive (live.md) had NO engine model at all until now -- Lucid was the only firm in this repo with a fully documented, real live-transition program and zero entry in `LIVE_PLAN_BUILDERS`, so every Lucid plan's post-transition economics silently evaluated to nothing while Apex/FundedNext/MFFU/TopStep/TPT/Tradeify/AlphaFutures all had one. The gap was found by checking the engine against a fresh user-pasted dump of Lucid's own 'New Live Structure' and 'New Live Scaling Plan' articles (2026-09-20), which live.md itself already transcribed accurately -- the docs were right, the engine simply never consumed them. Built as LucidLive.ts at the 50K tier only, per the same 50K-only scope as every other plan added this session: $2,000 EOD trailing drawdown from a $0 starting balance, locking at a flat $100 once live profit reaches $2,000, no live daily loss limit, and no live consistency rule. Three modeling decisions are NOT directly confirmed and are called out here rather than folded into the numbers. (1) Profit split: live.md's own Not Confirmed section states plainly that no cited source gives the split rate for ordinary, non-bonus live profit, and warns specifically against assuming the Live Bonus's 90/10 rate generalizes. Modeled at 90/10 anyway, matching both Lucid's own funded-stage split across all four plan families and every other firm's live plan in this repo -- an inference from sibling convention, not a sourced figure. (2) Contract limits: the two source articles genuinely conflict -- 'New Live Structure' gives a flat 4 mini/40 micro at 50K, while 'New Live Scaling Plan' gives a profit-gated ramp (2/20 at $0-1,999, 3/30 at $2,000-3,999, 4/40 at $4,000+) further split by exchange group. live.md follows the scaling article as the more detailed and specific of the two while flagging that recency points the other way; this file follows the same editorial choice for consistency, using the CME/CBOT/NYMEX column since LivePlan's contractLimit is a single mini-equivalent config with no exchange-group dimension anywhere in this engine. (3) The one-time Live Bonus ($2,000 gross / $1,800 net at 90/10, paid the first time a trader reaches the $2,100 Live Target after a first-ever transition, excluded for LucidMaxx traders) is deliberately NOT modeled, following this repo's own established v1 precedent of excluding one-time bonus/vault mechanics for every firm that has one (Apex's Bonus Vault, MFF's Reserve, Tradeify's Accelerator Reward Pool are all already deferred the same way). Its omission makes LucidLive's modeled value conservative, not optimistic. The source's alternate lock trigger -- requesting a live payout BEFORE profit reaches the drawdown amount also locks the floor immediately -- IS now exercised by this model; see the next note for how.",
        "LivePlan gained its own payoutFloorEffect field (mirroring the funded-phase Plan.payoutFloorEffect/FundedPayoutCycle.ts mechanism, with a new LivePlan.withdraw method as its funded-side tryFundedPayout counterpart), closing the exact gap the previous note flagged as deliberately unbuilt: LucidLive.ts now sets payoutFloorEffect: LockAtPlanFloor and requiresLockForWithdrawal: false, so a live payout request before profit reaches $2,000 force-locks the MLL to the flat $100 floor immediately via DrawdownStrategy.forceLock, exactly matching live.md's 'either path locks the MLL immediately' rule, instead of silently requiring the $2,000 profit trigger to fire first. Tests: core/LivePlan.test.ts and simulator/livePhase.test.ts. One deviation carried over unchanged from the pre-existing engine, not introduced by this change: livePhase.ts's maxContractsAt(plan.contractLimit, state.balance) keys LucidLive's tiered contract limit on raw balance, not cumulative live profit, the same simplification already disclosed for TopStep's Pro Account (see TopStep.ts's own note) -- immaterial for a $0-starting-balance plan before any withdrawal, but a withdrawal (including the new lock-on-withdrawal path just described) drops balance below cumulative profit, so the modeled contract tier can under-scale relative to live.md's own profit-keyed scaling table after the first payout. Left as-is rather than fixed here, consistent with TopStep's own precedent of flagging rather than silently absorbing this specific balance-vs-profit gap.",
        "LucidDaily's confirmed live-transition sim-profit handling is now modeled, closing the gap the previous version of this note disclosed as deliberately unbuilt (found while re-verifying daily.md against a fresh user-pasted dump of 'LucidDaily Live', 2026-09-20). Half of the rule was already correct: the funded buffer balance funding the starting live drawdown and never being withdrawn is exactly what LucidLive.ts's $0 starting balance plus $2,000 EOD drawdown locking at starting balance + $100 already encodes. The missing half, sim profit above the buffer paid out once at transition and capped at a flat $15,000 total regardless of account size or count, is built as a new general `LivePlan.transitionPayout` primitive (core/LivePlan.ts) rather than a Lucid-only special case: it defaults to $0, so every other firm's live economics are bit-for-bit unchanged, and `runLiveHorizon` seeds its cumulative-payout state from it before day 1, so the credit is realized at the moment of transition and any later ordinary withdrawal layers on top as an incremental gross-to-net delta instead of re-paying it. `buildLucidDailyLivePlan(cushionPercent, simProfitAboveBuffer)` applies the cap with `Math.min(simProfitAboveBuffer, LUCID_DAILY_LIVE_TRANSITION_PAYOUT_CAP)` and routes the result through the existing `payoutFromProfit` payout-tier walk, so the 90/10 split is not duplicated anywhere. The credit is deliberately NOT folded into `startingBalance`: it is already-earned cash released on transition, and adding it there would put realized money at risk of the live drawdown and inflate every cushion-percent position size. Scope caveat, unchanged and not a modeling gap: `LIVE_PLAN_BUILDERS` is one builder per FirmId, not per plan/variant, and FirmId.Lucid still maps to `buildLucidLivePlan`, so `prop live --firm lucid` alone does not select the LucidDaily builder -- it is reachable by direct construction (and is covered by tests), the same standalone-export treatment `buildTptLiveDevelopmentPlan` already gets for the same registry reason.",
        "FLEX_FUNDED_CONTRACT_LIMITS' Tiered tiers now set isEffectiveNextSession: true: support.lucidtrading.com's dedicated 'LucidFlex Funded Account Scaling Plan' article states plainly 'The scaling plan updates at the end of each session, so your limits will not update in real-time throughout the day,' independently repeated in its own FAQ ('When does my contract limit update? At the end of each trading session. It does not update in real-time during the day'). Previously this simulator recomputed the tier on every trade within a day using live, intraday-accruing profit -- a real bug this session found via a fresh doc-vs-engine verification pass, fixed generally via ContractLimits.ts's new isEffectiveNextSession flag (mirroring the identical flag already used for Tiered daily-loss-limit configs) rather than special-cased for Lucid.",
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
