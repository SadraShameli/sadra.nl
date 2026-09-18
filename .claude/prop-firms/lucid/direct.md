# LucidDirect

**Sources:** `https://support.lucidtrading.com/en/articles/12890148-luciddirect-funded-account` ("LucidDirect Funded Account," "Updated over 3 weeks ago"), `https://support.lucidtrading.com/en/articles/12890185-luciddirect-daily-loss-limit` ("LucidDirect Daily Loss Limit," same relative update), `https://support.lucidtrading.com/en/articles/12890164-luciddirect-payout-objectives` ("LucidDirect Payout Objectives," same relative update), `https://support.lucidtrading.com/en/articles/11404728-other-trading-activities` ("Other Trading Activities," "Updated over 3 weeks ago"), `https://support.lucidtrading.com/en/articles/12890178-luciddirect-consistency-percentage` ("LucidDirect Consistency Percentage," "Updated over 3 weeks ago"), plus the firm-wide articles cited in pro.md. All fetched directly via raw HTTP on 2026-09-18, none through an LLM summarization pass.

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

LucidDirect is Lucid's instant-funded product: "a simulated straight-to-funded account which does not have an evaluation phase. When you purchase a LucidDirect account, you start building simulated capital to earn payouts immediately" ("LucidDirect Funded Account"). It is offered in four sizes ($25K/$50K/$100K/$150K). **Its Max Loss Limit amounts at the 100K and 150K tiers genuinely differ from LucidPro's and LucidFlex's own 100K/150K figures** — $3,500 and $5,000 respectively, versus $3,000 and $4,500 for the evaluation-based plans. Do not treat LucidPro/LucidFlex's 100K/150K drawdown figures as applying here; they are different numbers for a structurally different product, confirmed independently by this file's own dedicated source.

LucidDirect has no purchasable DLL toggle the way LucidPro/LucidFlex/LucidDaily do — the $25,000 tier simply has no DLL at all, and the $50K/$100K/$150K tiers each have one fixed DLL figure with no "off" option mentioned anywhere in this file's own sources.

## Evaluation

| Parameter | Value |
| --- | --- |
| Starting Balance | N/A — LucidDirect has no evaluation phase |
| Profit Target | N/A — LucidDirect has no evaluation phase |
| Drawdown Type | N/A — LucidDirect has no evaluation phase |
| Drawdown Amount | N/A — LucidDirect has no evaluation phase |
| Minimum Balance at Start | N/A — LucidDirect has no evaluation phase |
| Daily Loss Limit | N/A — LucidDirect has no evaluation phase |
| Max Contracts | N/A — LucidDirect has no evaluation phase |
| Consistency Rule | N/A — LucidDirect has no evaluation phase |
| Minimum Trading Days | N/A — LucidDirect has no evaluation phase |
| News Trading | N/A — LucidDirect has no evaluation phase |
| Inactivity Rule | N/A — LucidDirect has no evaluation phase |
| One-Time Eval Fee | N/A (no "eval" fee as such) — the account's one-time purchase price is Unconfirmed for every tier by this file's own sources except 50K, which this repo's engine models at $515 (not independently confirmed here — see Not Confirmed) |
| Reset Fee | Genuinely ambiguous scope, not simply unstated — see Not Confirmed |

## Sim Funded

| Parameter | $25K | $50K | $100K | $150K |
| --- | --- | --- | --- | --- |
| Starting Balance | $0 (inferred by analogy to every other confirmed Lucid funded start; not literally quoted for LucidDirect — see Not Confirmed) | $0 (same basis) | $0 (same basis) | $0 (same basis) |
| Drawdown Type | End-of-Day Drawdown — "LucidDirect funded accounts use an End-of-Day Drawdown (EOD Drawdown) system to calculate the Max Loss Limit (MLL)" ("LucidDirect Drawdown") | (same) | (same) | (same) |
| Drawdown Amount | $1,000 | $2,000 | $3,500 | $5,000 |
| Drawdown Lock | Trigger: EOD closing balance exceeds the Initial Trail Balance — $26,100 (25K) / $52,100 (50K) / $103,600 (100K) / $155,100 (150K). Locked value: $25,100 / $50,100 / $100,100 / $150,100 — starting balance + $100. All figures directly quoted from "LucidDirect Drawdown"'s own table, including the 25K tier — a dedicated drawdown article, distinct from "LucidDirect Daily Loss Limit," confirms 25K has its own drawdown trail/lock even though it has no DLL at all; an earlier draft of this file wrongly conflated the two concepts and said no 25K trail balance existed anywhere, since the DLL article's own 25K row shows "None/None" — that row is specifically about the DLL-to-LucidScale switchover, not the drawdown lock, which is a separate mechanic confirmed independently for every tier including 25K. |
| Minimum Balance (ongoing) | No separate figure — the (trailing or locked) MLL floor is the minimum balance by construction, consistent with every other Lucid plan's confirmed breach-at-MLL rule. |
| Daily Loss Limit | None (no DLL exists at this tier) | $1,200 fixed, replaced by 60%-of-peak-profit LucidScale after $52,100 | $2,100 fixed, then 60%-of-peak-profit LucidScale after $103,600 | $3,000 fixed, then 60%-of-peak-profit LucidScale after $155,100 |
| Max Contracts | 2 mini / 20 micro | 4 mini / 40 micro | 6 mini / 60 micro | 10 mini / 100 micro |
| Consistency Rule | 20% on payout requests (see Payouts table) — no separate ongoing trading-activity rule confirmed | (same) | (same) | (same) |
| News Trading | Allowed: "Allowed on Flex, Pro and Direct: Traders may enter or exit positions around scheduled or unscheduled news events on these plans without it being a breach" ("Other Trading Activities"). Trade at own risk; slippage/velocity-logic warning stated. | Allowed (same) | Allowed (same) | Allowed (same) |
| Inactivity Rule | 30 calendar days, firm-wide policy | (same) | (same) | (same) |
| Max Active/Concurrent Accounts | Up to 5 active funded accounts per household, shared across every Lucid funded-account type combined — "Maximum Number of Accounts" explicitly uses a 3-LucidDirect / 2-LucidPro example to illustrate this exact shared pool. |
| Profit Split | 90% trader / 10% Lucid Trading |

