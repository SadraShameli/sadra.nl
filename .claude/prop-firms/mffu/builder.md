# Builder Plan ($50,000)

**Source:** https://help.myfundedfutures.com/en/articles/14290805-builder-plan-50k-a-comprehensive-guide (updated August 24, 2026)

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

The Builder Plan offers two variants at the $50,000 account size, differing only in their Maximum Loss Limit (MLL): the Default variant with a $2,000 MLL or the Add-On variant with a $1,500 MLL. Both variants share identical rules for the evaluation stage, simulated-funding stage, and live transition. The plan is designed for traders progressing from evaluation through simulated funding to a live funded account, with a structured payout progression capped at five payouts before live promotion. News trading is unrestricted during the Evaluation and Sim Funded stages (live-stage news trading policy is not stated in this source — see Not Confirmed).

## Evaluation

| Parameter | Value |
| --- | --- |
| Starting Balance | $50,000 |
| Profit Target | $3,000 |
| Drawdown Type | End-of-Day (EOD) Trailing |
| Drawdown Amount | Default: $2,000 \| Add-On: $1,500 |
| Minimum Balance at Start | Default: $48,000 \| Add-On: $48,500 |
| Daily Loss Limit | $1,000 (soft pause) |
| Max Contracts | 4 Minis / 40 Micros |
| Consistency Rule | None |
| Minimum Trading Days | 1 |
| News Trading | Allowed |
| Inactivity Rule | Unconfirmed |
| One-Time Eval Fee | Default: $153 \| Add-On: $125 |
| Reset Fee | None — no reset option; a max-drawdown breach ends the account and requires purchasing a new evaluation at the full One-Time Eval Fee, per `myfundedfutures.com/plans/builder`'s own FAQ: "If you breach max drawdown on the sim-funded Builder account, the account ends and you start a new evaluation." Same pattern as Rapid's confirmed no-reset finding. |

## Sim Funded

| Parameter | Value |
| --- | --- |
| Starting Balance | $0 |
| Drawdown Type | End-of-Day (EOD) Trailing |
| Drawdown Amount | Default: $2,000 \| Add-On: $1,500 |
| Drawdown Lock | Trigger: account balance (new high) reaches the buffer requirement — $2,100 (Default) / $1,600 (Add-On), per source: "your account balance must reach at least $2,600... ($2,100 buffer plus $500...)". Locked value: the MLL becomes static at $100 above the $0 Sim Funded starting balance — i.e. $100 — per source: "The MLL locks permanently once it reaches $100 above the starting balance." (The $100 figure is a derivation applying the source's generic +$100 rule to Sim Funded's own $0 starting balance; it is not separately restated as a Sim-Funded-specific number in the source.) |
| Minimum Balance (ongoing) | Default: -$2,000 \| Add-On: -$1,500 |
| Daily Loss Limit | $1,000 (soft pause) |
| Max Contracts | 4 Minis / 40 Micros |
| Consistency Rule | Unconfirmed — see Not Confirmed section |
| News Trading | Allowed |
| Inactivity Rule | 7 Calendar Days |
| Max Active/Concurrent Accounts | 1 (only one Sim Funded account active per user at any time) |
| Profit Split | 80% Trader / 20% Firm |

## How the Drawdown Works

The Maximum Loss Limit (MLL) is an End-of-Day (EOD) trailing drawdown that adjusts after each market close based on the account's closing equity. The MLL trails upward as the account reaches new end-of-day highs, maintaining a constant distance between the account balance and the minimum allowed balance. The MLL never moves down during the trailing phase. Open equity losses are counted when determining whether the account has breached the MLL at end of day.

The MLL locks permanently once it reaches $100 above the starting balance. From that point, it does not trail further and remains static. For Sim Funded accounts starting at $0, this lock corresponds to a buffer requirement of $2,100 (Default) or $1,600 (Add-On), which equals the MLL plus $100.

### Worked Example

