# Pro

**Source:** https://help.myfundedfutures.com/en/articles/11802674-pro-plan-sim-funded-and-live-account-highlights (updated June 30, 2026)

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

The Pro Plan is designed for experienced traders seeking frequent payouts and a clear path to live funding. It offers three account sizes ($50K, $100K, $150K) with tiered drawdown limits, no daily loss limit, and an 80/20 profit split favoring traders. The plan emphasizes high payout potential through a progressive structure that unlocks live funding once traders achieve consistent performance milestones or exceed the sim-funded payout cap.

After passing evaluation with a 50% consistency rule and no daily loss limit, traders enter the sim-funded phase where they can request payouts as frequently as the payout buffer clears. A $100,000 lifetime cap on total sim-funded payouts exists per user. Traders transitioning to live accounts can do so through three consecutive payouts or through excess-profit mechanisms, with the risk team also able to initiate transitions for high-performing traders at any time.

## Evaluation

| Parameter                | $50K | $100K | $150K |
| ------------------------ | --- | --- | --- |
| Starting Balance         | Unconfirmed | Unconfirmed | Unconfirmed |
| Profit Target            | $3,000 (*$4,000 for 1-Day Addon) | $6,000 | $9,000 |
| Drawdown Type            | End-of-Day (EOD) | End-of-Day (EOD) | End-of-Day (EOD) |
| Drawdown Amount          | $2,000 | $3,000 | $4,500 |
| Minimum Balance at Start | Unconfirmed | Unconfirmed | Unconfirmed |
| Daily Loss Limit         | None | None | None |
| Max Contracts            | 3 mini / 30 micro | 6 mini / 60 micro | 9 mini / 90 micro |
| Consistency Rule         | 50% (Eval Only) | 50% (Eval Only) | 50% (Eval Only) |
| Minimum Trading Days     | 2 | 2 | 2 |
| News Trading             | Yes (T1) | Yes (T1) | Yes (T1) |
| Inactivity Rule          | Unconfirmed | Unconfirmed | Unconfirmed |
| One-Time Eval Fee        | $265.00 regular / $159.00 promo | $401.00 regular / $240.60 promo | $557.00 regular / $334.20 promo |
| Reset Fee                | Unconfirmed | Unconfirmed | Unconfirmed |

**Pricing note:** Confirmed via `myfundedfutures.com/plans/pro`'s own embedded JSON, independently fetched as raw HTML/JSON (curl, not WebFetch's summarization pass): `priceCents`/`priceDiscountedCents` of 26500/15900 ($50K), 40100/24060 ($100K), 55700/33420 ($150K), with `activationFeeCents: 0` for all three (corroborating the already-confirmed $0 activation fee). Independently cross-confirmed by this repo's own simulator (`src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts`), which was separately researched and already modeled the $50K tier's `evalCost` as exactly `265`. No "reset" text of any kind appears anywhere in the page's raw HTML — unlike Rapid's equivalent page, which explicitly states no reset exists — so Reset Fee stays genuinely unconfirmed here; the simulator's own `reset: dollars(size.evalCost)` for Pro is an unsourced modeling default; do not treat it as a citation.

Source for this table: "Traders Evaluation Simplified" — the article Pro's own Sim-Funded/Live source links out to for evaluation rules (see Sources). The $50K/$100K/$150K tiering matches this file's own Sim Funded and Payouts tables.

**Engine cross-check flag:** the simulator models Pro's evaluation Max Contracts as 3 micro / 3 mini; this now-confirmed source states 3 mini / 30 micro for the $50K tier — a real mismatch, not a rounding difference. Not resolved here (out of this skill's scope); flagged for the engine to be checked against `src/lib/prop-calculator/firms/mffu/`.

**Note:** A limited-time 1-Day Addon variant is available for the Pro $50K account only. This promotional offering features a $4,000 profit target, no consistency rule, no daily loss limit, and the ability to pass evaluation in as little as one day. This variant is not the standard Pro evaluation described above.

