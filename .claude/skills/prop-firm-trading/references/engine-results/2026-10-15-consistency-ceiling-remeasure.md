# Funded consistency ceiling in the documented policy (PT-119, Q52)

**Question:** after the documented-policy simulation started capping each funded day at the plan's funded consistency ceiling (the ceiling the daily advice card tells the trader to stop at), how do the documented $500 figures and the payout-size optimum of the 18 buyable plans with a funded consistency rule change?

**Engine state:** commit `6bebe90e`. The build PC ran a working tree whose 1,285 tracked `src` files were byte-identical to that commit (SHA-1 per file, compared with the Mac checkout of `6bebe90e`).

**Run:** 2026-10-15, about 07:30 CEST, on the build PC, eight jobs at a time.

## Inputs

The same as [`2026-10-14-payout-size-remeasure.md`](2026-10-14-payout-size-remeasure.md): `bun run cli prop advise --firm <f> --variant <v> --stage funded --balance 50000 --highest-eod 50000 --payouts 0 --trading-days 0 --json` (with `--highest-intraday 50000` where the CLI requires it), the default rulebook, the payout-size sweep's request sizes, 4,000 trials, seed 42, a 252-day funded horizon, credit-inclusive monthly net as the objective. Only the 18 plans with a funded consistency rule were re-run; the other 26 plans have none, so their documented simulation did not change and their 2026-10-14 rows stand.

## Result

"Documented, flat" is the 2026-10-14 figure on the flat funded policy. "Change / SE" divides the change by the two runs' standard errors combined as if independent; both runs use seed 42, so this overstates the noise of the difference.

| Plan                             | Effective | Documented, flat (2026-10-14) | Documented, ceiling (SE) | Change | Change / SE | Documented, ex-credit | Funded bust, flat to ceiling | Payouts per trial | Optimum request | Optimum, monthly net (SE) | Gap    |
| -------------------------------- | --------- | ----------------------------- | ------------------------ | ------ | ----------- | --------------------- | ---------------------------- | ----------------- | --------------- | ------------------------- | ------ |
| alphafutures standard            | $500      | $394 ($3)                     | $407 ($4)                | +$13   | +2.8        | $373                  | 19.2% to 18.3%               | 3.40              | $3,000          | $2,470 ($22)              | $2,062 |
| alphafutures zero                | $500      | $364 ($3)                     | $375 ($3)                | +$11   | +2.3        | $344                  | 24.0% to 24.5%               | 4.22              | $1,500          | $1,169 ($10)              | $794   |
| apex eod                         | $500      | $97 ($10)                     | $90 ($11)                | -$7    | -0.5        | $90                   | 20.1% to 20.1%               | 1.57              | $3,000          | $1,466 ($31)              | $1,376 |
| apex intraday                    | $500      | $302 ($12)                    | $309 ($11)               | +$7    | +0.4        | $309                  | 19.0% to 19.6%               | 1.17              | $3,000          | $2,266 ($40)              | $1,957 |
| e8futures signature              | $500      | $218 ($4)                     | $224 ($4)                | +$6    | +1.1        | $224                  | 18.5% to 18.7%               | 1.33              | $6,000          | $1,206 ($14)              | $981   |
| fundednext fnl-003               | $800      | $302 ($1)                     | $305 ($1)                | +$3    | +1.7        | $286                  | 40.8% to 40.7%               | 2.72              | $1,500          | $470 ($2)                 | $165   |
| fundednext rapid-pro             | $500      | $213 ($7)                     | $215 ($8)                | +$2    | +0.2        | $215                  | 19.0% to 19.4%               | 1.31              | $1,500          | $805 ($14)                | $589   |
| fundednext rapid-pro-dll-add-on  | $500      | $234 ($5)                     | $246 ($5)                | +$12   | +1.7        | $246                  | 24.8% to 25.1%               | 1.76              | $1,500          | $721 ($11)                | $475   |
| lucid direct                     | $500      | $176 ($2)                     | $181 ($2)                | +$5    | +2.1        | $145                  | 40.1% to 40.2%               | 3.52              | $3,000          | $1,072 ($6)               | $890   |
| lucid pro                        | $500      | $427 ($3)                     | $447 ($4)                | +$20   | +4.1        | $415                  | 23.8% to 24.6%               | 4.84              | $3,000          | $2,223 ($19)              | $1,776 |
| lucid pro-no-dll                 | $500      | $438 ($4)                     | $464 ($4)                | +$26   | +4.3        | $430                  | 19.5% to 19.2%               | 3.72              | $3,000          | $2,411 ($21)              | $1,947 |
| mffu builder                     | $500      | $290 ($5)                     | $305 ($6)                | +$15   | +2.0        | $305                  | 25.0% to 25.9%               | 1.67              | $2,000          | $1,290 ($20)              | $986   |
| topstep no-fee-consistency       | $500      | $421 ($4)                     | $446 ($4)                | +$25   | +4.6        | $428                  | 19.1% to 19.5%               | 3.80              | $3,000          | $2,475 ($20)              | $2,029 |
| topstep no-fee-consistency-dll   | $500      | $393 ($3)                     | $415 ($3)                | +$22   | +4.9        | $398                  | 23.9% to 25.0%               | 4.84              | $6,000          | $2,733 ($20)              | $2,318 |
| topstep standard-consistency     | $500      | $414 ($4)                     | $440 ($4)                | +$26   | +4.7        | $421                  | 19.1% to 19.5%               | 3.80              | $3,000          | $2,469 ($20)              | $2,029 |
| topstep standard-consistency-dll | $500      | $384 ($3)                     | $406 ($3)                | +$22   | +4.7        | $388                  | 23.9% to 25.0%               | 4.84              | $6,000          | $2,724 ($20)              | $2,318 |
| tradeify growth                  | $500      | $351 ($3)                     | $364 ($3)                | +$13   | +3.1        | $332                  | 22.8% to 22.5%               | 3.61              | $3,000          | $2,113 ($17)              | $1,748 |
| tradeify lightning               | $1,000    | $622 ($4)                     | $648 ($4)                | +$26   | +4.6        | $575                  | 40.7% to 40.7%               | 5.23              | $3,000          | $1,604 ($9)               | $956   |

## Findings

1. **Following the ceiling raises the documented monthly net on 17 of the 18 plans.** 11 rise by more than 2 SE, 7 move within 2 SE, and none falls by more than 2 SE (Apex EOD, -$7, is the only fall, at 0.5 SE). The median change is +$13 a month; the largest are TopStep Consistency (+$22 to +$26), Lucid Pro (+$20 and +$26) and Tradeify Lightning (+$26). A day that stops at the ceiling cannot push the best day above the plan's share, so fewer cycles fail the consistency check when the payout is requested and payouts come sooner. The funded bust rate moves by at most 1.1 points.
2. **The payout-size optimum is unchanged on all 18 plans**, and it still beats the documented request by more than twice the larger standard error on all 18. The answer to tools-U22 in the 2026-10-14 file stands.

## Verification

- 18 of 18 jobs exited 0.
- Every documented row was found through `requestedSizes` containing 500, as in the 2026-10-14 run.
- The documented figures were read from the `payout-size-sweep` optimum's rows in the CLI's own JSON (`out.estimates.expectedMonthlyNet`, `out.expectedMonthlyRealizedNet`, `out.fundedBustProbability`, `out.expectedPayoutCount`).

## Artifacts

Raw JSON and stderr per plan, the run script and the read-back script: on the build PC under `~/engine-runs/2026-10-15-pt119-consistency-remeasure/` (not committed).
