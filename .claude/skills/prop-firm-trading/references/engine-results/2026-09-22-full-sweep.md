# Run 2026-09-22-full-sweep

**Question:** "find the best prop firms for me", using the skill's numbers and hard rules. Metric definitions, staleness check and re-run rules: [`../engine-results.md`](../engine-results.md).

**Engine state:** every number reproduces at commit `4e398aa`. The sweep started on `bba625d`. The only change in between that touches `src/` is `ff182a6`: it removed six `FundedStateValue` exports from the `core` barrel (no behavior change) and added the `monthly net` column and `--sort monthly` to `optimize funded` and a monthly line to `optimize dp`. `4e398aa` itself changes no `src/` file.

**Volume:** Stage A searched 196,990 distinct eval ladders x 20,000 simulations (3.94 billion eval attempts); the funded stages ran 903 `optimize funded` jobs x 18 policies x 100,000 trials (1.63 billion funded runs); about 75 minutes of wall clock on 14 cores. Plus 2 DP solves, 9 full doc-tree readers and 5 adversarial verifiers.

## Answer in one table

Objective, held fixed: **monthly net per account slot at flat $250 funded risk** (Hard Rule 5), 1-year funded horizon, eval via each plan's fastest ladder (Hard Rule 3), payouts always leaving $2,000 cushion (Hard Rule 2). "Realistic" swaps in the live-trigger-capped result where a firm moves traders to live after a payout count (Hard Rule 7, stay on sim), and the intraday path-walk result where the funded drawdown trails intraday. Slots = per-firm funded cap (`firm-rules.md`, plus the doc trees for FTMO 3, E8 Signature 5, Alpha 5/3).

