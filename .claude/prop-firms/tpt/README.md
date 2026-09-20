# Take Profit Trader Plans Reference

**Firm website:** <https://takeprofittrader.com>
**Last Verified:** 2026-09-20
**Last Updated:** 2026-09-20
**Source:** see each plan's own file for plan-specific claims; the Firm-Wide Rules below are drawn from help-center articles on `takeprofittraderhelp.zendesk.com` that explicitly state a firm-wide or cross-stage scope (chiefly the Universal Trading Policies and its two linked policy articles, Rule 4, Rule 6, and the Approved Instruments/Restricted Countries/Commissions articles). Fetched directly via Zendesk's public Help Center REST API (`/api/v2/help_center/en-us/articles.json`), which was not behind the same Cloudflare block as the HTML help-center pages themselves. See SOURCES.md.

## Overview

Take Profit Trader (TPT) is structured as a single linear progression, not sibling plans: **Test** (a recurring monthly-subscription evaluation) leads into **PRO** (sim-funded, day-one payouts on simulated trading), which can be upgraded, at TPT's sole discretion, into **PRO+** (TPT's live, real-capital stage, trading directly at the exchange). A reduced-parameter, discretionary sub-variant of PRO+, **PRO+ Development**, also exists for traders showing higher-risk patterns.

Two mechanics change shape as a trader moves through these stages, and neither is uniform across the whole firm : do not assume one figure or one mechanic carries through unchanged:

- **Drawdown mechanic**: Test uses an **EOD (End-of-Day) Trailing Drawdown** (recalculated once daily at close, ignoring intraday swings). PRO uses an **Intraday Trailing Drawdown** instead (recalculated continuously off peak balance, including unrealized gains). PRO+ switches back to an EOD mechanic, but anchored to a literal $0 starting balance rather than the account's nominal size. See `test-pro.md` and `pro-plus.md` for the full mechanics of each.
- **Profit split**: 80/20 (PRO) vs. 90/10 (PRO+).

## Plans

- **[Test → PRO](test-pro.md)** : 5 sizes ($25K/$50K/$75K/$100K/$150K). Monthly-subscription Test evaluation (no one-time eval fee), EOD trailing drawdown, 50%-best-day consistency rule (auto-doubles the profit target rather than failing the account), 3-or-5 minimum trading days depending on purchase date. PRO: intraday trailing drawdown carrying the same dollar amount, 80/20 split, day-one/daily payouts with no consistency rule, no payout scaling, and no maximum withdrawal : gated only by a one-time buffer-zone balance requirement before the first withdrawal.
- **[PRO+ (Live)](pro-plus.md)** : TPT's live, real-capital, invite-only stage, including its PRO+ Development sub-variant. $0 starting balance, EOD drawdown carried over from the trader's originating PRO account, 90/10 split, no buffer-zone requirement per TPT's own materials (see that file's own engine cross-check flag). $5,000 of the originating PRO account's profit is frozen while PRO+ is active.

## Live Accounts

- **[PRO+ (Live)](pro-plus.md)** : TPT's only live/real-capital stage; see Plans above. No further live tier exists beyond PRO+ and PRO+ Development.

## Firm-Wide Rules

