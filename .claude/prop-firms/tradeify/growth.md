# Growth ($50K)

**Sources:** https://help.tradeify.co/en/articles/10495915-growth-evaluation-accounts (Growth Evaluation Accounts, article-stated update 2026-08-26), https://help.tradeify.co/en/articles/11083796-growth-funded-account-payout-policy (Growth Funded: Account Payout Policy, article-stated update 2026-06-29), https://tradeify.co (live Growth pricing/checkout data, fetched 2026-09-18), https://help.tradeify.co/en/articles/14369021-tradeify-pricing-reference (Tradeify Pricing Reference), https://help.tradeify.co/en/articles/10468256-how-do-i-reset-a-failed-evaluation (How do I Reset a Failed Evaluation), https://help.tradeify.co/en/articles/10468246-are-there-activation-fees (Are There Activation Fees), https://help.tradeify.co/en/articles/13252431-select-vs-growth-choosing-your-evaluation-type (SELECT vs Growth: Choosing Your Evaluation Type), https://help.tradeify.co/en/articles/10495897-rules-trailing-max-drawdowns (Rules: Trailing Max Drawdowns — firm-wide, "Applies to: All Tradeify accounts (Growth, Select, Lightning)"), https://help.tradeify.co/en/articles/10468321-rules-daily-loss-limit (Rules: Daily Loss Limit — firm-wide, "Applies to: Growth, Lightning, and Select Daily Funded accounts")

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

Growth Evaluation is Tradeify's fastest evaluation product: it has no consistency requirement, so a trader can pass in as few as 1 trading day. Unlike SELECT Evaluation (3+ days minimum, 40% consistency, no Daily Loss Limit), Growth trades that speed for a Daily Loss Limit (soft breach) during the evaluation. There is no activation fee, though activation is not automatic — a trader must manually activate a passed evaluation into a Sim Funded account. Once activated, the Growth Sim Funded account carries a fixed (non-selectable) payout policy, a 35% consistency requirement on payout requests, and cannot itself be reset if it fails (only Evaluation accounts can be reset).

## Evaluation

