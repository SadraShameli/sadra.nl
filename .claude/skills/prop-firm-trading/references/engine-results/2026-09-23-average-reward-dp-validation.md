# Run 2026-09-23-average-reward-dp-validation

**Question:** does the average-reward `optimize dp` (change 4: it maximizes expected net cash per day per account slot, reported x21 per month) produce a policy whose empirical monthly net per slot holds up against the best flat funded policy at matched inputs? Acceptance gate D11, owner-approved and applied exactly, nothing tuned: **pass iff the DP policy's empirical monthly net is at least the best flat's on at least 1 of the 2 plans AND never below 0.8x the best flat on either.** Metric definitions, staleness check and re-run rules: [`../engine-results.md`](../engine-results.md).

**Engine state:** the uncommitted working tree on top of HEAD `65e310c`. It holds the staged changes that retire lifetime net, add the end-of-horizon credit and `--rebuy-lag-days` to monthly net, and replace the joint fixed-point DP with the average-reward solver (28 staged files, no unstaged or untracked changes). `git diff --cached HEAD | shasum -a 256` = `afcf8c6119b6933d3c7e88bcb7c76fa3011c574f204a7d74687ecaee37c10a1e`, the same before the first job and after the last. The commit that lands those staged changes is this run's engine commit.

**Volume:** 3 `optimize funded` jobs x 18 policies x 20,000 trials (about 4 s each) and 2 `optimize dp` jobs (TopStep 3,726.46 s; FTMO stopped with an error after 49.26 s). One machine, 14 cores, jobs run one at a time so the DP wall times do not share CPU.

## Answer in one table

Objective, held fixed: **monthly net per account slot** (`expectedMonthlyNet`, with the horizon credit and 0 rebuy-lag-days), 252-day funded horizon, 15-day eval cap, seed 42, 20,000 trials.

