# Run 2026-09-26-post-audit-rerun

**Question:** re-run every re-runnable stage of [`2026-09-22-full-sweep.md`](2026-09-22-full-sweep.md), [`2026-09-23-average-reward-dp-validation.md`](2026-09-23-average-reward-dp-validation.md) and [`2026-09-23-average-reward-dp-validation-2.md`](2026-09-23-average-reward-dp-validation-2.md) on the post-audit engine (prop-engine audit, `.claude/plans/prop-engine-audit-2026-09-23/PLAN.md`), with the same fixed inputs, and record which figures and conclusions moved. Metric definitions, staleness check and re-run rules: [`../engine-results.md`](../engine-results.md).

**Engine state:** HEAD `7ce5d7b` (`7ce5d7b0e6e4ed6a6e285c867e0257d4f1adc1b2`) plus the **uncommitted working tree holding the audit fixes**: `git status --short` over the gated paths (`src/lib/prop-calculator`, `src/cli/commands/prop`, `src/cli/ui`, `src/lib/format`) listed 53 modified, added or untracked paths at the start (`meta/status-start.txt`). There is no commit that reproduces these numbers yet; the content hashes below identify the tree. Another agent edited gated files while the run was going, so the stages ran on four engine states (details under Verification):

| State | Pinned at (UTC, 2026-09-26) | Identifier | Stages |
|---|---|---|---|
| 1 | 01:27 (start) | enginehash `c56154d2...`, contenthash_full `9948c25e...` | S0, A, V, the first 299 B jobs |
| 2 | edits at 02:06:55 to 02:08:14, re-pinned 02:17:57 | enginehash `a84b83de...`, contenthash `71319054...` | the last 161 B jobs (listed in `meta/B-jobs-started-after-edit.txt`), start of C_path |
| 3 | edit at 02:31:12 | contenthash `39f9f406...` | middle of C_path |
| 4 | edit at 02:51:01, re-pinned 02:58:25 | contenthash `be4620b3797806bc10f406790b3bb6b68759dd54cfe2cd7a6b4d41776b7233ed` | end of C_path, then C_comm, D, E_req, E_live, F, DP |

Per the saved diffs (`meta/diff-*.patch`), the changes between states were firm note strings (FundedNext, Apex), `--eval-discount` help text, DP-only warnings and a DP diagnostic field (`optimize/dp/command.ts`, `FundedStateValue.ts`, which also now returns its registry warm-up error instead of swallowing it), and a whitespace re-wrap of one expression in `RenewalCycleObjective.ts`. None of them touches ladder or `optimize funded` arithmetic as far as the diffs show. Not proven for `FundedNext.ts`, `FundedStateValue.ts` and `dp/command.ts`: they already had unstaged edits at the start and no copy of their start content was kept.

**Volume:** 957 CLI jobs (A 46, V 6, B 460, C path-walk 21, C commission 88, D 176, E request size 88, E live cap 44, F 26, DP 2), 2026-09-26 01:27:00Z to 04:09:35Z, at most 6 jobs in parallel (DP one at a time), on a machine shared with other agents' test runs.

**Supersedes:** the numbers of all three runs above for the stages re-run here. Their files are not edited.

## Answer in brief

Seed 42, 1-year funded horizon unless stated. "Before" figures are the original runs' printed values (the sweep's are 3-seed means).

1. **The $250 ranking of the leading plans held.** Realistic per-slot view (live-trigger cap or intraday path-walk applied where they apply): TopStep No-fee Standard $1,930, No-fee Consistency $1,924, FTMO Growth $1,918, then Lucid Daily EOD $1,754 and MFF Rapid $1,723 (both path-walk, same as before), TPT $1,441 (was $1,449), Tradeify Lightning $1,388 at a 3-payout cap (was $1,386), E8 Signature $1,195 (was $1,193).
2. **Alpha Futures moved up, FundedNext Flex/Rapid, MFF Pro and E8 Zero moved down.** Alpha Standard $250 base $1,818 (was $1,000), realistic $1,307 (was $670). FundedNext Rapid Daily base $555 (was $789). MFF Pro realistic $874 (was $1,046) and its best flat fell from flat $1000 $3,899 to flat $400 $1,852. E8 Zero MAX 80/100 are now negative at $250 (-$295 / -$426; were $60 / $38).
3. **Engine-optimal sizing now favors flat $1000 on Lucid Pro/Pro no-DLL/Direct and Tradeify** (Lucid Direct $8,375, Pro no-DLL $7,296, Pro $6,903, Lightning $5,872, Tradeify Growth $5,159), ahead of FundedNext Legacy ($4,753) and TopStep No-fee Consistency ($4,431), which led before. Under their live-trigger caps the Lucid and Tradeify best flats drop back to $1,445 to $2,383, close to the old capped values.
4. **Eval ladders:** TopStep No-fee keeps 800/400/800/600 ($223 per funded account, was $221). FTMO Growth's fastest ladder is now 600/800/800/600 (was 500/800/800/600). The 3-rung 800/400/700 ladders became 800/200/100/800. Cost per funded account (D1) moved a lot on some plans: TopStep Standard path $264 (was $461), FundedNext Flex $249 (was $173), TPT $440 (was $694).
5. **Gate D11 (DP vs best flat):** both DP policies now beat the best flat on empirical monthly net (FTMO $4,928 vs flat $800 $2,984; TopStep $3,244 vs flat $1000 $3,142), and the DP-vs-empirical gap shrank to -$245 (FTMO, was -$2,372) and -$1,636 (TopStep, was -$2,485). **But both solves exited 1 with `status: solve-cap-reached`** and the CLI marks the numbers unreliable, so the verdict is **not established**. Re-run with more `--iterations` before citing it.
6. **Two engine anomalies need investigation before any related figure is cited:** percent-of-cushion rows on Lucid Pro, Pro no-DLL and Direct print monthly nets up to $1,743,617,717 in B (and $43,768,011,864,973 in F) while the same rows' per-cycle net is small or negative (Lucid Pro 25% cushion $1,511, Lucid Direct 25% cushion -$435); and the $500 request-size stage now beats the base run on daily-payout plans (Lucid Daily EOD flat $1000 $7,459 vs $2,720 base best flat), the reverse of the original finding. The request-size reversal is now explained (pre-audit horizon credit, 27f1c66, on top of a capped request's real cushion accumulation) and gone after T32 (base $2,700 vs $500 request $2,356 monthly on Lucid Daily EOD flat $1000); see Engine anomalies, resolved pending re-run.

## Fixed inputs (every stage unless its row says otherwise)

| Input | Value |
|---|---|
| Win rate / R:R | 40% / 1:2, passed explicitly (`--winrate 0.4 --rr 2`) |
| Trades per day / stop | `--tpd 4 --stop day-green`, passed explicitly |
| Eval sizing | each plan's `FASTEST TO FUNDED` #1 ladder from this run's Stage A (`meta/fastest-ladders.txt`); the 4 instant-funded plans get no `--ladder` |
| Payout rule | `--retain-cushion 2000`; the flag is clamped up to the plan's own floor (help text), so the effective value is $2,000 as before |
| Funded candidates | flat $150/200/250/300/400/500/600/800/1000; 5/7.5/10/15/20/25/30/40/50% of cushion |
| Trials / seeds | 100,000 per candidate. Seeds 42/1337/2024: B horizons and C path-walk. 42/1337: C commission, D, E. 42 only: B 15% idle run and F. V and DP: 20,000 trials, seed 42 |
| Eval cap / attempts | `--eval-days 150 --max-attempts 1` (V and DP: `--eval-days 15`) |
| Rebuy lag | `--rebuy-lag-days 0` on every funded and DP job |
| Contract caps / commission / idle days | off / $0 / 0%, each varied in its own stage |
| Opt-ins left off | `--early-withdrawal`, `--funded-reset` |
| Plan sets | all = the 46 lines of `prop plans --variants`; buyable = all minus topstep pro-account and lucid maxx (44); instant-funded (detected from Stage A output) = tradeify lightning, lucid direct, topstep pro-account, fundednext fnl-003 |

## Stages and exact commands

Every job line in `jobs/<stage>.jobs` names its output file and its arguments; `run1.sh` turns it into `bun run cli prop <ladder | optimize funded | optimize dp> --firm <f> [--variant <v>] <args>` from the repo root (the CLI echoes it as `bun --conditions react-server --env-file .env ./src/cli/index.ts prop ...`), wrapped in `/usr/bin/time -p`, with a UTC start stamp first and `exit=<rc>` last. Fan-out: `xargs -L1 -P6` (DP `-P1`). TPT runs without `--variant`.

`<BASE>` = `--trials 100000 --sort monthly --retain-cushion 2000 --rebuy-lag-days 0 --rr 2 --tpd 4 --stop day-green --eval-days 150 --max-attempts 1 --flat 150,200,250,300,400,500,600,800,1000 --percent 5,7.5,10,15,20,25,30,40,50`

