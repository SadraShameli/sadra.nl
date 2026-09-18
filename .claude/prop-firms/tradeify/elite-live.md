# Tradeify Elite Live (Shared Live Stage — 25K / 50K / 100K / 150K / 300K)

**Sources:**

- https://help.tradeify.co/en/articles/12969284-tradeify-elite-program (update date not shown in this pasted dump; primary source for every table and mechanic in this file)
- https://help.tradeify.co/en/articles/14369021-tradeify-pricing-reference (update date not shown; corroborates the 80/20 Elite Live profit split only)
- https://help.tradeify.co/en/articles/12853966-select-flex-and-select-daily-payout-policies (update date not shown; corroborates the 3-payouts-on-one-account / 10-total eligibility thresholds only, via its own "Path to Live (Select)" subsection)
- https://help.tradeify.co/en/articles/13252431-select-vs-growth-choosing-your-evaluation-type (update date not shown; cited only for a conflicting eligibility-threshold claim — see Not Confirmed)

**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18

## Overview

Tradeify Elite Live is the firm's single, shared live-account stage. Growth, Select Daily, Select Flex, and Lightning Funded all transition into this same tier at Tradeify's sole discretion — it is not purchased directly, and a trader cannot choose to skip it into a different live product. Every Elite Live account is issued with a literal $0 starting balance (no Sim profit carries over), uses a fixed (not trailing) end-of-day drawdown that is recalculated once per day, carries no Daily Loss Limit, and pays out on an 80% trader / 20% firm split — a materially different split from every Sim Funded plan in this tree, which pay 90/10. A trader can hold up to five Elite Live accounts simultaneously, one per Sim Funded account that was eligible (i.e. had received at least one payout) at the time of transition.

This file was previously blocked entirely: the sole identified source for Elite Live's own operating parameters, the Tradeify Elite Program help-center article, returned a Cloudflare challenge on every fetch method tried in the prior research pass (direct fetch, WebFetch, and a rate-limited Wayback Machine retry). It is now available as a user-provided paste and is used directly below.

## Evaluation

| Parameter                | Value                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Starting Balance         | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| Profit Target            | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| Drawdown Type            | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| Drawdown Amount          | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| Minimum Balance at Start | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| Daily Loss Limit         | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| Max Contracts            | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| Consistency Rule         | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| Minimum Trading Days     | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| News Trading             | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| Inactivity Rule          | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| One-Time Eval Fee        | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |
| Reset Fee                | N/A - reached only via discretionary transition from a Sim Funded account, not purchased directly |

## Live Account

**Note on tier structure:** Elite Live's drawdown amount, contract limits, and lock-trigger balance all vary by the account size that transitions to live (25K, 50K, 100K, 150K, or 300K). See the per-tier tables below the main table.

