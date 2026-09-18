# Rapid ($50,000)

**Source:** https://help.myfundedfutures.com/en/articles/13134709-rapid-plan-50k-a-comprehensive-look (updated August 24, 2026)

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

Rapid is My Funded Futures' streamlined plan structure combining an evaluation stage and a simulated-funded stage with intraday trailing drawdown that locks at an absolute floor. The evaluation stage uses a standardized process with a $3,000 profit target and $2,000 maximum loss (end-of-day measured). Upon passing evaluation, traders move to a sim-funded account where the drawdown mechanism becomes intraday-trailing instead, with a $2,100 buffer requirement before payouts become available.

## Evaluation

| Parameter                | Value |
| ------------------------ | ----- |
| Starting Balance         | $50,000 |
| Profit Target            | $3,000 |
| Drawdown Type            | Maximum Loss Limit (End-of-Day) |
| Drawdown Amount          | $2,000 |
| Minimum Balance at Start | Not stated |
| Daily Loss Limit         | None |
| Max Contracts            | 5 mini / 50 micro |
| Consistency Rule         | 50% (Evaluation only) |
| Minimum Trading Days     | 2 days |
| News Trading             | Yes (T1 news trading allowed) |
| Inactivity Rule          | Not stated in this source |
| One-Time Eval Fee        | $209.00 regular; displayed as "$125" with active "CLUB" promo (computed discounted price: $125.40) |
| Reset Fee                | None — no reset option; a max-drawdown breach ends the account and requires purchasing a new evaluation (full One-Time Eval Fee applies again) |

**Pricing note:** The $209.00 regular price and $125/$125.40 promotional price above come from `myfundedfutures.com/plans/rapid`'s own embedded structured data — a schema.org `Offer` price plus an embedded Next.js JSON payload with `priceCents: 20900`, `priceDiscountedCents: 12540`, and `activationFeeCents: 0` for `accountSize: 50000` — confirmed via a raw-HTML fetch (curl, not a WebFetch summarization pass) on 2026-09-18. The `$0` activation fee corroborates the help-center article's "no activation fees" claim. The promotional price is tied to an active, site-wide coupon (`couponActive: true`, `couponCode: CLUB`) and will drift or lapse independent of this file; the $209.00 list price is the more durable figure. The Reset Fee row is sourced from this same page's FAQ: "If you breach the max drawdown on a Rapid account, the account ends and you'll need to start a new evaluation. There is no reset — the max drawdown is a hard line."

## Sim Funded

| Parameter                      | Value                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Starting Balance               | $0 |
| Drawdown Type                  | Intraday trailing |
| Drawdown Amount                | $2,000 from equity high-water mark |
| Drawdown Lock                  | Trigger: Max Loss reaches $100 during intraday movement — Locked value: $100 absolute floor (must maintain at least $100 in account) |
| Minimum Balance (ongoing)      | $100 (the locked floor) |
| Daily Loss Limit               | Unconfirmed |
| Max Contracts                  | 5 mini / 50 micro |
| Consistency Rule               | None (Sim Funded) |
| News Trading                   | No (T1 news trading not allowed on Sim Funded) |
| Inactivity Rule                | Not stated in this source |
| Max Active/Concurrent Accounts | Up to 5, shared across $25K/$50K sim-funded accounts — plan-family scope unclear (see Not Confirmed) |
| Profit Split                   | 90% to trader, 10% to My Funded Futures |

## How the Drawdown Works

The Rapid Sim Funded drawdown is an intraday trailing mechanism. Your maximum loss distance is always $2,000 below your equity high-water mark (HWM) while the market is open — as you make profits and your HWM rises, the max loss floor rises with it. However, once your trailing max loss reaches $100 during the trading day, it stops trailing and locks at exactly $100. From that point forward, you must maintain a minimum balance of $100 in the account; if your balance falls below $100, the account is breached and closed.

This $2,000 trailing distance applies only during intraday trading. The mechanism is described as "intraday trailing" in the source article's Sim Funded section, distinct from the evaluation stage's own "Maximum Loss Limit (End-of-Day)" labeling.

### Worked Example