| Stage | Plans | Command | Jobs | Wall clock (UTC) |
|---|---|---|---|---|
| A ladders | all (46) | `bun run cli prop ladder --firm <f> --variant <v> --trials 20000 --top 5 --seed 42` | 46 | 01:27:37 to 01:35:42 |
| V flat baseline (gate D11, F0) | topstep no-fee-standard, ftmo-futures growth | `bun run cli prop optimize funded --firm <f> --variant <v> --ladder <L> --retain-cushion <2000,0> --winrate 0.4 --rr 2 --trials 20000 --seed 42 --funded-days 252 --eval-days 15 --rebuy-lag-days 0 --idle-day-probability 0 --sort monthly --tpd 4 --stop day-green --max-attempts 1 --flat 150,...,1000 --percent 5,...,50`; `<L>` = Stage A ladder (TopStep 800,400,800,600; FTMO 600,800,800,600) and the originals' pinned ladders (800,400,800,600; 500,800,800,600); retain $0 on TopStep only | 6 | 01:35:51 to 01:36:11 |
| B base | all (46) | `bun run cli prop optimize funded --firm <f> --variant <v> [--ladder <A>] --seed <42,1337,2024> --funded-days <126,252,504> --winrate 0.4 --idle-day-probability 0 <BASE>`, plus one run per plan at seed 42, 252 days, `--idle-day-probability 0.15` | 414 + 46 | 01:36:19 to 02:17:40 |
| C path-walk | apex intraday, tpt, lucid daily-eod / daily-eod-dll / daily-intraday / daily-intraday-dll, mffu rapid | B command at 252 days, seeds 42/1337/2024, plus `--path-granularity 10` | 21 | 02:18:27 to 02:58:53 |
| C commission | buyable (44) | B command at 252 days, seeds 42/1337, plus `--commission 10` | 88 | 02:58:54 to 03:02:19 |
| D contract caps | buyable (44) | B command at 252 days, seeds 42/1337, plus `--stop-points <10,20> --instrument NQ` | 176 | 03:02:26 to 03:16:13 |
| E payout size | buyable (44) | B command at 252 days, seeds 42/1337, plus `--request-size <N>`: 1000 for tradeify lightning, mffu pro, alphafutures advanced; 800 for fundednext fnl-003; 500 for the rest (the larger of $500 and the plan's printed `min request`) | 88 | 03:16:15 to 03:23:14 |
| E live-trigger cap | 18 plans + 4 | B command at 252 days, seeds 42/1337, plus `--max-lifetime-payouts <N>`: tradeify (all 4) 3; lucid pro, pro-no-dll, flex, flex-dll, direct 5; alphafutures (all 3) 5; mffu pro 3; fundednext flex, rapid-pro, rapid-pro-dll-add-on, rapid-daily 3; fundednext legacy 5. Plus tradeify (all 4) at 2 | 36 + 8 | 03:23:15 to 03:26:26 |
| F win rate | topstep no-fee-consistency, no-fee-standard; ftmo-futures growth; lucid daily-eod, daily-intraday, direct, pro-no-dll; mffu rapid; tpt; tradeify lightning, growth; e8futures signature; apex intraday | B command at 252 days, seed 42, with `--winrate <0.37,0.43>` in place of 0.4; ladder stays the Stage A ladder | 26 | 03:26:27 to 03:29:08 |
| DP | ftmo-futures growth, then topstep no-fee-standard | `bun run cli prop optimize dp --firm <f> --variant <v> --eval-days 15 --trials 20000 --funded-days 252 --rebuy-lag-days 0 --seed 42 --iterations 8 --winrate 0.4 --rr 2` | 2 | 03:29:15 to 04:09:35 |

## Result 1: eval ladders (Stage A, 20,000 simulations per ladder)

Cells are ladder (eval pass, days to funded, $ per funded account). The new cost column is `$/acct`, D1 cost per funded account; the new pass column is D2 eval pass. Min stop is the new run's. Instant-funded plans print "has no real evaluation phase" and get no ladder. Ladder also printed "4 of 4680 ladders passed the eval in under 2% of trials and are left out of every ranking" on apex eod and apex intraday.

| Plan | Fastest, new | Fastest, 2026-09-22 | Min stop | Cheapest, new | Cheapest, 2026-09-22 |
|---|---|---|---|---|---|
| alphafutures advanced | 700/700/700/700 (33.2%, 9.2d, $601) | 700/700/700/700 (33.3%, 9.2d, $627) | 7.0pt | 400/200/300/300 (46.6%, 20.4d, $516) | 300/100/200/300 (53.6%, 29.0d, $390) |
| alphafutures standard | 800/400/800/400 (42.7%, 5.5d, $276) | 800/400/800/500 (42.9%, 5.5d, $301) | 8.0pt | 400/200/300/300 (55.4%, 14.8d, $246) | 200/100/300/100 (67.7%, 28.3d, $191) |
| alphafutures zero | 800/200/100/800 (42.3%, 8.6d, $310) | 800/400/700 (43.4%, 8.3d, $320) | 13.3pt | 400/200/200/400 (55.7%, 15.6d, $269) | 200/100/300/100 (67.7%, 28.3d, $205) |
| apex eod | 800/200/100/800 (40.8%, 8.5d, $1,535) | 800/700/600/600 (41.9%, 8.2d, $1644) | 6.7pt | 400/200/200/200 (53.2%, 18.0d, $1,199) | 100/100/100/100 (89.4%, 64.8d, $771) |
| apex intraday | 800/400/800/400 (42.3%, 5.5d, $647) | 800/400/800/600 (42.5%, 5.5d, $724) | 6.7pt | 400/200/200/200 (53.2%, 18.0d, $527) | 100/100/100/100 (89.4%, 64.8d, $345) |
| e8futures signature | 800/400/800/600 (42.8%, 5.5d, $374) | 800/400/800/600 (43.0%, 5.4d, $373) | 10.0pt | 100/100/100/100 (91.0%, 63.9d, $176) | 100/100/100/100 (90.8%, 64.6d, $176) |
| e8futures zero-max-100 | 600/600/600/600 (32.3%, 8.3d, $1,323) | 600/600/600/600 (32.1%, 8.4d, $868) | 7.5pt | 100/100/100/100 (75.6%, 64.3d, $566) | 100/100/100 (75.3%, 76.4d, $370) |
| e8futures zero-max-80 | 600/600/600/600 (32.3%, 8.3d, $1,014) | 600/600/600/600 (32.1%, 8.4d, $666) | 7.5pt | 100/100/100/100 (75.6%, 64.3d, $434) | 100/100/100 (75.3%, 76.4d, $284) |
| e8futures zero-starter-100 | 600/600/600/600 (32.3%, 8.3d, $705) | 600/600/600/600 (32.1%, 8.4d, $464) | 7.5pt | 100/100/100/100 (75.6%, 64.3d, $302) | 100/100/100 (75.3%, 76.4d, $198) |
| e8futures zero-starter-80 | 600/600/600/600 (32.3%, 8.3d, $550) | 600/600/600/600 (32.1%, 8.4d, $361) | 7.5pt | 100/100/100/100 (75.6%, 64.3d, $235) | 100/100/100 (75.3%, 76.4d, $154) |
| ftmo-futures growth | 600/800/800/600 (41.7%, 6.4d, $273) | 500/800/800/600 (43.2%, 6.4d, $275) | 8.0pt | 400/200/300/300 (55.4%, 14.8d, $233) | 200/100/300/100 (67.7%, 28.3d, $176) |
| ftmo-futures pro | 800/200/200/800 (23.0%, 7.5d, $577) | 800/900/200/800 (23.4%, 7.3d, $594) | 8.0pt | 300/100/200/300 (80.1%, 21.4d, $240) | 300/100/200/200 (82.7%, 24.7d, $168) |
| fundednext flex | 500/500/500/500 (40.4%, 6.9d, $249) | 500/500/500/500 (40.4%, 6.9d, $173) | 8.3pt | 100/100/100/100 (82.6%, 51.6d, $150) | 100/100/100 (82.1%, 61.4d, $85) |
| fundednext fnl-003 | instant | instant | - | - | - |
| fundednext legacy | 600/800/800/600 (41.7%, 6.4d, $457) | 500/800/800/600 (43.2%, 6.4d, $463) | 13.3pt | 100/100/100/100 (91.0%, 63.9d, $218) | 100/100/100/100 (90.8%, 64.6d, $220) |
| fundednext rapid-daily | 800/200/100/800 (41.9%, 8.6d, $563) | 800/400/700 (43.1%, 8.4d, $395) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $319) | 100/100/100/100 (90.6%, 64.6d, $188) |
| fundednext rapid-pro | 800/400/800/600 (42.7%, 5.5d, $535) | 800/400/800/600 (42.9%, 5.4d, $397) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $318) | 100/100/100/100 (90.6%, 64.6d, $188) |
| fundednext rapid-pro-dll-add-on | 800/200/100/800 (41.9%, 8.6d, $447) | 800/400/700 (43.1%, 8.4d, $325) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $274) | 100/100/100/100 (90.6%, 64.6d, $155) |
| lucid daily-eod | 800/400/800/400 (42.6%, 5.5d, $367) | 800/400/800/500 (42.8%, 5.5d, $432) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $199) | 100/100/100/100 (90.6%, 64.6d, $204) |
| lucid daily-eod-dll | 800/400/800/400 (42.5%, 7.4d, $309) | 800/700/800/700 (43.1%, 7.3d, $383) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $171) | 100/100/100/100 (90.6%, 64.6d, $182) |
| lucid daily-intraday | 800/400/800/400 (42.6%, 5.5d, $311) | 800/400/800/500 (42.8%, 5.5d, $364) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $168) | 100/100/100/100 (90.6%, 64.6d, $172) |
| lucid daily-intraday-dll | 800/400/800/400 (42.5%, 7.4d, $253) | 800/700/800/700 (43.1%, 7.3d, $315) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $140) | 100/100/100/100 (90.6%, 64.6d, $150) |
| lucid direct | instant | instant | - | - | - |
| lucid flex | 800/400/800/400 (42.6%, 5.5d, $287) | 800/400/800/500 (42.8%, 5.5d, $341) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $157) | 100/100/100/100 (90.6%, 64.6d, $161) |
| lucid flex-dll | 800/400/800/400 (42.5%, 7.4d, $253) | 800/700/800/700 (43.1%, 7.3d, $315) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $140) | 100/100/100/100 (90.6%, 64.6d, $150) |
| lucid maxx | 300/500/700/500 (42.2%, 10.0d, $427) | 300/500/700/500 (42.1%, 10.1d, $428) | n/a | 100/100/100/100 (89.7%, 64.1d, $201) | 100/100/100/100 (89.4%, 64.8d, $201) |
| lucid pro | 800/400/800/400 (42.5%, 7.4d, $322) | 800/800/700/500 (43.3%, 7.2d, $398) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $179) | 100/100/100/100 (90.6%, 64.6d, $190) |
| lucid pro-no-dll | 800/400/800/600 (42.7%, 5.5d, $380) | 800/400/800/600 (42.9%, 5.4d, $448) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $206) | 100/100/100/100 (90.6%, 64.6d, $212) |
| mffu builder | 800/200/100/800 (41.9%, 8.6d, $365) | 800/400/700 (43.1%, 8.4d, $355) | 10.0pt | 100/100/100/100 (90.8%, 63.9d, $168) | 100/100/100/100 (90.6%, 64.6d, $169) |
| mffu pro | 800/400/800/400 (42.6%, 5.5d, $622) | 800/400/800/500 (42.8%, 5.5d, $619) | 13.3pt | 100/100/100/100 (90.8%, 63.9d, $292) | 100/100/100/100 (90.6%, 64.6d, $293) |
| mffu rapid | 800/400/800/400 (42.6%, 5.5d, $490) | 800/400/800/500 (42.8%, 5.5d, $488) | 8.0pt | 100/100/100/100 (90.8%, 63.9d, $230) | 100/100/100/100 (90.6%, 64.6d, $231) |
| mffu rapid-eod | 400/600/800/600 (43.3%, 8.3d, $483) | 400/600/800/600 (43.6%, 8.4d, $480) | 13.3pt | 100/100/100/100 (90.8%, 63.9d, $230) | 100/100/100/100 (90.6%, 64.6d, $231) |
| topstep no-fee-consistency | 800/400/800/600 (42.8%, 5.5d, $223) | 800/400/800/600 (43.0%, 5.4d, $221) | 8.0pt | 400/200/300/300 (55.4%, 14.8d, $193) | 200/100/300/100 (67.7%, 28.3d, $140) |
| topstep no-fee-consistency-dll | 800/200/100/800 (42.3%, 8.6d, $201) | 800/400/700 (43.4%, 8.3d, $196) | 8.0pt | 300/100/200/300 (61.6%, 20.3d, $152) | 200/100/300/100 (67.7%, 28.3d, $126) |
| topstep no-fee-standard | 800/400/800/600 (42.8%, 5.5d, $223) | 800/400/800/600 (43.0%, 5.4d, $221) | 8.0pt | 400/200/300/300 (55.4%, 14.8d, $193) | 200/100/300/100 (67.7%, 28.3d, $140) |
| topstep no-fee-standard-dll | 800/200/100/800 (42.3%, 8.6d, $201) | 800/400/700 (43.4%, 8.3d, $196) | 8.0pt | 300/100/200/300 (61.6%, 20.3d, $152) | 200/100/300/100 (67.7%, 28.3d, $126) |
| topstep pro-account | instant | instant | - | - | - |
| topstep standard-consistency | 800/400/800/600 (42.8%, 5.5d, $264) | 800/400/800/600 (43.0%, 5.4d, $461) | 8.0pt | 400/200/300/300 (55.4%, 14.8d, $248) | 200/100/300/100 (67.7%, 28.3d, $293) |
| topstep standard-consistency-dll | 800/200/100/800 (42.3%, 8.6d, $268) | 800/400/700 (43.4%, 8.3d, $456) | 8.0pt | 400/200/200/200 (57.8%, 17.2d, $249) | 200/100/300/100 (67.7%, 28.3d, $293) |
| topstep standard-standard | 800/400/800/600 (42.8%, 5.5d, $264) | 800/400/800/600 (43.0%, 5.4d, $461) | 8.0pt | 400/200/300/300 (55.4%, 14.8d, $248) | 200/100/300/100 (67.7%, 28.3d, $293) |
| topstep standard-standard-dll | 800/200/100/800 (42.3%, 8.6d, $268) | 800/400/700 (43.4%, 8.3d, $456) | 8.0pt | 400/200/200/200 (57.8%, 17.2d, $249) | 200/100/300/100 (67.7%, 28.3d, $293) |
| tpt | 600/800/800/600 (41.7%, 6.4d, $440) | 500/800/800/600 (43.2%, 6.4d, $694) | 6.7pt | 400/200/300/400 (53.8%, 13.7d, $416) | 200/100/300/100 (67.7%, 28.3d, $443) |
| tradeify growth | 800/400/800/400 (43.1%, 7.3d, $270) | 800/400/800/500 (43.5%, 7.3d, $334) | 10.0pt | 100/100/100/100 (89.7%, 64.1d, $156) | 100/100/100/100 (89.4%, 64.8d, $162) |
| tradeify lightning | instant | instant | - | - | - |
| tradeify select-daily | 500/800/700 (41.8%, 6.5d, $317) | 500/800/800/400 (42.2%, 6.4d, $391) | 10.0pt | 100/100/100/100 (89.7%, 64.1d, $178) | 100/100/100/100 (89.4%, 64.8d, $185) |
| tradeify select-flex | 500/800/700 (41.8%, 6.5d, $317) | 500/800/800/400 (42.2%, 6.4d, $391) | 10.0pt | 100/100/100/100 (89.7%, 64.1d, $178) | 100/100/100/100 (89.4%, 64.8d, $185) |

