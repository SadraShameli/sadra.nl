# MyFundedFutures Rapid Live

**Sources:**

- <https://help.myfundedfutures.com/en/articles/13134718-understanding-rapid-live> (Updated: September 8, 2026)
- <https://help.myfundedfutures.com/en/articles/13286746-rapid-plan-reserve-program-performance-bonus-structure> (Updated: January 16, 2026)

**Last Verified:** 2026-09-20
**Last Updated:** 2026-09-20

## Overview

Rapid Live is the live-trading stage for traders transitioning from a Rapid Sim Funded account. Both of this file's own cited sources ("Understanding Rapid Live" and the Reserve Program article) describe Rapid specifically; neither one names Rapid EOD. This file is also shared by rapid-eod.md — that plan's own source states directly ("Live transition on Rapid EOD 50k follows the same rules as standard Rapid 50k"), which is the citation establishing Rapid EOD's applicability here, not a claim made independently by this file's two sources. Upon transition, traders operate actual capital on behalf of My Funded Futures with a tiered structure based on their Sim Funded account size. The live account is governed by an end-of-day maximum loss limit that trails with the account's balance and stops advancing once it reaches zero, along with a reserved allocation from Sim Funded profits that serves as breach protection or performance bonus.

## Live Account Parameters

| Parameter        | Rapid 25k                                                                                               | Rapid 50k                      | Rapid 100k                     | Rapid 150k                     |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------ | ------------------------------ |
| Initial Balance  | $0                                                                                                      | $0                             | $0                             | $0                             |
| Max Loss Limit   | $1,000                                                                                                  | $2,000                         | $3,000                         | $4,500                         |
| Drawdown Type    | End-of-Day (EOD)                                                                                        | End-of-Day (EOD)               | End-of-Day (EOD)               | End-of-Day (EOD)               |
| Drawdown Floor   | Max Loss threshold stops at $0                                                                          | Max Loss threshold stops at $0 | Max Loss threshold stops at $0 | Max Loss threshold stops at $0 |
| Max Contracts    | 2 mini / 20 micro                                                                                       | 3 mini / 30 micro              | 6 mini / 60 micro              | 8 mini / 80 micro              |
| Profit Split     | 90/10                                                                                                   | 90/10                          | 90/10                          | 90/10                          |
| Payout Frequency | Daily (see Not Confirmed: a firm-wide Live Accounts article frames live payout frequency as negotiated) | Daily                          | Daily                          | Daily                          |

### Multiple Accounts

Per the "Understanding Rapid Live" article: "When multiple Rapid accounts are transitioned to Live, the Max Loss Limit increases proportionately based on how many accounts are moved. Instead of multiple Live accounts, parameters are combined into one Live account. The Max Contracts will be discussed with the Live team in this case." A trader transitioning more than one Rapid account does not end up with multiple separate Live accounts — they are combined into a single Live account with a proportionally larger Max Loss Limit, and Max Contracts is set case-by-case with the Live team rather than following the single-account table above.

## How the Drawdown Works

Rapid Live accounts begin at $0 balance and operate under an end-of-day calculated maximum loss limit. The maximum loss limit trails upward based on the account's end-of-day balance. Once the maximum loss limit reaches $0, it stops trailing and becomes locked at that floor. Reaching the maximum loss limit triggers immediate account closure. The source states the negative balance without an intraday-only qualifier: "Rapid Live accounts start at $0, so balances may go negative until the maximum loss limit trails up to $0. This is expected and normal." On that wording the end-of-day closing balance itself may be negative, not only the intraday balance.

### Worked Example

