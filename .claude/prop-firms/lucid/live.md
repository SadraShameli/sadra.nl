# LucidLive

**Sources:** `https://support.lucidtrading.com/en/articles/13425130-new-live-structure` ("New Live Structure," "Updated over 3 weeks ago"), `https://support.lucidtrading.com/en/articles/11404729-allowed-trading-times` ("Allowed Trading Times," same relative update), `https://support.lucidtrading.com/en/articles/15245873-new-live-scaling-plan` ("New Live Scaling Plan," dated May 26, 2026), plus the three plans' own "Live (Legacy)" articles (LucidPro, LucidFlex, LucidDirect) for the superseded-structure note only. All fetched directly via raw HTTP, none through an LLM summarization pass. LucidDaily's own confirmed deviations from this base structure are documented in `daily.md`'s own Live Transition section, not repeated here.

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

LucidLive is Lucid's shared live-account program: LucidPro, LucidFlex, LucidDirect, and LucidDaily funded accounts all transition into it at the Lucid risk team's sole discretion. It is not purchased directly — there is no evaluation stage or Sim Funded stage of its own; a trader arrives here only via a promotion from one of the four funded-account files in this tree. This file documents the base structure shared by LucidPro/LucidFlex/LucidDirect. **LucidDaily's transition into this same program differs in several confirmed, material ways** (a different entry trigger, a capped sim-profit payout on transition, different timing, and no Live Bonus eligibility) — see `daily.md`'s own Live Transition section for those deviations rather than assuming this file's figures apply unmodified to LucidDaily-sourced live accounts.

## Live Account

| Parameter | $25K | $50K | $100K | $150K |
| --- | --- | --- | --- | --- |
| Starting Balance | $0 | $0 | $0 | $0 |
| Drawdown Type | End-of-Day Drawdown — "Lucid Live accounts use an End-of-Day Drawdown (EOD Drawdown) system to calculate the Max Loss Limit (MLL)" ("New Live Structure") |
| Drawdown Amount (Starting Live Drawdown) | $1,000 | $2,000 | $3,000 | $4,500 |
| Drawdown Lock | Trigger: the account generates live profit equal to its own Starting Live Drawdown (i.e. $1,000/$2,000/$3,000/$4,500 profit for the respective tier), **or** the trader requests a live payout before reaching that profit level — either path locks the MLL immediately. Locked value: a flat **$100** for every tier — "the Max Loss Limit locks at $100 and no longer moves" ("New Live Structure"). This is the same starting-balance-plus-$100 formula used identically across every Sim Funded Lucid plan in this tree, expressed against a literal $0 starting balance rather than a five- or six-figure one — do not read "$100" as somehow a different or smaller mechanic; it is the same LOCK_OFFSET pattern, just against a $0 base. |
| Daily Loss Limit | None — "No daily loss limit" ("New Live Structure") |
| Max Contracts | Scaling, tied to live profit and exchange group, not flat, see Live Contract Scaling Plan below | (same, own column) | (same, own column) | (same, own column) |
| Consistency Rule | None — "There are no consistency requirements for live accounts. Once promoted from sim-funded to live, consistency rules no longer apply regardless of your account type" ("New Live Structure") |
| Max Active/Concurrent Accounts | Up to 5 active LucidLive accounts per household — "Maximum Number of Accounts." One live account is issued per eligible (≥1 payout) funded account being transitioned, up to that 5-account household ceiling. |
| Profit Split | 90% trader / 10% Lucid Trading (same firm-wide default confirmed for every Sim Funded stage) |

Certain especially volatile contracts carry reduced position sizing to keep traders from exceeding the live drawdown even at the stated Max Contracts figure ("New Live Structure"), consistent with the exchange-group split confirmed by the dedicated scaling table below.

**Trading hours (LucidLive-specific, differs from the Sim Funded stages):** swing trading is not permitted. Positions must be closed by 4:45 PM EST on Tradovate-routed live accounts, or 4:15 PM EST on Rithmic-routed live accounts. An optional auto-liquidate setting, configured during LucidLive onboarding, can close positions automatically ahead of those times ("Allowed Trading Times").

## Live Contract Scaling Plan

**A genuine correction, found only via a full sitemap sweep of the help center rather than targeted search:** LucidLive's own dedicated "New Live Scaling Plan" article was never located by this tree's earlier, search-driven research passes, which had instead carried the Sim Funded stage's flat per-tier contract limits straight into this file's Live Account table as if they applied unchanged. They do not. Live-account contract limits scale with live profit, recalculated at the end of each trading day, "in direct correlation" with profit moving up or down, not fixed at a flat per-tier number the way the table above previously stated.

Limits also differ by **exchange group**, not just by profit tier: CME, CBOT, and NYMEX share one scaling curve at every account size except at the very top of the $150K tier, where they diverge from each other; COMEX (metals) is consistently more conservative than the others at every tier. Do not assume CME/CBOT/NYMEX always move in lockstep, since the top two $150K rows are the one place in this table where they do not.

