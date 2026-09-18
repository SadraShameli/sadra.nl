# LucidPro

**Sources:** `https://support.lucidtrading.com/en/articles/12890029-lucidpro-evaluation-account` ("LucidPro Evaluation Account," updated "over 3 weeks ago" relative to fetch), `https://support.lucidtrading.com/en/articles/12890069-lucidpro-funded-account` ("LucidPro Funded Account," same relative update), `https://support.lucidtrading.com/en/articles/12890122-lucidpro-daily-loss-limit` ("LucidPro Daily Loss Limit," dated July 26, 2026), `https://support.lucidtrading.com/en/articles/12890092-lucidpro-payouts` ("LucidPro Payouts," dated August 6, 2026), `https://support.lucidtrading.com/en/articles/11404617-maximum-number-of-accounts`, `https://support.lucidtrading.com/en/articles/11404632-inactivity-policy`, `https://support.lucidtrading.com/en/articles/11404620-simulated-account-fees`, `https://support.lucidtrading.com/en/articles/11404729-allowed-trading-times`, `https://support.lucidtrading.com/en/articles/11404728-other-trading-activities`, `https://support.lucidtrading.com/en/articles/12890109-lucidpro-consistency-percentage`, `https://support.lucidtrading.com/en/articles/16226068-lucidpro-customization` (all "Updated over 3 weeks ago" except Customization, dated August 6, 2026). All fetched directly via raw HTTP on 2026-09-18; none were run through an LLM summarization pass.

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