Starting Rapid Live at $0 (matching the source's own "Initial Balance | $0"), consider the Rapid 50k tier with a $2,000 Max Loss Limit. The floor at any point is min($0, peak EOD profit so far − $2,000), per the source's own "Drawdown Floor | Max Loss threshold stops at $0" — every step below re-derives from this formula and from the previous step's own numbers.

Day 1: EOD balance closes at +$1,500 (a new peak profit). Since peak profit ($1,500) is still below the $2,000 Max Loss Limit, the floor is $1,500 − $2,000 = −$500. The account can close as low as −$500 the next day without breaching.

Day 2: EOD balance closes at +$2,300 (a new peak profit, now exceeding the $2,000 Max Loss Limit). The floor is min($0, $2,300 − $2,000) = min($0, $300) = $0 — it locks at $0 rather than continuing to $300, because the source states the threshold "stops at $0." From this point forward, the account must close each trading day at or above $0 to remain active.

Day 3: EOD balance closes at +$1,800 (a decline from the $2,300 peak, due to trading losses). This is still above the locked $0 floor, so the account remains active. The floor itself does not move — it stays locked at $0 regardless of this decline, consistent with the source's own "Your Max Loss Limit trails based on your EOD balance until the MLL reaches $0." (i.e., it stops adjusting once at $0).

Day 4: EOD balance closes at −$50 (a further decline). Because the floor is locked at $0 and the account has closed below it, this triggers immediate Live account closure, per the source: "Reaching the Maximum Loss Limit results in immediate Live account closure."

## Live Account Transition Criteria

Traders may transition from Rapid Sim Funded to Rapid Live through two primary pathways:

**Automatic Live Transition:** Generating $10,000 in net profit within a single trading session triggers immediate Live account transition. Upon meeting this criterion, any profit exceeding $10,000 for that trading day is forfeited.

**Risk Management Team Approval:** The Risk Management Team evaluates consistent payout performance and may approve Live transition at their sole discretion, considering multiple profitable trading sessions and comprehensive performance metrics. The Risk Management Team reserves the right to contact traders at any time to offer Live account transition opportunities.

### Worked Examples

**Example 1:** A trader generates $10,000 net profit in a single trading day on their Sim Funded account, triggering automatic Live transition. Of the $10,000 profit, $5,000 is allocated to the Reserve Program while the remaining $5,000 becomes available for withdrawal under standard payout protocols. The Sim Funded account is subsequently set to dormant status as Live account transition commences.

**Example 2:** A trader demonstrates consistent payout achievement on a Rapid Sim Funded account and receives Risk Management Team approval for Live transition with $7,000 in total account profits. Upon transition, $5,000 is allocated to the Reserve Program while the remaining $2,000 becomes available for withdrawal under standard payout protocols. The Sim Funded account is subsequently set to dormant status as Live account transition commences.

## Live Account Transition Process

Upon Rapid Sim Funded account transition to Live:

- The existing Sim Funded account is placed in dormant status. Any remaining Sim Funded profits exceeding the Reserve allocation become available for withdrawal under standard profit-sharing arrangements.
- All simulated trading accounts and additional purchases are suspended during Live account operation.
- Up to $5,000 of Sim Funded profits are allocated to Reserve Program balance.
- Traders now operate a Live account, managing actual capital on behalf of My Funded Futures.
- **Setup turnaround**: it typically takes 2-4 business days or less for a Live account to be fully set up; wait times may be extended if additional documents are required, per the generic Live Accounts FAQ.

## Reserve Program and Performance Bonus Structure

Upon Live account transition, up to $5,000 of Sim Funded profits are held within a Reserve Program balance. Reserve funds serve two purposes: they may be accessed if your Live account is breached (see Live Account Closure Procedures below), or they may be distributed as a Performance Bonus upon achieving Live account milestones.

Reserve funds are unlocked as a Performance Bonus upon achieving both of the following criteria:

- 20 profitable trading days on the Live account, **and**
- $10,000 in cumulative gross payouts from the Live account.

Upon satisfying both conditions, traders receive a Performance Bonus equivalent to their remaining Reserve Program balance.

When more than one Rapid account is transitioned to Live, their reserve balances are unlocked together as a single performance bonus (the source does not state how balances are held prior to that point — see Not Confirmed). The required $10,000 cumulative-gross-payouts figure is proportional to the number of Rapid accounts transitioned; the source does not state whether the 20-profitable-trading-days criterion also scales — see Not Confirmed.

## Live Account Closure Procedures (Maximum Loss Breach)

Should the Live account reach its Maximum Loss Limit, account closure occurs with the following sequence:

- **Negative Live Account Balance:** Reserve Program Balance is utilized to offset the negative amount.
- **Remaining Reserve Program Balance:** Any funds remaining after offsetting the Live account deficit are re-deposited into the dormant Sim Funded account. The Sim Funded account is converted to withdrawal-only status, serving exclusively for withdrawing re-deposited balances, after which permanent account closure occurs.

**Example:** A trader maintains $5,000 in Reserve when their Live account closes at -$1,500. The $1,500 deficit is deducted from the Reserve to offset the Live account negative balance. The remaining $3,500 is re-deposited into the trader's Sim Funded account.

## Sim Funded Buffer Withdrawal Procedures

Remaining Sim Funded buffer funds may be withdrawn exclusively following Live account breach, according to these terms:

- **Sim Funded accounts traded for less than 30 trading days:** Traders receive 50% of buffer funds, subject to standard profit-sharing arrangements.
- **Sim Funded accounts traded for more than 30 trading days:** Traders receive 80% of buffer funds, subject to standard profit-sharing arrangements.

## Post-Breach Cooldown Period Protocol

Following Live account closure due to Maximum Loss breach, a 21-day cooldown period is initiated:

- **During Cooldown (21 calendar days):** All Sim Funded account trading is prohibited. New Evaluation purchases, account resets, or additional account acquisitions are prohibited.
- **Post-Cooldown (after 21 calendar days):** Cooldown restrictions are lifted. Traders can continue from active Sim Funded account (if applicable) and/or purchase new Evaluations or accounts, unless communicated otherwise by the team.

**A discretionary "Path Back to Live" program exists.** A trader who loses their Live account can share feedback and inquire about options for returning to Live; in some cases a "Path Back to Live" plan may be offered, based on the trader's own trading history, to shorten that journey. Not a standing entitlement, per the generic Live Accounts FAQ.

## Other Confirmed Rules

**2% CME Price Limit Rule applies here.** Per the firm-wide "2% Price Limit Rule" article (found via a full sitemap sweep of `help.myfundedfutures.com`, see SOURCES.md), trading is prohibited whenever a product is within 2% of its own CME price limit, and this restriction is explicitly enforced on "Sim Funded Account and Live Funded Account," naming this file's own account type directly, not just Sim Funded. See README.md's Firm-Wide Rules for the full mechanic (daily 5:05 PM EST price-limit recalculation, trader's own responsibility to monitor).

**Rapid Live has no buffer at all.** "There is no buffer requirement on the Rapid Live account." Unlike the Sim Funded stage, no balance threshold gates a payout request.

## Not Confirmed By This Source

- **Payout Frequency, stated as a flat cadence but framed as negotiated elsewhere** — the plan-specific source gives "Daily", while MFF's firm-wide Live Accounts article states live payout frequency "is determined based on an agreement between you and our Risk Team." Do not treat the daily cadence as an unconditional guarantee on a live account.
- **Daily Loss Limit (Intraday Limit)** — no Rapid-Live-specific source states one, but two firm-wide Live-account articles point the other way and are not reconciled by any source read here: one states "Yes, all Live accounts have different limits to both their position size and Daily Loss Limits (DLL)" while linking only Core/Scale/Pro-specific figures, never a Rapid one; the other lists a "Customizable Daily Loss Limit: You can set a daily loss limit tailored to your risk tolerance and trading style." Do not assume Rapid Live has no daily loss limit, and do not assume any Core/Scale/Pro figure applies to it. Weak, non-affirmative supporting context: MFF's own live pricing page (`myfundedfutures.com/plans/rapid`) has a "LIVE ACCOUNT" data table listing Initial Balance, Max Loss Limit, Drawdown Type, Drawdown Floor, Max Contracts, Payout Frequency, and Profit Split (independently verified via raw HTML/JSON, matching this file's already-confirmed Live Account Parameters table exactly) — with no Daily Loss Limit row anywhere in it. Absence from a comprehensive-looking table is suggestive, not a source affirmatively stating "none."
- **Consistency Rule (Profitable Days Requirement)** — The cited sources do not state whether Rapid Live accounts have a minimum consistency or minimum profitable trading days requirement for continued account operation. The Reserve Program requires 20 profitable days for performance bonus unlock, but this is a bonus-unlock trigger, distinct from any mandatory trading consistency requirement. Do not assume such a requirement applies to keeping the account open. **Correction of an earlier research misattribution:** an initial pass over `myfundedfutures.com/plans/rapid` reported "Consistency Rule: None" as Live-account data. Independently re-verified via raw JSON: that figure lives in a separate "PAYOUT POLICY" section (internal field name `"kind":"consistencyFunded"`) whose values (Required Buffer $2,100 for the 50K tier, Consistency Rule None, Min Payout $500) exactly match rapid.md's already-confirmed **Sim-Funded** payout data — not the page's own distinct "LIVE ACCOUNT" table, which has no Consistency Rule row at all. This gap remains genuinely unconfirmed for Rapid Live specifically.
- **Payout Request Minimum** — The cited sources do not state a minimum payout request amount for Rapid Live payouts. Do not assume Rapid Live has a minimum payout request size without a separate citation. Same correction as above applies: the "$500" figure an initial research pass attributed to Rapid Live actually belongs to the page's Sim-Funded "PAYOUT POLICY" section (`"kind":"minPayout"`), not its "LIVE ACCOUNT" table, which has no Min Payout row of its own. The generic "Comprehensive FAQ - Live Accounts" article's firm-wide "$250" minimum withdrawal figure (see README.md's Firm-Wide Rules) is the only Live-scoped figure found anywhere, and it is plan-agnostic rather than Rapid-specific — still not a confirmed Rapid-Live-specific citation.
- **Pre-unlock Reserve accounting for multiple transitioned accounts** — the Reserve Program article states only that reserve balances from multiple transitioned accounts "are unlocked together as a single performance bonus." It does not state whether each account's reserve is tracked separately before that point or pooled immediately on transition. Do not assume either treatment.
- **Whether the 20-profitable-trading-days criterion scales with multiple transitioned accounts** — the source states only that "the required profits are proportional to the number of Rapid accounts transitioned," which is naturally the $10,000 cumulative-payouts figure. Do not assume the day-count criterion also scales.
- **Rapid EOD's applicability to this file** — neither of this file's own two cited sources names Rapid EOD. Rapid EOD's own article ("Rapid EOD 50k – A Comprehensive Look") is the source establishing that it shares this file's mechanics; if that citation is ever found to be wrong or superseded, this file's content should not be assumed to apply to Rapid EOD without re-checking that specific claim. Do not treat this file’s own two cited sources as themselves covering Rapid EOD.

**Sources:**

- <https://help.myfundedfutures.com/en/articles/13134718-understanding-rapid-live> (Updated: September 8, 2026)
- <https://help.myfundedfutures.com/en/articles/13286746-rapid-plan-reserve-program-performance-bonus-structure> (Updated: January 16, 2026)
- <https://help.myfundedfutures.com/en/articles/9698984-2-price-limit-rule> ("Updated over 3 weeks ago"), found via a full sitemap sweep of `help.myfundedfutures.com`. Firm-wide article, source of the 2% Price Limit Rule note above.
- <https://myfundedfutures.com/plans/rapid> — no "last updated" date visible. Fetched live and independently verified via raw HTML/JSON (not WebFetch's summarization pass, which had misattributed this page's Sim-Funded payout data to the Live account — see the corrections above). Its "LIVE ACCOUNT" table corroborates Max Loss Limit, Drawdown Type, Drawdown Floor ("stops at $0"), Max Contracts, Payout Frequency, and Profit Split already confirmed in the Live Account Parameters table above; contributes only weak, non-affirmative context for the Daily Loss Limit gap (absent from that table, not stated as "none").

**Last Updated:** 2026-09-20