No scaling plan — full contract size from the first trade ("No scaling plan, access to max contract size immediately" — "LucidDirect Funded Account Benefits").

## How the Drawdown Works

LucidDirect uses the same Max Loss Limit trail-then-lock mechanic confirmed across every other Lucid plan in this tree, with an explicitly-confirmed End-of-Day timing: the MLL trails the account's highest closing balance up to the Initial Trail Balance, then locks.

Reaching the (trailing or locked) MLL is a breach with no stated recovery. A DLL hit (where one exists — not at the 25K tier) is a soft breach, only pausing trading until the next session, per the same mechanism confirmed for LucidPro and LucidDirect's own dedicated DLL article.

### Worked Example

This example uses the full nominal-balance convention for the $50,000 tier: the account's real balance, starting at a literal $50,000 (LucidDirect has no evaluation to transition from — the account begins funded), tracked throughout.

1. The account opens at $50,000. The $2,000 Max Loss Limit sets an initial floor of $50,000 − $2,000 = $48,000. The DLL starts fixed at $1,200.
2. The account closes at a new EOD high of $51,000 (still below the $52,100 Initial Trail Balance). The MLL trails up to $51,000 − $2,000 = $49,000. The DLL remains the fixed $1,200.
3. The account closes at a new EOD high of $52,100 exactly — the Initial Trail Balance. The MLL locks at $50,100 (starting balance + $100), directly confirmed by "LucidDirect Drawdown"'s own table. The DLL simultaneously switches to the LucidScale formula (60% of highest single-day profit reached).
4. The account later closes at $56,000 (a new high). The MLL does not move again — it stays at $50,100 regardless of this new high.
5. If the account's balance ever fell to $50,100 or below, it would breach the (locked) MLL and close.

## Payouts