| Plan | DP status | Solves | DP wall time | DP-predicted $/mo per slot | DP empirical $/mo per slot | Best flat policy (retain $2,000) | Best flat $/mo | DP / best flat | Gate D11 |
|---|---|---|---|---|---|---|---|---|---|
| topstep no-fee-standard | converged (exit 0) | 8 of 8 | 3717.1s solve, 3,726.46 s process | $8,619 | $251 | flat $1000 | $3,142 | 0.08x (computed) | fails the 0.8x floor |
| ftmo-futures growth | error (exit 1): `solveAverageRewardPolicy: 1 funded level(s) failed to converge at ratePerDay=0; the average-reward estimate would be biased` | threw in solve 1 (0 is the solver's start rate) | 49.26 s process | none | none | flat $800 | $2,989 | none | no DP policy to compare |

**Gate D11: FAILED.** Condition 1 (at least the best flat on at least one plan) holds on neither plan: TopStep's DP policy earns $251 against $3,142, and FTMO produced no policy. Condition 2 (never below 0.8x best flat) fails on TopStep at 0.08x. Per D11 the plan stops here; nothing was re-run with other settings, iteration caps or tolerances.

**Prediction gap (D8 asked for it):** on TopStep the DP predicts $8,619/month and its own policy earns $251/month in `simulate()`; the CLI prints the gap as -$8,368. FTMO's gap cannot be measured.

## Fixed inputs (every job unless its row says otherwise)

| Input | Value | Source |
|---|---|---|
| Win rate / R:R | 40% / 1:2. Passed explicitly to `optimize funded` (`--winrate 0.4 --rr 2`); `optimize dp` ran on the same values as its defaults | HIS NUMBERS |
| Eval cap | `--eval-days 15` on every job | T16 plan; the DP's eval state space grows with it |
| Funded horizon | `--funded-days 252`. For `optimize dp` this is also the mean of the geometric horizon hazard, 1/252 per funded day | D8 |
| Rebuy lag | `--rebuy-lag-days 0` on every job, the approved default, passed explicitly | D1 |
| Seed / trials | 42 / 20,000 for every `simulate()` run, including the DP's empirical run | |
| Attempts | `--max-attempts 1` (the `optimize funded` default); `optimize dp` hard-codes 1 | D16 |
| Eval sizing, flat jobs | each plan's fastest ladder from [2026-09-22 Stage A](2026-09-22-full-sweep.md): TopStep no-fee-standard 800/400/800/600, FTMO growth 500/800/800/600 | Hard Rule 3 |
| Eval and funded sizing, DP | the DP's own state-dependent policy on the solver's default grids, 4 trade slots per day | |
| Funded candidates, flat jobs | flat $150/200/250/300/400/500/600/800/1000; 5/7.5/10/15/20/25/30/40/50% of cushion (the 2026-09-22 Stage B grid) | |
| Payout rule | flat jobs: `--retain-cushion 2000`, effective $2,000 on both plans. DP: the plan's own default, because `optimize dp` has no `--retain-cushion` flag: $0 on TopStep (`minRetainedCushionOverride`), $2,000 on FTMO. Stage F0 measures what that difference does to TopStep's best flat | Hard Rule 2 |
| Trades per day / stop, flat jobs | `--tpd 4 --stop day-green` (CLI defaults) | Hard Rules 3-4 |
| Idle days / commission / contract caps | 0 / $0 / off (`--idle-day-probability 0` passed explicitly to the flat jobs) | |
| DP rate search | `--iterations 8` (default; since D12 it is the max number of rate-search solves), rate tolerance $0.05/day (solver default) | D12 |

## Stages and exact commands

Every job ran from the repo root, one at a time, wrapped in `/usr/bin/time -p`, colors stripped with `sed 's/\x1b\[[0-9;]*m//g'`. The DP jobs started at 2026-09-23T00:35:36Z (TopStep) and 2026-09-23T01:37:42Z (FTMO).

| Stage | Plans | Command | Jobs |
|---|---|---|---|
| F flat sweep | topstep no-fee-standard (`--ladder 800,400,800,600`), ftmo-futures growth (`--ladder 500,800,800,600`) | `bun run cli prop optimize funded --firm <f> --variant <v> --ladder <fastest> --winrate 0.4 --rr 2 --trials 20000 --seed 42 --funded-days 252 --eval-days 15 --rebuy-lag-days 0 --retain-cushion 2000 --idle-day-probability 0 --sort monthly --flat 150,200,250,300,400,500,600,800,1000 --percent 5,7.5,10,15,20,25,30,40,50` | 2 |
| F0 cushion check | topstep no-fee-standard | the F command with `--retain-cushion 0` (the DP's effective cushion on TopStep). Informational only, not used by the gate | 1 |
| D DP | topstep no-fee-standard, ftmo-futures growth | `bun run cli prop optimize dp --firm <f> --variant <v> --eval-days 15 --trials 20000 --funded-days 252 --rebuy-lag-days 0 --seed 42` | 2 |

## Result 1: flat funded sweep (Stage F, retain $2,000)

Percent-of-cushion rows are copied for completeness only: they carry the no-one-micro-minimum artifact recorded in the 2026-09-22 run (0.0% bust from 5% to 40%). The gate uses flat policies only. "Survivors" counts attempts that passed the eval and never busted funded (reached the horizon or the account concluded).

**topstep no-fee-standard** (process wall time 3.85 s), in printed rank order:

| Funded policy | Per-cycle net | Monthly net | Bust when funded | Survivors |
|---|---|---|---|---|
| flat $1000 | $2,723 | $3,142 | 37.8% | 1186/20000 |
| flat $800 | $2,937 | $3,063 | 36.8% | 1301/20000 |
| flat $600 | $3,000 | $2,923 | 36.5% | 1356/20000 |
| flat $500 | $2,792 | $2,801 | 37.1% | 1243/20000 |
| flat $400 | $2,862 | $2,581 | 37.1% | 1259/20000 |
| flat $300 | $2,677 | $2,226 | 38.6% | 886/20000 |
| flat $250 | $2,375 | $1,934 | 41.1% | 350/20000 |
| flat $200 | $2,712 | $1,560 | 41.0% | 440/20000 |
| 15% cushion | $6,319 | $1,297 | 0.0% | 8470/20000 |
| 10% cushion | $6,053 | $1,226 | 0.0% | 8470/20000 |
| flat $150 | $3,366 | $1,132 | 31.1% | 2367/20000 |
| 20% cushion | $4,321 | $882 | 0.0% | 8470/20000 |
| 7.5% cushion | $4,388 | $858 | 0.0% | 8470/20000 |
| 5% cushion | $2,969 | $582 | 0.0% | 8470/20000 |
| 25% cushion | $2,593 | $521 | 0.0% | 8470/20000 |
| 30% cushion | $1,503 | $294 | 0.0% | 8518/20000 |
| 40% cushion | $595 | $114 | 0.0% | 8487/20000 |
| 50% cushion | $212 | $109 | 42.8% | 4/20000 |

**ftmo-futures growth** (process wall time 3.68 s), in printed rank order:

| Funded policy | Per-cycle net | Monthly net | Bust when funded | Survivors |
|---|---|---|---|---|
| flat $800 | $1,904 | $2,989 | 40.0% | 451/20000 |
| flat $1000 | $1,558 | $2,495 | 39.8% | 518/20000 |
| flat $600 | $1,156 | $2,470 | 42.3% | 9/20000 |
| flat $500 | $1,029 | $2,321 | 42.4% | 1/20000 |
| flat $400 | $1,277 | $2,290 | 42.7% | 1/20000 |
| flat $300 | $1,662 | $2,083 | 42.7% | 5/20000 |
| flat $250 | $1,934 | $1,917 | 42.3% | 32/20000 |
| flat $200 | $2,612 | $1,589 | 41.1% | 323/20000 |
| 15% cushion | $5,973 | $1,180 | 0.0% | 8409/20000 |
| flat $150 | $3,391 | $1,180 | 31.7% | 2111/20000 |
| 20% cushion | $5,745 | $1,162 | 0.0% | 8419/20000 |
| 10% cushion | $5,236 | $1,006 | 0.0% | 8519/20000 |
| 25% cushion | $4,950 | $990 | 0.0% | 8516/20000 |
| 50% cushion | $2,124 | $940 | 38.5% | 753/20000 |
| 7.5% cushion | $4,417 | $850 | 0.0% | 8519/20000 |
| 30% cushion | $3,955 | $783 | 0.0% | 8582/20000 |
| 5% cushion | $3,069 | $594 | 0.0% | 8519/20000 |
| 40% cushion | $2,745 | $544 | 0.0% | 8531/20000 |

These numbers are not comparable with the 2026-09-22 Stage B table: that run used `--eval-days 150`, 100,000 trials and 3 seeds, and had no horizon credit.

## Result 2: TopStep cushion check (Stage F0, retain $0)

Flat rows only, in printed rank order (the percent rows were printed too and are not used). The best flat barely moves between a $2,000 and a $0 retained cushion ($3,142 vs $3,143), so the DP's different payout cushion on TopStep does not explain its gap to the best flat.

| Funded policy | Per-cycle net | Monthly net | Bust when funded | Survivors |
|---|---|---|---|---|
| flat $1000 | $2,712 | $3,143 | 37.8% | 1178/20000 |
| flat $800 | $2,895 | $3,061 | 36.9% | 1281/20000 |
| flat $600 | $2,879 | $2,922 | 36.9% | 1287/20000 |
| flat $500 | $2,546 | $2,800 | 37.8% | 1097/20000 |
| flat $400 | $2,123 | $2,556 | 39.0% | 823/20000 |
| flat $300 | $1,315 | $2,055 | 41.9% | 265/20000 |
| flat $250 | $987 | $1,687 | 42.5% | 48/20000 |
| flat $200 | $806 | $1,305 | 42.6% | 26/20000 |
| flat $150 | $591 | $912 | 42.6% | 28/20000 |

## Result 3: average-reward DP (Stage D)

**topstep no-fee-standard**

| Printed field | Value |
|---|---|
| solve | 3717.1s, 8 rate-search solves, 718750 states |
| process time (`/usr/bin/time -p`) | real 3726.46 s, user 3151.25 s, sys 9244.78 s |
| status | converged |
| rate | $410.42/day, $8,619/month per account slot |
| solves used | 8 |
| eval pass rate (see note) | 11.0% |
| funded bust probability | 35.5% |
| expected monthly net per account slot (empirical) | $251 |
| expected horizon credit per cycle | $194 |
| gap vs DP-predicted monthly rate | -$8,368 |
| eval, day 1, trade 1-4 | $800 / $800 / $800 / $750 |
| funded, day 1, trade 1-4 | $1200 / $1800 / $1000 / $0 |

Note: the line printed as "eval pass rate" is `passProbability`, the share of attempts that passed the eval AND never busted funded; "funded bust probability" is the unconditional `counts['bust-funded'] / trials`. The share of attempts that reached funded is therefore 11.0% + 35.5% = 46.5% (computed), and about 76% of the DP's funded accounts bust (computed).

Rate-search trace, as printed (rate per day tried, cycle value h at that rate):

| Solve | Rate per day | h |
|---|---|---|
| 1 | $0.00 | $3,901 |
| 2 | $14.61 | $3,568 |
| 3 | $171.45 | $1,185 |
| 4 | $249.48 | $735 |
| 5 | $376.57 | $145 |
| 6 | $407.92 | $10 |
| 7 | $410.30 | $0 |
| 8 | $410.42 | $0 |

**ftmo-futures growth**

| Printed field | Value |
|---|---|
| result | `✗ solveAverageRewardPolicy: 1 funded level(s) failed to converge at ratePerDay=0; the average-reward estimate would be biased` |
| exit code | 1 (`error: script "cli" exited with code 1`) |
| process time (`/usr/bin/time -p`) | real 49.26 s, user 49.96 s, sys 2.92 s |

No rate, policy or empirical figure was printed. The failure is the fail-loud path decided in D10: under the 1/252 horizon hazard at least one funded level did not converge within the funded solver's per-level sweep cap (default 200 sweeps, `DEFAULT_MAX_ITERATIONS_PER_LEVEL`; `optimize dp` does not override it) on the first solve, which is the convergence risk the plan flagged before T13. `optimize dp` exposes no flag for that cap, and raising it would be tuning, so it was not retried.

## Adjustments that did not come from the engine

- Every ratio (DP / best flat, the 46.5% reached-funded share, the 76% funded-bust share) is arithmetic on printed numbers, marked "computed" where it appears. Nothing else here is derived.
- The best flat is the top flat row of `optimize funded --sort monthly` over the 2026-09-22 Stage B flat grid ($150 to $1,000). Percent rows are excluded, as in the 2026-09-22 run.

## Verification

- Every engine number above was copied from the CLI output of the commands in "Stages and exact commands" (saved raw during the run, colors stripped). No script imported `~/lib/prop-calculator`.
- Engine state checked before the first job and after the last: HEAD `65e310c`, identical staged-diff hash, no unstaged or untracked changes.
- No `bun run cli` process was left running after the last job.
- Not verified: why the TopStep DP over-predicts by $8,368/month. Two leads come only from reading code and the previous run, and neither was tested: the funded DP builds every state with `qualifyingDays` set to a large constant and resets `qualifyingDaysAtLastPayout` to 0 (`core/FundedStateValue.ts`), so it never waits for the plan's qualifying-day payout gate that the engine enforces; and the previous joint DP showed the same direction (2026-09-22 Result 8: $10,424 predicted funded value against $795 empirical cycle net on the same plan). The geometric horizon hazard (D8) is a third possible contributor.

## Engine artifacts and doc/engine mismatches (open, not fixed)

| Where | Problem | Direction | Found by |
|---|---|---|---|
| `optimize dp` (average-reward solver) | on TopStep no-fee-standard the DP predicts $8,619/month and its own policy earns $251/month in `simulate()` | DP policy far worse than every flat policy from $150 up | this run |
| `optimize dp` / `core/FundedStateValue.ts` | FTMO growth at a 252-day hazard horizon: a funded level fails to converge on the first solve and the solver throws | no DP result for this plan | this run |
| `optimize dp` | no `--retain-cushion` flag, so the DP and its empirical run use the plan's default cushion ($0 on TopStep) while `optimize funded` runs use `--retain-cushion 2000` | inputs not fully matched; Stage F0 shows it moves TopStep's best flat by $1 | this run |
| `optimize dp` output | "eval pass rate" prints `passProbability`, which excludes attempts that passed and then busted funded | label misleading (11.0% printed, 46.5% reached funded) | this run |
| `optimize dp` runtime | TopStep took 3,726 s against the plan's 15 to 20 minute estimate, with system time (9,244.78 s) about 3x user time (3,151.25 s) | slow | this run |

## Process notes (so the next run avoids them)

- Run the DP jobs one at a time: TopStep no-fee-standard alone took just over an hour at `--eval-days 15`. While it ran, `top` showed the bun process at about 20 GB of memory (13 GB of it compressed) on a 24 GB machine, which may explain the high system time; this was observed, not measured by the engine.
- The FTMO growth DP fails within a minute, so a quick FTMO run is a cheap check that the funded convergence issue is fixed before queuing the slow TopStep run.
