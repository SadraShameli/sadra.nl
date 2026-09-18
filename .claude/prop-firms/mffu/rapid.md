# Rapid ($25,000 / $50,000 / $100,000 / $150,000)

**Sources:** four tier-specific articles, one per account size: https://help.myfundedfutures.com/en/articles/14116402-rapid-plan-25k-a-comprehensive-look (August 14, 2026), https://help.myfundedfutures.com/en/articles/13134709-rapid-plan-50k-a-comprehensive-look (August 24, 2026), https://help.myfundedfutures.com/en/articles/13286542-rapid-plan-100k-a-comprehensive-look (July 1, 2026), https://help.myfundedfutures.com/en/articles/13286582-rapid-plan-150k-a-comprehensive-look (July 1, 2026). The 25K article was already read; the other three tier-specific figures come entirely from the $50K tier by itself until this pass. The 100K/150K/25K articles were located and fetched directly by running this skill's Discover & Extract stage against `help.myfundedfutures.com/sitemap.xml`, prompted by the user asking for the same sitemap-sweep treatment already applied to Lucid Trading; see SOURCES.md for the full methodology note.

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

Rapid is My Funded Futures' streamlined plan structure combining an evaluation stage and a simulated-funded stage with intraday trailing drawdown that locks at an absolute floor. It is offered at four account sizes ($25K/$50K/$100K/$150K), each with its own dedicated help-center article. The evaluation stage's drawdown is labeled "Maximum Loss Limit (EOD)" in every tier's own parameter table; upon passing evaluation, traders move to a sim-funded account where the drawdown mechanism becomes intraday-trailing instead. News trading during T1 (Tier 1) economic-data releases is confirmed, firm-wide, as permitted during Evaluation and prohibited on Rapid's own Sim Funded stage specifically ("News Trading Policy" article; see README.md's Firm-Wide Rules).

## Evaluation

| Parameter                | $25K | $50K | $100K | $150K |
| ------------------------ | --- | --- | --- | --- |
| Starting Balance         | $25,000 (derived from tier label, see Not Confirmed) | $50,000 (derived from tier label, see Not Confirmed) | $100,000 (derived from tier label, see Not Confirmed) | $150,000 (derived from tier label, see Not Confirmed) |
| Profit Target            | $1,500 | $3,000 | $6,000 | $9,000 |
| Drawdown Type             | Maximum Loss Limit (End-of-Day) | Maximum Loss Limit (End-of-Day) | Maximum Loss Limit (End-of-Day) | Maximum Loss Limit (End-of-Day) |
| Drawdown Amount          | $1,000 | $2,000 | $3,000 | $4,500 |
| Minimum Balance at Start | Not stated | Not stated | Not stated | Not stated |
| Daily Loss Limit         | None | None | None | None |
| Max Contracts            | 3 mini / 30 micro | 5 mini / 50 micro | 8 mini / 80 micro | 10 mini / 100 micro |
| Consistency Rule         | 50% (Evaluation only) | 50% (Evaluation only) | 50% (Evaluation only) | 50% (Evaluation only) |
| Minimum Trading Days     | 2 days | 2 days | 2 days | 2 days |
| News Trading             | Yes (T1 news trading allowed), independently confirmed firm-wide by "News Trading Policy": "Unrestricted Accounts: Trading on T1 News events is permitted for the following: All evaluations" | Yes (T1 news trading allowed) | Yes (T1 news trading allowed) | Yes (T1 news trading allowed) |
| Inactivity Rule          | Not stated as an Evaluation-stage rule in this tier's own article (the article's only "Inactivity Rule" row appears under Sim Funded, see below) | Not stated in this source | Not stated in this source | Not stated in this source |
| One-Time Eval Fee        | Unconfirmed for this tier | $209.00 regular; displayed as "$125" with active "CLUB" promo (computed discounted price: $125.40) | Unconfirmed for this tier | Unconfirmed for this tier |
| Reset Fee                | Unconfirmed for this tier | None, no reset option; a max-drawdown breach ends the account and requires purchasing a new evaluation (full One-Time Eval Fee applies again) | Unconfirmed for this tier | Unconfirmed for this tier |