| Parameter                      | Value                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting Balance                | $0 for every tier, confirmed explicit ("Elite Live accounts are issued with a $0 starting balance"; "All accounts start with a balance of $0.")                                                                                                                                                          |
| Drawdown Type                   | End-of-Day (EOD), fixed — NOT trailing in the sense used at the Sim Funded stage. Per the source, verbatim: "the drawdown limit is recalculated and adjusted once at the end of each trading day — not in real time. As profits accumulate throughout the day, the drawdown limit will move up to reflect those gains at the daily close, locking in a higher floor for the trader." |
| Drawdown Amount                 | Varies by tier: 25K $1,500 / 50K $2,000 / 100K $3,000 / 150K $4,500 / 300K $6,000 (see Elite Account Parameters table below)                                                                                                                                                                              |
| Drawdown Lock                   | Trigger: EOD balance reaches $100 above the tier's drawdown amount — per the source's own "When Does Drawdown Lock?" table: 25K → $1,600 / 50K → $2,100 / 100K → $3,100 / 150K → $4,600 / 300K → $6,100. Locked value: $100 above the $0 starting balance — i.e. a flat $100 floor for every tier (the source frames withdrawable profit as anything "ABOVE your trading capital," and its "Payout Requests & Drawdown Adjustment" section describes a pre-lock vs. post-lock state around this same $100-over trigger). The article does not restate, word-for-word, that the floor is permanently fixed after this trigger the way the firm-wide Sim Funded "Rules: Trailing Max Drawdowns" article does for the Sim stage — see Not Confirmed. |
| Minimum Balance (ongoing)       | Unconfirmed — not stated as a figure distinct from the Drawdown Amount/Lock figures above. Do not assume it equals $0, the drawdown floor, or any other value.                                                                                                                                            |
| Daily Loss Limit                | No DLL — confirmed explicit for every tier in the Elite Account Parameters table ("DLL: No DLL," all five tiers), and restated in prose: "Elite Live accounts include fixed drawdowns, expanded contract limits, and no Daily Loss Limit (DLL)."                                                        |
| Max Contracts                   | Two tiers per account size — below the drawdown floor vs. above it — see Elite Account Parameters table below.                                                                                                                                                                                            |
| Consistency Rule                | Unconfirmed — no consistency requirement is stated anywhere in the Elite Program article for Elite Live accounts. Do not assume it carries over from whichever Sim Funded plan (Growth/Select/Lightning) the account transitioned from, and do not assume it is confirmed absent either.                |
| News Trading                    | Unconfirmed — not mentioned anywhere in the source.                                                                                                                                                                                                                                                        |
| Inactivity Rule                 | Confirmed — at least one executed (filled) trade every 30 days, or the account closes for inactivity. This is an Elite-Live-specific rule; see Path to Live / Eligibility below for the full statement and an explicit scope note.                                                                       |
| Max Active/Concurrent Accounts  | Up to 5 — one Elite Live account per eligible Sim Funded account (i.e. one that had received at least one payout at transition time), capped at 5 total.                                                                                                                                                 |
| Profit Split                    | 80% trader / 20% firm — confirmed, explicitly different from the 90/10 Sim Funded split. Per the source: "80/20 Profit Split: 80% of payouts go to the trader, 20% to Tradeify." Independently corroborated by the Tradeify Pricing Reference article ("Elite Live accounts: 80% to trader / 20% to Tradeify"). |

### Elite Account Parameters by Tier

| Account   | Start Balance | EOD Drawdown | Contracts ($0 → DD) | Contracts (Above DD) | DLL     |
| --------- | -------------- | ------------- | --------------------- | ----------------------- | ------- |
| 25K Elite  | $0            | $1,500        | 1 mini / 10 micro     | 2 mini / 20 micro       | No DLL  |
| 50K Elite  | $0            | $2,000        | 2 mini / 20 micro     | 4 mini / 40 micro       | No DLL  |
| 100K Elite | $0            | $3,000        | 4 mini / 40 micro     | 8 mini / 80 micro       | No DLL  |
| 150K Elite | $0            | $4,500        | 6 mini / 40 micro     | 12 mini / 120 micro     | No DLL  |
| 300K Elite | $0            | $6,000        | 8 mini / 60 micro     | 10 mini / 100 micro     | No DLL  |

"These values apply to all Select, Growth, and Lightning accounts" per the source. The 300K tier's only confirmed Sim-side origin in this tree is Select's own "300K (limited release)" evaluation size (per the Tradeify Pricing Reference article) — Growth's and Lightning's own sourced material in this tree does not document a 300K size.

### When Does Drawdown Lock?

| Live Account Transitioned | Starting Balance | Drawdown | Lock Trigger (EOD Balance) |
| --------------------------- | ------------------ | --------- | ----------------------------- |
| 25K                          | $0                 | $1,500    | $1,600                        |
| 50K                          | $0                 | $2,000    | $2,100                        |
| 100K                         | $0                 | $3,000    | $3,100                        |
| 150K                         | $0                 | $4,500    | $4,600                        |
| 300K                         | $0                 | $6,000    | $6,100                        |

## How the Drawdown Works

Elite Live's drawdown is EOD-only: it is recalculated once at the end of each trading day, not enforced or adjusted in real time. As the account's EOD balance rises, the drawdown limit rises with it, "locking in a higher floor" each day — until the EOD balance reaches $100 above the tier's drawdown amount (the "Lock Trigger" above), at which point the source describes the account as having a "locked" drawdown state.

