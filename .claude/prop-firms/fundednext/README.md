# `FundedNext Futures` Plans Reference

**Firm website:** `https://fundednext.com/futures`
**Last Verified:** `2026-09-18`
**Last Updated:** `2026-09-18`
**Source:** see each plan's own file; firm-wide claims below are cross-checked against every plan file's own table, not asserted independently (see Firm-Wide Rules).

## Overview

FundedNext Futures currently sells five active, purchasable products, documented here as five plan files, plus two live-account stages. All five plans share the same overall progression: a Challenge (evaluation) phase, then a FundedNext Account (sim-funded) phase, then (for four of the five) a transition into one of two entirely different live-trading programs.

Two products offered by FundedNext Futures in the past, the plain **Rapid Challenge** and the **Bolt Challenge**, were both discontinued for new purchases and resets effective **10 July 2026**; existing pre-cutover accounts continue trading under their own terms, but per this repo's convention, discontinued plans are not documented with their own file (see Documentation Scope below).

## Plans

- **[Legacy](legacy.md)**: the original, most structured Challenge: $25K/$50K/$100K, 40% consistency rule during the Challenge only, no Daily Loss Limit at any stage, 80% funded reward share, payouts gated by a Benchmark Day system rather than a fixed schedule.
- **[Flex](flex.md)**: the lowest-profit-target Challenge: $50K/$100K/$150K, 40% consistency rule during the Challenge only, no Daily Loss Limit at any stage, 95% funded reward share, the highest reward share of the five plans.
- **[Rapid Pro](rapid-pro.md)**: one of two paths sold under a single "Rapid Pro & Daily Challenge" purchase: $25K/$50K/$100K, no consistency rule or Daily Loss Limit during the Challenge (an optional negative Daily Loss Limit Add-On is available), 40% consistency rule once funded, 90% reward share, payouts every 3 days.
- **[Rapid Daily](rapid-daily.md)**: the other Rapid Pro & Daily path: same sizes and profit targets as Rapid Pro, but a mandatory Daily Loss Limit at every stage, no consistency rule at any stage, a buffer-based (not consistency-based) payout eligibility rule, 90% reward share, daily payouts.
- **[FNL:003 50K Instant Account](fnl003-instant.md)**: a limited-release Labs product: a single $50K size with no Challenge phase at all (direct FundedNext Account access from purchase), a unique 20% Perpetual Consistency Rule, 90% reward share, no reset option, capped at 3 accounts per trader and not counted against the standard 5-account FundedNext Account allocation.

## Live Accounts

FundedNext Futures runs two entirely different live-trading programs, not one. Do not assume figures from one apply to the other.

- **[`live.md`](live.md)**: the newer program, shared by `flex.md`, `rapid-pro.md`, and `rapid-daily.md`. A small fixed deposit by account size ($1,500/$2,000/$3,000/$4,500 for 25K/50K/100K/150K), an EOD-trailing Max Loss Limit that starts from $0 and locks $1,000 below the starting balance, 100% trader share on the first $5,000 of cumulative lifetime withdrawals then 90/10 after, up to 5 live accounts.
- **[`legacy-live.md`](legacy-live.md)**: the older program, used by `legacy.md` only (and, per its own source, by any pre-10-July-2026 Rapid account still in flight, which is out of scope here as discontinued). Discretionary review after $100,000 in Total Active Profits, an Eligible Profit split into a Settlement Withdrawal / Live Deposit / Reserve, a percentage-of-deposit Auto Liquidation Threshold that locks permanently at the full deposit amount after the first withdrawal, 80/20 payout split.
- **`fnl003-instant.md`** has no confirmed live-transition path in either source used for this tree; see that file's own Live Transition section.

## Firm-Wide Rules

Only rules independently confirmed, in each plan's own table, for every one of the five documented plans.

- **News trading is unrestricted**: confirmed in `legacy.md`, `flex.md`, `rapid-pro.md`, `rapid-daily.md`, and `fnl003-instant.md`. The underlying article states the policy for "the Challenge Account and the FundedNext Account" generically rather than naming every plan; `fnl003-instant.md`'s own Not Confirmed section flags that no FNL:003-specific restatement exists.
- **Inactivity: an account is breached after 30 consecutive calendar days without a trade** (calendar days, including weekends; the counter resets on any trade): confirmed in all five plan files' own tables, with the same FNL:003 category-level caveat as News Trading above.
- **The funded-stage drawdown mechanism is an End-of-Day (EOD) trailing Maximum Loss Limit** for all five plans: confirmed in each plan's own Sim Funded table. The specific lock offset is NOT uniform: Legacy locks at exactly the initial balance ($0 offset); Flex, Rapid Pro, Rapid Daily, and FNL:003 all lock at initial balance + $100. See each plan's own Drawdown Lock row and the Key Cross-Plan Differences table below.

