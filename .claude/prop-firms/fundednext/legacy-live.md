# FundedNext Legacy Live

**Sources:**

- <https://helpfutures.fundednext.com/en/articles/14283903-road-to-live-trading-legacy-challenge-rapid-challenge-former> (updated 2026-08-29): "Road To Live Trading - Legacy Challenge & Rapid Challenge (Former)"
- <https://helpfutures.fundednext.com/en/articles/14284453-what-are-the-data-fees-in-the-fundednext-live-trading-program> (updated 2026-04-08): "What are the data fees in the FundedNext Live Trading Program?"

**Last Verified:** 2026-09-19
**Last Updated:** 2026-09-19

## Overview

This is the older/legacy FundedNext Futures live-trading program: the stage a Legacy Challenge trader enters after their FundedNext (funded) Account is selected for live transition. Per the primary source's own callout, "New Rapid purchases after July 10th will follow the new live structure. Existing accounts will follow the current structure stated below": meaning this file's mechanics apply to Legacy, and to any pre-July-10 Rapid account still in flight, but not to any Rapid account purchased or reset after July 10, 2026. Per this repo's own scope rules, the old Rapid Challenge is discontinued and not separately documented, so this file is shared by `legacy.md` only.

Eligibility for review is reached after $100,000 in Total Active Profits across all of a trader's active FundedNext Futures Accounts (withdrawals already taken plus current simulated profit, combined), but selection is discretionary, decided case-by-case by the FundedNext Risk Desk Team, not automatic on hitting the threshold. Traders keep trading normally after crossing $100,000 until (and unless) selected; being selected pauses all active accounts and starts the review, typically completed within 5 business days. Once selected, the trader's Total Simulated Profit converts into Eligible Profit, split into a Settlement Withdrawal (instant cash), a Live Deposit (the starting live balance), and a no-cap Reserve that auto-refills the live account after withdrawals. This is a fundamentally different mechanic from FundedNext's newer live program (used by Flex, Rapid Pro, and Rapid Daily), which is documented with its own citations in [live.md](live.md); no figure from that program is used or restated here. The two are not interchangeable, and nothing in this file assumes or borrows a figure from that other program.

## Effect on Other Active Accounts During the Same Transition Event

Per the same source article, once a trader is selected: all active FundedNext Accounts are disabled, all active Challenges are closed, and new account purchases are halted for the duration of the Live Trading Journey (the resulting Live Account "may take 3-7 business days to be processed"). If any Bolt account is active at the same time, it is also closed; the source states Bolt "does not have a path to live," so it instead receives "one last reward... based on the account's rules and available PnL" (mechanism confirmed, no dollar figure given). If a Flex account is active at the same time, it is closed only if it has 0 successful withdrawals (grouped in with the Challenge-account closures); a Flex account with at least 1 successful withdrawal instead transitions and keeps "our Flex live account framework": a separate program from the one this file documents, out of scope here.

## Live Account Parameters

