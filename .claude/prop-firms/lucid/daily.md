# LucidDaily

**Sources:** `https://support.lucidtrading.com/en/articles/15996664-luciddaily-evaluation` ("LucidDaily Evaluation," dated July 31, 2026), `https://support.lucidtrading.com/en/articles/15997244-luciddaily-funded-account` ("LucidDaily Funded Account," dated August 7, 2026), `https://support.lucidtrading.com/en/articles/15998425-luciddaily-drawdown` ("LucidDaily Drawdown," dated July 27, 2026), `https://support.lucidtrading.com/en/articles/16033858-luciddaily-customization` ("LucidDaily Customization," dated July 27, 2026), `https://support.lucidtrading.com/en/articles/16085900-luciddaily-daily-loss-limit` ("LucidDaily Daily Loss Limit," "Updated over a month ago"), `https://support.lucidtrading.com/en/articles/15997266-luciddaily-payouts` ("LucidDaily Payouts," dated July 27, 2026), `https://support.lucidtrading.com/en/articles/16010520-luciddaily-live` ("LucidDaily Live," dated July 27, 2026), `https://support.lucidtrading.com/en/articles/11404728-other-trading-activities` ("Other Trading Activities," "Updated over 3 weeks ago"), `https://support.lucidtrading.com/en/articles/15998336-luciddaily-consistency` ("LucidDaily Consistency," dated July 27, 2026), plus the firm-wide articles cited in pro.md. All fetched directly via raw HTTP on 2026-09-18, none through an LLM summarization pass.

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

LucidDaily is offered in four sizes ($25K/$50K/$100K/$150K) with **two independent purchasable toggles at checkout**, confirmed explicitly by "LucidDaily Customization": Daily Loss Limit (ON/OFF) and Evaluation Drawdown Type (End-of-Day/Intraday) — "These settings create four unique LucidDaily account configurations." **Critically, the Evaluation Drawdown toggle affects the evaluation stage only** — "Regardless of your selection, all LucidDaily Funded accounts use an Intraday Drawdown" (stated identically in both "LucidDaily Drawdown" and "LucidDaily Customization"). This is a genuine, confirmed disagreement with this repo's own engine, which currently models the EOD-selected variants (`LucidVariant.DailyEod`/`DailyEodDll`) using the same `EodTrailingDrawdown` for both the evaluation and funded stages, via a single `drawdown` field with no funded-stage override — see Not Confirmed.

This file therefore documents LucidDaily as one plan family with a 2×2 configuration matrix, rather than splitting into separate EOD/Intraday files: since the funded stage, payouts, and live-transition mechanics are all identical regardless of which evaluation-drawdown option was purchased, a file split would duplicate nearly everything and differ only in one Evaluation-table row.

LucidDaily's other defining features: no consistency rule at any stage once evaluation is passed, a hard-breach restriction on trading high-impact USD news, and a distinctive "Maximum Daily Profit" mechanic that automatically triggers a live-transition review if hit in a single day, replacing the per-request payout cap structure every other Lucid plan uses.

## Evaluation

