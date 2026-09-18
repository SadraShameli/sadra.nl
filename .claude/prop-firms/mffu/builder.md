# Builder Plan ($25,000 / $50,000)

**Sources:** two tier-specific articles: https://help.myfundedfutures.com/en/articles/15862870-builder-plan-25k-a-comprehensive-guide (July 14, 2026), https://help.myfundedfutures.com/en/articles/14290805-builder-plan-50k-a-comprehensive-guide (updated August 24, 2026). Only $25K and $50K exist for Builder in MFF's own help-center sitemap, no `builder-100k` or `builder-150k` article is listed. The 25K article was located and fetched by running this skill's Discover & Extract stage against `help.myfundedfutures.com/sitemap.xml`, prompted by the user asking for the same sitemap-sweep treatment already applied to Lucid Trading; see SOURCES.md.

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

The Builder Plan is offered at two account sizes, $25,000 and $50,000. The $50,000 size offers two checkout variants, differing only in their Maximum Loss Limit (MLL): the Default variant with a $2,000 MLL or the Add-On variant with a $1,500 MLL. **The $25,000 size's own dedicated article describes only a single configuration** (a $1,000 MLL), with no Default/Add-On split mentioned anywhere in it; see Not Confirmed for why this is treated as a genuine difference rather than an extraction gap. Both sizes share identical rules for the evaluation stage, simulated-funding stage, and live transition structure, differing only in dollar figures. The plan is designed for traders progressing from evaluation through simulated funding to a live funded account, with a structured payout progression capped at five payouts before live promotion. News trading is unrestricted during the Evaluation and Sim Funded stages at both sizes, independently confirmed firm-wide by "News Trading Policy": "Unrestricted Accounts: Trading on T1 News events is permitted for the following: ... Builder Plans" (live-stage news trading policy is not stated in either size's own source, and the firm-wide article does not name a Live stage either, see Not Confirmed).

## Evaluation

| Parameter | $25K | $50K |
| --- | --- | --- |
| Starting Balance | $25,000 | $50,000 |
| Profit Target | $1,500 | $3,000 |
| Drawdown Type | End-of-Day (EOD) Trailing | End-of-Day (EOD) Trailing |
| Drawdown Amount | $1,000, single configuration, no Default/Add-On split, see Overview | Default: $2,000 \| Add-On: $1,500 |
| Minimum Balance at Start | $24,000, directly stated ("Starting Minimum Balance: $24,000") | Default: $48,000 \| Add-On: $48,500 |
| Daily Loss Limit | None, directly stated. **A genuine difference from the 50K tier, not an extraction gap**: this size's own article states "Daily Loss Limit: None" explicitly for both Evaluation and Sim Funded, with no soft-pause DLL mentioned anywhere in the article, unlike 50K's confirmed $1,000 soft-pause DLL across all three stages. | $1,000 (soft pause) |
| Max Contracts | 2 Minis / 20 Micros | 4 Minis / 40 Micros |
| Consistency Rule | None, directly stated ("Consistency Rule: None"; FAQ: "Is there a consistency rule during evaluation? No.") | None |
| Minimum Trading Days | 1 | 1 |
| News Trading | Allowed | Allowed |
| Inactivity Rule | Not stated in the Evaluation section of this tier's own source (Sim Funded states 7 calendar days, see below); same asymmetry already flagged for the 50K tier | Unconfirmed |
| One-Time Eval Fee | Unconfirmed for this tier | Default: $153 \| Add-On: $125 |
| Reset Fee | Unconfirmed for this tier | None, no reset option; a max-drawdown breach ends the account and requires purchasing a new evaluation at the full One-Time Eval Fee, per `myfundedfutures.com/plans/builder`'s own FAQ: "If you breach max drawdown on the sim-funded Builder account, the account ends and you start a new evaluation." Same pattern as Rapid's confirmed no-reset finding. |

## Sim Funded