## Sim Funded

| Parameter                      | $50K | $100K | $150K |
| ------------------------------ | --- | --- | --- |
| Starting Balance               | $50,000 | $100,000 | $150,000 |
| Drawdown Type                  | EOD; fixed MLL stated, pre-lock trailing behavior unconfirmed | EOD; fixed MLL stated, pre-lock trailing behavior unconfirmed | EOD; fixed MLL stated, pre-lock trailing behavior unconfirmed |
| Drawdown Amount                | $2,000 | $3,000 | $4,500 |
| Drawdown Lock                  | Trigger: After first payout — Locked value: Starting balance + $100 ($50,100 static) | Trigger: After first payout — Locked value: Starting balance + $100 ($100,100 static) | Trigger: After first payout — Locked value: Starting balance + $100 ($150,100 static) |
| Minimum Balance (ongoing)      | Unconfirmed | Unconfirmed | Unconfirmed |
| Daily Loss Limit               | None | None | None |
| Max Contracts                  | 5 mini / 5 micro | 10 mini / 10 micro | 15 mini / 15 micro |
| Consistency Rule               | None | None | None |
| News Trading                   | Not Allowed | Not Allowed | Not Allowed |
| Inactivity Rule                | Unconfirmed | Unconfirmed | Unconfirmed |
| Max Active/Concurrent Accounts | Up to 5 if only holding $50K/$25K sizes; up to 3 if holding any $100K/$150K account | Up to 3 (holding a $100K account caps all Sim-Funded accounts at 3) | Up to 3 (holding a $150K account caps all Sim-Funded accounts at 3) |
| Profit Split                   | 80% trader / 20% firm | 80% trader / 20% firm | 80% trader / 20% firm |

## How the Drawdown Works

The Pro plan uses an end-of-day (EOD) Maximum Loss Limit (MLL) for the sim-funded phase. The source states two fixed points on this mechanism directly: the starting MLL distance ("$2,000," "$3,000," and "$4,500" for the three tiers respectively) and the post-first-payout locked value ("After first payout, MLL moves to $50,100/$100,100/$150,100 and remains static"). The source never states whether, or by what formula, the MLL moves between those two points as the account accrues profit before the first payout — the "trails upward with profit" behavior described below in the Worked Example's intermediate steps is an assumption carried over from how EOD-trailing drawdowns work on this firm's other plans (Rapid/Rapid EOD/Builder), not a literal statement in Pro's own cited source; see Not Confirmed.

### Worked Example

