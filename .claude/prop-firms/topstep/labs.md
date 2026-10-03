# Topstep Labs

**Sources:** <https://help.topstep.com/en/articles/15520357-topstep-labs> (updated 2026-10-01); the supporting articles are listed in the Sources footer.

**Last Verified:** 2026-10-02
**Last Updated:** 2026-10-02

## Overview

Topstep Labs is an experimental product series where limited-availability drops test new account structures, pricing models, and trading mechanics. Each drop is heterogeneous: some are full three-phase pathways (Trading Combine → Express Funded Account → Live Funded Account), while others are fixed-payout Challenges with only two rounds (Challenge Round → Payout Round, then account closure). This file documents six drops by number (#001 through #006), one subsection per drop, each reusing CONVENTIONS.md's own field names (Starting Balance, Profit Target, Drawdown Type/Amount/Lock, Daily Loss Limit, Max Contracts, Consistency Rule, Profit Split, and so on) inside its own Evaluation/Sim Funded/Payouts tables. This deliberately deviates from CONVENTIONS.md's single-file, size-tiered-columns layout: the 6 drops are not 6 sizes of one plan, they are 6 unrelated products (three 3-phase evaluations, three 2-round fixed-payout Challenges with no funded or live stage at all), so a single 3-column table cannot represent them the way it represents standard.md's three account sizes. Drops #001, #002 and #006 follow existing pathways but with distinct parameters; Drops #003, #004, and #005 introduce the Challenge mechanic and do not progress to a Live Funded Account. Every drop is limited ("Every drop is limited; when it's gone, it's gone.").

## Drop #001: $25K Static Drawdown Trading Combine

A three-phase product with a single, defined new mechanic: a non-trailing (static) Maximum Loss Limit that locks in place and never moves, meaning your effective drawdown room grows as your account does, unlike Topstep's standard end-of-day trailing MLL. This is genuinely distinct from the EOD-trailing MLL documented in [standard.md](standard.md) and [consistency.md](consistency.md).

### Evaluation

| Parameter             | Value                                           |
| --------------------- | ----------------------------------------------- |
| Buying Power          | $25,000                                         |
| Profit Target         | $2,000                                          |
| Drawdown Type         | Maximum Loss Limit (MLL), static (non-trailing) |
| Drawdown Amount       | $1,000                                          |
| Daily Loss Limit      | Mandatory $500                                  |
| Max Contracts         | 2 mini / 20 micro                               |
| Consistency Target    | 55%                                             |
| Funded Activation Fee | Free                                            |
| One-Time Fee          | $75 (90-day expiration)                         |
| Resets                | Not available                                   |

### Sim Funded

| Parameter        | Value                                                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path             | Choose Standard or Consistency (at XFA activation)                                                                                                                                                             |
| Starting Balance | Unconfirmed (the Labs Phase 2 table states no Starting Balance row; see Not Confirmed, "Drop #001 and #002 XFA Starting Balance and lock trigger") |
| Drawdown Type    | Maximum Loss Limit (MLL), static (non-trailing)                                                                                                                                                                |
| Drawdown Amount  | $1,000                                                                                                                                                                                                         |
| Drawdown Lock    | Trigger: none stated by the source (see Not Confirmed). Locked value: $0, forced after the first Payout. Source: "After first Payout, MLL sets to $0." |
| Daily Loss Limit | Mandatory $500                                                                                                                                                                                                 |
| Max Contracts    | 2 mini / 20 micro (no scaling)                                                                                                                                                                                 |
| Payout Cap       | $4,000                                                                                                                                                                                                         |

### Live Funded Account

| Parameter        | Value            |
| ---------------- | ---------------- |
| Tier Size        | $25,000          |
| Starting Balance | $5,000 minimum   |
| Daily Loss Limit | Mandatory $500   |
| Max Contracts    | 2 mini / 2 micro |

### How the Drawdown Works (Static MLL)

The static Maximum Loss Limit is the defining distinction of Drop #001. Unlike Topstep's standard end-of-day trailing MLL (documented in [standard.md](standard.md) and [consistency.md](consistency.md)), the static MLL is fixed in place and does not move. Once set, it is the absolute lowest point your balance is allowed to reach; it never trails upward with profits and never trails downward with losses.

Source example, verbatim: "a Trader starts with a $25,000 balance and a $1,000 Max Loss Limit, earns $1,000 in profit (balance hits $26,000), then loses $500 (balance ends at $25,500)."

- **End-of-Day (EOD) Trailing (standard Topstep):** MLL moves to $24,500. Next day effective room: $1,000.
- **Static (this Trading Combine):** MLL stays at $24,000. Next day effective room: $1,500.

The source frames this as the benefit: "With a $28,000 balance, the Trader has $4,000 of room — not $3,000." Your effective loss cushion expands with every net profit and contracts with every net loss, but the absolute floor is unchanging.

### Worked Example

Using the $25K tier, starting at a literal $25,000 nominal balance (matching the Trading Combine's own full account size convention). The +$500 and +$1,500 day figures are this file's own illustration, not a Topstep example.

1. Start: Balance $25,000. Static MLL floor: $24,000 (the starting balance minus the $1,000 MLL amount).
2. Day 1: +$500 profit. Balance $25,500. The MLL stays at $24,000 (does not move). Effective room above the floor: $25,500 − $24,000 = $1,500.
3. Day 2: +$1,500 profit. Balance $27,000. MLL still $24,000. Effective room: $27,000 − $24,000 = $3,000.
4. Total profit: $27,000 − $25,000 = $2,000, meeting the Profit Target.

Re-derived: $25,000 + $500 + $1,500 = $27,000. $27,000 − $25,000 = $2,000. Consistent.

### Payouts

Drop #001's own source states only the $4,000 Payout Cap in the Sim Funded table above. It does not itself state a Profit Split, Payout Eligibility day-count/consistency figure, Minimum Payout Request, or Max Payout per Cycle for either path. Because Drop #001 explicitly states the XFA path can be Standard or Consistency, the table below cites the sibling files' figures only as references and marks each Unconfirmed for Drop #001:

| Parameter              | Standard Path                                                     | Consistency Path                                                  |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Profit Split           | Unconfirmed for Drop #001 (`standard.md` states 90/10)            | Unconfirmed for Drop #001 (`consistency.md` states 90/10)         |
| Payout Eligibility     | Unconfirmed for Drop #001 (`standard.md`: 5 winning days of $150+ Net P&L) | Unconfirmed for Drop #001 (`consistency.md`: 3 trading days, 40% consistency target) |
| Minimum Payout Request | Unconfirmed for Drop #001 (`standard.md`: $125)                   | Unconfirmed for Drop #001 (`consistency.md`: $125)                |
| Max Payout per Cycle   | Not stated for Drop #001 (`standard.md`'s own $2,000 figure is a $50K-XFA-size cap; Drop #001's own Payout Cap is the separately stated $4,000, above) | Not stated for Drop #001 (same caveat) |

**Cross-reference note:** Whether the sibling-file figures carry over to a Drop #001 XFA is not stated: the source ties Drop #001's XFA to the same Standard/Consistency path choice but never restates them. See Not Confirmed below.

## Drop #002: $250K Freedom Funded Trading Combine

A three-phase product whose Phase 1 table states a "$10,000 Trailing End of Day" Maximum Loss Limit, not the static mechanic of Drop #001; the Phase 2 table states no trailing type (see Sim Funded). The Phase 2 table lists only the Standard path, and the LFA transition is stated to "will follow our standard Live Funded Account Parameters and be treated as a $150K."

### Evaluation

| Parameter             | Value                                                                            |
| --------------------- | -------------------------------------------------------------------------------- |
| Buying Power          | $250,000                                                                         |
| Profit Target         | $15,000                                                                          |
| Drawdown Type         | Maximum Loss Limit (MLL), EOD trailing                                           |
| Drawdown Amount       | $10,000                                                                          |
| Daily Loss Limit      | Mandatory $5,000                                                                 |
| Max Contracts         | 25 mini / 250 micro                                                              |
| Consistency Target    | 55%                                                                              |
| Funded Activation Fee | Free                                                                             |
| One-Time Fee          | $499 (90-day expiration)                                                         |
| Purchase Limit        | Up to 5 accounts ("For the $250K Re-release, you may purchase up to 5 accounts") |
| Resets                | Not available                                                                    |

### Sim Funded

| Parameter        | Value                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path             | Standard (the Phase 2 table lists no other path)                                                                                                                                                                                                                                                                                                                    |
| Starting Balance | Unconfirmed (the Labs Phase 2 table states no Starting Balance row; see Not Confirmed, "Drop #001 and #002 XFA Starting Balance and lock trigger") |
| Drawdown Type    | Maximum Loss Limit (MLL); the Phase 2 table states no trailing type (Phase 1 states "$10,000 Trailing End of Day") |
| Drawdown Amount  | $10,000                                                                                                                                                                                                                                                                                                                                                             |
| Drawdown Lock    | Trigger: none independently stated for Drop #002 beyond "After first Payout, MLL sets to $0." Locked value: $0, forced on the first Payout. Whether a natural EOD-trailing lock trigger (analogous to the natural trail documented in standard.md) also applies to Drop #002 is not stated by this source; do not assume it does without a citation. |
| Daily Loss Limit | Unconfirmed (see Not Confirmed): the Phase 2 table lists no DLL row; Phase 1 states Mandatory $5,000 and the pricing FAQ says "a DLL is automatic" |
| Max Contracts    | 25 mini / 250 micro                                                                                                                                                                                                                                                                                                                                                 |
| Scaling Plan     | Applies per balance (see table below)                                                                                                                                                                                                                                                                                                                               |
| Payout Cap       | $25,000                                                                                                                                                                                                                                                                                                                                                             |

#### Scaling Plan (Drop #002 XFA)

| Balance          | Lots |
| ---------------- | ---- |
| Below $1,500     | 3    |
| $1,500 to $2,000 | 4    |
| $2,000 to $3,000 | 5    |
| $3,000 to $4,500 | 10   |
| $4,500 to $6,000 | 15   |
| $6,000 to $8,000 | 20   |
| Above $8,000     | 25   |

### Live Funded Account

| Parameter        | Value            |
| ---------------- | ---------------- |
| Tier Size        | $150,000         |
| Starting Balance | $10,000 minimum  |
| Daily Loss Limit | Mandatory $5,000 |
| Max Contracts    | 15 mini          |

**Cross-reference note:** The source states, verbatim: "once moved to a Live Funded Account, the Live Funded Account will follow our standard Live Funded Account Parameters and be treated as a $150K." The sentence points to the standard LFA parameters, which [live.md](live.md) documents. The same article's own FAQ qualifies it: "The Live Funded Account will follow our standard Live Funded Account Parameters with a minimum starting balance of $10,000. Your account size will be based on the average of all active, eligible XFAs including any activated from the $250K Freedom Trading Combine(s)." The article does not say how "be treated as a $150K" and "account size will be based on the average of all active, eligible XFAs" relate (see Not Confirmed, "Drop #002 LFA account size"). The source does not repeat the complete LFA parameter set here; see [live.md](live.md) for the full mechanics of Reserve splits, Dynamic Live Risk Expansion, Daily Loss Limit Safeguard, auto-liquidation, and Payout eligibility.

## Drop #003: $3K Challenge

A two-round fixed-payout Challenge with no progression to Live. A trader purchases the Challenge, trades the Challenge Round to hit a $3,000 Profit Target, then activates (at no cost) the separate Payout Round, hits the same $3,000 target again, and receives a fixed $3,000 one-time payout. No 90/10 split; the full $3,000 is paid once, and the account closes.

### Challenge and Payout Rounds

| Parameter          | Challenge Round                                 | Payout Round                                                                              |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Starting Balance   | $0                                              | $0                                                                                        |
| Profit Target      | $3,000                                          | $3,000                                                                                    |
| Drawdown Type      | Maximum Loss Limit (MLL), static (non-trailing) | Maximum Loss Limit (MLL), static (non-trailing)                                           |
| Drawdown Amount    | $1,000                                          | $1,000                                                                                    |
| Daily Loss Limit   | None                                            | None                                                                                      |
| Max Contracts      | 10 micro / 1 mini                               | 10 micro / 1 mini                                                                         |
| Consistency Target | None                                            | None                                                                                      |
| Activation Fee     | N/A: applies to the Payout Round only           | Free                                                                                      |
| Path               | N/A: applies to the Payout Round only           | Standard only                                                                             |
| Payout             | Passing advances to Payout Round                | Fixed $3,000, paid one time. No 90/10 split. Account closes.                              |
| Resets             | None                                            | None                                                                                      |
| Purchase Limit     | No limit on Challenge Round                     | Max 5 active Challenges in the Payout Round at once (separate from the 5-XFA limit) |

### Restrictions and Mechanics

- **Restricted products:** Cannot trade MHG, MET, MBT, or SIL.
- **CPI restrictions:** Trading during CPI window restricted to 0 contracts.
- **MGC and MCL:** Limited to 6 micros.
- **Inactivity:** Account closes after 30 days with no trades.
- **Lifespan:** 90-day expiration.
- **Payout activation delay:** Up to 15 minutes from Challenge Round pass before Payout Round account is ready.

### Concurrent Account Notes

A trader can have unlimited Challenge Rounds active. Up to 5 Payout-Round Challenges can be active at once; this limit is **separate** from the 5-XFA limit. A trader can simultaneously hold 5 XFAs and 10 Challenge accounts if desired, with only 5 of the 10 Challenges able to be in the Payout Round stage at any given time.

## Drop #004: $1.5K Challenge

A two-round fixed-payout Challenge. Similar structure to Drop #003 but with a $1,500 target, lower price ($39 vs. $49), and a per-trader purchase cap of 5 total accounts (not per-round: "you can purchase up to 5 $1.5K Challenges per Trader" across all $1.5K Challenges owned). Its Max Contracts row states "2 micro (no minis)".

### Challenge and Payout Rounds

| Parameter          | Challenge Round                                                                                                                                                                                                                             | Payout Round                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Starting Balance   | $0                                                                                                                                                                                                                                          | $0                                                                                          |
| Profit Target      | $1,500                                                                                                                                                                                                                                      | $1,500                                                                                      |
| Drawdown Type      | Maximum Loss Limit (MLL), static (non-trailing)                                                                                                                                                                                             | Maximum Loss Limit (MLL), static (non-trailing)                                             |
| Drawdown Amount    | $500                                                                                                                                                                                                                                        | $500                                                                                        |
| Daily Loss Limit   | None                                                                                                                                                                                                                                        | None                                                                                        |
| Max Contracts      | 2 micro (no minis)                                                                                                                                                                                                                          | 2 micro (no minis)                                                                          |
| Consistency Target | None                                                                                                                                                                                                                                        | None                                                                                        |
| Activation Fee     | N/A: applies to the Payout Round only                                                                                                                                                                                                       | Free                                                                                        |
| Path               | N/A: applies to the Payout Round only                                                                                                                                                                                                       | Standard only                                                                               |
| Payout             | Passing advances to Payout Round                                                                                                                                                                                                            | Fixed $1,500, paid one time. No 90/10 split. Account closes.                                |
| Resets             | None                                                                                                                                                                                                                                        | None                                                                                        |
| Purchase Limit     | Max 5 per Trader, total: "Purchase Limit \| 5 per Trader \| —" and "you can purchase up to 5 $1.5K Challenges per Trader. Once you reach that limit, you cannot buy additional $1.5K Challenges, even if some of your accounts have closed" | Max 5 active Challenges in the Payout Round at one time ("separate from the 5 Express Funded Account (XFA) limit"), per the $1.5K section |

### Restrictions and Mechanics

- **Restricted products:** Cannot trade MHG, MET, MBT, or SIL.
- **CPI restrictions:** Trading during CPI window restricted to 0 contracts.
- **MGC and MCL:** Limited to 1 contract.
- **Inactivity:** Account closes after 30 days with no trades.
- **Lifespan:** 90-day expiration.

### Concurrent Account Notes

Unlike Drop #003, there is a per-trader cap on $1.5K Challenge ownership: a single trader can own a maximum of 5 $1.5K Challenge accounts ("5 per Trader"). Once that limit is reached, no additional $1.5K Challenges can be purchased. Closed accounts still count toward the 5, preventing replacement. This cap is independent of the 5-active-Challenges-in-the-Payout-Round limit stated in the $1.5K section (a Payout-Round limit, not a purchase limit).

## Drop #005: $6K Challenge

A two-round fixed-payout Challenge. Higher payout ($6,000) and higher price ($149), with a $6,000 profit target and a $2,000 static drawdown. Like Drop #004, it has a per-trader purchase cap of 5 total accounts (closed accounts count). Its restricted-products list is under Restrictions and Mechanics below.

### Challenge and Payout Rounds

| Parameter          | Challenge Round                                                                                                                                                                                                         | Payout Round                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Starting Balance   | $0                                                                                                                                                                                                                      | $0                                                                                          |
| Profit Target      | $6,000                                                                                                                                                                                                                  | $6,000                                                                                      |
| Drawdown Type      | Maximum Loss Limit (MLL), static (non-trailing)                                                                                                                                                                         | Maximum Loss Limit (MLL), static (non-trailing)                                             |
| Drawdown Amount    | $2,000                                                                                                                                                                                                                  | $2,000                                                                                      |
| Daily Loss Limit   | None                                                                                                                                                                                                                    | None                                                                                        |
| Max Contracts      | 10 micro / 1 mini                                                                                                                                                                                                       | 10 micro / 1 mini                                                                           |
| Consistency Target | None                                                                                                                                                                                                                    | None                                                                                        |
| Activation Fee     | N/A: applies to the Payout Round only                                                                                                                                                                                   | Free                                                                                        |
| Path               | N/A: applies to the Payout Round only                                                                                                                                                                                   | Standard only                                                                               |
| Payout             | Passing advances to Payout Round                                                                                                                                                                                        | Fixed $6,000, paid one time. No 90/10 split. Account closes.                                |
| Resets             | None                                                                                                                                                                                                                    | None                                                                                        |
| Purchase Limit     | Max 5 per Trader, total: "Purchase Limit \| 5 per Trader \| —" and "You can buy up to 5 $6K Challenges per Trader. That count covers every $6K Challenge account you own, in either round. Closed accounts still count" | Not stated in the $6K section (see Not Confirmed) |

### Restrictions and Mechanics

- **Restricted products (cannot trade):** MHG, SIL, HG, SL, CL, GC, HO, QM, PL, RB.
- **CPI restrictions:** Trading during CPI window restricted to 0 contracts.
- **MGC and MCL:** Limited to 6 micros.
- **Inactivity:** Account closes after 30 days with no trades.
- **Lifespan:** 90 days.
- **Drop-specific 10,000-unit limit:** 10,000 units available in total, "first come, first serve".

### Concurrent Account Notes

A single trader can own a maximum of 5 $6K Challenge accounts ("That count covers every $6K Challenge account you own, in either round"). Closed accounts still count toward the 5, preventing replacement. The $6K section states no active-Payout-Round limit; the 5-active limit appears in the $3K and $1.5K sections only (see Not Confirmed).

## Drop #006: $50K Static Drawdown Trading Combine

A three-phase product (Trading Combine, Express Funded Account, Live Funded Account) with the same static Maximum Loss Limit mechanic as Drop #001, at $50,000 in buying power. The Labs article lists it as launching "October 2026" and describes it as "Our sixth Labs drop. $50,000 in buying power. A static Maximum Loss Limit that never moves. Hit the $4,000 Profit Target. Stay above the floor. Pay once." Every figure below is from the article's own Phase 1 to Phase 3 tables and its "$50K Static Trading Combine" FAQ, fetched 2026-10-02 (dateModified 2026-10-01T17:15:10Z).

### Evaluation

| Parameter             | Value                                                    |
| --------------------- | -------------------------------------------------------- |
| Buying Power          | $50,000                                                  |
| Profit Target         | $4,000                                                   |
| Drawdown Type         | Maximum Loss Limit (MLL), static (non-trailing)          |
| Drawdown Amount       | $2,000                                                   |
| Daily Loss Limit      | Mandatory $1,000                                         |
| Max Contracts         | 4 mini / 40 micro                                        |
| Consistency Target    | 55% ("Same as other Trading Combines. You need to meet a 55% Consistency Target to pass.") |
| Funded Activation Fee | Free                                                     |
| One-Time Fee          | $149 ("$149 one-time. No subscription."; "No subscription, no Rebills, no Resets. The Responsible Trading Discount does not apply.") |
| Resets                | Not Available                                            |
| Lifespan              | 90 days                                                  |
| Inactivity            | 30 days                                                  |
| Purchase Limit        | 5 per Trader ("Closed or failed accounts still count toward the 5, so if one closes, you can't replace it.") |

### Sim Funded

| Parameter        | Value                                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Path             | "Choose Standard (no consistency) or Consistency (40%)"                                                                                                                                                                                   |
| Starting Balance | Unconfirmed (buying power $50,000); the Labs article's own Phase 2 table states no Starting Balance row, see Not Confirmed                                                                                                  |
| Drawdown Type    | Maximum Loss Limit (MLL), static (non-trailing)                                                                                                                                                                                           |
| Drawdown Amount  | $2,000                                                                                                                                                                                                                                    |
| Drawdown Lock    | Trigger: none stated by the Labs article, see Not Confirmed. Locked value: $0, forced after the first Payout. Source: "After first Payout, MLL sets to $0." and "$2,000 Maximum Loss Limit (static until first Payout)". |
| Daily Loss Limit | Mandatory $1,000                                                                                                                                                                                                                          |
| Max Contracts    | 4 mini / 40 micro                                                                                                                                                                                                                         |
| Scaling Plan     | "2/3/4. Learn more about how the Scaling Plan works."                                                                                                                                                                                      |
| Payout Cap       | $8,000 on either path                                                                                                                                                                                                                     |

### Live Funded Account

| Parameter        | Value                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Sizing           | "Mirrors the standard $50K Trading Combine"                                                                                        |
| Starting Balance | $10,000 minimum                                                                                                                    |
| Daily Loss Limit | Mandatory $1,000                                                                                                                   |
| Max Contracts    | "Scale In Scale Up: 5 mini / 50 micros and reduces down to a minimum of 3 mini / 30 micros if tradable balance declines."          |
| Call-up          | "Call-up to Live is at the discretion of our Risk team."                                                                           |

### How the Drawdown Works (Static MLL)

Same mechanic as Drop #001 (see [How the Drawdown Works (Static MLL)](#how-the-drawdown-works-static-mll) above): the floor never moves. Source example, verbatim: "a Trader starts with a $50,000 balance and a $2,000 Maximum Loss Limit, earns $2,000 in profit (balance hits $52,000), then loses $1,000 (balance ends at $51,000)."

- **End-of-Day (EOD) Trailing (standard Topstep):** "Trader ends at $51,000, limit moves to $49,000. They start the next day with $2,000 of room."
- **Static (this Trading Combine):** "It stays at $48,000 no matter what. The Trader starts the next day with $3,000 of room. Grow the balance to $56,000 and that room is $8,000."

Re-derived under the article's own nominal-balance convention: $50,000 + $2,000 = $52,000; $52,000 - $1,000 = $51,000; $51,000 - $48,000 = $3,000; $56,000 - $48,000 = $8,000.

### Payouts

| Parameter                      | Value                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Payout Cap                     | "Both paths have an $8,000 Payout cap"                                                                                  |
| Consistency on Payouts         | Standard: "No consistency requirement"; Consistency: "40% Consistency Target"                                           |
| Maximum Total Payouts          | "No hard cap on the number of Payouts. Our Risk team decides on Live call-ups at its discretion."                       |
| Profit Split                   | Not stated for Drop #006, see Not Confirmed below                                                                       |
| Minimum Payout Request         | Not stated for Drop #006, see Not Confirmed below                                                                       |
| Payout Eligibility (day count) | Not stated for Drop #006, see Not Confirmed below                                                                       |

### Restrictions and Mechanics

- **Restricted products:** "In the $50K Static Trading Combine, MCL and MGC are set to a max of 25 lots, and CL, GC, HO, QM, RB, MHG, and SIL are set to a max of 2 lots. PL, HG, and SI cannot be traded, which is standard for all Trading Combines."
- **Concurrent accounts:** "You can buy up to five $50K Static Trading Combines no matter how many other Trading Combines you have. Standard limits still apply to how many active Express Funded Accounts you can hold at one time."
- **Eligibility and availability:** "All Traders, new and existing, while units remain." The article states no total unit count for this drop (Drop #005's 10,000-unit figure is not stated here).
- **Refunds:** "Our standard Topstep Refund Policies apply."

## Risk Adjustments and Restricted Products

All Labs offerings are subject to temporary volatility-driven position-limit adjustments and permanent per-product restrictions detailed in Topstep's [Risk Adjustments: High Risk/High Volatility](https://help.topstep.com/en/articles/13613539-risk-adjustments-high-risk-high-volatility) article. That article lists Labs-specific restricted-product limits for each Drop. This file does not reproduce every restricted-symbol table; instead, each Drop section above names the products that cannot be traded on that Drop (if a full ban) or their contract limits (if a partial restriction).

The article's own Labs callout gives the per-Drop limits verbatim:

- **Drop #001 ($25K Static):** "restricted products are set to a max contract size of 1 mini/10 micros."
- **Drop #002 ($250K Freedom):** "restricted energies are set to a max contract size of 15 minis/150 micros. For SIL/MHG, 10 minis/100 micros. SI, HG, and PL are still 0."
- **Drop #003 ($3K Challenge):** "you cannot trade MHG, MET, MBT, or SIL. Trading during CPI is also restricted to 0. Additionally, MGC and MCL is limited to 6 micros."
- **Drop #004 ($1.5K Challenge):** "you cannot trade MHG, MET, MBT, or SIL. MGC/MCL are limited to 1. Trading during CPI is also restricted to 0."
- **Drop #005 ($6K Challenge):** "you cannot trade MHG, SIL, HG, SL, CL, GC, HO, QM, PL, or RB. Trading during CPI is also restricted to 0. Additionally, MGC and MCL is limited to 6 micros."
- **Drop #006 ($50K Static):** "In the $50K Static Trading Combine, MCL and MGC are set to a max of 25 lots, and CL, GC, HO, QM, RB, MHG, and SIL are set to a max of 2 lots."

## How Labs Interacts With Live and Pro Accounts

**Challenge performance does not earn a Live call-up.** "You can't be called up to Live solely as a result of trading Challenges. If you are called up to Live as a result of your performance in Express Funded Accounts, your Challenges and Payout Round stay open and eligible." For the $3K and $1.5K Challenges the article states a trader in an LFA can "still trade, pass, and activate the Payout round", and one in a Pro Account can still purchase and trade the Challenge Round ("Passing the Challenge Round doesn't require you to give up your Pro Account").

**The Responsible Trading Discount does not extend to Labs.** For Drop #002: "$499 one-time fee. There is no subscription — you pay once. The Responsible Trading Discount does not apply even though a DLL is automatic."

## Refund Policy

Labs offerings are one-time purchases with no monthly rebills. The standard Topstep Refund Policies apply, as stated in the refund article (updated 2026-10-01): refunds are generally not available once a purchase is made, with limited exceptions. The refund article's 14-day satisfaction guarantee reads: "If within your first 14 calendar days you decide it's not for you, we'll refund up to 1 monthly renewal payment for your Trading Combine® — as long as you haven't passed the evaluation." and "This applies to your first-ever Trading Combine® purchase only." Neither article says whether a Labs purchase falls under it (see Not Confirmed).

## Other Confirmed Rules

- **The $3K Challenge format and price**: "The $3K Challenge is a 2 round challenge for $49, one time."
- **Labs Trading Combines expire**: "Please note, this Trading Combine expires 90 days after purchase. If you haven’t passed by then, it will close automatically."
- **A "25K" row in the CPI-window table**: "25K | $20,000 | 1 | Blocked | Capped at 1 micro" (the table does not say which product it corresponds to; see Not Confirmed)
- **The $50K Static tier's own CPI-window limits**: "$50K Static $40,000 2 Blocked Capped at 2 micros" (from the CPI-window table in article 13613539, under the columns Account, Margin, Max micros, Equity Minis, Effect during window)

## Not Confirmed By This Source

- **Profit Split, Payout Eligibility, and Minimum Payout Request for Drop #001 XFA** — Drop #001's own source states only the $4,000 Payout Cap; the 90/10 split, eligibility day-count/consistency figures, and $125 minimum request in the Payouts table above are carried over from [standard.md](standard.md) / [consistency.md](consistency.md), not independently confirmed by Drop #001's own article. Do not assume this file's own source independently confirmed those three rows.
- **Max Payout per Cycle for Drop #001 XFA** — neither Drop #001's own source nor the sibling files state a Max Payout per Cycle distinct from the already-confirmed $4,000 Payout Cap. Do not assume the $2,000/$3,000/$5,000 (Standard) or $3,000/$4,000/$6,000 (Consistency) size-tiered caps in standard.md/consistency.md apply on top of Drop #001's own flat $4,000 cap.
- **Scaling Plan formula "Account Balance" axis for Drop #002** — the Scaling Plan table above is the Labs article's own table (headed "Balance | Lots", fetched 2026-10-02), not the chart image in the Scaling Plan article (8284223) that [standard.md](standard.md) reads. Article 8284223 states that the Scaling Plan sets the Maximum Position Size "based on your current account balance" and that "Your XFA starts at a $0 balance"; the Labs article states no Starting Balance for the Drop #002 XFA and does not say whether its "Balance" axis means literal balance or profit. Do not assume the axis is profit rather than balance on the strength of the two being equal at a $0 starting balance.
- **Profit Split, Minimum Payout Request and Payout Eligibility day-count for Drop #006 XFA** — the Labs article states the $8,000 Payout Cap, the Standard ("No consistency requirement") and Consistency ("40% Consistency Target") paths and "No hard cap on the number of Payouts", but no profit split, minimum request or winning-day count for this drop. Do not assume the 90/10 split, $125 minimum or day counts from [standard.md](standard.md) / [consistency.md](consistency.md) apply to Drop #006.
- **Scaling Plan "2/3/4" for Drop #006 XFA** — the Labs table states only "2/3/4. Learn more about how the Scaling Plan works." with no balance thresholds, and the page does not say what the three numbers are (lots per tier is not stated). Do not assume they are lot counts at the standard Scaling Plan balance tiers.
- **Drop #001 and #002 XFA Starting Balance and lock trigger** — the Labs Phase 2 tables for these two drops state no Starting Balance row and no natural lock trigger, only "After first Payout, MLL sets to $0". A $0 XFA Starting Balance is the firm-wide XFA convention from article 8284215, not stated by the Labs article for these drops, so the Starting Balance cells say Unconfirmed. Do not assume a $0 starting balance, or a natural lock trigger for the static (#001) or EOD-trailing (#002) mechanic.
- **Drop #002 XFA Daily Loss Limit** — the Phase 2 table lists no Daily Loss Limit row. Phase 1 states "Mandatory $5,000" and the pricing FAQ says "even though a DLL is automatic", but neither names the XFA stage. Do not assume the $5,000 DLL carries into the XFA.
- **Drop #002 LFA account size** — the Labs article says the LFA "will follow our standard Live Funded Account Parameters and be treated as a $150K", and its FAQ says "Your account size will be based on the average of all active, eligible XFAs including any activated from the $250K Freedom Trading Combine(s)." It does not say how the two statements relate. Do not assume the LFA is always $150K, and do not assume it is the XFA average rather than $150K.
- **Drop #005 ($6K) Payout-Round active limit** — the $3K and $1.5K sections state "up to 5 active Challenges in the Payout Round at one time"; the $6K section states only the 5-per-Trader purchase cap. Do not assume the 5-active Payout-Round limit applies to the $6K Challenge.
- **Whether the 14-day satisfaction guarantee applies to a Labs purchase** — the Labs article says "Our standard Topstep Refund Policies apply", and the guarantee is worded for "your first-ever Trading Combine® purchase only" and a "monthly renewal payment"; no page says whether a one-time Labs purchase qualifies. Do not assume it does, and do not assume it does not.
- **Which product the CPI-window table's "25K" row describes** — the row (Margin $20,000, capped at 1 micro) is not labeled with a Labs Drop number. Do not assume it is Drop #001's CPI cap.
- **Drop #006 XFA Starting Balance and drawdown lock trigger** — the Labs Phase 2 table states no Starting Balance row and no lock trigger, only "After first Payout, MLL sets to $0". The $0 Starting Balance is the firm-wide XFA convention from article 8284215, imported here, not stated by the Labs article for this drop, so the Starting Balance cells say Unconfirmed. Do not assume a natural lock trigger exists for the static mechanic.
- **Drop #006 LFA parameters beyond the Labs table** — the article states a $10,000 minimum starting balance, a Mandatory $1,000 Daily Loss Limit ("Carries through"), "3 mini / 30 micro minimum, up to 5 mini / 50 micro maximum" and that "Scale In Scale Up: Same as the standard $50K Trading Combine", but not the Reserve splits, Dynamic Live Risk Expansion thresholds or payout eligibility. Do not assume [live.md](live.md)'s figures apply unchanged without an independent re-check.
- **Drop #006 unit count** — the page states "Quantities are limited, first come, first serve" and no total number of units. Do not assume the 10,000-unit figure of Drop #005 applies.
- **Challenge Rounds' account visibility post-pass, before Payout Round activation** — the source confirms the account is locked to further trading on passing: "Once hit, trading is locked for that account and the account status is 'passed'." What it does not state is whether that locked account stays visible in the dashboard during the "up to a 15 minute delay from the moment you pass a Challenge Round before the Payout Round account is ready to be activated," or exactly when within that window the lock takes effect. Do not assume the account can be re-traded after passing; it cannot.
- **LFA mechanics for Drop #001 LFA and Drop #002 LFA specifics** — Drop #001 LFA states a Tier Size of $25,000 and Max Contracts of 2 mini / 2 micro; Drop #002 LFA will "follow our standard Live Funded Account Parameters and be treated as a $150K." Neither source provides the complete LFA parameter set (Reserve splits, Dynamic Live Risk Expansion profit thresholds, Daily Loss Limit Safeguard, auto-liquidation floor, Payout eligibility details) for these sizes. Do not assume the figures from [live.md](live.md) for $150K apply unchanged to Drop #002's stated $150K LFA without an independent re-check of live.md's own sourcing.
- **Dollar figures for Challenge-stage parameters not stated by source** — Drop #003, #004, and #005 each state a Profit Target, Drawdown Amount, and Max Contracts, all of which are reproduced in the tables above. These are directly quoted. However, nothing in the source states a "Minimum Payout Request" or "Max Payout per Cycle" for any Challenge's Payout Round: only "fixed $X Payout, paid one time." Do not assume a minimum request or a per-cycle cap from the fixed-payout language.

---

**Sources:**

- <https://help.topstep.com/en/articles/8284215-express-funded-account-parameters> (updated 2026-08-05): the firm-wide XFA parameter article, cited for the $0-literal Starting Balance convention the Labs article's own Phase 2 tables do not restate.
- <https://help.topstep.com/en/articles/15520357-topstep-labs> (updated 2026-10-01): primary source for Labs Drops #001 to #006, their phases, parameters, pricing, payout mechanics, restricted products, and concurrent-account limits.
- <https://help.topstep.com/en/articles/8284117-topstep-refund-policies> (updated 2026-10-01): refund policy general statement and 14-day satisfaction guarantee scope.
- <https://help.topstep.com/en/articles/13613539-risk-adjustments-high-risk-high-volatility> (dateModified 2026-10-02T16:39:02Z): Labs-specific restricted-product and position-limit details.
- <https://help.topstep.com/en/articles/8284223-what-is-the-scaling-plan> (updated 2026-07-16): Scaling Plan mechanic and chart, referenced for Drop #002 XFA Scaling Plan table.