| Parameter | $25K | $50K |
| --- | --- | --- |
| Starting Balance | $0 | $0 |
| Drawdown Type | End-of-Day (EOD) Trailing | End-of-Day (EOD) Trailing |
| Drawdown Amount | $1,000 | Default: $2,000 \| Add-On: $1,500 |
| Drawdown Lock | Trigger: account balance (new high) reaches the buffer requirement, $1,100, per this tier's own "Payout Requirements - Step by Step": "The buffer equals your MLL + $100." Locked value: the MLL becomes static at $100 above the $0 Sim Funded starting balance, i.e. $100, per this tier's own "How the EOD Trailing Drawdown Works": "The MLL locks permanently once it reaches $100 above the starting balance." | Trigger: account balance (new high) reaches the buffer requirement, $2,100 (Default) / $1,600 (Add-On), per source: "your account balance must reach at least $2,600... ($2,100 buffer plus $500...)". Locked value: $100, same $100-above-starting-balance formula |
| Minimum Balance (ongoing) | -$1,000, directly stated ("Starting Minimum Balance: -$1,000") | Default: -$2,000 \| Add-On: -$1,500 |
| Daily Loss Limit | None | $1,000 (soft pause) |
| Max Contracts | 2 Minis / 20 Micros | 4 Minis / 40 Micros |
| Consistency Rule | Unconfirmed, this tier's own Sim Funded table has no Consistency Rule row at all, same pattern already flagged for the 50K tier | Unconfirmed, see Not Confirmed |
| News Trading | Allowed | Allowed |
| Inactivity Rule | 7 Calendar Days | 7 Calendar Days |
| Max Active/Concurrent Accounts | 2 Builder Accounts per user, directly stated by this tier's own article ("Traders may have up to 2 Sim Funded accounts, per user, at any time on the Builder 25k Plan"), independently confirmed as a genuine plan-specific override by the firm-wide "Moving from Evaluation to Sim-Funded Account" article's own "Plan-Specific Limits" list: "Builder $25K: Maximum of 2 Sim-Funded Account." In the event of a breach, the earliest a new Sim Funded account may be activated is the following trading day. | 1 (only one Sim Funded account active per user at any time), independently confirmed by the same firm-wide article: "Builder $50K: Maximum of 1 Sim-Funded Accounts" |
| Profit Split | 80% Trader / 20% Firm | 80% Trader / 20% Firm |

## How the Drawdown Works

The Maximum Loss Limit (MLL) is an End-of-Day (EOD) trailing drawdown that adjusts after each market close based on the account's closing equity, confirmed identically at both sizes. The MLL trails upward as the account reaches new end-of-day highs, maintaining a constant distance between the account balance and the minimum allowed balance. The MLL never moves down during the trailing phase. Open equity losses are counted when determining whether the account has breached the MLL at end of day.

The MLL locks permanently once it reaches $100 above the starting balance. From that point, it does not trail further and remains static. For Sim Funded accounts starting at $0, this lock corresponds to a buffer requirement of $1,100 at 25K, or $2,100 (Default) / $1,600 (Add-On) at 50K, each equal to the tier's own MLL plus $100.

### Worked Example