A separate, interacting mechanic governs payout timing: if a trader requests a payout before the drawdown has locked — i.e. before EOD balance reaches that $100-over trigger — the payout is not processed immediately. It is held and processed the next business day, after the EOD drawdown adjustment has already taken place. Because the adjustment happens first and the payout is deducted second, this reduces the trader's effective drawdown room going into the next session versus what it would have been had no payout been requested (or had it been requested after the lock).

### Worked Example

This example uses a literal $0-based balance convention throughout, matching the source's own framing: "Assume a 50K Elite account with an initial End-of-Day drawdown of $2,000 and a starting balance of $0." Every number below is the account's actual dollar balance, not a nominal-balance-plus-profit figure.

1. Start of Day 1: balance $0. Drawdown limit is $2,000 (the tier's full drawdown amount, since the account hasn't yet reached the $2,100 lock-trigger balance).
2. During Day 1: the account makes $500 profit intraday (balance conceptually at $500). Before the day closes, the trader requests a $500 payout. Because the EOD balance ($500) is still well below the $2,100 lock trigger, the payout is not processed immediately — it is marked pending, to be processed the next business day.
3. End of Day 1: EOD balance closes at $500, a new high. The drawdown limit moves up by $500 to reflect that gain.
4. Start of Day 2: the pending $500 payout is now processed, bringing the balance back down to $0. But the drawdown limit had already moved up based on the $500 EOD balance before the payout was deducted — so the trader is left with only $1,500 of effective drawdown room ($2,000 original amount − $500 already "spent" by the adjust-then-deduct sequence), not the full $2,000.

Re-derived by hand: $2,000 (tier drawdown amount) − $500 (profit made, then paid out, after the EOD limit had already adjusted upward for it) = $1,500 effective drawdown room entering Day 2. This matches the source's own stated outcome exactly. Per the source's own key takeaway: "Even though $500 in profit was made, requesting a payout before the EOD lock means the drawdown adjusts upward first, and then the payout is deducted — leaving the trader with only $1,500 of effective drawdown room instead of $2,000."

This is a distinct mechanic from every Sim Funded worked example in this tree — payout timing interacts directly with drawdown-lock timing here, which has no equivalent at the Sim Funded stage.

## Payouts

Elite Live traders may request payouts daily. Only profit earned above the account's trading capital may be withdrawn — since trading capital is $0 for every tier, this means any accumulated profit is withdrawable, split 80% to the trader / 20% to Tradeify. Source example: "Your 150K Elite account starts with $0 trading capital. You grow it to $15,000. You can withdraw the $15,000 profit (at 80/20 split = $12,000 for you)." If a payout brings the account balance to exactly $0, the Elite Live account closes.

| Parameter                            | Value                                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profit Split                          | 80% trader / 20% firm — confirmed (see Live Account table above)                                                                                   |
| Payout Frequency                      | Daily — confirmed ("Traders may request payouts daily.")                                                                                            |
| Buffer Requirement                    | Not stated as a distinct minimum-cushion figure. The only "$100-over" number in the source governs the drawdown-lock/payout-timing mechanic above (see How the Drawdown Works), not payout eligibility itself — do not conflate the two. |
| Minimum Payout Request                | Unconfirmed — no minimum dollar amount is stated for Elite Live payout requests.                                                                    |
| Max Payout per Cycle                  | Not stated as an explicit dollar cap. The source states only "Any amount above the trading capital may be withdrawn" — functionally uncapped by profit availability, but this is not the same as an explicit "no cap" statement. See Not Confirmed. |
| Consistency on Payouts                | Unconfirmed — no consistency requirement on Elite Live payouts is stated anywhere in the source.                                                    |
| Maximum Total Payouts / Lifetime Cap  | Unconfirmed — not stated. (Note: a payout that brings the balance to exactly $0 closes the account — this is a balance-triggered closure rule, not a stated lifetime payout-count cap; do not conflate the two.) |

