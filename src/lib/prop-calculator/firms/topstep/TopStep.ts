import {
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    PayoutFloorEffect,
    PlanAvailability,
    type PlanInit,
    TierBasis,
    TopStepVariant,
    TradingFirm,
} from '~/lib/prop-calculator/core';
import { lockThresholdAt, planLabel } from '~/lib/prop-calculator/firms/shared';

const ACCOUNT_SIZE = 50_000;
const MAX_LOSS_LIMIT = dollars(2000);
const PROFIT_TARGET = dollars(3000);
const MIN_TRADING_DAYS = 2;
const WIRE_PAYOUT_FEE = dollars(30);
const MIN_PAYOUT_PROFIT_PER_CYCLE = dollars(0.01);
const NO_STATED_PAYOUT_BUFFER = dollars(0);

export const TOPSTEP_PAYOUT_POLICY = {
    dailyPayoutsAfterWinningDays: 30,
    minPayoutRequest: dollars(125),
    minWinningDayProfit: dollars(150),
    requestBalanceShareCap: fraction(0.5),
    traderShare: fraction(0.9),
    winningDaysPerRequest: 5,
} as const;

const COMBINE_CONSISTENCY = fraction(0.55);
const INACTIVITY_CLOSURE_DAYS = 30;

const CONTRACT_LIMITS = {
    evalMicros: contracts(50),
    evalMinis: contracts(5),
    fundedMicros: {
        kind: ContractLimitKind.Tiered,
        tierBasis: TierBasis.SessionOpenProfit,
        tiers: [
            { maxContracts: contracts(20), minBalance: dollars(0) },
            { maxContracts: contracts(30), minBalance: dollars(1500) },
            { maxContracts: contracts(50), minBalance: dollars(2000) },
        ],
    },
    fundedMinis: {
        kind: ContractLimitKind.Tiered,
        tierBasis: TierBasis.SessionOpenProfit,
        tiers: [
            { maxContracts: contracts(2), minBalance: dollars(0) },
            { maxContracts: contracts(3), minBalance: dollars(1500) },
            { maxContracts: contracts(5), minBalance: dollars(2000) },
        ],
    },
} as const;

const PRICING_PATHS = [
    {
        activation: 149,
        dllMonthlyDiscount: 0,
        key: 'standard',
        label: 'Standard path',
        monthlySubscription: 49,
        reset: 49,
    },
    {
        activation: 0,
        dllMonthlyDiscount: 10,
        key: 'no-fee',
        label: 'No-fee path',
        monthlySubscription: 95,
        reset: 95,
    },
] as const;

const PAYOUT_PATHS = [
    {
        dllPayoutRequestCap: dollars(4000),
        fundedConsistency: null,
        key: 'standard',
        label: 'Standard XFA',
        minQualifyingDayProfit: TOPSTEP_PAYOUT_POLICY.minWinningDayProfit,
        payoutRequestCap: dollars(2000),
        winningDays: TOPSTEP_PAYOUT_POLICY.winningDaysPerRequest,
    },
    {
        dllPayoutRequestCap: dollars(6000),
        fundedConsistency: 0.4,
        key: 'consistency',
        label: 'Consistency XFA',
        minQualifyingDayProfit: null,
        payoutRequestCap: dollars(3000),
        winningDays: 3,
    },
] as const;

const DLL_AMOUNT = dollars(1000);

type PayoutPath = (typeof PAYOUT_PATHS)[number];
type PricingPath = (typeof PRICING_PATHS)[number];
type TopStepVariantKey =
    | `${PricingPath['key']}-${PayoutPath['key']}-dll`
    | `${PricingPath['key']}-${PayoutPath['key']}`;

const TOPSTEP_VARIANTS: Record<TopStepVariantKey, TopStepVariant> = {
    'no-fee-consistency': TopStepVariant.NoFeeConsistency,
    'no-fee-consistency-dll': TopStepVariant.NoFeeConsistencyDll,
    'no-fee-standard': TopStepVariant.NoFeeStandard,
    'no-fee-standard-dll': TopStepVariant.NoFeeStandardDll,
    'standard-consistency': TopStepVariant.StandardConsistency,
    'standard-consistency-dll': TopStepVariant.StandardConsistencyDll,
    'standard-standard': TopStepVariant.StandardStandard,
    'standard-standard-dll': TopStepVariant.StandardStandardDll,
};

