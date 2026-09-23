# Run 2026-09-23-average-reward-dp-validation-2

**Question:** after fixing the two defects found by [`2026-09-23-average-reward-dp-validation.md`](2026-09-23-average-reward-dp-validation.md), does the average-reward `optimize dp` now hold up against the best flat funded policy on monthly net per slot? Same acceptance gate D11, applied exactly, nothing tuned: **pass iff the DP policy's empirical monthly net is at least the best flat's on at least 1 of the 2 plans AND never below 0.8x the best flat on either.** Metric definitions, staleness check and re-run rules: [`../engine-results.md`](../engine-results.md).

**Engine state:** the uncommitted working tree on top of HEAD `65e310c`: everything from the first validation run plus the two DP fixes below. The Legacy-eligibility and warning-text fixes that landed while these jobs ran change only which plans `optimize dp` accepts and what it warns about, not any number for the two plans measured here.

**Fixes being validated:**
1. **Convergence.** `FundedStateValue.ts` used a flat 200-sweep cap per level. Under the 252-day horizon hazard (q = 1/252) a level can need roughly ln(first delta / tolerance) / q sweeps, well past 200, so FTMO failed with an unconverged level. The cap is now derived per level from its own first-sweep delta and the hazard when the caller does not set one explicitly; an explicit cap is still honored (fail loud unchanged).
2. **Prediction gap.** The funded DP built every state with `qualifyingDays = 1,000,000` and reset `qualifyingDaysAtLastPayout` to 0, so the shared payout gate (`tryFundedPayout`, "N qualifying days since the last payout") was always open inside the DP while `simulate()` enforced it. TopStep's Standard XFA needs 5 days of $150+ per payout, FTMO Growth needs 4. The DP now carries a bounded "qualifying days since last payout" state dimension (radix = required days + 1) that accrues and resets exactly as `simulator/day.ts` and `FundedCycleTracker` do, and the exported policy reads the same slice in `simulate()`.

## Answer in one table

Objective, held fixed: **monthly net per account slot** (`expectedMonthlyNet`, with the horizon credit and 0 rebuy-lag-days), 252-day funded horizon, 15-day eval cap, seed 42, 20,000 trials.

| Plan | DP status | Solves | DP wall time | DP-predicted $/mo per slot | DP empirical $/mo per slot | Best flat policy (retain $2,000) | Best flat $/mo | DP / best flat | Gate D11 |
|---|---|---|---|---|---|---|---|---|---|
| ftmo-futures growth | converged (exit 0), 0 unconverged levels | 8 of 8 | 958.8s solve, 959.25 s process | $6,723 | $4,350 | flat $800 | $2,989 | 1.46x (computed) | at least best flat: yes |
| topstep no-fee-standard | converged (exit 0) | 8 of 8 | 4232.3s solve, 4,237.01 s process | $5,585 | $3,101 | flat $1000 | $3,142 | 0.99x (computed) | above the 0.8x floor: yes |

**Gate D11: PASSED.** Condition 1 holds on FTMO Growth (1.46x). Condition 2 holds on both plans (lowest ratio 0.99x on TopStep). Before the fixes the same jobs gave TopStep $251/mo (0.08x) and FTMO no policy.

**Prediction gap, still open:** the DP still over-predicts its own policy by $2,372/mo on FTMO and $2,485/mo on TopStep. The leading remaining cause is the geometric horizon approximation (the DP treats the 252-day horizon as a 1/252 daily hazard, so it expects more funded days than a fixed 252-day horizon gives). Trust the empirical column; the predicted column is the solver's own estimate.

**Behavior to know before using the DP policy:** both day-1 funded samples risk $800 / $1,000 / $1,000 per trade, the same aggressive sizing the 2026-09-22 run found firms flag as account churn (TopStep FTP Slowdown / RTP, FTMO inconsistent position sizing and eval vs sim-funded mismatch). The DP maximizes monthly net under the engine's rules; it does not model those discretionary clauses.

## Fixed inputs (every job unless its row says otherwise)

| Input | Value |
|---|---|
| Win rate / R:R | 40% / 1:2 |
| Seed / trials | 42 / 20,000 |
| Funded horizon | 252 days (DP: mean horizon, geometric hazard 1/252) |
| Eval cap | 15 days |
| Rebuy lag | 0 days (approved default, passed explicitly) |
| Flat sweep candidates | flat $150/200/250/300/400/500/600/800/1000 and 5-50% of cushion; gate compares flat rows only |
| Flat sweep eval ladder | each plan's fastest ladder from the 2026-09-22 run: TopStep 800,400,800,600; FTMO 500,800,800,600 |
| Flat sweep retained cushion | $2,000 |

## Stages and exact commands