**Pricing note (50K only):** The $209.00 regular price and $125/$125.40 promotional price come from `myfundedfutures.com/plans/rapid`'s own embedded structured data, a schema.org `Offer` price plus an embedded Next.js JSON payload with `priceCents: 20900`, `priceDiscountedCents: 12540`, and `activationFeeCents: 0` for `accountSize: 50000`, confirmed via a raw-HTML fetch (curl, not a WebFetch summarization pass) on 2026-09-18. The `$0` activation fee corroborates the help-center article's "no activation fees" claim, now independently confirmed a fourth time by the dedicated firm-wide article "Does MyFundedFutures Charge Activation Fees?" (see README.md). The promotional price is tied to an active, site-wide coupon (`couponActive: true`, `couponCode: CLUB`) and will drift or lapse independent of this file; the $209.00 list price is the more durable figure. The Reset Fee row is sourced from this same page's FAQ: "If you breach the max drawdown on a Rapid account, the account ends and you'll need to start a new evaluation. There is no reset, the max drawdown is a hard line." No live pricing page was re-fetched for 25K/100K/150K in this pass, so their One-Time Eval Fee and Reset Fee remain genuinely unconfirmed; do not assume they scale linearly from the $50K figures.

**Evaluation-stage drawdown lock, 25K only, directly confirmed, not assumed for other tiers:** the 25K article states explicitly, in its own dedicated section before the Sim Funded table begins: "Max Loss Lock at $25,100. Once your trailing Max Loss reaches $25,100, it locks there. From that point on, it does not trail anymore. Your account balance must remain above $25,100 for the remainder of the Evaluation." Read against the $1,000 drawdown distance, this means the floor itself (not equity) reaches $25,100 once equity/HWM climbs to $26,100 ($25,000 starting balance + $1,000 drawdown + $100), the same `starting balance + drawdown + $100` trigger formula, and `starting balance + $100` locked value, used identically for the Sim Funded stage below. **The 50K, 100K, and 150K tier articles contain no equivalent section at all**, no evaluation-stage lock is mentioned anywhere in any of the other three tiers' own dedicated articles. Given CONVENTIONS.md's warning against assuming cross-tier carryover, this is left genuinely Unconfirmed for 50K/100K/150K rather than extrapolated from the 25K figure or the matching formula, even though the same formula is independently confirmed to govern the Sim Funded stage at every tier; see Not Confirmed.

## Sim Funded