Starting Sim Funded at $50,000 balance with $0 profit (matching the source's stated starting balance for the $50K tier). Steps 2-3's intermediate MLL values rest on the unconfirmed trailing-behavior assumption noted above, not a source-stated formula; only step 1's starting MLL and step 4's locked MLL are directly sourced.

1. Trader opens the $50K account with a $50,000 balance. MLL begins at $50,000 − $2,000 = $48,000 (maximum loss allowed is $2,000) — directly sourced.
2. Trader accumulates $1,000 in profit. Account balance rises to $51,000. Assuming the unconfirmed trailing behavior, MLL would move to $51,000 − $2,000 = $49,000 — not directly sourced.
3. Trader adds another $1,100 in profit (cumulative: $2,100 profit, $52,100 balance), clearing the $2,100 payout buffer requirement. Assuming the unconfirmed trailing behavior, MLL would be at $52,100 − $2,000 = $50,100 at this point — not directly sourced, though it happens to coincide with step 4's directly-sourced locked value.
4. Trader clears the buffer, fulfills other conditions (14 calendar days from first trade), and requests their first payout. The MLL locks at $50,100 — directly sourced ("After first payout, MLL moves to $50,100 and remains static").
5. Subsequently, if the account grows to $60,000 in profit ($110,000 balance), the MLL remains locked at $50,100 and does not trail further upward — directly sourced ("remains static").

Final verification: Trader can now only lose down to $50,100; the maximum loss is $110,000 − $50,100 = $59,900 at that point, whereas it would have trailed to $110,000 − $2,000 = $108,000 if not locked. The static lock preserves a floor relative to the starting balance.

## Payouts

| Parameter                            | $50K | $100K | $150K |
| ------------------------------------ | --- | --- | --- |
| Profit Split                         | 80% trader / 20% firm | 80% trader / 20% firm | 80% trader / 20% firm |
| Payout Frequency                     | Every 14 calendar days from first trade (subject to inactivity rule) | Every 14 calendar days from first trade (subject to inactivity rule) | Every 14 calendar days from first trade (subject to inactivity rule) |
| Buffer Requirement                   | $2,100 | $3,100 | $4,600 |
| Minimum Payout Request               | $1,000 | $1,000 | $1,000 |
| Max Payout per Cycle                 | $100,000 (per user) | $100,000 (per user) | $100,000 (per user) |
| Consistency on Payouts               | None (no hard consistency rule once funded — see "Consistent Trading Policy" note below) | None | None |
| Maximum Total Payouts / Lifetime Cap | $100,000 (per user) | $100,000 (per user) | $100,000 (per user) |

Payout Frequency and the 80/20 profit-split direction are confirmed by "Payout Policy Overview, Best and Fastest Prop-Firm Payouts" (see Sources) — Frequency: "Request a payout every 14 calendar days from your first trade... Subject to inactivity rule"; Split direction: "Builder and Pro Plans: Earn 80% of all profits," which is the trader's share. MFF's own live pricing page independently restates the same cadence as "Bi-Weekly" (a colloquial match for 14 calendar days).

Max Payout per Cycle and Consistency on Payouts are confirmed by `myfundedfutures.com/plans/pro`'s own FAQ schema, independently verified via a direct raw-HTML fetch (not WebFetch's summarization pass): "What's the max payout I can actually withdraw on Pro per cycle? — Up to $100,000 per cycle, subject to your live equity above the required buffer at the time of request." This is numerically identical to the already-confirmed per-user lifetime cap — the same $100,000 figure functions as both, since nothing in this firm's material states a smaller enforced per-request ceiling. Separately: "Does the Pro plan have a consistency rule? — There's a 50% consistency rule in evaluation only... Once you're funded, there is no hard consistency rule. That said, the Pro plan does carry a Consistent Trading Policy: MFFU monitors sim funded accounts for trading behavior that falls outside professional norms — things like maxing contracts on every trade, contract flipping, inconsistent position sizing, or high-frequency strategies not aligned with your stated approach. Violations can result in restrictions or account termination." So there is no numeric payout-consistency percentage, but a qualitative, discretionary trading-behavior policy does apply post-funding.

That same article separately states "Maximum Request in Sim-Funded stage: $100,000" — this appears to restate the per-user lifetime cap already in this table, not a distinct per-cycle limit; treated that way here rather than as a resolution of Max Payout per Cycle, since the article gives no other basis to distinguish the two.

**Early Withdrawal Option:** Before the payout buffer fully clears, traders may request a one-time early withdrawal of up to 60% of current profits (minimum $1,000). The remaining 40% of profits stays in the account for continued trading. This option is available only before reaching the full buffer zone.

## Live Transition

Traders transition to live accounts through one of the following pathways:

**Transition Triggers:**
- Achieve 3 consecutive payouts on the sim-funded account, OR
- Exceed the $100,000 per-user payout cap (excess profits are automatically transferred to live funding, up to tier-specific maximums: $5,000 for $50K, $7,500 for $100K, $10,000 for $150K), OR
- Be contacted by the risk team for a discretionary transition at any point during the sim-funded journey.