| Stage | Command | Wall time |
|---|---|---|
| Flat, FTMO | `bun run cli prop optimize funded --firm ftmo-futures --variant growth --ladder 500,800,800,600 --winrate 0.4 --rr 2 --trials 20000 --seed 42 --funded-days 252 --eval-days 15 --rebuy-lag-days 0 --retain-cushion 2000 --sort monthly --flat 150,200,250,300,400,500,600,800,1000 --percent 5,7.5,10,15,20,25,30,40,50` | seconds |
| Flat, TopStep | same with `--firm topstep --variant no-fee-standard --ladder 800,400,800,600` | seconds |
| DP, FTMO | `bun run cli prop optimize dp --firm ftmo-futures --variant growth --eval-days 15 --trials 20000 --funded-days 252 --rebuy-lag-days 0 --seed 42` | 959.25 s |
| DP, TopStep | `bun run cli prop optimize dp --firm topstep --variant no-fee-standard --eval-days 15 --trials 20000 --funded-days 252 --rebuy-lag-days 0 --seed 42` | 4,237.01 s |

## Result 1: flat funded sweep (retain $2,000), top five flat rows

Both reproduce the first validation run's flat numbers exactly, so the fixes did not move any flat-policy result.

| Plan | Policy | Per-cycle net | Monthly net per slot | Bust when funded | Survivors |
|---|---|---|---|---|---|
| ftmo-futures growth | flat $800 | $1,904 | $2,989 | 40.0% | 451/20000 |
| ftmo-futures growth | flat $1000 | $1,558 | $2,495 | 39.8% | 518/20000 |
| ftmo-futures growth | flat $600 | $1,156 | $2,470 | 42.3% | 9/20000 |
| ftmo-futures growth | flat $500 | $1,029 | $2,321 | 42.4% | 1/20000 |
| ftmo-futures growth | flat $400 | $1,277 | $2,290 | 42.7% | 1/20000 |
| topstep no-fee-standard | flat $1000 | $2,723 | $3,142 | 37.8% | 1186/20000 |
| topstep no-fee-standard | flat $800 | $2,937 | $3,063 | 36.8% | 1301/20000 |
| topstep no-fee-standard | flat $600 | $3,000 | $2,923 | 36.5% | 1356/20000 |
| topstep no-fee-standard | flat $500 | $2,792 | $2,801 | 37.1% | 1243/20000 |
| topstep no-fee-standard | flat $400 | $2,862 | $2,581 | 37.1% | 1259/20000 |

## Result 2: average-reward DP

| Field | ftmo-futures growth | topstep no-fee-standard |
|---|---|---|
| States | 457,245 | 1,140,850 |
| Rate-search trace ($/day -> h) | $0.00 -> $10,697; $40.06 -> $8,476; $192.97 -> $1,884; $236.65 -> $1,001; $286.22 -> $359; $313.97 -> $63; $319.85 -> $3; $320.13 -> $0 | $0.00 -> $8,004; $29.98 -> $6,712; $185.78 -> $1,322; $224.00 -> $637; $259.51 -> $92; $265.52 -> $7; $265.98 -> -$0; $265.97 -> -$0 |
| Predicted rate | $320.13/day, $6,723/month per slot | $265.97/day, $5,585/month per slot |
| Empirical "eval pass rate" (clean passes only, see artifacts) | 5.6% | 11.7% |
| Empirical funded bust probability | 41.0% | 34.9% |
| Empirical monthly net per slot | $4,350 | $3,101 |
| Empirical horizon credit per cycle | $112 | $203 |
| Gap vs predicted (printed) | -$2,372 | -$2,485 |
| Day-1 eval risk, trades 1-4 | $600 / $600 / $600 / $600 | $800 / $800 / $800 / $750 |
| Day-1 funded risk, trades 1-4 | $800 / $1000 / $1000 / $0 | $800 / $1000 / $1000 / $0 |

The DP's own regression test (MFF Rapid EOD, coarse grid) also passes on the fixed code with its 3,000-sweep fixture override removed.

## Engine artifacts and limits (open)

| Where | Limit | Direction |
|---|---|---|
| Geometric horizon hazard | the DP approximates the fixed 252-day horizon as a 1/252 daily hazard | predicted value optimistic by about $2,400/mo on both plans |
| `cli prop optimize dp` "eval pass rate" line | prints the clean-pass share (passed eval and never busted funded), not the share that reached funded | display only |
| Lifetime payout-dollar caps (`maxLifetimePayoutDollars`, e.g. MFF Pro $100,000) | the DP does not track cumulative payout dollars, so it ignores the cap | optimistic for plans that would reach it; `optimize dp` warns |
| Cumulative qualifying-day milestones (FundedNext Legacy's 30-day milestone) | not representable with the bounded qualifying-day dimension | Legacy is now refused by `optimize dp` instead of silently mis-valued |
| Discretionary firm rules against oversized or churned accounts | not modeled | the DP's aggressive funded sizing can be flagged by the firm |