Starting Sim Funded at $0 (matching the source's own "Your account begins at $0").

1. Account starts with $0 balance and a -$2,000 MLL (Default variant). Minimum allowed balance is -$2,000.
2. After the first day, the account closes at +$500 profit. The new high is $500, so the MLL trails up to $500 - $2,000 = -$1,500. Minimum allowed is now -$1,500.
3. Over subsequent sessions, the account reaches a new high of $2,100. The MLL trails to $2,100 - $2,000 = $100.
4. At this point, the MLL has reached $100 above the starting balance ($0), so it locks. From this moment, the minimum allowed balance remains at $100 and does not trail further, even if the account goes higher. The $2,100 buffer is now cleared — but net profit above the buffer is currently $0, so a payout cannot yet be requested (the FAQ requires at least $500 net profit above the buffer for the first payout).
5. The account continues trading and reaches a further new high of $2,600 ($2,100 buffer + $500 net profit above it).
6. The trader requests a payout: the buffer is cleared and $500 net profit above it meets the FAQ's stated minimum for a first payout. The trader submits a withdrawal request of $500 (well within the $2,000 per-cycle cap) and receives 80% of the withdrawn amount, $400, after the firm's 20% cut.

## Payouts

| Parameter | Value |
| --- | --- |
| Profit Split | 80% Trader / 20% Firm |
| Payout Frequency | Trader-initiated; available 48 hours after first trade, provided all criteria are met |
| Buffer Requirement | Default: $2,100 \| Add-On: $1,600 |
| Minimum Payout Request | $500 |
| Max Payout per Cycle | $2,000 |
| Consistency on Payouts | 50% (single largest profit day cannot represent more than 50% of total profits in the current cycle; resets after each approved payout) |
| Maximum Total Payouts / Lifetime Cap | 5 Payouts (after 5th approved payout, trader is promoted to live account) |

**Payout Requirements (step-by-step):**

- Buffer must be fully cleared before submitting any payout request.
- First payout: at least $500 net profit above the buffer.
- Subsequent payouts: at least $500 net profit since the last approved payout.
- Must have traded on at least 2 trading days in the current cycle.
- 50% consistency rule: single largest profit day cannot exceed 50% of total profits in the cycle; resets after each approved payout.
- Maximum payout per cycle is $2,000. Trader receives 80% of the withdrawn amount.

## Live Transition

After the 5th approved sim payout, the trader is promoted to a live funded account. The live account carries the same Maximum Loss Limit ($2,000 for Default, $1,500 for Add-On) and follows an End-of-Day Trailing Drawdown model, with the MLL becoming static once it reaches $0. Live payouts are processed daily, with a minimum payout amount of $250 (both variants) — lower than the $500 Sim Funded minimum. The profit split remains 80% Trader / 20% Firm. Daily loss limit on live is $1,000, soft pause — per source FAQ: "The Evaluation, Sim Funded and Live stage have a $1,000 soft pause DLL." No consistency rule applies to live accounts. Only one live account may be active per user at a time.

**Additional transition pathways (per "Payout Policy Overview," not this file's own primary source):** that article states Builder Live transition can also occur via "Reaching the total sim cap of $100k" or "Consistent performance in sim funded account (Discretion of the Risk Management Team)," alongside "5 consecutive payouts." This file's own source only describes the 5th-approved-payout pathway and does not mention a $100k sim cap or a discretionary-review pathway anywhere else in its own content. Also note the wording difference: the Payout Policy article says "5 *consecutive* payouts," while this file's own source (Payouts table above) says "5 Payouts" without stating whether they must be consecutive. Treat both additional pathways and the "consecutive" qualifier as sourced only from the Payout Policy article, not corroborated by Builder's own dedicated guide.

Following a live account breach (Maximum Loss Limit exceeded), a 21-day cooldown period begins during which all Sim Funded account trading is prohibited and new evaluations or account resets cannot be purchased. After the 21 days, restrictions are lifted.

## Not Confirmed By This Source

- **Inactivity Rule (Evaluation)** — Not stated in the Evaluation Stage section of the cited source. Sim Funded stage explicitly states 7-calendar-day inactivity closure, but Evaluation stage does not mention this rule. A dedicated firm-wide article, "Inactivity Rule - One-Time Payment Model" (`help.myfundedfutures.com/en/articles/16596524`, independently verified via raw HTML), states 7 consecutive calendar days applies including "simulated funded accounts," with no plan named — but its own scope is explicitly limited to accounts bought under the newer "one-time payment model" (effective August 25, 2026); legacy/existing customers keep their prior terms per the article's own words. This file's own evaluation-fee figures ($153/$125) are not labeled as either model, so it is not stated whether this file's Evaluation stage falls under the new rule. Treated as a strong candidate matching the already-confirmed Sim Funded figure, not as confirmed for Evaluation specifically — see README.md's Firm-Wide Rules for the same finding applied across the tree.
- **Live-stage news trading policy** — the source's specific statement scopes unrestricted news trading to only two stages: "News trading is fully unrestricted during the evaluation and sim funded stage." Neither the Live Transition table nor any FAQ answer addresses live-stage news trading. Do not assume the rule carries over to the live account without its own citation.
- **Sim Funded Consistency Rule (account activity)** — the source's Sim Funded Stage table has no "Consistency Rule" row at all. "None" is stated explicitly only for the Evaluation stage ("Consistency Rule | None | None"; FAQ: "Is there a consistency rule during evaluation? A: No..."); the 50% consistency figure is stated specifically for payout requests (now independently corroborated by "Payout Policy Overview": "By remaining within 50% consistency of total profit made"), not account trading activity. Do not assume Sim Funded trading activity itself carries the Evaluation stage's "None" without its own citation.
- **Max Active/Concurrent Accounts — apparent conflict with a generic firm-wide source** — this file's own source states "1 (only one Sim Funded account active per user at any time)," which is kept as this table's value since it is Builder-specific and unambiguous. Separately, "Traders Evaluation Simplified" states a generic, plan-name-agnostic Sim-Funded account limit of "up to five (5)... when holding only $25K and/or $50K account sizes" — phrased by account size, not by plan. It is not stated whether Builder is exempt from that generic bucket (plausible, given Builder's structurally different payout-capped-then-promoted model) or whether the "1" figure is itself the Builder-specific exception within a shared bucket. Not resolved here — flagged per this repo's rule to surface conflicting sources rather than blend them. Two further data points lean toward "1" being correct and Builder being exempt from the generic bucket: MFF's own live pricing page (`myfundedfutures.com/plans/builder`) states "1 Builder Account per user" for the $50K tier, first observed via a WebFetch summarization pass and now independently re-confirmed via a direct raw-HTML fetch of the same page's FAQ schema ("one active Builder account per user. The plan is built for focus, not for stacking multiple evals.") — removing the earlier extraction-fidelity caveat for this specific figure. That is now three Builder-specific sources (this file's own dedicated guide, plus two independent reads of the live pricing page) agreeing on "1," against one generic, plan-name-agnostic article's "5." Still not treated as a full resolution of the shared-bucket-vs-per-plan question — Builder could still be a "1" sub-cap nested inside a larger shared pool for all this shows — but the plan-specific figure itself is now solidly corroborated.
- **"No daily loss limits on Builder... plans" (Payout Policy Overview) — confirmed wrong for Builder, not a stage-scope mixup.** Researched directly: this file's own FAQ answer is explicit and unambiguous — "Is there a Daily Loss Limit (DLL)? A: Yes. The Evaluation, Sim Funded and Live stage have a $1,000 soft pause DLL" — naming all three stages by name, independently corroborated by three separate table rows in this file (Evaluation, Sim Funded, and Live Transition DLL cells all show $1,000). There is no stage in Builder's lifecycle where this file's own source claims "no DLL." The "no daily loss limits" marketing bullet is simply inaccurate for Builder — a plan-scope error in that article, not a real ambiguity in this file's own data. This file's own specific, quoted DLL figure is treated as correct; see README.md's Firm-Wide Rules for the cross-plan version of this same conflict, including a related finding that the same marketing claim is also wrong for Pro's live stage.

---

**Last Updated:** 2026-09-18

**Sources:**

- https://help.myfundedfutures.com/en/articles/14290805-builder-plan-50k-a-comprehensive-guide (updated August 24, 2026)
- https://help.myfundedfutures.com/en/articles/11802636-traders-evaluation-simplified (updated August 21, 2026) — corroborates this file's own Evaluation table (Profit Target, MLL, DLL, Max Contracts, Consistency, Minimum Trading Days, Drawdown Type, News Trading); also the source of the Max Active/Concurrent Accounts conflict noted above.
- https://help.myfundedfutures.com/en/articles/13745661-payout-policy-overview-best-and-fastest-prop-firm-payouts (updated August 25, 2026) — corroborates Minimum Withdrawal, Max Payout per Cycle, and Consistency on Payouts (it states a qualitative "clearing buffer required" but never gives Builder's own dollar buffer figure, so it does not corroborate Buffer Requirement); source of the two additional Live Transition pathways noted above, and of the "no daily loss limits" conflict noted above.
- https://myfundedfutures.com/plans/builder — no "last updated" date visible. First observed via a WebFetch summarization pass; independently re-fetched as raw HTML via curl on 2026-09-18, which surfaced the page's own FAQ JSON-LD schema directly. Source of the confirmed Reset Fee finding above ("If you breach max drawdown on the sim-funded Builder account, the account ends and you start a new evaluation") and the strengthened Max Active/Concurrent Accounts corroboration ("one active Builder account per user"); also independently restates Profit Target, MLL, DLL, Buffer, Minimum Payout, Inactivity Rule (7 days), and Cooldown (21 days) already confirmed by the help-center sources, and names the live-account brokerage as "Blue Row Capital" (not otherwise stated in this file's other sources). Its pricing figures ($75 promo / $125 standard) do not clearly map onto this file's already-confirmed $153 (Default) / $125 (Add-On) one-time eval fee and are deliberately not used here to avoid introducing a false conflict with higher-confidence, help-center-sourced data.
- https://help.myfundedfutures.com/en/articles/16596524-inactivity-rule-one-time-payment-model — found via WebSearch after the originally-linked inactivity-rule URL (11972075) was confirmed 404; independently re-verified via raw HTML. Source of the candidate Evaluation-stage inactivity figure discussed above, scoped to the "one-time payment model" only.