| Parameter                | Value |
| ------------------------ | ----- |
| Starting Balance         | $50,000 (derived from the plan's own "$50k" account-size label; see Not Confirmed) |
| Profit Target            | $3,000 |
| Drawdown Type             | End of Day Trailing Max Drawdown |
| Drawdown Amount          | $2,000 |
| Minimum Balance at Start | Unconfirmed |
| Daily Loss Limit         | $1,250 (soft breach), flat throughout the Evaluation. Does not escalate — the 6%-profit escalation described below is Funded-account-only per Rules: Daily Loss Limit's own "Applies to" scope. |
| Max Contracts            | 4 Contracts (40 Micros). Legacy accounts (purchased before September 12, 2025, 8:00 AM EST): 5 Contracts (50 Micros) — confirmed in Growth Evaluation Accounts, applies only pre-cutoff. |
| Consistency Rule         | None |
| Minimum Trading Days     | 1 |
| News Trading             | Unconfirmed |
| Inactivity Rule          | Unconfirmed by this file's sources (see Not Confirmed — engine disagreement) |
| One-Time Eval Fee        | $145 |
| Reset Fee                | $95 |

**Bundle discount:** buying 5 Growth 50K Evaluations in one checkout (the only way to purchase more than one account per order) applies an automatic 5% discount, which stacks with promo codes. Confirmed in Tradeify Pricing Reference.

## Sim Funded

| Parameter                      | Value |
| ------------------------------- | ----- |
| Starting Balance               | $50,000 (same tier-label derivation as the Evaluation table; see Not Confirmed). |
| Drawdown Type                  | End of Day Trailing Max Drawdown |
| Drawdown Amount                | $2,000 |
| Drawdown Lock                  | Trigger: EOD balance reaches $52,100 (profit exceeds the $2,000 drawdown amount by $100), OR immediately upon payout request — whichever occurs first. Locked value: floor fixes permanently at $50,100 ($100 above the $50,000 starting balance) and never moves up again. Confirmed verbatim in Rules: Trailing Max Drawdowns: "50K Growth account with $2,000 drawdown locks when EOD balance reaches $52,100. Drawdown floor becomes $50,100, never moves up again." Does not apply during Evaluation ("Drawdown does NOT lock on Evaluation accounts — only on Sim Funded"). |
| Minimum Balance (ongoing)      | $53,000 is the balance required to *request a payout* — a payout-eligibility threshold, not a failure floor. The account's actual failure floor is the EOD Trailing Max Drawdown itself. Do not conflate three distinct, similar-looking numbers: $53,000 (payout-eligibility balance), $52,100 (the EOD balance that triggers the drawdown lock), and $50,100 (the locked floor value itself). |
| Daily Loss Limit               | $1,250, escalating to $2,000 effective the trading session *after* account balance reaches $53,000 (6% profit / $3,000) — not immediately. Legacy accounts (purchased before September 12, 2025): the DLL is removed entirely at that same 6%-profit threshold rather than increased. Both figures confirmed in Rules: Daily Loss Limit. |
| Max Contracts                  | 4 Contracts (40 Micros). Legacy accounts (pre-September 12, 2025): 5 Contracts (50 Micros). |
| Consistency Rule               | 35% — stated in Growth Funded: Account Payout Policy as one of the criteria a payout request must satisfy; not stated anywhere read for this file as a standalone, account-failing rule independent of a payout request. |
| News Trading                   | Unconfirmed |
| Inactivity Rule                | Unconfirmed by this file's sources (see Not Confirmed — engine disagreement) |
| Max Active/Concurrent Accounts | 5 total Sim Funded accounts, across any combination of Growth, Select, and Lightning. Separately, a maximum of 5 Growth Funded accounts may be *activated* per rolling 24-hour (UTC) window — a different, activation-rate rule that shares the same number by coincidence. |
| Profit Split                   | 90% of the requested payout amount |

## How the Drawdown Works

Growth uses an End of Day (EOD) Trailing Max Drawdown on both the Evaluation and Sim Funded stages: the floor trails the account's highest-ever EOD balance (the high-water mark), rising on a new EOD high and never moving down on a losing day. The limit only *recalculates* at end-of-day, but it is enforced in real time against net liquidation value — if net liq touches the floor at any moment during the trading day, the account fails immediately (a "hard breach"), even if the balance recovers before the close. This is a permanent, unrecoverable failure, distinct from the Daily Loss Limit below.

The Daily Loss Limit ($1,250 at 50K, soft breach) pauses trading for the remainder of the day if breached, without failing the account; trading resumes the next session (after 6:00 PM ET). It resets every trading day. Because Max Trailing Drawdown and the Daily Loss Limit are independent mechanics, it is possible to hit the drawdown floor before the DLL triggers if the high-water mark is close enough — in that case the account fails on the drawdown breach regardless of the DLL.

On the Sim Funded stage only, the drawdown stops trailing and locks once EOD balance reaches $52,100 (profit exceeds the $2,000 drawdown amount by $100), or immediately upon a payout request, whichever happens first; the floor then fixes permanently at $50,100. This lock mechanic does not exist during the Evaluation stage. The 6%-profit Daily Loss Limit escalation (to $2,000, effective the next session) is likewise a Funded-only mechanic per Rules: Daily Loss Limit's explicit scope statement — it is not modeled here as applying during Evaluation.

### Worked Example

This example tracks the account's full nominal balance throughout (e.g., a $50,000 account showing $500 profit reads as a $50,500 balance), not a $0-based profit figure, and never switches to a $0-based convention.

**Evaluation:**

1. Trader purchases a $50K Growth Evaluation for $145.
2. The account opens at a $50,000 balance, a $3,000 profit target, a $1,250 Daily Loss Limit (soft breach), and a $2,000 EOD Trailing Max Drawdown — the floor starts at $50,000 − $2,000 = $48,000.
3. EOD Day 1: the balance falls to $49,500 (a $500 loss). This is not a new EOD high, so the floor does not move — a Trailing Max Drawdown floor only rises on a new peak and never trails down on a losing day. Floor stays at $48,000.
4. EOD Day 2: the balance rises to $52,000 (a new EOD high, $2,000 net profit). The floor trails up to $52,000 − $2,000 = $50,000.
5. EOD Day 3: the balance reaches $53,000 ($3,000 profit = the profit target). The Growth Evaluation is passed immediately — the 1-day minimum is already satisfied and there is no consistency rule to check.

**Sim Funded:** sources read for this file do not state whether the Sim Funded account's opening balance carries forward the Evaluation's ending balance ($53,000 in this example) or resets to the nominal $50,000 starting balance. This example assumes a fresh $50,000 reset (see Not Confirmed) so the drawdown-lock and DLL-escalation mechanics can be shown from their own starting points.

6. Trader activates the Growth Sim Funded account at a fresh $50,000 balance, $2,000 EOD Trailing Max Drawdown (floor again at $48,000), and $1,250 Daily Loss Limit (soft breach).
7. EOD Day 1 of Sim Funded: the balance grows to $52,100 (a new EOD high, $2,100 profit — exactly $100 above the $2,000 drawdown amount). This is the exact drawdown-lock trigger: the floor stops trailing and locks permanently at $50,100.
8. EOD Day 2: the balance grows to $53,000 ($3,000 profit, 6% of the $50,000 account). This crosses the Daily Loss Limit's escalation balance; the DLL increases from $1,250 to $2,000 effective the next trading session. The account also now meets the $53,000 minimum balance required to request a payout, subject to the 35% consistency rule and 5+ qualifying trading days (each showing more than $150 profit).
9. Trader requests the maximum first-payout amount of $1,500. Per the source's own worked scenario, this leaves a $51,500 balance — $1,400 above the now-locked $50,100 floor.

## Payouts

| Parameter                            | Value |
| ------------------------------------ | ----- |
| Profit Split                         | 90% of the requested amount |
| Payout Frequency                     | Every 5 days |
| Buffer Requirement                   | No separate figure — the $53,000 minimum-balance-to-request-a-payout threshold documented above functions as this plan's buffer (a balance floor that must be cleared before a payout becomes possible). Tradeify's own copy uses the specific word "buffer" only for Select Daily, but the underlying mechanic is the same shape; see Not Confirmed. |
| Minimum Payout Request               | $500 |
| Max Payout per Cycle                 | $1,500 (payout 1), $2,000 (payout 2), $2,500 (payout 3), $3,000 (payout 4+) |
| Consistency on Payouts               | 35% consistency rule; additionally, 5+ trading days per cycle must each show profit greater than $150 (the trading-day count resets to zero after each successful payout) |
| Maximum Total Payouts / Lifetime Cap | No cap stated. The current 4-tier payout schedule's own notation ("payout 4+") structurally implies an open-ended, indefinitely-repeating $3,000 step rather than a terminal payout — inferred from the shape of the table, not a direct "no cap" statement; see Not Confirmed. |

**Legacy accounts (purchased before September 12, 2025, 8:00 AM EST):** both Growth Funded: Account Payout Policy and Rules: Trailing Max Drawdowns describe a different, more favorable set of figures for accounts bought before this cutoff — a minimum balance of $52,100 (vs. $53,000 current) to qualify for a payout, and a 6-tier payout schedule (1: $1,500, 2: $1,750, 3: $2,000, 4: $2,250, 5: $2,500, 6: $3,000, then any amount up to $25,000 per account) instead of the current flat 4-tier schedule above. These legacy figures apply only to accounts purchased before the cutoff and are not the current rule — do not use them for a new account. Note the coincidental figure: this legacy $52,100 *payout-eligibility* balance is a different concept from the $52,100 *drawdown-lock-trigger* balance that applies to every current-and-legacy Growth 50K Sim Funded account (see Sim Funded table above) — they are unrelated rules that happen to share a dollar figure.

## Live Transition

To request a payout on Sim Funded, the account balance must reach $53,000 and satisfy the consistency and minimum-qualifying-day requirements above. Payouts are processed within 24-48 hours during business hours (Mon-Fri, 8 AM-5 PM EST), or up to 72 hours if submitted outside business hours. Growth Funded: Account Payout Policy states Tradeify "reserves the right to move you to a Live Funded Account at any time after a successful payout" — an open-ended trigger, not tied to a specific payout count in that source. A separate comparison article (SELECT vs Growth) states both Select and Growth paths lead to Elite Live "after 5 successful payouts from Sim Funded," but that figure conflicts with the Tradeify Elite Program article's own stated threshold ("3 payouts on a single account OR 10 total") — this conflict is flagged, not resolved, since the Elite Program article was not a designated source for this file (see Not Confirmed). Elite Live's own operating parameters (starting balance, drawdown, DLL, contract limits, payout split, eligibility mechanics) are documented in the shared [`elite-live.md`](elite-live.md) file, not duplicated here.

## Not Confirmed By This Source

- **Inactivity Rule (Evaluation and Sim Funded) — engine disagreement, flagged not resolved** — not stated in any source read for this file. `src/lib/prop-calculator/firms/tradeify/Tradeify.ts` models `maxConsecutiveIdleDays: 7` for this plan, citing (per the file's own inline notes) the Funded Trader Agreement Section 6.9 and a "Guidelines for Traders" article — neither of which was read as a source for this file. Do not assume the engine's 7-day figure is confirmed by anything in this file; it is an unverified-for-Growth carryover from a different citation trail.
- **Starting Balance (Evaluation and Sim Funded)** — no sentence in any source literally states "Starting Balance." The $50,000 figure is derived from the plan's own "$50k" tier label, repeated consistently across every table read (Growth Evaluation Accounts' rules table, Tradeify Pricing Reference, live GrowthData pricing). Treated as a confirmed table-lookup value per this file's sourcing rules, not a literal quote.
- **Minimum Balance at Start** — not stated in any source as a concept distinct from the account's nominal starting balance.
- **News Trading** — not addressed in any of the six dump sections or the two Growth-specific articles read for this file.
- **Buffer Requirement — resolved by inference from an already-confirmed figure, not a new source claim** — no source uses the word "buffer" for Growth specifically. But the mechanic a buffer describes (a balance floor that must be cleared before a payout is possible) is already fully confirmed for Growth via the $53,000 minimum-balance-to-request-a-payout figure, which serves the identical function under a different label. `buildGrowthPlan` in the engine has no separate `payoutBuffer` field (unlike Select Daily's `PayoutBuffer` class) — its `minPayoutProfit` field is that same $53,000 figure, consistent with this reading, not a separate unmodeled concept. Confidence: high on the mechanic being the same; the label "buffer" itself is this file's own inference, not a Tradeify quote.
- **Sim Funded starting balance vs. Evaluation ending balance** — not stated whether the Sim Funded account's opening balance carries forward the Evaluation's ending balance (e.g., $53,000 in the Worked Example) or resets to the nominal $50,000 starting balance. The Worked Example assumes a fresh $50,000 reset; this is an assumption made for illustration, not a quoted source statement.
- **Elite Live transition payout-count trigger** — SELECT vs Growth: Choosing Your Evaluation Type states "5 successful payouts from Sim Funded" leads to Elite Live for both Select and Growth; this conflicts with the (not read for this file) Elite Program article's own stated "3 payouts on a single account OR 10 total" threshold. Do not assume either figure is Growth's confirmed transition trigger without checking the Elite Program article directly.
- **Account sizes other than $50K** — this file covers the $50K plan only (the size modeled in the engine). Sources confirm Tradeify offers Growth Evaluation/Funded in $25K, $100K, and $150K sizes with their own profit targets, DLLs, and drawdown amounts. As context only: SELECT vs Growth: Choosing Your Evaluation Type states Growth's drawdown amounts ($1,000/$2,000/$3,500/$5,000 for 25K/50K/100K/150K) diverge from Select's ($1,000/$2,000/$3,000/$4,500) at the 100K and 150K tiers specifically — the two products match at 50K (both $2,000), which is what this file documents. Not applicable to the 50K figures above.
- **Maximum Total Payouts / Lifetime Cap — reasoned inference, not a direct statement** — no source explicitly says "no lifetime cap" or "unlimited" for current accounts. But the current 4-tier payout schedule ($1,500 / $2,000 / $2,500 / $3,000, labeled "payout 4+") uses open-ended "+" notation rather than terminating at a fixed final payout, structurally implying the $3,000 step repeats indefinitely rather than the account hitting a cap. This is inferred from the table's own shape, not quoted; treat with moderate, not high, confidence.
- **Consistency Rule (Evaluation) — source conflict, flagged not resolved** — Growth Evaluation Accounts' own dedicated article states explicitly, and repeats in its FAQ, "Growth Evaluation does NOT have a consistency requirement" — the value this file's Evaluation table uses ("None"), corroborated by the simulator engine (`buildGrowthPlan`'s `ConsistencyRule` is scoped `ConsistencyScope.Funded`, not `Eval`). Tradeify Pricing Reference's one-line product summary, however, states "Growth Evaluation — one-time purchase, DLL, 35% consistency," which read in isolation contradicts "None." This file treats the dedicated, detailed, FAQ-confirmed article as authoritative over the Pricing Reference's compressed summary line (most likely blending the Eval-stage DLL and the Funded-stage 35% consistency rule under one "Growth Evaluation" product label rather than describing the Evaluation stage alone) — flagging the conflict rather than silently resolving it. Do not assume Growth Evaluation carries a consistency requirement based on the Pricing Reference's summary line alone.

---

**Last Updated:** 2026-09-18

**Sources:**

- https://help.tradeify.co/en/articles/10495915-growth-evaluation-accounts — Wayback Machine snapshot (captured 2026-09-13, article-stated update 2026-08-26). Direct access blocked by Cloudflare; archived version used as fallback.
- https://help.tradeify.co/en/articles/11083796-growth-funded-account-payout-policy — Wayback Machine snapshot (captured 2026-08-22, article-stated update 2026-06-29). Direct access blocked by Cloudflare; archived version used as fallback. This is the least-current single source in this file (27-day-old snapshot of a ~3-month-old article); payout-tier figures were independently cross-confirmed against the same-day (2026-09-18) live-pasted Rules: Trailing Max Drawdowns article where overlapping (the $52,100 lock-trigger / $50,100 locked-floor figures), which increases confidence in those specific numbers.
- https://tradeify.co — Live homepage pricing/checkout data (embedded `GrowthData` JSON), fetched via curl 2026-09-18 (HTTP 200, no Cloudflare block).
- https://help.tradeify.co/en/articles/14369021-tradeify-pricing-reference — Tradeify Pricing Reference. Pasted live 2026-09-18; article's own stated update date not shown in the paste provided for this file.
- https://help.tradeify.co/en/articles/10468256-how-do-i-reset-a-failed-evaluation — How do I Reset a Failed Evaluation. Pasted live 2026-09-18; article's own stated update date not shown in the paste provided for this file.
- https://help.tradeify.co/en/articles/10468246-are-there-activation-fees — Are There Activation Fees. Pasted live 2026-09-18; article's own stated update date not shown in the paste provided for this file.
- https://help.tradeify.co/en/articles/13252431-select-vs-growth-choosing-your-evaluation-type — SELECT vs Growth: Choosing Your Evaluation Type. Pasted live 2026-09-18; article's own stated update date not shown in the paste provided for this file.
- https://help.tradeify.co/en/articles/10495897-rules-trailing-max-drawdowns — Rules: Trailing Max Drawdowns (firm-wide article; cited here for the Drawdown Lock row per its explicit "Applies to: All Tradeify accounts (Growth, Select, Lightning)" scope). Pasted live 2026-09-18; article's own stated update date not shown in the paste provided for this file.
- https://help.tradeify.co/en/articles/10468321-rules-daily-loss-limit — Rules: Daily Loss Limit (firm-wide article; cited here for the funded-stage 6%-profit DLL escalation per its explicit "Applies to: Growth, Lightning, and Select Daily Funded accounts" scope). Pasted live 2026-09-18; article's own stated update date not shown in the paste provided for this file.