| Parameter | $25K | $50K | $100K | $150K |
| --- | --- | --- | --- | --- |
| Starting Balance | $25,000 (derived from tier label, see Not Confirmed) | $50,000 (derived from tier label, see Not Confirmed) | $100,000 (derived from tier label, see Not Confirmed) | $150,000 (derived from tier label, see Not Confirmed) |
| Profit Target | $1,250 | $3,000 | $6,000 | $9,000 |
| Drawdown Type | Purchaser's choice: End-of-Day or Intraday ("LucidDaily Customization") — this row alone differs by configuration; every other row on this page is identical across all four configurations | (same choice) | (same choice) | (same choice) |
| Drawdown Amount | $1,000 | $2,000 | $3,000 | $4,500 |
| Minimum Balance at Start | Unconfirmed | Unconfirmed | Unconfirmed | Unconfirmed |
| Daily Loss Limit | Off: none — On: $600 | Off: none — On: $1,200 | Off: none — On: $1,800 | Off: none — On: $2,700 |
| Max Contracts | 2 mini / 20 micro | 4 mini / 40 micro | 6 mini / 60 micro | 10 mini / 100 micro |
| Consistency Rule | 50% or less: "Largest Single Day Profit / Account Profit" must not exceed 50% to be eligible to upgrade to funded ("LucidDaily Consistency," independently corroborated by "LucidDaily Evaluation"'s "cushion" mention). Confirmed evaluation-stage-only: "Once promoted to Live account status, the consistency requirement no longer applies" ("LucidDaily Consistency"). | (same) | (same) | (same) |
| Minimum Trading Days | Unconfirmed as a formal rule. "LucidDaily Consistency" gives a worked example table of the cushion this built-in slack creates per tier: $650.00 (25K) / $1,560.00 (50K) / $3,120.00 (100K) / $4,680.00 (150K), against each tier's 50%-of-profit-target consistency figure ($625/$1,500/$3,000/$4,500). The source itself cautions this is "merely an example table based on hitting exactly 50% of your profit target," not a fixed dollar figure or a stated minimum-days rule, since the real cushion depends on a trader's actual biggest-day profit; do not treat the table above as a guaranteed pass-in-two-days threshold. | (same) | (same) | (same) |
| News Trading | **Not permitted** — "Other Trading Activities" states the restriction at the plan level, not scoped to the funded stage: "Not allowed on Daily / Trading red folder news on the LucidDaily is a hard breach," and the article's own meta-description frames its scope as covering "evaluation and funded futures accounts." The detailed enforcement mechanic (the 1-minute-before/after flat requirement quoted in the Sim Funded row) is spelled out only in "LucidDaily Funded Account," which does not itself address Evaluation, so treat the restriction itself as plan-wide-confirmed but the exact evaluation-stage enforcement mechanic as not independently spelled out. | (same) | (same) | (same) |
| Inactivity Rule | 30 calendar days, firm-wide policy | (same) | (same) | (same) |
| One-Time Eval Fee | Unconfirmed for any of the four configurations at any tier by this file's own sources. The engine models 50K DLL-ON at $165 (EOD)/$136 (Intraday) and DLL-OFF at $185/$156, not independently confirmed here — see Not Confirmed. | | | |
| Reset Fee | Unconfirmed | Unconfirmed (engine models $115 EOD / $95 Intraday, not independently confirmed) | Unconfirmed | Unconfirmed |

**Once selected, neither toggle can be changed for an active account** — a new LucidDaily account must be purchased for a different configuration ("LucidDaily Customization"). **No activation fee** to upgrade to funded, **real-time activation** within 5–30 minutes of hitting the profit target (both "LucidDaily Evaluation Account Benefits").

## Sim Funded

| Parameter | $25K | $50K | $100K | $150K |
| --- | --- | --- | --- | --- |
| Starting Balance | $0 (inferred by analogy to every other confirmed Lucid funded start; not literally quoted for LucidDaily — see Not Confirmed) | $0 (same basis) | $0 (same basis) | $0 (same basis) |
| Drawdown Type | Intraday — always, regardless of the evaluation-stage toggle: "all LucidDaily Funded accounts use an Intraday Drawdown" ("LucidDaily Drawdown," "LucidDaily Customization") | (same) | (same) | (same) |
| Drawdown Amount | $1,000 | $2,000 | $3,000 | $4,500 |
| Drawdown Lock | Trigger: EOD closing balance exceeds the Initial Trail Balance — $26,100 / $52,100 / $103,100 / $154,600 for 25K/50K/100K/150K. Locked value: $25,100 / $50,100 / $100,100 / $150,100 — starting balance + $100. Both figures directly quoted from "LucidDaily Drawdown"'s own table. |
| Minimum Balance (ongoing) | No separate figure — the (trailing or locked) MLL floor is the minimum balance by construction, consistent with every other Lucid plan's confirmed breach-at-MLL rule. |
| Daily Loss Limit | Off: none — On: $600, fixed | Off: none — On: $1,200, fixed | Off: none — On: $1,800, fixed | Off: none — On: $2,700, fixed |
| Max Contracts | 2 mini / 20 micro | 4 mini / 40 micro | 6 mini / 60 micro | 10 mini / 100 micro |
| Consistency Rule | None — "There is no Consistency Percentage on LucidDaily funded accounts" ("LucidDaily Funded Account") | (same) | (same) | (same) |
| News Trading | **Not permitted, hard breach** — trading US high-impact ("red folder") news is prohibited: "You must be flat from 1 minute before through 1 minute after the news event. You may not hold or open new positions through that window. Your funded account will be breached" if both Impact = High and Currency = USD ("LucidDaily Funded Account"). Independently corroborated at the plan level by "Other Trading Activities": "Not allowed on Daily / Trading red folder news on the LucidDaily is a hard breach." The only Lucid plan in this tree with a confirmed news-trading restriction, contrasting with Flex/Pro/Direct, which "Other Trading Activities" confirms are all Allowed. | (same) | (same) | (same) |
| Inactivity Rule | 30 calendar days, firm-wide policy | (same) | (same) | (same) |
| Max Active/Concurrent Accounts | Up to 5 active funded accounts per household, shared across every Lucid funded-account type combined — "Maximum Number of Accounts" |
| Profit Split | 90% trader / 10% Lucid Trading |

## How the Drawdown Works

The evaluation stage uses whichever drawdown type was purchased (End-of-Day or Intraday); the funded stage always uses Intraday regardless. Both confirmed timing types share the same underlying trail-then-lock mechanic as every other Lucid plan: the MLL trails the account's highest balance (measured continuously for Intraday, only at session close for EOD) up to the Initial Trail Balance, then locks permanently at starting balance + $100.

**LucidDaily's DLL, where enabled, never converts to a LucidScale formula** — unlike LucidPro's and LucidDirect's own DLL, which switches from a fixed dollar amount to 60%-of-peak-profit once the account crosses its trail balance, "LucidDaily Funded accounts use the same Fixed DLL values used in the evaluation" ("LucidDaily Daily Loss Limit") — the DLL stays at its fixed dollar figure permanently, with no scaling mechanism at any point. This is a genuine, confirmed structural difference from LucidPro/LucidDirect, not an oversight in this file.

The same source also clarifies the DLL-vs-MLL interaction precisely: "The DLL remains fixed throughout the trading session and does not trail upward with the Max Loss Limit (MLL). If the MLL trails above the DLL during the session, the MLL becomes the more restrictive threshold. Reaching the MLL at that point will result in a hard breach" — i.e. once the (rising) MLL floor is closer to the current balance than the (fixed) DLL distance, the MLL is what actually stops the trader first, and doing so is the harder, unrecoverable breach.

Reaching the (trailing or locked) MLL is a breach with no stated recovery. A DLL hit (where enabled) is a soft breach, pausing trading only until the next session — unless superseded by the MLL first, per the paragraph above.

### Worked Example

This example uses the full nominal-balance convention for the $50,000 tier, funded stage (always Intraday regardless of which evaluation configuration was purchased): the account's real balance, starting at a literal $50,000, tracked throughout.

1. The funded account opens at $50,000. The $2,000 Max Loss Limit sets an initial floor of $50,000 − $2,000 = $48,000.
2. Because the funded stage is Intraday, the MLL is measured continuously, not just at session close. Mid-session, the account's real-time P&L reaches a new peak of $51,600 (still below the $52,100 Initial Trail Balance). The MLL trails up, in real time, to $51,600 − $2,000 = $49,600.
3. The account reaches a new peak of $52,100 exactly — the Initial Trail Balance — at some point during a trading session. The MLL locks at $50,100 (starting balance + $100), directly confirmed by this plan's own source, and stops trailing, even though this trigger was reached intraday rather than only at a session close.
4. The account later reaches $55,000 (a new peak). The MLL does not move again — it stays fixed at $50,100.
5. If the account's real-time balance ever fell to $50,100 or below at any moment (not only at session close, since the funded stage is Intraday), it would breach the locked MLL and close immediately.

## Payouts

LucidDaily's payout structure differs from every other Lucid plan in this tree: there is no per-request payout cap. Instead, a **Maximum Daily Profit** ceiling exists — reaching it in a single day automatically triggers live-transition review rather than capping a withdrawal.

| Parameter | $25K | $50K | $100K | $150K |
| --- | --- | --- | --- | --- |
| Profit Split | 90% trader / 10% Lucid Trading |
| Payout Frequency | No fixed payout window — request any day once eligible ("LucidDaily Payouts") |
| Buffer Requirement | $26,100 | $52,100 | $103,100 | $154,600 (identical dollar figures to the Drawdown Lock trigger, explicitly "equal to: Initial Max Loss Limit + $100," per "LucidDaily Payouts") |
| Minimum Payout Request | $500 |
| Max Payout per Cycle | No per-request cap stated — "the payout maximum is the amount of sim profits built above the buffer" ("LucidDaily Payouts"), i.e. bounded only by however much profit exists above the buffer, not a separate fixed dollar ceiling the way every other Lucid plan has. |
| Consistency on Payouts | None — no percentage rule; instead, positive net profit (even $1) since the last payout is required ("LucidDaily Payouts") |
| Maximum Total Payouts / Lifetime Cap | Not a payout-count cap — see Maximum Daily Profit below, a same-day dollar trigger, not a lifetime or per-cycle count |

**Maximum Daily Profit** (a distinctive LucidDaily-only mechanic): $6,000 (25K) / $8,000 (50K) / $10,000 (100K) / $12,000 (150K). "If you meet or exceed the daily amount you are automatically moved live" ("LucidDaily Payouts") — see Live Transition below for how this differs from every other Lucid plan's payout-count-based trigger.

Payouts are deducted within a few minutes of approval; funds are disbursed within 2 business days.

## Live Transition

LucidDaily's live-transition mechanics differ materially from LucidPro/LucidFlex/LucidDirect's shared structure, documented in `live.md` — this section states LucidDaily's own confirmed deviations rather than deferring entirely to that shared file.

**Trigger:** a trader enters the live review pool upon hitting the tier's Maximum Daily Profit in a single day (in place of the "final payout" trigger used by the other three plans), after being paid a significant lifetime amount, for exceptional sim-funded performance, or automatically if previously moved live before. All transitions remain at the Lucid risk team's sole discretion — hitting the threshold is not a guarantee ("LucidDaily Live").

**Sim profit handling on transition (LucidDaily-specific, differs from every other Lucid plan):** the funded account's buffer balance is used to fund the starting live drawdown and may not be withdrawn. Sim profit *above* the buffer may be paid out once KYC with the broker partner is complete, but is capped at a flat **$15,000 total** — "Whether you have one 25k account or five 150k accounts, the maximum sim profit paid out on the move to live is $15,000" ("LucidDaily Live"). This flat, non-scaling cap has no equivalent in the base `live.md` article for LucidPro/LucidFlex/LucidDirect.

**Timing:** traders are moved live every evening after the 6:00 PM EST session report, a process that "can take several hours." Positions are flattened and accounts paused at that point; if moved live mid-position, the prior day's closing balance (not the current session's P&L) is used as the amount transitioned, "to ensure every trader is treated equally" ("LucidDaily Live").

