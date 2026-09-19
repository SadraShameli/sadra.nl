# Trading Combine + Express Funded Account, Consistency Path (`$50K` / `$100K` / `$150K`)

**Sources:** Topstep Help Center, multiple articles (Trading Combine® Parameters, Express Funded Account® Parameters/Activation, Consistency at Topstep, Topstep Payout Policy, What is the Scaling Plan?, What is the Maximum Loss Limit?, plus firm-wide eligibility/prohibited-trading-strategies/risk-adjustment articles). Full list with exact URLs and each article's own stated update date is in the Sources section below.

**Last Verified:** `2026-09-19`
**Last Updated:** `2026-09-19`

## Overview

This file documents Topstep's Trading Combine® (evaluation) followed by the Express Funded Account® (XFA) under its **Consistency** Payout path, across all three account sizes Topstep currently sells: $50K, $100K, and $150K. The Trading Combine itself, its pricing paths, its Scaling Plan, and its Maximum Loss Limit (MLL) mechanic are identical no matter which Payout path a trader later chooses; Standard vs. Consistency is selected only at XFA activation, and changes both the funded-stage Payout eligibility Objective and the Max Payout per Cycle dollar cap (see Payouts below). The Consistency path requires 3 trading days with at least 1 trade each and a 40% consistency target (Largest Single-Day Net Profit ÷ Total Net Profit), in exchange for reaching Payout eligibility faster than the sibling Standard path's 5-winning-days-of-$150+ requirement (documented in `standard.md`). Passing the Trading Combine earns the XFA; taking Payouts and building a track record in the XFA works toward a call-up to the Live Funded Account (see Live Transition below).

**Engine cross-check (`src/lib/prop-calculator/firms/topstep/TopStep.ts`):** the simulator's `TopStep` class only builds plans at `ACCOUNT_SIZE = 50_000` (hardcoded). Every dollar-denominated figure it models, Maximum Loss Limit, Profit Target, the tiered funded contract-limit table, monthly subscription/reset pricing, and Payout request caps, is the $50K-tier figure only. The $100K and $150K columns throughout this file are confirmed by Topstep's own sources below but are not yet reflected anywhere in the engine; this is a scope gap, not a data error, everywhere the engine's own $50K figure matches this file's $50K column. Separately, the engine's `minPayoutProfitPerCycle` (a flat $0.01-positive-net-profit-since-last-Payout floor) is applied uniformly to every `TopStepVariant` in `buildPlan`, including the Consistency-path variants built here. Topstep's own Payout Policy article states that requirement only under the Standard path's own two-item requirements list; the Consistency path's own two-item list is "3 trading days with at least 1 trade per day" and "stay at or below the 40% consistency target," with no separate profit-since-last-Payout item. It is not stated by the source whether the engine's shared constant is harmless here (the 40% ratio already requires positive total net profit to be computable) or an extra restriction the Consistency path doesn't actually have. Flagged, not resolved.

## Evaluation

| Parameter | `$50K` | `$100K` | `$150K` |
| --- | --- | --- | --- |
| Starting Balance | $50,000 | $100,000 | $150,000 |
| Profit Target | $3,000 | $6,000 | $9,000 |
| Drawdown Type | Maximum Loss Limit (MLL): trailing, end-of-day. Rises 1:1 with EOD balance gains, never falls, locks permanently once it reaches the account's starting balance. | Same mechanic | Same mechanic |
| Drawdown Amount | $2,000 | $3,000 | $4,500 |
| Minimum Balance at Start | $48,000 ($50,000 minus $2,000) | $97,000 (see Not Confirmed) | $145,500 (see Not Confirmed) |
| Daily Loss Limit | Optional, not applied by default. If added at Trading Combine purchase: $1,000, fixed for the account's lifetime | Optional; $2,000 if added | Optional; $3,000 if added |
| Max Contracts | 5 minis / 50 micros | 10 minis / 100 micros | 15 minis / 150 micros |
| Consistency Rule | 55% Consistency Target: Best Day Profit ÷ Total Profit must stay at or below 55%. Hard line, not rounded, no buffer. Exceeding it raises the Profit Target (see recompute formula below) rather than failing the Combine outright. | Same rule | Same rule |
| Minimum Trading Days | 2 (source: "You can pass in as few as two days, but keep your best day below 55% of your Profit Target.") | 2 | 2 |
| News Trading | No forced flattening around economic releases in SIM or Funded accounts; slippage risk is the Trader's own responsibility. Trading your full Maximum Position Size directly into a scheduled major news event is a Prohibited Trading Strategy. Equity index products (ES, RTY, YM, NQ, NKD and their micros) face additional opening-transaction restrictions during a 10-minute window around CPI releases. | Same | Same |
| Inactivity Rule | None. No time limit or inactivity closure while the subscription is active; the Combine is "active until you pass... or until you cancel." | None | None |
| One-Time Eval Fee | None; recurring monthly subscription instead. Standard path $49/month, No Activation Fee path $95/month | Standard $99/month, No Activation Fee $149/month | Standard $199/month, No Activation Fee $229/month |
| Reset Fee | Standard $49, No Activation Fee $95 (max 2 Resets per account per calendar day) | Standard $99, No Activation Fee $149 | Standard $199, No Activation Fee $229 |

