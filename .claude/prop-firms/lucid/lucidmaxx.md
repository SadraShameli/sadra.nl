# LucidMaxx

**Sources:** `https://support.lucidtrading.com/en/articles/13891785-lucidmaxx-overview` ("LucidMaxx Overview"), `https://support.lucidtrading.com/en/articles/14315460-lucidmaxx-eval-rules` ("LucidMaxx Eval Rules"), `https://support.lucidtrading.com/en/articles/14315468-lucidmaxx-cooldown` ("LucidMaxx Cooldown"), `https://support.lucidtrading.com/en/articles/14316866-lucidmaxx-eval-pricing` ("LucidMaxx Eval Pricing"). All fetched directly via raw HTTP on 2026-09-19, none through an LLM summarization pass. See `live.md` for the shared drawdown mechanic this file cross-references rather than repeats.

**Last Verified:** 2026-09-19
**Last Updated:** 2026-09-19

## Overview

LucidMaxx is a repeatable eval-to-live program reserved for traders who have already earned "LucidMaxx status" through their track record on other Lucid plans: "This plan is not available to the general public. It can only be purchased by traders who have earned LucidMaxx status through demonstrated performance" ("LucidMaxx Overview"). Access is risk-team-initiated, not requested: "Our quantitative risk team uses defined performance criteria to identify traders who qualify," after which, as two separate list items in the source, "They will be notified directly via email" and "They will be granted access to purchase the LucidMaxx evaluation." The article closes the section with: "LucidMaxx status is earned, not requested."

Once a trader has earned that status, LucidMaxx itself functions as an ordinary, self-serve, dynamically-priced evaluation-to-live cycle, not a one-time invitation: "LucidMaxx is designed as a repeatable cycle. If a trader earns profits above the live drawdown, there is no limit to how many times a trader may return to the LucidMaxx evaluation" ("LucidMaxx Cooldown"). This is why the Eval Rules and Eval Pricing articles read as ordinary, generally-documented evaluation/pricing content with no invite-only language of their own: they describe the mechanics available to a trader who has already qualified, not the qualification gate itself, which is stated only in the Overview article. Do not read the absence of invite-only language in those two articles as evidence LucidMaxx is generally purchasable without first earning status; the Overview and its FAQ state the gate explicitly and repeatedly.

Once the evaluation is passed, LucidMaxx moves the trader directly into a live account; there is no Sim Funded stage.

## Evaluation

| Parameter | $25K | $50K | $100K | $150K |
| --- | --- | --- | --- | --- |
| Starting Balance | $25,000 (see Not Confirmed) | $50,000 (see Not Confirmed) | $100,000 (see Not Confirmed) | $150,000 (see Not Confirmed) |
| Profit Target | $1,250 | $3,000 | $6,000 | $9,000 |
| Drawdown Type | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed |
| Drawdown Amount | $1,000 | $2,000 | $3,000 | $4,500 |
| Minimum Balance at Start | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed |
| Daily Loss Limit | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed |
| Max Contracts | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed |
| Consistency Rule | 40% (see Not Confirmed for the formula caveat) | 40% | 40% | 40% |
| Minimum Trading Days | 5 | 5 | 5 | 5 |
| News Trading | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed |
| Inactivity Rule | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed |
| One-Time Eval Fee | Dynamic, tiered by prior live-account outcomes: $110 (Tier 1, 0–4 blown live accounts) / $130 (Tier 2, 5–8) / $155 (Tier 3, 9–12) / $175 (Tier 4, 13+) | $180 / $215 / $250 / $290 (same 4 tiers) | $270 / $325 / $380 / $430 (same 4 tiers) | $425 / $510 / $595 / $680 (same 4 tiers) |
| Reset Fee | Same as the One-Time Eval Fee: "Evaluations and resets are priced the same" ("LucidMaxx Eval Pricing") | Same | Same | Same |

To pass the evaluation, all three conditions must be met: the Profit Target is reached, the 40% consistency rule is maintained, and the 5-trading-day minimum is satisfied ("LucidMaxx Eval Rules"). Passing moves the trader directly into a live account.

## Pricing Mechanics