LucidPro is offered in four account sizes ($25K/$50K/$100K/$150K), each with an optional purchasable Daily Loss Limit (DLL) toggle selected at checkout: DLL ON gives a lower evaluation price with a fixed daily loss cap; DLL OFF gives a higher evaluation price with no daily cap at all ("LucidPro Daily Loss Limit," "Simulated Account Fees" implies the price difference by analogy with the same toggle on LucidFlex/LucidDaily — see Not Confirmed for the exact dollar premium, which is engine-sourced, not confirmed by this file's own sources). This file documents both configurations side by side wherever the toggle affects a row, matching the "Default \| Add-On"-style presentation this doc tree already uses for MFF's Builder plan. The $25,000 tier has no DLL option at all in either source table — it is not a "toggle set to off," it simply has no DLL figure listed anywhere for that size.

After passing evaluation, traders enter a Sim Funded stage with an End-of-Day (implied — see Not Confirmed) trailing Max Loss Limit (MLL) that locks once the account's closing balance exceeds the size-specific "Initial Trail Balance," a threshold that also simultaneously triggers the DLL's switch from its fixed dollar amount to a scaling "LucidScale" formula. There is no simulated payout cap and no funded-stage contract scaling — traders get full contract size immediately upon funding.

## Evaluation

| Parameter | $25K | $50K | $100K | $150K |
| --- | --- | --- | --- | --- |
| Starting Balance | $25,000 (derived from tier label, see Not Confirmed) | $50,000 (derived from tier label, see Not Confirmed) | $100,000 (derived from tier label, see Not Confirmed) | $150,000 (derived from tier label, see Not Confirmed) |
| Profit Target | $1,250 | $3,000 | $6,000 | $9,000 |
| Drawdown Type | End-of-Day Drawdown — "LucidPro evaluation and funded accounts use an End-of-Day Drawdown (EOD Drawdown) system to calculate the Max Loss Limit (MLL)" ("LucidPro Drawdown") | (same) | (same) | (same) |
| Drawdown Amount | $1,000 | $2,000 | $3,000 | $4,500 |
| Minimum Balance at Start | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed |
| Daily Loss Limit | None (no toggle exists at this size — see Overview) | Off: none — On: $1,200 | Off: none — On: $1,800 | Off: none — On: $2,700 |
| Max Contracts | 2 mini / 20 micro | 4 mini / 40 micro | 6 mini / 60 micro | 10 mini / 100 micro |
| Consistency Rule | Unconfirmed for Evaluation — see Not Confirmed | Unconfirmed for Evaluation — see Not Confirmed | Unconfirmed for Evaluation — see Not Confirmed | Unconfirmed for Evaluation — see Not Confirmed |
| Minimum Trading Days | 1 ("Pass the evaluation in one trading day" — "LucidPro Evaluation Account") | 1 | 1 | 1 |
| News Trading | Allowed: "Allowed on Flex, Pro and Direct: Traders may enter or exit positions around scheduled or unscheduled news events on these plans without it being a breach" ("Other Trading Activities"). Trade at own risk; slippage/velocity-logic warning stated. | Allowed (same) | Allowed (same) | Allowed (same) |
| Inactivity Rule | 30 calendar days with no trade resulting in at least $1 net profit or loss — "Inactivity Policy" (firm-wide article, not LucidPro-specific, see Not Confirmed for scope) | (same) | (same) | (same) |
| One-Time Eval Fee | Unconfirmed (dollar price not stated in any source read for this file; see Not Confirmed) | Off: $192 — On: $172 (engine-sourced, not independently confirmed by this file's own sources — see Not Confirmed) | Unconfirmed | Unconfirmed |
| Reset Fee | Unconfirmed | Unconfirmed (engine models $120, not independently confirmed by this file's own sources) | Unconfirmed | Unconfirmed |

**No activation fee to upgrade a passed evaluation to a funded account** — "LucidPro Evaluation Account": "No activation fees to upgrade to funded account"; independently corroborated by "Simulated Account Fees": "There is no activation fee to upgrade a LucidPro Evaluation to a LucidPro Funded."

**Real-time activation:** a passed evaluation upgrades to a funded account within 5–30 minutes of hitting the profit target ("LucidPro Evaluation Account").

## Sim Funded

| Parameter | $25K | $50K | $100K | $150K |
| --- | --- | --- | --- | --- |
| Starting Balance | $0 — "LucidDirect Funded Account" and other Lucid funded-account articles describe funded accounts as building "simulated capital" from a base; not literally stated as "$0" for LucidPro specifically in the sources read for this file, but consistent with every other Lucid plan's confirmed $0 funded start — see Not Confirmed | $0 (same basis) | $0 (same basis) | $0 (same basis) |
| Drawdown Type | End-of-Day Drawdown (same confirmed mechanism as Evaluation — "LucidPro Drawdown") | (same) | (same) | (same) |
| Drawdown Amount | $1,000 | $2,000 | $3,000 | $4,500 |
| Drawdown Lock | Trigger: EOD closing balance exceeds the Initial Trail Balance — $26,100 (25K) / $52,100 (50K) / $103,100 (100K) / $154,600 (150K). Locked value: $25,100 / $50,100 / $100,100 / $150,100 — starting balance + $100. Both figures directly quoted from "LucidPro Drawdown"'s own table (this file's earlier draft inferred the locked value by analogy to LucidFlex before this dedicated article was located; now directly confirmed for LucidPro itself). |
| Minimum Balance (ongoing) | No separate figure — the MLL floor above (pre-lock: trailing; post-lock: the locked value) is the minimum balance by construction; an MLL breach is this firm's own stated account-failure condition ("If your account balance reached the MLL, your account will be breached" — "LucidPro Drawdown," stated identically across every Lucid plan's own drawdown article read for this tree). |
| Daily Loss Limit | None (no toggle at this size) | Off: none — On: $1,200 fixed, replaced by 60% of highest-ever EOD profit ("LucidScale DLL") once the account closes above the $52,100 Initial Trail Balance | Off: none — On: $1,800 fixed, then 60%-of-peak-profit LucidScale after $103,100 | Off: none — On: $2,700 fixed, then 60%-of-peak-profit LucidScale after $154,600 |
| Max Contracts | 2 mini / 20 micro | 4 mini / 40 micro | 6 mini / 60 micro | 10 mini / 100 micro |
| Consistency Rule | Unconfirmed as an ongoing Sim Funded trading-activity rule — see Not Confirmed for the separate, confirmed payout-request consistency figure | Unconfirmed (same caveat) | Unconfirmed (same caveat) | Unconfirmed (same caveat) |
| News Trading | Allowed: "Allowed on Flex, Pro and Direct: Traders may enter or exit positions around scheduled or unscheduled news events on these plans without it being a breach" ("Other Trading Activities"). Trade at own risk; slippage/velocity-logic warning stated. | Allowed (same) | Allowed (same) | Allowed (same) |
| Inactivity Rule | 30 calendar days, same firm-wide policy as Evaluation | (same) | (same) | (same) |
| Max Active/Concurrent Accounts | Up to 5 active funded accounts per household, shared across every Lucid funded-account type combined (LucidPro + LucidFlex + LucidDirect + LucidDaily) — "Maximum Number of Accounts": "Different types of funded accounts combined may not exceed 5 accounts total... If you have 3 LucidDirect accounts, you may only maintain 2 LucidPro funded accounts." |
| Profit Split | 90% trader / 10% Lucid Trading — "LucidPro Payouts": "All funded account payouts are split 90% to the trader and 10% to Lucid Trading." Accounts purchased or reset before November 28, 2025, 3:00 PM EST are grandfathered into 100% on the first $10,000 of payouts. |

## How the Drawdown Works

LucidPro's Max Loss Limit (MLL) uses an explicitly-confirmed End-of-Day Drawdown at both stages ("LucidPro Drawdown"): the system calculates the account's highest closing balance at the end of each session, and the MLL trails upward with it, maintaining a constant distance below the high-water mark equal to the drawdown amount for that tier.

Once the account's EOD closing balance exceeds the Initial Trail Balance (drawdown amount + $100 above starting balance), the MLL stops trailing and locks. This same threshold simultaneously converts the Daily Loss Limit (where enabled) from its fixed dollar figure to the LucidScale formula: 60% of the account's highest-ever single-day profit, a value that can only increase, never decrease, even if the account later draws down.

If the account's balance ever reaches the (trailing or locked) MLL, the account is breached and closed. This is a hard breach with no stated recovery path, distinct from a DLL hit, which only pauses trading until the next session ("soft breach... you do not lose your account for hitting DLL as long as the Max Loss Limit has not been reached" — "LucidPro Daily Loss Limit").

### Worked Example

This example uses the full nominal-balance convention for the $50,000 tier, DLL-ON variant: the account's real balance, starting at a literal $50,000, tracked throughout — never switching to a $0-based profit-only figure.

1. The funded account opens at $50,000. The $2,000 Max Loss Limit sets an initial floor of $50,000 − $2,000 = $48,000. The Daily Loss Limit starts fixed at $1,200.
2. The account has a profitable stretch and closes at a new EOD high of $51,500 (a new peak, but still below the $52,100 Initial Trail Balance). The MLL trails up to $51,500 − $2,000 = $49,500. The DLL is still the fixed $1,200 (balance has not yet crossed $52,100).
3. The account closes at a new EOD high of $52,100 exactly — the Initial Trail Balance. This is the lock trigger: the MLL stops trailing and locks at $50,100 (starting balance + $100), directly confirmed by "LucidPro Drawdown"'s own table. Simultaneously, the DLL switches from its fixed $1,200 to the LucidScale formula: 60% of the highest single-day profit reached so far. If the account's best single day contributed all $2,100 of profit to date, the new DLL would be $2,100 × 0.60 = $1,260 — using the source's own formula, applied to this example's own numbers, not a quoted example figure.
4. The account later closes at $54,000 (a new high). Per the source's own LucidScale example methodology, if this day's profit relative to the prior peak pushed the highest-single-day-profit figure to $4,000, the DLL would become $4,000 × 0.60 = $2,400 — matching the source's own worked figure for that exact input. The MLL, however, does not move again: it remains at the locked value of $50,100 regardless of this new high, since it already locked in step 3.
5. If the account's balance ever fell to $50,100 or below, it would breach the (locked) MLL and close, per this plan's own confirmed breach rule.

## Payouts

| Parameter | $25K | $50K | $100K | $150K |
| --- | --- | --- | --- | --- |
| Profit Split | 90% trader / 10% Lucid Trading (grandfathered 100%-on-first-$10K for pre-11/28/2025 accounts — see Sim Funded table) |
| Payout Frequency | No fixed payout window — a request may be made any day once all eligibility criteria are met ("LucidPro Payouts") |
| Buffer Requirement | $26,100 | $52,100 | $103,100 | $154,600 |
| Minimum Payout Request | $500 |
| Max Payout per Cycle | Payout 1: $1,000 / $2,000 / $2,500 / $3,000 (25K/50K/100K/150K). Payout 2+: $1,500 / $2,500 / $3,000 / $3,500. Figures directly quoted from "LucidPro Payouts"' own two tables — do not blend Payout-1 and Payout-2+ columns. |
| Consistency on Payouts | 40% for accounts purchased or reset on or after November 28, 2025, 3:00 PM EST: "Your largest single-day profit must be no more than 40% of your total profit during the payout cycle" ("LucidPro Payouts," independently confirmed by "LucidPro Consistency Percentage"). Resets after every approved payout. **Accounts purchased or reset before that date remain at the prior 35% figure** ("We adjusted the LucidPro funded consistency percentage from 35% to 40%... All accounts purchased or reset on or before still have 35% consistency," per "LucidPro Consistency Percentage"), the same cutoff date already used for this plan's profit-split grandfather clause below. |
| Maximum Total Payouts / Lifetime Cap | Unconfirmed — no source read for this file states a payout-count cap or a lifetime dollar cap for LucidPro specifically (contrast with LucidFlex's confirmed "up to 5 payouts... after which they will be moved live" — see flex.md; do not assume the same figure applies to LucidPro without its own citation) |

Also, per the source's own separate Minimum Profit Goal table (a prerequisite distinct from the Max Payout per Cycle ceiling above): $250 (25K) / $500 (50K) / $750 (100K) / $1,000 (150K) profit must be earned since the last payout before a request is even possible. This resets after every approved payout, the same Profit-Goal-vs-Payout-Amount distinction already documented for LucidDirect (see `direct.md`) and for `tradeify/lightning.md` at a different firm — do not conflate this eligibility gate with the separate Max Payout per Cycle ceiling on what can actually be withdrawn once eligible.

Payouts are approved and deducted from the account balance within a few minutes; funds are disbursed to the trader's payment method within 2 business days ("LucidPro Payouts").

## Live Transition

LucidPro funded accounts transition into the shared **LucidLive** program at Lucid's discretion, documented in full in [`live.md`](live.md). In brief: a trader enters the "live review pool" after their final (Payout 5 — see Not Confirmed, since LucidPro's own payout-cap articles don't independently confirm a 5-payout ceiling) payout, after being paid a significant lifetime amount, for exceptional sim-funded performance, or automatically if previously moved live before; actual transition timing and selection is always at the Lucid risk team's discretion, not automatic upon meeting any single threshold ("New Live Structure"). Every LucidPro funded account that has received at least one payout is moved to its own live account, starting at $0 with an EOD drawdown, no Daily Loss Limit, and daily payout eligibility. LucidPro is eligible for the one-time Live Bonus described in `live.md` (not scoped away from LucidPro the way it is for LucidDaily).

## Not Confirmed By This Source

- **Starting Balance (Evaluation, all tiers)** — no source literally states an evaluation-stage "Starting Balance" for LucidPro. The dollar figures used are derived from each tier's own account-size label, the same convention already used elsewhere in this doc tree, not a directly-quoted statement.
- **Starting Balance (Sim Funded, all tiers)** — no LucidPro-specific source states "$0" explicitly; inferred by analogy to every other Lucid plan's confirmed $0 funded start. Flagged as an inference, not a LucidPro-specific quote.
- **Minimum Balance at Start (Evaluation)** — not stated in any source read for this file.
- **Consistency Rule (Evaluation stage, all tiers)** — not stated in the two LucidPro-specific articles read for this file. Only the payout-request consistency (40%, confirmed in the Payouts table) is sourced; do not assume the same 40% figure, or any figure, governs evaluation-stage passing.
- **One-Time Eval Fee and Reset Fee, 25K/100K/150K tiers** — no source read for this file states dollar pricing for any LucidPro tier. The 50K figures ($192 off-DLL / $172 on-DLL eval, $120 reset) come entirely from this repo's own engine (`LucidTrading.ts`), whose own inline notes describe live-verification against `lucidtrading.com`'s pricing-config JSON on 2026-09-14 — not independently re-confirmed by this file's own sources, since the site's homepage and support articles read for this file never display dollar prices. Treated as a lead worth citing, not a citation in its own right.
- **DLL toggle price premium** — this file's Overview states a toggle exists (confirmed via "LucidPro Funded Account"'s "(optional)" framing and "LucidPro Daily Loss Limit"'s explicit fixed-vs-none framing) but no LucidPro-specific source states the dollar cost difference between DLL ON and OFF. The engine's own $172/$192 pair (a $20 premium) is not independently confirmed here.
- **Maximum Total Payouts / Lifetime Cap, and the "Payout 5" live-eligibility reference** — "New Live Structure" (a shared, firm-wide LucidLive article, not LucidPro-specific) refers to "the final payout (Payout 5) on their plan" as one live-eligibility trigger, implying a 5-payout structure firm-wide — but LucidPro's own two payout articles never state this cap themselves, unlike LucidFlex's own dedicated payout article, which does. Do not treat "5" as a LucidPro-confirmed figure; see `live.md` for the shared-article-level statement.
- **Sim Funded Consistency Rule as an ongoing trading-activity requirement, distinct from the payout-request consistency** — not stated anywhere as a separate concept. Do not assume one exists beyond the confirmed 40% payout-cycle rule.

---

**Last Updated:** 2026-09-18

**Sources:**

- `https://support.lucidtrading.com/en/articles/12890029-lucidpro-evaluation-account` — "LucidPro Evaluation Account." Fetched directly via raw HTTP, 2026-09-18. Article states "Updated over 3 weeks ago" (relative to an unknown fetch reference date, exact calendar date not shown).
- `https://support.lucidtrading.com/en/articles/12890069-lucidpro-funded-account` — "LucidPro Funded Account." Fetched directly, 2026-09-18. Same relative-update caveat.
- `https://support.lucidtrading.com/en/articles/12890122-lucidpro-daily-loss-limit` — "LucidPro Daily Loss Limit." Fetched directly, 2026-09-18. Article states "July 26, 2026."
- `https://support.lucidtrading.com/en/articles/12890136-lucidpro-drawdown` — "LucidPro Drawdown." Fetched directly, 2026-09-18. "Updated over 3 weeks ago." Source of the confirmed End-of-Day drawdown type (both stages) and the directly-quoted Drawdown Lock table — resolves what an earlier draft of this file had inferred by analogy to LucidFlex before this article was located.
- `https://support.lucidtrading.com/en/articles/12890092-lucidpro-payouts` — "LucidPro Payouts." Fetched directly, 2026-09-18. Article states "August 6, 2026."
- `https://support.lucidtrading.com/en/articles/11404617-maximum-number-of-accounts` — "Maximum Number of Accounts." Firm-wide article. Fetched directly, 2026-09-18.
- `https://support.lucidtrading.com/en/articles/11404632-inactivity-policy` — "Inactivity Policy." Firm-wide article. Fetched directly, 2026-09-18.
- `https://support.lucidtrading.com/en/articles/11404620-simulated-account-fees` — "Simulated Account Fees." Firm-wide article. Fetched directly, 2026-09-18.
- `https://support.lucidtrading.com/en/articles/11404729-allowed-trading-times` — "Allowed Trading Times." Firm-wide article, cited for LucidPro's session-close time in the general trading-hours context; not otherwise used in this file's own tables. Fetched directly, 2026-09-18.
- `https://support.lucidtrading.com/en/articles/11404728-other-trading-activities` — "Other Trading Activities." Firm-wide "Rules and Guidelines" article. Fetched directly, 2026-09-18. "Updated over 3 weeks ago." Source of the confirmed News Trading resolution for LucidPro (Allowed, both stages).
- `https://support.lucidtrading.com/en/articles/12890109-lucidpro-consistency-percentage` — "LucidPro Consistency Percentage." Fetched directly, 2026-09-18. "Updated over 3 weeks ago." Found via a full sitemap sweep after the user directly questioned whether earlier search-driven research had been exhaustive. Confirms the 40% payout-cycle consistency figure independently of "LucidPro Payouts," and is the source of the 35%-for-pre-11/28/2025-accounts grandfather clause, previously undocumented in this file.
- `https://support.lucidtrading.com/en/articles/16226068-lucidpro-customization` — "LucidPro Customization." Fetched directly, 2026-09-18. Dated August 6, 2026. Found via the same sitemap sweep. Independently corroborates the DLL toggle mechanic and the "cannot be changed for an active account" rule; does not state a dollar price premium, so that figure remains Unconfirmed.
- Cross-checked against `src/lib/prop-calculator/firms/lucid/LucidTrading.ts` (this repo's own engine) for the 50K tier's pricing figures and drawdown-lock formula, per the Not Confirmed notes above.
