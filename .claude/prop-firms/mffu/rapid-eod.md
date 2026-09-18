# Rapid EOD ($50,000)

**Source:** https://help.myfundedfutures.com/en/articles/16158363-rapid-eod-50k-a-comprehensive-look (updated August 24, 2026)

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

Rapid EOD is a streamlined evaluation plan for My Funded Futures traders seeking a fast path to simulated funding. The plan introduces an end-of-day drawdown structure that only recalculates the maximum loss limit at the close of each trading session, rather than during intraday trading. This allows traders to experience intraday volatility without the risk of an intraday maximum loss breach. Upon passing evaluation, traders move to the Sim Funded stage, which maintains the same end-of-day trailing structure and transitions to a live account following the same rules as the standard Rapid 50k plan.

## Evaluation

| Parameter                | Value |
| ------------------------ | ----- |
| Starting Balance         | $50,000 |
| Profit Target            | $3,000 |
| Drawdown Type            | End-of-Day (EOD) Trailing |
| Drawdown Amount          | $2,000 |
| Minimum Balance at Start | Unconfirmed |
| Daily Loss Limit         | None |
| Max Contracts            | 3 mini / 30 micro |
| Consistency Rule         | 30% |
| Minimum Trading Days     | 4 |
| News Trading             | Yes |
| Inactivity Rule          | 7 days |
| One-Time Eval Fee        | $209.00 regular; displayed as "$125" with active "CLUB" promo (computed discounted price: $125.40) |
| Reset Fee                | Unconfirmed |

**Pricing note:** The $209.00 regular price and $125/$125.40 promotional price above come from `myfundedfutures.com/plans/rapid-eod`'s own embedded structured data — a schema.org `Offer` price plus an embedded Next.js JSON payload with `priceCents: 20900`, `priceDiscountedCents: 12540`, `activationFeeCents: 0`, and `profitTarget: 3000` (identifying the $50K tier), independently confirmed via a raw-HTML fetch (curl, not a WebFetch summarization pass) on 2026-09-18. These figures exactly match Rapid's own $50K pricing (rapid.md), consistent with the two plans sharing a pricing structure. The promotional price is tied to an active, site-wide coupon (`couponActive: true`, `couponCode: CLUB`) and will drift or lapse independent of this file; the $209.00 list price is the more durable figure. Unlike Rapid's own plan page, this page's raw HTML contains no "reset" text of any kind — neither confirming nor denying a reset option — so Reset Fee remains genuinely unconfirmed here rather than inheriting Rapid's confirmed "no reset" finding.

## Sim Funded

| Parameter                      | Value |
| ------------------------------ | ------ |
| Starting Balance               | $0 |
| Drawdown Type                  | End-of-Day (EOD) Trailing |
| Drawdown Amount                | $2,000 |
| Drawdown Lock                  | Trigger: "Once your trailing Max Loss reaches $100, it locks there" — this point is reached the instant your EOD high first reaches $2,100 profit (a derived figure: the stated $2,000 distance + the $100 locked floor, not itself a quoted profit-threshold statement). Locked value: $100 — "You must always keep at least $100 in the account." |
| Minimum Balance (ongoing)      | $100 |
| Daily Loss Limit               | None |
| Max Contracts                  | 3 mini / 30 micro |
| Consistency Rule               | None |
| News Trading                   | No |
| Inactivity Rule                | 7 days |
| Max Active/Concurrent Accounts | 3 |
| Profit Split                   | 90% trader, 10% My Funded Futures |

## How the Drawdown Works

Your Max Loss Limit (MLL) trails upward each time your account closes at a new end-of-day high. The distance between your account balance and the Max Loss Limit is always $2,000 while it is trailing. It does not move intraday — only at the close of each trading session. The Max Loss Limit never moves downward, only upward with new end-of-day highs.

Once your trailing Max Loss Limit reaches $100, it locks at that value and stops trailing. From that point forward, it does not move again. You must always keep at least $100 in the account balance. If your balance drops below $100, the account is breached.

### Worked Example