## Sim Funded (Express Funded Account, Consistency Path)

| Parameter | `$50K` | `$100K` | `$150K` |
| --- | --- | --- | --- |
| Starting Balance | $0 literal balance (buying power $50,000; the size label is buying power, not cash) | $0 literal (buying power $100,000) | $0 literal (buying power $150,000) |
| Drawdown Type | MLL: trailing, starts negative, rises 1:1 with balance, locks permanently at $0 once triggered (see Drawdown Lock) | Same mechanic | Same mechanic |
| Drawdown Amount | $2,000 | $3,000 | $4,500 |
| Drawdown Lock | Trigger 1 (natural trailing lock): balance/profit reaches $2,000. Locked value: $0. Trigger 2 (independent, overrides Trigger 1 regardless of its state): the first Payout requested from the account. Locked value: $0 ("Your MLL is set to $0 regardless of where it was before."). | Trigger 1: profit reaches $3,000 (firm-wide MLL table: "$100K XFA \| -$3,000... The MLL trails upward as your balance grows and locks at $0 once reached, same as a brand new XFA"). Locked value: $0. Trigger 2: first Payout, regardless of prior state. Locked value: $0. | Trigger 1: profit reaches $4,500 (same firm-wide MLL table: "$150K XFA \| -$4,500"). Locked value: $0. Trigger 2: first Payout, regardless of prior state. Locked value: $0. |
| Minimum Balance (ongoing) | No fixed figure; the MLL trails from -$2,000 toward $0 and locks there permanently (see Drawdown Lock). Balance can never fall below the locked $0 floor once locked, or after a first Payout. | Trails from -$3,000 toward $0, same lock behavior | Trails from -$4,500 toward $0, same lock behavior |
| Daily Loss Limit | Optional. If added at Trading Combine purchase, or at XFA activation/reactivation: $1,000, fixed for the account's lifetime | Optional; $2,000 if added | Optional; $3,000 if added |
| Max Contracts | Scaling Plan (tiered by current funded profit): below $1,500 = 2 minis/20 micros; $1,500 to $2,000 = 3 minis/30 micros; above $2,000 = 5 minis/50 micros | Below $1,500 = 3 minis/30 micros; $1,500 to $2,000 = 4 minis/40 micros; $2,000 to $3,000 = 5 minis/50 micros; above $3,000 = 10 minis/100 micros | Below $1,500 = 3 minis/30 micros; $1,500 to $2,000 = 4 minis/40 micros; $2,000 to $3,000 = 5 minis/50 micros; $3,000 to $4,500 = 10 minis/100 micros; above $4,500 = 15 minis/150 micros |
| Consistency Rule | 40% Consistency Objective: Largest Single-Day Net Profit ÷ Total Net Profit must be at or below 40% to be Payout-eligible. Not rounded. Resets to $0 after each Payout request. | Same rule | Same rule |
| News Trading | Same policy as Evaluation (no forced flattening, prohibited max-size-into-news, CPI window restrictions on equity index products) | Same | Same |
| Inactivity Rule | Accounts with no trading activity for more than 30 consecutive days may be closed. Cannot be put on hold. | Same | Same |
| Max Active/Concurrent Accounts | Up to 5 active XFAs at a time, any mix of Standard and Consistency accounts and any mix of sizes (e.g. two $50K and three $150K); the Standard/Consistency choice is locked per-account at activation | Same limit | Same limit |
| Profit Split | 90/10 (Trader keeps 90%) | 90/10 | 90/10 |

The Scaling Plan's exact contract counts above were read directly from Topstep's own Scaling Plan chart image (downloads.intercomcdn.com, linked from the "What is the Scaling Plan?" article), not from that article's body text, which does not restate the table as text. The $50K row matches this file's Evaluation Max Contracts source and this repo's own TopStep.ts engine exactly. The $100K/$150K Drawdown Lock trigger dollar figures (Trigger 1) are directly sourced from the firm-wide MLL article's own per-size table (cited in the table above); only the $50K tier has its own separate day-by-day dollar-by-dollar worked walkthrough of the mechanic (see the Worked Example below), which the $100K/$150K rows do not have.