**Compared with 2026-09-22 Stage A:**
- **Fastest ladder changed** on most plans. The 3-rung 800/400/700 ladders (TopStep DLL variants, FundedNext Rapid Daily and Rapid Pro DLL, MFF Builder, Alpha Zero) are now 800/200/100/800 at 8.6 days (was 8.3 to 8.4); Apex EOD moved from 800/700/600/600 to 800/200/100/800 too. The 800/400/800/500 ladders became 800/400/800/400. FTMO Growth, TPT and FundedNext Legacy moved from 500/800/800/600 to 600/800/800/600. Tradeify Select moved from 500/800/800/400 to the 3-rung 500/800/700. Lucid's 800/700/800/700 and 800/800/700/500 ladders and Apex Intraday's 800/400/800/600 also became 800/400/800/400, and FTMO Pro moved from 800/900/200/800 to 800/200/200/800. TopStep No-fee/Standard, Lucid Pro no-DLL, E8, FundedNext Flex/Rapid Pro, MFF Rapid EOD, Alpha Advanced and Lucid MAXX keep their ladders. Most fastest-ladder pass rates are slightly lower than before (E8 Zero slightly higher).
- **Cost per funded account (D1) moved in both directions.** Down: TopStep Standard path $461 to $264 (DLL $456 to $268), TPT $694 to $440, Lucid (Daily EOD $432 to $367, Pro $398 to $322), Tradeify ($334 to $270; Select $391 to $317), Apex ($1644 to $1,535; $724 to $647). Up: FundedNext Flex $173 to $249, Rapid Pro $397 to $535, Rapid Pro DLL $325 to $447, Rapid Daily $395 to $563, E8 Zero (Zero MAX 100 $868 to $1,323, Starter 80 $361 to $550).
- **Conclusion changed:** the sweep said FundedNext Flex ($173) and TopStep's DLL variants ($196) were cheaper per funded account than TopStep No-fee ($221). Flex is now above it ($249 vs $223); the TopStep No-fee DLL variants ($201) are now the cheapest fastest ladder of any plan. The TopStep Standard path is no longer about twice the No-fee cost ($264 vs $223).
- **Cheapest ladder changed** on TopStep, FTMO, Alpha, Apex and TPT: from 200/100/300/100 (67.7%, 28.3 days) or 100/100/100/100 to 400/200/300/300-type ladders at 13.7 to 21.4 days. The cheapest cost rose on most of them (TopStep No-fee $140 to $193, FTMO Growth $176 to $233, Apex EOD $771 to $1,199) and fell on the TopStep Standard path ($293 to $248) and TPT ($443 to $416). Lucid, MFF, Tradeify, E8 Signature and FundedNext Legacy keep 100/100/100/100 at about the same cost; FundedNext Flex/Rapid and E8 Zero keep 100-risk ladders but cost more (Flex $85 to $150, Rapid Pro $188 to $318, Zero MAX 100 $370 to $566).

## Result 2: flat funded baseline for gate D11 (Stage V, 20,000 trials, eval-days 15)

Top rows in printed rank order; full tables in the raw files. The Stage A TopStep ladder equals the pinned one (800,400,800,600), so those two pairs are the same command and printed identical tables.

| Plan, ladder, retain | Policy | Per-cycle net | Monthly net | Bust when funded | Survivors |
|---|---|---|---|---|---|
| topstep no-fee-standard, 800/400/800/600, $2,000 | flat $1000 | $2,723 | $3,142 | 37.8% | 1186/20000 |
| | flat $800 | $2,937 | $3,063 | 36.8% | 1301/20000 |
| | flat $600 | $3,000 | $2,923 | 36.5% | 1356/20000 |
| | flat $250 | $2,375 | $1,934 | 41.1% | 350/20000 |
| topstep no-fee-standard, 800/400/800/600, $0 (F0) | flat $1000 | $2,712 | $3,143 | 37.8% | 1178/20000 |
| | flat $800 | $2,895 | $3,061 | 36.9% | 1281/20000 |
| | flat $250 | $987 | $1,687 | 42.5% | 48/20000 |
| ftmo-futures growth, 600/800/800/600 (Stage A), $2,000 | flat $800 | $1,855 | $2,984 | 39.1% | 444/20000 |
| | flat $1000 | $1,534 | $2,499 | 38.8% | 515/20000 |
| | flat $600 | $1,130 | $2,471 | 41.4% | 9/20000 |
| | flat $250 | $1,895 | $1,918 | 41.2% | 32/20000 |
| ftmo-futures growth, 500/800/800/600 (pinned), $2,000 | flat $800 | $1,904 | $2,989 | 40.0% | 451/20000 |
| | flat $1000 | $1,558 | $2,495 | 39.8% | 518/20000 |
| | flat $600 | $1,156 | $2,470 | 42.3% | 9/20000 |
| | flat $250 | $1,934 | $1,917 | 42.3% | 32/20000 |

**Compared with validation runs 1 and 2:** TopStep at retain $2,000 and at $0 reproduces every flat row of both originals exactly (best flat $1000 $3,142; F0 $3,143). FTMO with the pinned ladder reproduces every flat row exactly; only two percent rows differ (15% cushion per-cycle $5,970 vs $5,973, 20% $5,744 vs $5,745, one survivor each). FTMO with its new Stage A ladder gives best flat $800 $2,984. **Conclusions unchanged:** the audit did not move the gate's flat baseline, and the F0 finding (a $0 vs $2,000 retained cushion does not explain a DP gap on TopStep) still holds.

## Result 3: average-reward DP (Stage DP) and gate D11

| Field | ftmo-futures growth | topstep no-fee-standard |
|---|---|---|
| Exit / status | exit 1, `status: solve-cap-reached` | exit 1, `status: solve-cap-reached` |
| Solves used / solve time / process real | 8 / 169.7s / 171.94 s | 8 / 2228.9s / 2232.78 s |
| States | 918945 | 1760770 |
| Funded value iteration | 300 sweeps, every state within $12.32 of the fixed point | 391 sweeps, every state within $14.89 of the fixed point |
| Rate-search trace ($/day -> h) | $0.00 -> $22,414; $83.95 -> $12,603; $191.79 -> $2,070; $212.98 -> $972; $231.75 -> $352; $242.42 -> $87; $245.94 -> $8; $246.32 -> $0 | $0.00 -> $20,642; $77.31 -> $11,435; $173.33 -> $2,064; $194.48 -> $995; $214.17 -> $391; $226.91 -> $104; $231.53 -> $16; $232.38 -> $1 |
| DP-predicted rate | $246.32/day, $5,173/month per slot | $232.38/day, $4,880/month per slot |
| Empirical eventual eval pass (1000-attempt retry cap) | 100.0% | 100.0% |
| Empirical funded survive / funded bust | 10.4% / 89.6% | 16.6% / 83.4% |
| Empirical monthly net per slot | $4,928 | $3,244 |
| Empirical horizon credit per cycle | $205 | $295 |
| Gap vs DP-predicted (printed) | -$245 | -$1,636 |
| Day-1 eval risk, trades 1-4 | $600 / $600 / $600 / $600 | $800 / $800 / $800 / $750 |
| Day-1 funded risk, trades 1-4 | $600 / $800 / $1000 / $0 | $800 / $1400 / $800 / $2000 |
| Warnings | new cycle-baseline coarse-grid warning (steps of $2,000 past $2,000 above the locked floor, grid top $10,000) and "rate search did not converge ... treat the numbers above as unreliable; consider raising --iterations" | same (grid top $12,000) |

**Gate D11** (pass iff the DP's empirical monthly net is at least the best flat's on at least 1 of the 2 plans and never below 0.8x the best flat on either), against Stage V's best flat rows: FTMO $4,928 vs flat $800 $2,984 (Stage A ladder; $2,989 with the pinned ladder), TopStep $3,244 vs flat $1000 $3,142. Both conditions hold on the printed figures. **Verdict: not established**, because neither solve converged within 8 rate-search solves (exit 1) and the CLI marks every number above unreliable. Re-run with a higher `--iterations` before citing a verdict or a DP figure.