Rules that looked firm-wide but are NOT included above, because at least one plan's own file does not independently confirm them: the standard 5-account FundedNext Account cap (FNL:003 sits outside it, with its own separate 3-account cap); KYC-before-first-withdrawal (only directly cited in `rapid-pro.md` and `fnl003-instant.md`'s own files); "no monthly subscription or activation fee" (only directly cited in `rapid-daily.md`'s own file).

## Key Cross-Plan Differences

| Aspect | Legacy | Flex | Rapid Pro | Rapid Daily | FNL:003 |
| --- | --- | --- | --- | --- | --- |
| Account Size | $25K/$50K/$100K | $50K/$100K/$150K | $25K/$50K/$100K | $25K/$50K/$100K | $50K only |
| Eval Cost | $79.99/$199.99/$239.99 | $69.99:79.99/$129.99:149.99/$249.99:289.99 (tiered) | $79.99/$149.99/$249.99 (conflicting source states $79.99/$169.99/$279.99, see Not Confirmed) | $79.99/$149.99/$249.99 (conflicting source states $79.99/$169.99/$279.99, see Not Confirmed) | N/A, one-time account price $149.99 |
| Profit Target | $1,250/$3,000/$6,000 | $2,500/$5,000/$8,000 | $1,500/$3,000/$5,000 | $1,500/$3,000/$5,000 | N/A, no profit target |
| Eval Consistency | 40% (Challenge only) | 40% (Challenge only) | None (Challenge); 40% once funded | None at any stage | N/A, no Challenge phase; 20% Perpetual Consistency Rule applies from day one |
| Min Eval Days | Unconfirmed | Unconfirmed | Not required | Not required | N/A |
| Funded Drawdown Type | EOD trailing MLL, locks at initial balance ($0 offset) | EOD trailing MLL, locks at initial balance + $100 | EOD trailing MLL, locks at initial balance + $100 | EOD trailing MLL, locks at initial balance + $100 | EOD trailing MLL, locks at initial balance + $100 |
| DLL (Funded) | None | None | None by default (optional Add-On: $500/$1,000/$1,250) | $500/$1,000/$1,250, mandatory | Unconfirmed |
| Sim Payout Split | 80% | 95% | 90% | 90% | 90% |
| Max Funded Accounts | 5 (firm-wide standard cap) | 5 (firm-wide standard cap) | 5 (firm-wide standard cap) | 5 (firm-wide standard cap) | 3 (its own cap, not counted against the 5) |
| Inactivity Rule | 30 consecutive calendar days | 30 consecutive calendar days | 30 consecutive calendar days | 30 consecutive calendar days | 30 consecutive calendar days |
| Lifetime Sim Payouts | Unconfirmed (no fixed count; the 50%-of-profit cap is instead lifted after 30 Benchmark Days) | 5 | 5 | 5 | 5 |
| Live Transition | `legacy-live.md` (older Reserve/Auto-Liquidation program) | `live.md` (newer fixed-deposit program) | `live.md` (newer fixed-deposit program) | `live.md` (newer fixed-deposit program) | Unconfirmed, no live path stated in either source used for this tree |

Every cell above traces back to the matching row in that plan's own file. Where a plan's own file marks a value "Unconfirmed" or flags a source conflict, this table repeats that status rather than guessing.

## Documentation Scope

- **Bolt Challenge and the plain Rapid Challenge** are not documented with their own plan files. Both were discontinued for new purchases and resets effective 10 July 2026; only pre-cutover accounts continue under their own now-frozen terms, which this tree does not track.
- **FNL:003 50K Instant Account's live-transition path** is not documented: neither source used for `fnl003-instant.md` mentions a live-account stage for it, and it is not addressed by either of the two live-program sources (`live.md`'s three articles, `legacy-live.md`'s two articles).
- **The engine (`src/lib/prop-calculator/firms/fundednext/`) does not fully match this tree's scope.** `FundedNext.ts` models Legacy, Flex, Rapid Pro, and Rapid Daily, but not FNL:003 at all. `FundedNextLive.ts` models only the newer live program's 50K/$2,000-deposit tier (no 25K/100K/150K variants, and no model at all for the older Legacy live program in `legacy-live.md`). A likely engine bug was traced and flagged, not fixed, in `live.md`'s own Not Confirmed section: the drawdown lock's trigger appears to double-count the $1,000 lock offset against `DrawdownStrategy.ts`'s own `maybeLock` logic. See each plan and live file's own Not Confirmed section for the full, individually-sourced list of doc/engine disagreements; none were silently resolved in either direction.
- **Two pricing/reset-fee figures per plan are genuinely, unresolvedly contradicted inside FundedNext's own help center** (Rapid Pro and Rapid Daily's eval/reset fees; Flex's $100K reset fee), not just stale documentation on this repo's side. Each conflict is quoted in full, with both competing figures and their source URLs, in that plan's own Evaluation table and Not Confirmed section, rather than picked one over the other.
