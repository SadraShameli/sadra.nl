# Test speed profile on the build PC (2026-10-02)

Run: `bun x vitest run` on `sadra_pc` (Windows 11, Ryzen 9 5950X, 32 threads, default workers), snapshot of the working tree at 12:47 local, before the Windows path fixes. 825 files, 17,161 tests, wall time 1,213 s (20.2 min), set by the slowest files. Durations are file wall times under a full-suite load (all cores busy), so an idle-PC rerun of one file is faster; measure your own changes with `pcvitest` on an idle PC.

Files over 60 s: 14. Files over 30 s: 24. Files under 30 s: 801.

## Files over 30 seconds

| Seconds | File | Tests |
|---:|---|---:|
| 1194 | `tests/unit/lib/prop-calculator/core/AverageRewardSolver.test.ts` | 34 |
| 914 | `tests/unit/lib/prop-calculator/firms/alphafutures/AlphaConsistency.test.ts` | 156 |
| 577 | `tests/unit/lib/prop-calculator/core/FundedStateValueBestDayOverflow.test.ts` | 5 |
| 552 | `tests/unit/lib/prop-calculator/core/FundedStateValueAccuracy.test.ts` | 6 |
| 551 | `tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts` | 83 |
| 422 | `tests/unit/lib/prop-calculator/ladderSearch.test.ts` | 34 |
| 322 | `tests/unit/cli/prop/optimizeDp.test.ts` | 154 |
| 246 | `tests/unit/lib/prop-calculator/core/FundedStateValuePayoutPolicy.test.ts` | 22 |
| 228 | `tests/unit/lib/prop-calculator/core/EvalStateValue.test.ts` | 24 |
| 212 | `tests/unit/lib/prop-calculator/core/FundedStateValueGridBias.test.ts` | 6 |
| 157 | `tests/unit/lib/prop-calculator/advisor/PayoutSizeSweep.test.ts` | 13 |
| 105 | `tests/unit/lib/prop-calculator/core/FundedStateValueBestDayBound.test.ts` | 5 |
| 67 | `tests/unit/lib/prop-calculator/core/FundedStateValueWorkerDeterminism.test.ts` | 2 |
| 67 | `tests/unit/lib/prop-calculator/advisor/FundedSizingAdvisor.test.ts` | 17 |
| 59 | `tests/unit/lib/prop-calculator/advisor/FundedSizingAdvisorEnteredStop.test.ts` | 13 |
| 53 | `tests/unit/lib/prop-calculator/core/EvalStateValueReachability.test.ts` | 45 |
| 47 | `tests/unit/app/prop-calculator/fundedOptimizerModel.test.ts` | 14 |
| 44 | `tests/unit/lib/prop-calculator/firms/tradeify/TradeifySelectDp.test.ts` | 9 |
| 40 | `tests/unit/lib/prop-calculator/combinatorialCoverage.test.ts` | 2 |
| 40 | `tests/unit/lib/prop-calculator/lockoutRoomWholeContracts.test.ts` | 49 |
| 37 | `tests/unit/lib/prop-calculator/core/DayPolicy.test.ts` | 48 |
| 34 | `tests/unit/lib/prop-calculator/core/FundedStateValueWholeContracts.test.ts` | 10 |
| 31 | `tests/unit/lib/prop-calculator/core/FundedStateValueConvergence.test.ts` | 20 |
| 31 | `tests/unit/app/prop-calculator/toolPages.test.ts` | 202 |

## Tests over 30 seconds