**Compared with validation-2 (and validation-1, sweep Stage G):**
- Predicted monthly: FTMO $6,723 to $5,173, TopStep $5,585 to $4,880 (validation-1 TopStep: $8,619).
- Empirical monthly: FTMO $4,350 to $4,928, TopStep $3,101 to $3,244 (validation-1 TopStep: $251; sweep Stage G's retired solver: FTMO $377, TopStep $203).
- **DP-vs-empirical gap narrowed**: FTMO -$2,372 to -$245, TopStep -$2,485 to -$1,636. The "about $2,400/mo optimistic on both plans" conclusion no longer holds; FTMO is close, TopStep still well optimistic.
- **DP vs best flat changed on TopStep**: validation-2 had the DP just below the best flat (0.99x, $3,101 vs $3,142); it is now above it ($3,244). FTMO stays above. Validation-2's PASSED came from converged solves (exit 0); this run's solves did not converge, so the pass does not carry over as a verdict.
- States grew (FTMO 457,245 to 918945; TopStep 1,140,850 to 1760770) while solve time fell (958.8s to 169.7s; 4232.3s to 2228.9s).
- TopStep's day-1 funded sample is more aggressive ($800 / $1400 / $800 / $2000, was $800 / $1000 / $1000 / $0); FTMO's is smaller ($600 / $800 / $1000 / $0, was $800 / $1000 / $1000 / $0). Eval samples are unchanged.
- The empirical block is redefined: it retries failed evals up to 1,000 times and prints eventual eval pass, funded survive and funded bust. The old "eval pass rate" (5.6% / 11.7%) and "funded bust probability" (41.0% / 34.9%) are not comparable with the new lines.

## Result 4: base funded sweep, 1-year horizon (Stage B)

New columns are seed 42 with the 3-seed range (42/1337/2024) in brackets; "2026-09-22" columns are that run's 3-seed means. Sorted by the new $250 figure. "Best percent" is copied for completeness only: percent-of-cushion rows still report 0.0% bust from 5% to 40%, and on Lucid Pro, Pro no-DLL and Direct they are broken (see Engine anomalies). Rank on flat policies.

| Plan | $250 $/mo, new | $250 $/mo, 2026-09-22 | $250 per-cycle | $250 bust when funded | $250 survivors | Best flat, new | Best flat, 2026-09-22 | Best percent, new (unreliable) |
|---|---|---|---|---|---|---|---|---|
| topstep pro-account (not buyable) | $2,275 ($2,275..$2,278) | $2,260 ($2,258..$2,261) | $5,911 | 95.9% | 4092/100000 | $400 $2,689 | $400 $2,598 | 10% cushion $1,209 |
| tradeify lightning | $2,082 ($2,081..$2,084) | $2,079 ($2,077..$2,081) | $5,491 | 98.2% | 1815/100000 | $1000 $5,872 | $400 $2,811 | 15% cushion $4,257 |
| lucid direct | $2,039 ($2,039..$2,041) | $1,920 ($1,919..$1,921) | $8,957 | 74.9% | 25082/100000 | $1000 $8,375 | $400 $1,965 | 25% cushion $973,964,343 |
| topstep no-fee-standard | $1,930 ($1,924..$1,930) | $1,913 ($1,910..$1,915) | $2,370 | 41.0% | 1749/100000 | $1000 $3,157 | $1000 $3,033 | 15% cushion $1,284 |
| topstep no-fee-consistency | $1,924 ($1,917..$1,924) | $1,919 ($1,916..$1,923) | $1,956 | 42.7% | 189/100000 | $1000 $4,431 | $1000 $4,291 | 15% cushion $1,327 |
| ftmo-futures growth | $1,918 ($1,906..$1,918) | $1,911 ($1,906..$1,919) | $1,895 | 41.2% | 160/100000 | $800 $2,986 | $800 $2,909 | 15% cushion $1,176 |
| topstep standard-standard | $1,916 ($1,910..$1,916) | $1,899 ($1,896..$1,901) | $2,352 | 41.0% | 1749/100000 | $1000 $3,137 | $1000 $3,013 | 15% cushion $1,281 |
| topstep standard-consistency | $1,906 ($1,899..$1,906) | $1,901 ($1,899..$1,906) | $1,938 | 42.7% | 189/100000 | $1000 $4,399 | $1000 $4,259 | 15% cushion $1,323 |
| tradeify growth | $1,872 ($1,863..$1,872) | $1,864 ($1,861..$1,870) | $2,210 | 42.8% | 454/100000 | $1000 $5,159 | $500 $3,185 | 15% cushion $3,641 |
| tradeify select-flex | $1,870 ($1,859..$1,870) | $1,862 ($1,857..$1,868) | $2,063 | 41.3% | 473/100000 | $1000 $3,620 | $1000 $3,465 | 15% cushion $1,428 |
| lucid pro-no-dll | $1,858 ($1,847..$1,858) | $1,852 ($1,847..$1,858) | $1,869 | 42.4% | 204/100000 | $1000 $7,296 | $800 $3,552 | 25% cushion $1,743,617,717 |
| apex intraday | $1,840 ($1,834..$1,840) | $1,835 ($1,833..$1,839) | $2,095 | 31.4% | 10937/100000 | $500 $2,394 | $500 $2,247 | 10% cushion $1,225 |
| topstep no-fee-standard-dll | $1,839 ($1,834..$1,839) | $1,835 ($1,832..$1,840) | $2,183 | 41.9% | 638/100000 | $800 $2,950 | $800 $2,838 | 15% cushion $1,390 |
| lucid daily-intraday | $1,826 ($1,816..$1,826) | $1,819 ($1,815..$1,825) | $1,486 | 42.5% | 19/100000 | $800 $2,869 | $800 $2,861 | 15% cushion $924 |
| topstep no-fee-consistency-dll | $1,823 ($1,814..$1,823) | $1,818 ($1,814..$1,825) | $1,954 | 42.4% | 186/100000 | $800 $2,976 | $800 $2,965 | 15% cushion $1,775 |
| alphafutures standard | $1,818 ($1,808..$1,818) | $1,000 ($999..$1,001) | $2,080 | 42.3% | 485/100000 | $500 $2,340 | $800 $1,928 | 15% cushion $1,205 |
| lucid pro | $1,817 ($1,806..$1,817) | $1,805 ($1,800..$1,811) | $1,896 | 42.5% | 206/100000 | $1000 $6,903 | $800 $3,369 | 25% cushion $624,388,543 |
| topstep standard-standard-dll | $1,816 ($1,810..$1,816) | $1,812 ($1,808..$1,817) | $2,156 | 41.9% | 638/100000 | $800 $2,911 | $800 $2,799 | 15% cushion $1,385 |
| topstep standard-consistency-dll | $1,798 ($1,788..$1,798) | $1,793 ($1,788..$1,799) | $1,927 | 42.4% | 186/100000 | $800 $2,924 | $800 $2,913 | 15% cushion $1,769 |
| lucid daily-eod | $1,790 ($1,780..$1,790) | $1,783 ($1,779..$1,789) | $1,457 | 42.5% | 19/100000 | $800 $2,720 | $800 $2,710 | 15% cushion $918 |
| lucid daily-intraday-dll | $1,776 ($1,766..$1,776) | $1,764 ($1,760..$1,770) | $1,511 | 42.5% | 19/100000 | $800 $2,370 | $800 $2,350 | 15% cushion $922 |
| mffu rapid | $1,761 ($1,750..$1,761) | $1,753 ($1,749..$1,760) | $1,433 | 42.5% | 19/100000 | $800 $2,596 | $800 $2,586 | 15% cushion $914 |
| tradeify select-daily | $1,750 ($1,736..$1,750) | $1,741 ($1,736..$1,750) | $1,353 | 41.6% | 11/100000 | $1000 $2,481 | $1000 $2,443 | 15% cushion $896 |
| lucid daily-eod-dll | $1,742 ($1,731..$1,742) | $1,730 ($1,726..$1,736) | $1,482 | 42.5% | 19/100000 | $800 $2,259 | $800 $2,239 | 15% cushion $917 |
| alphafutures zero | $1,700 ($1,700..$1,702) | $975 ($974..$976) | $3,246 | 32.5% | 10162/100000 | $300 $1,706 | $400 $1,283 | 7.5% cushion $876 |
| mffu rapid-eod | $1,648 ($1,636..$1,648) | $1,640 ($1,636..$1,648) | $1,456 | 43.0% | 19/100000 | $800 $1,999 | $800 $2,002 | 15% cushion $908 |
| fundednext legacy | $1,634 ($1,623..$1,634) | $1,630 ($1,626..$1,635) | $1,772 | 41.3% | 357/100000 | $1000 $4,753 | $1000 $4,761 | 50% cushion $36,790 |
| mffu pro | $1,583 ($1,575..$1,583) | $1,635 ($1,632..$1,640) | $1,832 | 42.0% | 702/100000 | $400 $1,852 | $1000 $3,899 | 15% cushion $1,155 |
| lucid maxx (invite-only) | $1,582 ($1,566..$1,582) | $1,572 ($1,566..$1,582) | $1,344 | 42.1% | 8/100000 | $600 $1,835 | $600 $1,834 | 15% cushion $859 |
| alphafutures advanced | $1,566 ($1,552..$1,566) | $910 ($910..$910) | $1,415 | 32.7% | 268/100000 | $1000 $3,175 | $1000 $3,277 | 20% cushion $1,208 |
| tpt | $1,483 ($1,468..$1,483) | $1,478 ($1,472..$1,486) | $1,134 | 41.3% | 11/100000 | $800 $1,947 | $800 $1,961 | 15% cushion $768 |
| apex eod | $1,366 ($1,358..$1,366) | $1,382 ($1,374..$1,391) | $1,498 | 29.8% | 11353/100000 | $300 $1,410 | $300 $1,421 | 10% cushion $1,067 |
| e8futures signature | $1,195 ($1,191..$1,195) | $1,193 ($1,191..$1,195) | $955 | 25.9% | 17055/100000 | $400 $1,420 | $400 $1,420 | 10% cushion $796 |
| fundednext flex | $1,084 ($1,084..$1,088) | $1,201 ($1,199..$1,202) | $602 | 27.3% | 12970/100000 | $500 $1,321 | $500 $1,512 | 10% cushion $588 |
| fundednext rapid-pro | $988 ($979..$988) | $1,174 ($1,171..$1,178) | $674 | 26.1% | 16456/100000 | $250 $988 | $600 $1,248 | 10% cushion $534 |
| fundednext fnl-003 | $982 ($982..$983) | $982 ($982..$983) | $2,429 | 54.4% | 45578/100000 | $400 $1,062 | $400 $1,062 | 5% cushion $470 |
| mffu builder | $975 ($973..$976) | $974 ($972..$976) | $644 | 26.7% | 15491/100000 | $500 $1,360 | $500 $1,352 | 15% cushion $663 |
| fundednext rapid-pro-dll-add-on | $957 ($946..$957) | $1,115 ($1,112..$1,118) | $703 | 25.8% | 16349/100000 | $250 $957 | $250 $1,115 | 7.5% cushion $520 |
| lucid flex | $735 ($731..$735) | $732 ($730..$734) | $581 | 23.2% | 19720/100000 | $800 $1,709 | $800 $1,704 | 15% cushion $561 |
| lucid flex-dll | $720 ($716..$720) | $712 ($710..$714) | $596 | 23.2% | 19718/100000 | $800 $1,317 | $800 $1,306 | 15% cushion $540 |
| fundednext rapid-daily | $555 ($554..$560) | $789 ($785..$794) | $308 | 23.7% | 18666/100000 | $600 $851 | $600 $1,219 | 10% cushion $442 |
| ftmo-futures pro | $219 ($194..$219) | $205 ($194..$219) | $37 | 23.1% | 0/100000 | $200 $1,598 | $200 $1,590 | 7.5% cushion $917 |
| e8futures zero-starter-100 | $206 ($194..$206) | $450 ($445..$456) | $65 | 18.8% | 13469/100000 | $500 $636 | $1000 $1,067 | 15% cushion $249 |
| e8futures zero-starter-80 | $179 ($169..$179) | $370 ($366..$375) | $57 | 18.8% | 13469/100000 | $500 $532 | $1000 $872 | 15% cushion $202 |
| e8futures zero-max-80 | -$295 (-$307..-$295) | $60 ($55..$65) | -$93 | 18.8% | 13469/100000 | $1000 $108 | $1000 $811 | 20% cushion $116 |
| e8futures zero-max-100 | -$426 (-$441..-$426) | $38 ($32..$45) | -$135 | 18.8% | 13469/100000 | $1000 $25 | $1000 $943 | 20% cushion $135 |

**Compared with 2026-09-22 Result 3:**
- **Plan ranking at $250:** the top three are unchanged (TopStep Pro Account, Tradeify Lightning, Lucid Direct), with Lucid Direct further ahead ($2,039, was $1,920). TopStep No-fee Standard now edges No-fee Consistency ($1,930 vs $1,924; the order was reversed before, both inside a few dollars). Alpha Standard jumps into the leading group ($1,818, was $1,000) and Alpha Zero/Advanced rise to $1,700/$1,566 (were $975/$910). FundedNext Flex, Rapid Pro, Rapid Pro DLL and Rapid Daily fall ($1,084 / $988 / $957 / $555, were $1,201 / $1,174 / $1,115 / $789). E8 Zero Starter halves and E8 Zero MAX turns negative. MFF Pro falls ($1,583, was $1,635). The other plans stay close to their old means.
- **Best flat policy changed** on Tradeify Growth ($500 to $1000, $3,185 to $5,159), Tradeify Lightning ($400 to $1000, $2,811 to $5,872), Lucid Direct ($400 to $1000, $1,965 to $8,375), Lucid Pro and Pro no-DLL ($800 to $1000, now $6,903 and $7,296), MFF Pro ($1000 $3,899 to $400 $1,852), Alpha Standard ($800 to $500), Alpha Zero ($400 to $300), FundedNext Rapid Pro ($600 to $250) and E8 Zero Starter ($1000 to $500). The sweep's "aggressive funded sizing" examples change: MFF Pro drops out; FundedNext Legacy ($4,753) and TopStep No-fee Consistency ($4,431) are now behind Lucid Direct, Pro no-DLL, Pro, Tradeify Lightning and Growth at flat $1000. Verifier 1's "Legacy flat $1,000 beats TopStep's best" still holds ($4,753 vs $4,431).
- **Percent rows:** FundedNext Legacy 50% cushion is $36,790 (was a $265,222 mean); the new Lucid Pro/Pro no-DLL/Direct 25% rows are far larger and broken.

## Result 5: horizon robustness (seed 42, monthly net per slot)

| Plan | $250 6mo | $250 1yr | $250 2yr | Best flat 6mo | Best flat 1yr | Best flat 2yr |
|---|---|---|---|---|---|---|
| apex eod | $1,358 | $1,366 | $1,366 | $300 $1,409 | $300 $1,410 | $300 $1,410 |
| apex intraday | $1,826 | $1,840 | $1,840 | $500 $2,394 | $500 $2,394 | $500 $2,394 |
| tpt | $1,466 | $1,483 | $1,483 | $800 $1,947 | $800 $1,947 | $800 $1,947 |
| tradeify growth | $1,793 | $1,872 | $1,881 | $1000 $4,576 | $1000 $5,159 | $1000 $5,536 |
| tradeify select-flex | $1,788 | $1,870 | $1,879 | $1000 $3,247 | $1000 $3,620 | $1000 $3,851 |
| tradeify select-daily | $1,732 | $1,750 | $1,750 | $1000 $2,380 | $1000 $2,481 | $1000 $2,583 |
| tradeify lightning | $1,990 | $2,082 | $2,095 | $1000 $5,734 | $1000 $5,872 | $1000 $5,952 |
| lucid daily-eod | $1,766 | $1,790 | $1,791 | $800 $2,720 | $800 $2,720 | $800 $2,720 |
| lucid daily-eod-dll | $1,718 | $1,742 | $1,743 | $800 $2,259 | $800 $2,259 | $800 $2,259 |
| lucid daily-intraday | $1,803 | $1,826 | $1,826 | $800 $2,869 | $800 $2,869 | $800 $2,869 |
| lucid daily-intraday-dll | $1,753 | $1,776 | $1,777 | $800 $2,370 | $800 $2,370 | $800 $2,370 |
| lucid flex | $735 | $735 | $735 | $800 $1,709 | $800 $1,709 | $800 $1,709 |
| lucid flex-dll | $721 | $720 | $720 | $800 $1,318 | $800 $1,317 | $800 $1,317 |
| lucid pro | $1,755 | $1,817 | $1,822 | $1000 $5,854 | $1000 $6,903 | $1000 $7,691 |
| lucid pro-no-dll | $1,796 | $1,858 | $1,864 | $1000 $6,383 | $1000 $7,296 | $1000 $7,926 |
| lucid direct | $1,892 | $2,039 | $2,108 | $1000 $8,044 | $1000 $8,375 | $1000 $8,572 |
| lucid maxx | $1,562 | $1,582 | $1,582 | $600 $1,835 | $600 $1,835 | $600 $1,835 |
| mffu rapid | $1,736 | $1,761 | $1,761 | $800 $2,596 | $800 $2,596 | $800 $2,596 |
| mffu rapid-eod | $1,624 | $1,648 | $1,649 | $800 $1,999 | $800 $1,999 | $800 $1,999 |
| mffu pro | $1,484 | $1,583 | $1,597 | $400 $1,828 | $400 $1,852 | $400 $1,852 |
| mffu builder | $975 | $975 | $975 | $500 $1,360 | $500 $1,360 | $500 $1,360 |
| topstep standard-standard | $1,831 | $1,916 | $1,947 | $1000 $2,890 | $1000 $3,137 | $1000 $3,279 |
| topstep standard-standard-dll | $1,735 | $1,816 | $1,829 | $800 $2,729 | $800 $2,911 | $800 $3,046 |
| topstep standard-consistency | $1,850 | $1,906 | $1,910 | $1000 $4,152 | $1000 $4,399 | $1000 $4,607 |
| topstep standard-consistency-dll | $1,740 | $1,798 | $1,802 | $800 $2,830 | $800 $2,924 | $800 $2,937 |
| topstep no-fee-standard | $1,847 | $1,930 | $1,960 | $1000 $2,922 | $1000 $3,157 | $1000 $3,290 |
| topstep no-fee-standard-dll | $1,760 | $1,839 | $1,852 | $800 $2,777 | $800 $2,950 | $800 $3,074 |
| topstep no-fee-consistency | $1,868 | $1,924 | $1,928 | $1000 $4,199 | $1000 $4,431 | $1000 $4,627 |
| topstep no-fee-consistency-dll | $1,767 | $1,823 | $1,827 | $800 $2,885 | $800 $2,976 | $800 $2,988 |
| topstep pro-account | $2,232 | $2,275 | $2,279 | $500 $2,825 | $400 $2,689 | $400 $2,587 |
| fundednext flex | $1,084 | $1,084 | $1,084 | $500 $1,321 | $500 $1,321 | $500 $1,321 |
| fundednext legacy | $1,562 | $1,634 | $1,640 | $1000 $4,575 | $1000 $4,753 | $1000 $4,809 |
| fundednext rapid-pro | $988 | $988 | $988 | $250 $988 | $250 $988 | $250 $988 |
| fundednext rapid-pro-dll-add-on | $957 | $957 | $957 | $250 $957 | $250 $957 | $250 $957 |
| fundednext rapid-daily | $555 | $555 | $555 | $600 $851 | $600 $851 | $600 $851 |
| fundednext fnl-003 | $1,004 | $982 | $982 | $400 $1,088 | $400 $1,062 | $400 $1,062 |
| alphafutures zero | $1,540 | $1,700 | $1,790 | $300 $1,563 | $300 $1,706 | $250 $1,790 |
| alphafutures standard | $1,724 | $1,818 | $1,829 | $500 $2,201 | $500 $2,340 | $500 $2,447 |
| alphafutures advanced | $1,473 | $1,566 | $1,575 | $1000 $3,161 | $1000 $3,175 | $1000 $3,175 |
| e8futures signature | $1,195 | $1,195 | $1,195 | $400 $1,421 | $400 $1,420 | $400 $1,420 |
| e8futures zero-max-80 | -$295 | -$295 | -$295 | $1000 $108 | $1000 $108 | $1000 $108 |
| e8futures zero-max-100 | -$426 | -$426 | -$426 | $1000 $25 | $1000 $25 | $1000 $25 |
| e8futures zero-starter-80 | $179 | $179 | $179 | $500 $532 | $500 $532 | $500 $532 |
| e8futures zero-starter-100 | $206 | $206 | $206 | $500 $636 | $500 $636 | $500 $636 |
| ftmo-futures growth | $1,861 | $1,918 | $1,923 | $800 $2,810 | $800 $2,986 | $800 $3,131 |
| ftmo-futures pro | $219 | $219 | $219 | $200 $1,485 | $200 $1,598 | $200 $1,625 |

**Compared with 2026-09-22 Result 4:** same shape. Daily-payout and payout-capped plans are flat across horizons; TopStep, Tradeify, Lucid Pro/Direct, FTMO Growth and FundedNext Legacy grow with the horizon. Changes: Apex Intraday keeps flat $500 at every horizon at a higher value ($2,394, was $2,247); TopStep Pro Account's 6-month best is flat $500 as before ($2,825, was $2,662); Alpha Zero's 2-year best flat drops to $250; Lucid Pro's and Pro no-DLL's best flat is $1000 at every horizon (was $800 at 6 months and 1 year); MFF Pro's is $400 at every horizon (was $1000); FundedNext fnl-003 is slightly higher at 6 months ($1,004) than at 1 year ($982).

## Result 6: sensitivity matrix at flat $250 (seed 42, monthly net per slot, 1-year horizon)

Every scenario is the seed-42 job (seed 1337 is in the raw files for C commission, D, E). "Live cap" is the cap listed in Stage E (Tradeify 3); "live cap 2" is Tradeify at 2. `-` means the stage did not apply. $500 req is the Stage E size, so $1,000 on tradeify lightning, mffu pro and alphafutures advanced and $800 on fundednext fnl-003.

| Plan | base | 10pt cap | 20pt cap | path-walk | $10 comm | $500 req | live cap | live cap 2 | 15% idle | WR 37% | WR 43% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| apex eod | $1,366 | $1,366 | $1,366 | - | $949 | $48 | - | - | $1,149 | - | - |
| apex intraday | $1,840 | $1,840 | $1,840 | $1,702 | $1,447 | $419 | - | - | $1,558 | $971 | $2,617 |
| tpt | $1,483 | $1,483 | $1,483 | $1,441 | $1,111 | $1,483 | - | - | $1,247 | $707 | $2,277 |
| tradeify growth | $1,872 | $1,872 | $1,872 | - | $1,463 | $1,936 | $1,121 | $788 | $1,572 | $1,003 | $2,746 |
| tradeify select-flex | $1,870 | $1,870 | $1,870 | - | $1,440 | $937 | $836 | $480 | $1,570 | - | - |
| tradeify select-daily | $1,750 | $1,750 | $1,750 | - | $1,344 | $1,751 | $314 | $115 | $1,473 | - | - |
| tradeify lightning | $2,082 | $2,082 | $2,082 | - | $1,657 | $2,014 | $1,388 | $1,051 | $1,756 | $1,212 | $2,909 |
| lucid daily-eod | $1,790 | $1,790 | $1,790 | $1,754 | $1,381 | $1,904 | - | - | $1,507 | $933 | $2,666 |
| lucid daily-eod-dll | $1,742 | $1,742 | $1,742 | $1,705 | $1,339 | $1,877 | - | - | $1,465 | - | - |
| lucid daily-intraday | $1,826 | $1,826 | $1,826 | $1,721 | $1,421 | $1,922 | - | - | $1,537 | $988 | $2,688 |
| lucid daily-intraday-dll | $1,776 | $1,776 | $1,776 | $1,679 | $1,376 | $1,895 | - | - | $1,494 | - | - |
| lucid flex | $735 | $735 | $735 | - | $572 | $458 | $735 | - | $622 | - | - |
| lucid flex-dll | $720 | $720 | $720 | - | $560 | $456 | $720 | - | $606 | - | - |
| lucid pro | $1,817 | $1,817 | $1,817 | - | $1,413 | $1,925 | $1,277 | - | $1,529 | - | - |
| lucid pro-no-dll | $1,858 | $1,858 | $1,858 | - | $1,449 | $1,942 | $1,310 | - | $1,564 | $963 | $2,739 |
| lucid direct | $2,039 | $2,039 | $2,039 | - | $1,608 | $2,011 | $1,560 | - | $1,707 | $1,179 | $2,856 |
| lucid maxx | $1,582 | - | - | - | - | - | - | - | $1,326 | - | - |
| mffu rapid | $1,761 | $1,761 | $1,761 | $1,723 | $1,349 | $1,890 | - | - | $1,482 | $887 | $2,647 |
| mffu rapid-eod | $1,648 | $1,613 | $1,648 | - | $1,237 | $1,826 | - | - | $1,383 | - | - |
| mffu pro | $1,583 | $1,490 | $1,583 | - | $1,156 | $1,667 | $874 | - | $1,319 | - | - |
| mffu builder | $975 | $975 | $975 | - | $792 | $418 | - | - | $826 | - | - |
| topstep standard-standard | $1,916 | $1,916 | $1,916 | - | $1,521 | $867 | - | - | $1,612 | - | - |
| topstep standard-standard-dll | $1,816 | $1,816 | $1,816 | - | $1,391 | $978 | - | - | $1,528 | - | - |
| topstep standard-consistency | $1,906 | $1,906 | $1,906 | - | $1,525 | $902 | - | - | $1,605 | - | - |
| topstep standard-consistency-dll | $1,798 | $1,798 | $1,798 | - | $1,396 | $1,077 | - | - | $1,513 | - | - |
| topstep no-fee-standard | $1,930 | $1,930 | $1,930 | - | $1,538 | $874 | - | - | $1,624 | $1,117 | $2,732 |
| topstep no-fee-standard-dll | $1,839 | $1,839 | $1,839 | - | $1,417 | $987 | - | - | $1,548 | - | - |
| topstep no-fee-consistency | $1,924 | $1,924 | $1,924 | - | $1,544 | $908 | - | - | $1,621 | $1,118 | $2,741 |
| topstep no-fee-consistency-dll | $1,823 | $1,823 | $1,823 | - | $1,422 | $1,087 | - | - | $1,535 | - | - |
| topstep pro-account | $2,275 | - | - | - | - | - | - | - | $1,925 | - | - |
| fundednext flex | $1,084 | $1,084 | $1,084 | - | $795 | $454 | $726 | - | $921 | - | - |
| fundednext legacy | $1,634 | $1,621 | $1,634 | - | $1,247 | $1,710 | $1,043 | - | $1,373 | - | - |
| fundednext rapid-pro | $988 | $988 | $988 | - | $709 | $276 | $560 | - | $834 | - | - |
| fundednext rapid-pro-dll-add-on | $957 | $957 | $957 | - | $681 | $299 | $567 | - | $805 | - | - |
| fundednext rapid-daily | $555 | $555 | $555 | - | $513 | $394 | $226 | - | $472 | - | - |
| fundednext fnl-003 | $982 | $982 | $982 | - | $802 | $658 | - | - | $833 | - | - |
| alphafutures zero | $1,700 | $1,601 | $1,700 | - | $1,339 | $637 | $1,038 | - | $1,417 | - | - |
| alphafutures standard | $1,818 | $1,818 | $1,818 | - | $1,367 | $759 | $1,307 | - | $1,527 | - | - |
| alphafutures advanced | $1,566 | $1,566 | $1,566 | - | $1,134 | $1,727 | $960 | - | $1,309 | - | - |
| e8futures signature | $1,195 | $1,195 | $1,195 | - | $948 | $316 | - | - | $1,009 | $665 | $1,682 |
| e8futures zero-max-80 | -$295 | -$295 | -$295 | - | -$621 | -$295 | - | - | -$258 | - | - |
| e8futures zero-max-100 | -$426 | -$426 | -$426 | - | -$839 | -$426 | - | - | -$371 | - | - |
| e8futures zero-starter-80 | $179 | $179 | $179 | - | -$93 | $179 | - | - | $146 | - | - |
| e8futures zero-starter-100 | $206 | $206 | $206 | - | -$136 | $206 | - | - | $167 | - | - |
| ftmo-futures growth | $1,918 | $1,918 | $1,918 | - | $1,490 | $1,190 | - | - | $1,613 | $1,077 | $2,767 |
| ftmo-futures pro | $219 | $219 | $219 | - | $24 | -$361 | - | - | $175 | - | - |

**Compared with 2026-09-22 Result 5:**
- **Contract caps:** at $250 the 10pt cap still cuts only MFF Pro ($1,583 to $1,490), Alpha Zero ($1,700 to $1,601), MFF Rapid EOD ($1,648 to $1,613) and FundedNext Legacy ($1,634 to $1,621). The 20pt cap now changes nothing at $250 on any plan; the sweep's small 20pt gains on E8 Zero MAX and FTMO Pro do not appear (base and cap columns here share seed 42, the sweep compared 2-seed with 3-seed means).
- **Intraday path-walk:** the same cost as before at $250 (Apex Intraday $1,840 to $1,702, was $1,835 to $1,697; Lucid Daily Intraday $1,826 to $1,721, was $1,819 to $1,720). Conclusion unchanged.
- **$10 commission:** about the same cut on most plans (TopStep No-fee Consistency $1,544, was $1,539). E8 Zero Starter 80/100 now go negative (-$93 / -$136, were $122 / $139), and FTMO Pro nearly vanishes ($24, was $68).
- **$500 requests: conclusion changed.** The sweep found daily-payout plans (Lucid Daily, MFF Rapid, TPT) equal to base. Now Lucid Daily and MFF Rapid come out above base (Lucid Daily EOD $1,904 vs $1,790; MFF Rapid $1,890 vs $1,761), TPT equals base ($1,483), and Tradeify Growth and Lucid Pro/Pro no-DLL are above base too. Per-cycle-gated plans still lose heavily (TopStep No-fee Standard $874 vs $1,930). Alpha Advanced, now at $1,000 per request, is above base ($1,727 vs $1,566; the sweep's $500 run gave $570).
- **Live-trigger caps:** Tradeify and Lucid capped values are within a few dollars of the sweep (Tradeify Growth $1,121 / $788, were $1,118 / $786; Lucid Direct $1,560, same). FundedNext Flex/Rapid capped values fall (Flex $726, was $868; Rapid Daily $226, was $489); MFF Pro falls ($874, was $1,046); Alpha rises (Standard $1,307, Zero $1,038, Advanced $960; were $670, $606, $337).
- **15% idle days:** about the same proportional cut as before.
- **Win rate: conclusion changed.** At 43% the order among the 13 plans is Tradeify Lightning $2,909, Lucid Direct $2,856, FTMO Growth $2,767, Tradeify Growth $2,746; the sweep had FTMO #2, Tradeify Growth #3 and Lucid Direct dropping to #9 ($2,665). At 37% Lucid Direct is #2 ($1,179) behind Lightning ($1,212), as before.

## Result 7: sensitivity matrix, best flat policy under each scenario (seed 42)

| Plan | base | 10pt cap | 20pt cap | path-walk | $10 comm | $500 req | live cap | live cap 2 | 15% idle | WR 37% | WR 43% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| apex eod | $300 $1,410 | $300 $1,410 | $300 $1,410 | - | $400 $1,032 | $150 $159 | - | - | $400 $1,190 | - | - |
| apex intraday | $500 $2,394 | $500 $2,315 | $500 $2,394 | $400 $1,950 | $600 $2,062 | $250 $419 | - | - | $500 $2,029 | $500 $1,178 | $500 $3,577 |
| tpt | $800 $1,947 | $800 $1,947 | $800 $1,947 | $500 $1,622 | $800 $1,749 | $1000 $6,473 | - | - | $800 $1,659 | $800 $973 | $800 $3,130 |
| tradeify growth | $1000 $5,159 | $800 $4,988 | $1000 $5,159 | - | $1000 $4,805 | $1000 $5,241 | $400 $1,445 | $400 $973 | $1000 $4,252 | $1000 $2,631 | $1000 $7,748 |
| tradeify select-flex | $1000 $3,620 | $800 $3,303 | $1000 $3,597 | - | $1000 $3,385 | $500 $987 | $600 $1,685 | $600 $1,294 | $1000 $2,998 | - | - |
| tradeify select-daily | $1000 $2,481 | $800 $2,082 | $1000 $2,467 | - | $1000 $2,290 | $400 $2,227 | $800 $1,012 | $800 $568 | $1000 $2,075 | - | - |
| tradeify lightning | $1000 $5,872 | $800 $5,594 | $1000 $5,872 | - | $1000 $5,524 | $1000 $5,878 | $400 $1,771 | $400 $1,448 | $1000 $4,966 | $1000 $3,364 | $1000 $8,382 |
| lucid daily-eod | $800 $2,720 | $800 $2,720 | $800 $2,720 | $500 $2,186 | $800 $2,335 | $1000 $7,459 | - | - | $800 $2,313 | $1000 $1,535 | $800 $4,144 |
| lucid daily-eod-dll | $800 $2,259 | $800 $2,259 | $800 $2,259 | $400 $1,882 | $800 $1,920 | $800 $4,241 | - | - | $800 $1,929 | - | - |
| lucid daily-intraday | $800 $2,869 | $800 $2,869 | $800 $2,869 | $500 $2,096 | $1000 $2,497 | $1000 $7,493 | - | - | $800 $2,440 | $1000 $1,726 | $800 $4,274 |
| lucid daily-intraday-dll | $800 $2,370 | $800 $2,370 | $800 $2,370 | $400 $1,826 | $800 $2,029 | $800 $4,265 | - | - | $800 $2,023 | - | - |
| lucid flex | $800 $1,709 | $800 $1,601 | $800 $1,709 | - | $800 $1,500 | $300 $458 | $800 $1,709 | - | $800 $1,449 | - | - |
| lucid flex-dll | $800 $1,317 | $800 $1,279 | $800 $1,317 | - | $800 $1,161 | $250 $456 | $800 $1,317 | - | $800 $1,117 | - | - |
| lucid pro | $1000 $6,903 | $800 $5,440 | $1000 $6,903 | - | $1000 $6,513 | $1000 $7,411 | $800 $2,080 | - | $1000 $5,646 | - | - |
| lucid pro-no-dll | $1000 $7,296 | $800 $5,695 | $1000 $7,296 | - | $1000 $6,997 | $1000 $7,743 | $500 $2,383 | - | $1000 $5,992 | $1000 $3,540 | $1000 $10,890 |
| lucid direct | $1000 $8,375 | $800 $6,741 | $1000 $8,375 | - | $1000 $7,934 | $1000 $8,389 | $400 $1,750 | - | $1000 $7,043 | $1000 $4,777 | $1000 $11,740 |
| lucid maxx | $600 $1,835 | - | - | - | - | - | - | - | $600 $1,540 | - | - |
| mffu rapid | $800 $2,596 | $800 $2,596 | $800 $2,596 | $500 $2,085 | $800 $2,214 | $1000 $7,430 | - | - | $800 $2,207 | $800 $1,379 | $800 $4,036 |
| mffu rapid-eod | $800 $1,999 | $600 $1,885 | $800 $1,999 | - | $800 $1,666 | $1000 $6,950 | - | - | $800 $1,694 | - | - |
| mffu pro | $400 $1,852 | $300 $1,624 | $400 $1,852 | - | $400 $1,426 | $600 $3,179 | $400 $1,245 | - | $400 $1,596 | - | - |
| mffu builder | $500 $1,360 | $500 $1,360 | $500 $1,360 | - | $500 $1,139 | $250 $418 | - | - | $500 $1,139 | - | - |
| topstep standard-standard | $1000 $3,137 | $1000 $2,978 | $1000 $3,131 | - | $1000 $2,936 | $500 $939 | - | - | $1000 $2,610 | - | - |
| topstep standard-standard-dll | $800 $2,911 | $800 $2,736 | $800 $2,911 | - | $800 $2,529 | $300 $981 | - | - | $800 $2,437 | - | - |
| topstep standard-consistency | $1000 $4,399 | $1000 $4,112 | $1000 $4,397 | - | $1000 $3,788 | $300 $907 | - | - | $1000 $3,669 | - | - |
| topstep standard-consistency-dll | $800 $2,924 | $800 $2,817 | $800 $2,924 | - | $1000 $2,603 | $250 $1,077 | - | - | $800 $2,469 | - | - |
| topstep no-fee-standard | $1000 $3,157 | $1000 $2,998 | $1000 $3,151 | - | $1000 $2,956 | $500 $949 | - | - | $1000 $2,629 | $1000 $1,967 | $1000 $4,107 |
| topstep no-fee-standard-dll | $800 $2,950 | $800 $2,768 | $800 $2,950 | - | $800 $2,570 | $300 $992 | - | - | $800 $2,472 | - | - |
| topstep no-fee-consistency | $1000 $4,431 | $1000 $4,138 | $1000 $4,425 | - | $1000 $3,814 | $500 $915 | - | - | $1000 $3,700 | $1000 $2,590 | $1000 $6,334 |
| topstep no-fee-consistency-dll | $800 $2,976 | $800 $2,855 | $800 $2,976 | - | $1000 $2,654 | $250 $1,087 | - | - | $800 $2,513 | - | - |
| topstep pro-account | $400 $2,689 | - | - | - | - | - | - | - | $400 $2,303 | - | - |
| fundednext flex | $500 $1,321 | $500 $1,321 | $500 $1,321 | - | $500 $1,070 | $250 $454 | $500 $972 | - | $500 $1,117 | - | - |
| fundednext legacy | $1000 $4,753 | $1000 $4,547 | $1000 $4,753 | - | $1000 $4,328 | $1000 $6,790 | $1000 $2,988 | - | $1000 $3,957 | - | - |
| fundednext rapid-pro | $250 $988 | $250 $988 | $250 $988 | - | $300 $725 | $150 $297 | $250 $560 | - | $250 $834 | - | - |
| fundednext rapid-pro-dll-add-on | $250 $957 | $250 $957 | $250 $957 | - | $250 $681 | $150 $311 | $250 $567 | - | $250 $805 | - | - |
| fundednext rapid-daily | $600 $851 | $600 $851 | $600 $851 | - | $600 $714 | $250 $394 | $600 $393 | - | $600 $714 | - | - |
| fundednext fnl-003 | $400 $1,062 | $400 $1,062 | $400 $1,062 | - | $500 $911 | $300 $690 | - | - | $400 $902 | - | - |
| alphafutures zero | $300 $1,706 | $300 $1,607 | $300 $1,706 | - | $300 $1,409 | $250 $637 | $250 $1,038 | - | $300 $1,424 | - | - |
| alphafutures standard | $500 $2,340 | $500 $2,339 | $500 $2,340 | - | $800 $2,028 | $250 $759 | $500 $1,724 | - | $500 $1,970 | - | - |
| alphafutures advanced | $1000 $3,175 | $1000 $3,175 | $1000 $3,175 | - | $1000 $2,842 | $600 $2,744 | $1000 $2,278 | - | $1000 $2,617 | - | - |
| e8futures signature | $400 $1,420 | $400 $1,420 | $400 $1,420 | - | $400 $1,214 | $250 $316 | - | - | $400 $1,204 | $400 $774 | $400 $2,039 |
| e8futures zero-max-80 | $1000 $108 | $1000 -$20 | $1000 -$102 | - | $1000 -$358 | $150 -$266 | - | - | $1000 $99 | - | - |
| e8futures zero-max-100 | $1000 $25 | $1000 -$121 | $1000 -$235 | - | $1000 -$556 | $150 -$367 | - | - | $1000 $31 | - | - |
| e8futures zero-starter-80 | $500 $532 | $500 $502 | $500 $532 | - | $500 $162 | $250 $179 | - | - | $500 $434 | - | - |
| e8futures zero-starter-100 | $500 $636 | $500 $600 | $500 $636 | - | $500 $173 | $250 $206 | - | - | $500 $518 | - | - |
| ftmo-futures growth | $800 $2,986 | $800 $2,807 | $800 $2,986 | - | $800 $2,668 | $250 $1,190 | - | - | $800 $2,498 | $800 $1,738 | $800 $4,214 |
| ftmo-futures pro | $200 $1,598 | $200 $1,598 | $200 $1,598 | - | $200 $1,150 | $200 $1,181 | - | - | $200 $1,338 | - | - |

**Compared with 2026-09-22 Result 6:**
- **Contract caps:** at 10pt the best flat drops from $1000 to $800 on all four Tradeify plans and on Lucid Pro, Pro no-DLL and Direct, from $800 to $600 on MFF Rapid EOD and from $400 to $300 on MFF Pro. At 20pt no plan changes policy (the sweep had 2). As before, the 10pt cap raises the flat $1000 row on Apex EOD ($693 to $1,137), Alpha Zero ($742 to $1,103) and E8 Signature ($807 to $1,094) (raw B and D files; the sweep's explanation was that the engine shrinks an unplaceable size instead of rejecting it), but none of those becomes the best flat. E8 Zero MAX's best flat turns negative under either cap.
- **Path-walk:** best flat still drops to $400 to $500, at about the old values (Lucid Daily EOD $500 $2,186, was $2,199; Apex Intraday $400 $1,950, was $1,886). Conclusion unchanged.
- **$500 requests: conclusion reversed.** The sweep's $500 run lowered the best flat on most plans (Lucid Daily Intraday $500 $2,597 vs $800 $2,861 base; Lucid Pro $300 $724) and raised it only modestly on TPT ($500 $2,194) and MFF Rapid EOD ($500 $2,420). Now it moves the best flat to $1000 and multiplies it on daily-payout plans (TPT $6,473, Lucid Daily EOD $7,459, Lucid Daily Intraday $7,493, MFF Rapid $7,430, MFF Rapid EOD $6,950) and raises it on Lucid Pro/Pro no-DLL/Direct, FundedNext Legacy ($6,790) and MFF Pro at $1,000 ($600 $3,179). Unexplained; see Engine anomalies.
- **Live-trigger caps:** capped best flats are close to the sweep for Tradeify and Lucid (Lucid Pro no-DLL $500 $2,383, was $2,382; Lucid Pro $800 $2,080, was $2,064; Tradeify Growth $400 $1,445, was $1,442). MFF Pro falls to $400 $1,245 (was $1000 $3,740); Alpha Advanced rises to $1000 $2,278 (was $1,655).
- **Win rate 43%:** Lucid Direct flat $1000 $11,740 and Pro no-DLL $10,890 lead (the sweep: $400 $2,734 and $800 $5,176).

## Result 8: realistic view at flat $250 (seed 42)

Realistic = the live-trigger-capped result where the firm moves traders to live after a payout count (Stage E cap list; Tradeify at 3), the intraday path-walk result where the funded drawdown trails intraday, else base. Same basis as the sweep's Result 7. Buyable plans only. Slot counts and whole-firm totals are not recomputed here.

| Plan | Fastest ladder | $250 base | $250 realistic | Basis | Best flat, realistic | $250 + $10 commission | 2026-09-22 realistic (basis) |
|---|---|---|---|---|---|---|---|
| topstep no-fee-standard | 800/400/800/600 | $1,930 | $1,930 | base | $1000 $3,157 | $1,538 | $1,913 (base) |
| topstep no-fee-consistency | 800/400/800/600 | $1,924 | $1,924 | base | $1000 $4,431 | $1,544 | $1,919 (base) |
| ftmo-futures growth | 600/800/800/600 | $1,918 | $1,918 | base | $800 $2,986 | $1,490 | $1,911 (base) |
| topstep standard-standard | 800/400/800/600 | $1,916 | $1,916 | base | $1000 $3,137 | $1,521 | $1,899 (base) |
| topstep standard-consistency | 800/400/800/600 | $1,906 | $1,906 | base | $1000 $4,399 | $1,525 | $1,901 (base) |
| topstep no-fee-standard-dll | 800/200/100/800 | $1,839 | $1,839 | base | $800 $2,950 | $1,417 | $1,835 (base) |
| topstep no-fee-consistency-dll | 800/200/100/800 | $1,823 | $1,823 | base | $800 $2,976 | $1,422 | $1,818 (base) |
| topstep standard-standard-dll | 800/200/100/800 | $1,816 | $1,816 | base | $800 $2,911 | $1,391 | $1,812 (base) |
| topstep standard-consistency-dll | 800/200/100/800 | $1,798 | $1,798 | base | $800 $2,924 | $1,396 | $1,793 (base) |
| lucid daily-eod | 800/400/800/400 | $1,790 | $1,754 | path-walk | $500 $2,186 | $1,381 | $1,754 (intraday path-walk) |
| mffu rapid | 800/400/800/400 | $1,761 | $1,723 | path-walk | $500 $2,085 | $1,349 | $1,723 (intraday path-walk) |
| lucid daily-intraday | 800/400/800/400 | $1,826 | $1,721 | path-walk | $500 $2,096 | $1,421 | $1,720 (intraday path-walk) |
| lucid daily-eod-dll | 800/400/800/400 | $1,742 | $1,705 | path-walk | $400 $1,882 | $1,339 | $1,699 (intraday path-walk) |
| apex intraday | 800/400/800/400 | $1,840 | $1,702 | path-walk | $400 $1,950 | $1,447 | $1,697 (intraday path-walk) |
| lucid daily-intraday-dll | 800/400/800/400 | $1,776 | $1,679 | path-walk | $400 $1,826 | $1,376 | $1,672 (intraday path-walk) |
| mffu rapid-eod | 400/600/800/600 | $1,648 | $1,648 | base | $800 $1,999 | $1,237 | $1,640 (base) |
| lucid direct | instant | $2,039 | $1,560 | live cap 5 | $400 $1,750 | $1,608 | $1,560 (live-trigger cap) |
| tpt | 600/800/800/600 | $1,483 | $1,441 | path-walk | $500 $1,622 | $1,111 | $1,449 (intraday path-walk) |
| tradeify lightning | instant | $2,082 | $1,388 | live cap 3 | $400 $1,771 | $1,657 | $1,386 (live-trigger cap) |
| apex eod | 800/200/100/800 | $1,366 | $1,366 | base | $300 $1,410 | $949 | $1,382 (base) |
| lucid pro-no-dll | 800/400/800/600 | $1,858 | $1,310 | live cap 5 | $500 $2,383 | $1,449 | $1,308 (live-trigger cap) |
| alphafutures standard | 800/400/800/400 | $1,818 | $1,307 | live cap 5 | $500 $1,724 | $1,367 | $670 (live-trigger cap) |
| lucid pro | 800/400/800/400 | $1,817 | $1,277 | live cap 5 | $800 $2,080 | $1,413 | $1,266 (live-trigger cap) |
| e8futures signature | 800/400/800/600 | $1,195 | $1,195 | base | $400 $1,420 | $948 | $1,193 (base) |
| tradeify growth | 800/400/800/400 | $1,872 | $1,121 | live cap 3 | $400 $1,445 | $1,463 | $1,118 (live-trigger cap) |
| fundednext legacy | 600/800/800/600 | $1,634 | $1,043 | live cap 5 | $1000 $2,988 | $1,247 | $1,048 (live-trigger cap) |
| alphafutures zero | 800/200/100/800 | $1,700 | $1,038 | live cap 5 | $250 $1,038 | $1,339 | $606 (live-trigger cap) |
| fundednext fnl-003 | instant | $982 | $982 | base | $400 $1,062 | $802 | $982 (base) |
| mffu builder | 800/200/100/800 | $975 | $975 | base | $500 $1,360 | $792 | $974 (base) |
| alphafutures advanced | 700/700/700/700 | $1,566 | $960 | live cap 5 | $1000 $2,278 | $1,134 | $337 (live-trigger cap) |
| mffu pro | 800/400/800/400 | $1,583 | $874 | live cap 3 | $400 $1,245 | $1,156 | $1,046 (live-trigger cap) |
| tradeify select-flex | 500/800/700 | $1,870 | $836 | live cap 3 | $600 $1,685 | $1,440 | $834 (live-trigger cap) |
| lucid flex | 800/400/800/400 | $735 | $735 | live cap 5 | $800 $1,709 | $572 | $732 (live-trigger cap) |
| fundednext flex | 500/500/500/500 | $1,084 | $726 | live cap 3 | $500 $972 | $795 | $868 (live-trigger cap) |
| lucid flex-dll | 800/400/800/400 | $720 | $720 | live cap 5 | $800 $1,317 | $560 | $712 (live-trigger cap) |
| fundednext rapid-pro-dll-add-on | 800/200/100/800 | $957 | $567 | live cap 3 | $250 $567 | $681 | $769 (live-trigger cap) |
| fundednext rapid-pro | 800/400/800/600 | $988 | $560 | live cap 3 | $250 $560 | $709 | $804 (live-trigger cap) |
| tradeify select-daily | 500/800/700 | $1,750 | $314 | live cap 3 | $800 $1,012 | $1,344 | $312 (live-trigger cap) |
| fundednext rapid-daily | 800/200/100/800 | $555 | $226 | live cap 3 | $600 $393 | $513 | $489 (live-trigger cap) |
| ftmo-futures pro | 800/200/200/800 | $219 | $219 | base | $200 $1,598 | $24 | $205 (base) |
| e8futures zero-starter-100 | 600/600/600/600 | $206 | $206 | base | $500 $636 | -$136 | $450 (base) |
| e8futures zero-starter-80 | 600/600/600/600 | $179 | $179 | base | $500 $532 | -$93 | $370 (base) |
| e8futures zero-max-80 | 600/600/600/600 | -$295 | -$295 | base | $1000 $108 | -$621 | $60 (base) |
| e8futures zero-max-100 | 600/600/600/600 | -$426 | -$426 | base | $1000 $25 | -$839 | $38 (base) |

**Compared with 2026-09-22 Result 7 and its answer table:** the per-slot order of the sweep's seven answer-table plans is unchanged in substance: TopStep No-fee and FTMO Growth lead within a few dollars of each other, then Lucid Daily EOD ($1,754) and MFF Rapid ($1,723), with TPT ($1,441), Tradeify Lightning ($1,388 at cap 3, $1,051 at cap 2) and E8 Signature ($1,195) below; Apex Intraday stays unavailable for him (live at Apex). What changed: Alpha Standard ($1,307) now sits above Tradeify Growth ($1,121) and FundedNext Legacy ($1,043) in the capped view, and Alpha Zero ($1,038) just below Legacy (both were near the bottom); MFF Pro ($874), FundedNext Flex ($726) and Rapid ($560 / $567 / $226) fell; E8 Zero plans are at or below zero. The sweep's slot-weighted firm ranking was not recomputed; its slot counts did not come from the engine.

## Engine anomalies found by this run (open)

| Where | What the CLI printed | Direction |
|---|---|---|
| `optimize funded`, percent-of-cushion rows, Lucid Pro / Pro no-DLL / Direct | monthly net in the millions to trillions while per-cycle net stays small or negative: B `lucid__pro__s42__d252` 25% cushion per-cycle $1,511, monthly $624,388,543; B `lucid__pro-no-dll__s42__d252` 25% cushion per-cycle $1,474, monthly $1,743,617,717; B `lucid__direct__s42__d252` 25% cushion per-cycle -$435, monthly $973,964,343; F `lucid__direct__wr0.43` 25% cushion per-cycle -$272, monthly $43,768,011,864,973. Files with at least one percent row at $1,000,000/mo or more: B 30, C commission 6, E request size 20 (also Lucid Daily, MFF Rapid/Rapid EOD/Pro, TPT and FundedNext Legacy there), E live cap 2, F 2; none in V, C path-walk or D (contract caps) | a monthly net far above per-cycle net points at the horizon-credit term with uncapped percent compounding; not verified. Never cite a percent row for these plans |
| `optimize funded --request-size` on daily-payout plans | best flat at $500 per request is $1000 at $6,473 to $7,493 on TPT, Lucid Daily EOD/Intraday and MFF Rapid/Rapid EOD, against $1,947 to $2,869 in the base run. Lucid Daily EOD flat $1000: base per-cycle $449, monthly $2,661, 0/100000 survivors; $500 request per-cycle $2,038, monthly $7,459, 5405/100000 survivors | reverses the sweep's "$500 requests: mostly a model artifact, daily plans equal to base". Cause established (investigation wf_14d01a83-477, WP39, WP40): request-all drains a daily-payout plan back to the retained-cushion barrier after every green day, so 0 survivors at flat $1000 is exact, while a $500 request leaves the excess in the account and the growing cushion lets about 5% of trials survive (a real cushion-accumulation effect). The ranking reversal came from the pre-audit horizon credit (27f1c66), which credited each survivor its whole balance above the floor. After T32 (WP39: one capped request, which the cycle-profit pool caps at $0 here because the last daily payout emptied it), the post-WP40 CLI prints Lucid Daily EOD flat $1000 (2,000 trials) base per-cycle $460, horizon credit $0, monthly $2,700, 0/2000 survivors, and $500 request per-cycle $1,987, horizon credit $0, monthly $2,356 (monthly ex-credit $2,356), 108/2000 survivors, so the base run ranks first again. Resolved pending re-run of Stage E; the printed rows in this file stay uncitable. Which payout policy Hard Rule 2 means is open (U19) |
| `optimize dp` | both plans exit 1 with `status: solve-cap-reached` at the default 8 solves, `unconverged funded levels=0` | gate D11 cannot be settled from this run |

## Adjustments (flag translations and every difference from the original runs)

**Flag translations:**
- Stage A: the original `--firm --variant --trials 20000 --top 5`, plus an explicit `--seed 42` (the default). The job set grew from 42 to 46: the 4 instant-funded plans run and print their warning (exit 0), which replaces the hand-kept instant list. Ladder now rejects trading flags it cannot model; the original command used none.
- Stage V (validation-1 F and F0, validation-2 flat jobs): every original flag kept; validation-2 omitted `--idle-day-probability 0` (the default), so both runs' flat jobs are the same command and one job serves both. Added, all at their defaults: `--tpd 4 --stop day-green --max-attempts 1`. The ladder comes from this run's Stage A, with pinned copies at the originals' literal ladders.
- Stages B to F: every original flag kept. Added `--rebuy-lag-days 0` (a flag that did not exist in the sweep; 0 means no empty-slot time, as the sweep had none) and the originals' defaults made explicit (`--winrate 0.4` except in F, `--rr 2 --tpd 4 --stop day-green --eval-days 150 --max-attempts 1`).
- Stage E request size: same rule as the original (the larger of $500 and the plan's printed minimum), applied to today's `prop plans`: Alpha Advanced's printed minimum is now $1,000, so it ran at `--request-size 1000` where the sweep ran $500. The other 43 plans kept the original sizes.
- Stage E live cap: same plan/N list; `--max-lifetime-payouts` now replaces the plan's own cap for the run.
- DP: the validation runs' command kept, with `--iterations 8 --winrate 0.4 --rr 2` made explicit (defaults). Sweep Stage G (`gtimeout 2400 ... --iterations 2`) maps onto the same two jobs: its `--iterations` counted passes of the retired joint solver, and the 2,400 s timeout would have killed TopStep. No `gtimeout` was used.

**Other differences from the original runs:**
- Engine: the uncommitted audit tree on `7ce5d7b` (four content states, see Engine state), against `4e398aa` (sweep) and the uncommitted tree on `65e310c` (validations). Every metric changed with the audit: monthly net includes the horizon credit; cost per funded account is D1; eval pass and funded survive are split (D2); an eval timeout counts as a failed attempt (T29); ladder honors each plan's own eval-day cap and drops ladders under a 2% pass floor; `optimize dp`'s empirical block retries failed evals up to 1,000 times. Correction (2026-09-26): the horizon credit in monthly net is not an audit change. It was already in the engine at the audit baseline `ffcd78d`, added pre-audit with `27f1c66`; the audit later capped it at one payout request (T32, WP39).
- Parallelism: at most 6 jobs at once (the sweep used 14), on a machine shared with other agents; DP one at a time.
- Tables report seed 42 (with the 3-seed range in Result 4) instead of the sweep's 2- or 3-seed means, so that every number is one the CLI printed.
- The DP stage is two jobs for all three runs' DP stages.
- Not re-run: the sweep's 5 adversarial verifiers and its aborted 14-job DP queue (commands never recorded), the doc-tree readers, and the non-engine adjustments (NL eligibility, commission rates, behavioral clauses, operational rules). Those remain as recorded in the sweep and were not re-checked against live help centers here.

## Verification

- Job counts match the plan: A 46, V 6, B 460, C path-walk 21, C commission 88, D 176, E request size 88, E live cap 44, F 26, DP 2; one output file per job line. Every output ends in `exit=0` except the 2 DP files (`exit=1`, the solve-cap result recorded above). No `.tmp` files remain.
- Stage A: 4 instant plans detected from output, 0 unparsed ladders. Stage E request sizes: 80 jobs at $500, 6 at $1,000, 2 at $800.
- Engine state: `enginehash` moved from `c56154d2...` (start) to `2d8d0686...` (end) because another build edited `advisor/` files and git staging during the run; `advisor/` is a leaf that the CLI's `prop` commands do not import (grep, per the run's gate note). The content hash with `advisor/` excluded at the end equals pin 4 (`be4620b3...`): no engine content changed after 02:51:07Z. A 30 s watcher logged every content change (`meta/hash-watch.log`); the gate note is `meta/engine-gate-note.txt`.
- No `bun run cli prop`, `run1.sh` or watcher process is left (`pgrep -f 'src/cli/index.ts pro[p]'` and the run1/hashwatch patterns return nothing). No repo file was edited by the run; HEAD stayed `7ce5d7b`.
- Every figure in this file was copied from the raw CLI outputs listed below, or from the three original run files for the comparison columns. Tables were assembled by `awk` over the stripped outputs (the `flat $250` row, the first `flat` row, the first `% cushion` row, and min/max over seeds); nothing was recomputed, and no script imports `~/lib/prop-calculator`.
- The run dir was rebuilt fresh at start (an earlier attempt had been renamed to `rerun-2026-09-25-stale-preWave22`); only `run1.sh`, `lib.sh` and `gate.sh` were copied, unchanged.

## Artifacts

Run dir (outside the repo, not durable): `/private/tmp/claude-501/-Users-sadrashameli-Personal-sadra-nl/1b264b7a-c902-4b3b-b522-d0676e267927/scratchpad/rerun-2026-09-25/`

- Raw outputs, one file per job: `A/<firm>__<variant>.txt`; `V/<firm>__<variant>__<ladA|ladX-X-X-X>__rc<2000|0>.txt`; `B/<firm>__<variant>__s<seed>__d<days>[__idle15].txt`; `C_path/<firm>__<variant>__s<seed>.txt`; `C_comm/<firm>__<variant>__s<seed>.txt`; `D/<firm>__<variant>__s<seed>__sp<10|20>.txt`; `E_req/<firm>__<variant>__s<seed>__req<N>.txt`; `E_live/<firm>__<variant>__s<seed>__cap<N>.txt`; `F/<firm>__<variant>__wr<0.37|0.43>.txt`; `DP/ftmo-futures__growth.txt`, `DP/topstep__no-fee-standard.txt`. TPT's variant is `_`.
- Job lists (output path plus exact arguments): `jobs/<stage>.jobs`. Harness: `run1.sh`, `lib.sh` (`BASE`, `GRID`, plan lists, fastest-ladder parser, request-size rule), `gate.sh` (content hash). Logs: `logs/<stage>.log`.
- `meta/`: `head.txt`, `status-start.txt`, `enginehash-start.txt` / `-end.txt`, `contenthash-pin*.txt`, `contenthash-end.txt`, `hash-watch.log`, `engine-gate-note.txt`, `diff-after-B-*.patch`, `diff-at-Cpath-*.patch`, `B-jobs-started-after-edit.txt`, `plans-all.tsv`, `plans-rules.txt`, `request-sizes.txt`, `fastest-ladders.txt`, `help-ladder.txt`, `help-optimize-funded.txt`, `help-optimize-dp.txt`, `<stage>-readback.txt`, `t-<stage>-start` / `-end`.