Starting Sim Funded at $0 (matching both sizes' own "begins at $0" / "account begins at $0" language), using the $50,000 tier, Default variant.

1. Account starts with $0 balance and a -$2,000 MLL (Default variant). Minimum allowed balance is -$2,000.
2. After the first day, the account closes at +$500 profit. The new high is $500, so the MLL trails up to $500 - $2,000 = -$1,500. Minimum allowed is now -$1,500.
3. Over subsequent sessions, the account reaches a new high of $2,100. The MLL trails to $2,100 - $2,000 = $100.
4. At this point, the MLL has reached $100 above the starting balance ($0), so it locks. From this moment, the minimum allowed balance remains at $100 and does not trail further, even if the account goes higher. The $2,100 buffer is now cleared, but net profit above the buffer is currently $0, so a payout cannot yet be requested (the FAQ requires at least $500 net profit above the buffer for the first payout at this tier).
5. The account continues trading and reaches a further new high of $2,600 ($2,100 buffer + $500 net profit above it).
6. The trader requests a payout: the buffer is cleared and $500 net profit above it meets the FAQ's stated minimum for a first payout. The trader submits a withdrawal request of $500 (well within the $2,000 per-cycle cap) and receives 80% of the withdrawn amount, $400, after the firm's 20% cut.

## Payouts

| Parameter | $25K | $50K |
| --- | --- | --- |
| Profit Split | 80% Trader / 20% Firm | 80% Trader / 20% Firm |
| Payout Frequency | Trader-initiated; available 48 hours after first trade, provided all criteria are met, same 48-hour figure as 50K | Trader-initiated; available 48 hours after first trade, provided all criteria are met |
| Buffer Requirement | $1,100 | Default: $2,100 \| Add-On: $1,600 |
| Minimum Payout Request | $250, directly stated ("Minimum Payout Amount: $250"), independently corroborated by "Guide to Your First Payout": "Builder 25k: Min of $250" | $500 |
| Max Payout per Cycle | $1,000 | $2,000 |
| Consistency on Payouts | 50% (single largest profit day cannot represent more than 50% of total profits in the current cycle; resets after each approved payout) | 50% (same rule) |
| Maximum Total Payouts / Lifetime Cap | 5 Payouts (after 5th approved payout, trader is promoted to live account) | 5 Payouts (same) |

**Payout Requirements (step-by-step), both sizes:**

- Buffer must be fully cleared before submitting any payout request.
- First payout: at least $250 (25K) / $500 (50K) net profit above the buffer.
- Subsequent payouts: at least $250 (25K) / $500 (50K) net profit since the last approved payout.
- Must have traded on at least 2 trading days in the current cycle.
- 50% consistency rule: single largest profit day cannot exceed 50% of total profits in the cycle; resets after each approved payout.
- Maximum payout per cycle is $1,000 (25K) / $2,000 (50K). Trader receives 80% of the withdrawn amount.

## Live Transition

After the 5th approved sim payout, the trader is promoted to a live funded account, confirmed identically at both sizes. The live account carries the same Maximum Loss Limit as the sim-funded tier that promoted it ($1,000 at 25K; $2,000 Default / $1,500 Add-On at 50K) and follows an End-of-Day Trailing Drawdown model, with the MLL becoming static once it reaches $0, directly restated by the 25K article's own Live Account Parameters table ("Max Loss Limit: Static once MLL reaches $0"). Live payouts are processed daily, with a minimum payout amount of $250 at both sizes, lower than each size's own Sim Funded minimum. The profit split remains 80% Trader / 20% Firm. Daily loss limit on live is $1,000, soft pause, per the 50K article's own FAQ: "The Evaluation, Sim Funded and Live stage have a $1,000 soft pause DLL." **The 25K article's own Live Account Parameters table states "No Daily Loss Limit" for its live stage** rather than restating the $1,000 soft-pause figure; given the 25K tier's Evaluation and Sim Funded stages are also confirmed to have no DLL at all (see Overview), this reads as internally consistent for 25K rather than a source error, do not assume 25K's live DLL matches 50K's. No consistency rule applies to live accounts at either size. Only one live account may be active per user at a time.

**Additional transition pathways (per "Payout Policy Overview," not either size's own primary source):** that article states Builder Live transition can also occur via "Reaching the total sim cap of $100k" or "Consistent performance in sim funded account (Discretion of the Risk Management Team)," alongside "5 consecutive payouts." Neither size's own dedicated guide mentions a $100k sim cap or a discretionary-review pathway anywhere else in its own content. Also note the wording difference: the Payout Policy article says "5 *consecutive* payouts," while both sizes' own sources (Payouts tables above) say "5 Payouts" without stating whether they must be consecutive. Treat both additional pathways and the "consecutive" qualifier as sourced only from the Payout Policy article, not corroborated by Builder's own dedicated guides.

Following a live account breach (Maximum Loss Limit exceeded), a 21-day cooldown period begins during which all Sim Funded account trading is prohibited and new evaluations or account resets cannot be purchased. After the 21 days, restrictions are lifted. The 25K article's own version of this policy independently confirms every detail (21-day period, all-sim-funded-trading prohibited, no new evaluations/resets/account acquisitions during cooldown, full restoration after).

## Not Confirmed By This Source

- **Builder at $100K/$150K**, not offered, or at least not documented anywhere in MFF's own help-center sitemap as of this pass (69 sitemap articles checked; no `builder-100k` or `builder-150k` slug exists). Do not assume Builder exists at those sizes.
- **Inactivity Rule (Evaluation, both sizes)**, Not stated in the Evaluation Stage section of either cited source. Sim Funded stage explicitly states 7-calendar-day inactivity closure at both sizes, but Evaluation stage does not mention this rule in either. A dedicated firm-wide article, "Inactivity Rule - One-Time Payment Model" (`help.myfundedfutures.com/en/articles/16596524`), states 7 consecutive calendar days applies including "simulated funded accounts," with no plan named, but its own scope is explicitly limited to accounts bought under the newer "one-time payment model" (effective August 25, 2026); legacy/existing customers keep their prior terms. Neither size's own evaluation-fee figures are labeled as either model, so it is not stated whether either size's Evaluation stage falls under the new rule. Treated as a strong candidate matching the already-confirmed Sim Funded figure, not as confirmed for Evaluation specifically.
- **25K's own Default/Add-On split, or lack thereof**, the 25K article describes only one configuration, with no toggle, no "Default" or "Add-On" language, and no second price anywhere in it. This is treated as a genuine product difference (25K simply has one configuration), not an extraction gap, since the article is otherwise as thorough and FAQ-rich as the 50K one and gives no indication a second variant exists. If MFF's own live pricing page for the 25K tier were fetched, it could confirm or contradict this; not done in this pass.
- **Live-stage news trading policy, both sizes**, neither size's own source addresses live-stage news trading; the firm-wide "News Trading Policy" article names "Builder Plans" as unrestricted but does not distinguish Evaluation/Sim Funded from Live in that listing, and its own "Restricted/Unrestricted Accounts" framing elsewhere in the same article only ever names Evaluation and Sim Funded stages by name, never Live, for any plan. Do not assume the rule carries over to the live account without a citation that names the live stage specifically.
- **Sim Funded Consistency Rule (account activity), both sizes**, neither size's Sim Funded Stage table has a "Consistency Rule" row at all. "None" is stated explicitly only for the Evaluation stage; the 50% consistency figure is stated specifically for payout requests (independently corroborated by "Payout Policy Overview": "By remaining within 50% consistency of total profit made"), not account trading activity. Do not assume Sim Funded trading activity itself carries the Evaluation stage's "None" without its own citation.
- **"No daily loss limits on Builder... plans" (Payout Policy Overview), confirmed wrong for the 50K size specifically, genuinely correct for 25K.** The 50K article's own FAQ is explicit: "Is there a Daily Loss Limit (DLL)? Yes. The Evaluation, Sim Funded and Live stage have a $1,000 soft pause DLL," naming all three stages. There is no stage in 50K Builder's lifecycle where its own source claims "no DLL." For 25K, however, this marketing claim is *not* contradicted, 25K's own article states "Daily Loss Limit: None" for Evaluation and Sim Funded, and "No Daily Loss Limit" for Live. Do not treat the marketing claim as reliably wrong across the whole plan; it is specifically wrong for 50K and specifically correct for 25K, a genuine per-size difference, not a blanket error.

---

**Last Updated:** 2026-09-18

**Sources:**

- https://help.myfundedfutures.com/en/articles/15862870-builder-plan-25k-a-comprehensive-guide (July 14, 2026), found via a full sitemap sweep of `help.myfundedfutures.com` (see SOURCES.md). Source of every 25K-tier-specific figure above, including the no-DLL and no-Default/Add-On findings.
- https://help.myfundedfutures.com/en/articles/14290805-builder-plan-50k-a-comprehensive-guide (updated August 24, 2026)
- https://help.myfundedfutures.com/en/articles/11802636-traders-evaluation-simplified (updated August 21, 2026), corroborates this file's own Evaluation table at both sizes (Profit Target, MLL, DLL, Max Contracts, Consistency, Minimum Trading Days, Drawdown Type, News Trading).
- https://help.myfundedfutures.com/en/articles/13745661-payout-policy-overview-best-and-fastest-prop-firm-payouts (updated August 25, 2026), corroborates Minimum Withdrawal, Max Payout per Cycle, and Consistency on Payouts at 50K (it states a qualitative "clearing buffer required" but never gives Builder's own dollar buffer figure, so it does not corroborate Buffer Requirement); source of the two additional Live Transition pathways noted above, and of the "no daily loss limits" conflict noted above.
- https://myfundedfutures.com/plans/builder, no "last updated" date visible. First observed via a WebFetch summarization pass; independently re-fetched as raw HTML via curl on 2026-09-18, which surfaced the page's own FAQ JSON-LD schema directly. Source of the confirmed 50K Reset Fee finding above ("If you breach max drawdown on the sim-funded Builder account, the account ends and you start a new evaluation") and a strengthened Max Active/Concurrent Accounts corroboration for 50K ("one active Builder account per user"); also independently restates Profit Target, MLL, DLL, Buffer, Minimum Payout, Inactivity Rule (7 days), and Cooldown (21 days) already confirmed by the help-center sources for 50K, and names the live-account brokerage as "Blue Row Capital" (not otherwise stated in this file's other sources). Its pricing figures ($75 promo / $125 standard) do not clearly map onto this file's already-confirmed $153 (Default) / $125 (Add-On) 50K one-time eval fee and are deliberately not used here to avoid introducing a false conflict with higher-confidence, help-center-sourced data.
- https://help.myfundedfutures.com/en/articles/16596524-inactivity-rule-one-time-payment-model, found via WebSearch after the originally-linked inactivity-rule URL (11972075) was confirmed 404; independently re-verified via raw HTML. Source of the candidate Evaluation-stage inactivity figure discussed above, scoped to the "one-time payment model" only.
- https://help.myfundedfutures.com/en/articles/8230009-news-trading-policy, "News Trading Policy." Found via a full sitemap sweep of `help.myfundedfutures.com`. Independently confirms News Trading is Allowed for "Builder Plans," both sizes.
- https://help.myfundedfutures.com/en/articles/16498635-moving-from-evaluation-to-sim-funded-account, "Moving from Evaluation to Sim-Funded Account." Found via the same sitemap sweep. Independently confirms Builder's own plan-specific Max Active/Concurrent Accounts overrides at both sizes (25K: 2, 50K: 1), resolving what an earlier draft of the 50K portion of this file had left as a not-fully-resolved apparent conflict with the generic account-size bucket.
- https://help.myfundedfutures.com/en/articles/11542406-guide-to-your-first-payout-quick-and-easy-process, "Guide to Your First Payout: Quick and Easy Process." Found via the same sitemap sweep. Independently corroborates Minimum Payout Request at both sizes ("Builder 25k: Min of $250," "Builder 50k: Min of $500") and names Riseworks as the payout processor (see README.md).