| Parameter | $25K | $50K | $100K | $150K |
| --- | --- | --- | --- | --- |
| Profit Split | 90% trader / 10% Lucid Trading |
| Payout Frequency | No fixed payout window — request any day once eligible ("LucidDirect Payout Objectives") |
| Buffer Requirement | Unconfirmed as a distinct figure — LucidDirect's own payout article frames eligibility around a "Payout Profit Goal," not a stated buffer-balance concept the way LucidPro/LucidDaily use that specific term. Do not assume the Drawdown Lock table's Initial Trail Balance figures also function as a payout buffer without a direct citation — see Not Confirmed. |
| Minimum Payout Request | $500 |
| Max Payout per Cycle | Payouts 1–3: $1,000 (25K) / $2,000 (50K) / $2,500 (100K) / $3,000 (150K). Payouts 4–5: $1,000 / $2,500 / $3,000 / $3,500. Directly quoted from "LucidDirect Payout Objectives"' own two-column table — note the 25K tier does not increase between the two payout bands, unlike the other three sizes. |
| Consistency on Payouts | 20% — "Your largest single-day profit must be no more than 20% of your total profit during the payout cycle" ("LucidDirect Payout Objectives," independently confirmed by "LucidDirect Consistency Percentage," which states no separate grandfather clause the way LucidPro's own consistency article does). Resets after every approved payout. Notably stricter than LucidPro's 40% payout-cycle consistency figure — do not blend the two plans' numbers. |
| Maximum Total Payouts / Lifetime Cap | Unconfirmed — no source read for this file states a payout-count cap for LucidDirect specifically. The Max Payout per Cycle table's own "Payouts 4–5" framing implies at least 5 payout cycles exist in the structure as documented, consistent with the shared `live.md` article's general "Payout 5" reference, but no source explicitly caps LucidDirect at 5 the way LucidFlex's own dedicated article does — treat as a weaker inference than LucidFlex's directly-confirmed figure. |

Also, per the source's own separate Payout Profit Goal table (a prerequisite distinct from the Max Payout ceiling above): Profit Goal 1: $1,500 / $3,000 / $6,000 / $9,000 (25K/50K/100K/150K); Profit Goal 2+: $1,250 / $2,500 / $3,500 / $4,500. This profit goal is what must be *earned* to unlock a request; the Max Payout per Cycle table above is the separate ceiling on what can actually be *withdrawn* once eligible — do not conflate the two, matching this tree's established convention (see `tradeify/lightning.md` for an identical Profit-Goal-vs-Payout-Amount distinction at a different firm).

Payouts are deducted within a few minutes of approval; funds are disbursed within 2 business days.

## Live Transition

LucidDirect funded accounts transition into the shared **LucidLive** program at Lucid's discretion, documented in full in [`live.md`](live.md). Every LucidDirect funded account with at least one payout is moved to its own live account on transition, starting at $0 with an EOD drawdown, no Daily Loss Limit, and daily payout eligibility. LucidDirect is eligible for the one-time Live Bonus described in `live.md`.

## Not Confirmed By This Source

- **Starting Balance (Sim Funded, all tiers)** — no LucidDirect-specific source states "$0" explicitly; inferred by analogy to every other confirmed Lucid plan's $0 funded start.
- **One-Time Purchase Price, all tiers except 50K** — no source read for this file states a dollar price for 25K/100K/150K. The 50K figure ($515) comes entirely from this repo's own engine, not independently confirmed by this file's own sources.
- **Reset Fee / reset mechanism — genuinely ambiguous, not simply unstated.** "Simulated Account Fees" groups "LucidPro Evaluation and LucidDirect accounts" together as one-time-fee products and states "you will need to purchase a reset if you wish to restart your evaluation account" — but LucidDirect has no evaluation to restart. It is unclear whether this sentence's "reset" concept extends to a breached LucidDirect *funded* account (i.e., a discounted repurchase mechanism), or whether a breached LucidDirect account simply cannot be reset at all and must be repurchased at full price with no distinct "reset" product. The engine's own `reset: dollars(size.evalCost)` (same as the full purchase price) is an unsourced modeling default for this file's purposes, not a citation. Do not assume either interpretation without a LucidDirect-specific reset article.
- **Buffer Requirement** — LucidDirect's own payout article does not use the word "buffer" or clearly identify the Initial Trail Balance figures as a payout gate the way LucidPro's and LucidDaily's own articles do explicitly. Do not assume the drawdown-lock trigger balances also function as a payout buffer without a direct citation.
- **Maximum Total Payouts / Lifetime Cap** — not directly confirmed for LucidDirect specifically; see the Payouts table note on this point.
- **Consistency Rule as an ongoing Sim Funded trading-activity requirement, distinct from the 20% payout-cycle rule** — not stated anywhere as a separate concept.

---

**Last Updated:** 2026-09-18

**Sources:**

- `https://support.lucidtrading.com/en/articles/12890148-luciddirect-funded-account` — "LucidDirect Funded Account." Fetched directly, 2026-09-18. "Updated over 3 weeks ago."
- `https://support.lucidtrading.com/en/articles/12890185-luciddirect-daily-loss-limit` — "LucidDirect Daily Loss Limit." Fetched directly, 2026-09-18. Same relative-update caveat.
- `https://support.lucidtrading.com/en/articles/12890192-luciddirect-drawdown` — "LucidDirect Drawdown." Fetched directly, 2026-09-18. Same relative-update caveat. Source of the confirmed End-of-Day drawdown type and the directly-quoted Drawdown Lock table, including the 25K tier's trail/lock figures (distinct from, and not stated in, the DLL article).
- `https://support.lucidtrading.com/en/articles/12890164-luciddirect-payout-objectives` — "LucidDirect Payout Objectives." Fetched directly, 2026-09-18. Same relative-update caveat.
- `https://support.lucidtrading.com/en/articles/11404728-other-trading-activities` — "Other Trading Activities." Firm-wide "Rules and Guidelines" article. Fetched directly, 2026-09-18. "Updated over 3 weeks ago." Source of the confirmed News Trading resolution for LucidDirect (Allowed, Sim Funded).
- `https://support.lucidtrading.com/en/articles/12890178-luciddirect-consistency-percentage` — "LucidDirect Consistency Percentage." Fetched directly, 2026-09-18. "Updated over 3 weeks ago." Found via a full sitemap sweep after the user directly questioned whether earlier search-driven research had been exhaustive. Independently confirms the 20% payout-cycle consistency figure; states no grandfather clause, unlike the equivalent LucidPro article.
- Firm-wide articles: Maximum Number of Accounts, Inactivity Policy, Simulated Account Fees (see `pro.md`'s Sources for full citations, reused here, not re-fetched separately).
- Cross-checked against `src/lib/prop-calculator/firms/lucid/LucidTrading.ts` for the 50K tier's price and drawdown-lock formula, per the Not Confirmed notes above.
