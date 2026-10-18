# Payout-size re-measure on the final engine (PT-116, F-152, tools-U22)

**Question:** under the documented policy (FullRequestOnly, the rulebook's $500 request), how does the documented request compare with the engine's own payout-size optimum, plan by plan, on the engine as of 2026-10-14? This is the fresh re-measure F-152's acceptance asks for. The only $500 column on record before it was the audit's `$500 req` under `UpToRequest` (post-fix rerun Result 8), measured before G2 and not under the documented policy.

**Engine state:** commit `c770d5fac28ed896f56258934b0a590e8c2f768c`, clean tree for `src` at start and end (`git status --porcelain -- src` empty); `git ls-files -s src | shasum -a 256` = `a6250bfc7519df3c303d70b5d5a12f3c136df9ec4df0a5ed8d46f4266e884226` at start and end (unchanged).

**Run:** 2026-10-14, about 22:55 to 23:20 CEST, on the Mac, one job at a time.

## Inputs

| Input                   | Value                                                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command                 | `bun run cli prop advise --firm <f> [--variant <v>] --stage funded --balance 50000 --highest-eod 50000 [--highest-intraday 50000] --payouts 0 --trading-days 0 --json` (`--highest-intraday` only on the 7 intraday-trailing plans, which require it) |
| Start                   | a fresh funded account at its $50K start balance (start basis `fresh`)                                                                                                                                                                                |
| Policy                  | the default rulebook: documented funded sizing, retained cushion $2,000, payout request $500, FullRequestOnly                                                                                                                                         |
| Sweep                   | the engine's payout-size sweep (`PayoutSizeSweep.ts`, request sizes 500, 750, 1000, 1500, 2000, 3000, 6000; a size below the firm minimum is collapsed into the minimum, read from each row's `requestedSizes`)                                       |
| Trials / seed / horizon | 4,000 trials, seed 42, 252-day funded horizon (from the JSON)                                                                                                                                                                                         |
| Plans                   | the 44 buyable plans (`prop plans --variants` minus topstep pro-account and lucid maxx)                                                                                                                                                               |
| Objective               | credit-inclusive monthly net (the sweep's own objective); the credit-free figure is shown beside it                                                                                                                                                   |

## Result: documented $500 against the engine optimum

The documented columns of the 18 plans with a funded consistency rule are superseded by [`2026-10-15-consistency-ceiling-remeasure.md`](2026-10-15-consistency-ceiling-remeasure.md): from commit `6bebe90e` the documented simulation caps each funded day at the consistency ceiling (PT-119). Their optimum requests did not change.

Monthly net with its standard error; "ex-credit" is the credit-free monthly net. "Effective" is the size the documented $500 request settles at (the firm minimum where it is above $500). "Gap" is optimum minus documented, credit-inclusive.

| Plan                             | Effective | Documented, monthly net (SE) | Documented, ex-credit | Documented, funded bust | Optimum request | Optimum, monthly net (SE) | Optimum, ex-credit | Optimum, funded bust | Gap    |
| -------------------------------- | --------- | ---------------------------- | --------------------- | ----------------------- | --------------- | ------------------------- | ------------------ | -------------------- | ------ |
| alphafutures advanced            | $1,000    | $1,621 ($11)                 | $1,558                | 18.5%                   | $3,000          | $3,001 ($37)              | $2,929             | 26.0%                | $1,380 |
| alphafutures standard            | $500      | $394 ($3)                    | $360                  | 19.2%                   | $3,000          | $2,414 ($20)              | $2,217             | 22.2%                | $2,020 |
| alphafutures zero                | $500      | $364 ($3)                    | $333                  | 24.0%                   | $1,500          | $1,143 ($9)               | $1,051             | 26.9%                | $779   |
| apex eod                         | $500      | $97 ($10)                    | $97                   | 20.1%                   | $3,000          | $1,502 ($30)              | $1,502             | 22.8%                | $1,405 |
| apex intraday                    | $500      | $302 ($12)                   | $302                  | 19.0%                   | $3,000          | $2,287 ($39)              | $2,287             | 22.8%                | $1,985 |
| e8futures signature              | $500      | $218 ($4)                    | $218                  | 18.5%                   | $6,000          | $1,180 ($14)              | $1,179             | 19.5%                | $961   |
| e8futures zero-max-100           | $500      | -$62 ($31)                   | -$62                  | 19.3%                   | $3,000          | $1,969 ($54)              | $1,969             | 22.6%                | $2,030 |
| e8futures zero-max-80            | $500      | -$18 ($25)                   | -$18                  | 19.3%                   | $3,000          | $1,593 ($43)              | $1,593             | 22.6%                | $1,611 |
| e8futures zero-starter-100       | $500      | $371 ($26)                   | $371                  | 19.3%                   | $1,000          | $939 ($38)                | $939               | 21.7%                | $568   |
| e8futures zero-starter-80        | $500      | $307 ($21)                   | $307                  | 19.3%                   | $1,000          | $760 ($30)                | $760               | 21.7%                | $453   |
| ftmo-futures growth              | $500      | $941 ($6)                    | $928                  | 19.3%                   | $3,000          | $3,323 ($35)              | $3,300             | 39.7%                | $2,382 |
| ftmo-futures pro                 | $500      | -$209 ($12)                  | -$209                 | 25.8%                   | $3,000          | $124 ($40)                | $124               | 25.8%                | $332   |
| fundednext flex                  | $500      | $419 ($11)                   | $419                  | 23.6%                   | $1,500          | $1,368 ($26)              | $1,368             | 24.8%                | $949   |
| fundednext fnl-003               | $800      | $302 ($1)                    | $283                  | 40.8%                   | $1,500          | $464 ($2)                 | $436               | 41.3%                | $162   |
| fundednext legacy                | $500      | $651 ($4)                    | $638                  | 18.9%                   | $6,000          | $2,708 ($21)              | $2,586             | 20.7%                | $2,057 |
| fundednext rapid-daily           | $500      | $393 ($12)                   | $393                  | 28.5%                   | $1,500          | $1,010 ($20)              | $1,010             | 31.4%                | $617   |
| fundednext rapid-pro-dll-add-on  | $500      | $234 ($5)                    | $234                  | 24.8%                   | $1,500          | $700 ($10)                | $700               | 26.8%                | $466   |
| fundednext rapid-pro             | $500      | $213 ($7)                    | $213                  | 19.0%                   | $1,500          | $785 ($14)                | $785               | 20.6%                | $572   |
| lucid daily-eod-dll              | $500      | $1,806 ($17)                 | $1,805                | 34.2%                   | $6,000          | $2,856 ($29)              | $2,762             | 40.3%                | $1,050 |
| lucid daily-eod                  | $500      | $1,984 ($18)                 | $1,983                | 25.6%                   | $6,000          | $3,190 ($30)              | $3,084             | 31.9%                | $1,206 |
| lucid daily-intraday-dll         | $500      | $1,832 ($16)                 | $1,831                | 32.4%                   | $6,000          | $2,868 ($29)              | $2,777             | 39.0%                | $1,036 |
| lucid daily-intraday             | $500      | $1,982 ($19)                 | $1,982                | 22.6%                   | $6,000          | $3,167 ($33)              | $3,060             | 26.3%                | $1,185 |
| lucid direct                     | $500      | $176 ($2)                    | $140                  | 40.1%                   | $3,000          | $1,048 ($6)               | $866               | 41.3%                | $871   |
| lucid flex-dll                   | $500      | $391 ($6)                    | $391                  | 23.8%                   | $2,000          | $1,218 ($14)              | $1,218             | 28.6%                | $827   |
| lucid flex                       | $500      | $456 ($8)                    | $456                  | 20.4%                   | $2,000          | $1,426 ($16)              | $1,426             | 21.2%                | $969   |
| lucid pro-no-dll                 | $500      | $438 ($4)                    | $404                  | 19.5%                   | $3,000          | $2,315 ($19)              | $2,151             | 21.9%                | $1,876 |
| lucid pro                        | $500      | $427 ($3)                    | $395                  | 23.8%                   | $3,000          | $2,137 ($18)              | $1,987             | 30.1%                | $1,710 |
| mffu builder                     | $500      | $290 ($5)                    | $290                  | 25.0%                   | $2,000          | $1,280 ($19)              | $1,280             | 30.5%                | $990   |
| mffu pro                         | $1,000    | $1,084 ($8)                  | $1,059                | 23.1%                   | $6,000          | $2,323 ($46)              | $2,238             | 37.9%                | $1,239 |
| mffu rapid-eod                   | $500      | $1,988 ($16)                 | $1,988                | 23.8%                   | $6,000          | $3,201 ($28)              | $3,093             | 29.9%                | $1,213 |
| mffu rapid                       | $500      | $1,974 ($18)                 | $1,973                | 25.6%                   | $6,000          | $3,180 ($30)              | $3,074             | 31.9%                | $1,206 |
| topstep no-fee-consistency-dll   | $500      | $393 ($3)                    | $376                  | 23.9%                   | $6,000          | $2,782 ($21)              | $2,660             | 23.5%                | $2,389 |
| topstep no-fee-consistency       | $500      | $421 ($4)                    | $401                  | 19.1%                   | $3,000          | $2,445 ($19)              | $2,375             | 22.1%                | $2,024 |
| topstep no-fee-standard-dll      | $500      | $667 ($4)                    | $656                  | 25.2%                   | $6,000          | $2,785 ($21)              | $2,719             | 28.3%                | $2,117 |
| topstep no-fee-standard          | $500      | $717 ($4)                    | $704                  | 18.9%                   | $2,000          | $2,414 ($18)              | $2,379             | 25.6%                | $1,696 |
| topstep standard-consistency-dll | $500      | $384 ($3)                    | $367                  | 23.9%                   | $6,000          | $2,773 ($21)              | $2,651             | 23.5%                | $2,389 |
| topstep standard-consistency     | $500      | $414 ($4)                    | $395                  | 19.1%                   | $3,000          | $2,438 ($19)              | $2,368             | 22.1%                | $2,024 |
| topstep standard-standard-dll    | $500      | $658 ($4)                    | $646                  | 25.2%                   | $6,000          | $2,775 ($21)              | $2,709             | 28.3%                | $2,117 |
| topstep standard-standard        | $500      | $712 ($4)                    | $698                  | 18.9%                   | $2,000          | $2,406 ($18)              | $2,371             | 25.6%                | $1,695 |
| tpt                              | $500      | $1,754 ($17)                 | $1,753                | 26.7%                   | $6,000          | $2,816 ($28)              | $2,726             | 33.8%                | $1,063 |
| tradeify growth                  | $500      | $351 ($3)                    | $319                  | 22.8%                   | $3,000          | $2,032 ($17)              | $1,845             | 25.9%                | $1,681 |
| tradeify lightning               | $1,000    | $622 ($4)                    | $549                  | 40.7%                   | $3,000          | $1,545 ($9)               | $1,363             | 41.4%                | $923   |
| tradeify select-daily            | $500      | $2,408 ($21)                 | $2,408                | 26.3%                   | $1,500          | $3,020 ($47)              | $3,018             | 43.6%                | $612   |
| tradeify select-flex             | $500      | $744 ($5)                    | $730                  | 19.3%                   | $3,000          | $2,704 ($22)              | $2,662             | 24.6%                | $1,960 |

## Findings

1. **The documented $500 request is below the engine optimum on all 44 plans**, and on every plan by more than twice the larger standard error. Median gap $1,209, smallest $162 (FundedNext FNL:003), largest $2,389.
2. **The optimum is a large request.** It is $6,000 (the largest swept size) on 14 plans, $3,000 on 16, $2,000 on 5, $1,500 on 7 and $1,000 on 2 (E8 Zero Starter). A best request at the top of the swept range means the true optimum may be higher still; the sweep cannot say.
3. **The larger request carries a higher funded bust rate** on most plans (for example FTMO Futures Growth 19.3% at $500 against 39.7% at $3,000, Tradeify Select Daily 26.3% against 43.6%). The monthly net already prices that bust, so the gap is net of it, but the rate itself is a risk the monthly figure averages away.
4. **Credit-free agrees with credit-inclusive:** the optimum's credit-free figure beats the documented credit-free figure on every plan too, so the gap is not the horizon credit (T32).

## Answer to tools-U22

U22 asked whether $500 per request is the right documented default. On this engine the payout-size optimum beats it on every buyable plan, by a margin far outside the noise. The CLI default stays `UpToRequest` (unchanged) and the rulebook default stays $500 until you decide; this run only measures. If you change it, the bust-rate column above is the trade you would be making.

## Verification

- 44 of 44 jobs exited 0 (7 needed `--highest-intraday`, recorded in `runs.tsv`).
- The engine was unchanged from start to end (commit and content hash above).
- Every documented row was found through `requestedSizes` containing 500; on Alpha Advanced, MFF Pro, Tradeify Lightning ($1,000) and FundedNext FNL:003 ($800) the request settles at the firm minimum, as the `Effective` column shows.

## Artifacts

Raw JSON per plan, `runs.tsv` (exit code and seconds per job), `table.tsv` (the table above, unrounded inputs), `plans.txt`, start and end commit and content hash: on the build PC under `~/engine-runs/2026-10-14-payout-size-remeasure/` (230 MB, not committed).
