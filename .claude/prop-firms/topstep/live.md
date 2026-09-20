# Topstep Live Funded Account (LFA)

**Sources:**

- help.topstep.com, Live Funded Account® collection, Article ID 10657969, "Live Funded Account Parameters" (last updated 2026-09-17)
- help.topstep.com, Live Funded Account® collection, Article ID 13747178, "Live Funded Account Call Up and Call Down Process" (last updated 2026-08-11)
- help.topstep.com, Live Funded Account® collection, Article ID 11748475, "Dynamic Live Risk Expansion" (last updated 2026-07-17)
- help.topstep.com, Live Funded Account® collection, Article ID 8284229, "What are the costs in the Live Funded Account?" (last updated 2026-06-16)
- help.topstep.com, Live Funded Account® collection, Article ID 15764697, "The Topstep Octagon" (last updated 2026-09-03)
- help.topstep.com, Live Funded Account® collection, Article ID 11177768, "TopstepX™ Live Performance Bonus" (last updated 2026-07-01, article now documents the bonus's own retirement)
- help.topstep.com, Getting Started collection, Article ID 8284099, "Topstep Program Overview" (last updated 2026-09-10)
- help.topstep.com, Topstep FAQs collection, Article ID 8284204, "What is the Maximum Loss Limit?" (last updated 2026-09-18)
- help.topstep.com, Topstep FAQs collection, Article ID 8284116, "Am I Eligible to Trade with Topstep?" (last updated 2026-09-04)
- help.topstep.com, Trading Education collection, Article ID 8284211, "Economic Releases" (last updated 2026-09-10)
- help.topstep.com, Getting Started collection, Article ID 13350348, "Topstep Holiday Trading Hours" (last updated 2026-09-18)
- help.topstep.com, Topstep FAQs collection, Article ID 10290170, "Professional Behavior at Topstep" (last updated 2026-06-10)

Note on citation completeness: the two source bundles this file was drafted from (`bundle-live.txt`, `bundle-firmwide.txt`) give each article's ID, title, collection, and last-updated timestamp, but no literal article URL. Citations above are by ID and title rather than a fabricated URL; do not treat any URL constructed from these IDs as confirmed.

**Last Verified:** 2026-09-19
**Last Updated:** 2026-09-19

## Overview

The Live Funded Account (LFA) is Topstep's live-capital stage, the destination both XFA payout paths (Standard and Consistency) transition into. Per the LFA Parameters article's own Overview: "Real capital. Real markets. The Live Funded Account® (LFA) is the big leagues — Topstep's money behind you, no Payout caps, and unlimited growth potential. When the call-up comes, all Express Funded Accounts (XFA) close. This is what you've been working toward." A trader can hold only one active LFA at a time, and receiving one closes every XFA.

**Scope gap, flagged up front:** every number in this file that varies by account size is confirmed for three tiers, $50K, $100K, and $150K, matching the three XFA tiers documented in `standard.md` / `consistency.md`. Topstep's own engine model in this repo (`TopStepLive.ts`) hardcodes a single `ACCOUNT_SIZE_TIER = 50_000`, so only the $50K row of every table below is currently reachable through the simulator. See "Engine Cross-Check" below.

## Live Account Size and Starting Balance

**LFA size** is derived, not chosen. Per the LFA Parameters article: "Your LFA size is based on the average account size (the funded tier of each XFA — $50K, $100K, or $150K — not the current balance) of all active, eligible XFAs with at least 1 Payout. If you haven't requested any Payouts yet, all XFAs are averaged together. The average is rounded up to the nearest tier ($50K, $100K, or $150K)." Source example: "Four 50K XFAs + one 150K XFA = 70K average → rounds up to $100K LFA." The FAQ adds a scope note: "all Express Funded Accounts are averaged together, so new Topstep Labs accounts may affect your account size" (Topstep Labs itself is out of scope for this documentation pass, see "Other Confirmed Rules").

**Starting balance** is set by two numbers per the same article: "Account Size — the average of your eligible XFAs, rounded up to the nearest tier. This is a hard cap ($50K, $100K, or $150K)" and "Cumulative balance — the actual balances in those XFAs, added together. Remember: what transfers is capped at the account size." What transfers then splits: "20% available to trade immediately — minimum $10,000" and "80% held in Reserve — released in 4 increments of 25% as you hit profit thresholds." The Call Up article restates the same mechanic with one added detail: "Your starting balance is 20% of your cumulative XFA balance — but capped at your Account Size, with any excess forfeited (not banked into Reserve). If 20% of the capped amount doesn't reach $10,000, Topstep supplements from that same capped amount to meet the $10,000 minimum. The remaining 80% is held in Reserve."

### Worked Example

This walkthrough computes a new LFA's Starting Balance and Reserve split from the actual dollar balances of transitioning XFAs at the moment of call-up, using the source's own stated example. It is a one-time balance-derivation calculation, not the running end-of-day P&L convention used elsewhere in this file for the Dynamic Live Risk Expansion and Daily Loss Limit Safeguard sections, and it does not switch conventions partway through.

Source example, verbatim: "Four $50K XFAs holding $25K each. Account Size = $50K. Cumulative balance was $100K, so $50K is forfeited. → $10K to trade, $40K in Reserve."

1. Four XFAs, each at the $50K funded tier, each holding an actual balance of $25,000. Cumulative balance = 4 × $25,000 = $100,000.
2. Account Size = the average of the four XFAs' own tiers (all $50K) = $50,000. This is already exactly on a tier boundary, so it rounds up to $50,000 with no adjustment needed.
3. The transfer is capped at Account Size: min($100,000 cumulative, $50,000 cap) = $50,000. The remaining $100,000 − $50,000 = $50,000 is forfeited, matching the source's own "so $50K is forfeited" and the Call Up article's "with any excess forfeited (not banked into Reserve)."
4. 20% of the capped $50,000 = $10,000, which already meets the source's stated $10,000 minimum, so no Topstep supplement is triggered here.
5. Starting (unlocked, tradable) balance = $10,000. Remaining Reserve = $50,000 − $10,000 = $40,000 (the other 80% of the capped amount), matching the source's own "$10K to trade, $40K in Reserve."

Re-derivation check: $10,000 unlocked + $40,000 Reserve = $50,000, exactly the capped transfer amount from step 3. Consistent.

## Live Account Parameters by Size

| Parameter                                                                     | $50K LFA                                                                           | $100K LFA | $150K LFA |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- | --------- |
| Starting Daily Loss Limit                                                     | $2,000                                                                             | $3,000    | $4,500    |
| Starting Maximum Position Size                                                | 5                                                                                  | 10        | 15        |
| Capital Expansion Profit Target (per 25% Reserve unlock)                      | $3,000                                                                             | $6,000    | $9,000    |
| Discretionary Risk-Adjustment Net Equity ("may be considered," not automatic) | $10,000                                                                            | $15,000   | $20,000   |
| Minimum Starting (Tradable) Balance                                           | $10,000, same floor for every tier                                                 | $10,000   | $10,000   |
| Reserve Split at Transfer                                                     | 20% tradable / 80% Reserve, same formula for every tier                            | same      | same      |
| Auto-Liquidation Trigger                                                      | $1,000 tradable balance, same trigger for every tier (see dedicated section below) | same      | same      |

**Capital Expansion mechanics** ("Live Funded Account Parameters"): it is "Reviewed every Monday morning" (the same article's FAQ says "reviewed weekly", a wording difference with no stated reconciliation), "Funds deposited within 1-2 business days", "Can be delayed or denied for excessive or reckless risk behavior", and "You cannot unlock multiple tiers with a single large win — each threshold requires net profit since the last expansion." A single outsized win therefore unlocks one increment, not several.

The Maximum Loss Limit article states plainly that the LFA has no MLL of its own: the section headed "In the Live Funded Account", whose body reads "For the Live Funded Account, refer here." Do not read any DLL or Reserve figure above as an MLL analog; the LFA's only trailing-style floor is the flat $1,000 auto-liquidation threshold below, which does not trail or lock the way the Combine/XFA MLL does.

## Dynamic Live Risk Expansion (Profit-Triggered Growth)

Per "Dynamic Live Risk Expansion": "Your net profit determines your Tier. Spend 10 Active Trading Days at each Tier to unlock the next level." Mechanics, quoted directly:

- "Your Daily Loss Limit increases at end of day after 10 Active Trading Days in the new Tier."
- "If your net profit falls below your Tier at end of day, your Daily Loss Limit scales down that same day."
- "If you drop out of a Tier before 10 days, the counter resets when you re-enter it."
- "You must move one Tier at a time. No skipping."
- Active Trading Day: "Any day you place at least 1 trade — even a single micro contract. No minimum P/L required."
- "Only profits made in the Live Funded Account count. Your Express Funded Account® transfer balance and Payouts don't affect your Tier."

Expansion table (net profit in the LFA → Daily Loss Limit → Maximum Position Size), directly from the source's own "Expansion Table":

| Net Profit in LFA | Daily Loss Limit | Maximum Position Size        |
| ----------------- | ---------------- | ---------------------------- |
| $15,000           | Up to $5,000     | unchanged (account-size max) |
| $20,000           | Up to $5,500     | unchanged (account-size max) |
| $50,000           | Up to $6,000     | unchanged (account-size max) |
| $100,000          | Up to $10,000    | Up to 30 lots                |
| $200,000          | Up to $20,000    | Up to 50 lots                |
| $550,000          | Up to $50,000    | Up to 70 lots                |
| $1,000,000        | Up to $100,000   | Up to 100 lots               |

Source's own note on the "unchanged" rows, verbatim (including its own duplicated "with"): "Position Limits remain at the max for each account size (5 lots for $50Ks, 10 lots for $100Ks, 15 lots for $150Ks) until the account reaches Tier 4 with with $100K in profit."

**Expanded Contract Sizing** (beyond the table above) is not automatic: "This is not automatic. All requests must be reviewed and approved by the Risk Team." Eligibility: "Tier 4 or higher in the Dynamic Risk Expansion system" and "Minimum $100,000 balance in your Live Funded Account."

**Discretionary risk adjustments outside this path:** the Risk Team "may adjust your Daily Loss Limit and Maximum Position Size based on net equity — even if you haven't moved through the expansion tiers. These adjustments are not automatic and are made at Risk's discretion," considered at the net-equity thresholds in the table above ($10K/$15K/$20K for $50K/$100K/$150K accounts). This is genuinely discretionary, not a deterministic rule, and is correctly excluded from the simulator by the same logic that excludes Shoulder Tap review.

## The Topstep Octagon (Monthly Bonus Competitions)

Two monthly leaderboard competitions run in parallel, both "LFA Traders only", both with automatic enrollment ("All LFA Traders — automatically enrolled, no sign-up required"), both listed as "Starts August 2026". A trader can place in both in the same month; the pools are separate ("$250,000 every month, fixed ($200,000 allocated to Top PnL and $50,000 allocated to Longest Winning Streak)").

**Qualifying:** "Finish the month net positive and rank in the top 100 for P&L, or rank in the top 5 for the longest winning streak." Finishing the month net positive is a hard gate, not just a ranking tiebreak. "Every account starts each month at a virtual $0. Prior account balance is retained but doesn't affect your monthly ranking." Cadence: "Resets at market open on the first day of each month", with the leaderboard updating "in real time throughout the month". Payment: "Added to your account balance the following month after rankings are finalized."

**Top PnL Competition, per-rank payouts:**

| Place      | Payout      |
| ---------- | ----------- |
| 1st        | $75,000     |
| 2nd        | $25,000     |
| 3rd        | $20,000     |
| 4th        | $15,000     |
| 5th        | $10,000     |
| 6th-10th   | $5,000 each |
| 11th-25th  | $750 each   |
| 26th-50th  | $500 each   |
| 51st-100th | $125 each   |

**Longest Winning Streak, per-rank payouts** (qualifying streak is "consecutive days with more than $500 in profit"):

| Place | Payout  |
| ----- | ------- |
| 1st   | $25,000 |
| 2nd   | $15,000 |
| 3rd   | $5,000  |
| 4th   | $3,000  |
| 5th   | $2,000  |

**Ties are pooled, not duplicated:** "Combine the prize money for all positions included in the tie. Split the total equally among everyone tied. The next finisher receives the prize for the next available rank." The article's own example: a three-way tie for 1st in the streak competition pools $25,000 + $15,000 + $5,000 = $45,000, so "Each tied trader receives $15,000, and the next trader receives the 4th-place prize of $3,000."

**Opting out costs eligibility.** A trader may opt out of the leaderboard or appear under an alias, but opting out forfeits bonus eligibility as well as the listing.

## Daily Loss Limit Safeguard (Balance-Triggered Downgrade)

Distinct from the profit-triggered expansion above, this mechanic moves the DLL _down_ when tradable balance falls, confirmed identically in both the LFA Parameters and Dynamic Live Risk Expansion articles:

| Tradable Balance | Daily Loss Limit | Maximum Position Size |
| ---------------- | ---------------- | --------------------- |
| $10,000 or below | $2,000           | 5                     |
| $5,000 or below  | $1,000           | 3                     |

"These limits update on Fridays and return to standard levels once your balance rises back above the thresholds." Worked example from the source: "If you have a 100K Live Funded Account and your end-of-day balance goes below $10,000, your Daily Loss Limit will be changed from $3,000 to $2,000 before the start of the next trading session. The DLL will return to $3,000 after the market closes on Friday if your balance is above $10,000."

## The $1,000 Auto-Liquidation Floor

This is a static bust threshold, not a trailing-and-locking MLL-style mechanic (the LFA has no MLL of its own, see above).

**Trigger**, in the source's own language: "If your LFA balance drops below $1,000" (CALLOUT box), restated in the FAQ as "If your Live Funded Account balance drops below $1,000."

**Consequence**, in the source's own language: the CALLOUT box says the account "may be immediately liquidated and closed at end of the trading day," while the FAQ, describing the same $1,000 trigger, says the account "will be liquidated immediately and closed at the end of the trading day." The two differ in how far they carry the sentence: the callout stops at "The remaining balance would then be sent as a final Payout.", while the separate FAQ answer continues "...to you as a final payout before the account is closed." Worked example, stated identically in both places: "Account drops to $800 = auto liquidation and account closure at the end of that day. The remaining $800 is sent as a final Payout. Unlocked reserve is forfeited."

**Two things this file does not silently resolve:**

- The same article uses "may be" liquidated in one place and "will be" liquidated, describing the identical $1,000 trigger, in another. Whether this is discretionary ("may") or automatic ("will") is not resolved by the source's own inconsistent wording.
- Whether the check is real-time/intraday or purely end-of-day is not clearly stated either: "immediately" and "closed at end of the trading day" appear in the same sentence. Do not assume either a real-time unrealized-P&L check (as the Combine/XFA MLL explicitly has) or a purely EOD-only check without a clearer citation.
- This $1,000 figure directly conflicts with the firm-wide Program Overview article's own LFA "Rule": "Do not let your Account Balance reach or go below $0." Neither source states that these are the same rule described in two different unit conventions (the way, for example, a nominal-balance MLL and a profit-based MLL can be); they are simply two different numbers from two different articles describing what appears to be the same underlying "the account can't go too low" concept. Do not average them, and do not assume $0 is correct just because it is the more intuitive-sounding floor: the LFA Parameters article is LFA-specific, more recently updated (2026-09-17 vs. 2026-09-10), and gives an explicit worked example, so it is treated as the more authoritative figure here, but the $0 language is flagged, not discarded.

## Daily Loss Limit Breach (Intraday, Resets Daily)

Separate from the $1,000 floor above: per the firm-wide Program Overview's LFA Objectives list (not its own separate "Rule" bullet, which is the $0-balance floor discussed above): "Do not hit or exceed the Daily Loss Limit (DLL) — breaching it deactivates your account for that trading day." This is a same-day deactivation, not a permanent account closure, unlike an MLL breach in the Combine/XFA.

## Payouts

Per the firm-wide Program Overview, the LFA's stated payout eligibility objective is "5 Winning Days of $150 or more" (this exact figure is stated only in that one article; the LFA Parameters article does not restate it). Per the LFA Parameters FAQ: "Payout eligibility is not tied to capital expansion. You can take Payouts while still trading with partial account access." And: "Payouts can only be taken from your unlocked balance, not from your Live Funded Account Reserve... withdrawing the full balance will close your account. As you reach each profit target, additional funds are released from your Reserve into your unlocked balance. Once 100% of your balance has been unlocked, you may withdraw those funds as well." Payouts are unavailable during holiday hours firm-wide (Topstep Holiday Trading Hours article).

| Parameter                            | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profit Split                         | Unconfirmed (see Not Confirmed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Payout Frequency                     | Gated by winning days, not daily from the start: "5 winning days of $150+ Net P&L per Payout cycle (not consecutive)", and "After you request a Payout, your winning day count restarts." Daily requests unlock only after 30 non-consecutive $150+ days on the LFA: "Once you've earned $150+ Net P&L on 30 non-consecutive days in your Live Funded Account, you unlock daily Payouts ... once per day (min $125). Winning days from the XFA do not count toward this total." (Topstep Payout Policy) |
| Buffer Requirement                   | Unconfirmed (see Not Confirmed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Minimum Payout Request               | $125 ("Minimum Payout: $125", and "once per day (min $125)" for the post-30-day daily cadence, Topstep Payout Policy)                                                                                                                                                                                                                                                                                                                                                                                   |
| Max Payout per Cycle                 | "Request up to 50% of your account balance with no dollar cap"; the XFA-style dollar caps do not apply, "Live Funded Account Payouts are not capped." (Topstep Payout Policy)                                                                                                                                                                                                                                                                                                                           |
| Consistency on Payouts               | Not stated as a percentage for the LFA (see Not Confirmed)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Maximum Total Payouts / Lifetime Cap | No Payout caps, per the LFA Parameters Overview: "no Payout caps, and unlimited growth potential"                                                                                                                                                                                                                                                                                                                                                                                                       |

## Eligibility, Call-Up, and Call-Down

**Call-up** is discretionary and evaluated case by case: "Your full trading profile. Not just one metric. Consistency, Risk management, Position sizing, Products traded, Use of stops and risk tools, Previous call-ups to Live, Payout history, Overall account behavior. Every Trader is evaluated individually using comprehensive monitoring tools." No deterministic dollar or day-count trigger is stated for call-up, unlike the Combine's own profit target.

**Call-down (Shoulder Tap)** is also discretionary, triggered by recurring patterns rather than a single event: "Significant drawdown of seeded capital (excluding profits and bonuses)," plus patterns such as repeatedly hitting the DLL, revenge trading, oversized position swings, and gambling-like behavior. Per Dynamic Live Risk Expansion: "Payouts do not count as drawdown. Drawdown is based solely on losses from your Live Funded Account starting balance," and this trigger is unquantified (no percentage or dollar amount given), distinct from the deterministic $1,000 floor above.

The resulting account: "A single Shoulder Tap Express Funded Account... Balance reflects your remaining Live capital... Follows standard XFA parameters and Payout Policy... You are limited to 1 Shoulder Tap XFA — no multiple accounts." Returning to Live is itself discretionary, "through the standard review process," and preserves state: "they will continue trading in their Live Funded Account with the same balance that they had when they were called down. Any seed capital still held in reserve by Topstep will be available to unlock as the Trader reaches the designated profit targets based on account size." If the Shoulder Tap XFA is traded to $0, "the remaining seed capital will be forfeited."

**Country eligibility:** some countries can hold an XFA but not an LFA. Per the Eligibility article, those traders "may be considered for the Pro Account track rather than the Live Funded Account, based on performance." The Pro Account is confirmed to exist as a distinct product, but no starting balance, MLL, DLL, or payout figure for it appears anywhere in either source bundle used for this file, see Not Confirmed.

## Other Confirmed Rules

- **Single active LFA:** "You can only have one (1) Live Funded Account active. When you receive a Live Funded Account, all Express Funded Accounts are closed."
- **30-day inactivity:** "Live Funded Accounts with no trading activity for more than 30 days may be closed. Live Funded Accounts can't be put on hold."
- **No automated trading on Live:** "The API Gateway is built for the simulated environment and isn't available on Live, so automated strategies are not possible at this time in the Live Funded Account."
- **Concurrent Trading Combine allowed, XFA activation is not:** "You can have Trading Combines while actively trading a Live Funded Account. The restriction is only on activation — a passed Trading Combine cannot be activated into an Express Funded Account while your Live Funded Account is active. That option becomes available again if the Live Funded Account is lost."
- **CME Protocol blended trade dates, LFA-only:** per the firm-wide Holiday Trading Hours article's own table, a three-row table: "Live Funded Account® | Yes", "Trading Combine® | No", "Express Funded Account® | No" for whether the account type follows the CME Holiday Protocol. On a blended trade date, "your DLL applies to the entire blended session — not each calendar day within it," so hitting the DLL during an abbreviated holiday session can lock trading into what feels like the next calendar day, for the LFA specifically; Trading Combine and XFA accounts treat each calendar day independently even across the same holiday. The full 2026 holiday date/close-time schedule itself is not reproduced here since it applies identically across Trading Combine, XFA, and LFA ("Applies to: Trading Combine®, Express Funded Account® (XFA), Live Funded Account® (LFA)") and belongs at the firm level, not duplicated per plan file; see the cited Holiday Trading Hours article directly. Payouts are unavailable during holiday hours firm-wide.
- **Topstep Octagon (replaces the old Live Performance Bonus):** the prior "TopstepX™ Live Performance Bonus" was formally retired: "This article references the old Live Performance Bonus, which was retired as of June 2026. Starting July 1, 2026, we've replaced this bonus structure with the Topstep Octagon." The Octagon is a monthly leaderboard competition, automatic enrollment for all LFA traders, two ways to win (Top PnL, ranked in the top 100; Longest Winning Streak, ranked in the top 5 for consecutive $500+ profit days), a fixed $250,000/month pool ($200,000 Top PnL / $50,000 Winning Streak), resetting to a virtual $0 ranking each month while the trader's real account balance is unaffected by that reset. This is a population-relative mechanic. Consistent with this engine's existing design note, the Octagon is deliberately not modeled and never will be under this simulator's single-account design; this is treated as settled, not re-litigated here.
- **Live account costs:** unlike the Combine, LFA traders pay their own costs directly. CME Professional Market Data is billed per exchange at $133/exchange/month; Topstep covers one exchange by default ("Default: CME data covered"), so a trader needing all 4 exchanges (CME, NYMEX, COMEX, CBOT) pays $540/month total, or $399/month out of pocket with the one free exchange applied. Round-turn commissions on Live "are deducted directly from your brokerage account balance," unlike the Combine’s simulated per-lot fee. The TopstepX Commissions article states costs per instrument rather than a single flat figure, giving a worked example of "Example using ES & MES | ES | MES", "NFA & Regulatory Fees | $0.02 | $0.02", "Exchange Fee | $2.76 | $0.70", "Commissions | $1.00 | $0.50", "Total | $3.78 | $1.22", and a range of "Exchange Fees: $2.46–$4.30 (set by exchange, vary by instrument)". Platform license costs, which Topstep covers "for many supported platforms" in the Combine, are the trader's own responsibility on Live.
- **News trading:** per the firm-wide Economic Releases article, "Topstep doesn't require you to flatten positions during economic releases — in SIM or Funded Accounts," a firm-wide statement whose "Funded Accounts" category is read here as including the LFA (Live Funded Account is itself named a "Funded Account").
- **Prohibited conduct, LFA-specific:** "Intentionally depleting a Live Funded Account® (LFA) balance to force a failure" is explicitly listed as behavior that puts an account at risk.
- **Topstep Labs:** a series of limited-availability, first-come-first-served experimental products, now fully documented in [labs.md](labs.md). Relevant here because its accounts factor into LFA size averaging: "all Express Funded Accounts are averaged together, so new Topstep Labs accounts may affect your account size" (see Starting Balance above).
- **A call-up cannot be declined and takes time to land.** "No. Once the Risk Team determines you're ready, your options are to move to Live or close your Express Funded Account." Once called up, the LFA takes "7 to 10 business days" to become ready.
- **A call-down comes without notice.** "No. There is no warning before being called down."
- **Shoulder Tap accounts are capped and excluded from Back2Funded.** "No. You are limited to 1 Shoulder Tap Express Funded Account." and "No. Back2Funded Reactivation does not apply to Shoulder Tap accounts." Back2Funded separately excludes any account "associated with a Live Funded Account® (LFA), Pro Account, or Shoulder Tap XFA".
- **Reckless trading can cost the capital itself.** "Warning: Reckless or undisciplined trading in a Live Funded Account may result in forfeiture of live capital." The Risk Team may also adjust an LFA's Daily Loss Limit and Maximum Loss Limit outside the normal expansion path.
- **Micro-to-mini conversion is not available on the LFA.** "The Micro to Mini ratio functionality is available for the Trading Combine and Express Funded Account. It is not currently available for the Live Funded Account." The contract limits in the size table above are therefore literal on Live.
- **Live has its own, tighter restricted-product limits.** The Risk Adjustments article gives the LFA a separate table from the Combine/XFA/Pro one (for example MCL at 3/6/9 on Live against 30/60/90 elsewhere, and MGC at 5/10/15 against 30/60/90). Check that article's LFA column before sizing a restricted product on Live.
- **Data fees do not pro-rate, and bill on the 26th.** "Fees for additional exchanges still apply and are billed on the 26th of each month", and "the exchange does not pro-rate data fees (no partial months)", so the article advises starting an LFA on the 1st. Commissions and fees run $0.72 to $2.04 depending on product ("Commissions & Fees: $0.72–$2.04 (go to brokerages)"). The source states this as one component of the round-turn cost, not a per-side figure.
- **Pause trading while a payout processes.** "Live Accounts: Please note that after submitting a Payout request, trading should be paused until the Payout has been fully processed and the funds have been deducted from the account." A copy-trading connection "is automatically disabled while a Payout processes" and must be manually re-enabled afterwards.

- **Risk Lock is available on a Live Funded Account**: "Risk Lock — Once you’re in a Live Funded Account (LFA), you’re trading real firm-backed capital. If you want to protect an exceptio" nal run, Risk Lock is the mechanism.
- **Opting out of the leaderboard forfeits bonuses**: "if you opt out, you won’t be eligible for bonuses and won’t appear on the leaderboard. Only Traders with Live Funded Account" s are eligible.
- **Leaderboard bonuses pay the following month**: "Bonuses are paid the following month after leaderboard rankings are finalized. The bonus is added directly to your account balance" .

## Engine Cross-Check (`TopStepLive.ts`)

Read in full and checked line by line against both source bundles.

**Confirmed gaps (flagged, not resolved):**

1. **Single account-size tier.** `ACCOUNT_SIZE_TIER = dollars(50_000)` is hardcoded. The source confirms three LFA size tiers ($50K/$100K/$150K), each with its own Starting DLL, Starting Maximum Position Size, and Capital Expansion Profit Target (see "Live Account Parameters by Size" above). Only the $50K row of every one of those tables is reachable through the current model.
2. **No Reserve / Capital Expansion mechanic at all.** Nothing in this file represents the 80%-held-back Reserve or its four 25%-increment unlocks tied to the $3,000/$6,000/$9,000 profit thresholds. `startingBalance` is computed as a single number; the corresponding Reserve balance is never tracked.
3. **`liveDrawdown: null`.** No representation of the confirmed, deterministic $1,000 tradable-balance auto-liquidation floor. This is a genuinely different kind of gap than the Shoulder Tap review (which is legitimately discretionary and correctly left unsimulated): the $1,000 floor is described with a specific dollar trigger and a worked example, i.e., a hard, simulable rule, even though its exact real-time-vs-EOD timing is itself ambiguous in the source (see above).
4. **No Daily Loss Limit Safeguard.** `DLL_TIERS` only encodes the upward, profit-triggered Dynamic Live Risk Expansion path. The separate, balance-triggered downgrade (tradable balance ≤ $10,000 → DLL $2,000/5 contracts; ≤ $5,000 → DLL $1,000/3 contracts, updated Fridays) has no representation anywhere in this file.
5. **`TRADER_SHARE = 0.9`** (used as `payoutTiers[0].traderShare`) has no citation anywhere in either source bundle. Neither article states an LFA profit-split percentage. Flagged, not resolved, see Not Confirmed.
6. **`TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT`** (5% `preLock` / 5% `postLock`) also has no matching figure in either bundle. This appears to be an internal simulator parameter rather than a sourced firm rule; flagged for awareness rather than as a confirmed documentation error.

**Confirmed correct (checked, not just assumed):**

- `computeTopStepLiveStartingBalance`'s formula, `Math.max(MIN_STARTING_BALANCE, STARTING_BALANCE_SHARE * Math.min(cumulativeXfaBalance, accountSizeTier))` with `MIN_STARTING_BALANCE = 10_000` and `STARTING_BALANCE_SHARE = 0.2`, matches the source's own rule exactly: "Your starting balance is 20% of your cumulative XFA balance — but capped at your Account Size, with any excess forfeited (not banked into Reserve). If 20% of the capped amount doesn't reach $10,000, Topstep supplements from that same capped amount to meet the $10,000 minimum.", for the one tier ($50K) it is able to model.
- `DLL_TIERS`' profit thresholds and values ($15K/$20K/$50K/$100K/$200K/$550K/$1M net profit → $5,000/$5,500/$6,000/$10,000/$20,000/$50,000/$100,000 DLL, with 30/50/70/100-lot caps at the four highest tiers, and the base tier at $2,000 DLL / 5 contracts / $0 profit) match the source's Expansion Table and the $50K "Starting Daily Loss Limit and Maximum Position Size" row exactly.
- The 10-Active-Trading-Day hold-per-tier gate described in the source is not visible anywhere in `TopStepLive.ts` itself; it may be implemented in other engine code not covered by this file, and this file makes no claim either way about that.

## Not Confirmed By This Source

- **Profit Split (LFA)** — neither `bundle-live.txt` nor `bundle-firmwide.txt` states a profit-split percentage for the LFA anywhere. The engine hardcodes 90% (`TRADER_SHARE = 0.9`) with no citation. Do not assume the sim-funded-style 90/10 split carries over to LFA capital, which the source describes as "Topstep's prop firm capital," not a Sim Funded profit share.
- **LFA payout consistency requirement and XFA-origin-path carryover** — the Program Overview article states the LFA's payout objective as "5 Winning Days of $150 or more" with no consistency percentage. Neither bundle states whether a trader who reached Live via the Consistency XFA path (40% best-day target) retains any consistency requirement once on the LFA, or whether every LFA trader follows the same single "5 Winning Days" objective regardless of origin path. Do not assume the 40% Consistency XFA rule carries into the LFA.
- **Buffer Requirement (LFA)** — not stated anywhere in the sources read for this file. Do not assume any buffer figure documented for the Combine or an XFA in `standard.md` / `consistency.md` applies here without its own citation. (Minimum Payout Request and Max Payout per Cycle were resolved on 2026-09-19 from the dedicated Topstep Payout Policy article, which a re-audit found had never been cited by this file; see the table above.)
- **$1,000 vs. $0 floor conflict, and "may be" vs. "will be" liquidated** — see "The $1,000 Auto-Liquidation Floor" above. Do not silently pick one figure or one wording as definitively correct; both are quoted from the firm's own live articles. A third data point, from the Topstep Payout Policy article: "Note: Requesting a full 100% Payout closes your LFA since the balance reaches the Maximum Loss Limit." That sentence implies the LFA's Maximum Loss Limit sits at the account's own starting balance rather than $1,000 below it, but it is a note about a payout consequence, not a statement of the floor, and it does not resolve the conflict.
- **Trading platform, a conflict between two of Topstep's own articles** — "What are the costs in the Live Funded Account?" (8284229) refers to "many supported platforms" during the Combine, while the LFA platform article (8284199) states "TopstepX™ is the only available trading platform." Neither source reconciles the two. Do not assume either is definitive for the LFA.
- **Whether the $1,000 check is real-time/intraday or end-of-day-only** — the source's own phrasing ("immediately liquidated... at end of the trading day") is internally ambiguous. Do not assume it works like the Combine/XFA MLL's confirmed real-time unrealized-P&L check without a clearer citation.
- **Pro Account parameters** — the Eligibility article confirms the Pro Account exists as a distinct track for traders in LFA-ineligible countries, but no starting balance, MLL, DLL, or payout-cap figure for it appears anywhere in either bundle used for this file. Do not assume any LFA or XFA figure applies to the Pro Account; it is out of scope for this file entirely.
- **`TOPSTEP_LIVE_DEFAULT_CUSHION_PERCENT` (engine's 5%/5% pre/post-lock cushion)** — no figure resembling this appears in either source bundle for the LFA. Do not treat it as firm-sourced without a citation.

---

**Last Updated:** 2026-09-19
**Sources:**

- help.topstep.com, Article ID 8284233, "Topstep Payout Policy" (updated 2026-09-03). Source of the LFA payout cadence, the $125 minimum, the uncapped 50%-of-balance maximum, and the full-100%-payout note. Located by a 2026-09-19 re-audit; it had not previously been cited by this file.
- help.topstep.com, Article ID 10657969, "Live Funded Account Parameters" (updated 2026-09-17)
- help.topstep.com, Article ID 13747178, "Live Funded Account Call Up and Call Down Process" (updated 2026-08-11)
- help.topstep.com, Article ID 11748475, "Dynamic Live Risk Expansion" (updated 2026-07-17)
- help.topstep.com, Article ID 8284229, "What are the costs in the Live Funded Account?" (updated 2026-06-16)
- help.topstep.com, Article ID 15764697, "The Topstep Octagon" (updated 2026-09-03)
- help.topstep.com, Article ID 11177768, "TopstepX™ Live Performance Bonus" (updated 2026-07-01)
- help.topstep.com, Article ID 8284099, "Topstep Program Overview" (updated 2026-09-10)
- help.topstep.com, Article ID 8284204, "What is the Maximum Loss Limit?" (updated 2026-09-18)
- help.topstep.com, Article ID 8284116, "Am I Eligible to Trade with Topstep?" (updated 2026-09-04)
- help.topstep.com, Article ID 8284211, "Economic Releases" (updated 2026-09-10)
- help.topstep.com, Article ID 13350348, "Topstep Holiday Trading Hours" (updated 2026-09-18)
- help.topstep.com, Article ID 10290170, "Professional Behavior at Topstep" (updated 2026-06-10)
- help.topstep.com, Article ID 13613539, "Risk Adjustments: High Risk/High Volatility" (updated 2026-09-17). Source of the LFA-specific restricted-product limits noted in Other Confirmed Rules. Located by a 2026-09-19 re-audit.
- help.topstep.com, Article ID 12060405, "Back2Funded: Rules, Guidelines, and How It Works" (updated 2026-08-14). Source of the LFA/Pro/Shoulder Tap exclusion from Back2Funded. Located by a 2026-09-19 re-audit.
- help.topstep.com, Article ID 8284223, "What is the Scaling Plan?" (updated 2026-07-16). Source of the statement that micro-to-mini conversion is unavailable on the LFA. Located by a 2026-09-19 re-audit.