| Parameter                                  | Value                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live Deposit (starting live balance)       | 25% of Eligible Profit, capped at $50,000; any excess above the cap is added to the Reserve instead. Not a fixed tier: the dollar amount depends entirely on the trader's own Total Simulated Profit at selection (see How Simulated Profit Is Split, below).                                                                         |
| Drawdown Type                              | Auto Liquidation Threshold: an EOD-checked equity floor ("The Auto Liquidation Limit follows a trailing end-of-day (EOD) system"), based on account equity including unrealized losses, not balance.                                                                                                                                  |
| Drawdown Amount                            | Not expressed by the source as a fixed dollar loss amount; risk is expressed as a percentage of the initial Live Deposit instead. See Auto Liquidation Threshold row and How the Threshold Works below.                                                                                                                               |
| Auto Liquidation Threshold (Drawdown Lock) | See "How the Auto Liquidation Threshold Works" below for the full trigger/locked-value breakdown; this is a two-stage lock, not a single number.                                                                                                                                                                                      |
| Minimum Balance (ongoing)                  | Equal to the currently-applicable Auto Liquidation Threshold (see below): 20% of the initial Live Deposit before the first withdrawal, or 100% of the initial Live Deposit after it. Equity that falls below this level triggers Auto Liquidation (the source says "falls below"; it never states an inclusive at-or-below boundary). |
| Daily Loss Limit                           | Unconfirmed                                                                                                                                                                                                                                                                                                                           |
| Max Contracts                              | Keyed to Live Deposit amount, not account size, see Contract Limits table below.                                                                                                                                                                                                                                                      |
| Consistency Rule                           | Unconfirmed                                                                                                                                                                                                                                                                                                                           |
| News Trading                               | Unconfirmed                                                                                                                                                                                                                                                                                                                           |
| Inactivity Rule                            | Unconfirmed                                                                                                                                                                                                                                                                                                                           |
| Max Active/Concurrent Accounts             | Unconfirmed                                                                                                                                                                                                                                                                                                                           |
| Profit Split                               | "Trader will receive 80% Performance Reward upon each withdrawal request" (the source's own words; it does not separately name a firm-side percentage, though its own section heading is titled "Profit Split").                                                                                                                      |

### Contract Limits

| Live Deposit       | Contract Limit             |
| ------------------ | -------------------------- |
| Below $15,000      | 2 E-mini / 6 Micro E-mini  |
| $15,000 to $30,000 | 3 E-mini / 9 Micro E-mini  |
| Above $30,000      | 5 E-mini / 15 Micro E-mini |

## How Simulated Profit Is Split Into the Live Account

- Eligible Profit = 80% of Total Simulated Profit.
- Of Eligible Profit: 50% → Settlement Withdrawal (instant cash, "Paid within 3–5 business days."); 25% → Live Deposit, used as the starting live balance, capped at $50,000 (excess above the cap goes to Reserve instead); the remaining amount → Reserve, uncapped, used to auto-refill the live account after withdrawals.
- The source notes this distribution "is subject to change based on the trader's evaluation": i.e., the 50/25/remainder split is not stated as unconditionally fixed for every trader.

## How the Auto Liquidation Threshold Works

The source states the threshold locks "in two scenarios," and these are two materially different events, not one number:

**Trigger 1: equity trails to the 80% drawdown level.** Before any withdrawal, the threshold is "set at 20% of your initial Live Deposit," which the source frames as allowing "up to 80% drawdown from your starting balance" (examples given verbatim: "$20,000 deposit → Threshold at $4,000", "$40,000 deposit → Threshold at $8,000", "$50,000 deposit → Threshold at $10,000"). If equity ever falls to or below this 20%-of-deposit level, the source states the account "is automatically liquidated" and "permanently closed": so reaching this trigger does not leave an open account with a newly "locked" floor; it ends the account. The source does not state whether this 20%-of-deposit floor itself moves upward as the account's equity grows before this point (it only ever describes it as "20% of your initial Live Deposit," a fixed reference to the starting deposit, not to a running high-water mark): this is flagged below, not resolved.

**Trigger 2: the first withdrawal.** "After your first withdrawal, the threshold locks permanently at your initial Live Deposit amount" (100% of the deposit, not 20%) and "does not trail or increase, even if your account balance grows." Unlike a typical trailing drawdown, this lock event makes the floor stricter, not looser: it jumps from 20% of the deposit up to the full 100% of the deposit, and stays there for the life of the account regardless of subsequent growth or Reserve refills.

### Worked Example

This example uses the Live account's literal dollar balance throughout, starting at the initial Live Deposit amount (not $0), the source's own framing states the Live Deposit is "used as your starting live trading balance." This is a different mechanic from FundedNext's newer live program (used by Flex, Rapid Pro, and Rapid Daily, documented in `live.md`), whose own mechanics are documented with their own citations in [live.md](live.md); the two programs are not directly comparable on this point, since this Legacy program's Auto Liquidation Threshold is a percentage-of-deposit floor and its own source uses no "trails from $0" framing at all. This example never switches balance conventions partway through, and reproduces the source's own fully-stated "Scenario 1: $50,000 Total Simulated Profit."

1. Total Simulated Profit = $50,000 (the source's own stated starting figure for this scenario).
2. Eligible Profit = 80% × $50,000 = $40,000, matching the source.
3. Distribution: Settlement Withdrawal = 50% × $40,000 = $20,000 (instant cash). Live Deposit = 25% × $40,000 = $10,000: below the $50,000 cap, so nothing is redirected to Reserve on this step. Reserve = remainder = $40,000 − $20,000 − $10,000 = $10,000. All three figures match the source's own stated "Initial Distribution" for this scenario.
4. Auto Liquidation Threshold (pre-withdrawal) = 20% × $10,000 = $2,000, matching the source's own stated "$2,000 (80% of $10K initial)."
5. The trader makes their first withdrawal. Per Trigger 2 above, the threshold now locks permanently at 100% of the initial Live Deposit: $10,000. This matches the source's own stated "After first withdrawal, threshold locks at $10,000 permanently."
6. The trader withdraws a cumulative $10,000 across several requests. Because this stays entirely inside the "first $10,000 withdrawn (cumulative)" band, every dollar withdrawn is matched 100% from Reserve: $10,000 withdrawn × 100% match = $10,000 injected from Reserve. The Reserve started this scenario at $10,000 (step 3), so it is now exactly depleted ($10,000 − $10,000 = $0), matching the source's own stated "Reserve DEPLETED after three withdrawals."

Re-derivation check: starting figure $50,000 → Eligible Profit $40,000 → Live Deposit $10,000 → pre-withdrawal threshold $2,000 (20% of $10,000) → post-first-withdrawal threshold $10,000 (100% of $10,000) → Reserve fully consumed at exactly $10,000 withdrawn. Every number traces back to the first by hand and matches the source's own stated result summary for this scenario.

## Reserve System

The Reserve auto-refills the live account on every withdrawal, in two tiers by cumulative amount withdrawn:

- First $10,000 withdrawn (cumulative): 100% match: "$1 withdrawn → $1 added from Reserve."
- After $10,000 withdrawn (cumulative): 50% match: "$2 withdrawn → $1 added from Reserve."
- The Reserve has no maximum cap and "stops refilling only when fully depleted."
- Once the Reserve reaches $0: "No further automatic refills occur," the trader continues trading the remaining live balance, withdrawals continue under the standard 80/20 split, and the Auto Liquidation Threshold "remains unchanged."

## Payouts

| Parameter                            | Value                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profit Split                         | 80% Performance Reward to the trader per withdrawal request.                                                                                                                                                                                                        |
| Payout Frequency                     | Unconfirmed                                                                                                                                                                                                                                                         |
| Buffer Requirement                   | Not a balance buffer; a rolling profit gate instead: "at least $500 in new closed profit between withdrawal requests," and this "applies to every withdrawal after the first one" (the first withdrawal is not subject to this gate, per the source's own wording). |
| Minimum Payout Request               | $100 per withdrawal request.                                                                                                                                                                                                                                        |
| Max Payout per Cycle                 | Unconfirmed                                                                                                                                                                                                                                                         |
| Consistency on Payouts               | Unconfirmed                                                                                                                                                                                                                                                         |
| Maximum Total Payouts / Lifetime Cap | Unconfirmed. The account's lifecycle instead ends via Full Balance Withdrawal or Auto Liquidation (see below).                                                                                                                                                      |

Additional confirmed payout mechanics: "The CME rules are applicable during the withdrawal requests." Withdrawals cannot be processed during an active trading session; the trading day must be concluded and the request submitted the following day. Processing takes approximately 2-5 business days because withdrawals are "handled directly by NinjaTrader Brokerage," and the source states explicitly that "the FundedNext Brand Promise will not be maintained for Live account withdrawals" as a result.

## Full Balance Withdrawal (Account Exit)

A trader may request their entire live balance, leaving a minimum $160 in the account "as per the closing procedure," after meeting both of:

- 45 Benchmark days, and
- each of those days having at least $150 in profit.

This permanently closes the Live account, and the trader loses access to any outstanding Reserve balance.

## Account Closure (Auto Liquidation)

If the Auto Liquidation Threshold is breached: the account is permanently closed, cannot be reset, and the trader loses access to the Live account along with all remaining Reserve and leftover balance. Withdrawals can also trigger Auto Liquidation indirectly: "Only if the Reserve is depleted and a withdrawal brings your balance down to the Auto Liquidation Threshold, your account will automatically liquidate."

## Multiple Accounts Handling

All of a trader's active FundedNext Futures Accounts are combined when calculating Total Simulated Profit, Eligible Profit, Settlement Withdrawal, Live Deposit, and Reserve.

## Declining or Restarting

Once selected, transition to the Live Trading Program is mandatory and cannot be declined.

## Data Fees

Transitioning to a Live account reclassifies the trader as a "Professional Trader," so professional market data fees apply. These are exchange-set fees, subscribed to monthly directly from the Tradovate dashboard; the source recommends subscribing only to the exchange matching the instruments actually traded (e.g. CME for NQ/ES, COMEX for gold, NYMEX for crude oil) to avoid unnecessary cost.

## Live Transition

This file is itself the terminal live-account stage, entered from the Legacy Challenge's FundedNext Account once a trader is selected for the FundedNext Live Trading Program (see Overview above for the $100,000 Total Active Profits eligibility threshold and the discretionary Risk Desk Team review). There is no further "transition to a different live stage" from here: the account's lifecycle ends only via Full Balance Withdrawal or Auto Liquidation Threshold breach, both described above.

**Flagged, not silently resolved: a known engine/doc scope gap.** This repository's `FundedNextLive.ts` (`src/lib/prop-calculator/firms/fundednext/FundedNextLive.ts`) does not model this program at all. It models a single, fixed-parameter live plan instead: `STARTING_BALANCE = dollars(2000)`, an EOD trailing drawdown that locks at `STARTING_BALANCE + LOCK_OFFSET` where `LOCK_OFFSET = -1000` (i.e. $1,000 below the starting balance), and payout tiers of 100% trader share up to `FULL_SPLIT_WITHDRAWAL_CAP = dollars(5000)` of cumulative withdrawals, then 90% after. That is FundedNext's *newer* live program (used by Flex, Rapid Pro, and Rapid Daily): a fixed small deposit with a $0-based EOD trail and a hard dollar lock offset. It bears no resemblance to the discretionary-eligibility, percentage-of-deposit Auto Liquidation Threshold and 80/20 payout split this file documents, and it has no $5,000 full-split withdrawal tier at all in the Legacy mechanic. None of this file's figures should be checked against, or reconciled with, `FundedNextLive.ts`: that file currently has zero modeled representation of the program described here. This is a genuine, confirmed engine/doc scope gap, not something to silently paper over or match one to the other.

## Not Confirmed By This Source

- **Daily Loss Limit, Consistency Rule, News Trading, Inactivity Rule (Live stage)**: none of these are mentioned anywhere in either of this file's two cited sources. Do not assume any firm-wide policy documented for the Challenge or FundedNext-Account stages (in this repo's other FundedNext files) carries over to the Live stage without its own citation.
- **Max Active/Concurrent Live Accounts**: not stated. Do not assume the newer live program's "up to 5" figure applies to this program.
- **Whether the pre-withdrawal 20%-of-deposit Auto Liquidation Threshold itself trails upward with equity before the first withdrawal**: the source calls the overall system "a trailing end-of-day (EOD) system" but describes the pre-withdrawal Initial Threshold only as a fixed "20% of your initial Live Deposit," never as a formula that moves with a running high-water mark. Do not assume it trails upward the way a classic Maximum Loss Limit does; it may instead be a flat, unchanging floor until one of the two lock events fires. See "How the Auto Liquidation Threshold Works" above.
- **Apparent overlap between "equity trails to the 80% drawdown" as a lock trigger and the liquidation event itself**: the source's "Important Notes" list this as one of the two ways the threshold "is locked," but elsewhere states reaching this same level results in the account being "automatically liquidated" and "permanently closed." The source does not explain how a threshold can be described as "locking" at the exact moment the account it belongs to is being closed. Do not assume this means anything beyond what is stated; treat it as an unresolved ambiguity in the source's own language, not a resolved mechanic.
- **Per-withdrawal breakdown figures inside Scenario 1 and Scenario 2**: the source's own worked examples reference `[IMAGE]` blocks for the individual withdrawal-by-withdrawal numbers, which are not present in this file's source bundle as text. Only the scenarios' summary totals (used in the Worked Example above) could be verified; do not assume any specific per-withdrawal dollar amount beyond what is stated in those summaries.
- **"5 withdrawals from a single Flex Account" as an alternate eligibility path**: the article's own TL;DR callout states eligibility can also be reached via "5 withdrawals from a single Flex Account (or earlier by discretionary review)," but no numbered section in the article body elaborates this path; the body's own "1. Eligibility for Review" section describes only the $100,000 Total Active Profits threshold and case-by-case discretionary review. Do not assume this alternate path applies to Legacy specifically, or that its mechanics match the $100,000-threshold path, without further citation.
- **Max Payout per Cycle, Payout Frequency (fixed cadence), Consistency on Payouts, Maximum Total Payouts/Lifetime Cap**: none stated in either cited source; see the Payouts table above, where each is marked "Unconfirmed." Do not assume Rapid Pro/Daily's stated 5-payout cap applies here: that figure belongs to their funded (FundedNext Account) stage, a different program stage documented in their own plan files, and their own `live.md` file marks its live-stage lifetime cap Unconfirmed too, the same as this file does.
- **Bolt's "one last reward" amount**: the source states the mechanism ("based on the account's rules and available PnL") but gives no dollar figure or formula. Not relevant to Legacy's own numbers, included here only because it is described in the same source article; do not assume any specific amount.

---

**Last Updated:** 2026-09-19
**Sources:**

- <https://helpfutures.fundednext.com/en/articles/14283903-road-to-live-trading-legacy-challenge-rapid-challenge-former> (updated 2026-08-29)
- <https://helpfutures.fundednext.com/en/articles/14284453-what-are-the-data-fees-in-the-fundednext-live-trading-program> (updated 2026-04-08)