**No Live Bonus:** "There is no live bonus for traders that are moved live from a LucidDaily account" ("LucidDaily Live") — unlike LucidPro/LucidFlex/LucidDirect, which are eligible per `live.md`.

Every other live-transition mechanic (one live account per eligible funded account, $0 starting live balance, EOD live drawdown, no live DLL, no live consistency rule, 2-week standard cooldown after a live breach, LucidMaxx status) is identical to the base structure in `live.md`.

## Not Confirmed By This Source

- **Starting Balance (Evaluation and Sim Funded, all tiers)** — no source literally states a "Starting Balance" for LucidDaily at either stage. Evaluation figures are derived from each tier's own account-size label; the Sim Funded $0 figure is inferred by analogy to every other confirmed Lucid plan.
- **Minimum Balance at Start (Evaluation)** — not stated in any source read for this file.
- **Minimum Trading Days (Evaluation)**: not stated as a formal rule. "LucidDaily Consistency" gives a worked example cushion table (see Evaluation row), but explicitly frames it as an example dependent on a trader's actual biggest-day profit, not a fixed days-to-pass figure.
- **News Trading (Evaluation-stage enforcement mechanic)** — "Other Trading Activities" confirms the restriction itself applies plan-wide (not funded-only), but only "LucidDaily Funded Account" spells out the exact 1-minute-before/after hard-breach mechanic, and it does not itself address Evaluation. Do not assume the identical mechanic (vs., say, a fail-the-evaluation consequence or a different enforcement window) applies during Evaluation without a citation that says so directly.
- **One-Time Eval Fee and Reset Fee, all four configurations, all tiers** — no source read for this file states dollar pricing for any LucidDaily configuration or tier. The engine's own 50K figures are not independently confirmed here.
- **Engine disagreement — EOD-selected variants' funded-stage drawdown type.** This repo's engine (`buildDailyPlan` in `LucidTrading.ts`) sets a single `drawdown` field to `EodTrailingDrawdown` for the entire plan when `isIntraday: false`, with no separate `fundedDrawdown` override — meaning the engine currently models `LucidVariant.DailyEod`/`DailyEodDll` as EOD-trailing at *both* stages. This file's sources state unambiguously, in two independent articles, that the funded stage is *always* Intraday regardless of the evaluation-stage choice. This is a confirmed, not merely suspected, doc/engine disagreement — flagged per this skill's scope, not corrected in the engine as a side effect of this documentation pass.
- **Maximum Daily Profit as a same-day, real-time-monitored trigger vs. an EOD-measured one** — "LucidDaily Payouts" states the mechanic without specifying whether same-day sim profit is checked continuously (matching the funded stage's own Intraday drawdown measurement) or only at end-of-day. Not assumed either way.

---

**Last Updated:** 2026-09-18

**Sources:**

- `https://support.lucidtrading.com/en/articles/15996664-luciddaily-evaluation` — "LucidDaily Evaluation." Fetched directly, 2026-09-18. Dated July 31, 2026.
- `https://support.lucidtrading.com/en/articles/15997244-luciddaily-funded-account` — "LucidDaily Funded Account." Fetched directly, 2026-09-18. Dated August 7, 2026.
- `https://support.lucidtrading.com/en/articles/15998425-luciddaily-drawdown` — "LucidDaily Drawdown." Fetched directly, 2026-09-18. Dated July 27, 2026. Primary source for the confirmed always-Intraday-funded rule and the directly-quoted Drawdown Lock table.
- `https://support.lucidtrading.com/en/articles/16033858-luciddaily-customization` — "LucidDaily Customization." Fetched directly, 2026-09-18. Dated July 27, 2026. Independently corroborates the always-Intraday-funded rule.
- `https://support.lucidtrading.com/en/articles/16085900-luciddaily-daily-loss-limit` — "LucidDaily Daily Loss Limit." Fetched directly, 2026-09-18. "Updated over a month ago" — the least current of LucidDaily's own dedicated sources. Source of the confirmed DLL dollar amounts (fixed, never converting to LucidScale) and the MLL-vs-DLL interaction clarification.
- `https://support.lucidtrading.com/en/articles/15997266-luciddaily-payouts` — "LucidDaily Payouts." Fetched directly, 2026-09-18. Dated July 27, 2026.
- `https://support.lucidtrading.com/en/articles/16010520-luciddaily-live` — "LucidDaily Live." Fetched directly, 2026-09-18. Dated July 27, 2026.
- `https://support.lucidtrading.com/en/articles/11404728-other-trading-activities` — "Other Trading Activities." Firm-wide "Rules and Guidelines" article. Fetched directly, 2026-09-18. "Updated over 3 weeks ago." Corroborates the News Trading hard-breach restriction at the plan level and extends its scope to Evaluation (see Evaluation table row).
- `https://support.lucidtrading.com/en/articles/15998336-luciddaily-consistency` — "LucidDaily Consistency." Fetched directly, 2026-09-18. Dated July 27, 2026. Found via a full sitemap sweep after the user directly questioned whether earlier search-driven research had been exhaustive. Dedicated consistency article (upgrading the prior citation, which relied on a side-mention in "LucidDaily Evaluation"); source of the per-tier cushion example table.
- Firm-wide articles: Maximum Number of Accounts, Inactivity Policy (see `pro.md`'s Sources for full citations, reused here, not re-fetched separately).
- Cross-checked against `src/lib/prop-calculator/firms/lucid/LucidTrading.ts` for pricing figures and the drawdown-type disagreement flagged above.