export class TopStep extends TradingFirm {
    readonly displayName = 'TopStep';
    readonly id = FirmId.TopStep;
    readonly notes = [
        "Live-verified against help.topstep.com/en/articles/8284208-consistency-at-topstep (page marked 'Updated this week' as of 2026-09-13): the Trading Combine's eval-phase Consistency Target is 55% of actual realized profit (Best Day Profit / Total Profit, hard line, no rounding), not 50%. The article's own 'What happened to the buffer?' section: 'There is no buffer. 55% is the hard limit. The old buffer was quiet padding on top of a 50% target.' COMBINE_CONSISTENCY was previously fraction(0.5), stricter than the live rule and capable of wrongly failing a simulated eval path whose best-day share falls between 50% and 55%. Corrected to fraction(0.55). Re-ran the pinned 'TopStep Standard XFA' engineCharacterization golden after this fix (bun run test): it passed unchanged. Traced why: at that golden's inputs ($400 risk, 2:1 RR, 2 trades/day), a day's P&L is always a $400 multiple of {1600, 400, -800}, so cumulative eval profit only ever crosses the $3,000 profit target by landing exactly on $3,200 (the $3,000-3,200 band is unreachable) -- and 1600/3200 = 50% already clears both the old and new consistency threshold, so this specific pinned scenario's pass timing happens not to move. The fix is still real and outcome-changing in general -- any risk sizing whose day-close granularity lands cumulative profit inside the old 50-55% gap at the $3,000 mark would flip pass/fail on that trial; it just happens not to for this specific pinned scenario. Verified empirically here rather than assumed inert.",
        "help.topstep.com/en/articles/8284215-express-funded-account-parameters live-confirms a 30-consecutive-day-without-a-trade closure rule for the Express Funded Account (XFA, the funded phase modeled here); previously unmodeled (maxConsecutiveIdleDays was left unset). Set to 30. Unlike E8 Futures/FundedNext, where the same idle-day mechanism was confirmed to apply identically to both the eval and funded phases, TopStep's own Trading Combine Subscriptions FAQ and pricing page both state the Combine itself has no time limit or inactivity closure at all ('no time limit or expiration date -- you pay the monthly subscription while it's active'). The engine has an eval/funded idle-day split (PlanInit.evalMaxConsecutiveIdleDays, read through Plan.maxConsecutiveIdleDaysFor, which TPT and FTMO Futures set to null), but buildPlan does not set it, so the 30-day limit also (inaccurately) applies during the simulated eval phase; at the default idleDayProbability of 0 this is inert for eval (consecutiveIdleDays never accrues), so it only matters for a user who explicitly models eval idle days over a long combine run, where it would incorrectly close an eval account TopStep would in reality leave open indefinitely. This gap stays open until buildPlan sets evalMaxConsecutiveIdleDays: null.",
        "The tiered funded contract-limit table (2 minis/20 micros below $1,500 profit, 3/30 from $1,500, 5/50 from $2,000) was re-fetched directly from Topstep's own Scaling Plan chart image (downloads.intercomcdn.com, linked from help.topstep.com/en/articles/8284223-what-is-the-scaling-plan) and is unchanged from what is modeled here; the eval-phase flat cap (5 minis / 50 micros) is likewise confirmed unchanged via help.topstep.com/en/articles/8284197-trading-combine-parameters. The same Scaling Plan article confirms the XFA's own internal balance \"starts at a $0 balance\" distinct from the nominal $50K account size, i.e. these thresholds are keyed on funded PROFIT (balance - starting balance), matching how PositionSizing.ts's contractLimitAt resolves a tiered funded cap through maxContractsAt with the full TierProfitContext (profit, session-open profit, peak day-close profit and peak intraday profit, never raw state.balance) -- re-verified correct, not just assumed carried over.",
        "Drawdown lock mechanics live-confirmed against help.topstep.com/en/articles/8284204-what-is-the-maximum-loss-limit and topstep.com/express-funded-account-rules: the $2,000 trailing MLL locks permanently at breakeven (the XFA's own $0 balance) once profit reaches $2,000, and is independently force-reset to that same $0 level on every payout regardless of whether the natural lock had already fired ('After your first Payout: Your MLL is set to $0 regardless of where it was before'). Both mechanics (the drawdown's own atProfit lock and payoutFloorEffect: ReleaseFloor) are already modeled and match. ReleaseFloor is confirmed non-dead here, not a leftover default: minPayoutProfit is $0 and the qualifying-day payout gates (5 days of $150+, or 3 days under Consistency) can be met well before $2,000 of funded profit accrues, so the natural atProfit lock frequently has not fired yet by first payout.",
        "Pricing verified against topstep.com/no-activation-fee's own data attributes (standard-price/xfa-price/xfa-fee), not just its rendered marketing copy: $50K Standard path is $49/month + $149 one-time XFA activation fee; No Activation Fee path is $95/month + $0 ('Free') activation; resets cost the same as the path's own monthly subscription ($49 / $95 respectively) per the page's own FAQ answer. All match what is modeled.",
        "The optional Daily Loss Limit add-on is now modeled as its own set of four plan variants (TopStepVariant.*Dll), one per existing pricing-path/payout-path combination, built by buildPlan's new isDllEnabled parameter. Per standard.md/consistency.md's own Payouts sections: adding a $1,000 flat DLL (the $50K-tier figure; fixed for the account's lifetime) at original Trading Combine checkout doubles the Max Payout per Cycle for both payout paths (Standard $2,000 -> $4,000, Consistency $3,000 -> $6,000, both still capped at 50% of balance) and carries into the XFA unchanged -- modeled by setting evalDailyLossLimit to DailyLossLimitKind.Flat, which Plan.ts's own fundedDailyLossLimit fallback (`init.fundedDailyLossLimit ?? init.evalDailyLossLimit`) automatically carries into the funded phase with no separate field needed, matching the source's own 'carries into the XFA when you pass' wording exactly. A DLL breach is a same-day-only 'Temporary Violation' (standard.md: 'Open positions are flattened... No new trades until 5 PM CT next session... stays eligible for funding'), not an account bust -- exactly DailyLossLimitKind.Flat's existing isDayLockedOut semantics (locks out further trades that day via the same code path as any other day-stop rule), reusing the identical mechanism this file's own buildProAccountPlan() already uses for Pro Account's flat DLL, no new engine code required. The Responsible Trading Discount ($10/month off the $50K No-fee Combine subscription, the only Combine the discount names, per standard.md: '$10 off -> 50K... on No Activation Fee Trading Combines') is modeled via PRICING_PATHS' dllMonthlyDiscount field, applied to monthlySubscription only ('Discount recurs monthly'). The Standard path's field is 0, and its DLL variants keep the full $149 XFA activation. That may overstate them: help.topstep.com article 14289835 (re-fetched 2026-09-23) says in its prose 'There's now a Responsible Trading Discount when you add a DLL at purchase for No Activation Fee Trading Combines, Express Funded Account Activations, and Back2Funded Reactivations', but its discount table publishes a dollar figure only for the No Activation Fee Trading Combine and the Back2Funded Reactivation, and none for the XFA activation. Under the published-figure rule the $149 stays until a real Standard-path DLL activation checkout gives the discounted amount. The reset stays at the published $95: help.topstep.com's 'Topstep Pricing and Payment Questions' article (14289835, re-fetched 2026-09-23) has one Reset Pricing table ('50K $49 $95', Standard Path / No Activation Fee Path) with no DLL row, and its Responsible Trading Discount table publishes amounts only for the No Activation Fee Trading Combine ('$10 off -> 50K') and Back2Funded Reactivation fees, with no reset among the discounted products named in its prose. The DLL resets were previously modeled at the discounted $85, an inference no firm source gives. There is a real, unresolved conflict (documented in standard.md/consistency.md) on whether the doubled-cap benefit requires the DLL to be added at the account's original checkout specifically, or also applies if added later at XFA activation/Reactivation; every simulated cycle here models a fresh Combine purchase with the DLL chosen at that same original checkout, so this ambiguity does not affect the simulated numbers either way.",
        "Payout figures verified against help.topstep.com/en/articles/8284233-topstep-payout-policy's own per-size table: $50K payout request cap is $2,000 (Standard XFA) / $3,000 (Consistency XFA), both capped at 50% of account balance, $125 minimum request, $30 ACH/wire fee -- all matching what's modeled. The flat 90% trader share is correct for a new account: the same article's 100%-of-first-$10,000-lifetime-profits perk is explicitly restricted to traders who joined 'the new Topstep dashboard before January 12, 2026' (today is 2026-09-13), so a new account is on the flat 90/10 split from the first dollar and is correctly left unmodeled as a payout tier.",
        "LFA payouts are gated like the XFA's, from one shared TOPSTEP_PAYOUT_POLICY constant set used by both TopStep.ts and TopStepLive.ts ($125 minimum, $150 winning day, 5 winning days per request, 50% per-request balance cap, 90/10 split). help.topstep.com's 'Topstep Payout Policy' article (8284233, re-fetched 2026-09-23) states for the LFA: '5 winning days of $150+ Net P&L per Payout cycle', 'Request up to 50% of your account balance with no dollar cap', 'After you request a Payout, your winning day count restarts', and 'Once you've earned $150+ Net P&L on 30 non-consecutive days in your Live Funded Account, you unlock daily Payouts ... once per day (min $125). Winning days from the XFA do not count toward this total.' All of these are modeled via LivePlan's winningDayPayoutGate. Seed-balance payouts, the 80% Reserve with its unlocks, the $1,000 auto-liquidation floor and its final payout are modeled too (N-44); see the Live Funded Account note.",
        'The $599 (+tax) Back2Funded reactivation fee (topstep.com/express-funded-account-rules) is a distinct pay-to-restart-a-busted-XFA product, not a challenge/reset-fee variant of the modeled Combine-to-XFA path, and is correctly left unmodeled.',
        "Live Funded Account (modeled in TopStepLive.ts, Part M4's background research task w3y0y0n26, live-refetched directly against help.topstep.com/en/articles/10657969-live-funded-account-parameters and help.topstep.com/en/articles/11748475-dynamic-live-risk-expansion this session): unlike every other confirmed live firm (Apex/Tradeify/TPT/FundedNext/MFF-Rapid, all $0 or a small flat deposit), the LFA starts at 20% of the trader's cumulative XFA reserve balance, minimum $10,000, capped at the account-size tier ('20% available to trade immediately -- minimum $10,000' / '80% held in Reserve'). computeTopStepLiveStartingBalance implements this; at the 50K tier modeled here it is mathematically inert -- 20% of the $50,000 cap already equals the $10,000 floor, so the modeled account always starts at exactly $10,000 regardless of the trader's actual reserve balance (verified by tracing the formula, not assumed). Risk is TopStep's 'Dynamic Live Risk Expansion': a static, non-trailing Daily Loss Limit that scales with net profit tier, reusing core/DailyLossLimit.ts's existing DailyLossLimitKind.Tiered machinery directly. The $1,000 auto-liquidation floor is modeled as a StaticDrawdown at the starting balance minus $1,000, checked after every trade with `<=` (T17), so the LFA can bust: 'If your LFA balance drops below $1,000, the account may be immediately liquidated and closed at end of the trading day. The remaining balance would then be sent as a final Payout.' (article 10657969, dateModified 2026-09-17, re-fetched 2026-09-23). At a floor bust the engine pays the remaining balance as a final payout through LivePlan.payoutOnLiquidation, reported on its own one-off line and never annualized. An inactivity closure pays nothing, since the source does not say the balance is returned then, and the unreleased Reserve is not paid ('Unlocked reserve is forfeited'). The source liquidates at the end of the trading day; the engine closes at the breaching trade, the conservative reading. Payouts may come from the unlocked seed balance: the D4 default keeps one drawdown ($9,000 above the floor) and pays only the excess, while --request-size all may also take the seed, within the 50% per-request cap or freely after 30 winning days. The 80% Reserve ('80% held in Reserve, released in 4 increments of 25%') is a ReserveLivePlan: a review every 5 sessions approves at most one increment once net trading P&L since the last expansion reaches the $3,000 target, the increment lands 2 sessions later and is added to both balance and startingBalance, it is tradable at once ('additional funds are released from your Reserve into your unlocked balance') so it feeds position size, and it is held back from payouts until all four increments are out ('Once 100% of your balance has been unlocked, you may withdraw those funds as well'). simulator/livePhase.ts splits every withdrawal: the part taken from below the running startingBalance (seed, or released Reserve after full unlock) is capital returned, reported as a one-off and never annualized, and only the trading-profit part counts toward the annual withdrawal rate. No single trade may lose more than the remaining daily loss limit (the per-trade cap in core/LiveSizing.ts, commission included), so a position sized off a large released Reserve still loses at most the $2,000 tier-0 limit in one trade. Assumptions and gaps: the 90/10 split on withdrawn seed, Reserve and the liquidation payout is an assumption, since the source states the split for payouts, not for returned capital; the $50,000 transferred XFA balance behind the default $40,000 Reserve is an assumed default, not an input; the discretionary 'Shoulder Tap' review and discretionary expansion denials ('Can be delayed or denied for excessive or reckless risk behavior') are not simulable. The $50K tier's DLL/position-size table was read verbatim from the live page's raw HTML (article 11748475, dateModified 2026-09-24T14:00:24Z, re-fetched 2026-09-26): 'For the first three tiers, +$500 is added to your starting Daily Loss Limit for each tier you achieve:' and '$50K Account (Starts at $2,000 DLL): $15k Profit -> $2,500 DLL, $20k Profit -> $3,000 DLL, $50k Profit -> $3,500 DLL', then 'Once an account reaches $100k in net profit, Daily Loss Limits and Maximum Position Sizes align across all account types'. So the 50K LFA runs $2,000 DLL / 5 lots from $0 profit, $2,500 from $15,000, $3,000 from $20,000, $3,500 from $50,000, $10,000 / 30 lots from $100,000, $20,000 / 50 lots from $200,000, $50,000 / 70 lots from $550,000, $100,000 / 100 lots from $1,000,000. The Expansion Table's 'Up to $5,000', 'Up to $5,500' and 'Up to $6,000' rows are the 150K account's figures (the table's maxima), which this engine applied to the 50K until N-67. Tier timing follows the same article (N-59, WP18h): 'Your net profit determines your Tier. Spend 10 Active Trading Days at each Tier to unlock the next level.', 'Your Daily Loss Limit increases at end of day after 10 Active Trading Days in the new Tier.', 'If your net profit falls below your Tier at end of day, your Daily Loss Limit scales down that same day.', 'If you drop out of a Tier before 10 days, the counter resets when you re-enter it.', 'You must move one Tier at a time. No skipping.' and 'Active Trading Day: Any day you place at least 1 trade -- even a single micro contract. No minimum P/L required.' TopStepLivePlan keeps the unlocked tier and a day counter, updated only at a session close, and both the DLL and the lot caps are keyed on TierBasis.SessionOpenProfit fed with that unlocked tier, so nothing moves within a session. A session close counts toward the next tier when the account traded that day and its net trading profit closes at or above the next tier's threshold; the 10th such day unlocks exactly one tier at that close, and the count restarts for the tier after it, so a jump straight to $100,000 of profit needs 40 Active Trading Days to reach 30 lots. An idle session inside the next tier neither counts nor resets the counter; a close below the next tier's threshold resets it; a close below the unlocked tier's threshold drops straight to the tier the profit still qualifies for. Three readings are this engine's, disclosed: the day the profit first closes in the new tier counts as its first Active Trading Day; while the profit sits several tiers up the days count toward the next tier only (the conservative reading of 'No skipping'); and a tier that was already unlocked and is lost at a close must be earned again with 10 new Active Trading Days when the profit re-enters it, since the source says the counter resets on re-entry and does not say an earned tier is kept (so $15,000 unlocked, one close at $14,999 and the next back at $15,000 keeps the $2,000 DLL until the 10th new Active Trading Day). The tier basis is net trading profit, fixed in WP18g (N-57): 'Only profits made in the Live Funded Account count. Your Express Funded Account transfer balance and Payouts don't affect your Tier.' (article 11748475, dateModified 2026-09-24, re-fetched 2026-09-26). TopStepLivePlan adds every withdrawal back (profit payouts, seed and returned Reserve alike) through LivePlan.tierProfitOf, and a Reserve release lands in both balance and startingBalance, so neither a payout nor a capital return moves the tier; only trading P&L does. The position-size column of the same Expansion Table is now wired as the plan's contract limits (N-58): 'Position Limits remain at the max for each account size (5 lots for $50Ks, 10 lots for $100Ks, 15 lots for $150Ks) until the account reaches Tier 4 with with $100K in profit', so the 50K LFA is capped at 5 lots below $100,000 of net trading profit, then 30, 50, 70 and 100 lots, keyed on the same net-trading-profit basis. Micros count one lot each, the same as minis, because the Scaling Plan article (8284223, re-fetched 2026-09-23) says 'The Micro to Mini ratio functionality is available for the Trading Combine and Express Funded Account. It is not currently available for the Live Funded Account.'; this is the literal and conservative reading. The Daily Loss Limit Safeguard is modeled too (N-58): 'Tradable balance at or below $10,000 -> DLL drops to $2,000, Max Position Size = 5' and 'Tradable balance at or below $5,000 -> DLL drops to $1,000, Max Position Size = 3', 'These limits update on Fridays and return to standard levels once your balance rises back above the thresholds', with the example 'your end-of-day balance goes below $10,000, your Daily Loss Limit will be changed from $3,000 to $2,000 before the start of the next trading session. The DLL will return to $3,000 after the market closes on Friday if your balance is above $10,000.' The engine tightens at any session close (and right after a payout that leaves the balance at or below a threshold, since the payout is deducted that day) and relaxes only at a Friday close, to the level the closing balance still qualifies for; it caps the tier's DLL and lot count, never raises them. Timing assumption: the LFA opens on a Monday, so every fifth session close is a Friday close (the same 5-session week the Reserve review uses). A session-close check reads the balance after any Reserve increment that lands at that close, since the rule is on the tradable balance and a released increment is tradable at once ('additional funds are released from your Reserve into your unlocked balance', article 10657969); the source does not say whether a deposit that day counts, so this is the engine's reading. The safeguard starts inactive, since the source says the limits apply when the balance 'drops to' a threshold; at the 50K tier this is inert, because the $10,000 level equals the standard $2,000 DLL and 5 lots. In drain mode the $1,000 level matters: a balance at or below $5,000 caps a losing trade at $1,000 and 3 lots. The safeguard reads the balance in whole cents, floored the same way payouts are, since a real account balance has no sub-cent part: a D4 default payout leaves exactly $10,000.00 in a real account, so it always counts as at or below $10,000, and from the $15,000 tier up the default mode is held at the $2,000 DLL and 5 lots, $500 under the $2,500 first tier, until a Friday close above $10,000. Also confirmed but deliberately unmodeled, same treatment as the mechanics above: a discretionary, Risk-Team-approved 'Expanded Contract Sizing' program past Tier 4; and discretionary 'Risk Adjustments Outside the Path to Expansion' at fixed net-equity checkpoints -- none of these are automatic, confirmed rules this engine can apply deterministically. The 90/10 split (TOPSTEP_PAYOUT_POLICY.traderShare) is confirmed for the LFA: help.topstep.com's 'Topstep Payout Policy' article (8284233, dateModified 2026-09-03, re-fetched 2026-09-23) states under 'Request Payouts in the Express Funded Account (XFA) and Live Funded Account (LFA)': 'Minimum Payout: $125 / 90/10 profit split'. Capped at exactly one live account at a time ('You can only have one (1) Live Funded Account active') -- the simplest account-count case of any live firm here, since simulateLiveAccount already models exactly one account with no unlock/multi-account mechanic needed. 30-day inactivity closure confirmed ('Live Funded Accounts with no trading activity for more than 30 days may be closed'); this note previously described the rule as confirmed without it actually being wired into TopStepLive.ts's LivePlanInit, so the simulated LFA never closed for inactivity -- corrected by adding maxConsecutiveIdleDays: 30 (INACTIVITY_CLOSURE_DAYS) to buildTopStepLivePlan's LivePlan config, matching this rule for real. Building this plan surfaced a real defect in simulator/livePhase.ts's runLiveHorizon, fixed as part of this work: the withdrawal gate was `state.thresholdLocked && state.balance > state.threshold`, which is exclusively a trailing-drawdown concept -- thresholdLocked never becomes true for a liveDrawdown: null plan, so no DLL-shaped live firm could ever pay out anything before this fix, the same 'inert until a real case exercises it' shape as FundedNext's own payoutTiers cumulative-diffing bug noted on FundedNext.ts. Replaced with LivePlan.withdrawableAmount(state, retainedCushion): for a plan with no live drawdown it pays balance minus startingBalance minus the retained cushion; for a drawdown-shaped plan it pays the balance above the post-withdrawal floor plus the retained cushion (nothing before the lock only when requiresLockForWithdrawal is set, which this LFA turns off); for this LFA either branch then applies the winning-day gate and the 50% per-request cap while the account is still restricted, and the $125 minimum. The LFA is now drawdown-shaped (its $1,000 floor is a StaticDrawdown), so it takes the second branch, and ReserveLivePlan adds the released but not yet withdrawable Reserve to the retained cushion. When the change was first made, every existing drawdown-shaped livePhase test passed unchanged, confirming it was behavior-preserving for Apex/Tradeify/TPT/FundedNext/MFF-Rapid.",
        "The Topstep Octagon ($250,000/month competitive cash pool distributed across all LFA traders by rank, topstep.com/topstep-octagon) is deliberately NOT modeled and never will be under this engine's design, a stronger statement than every other firm's deferred bonus/vault mechanic (Apex's Bonus Vault, Tradeify's Accelerator Reward Pool, MFF's Reserve): those are single-account path-dependent mechanics merely out of v1 scope, whereas the Octagon's payout depends on the relative performance of the entire population of LFA traders, a quantity this single-account Monte Carlo simulator has no representation of and should not invent population data to approximate.",
        "Pro Account (pro-account.md), a simulated LFA substitute for jurisdictions without live market access, previously entirely unmodeled, is now built via buildProAccountPlan() for the 50K-derived tier only (per pro-account.md's own worked example: Pro Account's size is the rounded-up average of a trader's open XFA sizes, not a purchasable tier of its own). Modeled with isInstantFunded: true (no Challenge/eval phase -- entered directly via Risk-team call-up from an existing XFA), accountSize set to Pro's own real $10,000 Starting Balance rather than the $50K XFA-average label, since this engine's accountSize doubles as the literal funded starting balance: this makes the drawdown lock derivation exact with zero new mechanism (atProfit: $2,000, lockedThreshold: lockThresholdAt(0) locks flush at the account's own $10,000 starting balance once profit reaches $2,000, matching pro-account.md's own worked example trigger/locked-value of $12,000 EOD balance / $10,000 floor). $1,000 flat DLL and the CONTRACT_LIMITS scaling table are reused as-is from the XFA's own already-modeled figures, since pro-account.md's own Scaling Plan chart for the 50K tier is numerically identical to the XFA's (both 2/20 below $1,500 profit, 3/30 to $2,000, 5/50 above) -- though pro-account.md itself flags that whether its own chart's 'Account Balance' axis means literal balance or profit-above-$10,000 is not stated by Topstep, unlike the XFA where balance and profit are identical from a $0 start; modeled as profit-keyed since that is this engine's own established convention for every tiered contract limit (see PositionSizing.ts's contractLimitAt, which reads the tier from the full TierProfitContext) and there is no mechanism to key it on raw balance instead. The 5-winning-days-of-$150 first-payout gate and 'net positive after first payout' recurring gate map directly onto minDaysAfterPassForPayout/minQualifyingDayProfit/minPayoutProfitPerCycle, the same mechanism already used elsewhere in this codebase. maxFundedAccounts is Pro's own confirmed 'one at a time' cap (not the XFA's shared 5-account pool). Two things pro-account.md itself explicitly declines to confirm and this model does NOT invent: (1) Profit Split -- pro-account.md explicitly warns not to assume the XFA's 90% share applies, since no source states a Pro-Account-specific split; modeled as 90% anyway (TOPSTEP_PAYOUT_POLICY.traderShare, shared with the XFA and LFA) as the single most defensible placeholder for a required, non-optional field, but this is an unconfirmed assumption the source explicitly warns against, not a confirmed figure -- flagged here so a future reader doesn't mistake it for sourced. (2) the XFA's own post-first-payout 'force MLL to $0' rule -- pro-account.md explicitly declines to say whether this extends to Pro Account (and if it did, the correct analog would be Pro's own $10,000 starting balance, not literal $0); left unmodeled (payoutFloorEffect defaults to None), matching the source's own non-assertion rather than guessing either way.",
        "CONTRACT_LIMITS' funded Tiered tiers now set tierBasis: TierBasis.SessionOpenProfit: help.topstep.com's dedicated 'What is the Scaling Plan?' article states the rule directly -- 'Your max contracts do not increase mid-session. Hit the threshold to release more buying power? Wait for the next session.' Previously this simulator recomputed the XFA's contract-limit tier on every trade within a day using live, intraday-accruing profit, letting a single session's own P&L swing move the cap mid-session; the new ContractLimits.ts tierBasis setting (the same TierBasis setting Tiered daily-loss-limit configs carry, chosen per config rather than shared: these contract tiers use TierBasis.SessionOpenProfit, while Tradeify's scaling daily loss limit uses TierBasis.PeakIntradayProfit) freezes the tier at the prior session's close for the whole day, matching the confirmed rule. Pro Account's own buildProAccountPlan() reuses this same CONTRACT_LIMITS constant unchanged (per the note above), so it inherits the same fix; pro-account.md does not separately confirm or deny the timing rule for Pro Account specifically.",
        "minRetainedCushionOverride is now set to $0 on every TopStep plan (all four XFA payout-path combinations and Pro Account): Plan's own defaultRetainedCushion() previously had no override hook and unconditionally floored the simulated retained cushion at the plan's full funded-drawdown amount ($2,000 here), a cross-firm 'no real trader drains to the edge' default documented on the CLI's own --retain-cushion flag. TopStep's own sources state no such firm-imposed dollar buffer exists on any of its three funded products: standard.md's Buffer Requirement row is explicit ('No stated dollar buffer above the MLL. Eligibility is criteria-based'), consistency.md's is explicit ('None stated for this path specifically'), and pro-account.md's is explicit twice ('No cumulative dollar buffer is stated... Do not compute an implied $750 (5 x $150) buffer'). Without this override, the simulator silently required funded profit to clear roughly the full $2,000 MLL before ANY payout could fire (cushionRoom = balance - threshold - 2000, which is <= 0 pre-lock since the EOD-trailing threshold already sits exactly $2,000 below balance), even though the firm's own stated gate is just 5 winning days of $150+ (Standard/Pro Account) or 3 trading days plus a 40% consistency check with no per-day profit floor (Consistency) -- understating real payout frequency and $/month for every sizing method by requiring roughly 2-3x the profit the firm actually asks for. This is a per-plan override (PlanInit.minRetainedCushionOverride, defaulting to the prior fundedDrawdown.amount floor when unset), not a change to the cross-firm default, so every firm that does not set it keeps the conservative floor (FTMO Futures also sets its own override).",
    ];
    readonly plans = [
        ...PRICING_PATHS.flatMap((pricing) =>
            PAYOUT_PATHS.flatMap((payout) =>
                DLL_OPTIONS.map((isDllEnabled) =>
                    this.buildPlan(buildPlan(pricing, payout, isDllEnabled)),
                ),
            ),
        ),
        this.buildPlan(buildProAccountPlan()),
    ];
    readonly website = 'https://topstep.com';
}