## Path to Live / Eligibility

**Eligibility thresholds.** A trader becomes eligible to be *considered* for Elite Live once they meet one of two minimum thresholds: **3 payouts on a single account**, or **10 total payouts since the last live transition** across all plan types. These are measured since the trader's last Live Transition, or since their first purchase if they have never transitioned to Live before. The source is explicit that these are minimum-consideration thresholds, not automatic qualification: "these thresholds represent the minimum requirements for consideration, not automatic qualification... most traders will not be transitioned to live immediately upon hitting these thresholds." Tradeify evaluates holistically (consistency, risk management, overall trading behaviour) and reaches out directly when a trader is selected. These same two thresholds are independently corroborated, word-for-word, by the "Select Flex and Select Daily: Payout Policies" article's own "Path to Live (Select)" subsection, which states they "Applies across Select, Growth, Lightning equally."

**Transition process.** Once Tradeify selects a trader for transition: (a) all Sim Funded and evaluation accounts close; (b) any funded account that has received at least one payout transitions to its own Elite Live account — a funded account with zero payouts does not transition; (c) any trades or progress made after that account's last successful payout is not included in the transition. Each transitioning funded account becomes its own separate Elite Live account (up to 5), sized to match the Sim account it came from. Example from the source: a trader with two 50K Select Daily and two 50K Lightning Funded accounts, each with at least one payout, is granted four separate 50K Elite Live accounts.

**Drawdown-lock vs. payout-timing interaction.** See the Worked Example above — a payout requested before an account's EOD drawdown has locked (before EOD balance reaches $100 above the drawdown amount) is held and processed the next business day, after the drawdown has already adjusted upward, which reduces the effective drawdown room the trader has going into the next session.

**Legacy Live vs. Elite Live.** Traders whose account was purchased before December 3, 2025 may choose between the Legacy Live program and the Elite Live program described in this file. Accounts purchased on or after December 3, 2025 follow Elite Live only; the Elite Live program is not retroactive, and existing Legacy Live traders keep their original terms. Legacy Live's own operating parameters are not detailed in this file's cited source and are not documented here — see Not Confirmed. Per the source's own FAQ, payouts made from a Legacy Live account do not count toward Elite eligibility — only payouts from Sim Funded accounts do ("Do payouts from my Legacy Live account count toward Elite eligibility? ... No. Only payouts from Sim Funded accounts count toward Elite eligibility.").

**Elite-Only Mode.** Tradeify reserves the right to designate certain traders as "Elite-Only Mode" based on performance, consistency, or internal risk assessment. Elite-Only Mode traders can only trade via the Select plan; if they pass a Select evaluation while in this mode, they skip the Sim Funded phase entirely and are issued a Live account directly. A discount applies to their first individual purchase in this mode (single accounts only, bundles excluded); all subsequent purchases are full price.

**Sim/Live mutual exclusivity (household-wide).** A trader cannot have Sim Funded and Live (Legacy or Elite) accounts active at the same time — Sim and Live accounts require different, mutually-exclusive data subscriptions. This restriction applies to the trader's entire household: while a trader has an active Live account, no one else in their household can hold a Sim account, and the trader cannot purchase or activate new evaluations or open new Sim Funded accounts. After a Live account fails or closes, the trader may purchase new evaluations or funded accounts after the cool-off period below; payouts from the trader's previous Sim accounts do not count toward re-qualifying for a new Elite transition.

**Inactivity rule (Elite Live only).** Elite Live accounts must place at least one executed (filled) trade every 30 days, or the account is closed for inactivity. Placing an unfilled order, or logging into the platform without trading, does not count. This 30-day rule is specific to the live stage documented in this file — it is a separate, independently-confirmed rule from the still-unconfirmed Sim-stage inactivity question flagged in this tree's growth.md, select-daily.md, select-flex.md, and lightning.md files (those files' 7-day Sim-stage inactivity uncertainty does not apply here, and this 30-day Elite Live rule should not be read back into those files).