Starting at a literal $0 balance (matching the source's own "Initial Balance: $0"). The end-of-day (EOD) high only ever increases within this example, and the Max Loss Limit (MLL) locks the instant that EOD high first reaches $2,100 — re-derived below step by step.

1. **Day 1:** Account closes at +$500 profit (new EOD high). MLL trails to $500 − $2,000 = −$1,500. The $2,000 distance is maintained; the account can decline down to −$1,500 without breaching.

2. **Day 2:** Account closes at +$1,800 profit (new EOD high). MLL trails to $1,800 − $2,000 = −$200. Distance maintained at $2,000.

3. **Day 3:** Account closes at +$2,300 profit (new EOD high, and this high now exceeds $2,100). The moment this new high is reached, the trailing MLL would compute to $2,300 − $2,000 = $300 — but the source's lock rule ("Once your trailing Max Loss reaches $100, it locks there") is triggered as soon as the EOD high first reaches $2,100, which happens within this same day's new high. The MLL locks at $100 on Day 3, not $300, and does not continue trailing further.

4. **Day 4 onward:** Account closes at +$1,800 profit (a decline from the $2,300 peak, due to trading losses). The MLL remains locked at $100 — it does not move down with the balance decline, and it will not trail up again even on a future new high. As long as the account balance stays at or above $100, the account remains active; a balance of $99 or below would breach.

## Payouts

| Parameter                            | Value |
| ------------------------------------ | ----- |
| Profit Split                         | 90% trader, 10% My Funded Futures |
| Payout Frequency                     | Daily |
| Buffer Requirement                   | $2,100 |
| Minimum Payout Request               | $500 |
| Max Payout per Cycle                 | No stated maximum |
| Consistency on Payouts               | None required |
| Maximum Total Payouts / Lifetime Cap | Unconfirmed |
| First Payout Eligibility             | 24 hours after first trade (buffer and minimum profit still required) — per "Payout Policy Overview," which covers Rapid EOD explicitly under "Rapid Plan Payouts (Intraday and EOD Plans)" |

## Live Transition

This article states directly: "Live transition on Rapid EOD 50k follows the same rules as standard Rapid 50k." Per the "Understanding Rapid Live" article (https://help.myfundedfutures.com/en/articles/13134718-understanding-rapid-live, updated September 8, 2026), those transition pathways are: automatic transition upon achieving $10,000 in net profit within a single trading day, or via Risk Management Team approval following consistent payout performance.

See [rapid-live.md](./rapid-live.md) (shared by Rapid and Rapid EOD) for full live account parameters, the Reserve Program, and payout/breach mechanics.

## Not Confirmed By This Source

- **Minimum Balance at Start (Evaluation)** — Not stated in the cited source. Do not assume Rapid EOD requires a specific minimum balance to begin evaluation.
- **Reset Fee** — Not stated in the cited source, and not stated on MFF's own live pricing page either (unlike Rapid's equivalent page, which explicitly says no reset exists — see the Pricing note above). Do not assume the reset cost matches the evaluation cost, or that Rapid EOD shares Rapid's "no reset" policy, without a separate citation.
- **Maximum Total Payouts / Lifetime Cap** — Not stated in the cited source. Do not assume Rapid EOD has a lifetime payout cap on the Sim Funded stage without a separate citation. A more thorough search found no evidence such a cap exists for Rapid EOD either: "Payout Policy Overview" explicitly covers "Rapid Plan Payouts (Intraday and EOD Plans)" together in one section, and that section has no lifetime/sim-cap language, unlike its dedicated Builder and Pro sections. Suggestive of no cap (matching standard Rapid's own finding — see rapid.md), not affirmative confirmation of "None."
- **Minimum Days After Passing Evaluation Before Payout Eligibility** — Still not explicitly stated. "Payout Policy Overview" confirms a *different* waiting-period reference point — 24 hours after first trade, not after passing evaluation — now added to the Payouts table above as its own row. Any calendar-day requirement measured from the evaluation-pass date specifically remains unconfirmed.
- **Evaluation "Starting Balance" ($50,000)** — no sentence or table row in the source literally states an evaluation-stage "Starting Balance." The $50,000 figure is derived from the plan's own name/column header ("Rapid EOD - $50,000"), the same account-size-as-starting-balance convention used across this firm's plan files, not a directly quoted "Starting Balance" statement. "Traders Evaluation Simplified" independently corroborates the Profit Target, Drawdown Type/Amount, Max Contracts, Consistency Rule, Minimum Trading Days, News Trading, and Inactivity Rule cells in this file's Evaluation table (it does not cover Minimum Balance at Start, One-Time Eval Fee, or Reset Fee), but likewise has no "Starting Balance" row for any plan — this remains a firm-wide documentation gap, not one specific to this file's original source.
- **Max Active/Concurrent Accounts — apparent conflict with a generic firm-wide source** — this file's own source states "3" directly and unambiguously, kept as this table's value. Separately, "Traders Evaluation Simplified" states a generic, plan-name-agnostic Sim-Funded limit of "up to five (5)... when holding only $25K and/or $50K account sizes" — phrased by account size, not plan name, which would seem to include a Rapid EOD $50K account. Since this file's own dedicated source is more specific, its "3" is treated as controlling here, but the conflict with the generic bucket figure is not resolved — see rapid.md's Not Confirmed section for the same generic figure applied where no plan-specific number exists. Note the source's own explicit "regardless of plan type" cross-plan-sharing clause (independently re-verified in its raw HTML) is attached only to the $100K/$150K three-account rule, not the $25K/$50K five-account rule that would apply here — so even the strongest reading of the generic source does not clearly assert this "5" is meant to be shared across plan families at the $50K size the way it does at $100K/$150K.
- **Evaluation Consistency Rule (30%) vs. a conflicting generic source — researched, confirmed as a genuine same-stage contradiction, not a stage mixup.** "Consistency Rule at My FundedFutures" states blanket "the consistency rule is 50% for MyFundedFutures evaluations on the Rapid & Pro plans," explicitly scoped to the evaluation stage by its own heading ("What is the evaluation consistency rule..."). This file's own dedicated source is equally explicit and equally evaluation-scoped: "there is a 30% consistency rule in the evaluation phase of the Rapid EOD Plan" (confirmed via live fetch, not just the locally-pasted copy), separately stating the Sim Funded stage has no consistency requirement at all. Both figures are unambiguously about the same stage — this is not a case of one source meaning Evaluation and the other meaning Sim-Funded/payouts. The most likely explanation: standard/intraday Rapid lives in its own help-center collection ("Intraday Drawdown Rapid Plans") separate from Rapid EOD's own collection ("End of Day Drawdown Rapid Plans"), and standard Rapid's own dedicated source (plus "Traders Evaluation Simplified") independently confirms 50% is correct for *that* plan. The generic article's "50% for Rapid" most plausibly describes standard Rapid without addressing Rapid EOD as a distinct sub-plan, rather than being a correction to this file's 30% — which remains controlling here.

---

**Sources:**

- https://help.myfundedfutures.com/en/articles/16158363-rapid-eod-50k-a-comprehensive-look (Updated: August 24, 2026)
- https://help.myfundedfutures.com/en/articles/11802636-traders-evaluation-simplified (updated August 21, 2026) — corroborates most of the Evaluation table including the 7-day Inactivity Rule (does not cover Minimum Balance at Start, One-Time Eval Fee, or Reset Fee); conflicts with a generic source on Max Active/Concurrent Accounts (see Not Confirmed).
- https://help.myfundedfutures.com/en/articles/11994562-consistency-rule-at-my-fundedfutures (updated September 2, 2026) — source of the conflicting "50% for Rapid" claim discussed (and discounted) above.
- https://help.myfundedfutures.com/en/articles/13745661-payout-policy-overview-best-and-fastest-prop-firm-payouts (updated August 25, 2026) — explicitly covers Rapid EOD under "Rapid Plan Payouts (Intraday and EOD Plans)"; source of the First Payout Eligibility row above; corroborates Buffer Requirement and Minimum Payout Request.
- https://myfundedfutures.com/plans/rapid-eod — no "last updated" date visible. Re-fetched 2026-09-18 as raw HTML via curl (not a WebFetch summarization pass), which exposed the page's embedded schema.org `Offer` microdata and Next.js JSON payload directly, including a `profitTarget` field that identifies which account-size tier each price belongs to. Source of the confirmed One-Time Eval Fee above. An earlier WebFetch-summarization pass over this same URL (superseded, and corrected here) had reported the $25K tier's price ($145/$87) as if it were the $50K tier's — the raw-HTML re-fetch caught and fixed this tier mismatch. Also independently corroborates Profit Target, Max Loss, Buffer, Minimum Payout, Consistency Rule (30%), Minimum Trading Days, and Max Contracts already confirmed by the raw-HTML help-center sources.

**Last Updated:** 2026-09-18