const MAX_FUNDED_ACCOUNTS = 5;
const DLL_OPTIONS = [false, true] as const;

const PRO_ACCOUNT_STARTING_BALANCE = dollars(10_000);
const PRO_ACCOUNT_MLL = dollars(2000);
const PRO_ACCOUNT_DLL = dollars(1000);
const PRO_ACCOUNT_PAYOUT_CAP = dollars(2000);

function buildPlan(
    pricing: PricingPath,
    payout: PayoutPath,
    isDllEnabled: boolean,
): PlanInit {
    const discountedMonthlySubscription = isDllEnabled
        ? pricing.monthlySubscription - pricing.dllMonthlyDiscount
        : pricing.monthlySubscription;
    const variantKey: TopStepVariantKey = isDllEnabled
        ? `${pricing.key}-${payout.key}-dll`
        : `${pricing.key}-${payout.key}`;
    return {
        accountSize: dollars(ACCOUNT_SIZE),
        consistency: new ConsistencyRule(
            ConsistencyScope.Eval,
            COMBINE_CONSISTENCY,
        ),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: MAX_LOSS_LIMIT,
            lock: {
                atProfit: MAX_LOSS_LIMIT,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: isDllEnabled
            ? { amount: DLL_AMOUNT, kind: DailyLossLimitKind.Flat }
            : { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(pricing.activation),
            monthlySubscription: dollars(discountedMonthlySubscription),
            oneTimeEval: dollars(0),
            reset: dollars(pricing.reset),
        },
        fundedConsistency: {
            kind: 'set',
            rule:
                payout.fundedConsistency === null
                    ? null
                    : new ConsistencyRule(
                          ConsistencyScope.Funded,
                          fraction(payout.fundedConsistency),
                      ),
        },
        id: {
            accountSize: ACCOUNT_SIZE,
            firm: FirmId.TopStep,
            variant: TOPSTEP_VARIANTS[variantKey],
        },
        label: planLabel(
            ACCOUNT_SIZE,
            `${pricing.label} · ${payout.label}${isDllEnabled ? ' · DLL' : ''}`,
        ),
        maxConsecutiveIdleDays: INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: payout.winningDays,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: MIN_PAYOUT_PROFIT_PER_CYCLE,
        minPayoutRequest: TOPSTEP_PAYOUT_POLICY.minPayoutRequest,
        minQualifyingDayProfit: payout.minQualifyingDayProfit,
        minRetainedCushionOverride: NO_STATED_PAYOUT_BUFFER,
        minTradingDays: MIN_TRADING_DAYS,
        payoutBalanceShareCap: TOPSTEP_PAYOUT_POLICY.requestBalanceShareCap,
        payoutFloorEffect: PayoutFloorEffect.ReleaseFloor,
        payoutMethodFee: WIRE_PAYOUT_FEE,
        payoutRequestCap: isDllEnabled
            ? payout.dllPayoutRequestCap
            : payout.payoutRequestCap,
        payoutTiers: [
            {
                thresholdProfit: dollars(0),
                traderShare: TOPSTEP_PAYOUT_POLICY.traderShare,
            },
        ],
        profitTarget: PROFIT_TARGET,
    };
}

function buildProAccountPlan(): PlanInit {
    return {
        accountSize: PRO_ACCOUNT_STARTING_BALANCE,
        availability: PlanAvailability.CallUpOnly,
        consistency: null,
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: PRO_ACCOUNT_MLL,
            lock: {
                atProfit: PRO_ACCOUNT_MLL,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: {
            amount: PRO_ACCOUNT_DLL,
            kind: DailyLossLimitKind.Flat,
        },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(0),
            reset: dollars(0),
        },
        id: {
            accountSize: ACCOUNT_SIZE,
            firm: FirmId.TopStep,
            variant: TopStepVariant.ProAccount,
        },
        isInstantFunded: true,
        label: planLabel(ACCOUNT_SIZE, 'Pro Account'),
        maxFundedAccounts: 1,
        minDaysAfterPassForPayout: TOPSTEP_PAYOUT_POLICY.winningDaysPerRequest,
        minPayoutProfitPerCycle: dollars(0.01),
        minQualifyingDayProfit: TOPSTEP_PAYOUT_POLICY.minWinningDayProfit,
        minRetainedCushionOverride: NO_STATED_PAYOUT_BUFFER,
        minTradingDays: 0,
        payoutRequestCap: PRO_ACCOUNT_PAYOUT_CAP,
        payoutTiers: [
            {
                thresholdProfit: dollars(0),
                traderShare: TOPSTEP_PAYOUT_POLICY.traderShare,
            },
        ],
        profitTarget: dollars(0),
    };
}