## How the Drawdown Works

This plan has two stages, and the source describes each with a genuinely different balance convention.

In the **Trading Combine**, the account starts at the full nominal account size ($50,000 / $100,000 / $150,000), and the MLL starts that size's MLL amount below it. The MLL trails upward 1:1 with each day's end-of-day balance gain (a losing day does not pull it back down), and it locks permanently the moment it would reach the account's starting balance, it does not continue trailing past that point.

In the **Express Funded Account**, the account starts at a literal $0 balance; the "$50K / $100K / $150K" label is buying power only, not cash. The MLL starts at that size's MLL amount below $0 (i.e. a negative number) and trails upward 1:1 with funded profit, locking permanently at $0 once profit reaches the MLL amount. Independently of that natural lock, the MLL is also force-set to $0 the moment the trader takes their first Payout from the account, regardless of where the trailing MLL was sitting at that moment.

### Worked Example

Two stages below, each stated in its own convention as its first sentence; neither stage switches convention partway through. Both use the $50K tier.

**Stage 1, Trading Combine (nominal-balance convention: balance is tracked as the full account value, starting at $50,000).**

1. Start: Balance $50,000, MLL $48,000 ($50,000 minus the $2,000 MLL amount).
2. Day 1: +$1,600 profit (this session's best day so far). Balance $51,600. MLL trails to $49,600 ($51,600 minus $2,000).
3. Day 2: +$1,400 profit. Balance $53,000. The formula would put the MLL at $51,000 ($53,000 minus $2,000), which exceeds the $50,000 starting balance, so it locks permanently at $50,000 instead.
4. Total profit: $53,000 minus $50,000 = $3,000, meeting the Profit Target. Best day $1,600 ÷ $3,000 total = 53.3%, at or below the 55% Consistency Target. Combine passed, MLL locked at $50,000.

Re-derived: $50,000 + $1,600 + $1,400 = $53,000. $53,000 − $50,000 = $3,000. Matches step 4.

**Stage 2, Express Funded Account, Consistency path (literal-$0/profit convention: balance is tracked as cumulative funded profit, starting at $0).**

1. Start: 50K XFA at literal $0. MLL starts at −$2,000.
2. Day 1: +$500. Balance $500. MLL trails to −$1,500.
3. Day 2: +$1,500. Balance $2,000 (equals the $2,000 MLL amount), so the MLL locks permanently at $0.
4. Day 3: +$1,000. Balance $3,000. Largest single day so far is still Day 2's $1,500. Consistency % = $1,500 ÷ $3,000 = 50%, above the 40% target, not yet Payout-eligible.
5. Day 4: +$1,500. Balance $4,500. Largest single day is $1,500 (Days 2 and 4 tie; neither exceeds the other). Consistency % = $1,500 ÷ $4,500 = 33.3%, at or below 40%. With 4 trading days (at or above the 3-day minimum) and consistency met, the account is Payout-eligible.

Re-derived: $0 + $500 + $1,500 + $1,000 + $1,500 = $4,500. Matches Day 4's stated balance. At this point, the Max Payout per Cycle cap for a $50K Consistency XFA is $3,000; 50% of the $4,500 balance is $2,250, under that cap, so up to $2,250 is requestable (see Payouts below).

## Payouts

| Parameter | `$50K` | `$100K` | `$150K` |
| --- | --- | --- | --- |
| Profit Split | 90/10 | 90/10 | 90/10 |
| Payout Frequency | On-demand once eligible. Requestable during CME market hours, Sunday 5 PM CT through Friday 5 PM CT, excluding holidays; not available during holiday hours. | Same | Same |
| Buffer Requirement | None stated for this path specifically. Topstep's Payout Policy article lists exactly 2 requirements to request a Consistency-path Payout (3 trading days with at least 1 trade each; consistency at or below 40%); unlike the sibling Standard path, it does not include a separate "positive net profit since your last Payout" item in that list. See the Engine cross-check note in Overview. | Same | Same |
| Minimum Payout Request | $125 | $125 | $125 |
| Max Payout per Cycle | 50% of balance, capped at $3,000; capped at $6,000 instead if a Daily Loss Limit was added at Trading Combine purchase (limited-time offer; adding a DLL later, at XFA activation or Reactivation, does not unlock this) | Capped at $4,000; $8,000 with the DLL-at-purchase offer | Capped at $6,000; $12,000 with the DLL-at-purchase offer |
| Consistency on Payouts | 40% target (Largest Single-Day Net Profit ÷ Total Net Profit), resets to $0 after each Payout request. The new window starts the next trading day; the day the Payout was requested does not count toward the next 3-day minimum. All eligibility requirements (3 days, 40%) must be met again from scratch. | Same | Same |
| Maximum Total Payouts / Lifetime Cap | Not stated as a fixed lifetime figure for most Traders; each Payout is capped per-request (row above), not cumulatively. One confirmed exception: Traders whose citizenship/residency puts them in a country that is XFA-eligible but Live Funded Account-ineligible are capped at $200,000 in total lifetime Payouts, since they cannot progress to the uncapped Live Funded Account. | Same | Same |

## Live Transition

Topstep's stated path is: pass the Trading Combine, take Payouts and build a track record in the Express Funded Account, then earn a call-up to the Live Funded Account (LFA), made by Topstep's Risk Team "after consistent XFA performance." Neither source bundle for this file states a precise, quantitative call-up trigger beyond that description. Full LFA parameters are out of scope for this file and are documented once in the shared `live.md` (shared with `standard.md`, since both plans feed the same Trading Combine into the same LFA).

## Not Confirmed By This Source

- **Maximum Total Payouts / Lifetime Cap (general Traders)** — not stated as a fixed lifetime figure for Consistency XFA holders outside the XFA-eligible/LFA-ineligible country group. The only lifetime cap figure in either bundle ($200,000) is stated specifically for that eligibility group. Do not assume $200,000 is a general lifetime cap that applies to every Consistency XFA holder.
- **Buffer Requirement, engine behavior** — Topstep's own Payout Policy article does not list a profit-since-last-Payout requirement for the Consistency path (see Overview's Engine cross-check note). Whether TopStep.ts's shared `minPayoutProfitPerCycle` constant is a genuine extra restriction on this path or an inert value given the 40% ratio's own math is not stated by the source either way. Do not assume the engine is wrong just because the field is absent from the source's Consistency-specific list, and do not assume the source's silence proves the engine's behavior is intentional.
- **Minimum Balance at Start, $100K/$150K** — the $48,000 figure for a $50K Combine is stated verbatim in the source's own worked example; the $97,000 and $145,500 figures for $100K/$150K are this file's own arithmetic (size minus that size's own confirmed MLL amount), not an independently stated dollar figure in either bundle. Do not treat $97,000/$145,500 as directly quoted source text.

---

**Last Updated:** `2026-09-19`
**Sources:**

- `https://help.topstep.com/en/articles/8284121-trading-combine-subscriptions` (updated 2026-09-04)
- `https://help.topstep.com/en/articles/8284197-trading-combine-parameters` (updated 2026-09-10)
- `https://help.topstep.com/en/articles/8284208-consistency-at-topstep` (updated 2026-09-17)
- `https://help.topstep.com/en/articles/8284215-express-funded-account-parameters` (updated 2026-08-05)
- `https://help.topstep.com/en/articles/8284217-express-funded-account-activation` (updated 2026-08-24)
- `https://help.topstep.com/en/articles/8284223-what-is-the-scaling-plan` (updated 2026-07-16; contract-table figures sourced from this article's own linked chart image, not its body text)
- `https://help.topstep.com/en/articles/8284233-topstep-payout-policy` (updated 2026-09-03)
- `https://help.topstep.com/en/articles/10490293-daily-loss-limit-in-the-trading-combine-and-express-funded-account` (updated 2026-06-30)
- `https://help.topstep.com/en/articles/14289835-topstep-pricing-and-payment-questions` (updated 2026-07-20)
- `https://help.topstep.com/en/articles/8284128-what-is-a-reset` (updated 2026-06-18)
- `https://help.topstep.com/en/articles/10370307-reset-purchase-limits` (updated 2026-06-18)
- `https://help.topstep.com/en/articles/8284204-what-is-the-maximum-loss-limit` (updated 2026-09-18)
- `https://help.topstep.com/en/articles/8284099-topstep-program-overview` (updated 2026-09-10)
- `https://help.topstep.com/en/articles/8284199-new-to-topstep-start-here` (updated 2026-07-20)
- `https://help.topstep.com/en/articles/8284116-am-i-eligible-to-trade-with-topstep` (updated 2026-09-04)
- `https://help.topstep.com/en/articles/8765442-order-types-fills-and-slippage` (updated 2026-09-16)
- `https://help.topstep.com/en/articles/10305426-prohibited-trading-strategies-at-topstep` (updated 2026-06-10)
- `https://help.topstep.com/en/articles/13613539-risk-adjustments-high-risk-high-volatility` (updated 2026-09-17)

Every URL above was independently confirmed against `help.topstep.com/sitemap.xml`'s own article list (56 of 56 sitemap articles fetched and read for this documentation pass; see `SOURCES.md`), not reconstructed from a title.