| Seconds | File | Test |
|---:|---|---|
| 1073 | `AverageRewardSolver.test.ts` | MFF Rapid EOD 50K: the average-reward DP policy beats the best flat/percent candidate's expectedMonthlyNet, every candidate placed in whole  |
| 464 | `AlphaConsistency.test.ts` | solves the loss-exempt toy, the one that needs the most sweeps, at the default tail with every level converged once meanHorizonDays is set,  |
| 407 | `ladderSearch.test.ts` | rediscovers the documented speed-optimal ladder from a full grid |
| 360 | `AlphaConsistency.test.ts` | stops the loss-exempt toy at the plain 200 sweep cap on some levels at the default tail when no horizon is given (hazard 0, no contraction b |
| 244 | `FundedStateValueBestDayOverflow.test.ts` | tradeify $50K · Growth at the fast grid with the coarse tail off keeps its pre-overflow value 13804.319470665403 to the cent and gains one b |
| 235 | `FundedStateValueAccuracy.test.ts` | values MFF Builder 50K (50 percent best-day rule) at the coarse probe grid, within its stated error bound of the fixed point the solver reac |
| 214 | `FundedStateValue.test.ts` | FTMO Futures Growth 50K converges at fine range multiples 0, 1 and 6 and keeps its pinned values, which are not monotone in the multiple: a  |
| 194 | `EvalStateValue.test.ts` | MFF Rapid EOD 50K, at a 30-day eval cap: the DP beats the documented speed-optimal static ladder ([400, 600, 800, 200], the same ladder scor |
| 117 | `FundedStateValuePayoutPolicy.test.ts` | coarse TopStep: initialValue, sweep count and sampled risks. Re-pinned for N-86 (WP54): initialValue moved from 5081.6891952778915 to 5081.8 |
| 112 | `FundedStateValueAccuracy.test.ts` | values the 40 percent best-day toy within 1 percent of simulate() driven by its own policy at cushion step 0.25 x drawdown, once the cushion |
| 100 | `FundedStateValueAccuracy.test.ts` | values the 40 percent best-day toy within 1 percent of simulate() driven by its own policy at cushion step 0.5 x drawdown, once the cushion  |
| 100 | `FundedStateValueBestDayOverflow.test.ts` | tradeify $50K · Lightning Funded at the fast grid with the coarse tail off keeps its pre-overflow value 10107.28437138499 to the cent and ga |
| 96 | `FundedStateValue.test.ts` | reports no rounding once the fine range covers the whole baseline grid. Re-pinned for WP58c (N-86 stage 2): cycleBaselineFineRangeMultiple r |
| 92 | `AverageRewardSolver.test.ts` | a TPT-like toy (S=170, R=99, no eval fee, about 4 attempts of several weeks per funded account): simulate() with retries on the solved polic |
| 83 | `FundedStateValueBestDayOverflow.test.ts` | alphafutures $50K · Standard at the fast grid with the coarse tail off keeps its pre-overflow value 13777.410482973317 to the cent and gains |
| 80 | `FundedStateValueBestDayOverflow.test.ts` | alphafutures $50K · Zero at the fast grid with the coarse tail off keeps its pre-overflow value 6915.558313154495 to the cent and gains one  |
| 72 | `FundedStateValueGridBias.test.ts` | values TopStep with MNQ at a 2 point stop above 0 and trades the capped 80 at the funded start (WP58c: COARSE_GRID pins maxTailCushionMultip |
| 70 | `FundedStateValueBestDayOverflow.test.ts` | topstep $50K · Standard path · Consistency XFA at the fast grid with the coarse tail off keeps its pre-overflow value 17749.61137859767 to t |
| 64 | `FundedStateValueGridBias.test.ts` | values TopStep with NQ at a 5 point stop above 0 and trades the capped 200 at the funded start (WP58c: COARSE_GRID pins maxTailCushionMultip |
| 63 | `FundedStateValuePayoutPolicy.test.ts` | solves an opted-in registry plan with a request size on a FundedWorkerSession to exactly the single-threaded value, which differs from the u |
| 62 | `FundedStateValueGridBias.test.ts` | values TopStep with ES at a 2 point stop above 0 and trades the capped 200 at the funded start (WP58c: COARSE_GRID pins maxTailCushionMultip |
| 60 | `FundedStateValueWorkerDeterminism.test.ts` | gives the same TopStep regime-1 value on every worker solve, bit for bit equal to the single-threaded solve |
| 58 | `AlphaConsistency.test.ts` | separates the Alpha rule from a loss-exempt rule after the first request, in the same direction as simulated trials of its own policy, at th |
| 58 | `FundedStateValueAccuracy.test.ts` | earns at least its DP value in a replay of its own policy on the default 6 drawdown cushion grid (the tail pinned off, WP58c: this test stud |
| 57 | `optimizeDp.test.ts` | reports a 100% share and the saturation warning when every sampled funded day hits the grid top |
| 56 | `FundedStateValueBestDayBound.test.ts` | fails closed on a day past the cap: with a coarse tail that lets a win land a whole tail step above the fine-grid cap, a capped day blocks p |
| 53 | `EvalStateValueReachability.test.ts` | finds no replay day start without a policy on TopStep No-fee Standard at a $100 action step on $500 cushion cells |
| 52 | `PayoutSizeSweep.test.ts` | names the personal override as the retained-cushion basis when the policy retains more than the rulebook |
| 52 | `optimizeDp.test.ts` | run() prints the disclosure once for TopStep no-fee-standard, with the plan's own label once |
| 52 | `FundedStateValue.test.ts` | reports no rounding when the cushion step already equals the coarse step |
| 52 | `FundedStateValue.test.ts` | reports where the baseline grid switches from the cushion step to the coarse drawdown step at the default fine range, and where the grid top |
| 51 | `optimizeDp.test.ts` | reports a 0% share and no saturation warning when no sampled funded day ever hits the grid top |
| 50 | `PayoutSizeSweep.test.ts` | warns on a personal override far enough from the winner that no defensible noise band would hide it |
| 46 | `FundedStateValueAccuracy.test.ts` | keeps the 40 percent toy above 300 and no higher than its own replay on a coarse cycleBestDayBucketCount of 3, at the default 6 drawdown cus |
| 46 | `PayoutSizeSweep.test.ts` | names the personal override as the retained-cushion basis when the policy retains less than the rulebook (PT-19i review) |
| 46 | `optimizeDp.test.ts` | prints the monthly objective and the rate by default |
| 43 | `optimizeDp.test.ts` | reports the rate-0 cycle value for --objective cycle and never the rate-search warning |
| 40 | `combinatorialCoverage.test.ts` | every one of the 1380 generated combinations produces structurally valid SimOutputs, a row whose funded flat risk is below one contract at i |
| 33 | `EvalStateValue.test.ts` | a DP-driven run's empirical simulate() pass rate matches the DP's own predicted V(initial state) within Monte Carlo tolerance, for a real re |
| 32 | `FundedSizingAdvisor.test.ts` | assemble() discloses HorizonCreditOneRequest and that live triggers are not yet checked (F-145) |
| 32 | `FundedSizingAdvisor.test.ts` | assemble() keeps StartBasis.Fresh and FreshStartApproximation without a from-state result |
| 31 | `FundedStateValueConvergence.test.ts` | values FTMO Futures Growth 50K at the coarse probe grid within $1 of the fixed point the solver reaches at tolerance 0.0001 ($60,708.76), in |

## PT-T1d: the timeout guard and the long tail (2026-10-02)

Guard: `tests/unit/testSpeedGuard.test.ts` parses every `.ts` and `.tsx` file under `tests/` and fails on any test, hook or suite timeout above 10 seconds (a numeric argument, a named constant resolved through same-file, relative-import and `~/` import constants and arithmetic, an options object with a plain or shorthand key, `vi.setConfig`, Playwright `test.setTimeout` and `test.describe.configure`, a hook's second argument), on any timeout value in those slots that does not resolve to a number (an unresolved name of any spelling, a property access, a computed key, a spread, a re-export), on a `testTimeout` or `hookTimeout` above 10 seconds in `vitest.config.ts`, on a `testTimeout` or `hookTimeout` above 10 seconds in `vitest.config.ts`, and on a timeout flag in any `package.json` script. It scans in 8 slices (one test each, under 1 s on the PC) so a loaded machine never nears the 5 second default. RED before the removals: 22 offenders in 10 files (`positionSizeModel` 30 s, `combinatorialCoverage` 30 s, `adviseRiskCheck` 4 x 60 s, `lockoutRoomWholeContracts` 2 x 120 s, `EvalSizingAdvisorDocumentedLadderReasons` 60 s, `PayoutSizeSweep` 3 x 30 s, `LadderSearchContractLimits`, `LadderSearchCost`, `LadderSearchIntradayTrailing` 2 x, `LadderSearchNoise` 6 x 60 s). The `pcvitest` wrapper no longer passes `--testTimeout`, so every run below used vitest's own 5 second test and 10 second hook defaults.

Removed overrides and what each needed (PC, 8 workers):

| File | Before | After |
|---|---|---|
| `PayoutSizeSweep.test.ts` | three tests 7.0 to 7.6 s (two sweeps each at 1,000 trials, 90 day horizon) timed out at 5 s | one sweep per test at the grid minimum (the only extreme that warns: the grid maximum is the winner), 30 day funded horizon, still 1,000 trials; each about 2.5 s. One shared baseline sweep in a `beforeAll` feeds a test that a neighbouring in-band size gives a null warning (the 2 standard error band is asserted from the rows' own standard errors, and the warn test asserts its gap is beyond that band); the two cushion tests run at 300 and 1,000 trials; file about 11 s |
| `positionSizeModel.test.ts` | `beforeAll` grid of 40,392 cells, 5.1 s of the 10 s hook limit | 8 plan chunks computed lazily and shared by the three grid tests; every test under 1 s |
| `fundedOptimizerModel.test.ts` | one test 6.5 s (two sweeps at the default trials) | `baseInputs` at 200 trials (structure tests only); every test under 1 s |
| `lockoutRoomWholeContracts.test.ts` | 17.3 s alone, 25.7 s under a 24 file load | the half-cushion describe moved to `lockoutRoomWholeContractsHalfCushion.test.ts`, shared helpers and cases in `lockoutRoomFixtures.ts`; 29 + 21 tests (the same 50), about 9 s each in parallel |
| `adviseRiskCheck`, `EvalSizingAdvisorDocumentedLadderReasons`, `LadderSearch{ContractLimits,Cost,IntradayTrailing,Noise}`, `combinatorialCoverage` | override only; slowest test 1.8 s | override removed |

Pooled-file hook flake (the 10 s hook limit under parallel load): the root is eight `--import tsx` workers per pool, each loading the whole module graph, started by several files at once. `FundedWorkerSession` takes `{ maxWorkers }` (default the old 8, integer at least 1, else a `RangeError`); the two pooled files pass 3 and 2 workers, and a new test pins that a 2 worker and a 3 worker pool give a bit for bit equal value (skipped on a host with fewer than 3 cores, where both caps give the same pool). One case in `FundedStateValueWorkerDeterminism.test.ts` keeps the uncapped default session, and asserts it plans min(cores, 8) workers. Under the same 11 file load (nine heavy DP and CLI files plus the pooled files) copies of the two pooled files at 8 workers took 17.5 s and 20.0 s and one test hit the 5 s limit; the capped files passed with the whole run at 16.8 s instead of 27.7 s (and ran 7.5 s and 10.9 s in a later 40 file run). The flake itself (3 of 8 runs in the earlier report) was not reproduced on either side, so this is a load comparison, not a proof.

Not guarded by a unit test any more: the default 30-drawdown-tail convergence of the Alpha loss-exempt toy (the two `AlphaConsistency` tests that timed out at 240 s) is now guarded by the audit's N-90c CLI measurement, not by a test under `tests/`.

Per-file wall times on the PC with 24 profile files at once (8 workers, after the changes): all under 20 s except `lockoutRoomWholeContracts` (25.7 s, before the split) and `fundedOptimizerModel` (one 6.5 s test, fixed). The final full-suite wall times on the PC and the Mac are the orchestrator's (quiet window); they are not recorded here.