Confirmed independently across Test, PRO, and PRO+ unless a narrower scope is stated explicitly below : where a rule is confirmed for some stages and not others, it is scoped accordingly here rather than asserted as blanket firm-wide (Test in particular has no confirmed News Trading restriction or Inactivity/weekly-trading requirement of its own; see `test-pro.md`'s own Not Confirmed section):

- **Bots, algorithmic trading, and automated execution tools are prohibited outright** (not "allowed with conditions"), per Universal Trading Policy #1, confirmed identically across Test, PRO, and PRO+ (UTP's own text; independently restated in PRO Account Rules #1 and PRO+ Account Rules' equivalent).
- **No Counter Positions**: holding opposing positions in the same or closely related product, across any accounts under a trader's own control (alone or coordinated with another trader), is strictly prohibited across all three stages. Named correlated pairs (list explicitly "not exhaustive"): ES↔MES, NQ↔MNQ, YM↔MYM. Hedging using correlated products is also prohibited, not just identical-contract offsetting. A violation automatically liquidates both accounts and forfeits all profit in the violating account, detected via an automated "Counter-Positions Report" system. Per "Rule 6: No Counter Positions," which explicitly calls out protecting "the firm's ability to offer live-market capital to funded accounts (e.g. PRO+)" as a reason the rule exists.
- **Copy trading / trade copiers are permitted only across accounts a trader personally owns and controls**, and only when they do not create coordinated, opposing, or risk-neutralizing positions across those accounts or with other traders. Per the Independent Trade Execution Policy and the Trade Copier Policy (both apply "across all account types: Test, PRO, and PRO+" per Rule 6's own cross-reference). Approved copier tools are named explicitly: Tradesyncer, TradeCopia, Affordable Indicators, Replikanto Flowbot (Compliance Edition only : standard/modified versions are not permitted), and platform-native copier tools (Tradovate, NinjaTrader, MotiveWave, Quantower, and similar). A trader is fully responsible for violations a copier causes, including unintended ones.
- **Approved products: CME, CBOT, NYMEX, and COMEX only** (no EUREX-listed products). Full symbol/product-name/exchange table below, per "Approved Instruments & Permitted Products List."
- **Trading hours: 6:00 PM ET to 5:00 PM ET, no positions held from one trading session to the next**, per "Rule 4: Trade Approved Products, During Approved Hours." TPT auto-closes any open position at 4:55 PM ET (a 5-minute pre-close buffer); trading may resume at 6:00 PM ET, and a trade opened at or after 6:00 PM counts toward the next trading day. Holiday-schedule monitoring is explicitly the trader's own responsibility.
- **Commissions differ by stage, not one flat firm-wide figure**: Test and PRO share an identical, TPT-set (not exchange-passthrough) commission of $4.50 round-trip per mini contract and $1.50 round-trip per micro contract, flat across every permitted product, per "Commissions on Test and PRO accounts." PRO+ uses a genuinely different structure that TPT does not itself publish a table for : it defers entirely to NinjaTrader's (`ninjatrader.com/PDF/ninjatrader_futures_commissions.pdf`) and Tradovate's (`tradovate.com/pricing/`) own separately published pricing, per "Commissions for PRO+." Do not assume the $4.50/$1.50 figures apply to PRO+.
- **Restricted Countries**: TPT maintains its own current list, confirmed at exactly 119 distinct jurisdictions (counted directly from the source, not approximated) : do not reuse or assume overlap with another firm already documented in this repository. Access : including placing a trade or merely viewing market data : from a restricted country is prohibited even once, including via VPN, remote connection, or a shared network routing through one. VPN use is additionally, separately blocked specifically during account registration, regardless of the trader's actual country. Per "Restricted Countries" and "Registration Denial FAQ." The source itself describes restrictions in platform-wide terms rather than naming Test/PRO/PRO+ individually; treating it as applying identically to all three is a reasonable inference in every plan file in this tree, not a directly stated one.
- **KYC (identity verification) is mandatory before trading begins**, via an unnamed third-party verification provider (automated, usually minutes; manual review in some cases, handled 24/5). **KYB (Know Your Business)** verification is required only if a trader chooses to trade as a company, and is limited to US companies. A **POA (Power of Attorney) form** must additionally be signed at PRO-account creation (naming the trader "Manager"), tied to Tradovate as TPT's designated broker for the eventual PRO+ pathway : required for every PRO account, not only ones that go on to actually upgrade to PRO+. Per "Registration Process," "KYC Procedure," "KYB verification," and "Understanding the POA Form."
- **Payout infrastructure** (applies once a payout is possible, i.e. PRO and PRO+; Test has no payouts of its own): balance/dashboard data updates once daily, between 8:00 PM and 9:00 PM ET, not in real time : a trader's real-time balance is only visible on the trading platform itself. Three payout methods: Plaid (US bank accounts, real-time to 1–2 business days), PayPal, or Wise (covers 160 countries, required for LLC payouts unless "your LLC has an established PayPal account"). All three enforce the same AML identity match between the receiving account and the registered TakeProfitTrader user, with different consequences: a Plaid mismatch blocks the connection outright ("you will not be able to connect or receive payouts to that account"), while a Wise or PayPal mismatch means "the payout will be delayed for review or denied." Withdrawal fee: free above $250, a flat $50 fee at or below $250. Per "Payout System," "Withdrawal Fees," "Connecting US Bank Accounts For Payouts," and "Filling out tax forms" (W-9 for US persons/companies, W-8BEN otherwise, via tax-compliance provider ComplyExchange).
- **Self-Match Prevention (SMP)**: all TPT accounts trading through Rithmic/CME Globex-connected platforms operate under a firm-level SMP ID, an automated CME-level safeguard (not a trader-actionable rule) that cancels one side of an order pair that would otherwise self-match against another TPT account, enforcing CME Rule 534 (Wash Trades Prohibited). An occasional "rejected by CME" message is normal and does not affect account standing. Confirmed directly for PRO+ ("Self-Match Prevention (SMP) Implementation for PRO+ Accounts"); not independently confirmed as applying to Test/PRO in the sources read this pass.
- **CME regulatory alignment**: TPT's trading-conduct rules (no counter positions, independent execution, no wash/pre-arranged trades) are explicitly designed around CME Rules 531, 533, 534, 539, and 575, per "CME Market Rules and Regulations" : a compliance-education article, not itself a source of additional numeric TPT-specific figures.
- **News Trading and the weekly Inactivity/trading requirement are confirmed for PRO and PRO+ only, explicitly not for Test** : do not treat either as firm-wide. See each plan file's own tables for the specific rule text and each file's Not Confirmed section for why Test is excluded.
- **Maximum funded accounts and activation throttling apply to PRO/PRO+ only** (Test accounts are unlimited and unrestricted): 5 active PRO/PRO+ accounts total, a single shared pool that "moves with you" into PRO+ : Test accounts do not count against this cap. A separate throttle limits activation of newly-passed tests into PRO to at most 10 within any rolling 30 calendar days. Per "Rules for Multiple Accounts."

### Approved Futures Instruments (CME / CBOT / NYMEX / COMEX)

Per "Approved Instruments & Permitted Products List." No EUREX products; no plain "ZB" or "ZQ" symbol exists on TPT's own list (see each plan file's own Not Confirmed note on the "30-Year Bond" prohibited-news mapping to UB).

| Symbol | Product Name                                            | Exchange |
| ------ | ------------------------------------------------------- | -------- |
| 6A     | Australian Dollar Futures                               | CME      |
| 6B     | British Pound Futures                                   | CME      |
| 6C     | Canadian Dollar Futures                                 | CME      |
| 6E     | Euro FX Futures                                         | CME      |
| 6J     | Japanese Yen Futures                                    | CME      |
| 6N     | New Zealand Dollar Futures                              | CME      |
| 6S     | Swiss Franc Futures                                     | CME      |
| CL     | Crude Oil Futures                                       | NYMEX    |
| E7     | E-mini Euro FX Futures                                  | CME      |
| ES     | E-mini S&P 500 Futures                                  | CME      |
| GC     | Gold Futures                                            | COMEX    |
| HG     | Copper Futures                                          | COMEX    |
| LE     | Live Cattle Futures                                     | CME      |
| MBT    | Micro Bitcoin Futures and Options                       | CME      |
| M2K    | Micro E-mini Russell 2000 Index Futures                 | CME      |
| M6E    | Micro EUR/USD Futures                                   | CME      |
| MET    | Micro Ether Futures and Options                         | CME      |
| MCL    | Micro WTI Crude Oil Futures                             | NYMEX    |
| MES    | Micro E-mini S&P 500 Index Futures                      | CME      |
| MGC    | Micro Gold Futures                                      | COMEX    |
| MNQ    | Micro E-mini Nasdaq-100 Index Futures                   | CME      |
| M6A    | Micro AUD/USD Futures                                   | CME      |
| MYM    | Micro E-mini Dow Jones Industrial Average Index Futures | CBOT     |
| NG     | Henry Hub Natural Gas Futures                           | NYMEX    |
| NQ     | E-mini Nasdaq-100 Futures                               | CME      |
| QI     | E-mini Silver Futures                                   | COMEX    |
| QM     | E-mini Crude Oil Futures                                | NYMEX    |
| QO     | E-mini Gold Futures                                     | COMEX    |
| RTY    | E-mini Russell 2000 Index Futures                       | CME      |
| SI     | Silver Futures                                          | COMEX    |
| UB     | Ultra U.S. Treasury Bond Futures                        | CBOT     |
| YM     | E-mini Dow ($5) Futures                                 | CBOT     |
| ZF     | 5-Year T-Note Futures                                   | CBOT     |
| ZL     | Soybean Oil Futures                                     | CBOT     |
| ZS     | Soybean Futures                                         | CBOT     |
| ZN     | 10-Year T-Note Futures                                  | CBOT     |
| ZT     | 2-Year T-Note Futures                                   | CBOT     |
| ZW     | Chicago SRW Wheat Futures                               | CBOT     |

### Compliance, verification, and account-count enforcement

- **Holiday close times are the trader's responsibility, with a hard consequence**: "Market hours can change due to holidays. It is the trader's responsibility to monitor holiday schedules. Missing a holiday-adjusted close time will result in account liquidation."
- **Liquidation is not always permanent**: "Receiving the liquidation report does not mean your trading privileges are permanently revoked. While the account has been liquidated and associated profits forfeited", reinstatement depends on the circumstances.
- **Tax-form errors block payouts**: "Your payouts may be blocked if you submit incorrect information when signing the tax form."
- **Restricted countries**: "In accordance with CME rules, the associated account(s) will be restricted or blocked without exception."
- **Trade-copier compliance can be audited at any time**: "TakeProfitTrader may require verification of compliance at any time, including version identification, configuration review, or execution behavior analysis. Failure to provide verification upon request may result in enforcement action." Violations may lead to a permanent ban from TakeProfitTrader.
- **Independent trade execution**: a trader may not "Open or operate multiple accounts under separate identities for the purpose of distributing materially similar high-risk trades across accounts." Enforcement is not on a fixed schedule: "Actions are determined based on severity and frequency of violations and may occur before, during, or after a payout review."
- **Passing more tests than you can activate**: the multiple-accounts article's own worked example shows only 5 of 7 passed tests being activatable, because "This particular eligibility is contingent on the presence of either one or none of the PRO accounts being active at that given moment."
- **The POA form follows a passed test**: "Upon successful completion of your trading test, you will have to sign your PRO trader contract. Additionally, we kindly request your prompt completion of the Power of Attorney (POA) form."

## Key Cross-Plan Differences

| Aspect               | Test → PRO                                                                                                                         | PRO+ (Live)                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Account Sizes        | $25K / $50K / $75K / $100K / $150K                                                                                                 | Same 5 PRO-origin sizes; only $50K has a confirmed dollar drawdown figure, see `pro-plus.md`           |
| Eval Cost            | Monthly subscription, no dollar figure confirmed at any size except an unconfirmed $170/month derived for $50K (see `test-pro.md`) | Not applicable : no separate PRO+ purchase exists                                                      |
| Profit Target        | $1,500 / $3,000 / $4,500 / $6,000 / $9,000 (Test)                                                                                  | Not applicable : entry is a discretionary upgrade, not a pass/fail test                                |
| Eval Consistency     | 50% best-day rule (Test); auto-doubles the profit target rather than failing                                                       | Unconfirmed : no fixed numeric rule stated; discretionary "Sustainable Trading Policy" review instead  |
| Min Eval Days        | 3 days (accounts purchased "from August 17th onward", year inferred as 2026) / 5 days (earlier accounts and their resets)          | Not applicable                                                                                         |
| Funded Drawdown Type | EOD (Test) → Intraday (PRO), same dollar amount carried over                                                                       | EOD, anchored to a $0 start, dollar amount unconfirmed except at $50K ($2,000)                         |
| DLL (Funded)         | Unconfirmed / not stated (PRO)                                                                                                     | Unconfirmed / not stated (standard PRO+); PRO+ Development has its own confirmed soft-breach DLL table |
| Sim Payout Split     | 80% / 20% (PRO)                                                                                                                    | 90% / 10% (PRO+)                                                                                       |
| Max Funded Accounts  | 5, shared pool with PRO+                                                                                                           | 5, shared pool with PRO                                                                                |
| Inactivity Rule      | Unconfirmed for Test; 1+ traded day per calendar week (Sun–Fri) for PRO                                                            | Same weekly requirement as PRO, confirmed directly                                                     |
| Lifetime Sim Payouts | Unconfirmed (no cap stated either way)                                                                                             | Unconfirmed (no cap stated either way)                                                                 |
| Live Transition      | Discretionary upgrade to PRO+, trigger/criteria not fully specified                                                                | Terminal stage; no further live tier beyond PRO+/PRO+ Development                                      |

Every row traces back to the matching row in each plan's own file; where a plan file marks a figure Unconfirmed, this table repeats that status rather than asserting a cleaner-looking number.

## Documentation Scope

**Explicitly out of scope, not documented in this tree:**

- **Rewards/points program, Affiliate program** : business/loyalty mechanics (points per milestone, tier levels, affiliate commission structure, banner customization, referral tracking), not trading rules. Nine dedicated articles exist across "About Rewards" and "Affiliate FAQ's"; read in full to confirm they contain no trading-rule content.
- **Platform connection guides** (CQG/Rithmic data-feed activation, and 8 platform-specific connection walkthroughs: NinjaTrader 8, TradingView, BookMap, Quantower, MultiCharts, MotiveWave, Finamark) : pure setup instructions, no trading rules. Read in full.
- **Control Center / dashboard navigation articles** (password/MFA management, subscription navigation, account-finding, wallet UI, log-file downloads, "How TPT Compares," "Understanding the Simulation") : UI/onboarding content, no trading rules. Read in full.
- **Support logistics** (Live Chat hours: Sunday 4:00 PM ET – Friday 4:30 PM ET; 8 supported languages) : operational detail, not a trading rule.
- **Promo codes (NOFEE40/50/30, 50AND3)** : time-limited discount offers; used in this pass only as independent corroboration for figures that are otherwise stable (the $130 activation fee, the "no funded consistency rule / no scaling / no maximum withdrawal" PRO payout language, and the 5-day-to-3-day evaluation-period change), not documented as standing rules in their own right since the discount percentages and sale windows are time-limited by nature.
- **"Withdrawing from the Buffer"** (a one-time, termination-only 50%/80% leftover-buffer-profit split, confirmed directly this pass) and the **$5,000 PRO+ profit-freeze mechanic** (confirmed directly this pass, new this pass) are both documented in full in `test-pro.md` and `pro-plus.md` respectively, but neither is modeled anywhere in this repository's simulator engine : reported per the `prop-firm-docs` skill's own scope, not fixed here.
- **PRO+ Development** is documented in full in `pro-plus.md` but does not exist anywhere in this repository's engine (`TptLive.ts` has no Development branch at all) : a genuinely new, third account tier this pass discovered, not merely a missing detail on an existing one.
- **Engine/doc mismatches found this pass, not fixed by this skill** (reported per its own instructions): `TptLive.ts`'s `buildTptLivePlan` hard-codes a single $50,000-origin size with a $2,000 drawdown and no freeze/loss-handling logic : a scope limitation, not a value error. Two engine/doc conflicts reported by an earlier pass were re-checked on 2026-09-19 against the actual source and do not exist: `TptLive.ts` sets `requiresLockForWithdrawal: false` and `LivePlan.withdrawableAmount()` honours that flag, so the engine does not gate a PRO+ withdrawal behind the drawdown lock and does not contradict "Advantages of PRO+"'s "No buffer zone requirement for withdrawal"; and `LivePlanInit` does have a `maxConsecutiveIdleDays` field, which `TptLive.ts` sets to 7, so the weekly-trading requirement is modeled. The remaining caveat there is the derivation, not a missing field: 7 days is carried over from PRO's own weekly requirement, and a calendar-week rule is not identical to a rolling 7-idle-day counter.