**Failure and cool-off.** If a trader fails an Elite Live account, they enter up to a 4-week cool-off period (length depends on live performance). After 4 weeks, they may purchase a new evaluation to re-enter the program.

**Eligibility-threshold conflict (flagged, not resolved).** The "Select vs. Growth: Choosing Your Evaluation Type" article's own FAQ states that both plans "lead to Elite Live after 5 successful payouts from Sim Funded" accounts — a single, flat threshold. This directly conflicts with the Elite Program article's own stated threshold of "3 payouts on a single account, OR 10 total payouts since the last live transition," which is itself independently corroborated by the Select Flex/Select Daily payout-policies article's identical "Path to Live (Select)" wording. Two of three sourced articles agree on 3-single/10-total; one FAQ answer states a flat 5. This file does not silently pick one — both are stated here, and the conflict is repeated in Not Confirmed below.

## Not Confirmed By This Source

- **Minimum Balance (ongoing)** — Not stated as a figure distinct from the Drawdown Amount/Lock figures in the Live Account table. Do not assume it equals $0, the drawdown floor, or any other value.
- **Consistency Rule** — No consistency requirement for Elite Live is stated anywhere in the Elite Program article. Do not assume it inherits the feeder Sim plan's consistency rule (Growth: none; Select: none once funded; Lightning: 20/25/30% ladder), and do not assume it is confirmed absent either — it is simply not mentioned.
- **News Trading** — Not mentioned anywhere in the source. Do not assume Elite Live allows or prohibits news trading.
- **Buffer Requirement, Minimum Payout Request, Max Payout per Cycle, Consistency on Payouts, Maximum Total Payouts / Lifetime Cap** — None of these payout-mechanics figures are stated for Elite Live. Do not assume they match any Sim Funded plan's own payout-policy figures in this tree (e.g. Growth's $500 minimum, Select Flex's $3,000 cap) — those are Sim-stage figures for different account types and do not carry over.
- **Drawdown Lock — post-lock permanence** — The Elite Program article confirms a lock *trigger* (EOD balance $100 above the drawdown amount) and strongly implies a stable "locked" state exists (via the pre-lock/post-lock framing in "Payout Requests & Drawdown Adjustment"), but it does not restate, in its own words, that the floor becomes permanently fixed and never moves up again the way the firm-wide "Rules: Trailing Max Drawdowns" article does for the Sim Funded stage. Treated here as the same underlying mechanic by strong structural inference (an identically-titled "When Does Drawdown Lock?" table, the same "$100-over" pattern), not as a verbatim Elite-specific quote. Do not treat "the floor never moves up again after lock" as a directly-quoted Elite Live fact.
- **Eligibility-threshold conflict: "5 successful payouts" vs. "3 on one account OR 10 total"** — The "Select vs. Growth: Choosing Your Evaluation Type" article's FAQ states a flat "5 successful payouts" threshold for reaching Elite Live; the Elite Program article (this file's primary source) and the "Select Flex and Select Daily: Payout Policies" article both independently state "3 payouts on a single account, OR 10 total payouts since the last live transition." This file uses the 3-single/10-total figures throughout, since they are this file's primary source and are independently corroborated by a second article — but the conflicting "5 payouts" claim is not silently discarded; it is flagged here as unresolved. Do not assume either figure supersedes the other without a direct clarification from Tradeify.
- **Accelerator Reward Pools** — The Elite Program article names a distinct performance-based reward feature ("Elite Live traders are eligible for Accelerator Reward Pools — performance-based rewards that unlock as you hit profit milestones on each account") and points to a separate, uncited article ("Tradeify Elite – Accelerator Reward Pools") for its own mechanics. That separate article was not part of this file's source set, so no dollar figures, milestones, or eligibility rules for these pools are documented here. Do not assume they are zero, automatic, or equivalent to the Profit Split/Payouts figures above.
- **Engine scope gap (`TradeifyLive.ts`)** — The engine's single hardcoded `LivePlan` configuration ($2,000 drawdown amount, $2,100 lock-trigger profit, $100 locked threshold, 80% trader share, no DLL) matches this newly-available source's **50K Elite tier exactly**, on every figure — this was previously flagged as unconfirmed engine-only speculation (per this tree's `README.md`) and is now independently confirmed correct for that one tier. However, the engine has no per-tier variant for 25K ($1,500/$1,600), 100K ($3,000/$3,100), 150K ($4,500/$4,600), or 300K ($6,000/$6,100) — it models only the 50K case. Per this repo's own inline engine notes (`MyFundedFutures.ts`, `FundedNext.ts`), this is a deliberate, tree-wide "single-flat-plan convention" applied to every live-account engine file (`ApexLive.ts`, `TradeifyLive.ts`, `TptLive.ts`, `FundedNextLive.ts`) — not a Tradeify-specific bug — but it is a real scope gap relative to the five tiers this source now confirms. Flagged, not silently resolved either way.
- **`Tradeify.ts` (Sim Funded engine) cross-check** — No disagreement found. `Tradeify.ts` models only Sim Funded plans (Growth/Select/Lightning), not the live stage; nothing in it conflicts with any figure in this file.
- **Engine behavioral gap — pre-lock payout requests** — This source's own "Payout Requests & Drawdown Adjustment" section and worked example state that a payout requested *before* the drawdown lock triggers is not blocked outright: it is held and processed the next business day, after which the drawdown adjusts upward first and the payout is deducted second, leaving reduced (but nonzero) effective drawdown room ("$500 requested... Pending — processed next business day... Effective drawdown reduced to $1,500" instead of $2,000). The shared engine base this plan is built on (`LivePlan.withdrawableAmount()` in `src/lib/prop-calculator/core/LivePlan.ts`) instead returns exactly $0 whenever the drawdown hasn't locked yet (`!state.thresholdLocked`) — i.e. it models a pre-lock request as unavailable, not as delayed-and-reduced. This is a real behavioral gap between this file's sourced mechanic and the engine's simplification, not a numeric disagreement on the 5 already-confirmed static figures. Per this repo's other live-plan engine files' own inline notes (e.g. `TopStep.ts`), this $0-pre-lock simplification is a deliberate, tree-wide convention shared by every drawdown-shaped live plan (Apex, Tradeify, TPT, FundedNext, MFF Rapid Live) — not a Tradeify-specific oversight — but it is not currently mentioned anywhere in this file, so it is flagged here rather than left implicit.

---

**Last Updated:** 2026-09-18

**Sources:**

- https://help.tradeify.co/en/articles/12969284-tradeify-elite-program — "Tradeify Elite Program" article, pasted live 2026-09-18. Primary source for every table, the worked example, and every item in Path to Live / Eligibility. No "last updated" date is shown in this pasted dump.
- https://help.tradeify.co/en/articles/14369021-tradeify-pricing-reference — "Tradeify Pricing Reference" article, pasted live 2026-09-18. Used only to corroborate the 80/20 Elite Live profit split and the 300K Select "limited release" tier's existence.
- https://help.tradeify.co/en/articles/12853966-select-flex-and-select-daily-payout-policies — "Select Flex and Select Daily: Payout Policies" article, pasted live 2026-09-18. Used only to corroborate the 3-payouts-on-one-account / 10-total eligibility thresholds via its own "Path to Live (Select)" subsection.
- https://help.tradeify.co/en/articles/13252431-select-vs-growth-choosing-your-evaluation-type — "Select vs. Growth: Choosing Your Evaluation Type" article, pasted live 2026-09-18. Cited only for its conflicting "5 successful payouts" FAQ claim — see Not Confirmed.
- https://help.tradeify.co/en/articles/10495897-rules-trailing-max-drawdowns — "Rules: Trailing Max Drawdowns" article, pasted live 2026-09-18. States "Applies to: All Tradeify accounts (Growth, Select, Lightning)" for the Sim Funded stage's own $100-over lock mechanic; referenced here only as structural context for the post-lock-permanence inference flagged above, not as a direct citation for any Elite Live table figure (Elite Live's own numbers come from the Elite Program article directly).