| Parameter                      | $25K | $50K | $100K | $150K |
| ------------------------------ | --- | --- | --- | --- |
| Starting Balance               | $0 | $0 | $0 | $0 |
| Drawdown Type                  | Intraday trailing | Intraday trailing | Intraday trailing | Intraday trailing |
| Drawdown Amount                | $1,000 from equity high-water mark | $2,000 from equity high-water mark | $3,000 from equity high-water mark | $4,500 from equity high-water mark |
| Drawdown Lock                  | Trigger: Max Loss reaches $100 during intraday movement (equity/HWM reaching $1,100). Locked value: $100 absolute floor (must maintain at least $100 in account) | Trigger: Max Loss reaches $100 during intraday movement. Locked value: $100 absolute floor | Trigger: Max Loss reaches $100 during intraday movement. Locked value: $100 absolute floor | Trigger: Max Loss reaches $100 during intraday movement. Locked value: $100 absolute floor |
| Minimum Balance (ongoing)      | $100 (the locked floor) | $100 (the locked floor) | $100 (the locked floor) | $100 (the locked floor) |
| Daily Loss Limit               | None, directly stated ("Daily Loss Limit: None" in this tier's own Evaluation table; its Sim Funded section does not restate a value, matching the same pattern flagged for other tiers, see Not Confirmed) | Unconfirmed (see Not Confirmed) | Unconfirmed (see Not Confirmed) | Unconfirmed (see Not Confirmed) |
| Max Contracts                  | 3 mini / 30 micro | 5 mini / 50 micro | 8 mini / 80 micro | 10 mini / 100 micro |
| Consistency Rule               | None (Sim Funded) | None (Sim Funded) | None (Sim Funded) | None (Sim Funded) |
| News Trading                   | No (T1 news trading not allowed on Sim Funded), independently confirmed firm-wide by "News Trading Policy": "Restricted Accounts: Trading on T1 News events is prohibited for the following: Rapid Sim Funded, Pro Sim Funded" | No (T1 news trading not allowed on Sim Funded) | No (T1 news trading not allowed on Sim Funded) | No (T1 news trading not allowed on Sim Funded) |
| Inactivity Rule                | 7 calendar days, directly stated: "You must place at least one trade every 7 calendar Days. If no trades are placed within 7 consecutive calendar days, the account may be subject to closure." | Not stated in this source (see Not Confirmed) | Not stated in this source | Not stated in this source |
| Max Active/Concurrent Accounts | Up to 5, shared across every plan type at $25K/$50K sizes combined, directly confirmed by "Moving from Evaluation to Sim-Funded Account" (standard Rapid has no plan-specific override, unlike Rapid EOD/Builder; see README.md's Firm-Wide Rules) | Up to 5, shared across every plan type | Up to 3, shared across every plan type the instant any $100K/$150K Sim-Funded account is held | Up to 3, shared across every plan type |
| Profit Split                   | 90% to trader, 10% to My Funded Futures | 90% to trader, 10% to My Funded Futures | 90% to trader, 10% to My Funded Futures | 90% to trader, 10% to My Funded Futures |

## How the Drawdown Works

The Rapid Sim Funded drawdown is an intraday trailing mechanism, confirmed identically across all four tiers. Your maximum loss distance stays fixed below your equity high-water mark (HWM) while the market is open, $1,000/$2,000/$3,000/$4,500 depending on tier, as you make profits and your HWM rises, the max loss floor rises with it. However, once your trailing max loss reaches $100 during the trading day, it stops trailing and locks at exactly $100. From that point forward, you must maintain a minimum balance of $100 in the account; if your balance falls below $100, the account is breached and closed.

This trailing distance applies only during intraday trading. The mechanism is described as "intraday trailing" in every tier's own Sim Funded section, distinct from the evaluation stage's own "Maximum Loss Limit (End-of-Day)" labeling, the same source-stated labeling inconsistency already flagged before this pass (see Not Confirmed).

### Worked Example

Starting Rapid Sim Funded at $0 (matching the source's own "Initial Balance: $0"), using the $50,000 tier. The high-water mark (HWM) only ever increases within this example, every step below re-derives from the previous one.

1. You begin with a $0 balance. Your equity high-water mark (HWM) starts at $0. Your maximum loss floor is $2,000 below that: $0 - $2,000 = -$2,000. You can lose up to $2,000 intraday.

2. During the trading day, you make $1,500 in profit. Your HWM rises to $1,500. Your max loss floor trails up to $1,500 - $2,000 = -$500. You can lose up to $500 intraday from this new peak without breaching.

3. You continue trading and your HWM reaches $2,100. Your max loss floor is $2,100 - $2,000 = $100. Because the trailing floor has now reached $100, it locks there immediately, this is the source's stated lock point ("Once your trailing Max Loss reaches $100, it locks there"), triggered the instant the HWM itself reaches $2,100, independent of what your account balance is doing at that moment.

4. From this point forward, your maximum loss limit is fixed at $100, it will not trail up anymore even if you make additional profit the same day. You must maintain at least $100 in your account. If your balance falls below $100, the account is breached.

5. The next trading day (24 hours after your first trade), assuming you have at least $2,100 in realized profits, your first payout becomes available.

## Payouts

| Parameter                            | $25K | $50K | $100K | $150K |
| ------------------------------------- | --- | --- | --- | --- |
| Profit Split                         | 90% to trader, 10% to My Funded Futures | 90% to trader, 10% to My Funded Futures | 90% to trader, 10% to My Funded Futures | 90% to trader, 10% to My Funded Futures |
| Payout Frequency                     | Daily (every 24 hours) | Daily (every 24 hours) | Daily (every 24 hours) | Daily (every 24 hours) |
| Buffer Requirement                   | $1,100 in realized profits must be built before any payout is available | $2,100 | $3,100 | $4,600 |
| Minimum Payout Request               | $500 | $500 | $500 | $500 |
| Max Payout per Cycle                 | No stated maximum, no source gives a per-request ceiling for any tier (unlike Pro's explicit $100,000 or Builder's explicit $1,000/$2,000), consistent with Rapid EOD's identical finding for its own otherwise-shared payout structure; see Not Confirmed. | No stated maximum | No stated maximum | No stated maximum |
| Consistency on Payouts               | None (no consistency requirement to receive payouts on Sim Funded) | None | None | None |
| Maximum Total Payouts / Lifetime Cap | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed |

Payouts become available exactly 24 hours after your first trade on the Sim Funded account, provided you meet the tier's own buffer and the $500 minimum request amount, confirmed identically across all four tier articles.

## Live Transition

Per the "Understanding Rapid Live" article (https://help.myfundedfutures.com/en/articles/13134718-understanding-rapid-live, updated September 8, 2026), traders transition from Rapid Sim Funded to Live through two pathways: automatic transition upon achieving $10,000 in net profit within a single trading day, or via Risk Management Team approval following consistent payout performance. Neither the 25K, 100K, nor 150K tier articles restate live-transition parameters themselves, each instead links out to the same shared "Transition to Live Parameters" article, consistent with the $50K tier's own already-confirmed pattern.

For full live account parameters, the Reserve Program, and payout/breach mechanics, see [rapid-live.md](rapid-live.md) (shared by Rapid and Rapid EOD).

## Not Confirmed By This Source

- **Inactivity Rule (Evaluation, all tiers; Sim Funded, 50K/100K/150K), likely genuinely exempt, not just unstated, for 50K/100K/150K's Sim Funded stage specifically; genuinely unaddressed for Evaluation at every tier.** The 25K tier's own article is the only one of the four to state an inactivity figure at all, and it states it only for Sim Funded (7 calendar days), not Evaluation. A dedicated firm-wide article, "Inactivity Rule - One-Time Payment Model" (`help.myfundedfutures.com/en/articles/16596524`), states 7 consecutive calendar days applies including "simulated funded accounts," with no plan named, but its own scope is explicitly limited to accounts bought under the newer "one-time payment model" (effective August 25, 2026); legacy/existing customers keep their prior terms per the article's own words, and nothing in this file's sources states which model each tier's own figures reflect. Weakening the case for extending 7 days to 50K/100K/150K specifically: this repo's own simulator (`src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts`) documents a prior research pass that directly checked (then) Rapid $50K's own dedicated article against Rapid EOD $50K's identically-structured one and found Rapid's genuinely has no inactivity-closure language at all, "unlike Rapid EOD's identically-structured article which does", i.e. Rapid $50K was treated there as *deliberately exempt*, not merely undocumented, and this pass's own re-read of the 50K/100K/150K raw text independently confirms zero occurrences of "inactivity" in any of the three. The 25K tier now genuinely breaks that pattern (it does state a 7-day Sim Funded rule), so "deliberately exempt" can no longer be asserted for the whole plan family, only for 50K/100K/150K's own specific articles, each of which still has no inactivity language of any kind. Do not assume the 25K figure extends to the other three tiers, and do not assume the other three tiers are exempt just because their own articles are silent, both directions are genuinely unconfirmed here.

- **Daily Loss Limit (Sim Funded, 50K/100K/150K)**, every tier's Evaluation table states "Daily Loss Limit: None," but only the 25K tier's Sim Funded "Account basics" section restates a value (also None). The 50K/100K/150K tiers' Sim Funded sections never restate a Daily Loss Limit value at all. Do not assume the Evaluation-stage "None" carries over to Sim Funded for those three tiers without its own citation. "Payout Policy Overview" separately claims "No daily loss limits on Builder, Rapid or Pro plans," which is demonstrably wrong for Builder (its own FAQ names a $1,000 DLL across all three stages) and for Pro's live stage, so it is not treated as reliable enough to resolve this gap either, even though nothing in these three tiers' own sources directly contradicts it.

- **One-Time Eval Fee and Reset Fee, 25K/100K/150K**, no live pricing page for these three tiers was fetched in this pass (only the $50K page, `myfundedfutures.com/plans/rapid`, was re-verified via raw HTML). Do not assume these three tiers' pricing scales linearly from the $50K figures.

- **Evaluation-stage drawdown lock, 50K/100K/150K**, see the dedicated note under the Evaluation table above. Directly confirmed only for 25K; genuinely absent from the other three tiers' own dedicated articles, not assumed to follow the same formula despite the formula's independent confirmation at the Sim Funded stage for every tier.

- **Max Payout per Cycle, reasoned inference, not a direct statement, any tier**, no source states a per-request ceiling for any Rapid tier. Rapid EOD's own dedicated sources (otherwise sharing Rapid's payout structure) explicitly have "no stated maximum" for the same row at both of its own documented tiers, and no Rapid tier's sources mention a per-request cap the way Pro ($100,000) and Builder ($1,000/$2,000) do explicitly. Treated as no evidence of a cap, moderate, not high, confidence; this is an absence-of-evidence inference, not a quoted "no maximum" statement.

- **Maximum Total Payouts / Lifetime Cap, any tier**, not stated in any of the four tier sources. A more thorough search found no evidence such a cap exists at all for Rapid: "Payout Policy Overview" has dedicated lifetime/sim-cap language for Builder and Pro but no equivalent figure anywhere in its "Rapid Plan Payouts" section, and a direct text search of Rapid's own pages found no occurrence of "lifetime" at all. Suggestive that no such cap exists (consistent with Rapid's uncapped, purely request-based payout model), not an affirmative "no cap" statement, so this stays Not Confirmed rather than being written in as "None."

- **Evaluation "Starting Balance," all tiers**, no sentence or table row in any of the four tier sources literally states an evaluation-stage "Starting Balance." Every tier's figure is derived from the plan's own name/column header ("Rapid - $25,000," etc.), the same account-size-as-starting-balance convention used across this firm's plan files, not a directly quoted "Starting Balance" statement.

- **Drawdown Type labeling inconsistency (source artifact, all tiers)**, every tier's evaluation table row labels the drawdown as "Maximum Loss Limit (EOD)," but every tier's Sim Funded section explicitly describes the funded-stage drawdown as "Intra-day trailing," not end-of-day. This file treats them as stated: EOD-labeled for evaluation, intraday for sim-funded. Do not assume they are the same mechanic despite sharing the same dollar distance.

---

**Last Updated:** 2026-09-18

**Sources:**

- https://help.myfundedfutures.com/en/articles/14116402-rapid-plan-25k-a-comprehensive-look (August 14, 2026), found via a full sitemap sweep of `help.myfundedfutures.com` (see SOURCES.md). Source of every 25K-tier-specific figure above, including the only directly-confirmed Evaluation-stage drawdown lock and the only directly-confirmed Sim Funded Inactivity Rule among the four Rapid tiers.
- https://help.myfundedfutures.com/en/articles/13134709-rapid-plan-50k-a-comprehensive-look (updated August 24, 2026)
- https://help.myfundedfutures.com/en/articles/13286542-rapid-plan-100k-a-comprehensive-look (July 1, 2026), found via the same sitemap sweep.
- https://help.myfundedfutures.com/en/articles/13286582-rapid-plan-150k-a-comprehensive-look (July 1, 2026), found via the same sitemap sweep.
- https://help.myfundedfutures.com/en/articles/11802636-traders-evaluation-simplified (updated August 21, 2026), corroborates the Evaluation table (Profit Target, MLL, Max Contracts, Consistency, Minimum Trading Days) at every tier; superseded as the primary source for Max Active/Concurrent Accounts by the more specific article below.
- https://help.myfundedfutures.com/en/articles/11994562-consistency-rule-at-my-fundedfutures (updated September 2, 2026), corroborates the 50% evaluation consistency rule and its "profit target ÷ 2" calculation.
- https://help.myfundedfutures.com/en/articles/12802721-intraday-drawdown-explained (updated January 8, 2026), a generic explainer of the same intraday-trailing mechanic described in "How the Drawdown Works" above; its own worked figures ($50,000 / $2,000) are explicitly framed as "for example," not as Rapid-$50K-specific confirmed values, so they are not used as a citation for this file's own numbers, only for the mechanism description.
- https://help.myfundedfutures.com/en/articles/13745661-payout-policy-overview-best-and-fastest-prop-firm-payouts (updated August 25, 2026), corroborates Payout Frequency, Buffer Requirement, and Minimum Payout Request; source of the "no daily loss limits" claim discussed (and discounted) above.
- https://myfundedfutures.com/plans/rapid, no "last updated" date visible. Re-fetched 2026-09-18 as raw HTML via curl (not a WebFetch summarization pass), independently re-verified a second time in this same pass, which exposed the page's embedded schema.org `Offer` microdata and Next.js JSON payload directly. Source of the $50K tier's One-Time Eval Fee, Reset Fee, and account-bucket wrinkle above; also independently restates Profit Target, MLL, Consistency (50%), Minimum Trading Days, Buffer, and Minimum Payout already confirmed by the raw-HTML help-center sources. An earlier WebFetch-summarization pass over this same URL (superseded) returned an implausible $209 promo / $125 "was"-price pairing, backwards vs. how the promo/regular relationship reads everywhere else on this site, which the raw-HTML re-fetch corrected.
- https://help.myfundedfutures.com/en/articles/16596524-inactivity-rule-one-time-payment-model, found via WebSearch after the originally-linked inactivity-rule URL (11972075) was confirmed 404; independently re-verified via raw HTML. Source of the candidate Inactivity Rule figure discussed above, scoped to the "one-time payment model" only.
- https://help.myfundedfutures.com/en/articles/8230009-news-trading-policy, "News Trading Policy." Found via the sitemap sweep. Firm-wide, definitive source for the News Trading resolution at every tier and both stages.
- https://help.myfundedfutures.com/en/articles/16498635-moving-from-evaluation-to-sim-funded-account, "Moving from Evaluation to Sim-Funded Account." Found via the sitemap sweep. Definitive, firm-wide source for the Max Active/Concurrent Accounts structure, confirming standard Rapid has no plan-specific override at $25K/$50K (unlike Rapid EOD and Builder), and confirming the $100K/$150K three-account cap is shared across plan types.
