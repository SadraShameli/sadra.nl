# Topstep Labs

**Source:** https://help.topstep.com/en/articles/15520357-topstep-labs (updated 2026-09-18)

**Last Verified:** 2026-09-19
**Last Updated:** 2026-09-19

## Overview

Topstep Labs is an experimental product series where limited-availability drops test new account structures, pricing models, and trading mechanics. Each drop is heterogeneous: some are full three-phase pathways (Trading Combine → Express Funded Account → Live Funded Account), while others are fixed-payout Challenges with only two rounds (Challenge Round → Payout Round, then account closure). This file documents five drops by number (#001 through #005), one subsection per drop, each reusing CONVENTIONS.md's own field names (Starting Balance, Profit Target, Drawdown Type/Amount/Lock, Daily Loss Limit, Max Contracts, Consistency Rule, Profit Split, and so on) inside its own Evaluation/Sim Funded/Payouts tables. This deliberately deviates from CONVENTIONS.md's single-file, size-tiered-columns layout: the 5 drops are not 5 sizes of one plan, they are 5 unrelated products (two 3-phase evaluations, three 2-round fixed-payout Challenges with no funded or live stage at all), so a single 3-column table cannot represent them the way it represents standard.md's three account sizes. Drops #001 and #002 follow existing pathways but with distinct parameters; Drops #003, #004, and #005 introduce the Challenge mechanic and do not progress to a Live Funded Account. Every drop is limited-availability first-come-first-served.

## Drop #001: $25K Static Drawdown Trading Combine

A three-phase product with a single, defined new mechanic: a non-trailing (static) Maximum Loss Limit that locks in place and never moves, meaning your effective drawdown room grows as your account does, unlike Topstep's standard end-of-day trailing MLL. This is genuinely distinct from the EOD-trailing MLL documented in [standard.md](standard.md) and [consistency.md](consistency.md).

### Evaluation

| Parameter | Value |
| --- | --- |
| Buying Power | $25,000 |
| Profit Target | $2,000 |
| Drawdown Type | Maximum Loss Limit (MLL), static (non-trailing) |
| Drawdown Amount | $1,000 |
| Daily Loss Limit | Mandatory $500 |
| Max Contracts | 2 mini / 20 micro |
| Consistency Target | 55% |
| Funded Activation Fee | Free |
| One-Time Fee | $75 (90-day expiration) |
| Resets | Not available |

### Sim Funded

| Parameter | Value |
| --- | --- |
| Path | Choose Standard or Consistency (at XFA activation) |
| Starting Balance | $0 literal (buying power $25,000) |
| Drawdown Type | Maximum Loss Limit (MLL), static (non-trailing) |
| Drawdown Amount | $1,000 |
| Drawdown Lock | Trigger: none stated for the static mechanic (it does not trail, so there is no natural lock trigger to state). Locked value: $0, forced after the first Payout. Source: "After first Payout, MLL sets to $0." |
| Daily Loss Limit | Mandatory $500 |
| Max Contracts | 2 mini / 20 micro (no scaling) |
| Payout Cap | $4,000 |

### Live Funded Account

| Parameter | Value |
| --- | --- |
| Tier Size | $25,000 |
| Starting Balance | $5,000 minimum |
| Daily Loss Limit | Mandatory $500 |
| Max Contracts | 2 mini / 2 micro |

### How the Drawdown Works (Static MLL)

The static Maximum Loss Limit is the defining distinction of Drop #001. Unlike Topstep's standard end-of-day trailing MLL (documented in [standard.md](standard.md) and [consistency.md](consistency.md)), the static MLL is fixed in place and does not move. Once set, it is the absolute lowest point your balance is allowed to reach; it never trails upward with profits and never trails downward with losses.

Source example, verbatim: "a Trader starts with a $25,000 balance and a $1,000 Max Loss Limit, earns $1,000 in profit (balance hits $26,000), then loses $500 (balance ends at $25,500)."
- **End-of-Day (EOD) Trailing (standard Topstep):** MLL moves to $24,500. Next day effective room: $1,000.
- **Static (this Trading Combine):** MLL stays at $24,000. Next day effective room: $1,500.

The source frames this as the benefit: "With a $28,000 balance, the Trader has $4,000 of room — not $3,000." Your effective loss cushion expands with every net profit and contracts with every net loss, but the absolute floor is unchanging.

### Worked Example

Using the $25K tier, starting at a literal $25,000 nominal balance (matching the Trading Combine's own full account size convention).

1. Start: Balance $25,000. Static MLL floor: $24,000 (the starting balance minus the $1,000 MLL amount).
2. Day 1: +$500 profit. Balance $25,500. The MLL stays at $24,000 (does not move). Effective room above the floor: $25,500 − $24,000 = $1,500.
3. Day 2: +$1,500 profit. Balance $27,000. MLL still $24,000. Effective room: $27,000 − $24,000 = $3,000.
4. Total profit: $27,000 − $25,000 = $2,000, meeting the Profit Target.

Re-derived: $25,000 + $500 + $1,500 = $27,000. $27,000 − $25,000 = $2,000. Consistent.

### Payouts

Drop #001's own source states only the $4,000 Payout Cap in the Sim Funded table above. It does not itself state a Profit Split, Payout Eligibility day-count/consistency figure, Minimum Payout Request, or Max Payout per Cycle for either path. Because Drop #001 explicitly states the XFA path can be Standard or Consistency, the table below reproduces those figures from [standard.md](standard.md) and [consistency.md](consistency.md) instead, labeled as such, not as figures Drop #001's own source states:

| Parameter | Standard Path (from standard.md) | Consistency Path (from consistency.md) |
| --- | --- | --- |
| Profit Split | 90/10 | 90/10 |
| Payout Eligibility | 5 winning days of $150+ Net P&L | 3 trading days, 40% consistency target |
| Minimum Payout Request | $125 | $125 |
| Max Payout per Cycle | Not stated for Drop #001 (standard.md's own $2,000 figure is a $50K-XFA-size cap; Drop #001's own Payout Cap is the separately stated $4,000, above) | Not stated for Drop #001 (same caveat) |

**Cross-reference note:** These sibling-file figures are assumed to carry over unchanged once a Drop #001 XFA is activated, since the source ties Drop #001's XFA explicitly to the same Standard/Consistency path choice, but Drop #001's own article never restates them itself. See Not Confirmed below.

## Drop #002: $250K Freedom Funded Trading Combine

A three-phase product using the standard end-of-day trailing Maximum Loss Limit (matching [standard.md](standard.md) and [consistency.md](consistency.md)), not the static mechanic of Drop #001. Notably, the XFA path is **Standard only** (not Consistency), and the LFA transition is stated to "will follow our standard Live Funded Account Parameters and be treated as a $150K."

### Evaluation

| Parameter | Value |
| --- | --- |
| Buying Power | $250,000 |
| Profit Target | $15,000 |
| Drawdown Type | Maximum Loss Limit (MLL), EOD trailing |
| Drawdown Amount | $10,000 |
| Daily Loss Limit | Mandatory $5,000 |
| Max Contracts | 25 mini / 250 micro |
| Consistency Target | 55% |
| Funded Activation Fee | Free |
| One-Time Fee | $499 (90-day expiration) |
| Purchase Limit | Up to 5 accounts ("For the $250K Re-release, you may purchase up to 5 accounts") |
| Resets | Not available |

### Sim Funded

| Parameter | Value |
| --- | --- |
| Path | Standard (not Consistency) |
| Starting Balance | $0 literal (buying power $250,000) |
| Drawdown Type | Maximum Loss Limit (MLL), EOD trailing |
| Drawdown Amount | $10,000 |
| Drawdown Lock | Trigger: none independently stated for Drop #002 beyond "After first Payout, MLL sets to $0." Locked value: $0, forced on the first Payout. Whether a natural EOD-trailing lock trigger (analogous to standard.md's own "profit reaches the MLL amount" mechanic) also applies to Drop #002 is not stated by this source; do not assume it does without a citation. |
| Daily Loss Limit | Mandatory $5,000 |
| Max Contracts | 25 mini / 250 micro |
| Scaling Plan | Applies per balance (see table below) |
| Payout Cap | $25,000 |

#### Scaling Plan (Drop #002 XFA)

| Balance | Lots |
| --- | --- |
| Below $1,500 | 3 |
| $1,500 to $2,000 | 4 |
| $2,000 to $3,000 | 5 |
| $3,000 to $4,500 | 10 |
| $4,500 to $6,000 | 15 |
| $6,000 to $8,000 | 20 |
| Above $8,000 | 25 |

### Live Funded Account

| Parameter | Value |
| --- | --- |
| Tier Size | $150,000 |
| Starting Balance | $10,000 minimum |
| Daily Loss Limit | Mandatory $5,000 |
| Max Contracts | 15 mini |

**Cross-reference note:** The source states, verbatim: "once moved to a Live Funded Account, the Live Funded Account will follow our standard Live Funded Account Parameters and be treated as a $150K." This implies the LFA will follow the parameters documented in [live.md](live.md) for a $150K tier. The source does not repeat the complete LFA parameter set here; see [live.md](live.md) for the full mechanics of Reserve splits, Dynamic Live Risk Expansion, Daily Loss Limit Safeguard, auto-liquidation, and Payout eligibility.

## Drop #003: $3K Challenge

A two-round fixed-payout Challenge with no progression to Live. A trader purchases the Challenge, trades the Challenge Round to hit a $3,000 Profit Target, then activates (at no cost) the separate Payout Round, hits the same $3,000 target again, and receives a fixed $3,000 one-time payout. No 90/10 split; the full $3,000 is paid once, and the account closes.

### Challenge and Payout Rounds

| Parameter | Challenge Round | Payout Round |
| --- | --- | --- |
| Starting Balance | $0 | $0 |
| Profit Target | $3,000 | $3,000 |
| Drawdown Type | Maximum Loss Limit (MLL), static (non-trailing) | Maximum Loss Limit (MLL), static (non-trailing) |
| Drawdown Amount | $1,000 | $1,000 |
| Daily Loss Limit | None | None |
| Max Contracts | 10 micro / 1 mini | 10 micro / 1 mini |
| Consistency Target | None | None |
| Activation Fee | — | Free |
| Path | — | Standard only |
| Payout | Passing advances to Payout Round | Fixed $3,000, paid one time. No 90/10 split. Account closes. |
| Resets | None | None |
| Purchase Limit | No limit on Challenge Round | Max 5 active Payout-Round accounts at once (firm-wide, separate from XFA 5-account limit) |

### Restrictions and Mechanics

- **Restricted products:** Cannot trade MHG, MET, MBT, or SIL.
- **CPI restrictions:** Trading during CPI window restricted to 0 contracts.
- **MGC and MCL:** Limited to 6 micros.
- **Inactivity:** Account closes after 30 days with no trades.
- **Lifespan:** 90-day expiration.
- **Payout activation delay:** Up to 15 minutes from Challenge Round pass before Payout Round account is ready.

### Concurrent Account Notes

A trader can have unlimited Challenge Rounds active. Up to 5 Payout-Round Challenges can be active at once; this limit is **separate** from the firm-wide 5-active-XFA limit. A trader can simultaneously hold 5 XFAs and 10 Challenge accounts if desired, with only 5 of the 10 Challenges able to be in the Payout Round stage at any given time.

## Drop #004: $1.5K Challenge

A two-round fixed-payout Challenge. Similar structure to Drop #003 but with a $1,500 target, lower price ($39 vs. $49), and a strict per-trader purchase cap of 5 total accounts (not per-round, but lifetime cap across all $1.5K Challenges owned). Notably, **max contracts are 2 micro only, no minis allowed**.

### Challenge and Payout Rounds

| Parameter | Challenge Round | Payout Round |
| --- | --- | --- |
| Starting Balance | $0 | $0 |
| Profit Target | $1,500 | $1,500 |
| Drawdown Type | Maximum Loss Limit (MLL), static (non-trailing) | Maximum Loss Limit (MLL), static (non-trailing) |
| Drawdown Amount | $500 | $500 |
| Daily Loss Limit | None | None |
| Max Contracts | 2 micro (no minis) | 2 micro (no minis) |
| Consistency Target | None | None |
| Activation Fee | — | Free |
| Path | — | Standard only |
| Payout | Passing advances to Payout Round | Fixed $1,500, paid one time. No 90/10 split. Account closes. |
| Resets | None | None |
| Purchase Limit | No limit per round | Max 5 per Trader, total (including closed accounts; closed accounts count toward the 5, so if one closes you cannot replace it) |

### Restrictions and Mechanics

- **Restricted products:** Cannot trade MHG, MET, MBT, or SIL.
- **CPI restrictions:** Trading during CPI window restricted to 0 contracts.
- **MGC and MCL:** Limited to 1 contract.
- **Inactivity:** Account closes after 30 days with no trades.
- **Lifespan:** 90-day expiration.

### Concurrent Account Notes

Unlike Drop #003, there is a firm-wide cap on $1.5K Challenge ownership: a single trader can own a maximum of 5 $1.5K Challenge accounts across both Challenge and Payout Round combined. Once that limit is reached, no additional $1.5K Challenges can be purchased. Closed accounts still count toward the 5, preventing replacement. This cap is independent of the 5-active-Payout-Round-Challenge limit that applies to the Challenges collectively (a Payout-Round limit, not a purchase limit).

## Drop #005: $6K Challenge

A two-round fixed-payout Challenge. Higher payout ($6,000) and higher price ($149), with a $6,000 profit target and a $2,000 static drawdown. Like Drop #004, it has a per-trader purchase cap of 5 total accounts (closed accounts count), but unlike Drop #004, the contract restrictions are much tighter: mini-sized contracts on several products are outright prohibited, not just limited.

### Challenge and Payout Rounds

| Parameter | Challenge Round | Payout Round |
| --- | --- | --- |
| Starting Balance | $0 | $0 |
| Profit Target | $6,000 | $6,000 |
| Drawdown Type | Maximum Loss Limit (MLL), static (non-trailing) | Maximum Loss Limit (MLL), static (non-trailing) |
| Drawdown Amount | $2,000 | $2,000 |
| Daily Loss Limit | None | None |
| Max Contracts | 10 micro / 1 mini | 10 micro / 1 mini |
| Consistency Target | None | None |
| Activation Fee | — | Free |
| Path | — | Standard only |
| Payout | Passing advances to Payout Round | Fixed $6,000, paid one time. No 90/10 split. Account closes. |
| Resets | None | None |
| Purchase Limit | No limit per round | Max 5 per Trader, total (including closed accounts; closed accounts count, so if one closes you cannot replace it) |

### Restrictions and Mechanics

- **Restricted products (cannot trade):** MHG, SIL, HG, SL, CL, GC, HO, QM, PL, RB.
- **CPI restrictions:** Trading during CPI window restricted to 0 contracts.
- **MGC and MCL:** Limited to 6 micros.
- **Inactivity:** Account closes after 30 days with no trades.
- **Lifespan:** 90 days from purchase.
- **Drop-specific 10,000-unit limit:** 10,000 total units available, first come first serve for the entire drop (applies firm-wide, not per trader).

### Concurrent Account Notes

A single trader can own a maximum of 5 $6K Challenge accounts across both Challenge and Payout Round combined. Once purchased, closed accounts still count toward the 5, preventing replacement. This cap applies independently of the 5-active-Payout-Round-Challenge limit (the latter is firm-wide for all Challenges; the former is the per-trader purchase cap for $6K Challenges specifically).

## Risk Adjustments and Restricted Products

All Labs offerings are subject to temporary volatility-driven position-limit adjustments and permanent per-product restrictions detailed in Topstep's [Risk Adjustments: High Risk/High Volatility](https://help.topstep.com/en/articles/13613539-risk-adjustments-high-risk-high-volatility) article. That article lists Labs-specific restricted-product limits for each Drop. This file does not reproduce every restricted-symbol table; instead, each Drop section above names the products that cannot be traded on that Drop (if a full ban) or their contract limits (if a partial restriction).

## Refund Policy

Labs offerings are one-time purchases with no monthly rebills. The standard Topstep Refund Policies apply, as stated in the refund article (updated 2026-09-11): refunds are generally not available once a purchase is made, with limited exceptions. The 14-day satisfaction guarantee applies only to a trader's first-ever Trading Combine purchase (not Labs products by name).

## Not Confirmed By This Source

- **Profit Split, Payout Eligibility, and Minimum Payout Request for Drop #001 XFA** — Drop #001's own source states only the $4,000 Payout Cap; the 90/10 split, eligibility day-count/consistency figures, and $125 minimum request in the Payouts table above are carried over from [standard.md](standard.md) / [consistency.md](consistency.md), not independently confirmed by Drop #001's own article. Do not treat this file's own source as having independently confirmed those three rows.
- **Max Payout per Cycle for Drop #001 XFA** — neither Drop #001's own source nor the sibling files state a Max Payout per Cycle distinct from the already-confirmed $4,000 Payout Cap. Do not assume the $2,000/$3,000/$5,000 (Standard) or $3,000/$4,000/$6,000 (Consistency) size-tiered caps in standard.md/consistency.md apply on top of Drop #001's own flat $4,000 cap.
- **Scaling Plan formula "Account Balance" axis for Drop #002** — the Scaling Plan table above is read from the same chart image referenced in [standard.md](standard.md), stated to apply to the Drop #002 XFA by the source's own Scaling Plan section. The chart is keyed to "Account Balance," which for the standard $50K/$100K/$150K XFAs is numerically identical to profit (since they start at $0 balance). For the Drop #002 $250K account, the distinction is immaterial (it also starts at $0), but this source does not independently verify the axis label.
- **Challenge Rounds' account mechanics post-pass, before Payout Round activation** — the source states, "There may be up to a 15 minute delay from the moment you pass a Challenge Round before the Payout Round account is ready to be activated," and the Challenge Round account status is "passed," but does not clarify whether the Challenge Round account remains open, can be re-traded, is locked, or is visible in the dashboard during this window.
- **LFA mechanics for Drop #001 LFA and Drop #002 LFA specifics** — Drop #001 LFA states a Tier Size of $25,000 and Max Contracts of 2 mini / 2 micro; Drop #002 LFA will "follow our standard Live Funded Account Parameters and be treated as a $150K." Neither source provides the complete LFA parameter set (Reserve splits, Dynamic Live Risk Expansion profit thresholds, Daily Loss Limit Safeguard, auto-liquidation floor, Payout eligibility details) for these sizes. Do not assume the figures from [live.md](live.md) for $150K apply unchanged to Drop #002's stated $150K LFA without an independent re-check of live.md's own sourcing.
- **Dollar figures for Challenge-stage parameters not stated by source** — Drop #003, #004, and #005 each state a Profit Target, Drawdown Amount, and Max Contracts, all of which are reproduced in the tables above. These are directly quoted. However, nothing in the source states a "Minimum Payout Request" or "Max Payout per Cycle" for any Challenge's Payout Round — only "fixed $X Payout, paid one time." Do not infer a minimum request or a per-cycle cap from the fixed-payout language.

---

**Sources:**

- https://help.topstep.com/en/articles/15520357-topstep-labs (updated 2026-09-18): primary source for all five Labs Drops, their phases, parameters, pricing, payout mechanics, restricted products, and concurrent-account limits.
- https://help.topstep.com/en/articles/8284117-topstep-refund-policies (updated 2026-09-11): refund policy general statement and 14-day satisfaction guarantee scope.
- https://help.topstep.com/en/articles/13613539-risk-adjustments-high-risk-high-volatility (updated 2026-09-17): Labs-specific restricted-product and position-limit details.
- https://help.topstep.com/en/articles/8284223-what-is-the-scaling-plan (updated 2026-07-16): Scaling Plan mechanic and chart, referenced for Drop #002 XFA Scaling Plan table.