Separately, the source states: "Reaching a $20,000 profit milestone will trigger an account for review but may not guarantee a transition to a Live account." This is a distinct, confirmed account-review trigger — it does not by itself guarantee a live transition, unlike the three triggers above.

Traders may also voluntarily request to allocate a portion of a payout to their live account balance, up to the live account funding max, per the source: "Traders may also request to allocate a portion of their payout to live account balance up to the live account funding max."

**Live Account Parameters:**

| Parameter                      | $50K | $100K | $150K |
| ------------------------------ | --- | --- | --- |
| Live Account Funding Range     | $2,000 − $5,000 static balance | $3,000 − $7,500 static balance | $4,500 − $10,000 static balance |
| Daily Loss Limit Range         | $700 − $1,800 | $1,000 − $2,000 | $1,300 − $3,000 |
| Max Contracts Range            | 2 − 4 | 3 − 5 | 4 − 6 |
| Minimum Payout                 | $250 | $250 | $250 |

**Initial Balance Unlock:** After completing 20 winning trading days (each with minimum profit of 4% of the initial live balance) and receiving 3 payouts, the initial live balance becomes unlocked, allowing withdrawals down to a $140 floor. For example, on a $5,000 live allocation achieving 20 days at $200+ profit each and 3 payouts, the full $5,000 becomes withdrawable down to $140.

**Important Note:** For risk-team-initiated discretionary transitions specifically, the source states: "Any profits on your account(s) will be transitioned, up to the max value per plan. Remaining profits are forfeited." Whether this same forfeiture rule also applies to profits exceeding the $100,000 payout cap that cannot fit within the tier-specific live-transfer maximums is not separately stated by the source — the two pathways reuse the same tier-cap figures, which makes the extension plausible, but it is not a literal quote for that pathway; see Not Confirmed. Traders may not simultaneously trade on both sim-funded and live accounts.

## Not Confirmed By This Source

- **Starting Balance (Evaluation)** — Neither this file's original source nor "Traders Evaluation Simplified" states an evaluation-phase "Starting Balance" as such (both give Profit Target, MLL, contracts, etc. but no Starting Balance row). Do not assume it matches the sim-funded starting balance.
- **Minimum Balance at Start (Evaluation)** — Not stated in either cited source.
- **Inactivity Rule** — Not stated for Pro specifically in any of this file's own help-center sources. "Traders Evaluation Simplified" states a 7-day inactivity rule for Rapid EOD's evaluation table specifically, but has no such row for Pro's evaluation table. A dedicated firm-wide article, "Inactivity Rule - One-Time Payment Model" (`help.myfundedfutures.com/en/articles/16596524`, independently verified via raw HTML, not WebFetch summarization), states: "If a trader does not place a trade for 7 consecutive calendar days, the account could be closed. This includes simulated funded accounts" — with no plan name mentioned, reading as firm-wide. But its own scope is explicitly limited to "new evaluation purchases... under the one-time payment model" (effective August 25, 2026); the article itself says legacy/existing customers "continue... under your existing price, plan, billing cycle, and terms." Since nothing in this tree's sources states whether Pro's documented figures reflect the new one-time-payment model or a legacy subscription, this remains genuinely unresolved for Pro specifically — treated as a strong, real candidate (7 days, evaluation and sim-funded), not yet promoted to the confirmed table. See README.md's Firm-Wide Rules for the same finding applied across the tree.
- **Reset Fee** — Not provided in any cited source, and not stated on MFF's own live pricing page either (no "reset" text of any kind found in a full scan of its raw HTML — same as Rapid EOD's finding). The simulator's own `reset: dollars(size.evalCost)` is an unsourced modeling default, not a citation.
- **Minimum Balance (ongoing, Sim Funded)** — Confirmed absent from both this file's original source and MFF's own live pricing page (`myfundedfutures.com/plans/pro`) — no "Minimum Balance"/"Minimum Equity" field exists on either, verified by a full scan of both pages' raw HTML, not merely a missed extraction. Treated as genuinely unpublished rather than "not yet found."
- **Max Active/Concurrent Accounts — shared-bucket scope** — "Traders Evaluation Simplified" states Sim-Funded account limits by *account size* ("up to five (5) active Sim-Funded Accounts... when holding only $25K and/or $50K account sizes," "if a trader holds any $100K or $150K Sim-Funded Account, the maximum... permitted is three (3)... across all Sim-Funded account sizes, **regardless of plan type**" — this exact "regardless of plan type" clause independently re-verified in the source's own raw HTML, and appears only attached to the $100K/$150K rule, not the $25K/$50K one), not by plan name. Read narrowly, "regardless of plan type" most directly means the $100K/$150K three-account cap is a single shared pool across Pro/Rapid/etc. at those sizes; whether the same sharing applies to the $25K/$50K five-account bucket is not stated with the same explicit clause. Builder's own confirmed "1" and Rapid EOD's own confirmed "3" would, under a fully-shared reading, be *sub-caps nested inside* this pool rather than separate pools — but this is an inference from an asymmetrically-worded source, not itself a confirmed fact. Do not treat the shared-vs-per-plan-family question as resolved.
- **Sim Funded pre-lock drawdown trailing mechanism** — the source states only the starting MLL distance and the post-first-payout locked value; it never states that the MLL moves upward with profit before the first payout, nor gives a formula for intermediate values. The Worked Example's steps 2-3 assume this (borrowed from how this firm's other EOD plans behave), not from Pro's own cited source. Do not treat the intermediate MLL figures in those steps as source-confirmed.
- **Forfeiture rule scope for the $100,000-cap excess-transfer pathway** — the source's only literal "Remaining profits are forfeited" statement appears in the paragraph about risk-team-initiated discretionary transitions, not in the paragraph describing the $100,000-payout-cap excess-transfer pathway. Do not assume the forfeiture rule extends to the excess-transfer pathway without its own citation.