LucidMaxx's own eval/reset price is not fixed per size; it moves with a trader's own live-account track record, not with promotions or discounts:

- **Clearing live drawdown** (surviving to the live account's own Starting Live Drawdown without breaching): the trader keeps their current, lower pricing tier permanently, "even if the account is later lost" once that threshold was reached ("LucidMaxx Eval Pricing").
- **Blowing a live account without clearing drawdown**: the trader moves into a progressively higher pricing tier, as shown in the Evaluation table's own One-Time Eval Fee row above.
- **No discounts, no promotions**: "No discounts are offered on LucidMaxx evaluations... The listed price is the final price paid... cannot be reduced through promotions" ("LucidMaxx Eval Pricing").

## Live Transition

Passing the LucidMaxx evaluation moves the trader directly into a live account; there is no Sim Funded stage and no separate activation step described in the cited sources.

**Drawdown:** LucidMaxx's own source states its live drawdown mechanic directly: "The live account drawdown is the same as the standard Lucid live structure" ("LucidMaxx Eval Rules"). See `live.md`'s own Live Account table for the full mechanic; by size, this means a $1,000 / $2,000 / $3,000 / $4,500 Starting Live Drawdown, locking at a flat $100 once the account reaches that much live profit or the trader requests a payout, whichever comes first (per `live.md`'s own Drawdown Lock row). This file does not repeat that table.

**Payouts:** unlike the equivalence stated for drawdown, LucidMaxx's own source describes its payout structure directly rather than deferring to `live.md`, and states figures not confirmed identically there. Do not assume the two are the same without independent confirmation of `live.md`'s own payout terms:

| Parameter | Value |
| --- | --- |
| Profit Split | 90% trader / 10% Lucid Trading, "You keep 90% from the first payout" ("LucidMaxx Overview" FAQ) |
| Payout Frequency | Daily: "Uncapped daily payouts," "No payout windows," "Daily payout requests" ("LucidMaxx Overview") |
| Buffer Requirement | Unconfirmed |
| Minimum Payout Request | Unconfirmed |
| Max Payout per Cycle | None: "No payout caps" ("LucidMaxx Overview") |
| Consistency on Payouts | Unconfirmed (see Not Confirmed) |
| Maximum Total Payouts / Lifetime Cap | Unconfirmed (see Not Confirmed) |

**Live Bonus:** per `live.md`'s own confirmed source, traders holding LucidMaxx status are not eligible for the one-time Live Bonus other Lucid plans' traders receive on first live transition, regardless of how many times they have transitioned. This is stated in `live.md`'s source, not in LucidMaxx's own four articles, which never mention the Live Bonus at all.

**Max Active/Concurrent Accounts:** up to 5 simultaneous LucidMaxx accounts ("LucidMaxx Overview" FAQ). Not stated whether this pool is shared with the standard LucidLive 5-account household cap in `live.md`, or is its own separate allowance; see Not Confirmed.

**Max Contracts:** not independently stated for LucidMaxx in the cited sources. Do not assume `live.md`'s own Live Contract Scaling Plan table applies unchanged without a LucidMaxx-specific citation; see Not Confirmed.

## Cooldown and Re-Entry

LucidMaxx is designed as a long-term, repeatable cycle rather than a one-time program:

- **Clearing live drawdown:** a trader who earns profit above the live drawdown without breaching may return to the LucidMaxx evaluation an unlimited number of times ("LucidMaxx Cooldown").
- **Blowing a live account:** triggers a 2-week cooldown, which begins only once every one of that trader's LucidMaxx live accounts is closed (not from the moment any single account is blown, if others remain open). A trader with active LucidMaxx evaluations in progress may continue trading and even return to live during this period; only the cooldown clock itself waits on every live account closing.
- **Reckless trading near the live Max Loss Limit** (the source's own example: full-porting positions near the limit) can escalate, at the Lucid risk team's sole discretion, to "Extended cooldown periods" or "Permanent restriction from the program" ("LucidMaxx Cooldown"). No specific duration or dollar/percentage threshold is stated for what triggers this escalation beyond the qualitative "reckless"/"full porting" description; see Not Confirmed.

## Not Confirmed By This Source

- **Starting Balance, all sizes** — no sentence in the cited sources states "Starting Balance: $X" as a labeled field; each size's figure is the tier-label convention used elsewhere in this doc tree. Do not treat it as independently, explicitly stated.
- **Drawdown Type, Daily Loss Limit, News Trading, Inactivity Rule, Max Contracts (Evaluation stage)** — none of these fields is stated anywhere in "LucidMaxx Eval Rules" or any other cited article for this file. Do not assume LucidPro's/LucidFlex's/LucidDirect's own Evaluation-stage figures for these rows carry over to LucidMaxx without a LucidMaxx-specific citation.
- **Exact 40% consistency formula wording** — "LucidMaxx Eval Rules" states only "The 40% consistency rule must be maintained" without spelling out the Largest-Single-Day-Profit-÷-Total-Net-Profit formula this file uses by convention (matching every other Lucid plan's own confirmed formula). Do not treat the formula itself as independently restated for LucidMaxx.
- **Consistency on Payouts (live stage)** — the 40% figure confirmed above is stated only as an Evaluation-stage pass condition. No cited source states whether any consistency requirement applies once live. Do not assume either that it carries over or that it is waived; neither is directly stated.
- **Max Active/Concurrent Accounts, shared-pool question** — "LucidMaxx Overview" states a flat "Up to 5 simultaneous accounts" limit but never states whether this is the same 5-account household pool `live.md` describes for LucidPro/LucidFlex/LucidDirect/LucidDaily-sourced live accounts, or a separate LucidMaxx-only allowance. Do not assume either answer.
- **Max Contracts (live stage)** — LucidMaxx's own source confirms only that its live drawdown mechanic matches `live.md`'s; it says nothing about contract limits. Do not assume `live.md`'s own Live Contract Scaling Plan table applies to LucidMaxx accounts without an independent citation.
- **Maximum Total Payouts / Lifetime Cap (live stage)** — "LucidMaxx Overview" states "No payout caps" (a per-request cap) and "There are no profit minimums once live" (a minimum threshold), but neither statement addresses a lifetime or cumulative total. Do not read either as confirming the absence of a lifetime cap; the source is silent on it.
- **Reckless-trading escalation threshold** — "LucidMaxx Cooldown" describes the trigger only qualitatively ("full porting positions near the live account Max Loss Limit") and the consequence only as Lucid-risk-team discretion ("Extended cooldown periods" or "Permanent restriction from the program"). No specific duration, percentage, or dollar threshold is stated for either the trigger or the extended cooldown's own length.
- **Relationship to LucidBlack** — "LucidMaxx Overview" and "LucidMaxx Cooldown" do not mention LucidBlack, the other invite-gated/legacy Lucid product documented in this tree's Not Confirmed / Documentation Scope notes elsewhere. Do not assume any relationship (shared eligibility criteria, mutual exclusivity, or otherwise) between the two programs without a source stating one.

---

**Last Updated:** 2026-09-19

**Sources:**

- `https://support.lucidtrading.com/en/articles/13891785-lucidmaxx-overview`, "LucidMaxx Overview." Source of the invite-only qualification gate, LucidMaxx status criteria, benefits list, live payout structure (90/10, daily, uncapped, no minimums), and the 5-account limit.
- `https://support.lucidtrading.com/en/articles/14315460-lucidmaxx-eval-rules`, "LucidMaxx Eval Rules." Source of the per-size Evaluation table (Profit Target, Max Loss Limit, 40% Consistency, 5-day minimum) and the "same as the standard Lucid live structure" drawdown cross-reference.
- `https://support.lucidtrading.com/en/articles/14315468-lucidmaxx-cooldown`, "LucidMaxx Cooldown." Source of the repeatable-cycle framing, the 2-week cooldown mechanic and its multi-account timing rule, and the reckless-trading escalation clause.
- `https://support.lucidtrading.com/en/articles/14316866-lucidmaxx-eval-pricing`, "LucidMaxx Eval Pricing." Source of the dynamic 4-tier pricing table by account size and prior blown-live-account count, and the no-discount/no-promotion pricing rules.