| Live Account Size | Profit Range | CME | CBOT | NYMEX | COMEX |
| --- | --- | --- | --- | --- | --- |
| $25,000 | $0–$1,999.99 | 1 mini / 10 micro | 1 mini / 10 micro | 1 mini / 10 micro | 0 mini / 5 micro |
| $25,000 | $2,000+ | 2 mini / 20 micro | 2 mini / 20 micro | 2 mini / 20 micro | 1 mini / 10 micro |
| $50,000 | $0–$1,999.99 | 2 mini / 20 micro | 2 mini / 20 micro | 2 mini / 20 micro | 1 mini / 10 micro |
| $50,000 | $2,000–$3,999 | 3 mini / 30 micro | 3 mini / 30 micro | 3 mini / 30 micro | 1 mini / 15 micro |
| $50,000 | $4,000+ | 4 mini / 40 micro | 4 mini / 40 micro | 4 mini / 40 micro | 2 mini / 20 micro |
| $100,000 | $0–$1,999.99 | 3 mini / 30 micro | 3 mini / 30 micro | 3 mini / 30 micro | 1 mini / 15 micro |
| $100,000 | $2,000–$3,999 | 4 mini / 40 micro | 4 mini / 40 micro | 4 mini / 40 micro | 2 mini / 20 micro |
| $100,000 | $4,000–$5,999 | 5 mini / 50 micro | 5 mini / 50 micro | 5 mini / 50 micro | 2 mini / 25 micro |
| $100,000 | $6,000+ | 6 mini / 60 micro | 6 mini / 60 micro | 6 mini / 60 micro | 3 mini / 30 micro |
| $150,000 | $0–$1,999.99 | 4 mini / 40 micro | 4 mini / 40 micro | 4 mini / 40 micro | 2 mini / 20 micro |
| $150,000 | $2,000–$3,999 | 5 mini / 50 micro | 5 mini / 50 micro | 5 mini / 50 micro | 2 mini / 25 micro |
| $150,000 | $4,000–$5,999 | 6 mini / 60 micro | 6 mini / 60 micro | 6 mini / 60 micro | 3 mini / 30 micro |
| $150,000 | $6,000–$8,999 | 8 mini / 80 micro | 8 mini / 80 micro | 6 mini / 60 micro | 4 mini / 40 micro |
| $150,000 | $9,000+ | 10 mini / 100 micro | 8 mini / 80 micro | 6 mini / 60 micro | 5 mini / 50 micro |

Directly quoted, full table, from "New Live Scaling Plan." **Circumventing the scaling plan is monitored:** "Our back-end systems track for this. If we see repeated behavior attempting to get around the limits, we may review your account."

## Eligibility and Transition

A trader enters Lucid's "live review pool" when at least one of the following is met, for accounts other than LucidDaily (see `daily.md` for LucidDaily's own different trigger):

- After receiving the final payout (referred to as "Payout 5") on a funded plan,
- After being paid a significant amount of capital over their lifetime with Lucid,
- For exceptional sim-funded performance, or
- If the trader has previously been moved live before.

**Hitting a threshold is not a guarantee.** "Payout 5 represents the maximum payout level, not a guaranteed minimum for live eligibility. All live transitions occur at the discretion of the Lucid risk team" ("New Live Structure"). Neither LucidPro's, LucidDirect's, nor LucidDaily's own dedicated payout articles independently confirm a "Payout 5" ceiling the way LucidFlex's own article does explicitly (see `flex.md`) — this file's own source is the only one asserting the figure firm-wide; treat it as this article's own statement, not independently corroborated for every plan.

**On transition:** every eligible funded account (at least one payout received) is moved to its own separate live account, not pooled into one shared account. All eligible accounts move together, at once — "Do all funded prop accounts move live at once? Yes. All eligible funded prop accounts (with at least one payout) are moved when a trader transitions to live." Any funded account with zero payouts is closed instead, with its evaluation cost refunded: "If a funded account is not moved live because it has 0 payouts, the evaluation cost of that account will be refunded."

## Live Bonus

The first time a trader is moved live under this program — and only if they have never held a "Legacy Live" account — they may earn a one-time bonus, itself subject to the standard 90/10 profit split.

| Funded Account Size | Live Target (profit needed) | Live Bonus (gross, before split) |
| --- | --- | --- |
| $25,000 | $1,100 | $1,000 |
| $50,000 | $2,100 | $2,000 |
| $100,000 | $3,100 | $3,000 |
| $150,000 | $4,600 | $4,500 |