Starting Rapid Sim Funded at $0 (matching the source's own "Initial Balance: $0"). The high-water mark (HWM) only ever increases within this example — every step below re-derives from the previous one.

1. You begin with a $0 balance. Your equity high-water mark (HWM) starts at $0. Your maximum loss floor is $2,000 below that: $0 - $2,000 = -$2,000. You can lose up to $2,000 intraday.

2. During the trading day, you make $1,500 in profit. Your HWM rises to $1,500. Your max loss floor trails up to $1,500 - $2,000 = -$500. You can lose up to $500 intraday from this new peak without breaching.

3. You continue trading and your HWM reaches $2,100. Your max loss floor is $2,100 - $2,000 = $100. Because the trailing floor has now reached $100, it locks there immediately — this is the source's stated lock point ("Once your trailing Max Loss reaches $100, it locks there"), triggered the instant the HWM itself reaches $2,100, independent of what your account balance is doing at that moment.

4. From this point forward, your maximum loss limit is fixed at $100 — it will not trail up anymore even if you make additional profit the same day. You must maintain at least $100 in your account. If your balance falls below $100, the account is breached.

5. The next trading day (24 hours after your first trade), assuming you have at least $2,100 in realized profits, your first payout becomes available.

## Payouts

| Parameter                            | Value |
| ------------------------------------ | ----- |
| Profit Split                         | 90% to trader, 10% to My Funded Futures |
| Payout Frequency                     | Daily (every 24 hours) |
| Buffer Requirement                   | $2,100 in realized profits must be built before any payout is available |
| Minimum Payout Request               | $500 |
| Max Payout per Cycle                 | Unconfirmed |
| Consistency on Payouts               | None (no consistency requirement to receive payouts on Sim Funded) |
| Maximum Total Payouts / Lifetime Cap | Unconfirmed |

Payouts become available exactly 24 hours after your first trade on the Sim Funded account, provided you meet the $2,100 buffer and the $500 minimum request amounts.

## Live Transition

Per the "Understanding Rapid Live" article (https://help.myfundedfutures.com/en/articles/13134718-understanding-rapid-live, updated September 8, 2026), traders transition from Rapid Sim Funded to Live through two pathways: automatic transition upon achieving $10,000 in net profit within a single trading day, or via Risk Management Team approval following consistent payout performance.

For full live account parameters, the Reserve Program, and payout/breach mechanics, see [rapid-live.md](rapid-live.md) (shared by Rapid and Rapid EOD).

## Not Confirmed By This Source

- **Inactivity Rule — likely genuinely exempt, not just unstated.** Not stated in this source. Do not assume Rapid has an inactivity-closure rule matching any other MFFU plan without that plan's own citation. A dedicated firm-wide article, "Inactivity Rule - One-Time Payment Model" (`help.myfundedfutures.com/en/articles/16596524`, independently verified via raw HTML), states 7 consecutive calendar days applies including "simulated funded accounts," with no plan named — but its own scope is explicitly limited to accounts bought under the newer "one-time payment model" (effective August 25, 2026); legacy/existing customers keep their prior terms per the article's own words, and nothing in this file's sources states which model this file's own figures reflect. Weakening that candidate: this repo's own simulator (`src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts`) documents a separate research pass that directly checked Rapid's own dedicated article against Rapid EOD's identically-structured one and found Rapid's genuinely has no inactivity-closure language at all, "unlike Rapid EOD's identically-structured article which does" — i.e. Rapid is treated there as *deliberately exempt*, not merely undocumented. Independently re-confirmed here: this file's own originally-pasted source text contains zero occurrences of "inactivity" anywhere. Given this asymmetry (Rapid EOD, Builder, and Pro all have some form of confirmed or candidate inactivity rule; Rapid's own dedicated article specifically does not), do not assume the generic one-time-payment-model article's 7-day rule applies to Rapid just because it applies to its siblings.

- **Max Active/Concurrent Accounts — shared-bucket scope** — not stated in this article. "Traders Evaluation Simplified" states Sim-Funded account limits by *account size*, not by plan name: "up to five (5) active Sim-Funded Accounts... when holding only $25K and/or $50K account sizes... combined in any combination of $25K and $50K." Applied here as the only available figure for Rapid, but the source does not clarify whether this bucket is shared across different plan families at the same size (e.g. a Rapid $50K and a Pro $50K counting against the same cap) or is per-plan-family. Rapid EOD's own dedicated source states a different, specific figure (3) for itself — see rapid-eod.md's Not Confirmed section for that conflict. Do not treat the shared-vs-per-plan-family question as resolved. A lower-confidence data point adds a new wrinkle rather than resolving it: MFF's own live Rapid pricing page (`myfundedfutures.com/plans/rapid`, fetched via WebFetch's summarization pass, not raw HTML) states "For $25K and $50K Rapid accounts, you can hold up to five active sim funded accounts at once. For $100K and $150K accounts, the limit is three total sim funded accounts across all plans." The "5" and "3" match the generic bucket figures exactly, and "across all plans" in the $100K/$150K sentence reads as leaning toward the shared-bucket (not per-plan-family) interpretation — but this is one ambiguous phrase from a summarized extraction, not a clean resolution, and it still does not explain Rapid EOD's own conflicting "3."

- **Max Payout per Cycle** — not stated in this source. Do not assume.

