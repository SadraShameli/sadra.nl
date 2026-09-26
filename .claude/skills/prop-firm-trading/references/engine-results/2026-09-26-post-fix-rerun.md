# Run 2026-09-26-post-fix-rerun

**Question:** re-run every funded and DP stage of [`2026-09-26-post-audit-rerun.md`](2026-09-26-post-audit-rerun.md) on the engine that holds the fixes for that run's three open findings, with the same fixed inputs, and record which figures and conclusions moved. The three findings: N-71 (percent-of-cushion rows printing monthly nets in the millions to trillions), N-72 (the $500 request-size stage beating the base run on daily-payout plans) and N-73 (both gate D11 DP solves exiting 1 with `solve-cap-reached`). Metric definitions, staleness check and re-run rules: [`../engine-results.md`](../engine-results.md).

**Engine state:** HEAD `1216eba` (`1216eba04636828b14f10c21b24c951736e92e67`, a `WIP` commit) plus an **uncommitted working tree**: `git status --short` over the gated paths (`src/lib/prop-calculator`, `src/cli/commands/prop`, `src/cli/ui`, `src/lib/format`) listed 15 staged paths at the start (`meta/status-start.txt`, identical to the plan-time `meta/status-plan.txt`), among them `optimize/funded/command.ts`, `shared.ts`, `DayPolicy.ts`, `FundedStateValue.ts`, `PositionSizing.ts`, `simulator/day.ts` and the new `core/PlacedFundedRisk.ts`. No commit reproduces these numbers yet; the content hash identifies the tree:

| Pin | Time (UTC, 2026-09-26) | contenthash (`advisor/` excluded) | contenthash_full |
|---|---|---|---|
| plan (`meta/contenthash-plan.txt`) | before 08:44:14 | `4ade35c608ccc18d2471a5feba1c40f014acfed212ba95c8d30b96548aeb01c2` | - |
| S0 (`meta/contenthash-pin.txt`) | 08:48:13 | `4ade35c608ccc18d2471a5feba1c40f014acfed212ba95c8d30b96548aeb01c2` | `0e26ba1f02a6b64102f9ff02f514e5aed02e6b2d374ba1ed08470bcdf461cc72` |
| restart (`meta/contenthash-restart.txt`) | 09:58:54 | `4ade35c608ccc18d2471a5feba1c40f014acfed212ba95c8d30b96548aeb01c2` | - |
| end (`meta/contenthash-end.txt`) | 11:05:46 | `4ade35c608ccc18d2471a5feba1c40f014acfed212ba95c8d30b96548aeb01c2` | `f19238e2720d5af4327afd565130cf603c83f4b1aa11b5dfddcd8a5d00b0e2a2` |

Every job ran on one engine state (see Verification). HEAD stayed `1216eba` throughout (`meta/head-start.txt`, `meta/head-restart.txt`).

**Volume:** 1,318 CLI jobs (V 8, B 598, C path-walk 42, C commission 176, D 176, E request size 176, E live cap 88, F 52, DP 2), 2026-09-26 08:48:16Z to 11:05:46Z (`meta/t-DP-end`; the last job, the TopStep DP, ended at 11:05:22Z). Every job ended `exit=0`. Stage A (eval ladders) was **not** re-run: the funded jobs reuse the post-audit run's Stage A ladders (`meta/fastest-ladders.txt`, copied).

**Supersedes:** the numbers of `2026-09-26-post-audit-rerun.md` for every stage re-run here (V, B, C, D, E, F, DP). Its Stage A (eval ladders) stays current. Its file is not edited.

## Answer in brief

Seed 42, 1-year funded horizon, 100,000 trials unless stated. "Post-audit" figures are copied from `2026-09-26-post-audit-rerun.md`.

1. **(a) N-71, the percent-of-cushion anomaly, is gone.** None of the 16,651 policy rows this run printed shows a monthly net of $20,000 or more (post-audit: B alone had 30 files with a percent row at $1,000,000/mo or more). The Lucid Pro / Pro no-DLL / Direct percent rows that printed $624,388,543 / $1,743,617,717 / $973,964,343 now print at most 50% cushion $3,211 / $3,336 / $1,903 (B companions). Caveat: the new CLI refuses `--percent` without `--stop-points`, so every percent row here is placed in whole MNQ contracts at a 10-point stop with contract caps on; none is like-for-like with a post-audit percent row.
2. **(b) N-72, the $500 request-size jump, is explained: its horizon-credit part is gone everywhere, and on TPT and MFF Rapid EOD a credit-free lead remains.** Lucid Daily EOD flat $1000 at $500 per request: per-cycle $2,038 and 5405/100000 survivors (both unchanged), horizon credit $0, monthly $2,456, monthly ex-credit $2,456 (post-audit monthly $7,459). Base flat $1000 prints $2,661 and the base best flat ($800 $2,720) beats the request run's best flat ($500 $2,575), so the base run ranks first again on Lucid Daily (all four variants) and MFF Rapid. TPT ($500 request: $500 $2,192 vs base $800 $1,947) and MFF Rapid EOD ($500 $2,420 vs $800 $1,999) still come out above base, with horizon credit $0 and monthly ex-credit equal to monthly net, so their lead is not the horizon credit; it matches the cushion-accumulation effect the post-audit investigation described. Seed 1337 agrees (TPT $500 $2,186, Rapid EOD $500 $2,420).
3. **(c) N-73: gate D11 PASSED on converged solves.** Both DP jobs exit 0 with `status: converged` after 9 rate-search solves (the new default cap is 12). DP empirical monthly net vs Stage V best flat: FTMO Growth $4,851 vs flat $800 $2,924 (Stage A ladder; $2,929 with the pinned ladder); TopStep No-fee Standard $3,181 vs flat $1000 $3,065. Both DP figures are above the best flat, so both gate conditions hold. The DP-vs-empirical gap is -$217 on FTMO (post-audit -$245) and still -$1,624 on TopStep (post-audit -$1,636): the TopStep DP-predicted rate ($4,805/month) stays well above what its own policy earns when simulated.
4. **(d) Best flat and best whole-contract percent rows.** Best flat fell back on the plans whose post-audit lead came from the horizon credit: Lucid Direct $1000 $8,375 to $400 $2,127, Lucid Pro no-DLL $1000 $7,296 to $1000 $3,681, Lucid Pro $1000 $6,903 to $800 $3,505, Tradeify Lightning $1000 $5,872 to $400 $2,946, Tradeify Growth $1000 $5,159 to $500 $3,324. The leading best flats are now FundedNext Legacy $1000 $4,730, TopStep No-fee Consistency $1000 $4,326 and Standard Consistency $1000 $4,293. In the whole-contract companions the best percent row is 50% of cushion on almost every plan. In B it beats the same job's best flat only on E8 Zero MAX 80/100 (all three seeds; 50% cushion $455 / $513 at seed 42, where the companion's best flat row is -$20 / -$121); in the other stages a percent row also ranks first on some E8 Zero MAX, Apex EOD, E8 Zero and live-capped jobs (Result 4).
5. **(e) Rankings that moved.** At flat $250, TopStep No-fee Consistency ($1,924) now edges No-fee Standard ($1,920), reversing the post-audit order ($1,930 vs $1,924), and TopStep Standard Consistency ($1,906) edges Standard Standard ($1,905; post-audit $1,916 vs $1,906). In the realistic view the order is TopStep No-fee Consistency $1,924, No-fee Standard $1,920, FTMO Growth $1,918, then the TopStep Standard path; every live-capped and path-walk figure is unchanged. At a 43% win rate the best flat is now TopStep No-fee Consistency $1000 $6,211 (post-audit: Lucid Direct $1000 $11,740). Every per-cycle net, bust rate and survivor count in the base sweep and Stage V is unchanged; only monthly net moved, through the horizon credit (T32).
6. **Investigated after the run (audit N-74 and N-75):** some Stage D 20-point rows print far above their base job (FTMO Growth flat $800 per-cycle $6,085 and monthly $4,237 vs base $1,875 and $2,927; TopStep DLL variants $4,500 to $5,371). That is an engine defect (N-74): when a lockout daily-loss room is below one contract, the whole-contract rule placed one contract, capped the loss at the room and paid the win on the full contract. Fix package WP39e is in progress; do not cite any Stage D 20-point figure until the Stage D re-run on the fixed engine replaces them. FundedNext Legacy's 50% cushion row ($8,953) is a separate modelling limit: win rate and rr are held fixed whatever the stop, while the dollar contract cap scales with the stop. The MFF Pro whole-contract companion prints one identical result for all 9 flat rows because MFF Pro's published funded limit is 5 micros, so every flat of $100 or more places the same 5 MNQ = $100 at 10 points (N-75, correct behaviour). See Engine anomalies.

## Fixed inputs (every stage unless its row says otherwise)

| Input | Value |
|---|---|
| Win rate / R:R | 40% / 1:2, passed explicitly (`--winrate 0.4 --rr 2`) |
| Trades per day / stop | `--tpd 4 --stop day-green`, passed explicitly |
| Eval sizing | each plan's `FASTEST TO FUNDED` #1 ladder from the post-audit run's Stage A (`meta/fastest-ladders.txt`); the 4 instant-funded plans get no `--ladder` |
| Payout rule | `--retain-cushion 2000` |
| Funded candidates | base jobs: flat $150/200/250/300/400/500/600/800/1000 only (no percent rows, see Adjustments). Whole-contract companions and D: the same flats plus 5/7.5/10/15/20/25/30/40/50% of cushion |
| Trials / seeds | 100,000 per candidate. Seeds 42/1337/2024: B horizons and C path-walk. 42/1337: C commission, D, E. 42 only: B 15% idle run and F. V and DP: 20,000 trials, seed 42 |
| Eval cap / attempts | `--eval-days 150 --max-attempts 1` (V and DP: `--eval-days 15`) |
| Rebuy lag | `--rebuy-lag-days 0` on every funded and DP job |
| Contract caps / commission / idle days | off / $0 / 0% in base jobs, each varied in its own stage; the companions and D turn contract caps on (`--stop-points`) |
| Opt-ins left off | `--early-withdrawal`, `--funded-reset` |
| Plan sets | all = the 46 lines of `meta/plans-all.tsv`; buyable = all minus topstep pro-account and lucid maxx (44) |

## Stages and exact commands

Every job line in `jobs/<stage>.jobs` names its output file and its arguments; `run1.sh` turns it into `bun run cli prop <optimize funded | optimize dp> --firm <f> [--variant <v>] <args>` from the repo root (the CLI echoes it as `bun --conditions react-server --env-file .env ./src/cli/index.ts prop ...`), wrapped in `/usr/bin/time -p`, with a UTC start stamp first and `exit=<rc>` last. TPT runs without `--variant`.

`<BASE>` = `--trials 100000 --sort monthly --retain-cushion 2000 --rebuy-lag-days 0 --rr 2 --tpd 4 --stop day-green --eval-days 150 --max-attempts 1 --flat 150,200,250,300,400,500,600,800,1000`

`<COMP>` = `--percent 5,7.5,10,15,20,25,30,40,50 --stop-points 10 --instrument MNQ`. A whole-contract companion is the post-audit job line verbatim (its `--percent` grid kept) plus `--stop-points 10 --instrument MNQ`, written to `<name>__mnq10.txt`.