---

**Last Updated:** 2026-09-18

**Sources:**

- https://help.myfundedfutures.com/en/articles/11802674-pro-plan-sim-funded-and-live-account-highlights (updated June 30, 2026)
- https://help.myfundedfutures.com/en/articles/12879226-pro-plan-1day-addon (updated May 19, 2026) — cited only for the limited-time 1-Day Addon variant note in the Evaluation section.
- https://help.myfundedfutures.com/en/articles/11802636-traders-evaluation-simplified (updated August 21, 2026) — the evaluation-rules article Pro's own source links out to; fills in this file's entire Evaluation table except Starting Balance, Minimum Balance at Start, Inactivity Rule, One-Time Eval Fee, and Reset Fee.
- https://help.myfundedfutures.com/en/articles/13745661-payout-policy-overview-best-and-fastest-prop-firm-payouts (updated August 25, 2026) — confirms Payout Frequency and the 80% trader profit-split direction; corroborates Buffer Requirement, Minimum Payout Request, and the 60% early-withdrawal figure.
- https://myfundedfutures.com/plans/pro — fetched live (not pasted); independently re-fetched and verified via raw HTML/JSON, not just WebFetch's summarization pass. Source of the confirmed Max Payout per Cycle ($100,000), Consistency on Payouts (no hard rule, qualitative "Consistent Trading Policy"), and One-Time Eval Fee ($265/$401/$557 regular across tiers) figures above; also confirmed no "Minimum Balance" or "reset" text of any kind exists on the page. No "last updated" date visible on the page. Cross-checked against this repo's own simulator (`src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts`), which had separately researched and modeled the same $265 figure for the $50K tier.
- https://help.myfundedfutures.com/en/articles/16596524-inactivity-rule-one-time-payment-model — found via WebSearch after the originally-linked inactivity-rule URL (11972075) was confirmed 404; independently re-verified via raw HTML. Source of the 7-day inactivity figure discussed above, scoped to the "one-time payment model" only.