| # | Plan | Eval ladder (pass, days to funded, $ per funded) | $/mo per slot, realistic | $250 base + $10/trade commission (no path-walk or live cap) | Slots | $/mo whole firm | Why / risk |
|---|---|---|---|---|---|---|---|
| 1 | TopStep No-fee, Consistency XFA | 800/400/800/600 (43.0%, 5.4d, $221) | $1,919 | $1,539 | 5 | $9,595 | NL eligible (docs); no payout-count live trigger, 0.71% of funded traders ever called up; cheapest funded account among the ranked plans (FundedNext Flex $173 and TopStep's DLL variants $196 are cheaper but rank lower). Risk: FTP Slowdown / RTP triggers on losing many XFAs quickly or several hitting the MLL the same day |
| 2 | Lucid Daily (EOD eval, no DLL) | 800/400/800/500 (42.8%, 5.5d, $432) | $1,754 | $1,382 | 5 (Lucid-wide) | $8,770 | no payout-count live trigger (only an $8,000 one-day profit trigger, unreachable at this sizing). Risk: red-folder USD news is a hard breach; funded drawdown is intraday trailing (path-walk applied); NL unstated, and Lucid's Terms of Use say the site is "for use only by persons located in the United States" while its Trader Agreement was never read |
| 3 | MFF Rapid | 800/400/800/500 (42.8%, 5.5d, $488) | $1,723 | $1,349 | 5 (shared) | $8,615 | no count trigger ($10k single day, or discretionary). Risk: T1 news ban plus flat for 2 minutes around every data release firm-wide (resting brackets count); funded starts at 2 contracts (unmodeled); NL unstated |
| 4 | TPT Test to PRO | 500/800/800/600 (43.2%, 6.4d, $694) | $1,449 | $1,110 | 5 | $7,245 | the only firm that keeps sim running while live. Risk: news flat rule, $4.50/mini commission, 4:55 PM ET auto-close; NL unstated |
| 5 | Tradeify Lightning (instant funded, $492) | none, instant | $1,386 at a 3-payout cap; $1,049 at 2 | $1,656 | 5 (shared) | $6,930 (cap 3); $5,245 (cap 2), which would drop it to #7 | Tradeify considers a trader for live at 3 payouts on one account OR 10 in total; with 5 accounts the 10-total trigger arrives at about 2 per account. Selection is mandatory, closes every sim and eval account and locks the whole household out of sim. No funded reset. Microscalping payout rule (over 50% of trades and profit from trades held longer than 10 seconds). NL unstated |
| 6 | E8 Signature | 800/400/800/600 (43.0%, 5.4d, $373) | $1,193 | $948 | 5 | $5,965 | no live stage at all. NL: not on the 88-country restricted list, but never stated as accepted; the product-restriction list and payout-processor eligibility are unverified. Two platform articles say Signature may not be on sale |
| 7 | FTMO Futures Growth | 500/800/800/600 (43.2%, 6.4d, $275) | $1,911 | $1,490 | 3 | $5,733 | NL eligible (docs); invitation-only live, no count trigger. Risk: "Evaluation vs Sim-Funded Mismatch" and "inconsistent position sizing" are named violations, which a max-risk eval ladder followed by $250 funded is |
| - | Apex Intraday | 800/400/800/600 (42.5%, 5.5d, $724) | $1,697 | $1,436 | 20 | $33,940 | **unavailable**: he is live at Apex and Apex bans sim while live. The 20-slot cap would dominate if he ever leaves live |

Seeds: realistic values are 3-seed means for base and path-walk rows, 2-seed means for live-capped rows; the commission column is 2-seed. Per-slot gaps between #1 TopStep and FTMO are inside noise (12-seed check by verifier 2: $1,910 vs $1,909); the firm ranking between them comes from slots.

**Demoted by the live-trigger cap** (the engine runs them to the horizon; the firm would move him to live first). Flat $250, 1-year, base to capped:
- Tradeify: Growth $1,864 to $1,118 (cap 3) / $786 (cap 2); Select Flex $1,862 to $834 / $479; Select Daily $1,741 to $312 / $112.
- Lucid (review pool after payout 5): Pro no-DLL $1,852 to $1,308; Pro $1,805 to $1,266; Direct $1,920 to $1,560. All share Lucid's 5 slots with Daily, which has no count trigger.
- MFF Pro (live after 3 consecutive payouts): $1,635 to $1,046.
- FundedNext: Legacy $1,630 to $1,048 (5 withdrawals from one account, `firm-rules.md`); Flex $1,201 to $868, Rapid Pro $1,174 to $804, Rapid Pro DLL $1,115 to $769, Rapid Daily $789 to $489. The Flex/Rapid cap of 3 per account is an assumption derived from the documented 15 Performance Rewards spread over 5 slots, not a quoted per-account number.
- Alpha (review after 5 performance fees on one account): Standard $1,000 to $670, Zero $975 to $606, Advanced $910 to $337.

**Aggressive funded sizing (engine-optimal, not recommended).** In this run's base data (3 seeds, 1-year), flat $800 or $1,000 is the best flat policy on 30 of 44 buyable plans, at 1.2x to 3.6x the $250 result (E8 Zero MAX is off the scale at 13.6x and 24.6x only because its $250 result is barely positive). Examples: TopStep No-fee Consistency flat $1,000 $4,291 (2.2x), FundedNext Legacy flat $1,000 $4,761 (2.9x), MFF Pro flat $1,000 $3,899 (2.4x). It works only through near-instant rebuys, 1 to 6 evals per slot per month (TopStep 1.8, Legacy 2.8, MFF Pro 3.9), and TopStep, FundedNext, MFF, FTMO, Alpha and E8 all name that pattern as a violation or behavioral trigger. Verifier 5's own seed-42, 20,000-trial sweep counted 22 of 39 plans where flat $800 to $1,000 wins monthly net against every policy including percent-of-cushion.

**Objective conflict, flagged for Sadra.** This run ranks by monthly net, which departs from SKILL.md Hard Rule 8 (lifetime net) for the reasons in the metric table of `engine-results.md`. Under lifetime net, verifier 5 found percent-of-cushion wins on every eval-based plan tested once contract caps are enforced at 10pt (TopStep 20% cushion $10,791 vs flat $1,000 $4,684; Lucid Pro no-DLL 20% $9,305 vs flat $800 $3,861; Tradeify Select Flex 20% $8,062 vs flat $1,000 $4,571), but those percent rows carry the no-minimum-contract artifact (they report 0% bust). Hard Rules 5 and 8 need an explicit decision on which objective governs.

## Fixed inputs (every stage unless its row says otherwise)

| Input | Value | Source |
|---|---|---|
| Win rate / R:R | 40% / 1:2 (CLI defaults `--winrate 0.4 --rr 2`) | HIS NUMBERS |
| Trades per day | up to 4, stop once the day is green (CLI defaults `--tpd 4 --stop day-green`) | HIS NUMBERS, Hard Rules 3-4 |
| Eval sizing | each plan's own `FASTEST TO FUNDED` #1 ladder from Stage A (instant-funded plans have none) | Hard Rule 3 |
| Payout rule | withdraw everything allowed while leaving $2,000 above the floor (`--retain-cushion 2000`). Effective value is $2,000 on every plan: no modeled plan's floor exceeds it (TopStep's override is $0, FTMO's is $2,000) | Hard Rule 2 |
| Funded candidates | flat $150/200/250/300/400/500/600/800/1000; 5/7.5/10/15/20/25/30/40/50% of cushion | sweep grid |
| Trials / seeds | 100,000 per candidate. Seeds 42/1337/2024: Stage B horizons and the Stage C path-walk. Seeds 42/1337: Stage C commission, D, E. Seed 42 only: Stage B 15% idle run and Stage F | |
| Eval cap / attempts | `--eval-days 150`, `--max-attempts 1` (CLI defaults) | |
| Contract caps / commission / idle days | off / $0 / 0% (CLI defaults), each varied in its own stage | confirmed assumptions |
| Excluded from ranking | TopStep `pro-account` (not buyable: Risk-team call-up only, $0 fees make it look free), Lucid `maxx` (invite-only) | doc trees |

## Stages and exact commands

Plan sets: **all** = the 46 lines of `cli prop plans --variants`; **eval** = all minus the 4 instant-funded plans (tradeify lightning, lucid direct, topstep pro-account, fundednext fnl-003); **buyable** = all minus topstep pro-account and lucid maxx (44). TPT has no variant flag. Every job ran from the repo root, colors stripped with `sed 's/\x1b\[[0-9;]*m//g'`, 14 jobs in parallel via `xargs -L1 -P14`.

| Stage | Plans | Command (placeholders in angle brackets) | Jobs |
|---|---|---|---|
| A ladders | eval (42) | `bun run cli prop ladder --firm <f> --variant <v> --trials 20000 --top 5` (grid $100 to 40% of cushion, step $100, 4 rungs) | 42 |
| B base | all (46) | `bun run cli prop optimize funded --firm <f> --variant <v> --ladder <A fastest> --trials 100000 --seed <42,1337,2024> --funded-days <126,252,504> --sort monthly --idle-day-probability 0 --retain-cushion 2000 --flat 150,200,250,300,400,500,600,800,1000 --percent 5,7.5,10,15,20,25,30,40,50`, plus one run per plan at seed 42, 252 days, `--idle-day-probability 0.15` | 414 + 46 |
| C path-walk | apex intraday, tpt, lucid daily-eod / daily-eod-dll / daily-intraday / daily-intraday-dll, mffu rapid | B command at 252 days, seeds 42/1337/2024, plus `--path-granularity 10` | 21 |
| C commission | buyable (44) | B command at 252 days, seeds 42/1337, plus `--commission 10` | 88 |
| D contract caps | buyable (44) | B command at 252 days, seeds 42/1337, plus `--stop-points <10,20> --instrument NQ` | 176 |
| E payout size | buyable (44) | B command at 252 days, seeds 42/1337, plus `--request-size 500` ($1,000 for mffu pro and tradeify lightning, $800 for fundednext fnl-003, their minimums) | 88 |
| E live-trigger cap | 18 plans | B command at 252 days, seeds 42/1337, plus `--max-lifetime-payouts <N>`: tradeify (all 4) 3; lucid pro, pro-no-dll, flex, flex-dll, direct 5; alphafutures (all 3) 5; mffu pro 3; fundednext flex, rapid-pro, rapid-pro-dll-add-on, rapid-daily 3; fundednext legacy 5. Plus tradeify (all 4) at 2 | 36 + 8 |
| F win rate | topstep no-fee-consistency, no-fee-standard; ftmo-futures growth; lucid daily-eod, daily-intraday, direct, pro-no-dll; mffu rapid; tpt; tradeify lightning, growth; e8futures signature; apex intraday | B command at 252 days, seed 42, plus `--winrate <0.37,0.43>` | 26 |
| G DP | topstep no-fee-standard, ftmo-futures growth | `gtimeout 2400 bun run cli prop optimize dp --firm <f> --variant <v> --eval-days 15 --iterations 2 --trials 20000 --funded-days 252` | 2 |

Stage G plan choice: TopStep No-fee Standard (#2 at $250) instead of #1 No-fee Consistency because its funded side has no consistency rule, so the funded DP solves much faster; FTMO Growth (#3) because it had never been DP-solved. Started and aborted before Stage G: a 14-job queue (apex eod, tradeify growth, lucid pro, lucid pro-no-dll, mffu builder, fundednext rapid-pro, rapid-pro-dll-add-on, rapid-daily, alphafutures zero, e8futures signature at `--eval-days 30 --iterations 8`, 30-minute cap; topstep no-fee-consistency, topstep no-fee-standard, ftmo-futures growth, tradeify select-flex at `--eval-days 20 --iterations 3`). Stopped after 4 minutes: Tradeify Growth alone needs about 6 minutes per iteration, so every job would have hit its cap, and most of those plans were no longer contenders.

## Result 2: eval ladders (Stage A, 20,000 simulations per ladder)

| Plan | Fastest ladder | Pass | Days | $/funded | Min stop (pt) | Cheapest ladder | Pass | Days | $/funded |
|---|---|---|---|---|---|---|---|---|---|
| alphafutures advanced | 700/700/700/700 | 33.3% | 9.2 | $627 | 7.0 | 300/100/200/300 | 53.6% | 29.0 | $390 |
| alphafutures standard | 800/400/800/500 | 42.9% | 5.5 | $301 | 8.0 | 200/100/300/100 | 67.7% | 28.3 | $191 |
| alphafutures zero | 800/400/700 | 43.4% | 8.3 | $320 | 13.3 | 200/100/300/100 | 67.7% | 28.3 | $205 |
| apex eod | 800/700/600/600 | 41.9% | 8.2 | $1644 | 6.7 | 100/100/100/100 | 89.4% | 64.8 | $771 |
| apex intraday | 800/400/800/600 | 42.5% | 5.5 | $724 | 6.7 | 100/100/100/100 | 89.4% | 64.8 | $345 |
| e8futures signature | 800/400/800/600 | 43.0% | 5.4 | $373 | 10.0 | 100/100/100/100 | 90.8% | 64.6 | $176 |
| e8futures zero-max-100 | 600/600/600/600 | 32.1% | 8.4 | $868 | 7.5 | 100/100/100 | 75.3% | 76.4 | $370 |
| e8futures zero-max-80 | 600/600/600/600 | 32.1% | 8.4 | $666 | 7.5 | 100/100/100 | 75.3% | 76.4 | $284 |
| e8futures zero-starter-100 | 600/600/600/600 | 32.1% | 8.4 | $464 | 7.5 | 100/100/100 | 75.3% | 76.4 | $198 |
| e8futures zero-starter-80 | 600/600/600/600 | 32.1% | 8.4 | $361 | 7.5 | 100/100/100 | 75.3% | 76.4 | $154 |
| ftmo-futures growth | 500/800/800/600 | 43.2% | 6.4 | $275 | 8.0 | 200/100/300/100 | 67.7% | 28.3 | $176 |
| ftmo-futures pro | 800/900/200/800 | 23.4% | 7.3 | $594 | 9.0 | 300/100/200/200 | 82.7% | 24.7 | $168 |
| fundednext flex | 500/500/500/500 | 40.4% | 6.9 | $173 | 8.3 | 100/100/100 | 82.1% | 61.4 | $85 |
| fundednext legacy | 500/800/800/600 | 43.2% | 6.4 | $463 | 13.3 | 100/100/100/100 | 90.8% | 64.6 | $220 |
| fundednext rapid-daily | 800/400/700 | 43.1% | 8.4 | $395 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $188 |
| fundednext rapid-pro | 800/400/800/600 | 42.9% | 5.4 | $397 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $188 |
| fundednext rapid-pro-dll-add-on | 800/400/700 | 43.1% | 8.4 | $325 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $155 |
| lucid daily-eod | 800/400/800/500 | 42.8% | 5.5 | $432 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $204 |
| lucid daily-eod-dll | 800/700/800/700 | 43.1% | 7.3 | $383 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $182 |
| lucid daily-intraday | 800/400/800/500 | 42.8% | 5.5 | $364 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $172 |
| lucid daily-intraday-dll | 800/700/800/700 | 43.1% | 7.3 | $315 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $150 |
| lucid flex | 800/400/800/500 | 42.8% | 5.5 | $341 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $161 |
| lucid flex-dll | 800/700/800/700 | 43.1% | 7.3 | $315 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $150 |
| lucid maxx | 300/500/700/500 | 42.1% | 10.1 | $428 | - | 100/100/100/100 | 89.4% | 64.8 | $201 |
| lucid pro | 800/800/700/500 | 43.3% | 7.2 | $398 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $190 |
| lucid pro-no-dll | 800/400/800/600 | 42.9% | 5.4 | $448 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $212 |
| mffu builder | 800/400/700 | 43.1% | 8.4 | $355 | 10.0 | 100/100/100/100 | 90.6% | 64.6 | $169 |
| mffu pro | 800/400/800/500 | 42.8% | 5.5 | $619 | 13.3 | 100/100/100/100 | 90.6% | 64.6 | $293 |
| mffu rapid | 800/400/800/500 | 42.8% | 5.5 | $488 | 8.0 | 100/100/100/100 | 90.6% | 64.6 | $231 |
| mffu rapid-eod | 400/600/800/600 | 43.6% | 8.4 | $480 | 13.3 | 100/100/100/100 | 90.6% | 64.6 | $231 |
| topstep no-fee-consistency | 800/400/800/600 | 43.0% | 5.4 | $221 | 8.0 | 200/100/300/100 | 67.7% | 28.3 | $140 |
| topstep no-fee-consistency-dll | 800/400/700 | 43.4% | 8.3 | $196 | 8.0 | 200/100/300/100 | 67.7% | 28.3 | $126 |
| topstep no-fee-standard | 800/400/800/600 | 43.0% | 5.4 | $221 | 8.0 | 200/100/300/100 | 67.7% | 28.3 | $140 |
| topstep no-fee-standard-dll | 800/400/700 | 43.4% | 8.3 | $196 | 8.0 | 200/100/300/100 | 67.7% | 28.3 | $126 |
| topstep standard-consistency | 800/400/800/600 | 43.0% | 5.4 | $461 | 8.0 | 200/100/300/100 | 67.7% | 28.3 | $293 |
| topstep standard-consistency-dll | 800/400/700 | 43.4% | 8.3 | $456 | 8.0 | 200/100/300/100 | 67.7% | 28.3 | $293 |
| topstep standard-standard | 800/400/800/600 | 43.0% | 5.4 | $461 | 8.0 | 200/100/300/100 | 67.7% | 28.3 | $293 |
| topstep standard-standard-dll | 800/400/700 | 43.4% | 8.3 | $456 | 8.0 | 200/100/300/100 | 67.7% | 28.3 | $293 |
| tpt | 500/800/800/600 | 43.2% | 6.4 | $694 | 6.7 | 200/100/300/100 | 67.7% | 28.3 | $443 |
| tradeify growth | 800/400/800/500 | 43.5% | 7.3 | $334 | 10.0 | 100/100/100/100 | 89.4% | 64.8 | $162 |
| tradeify select-daily | 500/800/800/400 | 42.2% | 6.4 | $391 | 10.0 | 100/100/100/100 | 89.4% | 64.8 | $185 |
| tradeify select-flex | 500/800/800/400 | 42.2% | 6.4 | $391 | 10.0 | 100/100/100/100 | 89.4% | 64.8 | $185 |

## Result 3: base funded sweep, 1-year horizon, 3-seed mean

"Best percent" is shown for completeness only. Percent-of-cushion sizing has no one-micro minimum in the engine, so rows from 5% to 40% report 0% bust (FTMO Pro excepted, 19-23%), and without contract caps risk can compound without bound. The 50% rows bust on every plan through what verifier 4 traced to floating-point rounding (0.0% at 49%, 33.6% at 50%), and FundedNext Legacy 50% swings from $4,095 to $409,869 per month across seeds. Rank on flat policies.

| Plan | $250 $/mo (seed range) | $250 lifetime | $250 per-cycle | Best flat | Best flat $/mo | Best percent (unreliable) | $/mo |
|---|---|---|---|---|---|---|---|
| topstep pro-account (not buyable) | $2,260 ($2,258..$2,261) | $144,976 | $5,909 | flat $400 | $2,598 | 10% cushion | $1,151 |
| tradeify lightning | $2,079 ($2,077..$2,081) | $270,861 | $5,498 | flat $400 | $2,811 | 7.5% cushion | $1,043 |
| lucid direct | $1,920 ($1,919..$1,921) | $34,162 | $8,976 | flat $400 | $1,965 | 5% cushion | $746 |
| topstep no-fee-consistency | $1,919 ($1,916..$1,923) | $3,322 | $1,947 | flat $1000 | $4,291 | 15% cushion | $1,211 |
| topstep no-fee-standard | $1,913 ($1,910..$1,915) | $3,928 | $2,356 | flat $1000 | $3,033 | 15% cushion | $1,210 |
| ftmo-futures growth | $1,911 ($1,906..$1,919) | $3,244 | $1,925 | flat $800 | $2,909 | 15% cushion | $1,151 |
| topstep standard-consistency | $1,901 ($1,899..$1,906) | $3,326 | $1,929 | flat $1000 | $4,259 | 15% cushion | $1,207 |
| topstep standard-standard | $1,899 ($1,896..$1,901) | $3,930 | $2,338 | flat $1000 | $3,013 | 15% cushion | $1,207 |
| tradeify growth | $1,864 ($1,861..$1,870) | $3,708 | $2,189 | flat $500 | $3,185 | 10% cushion | $1,108 |
| tradeify select-flex | $1,862 ($1,857..$1,868) | $3,377 | $2,049 | flat $1000 | $3,465 | 15% cushion | $1,349 |
| lucid pro-no-dll | $1,852 ($1,847..$1,858) | $3,090 | $1,861 | flat $800 | $3,552 | 15% cushion | $1,032 |
| apex intraday | $1,835 ($1,833..$1,839) | $2,919 | $2,082 | flat $500 | $2,247 | 10% cushion | $1,206 |
| topstep no-fee-standard-dll | $1,835 ($1,832..$1,840) | $3,691 | $2,178 | flat $800 | $2,838 | 15% cushion | $1,306 |
| lucid daily-intraday | $1,819 ($1,815..$1,825) | $2,451 | $1,474 | flat $800 | $2,861 | 15% cushion | $927 |
| topstep no-fee-consistency-dll | $1,818 ($1,814..$1,825) | $3,297 | $1,940 | flat $800 | $2,965 | 15% cushion | $1,674 |
| topstep standard-standard-dll | $1,812 ($1,808..$1,817) | $3,670 | $2,151 | flat $800 | $2,799 | 15% cushion | $1,300 |
| lucid pro | $1,805 ($1,800..$1,811) | $3,150 | $1,885 | flat $800 | $3,369 | 15% cushion | $1,027 |
| topstep standard-consistency-dll | $1,793 ($1,788..$1,799) | $3,276 | $1,913 | flat $800 | $2,913 | 15% cushion | $1,669 |
| lucid daily-eod | $1,783 ($1,779..$1,789) | $2,379 | $1,445 | flat $800 | $2,710 | 15% cushion | $922 |
| lucid daily-intraday-dll | $1,764 ($1,760..$1,770) | $2,506 | $1,497 | flat $800 | $2,350 | 15% cushion | $925 |
| mffu rapid | $1,753 ($1,749..$1,760) | $2,319 | $1,421 | flat $800 | $2,586 | 15% cushion | $917 |
| tradeify select-daily | $1,741 ($1,736..$1,750) | $2,187 | $1,343 | flat $1000 | $2,443 | 15% cushion | $898 |
| lucid daily-eod-dll | $1,730 ($1,726..$1,736) | $2,434 | $1,468 | flat $800 | $2,239 | 15% cushion | $919 |
| mffu rapid-eod | $1,640 ($1,636..$1,648) | $2,389 | $1,446 | flat $800 | $2,002 | 15% cushion | $909 |
| mffu pro | $1,635 ($1,632..$1,640) | $3,635 | $2,243 | flat $1000 | $3,899 | 50% cushion | $2,485 |
| fundednext legacy | $1,630 ($1,626..$1,635) | $2,958 | $1,798 | flat $1000 | $4,761 | 50% cushion | $265,222 |
| lucid maxx (invite-only) | $1,572 ($1,566..$1,582) | $2,169 | $1,329 | flat $600 | $1,834 | 15% cushion | $862 |
| tpt | $1,478 ($1,472..$1,486) | $1,866 | $1,149 | flat $800 | $1,961 | 15% cushion | $772 |
| apex eod | $1,382 ($1,374..$1,391) | $1,924 | $1,513 | flat $300 | $1,421 | 10% cushion | $1,054 |
| fundednext flex | $1,201 ($1,199..$1,202) | $893 | $668 | flat $500 | $1,512 | 10% cushion | $611 |
| e8futures signature | $1,193 ($1,191..$1,195) | $1,226 | $950 | flat $400 | $1,420 | 10% cushion | $781 |
| fundednext rapid-pro | $1,174 ($1,171..$1,178) | $1,021 | $798 | flat $600 | $1,248 | 10% cushion | $574 |
| fundednext rapid-pro-dll-add-on | $1,115 ($1,112..$1,118) | $1,058 | $820 | flat $250 | $1,115 | 7.5% cushion | $565 |
| alphafutures standard | $1,000 ($999..$1,001) | $3,505 | $2,748 | flat $800 | $1,928 | 10% cushion | $1,146 |
| fundednext fnl-003 | $982 ($982..$983) | $5,151 | $2,430 | flat $400 | $1,062 | 5% cushion | $445 |
| alphafutures zero | $975 ($974..$976) | $3,468 | $2,724 | flat $400 | $1,283 | 7.5% cushion | $714 |
| mffu builder | $974 ($972..$976) | $818 | $641 | flat $500 | $1,352 | 15% cushion | $660 |
| alphafutures advanced | $910 ($910..$910) | $2,190 | $1,815 | flat $1000 | $3,277 | 15% cushion | $4,407 |
| fundednext rapid-daily | $789 ($785..$794) | $521 | $438 | flat $600 | $1,219 | 10% cushion | $502 |
| lucid flex | $732 ($730..$734) | $701 | $573 | flat $800 | $1,704 | 15% cushion | $559 |
| lucid flex-dll | $712 ($710..$714) | $720 | $585 | flat $800 | $1,306 | 15% cushion | $533 |
| e8futures zero-starter-100 | $450 ($445..$456) | $140 | $142 | flat $1000 | $1,067 | 15% cushion | $302 |
| e8futures zero-starter-80 | $370 ($366..$375) | $117 | $117 | flat $1000 | $872 | 15% cushion | $244 |
| ftmo-futures pro | $205 ($194..$219) | $3 | $34 | flat $200 | $1,590 | 7.5% cushion | $905 |
| e8futures zero-max-80 | $60 ($55..$65) | $-26 | $19 | flat $1000 | $811 | 50% cushion | $198 |
| e8futures zero-max-100 | $38 ($32..$45) | $-50 | $12 | flat $1000 | $943 | 50% cushion | $239 |

## Result 4: horizon robustness (monthly net per slot, 3-seed mean)

| Plan | $250 6mo | $250 1yr | $250 2yr | Best flat 6mo | Best flat 1yr | Best flat 2yr |
|---|---|---|---|---|---|---|
| topstep pro-account | $2,196 | $2,260 | $2,274 | $500 $2,662 | $400 $2,598 | $400 $2,534 |
| tradeify lightning | $1,964 | $2,079 | $2,095 | $400 $2,625 | $400 $2,811 | $400 $2,894 |
| lucid direct | $1,687 | $1,920 | $2,030 | $400 $1,827 | $400 $1,965 | $400 $2,038 |
| topstep no-fee-consistency | $1,857 | $1,919 | $1,923 | $1000 $3,975 | $1000 $4,291 | $1000 $4,526 |
| topstep no-fee-standard | $1,811 | $1,913 | $1,950 | $1000 $2,732 | $1000 $3,033 | $1000 $3,226 |
| ftmo-futures growth | $1,850 | $1,911 | $1,916 | $800 $2,688 | $800 $2,909 | $800 $3,071 |
| topstep standard-consistency | $1,839 | $1,901 | $1,906 | $1000 $3,927 | $1000 $4,259 | $1000 $4,506 |
| topstep standard-standard | $1,794 | $1,899 | $1,937 | $1000 $2,699 | $1000 $3,013 | $1000 $3,216 |
| tradeify growth | $1,771 | $1,864 | $1,875 | $500 $2,812 | $500 $3,185 | $500 $3,432 |
| tradeify select-flex | $1,767 | $1,862 | $1,875 | $1000 $3,023 | $1000 $3,465 | $1000 $3,766 |
| lucid pro-no-dll | $1,784 | $1,852 | $1,858 | $800 $3,242 | $800 $3,552 | $1000 $3,782 |
| apex intraday | $1,798 | $1,835 | $1,835 | $500 $2,247 | $500 $2,247 | $500 $2,247 |
| topstep no-fee-standard-dll | $1,743 | $1,835 | $1,849 | $800 $2,635 | $800 $2,838 | $800 $2,986 |
| lucid daily-intraday | $1,795 | $1,819 | $1,819 | $800 $2,861 | $800 $2,861 | $800 $2,861 |
| topstep no-fee-consistency-dll | $1,755 | $1,818 | $1,823 | $800 $2,824 | $800 $2,965 | $800 $2,988 |
| topstep standard-standard-dll | $1,717 | $1,812 | $1,827 | $800 $2,587 | $800 $2,799 | $800 $2,958 |
| lucid pro | $1,737 | $1,805 | $1,811 | $800 $2,984 | $800 $3,369 | $1000 $3,661 |
| topstep standard-consistency-dll | $1,728 | $1,793 | $1,798 | $800 $2,769 | $800 $2,913 | $800 $2,937 |
| lucid daily-eod | $1,759 | $1,783 | $1,783 | $800 $2,710 | $800 $2,710 | $800 $2,710 |
| lucid daily-intraday-dll | $1,740 | $1,764 | $1,764 | $800 $2,350 | $800 $2,350 | $800 $2,350 |
| mffu rapid | $1,728 | $1,753 | $1,754 | $800 $2,586 | $800 $2,586 | $800 $2,586 |
| tradeify select-daily | $1,725 | $1,741 | $1,742 | $800 $2,350 | $1000 $2,443 | $1000 $2,544 |
| lucid daily-eod-dll | $1,705 | $1,730 | $1,730 | $800 $2,239 | $800 $2,239 | $800 $2,239 |
| mffu rapid-eod | $1,616 | $1,640 | $1,641 | $800 $2,002 | $800 $2,002 | $800 $2,002 |
| mffu pro | $1,474 | $1,635 | $1,669 | $1000 $3,899 | $1000 $3,899 | $1000 $3,899 |
| fundednext legacy | $1,550 | $1,630 | $1,639 | $1000 $4,423 | $1000 $4,761 | $1000 $4,882 |
| lucid maxx | $1,554 | $1,572 | $1,572 | $600 $1,834 | $600 $1,834 | $600 $1,834 |
| tpt | $1,462 | $1,478 | $1,478 | $800 $1,961 | $800 $1,961 | $800 $1,961 |
| apex eod | $1,358 | $1,382 | $1,381 | $300 $1,417 | $300 $1,421 | $300 $1,421 |
| fundednext flex | $1,201 | $1,201 | $1,201 | $500 $1,512 | $500 $1,512 | $500 $1,512 |
| e8futures signature | $1,193 | $1,193 | $1,193 | $400 $1,419 | $400 $1,420 | $400 $1,420 |
| fundednext rapid-pro | $1,174 | $1,174 | $1,174 | $600 $1,248 | $600 $1,248 | $600 $1,248 |
| fundednext rapid-pro-dll-add-on | $1,115 | $1,115 | $1,115 | $250 $1,115 | $250 $1,115 | $250 $1,115 |
| alphafutures standard | $916 | $1,000 | $1,046 | $800 $1,865 | $800 $1,928 | $800 $1,948 |
| fundednext fnl-003 | $978 | $982 | $982 | $400 $1,062 | $400 $1,062 | $400 $1,061 |
| alphafutures zero | $874 | $975 | $1,032 | $400 $1,178 | $400 $1,283 | $400 $1,345 |
| mffu builder | $974 | $974 | $974 | $500 $1,352 | $500 $1,352 | $500 $1,352 |
| alphafutures advanced | $766 | $910 | $996 | $1000 $2,725 | $1000 $3,277 | $1000 $3,700 |
| fundednext rapid-daily | $789 | $789 | $789 | $600 $1,219 | $600 $1,219 | $600 $1,219 |
| lucid flex | $732 | $732 | $732 | $800 $1,704 | $800 $1,704 | $800 $1,704 |
| lucid flex-dll | $712 | $712 | $712 | $800 $1,306 | $800 $1,306 | $800 $1,306 |
| e8futures zero-starter-100 | $450 | $450 | $450 | $1000 $1,067 | $1000 $1,067 | $1000 $1,067 |
| e8futures zero-starter-80 | $370 | $370 | $370 | $1000 $872 | $1000 $872 | $1000 $872 |
| ftmo-futures pro | $205 | $205 | $205 | $200 $1,464 | $200 $1,590 | $200 $1,621 |
| e8futures zero-max-80 | $60 | $60 | $60 | $1000 $811 | $1000 $811 | $1000 $811 |
| e8futures zero-max-100 | $38 | $38 | $38 | $1000 $943 | $1000 $943 | $1000 $943 |

## Result 5: sensitivity matrix at flat $250 (monthly net per slot, 1-year horizon)

Seeds: base and path-walk 3; 15% idle and win rate 1; all others 2. `-` means the stage did not apply to that plan.

| Plan | base | 10pt cap | 20pt cap | path-walk | $10 comm | $500 req | live cap | live cap 2 | 15% idle | WR 37% | WR 43% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| tradeify lightning | $2,079 | $2,080 | $2,080 | - | $1,656 | $972 | $1,386 | $1,049 | $1,750 | $1,212 | $2,897 |
| lucid direct | $1,920 | $1,920 | $1,920 | - | $1,464 | $352 | $1,560 | - | $1,592 | $1,134 | $2,665 |
| topstep no-fee-consistency | $1,919 | $1,920 | $1,920 | - | $1,539 | $708 | - | - | $1,620 | $1,118 | $2,738 |
| topstep no-fee-standard | $1,913 | $1,912 | $1,912 | - | $1,530 | $742 | - | - | $1,609 | $1,116 | $2,682 |
| ftmo-futures growth | $1,911 | $1,914 | $1,914 | - | $1,490 | $1,030 | - | - | $1,615 | $1,082 | $2,763 |
| topstep standard-consistency | $1,901 | $1,902 | $1,902 | - | $1,520 | $702 | - | - | $1,605 | - | - |
| topstep standard-standard | $1,899 | $1,898 | $1,898 | - | $1,512 | $736 | - | - | $1,597 | - | - |
| tradeify growth | $1,864 | $1,866 | $1,866 | - | $1,458 | $558 | $1,118 | $786 | $1,570 | $1,002 | $2,739 |
| tradeify select-flex | $1,862 | $1,865 | $1,865 | - | $1,434 | $772 | $834 | $479 | $1,567 | - | - |
| lucid pro-no-dll | $1,852 | $1,854 | $1,854 | - | $1,442 | $724 | $1,308 | - | $1,563 | $963 | $2,736 |
| apex intraday | $1,835 | $1,836 | $1,836 | $1,697 | $1,436 | $418 | - | - | $1,558 | $971 | $2,617 |
| topstep no-fee-standard-dll | $1,835 | $1,836 | $1,836 | - | $1,408 | $730 | - | - | $1,546 | - | - |
| lucid daily-intraday | $1,819 | $1,820 | $1,820 | $1,720 | $1,421 | $1,787 | - | - | $1,537 | $986 | $2,687 |
| topstep no-fee-consistency-dll | $1,818 | $1,820 | $1,820 | - | $1,412 | $696 | - | - | $1,535 | - | - |
| topstep standard-standard-dll | $1,812 | $1,814 | $1,814 | - | $1,383 | $720 | - | - | $1,526 | - | - |
| lucid pro | $1,805 | $1,807 | $1,807 | - | $1,386 | $722 | $1,266 | - | $1,524 | - | - |
| topstep standard-consistency-dll | $1,793 | $1,795 | $1,795 | - | $1,386 | $687 | - | - | $1,513 | - | - |
| lucid daily-eod | $1,783 | $1,784 | $1,784 | $1,754 | $1,382 | $1,769 | - | - | $1,507 | $931 | $2,665 |
| lucid daily-intraday-dll | $1,764 | $1,765 | $1,765 | $1,672 | $1,366 | $1,760 | - | - | $1,489 | - | - |
| mffu rapid | $1,753 | $1,754 | $1,754 | $1,723 | $1,349 | $1,754 | - | - | $1,481 | $885 | $2,647 |
| tradeify select-daily | $1,741 | $1,743 | $1,743 | - | $1,342 | $1,744 | $312 | $112 | $1,473 | - | - |
| lucid daily-eod-dll | $1,730 | $1,731 | $1,731 | $1,699 | $1,329 | $1,742 | - | - | $1,460 | - | - |
| mffu rapid-eod | $1,640 | $1,608 | $1,642 | - | $1,233 | $1,696 | - | - | $1,383 | - | - |
| mffu pro | $1,635 | $1,556 | $1,637 | - | $1,226 | $739 | $1,046 | - | $1,371 | - | - |
| fundednext legacy | $1,630 | $1,566 | $1,632 | - | $1,242 | $694 | $1,048 | - | $1,374 | - | - |
| tpt | $1,478 | $1,479 | $1,479 | $1,449 | $1,110 | $1,479 | - | - | $1,249 | $717 | $2,278 |
| apex eod | $1,382 | $1,382 | $1,382 | - | $952 | $66 | - | - | $1,168 | - | - |
| fundednext flex | $1,201 | $1,200 | $1,200 | - | $922 | $564 | $868 | - | $1,019 | - | - |
| e8futures signature | $1,193 | $1,194 | $1,194 | - | $948 | $314 | - | - | $1,009 | $665 | $1,682 |
| fundednext rapid-pro | $1,174 | $1,174 | $1,174 | - | $896 | $444 | $804 | - | $996 | - | - |
| fundednext rapid-pro-dll-add-on | $1,115 | $1,115 | $1,115 | - | $831 | $446 | $769 | - | $944 | - | - |
| alphafutures standard | $1,000 | $1,000 | $1,000 | - | $784 | $608 | $670 | - | $834 | - | - |
| fundednext fnl-003 | $982 | $982 | $982 | - | $802 | $658 | - | - | $832 | - | - |
| alphafutures zero | $975 | $926 | $975 | - | $756 | $592 | $606 | - | $810 | - | - |
| mffu builder | $974 | $974 | $974 | - | $782 | $416 | - | - | $828 | - | - |
| alphafutures advanced | $910 | $910 | $910 | - | $695 | $570 | $337 | - | $749 | - | - |
| fundednext rapid-daily | $789 | $786 | $786 | - | $724 | $618 | $489 | - | $671 | - | - |
| lucid flex | $732 | $732 | $732 | - | $574 | $456 | $732 | - | $622 | - | - |
| lucid flex-dll | $712 | $712 | $712 | - | $554 | $448 | $712 | - | $601 | - | - |
| e8futures zero-starter-100 | $450 | $453 | $453 | - | $139 | $453 | - | - | $380 | - | - |
| e8futures zero-starter-80 | $370 | $372 | $372 | - | $122 | $372 | - | - | $313 | - | - |
| ftmo-futures pro | $205 | $210 | $210 | - | $68 | $-366 | - | - | $175 | - | - |
| e8futures zero-max-80 | $60 | $62 | $62 | - | $-222 | $62 | - | - | $49 | - | - |
| e8futures zero-max-100 | $38 | $42 | $42 | - | $-318 | $42 | - | - | $30 | - | - |

## Result 6: sensitivity matrix, best flat policy under each scenario

| Plan | base | 10pt cap | 20pt cap | path-walk | $10 comm | $500 req | live cap | live cap 2 | 15% idle | WR 37% | WR 43% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| tradeify lightning | $400 $2,811 | $400 $2,811 | $400 $2,811 | - | $500 $2,463 | $300 $1,111 | $400 $1,768 | $400 $1,448 | $400 $2,356 | $400 $1,739 | $400 $3,862 |
| lucid direct | $400 $1,965 | $400 $1,964 | $400 $1,964 | - | $500 $1,652 | $250 $352 | $400 $1,748 | - | $400 $1,647 | $400 $1,189 | $400 $2,734 |
| topstep no-fee-consistency | $1000 $4,291 | $1000 $3,996 | $1000 $4,275 | - | $1000 $3,658 | $500 $722 | - | - | $1000 $3,566 | $1000 $2,516 | $1000 $6,154 |
| topstep no-fee-standard | $1000 $3,033 | $1000 $2,885 | $1000 $3,030 | - | $1000 $2,833 | $500 $819 | - | - | $1000 $2,517 | $1000 $1,885 | $1000 $3,977 |
| ftmo-futures growth | $800 $2,909 | $800 $2,726 | $800 $2,905 | - | $800 $2,616 | $250 $1,030 | - | - | $800 $2,418 | $800 $1,724 | $800 $4,085 |
| topstep standard-consistency | $1000 $4,259 | $1000 $3,971 | $1000 $4,247 | - | $1000 $3,632 | $500 $711 | - | - | $1000 $3,535 | - | - |
| topstep standard-standard | $1000 $3,013 | $1000 $2,864 | $1000 $3,011 | - | $1000 $2,814 | $500 $808 | - | - | $1000 $2,498 | - | - |
| tradeify growth | $500 $3,185 | $500 $3,190 | $500 $3,190 | - | $500 $2,786 | $300 $559 | $400 $1,442 | $400 $970 | $500 $2,624 | $500 $1,667 | $500 $4,588 |
| tradeify select-flex | $1000 $3,465 | $800 $3,172 | $1000 $3,448 | - | $1000 $3,230 | $500 $824 | $600 $1,685 | $600 $1,290 | $1000 $2,866 | - | - |
| lucid pro-no-dll | $800 $3,552 | $800 $3,552 | $800 $3,552 | - | $800 $2,977 | $300 $726 | $500 $2,382 | - | $800 $2,953 | $800 $1,900 | $800 $5,176 |
| apex intraday | $500 $2,247 | $400 $2,220 | $500 $2,248 | $400 $1,886 | $600 $1,968 | $250 $418 | - | - | $500 $1,905 | $600 $1,114 | $500 $3,377 |
| topstep no-fee-standard-dll | $800 $2,838 | $800 $2,652 | $800 $2,834 | - | $800 $2,489 | $300 $737 | - | - | $800 $2,363 | - | - |
| lucid daily-intraday | $800 $2,861 | $800 $2,858 | $800 $2,858 | $500 $2,082 | $1000 $2,538 | $500 $2,597 | - | - | $800 $2,433 | $1000 $1,722 | $800 $4,273 |
| topstep no-fee-consistency-dll | $800 $2,965 | $800 $2,838 | $800 $2,964 | - | $1000 $2,607 | $250 $696 | - | - | $800 $2,513 | - | - |
| topstep standard-standard-dll | $800 $2,799 | $800 $2,620 | $800 $2,795 | - | $800 $2,449 | $300 $726 | - | - | $800 $2,328 | - | - |
| lucid pro | $800 $3,369 | $800 $3,370 | $800 $3,370 | - | $800 $2,778 | $300 $724 | $800 $2,064 | - | $800 $2,768 | - | - |
| topstep standard-consistency-dll | $800 $2,913 | $800 $2,800 | $800 $2,912 | - | $1000 $2,558 | $250 $687 | - | - | $800 $2,469 | - | - |
| lucid daily-eod | $800 $2,710 | $800 $2,708 | $800 $2,708 | $500 $2,199 | $1000 $2,370 | $500 $2,570 | - | - | $800 $2,306 | $1000 $1,532 | $800 $4,143 |
| lucid daily-intraday-dll | $800 $2,350 | $800 $2,350 | $800 $2,350 | $400 $1,805 | $800 $2,030 | $500 $1,914 | - | - | $800 $2,007 | - | - |
| mffu rapid | $800 $2,586 | $800 $2,584 | $800 $2,584 | $500 $2,100 | $800 $2,241 | $500 $2,548 | - | - | $800 $2,200 | $1000 $1,374 | $800 $4,035 |
| tradeify select-daily | $1000 $2,443 | $800 $2,161 | $1000 $2,476 | - | $1000 $2,280 | $400 $2,184 | $800 $1,009 | $800 $570 | $1000 $2,061 | - | - |
| lucid daily-eod-dll | $800 $2,239 | $800 $2,239 | $800 $2,239 | $400 $1,869 | $800 $1,921 | $500 $1,892 | - | - | $800 $1,913 | - | - |
| mffu rapid-eod | $800 $2,002 | $600 $1,876 | $800 $1,999 | - | $800 $1,660 | $500 $2,420 | - | - | $800 $1,694 | - | - |
| mffu pro | $1000 $3,899 | $1000 $3,050 | $1000 $3,907 | - | $1000 $3,490 | $250 $739 | $1000 $3,740 | - | $1000 $3,313 | - | - |
| fundednext legacy | $1000 $4,761 | $1000 $4,200 | $1000 $4,767 | - | $1000 $4,310 | $500 $707 | $1000 $2,980 | - | $1000 $3,945 | - | - |
| tpt | $800 $1,961 | $800 $1,958 | $800 $1,958 | $500 $1,645 | $800 $1,748 | $500 $2,194 | - | - | $800 $1,666 | $800 $1,000 | $800 $3,128 |
| apex eod | $300 $1,421 | $300 $1,420 | $300 $1,420 | - | $400 $1,004 | $150 $167 | - | - | $300 $1,199 | - | - |
| fundednext flex | $500 $1,512 | $500 $1,514 | $500 $1,514 | - | $500 $1,265 | $250 $564 | $500 $1,208 | - | $500 $1,281 | - | - |
| e8futures signature | $400 $1,420 | $400 $1,418 | $400 $1,418 | - | $400 $1,218 | $250 $314 | - | - | $400 $1,204 | $400 $774 | $400 $2,039 |
| fundednext rapid-pro | $600 $1,248 | $600 $1,252 | $600 $1,252 | - | $500 $1,056 | $250 $444 | $600 $923 | - | $600 $1,063 | - | - |
| fundednext rapid-pro-dll-add-on | $250 $1,115 | $250 $1,115 | $250 $1,115 | - | $250 $831 | $250 $446 | $250 $769 | - | $250 $944 | - | - |
| alphafutures standard | $800 $1,928 | $800 $1,830 | $800 $1,926 | - | $800 $1,741 | $250 $608 | $800 $1,734 | - | $800 $1,623 | - | - |
| fundednext fnl-003 | $400 $1,062 | $400 $1,062 | $400 $1,062 | - | $500 $911 | $300 $690 | - | - | $400 $901 | - | - |
| alphafutures zero | $400 $1,283 | $400 $1,194 | $400 $1,282 | - | $500 $1,136 | $250 $592 | $600 $943 | - | $400 $1,072 | - | - |
| mffu builder | $500 $1,352 | $500 $1,353 | $500 $1,353 | - | $500 $1,118 | $200 $416 | - | - | $500 $1,147 | - | - |
| alphafutures advanced | $1000 $3,277 | $1000 $3,268 | $1000 $3,268 | - | $1000 $3,024 | $400 $588 | $1000 $1,655 | - | $1000 $2,641 | - | - |
| fundednext rapid-daily | $600 $1,219 | $600 $1,222 | $600 $1,222 | - | $600 $1,054 | $250 $618 | $600 $798 | - | $600 $1,038 | - | - |
| lucid flex | $800 $1,704 | $800 $1,600 | $800 $1,700 | - | $800 $1,519 | $300 $456 | $800 $1,700 | - | $800 $1,444 | - | - |
| lucid flex-dll | $800 $1,306 | $800 $1,264 | $800 $1,308 | - | $800 $1,161 | $250 $448 | $800 $1,308 | - | $800 $1,108 | - | - |
| e8futures zero-starter-100 | $1000 $1,067 | $600 $992 | $500 $1,036 | - | $1000 $613 | $500 $484 | - | - | $1000 $903 | - | - |
| e8futures zero-starter-80 | $1000 $872 | $600 $810 | $500 $845 | - | $1000 $510 | $500 $403 | - | - | $1000 $739 | - | - |
| ftmo-futures pro | $200 $1,590 | $200 $1,592 | $200 $1,592 | - | $200 $1,156 | $200 $866 | - | - | $200 $1,334 | - | - |
| e8futures zero-max-80 | $1000 $811 | $1000 $590 | $1000 $588 | - | $1000 $332 | $250 $62 | - | - | $1000 $690 | - | - |
| e8futures zero-max-100 | $1000 $943 | $1000 $676 | $1000 $666 | - | $1000 $346 | $250 $42 | - | - | $1000 $803 | - | - |

**How to read Results 5-6:**
- **Contract caps:** 20pt changes nothing at $250 except small gains on E8 Zero MAX (+4% to +8%) and FTMO Pro (+3%). 10pt cuts MFF Pro (-4.9%), Alpha Zero (-5.0%), FundedNext Legacy (-4.0%) and MFF Rapid EOD (-2.0%) at $250. For flat $1,000 the caps cut up to 22% (MFF Pro at 10pt) and 27-29% (E8 Zero MAX at either width), but they also raise flat $1,000 on Apex EOD (+64%), Alpha Zero (+41%) and E8 Signature (+37%) at 10pt, because the engine silently shrinks an unplaceable size instead of rejecting it. The best flat policy changes on 6 plans at 10pt and 2 at 20pt.
- **Intraday path-walk:** costs 1.6% to 7.6% at $250, 16% to 27% on the best flat policy, and up to 32% at the same flat $800/$1,000 policy (Lucid Daily Intraday, Apex Intraday).
- **$10 commission per trade:** 18% to 25% on most plans, 8% on FundedNext Rapid Daily, 31% on Apex EOD, 67-69% on FTMO Pro and E8 Zero Starter; E8 Zero MAX turns negative. Uniform $10 is an approximation (about 1 NQ mini plus 3 MNQ at $250 risk); real rates differ by firm, see Adjustments.
- **15% idle days:** -14.5% to -21.7%, no inactivity-rule bite at this rate.
- **Win rate:** every plan moves -41% to -52% at 37% and +39% to +54% at 43% (1 seed). #1 Tradeify Lightning holds; at 43% FTMO Growth rises to #2 and Tradeify Growth to #3, and Lucid Direct drops from #2 to #9.
- **$500 requests:** mostly a model artifact. Small requests leave balance in the account, which the engine discards at the horizon, and plans with per-cycle payout gates waste payout windows. Daily-payout plans (Lucid Daily, MFF Rapid, TPT) come out equal to base.

## Result 7: realistic view used for the answer table

| Plan | Fastest ladder | $250 base | $250 realistic | Basis | Best flat, realistic | $250 + $10 commission |
|---|---|---|---|---|---|---|
| topstep no-fee-consistency | 800/400/800/600 | $1,919 | $1,919 | base | $1000 $4,291 | $1,539 |
| topstep no-fee-standard | 800/400/800/600 | $1,913 | $1,913 | base | $1000 $3,033 | $1,530 |
| ftmo-futures growth | 500/800/800/600 | $1,911 | $1,911 | base | $800 $2,909 | $1,490 |
| topstep standard-consistency | 800/400/800/600 | $1,901 | $1,901 | base | $1000 $4,259 | $1,520 |
| topstep standard-standard | 800/400/800/600 | $1,899 | $1,899 | base | $1000 $3,013 | $1,512 |
| topstep no-fee-standard-dll | 800/400/700 | $1,835 | $1,835 | base | $800 $2,838 | $1,408 |
| topstep no-fee-consistency-dll | 800/400/700 | $1,818 | $1,818 | base | $800 $2,965 | $1,412 |
| topstep standard-standard-dll | 800/400/700 | $1,812 | $1,812 | base | $800 $2,799 | $1,383 |
| topstep standard-consistency-dll | 800/400/700 | $1,793 | $1,793 | base | $800 $2,913 | $1,386 |
| lucid daily-eod | 800/400/800/500 | $1,783 | $1,754 | intraday path-walk | $500 $2,199 | $1,382 |
| mffu rapid | 800/400/800/500 | $1,753 | $1,723 | intraday path-walk | $500 $2,100 | $1,349 |
| lucid daily-intraday | 800/400/800/500 | $1,819 | $1,720 | intraday path-walk | $500 $2,082 | $1,421 |
| lucid daily-eod-dll | 800/700/800/700 | $1,730 | $1,699 | intraday path-walk | $400 $1,869 | $1,329 |
| apex intraday | 800/400/800/600 | $1,835 | $1,697 | intraday path-walk | $400 $1,886 | $1,436 |
| lucid daily-intraday-dll | 800/700/800/700 | $1,764 | $1,672 | intraday path-walk | $400 $1,805 | $1,366 |
| mffu rapid-eod | 400/600/800/600 | $1,640 | $1,640 | base | $800 $2,002 | $1,233 |
| lucid direct | instant | $1,920 | $1,560 | live-trigger cap | $400 $1,748 | $1,464 |
| tpt | 500/800/800/600 | $1,478 | $1,449 | intraday path-walk | $500 $1,645 | $1,110 |
| tradeify lightning | instant | $2,079 | $1,386 | live-trigger cap | $400 $1,768 | $1,656 |
| apex eod | 800/700/600/600 | $1,382 | $1,382 | base | $300 $1,421 | $952 |
| lucid pro-no-dll | 800/400/800/600 | $1,852 | $1,308 | live-trigger cap | $500 $2,382 | $1,442 |
| lucid pro | 800/800/700/500 | $1,805 | $1,266 | live-trigger cap | $800 $2,064 | $1,386 |
| e8futures signature | 800/400/800/600 | $1,193 | $1,193 | base | $400 $1,420 | $948 |
| tradeify growth | 800/400/800/500 | $1,864 | $1,118 | live-trigger cap | $400 $1,442 | $1,458 |
| fundednext legacy | 500/800/800/600 | $1,630 | $1,048 | live-trigger cap | $1000 $2,980 | $1,242 |
| mffu pro | 800/400/800/500 | $1,635 | $1,046 | live-trigger cap | $1000 $3,740 | $1,226 |
| fundednext fnl-003 | instant | $982 | $982 | base | $400 $1,062 | $802 |
| mffu builder | 800/400/700 | $974 | $974 | base | $500 $1,352 | $782 |
| fundednext flex | 500/500/500/500 | $1,201 | $868 | live-trigger cap | $500 $1,208 | $922 |
| tradeify select-flex | 500/800/800/400 | $1,862 | $834 | live-trigger cap | $600 $1,685 | $1,434 |
| fundednext rapid-pro | 800/400/800/600 | $1,174 | $804 | live-trigger cap | $600 $923 | $896 |
| fundednext rapid-pro-dll-add-on | 800/400/700 | $1,115 | $769 | live-trigger cap | $250 $769 | $831 |
| lucid flex | 800/400/800/500 | $732 | $732 | live-trigger cap | $800 $1,700 | $574 |
| lucid flex-dll | 800/700/800/700 | $712 | $712 | live-trigger cap | $800 $1,308 | $554 |
| alphafutures standard | 800/400/800/500 | $1,000 | $670 | live-trigger cap | $800 $1,734 | $784 |
| alphafutures zero | 800/400/700 | $975 | $606 | live-trigger cap | $600 $943 | $756 |
| fundednext rapid-daily | 800/400/700 | $789 | $489 | live-trigger cap | $600 $798 | $724 |
| e8futures zero-starter-100 | 600/600/600/600 | $450 | $450 | base | $1000 $1,067 | $139 |
| e8futures zero-starter-80 | 600/600/600/600 | $370 | $370 | base | $1000 $872 | $122 |
| alphafutures advanced | 700/700/700/700 | $910 | $337 | live-trigger cap | $1000 $1,655 | $695 |
| tradeify select-daily | 500/800/800/400 | $1,741 | $312 | live-trigger cap | $800 $1,009 | $1,342 |
| ftmo-futures pro | 800/900/200/800 | $205 | $205 | base | $200 $1,590 | $68 |
| e8futures zero-max-80 | 600/600/600/600 | $60 | $60 | base | $1000 $811 | $-222 |
| e8futures zero-max-100 | 600/600/600/600 | $38 | $38 | base | $1000 $943 | $-318 |

## Result 8: dynamic programming (Stage G)

| Plan | Eval days | Iterations | Solve time | States | DP-predicted funded value | Empirical pass | Empirical funded bust | Empirical cycle net | Empirical lifetime | Empirical $/mo per slot | Day-1 eval risk | Day-1 funded risk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ftmo-futures growth | 15 | 2 | 117.6s | 119565 | $20802 | 29.8% | 37.0% | $1880 | $2915 | $377 | $200 / $300 / $200 / $300 | $200 / $0 / $0 / $0 |
| topstep no-fee-standard | 15 | 2 | 346.9s | 718750 | $10424 | 24.7% | 43.1% | $795 | $1325 | $203 | $200 / $300 / $200 / $300 | $600 / $0 / $0 / $0 |

Both DP policies lose to flat $250 by 5x to 9x on monthly net. The DP maximizes a time-free value (the same problem as lifetime net), so it sizes the eval down to $200/$300, passes only 25-30% within the 15-day eval cap, and extracts slowly. Do not use `optimize dp` for a speed or monthly-cash question in its current form. The "empirical pass" figure uses clean passes only (see artifacts).

## Adjustments that did not come from the engine

- **Netherlands eligibility** (doc trees read 2026-09-22): TopStep Combine/XFA and FTMO Futures are eligible per the docs. E8 Futures: NL is not on the 88-country restricted list but never stated as accepted; the product-restriction list and payout-processor eligibility are unverified. Apex, MFF, TPT, Tradeify, FundedNext, Lucid, Alpha: UNSTATED, their trees do not reproduce the country lists (Lucid additionally has the US-only Terms of Use wording). Check the live restricted-country page before buying.
- **Round-trip commission per contract** (doc trees): Lucid $3.50 mini / $1.00 micro; Apex NQ $3.10 (Tradovate) to $3.98 (Rithmic); TPT $4.50 / $1.50; MFF $4.68 / $1.90; Tradeify and E8 $5.76 / $1.82-1.90; FTMO $1.00 / $0.40 plus unstated exchange and NFA fees; TopStep sim, FundedNext and Alpha unstated.
- **Behavioral clauses against size-up-and-rebuy:** TopStep FTP Slowdown ("activating and losing many XFAs in a short period") and RTP ("multiple accounts hitting the Maximum Loss Limit in one day", "max-positioning"); FundedNext "Account Flipping", "Account Rolling" and the Disciplined Trader Program ("Breaching multiple accounts within a short period"); MFF T&C 12.4 position-size consistency; FTMO "Inconsistent position sizing" and "Evaluation vs. Sim-Funded Mismatch"; Alpha "maintain the same level of risk", "Account Rolling/Stacking"; E8 "All-or-Nothing Trading". Lucid and Tradeify state the fewest (Tradeify explicitly allows martingale).
- **Operational rules the engine does not model** (can force an exit at neither TP nor SL): daily forced-flat times (Apex 4:59 PM ET, TopStep 3:10 PM CT, FundedNext 3:10 PM CT, E8 15:10 CT, MFF 4:10 PM ET, FTMO 4:10 PM ET, Alpha 4:20 PM ET, Tradeify and Lucid 4:45 PM ET, TPT 4:55 PM ET); news windows (MFF flat 2 minutes around every data release; TPT 1 minute around FOMC, NFP and CPI; Lucid Daily 1 minute around every red-folder USD release, as a hard breach; Alpha 2 minutes around red-folder news; TopStep no new mini positions for 5 minutes either side of CPI); payout processing from same-day (MFF, E8) to about 14 business days (Alpha, TopStep wire).

## Adversarial verification outcomes

Five skeptic agents each tried to refute one claim using the engine source, the doc trees and their own CLI runs (up to 20,000 trials). Their raw CLI output was not kept; the figures below are theirs.

1. **"TopStep is the top buyable plan": refuted, high confidence.** At $250 the instant-funded Tradeify Lightning ($2,082) beats TopStep ($1,915) and Lucid Direct ties it; at engine-optimal sizing FundedNext Legacy flat $1,000 ($4,696) beats TopStep's best ($4,299). The engine models TopStep correctly against its docs. TopStep leads again only once the live-trigger cap is applied, which the answer table does.
2. **"FTMO, Tradeify, Lucid Pro tie TopStep at $250": partly refuted.** 12 seeds x 20,000 trials: FTMO $1,909 and TopStep No-fee $1,910 tie; Tradeify Growth $1,861, Select Flex $1,858, Lucid Pro no-DLL $1,849 are 8 to 10 standard errors lower. No engine/doc mismatch moves any of them more than about 1%. About 46-47% of funded Tradeify accounts reach 3 payouts, so the live trigger is the real differentiator.
3. **"Lifetime net cannot rank plans": confirmed, high confidence,** with the corrections now in the metric table of `engine-results.md` (divergence only when nearly every attempt reaches funded; the fee is charged twice, so the right extra charge is zero, not fees / pass rate).
4. **"Percent-of-cushion outliers are artifacts": confirmed for FundedNext Legacy and MFF Pro, refuted for Alpha Advanced at realistic stop widths.** Legacy 50% cushion averages $654,911/mo uncapped but $2,568/mo at a 20pt cap; MFF Pro 50% lifetime falls from $8,602 to $2,767. Alpha Advanced 15% is not inflated at 40-100pt stops, but is overstated by the unmodeled 70/80/90% split and the live call after 5 payouts (about $499/mo with a 5-payout cap).
5. **"Aggressive flat sizing wins everywhere": refuted.** Under the withdraw-everything-above-$2k rule even $250 busts about 99% of funded accounts within a year (TopStep: 37 survivors in 20,000), so bust-and-rebuy comes from the payout rule; aggressive sizing roughly doubles its frequency and halves payouts per account (TopStep 4.6 to 2.2).

## Engine artifacts and doc/engine mismatches (open, not fixed)

| Where | Problem | Direction | Found by |
|---|---|---|---|
| `core/LifetimeExtraction.ts` | time-free; diverges when nearly every attempt reaches funded; renews only on a funded bust; fee charged twice | makes bust-prone policies look huge | verifier 3 |
| `DayPolicy.ts` `resolveFundedTradeRisk`, `PositionSizing.ts` `capRiskToContractLimit` | percent-of-cushion risk has no one-micro minimum (5-40% never bust) and no cap without `--stop-points`; caps shrink an unplaceable size silently instead of rejecting it; 0% bust at 49% vs 33.6% at 50% looks like floating-point rounding | percent rows unreliable either way; "flat $1,000" under caps is really a smaller size | verifiers 4, 5 |
| `simulator/engine.ts` | `cli prop sim` pass rate and cost per funded count clean passes only (TopStep flat $1,000 shows "pass rate 3.1%"; MFF Pro "$∞") | display only | verifier 5 |
| `optimize funded` | "bust when funded" column is unconditional | label misleading | verifier 3 |
| simulator | `maxFundedAccounts` is never read; no activation, review or rebuy delay exists anywhere | monthly net optimistic for high-churn policies | verifiers 2, 3, 5 |
| Alpha Futures | engine pays a flat 90%, the signed agreement pays 70/80/90% by payout number; Advanced funded drawdown $1,750 in the engine vs $2,000 in docs; live call after 5 payouts unmodeled | overstated overall | doc readers, verifier 4 |
| MFF Pro | forced live after 3 consecutive payouts unmodeled | overstated ($1,635 to $1,046 with the cap) | doc readers |
| Tradeify (all), Lucid Pro/Pro-no-DLL/Direct, FundedNext (all) | payout-count live triggers unmodeled. Lucid Flex and FundedNext Flex/Rapid already conclude after 5 payouts in the engine, so a cap of 5 changes nothing for Lucid Flex | overstated (Stage E) | doc readers |
| E8 Zero | 5-payout lifetime cap may be missing | possibly overstated | doc readers |
| FundedNext Rapid Pro/Daily | eval/reset fees about $20 too high vs the resolved docs | understated | doc readers |
| Intraday-trailing funded plans | unrealized-peak ratchet only with `--path-granularity` | default overstated 1.6-7.6% at $250, up to 32% at large sizes | Stage C |

## Process notes (so the next sweep avoids them)

- A waiter using `pgrep -f "<pattern>"` matches its own command line; use a bracket pattern (for example `run_fund[e]d`) or count finished output files instead.
- macOS `awk` cannot emit `\0`, so NUL-delimited `xargs -0` job lists break; use one job per line with `xargs -L1` and a placeholder for TPT's empty variant.
- An output file holding only its first line is not a failed run until its process has exited (the MFF Rapid path-walk looked empty mid-run and was complete later).
- Run Stage A into the same output directory before any funded stage; a funded job without its ladder silently falls back to flat eval risk (the CLI's `--ladder` default), which is not comparable.
- Never read the top row of a mixed flat/percent table as the winner; percent rows can be artifacts (Legacy 50% cushion).
- Keep instant-funded plans in the same monthly comparison; leaving them out made TopStep look like a clear #1 until verification caught it.
- `optimize dp` on a plan with an eval consistency rule is single-threaded; time one iteration before queuing many plans.