To earn it: finish a trading session with live profit at or above the account's Live Target. The bonus is paid per account, so a trader moved live with multiple accounts earns it on each one that hits its own target. Worked example from the source itself: five $50,000 accounts moved live together, each finishing a session at $2,100 in live profit, earns a $2,000 gross bonus per account — $10,000 total gross, or $9,000 to the trader after the 90/10 split.

**The bonus applies only to the first live transition.** Traders moved live a second or later time are not eligible for the bonus on that subsequent set of accounts. Traders holding **LucidMaxx** status are not eligible for the Live Bonus at all, regardless of how many times they've transitioned.

## Cooldown After a Live Breach

Standard cooldown after blowing a live account: 2 weeks, after which the trader may purchase a new evaluation. Traders who repeatedly blow live accounts through reckless behavior may face a longer cooldown at the risk team's discretion — no specific extended duration is stated.

## Other Confirmed Rules

- **Household exclusivity:** if one household member is trading live, no other household member may trade a simulated (evaluation or Sim Funded) account — "If I am live, can someone in my household still trade sim? No."
- **Hedging live accounts is absolutely prohibited**, by both Lucid and CME rules, with violations resulting in a permanent ban.
- **LucidMaxx status** is a separate, invite-only tier ("Select traders may eventually earn LucidMaxx status") granting a purchasable LucidMaxx evaluation with daily uncapped payouts and instant live capital. This file's own source explicitly defers full detail to a separate "LucidMaxx documentation" article, not read for this pass — see Documentation Scope in `README.md`. LucidMaxx traders are excluded from the Live Bonus described above.
- **A "Legacy" live-transition structure exists for LucidPro/LucidFlex/LucidDirect**, per each plan's own dedicated "Live (Legacy)" article, confirmed to apply only to "accounts purchased/reset on 2/27/26 and prior," with traders on such accounts able to choose between the legacy structure or the current one described in this file. The legacy structure differs materially, not just cosmetically: it triggers live transition on the *sixth* payout (not the fifth), caps how much simulated profit converts to live capital via a per-tier "Max Moved Live" table distinct from this file's own figures, and releases most of that capital through a separate Escrow mechanic (10 profitable live days + $10,000 live profit before release begins, then $5,000 released per additional $10,000 earned, reviewed weekly) rather than crediting it all on day one. Not built out as its own section here, consistent with how this doc tree treats other superseded/legacy structures (e.g. LucidBlack); see each plan's own "Live (Legacy)" article if a specific pre-2/27/2026, un-reset account needs to be modeled.

## Not Confirmed By This Source

- **Exact extended-cooldown duration for repeat/reckless live breaches** — the source states this is discretionary and can exceed the standard 2 weeks, but gives no specific figure or formula.
- **Whether "Payout 5" is a literal, confirmed cap for LucidPro/LucidDirect specifically** — this file's own source states the "Payout 5" trigger firm-wide, but only LucidFlex's own dedicated payout article independently confirms a 5-payout structure for its own plan. LucidPro's and LucidDirect's own payout articles do not state this cap themselves — see each plan's own Not Confirmed section.
- **LucidMaxx's own full rule set** (pricing, eligibility criteria beyond "select traders," and its "daily uncapped payouts" mechanics) — explicitly out of scope for this file, deferred by the source itself to a separate, uncited article.
- **Whether the auto-liquidate risk-control option is on by default or must be actively enabled** — "Allowed Trading Times" describes it as available and configured during onboarding, but doesn't state a default state.

---

**Last Updated:** 2026-09-18

**Sources:**

- `https://support.lucidtrading.com/en/articles/13425130-new-live-structure` — "New Live Structure." Fetched directly, 2026-09-18. "Updated over 3 weeks ago." Primary source for every table and rule in this file except trading hours.
- `https://support.lucidtrading.com/en/articles/11404729-allowed-trading-times` — "Allowed Trading Times." Fetched directly, 2026-09-18. "Updated over 3 weeks ago." Source of the LucidLive-specific trading-hours paragraph only.
- `https://support.lucidtrading.com/en/articles/15245873-new-live-scaling-plan` — "New Live Scaling Plan." Fetched directly, 2026-09-18. Dated May 26, 2026. Found only via a full sitemap sweep of the help center, prompted by the user directly questioning whether prior search-driven research passes had been exhaustive; they had not. Source of the full Live Contract Scaling Plan table, correcting this file's previous flat Max Contracts row.
- `https://support.lucidtrading.com/en/articles/13432107-lucidpro-live-legacy`, `https://support.lucidtrading.com/en/articles/13424914-lucidflex-live-legacy`, `https://support.lucidtrading.com/en/articles/13425070-luciddirect-live-legacy` — "LucidPro/LucidFlex/LucidDirect Live (Legacy)." Fetched directly, 2026-09-18. Each confirms the same "accounts purchased/reset on 2/27/26 and prior" cutoff independently. Used only to confirm the legacy structure is genuinely superseded for current accounts, not built out in full (see Other Confirmed Rules).