| Stage | Plans | Command | Jobs | Parallel | Wall clock (UTC) |
|---|---|---|---|---|---|
| V flat baseline (gate D11, F0) | topstep no-fee-standard, ftmo-futures growth | `bun run cli prop optimize funded --firm <f> --variant <v> --ladder <L> --retain-cushion <2000,0> --winrate 0.4 --rr 2 --trials 20000 --seed 42 --funded-days 252 --eval-days 15 --rebuy-lag-days 0 --idle-day-probability 0 --sort monthly --tpd 4 --stop day-green --max-attempts 1 --flat 150,...,1000`; `<L>` = Stage A ladder (TopStep 800,400,800,600; FTMO 600,800,800,600) and the originals' pinned ladders (800,400,800,600; 500,800,800,600); retain $0 on TopStep only. Plus the Stage A ladder, retain $2,000 job of each plan with `<COMP>` | 6 + 2 | 6 | 08:48:16 to 08:48:25 |
| B base | all (46) | `bun run cli prop optimize funded --firm <f> --variant <v> [--ladder <A>] --seed <42,1337,2024> --funded-days <126,252,504> --winrate 0.4 --idle-day-probability 0 <BASE>`, plus one run per plan at seed 42, 252 days, `--idle-day-probability 0.15`. Plus the 252-day job of every plan and seed with `<COMP>` | 460 + 138 | 6 | 08:48:38 to 09:06:34 |
| C path-walk | apex intraday, tpt, lucid daily-eod / daily-eod-dll / daily-intraday / daily-intraday-dll, mffu rapid | B command at 252 days, seeds 42/1337/2024, plus `--path-granularity 10`; every job also with `<COMP>` | 21 + 21 | 6 | 09:06:39 to 09:37:24 |
| C commission | buyable (44) | B command at 252 days, seeds 42/1337, plus `--commission 10`; every job also with `<COMP>` | 88 + 88 | 6 | 09:37:29 to 09:42:50 |
| D contract caps | buyable (44) | B command at 252 days, seeds 42/1337, plus `--stop-points <10,20> --instrument NQ --percent 5,7.5,10,15,20,25,30,40,50` (the post-audit line verbatim); no companion | 176 | 6 | 09:42:55 to 09:48:36 |
| E payout size | buyable (44) | B command at 252 days, seeds 42/1337, plus `--request-size <N>` (1000 for tradeify lightning, mffu pro, alphafutures advanced; 800 for fundednext fnl-003; 500 for the rest, `meta/request-sizes.txt`, unchanged from the post-audit run); every job also with `<COMP>` | 88 + 88 | 6 | 09:48:41 to 09:58:02 (end derived from the newest output's mtime, `meta/t-E_req-end-derived.txt`) |
| E live-trigger cap | 18 plans + 4 | B command at 252 days, seeds 42/1337, plus `--max-lifetime-payouts <N>` (tradeify all 4: 3; lucid pro, pro-no-dll, flex, flex-dll, direct: 5; alphafutures all 3: 5; mffu pro: 3; fundednext flex, rapid-pro, rapid-pro-dll-add-on, rapid-daily: 3; fundednext legacy: 5; plus tradeify all 4 at 2); every job also with `<COMP>` | 44 + 44 | 8 | 09:58:54 to 10:07:15 |
| F win rate | 13 plans (post-audit list) | B command at 252 days, seed 42, `--winrate <0.37,0.43>` in place of 0.4; every job also with `<COMP>` | 26 + 26 | 8 | 09:58:54 to 10:07:48 |
| DP | ftmo-futures growth, topstep no-fee-standard | `bun run cli prop optimize dp --firm <f> --variant <v> --eval-days 15 --trials 20000 --funded-days 252 --rebuy-lag-days 0 --seed 42 --winrate 0.4 --rr 2` (no `--iterations`, so the new default of 12 solves applies, `meta/help-optimize-dp.txt`) | 2 | 2 | 09:58:54 to 11:05:22 (TopStep job end: start plus its real 3988.08 s; `meta/t-DP-end` 11:05:46) |

E live cap, F and DP ran at the same time (see Adjustments). Longest single job per stage (`real` from `time -p`): V 5.83 s, B 78.06 s, C path-walk 447.56 s, C commission 49.28 s, D 51.19 s, E request size 84.27 s, E live cap 196.56 s, F 233.96 s, DP 3988.08 s.

## Result 1: flat funded baseline for gate D11 (Stage V, 20,000 trials, eval-days 15)

Top rows in printed rank order. The Stage A TopStep ladder equals the pinned one (800,400,800,600), so those pairs are the same command and printed identical tables.

| Plan, ladder, retain | Policy | Per-cycle net | Horizon credit | Monthly net | Monthly ex-credit | Bust when funded | Survivors | Post-audit monthly |
|---|---|---|---|---|---|---|---|---|
| topstep no-fee-standard, 800/400/800/600, $2,000 | flat $1000 | $2,723 | $35 | $3,065 | $3,026 | 37.8% | 1186/20000 | $3,142 |
| | flat $800 | $2,937 | $34 | $2,982 | $2,948 | 36.8% | 1301/20000 | $3,063 |
| | flat $600 | $3,000 | $31 | $2,839 | $2,810 | 36.5% | 1356/20000 | $2,923 |
| | flat $250 | $2,375 | $5 | $1,924 | $1,920 | 41.1% | 350/20000 | $1,934 |
| topstep no-fee-standard, 800/400/800/600, $0 (F0) | flat $1000 | $2,712 | $35 | $3,065 | $3,027 | 37.8% | 1178/20000 | $3,143 |
| | flat $800 | $2,895 | $33 | $2,979 | $2,945 | 36.9% | 1281/20000 | $3,061 |
| | flat $250 | $987 | $1 | $1,683 | $1,682 | 42.5% | 48/20000 | $1,687 |
| ftmo-futures growth, 600/800/800/600 (Stage A), $2,000 | flat $800 | $1,855 | $11 | $2,924 | $2,907 | 39.1% | 444/20000 | $2,984 |
| | flat $600 | $1,130 | $0 | $2,469 | $2,469 | 41.4% | 9/20000 | $2,471 |
| | flat $1000 | $1,534 | $11 | $2,427 | $2,409 | 38.8% | 515/20000 | $2,499 |
| | flat $250 | $1,895 | $0 | $1,918 | $1,917 | 41.2% | 32/20000 | $1,918 |
| ftmo-futures growth, 500/800/800/600 (pinned), $2,000 | flat $800 | $1,904 | $11 | $2,929 | $2,912 | 40.0% | 451/20000 | $2,989 |
| | flat $600 | $1,156 | $0 | $2,469 | $2,468 | 42.3% | 9/20000 | $2,470 |
| | flat $1000 | $1,558 | $11 | $2,422 | $2,405 | 39.8% | 518/20000 | $2,495 |
| | flat $250 | $1,934 | $0 | $1,917 | $1,917 | 42.3% | 32/20000 | $1,917 |

Whole-contract companions (Stage A ladder, retain $2,000, MNQ at 10 points): TopStep best flat $1000 (50 MNQ = $1,000) $2,945, best percent 50% cushion $2,719 (ex-credit $2,687, bust 35.8%, 1552/20000 survivors); FTMO best flat $800 (40 MNQ = $800) $2,744, best percent 50% cushion $2,121 (ex-credit $2,102). Neither percent row beats its job's best flat.

**Compared with the post-audit run:** every per-cycle net, bust rate and survivor count shown is identical; only monthly net moved. The new CLI caps the horizon credit at one request (T32) and prints it: TopStep flat $1000 shows monthly $3,065, credit $35 and monthly ex-credit $3,026. The post-audit monthly ($3,142) included the older, uncapped credit, which that CLI did not print separately. So the baseline moved through the horizon-credit term (T32), not through the simulation. **Conclusion changed in level, not order:** best flat is still TopStep flat $1000 and FTMO flat $800, now $3,065 (was $3,142) and $2,924 (was $2,984). FTMO flat $1000 fell from second to third behind flat $600. The F0 finding holds: retain $0 and $2,000 give the same TopStep flat $1000 monthly ($3,065 both).

## Result 2: average-reward DP (Stage DP) and gate D11

| Field | ftmo-futures growth | topstep no-fee-standard | Post-audit (FTMO / TopStep) |
|---|---|---|---|
| Exit / status | exit 0, `status: converged` | exit 0, `status: converged` | exit 1, `solve-cap-reached` / same |
| Solves used (cap) | 9 (default 12) | 9 (default 12) | 8 (default 8) / 8 |
| Solve time / process real | 563.0s / 566.68 s | 3981.8s / 3988.08 s | FTMO 169.7s / 171.94 s; TopStep 2228.9s / 2232.78 s |
| States | 918945 | 1760770 | 918945 / 1760770 |
| Funded value iteration | 95 sweeps, every state within $14.18 of the fixed point | 91 sweeps, every state within $13.50 of the fixed point | 300 sweeps, $12.32 / 391 sweeps, $14.89 |
| Rate-search trace ($/day -> h) | $0.00 -> $21,763; $81.51 -> $12,270; $186.86 -> $2,039; $207.86 -> $959; $226.51 -> $350; $237.22 -> $90; $240.91 -> $9; $241.33 -> $0; $241.34 -> $0 | $0.00 -> $20,118; $75.35 -> $11,173; $169.47 -> $2,043; $190.53 -> $990; $210.33 -> $390; $223.20 -> $104; $227.88 -> $16; $228.75 -> $1; $228.79 -> $0 | ended at $246.32 -> $0 / $232.38 -> $1 |
| DP-predicted rate | $241.34/day, $5,068/month per slot | $228.79/day, $4,805/month per slot | $5,173 / $4,880 |
| Empirical eventual eval pass (1000-attempt retry cap) | 100.0% | 100.0% | 100.0% / 100.0% |
| Empirical funded survive / funded bust | 9.7% / 90.3% | 16.4% / 83.6% | 10.4% / 89.6%; 16.6% / 83.4% |
| **Empirical monthly net per slot** | **$4,851** | **$3,181** | $4,928 / $3,244 |
| Empirical horizon credit per cycle | $62 | $136 | $205 / $295 |
| Gap vs DP-predicted (printed) | -$217 | -$1,624 | -$245 / -$1,636 |
| Day-1 eval risk, trades 1-4 | $600 / $600 / $600 / $600 | $800 / $800 / $800 / $750 | unchanged |
| Day-1 funded risk, trades 1-4 | $600 / $800 / $1000 / $0 | $800 / $1400 / $800 / $2000 | unchanged |
| Warnings | cycle-baseline coarse-grid warning (steps of $2,000 past $2,000 above the locked floor, grid top $10,000); no "did not converge" warning | same (grid top $12,000) | both also printed "rate search did not converge" |

**Gate D11** (pass iff the DP's empirical monthly net is at least the best flat's on at least 1 of the 2 plans and never below 0.8x the best flat on either), against Stage V's best flat rows: FTMO $4,851 vs flat $800 $2,924 (Stage A ladder; $2,929 with the pinned ladder), TopStep $3,181 vs flat $1000 $3,065. The DP is above the best flat on both plans, so both conditions hold. **Verdict: PASSED**, on converged solves (exit 0), which the post-audit run could not establish.

**Compared with the post-audit run (N-73):**
- **Conclusion changed:** the verdict goes from "not established" to PASSED. The unchanged job line now runs under the new 12-solve default and both solves stop at 9 with `status: converged`.
- The DP still beats the best flat on both plans, by less on TopStep ($3,181 vs $3,065; was $3,244 vs $3,142) and about the same on FTMO ($4,851 vs $2,924; was $4,928 vs $2,984). Both flat baselines and both DP empirical figures fell; the DP's printed horizon credit per cycle fell from $205 / $295 to $62 / $136.
- **DP-vs-empirical gap:** FTMO -$217 (close), TopStep -$1,624 (unchanged in substance). The TopStep DP rate still overstates what its own policy earns; treat its predicted $4,805/month as optimistic and cite the empirical $3,181.
- States are identical; the funded value iteration now needs 95 / 91 sweeps (was 300 / 391). Solve times are not comparable: this DP ran alongside E live cap and F on a loaded machine.

## Result 3: base funded sweep, 1-year horizon (Stage B)

New columns are seed 42 with the 3-seed range (42/1337/2024) in brackets; "post-audit" columns are copied from that run. Sorted by the new $250 monthly net. Base jobs have no percent rows (see Result 4 for the whole-contract percent rows).

| Plan | $250 $/mo, new | $250 $/mo, post-audit | $250 per-cycle | $250 horizon credit | $250 monthly ex-credit | $250 bust when funded | $250 survivors | Best flat, new | Best flat ex-credit | Best flat, post-audit |
|---|---|---|---|---|---|---|---|---|---|---|
| topstep pro-account (not buyable) | $2,263 ($2,263..$2,266) | $2,275 ($2,275..$2,278) | $5,911 | $12 | $2,258 | 95.9% | 4092/100000 | $400 $2,614 | $2,598 | $400 $2,689 |
| tradeify lightning | $2,082 ($2,081..$2,084) | $2,082 ($2,081..$2,084) | $5,491 | $9 | $2,078 | 98.2% | 1815/100000 | $400 $2,946 | $2,809 | $1000 $5,872 |
| lucid direct | $2,016 ($2,016..$2,018) | $2,039 ($2,039..$2,041) | $8,957 | $452 | $1,919 | 74.9% | 25082/100000 | $400 $2,127 | $1,963 | $1000 $8,375 |
| topstep no-fee-consistency | $1,924 ($1,917..$1,924) | $1,924 ($1,917..$1,924) | $1,956 | $1 | $1,923 | 42.7% | 189/100000 | $1000 $4,326 | $4,287 | $1000 $4,431 |
| topstep no-fee-standard | $1,920 ($1,914..$1,920) | $1,930 ($1,924..$1,930) | $2,370 | $5 | $1,915 | 41.0% | 1749/100000 | $1000 $3,079 | $3,040 | $1000 $3,157 |
| ftmo-futures growth | $1,918 ($1,906..$1,918) | $1,918 ($1,906..$1,918) | $1,895 | $0 | $1,918 | 41.2% | 160/100000 | $800 $2,927 | $2,910 | $800 $2,986 |
| topstep standard-consistency | $1,906 ($1,899..$1,906) | $1,906 ($1,899..$1,906) | $1,938 | $1 | $1,906 | 42.7% | 189/100000 | $1000 $4,293 | $4,255 | $1000 $4,399 |
| topstep standard-standard | $1,905 ($1,900..$1,905) | $1,916 ($1,910..$1,916) | $2,352 | $5 | $1,901 | 41.0% | 1749/100000 | $1000 $3,059 | $3,020 | $1000 $3,137 |
| tradeify growth | $1,872 ($1,863..$1,872) | $1,872 ($1,863..$1,872) | $2,210 | $2 | $1,871 | 42.8% | 454/100000 | $500 $3,324 | $3,200 | $1000 $5,159 |
| tradeify select-flex | $1,869 ($1,859..$1,869) | $1,870 ($1,859..$1,870) | $2,063 | $2 | $1,868 | 41.3% | 473/100000 | $1000 $3,522 | $3,481 | $1000 $3,620 |
| lucid pro-no-dll | $1,858 ($1,847..$1,858) | $1,858 ($1,847..$1,858) | $1,869 | $1 | $1,858 | 42.4% | 204/100000 | $1000 $3,681 | $3,542 | $1000 $7,296 |
| apex intraday | $1,840 ($1,834..$1,840) | $1,840 ($1,834..$1,840) | $2,095 | $0 | $1,840 | 31.4% | 10937/100000 | $500 $2,394 | $2,394 | $500 $2,394 |
| topstep no-fee-standard-dll | $1,838 ($1,833..$1,838) | $1,839 ($1,834..$1,839) | $2,183 | $2 | $1,837 | 41.9% | 638/100000 | $800 $2,862 | $2,845 | $800 $2,950 |
| lucid daily-intraday | $1,826 ($1,816..$1,826) | $1,826 ($1,816..$1,826) | $1,486 | $0 | $1,826 | 42.5% | 19/100000 | $800 $2,869 | $2,869 | $800 $2,869 |
| topstep no-fee-consistency-dll | $1,823 ($1,814..$1,823) | $1,823 ($1,814..$1,823) | $1,954 | $0 | $1,823 | 42.4% | 186/100000 | $800 $2,972 | $2,970 | $800 $2,976 |
| alphafutures standard | $1,818 ($1,808..$1,818) | $1,818 ($1,808..$1,818) | $2,080 | $2 | $1,816 | 42.3% | 485/100000 | $500 $2,340 | $2,282 | $500 $2,340 |
| lucid pro | $1,817 ($1,806..$1,817) | $1,817 ($1,806..$1,817) | $1,896 | $1 | $1,816 | 42.5% | 206/100000 | $800 $3,505 | $3,383 | $1000 $6,903 |
| topstep standard-standard-dll | $1,815 ($1,810..$1,815) | $1,816 ($1,810..$1,816) | $2,156 | $2 | $1,814 | 41.9% | 638/100000 | $800 $2,824 | $2,806 | $800 $2,911 |
| topstep standard-consistency-dll | $1,798 ($1,788..$1,798) | $1,798 ($1,788..$1,798) | $1,927 | $0 | $1,797 | 42.4% | 186/100000 | $800 $2,920 | $2,919 | $800 $2,924 |
| lucid daily-eod | $1,790 ($1,780..$1,790) | $1,790 ($1,780..$1,790) | $1,457 | $0 | $1,790 | 42.5% | 19/100000 | $800 $2,720 | $2,720 | $800 $2,720 |
| lucid daily-intraday-dll | $1,776 ($1,766..$1,776) | $1,776 ($1,766..$1,776) | $1,511 | $0 | $1,776 | 42.5% | 19/100000 | $800 $2,370 | $2,370 | $800 $2,370 |
| mffu rapid | $1,761 ($1,750..$1,761) | $1,761 ($1,750..$1,761) | $1,433 | $0 | $1,761 | 42.5% | 19/100000 | $800 $2,596 | $2,596 | $800 $2,596 |
| tradeify select-daily | $1,750 ($1,736..$1,750) | $1,750 ($1,736..$1,750) | $1,353 | $0 | $1,750 | 41.6% | 11/100000 | $1000 $2,465 | $2,465 | $1000 $2,481 |
| lucid daily-eod-dll | $1,742 ($1,731..$1,742) | $1,742 ($1,731..$1,742) | $1,482 | $0 | $1,742 | 42.5% | 19/100000 | $800 $2,259 | $2,259 | $800 $2,259 |
| alphafutures zero | $1,700 ($1,700..$1,702) | $1,700 ($1,700..$1,702) | $3,246 | $133 | $1,633 | 32.5% | 10162/100000 | $300 $1,706 | $1,624 | $300 $1,706 |
| mffu rapid-eod | $1,648 ($1,636..$1,648) | $1,648 ($1,636..$1,648) | $1,456 | $0 | $1,648 | 43.0% | 19/100000 | $800 $1,999 | $1,999 | $800 $1,999 |
| fundednext legacy | $1,633 ($1,623..$1,633) | $1,634 ($1,623..$1,634) | $1,772 | $1 | $1,632 | 41.3% | 357/100000 | $1000 $4,730 | $4,725 | $1000 $4,753 |
| mffu pro | $1,583 ($1,575..$1,583) | $1,583 ($1,575..$1,583) | $1,832 | $4 | $1,579 | 42.0% | 702/100000 | $400 $1,852 | $1,852 | $400 $1,852 |
| lucid maxx (invite-only) | $1,582 ($1,566..$1,582) | $1,582 ($1,566..$1,582) | $1,344 | $0 | $1,582 | 42.1% | 8/100000 | $600 $1,835 | $1,835 | $600 $1,835 |
| alphafutures advanced | $1,566 ($1,552..$1,566) | $1,566 ($1,552..$1,566) | $1,415 | $1 | $1,565 | 32.7% | 268/100000 | $1000 $3,175 | $3,175 | $1000 $3,175 |
| tpt | $1,483 ($1,468..$1,483) | $1,483 ($1,468..$1,483) | $1,134 | $0 | $1,483 | 41.3% | 11/100000 | $800 $1,947 | $1,947 | $800 $1,947 |
| apex eod | $1,366 ($1,358..$1,366) | $1,366 ($1,358..$1,366) | $1,498 | $0 | $1,366 | 29.8% | 11353/100000 | $300 $1,410 | $1,410 | $300 $1,410 |
| e8futures signature | $1,195 ($1,191..$1,195) | $1,195 ($1,191..$1,195) | $955 | $0 | $1,195 | 25.9% | 17055/100000 | $400 $1,420 | $1,420 | $400 $1,420 |
| fundednext flex | $1,084 ($1,084..$1,088) | $1,084 ($1,084..$1,088) | $602 | $0 | $1,084 | 27.3% | 12970/100000 | $500 $1,321 | $1,321 | $500 $1,321 |
| fundednext rapid-pro | $988 ($979..$988) | $988 ($979..$988) | $674 | $0 | $988 | 26.1% | 16456/100000 | $250 $988 | $988 | $250 $988 |
| fundednext fnl-003 | $982 ($982..$983) | $982 ($982..$983) | $2,429 | $0 | $982 | 54.4% | 45578/100000 | $400 $1,062 | $1,062 | $400 $1,062 |
| mffu builder | $975 ($973..$976) | $975 ($973..$976) | $644 | $0 | $975 | 26.7% | 15491/100000 | $500 $1,360 | $1,360 | $500 $1,360 |
| fundednext rapid-pro-dll-add-on | $957 ($946..$957) | $957 ($946..$957) | $703 | $0 | $957 | 25.8% | 16349/100000 | $250 $957 | $957 | $250 $957 |
| lucid flex | $735 ($731..$735) | $735 ($731..$735) | $581 | $0 | $735 | 23.2% | 19720/100000 | $800 $1,709 | $1,709 | $800 $1,709 |
| lucid flex-dll | $720 ($716..$720) | $720 ($716..$720) | $596 | $0 | $720 | 23.2% | 19718/100000 | $800 $1,317 | $1,317 | $800 $1,317 |
| fundednext rapid-daily | $555 ($554..$560) | $555 ($554..$560) | $308 | $0 | $555 | 23.7% | 18666/100000 | $600 $851 | $851 | $600 $851 |
| ftmo-futures pro | $219 ($194..$219) | $219 ($194..$219) | $37 | $0 | $219 | 23.1% | 0/100000 | $200 $1,598 | $1,594 | $200 $1,598 |
| e8futures zero-starter-100 | $206 ($194..$206) | $206 ($194..$206) | $65 | $0 | $206 | 18.8% | 13469/100000 | $500 $636 | $636 | $500 $636 |
| e8futures zero-starter-80 | $179 ($169..$179) | $179 ($169..$179) | $57 | $0 | $179 | 18.8% | 13469/100000 | $500 $532 | $532 | $500 $532 |
| e8futures zero-max-80 | -$295 (-$307..-$295) | -$295 (-$307..-$295) | -$93 | $0 | -$295 | 18.8% | 13469/100000 | $1000 $108 | $108 | $1000 $108 |
| e8futures zero-max-100 | -$426 (-$441..-$426) | -$426 (-$441..-$426) | -$135 | $0 | -$426 | 18.8% | 13469/100000 | $1000 $25 | $25 | $1000 $25 |

**Compared with the post-audit run:**
- **Per-cycle net, bust rate and survivors are unchanged on every plan** (e.g. Lucid Direct $250 per-cycle $8,957, 74.9%, 25082/100000 in both). Only monthly net moved, and only where the horizon credit is material: Lucid Direct $250 $2,039 to $2,016 (credit $452), TopStep Pro Account $2,275 to $2,263, TopStep No-fee Standard $1,930 to $1,920, Standard Standard $1,916 to $1,905. The size of a move does not follow the printed credit: TopStep No-fee Standard and Standard Standard print a $5 credit but moved $10 and $11, because the move is the removed part of the older, uncapped credit, which the post-audit CLI did not print.
- **$250 ranking:** the top three are unchanged (TopStep Pro Account, Tradeify Lightning, Lucid Direct). TopStep No-fee Consistency ($1,924) now edges No-fee Standard ($1,920) and Standard Consistency ($1,906) edges Standard Standard ($1,905); both pairs were the other way round in the post-audit run. Everything else keeps its place.
- **Best flat changed** on Tradeify Growth ($1000 $5,159 to $500 $3,324), Tradeify Lightning ($1000 $5,872 to $400 $2,946), Lucid Direct ($1000 $8,375 to $400 $2,127) and Lucid Pro ($1000 $6,903 to $800 $3,505); Lucid Pro no-DLL keeps $1000 but falls from $7,296 to $3,681. Post-audit conclusion 3 ("engine-optimal sizing now favors flat $1000 on Lucid Pro/Pro no-DLL/Direct and Tradeify") **no longer holds**: it came from the uncapped horizon credit (Lucid Direct flat $400 still carries a $569 credit per cycle; its ex-credit is $1,963). The best-flat order is back to FundedNext Legacy $4,730, TopStep No-fee Consistency $4,326, Standard Consistency $4,293, then Lucid Pro no-DLL $3,681 and Tradeify Select Flex $3,522.

## Result 4: whole-contract companions, best flat vs best percent (Stage B, seed 42, 252 days, MNQ at 10 points)

The companion is the base job plus the post-audit percent grid and `--stop-points 10 --instrument MNQ`. Flat rows are placed in whole MNQ contracts (flat $150 becomes 7 MNQ = $140, flat $250 becomes 12 MNQ = $240) and contract caps apply in eval and funded, so compare a companion's percent row only with that companion's own flat row. "Post-audit best percent" is the unplaced percent row from the post-audit run, shown only to document N-71; it is not comparable.

| Plan | Base job best flat | Companion best flat (placed) | Companion best percent: monthly / ex-credit | Its per-cycle | Its bust when funded | Its survivors | Post-audit best percent (unreliable) |
|---|---|---|---|---|---|---|---|
| apex eod | $300 $1,410 | $300 (15 MNQ = $300) $1,410 | 20% cushion $1,181 / $1,175 | $2,674 | 16.2% | 24977/100000 | 10% cushion $1,067 |
| apex intraday | $500 $2,394 | $500 (25 MNQ = $500) $2,315 | 50% cushion $1,944 / $1,944 | $1,380 | 33.4% | 8995/100000 | 10% cushion $1,225 |
| tpt | $800 $1,947 | $800 (40 MNQ = $800) $1,947 | 50% cushion $1,682 / $1,682 | $651 | 41.6% | 0/100000 | 15% cushion $768 |
| tradeify growth | $500 $3,324 | $500 (25 MNQ = $500) $3,307 | 50% cushion $2,652 / $2,487 | $4,303 | 32.6% | 10633/100000 | 15% cushion $3,641 |
| tradeify select-flex | $1000 $3,522 | $800 (40 MNQ = $800) $3,212 | 50% cushion $2,967 / $2,935 | $3,451 | 35.7% | 6131/100000 | 15% cushion $1,428 |
| tradeify select-daily | $1000 $2,465 | $800 (40 MNQ = $800) $2,072 | 50% cushion $1,809 / $1,809 | $1,032 | 41.7% | 0/100000 | 15% cushion $896 |
| tradeify lightning | $400 $2,946 | $400 (20 MNQ = $400) $2,945 | 50% cushion $2,142 / $1,984 | $7,961 | 71.8% | 28156/100000 | 15% cushion $4,257 |
| lucid daily-eod | $800 $2,720 | $800 (40 MNQ = $800) $2,720 | 50% cushion $2,023 / $2,023 | $807 | 42.8% | 0/100000 | 15% cushion $918 |
| lucid daily-eod-dll | $800 $2,259 | $800 (40 MNQ = $800) $2,259 | 50% cushion $1,807 / $1,807 | $875 | 42.7% | 0/100000 | 15% cushion $917 |
| lucid daily-intraday | $800 $2,869 | $800 (40 MNQ = $800) $2,869 | 50% cushion $2,096 / $2,096 | $836 | 42.8% | 0/100000 | 15% cushion $924 |
| lucid daily-intraday-dll | $800 $2,370 | $800 (40 MNQ = $800) $2,370 | 50% cushion $1,867 / $1,867 | $904 | 42.7% | 0/100000 | 15% cushion $922 |
| lucid flex | $800 $1,709 | $800 (40 MNQ = $800) $1,601 | 50% cushion $1,295 / $1,295 | $686 | 34.2% | 8477/100000 | 15% cushion $561 |
| lucid flex-dll | $800 $1,317 | $800 (40 MNQ = $800) $1,279 | 50% cushion $1,124 / $1,124 | $744 | 33.2% | 9343/100000 | 15% cushion $540 |
| lucid pro | $800 $3,505 | $800 (40 MNQ = $800) $3,507 | 50% cushion $3,211 / $3,097 | $3,623 | 36.8% | 5940/100000 | 25% cushion $624,388,543 |
| lucid pro-no-dll | $1000 $3,681 | $800 (40 MNQ = $800) $3,679 | 50% cushion $3,336 / $3,216 | $3,472 | 37.0% | 5744/100000 | 25% cushion $1,743,617,717 |
| lucid direct | $400 $2,127 | $400 (20 MNQ = $400) $2,127 | 50% cushion $1,903 / $1,743 | $6,633 | 72.9% | 27144/100000 | 25% cushion $973,964,343 |
| lucid maxx | $600 $1,835 | $600 (30 MNQ = $600) $1,835 | 50% cushion $1,675 / $1,675 | $782 | 42.2% | 0/100000 | 15% cushion $859 |
| mffu rapid | $800 $2,596 | $800 (40 MNQ = $800) $2,596 | 50% cushion $2,072 / $2,072 | $788 | 42.8% | 0/100000 | 15% cushion $914 |
| mffu rapid-eod | $800 $1,999 | $600 (30 MNQ = $600) $1,885 | 50% cushion $1,564 / $1,564 | $852 | 44.3% | 0/100000 | 15% cushion $908 |
| mffu pro | $400 $1,852 | $150 (7 MNQ = $140) $585 | 50% cushion $584 / $567 | $2,821 | 9.0% | 35769/100000 | 15% cushion $1,155 |
| mffu builder | $500 $1,360 | $500 (25 MNQ = $500) $1,360 | 50% cushion $1,122 / $1,122 | $699 | 34.5% | 7654/100000 | 15% cushion $663 |
| topstep standard-standard | $1000 $3,059 | $1000 (50 MNQ = $1,000) $2,907 | 50% cushion $2,689 / $2,657 | $3,416 | 35.7% | 7337/100000 | 15% cushion $1,281 |
| topstep standard-standard-dll | $800 $2,824 | $800 (40 MNQ = $800) $2,646 | 50% cushion $2,085 / $2,068 | $2,249 | 39.5% | 3257/100000 | 15% cushion $1,385 |
| topstep standard-consistency | $1000 $4,293 | $1000 (50 MNQ = $1,000) $4,009 | 50% cushion $3,684 / $3,649 | $4,079 | 37.2% | 5674/100000 | 15% cushion $1,323 |
| topstep standard-consistency-dll | $800 $2,920 | $800 (40 MNQ = $800) $2,802 | 50% cushion $2,364 / $2,361 | $2,222 | 41.9% | 574/100000 | 15% cushion $1,769 |
| topstep no-fee-standard | $1000 $3,079 | $1000 (50 MNQ = $1,000) $2,927 | 50% cushion $2,703 / $2,671 | $3,434 | 35.7% | 7337/100000 | 15% cushion $1,284 |
| topstep no-fee-standard-dll | $800 $2,862 | $800 (40 MNQ = $800) $2,678 | 50% cushion $2,110 / $2,093 | $2,277 | 39.5% | 3257/100000 | 15% cushion $1,390 |
| topstep no-fee-consistency | $1000 $4,326 | $1000 (50 MNQ = $1,000) $4,034 | 50% cushion $3,700 / $3,665 | $4,096 | 37.2% | 5674/100000 | 15% cushion $1,327 |
| topstep no-fee-consistency-dll | $800 $2,972 | $800 (40 MNQ = $800) $2,839 | 50% cushion $2,394 / $2,390 | $2,249 | 41.9% | 574/100000 | 15% cushion $1,775 |
| topstep pro-account | $400 $2,614 | $400 (20 MNQ = $400) $2,614 | 50% cushion $1,753 / $1,732 | $4,889 | 84.6% | 15430/100000 | 10% cushion $1,209 |
| fundednext flex | $500 $1,321 | $500 (25 MNQ = $500) $1,321 | 50% cushion $1,086 / $1,086 | $528 | 32.0% | 8215/100000 | 10% cushion $588 |
| fundednext legacy | $1000 $4,730 | $1000 (50 MNQ = $1,000) $4,526 | 50% cushion $3,833 / $3,829 | $2,644 | 44.4% | 317/100000 | 50% cushion $36,790 |
| fundednext rapid-pro | $250 $988 | $250 (12 MNQ = $240) $970 | 50% cushion $688 / $688 | $351 | 33.0% | 9742/100000 | 10% cushion $534 |
| fundednext rapid-pro-dll-add-on | $250 $957 | $250 (12 MNQ = $240) $941 | 50% cushion $553 / $553 | $460 | 30.9% | 11350/100000 | 7.5% cushion $520 |
| fundednext rapid-daily | $600 $851 | $600 (30 MNQ = $600) $851 | 30% cushion $702 / $702 | $691 | 26.7% | 15375/100000 | 10% cushion $442 |
| fundednext fnl-003 | $400 $1,062 | $400 (20 MNQ = $400) $1,062 | 50% cushion $870 / $870 | $1,646 | 68.4% | 31597/100000 | 5% cushion $470 |
| alphafutures zero | $300 $1,706 | $300 (15 MNQ = $300) $1,607 | 50% cushion $1,084 / $998 | $3,166 | 26.8% | 20286/100000 | 7.5% cushion $876 |
| alphafutures standard | $500 $2,340 | $500 (25 MNQ = $500) $2,339 | 50% cushion $1,538 / $1,401 | $1,953 | 35.6% | 7127/100000 | 15% cushion $1,205 |
| alphafutures advanced | $1000 $3,175 | $1000 (50 MNQ = $1,000) $3,173 | 50% cushion $2,766 / $2,766 | $1,303 | 33.1% | 1/100000 | 20% cushion $1,208 |
| e8futures signature | $400 $1,420 | $400 (20 MNQ = $400) $1,418 | 50% cushion $1,022 / $1,021 | $923 | 30.4% | 12144/100000 | 10% cushion $796 |
| e8futures zero-max-80 | $1000 $108 | $1000 (50 MNQ = $1,000) -$20 | 50% cushion $455 / $455 | $149 | 29.1% | 3089/100000 | 20% cushion $116 |
| e8futures zero-max-100 | $1000 $25 | $1000 (50 MNQ = $1,000) -$121 | 50% cushion $513 / $513 | $168 | 29.1% | 3089/100000 | 20% cushion $135 |
| e8futures zero-starter-80 | $500 $532 | $500 (25 MNQ = $500) $502 | 50% cushion $445 / $445 | $143 | 26.3% | 5973/100000 | 15% cushion $202 |
| e8futures zero-starter-100 | $500 $636 | $500 (25 MNQ = $500) $600 | 50% cushion $539 / $539 | $173 | 26.3% | 5973/100000 | 15% cushion $249 |
| ftmo-futures growth | $800 $2,927 | $800 (40 MNQ = $800) $2,748 | 50% cushion $2,121 / $2,103 | $2,268 | 37.6% | 3917/100000 | 15% cushion $1,176 |
| ftmo-futures pro | $200 $1,598 | $250 (12 MNQ = $240) $1,851 | 7.5% cushion $855 / $843 | $2,346 | 1.0% | 21909/100000 | 7.5% cushion $917 |

**Compared with the post-audit run:**
- **N-71 is gone.** No percent row in any stage prints a monthly net of $20,000 or more; the largest percent row in B is FundedNext Legacy 50% cushion $3,833, and across all stages it is D FundedNext Legacy seed 1337 sp20 50% cushion $8,997 (see Engine anomalies for that stage). Bust when funded now rises with the percent (Lucid Daily EOD companion: 5% cushion 0.0%, 15% 13.2%, 25% 40.6%), where the post-audit percent rows reported 0.0% bust from 5% to 40%.
- **Best percent vs best flat:** the best percent row is 50% of cushion on 43 of the 46 plans at seed 42, and it ranks first in its job only on E8 Zero MAX 80 and 100 (all 3 seeds). In the other stages' companions a percent row ranks first in 4 of 88 C commission files (E8 Zero MAX), 10 of 88 E request-size files (Apex EOD, E8 Zero), 4 of 44 E live-cap files (FundedNext Rapid Daily, MFF Pro cap 3, Tradeify Select Daily cap 2 at seed 1337) and none of the C path-walk, F or V companions. So percent-of-cushion sizing is the better choice on a few buyable plans: E8 Zero MAX (B and C commission), Apex EOD and E8 Zero under a request size, and the live-capped FundedNext Rapid Daily, MFF Pro and Tradeify Select Daily jobs above. On every other buyable plan flat-dollar sizing stays the better choice.
- The companion's best flat differs from the base job's on 32 of the 46 plans. It is mostly lower, from MNQ rounding and contract caps (Tradeify Select Flex $3,522 to $3,212, FTMO Growth $2,927 to $2,748, TopStep No-fee Standard $3,079 to $2,927, Apex Intraday $2,394 to $2,315, Lucid Flex $1,709 to $1,601, MFF Rapid EOD $1,999 to $1,885, FundedNext Legacy $4,730 to $4,526, Alpha Zero $1,706 to $1,607, and every TopStep variant), and sometimes higher (FTMO Pro $200 $1,598 to $250, placed as 12 MNQ = $240, $1,851; Lucid Pro $3,505 to $3,507). MFF Pro drops from $400 $1,852 to $585 because its published funded limit is 5 micros: every flat of $100 or more places 5 MNQ = $100 at 10 points, so its nine flat rows are one policy (N-75, correct behaviour). The base job (no `--stop-points`) applies no contract limit, so on MFF Pro its flat ranking above $100 is only reachable with NQ. On other plans the top MNQ flats merge the same way under their own caps ($800 and $1000 on 40-micro plans, $600 to $1000 on 30-micro plans).

## Result 5: horizon robustness (seed 42, monthly net per slot)

| Plan | $250 6mo | $250 1yr | $250 2yr | Best flat 6mo | Best flat 1yr | Best flat 2yr |
|---|---|---|---|---|---|---|
| apex eod | $1,345 | $1,366 | $1,366 | $300 $1,408 | $300 $1,410 | $300 $1,410 |
| apex intraday | $1,802 | $1,840 | $1,840 | $500 $2,394 | $500 $2,394 | $500 $2,394 |
| tpt | $1,466 | $1,483 | $1,483 | $800 $1,947 | $800 $1,947 | $800 $1,947 |
| tradeify growth | $1,793 | $1,872 | $1,881 | $500 $3,027 | $500 $3,324 | $500 $3,513 |
| tradeify select-flex | $1,785 | $1,869 | $1,879 | $1000 $3,096 | $1000 $3,522 | $1000 $3,796 |
| tradeify select-daily | $1,732 | $1,750 | $1,750 | $1000 $2,357 | $1000 $2,465 | $1000 $2,571 |
| tradeify lightning | $1,990 | $2,082 | $2,095 | $400 $2,864 | $400 $2,946 | $400 $2,970 |
| lucid daily-eod | $1,766 | $1,790 | $1,791 | $800 $2,720 | $800 $2,720 | $800 $2,720 |
| lucid daily-eod-dll | $1,718 | $1,742 | $1,743 | $800 $2,259 | $800 $2,259 | $800 $2,259 |
| lucid daily-intraday | $1,803 | $1,826 | $1,826 | $800 $2,869 | $800 $2,869 | $800 $2,869 |
| lucid daily-intraday-dll | $1,753 | $1,776 | $1,777 | $800 $2,370 | $800 $2,370 | $800 $2,370 |
| lucid flex | $735 | $735 | $735 | $800 $1,709 | $800 $1,709 | $800 $1,709 |
| lucid flex-dll | $720 | $720 | $720 | $800 $1,317 | $800 $1,317 | $800 $1,317 |
| lucid pro | $1,755 | $1,817 | $1,822 | $800 $3,164 | $800 $3,505 | $1000 $3,751 |
| lucid pro-no-dll | $1,796 | $1,858 | $1,864 | $800 $3,427 | $1000 $3,681 | $800 $3,868 |
| lucid direct | $1,870 | $2,016 | $2,080 | $400 $2,120 | $400 $2,127 | $400 $2,123 |
| lucid maxx | $1,562 | $1,582 | $1,582 | $600 $1,835 | $600 $1,835 | $600 $1,835 |
| mffu rapid | $1,736 | $1,761 | $1,761 | $800 $2,596 | $800 $2,596 | $800 $2,596 |
| mffu rapid-eod | $1,624 | $1,648 | $1,649 | $800 $1,999 | $800 $1,999 | $800 $1,999 |
| mffu pro | $1,484 | $1,583 | $1,597 | $400 $1,828 | $400 $1,852 | $400 $1,852 |
| mffu builder | $975 | $975 | $975 | $500 $1,360 | $500 $1,360 | $500 $1,360 |
| topstep standard-standard | $1,813 | $1,905 | $1,941 | $1000 $2,762 | $1000 $3,059 | $1000 $3,235 |
| topstep standard-standard-dll | $1,731 | $1,815 | $1,829 | $800 $2,610 | $800 $2,824 | $800 $2,984 |
| topstep standard-consistency | $1,850 | $1,906 | $1,910 | $1000 $3,994 | $1000 $4,293 | $1000 $4,542 |
| topstep standard-consistency-dll | $1,740 | $1,798 | $1,802 | $800 $2,801 | $800 $2,920 | $800 $2,937 |
| topstep no-fee-standard | $1,830 | $1,920 | $1,954 | $1000 $2,794 | $1000 $3,079 | $1000 $3,247 |
| topstep no-fee-standard-dll | $1,756 | $1,838 | $1,852 | $800 $2,658 | $800 $2,862 | $800 $3,012 |
| topstep no-fee-consistency | $1,868 | $1,924 | $1,928 | $1000 $4,041 | $1000 $4,326 | $1000 $4,561 |
| topstep no-fee-consistency-dll | $1,767 | $1,823 | $1,827 | $800 $2,856 | $800 $2,972 | $800 $2,988 |
| topstep pro-account | $2,212 | $2,263 | $2,273 | $500 $2,697 | $400 $2,614 | $400 $2,541 |
| fundednext flex | $1,084 | $1,084 | $1,084 | $500 $1,321 | $500 $1,321 | $500 $1,321 |
| fundednext legacy | $1,560 | $1,633 | $1,640 | $1000 $4,471 | $1000 $4,730 | $1000 $4,807 |
| fundednext rapid-pro | $988 | $988 | $988 | $250 $988 | $250 $988 | $250 $988 |
| fundednext rapid-pro-dll-add-on | $957 | $957 | $957 | $250 $957 | $250 $957 | $250 $957 |
| fundednext rapid-daily | $555 | $555 | $555 | $600 $851 | $600 $851 | $600 $851 |
| fundednext fnl-003 | $989 | $982 | $982 | $400 $1,074 | $400 $1,062 | $400 $1,062 |
| alphafutures zero | $1,540 | $1,700 | $1,790 | $300 $1,563 | $300 $1,706 | $250 $1,790 |
| alphafutures standard | $1,724 | $1,818 | $1,829 | $500 $2,201 | $500 $2,340 | $500 $2,447 |
| alphafutures advanced | $1,473 | $1,566 | $1,575 | $1000 $3,161 | $1000 $3,175 | $1000 $3,175 |
| e8futures signature | $1,195 | $1,195 | $1,195 | $400 $1,420 | $400 $1,420 | $400 $1,420 |
| e8futures zero-max-80 | -$295 | -$295 | -$295 | $1000 $108 | $1000 $108 | $1000 $108 |
| e8futures zero-max-100 | -$426 | -$426 | -$426 | $1000 $25 | $1000 $25 | $1000 $25 |
| e8futures zero-starter-80 | $179 | $179 | $179 | $500 $532 | $500 $532 | $500 $532 |
| e8futures zero-starter-100 | $206 | $206 | $206 | $500 $636 | $500 $636 | $500 $636 |
| ftmo-futures growth | $1,861 | $1,918 | $1,923 | $800 $2,723 | $800 $2,927 | $800 $3,093 |
| ftmo-futures pro | $219 | $219 | $219 | $200 $1,485 | $200 $1,598 | $200 $1,625 |

**Compared with the post-audit run:** same shape (daily-payout and payout-capped plans flat across horizons; TopStep, Tradeify, Lucid Pro, FTMO Growth and FundedNext Legacy grow with the horizon). **Changed:** Tradeify Growth ($500 at every horizon, was $1000), Tradeify Lightning ($400, was $1000), Lucid Direct ($400, was $1000; now flat across horizons at $2,120 to $2,127, was $8,044 to $8,572), Lucid Pro ($800 at 6 months and 1 year, $1000 at 2 years; was $1000 at all three) and Lucid Pro no-DLL ($800 at 6 months and 2 years, $1000 at 1 year). The post-audit growth of those plans' best flat with the horizon came from the credit; at $250 Lucid Direct still grows ($1,870 / $2,016 / $2,080) with a credit per cycle of $539 / $452 / $375.

## Result 6: sensitivity matrix at flat $250 (seed 42, monthly net per slot, 1-year horizon)

"10pt cap" and "20pt cap" are Stage D, now placed in whole NQ contracts: flat $250 is placed as 1 NQ = $200 at 10 points and left out at 20 points (one NQ is $400 there). "Live cap" is the Stage E cap (Tradeify 3); "live cap 2" is Tradeify at 2. `-` means the stage did not apply. "$500 req" is the Stage E size ($1,000 on tradeify lightning, mffu pro and alphafutures advanced, $800 on fundednext fnl-003).

| Plan | base | 10pt cap | 20pt cap | path-walk | $10 comm | $500 req | live cap | live cap 2 | 15% idle | WR 37% | WR 43% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| apex eod | $1,366 | (1 NQ = $200) $1,229 | left out | - | $949 | $48 | - | - | $1,149 | - | - |
| apex intraday | $1,840 | (1 NQ = $200) $1,539 | left out | $1,702 | $1,447 | $419 | - | - | $1,558 | $971 | $2,617 |
| tpt | $1,483 | (1 NQ = $200) $1,283 | left out | $1,441 | $1,111 | $1,483 | - | - | $1,247 | $707 | $2,277 |
| tradeify growth | $1,872 | (1 NQ = $200) $1,548 | left out | - | $1,463 | $590 | $1,121 | $788 | $1,572 | $1,003 | $2,746 |
| tradeify select-flex | $1,869 | (1 NQ = $200) $1,540 | left out | - | $1,440 | $782 | $836 | $480 | $1,569 | - | - |
| tradeify select-daily | $1,750 | (1 NQ = $200) $1,504 | left out | - | $1,344 | $1,751 | $314 | $115 | $1,473 | - | - |
| tradeify lightning | $2,082 | (1 NQ = $200) $1,640 | left out | - | $1,657 | $1,040 | $1,388 | $1,051 | $1,756 | $1,212 | $2,909 |
| lucid daily-eod | $1,790 | (1 NQ = $200) $1,530 | left out | $1,754 | $1,381 | $1,771 | - | - | $1,507 | $933 | $2,666 |
| lucid daily-eod-dll | $1,742 | (1 NQ = $200) $1,509 | left out | $1,705 | $1,339 | $1,747 | - | - | $1,465 | - | - |
| lucid daily-intraday | $1,826 | (1 NQ = $200) $1,549 | left out | $1,721 | $1,421 | $1,789 | - | - | $1,537 | $988 | $2,688 |
| lucid daily-intraday-dll | $1,776 | (1 NQ = $200) $1,528 | left out | $1,679 | $1,376 | $1,764 | - | - | $1,494 | - | - |
| lucid flex | $735 | (1 NQ = $200) $558 | left out | - | $572 | $458 | $735 | - | $622 | - | - |
| lucid flex-dll | $720 | (1 NQ = $200) $553 | left out | - | $560 | $456 | $720 | - | $606 | - | - |
| lucid pro | $1,817 | (1 NQ = $200) $1,521 | left out | - | $1,413 | $756 | $1,277 | - | $1,529 | - | - |
| lucid pro-no-dll | $1,858 | (1 NQ = $200) $1,539 | left out | - | $1,449 | $757 | $1,310 | - | $1,564 | $963 | $2,739 |
| lucid direct | $2,016 | (1 NQ = $200) $1,531 | left out | - | $1,564 | $387 | $1,560 | - | $1,688 | $1,173 | $2,809 |
| lucid maxx | $1,582 | - | - | - | - | - | - | - | $1,326 | - | - |
| mffu rapid | $1,761 | (1 NQ = $200) $1,513 | left out | $1,723 | $1,349 | $1,756 | - | - | $1,482 | $887 | $2,647 |
| mffu rapid-eod | $1,648 | (1 NQ = $200) $1,437 | left out | - | $1,237 | $1,696 | - | - | $1,383 | - | - |
| mffu pro | $1,583 | (1 NQ = $200) $1,268 | left out | - | $1,156 | $932 | $874 | - | $1,319 | - | - |
| mffu builder | $975 | (1 NQ = $200) $758 | left out | - | $792 | $418 | - | - | $826 | - | - |
| topstep standard-standard | $1,905 | (1 NQ = $200) $1,546 | left out | - | $1,517 | $746 | - | - | $1,601 | - | - |
| topstep standard-standard-dll | $1,815 | (1 NQ = $200) $1,492 | left out | - | $1,391 | $729 | - | - | $1,527 | - | - |
| topstep standard-consistency | $1,906 | (1 NQ = $200) $1,548 | left out | - | $1,525 | $712 | - | - | $1,605 | - | - |
| topstep standard-consistency-dll | $1,798 | (1 NQ = $200) $1,494 | left out | - | $1,396 | $696 | - | - | $1,513 | - | - |
| topstep no-fee-standard | $1,920 | (1 NQ = $200) $1,556 | left out | - | $1,535 | $752 | - | - | $1,614 | $1,116 | $2,696 |
| topstep no-fee-standard-dll | $1,838 | (1 NQ = $200) $1,507 | left out | - | $1,417 | $739 | - | - | $1,547 | - | - |
| topstep no-fee-consistency | $1,924 | (1 NQ = $200) $1,558 | left out | - | $1,544 | $718 | - | - | $1,621 | $1,118 | $2,741 |
| topstep no-fee-consistency-dll | $1,823 | (1 NQ = $200) $1,510 | left out | - | $1,422 | $706 | - | - | $1,535 | - | - |
| topstep pro-account | $2,263 | - | - | - | - | - | - | - | $1,914 | - | - |
| fundednext flex | $1,084 | (1 NQ = $200) $974 | left out | - | $795 | $454 | $726 | - | $921 | - | - |
| fundednext legacy | $1,633 | (1 NQ = $200) $1,349 | left out | - | $1,247 | $702 | $1,043 | - | $1,372 | - | - |
| fundednext rapid-pro | $988 | (1 NQ = $200) $842 | left out | - | $709 | $276 | $560 | - | $834 | - | - |
| fundednext rapid-pro-dll-add-on | $957 | (1 NQ = $200) $827 | left out | - | $681 | $299 | $567 | - | $805 | - | - |
| fundednext rapid-daily | $555 | (1 NQ = $200) $589 | left out | - | $513 | $394 | $226 | - | $472 | - | - |
| fundednext fnl-003 | $982 | (1 NQ = $200) $912 | left out | - | $802 | $658 | - | - | $832 | - | - |
| alphafutures zero | $1,700 | (1 NQ = $200) $1,425 | left out | - | $1,339 | $571 | $1,038 | - | $1,417 | - | - |
| alphafutures standard | $1,818 | (1 NQ = $200) $1,501 | left out | - | $1,367 | $590 | $1,307 | - | $1,527 | - | - |
| alphafutures advanced | $1,566 | (1 NQ = $200) $1,358 | left out | - | $1,134 | $1,673 | $960 | - | $1,309 | - | - |
| e8futures signature | $1,195 | (1 NQ = $200) $956 | left out | - | $948 | $316 | - | - | $1,009 | $665 | $1,682 |
| e8futures zero-max-80 | -$295 | (1 NQ = $200) -$248 | left out | - | -$621 | -$295 | - | - | -$258 | - | - |
| e8futures zero-max-100 | -$426 | (1 NQ = $200) -$354 | left out | - | -$839 | -$426 | - | - | -$371 | - | - |
| e8futures zero-starter-80 | $179 | (1 NQ = $200) $122 | left out | - | -$93 | $179 | - | - | $146 | - | - |
| e8futures zero-starter-100 | $206 | (1 NQ = $200) $139 | left out | - | -$136 | $206 | - | - | $167 | - | - |
| ftmo-futures growth | $1,918 | (1 NQ = $200) $1,580 | left out | - | $1,490 | $1,038 | - | - | $1,613 | $1,077 | $2,767 |
| ftmo-futures pro | $219 | (1 NQ = $200) $1,598 | left out | - | $24 | -$361 | - | - | $175 | - | - |

**Compared with the post-audit run:**
- **Path-walk, live-trigger caps and $10 commission:** unchanged except where the base moved (commission: Lucid Direct $1,608 to $1,564, TopStep No-fee Standard $1,538 to $1,535, Standard Standard $1,521 to $1,517). Every path-walk and live-cap figure is identical, so the realistic view below keeps its figures.
- **15% idle and win rate:** only the plans with a material horizon credit moved (Lucid Direct WR 43% $2,856 to $2,809; TopStep No-fee Standard $2,732 to $2,696). At 43% the order of the 13 plans is unchanged at the top: Tradeify Lightning $2,909, Lucid Direct $2,809, FTMO Growth $2,767, Tradeify Growth $2,746.
- **Contract caps: conclusion changed, not like-for-like.** The post-audit 10pt column equalled base on all but four plans (the old engine kept flat $250 at $250); now flat $250 is placed as 1 NQ = $200 and the 10pt figure falls on most plans (TopStep No-fee Standard $1,556, FTMO Growth $1,580). It rises on FundedNext Rapid Daily ($589 vs $555), FTMO Pro ($1,598 vs $219) and E8 Zero MAX 80 / 100 (-$248 vs -$295; -$354 vs -$426). The 20pt column is empty because flat $250 is below one NQ.
- **$500 requests:** the post-audit rise above base on Lucid Daily and MFF Rapid is gone at $250 (Lucid Daily EOD $1,771 vs base $1,790, was $1,904; MFF Rapid $1,756 vs $1,761, was $1,890); MFF Rapid EOD still sits above base ($1,696 vs $1,648, was $1,826). Tradeify Growth, Lucid Pro/Pro no-DLL/Direct and Legacy now fall well below base ($590, $756, $757, $387, $702). Alpha Advanced at $1,000 per request stays above base ($1,673 vs $1,566, was $1,727). See Result 8.

## Result 7: sensitivity matrix, best flat policy under each scenario (seed 42)

Stage D columns show the best flat row only, with its whole-NQ placement; D's percent rows are in the raw files.

| Plan | base | 10pt cap | 20pt cap | path-walk | $10 comm | $500 req | live cap | live cap 2 | 15% idle | WR 37% | WR 43% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| apex eod | $300 $1,410 | $400 (2 NQ = $400) $1,459 | $400 (1 NQ = $400) $2,072 | - | $400 $1,032 | $150 $158 | - | - | $400 $1,190 | - | - |
| apex intraday | $500 $2,394 | $400 (2 NQ = $400) $2,320 | $800 (2 NQ = $800) $2,951 | $400 $1,950 | $600 $2,062 | $250 $419 | - | - | $500 $2,029 | $500 $1,178 | $500 $3,577 |
| tpt | $800 $1,947 | $800 (4 NQ = $800) $1,947 | $800 (2 NQ = $800) $1,947 | $500 $1,622 | $800 $1,749 | $500 $2,192 | - | - | $800 $1,659 | $800 $973 | $800 $3,130 |
| tradeify growth | $500 $3,324 | $600 (3 NQ = $600) $3,171 | $400 (1 NQ = $400) $2,954 | - | $500 $2,909 | $300 $592 | $400 $1,445 | $400 $973 | $500 $2,741 | $500 $1,708 | $500 $4,769 |
| tradeify select-flex | $1000 $3,522 | $800 (4 NQ = $800) $3,239 | $800 (2 NQ = $800) $3,443 | - | $1000 $3,290 | $500 $837 | $600 $1,685 | $600 $1,294 | $1000 $2,905 | - | - |
| tradeify select-daily | $1000 $2,465 | $800 (4 NQ = $800) $2,138 | $800 (2 NQ = $800) $4,314 | - | $1000 $2,279 | $400 $2,189 | $800 $1,012 | $800 $568 | $1000 $2,061 | - | - |
| tradeify lightning | $400 $2,946 | $400 (2 NQ = $400) $2,980 | $400 (1 NQ = $400) $3,029 | - | $500 $2,602 | $300 $1,179 | $400 $1,771 | $400 $1,448 | $400 $2,488 | $400 $1,805 | $400 $4,032 |
| lucid daily-eod | $800 $2,720 | $800 (4 NQ = $800) $2,743 | $800 (2 NQ = $800) $2,741 | $500 $2,186 | $800 $2,335 | $500 $2,575 | - | - | $800 $2,313 | $1000 $1,535 | $800 $4,144 |
| lucid daily-eod-dll | $800 $2,259 | $800 (4 NQ = $800) $2,261 | $800 (2 NQ = $800) $2,264 | $400 $1,882 | $800 $1,920 | $500 $1,903 | - | - | $800 $1,929 | - | - |
| lucid daily-intraday | $800 $2,869 | $800 (4 NQ = $800) $2,891 | $800 (2 NQ = $800) $2,890 | $500 $2,096 | $1000 $2,497 | $500 $2,602 | - | - | $800 $2,440 | $1000 $1,726 | $800 $4,274 |
| lucid daily-intraday-dll | $800 $2,370 | $800 (4 NQ = $800) $2,372 | $800 (2 NQ = $800) $2,375 | $400 $1,826 | $800 $2,029 | $500 $1,925 | - | - | $800 $2,023 | - | - |
| lucid flex | $800 $1,709 | $800 (4 NQ = $800) $1,617 | $800 (2 NQ = $800) $1,742 | - | $800 $1,500 | $300 $458 | $800 $1,709 | - | $800 $1,449 | - | - |
| lucid flex-dll | $800 $1,317 | $800 (4 NQ = $800) $1,287 | $800 (2 NQ = $800) $1,335 | - | $800 $1,161 | $250 $456 | $800 $1,317 | - | $800 $1,117 | - | - |
| lucid pro | $800 $3,505 | $800 (4 NQ = $800) $3,543 | $800 (2 NQ = $800) $3,574 | - | $800 $2,947 | $300 $759 | $800 $2,080 | - | $800 $2,893 | - | - |
| lucid pro-no-dll | $1000 $3,681 | $800 (4 NQ = $800) $3,713 | $800 (2 NQ = $800) $3,729 | - | $800 $3,122 | $300 $759 | $500 $2,383 | - | $800 $3,071 | $1000 $1,968 | $800 $5,331 |
| lucid direct | $400 $2,127 | $400 (2 NQ = $400) $2,130 | $400 (1 NQ = $400) $2,138 | - | $500 $1,815 | $250 $387 | $400 $1,750 | - | $400 $1,808 | $400 $1,311 | $400 $2,912 |
| lucid maxx | $600 $1,835 | - | - | - | - | - | - | - | $600 $1,540 | - | - |
| mffu rapid | $800 $2,596 | $800 (4 NQ = $800) $2,620 | $800 (2 NQ = $800) $2,618 | $500 $2,085 | $800 $2,214 | $500 $2,553 | - | - | $800 $2,207 | $800 $1,379 | $800 $4,036 |
| mffu rapid-eod | $800 $1,999 | $600 (3 NQ = $600) $1,895 | $800 (2 NQ = $800) $2,022 | - | $800 $1,666 | $500 $2,420 | - | - | $800 $1,694 | - | - |
| mffu pro | $400 $1,852 | $400 (2 NQ = $400) $1,590 | $400 (1 NQ = $400) $1,852 | - | $400 $1,426 | $250 $932 | $400 $1,245 | - | $400 $1,596 | - | - |
| mffu builder | $500 $1,360 | $400 (2 NQ = $400) $1,342 | $800 (2 NQ = $800) $1,955 | - | $500 $1,139 | $250 $418 | - | - | $500 $1,139 | - | - |
| topstep standard-standard | $1000 $3,059 | $1000 (5 NQ = $1,000) $2,907 | $800 (2 NQ = $800) $2,972 | - | $1000 $2,858 | $500 $820 | - | - | $1000 $2,535 | - | - |
| topstep standard-standard-dll | $800 $2,824 | $800 (4 NQ = $800) $2,661 | $800 (2 NQ = $800) $4,500 | - | $800 $2,462 | $300 $735 | - | - | $800 $2,356 | - | - |
| topstep standard-consistency | $1000 $4,293 | $1000 (5 NQ = $1,000) $4,018 | $800 (2 NQ = $800) $4,233 | - | $1000 $3,678 | $500 $721 | - | - | $1000 $3,570 | - | - |
| topstep standard-consistency-dll | $800 $2,920 | $800 (4 NQ = $800) $2,840 | $800 (2 NQ = $800) $5,342 | - | $1000 $2,587 | $250 $696 | - | - | $800 $2,463 | - | - |
| topstep no-fee-standard | $1000 $3,079 | $1000 (5 NQ = $1,000) $2,927 | $800 (2 NQ = $800) $2,990 | - | $1000 $2,878 | $500 $831 | - | - | $1000 $2,555 | $1000 $1,901 | $1000 $4,032 |
| topstep no-fee-standard-dll | $800 $2,862 | $800 (4 NQ = $800) $2,692 | $800 (2 NQ = $800) $4,518 | - | $800 $2,503 | $300 $746 | - | - | $800 $2,390 | - | - |
| topstep no-fee-consistency | $1000 $4,326 | $1000 (5 NQ = $1,000) $4,043 | $800 (2 NQ = $800) $4,267 | - | $1000 $3,704 | $500 $732 | - | - | $1000 $3,601 | $1000 $2,530 | $1000 $6,211 |
| topstep no-fee-consistency-dll | $800 $2,972 | $800 (4 NQ = $800) $2,877 | $800 (2 NQ = $800) $5,371 | - | $1000 $2,639 | $250 $706 | - | - | $800 $2,506 | - | - |
| topstep pro-account | $400 $2,614 | - | - | - | - | - | - | - | $400 $2,232 | - | - |
| fundednext flex | $500 $1,321 | $600 (3 NQ = $600) $1,349 | $400 (1 NQ = $400) $1,372 | - | $500 $1,070 | $250 $454 | $500 $972 | - | $500 $1,117 | - | - |
| fundednext legacy | $1000 $4,730 | $1000 (5 NQ = $1,000) $4,568 | $800 (2 NQ = $800) $3,916 | - | $1000 $4,308 | $500 $716 | $1000 $2,988 | - | $1000 $3,928 | - | - |
| fundednext rapid-pro | $250 $988 | $400 (2 NQ = $400) $896 | $400 (1 NQ = $400) $896 | - | $300 $725 | $150 $297 | $250 $560 | - | $250 $834 | - | - |
| fundednext rapid-pro-dll-add-on | $250 $957 | $200 (1 NQ = $200) $827 | $400 (1 NQ = $400) $1,141 | - | $250 $681 | $150 $311 | $250 $567 | - | $250 $805 | - | - |
| fundednext rapid-daily | $600 $851 | $600 (3 NQ = $600) $864 | $800 (2 NQ = $800) $1,416 | - | $600 $714 | $250 $394 | $600 $393 | - | $600 $714 | - | - |
| fundednext fnl-003 | $400 $1,062 | $400 (2 NQ = $400) $1,059 | $400 (1 NQ = $400) $1,066 | - | $500 $911 | $300 $690 | - | - | $400 $901 | - | - |
| alphafutures zero | $300 $1,706 | $400 (2 NQ = $400) $1,461 | $400 (1 NQ = $400) $2,100 | - | $300 $1,409 | $250 $571 | $250 $1,038 | - | $300 $1,424 | - | - |
| alphafutures standard | $500 $2,340 | $600 (3 NQ = $600) $2,298 | $800 (2 NQ = $800) $3,470 | - | $800 $2,028 | $250 $590 | $500 $1,724 | - | $500 $1,970 | - | - |
| alphafutures advanced | $1000 $3,175 | $1000 (5 NQ = $1,000) $3,247 | $800 (2 NQ = $800) $2,894 | - | $1000 $2,842 | $600 $1,989 | $1000 $2,278 | - | $1000 $2,617 | - | - |
| e8futures signature | $400 $1,420 | $400 (2 NQ = $400) $1,423 | $400 (1 NQ = $400) $1,917 | - | $400 $1,214 | $250 $316 | - | - | $400 $1,204 | $400 $774 | $400 $2,039 |
| e8futures zero-max-80 | $1000 $108 | $1000 (5 NQ = $1,000) $112 | $800 (2 NQ = $800) -$5 | - | $1000 -$358 | $150 -$266 | - | - | $1000 $99 | - | - |
| e8futures zero-max-100 | $1000 $25 | $1000 (5 NQ = $1,000) $49 | $800 (2 NQ = $800) -$108 | - | $1000 -$556 | $150 -$367 | - | - | $1000 $31 | - | - |
| e8futures zero-starter-80 | $500 $532 | $600 (3 NQ = $600) $565 | $800 (2 NQ = $800) $566 | - | $500 $162 | $250 $179 | - | - | $500 $434 | - | - |
| e8futures zero-starter-100 | $500 $636 | $600 (3 NQ = $600) $681 | $800 (2 NQ = $800) $677 | - | $500 $173 | $250 $206 | - | - | $500 $518 | - | - |
| ftmo-futures growth | $800 $2,927 | $800 (4 NQ = $800) $2,760 | $800 (2 NQ = $800) $4,237 | - | $800 $2,623 | $250 $1,038 | - | - | $800 $2,444 | $800 $1,718 | $800 $4,124 |
| ftmo-futures pro | $200 $1,598 | $200 (1 NQ = $200) $1,598 | $400 (1 NQ = $400) -$114 | - | $200 $1,150 | $200 $877 | - | - | $200 $1,338 | - | - |

**Compared with the post-audit run:**
- **Base, commission, idle and win rate:** the best flat changed only on the credit-driven plans (Tradeify Growth and Lightning, Lucid Pro, Pro no-DLL and Direct); every TopStep, FTMO and Legacy best flat keeps its size at a slightly lower value. Win rate 43%: TopStep No-fee Consistency $1000 $6,211 now leads, then Lucid Pro no-DLL $800 $5,331 and Tradeify Growth $500 $4,769 (post-audit: Lucid Direct $1000 $11,740 and Pro no-DLL $10,890).
- **Path-walk and live caps:** identical to the post-audit run (Lucid Daily EOD path-walk $500 $2,186; Lucid Pro no-DLL live cap $500 $2,383; Tradeify Growth live cap $400 $1,445).
- **Contract caps: not like-for-like.** At 10 points the best flat falls on most plans (TopStep No-fee Consistency $4,326 to $4,043, Tradeify Select Daily $2,465 to $2,138, MFF Pro $1,852 to $1,590) and rises slightly on some (Apex EOD $1,410 to $1,459). At 20 points several plans print far above base (see Engine anomalies); do not cite the 20pt column until that is investigated.
- **$500 requests:** see Result 8.

### Stage D detail: contract caps in whole NQ contracts (seed 42)

Seed 42, 252 days. "Post-audit" columns are the old D's best flat (placed at the requested dollar risk, no percent placement). Percent rows exist only in the new D.

| Plan | Base best flat | 10pt best flat, new | 10pt best flat, post-audit | 20pt best flat, new | 20pt best flat, post-audit | 10pt best percent | 20pt best percent |
|---|---|---|---|---|---|---|---|
| apex eod | $300 $1,410 | $400 (2 NQ = $400) $1,459 | $300 $1,410 | $400 (1 NQ = $400) $2,072 | $300 $1,410 | 20% cushion $1,503 | 5% cushion $2,072 |
| apex intraday | $500 $2,394 | $400 (2 NQ = $400) $2,320 | $500 $2,315 | $800 (2 NQ = $800) $2,951 | $500 $2,394 | 40% cushion $2,199 | 5% cushion $2,929 |
| tpt | $800 $1,947 | $800 (4 NQ = $800) $1,947 | $800 $1,947 | $800 (2 NQ = $800) $1,947 | $800 $1,947 | 50% cushion $2,112 | 40% cushion $2,257 |
| tradeify growth | $500 $3,324 | $600 (3 NQ = $600) $3,171 | $800 $4,988 | $400 (1 NQ = $400) $2,954 | $1000 $5,159 | 50% cushion $2,883 | 5% cushion $2,954 |
| tradeify select-flex | $1000 $3,522 | $800 (4 NQ = $800) $3,239 | $800 $3,303 | $800 (2 NQ = $800) $3,443 | $1000 $3,597 | 50% cushion $3,199 | 50% cushion $3,667 |
| tradeify select-daily | $1000 $2,465 | $800 (4 NQ = $800) $2,138 | $800 $2,082 | $800 (2 NQ = $800) $4,314 | $1000 $2,467 | 40% cushion $2,248 | 40% cushion $4,378 |
| tradeify lightning | $400 $2,946 | $400 (2 NQ = $400) $2,980 | $800 $5,594 | $400 (1 NQ = $400) $3,029 | $1000 $5,872 | 50% cushion $2,309 | 5% cushion $3,021 |
| lucid daily-eod | $800 $2,720 | $800 (4 NQ = $800) $2,743 | $800 $2,720 | $800 (2 NQ = $800) $2,741 | $800 $2,720 | 40% cushion $2,611 | 40% cushion $2,986 |
| lucid daily-eod-dll | $800 $2,259 | $800 (4 NQ = $800) $2,261 | $800 $2,259 | $800 (2 NQ = $800) $2,264 | $800 $2,259 | 50% cushion $2,316 | 40% cushion $2,337 |
| lucid daily-intraday | $800 $2,869 | $800 (4 NQ = $800) $2,891 | $800 $2,869 | $800 (2 NQ = $800) $2,890 | $800 $2,869 | 40% cushion $2,694 | 50% cushion $3,105 |
| lucid daily-intraday-dll | $800 $2,370 | $800 (4 NQ = $800) $2,372 | $800 $2,370 | $800 (2 NQ = $800) $2,375 | $800 $2,370 | 50% cushion $2,403 | 40% cushion $2,427 |
| lucid flex | $800 $1,709 | $800 (4 NQ = $800) $1,617 | $800 $1,601 | $800 (2 NQ = $800) $1,742 | $800 $1,709 | 50% cushion $1,543 | 40% cushion $1,621 |
| lucid flex-dll | $800 $1,317 | $800 (4 NQ = $800) $1,287 | $800 $1,279 | $800 (2 NQ = $800) $1,335 | $800 $1,317 | 50% cushion $1,272 | 40% cushion $1,139 |
| lucid pro | $800 $3,505 | $800 (4 NQ = $800) $3,543 | $800 $5,440 | $800 (2 NQ = $800) $3,574 | $1000 $6,903 | 50% cushion $3,532 | 50% cushion $3,403 |
| lucid pro-no-dll | $1000 $3,681 | $800 (4 NQ = $800) $3,713 | $800 $5,695 | $800 (2 NQ = $800) $3,729 | $1000 $7,296 | 50% cushion $3,642 | 50% cushion $3,548 |
| lucid direct | $400 $2,127 | $400 (2 NQ = $400) $2,130 | $800 $6,741 | $400 (1 NQ = $400) $2,138 | $1000 $8,375 | 50% cushion $2,012 | 5% cushion $1,910 |
| mffu rapid | $800 $2,596 | $800 (4 NQ = $800) $2,620 | $800 $2,596 | $800 (2 NQ = $800) $2,618 | $800 $2,596 | 50% cushion $2,650 | 40% cushion $2,887 |
| mffu rapid-eod | $800 $1,999 | $600 (3 NQ = $600) $1,895 | $600 $1,885 | $800 (2 NQ = $800) $2,022 | $800 $1,999 | 40% cushion $1,951 | 40% cushion $2,342 |
| mffu pro | $400 $1,852 | $400 (2 NQ = $400) $1,590 | $300 $1,624 | $400 (1 NQ = $400) $1,852 | $400 $1,852 | 25% cushion $2,125 | 30% cushion $2,477 |
| mffu builder | $500 $1,360 | $400 (2 NQ = $400) $1,342 | $500 $1,360 | $800 (2 NQ = $800) $1,955 | $500 $1,360 | 50% cushion $1,276 | 50% cushion $1,947 |
| topstep standard-standard | $1000 $3,059 | $1000 (5 NQ = $1,000) $2,907 | $1000 $2,978 | $800 (2 NQ = $800) $2,972 | $1000 $3,131 | 50% cushion $2,884 | 40% cushion $3,124 |
| topstep standard-standard-dll | $800 $2,824 | $800 (4 NQ = $800) $2,661 | $800 $2,736 | $800 (2 NQ = $800) $4,500 | $800 $2,911 | 40% cushion $2,319 | 50% cushion $4,468 |
| topstep standard-consistency | $1000 $4,293 | $1000 (5 NQ = $1,000) $4,018 | $1000 $4,112 | $800 (2 NQ = $800) $4,233 | $1000 $4,397 | 50% cushion $3,997 | 50% cushion $4,088 |
| topstep standard-consistency-dll | $800 $2,920 | $800 (4 NQ = $800) $2,840 | $800 $2,817 | $800 (2 NQ = $800) $5,342 | $800 $2,924 | 40% cushion $2,725 | 50% cushion $5,306 |
| topstep no-fee-standard | $1000 $3,079 | $1000 (5 NQ = $1,000) $2,927 | $1000 $2,998 | $800 (2 NQ = $800) $2,990 | $1000 $3,151 | 50% cushion $2,900 | 40% cushion $3,143 |
| topstep no-fee-standard-dll | $800 $2,862 | $800 (4 NQ = $800) $2,692 | $800 $2,768 | $800 (2 NQ = $800) $4,518 | $800 $2,950 | 40% cushion $2,346 | 50% cushion $4,483 |
| topstep no-fee-consistency | $1000 $4,326 | $1000 (5 NQ = $1,000) $4,043 | $1000 $4,138 | $800 (2 NQ = $800) $4,267 | $1000 $4,425 | 50% cushion $4,016 | 50% cushion $4,109 |
| topstep no-fee-consistency-dll | $800 $2,972 | $800 (4 NQ = $800) $2,877 | $800 $2,855 | $800 (2 NQ = $800) $5,371 | $800 $2,976 | 40% cushion $2,757 | 50% cushion $5,329 |
| fundednext flex | $500 $1,321 | $600 (3 NQ = $600) $1,349 | $500 $1,321 | $400 (1 NQ = $400) $1,372 | $500 $1,321 | 40% cushion $1,305 | 7.5% cushion $1,373 |
| fundednext legacy | $1000 $4,730 | $1000 (5 NQ = $1,000) $4,568 | $1000 $4,547 | $800 (2 NQ = $800) $3,916 | $1000 $4,753 | 50% cushion $4,491 | 50% cushion $8,953 |
| fundednext rapid-pro | $250 $988 | $400 (2 NQ = $400) $896 | $250 $988 | $400 (1 NQ = $400) $896 | $250 $988 | 40% cushion $864 | 5% cushion $896 |
| fundednext rapid-pro-dll-add-on | $250 $957 | $200 (1 NQ = $200) $827 | $250 $957 | $400 (1 NQ = $400) $1,141 | $250 $957 | 5% cushion $827 | 5% cushion $1,141 |
| fundednext rapid-daily | $600 $851 | $600 (3 NQ = $600) $864 | $600 $851 | $800 (2 NQ = $800) $1,416 | $600 $851 | 30% cushion $984 | 40% cushion $1,562 |
| fundednext fnl-003 | $400 $1,062 | $400 (2 NQ = $400) $1,059 | $400 $1,062 | $400 (1 NQ = $400) $1,066 | $400 $1,062 | 50% cushion $960 | 5% cushion $1,065 |
| alphafutures zero | $300 $1,706 | $400 (2 NQ = $400) $1,461 | $300 $1,607 | $400 (1 NQ = $400) $2,100 | $300 $1,706 | 5% cushion $1,425 | 5% cushion $1,885 |
| alphafutures standard | $500 $2,340 | $600 (3 NQ = $600) $2,298 | $500 $2,339 | $800 (2 NQ = $800) $3,470 | $500 $2,340 | 15% cushion $1,659 | 50% cushion $3,448 |
| alphafutures advanced | $1000 $3,175 | $1000 (5 NQ = $1,000) $3,247 | $1000 $3,175 | $800 (2 NQ = $800) $2,894 | $1000 $3,175 | 50% cushion $3,315 | 50% cushion $4,690 |
| e8futures signature | $400 $1,420 | $400 (2 NQ = $400) $1,423 | $400 $1,420 | $400 (1 NQ = $400) $1,917 | $400 $1,420 | 50% cushion $1,105 | 5% cushion $1,917 |
| e8futures zero-max-80 | $1000 $108 | $1000 (5 NQ = $1,000) $112 | $1000 -$20 | $800 (2 NQ = $800) -$5 | $1000 -$102 | 40% cushion $590 | 50% cushion $310 |
| e8futures zero-max-100 | $1000 $25 | $1000 (5 NQ = $1,000) $49 | $1000 -$121 | $800 (2 NQ = $800) -$108 | $1000 -$235 | 40% cushion $677 | 50% cushion $302 |
| e8futures zero-starter-80 | $500 $532 | $600 (3 NQ = $600) $565 | $500 $502 | $800 (2 NQ = $800) $566 | $500 $532 | 40% cushion $586 | 40% cushion $503 |
| e8futures zero-starter-100 | $500 $636 | $600 (3 NQ = $600) $681 | $500 $600 | $800 (2 NQ = $800) $677 | $500 $636 | 40% cushion $714 | 40% cushion $605 |
| ftmo-futures growth | $800 $2,927 | $800 (4 NQ = $800) $2,760 | $800 $2,807 | $800 (2 NQ = $800) $4,237 | $800 $2,986 | 40% cushion $2,336 | 50% cushion $4,197 |
| ftmo-futures pro | $200 $1,598 | $200 (1 NQ = $200) $1,598 | $200 $1,598 | $400 (1 NQ = $400) -$114 | $200 $1,598 | 5% cushion $1,598 | 5% cushion -$114 |

**Compared with the post-audit D:** at 10 points the NQ rounding moves most best flats a little (flat $1000 stays 5 NQ = $1,000; flat $500 becomes $400) and percent rows now lead in some files (64 of the 176 D files rank a percent row first, e.g. MFF Rapid 50% cushion $2,650 vs flat $800 $2,620 at 10 points). At 20 points the TopStep DLL variants, FTMO Growth, Alpha Standard, Tradeify Select Daily and FundedNext Legacy print far above both their base job and their post-audit 20pt figure; that is the open anomaly below, and no D sp20 figure should be cited until it is investigated.

## Result 8: payout request size, N-72 (Stage E request size, seed 42)

Base = the Stage B seed-42, 252-day job. Request-run cells are monthly net / horizon credit / monthly ex-credit.

| Plan | Request | $250 base | $250 at request: monthly / credit / ex-credit | $250 at request, post-audit | Best flat, base | Best flat at request: monthly / credit / ex-credit | Best flat at request, post-audit |
|---|---|---|---|---|---|---|---|
| apex eod | $500 | $1,366 | $48 / $0 / $48 | $48 | $300 $1,410 | $150 $158 / $0 / $158 | $150 $159 |
| apex intraday | $500 | $1,840 | $419 / $0 / $419 | $419 | $500 $2,394 | $250 $419 / $0 / $419 | $250 $419 |
| tpt | $500 | $1,483 | $1,483 / $0 / $1,483 | $1,483 | $800 $1,947 | $500 $2,192 / $0 / $2,192 | $1000 $6,473 |
| tradeify growth | $500 | $1,872 | $590 / $101 / $557 | $1,936 | $500 $3,324 | $300 $592 / $86 / $559 | $1000 $5,241 |
| tradeify select-flex | $500 | $1,869 | $782 / $29 / $772 | $937 | $1000 $3,522 | $500 $837 / $19 / $825 | $500 $987 |
| tradeify select-daily | $500 | $1,750 | $1,751 / $0 / $1,751 | $1,751 | $1000 $2,465 | $400 $2,189 / $0 / $2,189 | $400 $2,227 |
| tradeify lightning | $1000 | $2,082 | $1,040 / $419 / $971 | $2,014 | $400 $2,946 | $300 $1,179 / $355 / $1,110 | $1000 $5,878 |
| lucid daily-eod | $500 | $1,790 | $1,771 / $2 / $1,770 | $1,904 | $800 $2,720 | $500 $2,575 / $0 / $2,575 | $1000 $7,459 |
| lucid daily-eod-dll | $500 | $1,742 | $1,747 / $2 / $1,746 | $1,877 | $800 $2,259 | $500 $1,903 / $1 / $1,902 | $800 $4,241 |
| lucid daily-intraday | $500 | $1,826 | $1,789 / $2 / $1,788 | $1,922 | $800 $2,869 | $500 $2,602 / $0 / $2,602 | $1000 $7,493 |
| lucid daily-intraday-dll | $500 | $1,776 | $1,764 / $2 / $1,763 | $1,895 | $800 $2,370 | $500 $1,925 / $1 / $1,924 | $800 $4,265 |
| lucid flex | $500 | $735 | $458 / $0 / $458 | $458 | $800 $1,709 | $300 $458 / $0 / $458 | $300 $458 |
| lucid flex-dll | $500 | $720 | $456 / $0 / $456 | $456 | $800 $1,317 | $250 $456 / $0 / $456 | $250 $456 |
| lucid pro | $500 | $1,817 | $756 / $95 / $723 | $1,925 | $800 $3,505 | $300 $759 / $81 / $726 | $1000 $7,411 |
| lucid pro-no-dll | $500 | $1,858 | $757 / $94 / $724 | $1,942 | $1000 $3,681 | $300 $759 / $81 / $726 | $1000 $7,743 |
| lucid direct | $500 | $2,016 | $387 / $233 / $352 | $2,011 | $400 $2,127 | $250 $387 / $233 / $352 | $1000 $8,389 |
| mffu rapid | $500 | $1,761 | $1,756 / $2 / $1,755 | $1,890 | $800 $2,596 | $500 $2,553 / $0 / $2,553 | $1000 $7,430 |
| mffu rapid-eod | $500 | $1,648 | $1,696 / $2 / $1,695 | $1,826 | $800 $1,999 | $500 $2,420 / $0 / $2,420 | $1000 $6,950 |
| mffu pro | $1000 | $1,583 | $932 / $48 / $912 | $1,667 | $400 $1,852 | $250 $932 / $48 / $912 | $600 $3,179 |
| mffu builder | $500 | $975 | $418 / $0 / $418 | $418 | $500 $1,360 | $250 $418 / $0 / $418 | $250 $418 |
| topstep standard-standard | $500 | $1,905 | $746 / $28 / $736 | $867 | $1000 $3,059 | $500 $820 / $19 / $809 | $500 $939 |
| topstep standard-standard-dll | $500 | $1,815 | $729 / $28 / $719 | $978 | $800 $2,824 | $300 $735 / $24 / $726 | $300 $981 |
| topstep standard-consistency | $500 | $1,906 | $712 / $27 / $702 | $902 | $1000 $4,293 | $500 $721 / $18 / $710 | $300 $907 |
| topstep standard-consistency-dll | $500 | $1,798 | $696 / $27 / $687 | $1,077 | $800 $2,920 | $250 $696 / $27 / $687 | $250 $1,077 |
| topstep no-fee-standard | $500 | $1,920 | $752 / $28 / $742 | $874 | $1000 $3,079 | $500 $831 / $19 / $820 | $500 $949 |
| topstep no-fee-standard-dll | $500 | $1,838 | $739 / $28 / $729 | $987 | $800 $2,862 | $300 $746 / $24 / $737 | $300 $992 |
| topstep no-fee-consistency | $500 | $1,924 | $718 / $27 / $708 | $908 | $1000 $4,326 | $500 $732 / $18 / $721 | $500 $915 |
| topstep no-fee-consistency-dll | $500 | $1,823 | $706 / $27 / $697 | $1,087 | $800 $2,972 | $250 $706 / $27 / $697 | $250 $1,087 |
| fundednext flex | $500 | $1,084 | $454 / $0 / $454 | $454 | $500 $1,321 | $250 $454 / $0 / $454 | $250 $454 |
| fundednext legacy | $500 | $1,633 | $702 / $25 / $693 | $1,710 | $1000 $4,730 | $500 $716 / $17 / $705 | $1000 $6,790 |
| fundednext rapid-pro | $500 | $988 | $276 / $0 / $276 | $276 | $250 $988 | $150 $297 / $0 / $297 | $150 $297 |
| fundednext rapid-pro-dll-add-on | $500 | $957 | $299 / $0 / $299 | $299 | $250 $957 | $150 $311 / $0 / $311 | $150 $311 |
| fundednext rapid-daily | $500 | $555 | $394 / $0 / $394 | $394 | $600 $851 | $250 $394 / $0 / $394 | $250 $394 |
| fundednext fnl-003 | $800 | $982 | $658 / $0 / $658 | $658 | $400 $1,062 | $300 $690 / $0 / $690 | $300 $690 |
| alphafutures zero | $500 | $1,700 | $571 / $98 / $537 | $637 | $300 $1,706 | $250 $571 / $98 / $537 | $250 $637 |
| alphafutures standard | $500 | $1,818 | $590 / $97 / $556 | $759 | $500 $2,340 | $250 $590 / $97 / $556 | $250 $759 |
| alphafutures advanced | $1000 | $1,566 | $1,673 / $36 / $1,647 | $1,727 | $1000 $3,175 | $600 $1,989 / $61 / $1,932 | $600 $2,744 |
| e8futures signature | $500 | $1,195 | $316 / $0 / $316 | $316 | $400 $1,420 | $250 $316 / $0 / $316 | $250 $316 |
| e8futures zero-max-80 | $500 | -$295 | -$295 / $0 / -$295 | -$295 | $1000 $108 | $150 -$266 / $0 / -$266 | $150 -$266 |
| e8futures zero-max-100 | $500 | -$426 | -$426 / $0 / -$426 | -$426 | $1000 $25 | $150 -$367 / $0 / -$367 | $150 -$367 |
| e8futures zero-starter-80 | $500 | $179 | $179 / $0 / $179 | $179 | $500 $532 | $250 $179 / $0 / $179 | $250 $179 |
| e8futures zero-starter-100 | $500 | $206 | $206 / $0 / $206 | $206 | $500 $636 | $250 $206 / $0 / $206 | $250 $206 |
| ftmo-futures growth | $500 | $1,918 | $1,038 / $26 / $1,028 | $1,190 | $800 $2,927 | $250 $1,038 / $26 / $1,028 | $250 $1,190 |
| ftmo-futures pro | $500 | $219 | -$361 / $0 / -$361 | -$361 | $200 $1,598 | $200 $877 / $23 / $865 | $200 $1,181 |

Daily-payout plans, flat $1000 row, base vs $500 request:

| Plan | Run | Policy | Per-cycle net | Horizon credit | Monthly net | Monthly ex-credit | Survivors |
|---|---|---|---|---|---|---|---|
| tpt | base | flat $1000 | $337 | $0 | $1,847 | $1,847 | 0/100000 |
| tpt | $500 req | flat $1000 | $1,766 | $0 | $2,080 | $2,080 | 5463/100000 |
| lucid daily-eod | base | flat $1000 | $449 | $0 | $2,661 | $2,661 | 0/100000 |
| lucid daily-eod | $500 req | flat $1000 | $2,038 | $0 | $2,456 | $2,456 | 5405/100000 |
| lucid daily-eod-dll | base | flat $1000 | $556 | $0 | $2,211 | $2,211 | 0/100000 |
| lucid daily-eod-dll | $500 req | flat $1000 | $1,530 | $0 | $1,468 | $1,468 | 6404/100000 |
| lucid daily-intraday | base | flat $1000 | $478 | $0 | $2,833 | $2,833 | 0/100000 |
| lucid daily-intraday | $500 req | flat $1000 | $2,067 | $0 | $2,491 | $2,491 | 5405/100000 |
| lucid daily-intraday-dll | base | flat $1000 | $585 | $0 | $2,326 | $2,326 | 0/100000 |
| lucid daily-intraday-dll | $500 req | flat $1000 | $1,559 | $0 | $1,496 | $1,496 | 6404/100000 |
| mffu rapid | base | flat $1000 | $425 | $0 | $2,519 | $2,519 | 0/100000 |
| mffu rapid | $500 req | flat $1000 | $2,014 | $0 | $2,427 | $2,427 | 5405/100000 |
| mffu rapid-eod | base | flat $1000 | $440 | $0 | $1,912 | $1,912 | 0/100000 |
| mffu rapid-eod | $500 req | flat $1000 | $2,048 | $0 | $2,275 | $2,275 | 5483/100000 |

**Compared with the post-audit run (N-72):**
- **The horizon-credit part of the jump is gone.** On every daily-payout plan the flat $1000 request row keeps its post-audit per-cycle net and survivors (Lucid Daily EOD $2,038, 5405/100000) but its monthly net falls to the value its per-cycle net supports, with a $0 horizon credit (Lucid Daily EOD $7,459 to $2,456). This matches the post-audit investigation's post-WP40 probe (base ranks first again, request run horizon credit $0), now on 100,000 trials and both seeds.
- **Conclusion partly restored, partly not.** On Lucid Daily (all four variants) and MFF Rapid the base run beats the $500 request run at the best flat again, as the 2026-09-22 sweep found. On **TPT and MFF Rapid EOD the $500 request run still wins** (TPT $500 $2,192 vs $800 $1,947; Rapid EOD $500 $2,420 vs $800 $1,999; flat $1000 $2,080 vs $1,847 and $2,275 vs $1,912), and there the credit is $0 and ex-credit equals monthly net, so the lead is the real cushion-accumulation effect (flat $1000 survivors 5463/100000 and 5483/100000 at $500 per request, 0/100000 in the base run). Tradeify Select Daily's request run ($400 $2,189) stays below its base ($1000 $2,465).
- **Per-cycle-gated plans still lose heavily** at $500 per request (TopStep No-fee Standard $250 $752 vs $1,920 base; FTMO Growth $1,038 vs $1,918), a little lower than post-audit ($874, $1,190).
- **Other plans whose post-audit request run beat base now lose:** Tradeify Growth ($300 $592 vs $500 $3,324 base; was $1000 $5,241), Lucid Pro / Pro no-DLL ($300 $759, were $7,411 / $7,743), Lucid Direct ($250 $387, was $8,389), FundedNext Legacy ($500 $716, was $6,790), MFF Pro at $1,000 ($250 $932, was $600 $3,179). Alpha Advanced at $1,000 per request is above base at $250 but below it at the best flat ($600 $1,989 vs $1000 $3,175).
- **Status:** N-72 is resolved as described in the post-audit file (request-all drains a daily-payout plan to the retained-cushion barrier; the ranking reversal came from the uncapped horizon credit). Which payout policy Hard Rule 2 means is still open (U19), and on TPT and MFF Rapid EOD the engine now says a capped request earns more per slot.

## Result 9: realistic view at flat $250 (seed 42)

Realistic = the live-trigger-capped result where the firm moves traders to live after a payout count (Stage E cap list; Tradeify at 3), the intraday path-walk result where the funded drawdown trails intraday, else base. Same basis as the post-audit Result 8. Buyable plans only.

| Plan | Fastest ladder | $250 base | $250 realistic | Basis | Best flat, realistic | $250 + $10 commission | Post-audit realistic |
|---|---|---|---|---|---|---|---|
| topstep no-fee-consistency | 800/400/800/600 | $1,924 | $1,924 | base | $1000 $4,326 | $1,544 | $1,924 |
| topstep no-fee-standard | 800/400/800/600 | $1,920 | $1,920 | base | $1000 $3,079 | $1,535 | $1,930 |
| ftmo-futures growth | 600/800/800/600 | $1,918 | $1,918 | base | $800 $2,927 | $1,490 | $1,918 |
| topstep standard-consistency | 800/400/800/600 | $1,906 | $1,906 | base | $1000 $4,293 | $1,525 | $1,906 |
| topstep standard-standard | 800/400/800/600 | $1,905 | $1,905 | base | $1000 $3,059 | $1,517 | $1,916 |
| topstep no-fee-standard-dll | 800/200/100/800 | $1,838 | $1,838 | base | $800 $2,862 | $1,417 | $1,839 |
| topstep no-fee-consistency-dll | 800/200/100/800 | $1,823 | $1,823 | base | $800 $2,972 | $1,422 | $1,823 |
| topstep standard-standard-dll | 800/200/100/800 | $1,815 | $1,815 | base | $800 $2,824 | $1,391 | $1,816 |
| topstep standard-consistency-dll | 800/200/100/800 | $1,798 | $1,798 | base | $800 $2,920 | $1,396 | $1,798 |
| lucid daily-eod | 800/400/800/400 | $1,790 | $1,754 | path-walk | $500 $2,186 | $1,381 | $1,754 |
| mffu rapid | 800/400/800/400 | $1,761 | $1,723 | path-walk | $500 $2,085 | $1,349 | $1,723 |
| lucid daily-intraday | 800/400/800/400 | $1,826 | $1,721 | path-walk | $500 $2,096 | $1,421 | $1,721 |
| lucid daily-eod-dll | 800/400/800/400 | $1,742 | $1,705 | path-walk | $400 $1,882 | $1,339 | $1,705 |
| apex intraday | 800/400/800/400 | $1,840 | $1,702 | path-walk | $400 $1,950 | $1,447 | $1,702 |
| lucid daily-intraday-dll | 800/400/800/400 | $1,776 | $1,679 | path-walk | $400 $1,826 | $1,376 | $1,679 |
| mffu rapid-eod | 400/600/800/600 | $1,648 | $1,648 | base | $800 $1,999 | $1,237 | $1,648 |
| lucid direct | instant | $2,016 | $1,560 | live cap 5 | $400 $1,750 | $1,564 | $1,560 |
| tpt | 600/800/800/600 | $1,483 | $1,441 | path-walk | $500 $1,622 | $1,111 | $1,441 |
| tradeify lightning | instant | $2,082 | $1,388 | live cap 3 | $400 $1,771 | $1,657 | $1,388 |
| apex eod | 800/200/100/800 | $1,366 | $1,366 | base | $300 $1,410 | $949 | $1,366 |
| lucid pro-no-dll | 800/400/800/600 | $1,858 | $1,310 | live cap 5 | $500 $2,383 | $1,449 | $1,310 |
| alphafutures standard | 800/400/800/400 | $1,818 | $1,307 | live cap 5 | $500 $1,724 | $1,367 | $1,307 |
| lucid pro | 800/400/800/400 | $1,817 | $1,277 | live cap 5 | $800 $2,080 | $1,413 | $1,277 |
| e8futures signature | 800/400/800/600 | $1,195 | $1,195 | base | $400 $1,420 | $948 | $1,195 |
| tradeify growth | 800/400/800/400 | $1,872 | $1,121 | live cap 3 | $400 $1,445 | $1,463 | $1,121 |
| fundednext legacy | 600/800/800/600 | $1,633 | $1,043 | live cap 5 | $1000 $2,988 | $1,247 | $1,043 |
| alphafutures zero | 800/200/100/800 | $1,700 | $1,038 | live cap 5 | $250 $1,038 | $1,339 | $1,038 |
| fundednext fnl-003 | instant | $982 | $982 | base | $400 $1,062 | $802 | $982 |
| mffu builder | 800/200/100/800 | $975 | $975 | base | $500 $1,360 | $792 | $975 |
| alphafutures advanced | 700/700/700/700 | $1,566 | $960 | live cap 5 | $1000 $2,278 | $1,134 | $960 |
| mffu pro | 800/400/800/400 | $1,583 | $874 | live cap 3 | $400 $1,245 | $1,156 | $874 |
| tradeify select-flex | 500/800/700 | $1,869 | $836 | live cap 3 | $600 $1,685 | $1,440 | $836 |
| lucid flex | 800/400/800/400 | $735 | $735 | live cap 5 | $800 $1,709 | $572 | $735 |
| fundednext flex | 500/500/500/500 | $1,084 | $726 | live cap 3 | $500 $972 | $795 | $726 |
| lucid flex-dll | 800/400/800/400 | $720 | $720 | live cap 5 | $800 $1,317 | $560 | $720 |
| fundednext rapid-pro-dll-add-on | 800/200/100/800 | $957 | $567 | live cap 3 | $250 $567 | $681 | $567 |
| fundednext rapid-pro | 800/400/800/600 | $988 | $560 | live cap 3 | $250 $560 | $709 | $560 |
| tradeify select-daily | 500/800/700 | $1,750 | $314 | live cap 3 | $800 $1,012 | $1,344 | $314 |
| fundednext rapid-daily | 800/200/100/800 | $555 | $226 | live cap 3 | $600 $393 | $513 | $226 |
| ftmo-futures pro | 800/200/200/800 | $219 | $219 | base | $200 $1,598 | $24 | $219 |
| e8futures zero-starter-100 | 600/600/600/600 | $206 | $206 | base | $500 $636 | -$136 | $206 |
| e8futures zero-starter-80 | 600/600/600/600 | $179 | $179 | base | $500 $532 | -$93 | $179 |
| e8futures zero-max-80 | 600/600/600/600 | -$295 | -$295 | base | $1000 $108 | -$621 | -$295 |
| e8futures zero-max-100 | 600/600/600/600 | -$426 | -$426 | base | $1000 $25 | -$839 | -$426 |

**Compared with the post-audit run:** every realistic figure that comes from a live cap or the path-walk is identical. **Ranking moved at the top:** TopStep No-fee Consistency ($1,924) now leads No-fee Standard ($1,920) and FTMO Growth ($1,918); the post-audit order was No-fee Standard $1,930, Consistency $1,924, FTMO $1,918. TopStep Standard Standard fell below Standard Consistency ($1,905 vs $1,906). The rest of the order is unchanged: the TopStep DLL variants, then Lucid Daily EOD $1,754 and MFF Rapid $1,723 (path-walk), with Lucid Direct $1,560, TPT $1,441 and Tradeify Lightning $1,388 below. The three leaders sit within a few dollars of each other at $250, inside their overlapping 3-seed ranges (Result 3: $1,917..$1,924, $1,914..$1,920, $1,906..$1,918), so the order among them is not robust.

## Engine anomalies

| Where | What the CLI printed | Status |
|---|---|---|
| N-71: `optimize funded`, percent-of-cushion rows | no row of the 16,651 printed reaches $20,000/mo; Lucid Pro / Pro no-DLL / Direct best percent rows are 50% cushion $3,211 / $3,336 / $1,903 (B, seed 42, MNQ 10) | **Resolved** on this engine. Percent rows now require `--stop-points`, so they are always placed in whole contracts with caps on |
| N-72: `optimize funded --request-size` on daily-payout plans | Lucid Daily EOD flat $1000 at $500: per-cycle $2,038, credit $0, monthly $2,456 (post-audit $7,459); base best flat beats the request run on Lucid Daily and MFF Rapid | **Explained** (horizon credit capped, T32). The remaining TPT / MFF Rapid EOD lead is credit-free, the cushion-accumulation effect (Result 8) |
| N-73: `optimize dp` | both plans exit 0, `status: converged`, 9 of 12 solves | **Resolved**; gate D11 PASSED |
| New: `optimize funded --stop-points 20 --instrument NQ` (Stage D sp20) | some rows print far above their base job: FTMO Growth flat $800 (2 NQ = $800) per-cycle $6,085, monthly $4,237 (base flat $800: $1,875, $2,927; post-audit 20pt $2,986); TopStep No-fee / Standard Consistency DLL flat $800 $5,371 / $5,342 and Standard DLL $4,518 / $4,500 (base $2,972 / $2,920 / $2,862 / $2,824); Tradeify Select Daily flat $800 $4,314 (base $1000 $2,465); FundedNext Legacy 50% cushion per-cycle $4,488, monthly $8,953 (seed 1337: $8,997) | **Engine defect, audit N-74 (fix WP39e in progress).** Root cause (investigation wf_af4e94e9-2e9, confirmed in code and by CLI): when a lockout daily-loss room is below one contract, the whole-contract rule placed one contract, capped the loss at the room and paid the win on the full contract, a free option on the day's last room. It shows only where the lockout room left after losses is not a whole number of contracts: every lockout-DLL plan at NQ 20 points, not Lucid (room $400 is exactly one NQ), FTMO Pro (terminating DLL) or no-DLL plans. The eval ladder does not cause it (with `--unaffordable skipIfUnaffordable` the NQ-20 and no-stop runs are bit-identical). FundedNext Legacy's 50% cushion row is a separate modelling limit (win rate and rr are fixed whatever the stop, the dollar contract cap scales with it). Do not cite any D sp20 figure until the Stage D re-run on the fixed engine |
| New: MFF Pro whole-contract companions | all 9 flat rows of `B/mffu__pro__s42__d252__mnq10` print the same per-cycle $2,777, credit $79, monthly $585, bust 9.9%, 34799/100000 survivors, from flat $150 (7 MNQ) to flat $1000 (50 MNQ) | **Explained, not a defect (audit N-75).** MFF Pro's published Sim-Funded limit is 5 mini / 5 micro (the live plans/pro page and help article 11802674), so every flat of $100 or more places 5 MNQ = $100 at 10 points and the nine rows are one policy. The same collapse existed before the audit. The `optimize funded` labels showed the placement before the cap (display fix WP42). Whether 5 micros is a publishing error for 50 is a question only MFF can answer (audit U22). The base job (no `--stop-points`) applies no contract limit: flat $400 $1,852 |

## Adjustments (flag translations and every difference from the post-audit run)

**Flag translations:**
- **Base jobs drop the `--percent` grid.** Verbatim, every post-audit funded job without `--stop-points` is refused by the new CLI with exit 1: `--percent "5,7.5,10,15,20,25,30,40,50" needs --stop-points: percent-of-cushion risk is placed in whole contracts at that stop (with --instrument, default NQ). Add --stop-points, or pass --percent '' to skip percent candidates.` (`probe/p1_verbatim_percent_nostop.txt`). With `--percent` omitted the job runs its 9 flat rows and prints `percent-of-cushion candidates (5,7.5,10,15) left out: they need --stop-points (with --instrument, default NQ) to place whole contracts` (every one of the 460 B, 21 C path-walk, 88 C commission, 88 E request-size, 44 E live-cap, 26 F and 6 V base jobs printed it). A job-level check confirms every translated line equals its post-audit line apart from the output directory and that flag.
- **Whole-contract companions added** so percent rows are still measured: the post-audit line verbatim, `--percent` kept, plus `--stop-points 10 --instrument MNQ`. Instrument and stop: SKILL.md names NQ/ES but no typical stop, and says the trader sizes contracts to hit an exact dollar risk, so the fallback MNQ at 10 points ($20 per micro) was used as the closest match to exact-dollar sizing. Counts: V 2, B 138 (the 252-day jobs only, none for 126/504/idle), C path-walk 21, C commission 88, E request size 88, E live cap 44 (one per plan, seed and cap, because Tradeify's caps 3 and 2 are both stage settings), F 26 (one per plan and win rate, because F has no 0.4 run). Every companion job line equals its post-audit line plus `--stop-points 10 --instrument MNQ` (checked).
- **D unchanged:** its lines already carry `--stop-points` and `--instrument NQ`, so they run verbatim with `--percent`. The new engine places them in whole NQ contracts: 88 sp10 jobs leave out flat $150 (below one NQ at 10 points, $200) and run 17 policies; 88 sp20 jobs leave out flat $150/$200/$250/$300 (below $400) and run 14. That is 440 rows left out, each with a CLI note, none changed. The other flat rows are rounded down to whole NQ (sp10: $250 and $300 to $200, $500 to $400; sp20: $500 and $600 to $400, $1000 to $800). D's flat numbers are therefore not like-for-like with the post-audit D.
- **DP unchanged:** the post-audit DP job lines carry no `--iterations` (the 8 in the post-audit file was the old default), so the same line now runs at the new default of 12 solves.
- **Stage A not re-run:** the funded jobs use the post-audit Stage A ladders, copied to `meta/fastest-ladders.txt`.

**Other differences:**
- Engine: uncommitted tree on `1216eba` (contenthash `4ade35c6...`), against the post-audit run's uncommitted tree on `7ce5d7b` (four content states, final `be4620b3...`).
- Parallelism: V to E request size ran one stage at a time at `-P6`. After a restart at 09:58:54Z, E live cap (`-P8`), F (`-P8`) and DP (`-P2`) were launched at the same time with the same `nohup`/`setpgrp`/`xargs` command as `lib.sh`'s `launch()`, typed inline because `launch()` caps at 6. This went over the stated at-most-`-P6` limit (18 CLI processes on 14 cores) to answer the user's request for more parallelism. It changes wall-clock and solve times only, not results (fixed seeds, one engine state). E request size's end stamp was not written because the orchestrator stopped; the end time comes from the newest output's mtime.
- Tables report seed 42 (with the 3-seed range in Result 3) so that every number is one the CLI printed.
- Not re-run: Stage A, the sweep's adversarial verifiers and doc-tree readers, and the non-engine adjustments. Firm data was not re-checked against live help centers here.

## Verification

- Job counts match the plan: V 8, B 598, C path-walk 42, C commission 176, D 176, E request size 176, E live cap 88, F 52, DP 2 (1,318); one output file per job line, and every output ends in `exit=0`. No `.tmp` file remains. Policy rows per stage match the expected policy counts (9 per base job, 18 per companion, 17 per D sp10 job, 14 per D sp20 job): B 6,624, C path-walk 567, C commission 2,376, D 2,728, E request size 2,376, E live cap 1,188, F 702, V 90. No funded output contains a warning, error or refusal line (the DP outputs carry only the coarse-grid notice in Result 2); the only notes before the funded tables are the percent-left-out note, the whole-contract placement note and D's flat-left-out note.
- Engine state: the gated contenthash (`advisor/` excluded) was `4ade35c6...` at plan time, at S0, at the restart and at the end; `gateok` passed before every stage launch and `newerfiles` stayed empty, so every job ran on one engine state. HEAD stayed `1216eba`. `contenthash_full` moved from `0e26ba1f...` to `f19238e2...` because another build edited files under `src/lib/prop-calculator/advisor/` from 10:56 UTC onward (while the TopStep DP job was still running). Outside `advisor/`, nothing under `src/lib/prop-calculator` or `src/cli` references `advisor` except a comment string in `E8Futures.ts` (grep), so those edits cannot reach the CLI results.
- No `bun run cli prop`, `xargs` or `run1.sh` process is left (`pgrep -f 'src/cli/index.ts pro[p]'` returns nothing). No repo file was edited by the run.
- Every figure in this file was copied from the raw CLI outputs listed below, or from `2026-09-26-post-audit-rerun.md` for the "post-audit" columns. Tables were assembled by `awk` over the ANSI-stripped outputs (`meta/readback/rows.tsv` holds every printed policy row; the table builders are the `meta/readback/*.awk` files): the `flat $250` row, the first flat row (best flat, since rows print in monthly-net order), the first `% cushion` row, and min/max over seeds. Nothing was recomputed, and no script imports `~/lib/prop-calculator`.
- The 200-trial dry runs in `probe/dry/` validated the job lists only and are never cited.

## Artifacts

Run dir (outside the repo, not durable): `/private/tmp/claude-501/-Users-sadrashameli-Personal-sadra-nl/1b264b7a-c902-4b3b-b522-d0676e267927/scratchpad/rerun-2026-09-26b/`

- Raw outputs, one file per job: `V/<firm>__<variant>__<ladA|ladX-X-X-X>__rc<2000|0>[__mnq10].txt`; `B/<firm>__<variant>__s<seed>__d<days>[__idle15|__mnq10].txt`; `C_path/<firm>__<variant>__s<seed>[__mnq10].txt`; `C_comm/<firm>__<variant>__s<seed>[__mnq10].txt`; `D/<firm>__<variant>__s<seed>__sp<10|20>.txt`; `E_req/<firm>__<variant>__s<seed>__req<N>[__mnq10].txt`; `E_live/<firm>__<variant>__s<seed>__cap<N>[__mnq10].txt`; `F/<firm>__<variant>__wr<0.37|0.43>[__mnq10].txt`; `DP/ftmo-futures__growth.txt`, `DP/topstep__no-fee-standard.txt`. TPT's variant is `_`.
- Job lists (output path plus exact arguments): `jobs/<stage>.jobs`. Harness: `run1.sh`, `lib.sh` (copied from the post-audit run dir with `R` repointed and `launch()` capped at `-P6`), `gate.sh` (content hash, unchanged). Logs: `logs/<stage>.log` (all empty) and `logs/<stage>.pid`.
- `meta/`: `head.txt`, `head-start.txt`, `head-restart.txt`, `status-plan.txt`, `status-start.txt`, `enginehash-start.txt` (timestamp marker for `newerfiles`), `contenthash-plan.txt`, `contenthash-pin.txt`, `contenthash-restart.txt`, `contenthash-end.txt`, `contenthash-full-start.txt`, `contenthash-full-end.txt`, `plan-note.txt`, `fastest-ladders.txt`, `plans-all.tsv`, `plans-rules.txt`, `request-sizes.txt`, `help-optimize-funded.txt`, `help-optimize-dp.txt`, `t-<stage>-start` / `-end`, `t-E_req-end-derived.txt`, `t-restart`, `readback/` (parsed rows and table builders).
- `probe/`: the verbatim-percent refusal (`p1_verbatim_percent_nostop.txt`), translation probes `p2` to `p6`, and the 200-trial dry runs (`dry/`); validation only.