- **Maximum Total Payouts / Lifetime Cap** — not stated in this source. Do not assume. A more thorough search found no evidence such a cap exists at all for Rapid: "Payout Policy Overview" (independently re-checked in this file's own extraction) has dedicated lifetime/sim-cap language for Builder ("Reaching the total sim cap of $100k") and Pro ("Request up to $100,000 (per user)") but no equivalent figure anywhere in its "Rapid Plan Payouts" section, and a direct text search of Rapid's own pages found no occurrence of "lifetime" at all. This is suggestive that no such cap exists for Rapid (consistent with Rapid's uncapped, purely request-based payout model), not merely an unstated figure — but absence of a cap is not the same as a source affirmatively stating "no cap," so this stays Not Confirmed rather than being written in as "None."

- **Sim Funded Daily Loss Limit** — the source states "Daily Loss Limit: None" only in the Evaluation table; the Sim Funded "Account basics" list never restates a Daily Loss Limit value. Do not assume the Evaluation-stage "None" carries over to Sim Funded without its own citation. "Payout Policy Overview" separately claims "No daily loss limits on Builder, Rapid or Pro plans," which would suggest None here too — but that claim is directly confirmed wrong for Builder (see builder.md, researched via live fetch: Builder's own FAQ names Evaluation, Sim Funded, and Live stages explicitly as having a $1,000 DLL) and wrong for Pro's live stage (Pro's own Live Account Parameters table has a confirmed $700–$1,800+ DLL range). Given the marketing claim is demonstrably wrong for two of the three named plans in at least one stage each, it is not treated as reliable enough to resolve this Rapid-specific gap either, even though nothing in Rapid's own source directly contradicts it.

- **Evaluation "Starting Balance" ($50,000)** — no sentence or table row in the source literally states an evaluation-stage "Starting Balance." The $50,000 figure is derived from the plan's own name/column header ("Rapid - $50,000"), the same account-size-as-starting-balance convention used across this firm's plan files, not a directly quoted "Starting Balance" statement the way Sim Funded's "Initial Balance: $0" is.

- **Drawdown Type labeling inconsistency (source artifact)** — The evaluation table row labels the drawdown as "Maximum Loss Limit (EOD)" but the Sim Funded section explicitly describes the funded-stage drawdown as "Intra-day trailing," not end-of-day. Both figures reference $2,000, but the mechanisms and timing are described differently. This file treats them as stated: EOD for evaluation, intraday for sim-funded. Do not assume they are the same mechanic.

---

**Last Updated:** 2026-09-18

**Sources:**

- https://help.myfundedfutures.com/en/articles/13134709-rapid-plan-50k-a-comprehensive-look (updated August 24, 2026)
- https://help.myfundedfutures.com/en/articles/11802636-traders-evaluation-simplified (updated August 21, 2026) — corroborates the Evaluation table (Profit Target, MLL, Max Contracts, Consistency, Minimum Trading Days); source of the Max Active/Concurrent Accounts figure and its shared-bucket ambiguity noted above.
- https://help.myfundedfutures.com/en/articles/11994562-consistency-rule-at-my-fundedfutures (updated September 2, 2026) — corroborates the 50% evaluation consistency rule and its "profit target ÷ 2" calculation.
- https://help.myfundedfutures.com/en/articles/12802721-intraday-drawdown-explained (updated January 8, 2026) — a generic explainer of the same intraday-trailing mechanic described in "How the Drawdown Works" above; its own worked figures ($50,000 / $2,000) are explicitly framed as "for example," not as Rapid-$50K-specific confirmed values, so they are not used as a citation for this file's own numbers, only for the mechanism description.
- https://help.myfundedfutures.com/en/articles/13745661-payout-policy-overview-best-and-fastest-prop-firm-payouts (updated August 25, 2026) — corroborates Payout Frequency, Buffer Requirement, and Minimum Payout Request; source of the "no daily loss limits" claim discussed (and discounted) above.
- https://myfundedfutures.com/plans/rapid — no "last updated" date visible. Re-fetched 2026-09-18 as raw HTML via curl (not a WebFetch summarization pass), independently re-verified a second time in this same pass, which exposed the page's embedded schema.org `Offer` microdata and Next.js JSON payload directly. Source of the One-Time Eval Fee, Reset Fee, and account-bucket wrinkle above; also independently restates Profit Target, MLL, Consistency (50%), Minimum Trading Days, Buffer, and Minimum Payout already confirmed by the raw-HTML help-center sources. An earlier WebFetch-summarization pass over this same URL (superseded) returned an implausible $209 promo / $125 "was"-price pairing — backwards vs. how the promo/regular relationship reads everywhere else on this site — which the raw-HTML re-fetch corrected.
- https://help.myfundedfutures.com/en/articles/16596524-inactivity-rule-one-time-payment-model — found via WebSearch after the originally-linked inactivity-rule URL (11972075) was confirmed 404; independently re-verified via raw HTML. Source of the candidate Inactivity Rule figure discussed above, scoped to the "one-time payment model" only.
