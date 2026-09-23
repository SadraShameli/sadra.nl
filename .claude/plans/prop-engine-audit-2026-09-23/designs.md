# Code-architect designs

One section per cluster, from the ECC code-architect agents (Opus), 2026-09-23. Implementers follow these; deviations get recorded in PLAN.md.


## Cluster `funded-dp` (R1-6, R1-7)

**Shared contracts:** 1. Daily loss limit headroom has one source of truth.
   - `resolveAffordableRisk(cushion: number, dailyLossLimit: null | number, todayPnL: number): number` goes in core/DayPolicy.ts and is exported from core/index.ts.
   - `Plan.affordableRisk(state: AccountState, phase: TradingPhase): number` wraps it.
   - Callers: simulator/day.ts, core/LadderSearch.ts (the ladder cluster must use it, not an inline min), EvalStateValue and FundedStateValue.

2. The DLL context must be derivable from AccountState. `DailyLossLimitContext` must stay fully computable by `plan.dailyLossLimitContext(state)` from AccountState fields. If R1-43 adds a session-start profit field, it must be computed from `state.balance - state.todayPnL - state.startingBalance`, so the DPs' synthetic states supply it automatically.

3. Peak dependence is declared by each DLL class. `DailyLossLimit` (abstract class in core/DailyLossLimit.ts) gains `abstract peakDayCloseBreakpoints(): null | readonly number[]`, and `dailyLossLimitPeakBreakpoints(config)` is exported from DailyLossLimit.ts and the barrel.
   - [] means the resolution never reads peakDayCloseProfit.
   - A sorted list means it is piecewise-constant in peak.
   - null means continuous: the plan is not funded-DP-eligible.
   - Any change to TieredDailyLossLimit's isEffectiveNextSession semantics (R1-43) must keep this method truthful.

4. `isContractLimitSessionFrozen(config: ContractLimitConfig | null): boolean` goes in core/ContractLimits.ts. If R1-54 changes session-frozen tiers to peak semantics (never falls back), it must say so. The funded DP then needs a contract-tier peak band, analogous to the DLL band.

5. `DrawdownStrategy.allowsWithdrawalWhileUnlocked(retainedCushion: number): boolean` is abstract. Every subclass, and any new one, must implement it:
   - EodTrailing and IntradayTrailing: `retainedCushion < amount`.
   - Static: true.
   Any new PayoutFloorEffect member must be handled in FundedStateValue's exhaustive switch.

6. `Plan.canLeaveBalanceAbovePayoutFloor(): boolean` must be updated whenever a new payout cap or debit-limiting PlanInit field is added.

7. `DayPolicy.computeRisk(state, tradeIndexToday, payoutsIssued?, cycleBestDayProfit?, qualifyingDaysSincePayout?, lastPayoutBalance?)` gains a new 6th positional argument. `DayRunOptions.lastPayoutBalance?: number` is added, and fundedPhase passes `tracker.lastPayoutBalance`. Other clusters editing DayPolicy (e.g. R1-4 risk ladders, R1-9) must preserve this argument order.

8. `FundedStateValueConfig.cycleBaselineFineRangeMultiple?: number` is a new optional field, default 1.

9. `isFundedDpEligible` changes meaning: Terminate funded DLL plans (FTMO Pro) become eligible. Only continuously peak-dependent DLLs, intraday trailing, missing lock/ReleaseFloor, and QualifyingDaysMilestonePayoutCap remain excluded. The optimize dp `fundedIneligibilityMessage` text changes to match. The R1-30 cluster, which also edits optimize dp labels, should merge after this.


### R1-6
- **Root cause:** Confirmed by reading the code. The funded DP never sees intraday P&L, so the funded daily loss limit (DLL) is never applied inside a day. There are five defects, all traceable to one missing piece: the solver loses the day-start state.
(1) src/lib/prop-calculator/core/FundedStateValue.ts:434-454 buildState hardcodes `todayPnL: 0` (line 451) and `peakDayCloseProfit: 0` (line 446). withinDayContinuation (1126-1132) builds its state through buildState, so `plan.isDayLockedOut(state, TradingPhase.Funded)` at 1136 (Plan.ts:443-449, `state.todayPnL <= -limit`) can never be true. The lockout branch is dead code.
(2) computeCandidateRisks (484-512) sizes risk as `resolveTradeRisk(capped, cushionNow, ...)` (line 507) and never caps it at the DLL headroom. The simulator does: simulator/day.ts:123-130 uses `affordable = Math.min(cushion, dailyLossLimit + state.todayPnL)`, and 192 applies the lockout.
(3) solveDayTree (889-905) solves per day-start cushion only when isTrackingFundedConsistency is true. Otherwise it passes `cushionAtDayStart = 0` (line 898). For every plan without a funded consistency rule, three things go wrong:
   - dayCloseValue:589 computes todayPnL as cushionAtEnd, which breaks the minQualifyingDayProfit gate at 590-591. Affected: FTMO Growth/Pro, Tradeify Select Flex, TopStep XFA.
   - solveDayTreeOnce:963-964 computes the day-start profit used by session-frozen contract tiers (isEffectiveNextSession) as threshold - startingBalance.
   - Any DLL fix would have no day-start P&L to work from.
(4) Tiered DLLs with isEffectiveNextSession resolve from context.peakDayCloseProfit (DailyLossLimit.ts:176-181). The DP always supplies 0, so Tradeify Growth/Lightning's $1,250 -> $2,000 scaling DLL is stuck on the lowest tier. hasPeakShareDependency (191-210) returns false for the Range shape, so isFundedDpEligible lets these plans through silently.
(5) isFundedDpEligible (1892-1903) excludes Terminate-effect DLLs, only because todayPnL was never modeled.
The eval DP gets the lockout right: EvalStateValue.ts:332-346 passes the real todayPnL. But its computeCandidateRisks (198-206) also lacks the headroom cap. The simulator, not the eval DP, is the reference behaviour to mirror.
- **Design:** Target behaviour: the funded DP mirrors simulator/day.ts exactly, with a risk cap of min(cushion, DLL + todayPnL), a Lockout that ends the day, a Terminate that busts the account, and a DLL resolved from the same DailyLossLimitContext the simulator uses. Implement in this order.

STEP 0: solver infrastructure. This lands first because steps 2-3 and R1-7 are infeasible on memory without it.
(a) Extract policies lazily instead of storing them per sweep.
   - Remove the `policy` Map and the policy-table section of the worker result buffers. FundedWorkerPool.lockedPerPairSize and unlockedPerPairSize become cushionBucketCount only. Delete encodePolicyTables and decodePolicyTables.
   - sweepLevel, solveLevelToConvergence and runGrid return only day-start values.
   - solveDayTree becomes values-only: it calls solveDayTreeOnce and keeps finalTable.
   - computeRisk resolves the level/pair/start key, then calls `solveDayTreeOnce(mainContext, ...)` against the final converged value map. It caches the resulting `number[][]` policy table in `policyCache: Map<number, number[][]>`, keyed by `levelKey * startRadix + cushionStartIndex`.
   - Why this is needed: the current policy storage is already about 122M numbers for MFFU Builder (217 unlocked levels x 126 pairs x 4,004 entries). Generalizing the per-start solve (step 2) multiplies it again, which would OOM.
(b) Skip levels that can never be reached.
   - Add `abstract allowsWithdrawalWhileUnlocked(retainedCushion: number): boolean` to DrawdownStrategy.
   - EodTrailingDrawdown and IntradayTrailingDrawdown return `retainedCushion < this.amount`. The proof: at day close an unlocked threshold is at least balance - amount, so withdrawable <= amount - retained. StaticDrawdown returns true.
   - In the context, add `isUnlockedPostPayoutReachable = switch (plan.payoutFloorEffect) { LockAtPlanFloor, ReleaseFloor: false; None: plan.fundedDrawdown.allowsWithdrawalWhileUnlocked(retainedCushion) }`. The switch must be exhaustive.
   - computeFundedStateValue skips unlocked levels with regime > 0 when that flag is false.
   - Both loops skip `regime > 0 && plan.isAccountConcluded(regime)`. dayCloseValue returns before continuationValue in that case, so those levels are never read.
   - Fail loud: in dayCloseValue, after a non-null payout, throw if `!state.thresholdLocked && !context.isUnlockedPostPayoutReachable`.
   - Hoist lockedThresholdDollars() into `context.lockedThreshold`. It is used here and by R1-7.

STEP 1: one shared affordability helper (DRY across day.ts, LadderSearch, and both DPs).
   - DayPolicy.ts gets `export function resolveAffordableRisk(cushion: number, dailyLossLimit: null | number, todayPnL: number): number`. It returns `dailyLossLimit === null ? cushion : Math.min(cushion, dailyLossLimit + todayPnL)`. Export it from core/index.ts.
   - Plan.ts gets `affordableRisk(state: AccountState, phase: TradingPhase): number`, which calls `resolveAffordableRisk(state.balance - state.threshold, resolveDailyLossLimit(this.dailyLossLimitFor(phase), this.dailyLossLimitContext(state)), state.todayPnL)`.
   - simulator/day.ts:123-130 becomes `const affordable = plan.affordableRisk(state, phase);`.
   - LadderSearch.ts:161-164 becomes `resolveAffordableRisk(remaining, dailyLossLimit, dayPnL)`.

STEP 2: day-start tracking whenever anything depends on it.
   - Add `isSolvingPerDayStart: boolean` to FundedSolveContext.
   - It is true when any of these holds: `plan.fundedConsistencyRule() !== null`, `plan.minQualifyingDayProfit !== null`, `describeDailyLossLimit(plan.fundedDailyLossLimit).kind !== DailyLossLimitShape.None`, or `positionSizing !== null && isSessionFrozen(fundedMinis or fundedMicros per instrument.isMicro)`.
   - The last condition uses a new `export function isContractLimitSessionFrozen(config: ContractLimitConfig | null): boolean` in ContractLimits.ts, which returns Tiered && isEffectiveNextSession === true.
   - solveDayTree and computeRisk use isSolvingPerDayStart where they currently use isTrackingFundedConsistency to decide on the per-start loop and cushionStartIndex. isTrackingFundedConsistency still controls only the cycleBestDay radix.

STEP 3: model the DLL in the DP.
   - buildState becomes `buildState(context, balance, threshold, isThresholdLocked, qualifyingDays, todayPnL: number, peakDayCloseProfit: number)`.
   - withinDayContinuation passes `todayPnL = cushionAfter - cushionAtDayStart`, so isBust (Terminate) and isDayLockedOut (Lockout) fire exactly as in day.ts.
   - dayCloseValue passes `todayPnL = cushionAtEnd - cushionAtDayStart`.
   - solveDayTreeOnce computes, per working index, `budget = plan.affordableRisk(buildState(... cushionNow, todayPnL = cushionNow - cushionAtDayStart, peakRep), TradingPhase.Funded)`.
   - candidateRisks and computeCandidateRisks take `riskBudget` in place of cushionNow as the first cache key, and call `resolveTradeRisk(capped, riskBudget, context.rungSizing)`.

STEP 4: peak-day-close DLL tiers, modeled rather than refused.
   - Add `abstract peakDayCloseBreakpoints(): null | readonly number[]` to the DailyLossLimit class hierarchy in DailyLossLimit.ts.
     - Flat and None return [].
     - PeakProfitShare returns null, meaning continuous.
     - Tiered returns [] when not isEffectiveNextSession. Otherwise it returns the sorted distinct `tier.minProfit` values that are > 0 and above the lowest tier's minProfit.
     - AfterThresholdLock returns null if either child is null, otherwise the sorted unique union.
   - Export `dailyLossLimitPeakBreakpoints(config: DailyLossLimitConfig): null | readonly number[]` and add it to the barrel.
   - FundedSolveContext gets `peakBreakpoints: readonly number[]` and `peakBandKeyRadix = peakBreakpoints.length + 1`.
   - Helpers: `peakBandIndex(context, peak)` counts breakpoints <= peak + BUCKET_EPSILON. `peakBandDollars(context, band)` returns 0 for band 0, else `peakBreakpoints[band - 1]`.
   - The band is a new pair dimension alongside idle, cycleBestDay and qualifyingDay. Update lockedKey, unlockedKey, the level-key closures, maxLocked/UnlockedKeyExclusive, the worker pairIndex decode, and FundedWorkerPool.totalPairs.
   - dayCloseValue builds its state with peak = peakBandDollars(bandAtStart). After recordDayClosePeak it continues with `peakBandIndex(context, state.peakDayCloseProfit)`.
   - computeRisk uses peakBandIndex(context, state.peakDayCloseProfit).
   - This is exact: the tier is piecewise-constant in peak and peak never decreases.

STEP 5: eligibility.
   - isFundedDpEligible becomes: `isDrawdownDpEligible(kind) && dailyLossLimitPeakBreakpoints(plan.fundedDailyLossLimit) !== null && (lock || ReleaseFloor) && !(payoutCapOverride instanceof QualifyingDaysMilestonePayoutCap)`.
   - Terminate plans become eligible (FTMO Pro) because isBust now sees the real todayPnL. Lucid's PeakProfitShare stays refused.
   - Update the throw text in computeFundedStateValue.
   - Update fundedIneligibilityMessage in src/cli/commands/prop/optimize/dp/command.ts:34. Replace 'a terminating or peak-share-dependent funded daily loss limit' with 'a funded daily loss limit that scales continuously with peak-day-close profit (PeakProfitShare)'.

STEP 6: the same cap in the eval DP (the eval DP has the same gap).
   - EvalStateValue.ts drops candidateRisksByCushionIndex. It uses a `Map<number, readonly number[]>` cache keyed by budget.
   - bestActionAt receives the budget: `plan.affordableRisk({ ...dayStartState, balance: dayStartState.threshold + cushionNow, todayPnL: pnlSoFarNow }, TradingPhase.Eval)`.

Cost, estimated by counting operations at default grids. Not measured.
   - Plans already solved per day start (funded consistency, e.g. MFFU Builder) do not change from R1-6, apart from the step-0 savings.
   - Plans newly solved per day start (a DLL, minQualifyingDayProfit, or frozen tiers without consistency) pay more for the within-day solve: x61 on locked levels and x11 on unlocked levels.
   - Step 0(b) removes the unreachable unlocked regime>=1 levels, which are about 86% of unlocked work. Net for FTMO Growth: about 2.8x the operations before R1-7.
   - Memory falls sharply because only values are stored. For Builder that is about 0.4M Map entries instead of about 122M policy numbers.
   - Peak band: x2 only for Tradeify Growth/Lightning.
   - Measure before and after with the worker-parity-style coarse-grid vitest cases and report actual timings. Do not claim a speedup without measuring it.
- **Files:** src/lib/prop-calculator/core/FundedStateValue.ts, src/lib/prop-calculator/core/EvalStateValue.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/DayPolicy.ts, src/lib/prop-calculator/core/DailyLossLimit.ts, src/lib/prop-calculator/core/ContractLimits.ts, src/lib/prop-calculator/core/DrawdownStrategy.ts, src/lib/prop-calculator/core/index.ts, src/lib/prop-calculator/core/LadderSearch.ts, src/lib/prop-calculator/simulator/day.ts, src/cli/commands/prop/optimize/dp/command.ts, tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts, tests/unit/lib/prop-calculator/core/EvalStateValue.test.ts, tests/unit/lib/prop-calculator/core/Plan.test.ts, tests/unit/lib/prop-calculator/core/DayPolicy.test.ts, tests/unit/lib/prop-calculator/core/DailyLossLimit.test.ts, tests/unit/lib/prop-calculator/core/ContractLimits.test.ts, tests/unit/lib/prop-calculator/core/DrawdownStrategy.test.ts, tests/unit/cli/prop/optimizeDp.test.ts
- **Tests first:**
  - FundedStateValue.test.ts, DLL lockout (fails today). The toy is onePayoutToyPlan().withOverrides({ fundedDailyLossLimit: { kind: Flat, amount: 60 } }), with actionStepMultiple 0.25, cushionStepMultiple 0.25, maxActionMultiple 1, tradesPerDay 2, rr 2, winrate 0.5, payoutRegimeCap 0. Use a locked state: threshold 1000, balance 1275. Assert computeRisk(state with todayPnL -75, tradeIndex 1) === 0. The limit is already breached; today the DP returns 100.
  - FundedStateValue.test.ts, DLL headroom cap (fails today). Same toy and state. computeRisk with todayPnL -25 (headroom $35) must be > 0 and <= 35 + 1e-9. By hand the DP picks 25, because a 35 off-grid risk loses to bucketing. With todayPnL 0 (headroom $60) it must be > 35 (hand value: 50). Today it is 100.
  - FundedStateValue.test.ts, DP vs simulate() under a lockout DLL. Toy: amount 100, flat DLL 50, actions {50,100} (actionStepMultiple 0.5), cushionStepMultiple 0.5, tradesPerDay 2, rr 2, winrate 0.5, so every cushion lands on the grid. Assert `out.expectedGrossPayout + out.fundedBustProbability * bustTerminalValue` toBeCloseTo(result.initialValue, 0), with 50,000 trials and seed 7. This fails today because the DP values uncapped trades that the simulator caps. If Monte Carlo noise is too large at implementation time, raise trials; do not loosen the tolerance.
  - FundedStateValue.test.ts, Terminate DLL. The same toy with fundedDailyLossLimitBreach Terminate must have isFundedDpEligible === true. Its DP value must match simulate() (same tolerance) and must be strictly below the Lockout variant's initialValue. Replace the existing 'refuses a plan whose funded daily loss limit terminates' scope-cut test (lines 646-667) with this one.
  - FundedStateValue.test.ts, qualifying-day gate without funded consistency (fails today: 50 instead of 0). Use onePayoutToyPlan().withOverrides({ minDaysAfterPassForPayout: 1, minQualifyingDayProfit: 250 }), actionStepMultiple 1, cushionStepMultiple 1, tradesPerDay 1, rr 2, winrate 0.5. A win makes $200, below 250, so the account can never qualify: initialValue toBeCloseTo(0, 10). Control: minQualifyingDayProfit 150 gives exactly 50.
  - FundedStateValue.test.ts, session-frozen contract tier without a consistency rule (fails today: 25 instead of 100). Use tieredContractToyPlan(true) with fundedConsistency { kind: 'set', rule: null }. secondTradeRisk(plan, 0) === 100, because day-start profit is $350, which is the 4-contract tier.
  - FundedStateValue.test.ts, peak-band DLL. Use onePayoutToyPlan with a Tiered isEffectiveNextSession funded DLL: tiers { minProfit 0: DLL 30 } and { minProfit 300: DLL 1000 }. Grid: step multiples 0.25, tradesPerDay 1. Use a locked state at balance 1300, todayPnL 0. With peakDayCloseProfit 200, risk <= 30 (fails today at 100). With peakDayCloseProfit 400, risk === 100 (fails if the peak band is not modeled).
  - FundedStateValue.test.ts, lazy-policy parity. All existing computeRisk pins must stay unchanged: Rapid EOD [200,0,0,0], the one-payout toy risk 100, the TopStep tier caps, and secondTradeRisk. The Rapid EOD initialValue 29505.52018082788 stays. Re-measure reachedStateCount 39396 and 105, because the unreachable and concluded levels are no longer solved, and re-pin them with that explanation.
  - Plan.test.ts, affordableRisk. Flat DLL 1000, cushion 2000, todayPnL -300 gives 700. With no DLL, cushion 2000 gives 2000. Flat DLL 1000, cushion 500 gives 500. A Tiered live-profit DLL resolves the tier from balance - startingBalance.
  - DayPolicy.test.ts: resolveAffordableRisk(2000, null, -300) === 2000; resolveAffordableRisk(2000, 1000, -300) === 700; resolveAffordableRisk(500, 1000, 0) === 500.
  - DailyLossLimit.test.ts, dailyLossLimitPeakBreakpoints. Flat and None give []. Tiered without the next-session flag gives []. Tiered next-session with tiers [0:1250, 3000:2000] gives [3000]. PeakProfitShare gives null. AfterThresholdLock(Flat, PeakProfitShare) gives null. AfterThresholdLock of next-session tiers with breakpoints [3000] and [5000] gives [3000, 5000].
  - ContractLimits.test.ts, isContractLimitSessionFrozen. null gives false, Flat gives false, Tiered without the flag gives false, Tiered with the flag gives true.
  - DrawdownStrategy.test.ts (new, mirrors core/DrawdownStrategy.ts), allowsWithdrawalWhileUnlocked. EodTrailing amount 100: retained 100 gives false, 99 gives true. IntradayTrailing gives the same results. Static gives true.
  - EvalStateValue.test.ts: an eval toy with evalDailyLossLimit Flat 60, tradesPerDay 2. computeRisk(state with todayPnL -25, tradeIndex 1) must be <= 35. Today it is uncapped.
  - optimizeDp.test.ts: fundedIneligibilityMessage(...) no longer contains 'terminating'. The FTMO Futures Pro 50K plan has isFundedDpEligible === true.
  - The existing tests/unit/lib/prop-calculator/dailyLossLimitLockout.test.ts must pass unchanged. This guards the day.ts refactor.
- **Depends on:** R1-43 (TieredDailyLossLimit / DailyLossLimitContext semantics: whatever it changes must keep peakDayCloseBreakpoints truthful and keep the context derivable from AccountState), R1-54 (ContractLimits isEffectiveNextSession semantics: if the tier becomes peak-based and never falls back, the DP's day-start contract-tier resolution needs the same peak-band treatment), R1-9 / R1-10 / R1-11 (LadderSearch.ts edits: coordinate the one-line switch to resolveAffordableRisk to avoid merge conflicts), R1-30 (edits optimize dp command.ts labels: merge-order conflict only)
- **Risks:** (1) Runtime estimates are operation counts, not measurements. Plans that newly need per-start solving (FTMO Growth/Pro, Tradeify Select Daily/Flex, TopStep XFA and its DLL variants, E8/AlphaFutures/FundedNext DLL plans) get slower within-day solves: roughly x2.8 for FTMO Growth after the step-0 savings. The CLI optimize dp solve for these plans will slow down; measure and report.
(2) Lazy policy extraction takes the greedy policy against the final converged values instead of the policy from the last sweep. Near-ties can resolve differently. Existing risk pins are the guard; if one moves, explain why before re-pinning.
(3) The first computeRisk call per (level, pair, start) key now runs a day-tree solve on the main thread. The simulate() cross-check pays this once per distinct visited key, and the cache grows with the reachable set.
(4) Making Terminate plans eligible exposes FTMO Pro to the DP. FTMO Pro's retained cushion ($2,000) is below its drawdown ($3,000), so unlocked regime>=1 levels are reachable and still solved. This is correct but slower.
(5) Behaviour changes are intended but visible: the CLI's printed 'DP-predicted' rate and sample risks for DLL plans will drop. The eval DP change moves eval pass values for plans with an eval DLL.
(6) If R1-43 or R1-54 change the next-session semantics from peak close to prior close, peakDayCloseBreakpoints must return [] for them. The DP then picks up prior-close profit automatically through per-start solving. If the method is not updated, the DP adds a harmless, redundant band dimension.


### R1-7
- **Root cause:** Confirmed in src/lib/prop-calculator/core/FundedStateValue.ts:632-639. For regimeAtStart > 0, dayCloseValue rebuilds the tracker with `tracker.lastPayoutBalance = plan.payoutBalanceFloor(state, context.retainedCushion)`. That is threshold + retained cushion, or the buffer if higher (Plan.ts:517-531), not the real balance right after the payout. The DP state carries no post-payout balance at all: the key digits are offset, regime, idle, cycleBestDay, qualifyingDay and cushion (lockedKey 756-772, unlockedKey 1046-1064).
The real tracker measures `cycleProfit = state.balance - this.lastPayoutBalance` (FundedPayoutCycle.ts:112) and sets `lastPayoutBalance = state.balance` after the debit (FundedPayoutCycle.ts:180). The two agree only when the debit drained the account exactly to the floor.
resolveWithdrawal (FundedPayoutCycle.ts:221-276) debits less than withdrawable in several cases: a fixed ladder step (MFFU Builder [2000 x5], Tradeify Growth/Lightning), payoutRequestCap, balanceShareCap (TopStep, FTMO, Select Flex), payoutProfitShare, or the no-ladder `min(cycleProfit, ceiling)` when the floor is below startingBalance.
In all those cases every later cycleProfit is overstated. That loosens minPayoutProfitPerCycle, the per-cycle consistency check, the no-ladder debit, and profit-share debits. The empirical simulate() in optimize dp uses the real tracker, so only the DP value and policy are biased.
- **Design:** Add the post-payout balance to the DP state as a regime-dependent pair dimension, 'cycle baseline'. At grid resolution it is exact, and it is always conservative: cycle profit is never overstated.

1. New file src/lib/prop-calculator/core/FundedCycleBaselineGrid.ts, a PascalCase domain class. It is not barrel-exported, following FundedStateValue's precedent.
```ts
export class FundedCycleBaselineGrid {
    readonly size: number;
    private readonly levels: readonly number[];
    constructor(options: { readonly coarseStep: number; readonly fineEnd: number; readonly fineStep: number; readonly max: number; readonly min: number });
    dollarsAt(index: number): number;
    indexAtOrAbove(dollarsValue: number): number;
}
```
   - Levels: start at min (<= 0, a fineStep multiple) and step by fineStep up to fineEnd, then step by coarseStep until the last level is >= max.
   - indexAtOrAbove is a ceiling lookup with BUCKET_EPSILON, clamped to size - 1.
   - Throws on a non-positive step, non-finite values, or min > max.

2. New fields.
   - FundedStateValueConfig and SerializableFundedConfig get `cycleBaselineFineRangeMultiple?: number`, with DEFAULT_CYCLE_BASELINE_FINE_RANGE_MULTIPLE = 1. Thread it through toSerializableConfig.
   - FundedSolveContext gets `cycleBaselineGrid`, `cycleBaselineKeyRadix`, `lockedPayoutFloor`, and uses the `lockedThreshold` hoisted in R1-6 step 0.
   - Definitions:
     - `lockedPayoutFloor = plan.payoutBalanceFloor(buildState(context, lockedThreshold, lockedThreshold, true, 0, 0, 0), retainedCushion)`
     - `floorGap = lockedPayoutFloor - lockedThreshold`
     - `max = Math.max(0, maxCushionMultiple * amount - floorGap)`. This is the top of the locked cushion grid, so overflow clamps consistently with the cushion clamp that already exists and cycle profit is preserved.
     - `min = isUnlockedPostPayoutReachable ? Math.min(0, floorStep(plan.payoutBalanceFloor(stateAt(initialThreshold), retainedCushion) - lockedPayoutFloor)) : 0`
     - fineStep = cushionStepDollars, fineEnd = fineRangeMultiple * amount, coarseStep = amount.
   - Exact collapse to size 1 when the baseline provably always equals the floor. Add `Plan.canLeaveBalanceAbovePayoutFloor(): boolean`, returning `payoutLadder !== null || payoutRequestCap !== null || payoutBalanceShareCap !== null || payoutCapOverride !== null || payoutProfitShare !== null`. Collapse when that is false, `lockedPayoutFloor >= startingBalance`, and `!isUnlockedPostPayoutReachable`. The proof: with no caps, debit = min(B - L, B - F), so L' = max(L, F), and F is constant once locked. This covers MFFU Rapid EOD at zero cost.

3. Keys and pairs.
   - The baseline radix is 1 at regime 0 (the baseline is startingBalance exactly) and cycleBaselineKeyRadix at regime >= 1. Add `cycleBaselineRadixAt(context, regime)`.
   - It is a pair dimension: pairIndex decodes to (idle, cycleBestDay, qualifyingDay, peakBand, cycleBaseline).
   - At the regime cap, payouts move between baseline values within the same regime. Solving the baseline jointly per sweep handles that coupling; below the cap the baselines are uncoupled and converge together.
   - Extend lockedKey, unlockedKey, the level-key closures, maxLocked/UnlockedKeyExclusive and the worker decode.
   - FundedWorkerPool is sized for the maximum pair count. FundedWorkerDispatch gains `cycleBaselineRadix: number`, so each dispatch knows its pair count.

4. dayCloseValue gets a new `cycleBaselineAtStart: number` parameter, threaded through bestActionAt, valueOfRisk, withinDayContinuation, solveDayTree(Once) and continuationValue.
   - `tracker.lastPayoutBalance = regimeAtStart === 0 ? context.startingBalance : context.lockedPayoutFloor + context.cycleBaselineGrid.dollarsAt(cycleBaselineAtStart)`
   - After a payout, continue with `cycleBaselineNext = context.cycleBaselineGrid.indexAtOrAbove(state.balance - context.lockedPayoutFloor)`. If there is no payout, the baseline stays as it was.
   - Ceiling rounding on the baseline together with the existing floor rounding on cushion means the DP can only understate cycle profit and cushion, never overstate them.

5. Policy lookup.
   - DayPolicy.computeRisk and computedDayPolicy gain a 6th optional positional parameter `lastPayoutBalance?: number`.
   - simulator/types.ts: DayRunOptions gets `lastPayoutBalance?: number`.
   - simulator/day.ts passes it to computeRisk.
   - simulator/fundedPhase.ts stepFundedDay passes `lastPayoutBalance: tracker.lastPayoutBalance`.
   - The funded DP's computeRisk computes the baseline index with indexAtOrAbove(lastPayoutBalance - lockedPayoutFloor) when regime >= 1. Fail loud: throw if regime >= 1 and lastPayoutBalance is undefined. The CLI's sampleRisks only asks for regime 0, so it is unaffected.

Cost, estimated by counting operations at default grids. Not measured.
   - Builder: the grid has 11 fine levels (0-2000 at $200) plus 4 coarse levels, so E = 15, at regimes 1-4 (5+ is concluded).
     - Locked work grows from 7 to 61 level-units.
     - Unlocked work falls from 217 to 31 levels through R1-6 step 0(b).
     - Net about 1.07x the old operations, with far less memory because policies are lazy.
   - MFFU Rapid EOD: collapses to E = 1, about 0.16x the old operations because of the skips.
   - FTMO Growth-class plans: per-start from R1-6, plus E = 15 across 6 regimes, plus an idle radix of 30. Together that is about 18x the old operations. This is the price of exactness.
     - The knob cycleBaselineFineRangeMultiple = 0 (coarse only, E about 6) brings it to about 7x, at up to one drawdown ($2,000) of conservative understatement of cycle profit in the coarse region.
   - Memory with lazy policies: values only, for example about 0.8M Map entries for FTMO Growth.
- **Files:** src/lib/prop-calculator/core/FundedCycleBaselineGrid.ts, src/lib/prop-calculator/core/FundedStateValue.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/DayPolicy.ts, src/lib/prop-calculator/simulator/types.ts, src/lib/prop-calculator/simulator/day.ts, src/lib/prop-calculator/simulator/fundedPhase.ts, tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts, tests/unit/lib/prop-calculator/core/FundedCycleBaselineGrid.test.ts, tests/unit/lib/prop-calculator/core/Plan.test.ts, tests/unit/lib/prop-calculator/simulator/fundedPhase.test.ts
- **Tests first:**
  - FundedStateValue.test.ts, exact hand-computed baseline regression (fails today: 300 instead of 250).
   - Plan: onePayoutToyPlan().withOverrides({ maxConsecutiveIdleDays: undefined, maxLifetimePayouts: 2, minPayoutProfit: dollars(300), minPayoutProfitPerCycle: dollars(0.01), payoutRequestCap: dollars(150) }).
   - Config: actionStepMultiple 1, maxActionMultiple 1, cushionStepMultiple 0.5, rrRatio 1, winrate 1, tradesPerDay 1, evalInitialValue 0, feePerAttempt 0.
   - Deterministic path: day 1 ends at 1100 (unlocked). Day 2 ends at 1200 (locked at 1000). Day 3 ends at 1300 and pays min(300, 150) = 150, leaving 1150 (baseline $50 above the $1,100 floor). Day 4 ends at 1250 with real cycle profit 100 and pays 100, then the account concludes.
   - Expect initialValue toBeCloseTo(250, 10). The old floor-baseline DP pays 150 on day 4, for 300.
  - FundedStateValue.test.ts: simulate() with the DP dayPolicy on the same toy (winrate 1, seed 7, trials 100, fundedHorizonDays 50, maxEvalDays 1) gives expectedGrossPayout toBeCloseTo(250, 10) and equals the DP initialValue. This proves DP and tracker agree.
  - FundedStateValue.test.ts: the zero-cost collapse keeps MFFU Rapid EOD's initialValue pinned at 29505.52018082788 and its policy risks at [200,0,0,0] for payoutsIssued 0-2. Re-pin reachedStateCount with the measured value and an explanation.
  - FundedStateValue.test.ts: computeRisk on the ladder/cap toy throws when payoutsIssued >= 1 and lastPayoutBalance is omitted. With lastPayoutBalance 1150 it returns 100.
  - FundedStateValue.test.ts, a reachable unlocked post-payout plan: an onePayoutToyPlan variant with minRetainedCushionOverride dollars(50) (below amount 100) and PayoutFloorEffect.None. The DP initialValue matches simulate() within toBeCloseTo(..., 0) at 50,000 trials, seed 7. The solver must not throw its unreachable-state assertion.
  - FundedCycleBaselineGrid.test.ts. Options { min 0, fineStep 50, fineEnd 100, coarseStep 100, max 500 } give levels [0,50,100,200,300,400,500], so size 7. indexAtOrAbove(50) === 1, indexAtOrAbove(51) === 2, indexAtOrAbove(150) === 3, indexAtOrAbove(10_000) === 6. Negative min -300 with step 100 gives a first level of -300. The constructor throws for fineStep 0 and for min > max.
  - Plan.test.ts, canLeaveBalanceAbovePayoutFloor. False for MFFU Rapid EOD. True when exactly one of payoutLadder, payoutRequestCap, payoutBalanceShareCap, payoutCapOverride or payoutProfitShare is set.
  - simulator/fundedPhase.test.ts (new). Drive runFundedHorizon with computedDayPolicy that records its 6th argument, on the ladder/cap toy with winrate 1. After the first payout, the recorded lastPayoutBalance equals the tracker's post-debit balance (1150). Before any payout it equals the starting balance.
- **Depends on:** R1-6 (same functions, key layout, worker pair decode, lazy policy extraction, reachability skips and hoisted lockedThreshold; implement R1-6 first), R1-51 (if MFFU Pro's drawdown lock becomes payout-triggered via a PayoutFloorEffect or a new drawdown behaviour, isUnlockedPostPayoutReachable's exhaustive switch and allowsWithdrawalWhileUnlocked must cover it)
- **Risks:** (1) Runtime and memory figures are estimates from counting operations. The FTMO Growth-class regression, about 18x on operations at default grids, is the real cost of exactness. Measure it with coarse-grid vitest cases and report actual timings, not just the estimates.
(2) The coarse region of the baseline grid (above 1x drawdown by default) rounds the baseline up. In that region the DP is conservatively pessimistic by less than one drawdown. The bias is one-sided and documented, not exact.
(3) Overflow above max clamps together with the cushion top clamp that already exists. That is exact in cycle profit but drops cushion above maxCushionMultiple, which the DP already did before this change.
(4) The lockedPayoutFloor reference inherits the solver's existing assumption that every locked state sits at lockedThreshold. That assumption is only as good as the pre-existing code for ReleaseFloor plans whose lock threshold differs from accountSize. Not changed here.
(5) The DayPolicy.computeRisk positional signature grows to 6 arguments. Any other cluster changing DayPolicy must keep the argument order.
(6) reachedStateCount pins in FundedStateValue.test.ts (105, 39396) change by design. Re-measure them and document why; do not silently loosen them.


**Open questions**
- Should R1-6 also fix the eval DP? EvalStateValue.ts:198-206 has the same gap: no cap at the DLL headroom, though its lockout is correct. The item is not in the audit list, but the shared helper makes the fix about 10 lines, so it is in the design as R1-6 step 6. Confirm it stays in scope, or split it out as its own item.
- The eval DP also builds day-start states with peakDayCloseProfit 0 (EvalStateValue.ts:510). That leaves any Tiered isEffectiveNextSession eval DLL stuck on its lowest tier. It is not covered by R1-6/R1-7. Should the same peak-band treatment go into the eval DP, or should isEvalDpEligible refuse such plans? First check which eval DLLs are affected.
- What speed-for-exactness trade-off is acceptable for R1-7 on plans like FTMO Growth? By operation count, the exact baseline dimension with default settings costs about 18x there, or about 7x with cycleBaselineFineRangeMultiple = 0, which is at most one drawdown pessimistic in the coarse region. Builder is roughly neutral and Rapid EOD gets faster. Should optimize dp expose the knob, or default it lower for plans with a large idle-day radix?
- R1-43 and R1-54 are open decisions. Does 'effective next session' mean the prior session's close, which can fall back, or the peak close, which never falls back, for Apex EOD, Tradeify's scaling DLL and the Select contract tiers? The DP design handles both, but the answer decides whether the DP needs a peak band (a small extra state dimension) or just the per-start solve.

## Cluster `ladder` (R1-10, R1-9, R1-11, R1-8, R1-15, R1-13, R1-14)

**Shared contracts:** 1. D1 COST HELPER (owned by the engine-aggregates cluster, R1-2; consumed by the ladder in R1-8 and R1-15). Location: src/lib/prop-calculator/core/Replacement.ts, re-exported from core/index.ts. Signature: `export interface ReplacementEconomicsInput { discounts?: CouponDiscounts; evalPassRate: number; meanDaysOnFail: number; meanDaysOnPass: number; plan: Plan }` and `export function replacementEconomics(input: ReplacementEconomicsInput): ReplacementEconomics`, returning the existing { attemptsPerFundedAccount, costPerFundedAccount, daysPerFundedAccount }. Requirements: (a) pure and deterministic; (b) returns Infinity for all three fields when evalPassRate <= 0; (c) evalPassRate is the eval pass probability (D2), never the funded-survive rate; (d) for a plan with no subscription: costPerFundedAccount = eval*evalFactor + (1/p - 1) * min(reset*resetFactor, eval*evalFactor) + activation*activationFactor, with activation charged once; (e) daysPerFundedAccount = meanDaysOnPass + (1/p - 1) * meanDaysOnFail; (f) continuous in evalPassRate, meanDaysOnPass and meanDaysOnFail, so the ladder's finite-difference SE works. If that cluster picks another name or file, the ladder changes only its import.

2. LADDER API (owned here): LadderScoreConfig loses `evalPrice` and gains `discounts?: CouponDiscounts` and required `positionSizing: null | PositionSizingConfig`. `scoreLadder(ladder, config, trialRng: (trial: number) => Rng)`. New exports: `ladderTrialStreams(seed)`, `ladderGridConfigSchema`, `validateLadderGrid`, `ladderGridSize`, `MAX_LADDER_GRID_SIZE`. LadderScore gains passRateStandardError, expectedDaysToFundedStandardError and costPerFundedStandardError. DayOutcome gains `tradePnLs: readonly number[]`. enumerateDay options replace `cushion` with `dayStart: AccountState` and add drawdown, contractLimit and positionSizing. The web ScoreLaddersRequest drops evalPrice.

3. DRAWDOWN HIERARCHY: new `abstract intradayLockDistance(state: AccountState): number` on DrawdownStrategy. EodTrailing and Static return Infinity. IntradayTrailing returns the distance to its lock trigger, or Infinity when locked or without a lock. Any new DrawdownStrategy subclass must implement it.

4. SHARED DAY BOOKKEEPING: new src/lib/prop-calculator/core/TradingDayLedger.ts with applyTrade(plan, phase, state, pnl, peakPnL?) returning isBust, closeTradingDay(plan, phase, state, isTraded) returning isBust, and recordBestDay(state). simulator/day.ts runDay and simulator/evalPhase.ts are refactored onto it. Clusters working on R1-6 (funded DLL), R1-43 (Apex DLL freeze), R1-26/R1-28 (path granularity) must build on this extraction and not re-inline the logic.

5. CLI: TradingInputs gains a `discounts` getter in src/cli/commands/prop/shared.ts, reused by toSimInputs. The R1-24 cluster, which bounds the discount flags, edits the same class. ladder/command.ts exports the pure helpers readLadderGrid, buildLadderSearchOptions, ladderTableRow and ladderWorkWarning for tests. stats.ts gains binomialStandardError, meanStandardError, propagatedStandardError and the Estimate interface, available for sim or compare SE work.

6. D2 LABELS: the ladder CLI column becomes 'eval pass' here. The R1-30 cluster owns the web LadderLabPanel.tsx 'Pass%' header (rename to 'Eval pass%') and all SimOutputs labels.

BUILD ORDER for this cluster: R1-13 -> R1-14 -> R1-10 -> R1-11 + R1-9 (one pass: TradingDayLedger extraction first with the sim suites green, then the enumerateDay/runLadderAttempt rewrite) -> R1-8 (after R1-2's helper lands) -> R1-15. Verification per step: bunx vitest run on the touched test files, bun run typecheck and bun run lint, plus timed CLI runs (`bun run cli prop ladder --firm apex --variant intraday --stop none --lo 400 --max 400 --rungs 4 --eval-days 21` against `bun run cli prop sim` with --ladder 400,400,400,400 --stop none, and the default apex eod ladder wall time before and after, within 2x).


### R1-13
- **Root cause:** src/cli/commands/prop/ladder/command.ts:82 reads --step with readNumber (src/cli/commands/prop/shared.ts:562). readNumber is a bare z.coerce.number(), so an empty --step= also coerces to 0, and it never checks the sign. src/lib/prop-calculator/core/LadderSearch.ts:90 `for (let v = lo; v <= max; v += step) values.push(v);` never ends when step <= 0 and keeps growing `values` until the process runs out of memory. Neither the engine nor the CLI has a guard. The web path calls the same unguarded buildLadderGrid at src/app/(app)/prop-calculator/_components/useLadderSearch.ts:116-117.
- **Design:** ENGINE GUARD (fail loud, shared by CLI and web), in src/lib/prop-calculator/core/LadderSearch.ts. (1) Add `export const ladderGridConfigSchema = z.object({ lo: z.number().finite().positive(), max: z.number().finite(), slots: z.number().int().positive(), step: z.number().finite().positive() }).refine((c) => c.max >= c.lo, { message: 'max must be >= lo', path: ['max'] })`. zod is already a core dependency through core/lib/units.ts. (2) Add `export function validateLadderGrid(config: LadderGridConfig): LadderGridConfig`, which parses with the schema and throws Error('ladder grid: <field> <message>') on failure. (3) buildLadderGrid calls validateLadderGrid first. It then builds the value list by index instead of by accumulation: count = Math.floor((max - lo) / step + 1e-9) + 1 and values = Array.from({ length: count }, (_, i) => lo + i * step). That removes float drift and any unbounded loop. CLI, in src/cli/commands/prop/ladder/command.ts. (4) Export `readLadderGrid(args, plan): LadderGridConfig`. It builds { lo, max, slots: rungs, step } from the raw args; the --max default stays Math.round(plan.drawdown.amount * 0.4). It parses with ladderGridConfigSchema and maps each zod issue path to its flag name (slots maps to --rungs). The resulting messages are: '--step must be > 0, got "0"', '--rungs must be a positive integer, got "2.5"', '--lo must be > 0', '--max must be >= --lo'. (5) Parse --top the same way with z.coerce.number().int().positive() and the message '--top must be a positive integer'. (6) run() calls readLadderGrid before starting the spinner, so bad input exits with code 1 through the existing catch block. The CLI and the engine share one schema (DRY), so the rule cannot drift between them.
- **Files:** src/lib/prop-calculator/core/LadderSearch.ts, src/lib/prop-calculator/core/index.ts (export ladderGridConfigSchema, validateLadderGrid), src/cli/commands/prop/ladder/command.ts, tests/unit/lib/prop-calculator/core/LadderGrid.test.ts (new), tests/unit/cli/prop/ladder.test.ts (new)
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/LadderGrid.test.ts: validateLadderGrid throws /step/ for step 0, step -100, step NaN and step Infinity. It throws /slots|rungs/ for slots 0, -1 and 2.5, /lo/ for lo 0 and lo -100, and /max/ for {lo: 300, max: 200}. It returns the config unchanged for {lo: 100, max: 800, slots: 4, step: 100}. Write this RED test first against validateLadderGrid. A buildLadderGrid({step: 0}) test can only be added after the guard exists, because before that it runs the Vitest worker out of memory instead of failing.
  - tests/unit/lib/prop-calculator/core/LadderGrid.test.ts: after the guard lands, buildLadderGrid({lo: 100, max: 200, slots: 2, step: 0}) and ({..., step: -100}) throw synchronously.
  - tests/unit/lib/prop-calculator/core/LadderGrid.test.ts: floating step. buildLadderGrid({lo: 0.1, max: 0.3, slots: 1, step: 0.1}) returns exactly 3 single-rung ladders, including 0.3.
  - tests/unit/cli/prop/ladder.test.ts: readLadderGrid with parsed citty args (the optimizeDp.test.ts pattern: parseArgs plus the command's args) throws '--step must be > 0' for --step 0, --step=-50 and --step= (empty), throws '--rungs must be a positive integer' for --rungs 2.5, throws '--lo must be > 0' for --lo 0, throws for --max 50 --lo 100, and throws '--top must be a positive integer' for --top 0. For a valid apex eod 50K run with no --max it returns {lo: 100, max: 800, slots: 4, step: 100} (TG-8: the default max is 40% of the $2,000 cushion, and no fields are swapped).
- **Depends on:** R1-24 (soft: if that cluster adds generic bounded readers such as readPositiveInteger to shared.ts, readLadderGrid reuses them for --top; the grid itself always goes through ladderGridConfigSchema)
- **Risks:** Low. Callers that relied on max < lo silently producing an empty grid now get an error. The web useLadderSearch currently handles an empty grid with a Failed state, and after this change it needs a try/catch (see R1-14). The lo > 0 rule is new; a 0 rung is already meaningless because canonicaliseLadder drops rungs <= 0.


### R1-14
- **Root cause:** src/lib/prop-calculator/core/LadderSearch.ts:87-110 (buildLadderGrid) enumerates sum_{k=1..slots} n^k ladders, where n = floor((max-lo)/step)+1. It has no size bound, unlike the CLI's MAX_PATH_GRANULARITY (shared.ts:600). The whole grid is materialised in memory before any scoring, then canonicalised (line 450) and scored at sims trials each (lines 454-460). A fractional --rungs (command.ts:81, readNumber only) never satisfies `prefix.length === slots` at line 95, so it recurses until 'Maximum call stack size exceeded'. Measured: the default apex eod grid has 4,680 ladders; --step 50 --rungs 4 has 54,240; --step 50 --rungs 5 has 813,615 (about 30+ min at 4,000 trials); --step 10 --rungs 4 has about 41.5M (runs out of memory). The CLI prints the size only after the search finishes (command.ts:114-116).
- **Design:** (1) In core/LadderSearch.ts, add `export const MAX_LADDER_GRID_SIZE = 1_000_000` and `export function ladderGridSize(config: LadderGridConfig): number`. ladderGridSize calls validateLadderGrid, then returns sum_{k=1..slots} n^k in closed form, computed with a loop that stops early once the total passes MAX_LADDER_GRID_SIZE so the number never overflows. (2) buildLadderGrid calls ladderGridSize before allocating anything. Above the cap it throws Error(`ladder grid has ${size.toLocaleString()} ladders, above the ${MAX_LADDER_GRID_SIZE.toLocaleString()} limit: raise --step, lower --rungs or narrow --lo/--max`). The fractional-rungs stack overflow is already prevented by R1-13's slots int().positive() rule. (3) CLI, ladder/command.ts: after readLadderGrid, compute `const work = ladderGridSize(grid) * inputs.trials`. When work > LADDER_WORK_WARNING (500_000_000 ladder-trials, a CLI-local constant) call ui.warn(`scoring ${size} ladders x ${trials} trials; expect a long run (reduce --rungs/--trials or raise --step)`) before the spinner starts. Print the raw grid size up front, not only after the search. (4) Web, useLadderSearch.ts run(): compute the grid once (it currently builds it twice at lines 116-117) inside try/catch, and on error setState({ phase: Failed, reason: error.message }). A throw inside a click handler would otherwise leave the panel stuck.
- **Files:** src/lib/prop-calculator/core/LadderSearch.ts, src/lib/prop-calculator/core/index.ts (export ladderGridSize, MAX_LADDER_GRID_SIZE), src/cli/commands/prop/ladder/command.ts, src/app/(app)/prop-calculator/_components/useLadderSearch.ts, tests/unit/lib/prop-calculator/core/LadderGrid.test.ts, tests/unit/cli/prop/ladder.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/LadderGrid.test.ts: ladderGridSize({lo: 100, max: 800, slots: 4, step: 100}) === 4680; ({lo: 100, max: 800, slots: 4, step: 50}) === 54240; ({lo: 100, max: 800, slots: 5, step: 50}) === 813615. These match the reviewers' live CLI counts.
  - tests/unit/lib/prop-calculator/core/LadderGrid.test.ts: buildLadderGrid(c).length === ladderGridSize(c) for c in {100-300 step 100 slots 1..3} and {lo 100, max 800, slots 4, step 100}.
  - tests/unit/lib/prop-calculator/core/LadderGrid.test.ts: buildLadderGrid({lo: 10, max: 800, slots: 4, step: 10}) (n=80, about 41.5M) throws /above the 1,000,000 limit/ and returns within 100ms, which proves it throws before allocating. ladderGridSize({lo: 1, max: 1e6, slots: 10, step: 1}) returns a finite number > MAX_LADDER_GRID_SIZE with no overflow to Infinity.
  - tests/unit/lib/prop-calculator/core/LadderGrid.test.ts: buildLadderGrid({lo: 100, max: 200, slots: 2.5, step: 100}) throws the rungs message instead of 'Maximum call stack size exceeded'.
  - tests/unit/cli/prop/ladder.test.ts: an exported pure helper `ladderWorkWarning(gridSize, trials): string | null` returns null for (4680, 4000) and a message containing '813,615' for (813615, 4000).
- **Depends on:** R1-13 (shares ladderGridConfigSchema/validateLadderGrid)
- **Risks:** The 1,000,000 cap blocks nothing the reviewers called legitimate (813,615 passes), but it is a policy value; see open_questions. The web panel has its own inputs; a user who enters a huge grid now sees a Failed message instead of a frozen tab, and the user must check that UI change themselves. The warning threshold depends on the machine; it is only advisory.


### R1-10
- **Root cause:** src/lib/prop-calculator/core/LadderSearch.ts:357 `for (let day = 1; day <= maxDays; day++)` runs up to the raw maxDays. It comes from ladder/command.ts:92 `maxDays: inputs.maxEvalDays` (default 150, shared.ts:430-433) and, in the web worker, from ladderWorker.ts:38. Nothing calls plan.evalDayCap() (Plan.ts:553-557), unlike simulator/evalPhase.ts:52, EvalStateValue.ts:100 and RenewalCycleObjective.ts:73. Apex EOD and Intraday set maxEvalTradingDays = 21 (ApexTraderFunding.ts:75,144,200). Attempts the firm would expire at day 21 keep trading and often count as passes. Apex intraday [200], day-green, seed 42, 4,000 trials: 65.8% pass / $468 per acct uncapped vs 9.2% / $3,348 with --eval-days 21. meanDaysOnFail for timeouts also uses the raw 150 (line 395).
- **Design:** (1) In scoreLadder, compute `const dayCap = plan.evalDayCap(maxDays)` once and pass dayCap (not maxDays) to runLadderAttempt. The timeout branch returns endDay: dayCap, so meanDaysOnFail and the days/cost figures reflect the capped window. This mirrors simulator/evalPhase.ts:52 exactly, and both CLI and web get it because the clamp sits inside scoreLadder. (2) CLI header, ladder/command.ts: print the effective window, `eval days ${plan.evalDayCap(inputs.maxEvalDays)}` with the suffix ' (plan cap)' when it is below --eval-days. The user can then see why the numbers differ from an uncapped run. No new types are needed.
- **Files:** src/lib/prop-calculator/core/LadderSearch.ts, src/cli/commands/prop/ladder/command.ts, tests/unit/lib/prop-calculator/core/LadderSearchEvalDayCap.test.ts (new)
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/LadderSearchEvalDayCap.test.ts: Apex Intraday 50K (ApexTraderFunding().findPlan variant Intraday). scoreLadder([200], {maxDays: 150, stopRule day-green, winrate 0.4, rr 2, sims 4000}, ladderTrialStreams(42)) deep-equals scoreLadder with maxDays: 21 and the same seed. RED today: 65.8% vs 9.2%.
  - Same file: for the same capped run, passRate < 0.15 and meanDaysOnPass <= 21.
  - Same file: Apex EOD 50K [200] day-green, 20,000 trials, maxDays 150. scoreLadder.passRate is within 0.02 of simulate()'s eval pass rate (1 - bustProbability - timeoutProbability) with evalDayPolicy {ladder [200], day-green}, maxEvalDays 150, fundedHorizonDays 1, maxAttempts 1, 20,000 trials. Uses the pattern of ladderSearch.test.ts:222-280.
  - Same file: MFFU Rapid EOD (no maxEvalTradingDays). scoreLadder with maxDays 60 is unchanged vs maxDays 60 passed raw, so the cap is inert when the plan has none.
- **Depends on:** none
- **Risks:** Very low and local. Every Apex ladder figure (pass, days, $/acct) changes a lot. That change is the intended fix, and it moves ladder output into agreement with prop sim. The web LadderLab gets the fix without any change of its own.


### R1-11
- **Root cause:** LadderScoreConfig (src/lib/prop-calculator/core/LadderSearch.ts:44-56) has no position-sizing input. enumerateDay (lines 161-165) passes the rung straight to resolveTradeRisk(intended, affordable, rungSizing) without capRiskToContractLimit (core/PositionSizing.ts:15-29). The simulator (simulator/day.ts:131-149), EvalStateValue.ts:193 and FundedStateValue.ts:504 all apply it. ladder/command.ts never reads inputs.stopPoints. --instrument (command.ts:71) only feeds the display-only 'min stop' column (lines 118-141), although the shared help text (shared.ts:383-386) says --stop-points enables contract-limit enforcement. Apex 50K EOD ladder [500] with --stop-points 1 --instrument MNQ scores 42.5% pass, identical to no flags. sim caps the same run at 60 micros x $2 x 1pt = $120 and shows 0.1%.
- **Design:** (1) LadderScoreConfig gains `positionSizing: null | PositionSizingConfig`. It is required, so every caller must decide explicitly. (2) enumerateDay options gain `contractLimit: ContractCount | null` and `positionSizing: null | PositionSizingConfig`. Per rung, mirroring day.ts:131-149 in order: `const contractCappedRisk = positionSizing === null ? intended : capRiskToContractLimit(intended, positionSizing, contractLimit); const risk = resolveTradeRisk(contractCappedRisk, affordable, rungSizing);`. (3) scoreLadder computes the eval limit once: `const contractLimit = positionSizing === null ? null : resolveContractLimit(plan.contractLimits, TradingPhase.Eval, positionSizing.instrument.isMicro, 0)`. The eval branch of resolveContractLimit ignores profit, so it is constant for the whole attempt and does not need to be in the distribution cache key. (4) CLI: `const positionSizing = resolvePositionSizing(inputs.instrument, inputs.stopPoints)`, the same call engine.ts:59 makes, passed into score. The existing min-stop column stays. When positionSizing is set, the grid header adds `sizing ${instrument.symbol} @ ${stopPoints}pt, eval cap ${contractLimit} contracts ($${cap} max risk)` so the cap is visible. (5) Web: ladderWorker.ts passes positionSizing: null, because the web LadderLab has no stop-points input today and its behaviour stays unchanged. (6) To keep this testable and to cover TG-8, the CLI option wiring moves into an exported pure function `buildLadderSearchOptions(plan: Plan, args): LadderSearchOptions` in ladder/command.ts. run() calls it.
- **Files:** src/lib/prop-calculator/core/LadderSearch.ts, src/cli/commands/prop/ladder/command.ts, src/app/(app)/prop-calculator/_workers/ladderWorker.ts, tests/unit/lib/prop-calculator/ladderSearch.test.ts (add positionSizing: null to config() and the inline configs, and contractLimit/positionSizing to the enumerateDay calls), tests/unit/lib/prop-calculator/rngDrawCount.test.ts (config gains positionSizing: null), tests/unit/lib/prop-calculator/core/LadderSearchContractLimits.test.ts (new), tests/unit/cli/prop/ladder.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/LadderSearchContractLimits.test.ts: enumerateDay with ladder [500], stop none, rr 2, wr 0.4, positionSizing {instrument: INSTRUMENTS.MNQ, stopPoints: points(1)}, contractLimit 60, a $2,000 cushion (EOD drawdown). Exactly 2 outcomes, finalPnL values {240, -120}, min worstPnL -120. With positionSizing null: {1000, -500}.
  - Same file: contractLimit null with positionSizing set leaves risk uncapped ({1000, -500}), matching capRiskToContractLimit's null branch.
  - Same file: Apex EOD 50K, scoreLadder([500], sims 4000, day-green, maxDays 150). positionSizing MNQ/1pt gives passRate < 0.02 and costPerFunded === Infinity (the sim reports 0.1%). positionSizing null gives passRate > 0.3. RED today: both are 42.5%.
  - Same file: positionSizing MNQ/25pt (cap 60 x 2 x 25 = $3,000, which does not bind) gives exactly the same LadderScore as positionSizing null with the same seed.
  - tests/unit/cli/prop/ladder.test.ts: buildLadderSearchOptions(apexEod, parse('--stop-points 1 --instrument MNQ')).score.positionSizing deep-equals {instrument: INSTRUMENTS.MNQ, stopPoints: 1}. Without --stop-points it is null. Also asserts score.maxDays === --eval-days, score.sims === --trials, seed === --seed and grid fields not swapped (TG-8).
- **Depends on:** R1-9 (both change the enumerateDay signature and the rung-sizing block; implement in the same pass)
- **Risks:** Low. With sizing flags set, ladder output for affected plans drops sharply; that is intended and matches sim. Plans with contractLimits null are unaffected (resolveContractLimit returns null). The web path stays uncapped until LadderLab gets its own stop/instrument inputs; this is a known gap, listed in open_questions.


### R1-9
- **Root cause:** runLadderAttempt (src/lib/prop-calculator/core/LadderSearch.ts:351-395) hand-rolls an end-of-day trailing model for every plan. floor = Math.min(peak, lockTrigger) - mll (358-360), peak and isLocked update only from the day-close balance (382-383), and the lock values come from plan.drawdown.lock (252-254). enumerateDay (126-200) records only finalPnL/worstPnL, never the intraday peak. Its cushion is remaining = cushion + dayPnL (147), which ignores the intraday ratchet. The real per-trade behaviour, IntradayTrailingDrawdown.onTrade (core/DrawdownStrategy.ts:100-112, which ratchets the threshold to the post-trade peak and locks on peak profit), is never used, and neither the ladder CLI nor the engine gates on DrawdownKind. On Apex/Lucid intraday eval plans, any ladder or stop rule that can give back an intraday gain (stop none, after-k-losses, after-target) gets too low a floor. Apex Intraday [400x4], stop none, 21 days: ladder 50.5% vs sim 42.7%; the EOD control agrees within 1pp. The same hand-rolled model also hides Static drawdown and ignores ConsistencyViolationEffect.DoubleTarget; TakeProfitTrader.ts:47 documents that last gap.
- **Design:** Model the eval day at trade granularity through the plan's own DrawdownStrategy, with no kind conditionals. PART A, a new DrawdownStrategy member (extends the hierarchy): `abstract intradayLockDistance(state: AccountState): number` in core/DrawdownStrategy.ts. EodTrailingDrawdown and StaticDrawdown return Infinity, because their threshold cannot move or lock intraday. IntradayTrailingDrawdown returns `state.thresholdLocked || this.lock === undefined ? Infinity : state.startingBalance + this.lock.atProfit - state.balance`. PART B, shared per-trade and day-close bookkeeping (DRY with the simulator, required by CLAUDE.md), in a new file src/lib/prop-calculator/core/TradingDayLedger.ts: (1) `applyTrade(plan: Plan, phase: TradingPhase, state: AccountState, pnl: number, peakPnL?: number): boolean`: state.balance += pnl; state.todayPnL += pnl; plan.drawdownFor(phase).onTrade(state, pnl, peakPnL); return plan.isBust(state, phase). (2) `closeTradingDay(plan, phase, state, isTraded): boolean`: moves simulator/day.ts:207-223 verbatim (elapsedDays and tradingDays for Eval, consecutiveIdleDays, qualifyingDays, onDayClose, recordDayClosePeak), returning plan.isBust. (3) `recordBestDay(state): void`: moves evalPhase.ts:71-73. simulator/day.ts runDay switches to applyTrade (keeping stats.recordTrade and lossesToday inline; passing peakPnL undefined triggers onTrade's default, so the if/else at 179-183 goes away) and to closeTradingDay; the idle-closure check stays in runDay. evalPhase.ts uses recordBestDay. PART C, enumerateDay: options replace `cushion: number` with `dayStart: AccountState` and add `drawdown: DrawdownStrategy` (plus R1-11's contractLimit/positionSizing). DayOutcome gains `tradePnLs: readonly number[]`, the per-trade PnL in order; finalPnL and worstPnL are kept. walk() carries a cloned AccountState per branch: remaining = state.balance - state.threshold; after each trade it clones, adds pnl to balance, and calls drawdown.onTrade(next, pnl). The intraday ratchet and intraday lock therefore shrink remaining exactly as the sim does, and capToCushion/skip sizing uses the true intraday cushion. The existing `remaining <= 0` stop ends a busted branch. PART D, scoreLadder cache key and synthetic day-start state: `maxDayGain = uncappedThreshold * rrRatio`, cushionBucket as today, and `lockBucket = Math.min(floorToBucket(Math.max(0, drawdown.intradayLockDistance(state))), maxDayGain + bucket)`. Key = `${cushionBucket}:${lockBucket}:${dll ?? 'none'}`. The synthetic dayStart is deterministic per key: startingBalance = plan.accountSize, balance = accountSize + (drawdown.lock?.atProfit ?? 0) - lockBucket, threshold = balance - cushionBucket, thresholdLocked = state.thresholdLocked. For EOD and Static, intradayLockDistance is Infinity, so there is one lock bucket and the cache size is unchanged. PART E, runLadderAttempt is rewritten on a real AccountState: `const state = plan.initialState(); const drawdown = plan.drawdownFor(TradingPhase.Eval)`. For each day up to dayCap (from R1-10): resetForNewDay(state); dll = resolveDailyLossLimit(plan.dailyLossLimitFor(Eval), plan.dailyLossLimitContext(state)); draw = sampleDay(distributionFor(state, dll), rng()), still exactly one draw per day; for each pnl in draw.tradePnLs, if applyTrade(plan, Eval, state, pnl) returns true, return fail at this day; recordBestDay(state); if closeTradingDay(plan, Eval, state, draw.tradePnLs.length > 0) returns true, fail; if plan.isPassed(state), pass. The attempt thereby reuses Plan.isPassed (consistency including DoubleTarget), Plan.isBust (drawdown plus terminating DLL on live context, as the sim does), and the strategy's lock semantics. The hand-rolled peak, lockTrigger, lockedFloor, bestDay and consistency locals, and the scoreLadder lines that compute them (250-257), are deleted. PART F, notes and CLI: TakeProfitTrader.ts:47 states LadderSearch treats consistency violations as outright failure. That becomes false, so the sentence is replaced with one saying the ladder now uses Plan.isPassed. ladder/command.ts adds `drawdown ${plan.drawdown.kind}` to its header line.
- **Files:** src/lib/prop-calculator/core/DrawdownStrategy.ts, src/lib/prop-calculator/core/TradingDayLedger.ts (new), src/lib/prop-calculator/core/index.ts (export applyTrade, closeTradingDay, recordBestDay), src/lib/prop-calculator/core/LadderSearch.ts, src/lib/prop-calculator/simulator/day.ts, src/lib/prop-calculator/simulator/evalPhase.ts, src/lib/prop-calculator/firms/tpt/TakeProfitTrader.ts (note text at line 47 only), src/cli/commands/prop/ladder/command.ts, tests/unit/lib/prop-calculator/ladderSearch.test.ts (enumerateDay calls switch from cushion to dayStart/drawdown), tests/unit/lib/prop-calculator/core/DrawdownTransitions.test.ts (intradayLockDistance cases), tests/unit/lib/prop-calculator/core/TradingDayLedger.test.ts (new), tests/unit/lib/prop-calculator/core/LadderSearchIntradayTrailing.test.ts (new)
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/DrawdownTransitions.test.ts: intradayLockDistance on a fresh state with amount 2000 and lock atProfit 2100 is 2100 for IntradayTrailingDrawdown, and Infinity for EodTrailingDrawdown and StaticDrawdown with the same lock. After thresholdLocked = true, IntradayTrailing returns Infinity. With balance start+500 it returns 1600.
  - tests/unit/lib/prop-calculator/core/LadderSearchIntradayTrailing.test.ts (sizing): enumerateDay with ladder [1500, 2500], rr 2, wr 0.5, stop none, capToCushion, dayStart at peak with a $2,000 cushion. With EodTrailingDrawdown(2000) the win-then-loss outcome has tradePnLs [3000, -2500]. With IntradayTrailingDrawdown(2000) it has tradePnLs [3000, -2000], because the threshold ratcheted after the +3000 and the second rung is capped to the true $2,000 cushion.
  - Same file (breach at trade granularity, deterministic): the plan is MFFU Rapid EOD 50K withOverrides({ drawdown: new IntradayTrailingDrawdown({ amount: dollars(2000) }), profitTarget: dollars(3000), minTradingDays: 1, consistency: undefined, eval DLL none }). Ladder [1000, 2000], rr 2, wr 0.5, stop none, sims 1, maxDays 2, trialRng returning a scripted stream [0.4, 0.1] (outcome order W-W, W-L, L-W, L-L at 0.25 each, so 0.4 picks W-L and 0.1 picks W-W). Intraday result: passRate 0, meanDaysOnFail 1 (after +2000 the threshold ratchets to start and the -2000 hits it). The same plan with EodTrailingDrawdown(2000) gives passRate 1 and meanDaysOnPass 2. RED today: both give 1.
  - Same file (sim parity, the reviewers' repro): Apex Intraday 50K, ladder [400, 400, 400, 400], stop none, wr 0.4, rr 2, maxDays 21, sims 20,000. |scoreLadder.passRate - simEvalPass| < 0.02, where simEvalPass = 1 - bust - timeout from simulate() with evalDayPolicy {same ladder, stop none}, maxEvalDays 21, fundedHorizonDays 1, maxAttempts 1, no path granularity, 20,000 trials. RED today: 50.5% vs 42.7%. The Apex EOD control also stays within 0.02 (51.8% vs 52.5% today).
  - Same file: TPT DoubleTarget. For TakeProfitTrader's eval plan, a scripted-rng attempt whose best day exceeds 50% of a profit >= target but below 2x target keeps trading instead of stopping as a fail when the day cap is not reached, matching Plan.isPassed.
  - tests/unit/lib/prop-calculator/core/TradingDayLedger.test.ts: applyTrade on apex intraday state: +500 moves threshold from start-2000 to start-1500 and returns false. -2000 from a $2,000 cushion returns true. With a terminating eval DLL of 1000, a -1000 trade returns true (plan.isBust). closeTradingDay increments tradingDays and elapsedDays in Eval only when isTraded and runs onDayClose (EOD threshold ratchets).
  - Regression guard (existing, must stay green): tests/unit/lib/prop-calculator/engineCharacterization.test.ts, rngDrawCount.test.ts (eval-with-retries pin 261 and timeline pin unchanged), simulator.test.ts, and ladderSearch.test.ts golden values (MFFU Rapid EOD, EOD drawdown, so results should match within the existing tolerance).
- **Depends on:** R1-10 (dayCap passed into the rewritten runLadderAttempt), R1-11 (same enumerateDay signature change; do them together), R1-43 (soft: the replay uses plan.isBust with live DLL context like the sim, so R1-43's freeze-at-prior-close fix carries over to the ladder automatically), R1-6 / R1-26 / R1-28 (coordination only: any cluster editing simulator/day.ts must edit on top of the applyTrade/closeTradingDay extraction)
- **Risks:** (1) The extraction touches the simulator hot path. It must be byte-for-byte equivalent in effect, which engineCharacterization and rngDrawCount pins will catch. stats.recordTrade reads balance, which onTrade does not change, so reordering is safe. (2) Performance: each sampled day now replays up to `rungs` trades through plan.isBust instead of one comparison. Budget: the default `cli prop ladder --firm apex --variant eod` wall time must stay within 2x of the pre-change run, timed by the implementer; the web worker is affected the same way. (3) Lock-bucket cache entries grow only for intraday-trailing plans with an unlocked lock, bounded by (maxDayGain/50 + 2) x cushion buckets. (4) Sizing still uses bucketed state (the same approximation as today); breach and pass are decided exactly on the real state. (5) Slight shifts for EOD plans, because tradingDays now counts only traded days and bestDayProfit starts at 0 (Plan semantics). The rngDrawCount ladder pin (2090) may move; if so, re-pin it with an explanation, never loosen it silently. (6) The TPT note is displayed data in `prop plans` and must be kept accurate.


### R1-8
- **Root cause:** ladder/command.ts:91 builds evalPrice = plan.fees.oneTimeEval + plan.fees.activation, and the web does the same at useLadderSearch.ts:200-202. scoreLadder (src/lib/prop-calculator/core/LadderSearch.ts:303-312) then charges `(evalPrice + monthlySubscription * ceil(meanDaysOnPass/21)) * (1/passRate)`. That bills the activation fee on every failed attempt, although it is only paid once on passing (Apex eod.md). It never reads plan.fees.reset, so every retry is priced as a fresh purchase even when a reset is cheaper: Lucid daily-eod-dll is $165 eval / $115 reset, printing $391 vs about $323. It also ignores coupon discounts that the ladder CLI accepts through tradingArguments. Lines 303 and 312 also duplicate Replacement.ts:21-25's attempts/days formula (a DRY violation), and the sim has the same activation and reset errors (engine.ts:213-219). Binding decision D1 requires one shared formula for sim, ladder and compare.
- **Design:** Remove the local cost formula and consume the engine-aggregates cluster's D1 helper (see shared_contracts): `replacementEconomics(input: ReplacementEconomicsInput): ReplacementEconomics` in core/Replacement.ts, where ReplacementEconomicsInput = { plan: Plan; discounts?: CouponDiscounts; evalPassRate: number; meanDaysOnPass: number; meanDaysOnFail: number }. (1) LadderScoreConfig drops `evalPrice` and gains `discounts?: CouponDiscounts`. (2) scoreLadder, for scorable ladders: `const economics = replacementEconomics({ discounts, evalPassRate: passRate, meanDaysOnFail, meanDaysOnPass, plan }); costPerFunded = economics.costPerFundedAccount; expectedDaysToFunded = economics.daysPerFundedAccount`. That also removes the duplicated days formula. The TRADING_DAYS_PER_MONTH import leaves LadderSearch. The MIN_SCORABLE_PASS_RATE Infinity branch stays as is. (3) CLI: TradingInputs gains a `get discounts(): CouponDiscounts | undefined` accessor that holds the expression now inline in toSimInputs (shared.ts:~336-350); toSimInputs uses it too (DRY). buildLadderSearchOptions passes `discounts: inputs.discounts`, so --eval-discount, --activation-discount and --monthly-discount now take effect in ladder. (4) Web: ScoreLaddersRequest (ladderWorkerMessages.ts:36) drops evalPrice, useLadderSearch.ts stops sending it, and ladderWorker.ts stops forwarding it. The worker already resolves the Plan from planId, so the helper gets real fees. (5) The existing test 'scoreLadder folds the monthly subscription into costPerFunded' (ladderSearch.test.ts:604-640) drops evalPrice from its config; its assertions stay valid.
- **Files:** src/lib/prop-calculator/core/LadderSearch.ts, src/cli/commands/prop/ladder/command.ts, src/cli/commands/prop/shared.ts (TradingInputs.discounts getter; toSimInputs reuses it), src/app/(app)/prop-calculator/_workers/ladderWorker.ts, src/app/(app)/prop-calculator/_workers/ladderWorkerMessages.ts, src/app/(app)/prop-calculator/_components/useLadderSearch.ts, tests/unit/lib/prop-calculator/ladderSearch.test.ts (drop evalPrice from config() and inline configs), tests/unit/lib/prop-calculator/rngDrawCount.test.ts (drop evalPrice), tests/unit/lib/prop-calculator/core/LadderSearchCost.test.ts (new), tests/unit/cli/prop/ladder.test.ts, tests/unit/cli/prop/shared.test.ts (discounts getter)
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/LadderSearchCost.test.ts (wiring): for MFFU Rapid EOD, Lucid daily-eod-dll, Apex EOD and FTMO Growth 50K, scoreLadder([400, 600, 500], sims 4000, seed 90210) gives costPerFunded === replacementEconomics({plan, discounts: undefined, evalPassRate: s.passRate, meanDaysOnPass: s.meanDaysOnPass, meanDaysOnFail: s.meanDaysOnFail}).costPerFundedAccount, and expectedDaysToFunded === .daysPerFundedAccount (exact equality).
  - Same file (D1 concrete, no subscription): the plan is MFFU Rapid EOD withOverrides({ fees: { oneTimeEval: dollars(100), reset: dollars(40), activation: dollars(50), monthlySubscription: dollars(0) } }). costPerFunded is close (1e-6) to 100 + (1/p - 1) * 40 + 50 for the returned p. RED today: the formula gives 150/p (for example p = 0.47 gives $319.15 vs the correct $235.11).
  - Same file (reset more expensive than re-buy uses the cheaper legal path): fees { oneTimeEval 100, reset 120, activation 0 } gives costPerFunded close to 100/p.
  - Same file (Lucid daily-eod-dll, reviewer C repro): with 0 activation and 0 subscription, costPerFunded close to 165 + (1/p - 1) * 115 and strictly below 165/p whenever p < 1.
  - Same file (activation once): Apex EOD 50K ladder [400, 800] gives costPerFunded - (plan.fees.activation) close to replacementEconomics with activation zeroed. That is, activation is not multiplied by 1/p (reviewer B: $1,528 today vs about $1,358).
  - Same file (discounts): evalPercent 50 on the synthetic plan gives costPerFunded close to 50 + (1/p - 1) * min(40, 50) + 50.
  - tests/unit/cli/prop/ladder.test.ts: buildLadderSearchOptions with --eval-discount 50 --activation-discount 10 gives score.discounts {evalPercent: 50, activationPercent: 10, monthlySubscriptionPercent: 0}; with no flags, undefined. score has no evalPrice key.
  - tests/unit/cli/prop/shared.test.ts: TradingInputs.parse(args).discounts deep-equals toSimInputs(plan).discounts for both zero and non-zero discount flags.
- **Depends on:** R1-2 (engine-aggregates cluster owns the D1 replacementEconomics rewrite; this item must land after it, or against the agreed signature in shared_contracts), R1-50 (Builder reset fee $0 vs no-reset rule: the helper's cheaper-legal-path choice is only correct once plan fee data encodes no-reset plans correctly), R1-37 / R1-41 / R1-42 (fee data corrections flow in automatically)
- **Risks:** $/acct figures change for every plan with a nonzero activation fee, a reset cheaper than the eval, or a subscription. Within one plan, byCost ordering is unchanged for non-subscription plans (cost stays monotone in p), so only absolute dollars move. If the other cluster names the helper differently, only the import changes. The formula itself must not be re-implemented here. Removing evalPrice is a breaking type change for the web worker message; web and CLI must change in the same commit (the user commits).


### R1-15
- **Root cause:** runLadderSearch (src/lib/prop-calculator/core/LadderSearch.ts:454-456) seeds each candidate with `mulberry32(deriveSubSeed(seed, index, 0))`, keyed on its grid index. The web worker does the same with firstIndex + offset (ladderWorker.ts:52-54). Candidates are therefore scored on independent noise, so pairwise comparisons carry full Monte Carlo variance, and one ladder gets a different estimate whenever the grid bounds shift its index. LadderScore (lines 35-42) and LadderSearchResult carry only point estimates, and the CLI tables (ladder/command.ts:159-190) and frontier (146-150) print no uncertainty. Reviewer C: topstep standard-standard, 3 rungs, 2,000 trials, seed 1 vs 2 swaps the #1 cheapest ($312 vs $311, SE about $5) and changes most of the frontier, with nothing in the output to show the rows are statistically tied.
- **Design:** COMMON RANDOM NUMBERS: (1) New export in LadderSearch.ts: `export function ladderTrialStreams(seed: number): (trial: number) => Rng { return (trial) => mulberry32(deriveSubSeed(seed, trial, LADDER_TRIAL_SUBSTREAM)); }` with `const LADDER_TRIAL_SUBSTREAM = 0`. (2) The scoreLadder signature becomes `scoreLadder(ladder, config, trialRng: (trial: number) => Rng): LadderScore`, and trial `sim` draws from `trialRng(sim)`. Each attempt still consumes exactly one uniform per day, so day d of trial t uses the same uniform for every ladder: common random numbers across the whole grid, independent of grid index, grid bounds and web block partitioning. (3) runLadderSearch passes `ladderTrialStreams(seed)` for every ladder, and ladderWorker.ts passes `ladderTrialStreams(request.seed)`. The firstIndex seed coupling goes away, so CLI and web give identical scores for the same seed. STANDARD ERRORS: (4) LadderScore gains `passRateStandardError: number`, `expectedDaysToFundedStandardError: number` and `costPerFundedStandardError: number`. scoreLadder also accumulates daysOnPassSquaredSum and daysOnFailSquaredSum. (5) New camelCase utilities in src/lib/prop-calculator/stats.ts: `binomialStandardError(p: number, n: number): number` = sqrt(p(1-p)/n), 0 when n <= 0. `meanStandardError(sum: number, squaredSum: number, n: number): number` uses sample variance with n-1 and returns 0 when n < 2. `interface Estimate { standardError: number; value: number }`. `propagatedStandardError(f: (values: readonly number[]) => number, estimates: readonly Estimate[]): number` is the delta method by central differences: for each i, h = min(se_i, |value_i|/2), partial_i = (f(x + h e_i) - f(x - h e_i)) / (2h) (0 when h = 0), result = sqrt(sum (partial_i * se_i)^2). (6) scoreLadder computes both cost and days SE by propagating (passRate, meanDaysOnPass, meanDaysOnFail) with their SEs through the same R1-8 replacementEconomics call. The SE therefore follows whatever D1 formula is shipped, with no second cost model. Unscorable ladders get Infinity SEs. (7) CLI tables: the 'pass' column is relabelled 'eval pass' (D2), and three columns are added: '+/- pass', '+/- days', '+/- $'. Row building moves into an exported pure `ladderTableRow(score, contractLimit, pointValue): string[]`. Each table heading is followed by a muted legend line: '+/- = one standard error of Monte Carlo noise; rows within about 2 SE of #1 are statistically tied (raise --trials to separate them)'. The frontier lines append +/- days and +/- $. The web LadderLab (LadderLabPanel.tsx) receives the new LadderScore fields without breaking; showing them there is left as an open question.
- **Files:** src/lib/prop-calculator/core/LadderSearch.ts, src/lib/prop-calculator/core/index.ts (export ladderTrialStreams), src/lib/prop-calculator/stats.ts, src/cli/commands/prop/ladder/command.ts, src/app/(app)/prop-calculator/_workers/ladderWorker.ts, tests/unit/lib/prop-calculator/ladderSearch.test.ts (scoreLadder calls take a trial-rng factory; the score() helper at 409-418 adds the 3 SE fields; the test 'gives every ladder an independent RNG stream' at 489-501 is renamed to its real meaning, alias uniqueness), tests/unit/lib/prop-calculator/rngDrawCount.test.ts (pass `() => counted.rng`, which keeps the 2090 pin semantics), tests/unit/lib/prop-calculator/stats.test.ts, tests/unit/lib/prop-calculator/core/LadderSearchNoise.test.ts (new), tests/unit/cli/prop/ladder.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/stats.test.ts: binomialStandardError(0.5, 10000) === 0.005 and (0, 100) === 0. meanStandardError for [1,2,3,4] (sum 10, sq 30, n 4) is close to sqrt(1.6667/4) = 0.6455. propagatedStandardError(x => 2*x[0], [{value: 1, standardError: 0.1}]) is close to 0.2. For x => x[0] + x[1] with SEs 3 and 4 it is close to 5. For x => 1/x[0] at {0.5, 0.01} it is close to 0.04 (3 decimals). With SE 0 it returns 0.
  - tests/unit/lib/prop-calculator/core/LadderSearchNoise.test.ts (CRN index independence, RED today): runLadderSearch with grid {lo: 300, max: 300, slots: 1, step: 100} and with {lo: 100, max: 300, slots: 1, step: 100} (where [300] is index 2), same seed 7, sims 2000. The [300] LadderScore deep-equals across the two runs.
  - Same file: ladderTrialStreams(7)(3)() === mulberry32(deriveSubSeed(7, 3, 0))(), and scoreLadder is identical whether called via runLadderSearch or directly with ladderTrialStreams(seed).
  - Same file (CRN reduces pairwise noise): for ladders [300, 200, 100] and [200, 100, 100] on TopStep standard-standard at sims 2000, across seeds 1..20, the SD of (costA - costB) is less than 0.7x the SD of costA alone.
  - Same file (SE correctness): scoreLadder([400, 600, 500]) on MFFU Rapid EOD, sims 20000, gives passRateStandardError close to sqrt(p(1-p)/20000) (about 0.00353 at p about 0.465). Across seeds 1..30 at sims 2000, the empirical SD of costPerFunded lies within [0.6, 1.6] x the mean reported costPerFundedStandardError, and likewise for expectedDaysToFunded.
  - Same file: an unscorable ladder (passRate < 0.02) reports costPerFundedStandardError === Infinity and expectedDaysToFundedStandardError === Infinity.
  - tests/unit/cli/prop/ladder.test.ts: ladderTableRow for a fixed LadderScore {ladder [400, 600], passRate 0.47, passRateStandardError 0.0035, expectedDaysToFunded 8.2, expectedDaysToFundedStandardError 0.12, costPerFunded 250, costPerFundedStandardError 3.4} returns cells in the order [ladder, eval pass, +/- pass, days, +/- days, $/acct, +/- $, min stop]. TG-8 check: printTable titles map to bySpeed/byCost/byPassRate in that order.
- **Depends on:** R1-8 (the cost SE is propagated through the shared D1 replacementEconomics helper), R1-10 / R1-9 (scoreLadder body is rewritten there; land CRN and SE on top), R1-30 (the D2 'eval pass' ladder label is applied here; the R1-30 cluster must not also edit ladder/command.ts labels, and owns the web LadderLabPanel 'Pass%' header rename)
- **Risks:** CRN does not remove winner's-curse bias; it only reduces ranking variance. The legend therefore tells the user to raise --trials, and it does not claim the #1 row is unbiased. Every golden ladder number shifts slightly because the random streams changed; the existing tolerances (toBeCloseTo(pass, 1), +/-15% days) should absorb it, and any re-pin must be justified. The finite-difference SE is a first-order approximation that treats the three estimators as independent; fine as a noise indicator. The table gets three extra columns (wider output).


**Open questions**
- MAX_LADDER_GRID_SIZE: is 1,000,000 raw ladders the right hard cap? It allows the reviewers' legitimate 813,615 case, which takes about 30+ minutes at 4,000 trials. Should the CLI also offer a flag such as --max-grid to override it?
- Should the web LadderLab show the new standard-error fields, and accept --stop-points/--instrument equivalents so contract limits apply there too? Today the design passes positionSizing: null from the web worker, which leaves web ladder scores uncapped exactly as before. That is a UI change the user would verify themselves.
- D1 subscription billing across failed attempts: continuous monthly billing over total eval days, versus about one billing month per failed attempt (FTMO's next-billing-date replacement). This is owned by the R1-2 engine-aggregates cluster. The ladder simply consumes whatever the shared helper decides; please confirm the helper's name and signature match shared_contracts item 1.
- The E8Futures.ts note (line 102) says LadderSearch 'reads plan.drawdown.lock directly'. After R1-9 that is no longer true, since the ladder goes through the DrawdownStrategy. Should the historical note be reworded as well, or left as a dated record? The TPT note at TakeProfitTrader.ts:47 does have to be corrected, because it asserts a gap that R1-9 removes.

## Cluster `payout-rules` (R1-31 (mechanism), R1-46, R1-40, R1-33 (mechanism if needed), R1-51 (mechanism if needed))

**Shared contracts:** 1. Split keyed on payout number (from R1-31). `Plan.payoutFromProfit(fundedProfit: number, payoutIndex: number): number`. payoutIndex is the 0-based index of the payout being made, i.e. FundedCycleTracker.payoutsIssued read before the increment. Any code outside FundedCycleTracker that turns a withdrawal into trader cash must pass it. `PlanInit.payoutTiersFromPayout?: readonly PayoutCountSplitTier[]` holds entries with fromPayoutIndex >= 1, while `payoutTiers` stays the split for index 0 (the first payout). `Plan.payoutSplit: PayoutCountTieredPayoutSplit` is the full schedule, with `tiersFor(payoutIndex)` and `stationaryFromPayoutIndex`, for any display code. Display code must use it (CLI `describePayoutSplit(split)` in src/cli/commands/prop/shared.ts), never `payoutTiers[0]`. To scale splits, use `Plan.withScaledTraderShare(factor)`, never map payoutTiers by hand. `defaultPayoutRegimeCap(plan)` includes `plan.payoutSplit.stationaryFromPayoutIndex`.

2. Shared payout-count schedule helpers (src/lib/prop-calculator/core/PayoutCountSchedule.ts): `assertPayoutCountSchedule(owner, entries)` and `resolvePayoutCountEntry(owner, entries, payoutsIssued)`. Any new rule keyed on payout count must reuse these rather than re-implement the lookup. PayoutCountTieredPayoutCap is refactored onto them with identical error texts.

3. Lock trigger (from R1-51). `DrawdownLockConfig.atProfit: Dollars | null`, where null means the lock fires only through a payout floor effect. Every reader of `lock.atProfit` (LadderSearch, FundedStateValue, the CLI, and any new ladder or intraday code from R1-9, R1-6 or R1-32) must handle null: no profit trigger, so treat the trigger as Infinity. Plan validation: a funded lock with atProfit null requires `payoutFloorEffect === PayoutFloorEffect.MoveToLockedFloor`.

4. `PayoutFloorEffect.MoveToLockedFloor = 'move-to-locked-floor'` (new enum member). At payout it sets threshold = lock.lockedThreshold(start) exactly and locks, possibly moving the floor down. New DrawdownStrategy methods: `moveToLock(state)` and `prospectiveLockThreshold(state, effect: LockAtPlanFloor | MoveToLockedFloor)`. PayoutFloorEffect.ts helpers: `locksDrawdownOnPayout(effect)` and `payoutFloorEffectName(effect)`. The LivePlan.floorAfterWithdrawal and withdraw switches, and the FundedPayoutCycle.withdrawableNow and tryPayout switches, must all handle the new member. The R1-48/R1-49 cluster editing LivePlan must merge on top of this.

5. CLI drawdown display (shared with R1-32): add `describeDrawdownLock(lock: DrawdownLockConfig | undefined): string` to src/cli/commands/prop/shared.ts, returning 'no lock', 'locks at +$X' or 'locks on first payout'. `cli prop plans` prints an extra 'funded drawdown $X kind | lock' line whenever plan.fundedDrawdown !== plan.drawdown and the plan is not instant-funded.

6. QualifyingDaysMilestonePayoutCap boundary is inclusive (>=): the after-regime starts at exactly milestoneQualifyingDays, the same convention as minDaysAfterPassForPayout.

7. FundedDpPayoutCapGapKind gains `PayoutTriggeredLockPreLockOffsetSaturates`. The optimize dp command's describeFundedDpPayoutCapGap switch must handle it.

8. Plan.ts is edited concurrently by R1-34 (a call-up-only attribute). Both add optional PlanInit fields plus constructor validation, so sequence the merges.


### R1-31
- **Root cause:** Confirmed. The trader split can only be keyed on profit dollars, never on payout number. (1) All three Alpha Futures builders hardcode a flat 90% split: src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts:161-163 (Advanced), 208-210 (Standard), 256-258 (Zero), each `payoutTiers: [{ thresholdProfit: dollars(0), traderShare: fraction(0.9) }]`. (2) src/lib/prop-calculator/core/PayoutTiers.ts:15-42 `walkPayoutTiers(tiers, fundedProfit)` only brackets by profit. (3) src/lib/prop-calculator/core/Plan.ts:533-536 `payoutFromProfit(fundedProfit)` receives no payout index. (4) The only two production callers are src/lib/prop-calculator/core/FundedPayoutCycle.ts:161 (`plan.payoutFromProfit(debited)` in tryPayout) and :58 (closeoutCredit). All three engines go through these two calls: the MC simulator (simulator/fundedPhase.ts:126,220), the portfolio timeline (portfolioTimeline/fundedCycle.ts via runFundedDays) and the funded DP (core/FundedStateValue.ts:633-675, which sets `tracker.payoutsIssued = regimeAtStart`). So once the tracker's payoutsIssued is threaded into the split lookup, every engine is fixed in one place. The DP already tracks the payout count as its `regime` key, capped by defaultPayoutRegimeCap (FundedStateValue.ts:178-184, DEFAULT_PAYOUT_REGIME_CAP = 6 at :80). The Alpha schedule becomes stationary at payout index 4, which is within that cap, so the DP is exact. Display consumers only read tiers[0]: src/cli/commands/prop/plans/command.ts:100 and src/app/(app)/prop-calculator/_components/PlanStatsBadges.tsx:28. The stress test at RuleStressTestPanel.tsx:252-255 scales only payoutTiers, so it would miss later-payout tiers.
- **Design:** Extend the existing PayoutTier model with a payout-count-keyed schedule. It mirrors the existing PayoutCountTieredPayoutCap (same fromPayoutIndex convention, where index 0 is the first payout), and the duplicated schedule logic is extracted per the DRY rule.

1. NEW src/lib/prop-calculator/core/PayoutCountSchedule.ts (PascalCase domain file, internal to core):
   - `export interface PayoutCountIndexed { readonly fromPayoutIndex: number }`
   - `export function assertPayoutCountSchedule(owner: string, entries: readonly PayoutCountIndexed[]): void`. Throws `${owner}: tiers must not be empty`, `${owner}: the first tier must start at fromPayoutIndex 0`, `${owner}: duplicate fromPayoutIndex ${n}`, and (new) `${owner}: fromPayoutIndex must be a non-negative integer, got ${n}`. This is the existing PayoutCap.ts:30-51 body, moved.
   - `export function resolvePayoutCountEntry<TEntry extends PayoutCountIndexed>(owner: string, entries: readonly TEntry[], payoutsIssued: number): TEntry`. This is the existing PayoutCap.ts:54-77 body (the highest fromPayoutIndex <= payoutsIssued, falling back to the lowest).
   - Refactor PayoutCountTieredPayoutCap (PayoutCap.ts:28-78) to call both with owner 'PayoutCountTieredPayoutCap'. The messages stay byte-identical, so tests/unit/lib/prop-calculator/core/PayoutCap.test.ts stays green unchanged.

2. src/lib/prop-calculator/core/PayoutTiers.ts adds:
   - `export interface PayoutCountSplitTier { fromPayoutIndex: number; tiers: readonly PayoutTier[] }`
   - `export class PayoutCountTieredPayoutSplit { constructor(readonly schedule: readonly PayoutCountSplitTier[]) }`. The constructor calls assertPayoutCountSchedule('PayoutCountTieredPayoutSplit', schedule) and stores the schedule sorted ascending by fromPayoutIndex. Members: `get stationaryFromPayoutIndex(): number` (the last fromPayoutIndex) and `tiersFor(payoutIndex: number): readonly PayoutTier[]` (via resolvePayoutCountEntry).
   - `export function scalePayoutTiers(tiers: readonly PayoutTier[], factor: number): PayoutTier[]` (maps traderShare to fraction(traderShare * factor)).

3. src/lib/prop-calculator/core/Plan.ts:
   - PlanInit adds `payoutTiersFromPayout?: readonly PayoutCountSplitTier[]`. The existing `payoutTiers` keeps its meaning as the split for payout index 0 (the first payout), so the roughly 40 existing builders are untouched.
   - New field `readonly payoutSplit: PayoutCountTieredPayoutSplit`, built as `new PayoutCountTieredPayoutSplit([{ fromPayoutIndex: 0, tiers: init.payoutTiers }, ...(init.payoutTiersFromPayout ?? [])])`. A flat plan is a one-entry schedule, so no conditional branches.
   - Validation, in the style of the existing checks: `${label}: payoutTiersFromPayout must not be empty` when it is set to []; `${label}: payoutTiersFromPayout entries must start at payout index 1 or later (index 0 is payoutTiers), got ${n}`; each entry's tiers must be non-empty. The existing duplicate-threshold loop (Plan.ts:332-340) now runs over every `this.payoutSplit.schedule` entry. Keep the existing message text for index 0.
   - Change the signature to `payoutFromProfit(fundedProfit: number, payoutIndex: number): number`, with body `walkPayoutTiers(this.payoutSplit.tiersFor(payoutIndex), fundedProfit)` minus payoutMethodFee as today. payoutIndex is required, so the compiler flags every call site.
   - Add `withScaledTraderShare(factor: Fraction0to1): Plan`, which returns `this.withOverrides({ payoutTiers: scalePayoutTiers(this.init.payoutTiers, factor), payoutTiersFromPayout: this.init.payoutTiersFromPayout?.map((entry) => ({ ...entry, tiers: scalePayoutTiers(entry.tiers, factor) })) })`.

4. src/lib/prop-calculator/core/FundedPayoutCycle.ts: line 161 becomes `plan.payoutFromProfit(debited, this.payoutsIssued)` (read before the increment at :186). Line 58 becomes `plan.payoutFromProfit(Math.max(0, this.withdrawableNow(options)), this.payoutsIssued)` (the closeout is the next payout).

5. src/lib/prop-calculator/core/FundedStateValue.ts:178-184: defaultPayoutRegimeCap adds `plan.payoutSplit.stationaryFromPayoutIndex` to its Math.max so a longer schedule can never saturate silently. The Alpha value is 4, so the solve stays at 6. No other DP change is needed, because dayCloseValue already seeds tracker.payoutsIssued from the regime.

6. src/lib/prop-calculator/core/index.ts: export `type PayoutCountSplitTier`, `PayoutCountTieredPayoutSplit` and `scalePayoutTiers` from './PayoutTiers'.

7. src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts: add module constants `QUALIFIED_FIRST_PAYOUT_TIERS = [{ thresholdProfit: dollars(0), traderShare: fraction(0.7) }]` and `QUALIFIED_LATER_PAYOUT_TIERS: readonly PayoutCountSplitTier[] = [{ fromPayoutIndex: 2, tiers: [{ thresholdProfit: dollars(0), traderShare: fraction(0.8) }] }, { fromPayoutIndex: 4, tiers: [{ thresholdProfit: dollars(0), traderShare: fraction(0.9) }] }]`. All three builders set `payoutTiers: QUALIFIED_FIRST_PAYOUT_TIERS, payoutTiersFromPayout: QUALIFIED_LATER_PAYOUT_TIERS`, one shared constant (DRY). Add a notes entry: the split follows the signed General Service Agreement's Virtual Performance Fees schedule (70% on payouts 1-2, 80% on 3-4, 90% from 5), which the help center contradicts with a flat 90%, counted per account.

8. CLI: src/cli/commands/prop/shared.ts adds `describePayoutSplit(split: PayoutCountTieredPayoutSplit): string`. A one-entry schedule prints '90%' (unchanged output). A multi-entry schedule prints '70% (payouts 1-2), 80% (payouts 3-4), 90% (payout 5+)', using each entry's tiers[0].traderShare and 1-based labels. plans/command.ts:100 uses `payout split ${describePayoutSplit(plan.payoutSplit)}`.

9. Web: PlanStatsBadges.tsx:28 shows the first to last traderShare (for example '70–90%') when schedule.length > 1, otherwise the current single figure. RuleStressTestPanel.tsx:252-255 uses `basePlan.withScaledTraderShare(fraction(0.8))`, so the stress scenario scales every payout's split.

Data flow: the tracker's payoutsIssued becomes the payout index, which picks the split through Plan.payoutFromProfit. This covers the simulator, the portfolio timeline and the DP (through regime), with no engine-specific code.
- **Files:** src/lib/prop-calculator/core/PayoutCountSchedule.ts (new), src/lib/prop-calculator/core/PayoutCap.ts, src/lib/prop-calculator/core/PayoutTiers.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/FundedPayoutCycle.ts, src/lib/prop-calculator/core/FundedStateValue.ts, src/lib/prop-calculator/core/index.ts, src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts, src/cli/commands/prop/shared.ts, src/cli/commands/prop/plans/command.ts, src/app/(app)/prop-calculator/_components/PlanStatsBadges.tsx, src/app/(app)/prop-calculator/_components/RuleStressTestPanel.tsx, tests/unit/lib/prop-calculator/FtmoFutures.test.ts (payoutFromProfit(x) -> payoutFromProfit(x, 0)), tests/unit/lib/prop-calculator/fundedNext.test.ts (same signature update), tests/unit/lib/prop-calculator/E8Futures.test.ts (same), tests/unit/lib/prop-calculator/payoutMethodFeeAndEvalCap.test.ts (same), tests/unit/lib/prop-calculator/takeProfitTrader.test.ts (same), tests/unit/lib/prop-calculator/core/PlanVariant.test.ts (same), tests/unit/lib/prop-calculator/core/PlanUniversalInvariants.test.ts (iterate payout indices 0..payoutSplit.stationaryFromPayoutIndex), .claude/prop-firms/alphafutures/zero.md, standard.md, advanced.md (mark the 'Profit Split, engine/doc mismatch' Not Confirmed bullets as resolved in the engine; docs step last)
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/PayoutTiers.test.ts: PayoutCountTieredPayoutSplit([{0,[70%]},{2,[80%]},{4,[90%]}]).tiersFor(i)[0].traderShare equals 0.7, 0.7, 0.8, 0.8, 0.9, 0.9, 0.9 for i = 0..6; construction order does not matter; stationaryFromPayoutIndex === 4; it throws on an empty schedule, a missing index 0, a duplicate index, and fromPayoutIndex -1 or 1.5; scalePayoutTiers([{0, 0.9}], 0.8)[0].traderShare is close to 0.72.
  - tests/unit/lib/prop-calculator/core/Plan.test.ts (or PlanEmptyArrayInvariants.test.ts): withOverrides({ payoutTiersFromPayout: [] }) throws /payoutTiersFromPayout must not be empty/; an entry at fromPayoutIndex 0 throws /payout index 1 or later/; an entry with duplicate thresholds throws /more than one tier at thresholdProfit/; for a plan with tiers 1.0 then 0.5 from index 1, payoutFromProfit(1000, 0) === 1000 and payoutFromProfit(1000, 1) === 500; withScaledTraderShare(0.8) on the Alpha Standard plan yields payoutFromProfit(1000, i) of 560, 560, 640, 640, 720 for i = 0..4.
  - tests/unit/lib/prop-calculator/firms/alphafutures/AlphaFutures.test.ts (new): for each of Zero, Standard and Advanced, payoutSplit.tiersFor(i)[0].traderShare equals 0.7, 0.7, 0.8, 0.8, 0.9, 0.9 for i = 0..5. FundedPayoutCycle sequence on Standard: state = plan.initialState(); plan.beginFundedPhase(state); tracker = newFundedCycleTracker(state); set state.threshold = 50_000, state.thresholdLocked = true, state.balance = 52_000 and tracker.lastPayoutBalance = 52_000; then loop 6 times: state.balance += 2000, state.qualifyingDays += 5, tryFundedPayout({ maxPayouts: Infinity, minRetainedCushion: plan.resolveRetainedCushion(undefined), payoutRequestSize: 1000, plan, state, tracker }). The traderReceives sequence must be [700, 700, 800, 800, 900, 900], where today it is [900 x6]. After 2 payouts, tracker.closeoutCredit(...) must equal 0.8 x withdrawableNow.
  - tests/unit/lib/prop-calculator/alphaFuturesPayoutSplit.test.ts (new, simulator path): use the always-win harness from payoutContinuity.test.ts (winrate 1, riskPerTrade 250, rrRatio 2, tradesPerDay 1, trials 1, seed 1, fundedHorizonDays 252, payoutRequestSize 1000). Take plan = Alpha Standard.withMaxLifetimePayouts(6) and flat100 = the same plan with payoutTiers [{0, 1}] and payoutTiersFromPayout undefined. Assert simulate(flat100).expectedGrossPayout === 6000 as a harness sanity check, and simulate(plan).expectedGrossPayout is close to 4800 (0.7+0.7+0.8+0.8+0.9+0.9 times 1000); today it is 5400.
  - tests/unit/lib/prop-calculator/portfolioTimeline/PayoutCountSplit.test.ts (new, timeline path): runAccountTimeline with alwaysWinRng = () => 0, Alpha Standard, payoutRequestSize 1000, maxPayoutsPerCard 6, riskPerTrade 250, rrRatio 2, tradesPerDay 1, winrate 1, maxEvalDays 60. The first 6 positive day-over-day increments of cumulativePayout must be exactly 0.7, 0.7, 0.8, 0.8, 0.9, 0.9 times the corresponding increments of the flat-100% variant run with the same inputs; both runs share one balance path, since the split does not touch balance.
  - tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts: defaultPayoutRegimeCap(rapidEodPlan().withOverrides({ payoutTiersFromPayout: [{ fromPayoutIndex: 9, tiers: [{0, 0.9}] }] })) === 9. With a coarse config on one multi-payout toy plan (actionStepMultiple 0.5, cushionStepMultiple 0.5, cycleBestDayBucketCount 1, tradesPerDay 1, winrate 0.5, rrRatio 2), computeFundedStateValue initialValue is strictly ordered flat 0.9 > tiered 70/80/90 > flat 0.7. The tiered variant with payoutRegimeCap: 0 equals flat 0.7, which proves the split is keyed on the DP regime.
  - tests/unit/cli/prop/shared.test.ts: describePayoutSplit(single 0.9 entry) === '90%'; describePayoutSplit(Alpha schedule) === '70% (payouts 1-2), 80% (payouts 3-4), 90% (payout 5+)'.
  - tests/unit/lib/prop-calculator/core/PayoutCap.test.ts: existing PayoutCountTieredPayoutCap tests must stay green unchanged after the helper extraction (the refactor's safety net).
- **Depends on:** R1-33 (same three Alpha builders; land together or sequence to avoid conflicts), R1-32 (other cluster: Alpha Advanced fundedDrawdown in the same builder), R1-34 (other cluster: also adds a PlanInit field and Plan constructor validation in Plan.ts; merge-conflict coordination only), R1-30 (other cluster: web UI labels; PlanStatsBadges is also touched here)
- **Risks:** (1) Changing the payoutFromProfit signature touches about 14 test call sites; every one must pass 0 explicitly, so none silently changes meaning. (2) The real-world rule is contested: the help center says flat 90% and the signed Agreement says tiered. The engine follows the doc tree's 2026-09-22 resolution, so Alpha Futures will drop in cross-firm rankings. Surface this in the notes. (3) withScaledTraderShare must not be bypassed by anyone building a PlanInit by hand with only payoutTiers scaled. (4) defaultPayoutRegimeCap can only grow, so a future schedule with a large fromPayoutIndex increases DP state size linearly. (5) The per-account payout counter restarts on a re-bought account (a new tracker). That matches 'on the account' in the Agreement, but it is an interpretation.


### R1-33
- **Root cause:** Confirmed. None of the three Alpha Futures builders sets minPayoutRequest (src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts:129-261), so Plan.ts:250 defaults it to dollars(0). FundedPayoutCycle.ts:152 then passes `minRequest: ladder?.minRequestAmount ?? plan.minPayoutRequest` = 0 into resolveWithdrawal, and its `debited < minRequest ? null : debited` check (:257) never rejects. The documented standing minimum request ($200 Zero / $500 Standard / $1,000 Advanced; zero.md:86, standard.md:85, advanced.md:82) was instead mis-mapped to minPayoutProfit (lines 155, 202, 250). That field gates only the first cycle's profit (FundedPayoutCycle.ts:113-116). Combined with payoutProfitShare 0.5, it lets through first payouts of $100-$199 / $250-$499 / $500-$999 and arbitrarily small later payouts. The first notes entry (the 'No per-request payout minimum was confirmed' note near AlphaFutures.ts:113) is contradicted by the docs. No new mechanism is needed.
- **Design:** Data-only fix in AlphaFutures.ts, with no engine change.
- buildZeroPlan: set `minPayoutRequest: dollars(200)` and remove `minPayoutProfit: dollars(200)`.
- buildStandardPlan: set `minPayoutRequest: dollars(500)` and remove `minPayoutProfit: dollars(500)`.
- buildAdvancedPlan: set `minPayoutRequest: dollars(1000)` and remove `minPayoutProfit: dollars(1000)`.
Rationale for the removal: the sourced rule is a single request minimum. With payoutProfitShare 0.5, any request of at least minPayoutRequest already needs cycle profit of at least 2 x minPayoutRequest, so the old minPayoutProfit is strictly dominated (no behaviour change) and was an unsourced double-mapping that makes `cli prop plans` print a misleading 'first $X'. Each minimum is within its payoutRequestCap ($1,500 / $3,000 / $15,000), so the Plan.ts:318-325 validation passes. Leave minPayoutProfitPerCycle unset (still null, as FundedPayoutCycleProfitFloorDefault.test.ts pins). Rewrite the first notes string to say the Payout Policy article's standing per-request minimum ($200/$500/$1,000) is modeled as minPayoutRequest on every payout, and that no separate first-payout profit gate exists beyond the 5 winning days of $200 and the 50%-of-profit request cap. After the change, `cli prop plans` prints 'first $0 | min request $200/$500/$1,000'.
- **Files:** src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts, tests/unit/lib/prop-calculator/core/MinPayoutRequestDefault.test.ts (rewrite the two Alpha-specific cases: every registered firm now sets minPayoutRequest explicitly; keep the TPT withOverrides fallback case), tests/unit/lib/prop-calculator/firms/alphafutures/AlphaFutures.test.ts (new, shared with R1-31), .claude/prop-firms/alphafutures/zero.md, standard.md, advanced.md (resolve the 'Per-request payout minimum (engine/doc mismatch)' bullets; docs step last)
- **Tests first:**
  - tests/unit/lib/prop-calculator/firms/alphafutures/AlphaFutures.test.ts: Zero, Standard and Advanced have minPayoutRequest 200 / 500 / 1000 and minPayoutProfit 0.
  - Same file, per-request floor on the 2nd payout, run for each plan with it.each. Setup: state locked at threshold 50_000, balance 60_000, tracker.payoutsIssued = 1, tracker.qualifyingDaysAtLastPayout = 5, state.qualifyingDays = 10, tracker.lastPayoutBalance = balance - cycleProfit, minRetainedCushion = plan.resolveRetainedCushion(undefined), payoutRequestSize undefined. Zero: cycleProfit 390 gives a null payout (today it pays 195); cycleProfit 400 gives debited 200. Standard: 990 gives null (today 495); 1000 gives 500. Advanced: 1990 gives null (today 995); 2000 gives 1000. Assert on `debited` only, so the test is independent of R1-31's split.
  - Same file, first-payout under-floor: Zero with payoutsIssued 0, lastPayoutBalance 50_000, qualifyingDays 5 and cycleProfit 390 must give a null payout. Today it pays 195, because the old minPayoutProfit of 200 is at most 390.
  - tests/unit/lib/prop-calculator/core/MinPayoutRequestDefault.test.ts: replace the 'AlphaFutures resolves to $0' case with an assertion that every plan in ALL_FIRMS has minPayoutRequest > 0 or an explicit documented value, keeping the TPT 0.01 and the withOverrides-strip-to-0 cases.
- **Depends on:** R1-31 (same builders and new AlphaFutures.test.ts file), R1-32 (other cluster, Advanced builder: affects the retained cushion used in these tests; the tests use balance 60_000 so they hold either way)
- **Risks:** (1) Payouts become less frequent and larger for all three Alpha plans, so expected net, payout counts and time-to-payout shift in sim, ladder, compare and optimize. This is intended. (2) Removing minPayoutProfit changes the `cli prop plans` 'first $X' text. It is behaviour-neutral given payoutProfitShare 0.5, but if a reviewer prefers to keep it, keep it (see open questions). (3) MinPayoutRequestDefault.test.ts currently pins the old behaviour and must be rewritten in the same change, not deleted.


### R1-40
- **Root cause:** Confirmed as a data defect, whose practical effect is small. src/lib/prop-calculator/firms/fundednext/FundedNext.ts:296 sets `minPayoutProfit: dollars(500)` for Legacy, and FundedPayoutCycle.ts:113-116 applies it when payoutsIssued === 0. legacy.md (cycle-profit note, line 79, and the 'Engine disagreement, minPayoutProfit' bullet, line 96) says the $500 gate applies only 'after your last withdrawal', i.e. 2nd and later payouts; the first payout's gate is 5 Benchmark Days of at least $200, already modeled by minDaysAfterPassForPayout 5 and minQualifyingDayProfit 200. Reviewer C is right that with the default retained cushion (Plan.resolveRetainedCushion floors at fundedDrawdown.amount $2,000, and LockAtPlanFloor puts the prospective floor at start) a first payout needs profit of at least $2,250, so the gate never binds in shipped engine paths. It still misstates the rule and binds for any caller passing a smaller cushion or a minRetainedCushionOverride.
- **Design:** Data-only fix in buildLegacyPlan (FundedNext.ts:268-316). Set `minPayoutProfit: dollars(0)` explicitly, matching the TopStep precedent of stating a zero first-cycle gate next to a non-zero per-cycle gate. Keep `minPayoutProfitPerCycle: dollars(500)`, `minDaysAfterPassForPayout: 5`, `minQualifyingDayProfit: dollars(200)` and `minPayoutRequest: dollars(250)` unchanged. No engine change: tryPayout already selects minPayoutProfit for payout 1 and minPayoutProfitPerCycle for payouts 2+. Fields set: minPayoutProfit 500 -> 0. After the change, `cli prop plans --firm fundednext --variant legacy` prints 'first $0'.
- **Files:** src/lib/prop-calculator/firms/fundednext/FundedNext.ts, tests/unit/lib/prop-calculator/fundedNext.test.ts, .claude/prop-firms/fundednext/legacy.md (resolve the 'Engine disagreement, minPayoutProfit' bullet; docs step last)
- **Tests first:**
  - tests/unit/lib/prop-calculator/fundedNext.test.ts (Legacy describe): the Legacy plan has minPayoutProfit === 0 and minPayoutProfitPerCycle === 500.
  - Same file, first payout not profit-gated. Setup: legacy plan, state = plan.initialState(), state.threshold = 48_000 (unlocked), state.balance = 50_400, state.qualifyingDays = 31 (post-milestone, independent of R1-46), tracker = newFundedCycleTracker with lastPayoutBalance 50_000 and qualifyingDaysAtLastPayout 0. tryFundedPayout({ minRetainedCushion: 0, payoutRequestSize: 300, maxPayouts: Infinity }) must return debited 300 with causesHardBreach false. Today it returns null, because 400 < 500.
  - Same file, 2nd payout still gated: the same setup with tracker.payoutsIssued = 1, qualifyingDaysAtLastPayout 26 and lastPayoutBalance = balance - 400 must return null. With lastPayoutBalance = balance - 500 it must return debited 300.
- **Depends on:** R1-46 (same plan; the tests use qualifyingDays 31 to stay independent)
- **Risks:** (1) No change to shipped Monte Carlo or DP numbers is expected, since the gate is dominated by the $2,000 retained cushion. If a later change lowers the Legacy cushion (for example via D4 or a minRetainedCushionOverride), first payouts become reachable earlier, which is correct per the docs. (2) The test uses minRetainedCushion 0, which the CLI clamps away. It is a gate-level test by design.


### R1-46
- **Root cause:** Confirmed. src/lib/prop-calculator/core/PayoutCap.ts:84-85 QualifyingDaysMilestonePayoutCap.resolve uses `context.cumulativeQualifyingDays > this.config.milestoneQualifyingDays`. FundedNext Legacy wires milestoneQualifyingDays = LEGACY_BENCHMARK_DAY_MILESTONE = 30 (FundedNext.ts:34, 302-309). qualifyingDays is incremented at day close before tryFundedPayout runs (simulator/day.ts:216, simulator/fundedPhase.ts:116), and Plan.resolvedPayoutCap (Plan.ts:538-551) passes state.qualifyingDays. So a payout at exactly 30 Benchmark Days (the 6th on-cadence payout) still gets 50% of profit capped at $6,000. The firm's rule ('After 30 benchmark days, the 50% withdrawal limit is lifted', legacy.md:72,75) puts day 30 in the uncapped regime, and the sibling cadence gate is inclusive (FundedPayoutCycle.ts:122-124 `>=`). The strict boundary is pinned by an unsourced test (tests/unit/lib/prop-calculator/core/PayoutCap.test.ts:31-38). The DP is unaffected because it excludes this cap type (FundedStateValue.ts:1901).
- **Design:** One-operator change in QualifyingDaysMilestonePayoutCap.resolve: `context.cumulativeQualifyingDays >= this.config.milestoneQualifyingDays ? afterMilestone : beforeMilestone`. No field changes: Legacy keeps milestoneQualifyingDays 30. The QualifyingDaysMilestoneCapConfig interface is unchanged; 'milestoneQualifyingDays' now means the count at which the after-regime starts, consistent with minDaysAfterPassForPayout.
- **Files:** src/lib/prop-calculator/core/PayoutCap.ts, tests/unit/lib/prop-calculator/core/PayoutCap.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/PayoutCap.test.ts: replace 'stays in the before-milestone regime at exactly the milestone count (boundary is strict >)' with 'switches to the uncapped regime at exactly the milestone count (after 30 benchmark days includes the 30th)': resolve({ cumulativeQualifyingDays: 30, payoutsIssued: 0 }) must equal { balanceShareCap: null, requestCap: null }. Today it returns 0.5 / 6000.
  - Same file: add 'stays capped one day before the milestone': resolve({ cumulativeQualifyingDays: 29 }) must equal { balanceShareCap: 0.5, requestCap: 6000 }. Keep the existing 0 and 31 cases.
  - Same file, Legacy describe: add a tryFundedPayout case with state.qualifyingDays = 30, balance start + 20_000, threshold start - 2000 locked, minRetainedCushion 0 and lastPayoutBalance start. It must return debited 20_000; today it returns 6000. Add the mirror case at qualifyingDays 29, which must return 6000.
- **Depends on:** R1-40 (same plan; independent tests)
- **Risks:** (1) Legacy payouts at exactly 30 Benchmark Days become larger, which slightly raises simulated Legacy net and first-uncapped-payout timing. This is intended. (2) The only other user of QualifyingDaysMilestonePayoutCap is Legacy (verify with grep before landing). Any future plan using this class inherits the inclusive semantics.


### R1-51
- **Root cause:** Confirmed. MFF Pro's funded drawdown locks on a profit trigger, where the docs say it locks on the first payout. buildProPlan (src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts:158-169) builds a single `EodTrailingDrawdown({ amount, lock: { atProfit: maxDrawdown + LOCK_OFFSET ($2,100), lockedThreshold: start + 100 } })` and sets no fundedDrawdown, so Plan.ts:224 reuses it for the funded stage. DrawdownStrategy.maybeLock (DrawdownStrategy.ts:61-69, called from EodTrailingDrawdown.onDayClose at :85) then freezes the floor at $50,100 on the first EOD close of at least $52,100, with payoutFloorEffect left at the None default (Plan.ts:292-293). pro.md:49,63,72 says the trigger is 'After first payout, MLL moves to $50,100 and remains static', and Pro's 14-day gate (minDaysAfterPassForPayout 14) makes the two triggers diverge routinely. The notes string at MyFundedFutures.ts:83 wrongly claims they coincide. The other MFF plans' docs (rapid.md:41, rapid-eod.md:43, builder.md:37) confirm profit triggers, so only Pro is affected.

Why the suggested LockAtPlanFloor alone cannot work: FundedPayoutCycle.ts:63-79 computes the payout floor as max(threshold, lockedThreshold) + retainedCushion, and Plan.resolveRetainedCushion (Plan.ts:512-515) floors the cushion at fundedDrawdown.amount ($2,000). With no profit lock, the EOD-trailing threshold is hwm - 2000 once hwm reaches $52,100, so the floor equals hwm and cushionRoom = balance - hwm is at most 0 at every day close. Pro would never pay out, a deadlock. forceLock (DrawdownStrategy.ts:47-54) is also raise-only, whereas the docs say the MLL 'moves to' $50,100. The DP additionally assumes that a locked funded threshold equals lock.lockedThreshold(start) (FundedStateValue.ts:1476-1484), which only 'move to' semantics guarantee.
- **Design:** Two small mechanism extensions plus Pro data.

1. src/lib/prop-calculator/core/DrawdownStrategy.ts:
   - `DrawdownLockConfig.atProfit: Dollars | null`, where null means no profit trigger (the lock fires only through a payout floor effect). maybeLock becomes `if (!lock || lock.atProfit === null || profit < lock.atProfit) return;`.
   - Add `moveToLock(state: AccountState): void`: if already locked or there is no lock, return; otherwise `state.threshold = lock.lockedThreshold(state.startingBalance); state.thresholdLocked = true;`. It sets the value exactly, possibly downward.
   - Add `prospectiveLockThreshold(state: AccountState, effect: PayoutFloorEffect.LockAtPlanFloor | PayoutFloorEffect.MoveToLockedFloor): number`: if there is no lock or the state is locked, return state.threshold; otherwise switch(effect): LockAtPlanFloor returns Math.max(state.threshold, lockedTo) (today's logic, moved here) and MoveToLockedFloor returns lockedTo.

2. src/lib/prop-calculator/core/PayoutFloorEffect.ts: add enum member `MoveToLockedFloor = 'move-to-locked-floor'`, plus `export function locksDrawdownOnPayout(effect: PayoutFloorEffect): boolean` and `export function payoutFloorEffectName(effect: PayoutFloorEffect): string` (both exhaustive switches; the name function keeps existing error texts such as 'LockAtPlanFloor' byte-identical).

3. src/lib/prop-calculator/core/FundedPayoutCycle.ts: withdrawableNow (lines 63-73) switches on plan.payoutFloorEffect. LockAtPlanFloor and MoveToLockedFloor use plan.fundedDrawdown.prospectiveLockThreshold(state, effect); None and ReleaseFloor use state.threshold (unchanged). The tryPayout switch (167-179) adds `case PayoutFloorEffect.MoveToLockedFloor: plan.fundedDrawdown.moveToLock(state); break;`.

4. src/lib/prop-calculator/core/LivePlan.ts (the exhaustive switches force this): floorAfterWithdrawal (133-150) routes LockAtPlanFloor and MoveToLockedFloor through `this.liveDrawdown?.prospectiveLockThreshold(state, effect) ?? state.threshold`, which removes the duplicated max() logic. withdraw (200-212) adds a MoveToLockedFloor case calling liveDrawdown?.moveToLock(state). The constructor checks at 95-110 generalize from `=== LockAtPlanFloor` to `locksDrawdownOnPayout(effect)` with messages built by payoutFloorEffectName.

5. src/lib/prop-calculator/core/Plan.ts constructor (295-302): the check generalizes to locksDrawdownOnPayout with an identical message for LockAtPlanFloor. New validation: `if (this.fundedDrawdown.lock?.atProfit === null && this.payoutFloorEffect !== PayoutFloorEffect.MoveToLockedFloor) throw new Error(`${label}: fundedDrawdown lock has no profit trigger, so only payoutFloorEffect MoveToLockedFloor can ever fire it`)`. This rules out the LockAtPlanFloor deadlock by construction.

6. Consumers of the now-nullable atProfit (the compiler flags each): FundedStateValue.ts:357-359 impliedOffsetMultiple is 0 when the lock is undefined or atProfit is null; LadderSearch.ts:253 lockTrigger is Infinity when atProfit is null; plans/command.ts:69 goes through a new cli/commands/prop/shared.ts `describeDrawdownLock(lock)`, which returns 'no lock', 'locks at +$X' or 'locks on first payout'.

7. DP disclosure (fail loud): src/lib/prop-calculator/core/FundedDpPayoutCapGaps.ts adds kind `PayoutTriggeredLockPreLockOffsetSaturates = 'payout-triggered-lock-pre-lock-offset-saturates'`, emitted when plan.fundedDrawdown.lock?.atProfit === null. Pre-lock trailing is then unbounded until the payout, and the DP's pre-lock offset grid (default 3 x drawdown) saturates. src/cli/commands/prop/optimize/dp/command.ts describeFundedDpPayoutCapGap gets the matching case. isFundedDpEligible is unchanged: Pro stays eligible because lock !== undefined, and MoveToLockedFloor matches the DP's locked-threshold assumption exactly.

8. MyFundedFutures.ts buildProPlan: keep `drawdown` as-is, so eval behaviour is unchanged (see open questions). Add `fundedDrawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown, lock: { atProfit: null, lockedThreshold: lockThresholdAt(LOCK_OFFSET) } })` and `payoutFloorEffect: PayoutFloorEffect.MoveToLockedFloor`. Fields set: fundedDrawdown (new) and payoutFloorEffect None -> MoveToLockedFloor; minPayoutProfit, minPayoutRequest, minDaysAfterPassForPayout and payoutTiers are unchanged. Rewrite the notes string at line 83: Pro's funded MLL trails at EOD until the first payout, then moves to start + $100 and stays static (pro.md), with pre-lock trailing flagged as unconfirmed; Rapid, Rapid EOD and Builder keep their doc-confirmed profit triggers.

9. CLI plans: add a line `funded drawdown $X kind | <describeDrawdownLock>` whenever plan.fundedDrawdown !== plan.drawdown and the plan is not instant-funded. This is shared with R1-32.

10. core/index.ts: nothing new to export beyond PayoutFloorEffect (already exported); export locksDrawdownOnPayout only if used outside core.

Result for Pro 50K: withdrawable = balance - ($50,100 + $2,000), which is exactly the docs' $2,100 buffer semantics, and the floor sits at $50,100 after payout 1.
- **Files:** src/lib/prop-calculator/core/DrawdownStrategy.ts, src/lib/prop-calculator/core/PayoutFloorEffect.ts, src/lib/prop-calculator/core/FundedPayoutCycle.ts, src/lib/prop-calculator/core/LivePlan.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/FundedStateValue.ts, src/lib/prop-calculator/core/LadderSearch.ts, src/lib/prop-calculator/core/FundedDpPayoutCapGaps.ts, src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts, src/cli/commands/prop/shared.ts, src/cli/commands/prop/plans/command.ts, src/cli/commands/prop/optimize/dp/command.ts, .claude/prop-firms/mffu/pro.md (note that the engine now models the first-payout trigger; docs step last)
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/DrawdownTransitions.test.ts, using `new EodTrailingDrawdown({ amount: dollars(2000), lock: { atProfit: null, lockedThreshold: (s) => s + 100 } })` and stateAt(54_500, 48_000, false). onDayClose must leave threshold 52_500 unlocked. moveToLock must set threshold 50_100 and locked true (a downward move). A later onDayClose at 60_000 must keep 50_100. moveToLock is idempotent when already locked. prospectiveLockThreshold(state, MoveToLockedFloor) on the unlocked state must return 50_100; for LockAtPlanFloor it must return 52_500.
  - tests/unit/lib/prop-calculator/mffuPro.test.ts: pro().fundedDrawdown.lock?.atProfit is null; pro().payoutFloorEffect === PayoutFloorEffect.MoveToLockedFloor; pro().drawdown.lock?.atProfit === 2100 (the eval side is pinned unchanged). Funded trailing without a profit lock: state = pro().initialState(); pro().beginFundedPhase(state); state.balance = 54_500; pro().fundedDrawdown.onDayClose(state). Expect threshold 52_500 and thresholdLocked false. Today it is 50_100 and locked.
  - Same file, first payout moves the MLL. Continue that state with a tracker created at the $50,000 start (lastPayoutBalance 50_000, qualifyingDaysAtLastPayout 0) and state.qualifyingDays = 14. tryFundedPayout({ minRetainedCushion: pro().resolveRetainedCushion(undefined), payoutRequestSize: undefined, maxPayouts: Infinity }) must return debited 2_400 and traderReceives 1_920, leaving balance 52_100, threshold 50_100 and thresholdLocked true. Today it returns null, because payoutFloorEffect None leaves withdrawable at 54_500 - (52_500 + 2_000) = 0.
  - Same file, deadlock guard. Use the always-win simulate harness from payoutContinuity.test.ts (winrate 1, riskPerTrade 250, rrRatio 2, tradesPerDay 1, trials 1, fundedHorizonDays 120). Expect passProbability 1, fundedBustProbability 0 and expectedGrossPayout > 0. This fails if someone swaps in LockAtPlanFloor with atProfit null.
  - tests/unit/lib/prop-calculator/core/PayoutFloorEffect.test.ts: (a) withOverrides({ fundedDrawdown: EodTrailing with no lock, payoutFloorEffect: MoveToLockedFloor }) throws /MoveToLockedFloor/. (b) A funded lock with atProfit null combined with payoutFloorEffect None or LockAtPlanFloor throws /no profit trigger/. (c) The existing /LockAtPlanFloor/ message is unchanged.
  - tests/unit/lib/prop-calculator/core/LivePlan.test.ts: a LivePlan with a lock (atProfit null, lockedThreshold s => s + 100), requiresLockForWithdrawal false and MoveToLockedFloor, in a state at balance 5_000 with a trailing threshold of 2_500, has withdrawableAmount 4_900 (balance - 100); after withdraw(state, 4_900) the threshold is 100 and the state is locked. The existing LockAtPlanFloor messages stay unchanged.
  - tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts: isFundedDpEligible(MFF Pro) is true. tests/unit/lib/prop-calculator/core/FundedDpPayoutCapGaps.test.ts: fundedDpPayoutCapGaps(MFF Pro) contains kind PayoutTriggeredLockPreLockOffsetSaturates, and no shipped plan with a profit-triggered lock emits it.
  - tests/unit/cli/prop/shared.test.ts: describeDrawdownLock(undefined) === 'no lock'; for { atProfit: 2100 } it returns 'locks at +$2,100'; for { atProfit: null } it returns 'locks on first payout'.
- **Depends on:** R1-32 (other cluster: also adds a separate fundedDrawdown and needs the same CLI funded-drawdown line and describeDrawdownLock), R1-9 (other cluster: ladder intraday trailing; LadderSearch.ts must handle atProfit null), R1-6 (other cluster: funded DP daily loss limit; edits FundedStateValue near the impliedOffsetMultiple and eligibility code), R1-48 / R1-49 (other cluster: MFFU Rapid Live payout floor; edits LivePlan.floorAfterWithdrawal/withdraw switches that gain the MoveToLockedFloor case)
- **Risks:** (1) The pre-lock trailing behaviour for Pro is marked Not Confirmed in pro.md. If the real pre-lock MLL is static at $48,000, this model is conservative before the first payout (more busts), where the old model was optimistic. The payout-trigger itself is confirmed. (2) The 'moves to' semantics can lower the floor from a trailed level (for example $52,500) to $50,100 at payout. That follows the literal doc wording, but the direction is unverified (see open questions). (3) Making DrawdownLockConfig.atProfit nullable is a cross-cutting type change. Every reader of lock.atProfit must handle null, and the compiler enforces this in-repo. (4) DP: pre-lock offsets above 3 x drawdown saturate for Pro, which slightly understates balance-derived quantities in rare high-profit pre-payout states. This is disclosed via the new gap warning, not silently. (5) Pro's simulated funded bust rate rises and net falls. Rankings involving MFF Pro will move.


**Open questions**
- R1-51: pro.md says 'After first payout, MLL moves to $50,100 and remains static', but pre-lock trailing is Not Confirmed. If the MLL had trailed above $50,100 (e.g. $52,500) before the first payout, does it move DOWN to $50,100? The design follows the literal 'moves to' (MoveToLockedFloor, set exactly), which also avoids the LockAtPlanFloor deadlock and matches the DP's locked-threshold assumption. A raise-only reading would need a different withdrawable rule to avoid the deadlock. Should this be confirmed against MFF's help center before landing?
- R1-51: Pro's evaluation drawdown currently also locks at +$2,100 (the shared drawdown object), but pro.md documents no evaluation lock at all (EOD $2,000 trailing, target $3,000). The design deliberately leaves eval behaviour unchanged, since R1-51's confirmed scope is the funded trigger. Should the eval lock be removed as a separate item?
- R1-51: pro.md says the first payout requires '14 calendar days from first trade', but the engine models minDaysAfterPassForPayout 14 as qualifying (trading) days after the pass. This is outside this item. Should it be tracked as a new finding?
- R1-31: Alpha Futures' help center and product pages still advertise a flat 90% from the first payout. The engine will follow the doc tree's 2026-09-22 resolution in favour of the signed General Service Agreement (70/80/90 by virtual payout count per account). Please confirm this is the intended source of truth, since it moves Alpha Futures down cross-firm rankings.
- R1-33: the design removes Alpha's minPayoutProfit ($200/$500/$1,000), because it duplicated the request minimum and is strictly dominated once minPayoutRequest is set with the 50% profit-share cap, so there is no numeric change. Keep it instead if you prefer not to touch it; either way the engine output is identical.

## Cluster `limits` (R1-54, R1-36, R1-43)

**Shared contracts:** 1. New core file src/lib/prop-calculator/core/TierBasis.ts, exported from core/index.ts:
- `enum TierBasis { LiveProfit = 'live-profit', PeakSessionCloseProfit = 'peak-session-close-profit', SessionOpenProfit = 'session-open-profit' }`
- `interface TierProfitContext { readonly peakDayCloseProfit: number; readonly profit: number; readonly sessionOpenProfit: number }`
- `tierProfitFor(basis, context)`, where PeakSessionCloseProfit = max(peak, sessionOpen)
- `selectTier<T>(tiers, profit, minProfitOf)`
- `tierBreakpoints(values)`

2. Both Tiered configs replace `isEffectiveNextSession?: boolean` with `tierBasis?: TierBasis` (unset means LiveProfit). This applies to ContractLimitConfig and to DailyLossLimitConfig. The old DLL flag meant peak and the old contract flag meant session open. Migration map:
- Tradeify SELECT_CONTRACT_LIMITS -> PeakSessionCloseProfit
- Tradeify SCALING_FUNDED_DLL -> PeakSessionCloseProfit (preserved)
- Apex EOD contract and DLL -> SessionOpenProfit
- Apex Intraday -> LiveProfit
- Lucid, TopStep, E8 Zero and FTMO contract tiers -> SessionOpenProfit (preserved)

3. `DailyLossLimitContext extends TierProfitContext { isThresholdLocked: boolean }`. sessionOpenProfit is REQUIRED. Hand-built contexts in LivePlan, LadderSearch and tests must supply it.

4. State invariant for every AccountState passed to Plan.isDayLockedOut, isBust, dailyLossLimitContext or tierProfitContext:
- `plan.accountProfit(state) - state.todayPnL` must equal the session-open profit.
- `state.peakDayCloseProfit` must equal the highest prior day-close profit of the current funded account. It is reset only by beginFundedPhase and is never lowered by payouts.
- In the funded DP, states must carry todayPnL = cushionNow - cushionAtDayStart (R1-6 must adopt this), and peakDayCloseProfit = ratchetPeakOf(ratchet).

5. Signatures:
- `maxContractsAt(config, profit, profitAtSessionStart = profit, peakDayCloseProfit = profitAtSessionStart)`
- `resolveContractLimit(limits, phase, isMicro, accountProfit, accountProfitAtSessionStart = accountProfit, peakDayCloseProfit = accountProfitAtSessionStart)`
- New Plan methods: `tierProfitContext(state)`, `fundedContractTierBreakpoints(basis, isMicro)`, `fundedDailyLossLimitTierBreakpoints(basis)`.
- New exports: `contractLimitTierBreakpoints(config, basis)` and `dailyLossLimitTierBreakpoints(config, basis)`.
- DailyLossLimit gets the abstract method `tierBreakpoints(basis)`.

6. FundedStateValue internals shared with R1-6 and R1-7:
- The context gains `isTrackingDayStart`, `ratchetBreakpoints` and `ratchetKeyRadix`.
- `ratchetAtStart` is threaded next to `regimeAtStart` through every solve function and through FundedWorkerDispatch.
- The ratchet is the most significant component of lockedKey and unlockedKey.
- The solve order gets an outermost loop over ratchet, from high to low.
- R1-6 must add `plan.fundedDailyLossLimit.kind !== DailyLossLimitKind.None` to isTrackingDayStart.
- R1-6 must add `plan.fundedDailyLossLimitTierBreakpoints(TierBasis.PeakSessionCloseProfit)` into ratchetBreakpoints, merged through tierBreakpoints.
- R1-6's DLL headroom must be computed from `resolveDailyLossLimit(plan.fundedDailyLossLimit, plan.dailyLossLimitContext(state))` on a state built per item 4.

7. File overlap. Sequence edits to avoid conflicts:
- E8Futures.ts: R1-36, R1-37, R1-39 and the R1-54 rename
- Tradeify.ts: R1-54 and R1-43 note
- ApexTraderFunding.ts: R1-43
- FundedStateValue.ts: R1-54, R1-6 and R1-7 (dayCloseValue)

Suggested order: R1-54 core and simulator, then R1-43 firm data, then R1-36 (independent), then the R1-54 DP ratchet and day-start work, then R1-6.


### R1-54
- **Root cause:** Confirmed in code. (1) src/lib/prop-calculator/core/ContractLimits.ts:52-54: a Tiered funded contract limit with isEffectiveNextSession picks its tier from profitAtSessionStart, which is that day's opening profit and can go down. Nothing in the contract-limit path records a high-water mark. The simulator passes the opening profit (src/lib/prop-calculator/simulator/day.ts:89 profitAtDayStart, used at :142), and so does the funded DP (src/lib/prop-calculator/core/FundedStateValue.ts:495-501). (2) src/lib/prop-calculator/firms/tradeify/Tradeify.ts:39-60: SELECT_CONTRACT_LIMITS, shared by Select Daily (:259) and Select Flex (:309), reuses that flag. So after a losing close or a payout (Select Flex's 50%-of-profit cap cuts profit in half), the cap falls from 4/40 to 3/30 or 2/20. select-flex.md:46 says the tiers are cumulative. (3) The simulator state already carries the peak it needs: AccountState.peakDayCloseProfit (core/AccountState.ts:6). Plan.recordDayClosePeak updates it at every close (core/Plan.ts:391-396, called at day.ts:222). It resets only in beginFundedPhase (Plan.ts:352), and payouts never lower it. The contract path just never reads it. (4) The DPs do not carry the peak. FundedStateValue.buildState (:434-452) hardcodes peakDayCloseProfit: 0. There is also a latent sibling DP bug. When the plan has no funded consistency rule, solveDayTree takes the single-solve path (:889-899) with cushionAtDayStart = 0. Session-open profit is then computed at :963-964 as threshold minus startingBalance, and the policy lookup uses cushionStartIndex 0 (:1823, :1854). This pins every session-open-keyed contract tier to the bottom tier whenever a plan has no funded consistency and sizing is on. Affected plans include TopStep standard XFA, FTMO, E8 Zero and both Select plans. (5) The same flag name means two different things. Tiered DLL isEffectiveNextSession selects peakDayCloseProfit (core/DailyLossLimit.ts:177-179), while the contract flag selects session-open profit. That mismatch is why the audit's Tradeify note and the finder assumed the two mirror each other.
- **Design:** Core, new domain file src/lib/prop-calculator/core/TierBasis.ts (PascalCase, exported from core/index.ts):
- export enum TierBasis { LiveProfit = 'live-profit', PeakSessionCloseProfit = 'peak-session-close-profit', SessionOpenProfit = 'session-open-profit' }
- export interface TierProfitContext { readonly peakDayCloseProfit: number; readonly profit: number; readonly sessionOpenProfit: number }
- export function tierProfitFor(basis: TierBasis, context: TierProfitContext): number. This is an exhaustive switch: LiveProfit -> profit; SessionOpenProfit -> sessionOpenProfit; PeakSessionCloseProfit -> Math.max(peakDayCloseProfit, sessionOpenProfit).
- export function selectTier<T>(tiers: readonly T[], profit: number, minProfitOf: (tier: T) => number): T | undefined. This is the single shared highest-min<=profit-else-lowest algorithm that is now duplicated in ContractLimits.maxContractsAt (:55-68) and TieredDailyLossLimit.selectTier (:150-165). Both call it (DRY).
- export function tierBreakpoints(values: readonly number[]): readonly number[] returns the values sorted ascending, without duplicates.

Replace the boolean with the enum on both configs (no invalid states, one meaning):
- ContractLimits.ts ContractLimitConfig Tiered: `readonly tierBasis?: TierBasis` replaces isEffectiveNextSession. Unset means LiveProfit.
- maxContractsAt(config, profit: number, profitAtSessionStart: number = profit, peakDayCloseProfit: number = profitAtSessionStart). It keeps the existing positional-default pattern (PositionSizing.test.ts already documents 'keeping every existing four-argument call site identical'). Body: selectTier(config.tiers, tierProfitFor(config.tierBasis ?? TierBasis.LiveProfit, {peakDayCloseProfit, profit, sessionOpenProfit: profitAtSessionStart}), (t) => t.minBalance)?.maxContracts ?? null.
- export function contractLimitTierBreakpoints(config: ContractLimitConfig | null, basis: TierBasis): readonly number[]. It returns the tiers' minBalance values only when config is Tiered and its basis equals `basis`, else [].
- PositionSizing.resolveContractLimit gains a 6th param `peakDayCloseProfit: number = accountProfitAtSessionStart` and forwards it to maxContractsAt.
- DailyLossLimit.ts is updated the same way (shared with R1-43). Tiered config: `readonly tierBasis?: TierBasis` replaces isEffectiveNextSession. `export interface DailyLossLimitContext extends TierProfitContext { isThresholdLocked: boolean }`, so sessionOpenProfit becomes REQUIRED (fail loud). TieredDailyLossLimit(tiers, tierBasis: TierBasis).resolve = selectTier(tiers, tierProfitFor(this.tierBasis, context), t => t.minProfit)?.dailyLossLimit ?? null. Add abstract `tierBreakpoints(basis: TierBasis): readonly number[]` on the DailyLossLimit class hierarchy. Flat, None and PeakProfitShare return []. AfterThresholdLock returns the concatenation of both children. Tiered returns its minProfits when the basis matches. Export dailyLossLimitTierBreakpoints(config, basis). scaleDailyLossLimit's Tiered case preserves tierBasis. buildDailyLossLimit passes `config.tierBasis ?? TierBasis.LiveProfit`.
- Plan.ts: add `tierProfitContext(state: AccountState): TierProfitContext`, which returns {peakDayCloseProfit: state.peakDayCloseProfit, profit: this.profitFor(state), sessionOpenProfit: this.profitFor(state) - state.todayPnL}. The derivation is exact because resetForNewDay zeroes todayPnL and runDay adds each pnl to both balance and todayPnL (day.ts:174-175). Only runDay calls isBust and isDayLockedOut in the simulator. dailyLossLimitContext(state) becomes {...this.tierProfitContext(state), isThresholdLocked}. Add `fundedContractTierBreakpoints(basis: TierBasis, isMicro: boolean): readonly number[]`, which is tierBreakpoints(contractLimitTierBreakpoints(isMicro ? fundedMicros : fundedMinis, basis)). Add `fundedDailyLossLimitTierBreakpoints(basis: TierBasis): readonly number[]`.
- LivePlan.isDayLockedOut (:176-180) adds sessionOpenProfit: profit - state.todayPnL. LadderSearch.ts:361-365 adds sessionOpenProfit: balance - start (the ladder resolves the DLL at day start).

Simulator: in simulator/day.ts, drop the local profitAtDayStart (:89). In the per-trade loop, compute `const tierContext = plan.tierProfitContext(state)` and call resolveContractLimit(plan.contractLimits, phase, isMicro, tierContext.profit, tierContext.sessionOpenProfit, tierContext.peakDayCloseProfit). No new state is needed; the peak is already maintained.

Firm data:
- Tradeify.ts SELECT_CONTRACT_LIMITS fundedMicros/fundedMinis: tierBasis: TierBasis.PeakSessionCloseProfit (the R1-54 fix).
- SCALING_FUNDED_DLL: tierBasis: TierBasis.PeakSessionCloseProfit. This preserves today's peak behaviour exactly; see open question.
- Update notes 130/132 (they name the old flag), and add one note stating the Select scaling plan is cumulative and never falls back, citing select-flex.md and the 'Select Flex and Select Daily Payout Policies' article.
- Mechanical, behaviour-preserving rename to tierBasis: TierBasis.SessionOpenProfit in LucidTrading.ts:87,96, TopStep.ts:37,46, E8Futures.ts:44, FtmoFutures.ts:44,53 and Apex fundedContractLimitsOf (done in R1-43). Update the notes in those same files where they name `isEffectiveNextSession`, and change nothing else in those notes.

Funded DP (core/FundedStateValue.ts):
- FundedSolveContext adds `isTrackingDayStart: boolean`, `ratchetBreakpoints: readonly number[]` and `ratchetKeyRadix: number`.
- In buildFundedSolveContext: ratchetBreakpoints = positionSizing === null ? [] : plan.fundedContractTierBreakpoints(TierBasis.PeakSessionCloseProfit, positionSizing.instrument.isMicro). ratchetKeyRadix = Math.max(1, ratchetBreakpoints.length). isTrackingDayStart = isTrackingFundedConsistency || (positionSizing !== null && plan.fundedContractTierBreakpoints(TierBasis.SessionOpenProfit, isMicro).length > 0). R1-6 extends both predicates for the DLL; see shared_contracts.
- Private helpers: ratchetLevelOf(context, profit) returns the last index i with ratchetBreakpoints[i] <= profit, else 0. ratchetPeakOf(context, level) returns ratchetBreakpoints[level] ?? 0. Using the breakpoint as the representative peak is exact, because a tier depends only on which breakpoints have been crossed, and sessionOpen <= the true peak < the next breakpoint.
- Thread `ratchetAtStart: number` next to regimeAtStart through solveDayTree, solveDayTreeOnce, bestActionAt, valueOfRisk, withinDayContinuation, dayCloseValue, sweepLevel, solveLevelToConvergence, FundedWorkerPool.runGrid and FundedWorkerDispatch.
- buildState takes a ratchet argument and sets peakDayCloseProfit: ratchetPeakOf(ratchet).
- candidateRisks/computeCandidateRisks take the ratchet. The cache gets one more Map level keyed by ratchet. resolveContractLimit receives the 6th argument ratchetPeakOf(ratchet).
- dayCloseValue: after plan.recordDayClosePeak(state) and before tryFundedPayout, compute ratchetAtEnd = Math.max(ratchetAtStart, ratchetLevelOf(context, state.balance - context.startingBalance)). This is the pre-payout close profit, matching the simulator's order. Pass it to continuationValue.
- Key layout: lockedKey = ((((ratchet * regimeKeyRadix + regime) * idleKeyRadix + idle) ...) * 2. unlockedKey = (((ratchet * offsetBucketCount + offsetIndex) * regimeKeyRadix + regime) ...) * 2 + 1. maxLockedKeyExclusive, maxUnlockedKeyExclusive, lockedLevelKey and unlockedLevelKey include the ratchet the same way.
- Solve order: the ratchet only rises, so wrap both the locked-regime loop (:1687) and the unlocked-offset loop (:1738) in `for (let ratchet = ratchetKeyRadix - 1; ratchet >= 0; ratchet--)`. Every read into a higher ratchet then hits already-converged values, mirroring how regime is solved.
- Replace isTrackingFundedConsistency with isTrackingDayStart at the day-start branches: :889, :1198, :1202, the runGrid param at :1259/:1330, :1518, :1823 and :1854. Keep isTrackingFundedConsistency for the cycleBestDay bucket count (:334).
- initialValue uses ratchetLevelOf(mainContext, 0). computeRisk derives ratchet = ratchetLevelOf(mainContext, state.peakDayCloseProfit) for its level-key lookups.

Eval DP (core/EvalStateValue.ts): no change. Eval caps are flat numbers, so neither basis applies there.
- **Files:** src/lib/prop-calculator/core/TierBasis.ts (new), src/lib/prop-calculator/core/index.ts, src/lib/prop-calculator/core/ContractLimits.ts, src/lib/prop-calculator/core/DailyLossLimit.ts, src/lib/prop-calculator/core/PositionSizing.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/LivePlan.ts, src/lib/prop-calculator/core/LadderSearch.ts, src/lib/prop-calculator/core/FundedStateValue.ts, src/lib/prop-calculator/simulator/day.ts, src/lib/prop-calculator/firms/tradeify/Tradeify.ts, src/lib/prop-calculator/firms/lucid/LucidTrading.ts, src/lib/prop-calculator/firms/topstep/TopStep.ts, src/lib/prop-calculator/firms/e8futures/E8Futures.ts, src/lib/prop-calculator/firms/ftmo-futures/FtmoFutures.ts, src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts (note text naming the old flag only), tests/unit/lib/prop-calculator/core/TierBasis.test.ts (new), tests/unit/lib/prop-calculator/core/ContractLimits.test.ts, tests/unit/lib/prop-calculator/core/PositionSizing.test.ts, tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts, tests/unit/lib/prop-calculator/core/FundedPayoutCycle.test.ts (fixture at :984), tests/unit/lib/prop-calculator/core/DailyLossLimit.test.ts (context helper :13), tests/unit/lib/prop-calculator/core/DailyLossLimitShape.test.ts (context :80), tests/unit/lib/prop-calculator/core/DailyLossLimitCache.test.ts (context helper), tests/unit/lib/prop-calculator/core/ScalingDailyLossLimit.test.ts (:29, :84-88), tests/unit/lib/prop-calculator/lucidTrading.test.ts (:212-219), tests/unit/lib/prop-calculator/FtmoFutures.test.ts (:291-292), tests/unit/lib/prop-calculator/tradeify.test.ts, .claude/prop-firms/tradeify/select-flex.md (line 46 'Matches this repo's engine' becomes true; via doc-updater), .claude/prop-firms/tradeify/select-daily.md (line 60, after live verification)
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/TierBasis.test.ts (new). With ctx {profit: 3050, sessionOpenProfit: 2900, peakDayCloseProfit: 3100}: tierProfitFor(LiveProfit) = 3050, tierProfitFor(SessionOpenProfit) = 2900, tierProfitFor(PeakSessionCloseProfit) = 3100. With {peak: 1000, sessionOpen: 2900}, PeakSessionCloseProfit = 2900. selectTier on out-of-order tiers [2000, 0, 1500]: profit 1499 -> the 0 tier, 1500 -> the 1500 tier, -500 -> the lowest tier, 50000 -> the 2000 tier. tierBreakpoints([2000, 0, 1500, 1500]) = [0, 1500, 2000].
  - tests/unit/lib/prop-calculator/core/ContractLimits.test.ts, new describe 'cumulative tier (PeakSessionCloseProfit)'. Config tiers 2@0, 3@1500, 4@2000: maxContractsAt(cfg, 1200, 1200, 2100) = 4; (cfg, 1200, 1200, 1700) = 3; (cfg, 2500, 1200, 1400) = 2 (an intraday crossing does not raise the cap); (cfg, 0, 1500) = 3 (peak defaults to session open). The same tiers with SessionOpenProfit: (cfg, 1200, 1200, 2100) = 2 (session-open ignores the peak). Migrate the FROZEN_TIERS/OPTED_OUT_TIERS fixtures to tierBasis: SessionOpenProfit/LiveProfit and keep their existing assertions unchanged.
  - tests/unit/lib/prop-calculator/core/PositionSizing.test.ts. With SCALING_TIERS (1@0, 5@300) and tierBasis PeakSessionCloseProfit: resolveContractLimit(limits, Funded, false, 0, 0, 500) = 5 and (limits, Funded, false, 0, 0, 200) = 1. The Eval phase ignores the peak: (limits, Eval, false, 0, 0, 999999) = 7.
  - tests/unit/lib/prop-calculator/tradeify.test.ts. For Select Daily and Select Flex 50K: fundedMinis and fundedMicros have tierBasis === TierBasis.PeakSessionCloseProfit. resolveContractLimit(plan.contractLimits, Funded, false, 1200, 1200, 2100) = 4; with isMicro = true it is 40; (…, 1200, 1200, 1600) = 3. The Growth funded DLL keeps tierBasis PeakSessionCloseProfit (preservation guard).
  - tests/unit/lib/prop-calculator/tradeify.test.ts, runDay two-day ratchet test on Select Flex 50K, Funded phase. Setup: state balance 51,900, threshold 50,100, thresholdLocked true, peakDayCloseProfit 1,900; positionSizing ES with 4 stop points ($200 per contract); commission 0; rr 1; winrate 0.5; RungSizing.CapToCushion. Day 1: flatDayPolicy [200], scripted rng [0.0] (a win), closing at 52,100 so runDay records peak 2,100. Then set state.balance = 51,200 to simulate a $900 withdrawal. Day 2: flatDayPolicy [800], rng [0.99] (a loss). Expect state.balance === 50,400, i.e. 4 contracts. Pre-fix it is 50,800 (2 contracts, because opening profit 1,200 < 1,500).
  - tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts, new describe 'cumulative contract tier in the funded DP'. Toy plan: onePayoutToyPlan().withOverrides with fundedMinis tiers 1@0, 4@300 and tierBasis PeakSessionCloseProfit, no funded consistency. Solve with the secondTradeRisk-style config (NQ, 1.25 points = $25 per contract, actionStepMultiple 0.25, cushionStepMultiple 1, tradesPerDay 2, rr 2, winrate 0.5). A state with balance 1,200, threshold 1,000 locked, todayPnL 0 and peakDayCloseProfit 350 gives computeRisk(state, 0) === 100. The same state with peak 200 gives <= 25.
  - tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts, latent day-start regression. The same toy with tierBasis SessionOpenProfit and NO funded consistency (fundedConsistency rule null): a state with balance 1,350, threshold 1,000 locked, todayPnL 0 gives computeRisk(state, 0) === 100. Pre-fix it is <= 25, because the non-tracking path solved with cushionAtDayStart 0. Migrate tieredContractToyPlan(isEffectiveNextSession) to take a TierBasis; keep its three existing assertions.
  - Migrate the existing fixtures that name isEffectiveNextSession: FtmoFutures.test.ts:291-292 becomes expect(minis.tierBasis).toBe(TierBasis.SessionOpenProfit). FundedPayoutCycle.test.ts:984 toStrictEqual gets tierBasis: TierBasis.SessionOpenProfit. Add sessionOpenProfit to every hand-built DailyLossLimitContext (DailyLossLimit.test.ts:13, DailyLossLimitShape.test.ts:80, DailyLossLimitCache.test.ts, ScalingDailyLossLimit.test.ts:29 and :84-88, lucidTrading.test.ts:212-219); for day-start contexts it equals profit.
  - CLI observation, not a unit test: `bun run cli prop sim --firm=tradeify --variant=select-flex --instrument=ES --stop-points=4 --funded-risk=800 --seed=42 --trials=2000` before and after. Funded monthly net and payouts should rise, and the eval pass rate should be unchanged (eval caps are flat).
- **Depends on:** R1-6 extends the same DP ratchet and day-start machinery to the DLL (see shared_contracts). R1-54 lands first.
- **Risks:** (a) Enum migration touches 7 firm files and about 10 test files. Every SessionOpenProfit migration must be behaviour-identical: run each affected firm's test file (tradeify, lucidTrading, topstep, E8Futures, FtmoFutures, apex) and ContractLimits/PositionSizing/FundedStateValue with `bunx vitest run <file>`. (b) Select Daily's cumulative rule is not stated in select-daily.md. It shares the SELECT_CONTRACT_LIMITS constant and the source article, but help.tradeify.co returned HTTP 403 for Reviewer C. CLAUDE.md requires live help-center verification before changing firm data. If Select Daily turns out to revert, split the constant. (c) DP cost: the state space grows by ratchetKeyRadix (3 for Select with sizing). Turning on isTrackingDayStart for session-open tiers multiplies solve cost by the cushion bucket count (up to 61 locked) for TopStep standard, FTMO, E8 Zero and Select when positionSizing is set. Today the CLI optimize dp never passes positionSizing (AverageRewardSolver fundedGrid is unset in cli/commands/prop/optimize/dp/command.ts:163), so only the programmatic and test paths pay this. (d) The worker SharedArrayBuffer snapshot size is derived from maxLocked/UnlockedKeyExclusive. Both must include the ratchet, or workers read out of bounds (silently 0). Add a parallel-path test with totalPairs >= MIN_PARALLEL_GRID_CELLS, or assert that snapshotLength covers the ratchet. (e) Characterization or snapshot tests for Select plans with sizing may shift. That is expected; confirm each shift is in the direction of more contracts after a pullback. (f) sessionOpenProfit is now required on DailyLossLimitContext. Any future caller that builds a state without a consistent todayPnL resolves session-open tiers wrongly.


### R1-36
- **Root cause:** Confirmed. src/lib/prop-calculator/firms/e8futures/E8Futures.ts:129-140, in buildSignaturePlan, sets evalMicros: contracts(4) and fundedMicros: {Flat, contracts(4)}, the same numbers as the minis. The justification note at :92 rests on a false premise ('the article doesn't distinguish mini vs micro'). The verified doc .claude/prop-firms/e8futures/signature.md:24, :32 and :112 says the cap is margin-based: $40,000 of margin at $50K and $1,000 per MNQ/MES, so up to 40 micros; a $10,000-margin mini gives 4. The cap flows into PositionSizing.resolveContractLimit (core/PositionSizing.ts:31-51), then capRiskToContractLimit in simulator/day.ts:131-144, EvalStateValue.ts:138-146 and FundedStateValue.ts:492-507, plus the ladder's min-stop-points display (cli/commands/prop/ladder/command.ts:118). Any micro run with --stop-points caps risk at 4 contracts x $2 x stop. Example: 20 points gives $160 instead of $250-300. Reviewers B and C reproduced a 48.0% pass rate against 19.2-23.8% uncapped.
- **Design:** Keep the change firm-local and data-driven, with no new core abstraction; margins are firm-specific, so they do not belong on InstrumentSpec. In E8Futures.ts:
- Add `marginAllowance: dollars(40_000)` to the SIZES entry (:24-28), so future Signature sizes ($20k/$80k/$120k per signature.md:24) scale without code changes.
- Add module constants `MINI_CONTRACT_MARGIN = dollars(10_000)` and `MICRO_CONTRACT_MARGIN = dollars(1000)`.
- Add a local function `contractsWithinMargin(allowance: Dollars, perContract: Dollars): ContractCount`, returning contracts(Math.floor(allowance / perContract)).
- In buildSignaturePlan: `const minis = contractsWithinMargin(size.marginAllowance, MINI_CONTRACT_MARGIN)` (4) and `const micros = contractsWithinMargin(size.marginAllowance, MICRO_CONTRACT_MARGIN)` (40). Set evalMinis: minis, evalMicros: micros, fundedMinis: {Flat, maxContracts: minis}, fundedMicros: {Flat, maxContracts: micros}.
- Replace note :92 with a corrected note. It should say the cap is margin-based ($40,000 at $50K; $10,000 per mini gives 4; $1,000 per MNQ/MES gives 40), cite helpfutures.e8markets.com article 10155917 and signature.md, and record that the earlier flat-4 micro cap understated micros 10x.
- Note :97 repeats the same false premise for Zero; see open question.
No engine or core change is needed. `prop plans` will print '4 mini / 40 micro' through cli/commands/prop/plans/command.ts:86. The web UI (TradingInputs.tsx:160) reads evalMicros through resolveContractLimit and picks it up automatically.
After implementation, update .claude/prop-firms/e8futures/signature.md:112 (remove the doc/engine-mismatch bullet) via ecc:doc-updater. Before changing data, re-verify the margin table live on helpfutures.e8markets.com article 10155917, per CLAUDE.md. That domain returned 403 on 2026-09-23; help content was last verified 2026-09-20.
- **Files:** src/lib/prop-calculator/firms/e8futures/E8Futures.ts, tests/unit/lib/prop-calculator/E8Futures.test.ts, .claude/prop-firms/e8futures/signature.md (remove mismatch bullet at :112; via doc-updater)
- **Tests first:**
  - tests/unit/lib/prop-calculator/E8Futures.test.ts: replace 'caps contracts flat at 4, both eval and funded' (:100-108) with 'caps contracts by margin'. Expect evalMinis 4, evalMicros 40, fundedMinis Flat 4, fundedMicros Flat 40. resolveContractLimit(plan.contractLimits, TradingPhase.Funded, true, 0) = 40; resolveContractLimit(…, Eval, true, 0) = 40.
  - tests/unit/lib/prop-calculator/E8Futures.test.ts, runDay regression, Signature 50K, Eval phase. Start from plan.initialState(); positionSizing MNQ with 20 stop points ($40 per contract); flatDayPolicy [250]; winrate 0.5; rr 1; commission 0; scripted rng [0.99] (a loss). Expect state.balance === 49,750 (pre-fix 49,840, capped at 4 x $40 = $160).
  - tests/unit/lib/prop-calculator/E8Futures.test.ts, cap still binds at 40. Same setup with flatDayPolicy [2000] (50 implied contracts). Expect state.balance === 48,400 (40 x $40 = $1,600; pre-fix 49,840). The drawdown floor of 48,000 is not breached.
  - CLI observation, not a unit test: `bun run cli prop sim --firm=e8futures --variant=signature --instrument=MNQ --stop-points=20 --risk=300 --seed=42 --trials=2000` should now match Reviewer C's uncapped figures (about a 19.2% pass rate and about $989 per month). `bun run cli prop plans --firm=e8futures` should show '4 mini / 40 micro'.
- **Depends on:** none
- **Risks:** (a) Pass rates and monthly nets for E8 Signature micro runs change a lot (for example 48.0% to 19.2%). That is intended, but any snapshot or characterization test that pins Signature with MNQ sizing will shift. (b) This assumes every mini (NQ and ES) uses E8's $10,000 margin, because the engine only tells minis from micros. If E8's margin table lists NQ above $10,000, the NQ cap is really below 4. That is a pre-existing assumption, but it should be checked during live re-verification. (c) E8Futures.ts is also edited by R1-37 (fee basis) and R1-39 (Signature notes). Sequence the edits to avoid conflicting note rewrites. (d) The live help center (e8markets.com) returned 403 on 2026-09-23. If it cannot be re-verified, report this as verified against the 2026-09-20 doc only, per fail-loud.


### R1-43
- **Root cause:** Confirmed. src/lib/prop-calculator/firms/apex/ApexTraderFunding.ts:255-257, fundedDailyLossLimitOf, returns `{kind: Tiered, tiers: size.fundedDllTiers}` with no timing basis. It is used for EOD (:132) and Intraday. TieredDailyLossLimit.resolve (core/DailyLossLimit.ts:176-182) therefore selects the tier from context.profit, the live profit built in Plan.dailyLossLimitContext (core/Plan.ts:409-415). That value is re-resolved before every trade (simulator/day.ts:123-126, feeding affordable = min(cushion, DLL + todayPnL) at :127-130) and after every trade in Plan.isDayLockedOut (Plan.ts:443-449, called from day.ts:192). Meanwhile the same Level system's contract cap is frozen at session open (fundedContractLimitsOf(size, true) at :113-116). Apex's rule (eod.md:81) says Levels are set once per day from the prior session's close and never change mid-session. The existing DLL flag cannot express that, because it selects peakDayCloseProfit (DailyLossLimit.ts:177-178), which is a high-water mark and not the prior close. DailyLossLimitContext (DailyLossLimit.ts:48-52) carries no session-open value at all. The error runs both ways. Worked example on 50K EOD: prior close at $3,100 profit, then an intraday loss of $600. The engine drops to the $1,000 tier and locks out at -$1,000, where Apex allows -$2,000. Prior close at $2,900 plus a $150 win: the engine lets one trade size off the $2,000 DLL. DPs: the funded DP enforces no DLL at all. buildState hardcodes todayPnL: 0 (FundedStateValue.ts:451), and computeCandidateRisks (:484-512) never caps by DLL headroom; that is R1-6. Apex EOD has a funded consistency rule, so its DP already tracks cushionAtDayStart. The eval DP is unaffected because the Apex eval DLL is Flat (:122-125).
- **Design:** This builds on the TierBasis core introduced in R1-54: DailyLossLimitConfig Tiered `tierBasis?: TierBasis`, DailyLossLimitContext extends TierProfitContext with a required sessionOpenProfit, and Plan.tierProfitContext derives sessionOpenProfit = profit - todayPnL.

Apex (firms/apex/ApexTraderFunding.ts):
- Change the signatures to `fundedContractLimitsOf(size: ApexSize, tierBasis: TierBasis)` (replacing the boolean at :228-231; it sets `tierBasis` on both Tiered configs) and `fundedDailyLossLimitOf(size: ApexSize, tierBasis: TierBasis): DailyLossLimitConfig`, returning {kind: Tiered, tierBasis, tiers: size.fundedDllTiers}.
- One Level basis per variant, so the contract cap and the DLL can never diverge again (DRY on the Level system): module constants `EOD_LEVEL_BASIS = TierBasis.SessionOpenProfit` and `INTRADAY_LEVEL_BASIS = TierBasis.LiveProfit`.
- buildEodPlan uses EOD_LEVEL_BASIS for both fundedContractLimitsOf and fundedDailyLossLimitOf. buildIntradayPlan uses INTRADAY_LEVEL_BASIS for both. That keeps Intraday's current, unconfirmed live-recompute behaviour, matching note 95's sourcing stance.
- Notes: update note 95's flag name, and add a note that the EOD PA DLL now uses the prior session's close via TierBasis.SessionOpenProfit (eod.md:81 'set once per trading day ... never change mid-session'), fixing a two-way divergence at the $3,000/$6,000 breakpoints. Also correct Tradeify note :130's statement that Apex's Tiered DLL is 'unaffected' (Tradeify.ts is already edited in R1-54).

Simulator: no extra change beyond R1-54. day.ts:123-126 and Plan.isDayLockedOut resolve through dailyLossLimitContext, which now carries sessionOpenProfit. For a SessionOpenProfit tier that value stays constant through the day, because profit and todayPnL move together.

DPs:
- Eval DP: nothing to do (Apex eval DLL is Flat). EvalStateValue's continuation states set todayPnL = pnlSoFarExact (:331-335), so the derivation is correct there anyway.
- Funded DP: honouring this requires R1-6. The contract R1-6 must follow is in shared_contracts. In short, every AccountState it builds for isDayLockedOut/isBust and the DLL headroom must set todayPnL = cushionNow - cushionAtDayStart, with balance = threshold + cushionNow, so Plan derives sessionOpenProfit = threshold + cushionAtDayStart - startingBalance. The DLL headroom cap in computeCandidateRisks must use resolveDailyLossLimit(plan.fundedDailyLossLimit, plan.dailyLossLimitContext(thatState)). isTrackingDayStart must be true whenever the funded DLL kind is not None; Apex EOD already qualifies through its funded consistency. PeakSessionCloseProfit DLL breakpoints (Tradeify Growth/Lightning) join ratchetBreakpoints.
- Docs: check .claude/prop-firms/apex/eod.md for any engine-match claim and update it via doc-updater if present. Re-verify Apex's 'Scaling Levels (PA) Explained' and 'Daily Loss Limit Explained' live before merging.
- **Files:** src/lib/prop-calculator/firms/apex/ApexTraderFunding.ts, src/lib/prop-calculator/core/DailyLossLimit.ts (shared with R1-54), src/lib/prop-calculator/core/Plan.ts (shared with R1-54), src/lib/prop-calculator/firms/tradeify/Tradeify.ts (note :130 wording only), tests/unit/lib/prop-calculator/apex.test.ts, tests/unit/lib/prop-calculator/core/DailyLossLimit.test.ts, src/lib/prop-calculator/core/FundedStateValue.ts (via R1-6), tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts (via R1-6)
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/DailyLossLimit.test.ts. Tiered tiers {1000 @ 0, 2000 @ 3000}. With SessionOpenProfit: {profit 0, sessionOpenProfit 3100, peak 5000} -> 2000 and {profit 5000, sessionOpenProfit 100, peak 5000} -> 1000. With PeakSessionCloseProfit: {profit 0, sessionOpenProfit 100, peak 3100} -> 2000. Unset basis: {profit 3050, sessionOpenProfit 2900} -> 2000. scaleDailyLossLimit(tiered with SessionOpenProfit, 0.5).tierBasis === SessionOpenProfit.
  - tests/unit/lib/prop-calculator/apex.test.ts, config. For 50K EOD, fundedDailyLossLimit.tierBasis === TierBasis.SessionOpenProfit and fundedMinis.tierBasis === fundedMicros.tierBasis === SessionOpenProfit. For Intraday, all three are LiveProfit or unset. Update the atProfit helper (:35-37) to set sessionOpenProfit: profit and peakDayCloseProfit: profit, so the existing escalation assertions (:223-244) still hold.
  - tests/unit/lib/prop-calculator/apex.test.ts, resolution. EOD plan: resolveDailyLossLimit(fundedDailyLossLimit, {isThresholdLocked: true, peakDayCloseProfit: 2900, profit: 3050, sessionOpenProfit: 2900}) === 1000 (pre-fix 2000). {profit 2900, sessionOpenProfit 3100, peak 3100} === 2000 (pre-fix 1000). {profit 6100, sessionOpenProfit 5900} === 2000. Intraday plan: {profit 3050, sessionOpenProfit 2900} === 2000 (unchanged live behaviour).
  - tests/unit/lib/prop-calculator/apex.test.ts, lockout. EOD funded state: balance 52,100, threshold 50,100, thresholdLocked true, todayPnL -1,000 (session open profit $3,100). isDayLockedOut(state, Funded) === false (pre-fix true). The same state on the Intraday plan gives true.
  - tests/unit/lib/prop-calculator/apex.test.ts, runDay downward case. EOD 50K Funded; state balance 53,100, threshold 50,100 locked, peak 3,100; flatDayPolicy [600, 600, 600, 600]; rr 1; winrate 0.5; commission 0; CapToCushion; positionSizing null; scripted rng [0.99 x4]. Expect todayPnL === -2000 and balance === 51,100 (pre-fix: -1,000 and 52,100, because the DLL dropped to $1,000 after the first loss).
  - tests/unit/lib/prop-calculator/apex.test.ts, runDay upward case. EOD 50K Funded; state balance 52,900, threshold 50,100 locked, peak 2,900; flatDayPolicy [150, 2000]; rng [0.0, 0.99]. Expect balance === 51,900 (the second trade is sized to 1,150 = DLL 1,000 + 150). Pre-fix it is 51,050 (sized 2,000 off the live $2,000 DLL).
  - After R1-6, in tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts: on an Apex 50K EOD solve with the default grid, computeRisk on a locked state with session-open profit 3,100 and todayPnL -600 returns a risk that can exceed 400 (headroom 1,400 under the $2,000 Level), and never exceeds 1,400. The same state with session-open profit 2,900 never exceeds 400.
- **Depends on:** R1-54 (TierBasis core, tierBasis on DailyLossLimitConfig, required sessionOpenProfit in DailyLossLimitContext, Plan.tierProfitContext), R1-6 (the funded DP must enforce the DLL at all before it can enforce the session-open Level; this covers the DP half of R1-43)
- **Risks:** (a) Apex funded figures move in both directions near the $3,000 and $6,000 breakpoints (50K). Lockouts become less frequent after an intraday loss from a higher Level, and oversizing after an intraday gain disappears. (b) The derivation sessionOpenProfit = profit - todayPnL assumes nothing changes balance mid-day without also changing todayPnL. That holds today: payouts happen after runDay, and only runDay calls isDayLockedOut/isBust. Any future intraday balance mutation must keep the two in sync. (c) Apex Intraday stays on live recompute. That is unconfirmed rather than verified correct, and should be disclosed in the notes. (d) After a payout, SessionOpenProfit uses the post-payout close. That matches 'prior session's closing balance', but if Apex keeps Levels across payouts the basis would need to be PeakSessionCloseProfit. Confirm during live re-verification. (e) Until R1-6 lands, `optimize dp` for Apex EOD still ignores the DLL entirely. The simulator side of R1-43 is complete on its own; the DP side is not.


**Open questions**
- Select Daily cumulative scaling: select-flex.md:46 says the tiers are cumulative. select-daily.md:60 only says 'takes effect the next trading day'. Both cite the shared 'Select Flex and Select Daily Payout Policies' article (help.tradeify.co 12853966), which returned HTTP 403 to the reviewer. The design applies the ratchet to both through the shared SELECT_CONTRACT_LIMITS constant. Should the implementer apply it to Select Daily too if the live article still cannot be fetched, or split the constant and keep Select Daily on SessionOpenProfit until it is verified?
- Tradeify's SCALING_FUNDED_DLL (Growth and Lightning) currently selects its tier from the peak day-close profit, so the DLL increase is permanent. Its own note (Tradeify.ts:130) describes it as 'prior day's confirmed EOD close', which would mean it can revert. The docs don't say whether the $2,000 DLL falls back below $53,000. The design keeps today's peak behaviour (PeakSessionCloseProfit). Confirm, or switch it to SessionOpenProfit after live verification of 'Rules: Daily Loss Limit'. Related: that article says it 'Applies to: Growth, Lightning, and Select Daily Funded accounts', but Select Daily's funded DLL is modeled flat at $1,000.
- E8 Zero has the same margin-based micro understatement as Signature, from the same article and the same false note premise (E8Futures.ts:97). Eval is 4 minis, so micros should be 40, and funded should be 2/3/5 minis giving 20/30/50 micros. This is not an audit item. Should R1-36 extend the contractsWithinMargin derivation to Zero in the same change? Recommended: yes.
- A latent funded-DP bug sits next to R1-54's day-start fix but is outside it. For plans without a funded consistency rule, solveDayTree passes cushionAtDayStart = 0 (FundedStateValue.ts:889-899). dayCloseValue then computes todayPnL = cushionAtEnd, so any plan with minQualifyingDayProfit but no funded consistency counts qualifying days from end-of-day cushion rather than from the day's P&L. An example is a TopStep standard XFA-type plan. The isTrackingDayStart predicate is the natural fix: add `plan.minQualifyingDayProfit !== null`. Should this go into R1-54 or R1-6, or be raised as a new audit item?
- The E8 NQ margin: the engine treats every mini as a $10,000-margin contract (ES per signature.md:32). If E8's margin table lists NQ higher, the NQ cap on Signature is below 4. Confirm during live re-verification of article 10155917; the e8markets help domain returned 403 on 2026-09-23.
- Apex Intraday DLL and contract Level timing stays on live recompute because it is unconfirmed. Should the implementer try to source it (eod.md and intraday.md don't state it)? And does Apex keep Levels across a payout, or re-derive them from the post-payout close?

## Cluster `engine-aggregates` (R1-30, R1-2 (+ the shared cost helper for D1), R1-3, R1-1, R1-4, R1-29, R1-34 (plan attribute + compare filter))

**Shared contracts:** Interfaces other clusters must share (all in src/lib/prop-calculator, exported through core/index.ts or simulator/index.ts barrels, imported via ~/lib/prop-calculator):

1. core/FeeSchedule.ts
```ts
export interface CouponDiscounts {
    activationPercent: Percent0to100;
    bundlePercent?: Percent0to100;
    evalPercent: Percent0to100;
    monthlySubscriptionPercent?: Percent0to100;
    resetPercent?: Percent0to100;
}
export function initialEvalFee(fees: FeeSchedule, discounts?: CouponDiscounts): number;
export function activationFee(fees: FeeSchedule, discounts?: CouponDiscounts): number;
export function subscriptionFee(fees: FeeSchedule, billedDays: number, discounts?: CouponDiscounts): number;
export function rebuyFee(fees: FeeSchedule, discounts?: CouponDiscounts): number;
export function retryFee(fees: FeeSchedule, discounts?: CouponDiscounts): number;
```
bundlePercent scales only initialEvalFee and activationFee. retryFee = min(reset * resetFactor, rebuyFee). Plans with no reset option must encode reset = eval price (R1-50 fixes MFFU Builder's $0).

2. core/Replacement.ts (D1, the ONE cost-per-funded-account formula; ladder cluster R1-8 must call it instead of LadderSearch.ts:303-311, and web useLadderSearch.ts must pass discounts instead of evalPrice)
```ts
export interface ReplacementInputs {
    readonly discounts: CouponDiscounts | undefined;
    readonly evalPassRate: number;
    readonly fees: FeeSchedule;
    readonly meanDaysOnFail: number;
    readonly meanDaysOnPass: number;
}
export interface ReplacementEconomics { attemptsPerFundedAccount: number; costPerFundedAccount: number; daysPerFundedAccount: number; }
export function replacementEconomics(inputs: ReplacementInputs): ReplacementEconomics;
```
evalPassRate is PER EVAL ATTEMPT (ladder: LadderScore.passRate; sim: reachedFunded / attemptsSum). costPerFundedAccount = initialEvalFee + (1/p - 1) * retryFee + subscriptionFee(daysPerFundedAccount) + activationFee; Infinity when p <= 0; throws on p outside [0,1]. LadderScoreConfig should replace `evalPrice: number` with `discounts: CouponDiscounts | undefined` and set costPerFunded/expectedDaysToFunded from this helper.

3. core/Plan.ts additions: `retryFee(discounts?: CouponDiscounts): number`; `purchaseDiscounts(discounts: CouponDiscounts | undefined, accountCount: number): CouponDiscounts | undefined`; PlanInit `availability?: PlanAvailability`, Plan `readonly availability`, `get isPurchasable(): boolean`.

4. core/PlanAvailability.ts: `enum PlanAvailability { CallUpOnly = 'call-up-only', Purchasable = 'purchasable' }`, `PLAN_AVAILABILITY_LABEL`, `rankablePlans(plans, includeCallUp)`. Any new multi-plan ranking must filter through rankablePlans.

5. simulator/types.ts SimOutputs: `passProbability` REMOVED; `evalPassProbability` and `fundedSurvivalProbability` added; `averageRiskPerTrade` added; `roiOnCost.value: null | number` (null = cost 0, print 'n/a' via formatOptionalPercent in ~/lib/format). MultiAccountResult adds `perAccountFundedSurvival`; perAccountPass/pAtLeast/distribution now count eval passes. TrialResult adds `evalDays` and `riskTaken`. simulator barrel exports `hasPassedEval` (replaces isPassingOutcome).

6. CLI (cli/commands/prop/shared.ts): `TradingInputs.toCouponDiscounts(): CouponDiscounts | undefined` (ladder cluster uses it, combined with plan.purchaseDiscounts(..., inputs.copyAccounts)); `includeCallUpArgument` ('include-callup', boolean, default false); `PlanResolver.resolveRankable(selector, includeCallUp)`. Label vocabulary everywhere (CLI and web): 'eval pass' and 'funded survive'; ladder's pass column header becomes 'eval pass'.


### R1-30
- **Root cause:** SimOutputs.passProbability is counts['pass-clean']/totalTrials (src/lib/prop-calculator/simulator/engine.ts:166-168), i.e. P(pass eval AND never bust funded within the horizon), because trial.ts:11-13 isPassingOutcome returns true only for 'pass-clean'. That single field is then presented as an eval pass rate everywhere: sim/command.ts:50 'pass rate', compare/command.ts:72 'pass' and :107 sort key, optimize/dp/command.ts:219 'eval pass rate' (explicitly false), kpiDescriptions.ts:24 (defines it as eval pass), ResultsPanel.tsx:160-211 ('Pass probability' plus a 'Reached funded' KPI that is really the eval pass rate), Plan/Firm/OptimalRisk/RuleStress/Portfolio tables ('Pass%'), SensitivityHeatmap.tsx:274. simulatePortfolio (engine.ts:397) uses the same predicate, so StrategyLabPanel 'MC pass' (survival) sits next to 'Theo' (gambler's-ruin eval-only pass). optimize/funded/command.ts:125 'survivors' is the only consumer that uses it with its true meaning.
- **Design:** D2: two figures, never one ambiguous field.
1. simulator/types.ts SimOutputs: REMOVE passProbability; ADD `evalPassProbability: number` = (counts['pass-clean'] + counts['bust-funded']) / totalTrials (probability of passing the eval within maxAttempts) and `fundedSurvivalProbability: number` = counts['pass-clean'] / totalTrials. Removing the old field makes the compiler flag every consumer (fail loud). Identity: evalPassProbability = 1 - bustProbability - timeoutProbability = fundedSurvivalProbability + fundedBustProbability.
2. simulator/trial.ts: replace `isPassingOutcome` with `export function hasPassedEval(outcome: TrialOutcome): boolean` (pass-clean or bust-funded). Update simulator/index.ts barrel (drop isPassingOutcome, export hasPassedEval). engine.ts uses counts for the two probabilities.
3. simulatePortfolio (engine.ts:397): count passes with hasPassedEval so perAccountPass, accountsPassDistribution, pAtLeast and expectedAccountsPass mean eval pass (apples to apples with theoreticalPassProb); ADD MultiAccountResult.perAccountFundedSurvival = pass-clean accounts / (trials*N).
4. CLI labels, exactly 'eval pass' and 'funded survive': sim/command.ts rows 'eval pass' and 'funded survive' (replacing 'pass rate'); header muted line adds `max attempts N`. Extract `export function simSummaryRows(out: SimOutputs): readonly (readonly [string, string])[]` in sim/command.ts so labels are unit-testable. compare/command.ts columns 'eval pass' (evalPassProbability) and 'survive' (fundedSurvivalProbability); `--sort pass` sorts by evalPassProbability desc (help text 'Rank by: net, cost (per funded account), pass (eval pass) or days'). Extract `export function compareSimOutputs(a: RankedMetrics, b: RankedMetrics, sort: SortKey): number` with `type RankedMetrics = Pick<SimOutputs, 'costPerFundedAccount' | 'daysToPassP50' | 'evalPassProbability' | 'expectedMonthlyNet'>`. optimize/dp/command.ts: extract `export function empiricalSummaryLines(out: SimOutputs): string[]` printing 'eval pass rate: ' from evalPassProbability plus a new 'funded survive: ' line. optimize/funded/command.ts:125 survivors = fundedSurvivalProbability * trials. ladder/command.ts printTable header 'pass' becomes 'eval pass' (width 9), LadderScore.passRate is already eval-only.
5. Web (labels consistent with CLI): kpiDescriptions.ts rename key passProbability -> evalPass ('Share of trials that reached the profit target and passed the evaluation...') and reachedFunded -> fundedSurvival ('Share of trials that passed the evaluation and never busted the funded account within the funded horizon'); panelDescriptions 'pass-rate' and sensitivityPass text say 'eval pass'. ResultsPanel.tsx: KPI 'Eval pass' = evalPassProbability (delta, accent thresholds 0.6/0.3, breakdown line) and KPI 'Funded survive' = fundedSurvivalProbability (replaces 'Reached funded'). PlanComparisonTable, FirmComparisonTable, OptimalRiskTable, RuleStressTestPanel, PortfolioPanel: replace the 'Pass%' column (id 'pass') with 'Eval pass' (id 'evalPass', evalPassProbability) and add 'Funded survive' (id 'fundedSurvive', fundedSurvivalProbability). SensitivityHeatmap: Cell.pass sourced from evalPassProbability, heading 'Eval pass sensitivity', enum member SensitivityMetric.EvalPass. LadderLabPanel 'Pass%' header -> 'Eval pass'. StrategyLabPanel: 'MC pass' now eval pass, add 'MC survive' column from perAccountFundedSurvival.
- **Files:** src/lib/prop-calculator/simulator/types.ts, src/lib/prop-calculator/simulator/trial.ts, src/lib/prop-calculator/simulator/engine.ts, src/lib/prop-calculator/simulator/index.ts, src/cli/commands/prop/sim/command.ts, src/cli/commands/prop/compare/command.ts, src/cli/commands/prop/optimize/dp/command.ts, src/cli/commands/prop/optimize/funded/command.ts, src/cli/commands/prop/ladder/command.ts, src/app/(app)/prop-calculator/_components/kpiDescriptions.ts, src/app/(app)/prop-calculator/_components/ResultsPanel.tsx, src/app/(app)/prop-calculator/_components/PlanComparisonTable.tsx, src/app/(app)/prop-calculator/_components/FirmComparisonTable.tsx, src/app/(app)/prop-calculator/_components/OptimalRiskTable.tsx, src/app/(app)/prop-calculator/_components/RuleStressTestPanel.tsx, src/app/(app)/prop-calculator/_components/PortfolioPanel.tsx, src/app/(app)/prop-calculator/_components/SensitivityHeatmap.tsx, src/app/(app)/prop-calculator/_components/LadderLabPanel.tsx, src/app/(app)/prop-calculator/_components/StrategyLabPanel.tsx, tests/unit/lib/prop-calculator/engineCharacterization.test.ts, tests/unit/lib/prop-calculator/inactivityClosure.test.ts, tests/unit/lib/prop-calculator/payoutPerFundedAccount.test.ts, tests/unit/lib/prop-calculator/simulator.test.ts, tests/unit/lib/prop-calculator/payoutContinuity.test.ts, tests/unit/lib/prop-calculator/payoutMethodFeeAndEvalCap.test.ts, tests/unit/lib/prop-calculator/ladderSearch.test.ts, tests/unit/lib/prop-calculator/apex.test.ts, tests/unit/lib/prop-calculator/combinatorialCoverage.test.ts, tests/unit/lib/prop-calculator/engineUniversalInvariants.test.ts, tests/unit/lib/prop-calculator/outcomeProbabilities.test.ts, tests/unit/lib/prop-calculator/feeDuration.test.ts, tests/unit/lib/prop-calculator/core/EvalStateValue.test.ts, tests/unit/lib/prop-calculator/core/PayoutCap.test.ts, tests/unit/lib/prop-calculator/core/BulkDiscount.test.ts, tests/unit/lib/prop-calculator/costPerFundedAccount.test.ts, tests/unit/lib/prop-calculator/simulator/engine.test.ts, tests/unit/cli/prop/sim.test.ts, tests/unit/cli/prop/compare.test.ts, tests/unit/cli/prop/optimizeDp.test.ts, tests/unit/cli/prop/optimizeFunded.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/simulator/engine.test.ts (new, write first): Apex EOD 50K, evalDayPolicy ladder [600] stop day-green, fundedHorizonDays 252, maxEvalDays 150, risk 250, rr 2, wr 0.4, tpd 4, seed 42, trials 3000 (reviewer scenario). Assert evalPassProbability toBeCloseTo(1 - bustProbability - timeoutProbability, 12); fundedSurvivalProbability + fundedBustProbability toBeCloseTo(evalPassProbability, 12); evalPassProbability > fundedSurvivalProbability + 0.2 (observed about 0.41 vs 0.115). Fails today: evalPassProbability/fundedSurvivalProbability do not exist (compile error).
  - tests/unit/lib/prop-calculator/simulator/engine.test.ts: simulatePortfolio MFFU Rapid EOD 50K (2 accounts, independent, seed 42, 200 trials, the characterization inputs) has perAccountPass > 0.5 (eval pass about 0.8) and perAccountFundedSurvival === 0 (MFFU Rapid EOD pass-clean is 0 in characterization). Today perAccountPass is 0.
  - tests/unit/cli/prop/sim.test.ts (new): simSummaryRows(fixture) labels include 'eval pass' and 'funded survive' in that order at the top, values formatPercent(evalPassProbability) and formatPercent(fundedSurvivalProbability), and no row is labelled 'pass rate'.
  - tests/unit/cli/prop/compare.test.ts (new): compareSimOutputs with fixtures A {evalPassProbability 0.8, fundedSurvival irrelevant} and B {evalPassProbability 0.5} under sort 'pass' ranks A first even when B has the higher survival; covers TG-2 for net (desc), days (asc) and cost (asc, see R1-2).
  - tests/unit/cli/prop/optimizeDp.test.ts: empiricalSummaryLines(fixture with evalPassProbability 0.8, fundedSurvivalProbability 0.1) contains 'eval pass rate: 80.0%' and 'funded survive: 10.0%'.
  - tests/unit/cli/prop/optimizeFunded.test.ts: survivors for a fixture with fundedSurvivalProbability 0.25 and 400 trials is 100.
  - Migrate every existing passProbability assertion: pass-clean meaning -> fundedSurvivalProbability (same value, e.g. engineCharacterization pins become fundedSurvivalProbability 0/0.645/0.56/0 and add evalPassProbability 0.815/0.8/0.8/0.83); eval-only meaning (EvalStateValue.test.ts:271 and :340-345 which compare to the eval DP V(initial), ladderSearch.test.ts:236/509 condFundedBust) -> evalPassProbability. Re-verify the 0.429/0.588 pins at 2 decimals after the switch.
- **Depends on:** none
- **Risks:** Breaking rename across 16 test files and 9 web components; the compiler finds all of them because the field is removed, but characterization pins and the EvalStateValue DP comparison pins (0.429/0.588) may move once they read evalPassProbability. Lab 'MC pass' and P(>=k) numbers increase (semantics change from survival to eval pass), which is intended by D2. compare.ts, sim/command.ts and ResultsPanel are also edited by R1-2, R1-29 and R1-34; land in one sequence to avoid conflicts. ladder/command.ts header edit overlaps the ladder cluster (R1-8/9/10/11); coordinate.


### R1-2
- **Root cause:** simulator/engine.ts:211-224 prices 'cost / funded acct' as (perAccountActivationFee + perAccountEvalFee + monthlySubsTotal) * (1 / passProbability) via core/Replacement.ts:21-24 (evalPrice * attempts). Three defects: (a) reset/re-buy spend (evalPhase.ts:151-153 resetFeesPaid) is omitted when maxAttempts > 1; (b) the activation fee, charged only on passing, is multiplied by 1/p; (c) the denominator is pass-clean (funded survival, engine.ts:166-168) instead of eval pass. In addition evalPhase.ts:152 always charges plan.fees.reset per retry even when a fresh re-buy is cheaper (FundedNext Rapid reset > eval, coupon-discounted re-buys), and a second, divergent formula lives in LadderSearch.ts:303-311 (DRY violation, R1-8). engine.ts:476-495 buildCostBreakdown re-implements the discount factors privately and ignores monthlySubscriptionPercent for monthlySubsTotal.
- **Design:** D1: one shared formula in core/Replacement.ts, fed by shared fee primitives in core/FeeSchedule.ts.
1. core/FeeSchedule.ts (pure functions, exported via core/index.ts barrel):
   - `initialEvalFee(fees, discounts?)` = oneTimeEval * evalFactor * bundleFactor
   - `activationFee(fees, discounts?)` = activation * activationFactor * bundleFactor
   - `subscriptionFee(fees, billedDays, discounts?)` = monthlySubscription * monthlyFactor * max(1, ceil(billedDays / TRADING_DAYS_PER_MONTH))
   - `rebuyFee(fees, discounts?)` = oneTimeEval * evalFactor + monthlySubscription * monthlyFactor (a fresh purchase; never bundle-discounted)
   - `retryFee(fees, discounts?)` = Math.min(fees.reset * resetFactor, rebuyFee) (cheaper legal path; plans without a reset already encode reset = eval price per repo convention)
   - feesUntilPass = initialEvalFee + subscriptionFee; totalFees = feesUntilPass + activationFee (behaviour unchanged when bundlePercent is absent). bundleFactor comes from R1-1's CouponDiscounts.bundlePercent (1 when absent).
2. core/Plan.ts: `retryFee(discounts?: CouponDiscounts): number` delegating to FeeSchedule.retryFee(this.init.fees, discounts).
3. simulator/evalPhase.ts:152: `resetFeesPaid += plan.retryFee(discounts)` so the empirical expectedTotalCost uses the same cheaper legal path.
4. core/Replacement.ts:
```ts
export interface ReplacementInputs {
    readonly discounts: CouponDiscounts | undefined;
    readonly evalPassRate: number;
    readonly fees: FeeSchedule;
    readonly meanDaysOnFail: number;
    readonly meanDaysOnPass: number;
}
export function replacementEconomics(inputs: ReplacementInputs): ReplacementEconomics
```
   evalPassRate is per eval attempt. Throw if not finite or outside [0,1] (fail loud). p <= 0 -> all Infinity. attempts = 1/p; daysPerFundedAccount = meanDaysOnPass + (attempts - 1) * meanDaysOnFail; costPerFundedAccount = initialEvalFee + (attempts - 1) * retryFee + subscriptionFee(daysPerFundedAccount) + activationFee. With retry = re-buy this is exactly (eval + subs)/p + activation once.
5. simulator/types.ts TrialResult: add `evalDays: number` (billable eval days over all attempts; finishTrial already receives it). engine.ts: accumulate reachedFunded, attemptsSum, passAttemptDaysSum (daysToPass), failedAttemptDaysSum += evalDays - (daysToPass ?? 0); evalPassRate = reachedFunded / attemptsSum; meanDaysOnPass = passAttemptDaysSum / reachedFunded (0 if none); meanDaysOnFail = failedAttemptDaysSum / (attemptsSum - reachedFunded) (0 if none). Call replacementEconomics({ discounts: purchaseDiscounts, evalPassRate, fees: plan.fees, meanDaysOnFail, meanDaysOnPass }). Delete the old failDays accumulators. costPerDrawdownDollar keeps = costPerFundedAccount / plan.fundedDrawdown.amount.
6. engine.ts buildCostBreakdown uses initialEvalFee/activationFee/subscriptionFee (fixes the ignored monthly discount, removes private factor math).
7. compare/command.ts: add a '$/funded' column (formatCurrency(costPerFundedAccount)) and `--sort cost` ranks by costPerFundedAccount ascending with Infinity last (`a === b ? 0 : a - b`); keep expected spend as a 'spend' column. sim/command.ts rows unchanged in label ('cost / funded acct', 'cost / drawdown $').
8. cli/commands/prop/shared.ts TradingInputs: extract `toCouponDiscounts(): CouponDiscounts | undefined` (used by toSimInputs; the ladder cluster uses it for R1-8).
- **Files:** src/lib/prop-calculator/core/FeeSchedule.ts, src/lib/prop-calculator/core/Replacement.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/index.ts, src/lib/prop-calculator/simulator/evalPhase.ts, src/lib/prop-calculator/simulator/trial.ts, src/lib/prop-calculator/simulator/types.ts, src/lib/prop-calculator/simulator/engine.ts, src/cli/commands/prop/shared.ts, src/cli/commands/prop/compare/command.ts, tests/unit/lib/prop-calculator/core/Replacement.test.ts, tests/unit/lib/prop-calculator/core/FeeSchedule.test.ts, tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts, tests/unit/lib/prop-calculator/costPerFundedAccount.test.ts, tests/unit/lib/prop-calculator/engineUniversalInvariants.test.ts, tests/unit/lib/prop-calculator/simulator/engine.test.ts, tests/unit/lib/prop-calculator/core/ResetFeeDoubleCount.test.ts, tests/unit/cli/prop/compare.test.ts, tests/unit/cli/prop/shared.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/Replacement.test.ts (rewrite first): fees {oneTimeEval 100, activation 50, monthly 0, reset 40}, evalPassRate 0.25, meanDaysOnPass 10, meanDaysOnFail 5 -> attempts 4, days 25, cost 100 + 3*40 + 50 = 270. Same with monthly 30 -> 270 + 30*ceil(25/21)=2 months = 330. reset 150 (> re-buy 100) -> retry 100, cost 450 (= 100/0.25 + 50, activation once, not 150/0.25 = 600). evalPercent 50 -> initial 50, re-buy 50, retry min(40,50)=40, cost 220. evalPassRate 1 -> 150. evalPassRate 0 -> all Infinity. evalPassRate 1.2 or NaN -> throws.
  - tests/unit/lib/prop-calculator/core/FeeSchedule.test.ts: retryFee({reset 115, oneTimeEval 165, monthly 0}) = 115; retryFee({reset 174.99, oneTimeEval 169.99}) = 169.99; retryFee(TopStep-like {oneTimeEval 0, monthly 49, reset 49}) = 49; retryFee(FTMO Growth {0, 119, 109}) = 109; subscriptionFee({monthly 49}, 22, {monthlySubscriptionPercent 50}) = 49; feesUntilPass/totalFees unchanged for existing fixtures.
  - tests/unit/lib/prop-calculator/simulator/engine.test.ts (fails today): Apex EOD 50K (eval 550, activation 139, reset 550, monthly 0), maxAttempts 3, risk 400, rr 2, wr 0.5, tpd 2, dayStop none, maxEvalDays 150, funded 252, seed 42, trials 400: costPerFundedAccount toBeCloseTo(550 * expectedAttempts / evalPassProbability + 139, 6). Same inputs with plan.withOverrides({ fees: {...fees, reset: dollars(100)} }): costPerFundedAccount toBeCloseTo(550 + (expectedAttempts / evalPassProbability - 1) * 100 + 139, 6) and costBreakdown.resetFeesTotal toBeCloseTo(100 * (expectedAttempts - 1), 6). With reset 900: costBreakdown.resetFeesTotal toBeCloseTo(550 * (expectedAttempts - 1), 6) (cheaper re-buy chosen; today 900 per retry) and expectedTotalCost equals the reset-550 run exactly (rng unaffected by fees).
  - tests/unit/lib/prop-calculator/costPerFundedAccount.test.ts: replace 'evalPrice * (1/passRate)' with oneTimeEval / evalPassProbability + activation for Apex EOD maxAttempts 1; always-pass MFFU Rapid stays activation + oneTimeEval.
  - tests/unit/lib/prop-calculator/simulator/engine.test.ts: buildCostBreakdown honours the monthly coupon: TopStep standard-standard with monthlySubscriptionPercent 50 gives costBreakdown.monthlySubsTotal = 24.5 * months (today 49 * months).
  - tests/unit/cli/prop/compare.test.ts: compareSimOutputs sort 'cost' orders {costPerFundedAccount 300} before {500} before {Infinity}, and two Infinity rows compare 0 (no NaN).
  - tests/unit/cli/prop/shared.test.ts: TradingInputs.parse(['--eval-discount','30']).toCouponDiscounts() returns {activationPercent 0, evalPercent 30, monthlySubscriptionPercent 0}; no discount flags -> undefined; toSimInputs(plan).discounts deep-equals toCouponDiscounts().
  - Update FundedStateValue.test.ts:241 to the new ReplacementInputs shape (fees with oneTimeEval = reset = feePerAttempt, activation 0, monthly 0, evalPassRate 0.4) keeping its double-count assertion.
- **Depends on:** R1-30
- **Risks:** The printed 'cost / funded acct' drops sharply for plans with high funded-bust rates (denominator changes from survival to eval pass per D1), e.g. Apex EOD --ladder 600 goes from about $5,978 to about $1,500; users comparing to old output must be told. retryFee = min(reset, re-buy) changes expectedTotalCost/net for plans whose reset exceeds the re-buy price (FundedNext Rapid Pro/Daily) and for coupon runs where the discounted re-buy undercuts the reset; this relies on the coupon being reusable for re-buys (see open questions). MFFU Builder encodes 'no reset' as reset $0, so until R1-50 sets reset = $153 retries stay free (retryFee = min(0, 153) = 0). The subscription-plan re-buy price (eval + one month) is an approximation under continuous billing; it reproduces today's TopStep/FTMO/TPT reset charges exactly. External cluster R1-8 must switch LadderSearch to replacementEconomics; web useLadderSearch.ts:201 still builds evalPrice until then. R1-25 (trials 0) must keep attemptsSum > 0 guards.


### R1-1
- **Root cause:** simulator/engine.ts:232-243 computes bulkDiscountFactor but applies it only to costBreakdown.activationFee/evalFee. The per-trial cost that drives every headline figure is built in trial.ts:160-163 via plan.feesUntilPass/totalCostThroughDay with coupon discounts only, so expectedTotalCost, expectedGrossSpend, expectedSpendP90, breakEvenFundedProfit, expectedNet, expectedMonthlyNet (engine.ts:239, 269-276) are raw per-account values times m, and roiOnCost (engine.ts:198) is identical for 1 and 5 accounts. compare/command.ts:74/98/104 displays and sorts by these undiscounted figures; costPerFundedAccount ignores it too.
- **Design:** Carry the bundle discount inside the purchase discounts so every per-trial cost, and therefore every aggregate, sees it.
1. core/FeeSchedule.ts: `CouponDiscounts` gains `bundlePercent?: Percent0to100`. bundleFactor = 1 - (bundlePercent ?? 0)/100, applied multiplicatively (after bundle, the coupon, matching the Tradeify checkout note) ONLY in initialEvalFee and activationFee; never in rebuyFee, retryFee or subscriptionFee.
2. core/Plan.ts: `purchaseDiscounts(discounts: CouponDiscounts | undefined, accountCount: number): CouponDiscounts | undefined` returns discounts unchanged when bulkDiscount is null or accountCount < bulkDiscount.minAccounts; otherwise `{ activationPercent: discounts?.activationPercent ?? percent(0), evalPercent: discounts?.evalPercent ?? percent(0), ...discounts, bundlePercent: percent(bulkDiscount.percent * 100) }`. Lives on Plan because Plan owns bulkDiscount; survives withOverrides because it reads init data.
3. engine.ts simulate: `const purchaseDiscounts = plan.purchaseDiscounts(discounts, accountMultiplier)` and pass it to simulateTrial, buildCostBreakdown and replacementEconomics. Delete the bulkDiscountFactor block; costBreakdown.activationFee/evalFee become per-account (discounted) * m. perAccountEvalFee/perAccountActivationFee are now the bundle price per account (ResultsPanel CostBreakdownBody already renders 'list -> discounted'). roiOnCost follows automatically.
4. engine.ts simulatePortfolio: same `plan.purchaseDiscounts(discounts, N)` for consistency (Lab expectedNet/monthly).
5. No CLI change needed beyond R1-2's compare sort; sim/compare/web read the now-discounted fields.
- **Files:** src/lib/prop-calculator/core/FeeSchedule.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/simulator/engine.ts, tests/unit/lib/prop-calculator/core/BulkDiscount.test.ts, tests/unit/lib/prop-calculator/core/FeeSchedule.test.ts, tests/unit/lib/prop-calculator/core/Plan.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/BulkDiscount.test.ts (write first, fails today): Tradeify Select Daily 50K (eval $165, activation $0), always-pass inputs (winrate 1, trials 5): copyAccounts 1 -> expectedTotalCost 165; copyAccounts 5 -> expectedTotalCost toBeCloseTo(783.75, 6) (today 825), expectedGrossSpend, breakEvenFundedProfit and expectedSpendP90 all toBeCloseTo 783.75; expectedNet(5) toBeCloseTo(5 * expectedNet(1) + 41.25, 6); roiOnCost(5).value toBeCloseTo(expectedNet(5) / 783.75, 9) and differs from roiOnCost(1).value.
  - BulkDiscount.test.ts: replace the 'perAccount fields and costPerFundedAccount unaffected' test with: 5 copies -> costBreakdown.perAccountEvalFee toBeCloseTo(156.75, 6) and costPerFundedAccount toBeCloseTo(156.75, 6) versus 165 at 1 copy.
  - BulkDiscount.test.ts: always-pass invariant costBreakdown.evalFee + activationFee + monthlySubsTotal + resetFeesTotal toBeCloseTo(expectedTotalCost, 6) at 5 copies.
  - BulkDiscount.test.ts keeps: 4 copies no discount; Lightning null no discount; retries and subscriptions not bundle-discounted (always-bust maxAttempts 3 at 5 copies: resetFeesTotal = 5 * single-account resetFeesTotal).
  - tests/unit/lib/prop-calculator/core/Plan.test.ts: Growth.purchaseDiscounts(undefined, 5) deep-equals {activationPercent 0, evalPercent 0, bundlePercent 5}; (undefined, 4) is undefined; Lightning (undefined, 5) is undefined; ({evalPercent 30, activationPercent 0}, 5) keeps evalPercent 30 and adds bundlePercent 5.
  - tests/unit/lib/prop-calculator/core/FeeSchedule.test.ts: initialEvalFee({oneTimeEval 165}, {evalPercent 30, bundlePercent 5, activationPercent 0}) toBeCloseTo(109.725, 9); rebuyFee ignores bundlePercent (= 115.5).
- **Depends on:** R1-2
- **Risks:** Changes every Tradeify Growth/Select figure at copyAccounts >= 5 in sim, compare, web ResultsPanel, PortfolioPanel and the Lab; costPerFundedAccount at 5 copies now reflects the bundle price, inverting an existing test by design (user decision: discount through every printed figure). Applies the factor to every copy when count >= minAccounts, the existing engine convention, which reviewer C flagged as unverified for counts above 5. Also discounts activation per existing convention (Tradeify activation is $0 today, so moot). Floating results like 165*0.95 need toBeCloseTo, not toBe.


### R1-3
- **Root cause:** simulator/engine.ts:142 averages firstPayoutDay only when isPassingOutcome(r.outcome) is true, i.e. 'pass-clean' (trial.ts:11-13), although trial.ts:84-87 records firstPayoutDay for bust-funded trials as well. The KPI is therefore conditioned on surviving the whole horizon; engineCharacterization pins MFFU Rapid EOD and TPT at expectedFirstPayoutDay 0 with gross payout above $7.9k and fundedBust > 0.8, and ResultsPanel.tsx:254-258 renders '—'. Sibling defect with the same cause: engine.ts:153-156 tradesPerSuccessfulAttempt ('Trades per pass', StrategyAnalysis sumR/zScore, ResiliencePanel) also averages only pass-clean trials, although evalTradesAtPass is set for every eval pass.
- **Design:** 1. engine.ts:142: `if (r.firstPayoutDay !== null) { firstPayoutSum += r.firstPayoutDay; firstPayoutCount += 1; }` (average over every paying trial, pass-clean or bust-funded).
2. engine.ts:153: `if (hasPassedEval(r.outcome))` (R1-30's predicate) so tradesPerSuccessfulAttempt averages all eval passes.
3. No type change; expectedFirstPayoutDay stays 0 only when no trial ever paid. kpiDescriptions.firstPayout text adds 'averaged over every trial that received a payout, including accounts that later busted'.
- **Files:** src/lib/prop-calculator/simulator/engine.ts, src/app/(app)/prop-calculator/_components/kpiDescriptions.ts, tests/unit/lib/prop-calculator/simulator/engine.test.ts, tests/unit/lib/prop-calculator/engineCharacterization.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/simulator/engine.test.ts (write first, fails today): MFFU Rapid EOD 50K with the characterization inputs (funded 252, maxEvalDays 150, minRetainedCushion 2000, risk 400, rr 2, CapToCushion, seed 42, tpd 2, trials 200, wr 0.5): expectedGrossPayout > 0, fundedBustProbability > 0.8 and expectedFirstPayoutDay > 0 and <= 150 + 252 (today 0). Same for TPT 50K.
  - engine.test.ts: same MFFU Rapid EOD run has tradesPerSuccessfulAttempt > 0 (today 0 because pass-clean is 0).
  - engine.test.ts: when every paying trial is pass-clean (Apex EOD, winrate 1, dayStop none, 5 trials) expectedFirstPayoutDay is unchanged versus the pass-clean-only average (both populations identical).
  - engineCharacterization.test.ts: regenerate expectedFirstPayoutDay pins for all four cases (MFFU and TPT move off 0; Apex and TopStep shift because paid bust-funded trials now count); record the new values only after verifying the trace, not by blind copy.
- **Depends on:** R1-30
- **Risks:** Characterization pins change for all four cases, so reviewers must accept regenerated numbers. The web 'First payout' and 'Trades per pass' KPIs and StrategyAnalysis zScore/sumR move. With maxAttempts > 1 firstPayoutDay counts from the passing attempt's start, not the first attempt (unchanged, flagged in open questions).


### R1-4
- **Root cause:** simulator/engine.ts:189 computes expectancyR = expectancyDollars / inputs.riskPerTrade. The trades behind expectancyDollars are sized in day.ts:111-149 by the eval ladder (dayPolicy.ladder / computeRisk), fundedRiskPerTrade, fundedCushionPercent, contract caps and the affordability cap, so the flat scalar is not their risk. PhaseStats.recordTrade (PhaseStats.ts:45) drops the risk, so no realized risk total exists. The web StrategyAnalysis.tsx:178-180 also derives avgWin/avgLoss from riskPerTrade next to sumR. engineUniversalInvariants.test.ts:360-405 and DayPolicyConflictInvariants.test.ts:55 pin the dependency on the scalar.
- **Design:** 1. simulator/PhaseStats.ts: TradeTotals gains `private riskedValue = 0` and `get risked(): number`; recordWin(pnl, risk)/recordLoss(pnl, risk) add risk. PhaseStats.recordTrade(isWon, pnl, balance, risk) forwards it.
2. simulator/day.ts:177: `stats.recordTrade(isWon, pnl, state.balance, risk)` (the final resolved risk after contract cap and affordability).
3. simulator/types.ts TrialResult: `riskTaken: number` (finishTrial copies totals.risked). SimOutputs: `averageRiskPerTrade: number`.
4. engine.ts: riskSum += r.riskTaken; averageRiskPerTrade = tradesTakenSum > 0 ? riskSum / tradesTakenSum : 0; expectancyR = averageRiskPerTrade > 0 ? expectancyDollars / averageRiskPerTrade : 0. riskPerTrade is no longer destructured in simulate for this purpose.
5. StrategyAnalysis.tsx breakdown: avgLoss = result.averageRiskPerTrade, avgWin = result.averageRiskPerTrade * rrRatio; memo deps updated.
6. DayPolicyConflictInvariants.test.ts:55 description no longer claims riskPerTrade feeds expectancyR.
- **Files:** src/lib/prop-calculator/simulator/PhaseStats.ts, src/lib/prop-calculator/simulator/day.ts, src/lib/prop-calculator/simulator/trial.ts, src/lib/prop-calculator/simulator/types.ts, src/lib/prop-calculator/simulator/engine.ts, src/app/(app)/prop-calculator/_components/StrategyAnalysis.tsx, tests/unit/lib/prop-calculator/core/PhaseStats.test.ts, tests/unit/lib/prop-calculator/simulator/engine.test.ts, tests/unit/lib/prop-calculator/engineUniversalInvariants.test.ts, tests/unit/lib/prop-calculator/core/DayPolicyConflictInvariants.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/simulator/engine.test.ts (write first, fails today): MFFU Rapid EOD 50K, winrate 1, rr 2, dayStop none, evalDayPolicy ladder [400, 600], fundedRiskPerTrade 250, riskPerTrade 250, commission 0, trials 20: every trade wins so expectancyR toBe(2) exactly (today about expectancyDollars / 250 > 2), and averageRiskPerTrade is between 250 and 600.
  - engine.test.ts: flat risk 250, winrate 1, rr 2, no ladder: averageRiskPerTrade toBe(250) and expectancyR toBe(2) (flat behaviour preserved).
  - tests/unit/lib/prop-calculator/engineUniversalInvariants.test.ts: remove the expectancyR exclusion; with evalDayPolicy set and funded scalars pinned, varying riskPerTrade 250 -> 999 leaves the WHOLE SimOutputs toStrictEqual (today expectancyR differs by 250/999).
  - tests/unit/lib/prop-calculator/core/PhaseStats.test.ts: recordTrade(true, 500, b, 250) then recordTrade(false, -250, b, 250) gives totals.risked 500 and tradesTaken 2.
- **Depends on:** none
- **Risks:** Every TradeTotals/PhaseStats caller and test helper that records trades must pass risk (only day.ts in src; test files construct TradeTotals but do not call recordWin directly). StrategyAnalysis 'Per trade (R)', sumR, avg win/loss change for ladder, cushion-percent and capped runs. expectancyR is a ratio of means (mean pnl / mean risk), the definition the user asked for.


### R1-29
- **Root cause:** core/Roi.ts:19 and :26 return value 0 when cost <= 0 (`cost > 0 ? net / cost : 0`), so a zero-cost profitable plan reports 0% ROI. Printed by sim/command.ts:105, ResultsPanel.tsx:107-112/358, PortfolioPanel.tsx:143/271-272, and sorted by PlanComparisonTable.tsx:124, FirmComparisonTable.tsx:134, OptimalRiskTable.tsx:131, where 0 ranks a free profitable plan as returning nothing.
- **Design:** 1. core/Roi.ts: `export interface Roi { readonly basis: RoiBasis; readonly value: null | number; }`; totalRoiOnCost returns value `cost > 0 ? net / cost : null`; annualisedRoiOnCost `cost > 0 ? (monthlyNet * 12) / cost : null`. null means undefined/unbounded ratio; the type change makes every consumer fail to compile until it handles n/a.
2. src/lib/format.ts: `export function formatOptionalPercent(p: null | number, fractionDigits = 1): string` returning 'n/a' for null, else formatPercent.
3. sim/command.ts (simSummaryRows): 'ROI on cost' -> formatOptionalPercent(out.roiOnCost.value).
4. Web: ResultsPanel roiAccent treats null as 'neutral', value formatOptionalPercent. Plan/Firm/OptimalRisk tables: ROI accessorFn `(r) => r.out.roiOnCost.value ?? undefined` with column `sortUndefined: 'last'` (TanStack ColumnDef, DataTableColumn is ColumnDef) and cell formatOptionalPercent. PortfolioPanel: positive `totals.roi.value !== null && totals.roi.value > 0`, value formatOptionalPercent.
- **Files:** src/lib/prop-calculator/core/Roi.ts, src/lib/format.ts, src/cli/commands/prop/sim/command.ts, src/app/(app)/prop-calculator/_components/ResultsPanel.tsx, src/app/(app)/prop-calculator/_components/PlanComparisonTable.tsx, src/app/(app)/prop-calculator/_components/FirmComparisonTable.tsx, src/app/(app)/prop-calculator/_components/OptimalRiskTable.tsx, src/app/(app)/prop-calculator/_components/PortfolioPanel.tsx, tests/unit/lib/prop-calculator/core/Roi.test.ts, tests/unit/lib/format.test.ts, tests/unit/lib/prop-calculator/simulator/engine.test.ts, tests/unit/cli/prop/sim.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/Roi.test.ts (new, write first, covers TG-1): totalRoiOnCost(500, 0).value toBeNull (today 0); totalRoiOnCost(-50, 0).value toBeNull; totalRoiOnCost(500, 100).value toBe(5); totalRoiOnCost(-50, 100).value toBe(-0.5); annualisedRoiOnCost(100, 1200).value toBe(1); annualisedRoiOnCost(100, 0).value toBeNull; basis tags TotalOnCost/AnnualisedOnCost.
  - tests/unit/lib/prop-calculator/simulator/engine.test.ts: Apex EOD, discounts {evalPercent 100, activationPercent 100}, maxAttempts 1, wr 0.5, trials 500, seed 42: expectedTotalCost toBe(0), expectedNet > 0, roiOnCost.value toBeNull (reviewer repro printed 0.0%).
  - tests/unit/lib/format.test.ts (new): formatOptionalPercent(null) === 'n/a'; formatOptionalPercent(0.123) === '12.3%'; formatOptionalPercent(0) === '0.0%'.
  - tests/unit/cli/prop/sim.test.ts: simSummaryRows with roiOnCost {basis TotalOnCost, value null} yields the row ['ROI on cost', 'n/a'].
- **Depends on:** none
- **Risks:** Roi.value type widening touches every ROI consumer; web table sort of n/a rows relies on TanStack sortUndefined being honoured by the DataTable wrapper (verify DataTable passes column defs through unchanged). Cost that is tiny but positive through floating error would still divide; discount factors are exact at 100%, so cost is exactly 0 in the reachable case.


### R1-34
- **Root cause:** TopStep.ts:234-274 buildProAccountPlan builds the Pro Account as an instant-funded, all-$0-fee plan and TopStep.ts:141 registers it in TopStep.plans. PlanInit/Plan (Plan.ts:50-92, 94-170) has no attribute distinguishing 'purchasable' from 'entered only via Risk-team call-up', so planResolver.resolveMany (cli/commands/prop/shared.ts:111-130) returns it in every sweep, compare (compare/command.ts:37, 81-86) ranks it and prints 'best by net: $50K Pro Account', and the web PlanComparisonTable.tsx:54 (firm.plans) and FirmComparisonTable.tsx:209-229 (pickPlan) rank it too. The plan note mentions call-up entry but nothing reaches the output.
- **Design:** D3: first-class attribute, filtered at every ranking.
1. New core/PlanAvailability.ts (PascalCase domain file):
```ts
export enum PlanAvailability { CallUpOnly = 'call-up-only', Purchasable = 'purchasable' }
export const PLAN_AVAILABILITY_LABEL: Record<PlanAvailability, string> = { [PlanAvailability.CallUpOnly]: 'call-up only', [PlanAvailability.Purchasable]: 'purchasable' };
export function rankablePlans<T extends { readonly isPurchasable: boolean }>(plans: readonly T[], includeCallUp: boolean): T[]
```
   Exported from core/index.ts.
2. core/Plan.ts: PlanInit `availability?: PlanAvailability`; Plan `readonly availability: PlanAvailability` (default Purchasable) and `get isPurchasable(): boolean`. Stored in init so it survives withOverrides/withMaxLifetimePayouts (a subclass would be lost, since both return VariantPlan).
3. firms/topstep/TopStep.ts buildProAccountPlan: `availability: PlanAvailability.CallUpOnly` (re-confirm on help.topstep.com that Pro Account is not purchasable before landing, per CLAUDE.md).
4. cli/commands/prop/shared.ts: `export const includeCallUpArgument = { 'include-callup': { default: false, description: 'Also rank call-up-only plans that cannot be purchased (e.g. TopStep Pro Account)', type: 'boolean' } } satisfies ArgsDef;` and PlanResolver `resolveRankable(selector: PlanSelectorArguments, includeCallUp: boolean): { excluded: readonly Plan[]; plans: readonly Plan[] }` that throws `--firm/--variant matched only call-up-only plans (<labels>); pass --include-callup to rank them` when everything matched was excluded.
5. compare/command.ts: spread includeCallUpArgument, use resolveRankable, and print `ui.muted('excluded N call-up-only plan(s): <labels> (pass --include-callup to rank them)')` when excluded is non-empty (not silent).
6. plans/command.ts: append `  [call-up only]` (PLAN_AVAILABILITY_LABEL) to the plan heading line when !isPurchasable, via exported `availabilityTag(plan: Plan): null | string`. The --variants tab output stays two columns.
7. Web: PlanComparisonTable uses rankablePlans(firm.plans, false); FirmComparisonTable pickPlan filters rankablePlans(firm.plans, false) first. sim, optimize and ladder are single-plan and stay unfiltered.
- **Files:** src/lib/prop-calculator/core/PlanAvailability.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/index.ts, src/lib/prop-calculator/firms/topstep/TopStep.ts, src/cli/commands/prop/shared.ts, src/cli/commands/prop/compare/command.ts, src/cli/commands/prop/plans/command.ts, src/app/(app)/prop-calculator/_components/PlanComparisonTable.tsx, src/app/(app)/prop-calculator/_components/FirmComparisonTable.tsx, tests/unit/lib/prop-calculator/core/PlanAvailability.test.ts, tests/unit/cli/prop/compare.test.ts, tests/unit/cli/prop/plans.test.ts, tests/unit/lib/prop-calculator/topstep.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/PlanAvailability.test.ts (write first): a plan built without availability is Purchasable and isPurchasable; TopStep ProAccount is CallUpOnly and !isPurchasable; the other 8 TopStep plans are purchasable; ProAccount.withMaxLifetimePayouts(null) keeps CallUpOnly; rankablePlans(topstep.plans, false) has 8 entries without pro-account, rankablePlans(topstep.plans, true) has 9.
  - tests/unit/cli/prop/compare.test.ts: planResolver.resolveRankable({ firm: FirmId.TopStep }, false) returns 8 plans and excluded = [Pro Account]; with true returns 9 and excluded []; resolveRankable({ firm: TopStep, variant: 'pro-account' }, false) throws /--include-callup/; compare args parse '--include-callup' to true and default to false.
  - tests/unit/cli/prop/plans.test.ts (new): availabilityTag(proAccount) === 'call-up only'; availabilityTag(any XFA plan) === null.
  - tests/unit/lib/prop-calculator/topstep.test.ts: pro-account plan availability is PlanAvailability.CallUpOnly.
- **Depends on:** none
- **Risks:** compare --firm topstep row count drops from 9 to 8 by default; anyone scripting against it must add --include-callup. PlanAvailability is firm data: it must be re-checked on the firm's live help center before landing (CLAUDE.md). compare/command.ts is edited by R1-30 and R1-2 as well; sequence the edits. Web PlanComparisonTable shows no row for the active plan when that plan is the Pro Account (acceptable, it is not rankable).


**Open questions**
- Bundle discount at more than minAccounts copies (e.g. 7 Tradeify accounts): the engine applies 5% to every copy; reviewer C noted the docs describe a 5-account single-checkout bundle. Confirm on Tradeify's live help center whether copies 6 and 7 are discounted.
- When a coupon is active, D1's 'cheaper legal path' lets a coupon-discounted re-buy undercut the reset fee. Tradeify's code is '5 time use, then 30%'. Should re-buys be priced at the coupon price, or should coupons apply only to the first purchase?
- Subscription plans: a re-buy is priced as oneTimeEval plus one month, and billing is treated as continuous across attempts. This reproduces today's TopStep, FTMO and TPT reset charges exactly, but it does not model FTMO's free replacement on the next billing date (the wait path). Is this approximation acceptable?
- compare --sort cost: this design switches it from expected spend per trial to costPerFundedAccount, so compare uses the D1 formula, and keeps spend as a separate column. Is that the intended meaning, or should 'cost' keep ranking by spend and a new sort key be added?
- Sensitivity heatmap: this design shows eval pass only, relabelled. Should there also be a funded-survive heatmap so both D2 figures appear there too?
- With maxAttempts > 1, expectedFirstPayoutDay counts from the start of the passing attempt, not the first attempt. Should the 'counted from start of the eval' KPI use cumulative eval days?
- StrategyAnalysis Kelly index still uses the configured riskPerTrade. Should it use averageRiskPerTrade as well when a ladder is active?
- D1 names sim, ladder and compare. Should the web cash-flow timeline (portfolioTimeline/fundedCycle.ts) and the DP's RenewalCycleObjective entry cost also adopt the bundle discount and the cheaper retry path? Both currently price every cycle as a full re-buy.

## Cluster `path-walk` (R1-28, R1-26)

**Shared contracts:** 1. simulateTradePath(p, stepsPerR, rrRatio, rng, maxSteps): TradePathResult keeps its signature and result shape ({ outcome: 'loss' | 'win', peakR, steps }). After R1-28, the result is distributed exactly as an untruncated gambler's-ruin walk for any maxSteps >= 1. Any cluster that models intraday trailing at trade granularity (R1-9 ladder) should call simulateTradePath and calibrateStepProbability from ~/lib/prop-calculator/core, not write its own walk, and should use the shared cap MAX_INTRADAY_PATH_STEPS, which R1-28 moves to src/lib/prop-calculator/core/constants.ts and re-exports from core/index.ts. 2. The rng draw contract after R1-28: a walk that resolves before the cap consumes exactly `steps` draws. A truncated walk consumes maxSteps + 1 draws on a win and maxSteps + 2 on a loss. Seeded outputs are unchanged for any run that never hits the cap. 3. The path walk is keyed on the phase's DrawdownStrategy class (IntradayTrailingDrawdown), not on TradingPhase. No cluster may add a phase check in simulator/day.ts. 4. The sim granularity comparison table uses D2 vocabulary ('eval pass', plus 'funded survive' if R1-30 adds it) and reads whatever SimOutputs field R1-30 defines for eval pass.


### R1-28
- **Root cause:** src/lib/prop-calculator/simulator/day.ts:25 sets MAX_INTRADAY_PATH_STEPS = 100_000 and day.ts:162-168 passes it to simulateTradePath. In src/lib/prop-calculator/core/TradePathSimulation.ts:113-123, a walk that has not hit a barrier after maxSteps is forced to whichever barrier is numerically nearer: `distanceToWin <= distanceToLoss ? 'win' : 'loss'`. On a loss, peakR is also cut off at `Math.min(maxPosition, b) / stepsPerR`. The step probability p comes from calibrateStepProbability (TradePathSimulation.ts:35-70), which assumes the walk runs until absorption. With rr > 1 the loss barrier a = stepsPerR is nearer to 0 than the win barrier b = round(rr*stepsPerR), so truncated paths are mostly scored as losses even though they drift upward (p > 0.5 whenever winrate exceeds break-even). Reviewers B and C found that at stepsPerR = 200 (the CLI maximum, shared.ts:600), rr 3 and winrate 0.4, about 47% of trades are truncated and the realised winrate falls to 0.331. In the CLI, apex intraday monthly net falls from about $4.5k to $2.7k. Nothing is flagged. The truncated loss also understates the intraday peak excursion that IntradayTrailingDrawdown.onTrade (DrawdownStrategy.ts:100-112) uses to ratchet the floor. That peak is the other half of the bias.
- **Design:** Change only TradePathSimulation.ts. The walk stays step-by-step up to maxSteps, so every trade that resolves before the cap uses the same rng draws and gives the same result as today. Seeded outputs are therefore byte-identical for all runs that never hit the cap, which covers every run at granularity 100 or below in practice. At the cap, the walk is Markov in (position, maxPosition), so the rest of the path is sampled exactly from its conditional law. The cap then only bounds work and leaves no bias.

1. Generalise the existing private `stepUpProbabilityToWinChance(p, a, b)` (lines 126-134) to `winProbabilityFrom(p: number, distanceToLoss: number, distanceToWin: number): number`. The formula is unchanged, only the parameters are renamed. calibrateStepProbability calls it as `winProbabilityFrom(mid, a, b)`, so calibrated p values stay bit-identical and the cache is unaffected. For DRY, this one gambler's-ruin function serves both calibration and resolution.
2. Add private `lossProbabilityFrom(p, distanceToLoss, distanceToWin): number` = `winProbabilityFrom(1 - p, distanceToWin, distanceToLoss)`. Computing loss by symmetry, instead of as `1 - win`, avoids cancellation when the win probability is close to 1. It uses the existing s-branch, (1-r^dw)·r^dl/(1-r^N), which is well conditioned.
3. Add private `sampleLosingPeak(p, a, b, position, maxPosition, rng): number`. For m in (maxPosition, b), the survival function of the eventual running maximum, given absorption at -a from `position`, is G(m) = winProbabilityFrom(p, position + a, m - position) * lossProbabilityFrom(p, m + a, b - m) / lossProbabilityFrom(p, position + a, b - position). It is non-increasing in m. Draw u = rng() and binary-search for the largest integer m in [maxPosition + 1, b - 1] with G(m) > u. If no m qualifies, return maxPosition. This takes O(log b) calls to pow, with at most about 11 evaluations at b = 2000.
4. Add private `resolveTruncatedPath(p, a, b, position, maxPosition, stepsPerR, rrRatio, rng, steps): TradePathResult`. It computes `winChance = winProbabilityFrom(p, position + a, b - position)` and throws an Error naming simulateTradePath if the value is not finite or lies outside [0, 1] (fail loud). If `rng() < winChance`, it returns `{ outcome: 'win', peakR: rrRatio, steps }`. Otherwise it returns `{ outcome: 'loss', peakR: sampleLosingPeak(...) / stepsPerR, steps }`. The rng convention matches the in-loop and non-path draws (`rng() < probability` means the favourable outcome).
5. Replace lines 113-123 of simulateTradePath with `return resolveTruncatedPath(p, a, b, position, maxPosition, stepsPerR, rrRatio, rng, maxSteps);`. The public signature and the TradePathResult interface do not change. The existing `outcome: 'loss' | 'win'` literal union is left alone (surgical).
6. Move `MAX_INTRADAY_PATH_STEPS = 100_000` from simulator/day.ts:25 to core/constants.ts, next to TRADING_DAYS_PER_MONTH, and re-export it from core/index.ts. day.ts imports it from '../core/constants' (or the barrel, matching day.ts's existing relative core imports). The move is needed only if R1-9's ladder intraday modelling also calls simulateTradePath, so both callers share one cap (DRY). If R1-9 does not use it, leave the constant in day.ts.

No SimOutputs counter or warning is added. Once the resolution is exact there is no bias to surface, and truncation affects only runtime. The --path-granularity error text at shared.ts:623 ('time grow quadratically') stays accurate, because per-trade work is still up to min(a*b, cap) steps.
- **Files:** src/lib/prop-calculator/core/TradePathSimulation.ts, src/lib/prop-calculator/simulator/day.ts, src/lib/prop-calculator/core/constants.ts, src/lib/prop-calculator/core/index.ts, tests/unit/lib/prop-calculator/core/TradePathSimulation.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/TradePathSimulation.test.ts: replace 'engages the maxSteps safety valve and force-resolves toward the nearer barrier' with 'resolves a truncated path from the exact absorption probability, not the nearer barrier'. Call simulateTradePath(0.5, 10, 2, scripted [0.99, 0.99, 0.99, 0.1], 3). The walk ends at position -3 (a=10, b=20), so the exact win chance is 7/30 = 0.2333, and 0.1 < 0.2333. Expect outcome 'win', peakR 2 and steps 3. The current code returns 'loss', so the test fails first.
  - Same file: 'samples the losing peak from the conditional running-maximum law after truncation'. Call simulateTradePath(0.5, 10, 2, scripted [0, 0, 0, 0.5, 0.5], 3). The walk ends at position 3 with maxPosition 3. Win chance is 13/30 = 0.4333 and 0.5 >= 0.4333, so the outcome is loss. The peak draw is u = 0.5, with G(8) = (13/18)(12/17) = 0.5098 > 0.5 and G(9) = (13/19)(11/17) = 0.4427 <= 0.5, so the sampled peak is 8. Expect outcome 'loss', peakR toBeCloseTo(0.8, 12) and steps 3. The current code returns 0.3. Once scripted draws run out, the scripted rng throws 'script exhausted', which pins the exact draw count.
  - Same file: 'truncation keeps the calibrated winrate even when every path is cut after one step'. Use p = calibrateStepProbability(0.4, 3, 10), mulberry32(2024) and 100_000 trials with maxSteps 1. Expect the win fraction toBeCloseTo(0.4, 2). The current code gives 0, because the loss barrier at distance 9 or 11 is always nearer than the win barrier at 29 or 31.
  - Same file: 'truncation-heavy walks (maxSteps 50) keep the calibrated winrate'. Same p, mulberry32(99), 100_000 trials. Assert that more than 50% of results have steps === 50 (truncation actually happened) and that the win fraction is toBeCloseTo(0.4, 2).
  - Same file: 'losing-peak distribution is invariant to the cap'. Use winrate 0.4, rr 2, stepsPerR 10 and 50_000 trials each at maxSteps 1 (mulberry32(5)) and maxSteps 100_000 (mulberry32(6)). The mean peakR over losses must agree within 0.01, and so must the fraction of losses with peakR >= 1.
  - Same file: 'truncated paths report peakR === rrRatio on wins and peakR in [0, rrRatio) on losses'. Run 5000 trials at maxSteps 1.
  - Same file: 'rng draw count is unchanged for paths that resolve before the cap and is cap + 1 (win) or cap + 2 (loss) when truncated'. Wrap mulberry32 in a counting rng. For resolved paths (maxSteps 100_000), draws === result.steps. For maxSteps 3, draws === 4 on a win and 5 on a loss. This pins seeded-output stability for runs below the cap.
  - Same file: 'throws when p is outside [0, 1]' already exists implicitly. Add 'handles p = 0 and p = 1 at the cap without NaN': simulateTradePath(1, 10, 2, () => 0.99, 3) returns win with peakR 2, and simulateTradePath(0, 10, 2, () => 0, 3) returns loss with a finite peakR in [0, 2).
  - CLI observation, not a test file: `bun run cli prop sim --firm apex --variant intraday --rr 3 --trials 300 --path-granularity 25,50,100` should give the same rows as before the fix (seed stability). Adding 200 should put the 200 row's funded bust and monthly net within the noise of the 100 row (about 19-25% bust and about $4.5k), not 38.3% and $2,701. This run is slow, because the cap is still 100k steps per trade.
- **Depends on:** R1-9 (soft): if the ladder's intraday modelling reuses simulateTradePath, it inherits the exact resolution and should import the shared MAX_INTRADAY_PATH_STEPS from core/constants.ts rather than defining a second cap, R1-26 (none in code; R1-26 touches the help text and sim table, while R1-28 touches the engine; they can land in either order)
- **Risks:** Seeded results change only for trades that actually reach 100_000 steps, which in practice means granularity of about 150 or more with rr of 2 or more, and that is the intended fix. Any pinned characterization snapshot run at those granularities would shift. The combinatorialCoverage dimension uses only 4 and 25, so it is unaffected. Numerical: winProbabilityFrom's p > 0.5 branch computes (1 - r^i)/(1 - r^N), which loses relative precision only when p is within about 1e-12 of 0.5. The finite and [0, 1] guard fails loud rather than producing NaN outcomes. Performance: runs at granularity 200 are still slow, since each truncated trade still walks 100k steps. The fix removes bias, not cost. Lowering the cap would now be statistically safe but would change seeded outputs between the new cap and 100k (see open questions). The binary search relies on G being monotone. It is monotone mathematically, and floating-point noise at most shifts one integer boundary.


### R1-26
- **Root cause:** The help text in src/cli/commands/prop/shared.ts:488-491 says --path-granularity sets the path-walk resolution 'for funded IntradayTrailingDrawdown trades'. The engine does not limit it to the funded phase. toSimInputs forwards `intradayPathStepsPerR: this.intradayPathStepsPerR?.[0]` with no phase check (shared.ts:350). evalPhase.ts:57/106/128 passes it into runDay with TradingPhase.Eval. runDay turns on the path walk whenever `plan.drawdownFor(phase) instanceof IntradayTrailingDrawdown` (src/lib/prop-calculator/simulator/day.ts:92-104), whatever the phase. That includes the Apex intraday eval drawdown (src/lib/prop-calculator/firms/apex/ApexTraderFunding.ts:177). The sim comparison table (src/cli/commands/prop/sim/command.ts:119-140) shows only 'bust when funded' and 'monthly net'. Eval pass and eval bust shifts, for example 13.3% to 12.4% pass and 37.5% to 42.3% eval bust on apex intraday at seed 7, are therefore invisible and get attributed to the funded phase.
- **Design:** Decision: keep the engine behaviour (the path walk applies in every phase whose drawdown is IntradayTrailingDrawdown) and fix the help text and comparison table. Justification: (a) The intraday-trailing rule is a property of the drawdown object, not of the phase. Apex's eval floor really trails the unrealised intraday peak, just as the funded floor does, so restricting the walk to funded would model one firm rule two different ways in the same run and understate eval bust risk. (b) The repo rule says behaviour follows the class hierarchy (DrawdownStrategy subclasses) and must not special-case phases with conditionals. A phase check in day.ts would be exactly that kind of conditional. (c) Reviewers B and C both judged the engine output the more faithful model. No engine number is wrong. Only the label is.

Changes:
1. shared.ts:488-491: replace the description with text that states the real scope and uses no em dashes: 'Intraday path-walk resolution in steps per R for every trade taken under an IntradayTrailingDrawdown, in the eval and the funded phase alike (e.g. Apex intraday trails the intraday peak in both), comma separated for a side-by-side comparison (e.g. 4,10,25); omit to resolve each trade with a single win/loss draw'.
2. sim/command.ts:119-140: widen the granularity comparison table so eval-side effects are visible. Columns become: 'steps/R' (8), 'eval pass' (10) from the D2/R1-30 eval pass field (currently out.passProbability), 'bust in eval' (13) from out.bustProbability, 'bust when funded' (18) from out.fundedBustProbability, and 'monthly net' (12) from out.expectedMonthlyNet. Under the heading, add `ui.muted('  applies to every IntradayTrailingDrawdown trade, eval and funded')`, so the scope also shows in the output. If R1-30 adds a 'funded survive' figure, add that column here too, so the table uses D2's two-figure vocabulary.
3. The engine, SimInputs and the web UI need no changes (grep: the web UI never sets intradayPathStepsPerR).
4. A regression test pins the engine choice, so a later 'fix' cannot silently restrict the walk to funded.
- **Files:** src/cli/commands/prop/shared.ts, src/cli/commands/prop/sim/command.ts, tests/unit/cli/prop/shared.test.ts, tests/unit/lib/prop-calculator/simulator/day.test.ts
- **Tests first:**
  - tests/unit/cli/prop/shared.test.ts, new describe('--path-granularity'): (a) tradingArguments['path-granularity'].description matches /eval/ and /funded/ and does not contain 'for funded IntradayTrailingDrawdown trades'. This fails against the current text. (b) parseArgs(['--path-granularity', '10,25']) -> TradingInputs.parse -> toSimInputs(registry plan) gives simInputs.intradayPathStepsPerR === 10, which documents that one value is forwarded to both phases with no phase field.
  - tests/unit/lib/prop-calculator/simulator/day.test.ts (new file, mirrors src/lib/prop-calculator/simulator/day.ts; builds options like core/DayPolicy.test.ts with freshStats and planFor): 'applies the intraday path walk in the eval phase of an intraday-trailing plan'. Use the Apex 50K intraday plan, TradingPhase.Eval, flatDayPolicy(250, 1, { kind: DayStopRuleKind.None }), winrate fraction(0.4), rrRatio 2, intradayPathStepsPerR 10 and a counting mulberry32(1) rng. Expect draw count >= 10 (the minimum absorbing walk is a = 10 steps).
  - Same file: 'uses exactly one draw per trade in the eval phase without --path-granularity'. Same setup with intradayPathStepsPerR undefined and idleDayProbability undefined. Expect draw count === 1.
  - Same file: 'does not path-walk a plan whose phase drawdown is not intraday trailing'. Use the Apex 50K EOD plan, TradingPhase.Eval, intradayPathStepsPerR 10. Expect draw count === 1.
  - Same file: 'applies the path walk in the funded phase too'. Apex intraday, TradingPhase.Funded, intradayPathStepsPerR 10. Expect draw count >= 10.
  - The sim comparison-table columns have no command-level harness today. Cover them under TG-7 (see depends_on). Asserted there: the header labels are ['steps/R', 'eval pass', 'bust in eval', 'bust when funded', 'monthly net'], and each row formats passProbability, bustProbability, fundedBustProbability and expectedMonthlyNet from the SimOutputs of that granularity.
- **Depends on:** R1-30 (D2): the 'eval pass' column must read the eval pass field and label R1-30 settles on (currently SimOutputs.passProbability). Add a 'funded survive' column if R1-30 introduces that field. Land R1-30 first, or adopt its field name when rebasing., TG-7: the sim granularity-table test gap. Whoever implements TG-7 asserts the new column set., TG-6: readGranularityList parsing tests live in the same shared.test.ts describe block. Coordinate to avoid duplicate describes., R1-28 (independent, but after R1-28 the granularity 200 rows in this table become trustworthy)
- **Risks:** Low. Only CLI text and table layout change, and engine numbers are untouched. The wider table could wrap on narrow terminals (total width about 70 characters). A future engine refactor that adds a phase check would be caught by the new day.test.ts. The day.test.ts draw-count assertions rely on the idle-day check short-circuiting with no rng draw when idleDayProbability is undefined (day.ts:108). That holds today. If the R1-18 cluster changes idle-day draw behaviour, these counts must be revisited.


**Open questions**
- Now that truncation is exact, the 100_000 per-trade step cap only bounds runtime. Should it be lowered (for example to 20_000) so --path-granularity 200 with rr 3 no longer effectively hangs? It would stay statistically exact, but seeded outputs would change for trades that resolve between the new cap and 100k steps (granularity of about 70 or more). The current design keeps 100_000 for seed stability.
- Going further, outcome and losing peak could be sampled in closed form from position 0 (O(log b) per trade, no walk), which makes --path-granularity essentially free and would let MAX_PATH_GRANULARITY (shared.ts:600) be raised. It would change every seeded path-walk result. Is that wanted as a follow-up, or out of scope?
- R1-26: should the sim comparison table also gain a 'funded survive' column, or only 'eval pass'? This depends on the field and wording R1-30 chooses for D2.

## Cluster `live` (R1-18, R1-19, R1-48, R1-49, R1-53)

**Shared contracts:** 1) CLI shared args and readers in src/cli/commands/prop/shared.ts, coordinated with the R1-24/R1-25 cluster:
- `export const idleDayProbabilityArgument` (the key 'idle-day-probability', default '0', unchanged description).
- `export const commissionArgument` (the key 'commission', default '0').
- Both follow the existing `rebuyLagDaysArgument` pattern and are spread into `tradingArguments` and into the new `liveArguments`.
- `export function readIdleDayProbability(raw: unknown): number`: zod [0,1], error names --idle-day-probability.
- `export function readCommission(raw: unknown): number`: zod finite >= 0, error names --commission.
- TradingInputs.parse and parseLiveSimInputs must both call these. If R1-24 introduces generic `readFraction(raw, name)` / `readNonNegative(raw, name)`, these become thin wrappers; there must be one implementation. R1-25's positive-integer trials reader must also be used by parseLiveSimInputs.
- `readNumber` must reject boolean input (`z.union([z.string(), z.number()]).pipe(z.coerce.number())`) so an undeclared flag parsed as `true` fails loud.

2) Live CLI surface in src/cli/commands/prop/live/command.ts:
- `export const liveArguments` (ArgsDef).
- `export interface LiveArguments`.
- `export function parseLiveSimInputs(arguments_: LiveArguments, plan: LivePlan): LiveSimInputs`.
- `export function readLiveWithdrawal(raw: string | undefined): Pick<LiveSimInputs, 'payoutRequestSize' | 'retainedCushion'>`. Omitted gives the engine default cushion, 'all' gives retainedCushion 0, and N > 0 gives payoutRequestSize N.

3) Engine live contract in src/lib/prop-calculator:
- `LiveSimInputs.retainedCushion?: number` (undefined means `plan.defaultRetainedCushion()`, one full live drawdown, or $0 for DLL-only plans).
- `LiveHorizonOptions.retainedCushion: Dollars` (required).
- `LivePlan.defaultRetainedCushion(): Dollars`.
- `LivePlan.resolveRetainedCushion(requested: number | undefined): Dollars` (throws if negative or non-finite, no upward clamp).
- `LivePlan.withdrawableAmount(state, retainedCushion: Dollars)`, with floor = payoutFloor === null ? floorAfterWithdrawal + retained : max(payoutFloor, floorAfterWithdrawal + retained).
- `LiveContractLimits { minis: ContractLimitConfig; micros: ContractLimitConfig }` exported from core/ContractLimits.ts and core/index.ts.
- `LivePlan.contractLimits: LiveContractLimits | null` (renamed from contractLimit).
- `LivePlan.maxContractsFor(state, instrument: InstrumentSpec): ContractCount | null`.

Build order:
1. R1-18 and R1-19: CLI args, readers and the parse refactor.
2. R1-49 and R1-48 together: the LivePlan floor and cushion, livePhase, types, MFFU builder and CLI request-size.
3. R1-53: contract limits.
4. Note strings and the pro-plus-live.md doc.

Verification:
- `bunx vitest run tests/unit/cli/prop/live.test.ts tests/unit/cli/prop/shared.test.ts tests/unit/lib/prop-calculator/core/LivePlan.test.ts tests/unit/lib/prop-calculator/simulator/livePhase.test.ts tests/unit/lib/prop-calculator/firms`, then `bun run typecheck` and `bun run lint`.
- CLI smoke: `bun run cli prop live --firm apex --trials 1 --winrate 1 --horizon-days 22 --rr 1 --tpd 1` should give $315 with no crash. `--firm mffu --horizon-days 40` should give 0% bust and $3,600. Adding `--request-size all` to the MFFU run should give $3,424 with the first withdrawal on day 1. `--firm apex --horizon-days 25 --commission 10` should give $630.


### R1-18
- **Root cause:** src/cli/commands/prop/live/command.ts:24-49 builds its args from `...commonSimArguments` (src/cli/commands/prop/shared.ts:371-400) plus four live-only flags. `idle-day-probability` is declared only in `tradingArguments` (shared.ts:461-466), yet command.ts:84-87 reads `context.args['idle-day-probability']` through `readNumber`. With no flag, `readNumber(undefined)` throws `--idle-day-probability must be a number, got "undefined"`, so the documented invocation exits 1. Passed space-separated, citty treats the undeclared flag as the boolean `true`, and `z.coerce.number()` in readNumber (shared.ts:562-568) turns it into 1. livePhase.ts:67-68 then marks every day idle, which prints 0% bust and $0 withdrawals with nothing flagging it: the header (command.ts:112-117) never shows the idle probability. I confirmed that declared string flags parse correctly in the space-separated form (`prop sim --trials 200 --winrate 0.9` and the `=` form give the same header). The failure is purely the missing declaration.
- **Design:** 1) shared.ts: move the `idle-day-probability` ArgsDef entry out of `tradingArguments` into a new exported constant `idleDayProbabilityArgument = { 'idle-day-probability': { default: '0', description: <unchanged text>, type: 'string' } } satisfies ArgsDef`, following the existing `rebuyLagDaysArgument` pattern (shared.ts:402-409). Spread it back into `tradingArguments`. sim, compare, ladder and optimize then keep the exact same default and help text, from one definition.
2) shared.ts: add `export function readIdleDayProbability(raw: unknown): number`, a zod `[0,1]` probability parse (`z.coerce.number().min(0).max(1)`) that throws `--idle-day-probability must be a probability in [0, 1], got "<raw>"`. `TradingInputs.parse` (shared.ts:208-211) uses it instead of plain readNumber, so live and the other commands share one bounds check. This reader belongs to R1-24's bounds work (see shared_contracts). If R1-24 lands a generic `readFraction(raw, name)` first, readIdleDayProbability becomes a one-line wrapper over it.
3) Defense in depth for the silent path: in `readNumber`, reject booleans explicitly (`z.union([z.string(), z.number()]).pipe(z.coerce.number())`), so any undeclared flag parsed as `true` fails loud instead of becoming 1. A number is still accepted because ladder/command.ts:73-76 passes `context.args.max ?? Math.round(...)`.
4) live/command.ts: extract the arg object into `export const liveArguments = { ...commonSimArguments, ...commissionArgument (R1-19), ...idleDayProbabilityArgument, 'cushion-percent-post-lock', 'cushion-percent-pre-lock', firm, 'horizon-days', 'request-size' override (R1-48) } satisfies ArgsDef`, then `defineCommand({ args: liveArguments, ... })`. Add `export interface LiveArguments` (handwritten like `TradingArguments`: commission, 'horizon-days', 'idle-day-probability', instrument, 'request-size'?, rr, seed, 'stop-points'?, tpd, trials, winrate). Add `export function parseLiveSimInputs(arguments_: LiveArguments, plan: LivePlan): LiveSimInputs`, which moves the inline object at command.ts:79-103 into a pure, testable function that uses readIdleDayProbability. `run` calls `parseLiveSimInputs(context.args, plan)`.
5) Output, to fail loud: extend the muted header at command.ts:115-117 to show `idle ${formatPercent(inputs.idleDayProbability ?? 0)}` next to WR and seed.
- **Files:** src/cli/commands/prop/shared.ts, src/cli/commands/prop/live/command.ts, tests/unit/cli/prop/live.test.ts, tests/unit/cli/prop/shared.test.ts
- **Tests first:**
  - tests/unit/cli/prop/live.test.ts (new, follows the flattened optimizeDp.test.ts layout): `parseArgs([], liveArguments)['idle-day-probability']` is '0', and `parseLiveSimInputs(parsed, buildApexLivePlan()).idleDayProbability` is 0. Today this throws 'must be a number, got "undefined"'.
  - live.test.ts: `parseArgs(['--idle-day-probability', '0'], liveArguments)` yields the string '0', not true, and parses to 0. `['--idle-day-probability', '0.25']` parses to 0.25.
  - live.test.ts: `--idle-day-probability=1.5` and `=-0.1` throw /--idle-day-probability/.
  - live.test.ts: `liveArguments['idle-day-probability']` is the same object as `tradingArguments['idle-day-probability']` (toBe), which pins the default and description parity.
  - live.test.ts end-to-end: `simulateLiveAccount(parseLiveSimInputs(parseArgs(['--trials','1','--winrate','1','--horizon-days','22','--rr','1','--tpd','1'], liveArguments), buildApexLivePlan()))` gives cumulativeWithdrawalsP50 ≈ 315 (toBeCloseTo 8), medianDaysToFirstWithdrawal 21 and liveBustProbability 0. Adding '--idle-day-probability','0' gives the same 315 rather than today's $0.
  - shared.test.ts: `readNumber(true, 'x')` throws /--x/, and `readNumber(250, 'max')` still returns 250 (the ladder call site).
  - shared.test.ts: `TradingInputs.parse(parseArgs(['--idle-day-probability','5'], ARGS))` throws /--idle-day-probability/ (shared bounds). Coordinate with R1-24 so this is written only once.
- **Depends on:** R1-24 (bounded readers: readIdleDayProbability/readFraction must be the single shared implementation), R1-25 (positive-integer --trials: parseLiveSimInputs must use the same trials reader)
- **Risks:** Moving the arg into a spread constant could change key order in `--help`, which is cosmetic only. Rejecting booleans in readNumber is global: any command that deliberately passes a boolean would break, but a grep of the 44 call sites shows only strings or numbers. Bounds on idle-day-probability now reject values that sim, compare and optimize used to accept silently (such as 5), which is the intended R1-24 behaviour. Make sure R1-24 does not also add a second, differently worded check.


### R1-19
- **Root cause:** `commission` is declared only in `tradingArguments` (src/cli/commands/prop/shared.ts:419-423). `prop live` spreads only `commonSimArguments`, and the `LiveSimInputs` object it builds (src/cli/commands/prop/live/command.ts:79-103) never sets `commissionPerRoundTrip`. `simulateLiveAccount` destructures `commissionPerRoundTrip = 0` (src/lib/prop-calculator/simulator/livePhase.ts:198), so every trade's `pnl = tradeGross - commission` (livePhase.ts:91) has no cost. citty silently accepts an undeclared `--commission 50` and ignores it.
- **Design:** 1) shared.ts: extract `export const commissionArgument = { commission: { default: '0', description: 'Commission per round trip in account currency', type: 'string' } } satisfies ArgsDef` and spread it into `tradingArguments` in place of the inline entry.
2) shared.ts: add `export function readCommission(raw: unknown): number`, a zod non-negative finite parse (`z.coerce.number().nonnegative()`) that throws `--commission must be a finite number >= 0, got "..."`, mirroring readRebuyLagDays (shared.ts:570-578). `TradingInputs.parse` (shared.ts:179-182) switches to it. R1-24 owns bounds; this is the same shared-reader contract.
3) live/command.ts: `liveArguments` spreads `commissionArgument`. `LiveArguments` gains `commission: string`. `parseLiveSimInputs` sets `commissionPerRoundTrip: readCommission(arguments_.commission)`. The engine needs no change, because LiveSimInputs.commissionPerRoundTrip already exists (simulator/types.ts:188) and livePhase already subtracts it.
4) Header: show `commission ${formatCurrency(inputs.commissionPerRoundTrip ?? 0)}/rt` on the muted line, so a zero-cost run is visible.
- **Files:** src/cli/commands/prop/shared.ts, src/cli/commands/prop/live/command.ts, tests/unit/cli/prop/live.test.ts, tests/unit/lib/prop-calculator/simulator/livePhase.test.ts, tests/unit/cli/prop/shared.test.ts
- **Tests first:**
  - live.test.ts: `parseArgs([], liveArguments).commission` is '0', and parseLiveSimInputs gives commissionPerRoundTrip 0. `['--commission','10']` gives 10, and `--commission=-1` throws /--commission/.
  - live.test.ts: `liveArguments.commission` toBe `tradingArguments.commission` (single definition).
  - livePhase.test.ts `simulateLiveAccount` (hand-computed, Apex, trials 1, winrate 1, rr 1, tpd 1, horizonDays 25): with commissionPerRoundTrip 0, cumulativeWithdrawalsP50 ≈ 1125 and medianDaysToFirstWithdrawal 21. With commissionPerRoundTrip 10, cumulativeWithdrawalsP50 ≈ 630 and medianDaysToFirstWithdrawal 23. Derivation: pre-lock pnl is 150 - 10 = 140/day, the balance reaches 3220 on day 23 and locks at threshold 100, 3220 - 3100 = 120 debited pays 108, then 290/day x 2 pays 522, for 630.
  - live.test.ts end-to-end: parseLiveSimInputs(['--commission','10','--trials','1','--winrate','1','--horizon-days','25','--rr','1','--tpd','1']) followed by simulateLiveAccount gives P50 ≈ 630, where today the flag is ignored and gives 1125.
  - shared.test.ts: `TradingInputs.parse(parseArgs(['--commission','-5'], ARGS))` throws /--commission/.
- **Depends on:** R1-18 (liveArguments/parseLiveSimInputs refactor is the integration point), R1-24 (shared bounded reader), R1-48 (the 630/1125 figures assume the D4 default retained cushion, which for Apex equals the existing $3,100 payoutFloor, so they hold both before and after R1-48)
- **Risks:** Low. A negative-commission guard now rejects inputs sim and compare used to accept. Commission is charged per trade even when risk is capped to 0 contracts? No: runLiveDay breaks before the trade when risk <= 0 (livePhase.ts:87), so a zero-size trade is never charged. The new header text changes CLI output formatting only.


### R1-48
- **Root cause:** The `prop live` default withdrawal policy is drain-to-floor. runLiveHorizon (src/lib/prop-calculator/simulator/livePhase.ts:171-178) debits the full `plan.withdrawableAmount(state)` whenever payoutRequestSize is undefined, which is the CLI default (command.ts:89-92, and commonSimArguments 'request-size' says 'default: all'). For MFFU Rapid Live (firms/mffu/MffuRapidLive.ts:21-35: no payoutFloor, PayoutFloorEffect.None), `LivePlan.withdrawableAmount` (core/LivePlan.ts:188-197) uses `floorAfterWithdrawal` = `state.threshold` (LivePlan.ts:144-146). After the $2,000 lock, a withdrawal leaves balance == threshold == $0. The next day LiveSizing.ts:7 returns 0 risk for 0 cushion, and `DrawdownStrategy.isBreached` (core/DrawdownStrategy.ts:36-38, `balance <= threshold`) busts it at day close. CLI repro (trials 1, winrate 1, rr 1, tpd 1, horizon 40): mffu gives 100% bust, bust on day 21, first withdrawal on day 20 and $1,800 withdrawn. Nothing retains a cushion, unlike the funded engine, where `Plan.resolveRetainedCushion` (core/Plan.ts:506-515) floors retained cushion at the funded drawdown amount. D4 (binding) resolves the reviewer B/C dispute: by default keep one full drawdown of cushion above the floor, and allow withdraw-all only through an explicit `--request-size` option.
- **Design:** Engine (LivePlan, mirroring Plan.defaultRetainedCushion/resolveRetainedCushion):
- `defaultRetainedCushion(): Dollars` returns `dollars(this.liveDrawdown?.amount ?? 0)`. That is one full live drawdown. DLL-shaped plans (TopStep LFA, liveDrawdown null) get $0 because they have no trailing floor to protect.
- `resolveRetainedCushion(requested: number | undefined): Dollars` returns `requested ?? defaultRetainedCushion()`, validated with zod `z.number().finite().nonnegative()`. It throws `${label}: retainedCushion must be a finite number >= 0, got ...`. An explicit 0 is legal and means drain-to-floor. There is deliberately no upward clamp: live withdraw-all must stay reachable, which is where it differs from the funded Plan.
- `withdrawableAmount(state, retainedCushion: Dollars): number`. The parameter is required, so no hidden default can disagree with the simulateLiveAccount default. DLL plan: `max(0, balance - startingBalance - retainedCushion)`. Drawdown plan: return 0 if `requiresLockForWithdrawal && !thresholdLocked`. Otherwise `cushionFloor = floorAfterWithdrawal(state) + retainedCushion` and `floor = payoutFloor === null ? cushionFloor : Math.max(payoutFloor, cushionFloor)` (the max form is shared with R1-49), and the result is `max(0, balance - floor)`. For Apex this is `max(3100, 100 + 3000)` = 3100, so Apex figures are unchanged (the $315 and $5,175 CLI baselines hold).
Simulator:
- types.ts `LiveSimInputs.retainedCushion?: number`.
- livePhase.ts `LiveHorizonOptions.retainedCushion: Dollars` (required). runLiveHorizon calls `plan.withdrawableAmount(state, retainedCushion)`. simulateLiveAccount resolves `plan.resolveRetainedCushion(inputs.retainedCushion)` once and passes it down.
CLI (live/command.ts):
- Override `'request-size'` in liveArguments after the commonSimArguments spread. The description becomes: "Per payout request: a dollar amount, or 'all' to withdraw everything down to the drawdown floor. Default: withdraw only the excess above one full drawdown of cushion".
- `export function readLiveWithdrawal(raw: string | undefined): Pick<LiveSimInputs, 'payoutRequestSize' | 'retainedCushion'>` uses zod `z.union([z.string().trim().toLowerCase().pipe(z.literal('all')), z.coerce.number().positive()])`. Omitted gives both fields undefined (engine default cushion). 'all' gives `{ payoutRequestSize: undefined, retainedCushion: 0 }`. A number N gives `{ payoutRequestSize: N, retainedCushion: undefined }`, so N is paid per request out of the excess above the retained cushion, the same semantics as sim's --request-size with --retain-cushion. Anything else throws `--request-size must be a positive amount or 'all', got "..."`. parseLiveSimInputs spreads the result.
- Add a header line from `plan.resolveRetainedCushion(inputs.retainedCushion)`. It reads 'withdraw: excess above $2,000 cushion', 'withdraw: $N/request above $2,000 cushion', or 'withdraw: everything down to the floor (--request-size all)'.
Existing engine tests that model withdraw-all become explicit: add `retainedCushion: dollars(0)` to every current runLiveHorizon call in livePhase.test.ts and `dollars(0)` to every `withdrawableAmount(state)` call in LivePlan.test.ts and livePhase.test.ts:328/571. Their asserted values are unchanged, including the documented Lucid drain-to-floor bust at livePhase.test.ts:348.
- **Files:** src/lib/prop-calculator/core/LivePlan.ts, src/lib/prop-calculator/simulator/types.ts, src/lib/prop-calculator/simulator/livePhase.ts, src/cli/commands/prop/live/command.ts, tests/unit/lib/prop-calculator/core/LivePlan.test.ts, tests/unit/lib/prop-calculator/simulator/livePhase.test.ts, tests/unit/lib/prop-calculator/firms/mffu/MffuRapidLive.test.ts, tests/unit/cli/prop/live.test.ts
- **Tests first:**
  - LivePlan.test.ts: `buildApexLivePlan().defaultRetainedCushion()` is 3000, `buildMffuRapidLivePlan().defaultRetainedCushion()` is 2000, and `new LivePlan(dllLikeInit()).defaultRetainedCushion()` is 0.
  - LivePlan.test.ts: on the MFFU plan, `resolveRetainedCushion(undefined)` is 2000 and `resolveRetainedCushion(0)` is 0, while `resolveRetainedCushion(-1)` and `resolveRetainedCushion(Number.NaN)` throw /retainedCushion/.
  - LivePlan.test.ts: `new LivePlan(apexLikeInit()).withdrawableAmount(stateAt({balance: 3500, threshold: 100, thresholdLocked: true}), dollars(3000))` is 400. With dollars(0) it is 3400.
  - LivePlan.test.ts: `buildApexLivePlan().withdrawableAmount(stateAt({balance: 3250, threshold: 100, thresholdLocked: true}), dollars(3000))` is 150, the same as with dollars(0). This pins that D4 leaves Apex unchanged.
  - LivePlan.test.ts: DLL plan (startingBalance 10000), balance 13000, retained 1000, gives 2000.
  - livePhase.test.ts: runLiveHorizon with MFFU, alwaysWins, rr 1, tpd 1, horizonDays 40 and retainedCushion dollars(2000) gives busted false, daysToFirstWithdrawal 21 and totalWithdrawn ≈ 3600 (days 21-40 each +200, withdrawn 200, paid 180). Today it busts on day 21 after $1,800.
  - livePhase.test.ts: simulateLiveAccount({plan: buildMffuRapidLivePlan(), horizonDays: 40, rrRatio: 1, seed: 42, tradesPerDay: 1, trials: 1, winrate: 1}) with no retainedCushion gives liveBustProbability 0, cumulativeWithdrawalsP50 ≈ 3600 and medianDaysToFirstWithdrawal 21. The CLI baseline today is 100% bust and $1,800.
  - livePhase.test.ts: the same simulateLiveAccount call with retainedCushion 0 reproduces drain-to-floor. After R1-49 that means first withdrawal on day 1, totalWithdrawn ≈ 3424.5 (0.9 x (100 + 39 x 95)) and no bust. Before R1-49 it would be the day-20/day-21 bust.
  - livePhase.test.ts: the existing Apex simulateLiveAccount 22-day test still gives 315 with the default policy (keep as a regression).
  - live.test.ts: `readLiveWithdrawal(undefined)` gives {payoutRequestSize: undefined, retainedCushion: undefined}. `readLiveWithdrawal('all')` and `('ALL')` give {payoutRequestSize: undefined, retainedCushion: 0}. `readLiveWithdrawal('500')` gives {payoutRequestSize: 500, retainedCushion: undefined}. '0', '-5' and 'abc' throw /--request-size/.
  - live.test.ts: `parseArgs(['--request-size','all'], liveArguments)` through parseLiveSimInputs gives retainedCushion 0.
- **Depends on:** R1-18 (parseLiveSimInputs/liveArguments refactor), R1-49 (same withdrawableAmount floor expression; implement R1-49's max(payoutFloor, cushionFloor) in the same edit)
- **Risks:** This changes default `prop live` numbers for every threshold-floored plan except Apex. MFFU, TPT PRO+, Tradeify, FundedNext, Lucid and Alpha will now show later or smaller withdrawals and much lower bust rates. That is intended (D4) but visible, and the release note should say so. Lucid's early-lock-on-payout path is mostly dormant by default (the floor becomes 100 + 2000), and it stays reachable with `--request-size all`. A required `retainedCushion` parameter means about 19 mechanical test edits. Numeric --request-size semantics change: N now draws from the excess above the retained cushion instead of from the bare floor (see open_questions). expectedAnnualWithdrawalRate still divides by mean days alive, a separate estimator issue that is not addressed here.


### R1-49
- **Root cause:** buildMffuRapidLivePlan (src/lib/prop-calculator/firms/mffu/MffuRapidLive.ts:21-35) does not set requiresLockForWithdrawal, so the LivePlan default of true applies (core/LivePlan.ts:87). withdrawableAmount (LivePlan.ts:192-196) then returns 0 until the EOD threshold locks at $2,000 profit, which contradicts .claude/prop-firms/mffu/rapid-live.md ('There is no buffer requirement on the Rapid Live account... no balance threshold gates a payout request', daily payouts). As the reviewers warned, flipping only that flag gives a negative floor. With PayoutFloorEffect.None and payoutFloor null, the floor is `state.threshold` (LivePlan.ts:144-146), which is -$2,000 on day 1. The engine would then 'withdraw' the drawdown allowance from a $0 balance, the same defect TPT PRO+ shows today (CLI: first withdrawal on day 1, bust on day 2, $226,800 annual rate). A second, latent gap sits in the same expression: when payoutFloor is set, `this.payoutFloor ?? floorAfterWithdrawal(state)` ignores the threshold entirely. AlphaFuturesLive (payoutFloor 0, EOD trailing without a lock) can therefore withdraw below a positive trailing threshold, for example balance 5000 and threshold 3000 gives 5000 withdrawable, which busts immediately.
- **Design:** Correct floor per the verified doc: a Rapid Live account starts at $0, its balance may go negative pre-lock, and only positive live balance (profit) is withdrawable. The MLL keeps its own trailing and locking. So the withdrawal floor is max($0, the post-withdrawal drawdown threshold (+ retained cushion)).
1) MffuRapidLive.ts: add `payoutFloor: dollars(0)` and `requiresLockForWithdrawal: false`. This is the AlphaFuturesLive.ts:37-41 pattern for the same 'gains above the $0 start' rule, and uses the existing LivePlan fields, so it adds no conditional special-casing.
2) LivePlan.withdrawableAmount (built together with R1-48): `floor = payoutFloor === null ? cushionFloor : Math.max(payoutFloor, cushionFloor)`, where `cushionFloor = floorAfterWithdrawal(state) + retainedCushion`. With payoutFloor set, a withdrawal can then never take the balance below the bust threshold. The constructor guard at LivePlan.ts:119-126 already forbids payoutFloor together with a non-None effect, so here floorAfterWithdrawal is always `state.threshold`.
3) Update the MFFU Rapid Live note (firms/mffu/MyFundedFutures.ts:84): withdrawals are not gated behind the lock (no buffer, daily). The withdrawal floor is the $0 starting balance, so only positive live profit is withdrawable, with the MLL mechanics unchanged. The default `prop live` policy retains one $2,000 drawdown of cushion (D4), and `--request-size all` withdraws down to max($0, MLL).
Resulting behaviour (toy path: winrate 1, rr 1, tpd 1). By default (D4) there are no pre-lock withdrawals, because the floor is max(0, threshold + 2000) = the peak EOD balance. After the day-20 lock it withdraws the excess above $2,000 each day. With `all`, day 1 withdraws $100, then $95 per day, the threshold stays at -1900, and it never busts.
- **Files:** src/lib/prop-calculator/firms/mffu/MffuRapidLive.ts, src/lib/prop-calculator/core/LivePlan.ts, src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts, tests/unit/lib/prop-calculator/firms/mffu/MffuRapidLive.test.ts, tests/unit/lib/prop-calculator/core/LivePlan.test.ts, tests/unit/lib/prop-calculator/simulator/livePhase.test.ts
- **Tests first:**
  - MffuRapidLive.test.ts: `plan.requiresLockForWithdrawal` is false and `plan.payoutFloor` is 0.
  - MffuRapidLive.test.ts: pre-lock, state {balance 1500, threshold -500, thresholdLocked false} gives `withdrawableAmount(state, dollars(0))` = 1500. Today it is 0 (lock gate), and the flag-only fix would give 2000.
  - MffuRapidLive.test.ts: a negative pre-lock balance {balance -300, threshold -1900} gives 0, not 1600.
  - MffuRapidLive.test.ts: post-lock {balance 2300, threshold 0, locked} gives 2300 with dollars(0) and 300 with `plan.defaultRetainedCushion()`.
  - MffuRapidLive.test.ts: runLiveHorizon (alwaysWins, rr 1, tpd 1, horizonDays 22, retainedCushion dollars(0)) gives daysToFirstWithdrawal 1, busted false and totalWithdrawn ≈ 1885.5 (0.9 x (100 + 21 x 95)).
  - LivePlan.test.ts: the payoutFloor never undercuts the bust threshold. For `buildAlphaFuturesLivePlan()`, state {balance 5000, threshold 3000, thresholdLocked false} gives `withdrawableAmount(state, dollars(0))` = 2000. Today it is 5000.
  - LivePlan.test.ts: an it.each over every LIVE_PLAN_BUILDERS entry (from ~/lib/prop-calculator/firms) and a small grid of states (pre-lock positive, locked, trailing above payoutFloor) asserts that withdrawing `withdrawableAmount(state, dollars(0))` leaves `balance >= threshold`. This extends the existing LockAtPlanFloor/ReleaseFloor-only invariant at LivePlan.test.ts:553 to the None and payoutFloor cases.
- **Depends on:** R1-48 (co-edit of LivePlan.withdrawableAmount; land both in one change)
- **Risks:** AlphaFuturesLive's modeled withdrawals shrink once its trailing threshold rises above $0. That is a correctness fix, but it is outside the literal R1-49 text, so flag it in the change summary. Under `--request-size all`, MFFU's EOD trailing peak does not reset after withdrawals, so the MLL stays near -1900 while the balance is repeatedly withdrawn to $0 and the lock never fires. That follows from the engine's EOD-peak semantics, and the doc says nothing on how withdrawals interact with the MLL. It is disclosed in the note rather than invented. The exact-equality `<=` breach (a close at exactly $0 after a lock busts, although the doc says 'at or above $0 to remain active') is an engine-wide DrawdownStrategy semantic and is intentionally not changed here (see open_questions).


### R1-53
- **Root cause:** LivePlan has one mini-equivalent `contractLimit: ContractLimitConfig | null` (core/LivePlan.ts:21,36,61-69). runLiveDay passes `maxContractsAt(plan.contractLimit, state.balance)` (simulator/livePhase.ts:75-86) into `capRiskToContractLimit`, which counts contracts in the selected instrument's own pointValue (core/PositionSizing.ts:15-29). A micro instrument is therefore capped at the mini count. buildTptLiveDevelopmentPlan (firms/tpt/TptLive.ts:24,30-33) uses a flat 2, while .claude/prop-firms/tpt/pro-plus-live.md:68 ($50K column) says 2 mini / 20 micro. As reviewer C noted, the same over-restriction reaches the CLI-selectable Apex (ApexLive.ts:20,26-29: 10, but the doc says 10 mini / 100 micro, apex/live.md:44), Lucid (LucidLive.ts:47-60: 2/3/4, but the doc says 20/30/40, lucid/live.md:41-43) and Alpha (AlphaFuturesLive.ts:23-32: 2/4, but the doc says 20/40, alphafutures/live.md:36) through `prop live --instrument MNQ --stop-points N`. The funded Plan already separates minis and micros (ContractLimits.fundedMinis/fundedMicros, resolved on isMicro in PositionSizing.ts:31-51).
- **Design:** 1) core/ContractLimits.ts: add `export interface LiveContractLimits { readonly micros: ContractLimitConfig; readonly minis: ContractLimitConfig; }`. Both fields are required: every modeled live plan with a cap has a documented micro figure, so there is no 'unpublished' null that could silently uncap micros. Re-export the type from core/index.ts next to ContractLimits.
2) core/LivePlan.ts: replace `contractLimit?: ContractLimitConfig` / `readonly contractLimit` with `contractLimits?: LiveContractLimits` / `readonly contractLimits: LiveContractLimits | null`, matching Plan.contractLimits naming. The constructor validates non-empty tiers for each side, with messages `${label}: contractLimits.minis.tiers must not be empty` and `...micros...`. Add the method `maxContractsFor(state: LiveAccountState, instrument: InstrumentSpec): ContractCount | null`, which returns `this.contractLimits === null ? null : maxContractsAt(instrument.isMicro ? this.contractLimits.micros : this.contractLimits.minis, state.balance)`. The existing balance keying stays, since the Lucid/TopStep balance-vs-profit simplification is already disclosed in notes and is out of scope.
3) simulator/livePhase.ts runLiveDay: `const risk = positionSizing === null ? intendedRisk : capRiskToContractLimit(intendedRisk, positionSizing, plan.maxContractsFor(state, positionSizing.instrument));` and drop the now-unused maxContractsAt import.
4) Builders, each figure from the verified doc:
- ApexLive: `{ minis: Flat contracts(10), micros: Flat contracts(100) }`, with constant MAX_MICRO_CONTRACTS.
- AlphaFuturesLive: minis tiers 2 then 4 at CONTRACT_SCALE_PROFIT, micros tiers 20 then 40 at the same threshold constant.
- LucidLive: minis 2/3/4, micros 20/30/40 at 0/CONTRACT_SCALE_TIER_1_PROFIT/CONTRACT_SCALE_TIER_2_PROFIT.
- TptLive Development: DEVELOPMENT_MAX_MINI_CONTRACTS = contracts(2), DEVELOPMENT_MAX_MICRO_CONTRACTS = contracts(20).
5) Update the note strings that describe the old single config: TakeProfitTrader.ts:46 ('flat 2-mini contract cap' becomes '2 mini / 20 micro'), LucidTrading.ts:170-171 ('single mini-equivalent config' and 'maxContractsAt(plan.contractLimit, state.balance)') and TopStep.ts:127 ('plan.contractLimit is left null'). Also update the doc .claude/prop-firms/tpt/pro-plus-live.md:80 ('Not modeled by the engine at all' is stale; Development is modeled as 2 / 20). This goes through the doc-updater flow.
- **Files:** src/lib/prop-calculator/core/ContractLimits.ts, src/lib/prop-calculator/core/index.ts, src/lib/prop-calculator/core/LivePlan.ts, src/lib/prop-calculator/simulator/livePhase.ts, src/lib/prop-calculator/firms/tpt/TptLive.ts, src/lib/prop-calculator/firms/apex/ApexLive.ts, src/lib/prop-calculator/firms/alphafutures/AlphaFuturesLive.ts, src/lib/prop-calculator/firms/lucid/LucidLive.ts, src/lib/prop-calculator/firms/tpt/TakeProfitTrader.ts, src/lib/prop-calculator/firms/lucid/LucidTrading.ts, src/lib/prop-calculator/firms/topstep/TopStep.ts, .claude/prop-firms/tpt/pro-plus-live.md, tests/unit/lib/prop-calculator/core/LivePlan.test.ts, tests/unit/lib/prop-calculator/simulator/livePhase.test.ts, tests/unit/lib/prop-calculator/firms/tpt/TptLive.test.ts, tests/unit/lib/prop-calculator/firms/mffu/MffuRapidLive.test.ts, tests/unit/lib/prop-calculator/firms/tradeify/TradeifyLive.test.ts, tests/unit/lib/prop-calculator/firms/topstep/TopStepLive.test.ts, tests/unit/lib/prop-calculator/firms/fundednext/FundedNextLive.test.ts, tests/unit/lib/prop-calculator/firms/alphafutures/AlphaFuturesLive.test.ts, tests/unit/lib/prop-calculator/firms/lucid/LucidLive.test.ts
- **Tests first:**
  - TptLive.test.ts: for `buildTptLiveDevelopmentPlan()`, `maxContractsFor(plan.initialState(), INSTRUMENTS[InstrumentSymbol.MNQ])` is 20 and the same call with INSTRUMENTS.NQ is 2.
  - livePhase.test.ts: runLiveDay with the TPT Development plan, positionSizing {MNQ, stopPoints points(1)}, alwaysLoses and tpd 1 leaves state.balance at -40. Intended risk is 5% x 1250 = 62.5, the implied 31.25 MNQ is capped at 20 x $2, giving $40. Today it is -4 (2 x $2).
  - livePhase.test.ts: runLiveDay with the Apex plan, positionSizing {MNQ, stopPoints points(0.5)} and alwaysLoses gives balance -100 (the implied 150 MNQ is capped at 100 x $1). Today it is -10. The existing NQ 0.5pt test stays at -100 (10 x $10).
  - AlphaFuturesLive.test.ts (new): MNQ cap 20 at balance 0 and 40 at balance 2000. NQ caps 2 and 4.
  - LucidLive.test.ts (new, or extend lucidTrading.test.ts if the team prefers): MNQ caps 20/30/40 at balances 0/2000/4000, and NQ caps 2/3/4.
  - LivePlan.test.ts: the constructor throws 'Test Live: contractLimits.minis.tiers must not be empty' and '...micros.tiers must not be empty' for empty tiered configs (replaces the test at line 111). `maxContractsFor` returns null when contractLimits is null.
  - MffuRapidLive/TradeifyLive/TopStepLive/FundedNextLive/TptLive tests: rename `plan.contractLimit` toBeNull to `plan.contractLimits` toBeNull.
- **Depends on:** none
- **Risks:** This is a breaking rename of LivePlan.contractLimit/LivePlanInit.contractLimit. Every consumer is in this repo (4 builders and 6 test files, and no UI uses it). Micro-instrument live runs for Apex, Lucid and Alpha now allow 10x the old size, which raises modeled PnL, withdrawals and bust risk when the cap binds. That is correct per the docs, but the numbers visibly move. Tier thresholds are keyed on balance, not cumulative profit (existing disclosed simplification), so after withdrawals the micro tier can under-scale exactly as the mini tier already does. This lands in the same files as R1-48/R1-49 (LivePlan.ts, livePhase.ts), so sequence the edits to avoid conflicts.


**Open questions**
- Numeric `--request-size N` in `prop live`: this design pays N per request out of the excess above the retained one-drawdown cushion, which matches sim's --request-size with --retain-cushion, so only `--request-size all` drains to the floor. The alternative reading of D4 is that any explicit --request-size opts out of cushion retention. Please confirm which one the user intends.
- TPT PRO+ (TptLive.ts buildTptLivePlan and buildTptLiveDevelopmentPlan) has the same negative-floor defect the R1-49 reviewers warned about: requiresLockForWithdrawal false, payoutFloor null and PayoutFloorEffect.None, so `--request-size all` 'withdraws' the $2,000 (or $1,250) drawdown allowance from a $0 balance on day 1. The CLI today shows first withdrawal on day 1, bust on day 2 and a $226,800 annual rate. The D4 default hides this, but the drain path keeps it. The fix is `payoutFloor: dollars(0)`, the same as MFFU and Alpha. It is not an assigned audit ID, and per CLAUDE.md it should be confirmed against TPT's help center ('the PRO+ account will begin with a $0 balance', 'Any remaining profits... eligible for withdrawal') before changing. Should it be added as a tracked item?
- MFFU Rapid Live's contract limit of 3 mini / 30 micro (50K) is confirmed in .claude/prop-firms/mffu/rapid-live.md, but MffuRapidLive.ts models no cap, and MffuRapidLive.test.ts asserts `contractLimit` is null with the reason 'no live-specific figure was confirmed', which is now stale. Once R1-53's LiveContractLimits exists, wiring it in is trivial. Should it be tracked?
- AlphaFuturesLive has no drawdown lock, although the firm-wide MLL 'stops trailing at the account starting balance' (alphafutures/live.md:48). Its live-specific trigger is marked unconfirmed in the doc, so this design only guarantees that withdrawals never undercut the trailing threshold. It does not add a lock.
- For DLL-only live plans (TopStep LFA, liveDrawdown null), 'one full drawdown's worth of cushion' is undefined. This design uses $0, so all profit above the $10,000 starting balance stays withdrawable and today's TopStep figures are unchanged. The confirmed $1,000 auto-liquidation floor is still unmodeled. Is $0 acceptable, or should the default be something like the current DLL tier?
- DrawdownStrategy.isBreached uses `balance <= threshold`, but MFFU's doc says a locked account 'must close each trading day at or above $0 to remain active'. That makes a $0 close legal, and it conflicts with 'Reaching the Maximum Loss Limit results in immediate Live account closure'. This design leaves the engine-wide equality semantics alone. Under `--request-size all`, a locked account withdrawn to exactly its floor still busts the next day, as the Lucid test at livePhase.test.ts:348 documents.

## Cluster `cli-validation-display` (R1-23, R1-24, R1-25, R1-27, R1-39, R1-44, R1-45, TG-1..TG-8)

**Shared contracts:** 1. CLI flag readers (src/cli/commands/prop/shared.ts, owned by this cluster, R1-24/R1-27). Every prop command and every other cluster touching CLI flags MUST use these and must not use raw Number() or z.coerce.
- Base schema: numericFlagSchema = z.union([z.number(), z.string().trim().min(1).pipe(z.coerce.number())]). It rejects booleans (citty's undeclared-flag true), '', NaN and ±Infinity.
- Exports:
  - readFraction(raw, name): Fraction0to1, via fractionSchema.
  - readPercent(raw, name): Percent0to100, via percentSchema.
  - readPercentAsFraction(raw, name): Fraction0to1.
  - readPositiveNumber(raw, name): number.
  - readNonNegativeNumber(raw, name): number.
  - readPositiveInteger(raw, name): number.
  - readInteger(raw, name): number.
  - readRebuyLagDays(raw): number (kept).
  - readNumberList<T>(raw, name, itemSchema, expectation): T[]. It rejects empty entries and is the single comma-list parser for --ladder, --funded-ladder, --path-granularity, --flat and --percent.
  - readLadder(raw, name = 'ladder').
  - readGranularityList(raw).
  - MAX_PATH_GRANULARITY.
  - readMaxLifetimePayouts(raw).
  - readStopRule(raw): DayStopRule.
  - describeStopRule(rule): string.
  - describePlanAvailability(availability): null | string.
- readNumber is removed.
- Error format everywhere: `--<flag> must be <expectation>, got "<raw>"`.
- R1-19 (--commission) uses readNonNegativeNumber. R1-48 (--request-size) uses readPositiveNumber. R1-13/R1-14 extend readLadderGrid. R1-28 changes only the granularity item schema or MAX_PATH_GRANULARITY.

2. Single parse points per command, so other clusters add fields in one place:
- TradingInputs.parse (shared.ts).
- parseLiveSimInputs(arguments_: LiveArguments, buildLivePlan: LivePlanBuilder): LiveSimInputs (live/command.ts). R1-18 declares 'idle-day-probability' (default '0') in live's args; R1-19 and R1-48 add fields here.
- readLadderGrid(arguments_, cushion): {grid: LadderGridConfig; topN} plus LADDER_RANKINGS (ladder/command.ts).
- granularityComparison(inputs, plan, primary): GranularityRow[] (sim/command.ts). Rows carry full SimOutputs for R1-26.
- compareOutputs(a, b, sort) / rankRows(rows, sort) / CompareSortKey (compare/command.ts). D2's eval-pass field plugs into the 'pass' branch. D3's call-up filter is applied in compare to the resolved plan list, NOT inside planResolver.resolveMany, because plans/sim/ladder must still resolve call-up plans by --variant.
- planHeadline(plan) / planRuleLines(plan) (plans/command.ts).

3. TradingInputs field types become branded: winrate and idleDayProbability are Fraction0to1; activationDiscountPercent, evalDiscountPercent and monthlySubscriptionDiscountPercent are Percent0to100. SimInputs is unchanged.

4. D3 plan-model contract, expected from R1-34's cluster and consumed here:
- New file src/lib/prop-calculator/core/PlanAvailability.ts: `export enum PlanAvailability { CallUpOnly = 'call-up-only', Purchasable = 'purchasable' }`, re-exported from core/index.ts.
- PlanInit gets `availability?: PlanAvailability`. Plan gets `readonly availability: PlanAvailability`, defaulting to Purchasable.
- TopStep buildProAccountPlan sets CallUpOnly.
- compare gets a boolean `--include-callup` flag (default false).

5. Payout cap description contract (core/PayoutCap.ts, this cluster, R1-44):
- PayoutCapStrategy gains `describe(): PayoutCapSchedule`.
- New enum PayoutCapScheduleKind { ByPayoutCount, ByQualifyingDays, Flat }, plus PayoutCapScheduleStep {from, regime} and the PayoutCapSchedule union.
- New class FlatPayoutCap.
- Plan gains a private payoutCap strategy (override ?? FlatPayoutCap), delegates resolvedPayoutCap to it, and exposes payoutCapSchedule().
- QualifyingDaysMilestonePayoutCap gets a private getter firstQualifyingDayAfterMilestone that BOTH resolve() (as >=) and describe() use. R1-46's off-by-one fix must change only that getter (to milestoneQualifyingDays) and update PayoutCap.test.ts's pinned boundary.

6. D2 dependency: TG-2's 'pass' sort and ladder/compare labels consume whatever eval-pass field R1-30 adds to SimOutputs. Suggested names: evalPassProbability, fundedSurviveProbability.

7. Shared test files owned here: tests/unit/cli/prop/shared.test.ts, plans.test.ts, compare.test.ts, sim.test.ts, ladder.test.ts, live.test.ts, tests/unit/lib/prop-calculator/core/Roi.test.ts and simulator/engineRoi.test.ts. Other clusters append describe blocks and do not create parallel files.


### R1-23
- **Root cause:** src/cli/commands/prop/shared.ts:638-666 readStopRule splits with raw.split(':', 2), which silently drops anything after a second colon. It then parses the threshold with a bare Number(argument ?? 2) / Number(argument ?? 500) and never checks the result. Number('$500'), Number('abc') and Number('notanumber') are NaN. Number('') and Number('00') are 0. core/DayPolicy.ts:129-134 shouldStopDay compares lossesToday >= rule.k and pnlToday >= rule.dollars, and both are always false against NaN, so the run silently behaves like --stop none. The help text at shared.ts:505-509 documents the form as after-target:<$>, which invites '$500'. Kinds that take no argument (day-green:5) also accept and ignore one. The sim output prints the stop rule only in ladder mode (sim/command.ts:40), even though dayStop also applies to flat risk (simulator/day.ts:52,61), so nothing on screen reveals the fallback.
- **Design:** All changes are in src/cli/commands/prop/shared.ts.

1. Rewrite readStopRule(raw: string): DayStopRule and export it.
- Split on the FIRST colon only: kindText = raw before the first ':', argument = the rest, or undefined when there is no colon.
- Parse kindText with z.enum(DayStopRuleKind). On failure, throw `Unknown --stop rule "${raw}". Use one of: none, day-green, first-win, after-target:<dollars>, after-k-losses:<k>`.
- Switch exhaustively over DayStopRuleKind:
  - AfterKLosses: argument undefined gives k = 2 (the existing default). Otherwise k = stopLossCountSchema.safeParse(argument), where stopLossCountSchema = z.string().trim().min(1).pipe(z.coerce.number().int().positive()). On failure, throw `Invalid --stop "${raw}": k must be a whole number of losses >= 1, e.g. after-k-losses:2`.
  - AfterTarget: argument undefined gives dollars = 500. Otherwise dollars = stopTargetSchema.safeParse(argument), where stopTargetSchema = z.string().trim().transform(strip exactly one leading '$').pipe(z.string().min(1)).pipe(z.coerce.number().positive()). On failure, throw `Invalid --stop "${raw}": the target must be a dollar amount > 0, e.g. after-target:500 or 'after-target:$500' (single-quote a $: inside double quotes the shell expands $5, which turns "after-target:$500" into after-target:00)`.
  - DayGreen, FirstWin, None: if argument !== undefined, throw `--stop ${kind} takes no argument, got "${raw}"`.

2. Add describeStopRule(rule: DayStopRule): string with an exhaustive switch returning the canonical CLI form: 'after-target:$500', 'after-k-losses:2', 'day-green', 'first-win' or 'none'. Export it.

3. Change the --stop help text to: 'Day stop rule: none, day-green, first-win, after-target:<dollars> (e.g. after-target:500 or after-target:$500, default 500), after-k-losses:<k> (default 2)'.

4. Surface the parsed rule in the output. In sim/command.ts:40, print `stop ${describeStopRule(inputs.dayStop)}` for both the ladder and the flat-risk header. In ladder/command.ts:112, replace `stop ${inputs.dayStop.kind}` with describeStopRule.

No engine change: DayStopRule's shape is unchanged.
- **Files:** src/cli/commands/prop/shared.ts, src/cli/commands/prop/sim/command.ts, src/cli/commands/prop/ladder/command.ts, tests/unit/cli/prop/shared.test.ts
- **Tests first:**
  - tests/unit/cli/prop/shared.test.ts describe('--stop parsing (readStopRule)'). Accepts:
- 'after-target:500' gives {kind: AfterTarget, dollars: 500}
- 'after-target:$500' gives dollars 500
- 'after-target:1250.5' gives dollars 1250.5
- 'after-target' gives dollars 500
- 'after-k-losses:3' gives {kind: AfterKLosses, k: 3}
- 'after-k-losses' gives k 2
- 'day-green', 'first-win' and 'none' each give their kind
  - Same file. Each of these throws an error whose message contains '--stop' and the raw value: 'after-target:abc', 'after-target:', 'after-target:$', 'after-target:00' (the shell-expanded form of "after-target:$500"; the message must also contain 'single-quote'), 'after-target:-100', 'after-target:500:1', 'after-k-losses:notanumber', 'after-k-losses:0', 'after-k-losses:1.5', 'day-green:5', 'bogus'
  - Same file, wiring: TradingInputs.parse(parseArgs(['--stop', 'after-target:$500'], ARGS)).toSimInputs(apex eod plan).dayStop toStrictEqual {kind: DayStopRuleKind.AfterTarget, dollars: 500}. Also parseArgs(['--stop', 'after-k-losses:abc']) passed to TradingInputs.parse throws.
  - Same file: for each canonical form in ['none', 'day-green', 'first-win', 'after-target:$500', 'after-k-losses:2'], describeStopRule(readStopRule(form)) returns the same form (round trip)
- **Depends on:** R1-24 (same file; uses the shared zod flag-parsing helpers), TG-3 (these tests are TG-3)
- **Risks:** Behaviour change: inputs that used to run silently now exit 1. That affects 'after-target:' and 'day-green:x', and anyone scripting `--stop after-target:0`, which is now rejected because a $0 target stops the day on the first non-negative P&L, which is 'day-green' with a >= comparison. sim/command.ts and ladder/command.ts are also edited by the D1/D2/R1-26/R1-8..R1-14 clusters. The header-line edits are one-liners, so rebase carefully.


### R1-24
- **Root cause:** src/cli/commands/prop/shared.ts:562-568 readNumber only runs z.coerce.number().

Consequences:
- It accepts booleans. citty turns an undeclared flag into true, which coerces to 1: this is the silent R1-18 path.
- It accepts '' as 0.
- It enforces none of the documented bounds.

Where it is called:
- TradingInputs.parse (shared.ts:175-245) calls it for --winrate (0-1), --eval/--activation/--monthly-discount ([0,100]), --idle-day-probability ([0,1]), --risk (> 0) and every other numeric flag.
- live/command.ts:80-102 and optimize/dp/command.ts:135-147 call it the same way.

The unused schemas and casts:
- The existing branded schemas percentSchema and fractionSchema (core/lib/units.ts:44-46, exported via the barrel) are unused on this path.
- toSimInputs (shared.ts:329-342) wraps raw numbers with the type-only percent() cast.
- FeeSchedule's discount factors compute 1 - pct/100 with no clamp, so --activation-discount=200 produces a negative fee.

Display issue: sim/command.ts:86 prints costPerDrawdownDollar with a bare toFixed(4), so a 0% pass prints 'Infinity' next to formatCurrency's '$∞'.
- **Design:** Replace readNumber with typed Zod-backed flag readers in shared.ts, then route every prop command's numeric flags through them.

1. Private base schema in shared.ts:
`const numericFlagSchema = z.union([z.number(), z.string().trim().min(1).pipe(z.coerce.number())]);`
Zod 4's z.number() already rejects NaN and ±Infinity. The union rejects booleans, undefined and ''. Add a private helper parseFlag<T>(schema: z.ZodType<T>, raw: unknown, name: string, expectation: string): T that throws new TypeError(`--${name} must be ${expectation}, got "${String(raw)}"`).

2. Exported readers:
- readFraction(raw, name): Fraction0to1. Schema: numericFlagSchema.pipe(fractionSchema). Expectation: 'a fraction in [0, 1] (e.g. 0.4 for 40%)'.
- readPercent(raw, name): Percent0to100. Schema: numericFlagSchema.pipe(percentSchema). Expectation: 'a percent in [0, 100]'.
- readPercentAsFraction(raw, name): Fraction0to1. Returns fraction(readPercent(raw, name) / 100). This replaces live/command.ts:163-169's local readPercent (DRY).
- readPositiveNumber(raw, name): number. Schema: .pipe(z.number().positive()). Expectation: 'a number > 0'.
- readNonNegativeNumber(raw, name): number. Schema: .pipe(z.number().nonnegative()). Expectation: 'a number >= 0'.
- readPositiveInteger(raw, name): number. Schema: .pipe(z.number().int().positive()). Expectation: 'a whole number >= 1'.
- readInteger(raw, name): number. Schema: .pipe(z.number().int()). Expectation: 'a whole number'.
- readRebuyLagDays stays exported as `readNonNegativeNumber(raw, 'rebuy-lag-days')`, which keeps the existing test green.
- readNumber is removed. After this change it has no caller, and knip would flag the export.

3. TradingInputs.parse mapping:
- Fraction: winrate, idle-day-probability.
- Percent: eval-discount, activation-discount, monthly-discount.
- Positive number: risk, funded-risk, rr, funded-rr, request-size, stop-points.
- Positive integer: trials, tpd, funded-tpd, max-attempts, copy-accounts, eval-days, funded-days.
- Non-negative number: commission, retain-cushion.
- Integer: seed.

4. TradingInputsInit/TradingInputs field types:
- winrate and idleDayProbability become Fraction0to1.
- The three discount fields become Percent0to100.
- toSimInputs stops wrapping them with percent() and passes them through. SimInputs is unchanged: branded types are assignable to number.

5. optimize/dp/command.ts:
- winrate: readFraction, and fraction(winrate) is dropped.
- rr: readPositiveNumber.
- eval-days, funded-days, trials, iterations: readPositiveInteger.
- seed: readInteger.

6. live/command.ts (via TG-4's extracted parseLiveSimInputs):
- idle-day-probability, winrate: readFraction.
- rr, request-size, stop-points: readPositiveNumber.
- tpd, trials, horizon-days: readPositiveInteger.
- seed: readInteger.
- The two cushion flags: readPercentAsFraction.

7. ladder/command.ts: uses readPositiveNumber and readPositiveInteger through TG-8's readLadderGrid.

8. sim/command.ts:86: replace out.costPerDrawdownDollar.toFixed(4) with formatCurrency(out.costPerDrawdownDollar, 4). It is a dollars-per-dollar ratio, and formatCurrency renders Infinity as '$∞', consistent with the adjacent 'cost / funded acct' line.

9. Help text: 'Win rate as a fraction 0-1 (e.g. 0.4)'. The existing [0,100] and [0,1] wording on the other flags is already correct.
- **Files:** src/cli/commands/prop/shared.ts, src/cli/commands/prop/optimize/dp/command.ts, src/cli/commands/prop/live/command.ts, src/cli/commands/prop/ladder/command.ts, src/cli/commands/prop/sim/command.ts, tests/unit/cli/prop/shared.test.ts
- **Tests first:**
  - tests/unit/cli/prop/shared.test.ts describe('flag bounds'). Calling TradingInputs.parse(parseArgs([...], ARGS)) throws an error naming the flag for each of:
- ['--winrate','40'] (message contains 'fraction in [0, 1]')
- ['--winrate','1.01'], ['--winrate','-0.1']
- ['--eval-discount','150'], ['--eval-discount','-5']
- ['--activation-discount','200'], ['--monthly-discount','101']
- ['--idle-day-probability','5']
- ['--risk','-250'], ['--risk','0'], ['--funded-risk','0']
- ['--rr','0']
- ['--tpd','2.5'], ['--copy-accounts','0'], ['--max-attempts','0']
- ['--eval-days','0'], ['--funded-days','-1']
- ['--commission','-1'], ['--retain-cushion','-1']
- ['--seed','1.5']
- ['--request-size','0'], ['--stop-points','0']
  - Same file. Accepted boundaries map through toSimInputs(apex eod plan) exactly:
- winrate '0' gives 0 and '1' gives 1
- eval-discount '100' gives discounts.evalPercent 100
- activation-discount '0' with the other discounts at 0 gives discounts undefined
- idle-day-probability '1' gives 1
  - Same file: readFraction(true, 'idle-day-probability') throws (the citty undeclared-flag boolean). readPositiveNumber('', 'risk') throws. readPositiveNumber('Infinity', 'risk') throws. readPercentAsFraction('5', 'x') returns 0.05.
  - Existing '--rebuy-lag-days' tests stay green unchanged.
- **Depends on:** R1-18 (live must declare --idle-day-probability; with readFraction rejecting booleans, the silent space-separated path becomes a loud error even before R1-18 lands), R1-19 (live --commission should use readNonNegativeNumber), R1-48 (live --request-size semantics; the reader is readPositiveNumber), R1-29 (a 100% discount on every fee is still legal and yields cost 0; ROI rendering is owned there), TG-4 and TG-8 (the live and ladder readers are wired through the functions those items extract)
- **Risks:** Tightening every numeric flag rejects inputs that ran before: fractional --tpd, --copy-accounts 1.5, --funded-days 0 and --max-attempts 0. A repo grep of .claude docs and tests found only integer usages. Changing TradingInputsInit field types to branded types could ripple into tests that construct TradingInputs directly; grep shows none, since only TradingInputs.parse is used. dp/live/ladder/sim are also edited by other clusters. The reader swaps are mechanical, but merge order matters.


### R1-25
- **Root cause:** shared.ts:244 `trials: readNumber(arguments_.trials, 'trials')`, optimize/dp/command.ts:145 and live/command.ts:101 accept 0, negative and fractional values. The engine then has no guard:
- simulator/engine.ts:63 loops zero times.
- engine.ts:167 divides by `trials || 1`, and engine.ts:429 by Math.max(1, trials).
- livePhase.ts:250 does the same.

Results:
- --trials=-1 prints an all-zero report with $∞ ratios and exits 0.
- --trials=0.5 runs one trial and divides by 0.5, printing 'bust when funded 200.0%'.
- **Design:** Covered by R1-24's readPositiveInteger. --trials is read with readPositiveInteger(raw, 'trials') in TradingInputs.parse, optimize dp and live (via parseLiveSimInputs). The error is `--trials must be a whole number >= 1, got "-1"`.

No engine change in this cluster. Adding a matching guard inside simulate()/simulateLiveAccount is raised as an open question because it touches the web path and engine files owned by other clusters.
- **Files:** src/cli/commands/prop/shared.ts, src/cli/commands/prop/optimize/dp/command.ts, src/cli/commands/prop/live/command.ts, tests/unit/cli/prop/shared.test.ts, tests/unit/cli/prop/live.test.ts
- **Tests first:**
  - tests/unit/cli/prop/shared.test.ts: TradingInputs.parse(parseArgs(['--trials', v], ARGS)) throws /--trials must be a whole number >= 1/ for v in ['0', '-1', '0.5', 'abc']. For '1' it yields toSimInputs(plan).trials === 1. The default yields 4000.
  - tests/unit/cli/prop/live.test.ts: parseLiveSimInputs with --trials=0 throws /--trials/
- **Depends on:** R1-24 (readPositiveInteger), TG-4 (parseLiveSimInputs extraction for the live test)
- **Risks:** None beyond R1-24's. Every documented --trials usage in the repo is a positive integer.


### R1-27
- **Root cause:** shared.ts:602-609 readLadder maps each part with Number(part.trim()). Number('') is 0, and it passes the `!Number.isFinite(part) || part < 0` guard, so '400,,600', ',400,600' and '400,600,' silently gain a $0 rung.

simulator/day.ts:155 (`if (risk <= 0) break;`) and core/DayPolicy.ts:47-54 canonicaliseLadder both stop at the first rung <= 0. As a result:
- Every rung after a 0 is dead. '400,,600' behaves exactly like '400'.
- A leading 0 blocks every trade: 0% pass, 100% timeout.

The error message is hard-coded to --ladder even for optimize funded's --funded-ladder (funded/command.ts:75).

funded/command.ts:187-201 readCandidateList is a third, divergent copy of the same comma-list parsing, and it silently SKIPS empty entries. readGranularityList (shared.ts:611-627) is the second copy.
- **Design:** DRY the three comma-list parsers into one exported helper in shared.ts:
`export function readNumberList<T>(raw: string, name: string, itemSchema: z.ZodType<T>, expectation: string): T[]`.
- It splits on ','.
- Each part is parsed with z.string().trim().min(1).pipe(z.coerce.number()).pipe(itemSchema).
- On failure it throws `Invalid --${name} "${raw}": entry ${index + 1} ${part.trim() === '' ? 'is empty' : `must be ${expectation}`}`.

1. readLadder(raw: string | undefined, name = 'ladder'): null | number[]
- Returns null for undefined or ''.
- Otherwise: readNumberList(raw, name, z.number().nonnegative(), 'a dollar amount >= 0').
- It then enforces the engine's truncation semantics loudly:
  - If the first rung is 0, throw `Invalid --${name} "${raw}": the first rung must be > 0 (a $0 rung ends the day)`.
  - If any rung > 0 follows a 0 rung, throw `Invalid --${name} "${raw}": rung ${i + 1} follows a $0 rung and would never trade`.
  - Trailing zeros stay legal, because they are harmless.

2. optimize/funded/command.ts:75 calls readLadder(context.args['funded-ladder'], 'funded-ladder').

3. readGranularityList becomes readNumberList(raw, 'path-granularity', z.number().int().positive().max(MAX_PATH_GRANULARITY), `a whole number from 1 to ${MAX_PATH_GRANULARITY} (finer granularity makes path resolution time grow quadratically)`). Its undefined/'' passthrough is unchanged.

4. readCandidateList in optimize/funded/command.ts is deleted and replaced with:
- --flat: readNumberList(raw, 'flat', z.number().positive(), 'a dollar amount > 0')
- --percent: readNumberList(raw, 'percent', z.number().positive().max(100), 'a percent in (0, 100]')
- **Files:** src/cli/commands/prop/shared.ts, src/cli/commands/prop/optimize/funded/command.ts, tests/unit/cli/prop/shared.test.ts, tests/unit/cli/prop/optimizeFunded.test.ts
- **Tests first:**
  - tests/unit/cli/prop/shared.test.ts describe('--ladder parsing').
readLadder throws /entry 2 is empty/ for:
- '400,,600'
- '400, ,600'
It also throws /is empty/ for ',400,600' and '400,600,'.
More cases:
- '400,0,600' throws /rung 3 follows a \$0 rung/
- '0' and '0,400' throw /first rung must be > 0/
- '400,-1' throws
- '400,abc' throws
- '400,600' gives [400, 600]
- ' 400 , 600 ' gives [400, 600]
- '400,600,0' gives [400, 600, 0]
- undefined and '' give null
  - Same file: readLadder('400,,600', 'funded-ladder') throws an error whose message contains '--funded-ladder' and not '--ladder "'
  - Same file: TradingInputs.parse(parseArgs(['--ladder', '400,,600'], ARGS)) throws. TradingInputs.parse(parseArgs(['--ladder', '400,600'], ARGS)).toDayPolicy()?.ladder toStrictEqual [400, 600].
  - Same file, readNumberList: ('1,2', 'x', z.number(), 'n') gives [1, 2], and ('1,,2', ...) throws /--x.*entry 2 is empty/
  - tests/unit/cli/prop/optimizeFunded.test.ts: readNumberList('150,,200', 'flat', z.number().positive(), 'a dollar amount > 0') throws /--flat/. This is the schema optimize funded now uses for --flat. Also readNumberList('5,150', 'percent', z.number().positive().max(100), ...) throws /--percent/.
- **Depends on:** R1-24 (shared numericFlagSchema/parseFlag infrastructure), TG-6 (readGranularityList is re-implemented here; its boundary tests pin the behaviour), R1-28 (may change MAX_PATH_GRANULARITY or make it rr-dependent; readNumberList takes the bound as a schema, so only the schema changes)
- **Risks:** Behaviour changes. `--flat "150,,200"` used to silently skip the empty entry and now errors. '400,0,600' used to run as [400] and now errors. Reviewer B called explicit 0 rungs deliberate, but a 0 rung followed by a positive rung is always dead under day.ts:155 (see open question). Anyone relying on '0' as an 'eval never trades' ladder loses that; it was never documented.


### R1-39
- **Root cause:** The Signature note at src/lib/prop-calculator/firms/e8futures/E8Futures.ts:103 says minPayoutRequest was "Corrected 2026-09-18 to dollars(100)". buildSignaturePlan sets minPayoutRequest: dollars(125) at E8Futures.ts:174.

The value 125 is correct:
- The verified doc says '$100 net / $125 gross' at the 80% split (.claude/prop-firms/e8futures/signature.md Minimum Payout Request row).
- The engine compares minPayoutRequest against the gross debited amount (FundedPayoutCycle resolveWithdrawal).

`cli prop plans --firm e8futures` prints both the stale note and 'min request $125'. .claude/prop-firms/e8futures/README.md 'Still open' already lists the note as stale.
- **Design:** Text-only fix to the single note string at E8Futures.ts:103. No value change. The new text follows the no-em-dash rule:

"Signature's minPayoutRequest was dollars(0.01), never independently confirmed against a source. Corrected 2026-09-18 to the site's confirmed minimum payout request of $100 (E8 Signature Futures article, independently corroborated by 'What is Payout On Demand?' and 'Everything about Payouts'). That $100 is net of the 80% profit split, and the engine compares minPayoutRequest against the gross amount debited from the account, so it is modeled as dollars(125) gross ($100 / 0.8)."

Then remove the now-resolved 'notes text says ... dollars(100) ... the note is stale' bullet from the 'Still open as of 2026-09-23' list in .claude/prop-firms/e8futures/README.md.

Before committing, re-confirm the $100 minimum payout request on E8's live Signature help-center article, as CLAUDE.md requires for firm facts.
- **Files:** src/lib/prop-calculator/firms/e8futures/E8Futures.ts, .claude/prop-firms/e8futures/README.md, tests/unit/lib/prop-calculator/E8Futures.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/E8Futures.test.ts: find note = new E8Futures().notes.find((n) => n.startsWith("Signature's minPayoutRequest")). Then:
- expect(note).toBeDefined()
- expect(note).toContain(`dollars(${signature.minPayoutRequest})`), i.e. dollars(125)
- expect(note).not.toContain('to dollars(100)')
  - Same file: no E8 note contains the substring 'Corrected 2026-09-18 to dollars(100)'. This fails today at E8Futures.ts:103.
- **Depends on:** R1-36 (same file, note at line 92 and contract limits; merge order only), R1-37 (same file, note at line 94 and ZERO_PAYOUT_SHARES fees; merge order only)
- **Risks:** Merge conflicts with the R1-36 and R1-37 edits in the same notes array. CLAUDE.md requires firm data to be confirmed against the live help center. The modeled value is unchanged, but the note asserts a firm fact ($100 net minimum), so re-check it on E8's live Signature article before landing.


### R1-44
- **Root cause:** The payout section of src/cli/commands/prop/plans/command.ts:98-133 prints payoutRequestCap as 'per-request cap $X' (lines 119-123) and payoutProfitShare (lines 129-133). It never reads plan.payoutBalanceShareCap or plan.payoutCapOverride.

The engine enforces both through Plan.resolvedPayoutCap (core/Plan.ts:538-552), which feeds FundedPayoutCycle.withdrawableNow's balanceShareCap * accountProfit.

Hidden as a result:
- FTMO Growth 0.5 vs Pro 1.0 (FtmoFutures.ts:176).
- Tradeify Select Flex 0.5 (Tradeify.ts:339).
- FundedNext Flex 0.5 (FundedNext.ts:206).
- Every TopStep plan at 0.5 (TopStep.ts:218).
- E8 Signature's PayoutCountTieredPayoutCap (E8Futures.ts:178-191).
- FundedNext Legacy's QualifyingDaysMilestonePayoutCap (FundedNext.ts:302-309).

There is also a structural gap: PayoutCapStrategy (core/PayoutCap.ts:13-15) only has resolve(), so the CLI cannot describe an override without instanceof special-casing.
- **Design:** Follow the existing DailyLossLimit describe()/descriptor pattern (DailyLossLimit.ts: DailyLossLimitShape enum plus describe() on each strategy class, rendered by describeDllShape's exhaustive switch in shared.ts).

1. core/PayoutCap.ts:
- `export enum PayoutCapScheduleKind { ByPayoutCount = 'by-payout-count', ByQualifyingDays = 'by-qualifying-days', Flat = 'flat' }`
- `export interface PayoutCapScheduleStep { readonly from: number; readonly regime: PayoutCapRegime }`
- `export type PayoutCapSchedule = { readonly kind: PayoutCapScheduleKind.Flat; readonly regime: PayoutCapRegime } | { readonly kind: PayoutCapScheduleKind.ByPayoutCount; readonly steps: readonly PayoutCapScheduleStep[] } | { readonly kind: PayoutCapScheduleKind.ByQualifyingDays; readonly steps: readonly PayoutCapScheduleStep[] }`
- Extend `interface PayoutCapStrategy { describe(): PayoutCapSchedule; resolve(context): PayoutCapRegime }`.
- Add `export class FlatPayoutCap implements PayoutCapStrategy { constructor(private readonly regime: PayoutCapRegime) }`. resolve() returns this.regime. describe() returns {kind: Flat, regime}.
- PayoutCountTieredPayoutCap.describe() returns {kind: ByPayoutCount, steps: tiers sorted ascending by fromPayoutIndex, mapped to {from: fromPayoutIndex, regime}}. `from` is the 0-based payout index.
- QualifyingDaysMilestonePayoutCap: add a private getter firstQualifyingDayAfterMilestone, which is the single source of the boundary. resolve() becomes `context.cumulativeQualifyingDays >= this.firstQualifyingDayAfterMilestone ? after : before`. The getter returns milestoneQualifyingDays + 1 today, preserving the current strict '>', and R1-46 changes only this getter to milestoneQualifyingDays. describe() returns {kind: ByQualifyingDays, steps: [{from: 0, regime: before}, {from: firstQualifyingDayAfterMilestone, regime: after}]}.
- Export all new symbols via core/index.ts.

2. core/Plan.ts:
- Add `private readonly payoutCap: PayoutCapStrategy`, set in the constructor to `init.payoutCapOverride ?? new FlatPayoutCap({ balanceShareCap: this.payoutBalanceShareCap, requestCap: this.payoutRequestCap })`. It must be assigned after both fields.
- resolvedPayoutCap(state, payoutsIssued) delegates to this.payoutCap.resolve({cumulativeQualifyingDays: state.qualifyingDays, payoutsIssued}). This removes the null-override conditional with identical behaviour.
- Add `payoutCapSchedule(): PayoutCapSchedule { return this.payoutCap.describe(); }`.
- The public payoutBalanceShareCap/payoutRequestCap/payoutCapOverride fields stay, because FundedStateValue and FundedDpPayoutCapGaps read them.

3. plans/command.ts, as part of the planRuleLines(plan) extraction in the R1-45 item:
- Replace the `per-request cap ${payoutRequestCap}` line with describePayoutCapSchedule(plan.payoutCapSchedule()): null | string. It uses an exhaustive switch over PayoutCapScheduleKind:
  - Flat: null when the regime is uncapped (preserves output for uncapped plans). Otherwise `    payout cap ${describePayoutCapRegime(regime)}`.
  - ByPayoutCount: `    payout cap by payout: ${steps.map((s) => `#${s.from + 1}+ ${describePayoutCapRegime(s.regime)}`).join(' | ')}`.
  - ByQualifyingDays: `    payout cap by qualifying days: ${steps.map((s) => `day ${s.from}+ ${describePayoutCapRegime(s.regime)}`).join(' | ')}`.
- describePayoutCapRegime(regime): join with ', ' the parts [balanceShareCap !== null ? `${formatPercent(balanceShareCap, 0)} of total profit` : null, requestCap !== null ? `max ${formatCurrency(requestCap)} per request` : null]. Return 'uncapped' when both are null.
- The payoutProfitShare line ('per-request cap 200% of cycle profit') is kept as-is.
- **Files:** src/lib/prop-calculator/core/PayoutCap.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/index.ts, src/cli/commands/prop/plans/command.ts, tests/unit/lib/prop-calculator/core/PayoutCap.test.ts, tests/unit/lib/prop-calculator/core/Plan.test.ts, tests/unit/cli/prop/plans.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/PayoutCap.test.ts, FlatPayoutCap: new FlatPayoutCap({balanceShareCap: 0.5, requestCap: 2500}).describe() toStrictEqual {kind: Flat, regime: {0.5, 2500}}, and resolve at any context returns that regime.
  - Same file, PayoutCountTieredPayoutCap: tiers given out of order [idx 4 $3250, idx 0 $1250, idx 2 $2250]. describe().steps.map((s) => s.from) gives [0, 2, 4]. For every step, resolve({payoutsIssued: step.from, cumulativeQualifyingDays: 0}) toBe step.regime.
  - Same file, QualifyingDaysMilestonePayoutCap (milestone 30): describe().steps[1].from === D. resolve({cumulativeQualifyingDays: D}) returns afterMilestone and resolve({cumulativeQualifyingDays: D - 1}) returns beforeMilestone. This asserts describe/resolve consistency, so it stays green whether D is 31 (today) or 30 (after R1-46).
  - tests/unit/lib/prop-calculator/core/Plan.test.ts:
- FTMO Growth payoutCapSchedule() toStrictEqual {kind: Flat, regime: {balanceShareCap: 0.5, requestCap: 2500}}.
- FTMO Pro gives {1, 5000}.
- E8 Signature's kind is ByPayoutCount.
- FundedNext Legacy's kind is ByQualifyingDays.
- resolvedPayoutCap(initialState, 0) for FTMO Growth still toStrictEqual {0.5, 2500} (delegation regression).
  - tests/unit/cli/prop/plans.test.ts, planRuleLines(plan) for these plans:
- ftmo-futures growth contains '    payout cap 50% of total profit, max $2,500 per request'.
- ftmo-futures pro contains '    payout cap 100% of total profit, max $5,000 per request'.
- tradeify select-flex contains a line with '50% of total profit'.
- topstep standard XFA contains '50% of total profit'.
- e8futures signature contains 'payout cap by payout: #1+ max $1,250 per request | #3+ max $2,250 per request | #5+ max $3,250 per request'.
- fundednext legacy contains 'payout cap by qualifying days: day 0+ 50% of total profit' and 'uncapped'.
- apex eod (no caps) has no line starting with '    payout cap'.
- No line anywhere contains the old 'per-request cap $' text for payoutRequestCap.
- **Depends on:** R1-46 (changes the Legacy milestone boundary; it must change only QualifyingDaysMilestonePayoutCap.firstQualifyingDayAfterMilestone so describe() and resolve() stay in lock-step), R1-45 (shares the planRuleLines extraction in plans/command.ts)
- **Risks:** Adding describe() to the PayoutCapStrategy interface is a compile-time break for any other implementer. grep found only the two classes, with no test doubles. Plan.resolvedPayoutCap is on the funded payout hot path; delegating through one virtual call is negligible, but it must stay behaviour-identical, which the Plan.test regression pins. The `prop plans` output format changes, so anything grepping for 'per-request cap $' breaks; only humans read it today.


### R1-45
- **Root cause:** src/cli/commands/prop/plans/command.ts:55-70 prints a single drawdown line. For non-instant-funded plans it uses `displayedDrawdown = plan.isInstantFunded ? plan.fundedDrawdown : plan.drawdown` (the eval drawdown) and prints only its amount, kind and lock.atProfit. It never shows plan.fundedDrawdown or plan.payoutFloorEffect.

Plans whose funded drawdown mechanics differ are shown as if the eval rule applied to both stages:
- TPT (EOD eval, Intraday PRO: TakeProfitTrader.ts:91)
- MFFU (MyFundedFutures.ts:267)
- Lucid (LucidTrading.ts:233)
- Apex (ApexTraderFunding.ts:133,189)
- E8 Zero (lock-free Challenge, locking funded: E8Futures.ts:220)
- Tradeify
- TopStep, whose ReleaseFloor resets the floor to breakeven on every payout

The printed lock also omits the locked floor level: lock.lockedThreshold(start) - start, e.g. Apex eval +$3,000 vs breakeven.
- **Design:** All in plans/command.ts. Extract the per-plan block into exported pure functions so it can be unit-tested, and keep run() as a thin printer.

1. `export function planHeadline(plan: Plan): string` builds the existing `${plan.label}  --firm ... --variant ...` plus the D3 tag (see D3-plans-tag). `export function planRuleLines(plan: Plan): string[]` returns every muted line in order. run() does ui.note(planHeadline(plan)) and then ui.muted for each line.

2. `function describeDrawdown(drawdown: DrawdownStrategy, startingBalance: number, payoutFloorEffect: PayoutFloorEffect): string` builds:
- The base: `${formatCurrency(drawdown.amount)} ${drawdown.kind}`.
- The lock part: ', no lock' when there is no lock, else `, locks at +${formatCurrency(lock.atProfit)} to ${describeLockFloor(lock.lockedThreshold(startingBalance) - startingBalance)}`. describeLockFloor returns 'breakeven' for 0, else `+$X` or `-$X`.
- A suffix from an exhaustive switch over PayoutFloorEffect: None gives ''. LockAtPlanFloor gives ' or on 1st payout'. ReleaseFloor gives ', floor reset to breakeven on each payout'.

3. Build the strings:
- `evalText = describeDrawdown(plan.drawdown, plan.accountSize, PayoutFloorEffect.None)`
- `fundedText = describeDrawdown(plan.fundedDrawdown, plan.accountSize, plan.payoutFloorEffect)`

The comparison is value-based on the rendered strings, not on object identity, so a separately constructed but identical fundedDrawdown collapses to one line.
- Instant-funded: the first line segment is `drawdown ${fundedText}`, as today.
- evalText === fundedText: `drawdown ${evalText}`.
- Otherwise: the first line segment is `eval drawdown ${evalText}`, and a new line `    funded drawdown ${fundedText}` follows the first line.

The ' | '-joined layout of the other segments (target, min days) is unchanged.
- **Files:** src/cli/commands/prop/plans/command.ts, tests/unit/cli/prop/plans.test.ts
- **Tests first:**
  - tests/unit/cli/prop/plans.test.ts, planRuleLines(plan) for these plans:
- TPT (planResolver.resolveOne({firm: FirmId.Tpt})): the first line contains 'eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven', and some line equals '    funded drawdown $2,000 intraday-trailing, locks at +$2,000 to breakeven'.
- ftmo-futures growth: the first line contains 'drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven', and no line contains 'funded drawdown' (same drawdown, PayoutFloorEffect.None).
- e8futures zero (any Zero variant): eval shows ', no lock', and funded shows 'locks at +$1,500 to breakeven or on 1st payout'.
- apex eod: the eval segment contains 'locks at +$5,000 to +$3,000' (the eval lock floor at accountSize + profitTarget), and a funded drawdown line is present.
- topstep standard XFA: the funded line contains 'floor reset to breakeven on each payout'.
- topstep pro-account (instant-funded): exactly one drawdown segment, 'drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven', and no 'eval drawdown'.
  - Same file: for every plan from planResolver.resolveMany({}), planRuleLines(plan) does not throw, and planRuleLines(plan).join('\n') contains 'funded drawdown' if and only if the rendered eval and funded descriptions differ. This is a smoke test across all ~46 plans.
- **Depends on:** R1-44 (same planRuleLines extraction), D3-plans-tag (same planHeadline), R1-32 (adds a fundedDrawdown override for MFFU Advanced; it shows up automatically), R1-51 (MFFU Pro lock becomes payout-triggered, likely via PayoutFloorEffect.LockAtPlanFloor; it shows up automatically as ' or on 1st payout', and that cluster adds the mffu pro expectation)
- **Risks:** The funded line now also appears for payout-floor-effect plans whose drawdown object is shared (TopStep, FundedNext LockAtPlanFloor plans). That is intended, because their funded semantics really differ, but it widens the reading of 'when it differs' (see open question). lockedThreshold is a function; calling it with plan.accountSize matches how the engine resolves it at funded start. TopStep Pro Account's accountSize is its real $10,000 starting balance, so the floor text is correct.


### D3-plans-tag
- **Root cause:** There is no first-class 'call-up only / not purchasable' attribute on PlanInit/Plan (core/Plan.ts:50-92). TopStep Pro Account (TopStep.ts:234-274) is indistinguishable from a buyable instant-funded plan, so `prop plans` (plans/command.ts:59-61) shows no tag. The engine attribute itself and the compare exclusion belong to R1-34. This item is only the `prop plans` rendering that D3 requires.
- **Design:** This item consumes the R1-34 contract (see shared_contracts): the PlanAvailability enum and Plan.availability.

1. In shared.ts add `export function describePlanAvailability(availability: PlanAvailability): null | string`, an exhaustive switch where CallUpOnly gives 'call-up only' and Purchasable gives null. It lives in shared.ts so compare's exclusion notice (R1-34) can reuse the same wording.

2. plans/command.ts planHeadline(plan) appends `  [${tag}]` when describePlanAvailability(plan.availability) is not null.

3. The --variants machine output (`firm\tvariant`) is unchanged. The prop-firm-trading skill pipes it into xargs, so adding a column would break those scripts.
- **Files:** src/cli/commands/prop/shared.ts, src/cli/commands/prop/plans/command.ts, tests/unit/cli/prop/plans.test.ts, tests/unit/cli/prop/shared.test.ts
- **Tests first:**
  - tests/unit/cli/prop/plans.test.ts: planHeadline(topstep pro-account plan) ends with '[call-up only]', and planHeadline(topstep standard XFA plan) does not contain 'call-up'
  - tests/unit/cli/prop/shared.test.ts: describePlanAvailability(PlanAvailability.CallUpOnly) === 'call-up only' and describePlanAvailability(PlanAvailability.Purchasable) === null
- **Depends on:** R1-34 (adds PlanAvailability, PlanInit.availability, Plan.availability, and sets TopStep Pro Account to CallUpOnly)
- **Risks:** It cannot land before R1-34's model change. If R1-34 chooses a different name, only the enum and property names in this item change. Whether LucidMaxx (invite-gated purchase) should also be tagged is an open question.


### TG-1
- **Root cause:** There is no test for src/lib/prop-calculator/core/Roi.ts:16-27 (`grep roiOnCost tests/unit` is empty). Consumers:
- totalRoiOnCost at simulator/engine.ts:198, printed at sim/command.ts:105.
- annualisedRoiOnCost at engine.ts:295 and app PortfolioPanel.tsx:143.

The cost<=0 guard, the sign on negative net and the x12 annualisation are all unpinned. The cost===0 branch is itself a confirmed bug (R1-29, returns 0).
- **Design:** Add a new pure unit test file for Roi.ts, plus one engine-wiring assertion. The expectation for cost === 0 follows R1-29's chosen contract. It is written here as 'must not be 0 when net > 0, and never NaN', so it holds whichever unbounded representation R1-29 picks.
- **Files:** tests/unit/lib/prop-calculator/core/Roi.test.ts, tests/unit/lib/prop-calculator/simulator/engineRoi.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/core/Roi.test.ts, totalRoiOnCost:
- (500, 250) toStrictEqual {basis: RoiBasis.TotalOnCost, value: 2}
- (-100, 400).value === -0.25
- (0, 400).value === 0
  - Same file, annualisedRoiOnCost:
- (100, 600) toStrictEqual {basis: RoiBasis.AnnualisedOnCost, value: 2}, which is exactly 100*12/600 (pins the x12)
- (-50, 300).value === -2
- (100, 1200).value === 1
  - Same file: with cost === 0 and net = 1000, neither function returns value 0, and Number.isNaN(value) is false. The exact representation is asserted per R1-29's contract. This FAILS today, and that failure is R1-29's regression.
  - Same file: ROI_BASIS_LABEL has exactly one entry per RoiBasis member
  - tests/unit/lib/prop-calculator/simulator/engineRoi.test.ts: out = simulate({plan: apex eod 50K (via new ApexTraderFunding().findPlan), trials: 200, seed: 42, winrate: 0.5, rrRatio: 2, riskPerTrade: 250, tradesPerDay: 4, maxEvalDays: 60, fundedHorizonDays: 60}). Then expect(out.expectedTotalCost).toBeGreaterThan(0), expect(out.roiOnCost.basis).toBe(RoiBasis.TotalOnCost) and expect(out.roiOnCost.value).toBeCloseTo(out.expectedNet / out.expectedTotalCost, 12).
- **Depends on:** R1-29 (the cost === 0 contract), R1-2 / D1 (if the definition of expectedTotalCost changes, the wiring test still holds because it is relational)
- **Risks:** The cost===0 test is red until R1-29 lands, which is intended under TDD. The R1-29 cluster owns turning it green; coordinate so the test is not deleted or weakened to pass.


### TG-2
- **Root cause:** src/cli/commands/prop/compare/command.ts:54 sorts in place with the private compare() at lines 95-110: ascending for cost/days, descending for net/pass. There is no test file for the command.

A latent degenerate case confirmed by reading: stats.ts:76 percentile([]) returns 0. For a plan with zero eval passes, daysToPassP50 is 0 (engine.ts:253), so `--sort days` ranks a never-passing plan as fastest and prints it as 'best by days'. The table also prints '0' days for it (compare/command.ts:73).
- **Design:** 1. Export `export type CompareSortKey = 'cost' | 'days' | 'net' | 'pass'`, renamed from SortKey, and SORT_KEYS.

2. Export `compareOutputs(a: SimOutputs, b: SimOutputs, sort: CompareSortKey): number`:
- cost: a.expectedTotalCost - b.expectedTotalCost. R1-2/D1 may repoint this to the shared cost-per-funded figure.
- net: b.expectedMonthlyNet - a.expectedMonthlyNet.
- pass: b - a on the EVAL pass field from R1-30/D2. It is passProbability until R1-30 lands.
- days: hasEvalPass(o) = o.daysToPassValues.length > 0. If neither has one, return 0. If only a lacks one, return 1. If only b lacks one, return -1. Otherwise a.daysToPassP50 - b.daysToPassP50. Never subtract infinities (Infinity - Infinity is NaN).

3. Export `rankRows<T extends { out: SimOutputs }>(rows: readonly T[], sort: CompareSortKey): T[]`, which returns rows.toSorted(...). Array sort is stable, so ties keep resolver order.

4. run() uses rankRows. The 'best by' line uses ranked[0].

5. The days column prints '—' when !hasEvalPass(out), not '0'.
- **Files:** src/cli/commands/prop/compare/command.ts, tests/unit/cli/prop/compare.test.ts
- **Tests first:**
  - tests/unit/cli/prop/compare.test.ts. Fixture: base = simulate({plan: mffu rapid-eod, trials: 30, seed: 1, winrate: 0.5, rrRatio: 2, riskPerTrade: 250, tradesPerDay: 4, maxEvalDays: 30, fundedHorizonDays: 20}). row(label, overrides) = {label, out: {...base, ...overrides}}.
  - net: monthly nets [100, 300, 200] rank to labels [300, 200, 100]. cost: expectedTotalCost [300, 100, 200] ranks to [100, 200, 300]. pass: eval-pass values [0.1, 0.5, 0.3] rank to [0.5, 0.3, 0.1]. The field name follows R1-30.
  - days: rows A {daysToPassP50: 20, daysToPassValues: [20]}, B {10, [10]}, C {daysToPassP50: 0, daysToPassValues: []} rank to [B, A, C]. compareOutputs(C.out, C.out, 'days') === 0, and no compareOutputs call returns NaN.
  - Ties: two rows with equal expectedMonthlyNet keep their input order under 'net'.
  - For every key in SORT_KEYS, rankRows(rows, key)[0] is the row the 'best by' line names. Assert against the exported helper that selects best, if one is extracted, else against rankRows(...)[0].
  - Call-up exclusion (after R1-34): the rankable-plans filter excludes topstep pro-account by default and includes it with include-callup set. The test lives here but its implementation belongs to R1-34.
- **Depends on:** R1-30 / D2 (the eval-pass field that 'pass' sorts on, and the column labels), R1-34 / D3 (call-up exclusion and --include-callup in compare), R1-2 / D1 (if 'cost' sort or the cost column switches to the shared cost-per-funded figure), R1-25 (positive trials guarantees no 0-trial NaN outputs)
- **Risks:** compare/command.ts is edited by three other clusters (D1, D2, D3). Land the rankRows/compareOutputs extraction first so the others build on it. The fixture relies on SimOutputs being a plain, spread-safe data object; engine.ts returns a literal object, so it is.


### TG-3
- **Root cause:** No test exercises readStopRule (src/cli/commands/prop/shared.ts:638-666) or `--stop after-target/after-k-losses`, and the parser silently yields NaN (R1-23).
- **Design:** Covered by R1-23: readStopRule and describeStopRule are exported from shared.ts. The test cases are listed under R1-23 and live in tests/unit/cli/prop/shared.test.ts.
- **Files:** tests/unit/cli/prop/shared.test.ts
- **Tests first:**
  - All R1-23 cases: the accepted forms with exact numeric fields, the rejected forms (NaN, empty, '$' alone, '00', negative, extra colon, fractional k, arguments on no-arg kinds, unknown kind), TradingInputs wiring for 'after-target:$500' reaching SimInputs.dayStop.dollars === 500, and the describeStopRule round trip
- **Depends on:** R1-23
- **Risks:** None beyond R1-23's.


### TG-4
- **Root cause:** live/command.ts:163-169 readPercent converts --cushion-percent-pre-lock/--cushion-percent-post-lock from 0-100 to Fraction0to1 via value/100. It has no tests. All live argument parsing is inline in run() (lines 58-103), so nothing can assert that the flags reach LivePlan.cushionPercent as fractions.
- **Design:** 1. Delete the local readPercent. Use shared readPercentAsFraction (R1-24), which is built on percentSchema.

2. Extract from run() the following, with a typed LiveArguments interface in live/command.ts covering the declared args:
`export function parseLiveSimInputs(arguments_: LiveArguments, buildLivePlan: LivePlanBuilder): LiveSimInputs`
It builds the plan from buildLivePlan({postLock: readPercentAsFraction(arguments_['cushion-percent-post-lock'], 'cushion-percent-post-lock'), preLock: readPercentAsFraction(...)}) and reads the other flags with the R1-24 readers. run() keeps the firm lookup and the error for unmodeled firms, calls parseLiveSimInputs and then prints.

The live-cluster items (R1-18 declaring --idle-day-probability with default '0', R1-19 adding --commission, R1-48 changing the --request-size default and adding its option) add their fields inside this one function.
- **Files:** src/cli/commands/prop/live/command.ts, src/cli/commands/prop/shared.ts, tests/unit/cli/prop/live.test.ts, tests/unit/cli/prop/shared.test.ts
- **Tests first:**
  - tests/unit/cli/prop/shared.test.ts, readPercentAsFraction:
- ('0', 'cushion-percent-pre-lock') gives 0
- ('100', ...) gives 1
- ('5', ...) gives 0.05
- ('-1', ...) and ('101', ...) throw /--cushion-percent-pre-lock must be a percent in \[0, 100\]/
- ('abc', ...) throws
  - tests/unit/cli/prop/live.test.ts: resolve the live command's args like optimizeFunded.test.ts's resolveArguments. Then parseLiveSimInputs(parseArgs(['--cushion-percent-pre-lock', '5', '--cushion-percent-post-lock', '10', '--trials', '10'], args), findLivePlanBuilder(FirmId.Apex)!).plan.cushionPercent toStrictEqual {preLock: 0.05, postLock: 0.1}, and NOT {5, 10}.
  - Same file: flags '50' and '100' give {preLock: 0.5, postLock: 1}. With no flags the defaults give {0.05, 0.1}, which requires R1-18's declared --idle-day-probability default, so this is also R1-18's regression. '--cushion-percent-post-lock', '150' throws /--cushion-percent-post-lock/.
  - Same file: '--idle-day-probability', '0' in the space-separated form gives inputs.idleDayProbability === 0, not 1 (R1-18 regression; readFraction rejects boolean true)
- **Depends on:** R1-24 (readPercentAsFraction and the readers), R1-18 (declares --idle-day-probability; the defaults test needs it), R1-19 and R1-48 (they add fields inside parseLiveSimInputs)
- **Risks:** live/command.ts is edited by the R1-18/R1-19/R1-48 cluster. Agree that parseLiveSimInputs is the single parse point before either side starts. LivePlanBuilder is already exported from ~/lib/prop-calculator, and findLivePlanBuilder(FirmId.Apex) is non-null today.


### TG-5
- **Root cause:** readMaxLifetimePayouts (shared.ts:629-636) has no test coverage. It also accepts '-1', which makes payoutsIssued >= -1 always true (Plan.ts:424-425, so no payouts ever), and '2.5', which is effectively 3.
- **Design:** Export readMaxLifetimePayouts. The numeric branch changes from readNumber to readPositiveInteger(raw, 'max-lifetime-payouts') (R1-24). The sentinel branch stays case-insensitive and also trims: raw.trim().toLowerCase() in ('unlimited', 'none') gives null. undefined or '' still gives undefined.
- **Files:** src/cli/commands/prop/shared.ts, tests/unit/cli/prop/shared.test.ts
- **Tests first:**
  - tests/unit/cli/prop/shared.test.ts, readMaxLifetimePayouts:
- undefined and '' give undefined
- 'unlimited', 'none', 'UNLIMITED' and 'None' give null
- '3' gives 3
- '0', '-1', '2.5' and 'abc' throw /--max-lifetime-payouts/
  - Wiring with the E8 signature plan (maxLifetimePayouts 5):
- TradingInputs.parse(parseArgs(['--max-lifetime-payouts', 'unlimited'], ARGS)).toSimInputs(plan).plan.maxLifetimePayouts === null
- '--max-lifetime-payouts', '3' gives plan.maxLifetimePayouts === 3
- Omitting the flag gives simInputs.plan toBe the original plan (identity)
  - With the apex eod plan (which has a payoutLadder) and 'unlimited': simInputs.plan.payoutLadder?.capsAtLastStep === true
- **Depends on:** R1-24 (readPositiveInteger)
- **Risks:** '0' now errors. See the open question about whether 0 ('model no payouts') should be legal.


### TG-6
- **Root cause:** readGranularityList (shared.ts:611-627) and MAX_PATH_GRANULARITY (shared.ts:600) are private and untested. An off-by-one on `part > MAX_PATH_GRANULARITY` would silently accept or reject a resolution.
- **Design:** Export readGranularityList and MAX_PATH_GRANULARITY. Re-implement readGranularityList on readNumberList (R1-27) with the item schema z.number().int().positive().max(MAX_PATH_GRANULARITY). The tests import the constant, so they survive R1-28 changing the cap.
- **Files:** src/cli/commands/prop/shared.ts, tests/unit/cli/prop/shared.test.ts
- **Tests first:**
  - tests/unit/cli/prop/shared.test.ts, readGranularityList:
- String(MAX_PATH_GRANULARITY) gives [MAX_PATH_GRANULARITY] (200 today)
- String(MAX_PATH_GRANULARITY + 1) throws /--path-granularity/
- '0', '-4', '2.5', 'abc', '4,,25' and '4,25,' throw
- ' 4, 10 ,25' gives [4, 10, 25]
- undefined and '' give undefined
  - Wiring: TradingInputs.parse(parseArgs(['--path-granularity', '10,4'], ARGS)).toSimInputs(plan).intradayPathStepsPerR === 10 (the first listed value is primary), and inputs.intradayPathStepsPerR toStrictEqual [10, 4]
- **Depends on:** R1-27 (readNumberList), R1-28 (may lower the cap or make it rr-dependent; if it becomes rr-dependent, validation moves to toSimInputs or the engine, and these boundary tests move with it)
- **Risks:** If R1-28 makes the bound depend on --rr, the static-constant test has to become a function of rr. Coordinate with that cluster.


### TG-7
- **Root cause:** src/cli/commands/prop/sim/command.ts:119-141 reuses the primary `out` for granularity index 0, because toSimInputs picks intradayPathStepsPerR?.[0] (shared.ts:350), and re-simulates the other indexes inline. There is no test, so a label/value slip or reorder bug would go unnoticed.
- **Design:** Extract from sim/command.ts:
- `export interface GranularityRow { out: SimOutputs; stepsPerR: number }`
- `export function granularityComparison(inputs: TradingInputs, plan: Plan, primary: SimOutputs): GranularityRow[]`

It returns [] when inputs.intradayPathStepsPerR is undefined or has length <= 1. Otherwise it maps entries: index 0 gives {stepsPerR, out: primary}, and every other index gives {stepsPerR, out: simulate({...inputs.toSimInputs(plan), intradayPathStepsPerR: stepsPerR})}.

run() prints the rows. The rows carry full SimOutputs so R1-26 can add eval-pass/eval-bust columns without changing the function.
- **Files:** src/cli/commands/prop/sim/command.ts, tests/unit/cli/prop/sim.test.ts
- **Tests first:**
  - tests/unit/cli/prop/sim.test.ts: plan = planResolver.resolveOne({firm: FirmId.Tpt}) (funded IntradayTrailingDrawdown). inputs = TradingInputs.parse(parseArgs(['--path-granularity', '2,10', '--trials', '60', '--eval-days', '30', '--funded-days', '20', '--seed', '7'], ARGS)). primary = simulate(inputs.toSimInputs(plan)). rows = granularityComparison(inputs, plan, primary).
- rows.map((r) => r.stepsPerR) toStrictEqual [2, 10]
- rows[0].out toBe primary
- inputs.toSimInputs(plan).intradayPathStepsPerR === 2
- rows[1].out toStrictEqual simulate({...inputs.toSimInputs(plan), intradayPathStepsPerR: 10})
- [rows[0].out.fundedBustProbability, rows[0].out.expectedMonthlyNet] does not toStrictEqual the same pair from rows[1]
  - Reordered: '--path-granularity', '10,2' gives rows[0].stepsPerR === 10 with rows[0].out toBe its primary, and rows[1].out toStrictEqual simulate(... intradayPathStepsPerR: 2). The label always matches the simulated value.
  - Without --path-granularity, or with a single value, granularityComparison returns []
- **Depends on:** R1-26 (help text and columns for the comparison table; it may add eval columns that consume GranularityRow.out), R1-28 (the truncation fix may change the numbers, but the tests are relational), R1-24 (readers used by TradingInputs.parse)
- **Risks:** Test runtime: path walking at 10 steps/R over 60 trials x 50 days is small (a*b = 200 steps per trade), well under a second, but keep trials small. The inequality assertion depends on the seeded outcome. It is deterministic, but confirm it once by running the test file.


### TG-8
- **Root cause:** src/cli/commands/prop/ladder/command.ts:70-103 parses --lo/--max/--step/--rungs/--top inline with unbounded readNumber. The --max default is Math.round(cushion * 0.4). The three ranked tables are wired by title-to-field pairs in run() (lines 124-141). There is no test for any of it, and a zero or negative step is the R1-13 hang.
- **Design:** Extract into ladder/command.ts:

1. `export interface LadderGridArguments { lo: string; max?: string; rungs: string; step: string; top: string }`

2. `export function readLadderGrid(arguments_: LadderGridArguments, cushion: number): { grid: LadderGridConfig; topN: number }`:
- lo = readPositiveNumber(lo, 'lo')
- max = readPositiveNumber(arguments_.max ?? Math.round(cushion * 0.4), 'max'), which must be >= lo, else throw `--max (${max}) must be >= --lo (${lo})`
- step = readPositiveNumber(step, 'step')
- slots = readPositiveInteger(rungs, 'rungs')
- topN = readPositiveInteger(top, 'top')

The R1-14 grid-size cap belongs in this same function, owned by that cluster.

3. `export const LADDER_RANKINGS: readonly { select: (result: LadderSearchResult) => readonly LadderScore[]; title: string }[]` with:
- 'FASTEST TO FUNDED' selecting result.bySpeed
- 'CHEAPEST PER FUNDED ACCOUNT' selecting result.byCost
- 'HIGHEST PASS RATE' selecting result.byPassRate

run() loops over LADDER_RANKINGS and calls printTable(title, select(result), ...). LadderGridConfig is already exported from the barrel.
- **Files:** src/cli/commands/prop/ladder/command.ts, tests/unit/cli/prop/ladder.test.ts
- **Tests first:**
  - tests/unit/cli/prop/ladder.test.ts: readLadderGrid({lo: '100', rungs: '4', step: '100', top: '10'}, 2000) toStrictEqual {grid: {lo: 100, max: 800, slots: 4, step: 100}, topN: 10}. 2000 is the Apex EOD 50K drawdown; also assert the default max equals Math.round(apexEodPlan.drawdown.amount * 0.4) === 800.
  - Same file: readLadderGrid({lo: '150', max: '900', rungs: '3', step: '50', top: '7'}, 2000) toStrictEqual {grid: {lo: 150, max: 900, slots: 3, step: 50}, topN: 7}. This guards against swapped fields. The same result comes from parseArgs(['--lo', '150', '--max', '900', '--step', '50', '--rungs', '3', '--top', '7'], ladderArgs).
  - Same file, throws naming the flag:
- step '0' and '-100' (the R1-13 hang)
- rungs '0' and '2.5'
- top '0'
- lo '0'
- max '50' with lo '100' (/--max .* must be >= --lo/)
  - Same file: LADDER_RANKINGS.map((r) => r.title) toStrictEqual ['FASTEST TO FUNDED', 'CHEAPEST PER FUNDED ACCOUNT', 'HIGHEST PASS RATE']. Given a fake LadderSearchResult with three distinct sentinel arrays, each select returns bySpeed, byCost and byPassRate respectively (toBe identity).
- **Depends on:** R1-24 (the readers), R1-13 and R1-14 (step validation and the grid-size cap; they should extend readLadderGrid rather than add a second parse site), R1-8, R1-9, R1-10, R1-11 (the ladder score config: evalPrice, drawdown mode, eval-day cap, contract limits; this is independent of the grid mapping but in the same file), R1-30 / D2 (the 'pass' column label in printTable becomes 'eval pass')
- **Risks:** ladder/command.ts is the most contended file across clusters (R1-8..R1-14, R1-30). Land this extraction early. Positive --lo/--step also fixes the R1-13 hang, so the R1-13 cluster must not duplicate the validation.


**Open questions**
- Should LucidMaxx (LucidTrading.ts buildMaxxPlan) also carry PlanAvailability.CallUpOnly, or a separate 'invite-only' member? lucidmaxx.md says it 'is not available to the general public' and can only be bought after Lucid's risk team grants status, and the 2026-09-22 full-sweep doc already treats it as not buyable. D3 names only TopStep Pro Account.
- Mid-ladder zero rungs: reviewer B called explicit 0 rungs deliberate, but day.ts:155 makes every rung after a 0 dead. This design rejects a positive rung that follows a 0, rejects a leading 0, and keeps trailing zeros legal. Confirm, or keep '400,0,600' legal and only reject empty entries.
- --max-lifetime-payouts 0: this design requires a positive integer, so '0' errors. Should 0 remain legal as 'model zero payouts'?
- --funded-days 0 and --max-attempts 0: this design requires positive integers, so an eval-only study with --funded-days 0 now errors. Is that acceptable, or should funded-days allow 0?
- Should simulate()/simulateLiveAccount also throw on non-positive or non-integer trials (engine.ts:63/167/429, livePhase.ts:250), as defense in depth for the web UI path? That touches engine files outside this cluster's CLI scope.
- R1-45: the funded drawdown description also includes the payout floor effect (' or on 1st payout' for LockAtPlanFloor, ', floor reset to breakeven on each payout' for ReleaseFloor), so TopStep and the FundedNext LockAtPlanFloor plans also get a separate funded-drawdown line. Confirm this wider reading of 'show the funded lock when it differs'.

## Cluster `portfolio` (R1-21, R1-22)

**Shared contracts:** 1) PortfolioTimelineResult (src/lib/prop-calculator/portfolioTimeline/types.ts) gets a new field `accountsSimulated: number`. It equals min(max(1, floor(accounts)), plan.maxFundedAccounts). Its consumers are CashFlowPanel (footer) and the chart views, which use the type only.

2) `maxPayoutsPerCard` is removed from PortfolioTimelineInputs, AccountTimelineInputs and EvalToFundedCycleOptions. `DEFAULT_MAX_PAYOUTS_PER_CARD` is removed from the portfolioTimeline barrel. The timeline calls runFundedDays with `maxPayouts: Infinity`, the same as runFundedHorizon and FundedStateValue. From here on, Plan.isAccountConcluded(payoutsIssued, cumulativePayout) is the only rule that ends a funded account on payout count or dollars. Any cluster that changes runFundedDays or tryFundedPayout (R1-6, R1-7, R1-48) must keep the FundedStage.Concluded check straight after a payout.

3) Where the funded-account cap comes from: lib code reads `plan.maxFundedAccounts`, because the engine has no firm object and TradingFirm.maxFundedAccounts only delegates to it. App code reads `firm.maxFundedAccounts(plan)`, following the existing convention.

4) CashFlowPanelProperties gains `firmDisplayName: string; maxAccounts: number;`. CalculatorShell passes `c.state.firm.displayName` and `c.state.firm.maxFundedAccounts(c.state.plan)`. If the R1-34/D3 cluster adds a call-up-only attribute, it needs no change here: the Cash Flow panel projects whichever plan the user selected, and TopStep Pro Account's cap of 1 is enforced by this item.


### R1-21
- **Root cause:** The Cash Flow engine never looks at the funded-account cap. In src/lib/prop-calculator/portfolioTimeline/portfolio.ts:44, `const N = Math.max(1, Math.floor(accounts));` takes the requested count as given. Lines 57-91 then run N independent runAccountTimeline slots on the same plan and add up their spend, payout and net day by day. Each slot runs its cards one after another (accountTimeline.ts:66-118), so up to N funded accounts can be live at once. Nothing in portfolioTimeline/*.ts reads plan.maxFundedAccounts. The only caller is src/app/(app)/prop-calculator/_components/CashFlowPanel.tsx. It uses DEFAULT_ACCOUNTS = 5 and MAX_ACCOUNTS = 10 (lines 34-35) and clamps the input with stats `clamp(value, 1, 10)` at lines 147-154, ignoring the plan. It passes `accounts` to useCashFlowSimulation.ts:103, which hands it straight to the engine. The rest of the app does clamp to the cap: clamp.ts:29 (clampStateToPlan), calculatorReducer.ts:261/311/404, PortfolioPanel.tsx:300, and CalculatorShell.tsx:96 passes maxCopyAccounts to TradingInputs. CalculatorShell.tsx:269 renders `<CashFlowPanel baseInputs={c.simInputs} />` without any cap. So at the default of 5, MFF Builder 50K (cap 1, MyFundedFutures.ts:140), TopStep Pro Account (cap 1, TopStep.ts:263) and the cap-3 plans (MFF Rapid EOD MyFundedFutures.ts:235, AlphaFutures.ts:154, FtmoFutures MAX_FUNDED_ACCOUNTS = 3, E8 ZERO_MAX_FUNDED_ACCOUNTS = 3, FundedNext FNL003) are simulated as portfolios the firm does not allow.
- **Design:** Enforce the cap in two places. The engine is the source of truth and guards every caller. The UI clamps its input so the user never sees a count the firm does not allow.

1) Engine (src/lib/prop-calculator/portfolioTimeline/portfolio.ts). Replace line 44 with `const N = Math.min(Math.max(1, Math.floor(accounts)), plan.maxFundedAccounts);`. TradingFirm.maxFundedAccounts(plan) only returns plan.maxFundedAccounts (TradingFirm.ts:22-23), and the engine has no firm object, so plan.maxFundedAccounts is the right source in lib. Return the count that was actually simulated so no caller can silently misread it: add `accountsSimulated: N` to the returned object.

2) Types (portfolioTimeline/types.ts). Add `accountsSimulated: number;` to PortfolioTimelineResult, in alphabetical order to match the file's sorted keys. It is already exported through the barrel via PortfolioTimelineResult, so index.ts needs no change for R1-21.

3) Wiring (CalculatorShell.tsx:269). Pass `firmDisplayName={c.state.firm.displayName}` and `maxAccounts={c.state.firm.maxFundedAccounts(c.state.plan)}`, the same pattern already used for TradingInputs' maxCopyAccounts at line 96.

4) UI (CashFlowPanel.tsx):
- Add `firmDisplayName: string; maxAccounts: number;` to CashFlowPanelProperties.
- Compute `const accountCap = Math.min(MAX_ACCOUNTS, maxAccounts);` and `const effectiveAccounts = clampInt(accounts, MIN_ACCOUNTS, accountCap, MIN_ACCOUNTS);`, reusing the existing clampInt from './clamp'. This keeps the value correct when the stored `accounts` state (for example 5) outlives a switch to a cap-1 plan.
- Pass `effectiveAccounts` to useCashFlowSimulation. The cache key then follows automatically.
- Accounts input: `max={accountCap}`, `value={effectiveAccounts}`, and onChange `setAccounts(clampInt(Number(event.target.value), MIN_ACCOUNTS, accountCap, MIN_ACCOUNTS))`. Label: `Accounts (max {accountCap})`.
- When `maxAccounts < MAX_ACCOUNTS`, render a muted line: `{firmDisplayName} allows at most {maxAccounts} funded account(s) at once on this plan`.
- Change the footer `{trials} trials × {accounts} accounts` to use `result.accountsSimulated`.
- Add to the InfoPopover copy that the projection never holds more funded accounts at once than the firm allows. Do not introduce any new em dashes.
- Trials keep the existing stats `clamp`, so its import stays.

Modelling decision: capping the slot count equals capping how many accounts are funded at once, because each slot holds at most one card at a time and buys its next eval only after the current account closes or busts. That matches the panel's own description. Buying spare evals in parallel while the funded slots are full is a different strategy (see open_questions). No new class or conditional is needed; the cap is plan data read through the existing Plan field.
- **Files:** src/lib/prop-calculator/portfolioTimeline/portfolio.ts, src/lib/prop-calculator/portfolioTimeline/types.ts, src/app/(app)/prop-calculator/_components/CashFlowPanel.tsx, src/app/(app)/prop-calculator/_components/CalculatorShell.tsx, tests/unit/lib/prop-calculator/portfolioTimeline/FundedAccountCap.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/portfolioTimeline/FundedAccountCap.test.ts, test 1 (fails today because the field does not exist and 5 slots run): MFF Builder 50K (findFirm(FirmId.Mffu).findPlan({accountSize: 50_000, firm: FirmId.Mffu, variant: MffuVariant.Builder}), maxFundedAccounts 1). Call simulatePortfolioTimeline({accounts: 5, maxEvalDays: 60, plan, riskPerTrade: 300, rrRatio: 2, seed: 12_345, tradesPerDay: 3, trials: 40, winrate: 0.6}). Assert out.accountsSimulated === 1.
  - Same file, test 2: with the same Builder inputs and seed, the accounts: 5 result deep-equals the accounts: 1 result for spendP50, payoutP50, netP10, netP50, netP90, pEverCashflowPositive and breakEvenMonthValues. Slot a = 0 uses deriveSubSeed(seed, t, 0) in both runs, so equality proves exactly one funded slot ran. This fails today because 5 summed slots give roughly 5x the spend.
  - Same file, test 3: MFF Rapid EOD 50K (MffuVariant.RapidEod, cap 3) with accounts: 10 gives accountsSimulated === 3, and its netP50 and spendP50 equal those of accounts: 3 with the same seed.
  - Same file, test 4 (guard that the clamp does not over-restrict): Apex EOD 50K (cap 20) with accounts: 7 gives accountsSimulated === 7, and spendP50.at(-1) is strictly greater than the accounts: 1 run's spendP50.at(-1). This proves counts under the cap still run in full.
  - Existing tests/unit/lib/prop-calculator/portfolioTimeline.test.ts must stay green unchanged. It uses Apex EOD (cap 20) with accounts 2, 3, 5 and 10, all under the cap. Extend assertWellFormed to check that out.accountsSimulated is an integer >= 1.
  - The UI is not unit-testable here, because vitest includes only tests/unit/**/*.test.ts with environment 'node'. Verify CashFlowPanel by tracing: after switching the plan to Builder, effectiveAccounts clamps a stored 5 down to 1, and the input max, label, footer and hook argument all read the clamped value. Then run bun run typecheck and bun run lint.
- **Depends on:** none
- **Risks:** (a) The only caller that exceeded the cap was the panel's default of 5. After the fix, capped plans show smaller absolute dollar figures (roughly a factor of 5 for cap-1 plans, 5/3 for cap-3 plans). This is the intended correction, but the user will see big swings. (b) FTMO Futures' cap of 3 and some Lucid and TopStep caps are shared across products at the firm. The per-plan field cannot express that (FtmoFutures.ts already notes this). The panel is single-plan, so this has no effect here. (c) If a future plan sets maxFundedAccounts to 0 or a non-integer, the engine's Math.min would give 0 or a fraction and the slot loop would run 0 or a truncated number of times. Plan does not validate this field today (Plan.ts:241). All current plans are >= 1. This is flagged, not fixed, to keep the change surgical. (d) Apex's cap is 20, above the UI's performance ceiling of 10. accountCap = min(10, 20) keeps the existing performance bound. The note appears only when the firm cap, not the UI ceiling, is the binding limit. (e) CashFlowPanel gets the cap from c.state.plan, while the engine uses baseInputs.plan (c.simInputs.plan). These are the same plan, and override helpers such as withMaxLifetimePayouts keep maxFundedAccounts. Even if they ever diverged, the engine clamp stays authoritative and the footer shows the engine's accountsSimulated.


### R1-22
- **Root cause:** src/lib/prop-calculator/portfolioTimeline/types.ts:14 defines `export const DEFAULT_MAX_PAYOUTS_PER_CARD = 6;`. It is used as the default for maxPayoutsPerCard in portfolio.ts:28, accountTimeline.ts:28 and fundedCycle.ts:36. It is turned into payoutCap at fundedCycle.ts:48 and passed as `maxPayouts: payoutCap` to runFundedDays at fundedCycle.ts:98. In src/lib/prop-calculator/simulator/fundedPhase.ts:137-144, `if (tracker.payoutsIssued >= maxPayouts)` returns FundedStage.PayoutBudgetSpent. That check runs before the plan's real rule, `plan.isAccountConcluded(...)` at lines 145-157 (Plan.ts:417-433: maxLifetimePayoutDollars, then maxLifetimePayouts, then a ladder without capsAtLastStep). runAccountTimeline's while loop (accountTimeline.ts:66-118) then buys a new card: a fresh eval with fees, resets and activation (fundedCycle.ts:114-121). No caller overrides the default: useCashFlowSimulation.ts has no such field, and grep finds no other user. So every plan is cut at 6 payouts, including plans with no payout-count cap: TopStep XFA (no maxLifetimePayouts or ladder), Lucid and Tradeify ladders with capsAtLastStep: true, and FTMO Futures. The main simulator (fundedPhase.ts:204) and FundedStateValue.ts:642 already pass `maxPayouts: Infinity` and rely only on plan.isAccountConcluded.
- **Design:** Remove the synthetic per-card payout budget completely and let the plan's own lifetime rule end a funded account, the same way runFundedHorizon does.

1) types.ts: delete `DEFAULT_MAX_PAYOUTS_PER_CARD`. Delete the `maxPayoutsPerCard?: number` field from AccountTimelineInputs, EvalToFundedCycleOptions and PortfolioTimelineInputs.

2) index.ts (barrel): drop the `DEFAULT_MAX_PAYOUTS_PER_CARD` re-export on line 9.

3) portfolio.ts: remove the import (line 7), the destructured default (line 28) and the pass-through (line 69).

4) accountTimeline.ts: remove the import (line 13), the destructured default (line 28) and the pass-through to runEvalToFundedCycle (line 79).

5) fundedCycle.ts: remove the import (line 10), the destructure (line 36) and `payoutCap` (line 48). Call runFundedDays with `maxPayouts: Infinity`, the same as fundedPhase.ts:204 and FundedStateValue.ts:642. A card now ends only when:
- the account busts (FundedStage.Busted),
- the plan concludes the account (FundedStage.Concluded, driven by Plan.isAccountConcluded, which reads maxLifetimePayouts, maxLifetimePayoutDollars and payoutLadder / capsAtLastStep), or
- the remaining day budget runs out (HorizonReached).

After a Concluded card (for example Apex after its real 6th payout, or MFF Builder after its 5th), runAccountTimeline correctly buys the next card, because the firm really closes the account.

No new abstraction is needed. The rule already lives on the Plan class hierarchy and the timeline simply stops overriding it. FundedStage.PayoutBudgetSpent and the `maxPayouts` option of runFundedDays and tryFundedPayout become unused in production (every production caller passes Infinity). They are still exercised by tests/unit/lib/prop-calculator/core/MaxPayoutsCap.test.ts. They are left in place under the surgical rule and flagged for cleanup in open_questions. The CashFlowPanel copy ('repeating for every new card bought after an account closes or busts') becomes true as written, so no copy change is needed for this item.
- **Files:** src/lib/prop-calculator/portfolioTimeline/types.ts, src/lib/prop-calculator/portfolioTimeline/index.ts, src/lib/prop-calculator/portfolioTimeline/fundedCycle.ts, src/lib/prop-calculator/portfolioTimeline/accountTimeline.ts, src/lib/prop-calculator/portfolioTimeline/portfolio.ts, tests/unit/lib/prop-calculator/portfolioTimeline/PlanLifetimePayoutRule.test.ts, tests/unit/lib/prop-calculator/rngDrawCount.test.ts
- **Tests first:**
  - tests/unit/lib/prop-calculator/portfolioTimeline/PlanLifetimePayoutRule.test.ts. Shared setup:
- alwaysWinRng: Rng = () => 0, the same trick as AccountTimelineCostAttribution.test.ts.
- TopStep 50K plan: findFirm(FirmId.TopStep).findPlan({accountSize: 50_000, firm: FirmId.TopStep, variant: TopStepVariant.StandardStandard}). It has no maxLifetimePayouts and no payoutLadder.
- runEvalToFundedCycle options: commission: dollars(0), discounts: undefined, evalDayPolicy = fundedDayPolicy = flatDayPolicy(500, 1, {kind: DayStopRuleKind.None}), maxEvalDays: 60, maxFundedDays: 252, minRetainedCushion: plan.resolveRetainedCushion(undefined), payoutRequestSize: undefined, positionSizing: null, rng: alwaysWinRng, rrRatio: 2, rungSizing: DEFAULT_RUNG_SIZING, winrate: fraction(1).
  - Test 1 (fails today, when payouts.length is exactly 6): the TopStep no-cap card gives card.payouts.length > 6, and card.totalDays === card.evalDays + 252. The funded phase runs to the horizon and is not cut by a synthetic budget.
  - Test 2 (fails today, when the count is 6, not 9): the same TopStep plan with .withMaxLifetimePayouts(9) gives card.payouts.length === 9 and card.totalDays < card.evalDays + 252. The account is concluded by the plan's own rule, and 9 > 6 proves the old constant no longer decides.
  - Test 3 (regression guard, passes before and after): MFF Builder 50K (MffuVariant.Builder, maxLifetimePayouts 5) with the same options gives card.payouts.length === plan.maxLifetimePayouts, which is 5. Apex EOD 50K gives card.payouts.length === 6 (MAX_LIFETIME_PAYOUTS, ApexTraderFunding.ts:72). Real caps are still honoured.
  - Test 4 (timeline level, fails today): runAccountTimeline({dayBudget: 252, dayStop: {kind: DayStopRuleKind.None}, maxEvalDays: 60, plan: TopStep StandardStandard 50K, riskPerTrade: 500, rng: alwaysWinRng, rrRatio: 2, tradesPerDay: 1, winrate: 1}).
- at(result.cumulativeSpend, 252) === at(result.cumulativeSpend, 30). Spend is flat after the first eval, so no second card or eval fee is bought. Today a new card starts after the 6th payout and adds spend.
- The number of days d in 1..252 where cumulativePayout[d] > cumulativePayout[d-1] is > 6.
  - Typecheck contract: after the change, any leftover `maxPayoutsPerCard` or `DEFAULT_MAX_PAYOUTS_PER_CARD` reference fails `bun run typecheck`. Grep today shows no references outside portfolioTimeline.
  - Re-run tests/unit/lib/prop-calculator/rngDrawCount.test.ts ('pins the account-timeline draw count', expected 261, on MFF Rapid EOD 50K, which has no lifetime cap). If a card in that 120-day run used to reach 6 payouts, the pinned count changes. That is an intended change: re-pin it to the new observed value and say so explicitly in the report. Otherwise leave it unchanged.
  - Existing tests/unit/lib/prop-calculator/portfolioTimeline.test.ts and portfolioTimeline/AccountTimelineCostAttribution.test.ts must stay green. Their Apex plans have a real cap of 6 (same effective behaviour), and the cost-attribution case never reaches the funded phase within 10 days.
- **Depends on:** none
- **Risks:** (a) Removing the cap raises cumulative payout and net, lowers spend, brings the break-even month earlier and raises P(ever break-even) for every no-cap plan (TopStep XFA, Lucid and Tradeify capsAtLastStep ladders, FTMO Futures, TPT and others). This is the intended correction, but the numbers will move noticeably. (b) Funded phases now run until bust or the horizon, so no closeout credit is booked for the balance still in the account at the horizon. This is pre-existing and consistent with a cash-flow view, not in scope. (c) The rngDrawCount pin may shift, as described in tests. (d) Performance: fewer, longer cards mean fewer eval restarts and fewer or equal RNG draws, so the TERMINATION tests (< 4000 ms) are unaffected or faster. (e) Other clusters that change runFundedDays or tryFundedPayout (R1-6 funded DLL, R1-48 withdrawal sizing, R1-7 dayCloseValue) must keep the ordering where plan.isAccountConcluded ends the account right after the qualifying payout, because the timeline now depends on it alone. (f) The test plans rely on current plan data: TopStep StandardStandard's payout gates are 5 winning days of at least the qualifying profit, and Builder's cap is 5. If R1-50 (Builder reset fee) or a docs re-verification changes those plans, the tests assert through plan.maxLifetimePayouts where possible instead of hardcoding, to stay robust.


**Open questions**
- Do you want a second model where evals can be bought while all funded slots are full, and a passed eval then waits for a free slot? Reviewer B pointed out that evals themselves are not capped. The design here caps the number of slots, which equals capping how many accounts are funded at once, because each slot buys a new eval only after its account closes or busts. That matches the panel's own description. A queued-eval model would need a shared day-by-day scheduler across slots, and each firm's rules on how long a passed eval can wait before activation would have to be checked against its live help center before being modelled.
- Once R1-22 lands, every production caller passes `maxPayouts: Infinity`, so the `maxPayouts` option of runFundedDays/tryFundedPayout and FundedStage.PayoutBudgetSpent are dead in production. They are only exercised by core/MaxPayoutsCap.test.ts and about 60 test call sites. Should a follow-up remove them (CLAUDE.md says to flag the older pattern for cleanup), or keep them as a test seam?
- Should the Plan constructor check that maxFundedAccounts is a positive integer, the same way it already checks maxConsecutiveIdleDays? That would fail loudly if a plan were misconfigured. Every current plan is >= 1, so this item does not add the check, to keep the change surgical.

## Cluster `firm-data` (R1-31 (data), R1-32, R1-33, R1-50, R1-41, R1-42, R1-37, R1-36 (data), R1-43 (data), R1-54 (data), R1-51 (data), R1-40 (data), R1-49 (data), R1-53 (data), R1-39)

**Shared contracts:** 1. TierBasis. R1-43 introduces it and R1-54 uses it. It lives in the new file src/lib/prop-calculator/core/TierBasis.ts, re-exported from core/index.ts:
   - `export enum TierBasis { LiveProfit = 'live-profit', PeakDayClose = 'peak-day-close', SessionOpen = 'session-open' }`
   - `export interface TierProfitContext { peakDayCloseProfit: number; profit: number; profitAtSessionStart: number }`
   - `export function tierProfit(basis: TierBasis, context: TierProfitContext): number`

   Changes that depend on it:
   - Both Tiered configs (ContractLimitConfig and DailyLossLimitConfig) replace `isEffectiveNextSession?: boolean` with `basis?: TierBasis`, default LiveProfit.
   - Migration: contract-limit `true` becomes SessionOpen; the Tradeify DLL `true` becomes PeakDayClose.
   - `DailyLossLimitContext extends TierProfitContext { isThresholdLocked: boolean }`.
   - `Plan.dailyLossLimitContext` sets `profitAtSessionStart = profitFor(state) - state.todayPnL`.
   - `maxContractsAt(config, profit, profitAtSessionStart = profit, peakDayCloseProfit = profitAtSessionStart)`.
   - `resolveContractLimit(limits, phase, isMicro, accountProfit, accountProfitAtSessionStart = accountProfit, peakDayCloseProfit = accountProfitAtSessionStart)`.

   Other clusters: R1-6 (the funded DP's DLL) must feed the session-open profit into DLL resolution. R1-9 and R1-11 (ladder) must pass session-open and peak profit when enforcing contract limits.

2. Payout split by payout count (R1-31):
   - `PlanInit.earlyPayoutShares?: readonly Fraction0to1[]`, exposed as `Plan.earlyPayoutShares` (default []).
   - `Plan.payoutTiersFor(payoutIndex)`.
   - `Plan.payoutFromProfit(fundedProfit, payoutIndex)`: payoutIndex is now REQUIRED.
   - `defaultPayoutRegimeCap` includes `earlyPayoutShares.length`.
   Every cluster that turns a funded debit into trader cash must pass the per-account payoutsIssued. LivePlan.payoutFromProfit is unchanged.

3. `DrawdownLockConfig.atProfit: Dollars | null` (R1-51). null means only a payout floor effect can force the lock. Every reader must handle null: DrawdownStrategy.maybeLock, the LadderSearch lockTrigger (null gives Infinity), the FundedStateValue impliedOffsetMultiple (null gives 0), and the plans CLI.

4. `PayoutFloorEffect.MoveToPlanFloor = 'move-to-plan-floor'` (R1-51).
   - A payout sets the MLL exactly to lock.lockedThreshold(start), via DrawdownStrategy.release, and locks it.
   - Before that payout, the buffer is measured from that planned floor through the new `Plan.payoutReferenceThreshold(state)`, which also takes over the existing LockAtPlanFloor max() logic.
   - LivePlan's two floor-effect switches gain this case. Coordinate with the R1-48/D4 live-withdrawal cluster.

5. Live contract limits (R1-53):
   - `export interface LiveContractLimits { readonly micros: ContractLimitConfig; readonly minis: ContractLimitConfig }`.
   - `LivePlanInit.contractLimits?: LiveContractLimits` replaces `contractLimit`.
   - `LivePlan.contractLimits: LiveContractLimits | null` and `LivePlan.contractLimitFor(isMicro: boolean)`.
   livePhase.ts sizes through contractLimitFor(positionSizing.instrument.isMicro). The R1-18, R1-19 and R1-48 clusters edit that same file.

6. Fee inputs to the D1 shared cost-per-funded-account formula after this cluster:
   - MFFU Builder reset = $153 (a re-buy at the full eval fee).
   - E8 Zero, list prices: $328 / $428 / $178 / $228, with reset equal to eval.
   - FundedNext Rapid Pro and Rapid Daily: $149.99 eval, $157.99 reset.

7. Test placement:
   - New regression tests go into existing flat firm test files where one exists: E8Futures.test.ts, apex.test.ts, fundedNext.test.ts, mffuBuilder.test.ts, mffuPro.test.ts, tradeify.test.ts.
   - New mirrored files are created only where no test exists yet: tests/unit/lib/prop-calculator/firms/alphafutures/AlphaFutures.test.ts and tests/unit/lib/prop-calculator/core/TierBasis.test.ts.
   - The flat-versus-mirrored inconsistency should be flagged for later cleanup.

8. Doc edits under .claude/prop-firms/** belong to the implementation phase. They go through ecc:doc-updater forced to Sonnet 5 (user memory), and must contain no em dashes.


### R1-31
- **Root cause:** src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts:161-163, 208-210 and 256-258 all set `payoutTiers: [{ thresholdProfit: dollars(0), traderShare: fraction(0.9) }]`. src/lib/prop-calculator/core/Plan.ts:533-536 (payoutFromProfit) walks profit-keyed tiers only. src/lib/prop-calculator/core/FundedPayoutCycle.ts:161 (tryPayout) and :58 (closeoutCredit) call it without the payout count. The engine therefore has no way to set a split by payout number, so every Alpha Futures payout pays 90%.

Doc: advanced.md:47, the zero.md/standard.md Profit Split rows and README.md:91 all quote the signed General Service Agreement: "First two virtual payouts on the account the User receives a 70% Performance Fee, virtual payouts 3 and 4 80%, virtual payouts 5+ on the account the User receives a 90% Performance Fee."
- **Design:** Add a new generic Plan capability. It follows the existing ConsistencyLadder / PayoutCountTieredPayoutCap precedent of data indexed by payout count.

1. Plan.ts: add `earlyPayoutShares?: readonly Fraction0to1[]` to PlanInit and `readonly earlyPayoutShares: readonly Fraction0to1[]` to Plan, defaulting to [].
   - Constructor validation: if the list is non-empty, payoutTiers must be exactly one rung at thresholdProfit 0. Otherwise throw `${label}: earlyPayoutShares requires a single payoutTiers rung at thresholdProfit 0`, because a count ramp cannot be combined with a profit walk.
2. Plan.ts: add `payoutTiersFor(payoutIndex: number): readonly PayoutTier[]`. It returns `[{ thresholdProfit: dollars(0), traderShare: share }]` when `earlyPayoutShares[payoutIndex]` exists, and `this.payoutTiers` otherwise.
3. Plan.ts: change `payoutFromProfit(fundedProfit: number, payoutIndex: number)` so the index is REQUIRED (fail loud, no default). It returns walkPayoutTiers(payoutTiersFor(payoutIndex), fundedProfit) minus payoutMethodFee.
4. FundedPayoutCycle.ts:
   - tryPayout: `plan.payoutFromProfit(debited, this.payoutsIssued)`.
   - closeoutCredit: `plan.payoutFromProfit(Math.max(0, this.withdrawableNow(options)), this.payoutsIssued)`.
5. FundedStateValue.defaultPayoutRegimeCap: add `plan.earlyPayoutShares.length` to its Math.max. This is inert today (4 < 6).
6. AlphaFutures.ts: add module constants and use them in all three builders, replacing the three duplicated 90% rungs (DRY):
   - `STEADY_PAYOUT_TIERS = [{ thresholdProfit: dollars(0), traderShare: fraction(0.9) }] as const`
   - `AGREEMENT_EARLY_PAYOUT_SHARES = [fraction(0.7), fraction(0.7), fraction(0.8), fraction(0.8)] as const`
7. Display:
   - plans/command.ts prints `payout split 90% (payouts 1-4: 70/70/80/80%)` when a ramp exists.
   - PlanStatsBadges.tsx shows `70-90%`.
   - The 'Payout share -20%' scenario in RuleStressTestPanel.tsx also scales earlyPayoutShares by 0.8.
8. AlphaFutures notes: add an entry stating that the split is modeled as earlyPayoutShares 70/70/80/80 over a steady 90% rung, per the GSA's 'Virtual Performance Fees', and that the help center's 'flat 90%' is outranked. No existing entry is removed.

Docs to update once fixed:
- advanced.md:106, standard.md:112 and zero.md:109 (the 'Profit Split, engine/doc mismatch' bullets are now resolved).
- alphafutures/README.md:10, :71 ('engine still flat 90%'), :88 and :91.
- **Files:** src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/FundedPayoutCycle.ts, src/lib/prop-calculator/core/FundedStateValue.ts, src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts, src/cli/commands/prop/plans/command.ts, src/app/(app)/prop-calculator/_components/PlanStatsBadges.tsx, src/app/(app)/prop-calculator/_components/RuleStressTestPanel.tsx, tests/unit/lib/prop-calculator/FtmoFutures.test.ts, tests/unit/lib/prop-calculator/fundedNext.test.ts, tests/unit/lib/prop-calculator/payoutMethodFeeAndEvalCap.test.ts, tests/unit/lib/prop-calculator/takeProfitTrader.test.ts, tests/unit/lib/prop-calculator/E8Futures.test.ts, tests/unit/lib/prop-calculator/core/PlanUniversalInvariants.test.ts, tests/unit/lib/prop-calculator/core/PlanVariant.test.ts, tests/unit/lib/prop-calculator/core/PayoutTiers.test.ts, tests/unit/lib/prop-calculator/firms/alphafutures/AlphaFutures.test.ts, .claude/prop-firms/alphafutures/advanced.md, .claude/prop-firms/alphafutures/standard.md, .claude/prop-firms/alphafutures/zero.md, .claude/prop-firms/alphafutures/README.md
- **Tests first:**
  - NEW tests/unit/lib/prop-calculator/firms/alphafutures/AlphaFutures.test.ts: for each of Zero, Standard and Advanced 50K, payoutFromProfit(1000, i) for i = 0..5 equals [700, 700, 800, 800, 900, 900]. This fails today, which pays 900 everywhere.
  - Same file, Advanced via tryFundedPayout. Setup: balance = start + 6000, threshold = start, thresholdLocked = true, qualifyingDays = 5, tracker.lastPayoutBalance = start, minRetainedCushion 0, payoutRequestSize undefined. Expect debited 3000. traderReceives should be 2100 at payoutsIssued = 0, 2400 at 2 and 2700 at 4.
  - Same file: closeoutCredit on that state with payoutsIssued = 1 equals 0.7 * withdrawableNow.
  - core/PayoutTiers.test.ts: a plan with earlyPayoutShares plus two payoutTiers rungs throws /earlyPayoutShares requires a single payoutTiers rung/. payoutTiersFor(10) returns plan.payoutTiers.
  - core/PlanUniversalInvariants.test.ts: extend the monotone and <= input invariant to every payoutIndex 0..6.
  - Mechanical: add the explicit index argument (0) to existing Plan.payoutFromProfit calls in FtmoFutures.test.ts, fundedNext.test.ts, payoutMethodFeeAndEvalCap.test.ts, takeProfitTrader.test.ts, E8Futures.test.ts and PlanVariant.test.ts.
- **Depends on:** R1-22, R1-2, R1-8
- **Risks:** The real-world rule is contested: the help center still says a flat 90%. This design follows the doc tree's resolution, which favors the signed Agreement; re-confirm the clause before shipping, per CLAUDE.md. Making the parameter required breaks every caller at compile time, which is intentional but collides with other clusters that touch payoutFromProfit. Alpha Futures monthly net drops, so any ranking output shifts (grep found no pinned characterization numbers).


### R1-32
- **Root cause:** src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts:31-40 sets ADVANCED_SIZES maxDrawdown to 1750, and :134-140 (buildAdvancedPlan) builds one EodTrailingDrawdown without fundedDrawdown. Plan.ts:224 (`init.fundedDrawdown ?? init.drawdown`) therefore gives the Qualified stage the Evaluation stage's $1,750 MLL and +$1,750 lock.

Doc advanced.md:38: "Schedule 2 of the Terms and Conditions, which labels this stage explicitly ('Advanced Qualified'), instead states a 4% Maximum Loss Limit ($2,000 on a $50K account)". advanced.md:39 gives a $52,000 trigger and a $50,000 locked value.
- **Design:** 1. AlphaFutures.ts: add `fundedMaxDrawdown: dollars(2000)` to the ADVANCED_SIZES entry.
2. Add a module helper `trailingLockedAtStart(amount: Dollars): EodTrailingDrawdown` that returns `new EodTrailingDrawdown({ amount, lock: { atProfit: amount, lockedThreshold: lockThresholdAt(0) } })`. Use it for all four drawdowns in the file (DRY).
3. buildAdvancedPlan: set `drawdown: trailingLockedAtStart(size.maxDrawdown)` and `fundedDrawdown: trailingLockedAtStart(size.fundedMaxDrawdown)`. Downstream, defaultRetainedCushion becomes 2000 and the post-lock payout floor becomes $52,000.
4. Notes: add an entry saying the Qualified MLL is $2,000 (Terms Schedule 2, 4%) and the Evaluation MLL is $1,750 (Schedule 1, 3.5%).

Docs to update once fixed:
- advanced.md:107, the Drawdown Amount mismatch bullet, is now resolved.
- alphafutures/README.md:18, :63 ('engine still uses $1,750'), :88 and :92.
- **Files:** src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts, tests/unit/lib/prop-calculator/firms/alphafutures/AlphaFutures.test.ts, .claude/prop-firms/alphafutures/advanced.md, .claude/prop-firms/alphafutures/README.md
- **Tests first:**
  - AlphaFutures.test.ts, Advanced 50K: drawdown.amount is 1750 and drawdown.lock.atProfit is 1750. fundedDrawdown.amount is 2000, fundedDrawdown.lock.atProfit is 2000 and lockedThreshold(50000) is 50000.
  - Same file: initialState().threshold is 48250. After beginFundedPhase the threshold is 48000. At balance 51900, fundedDrawdown.onDayClose gives threshold 49900 and the drawdown stays unlocked (today it locks at 51750). At 52000 it locks at 50000.
  - Same file: defaultRetainedCushion() === 2000 (today 1750).
- **Depends on:** R1-45
- **Risks:** The plans CLI shows only the eval drawdown for non-instant plans, so it keeps printing $1,750 until R1-45 adds a funded drawdown line. Re-confirm Terms Schedule 2 before shipping. The post-lock payout floor rises by $250, so the per-payout withdrawable amount drops slightly (Reviewer B's correction).


### R1-33
- **Root cause:** src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts: none of the builders sets minPayoutRequest. Plan.ts:250 defaults it to $0, and FundedPayoutCycle.ts:152 passes minRequest 0 into resolveWithdrawal. The $200/$500/$1,000 figures sit in minPayoutProfit (lines 156, 203, 251), which only gates first-cycle profit. That gate is dominated anyway by the 0.5 payoutProfitShare. The note at line 113 wrongly says no minimum was confirmed.

Docs: zero.md:86 "The minimum withdrawal request on Zero Accounts is $200"; standard.md:85 "...on Standard Accounts is $500"; advanced.md:82 "...on Advanced Qualified Accounts is $1,000."
- **Design:** 1. AlphaFutures.ts: add a `minPayoutRequest` field to each size constant: Zero dollars(200), Standard dollars(500), Advanced dollars(1000). Set `minPayoutRequest: size.minPayoutRequest` in every builder.
2. Remove `minPayoutProfit` from all three builders so it defaults to $0.
   - The docs state no first-payout profit gate.
   - The field is provably non-binding: debited <= 0.5 * cycleProfit and debited >= minRequest together imply cycleProfit >= 2 * minRequest > minPayoutProfit.
   - So no simulated number changes, and `prop plans` stops printing a fictitious 'first $X'.
3. The Plan.ts:320 validation still passes: 200 <= 1500, 500 <= 3000 and 1000 <= 15000.
4. Notes: replace entry 113 with one saying the per-request minimum is $200/$500/$1,000 per the Payout Policy, and that no separate first-payout profit gate exists.

Docs to update once fixed:
- zero.md:107, standard.md:110 and advanced.md:101 (the mismatch bullets are now resolved).
- alphafutures/README.md:88.
- **Files:** src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts, tests/unit/lib/prop-calculator/core/MinPayoutRequestDefault.test.ts, tests/unit/lib/prop-calculator/firms/alphafutures/AlphaFutures.test.ts, .claude/prop-firms/alphafutures/zero.md, .claude/prop-firms/alphafutures/standard.md, .claude/prop-firms/alphafutures/advanced.md, .claude/prop-firms/alphafutures/README.md
- **Tests first:**
  - AlphaFutures.test.ts: minPayoutRequest is 200/500/1000 for Zero/Standard/Advanced, and minPayoutProfit is 0 for all three.
  - Same file, Standard, second cycle. Setup: payoutsIssued = 1, cycle profit 800, 5 qualifying days, cycleBestDayProfit 200, locked threshold, minRetainedCushion 0. Expect tryFundedPayout to return null, because 400 < 500 (today it pays 400). With cycle profit 1000, expect debited 500.
  - Same file, Zero, first payout. Setup: cycle profit 399, 5 qualifying days, best day 100. Expect null, because 199.5 < 200 (today it pays 199.5).
  - Rewrite core/MinPayoutRequestDefault.test.ts, which pins the old values at lines 9-14 and 31-33: assert that every firm sets minPayoutRequest explicitly. Check the $0 default through `new AlphaFutures().plans[0].withOverrides({ minPayoutRequest: undefined }).minPayoutRequest === 0`.
- **Depends on:** none
- **Risks:** The docs cap each request at 50% of ACCOUNT profit, while the engine caps it at 50% of CYCLE profit (payoutProfitShare). That separate latent gap is listed in open_questions. Alpha Futures payout timing and payout counts shift. Grep found no pinned characterization numbers.


### R1-50
- **Root cause:** src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts:128-132 (buildBuilderPlan) sets `reset: dollars(0)`. simulator/evalPhase.ts:152 charges plan.fees.reset for every busted non-final attempt, so Builder retries cost nothing.

Doc builder.md:28: "None, no reset option; a max-drawdown breach ends the account and requires purchasing a new evaluation at the full One-Time Eval Fee". builder.md:27 gives the Default fee as $153.
- **Design:** MyFundedFutures.ts: add `const BUILDER_EVAL_FEE = dollars(153);` and use it for both oneTimeEval and reset. This matches the reset = eval convention of the sibling Rapid, Rapid EOD and Pro plans.

No note change is needed: the existing note already calls $153 Builder's 'eval/reset fee', and after this fix that is true. There is no doc mismatch note to update.
- **Files:** src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts, tests/unit/lib/prop-calculator/mffuBuilder.test.ts
- **Tests first:**
  - mffuBuilder.test.ts: fees.reset === 153 === fees.oneTimeEval.
  - Same file: simulate({ plan: builder, maxAttempts: 3, maxEvalDays: 5, winrate: 0, rrRatio: 1, riskPerTrade: 2100, tradesPerDay: 1, trials: 1, seed: 9, fundedHorizonDays: 10 }). Expect bustProbability 1 and costBreakdown.resetFeesTotal === 306 (today 0). This mirrors the apex.test.ts reset-fee test.
- **Depends on:** R1-2, R1-8
- **Risks:** Builder's multi-attempt cost rises by $153 per retry, both in the CLI and in the web portfolio timeline (25 attempts per card), so its ranking drops. That is the intended correction.


### R1-41
- **Root cause:** src/lib/prop-calculator/firms/fundednext/FundedNext.ts:85-94: RAPID_PRO_SIZES sets evalCost 169.99 and resetFee 174.99, and buildRapidProPlan passes both into fees. The FundedNext note calling these 'live-confirmed exact matches' is wrong.

Doc rapid-pro.md:29-32 (resolved 2026-09-20) takes its figures from the plan-specific article 15877643: "Original Price $159.98/$299.98/$499.98 discounted 50% to $79.99/$149.99/$249.99, with Reset Price $87.99/$157.99/$257.99". It states that this article outranks the firm-wide articles 14260538 and 15053874.
- **Design:** 1. FundedNext.ts: add shared constants `RAPID_EVAL_FEE = 149.99` and `RAPID_RESET_FEE = 157.99`. Article 15877643 prices the shared 'Rapid Pro & Daily Challenge', so both plans use them (DRY with R1-42).
2. Set RAPID_PRO_SIZES[0].evalCost to RAPID_EVAL_FEE and resetFee to RAPID_RESET_FEE.
3. Leave the DLL Add-On unchanged at 139.99/134.99.
4. Notes: rewrite the 'The $169.99/$199.99 eval fees and $174.99/$183.99/$189.99 reset fees...' entry. It should say that Rapid Pro/Daily 50K cost $149.99 eval and $157.99 reset per plan-specific article 15877643, which outranks the firm-wide articles 14260538/15053874. Keep the Legacy statement. Keep the pinned substrings 'reset fee is calculated off list price' and 'RAPID (~43-46% off' intact in their entries.

Docs to update once fixed: in rapid-pro.md:32, drop the 'This repo's own FundedNext.ts simulator models ... $169.99/$174.99 ... not fixed here' sentence and the bold 'Do not treat the engine's...' clause.
- **Files:** src/lib/prop-calculator/firms/fundednext/FundedNext.ts, tests/unit/lib/prop-calculator/fundedNext.test.ts, .claude/prop-firms/fundednext/rapid-pro.md
- **Tests first:**
  - fundedNext.test.ts: Rapid Pro 50K has oneTimeEval === 149.99 and reset === 157.99 (today 169.99/174.99).
  - Same file: the RapidProDllAddOn fees stay 139.99/134.99.
- **Depends on:** R1-42, R1-2, R1-8
- **Risks:** The article frames $149.99 as 50% off $299.98, so users who also pass the RAPID coupon through --eval-discount get the discount twice; see open_questions. FundedNext's own articles conflict with each other, so re-check the live checkout per CLAUDE.md.


### R1-42
- **Root cause:** src/lib/prop-calculator/firms/fundednext/FundedNext.ts:107-116: RAPID_DAILY_SIZES sets evalCost 169.99 and resetFee 189.99, and buildRapidDailyPlan's fees use them directly.

Doc rapid-daily.md:29-30,34: "$149.99 (this plan's own dedicated FAQ; outranks a conflicting $169.99 stated in two firm-wide articles)" and "$157.99 (same resolution; a conflicting $189.99 appears in the firm-wide reset-conditions article's table row)".
- **Design:** FundedNext.ts: set RAPID_DAILY_SIZES[0].evalCost to RAPID_EVAL_FEE (149.99) and resetFee to RAPID_RESET_FEE (157.99), the shared constants from R1-41. The R1-41 notes rewrite covers this change too.

Docs to update once fixed: in rapid-daily.md:34, drop 'This repository's FundedNext.ts currently models the outranked firm-wide figures ($169.99 eval / $189.99 reset at 50K) ... is not fixed here (do not touch src/ ...)'.
- **Files:** src/lib/prop-calculator/firms/fundednext/FundedNext.ts, tests/unit/lib/prop-calculator/fundedNext.test.ts, .claude/prop-firms/fundednext/rapid-daily.md
- **Tests first:**
  - fundedNext.test.ts: Rapid Daily 50K has oneTimeEval === 149.99 and reset === 157.99 (today 169.99/189.99), and both equal Rapid Pro's fees.
- **Depends on:** R1-41
- **Risks:** Same promo-vs-list and double-coupon concern as R1-41.


### R1-37
- **Root cause:** src/lib/prop-calculator/firms/e8futures/E8Futures.ts:64-82: ZERO_PAYOUT_SHARES holds the 35%-off prices $214/$279/$116/$149. zero.md confirms these as j(328,35), j(428,35), j(178,35) and j(228,35). buildZeroPlan uses them for oneTimeEval and reset (:216-217), while Signature uses its $160 list price (:152-153). The firm note at :88 says coupons are not baked into the modeled fees.

Doc zero.md:30-37 gives the list prices: $178 (Starter 80%) and $328 (Max 80%). zero.md Not Confirmed derives the 100%-share list prices, $428 (Max) and $228 (Starter), from the site's own pricing function.
- **Design:** Binding decision: fees are list prices, and discounts go through --eval-discount/--reset-discount.

1. E8Futures.ts ZERO_PAYOUT_SHARES: rename the field `evalFee` to `listEvalFee` and set:
   - Max 80: dollars(328)
   - Max 100: dollars(428)
   - Starter 80: dollars(178)
   - Starter 100: dollars(228)
2. buildZeroPlan: `oneTimeEval: shareConfig.listEvalFee` and `reset: shareConfig.listEvalFee`. This keeps the existing, unconfirmed reset = eval convention, now on the list basis like Signature.
3. Notes:
   - Rewrite entry 94 around the $50K list prices $328/$428/$178/$228. The 80%-share prices come from the configurator's `balances.50000.price`. The 100%-share prices are derived from the site's pricing function and are not displayed on the site. The 35%/40% codes (E8 in the configurator, REB8 on the discount page, a 40% homepage promo) conflict with each other and are applied via --eval-discount.
   - Rewrite entry 98: reset = list eval fee, still unconfirmed.

Docs to update once fixed:
- zero.md 'One-Time Eval Fee vs. the engine's hardcoded values' bullet (resolved).
- signature.md 'Reset Fee and eval fee pricing basis in the engine' bullet (resolved).
- e8futures/README.md:203 (remove from 'Still open').
- **Files:** src/lib/prop-calculator/firms/e8futures/E8Futures.ts, tests/unit/lib/prop-calculator/E8Futures.test.ts, .claude/prop-firms/e8futures/zero.md, .claude/prop-firms/e8futures/signature.md, .claude/prop-firms/e8futures/README.md
- **Tests first:**
  - E8Futures.test.ts:271-274 PINS the old 214/279/116/149. Change it to 328/428/178/228 and assert reset === oneTimeEval for each Zero variant.
  - Same file, new test: sorting the 5 E8 plans by oneTimeEval gives Signature 160 < Starter80 178 < Starter100 228 < Max80 328 < Max100 428. Today, Starter80 (116) and Starter100 (149) sort below Signature.
- **Depends on:** R1-1, R1-2, R1-8
- **Risks:** The 100%-share prices are derived from site JS rather than displayed, and the notes must say so. The configurator should be re-captured before shipping per CLAUDE.md, because the help center was 403-blocked. In default runs, E8 Zero looks about 35% dearer; users who actually pay the promo price must pass --eval-discount 35.


### R1-36
- **Root cause:** src/lib/prop-calculator/firms/e8futures/E8Futures.ts:129-140: buildSignaturePlan sets evalMicros to contracts(4) and fundedMicros to Flat 4. PositionSizing.resolveContractLimit branches on isMicro, so MNQ positions are capped at 4 contracts. The note at :92 rests on a false premise ('doesn't distinguish mini vs micro').

Doc signature.md:24/32: "4 contracts ($40,000 margin)"; "a $1,000-margin Micro instrument yields more (up to 40) under the same $40,000 margin allowance". signature.md:112 lists "/MNQ ... $1,000" margin, so "a $50,000 account can hold up to 40 MNQ or MES contracts".
- **Design:** 1. E8Futures.ts: add `SIGNATURE_MAX_MINIS = contracts(4)` and `SIGNATURE_MAX_MICROS = contracts(40)`.
2. Set the contract limits: evalMinis and fundedMinis (Flat) to 4; evalMicros and fundedMicros (Flat) to 40. MNQ is the engine's only micro and its margin is $1,000, so 40 is exact.
3. Notes: rewrite entry 92. The cap is margin-based ($40,000 at $50K): $10,000-margin minis give 4 contracts and $1,000-margin MNQ/MES give 40, for both stages. Remove the false premise.

Docs to update once fixed: signature.md:112 bullet (resolved).
- **Files:** src/lib/prop-calculator/firms/e8futures/E8Futures.ts, tests/unit/lib/prop-calculator/E8Futures.test.ts, .claude/prop-firms/e8futures/signature.md
- **Tests first:**
  - E8Futures.test.ts:100-108 PINS evalMicros 4. Change the expectations to evalMinis 4 and evalMicros 40, funded minis Flat 4 and funded micros Flat 40.
  - Same file: resolveContractLimit(limits, Funded, true, 0) === 40, and capRiskToContractLimit(250, { instrument: INSTRUMENTS.MNQ, stopPoints: 20 }, 40) === 250. Today the cap is 160.
- **Depends on:** R1-11
- **Risks:** A sibling gap exists outside the audit: E8 Zero is also margin-based (zero.md:51), but its micros use the mini counts. It is raised in open_questions rather than silently fixed.


### R1-39
- **Root cause:** src/lib/prop-calculator/firms/e8futures/E8Futures.ts:103: a notes entry says "Corrected 2026-09-18 to dollars(100)", but buildSignaturePlan:174 sets `minPayoutRequest: dollars(125)`.

Doc signature.md:75: "$100, in net (post-split) profit terms. Since the profit split is 80%, at least $125 in gross account profit is required to net $100." resolveWithdrawal (FundedPayoutCycle.ts:257) compares the gross debit, so the $125 in the code is correct and only the note is stale.
- **Design:** Rewrite entry 103: Signature's minPayoutRequest is dollars(125). The firm's $100 minimum is net of the 80% split, and the engine compares minPayoutRequest against the gross debit, so $100 / 0.8 = $125. Record that it was previously dollars(0.01).

Keep the pinned substrings in the other entries: 'Coupon code "E8"', '$160 -> $120' and 'hard 5-payout lifetime cap'.

Docs to update once fixed: e8futures/README.md:205 (remove the stale-note bullet).
- **Files:** src/lib/prop-calculator/firms/e8futures/E8Futures.ts, tests/unit/lib/prop-calculator/core/TradingFirmNotes.test.ts, .claude/prop-firms/e8futures/README.md
- **Tests first:**
  - TradingFirmNotes.test.ts: no E8 note includes 'dollars(100)', and some note includes 'dollars(125)'. Both assertions fail today.
- **Depends on:** none
- **Risks:** None numerically; this is a text-only change.


### R1-43
- **Root cause:** src/lib/prop-calculator/firms/apex/ApexTraderFunding.ts:255-257: fundedDailyLossLimitOf returns a Tiered DLL with no timing setting.
- TieredDailyLossLimit.resolve (core/DailyLossLimit.ts:176-182) keys on live context.profit.
- simulator/day.ts:123-126 and Plan.isDayLockedOut (Plan.ts:443-449) re-resolve the DLL around every trade.
- The DLL `isEffectiveNextSession` flag picks peakDayCloseProfit (a ratchet), while the contract-limit flag of the same name (ContractLimits.ts:52) means session-open. Two booleans with the same name and different semantics.

Doc apex/eod.md:81: "Tier Levels are set once per trading day before the session begins, based on the prior session's closing balance, and never change mid-session." This covers both the DLL and the contract counts (eod.md:76-79).
- **Design:** Replace both booleans with one enum.

1. NEW core/TierBasis.ts:
   - `enum TierBasis { LiveProfit = 'live-profit', PeakDayClose = 'peak-day-close', SessionOpen = 'session-open' }`
   - `interface TierProfitContext { peakDayCloseProfit: number; profit: number; profitAtSessionStart: number }`
   - `function tierProfit(basis, context): number` (exhaustive switch)
   - Export all of these from core/index.ts.
2. DailyLossLimit.ts:
   - The Tiered config takes `basis?: TierBasis` (default LiveProfit) instead of isEffectiveNextSession.
   - `DailyLossLimitContext extends TierProfitContext { isThresholdLocked }`.
   - TieredDailyLossLimit.resolve uses tierProfit.
   - scaleDailyLossLimit copies basis.
3. Context producers set profitAtSessionStart:
   - Plan.dailyLossLimitContext: `this.profitFor(state) - state.todayPnL`. todayPnL resets at day start and accumulates every intraday pnl, so no new state field is needed.
   - LivePlan.isDayLockedOut: `balance - startingBalance - todayPnL`.
   - LadderSearch.ts:361: `balance - start`.
4. Migrate Tradeify SCALING_FUNDED_DLL from true to TierBasis.PeakDayClose (behavior preserved).
5. Apex: both fundedDailyLossLimitOf(size, basis) and fundedContractLimitsOf(size, basis) take a basis. EOD passes TierBasis.SessionOpen to both; Intraday passes TierBasis.LiveProfit to both. One basis per Level system (DRY).
6. Notes:
   - Rewrite Apex entry 95 to cover contracts and DLL together, quoting eod.md:81.
   - Update Tradeify.ts entry 130, which says Apex's DLL left live recompute in place.

No apex doc mismatch note exists to update.
- **Files:** src/lib/prop-calculator/core/TierBasis.ts, src/lib/prop-calculator/core/index.ts, src/lib/prop-calculator/core/DailyLossLimit.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/LivePlan.ts, src/lib/prop-calculator/core/LadderSearch.ts, src/lib/prop-calculator/firms/apex/ApexTraderFunding.ts, src/lib/prop-calculator/firms/tradeify/Tradeify.ts, tests/unit/lib/prop-calculator/core/TierBasis.test.ts, tests/unit/lib/prop-calculator/core/DailyLossLimit.test.ts, tests/unit/lib/prop-calculator/core/DailyLossLimitCache.test.ts, tests/unit/lib/prop-calculator/core/DailyLossLimitShape.test.ts, tests/unit/lib/prop-calculator/core/ScalingDailyLossLimit.test.ts, tests/unit/lib/prop-calculator/lucidTrading.test.ts, tests/unit/lib/prop-calculator/apex.test.ts
- **Tests first:**
  - NEW core/TierBasis.test.ts: with context { profit: 3050, profitAtSessionStart: 2900, peakDayCloseProfit: 3200 }, tierProfit returns 3050 for LiveProfit, 2900 for SessionOpen and 3200 for PeakDayClose.
  - apex.test.ts, 50K EOD, upward crossing: balance = start + 3050 and todayPnL = +150 (the session opened at 2900). resolveDailyLossLimit(fundedDailyLossLimit, plan.dailyLossLimitContext(state)) === 1000 (today 2000).
  - apex.test.ts, 50K EOD, downward crossing: balance = start + 2000 and todayPnL = -1100 (opened at 3100). isDayLockedOut(state, Funded) is false (today true).
  - apex.test.ts, Intraday: the same upward state still resolves to 2000.
  - Mechanical: add profitAtSessionStart to DailyLossLimitContext literals in the apex.test.ts atProfit helper (line 35), DailyLossLimit.test.ts:13, DailyLossLimitCache.test.ts:11, DailyLossLimitShape.test.ts:81, ScalingDailyLossLimit.test.ts:30 and lucidTrading.test.ts. The existing Apex escalation expectations still hold.
- **Depends on:** R1-6, R1-54
- **Risks:** The FundedStateValue DP builds its states with todayPnL 0, so until R1-6 lands the DP treats SessionOpen as live profit. Renaming isEffectiveNextSession touches every firm that uses it, and their notes name the field. Behavior must be preserved exactly: contract-limit true maps to SessionOpen, and Tradeify DLL true maps to PeakDayClose. The notes to edit are AlphaFutures.ts:119, E8Futures.ts:106, FtmoFutures.ts:119, LucidTrading.ts:173, TopStep.ts:130, Tradeify.ts:130/132 and ApexTraderFunding.ts:95.


### R1-54
- **Root cause:** src/lib/prop-calculator/firms/tradeify/Tradeify.ts:39-60: SELECT_CONTRACT_LIMITS uses isEffectiveNextSession: true. maxContractsAt (core/ContractLimits.ts:45-69) then selects the tier from the session-open profit: simulator/day.ts:89 in the Monte Carlo sim and FundedStateValue.ts:495 in the DP. There is no high-water mark, so the tier drops back after a pullback or a payout.

Doc select-flex.md:46: "once EOD equity reaches $2,000 profit ...: cumulative, retaining the higher tier even if balance later falls". select-daily.md:60 (same source table): "takes effect the next trading day after the threshold is hit".
- **Design:** This uses the TierBasis enum from R1-43.

1. ContractLimits.ts:
   - The Tiered config takes `basis?: TierBasis` (default LiveProfit) instead of isEffectiveNextSession.
   - New signature: `maxContractsAt(config, profit, profitAtSessionStart = profit, peakDayCloseProfit = profitAtSessionStart)`, using tierProfit.
2. PositionSizing.resolveContractLimit gains a 6th parameter, `peakDayCloseProfit = accountProfitAtSessionStart`.
3. Migrate the firms:
   - Tradeify SELECT becomes TierBasis.PeakDayClose. peakDayCloseProfit is updated only at close (Plan.recordDayClosePeak), so the tier takes effect next session and never retreats.
   - Lucid, TopStep, FTMO, E8 Zero and Apex EOD become SessionOpen (behavior preserved).
4. day.ts:137-143: pass state.peakDayCloseProfit.
5. FundedStateValue.computeCandidateRisks and its cache take a peak value, derived as follows:
   - Unlocked: `threshold - context.initialThreshold`. This is exact for EOD trailing, where threshold = peak EOD balance - amount.
   - Locked: `lock.atProfit`.
6. Eligibility guard (isFundedDpEligible false, and buildFundedSolveContext throws the same message). A PeakDayClose basis requires:
   - an EodTrailing funded drawdown with a lock whose atProfit is non-null;
   - every tier minBalance <= min(lock.atProfit, lockedThreshold(start) - start + defaultRetainedCushion()).
   Select meets this (2100 / 2100 >= 2000), so it stays eligible and exact.
7. Notes: rewrite Tradeify entries 128 and 132.

Docs to update once fixed: in select-flex.md:46 and select-daily.md:60, change 'Matches this repo's engine (SELECT_CONTRACT_LIMITS, a Tiered contract limit)' to say the tiered limit is on TierBasis.PeakDayClose and retained once reached.
- **Files:** src/lib/prop-calculator/core/ContractLimits.ts, src/lib/prop-calculator/core/PositionSizing.ts, src/lib/prop-calculator/simulator/day.ts, src/lib/prop-calculator/core/FundedStateValue.ts, src/lib/prop-calculator/firms/tradeify/Tradeify.ts, src/lib/prop-calculator/firms/lucid/LucidTrading.ts, src/lib/prop-calculator/firms/topstep/TopStep.ts, src/lib/prop-calculator/firms/ftmo-futures/FtmoFutures.ts, src/lib/prop-calculator/firms/e8futures/E8Futures.ts, src/lib/prop-calculator/firms/apex/ApexTraderFunding.ts, src/lib/prop-calculator/firms/alphafutures/AlphaFutures.ts, tests/unit/lib/prop-calculator/core/ContractLimits.test.ts, tests/unit/lib/prop-calculator/core/PositionSizing.test.ts, tests/unit/lib/prop-calculator/core/FundedStateValue.test.ts, tests/unit/lib/prop-calculator/core/FundedPayoutCycle.test.ts, tests/unit/lib/prop-calculator/FtmoFutures.test.ts, tests/unit/lib/prop-calculator/tradeify.test.ts, .claude/prop-firms/tradeify/select-flex.md, .claude/prop-firms/tradeify/select-daily.md
- **Tests first:**
  - tradeify.test.ts: both Select plans use basis PeakDayClose. maxContractsAt(fundedMinis, 1200, 1200, 2100) === 4 (today 2). maxContractsAt(fundedMicros, 1200, 1200, 1600) === 30. maxContractsAt(fundedMinis, 2500, 2500, 1400) === 2, because the upgrade waits for the close.
  - Same file: resolveContractLimit(limits, Funded, false, 1200, 1200, 2100) === 4.
  - ContractLimits.test.ts:57-101: rewrite the cases as SessionOpen with the same expected numbers, for example FROZEN (2000, 0) gives 2. Add PeakDayClose cases: (0, 0, 2000) gives 5 and (5000, 1999, 1999) gives 2.
  - FundedStateValue.test.ts: isFundedDpEligible(selectFlex) is true. A toy plan with a PeakDayClose limit on an IntradayTrailingDrawdown is ineligible, and computeFundedStateValue throws the guard message.
  - Mechanical: switch isEffectiveNextSession to basis in FtmoFutures.test.ts:291-292, PositionSizing.test.ts:47, FundedPayoutCycle.test.ts:984 and FundedStateValue.test.ts:176-183.
- **Depends on:** R1-43, R1-11, R1-6
- **Risks:** The DP's peak derivation is exact only under the guard's conditions, and it must throw rather than approximate outside them. The primary Tradeify source returned 403, so confirm the 'retaining the higher tier' wording live before shipping. The mechanical rename is wide and will conflict with concurrent ContractLimits edits.


### R1-51
- **Root cause:** src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts:163-169: buildProPlan uses one EodTrailingDrawdown with lock.atProfit = maxDrawdown + 100.
- DrawdownStrategy.maybeLock (core/DrawdownStrategy.ts:62-69) freezes the funded floor at $50,100 on the first EOD close at or above $52,100, with no payout.
- The 14-day gate (:186) makes this the normal path.
- There is no mechanism for a payout-only trigger. With a trailing pre-payout floor, LockAtPlanFloor's max(threshold, lockedThreshold) (FundedPayoutCycle.ts:63-73) and forceLock (DrawdownStrategy.ts:47-54) would measure the $2,100 buffer from the trailing floor and never move the MLL down.

Docs:
- pro.md:49: "Trigger: After first payout. Locked value: Starting balance + $100 ($50,100 static)"
- pro.md:63: "After first payout, MLL moves to $50,100 and remains static"
- pro.md:83: Buffer $2,100, payout "subject to your live equity above the required buffer"
- pro.md:137: pre-lock trailing Not Confirmed
- **Design:** Model the confirmed trigger and locked value, and keep the EOD-trailing pre-lock assumption, disclosed as such.

1. DrawdownStrategy.ts: `DrawdownLockConfig.atProfit: Dollars | null`. null means there is no profit trigger, and maybeLock returns early.
2. PayoutFloorEffect.ts: add `MoveToPlanFloor = 'move-to-plan-floor'`.
3. Plan.ts: add `payoutReferenceThreshold(state)`, an exhaustive switch:
   - LockAtPlanFloor: while unlocked, max(threshold, lockedThreshold(start)). This moves the existing FundedPayoutCycle logic here.
   - MoveToPlanFloor: while unlocked, lockedThreshold(start).
   - None/ReleaseFloor: threshold.
4. Plan.ts, new constructor validation:
   - MoveToPlanFloor requires a fundedDrawdown lock.
   - A funded lock with null atProfit requires LockAtPlanFloor or MoveToPlanFloor.
   - An eval drawdown lock with null atProfit throws for non-instant plans.
5. FundedPayoutCycle.ts:
   - withdrawableNow uses plan.payoutReferenceThreshold.
   - The tryPayout switch handles MoveToPlanFloor with `plan.fundedDrawdown.release(state, lock.lockedThreshold(state.startingBalance))`, which sets the threshold exactly and locks it.
6. LivePlan.ts: add the same MoveToPlanFloor case to floorAfterWithdrawal and withdraw, with lock validation.
7. Readers of atProfit:
   - FundedStateValue.ts:357-359: impliedOffsetMultiple treats null as 0, so the default 3x cap bounds the grid.
   - LadderSearch.ts:253: null gives Infinity.
   - plans CLI prints 'locks on first payout at +$100'.
8. MyFundedFutures.ts buildProPlan:
   - Keep `drawdown` as is (the eval lock is undocumented; see open_questions).
   - Add `fundedDrawdown: new EodTrailingDrawdown({ amount: size.maxDrawdown, lock: { atProfit: null, lockedThreshold: lockThresholdAt(LOCK_OFFSET) } })`.
   - Add `payoutFloorEffect: PayoutFloorEffect.MoveToPlanFloor`.
9. Notes: rewrite the 'Every MFF plan's drawdown lock...' entry. Pro now locks on the first payout, and its pre-payout trailing is an unconfirmed assumption. Rapid, Rapid EOD and Builder keep their documented profit triggers (rapid.md:41, rapid-eod.md:43, builder.md:37).

Docs to update once fixed:
- pro.md: add an engine cross-check note.
- Remove the stale pro.md:38 'Engine cross-check flag' (the engine already has evalMicros 30).
- mffu/README.md:222.
- **Files:** src/lib/prop-calculator/core/DrawdownStrategy.ts, src/lib/prop-calculator/core/PayoutFloorEffect.ts, src/lib/prop-calculator/core/Plan.ts, src/lib/prop-calculator/core/FundedPayoutCycle.ts, src/lib/prop-calculator/core/LivePlan.ts, src/lib/prop-calculator/core/FundedStateValue.ts, src/lib/prop-calculator/core/LadderSearch.ts, src/cli/commands/prop/plans/command.ts, src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts, tests/unit/lib/prop-calculator/mffuPro.test.ts, tests/unit/lib/prop-calculator/core/PayoutFloorEffect.test.ts, tests/unit/lib/prop-calculator/core/DrawdownTransitions.test.ts, tests/unit/lib/prop-calculator/core/Plan.test.ts, .claude/prop-firms/mffu/pro.md, .claude/prop-firms/mffu/README.md
- **Tests first:**
  - mffuPro.test.ts: fundedDrawdown.lock.atProfit === null, lockedThreshold(50000) === 50100 and payoutFloorEffect === MoveToPlanFloor. drawdown.lock.atProfit === 2100 (eval unchanged).
  - Same file: after beginFundedPhase, balance 52100 with onDayClose gives threshold 50100 and stays unlocked (today it locks). Balance 54500 with onDayClose gives threshold 52500 (today it stays at 50100).
  - Same file, payout. Setup: balance 54000, threshold 52500, unlocked, qualifyingDays 14, fresh tracker, minRetainedCushion 2000. Expect debited 1900 and traderReceives 1520. Afterwards: balance 52100, threshold 50100 (moved down) and thresholdLocked true.
  - core/PayoutFloorEffect.test.ts: when the trailing threshold is above lockedThreshold, LockAtPlanFloor keeps the higher threshold (preserved behavior) and MoveToPlanFloor lowers it.
  - core/Plan.test.ts: three constructor cases throw. MoveToPlanFloor without a lock; a funded lock with null atProfit and effect None; an eval lock with null atProfit on a non-instant plan.
  - core/DrawdownTransitions.test.ts: an EodTrailingDrawdown with a null-atProfit lock never locks on onDayClose.
- **Depends on:** R1-9, R1-48
- **Risks:** This is disputed: pro.md marks pre-lock trailing as Not Confirmed. With a static pre-lock MLL the engine would be pessimistic rather than accurate, and the note must say so. The DP clamps pre-lock offsets beyond 3x the drawdown ($6,000), which is slightly optimistic for rare paths. Pro's funded survival and monthly net drop, which is the intended correction.


### R1-40
- **Root cause:** src/lib/prop-calculator/firms/fundednext/FundedNext.ts:296: buildLegacyPlan sets minPayoutProfit to dollars(500), the same as minPayoutProfitPerCycle. FundedPayoutCycle.ts:113-116 applies it when payoutsIssued === 0.

Doc legacy.md:79: "For any withdrawal after the first, the source states a separate gate: 'At least $500 profit is required after your last withdrawal before requesting another.'" legacy.md:96 flags the engine disagreement.

Reviewer C shows the gate is never binding in engine paths, because the retained cushion is at least $2,000. So the wrong parts are the rule semantics and the CLI's 'first $500', not the simulated numbers.
- **Design:** Remove minPayoutProfit from buildLegacyPlan, so it defaults to $0. The first payout is then gated by 5 benchmark days of $200 or more (minDaysAfterPassForPayout 5 and minQualifyingDayProfit 200) plus the $250 minPayoutRequest. minPayoutProfitPerCycle stays at $500 for every later payout.

Notes: in the LockAtPlanFloor entry, change the Legacy clause '(5 benchmark days / $500 cycle profit for Legacy, ...)' to '5 benchmark days of $200+ for Legacy (its $500 gate applies only after the first withdrawal)'. Keep 'LockAtPlanFloor' in the entry.

Docs to update once fixed:
- legacy.md:96 (resolved).
- Flag the stale legacy.md:98: the engine does model the hard breach via fullWithdrawalHardBreach.
- **Files:** src/lib/prop-calculator/firms/fundednext/FundedNext.ts, tests/unit/lib/prop-calculator/fundedNext.test.ts, .claude/prop-firms/fundednext/legacy.md
- **Tests first:**
  - fundedNext.test.ts: Legacy has minPayoutProfit === 0 and minPayoutProfitPerCycle === 500.
  - Same file, first payout. Setup: balance = start + 400, threshold = start - 2000 (unlocked), qualifyingDays 31, tracker.lastPayoutBalance = start, minRetainedCushion 0, payoutRequestSize 300. Expect debited 300, traderReceives 240 and causesHardBreach false. Today the result is null, because 400 < 500.
  - Same file: with payoutsIssued = 1 and the same 400 cycle profit, the result is still null.
- **Depends on:** none
- **Risks:** No simulated output changes: under Reviewer C's bound the cushion is always at least $2,000. The report must call this a semantic and display fix, not a numeric one.


### R1-49
- **Root cause:** src/lib/prop-calculator/firms/mffu/MffuRapidLive.ts:21-35 never sets requiresLockForWithdrawal, so it takes the LivePlan.ts:87 default of true. LivePlan.withdrawableAmount (LivePlan.ts:188-197) then returns 0 until the EOD threshold locks at $2,000 of profit.

Docs:
- rapid-live.md:113: "There is no buffer requirement on the Rapid Live account. ... no balance threshold gates a payout request."
- rapid-live.md:25: Daily.
- rapid-live.md:22: "Max Loss threshold stops at $0".
- **Design:** MffuRapidLive.ts: add `requiresLockForWithdrawal: false` and `payoutFloor: dollars(0)`, following the AlphaFuturesLive pattern. With the $0 floor, only balance above the $0 start can be withdrawn. Setting only the flag would drain to the negative pre-lock threshold, which both reviewers flagged. payoutFloorEffect stays None, so the LivePlan guard passes.

Notes: extend the MFF 'Rapid Live (modeled in MffuRapidLive.ts...' entry to say withdrawals are daily with no buffer, quoting rapid-live.md: "There is no buffer requirement on the Rapid Live account". Say it is modeled as requiresLockForWithdrawal false with a $0 payoutFloor.

There is no doc mismatch note to update.
- **Files:** src/lib/prop-calculator/firms/mffu/MffuRapidLive.ts, src/lib/prop-calculator/firms/mffu/MyFundedFutures.ts, tests/unit/lib/prop-calculator/firms/mffu/MffuRapidLive.test.ts
- **Tests first:**
  - MffuRapidLive.test.ts: requiresLockForWithdrawal === false and payoutFloor === 0.
  - Same file: with balance 800 and threshold -1200 (unlocked), withdrawableAmount === 800 (today 0). After withdraw(800), balance is 0 and isBust is false.
  - Same file: the initial state (balance 0, threshold -2000) gives withdrawableAmount 0, not 2000.
- **Depends on:** R1-48, R1-18
- **Risks:** Withdrawing before the lock can leave the balance near $0 while the threshold still trails below it. The doc allows this (no buffer). Under a withdraw-everything policy, bust probability rises; the D4 default cushion mitigates that.


### R1-53
- **Root cause:** src/lib/prop-calculator/firms/tpt/TptLive.ts:22-33: the Development plan sets one Flat contractLimit of 2. LivePlanInit.contractLimit (core/LivePlan.ts:21) is a single config, and simulator/livePhase.ts:75-86 applies it to whatever instrument is selected, so MNQ is capped at 2 contracts. The same cause over-restricts the Apex, Lucid and AlphaFutures live plans on micros.

Docs:
- tpt/pro-plus-live.md:68: "Max Contracts (Mini / Micro) ... $50,000 ... 2 / 20"
- apex/live.md:44: "10 mini / 100 micro"
- alphafutures/live.md: "2 mini / 20 micro | 4 mini / 40 micro"
- lucid/live.md:41-43: 2/20, 3/30, 4/40
- **Design:** 1. LivePlan.ts:
   - Add `export interface LiveContractLimits { readonly micros: ContractLimitConfig; readonly minis: ContractLimitConfig }`.
   - Replace the init field `contractLimit` with `contractLimits?: LiveContractLimits`, and the class field with `readonly contractLimits: LiveContractLimits | null`.
   - Add `contractLimitFor(isMicro: boolean): ContractLimitConfig | null`.
   - Validate non-empty tiers for both configs, with the message `${label}: contractLimits.${key}.tiers must not be empty`.
   - Export LiveContractLimits from core/index.ts.
2. livePhase.ts:75: `maxContractsAt(positionSizing === null ? null : plan.contractLimitFor(positionSizing.instrument.isMicro), state.balance)`.
3. Migrate the live plans:
   - TPT Development: minis Flat 2, micros Flat 20.
   - ApexLive: minis 10, micros 100.
   - LucidLive: minis 2/3/4, micros 20/30/40, at the same thresholds.
   - AlphaFuturesLive: minis 2/4, micros 20/40.
4. Notes: TakeProfitTrader.ts entry 46 changes 'a flat 2-mini contract cap' to 'a flat 2 mini / 20 micro contract cap'.

Docs to update once fixed: tpt/pro-plus-live.md:80. Its 'Not modeled by the engine at all' is stale; the builder exists with 2/20, a $1,250 drawdown and a $1,000 soft DLL.
- **Files:** src/lib/prop-calculator/core/LivePlan.ts, src/lib/prop-calculator/core/index.ts, src/lib/prop-calculator/simulator/livePhase.ts, src/lib/prop-calculator/firms/tpt/TptLive.ts, src/lib/prop-calculator/firms/tpt/TakeProfitTrader.ts, src/lib/prop-calculator/firms/apex/ApexLive.ts, src/lib/prop-calculator/firms/lucid/LucidLive.ts, src/lib/prop-calculator/firms/alphafutures/AlphaFuturesLive.ts, tests/unit/lib/prop-calculator/firms/tpt/TptLive.test.ts, tests/unit/lib/prop-calculator/core/LivePlan.test.ts, tests/unit/lib/prop-calculator/simulator/livePhase.test.ts, tests/unit/lib/prop-calculator/firms/mffu/MffuRapidLive.test.ts, tests/unit/lib/prop-calculator/firms/topstep/TopStepLive.test.ts, tests/unit/lib/prop-calculator/firms/fundednext/FundedNextLive.test.ts, tests/unit/lib/prop-calculator/firms/tradeify/TradeifyLive.test.ts, .claude/prop-firms/tpt/pro-plus-live.md
- **Tests first:**
  - TptLive.test.ts: for Development, contractLimitFor(false) is Flat 2 and contractLimitFor(true) is Flat 20. Standard PRO+ has contractLimits === null (renamed from the line-39 assertion).
  - livePhase.test.ts: run runLiveDay on Development with MNQ and stopPoints 20, a cushion large enough for an intended risk of 800, and winrate 0. The first-trade |pnl| should be 800 (today 80).
  - LivePlan.test.ts:111-122: the empty-tiers message becomes 'Test Live: contractLimits.minis.tiers must not be empty', plus a micros variant.
  - LivePlan.test.ts: ApexLive contractLimitFor(true) is Flat 100, and AlphaFuturesLive micros at balance 2000 give 40.
  - Mechanical: rename contractLimit to contractLimits in MffuRapidLive.test.ts:39, TopStepLive.test.ts:104, FundedNextLive.test.ts:62 and TradeifyLive.test.ts:39.
- **Depends on:** R1-18, R1-19, R1-48
- **Risks:** The Development plan itself cannot be reached from the CLI. The shared fix does change the reachable Apex, Lucid and AlphaFutures live results for micro instruments, which were understated 10x before. Lucid live uses a tiered article that the doc tree marks as superseded; that is separate and listed in open_questions.


**Open questions**
- CLAUDE.md requires every firm or plan data change to be checked against the firm's live help center, while this task treats .claude/prop-firms as the verified truth. Should the implementer re-fetch primary sources before shipping R1-31, R1-32, R1-33, R1-36, R1-37, R1-41, R1-42, R1-49, R1-50, R1-51 and R1-54? Several of those sources returned HTTP 403 recently (E8, Tradeify).
- FundedNext Rapid (R1-41/R1-42): the plan's own article presents $149.99 as 50% off an 'Original Price' of $299.98. Is $149.99 right as the base fee, as the doc tree resolved? Or should Rapid use a list price with the discount applied through --eval-discount? At $149.99, the note's 'RAPID (~43-46% off)' coupon invites double-discounting.
- New finding outside the audit, not fixed: Alpha Futures caps each request at '50% of the profit in your account', but the engine uses payoutProfitShare 0.5, which caps at CYCLE profit. Tradeify note 129 fixed the same bug class for Select Flex. Should this become its own item (payoutBalanceShareCap 0.5)?
- New finding outside the audit, not fixed: E8 Zero's contract limits are margin-based per zero.md:51 ($20k/$30k/$50k margin). By R1-36's logic, micros should be 20/30/50, but the engine applies the mini counts to micros. Should R1-36's fix be extended to E8 Zero?
- MFFU Pro evaluation drawdown (R1-51): pro.md documents no Evaluation-stage lock, yet the eval drawdown locks at +$2,100. The design leaves it unchanged. Should the eval lock be removed, as E8 Zero's Challenge stage was?
- MFFU Pro before the first payout: pro.md:137 marks the MLL behavior (trailing vs static) as Not Confirmed. The design keeps EOD trailing and discloses it. If the real MLL is static before the first payout, the error flips direction. Confirm this choice is acceptable.
- Lucid live contract limits: lucid/live.md:21 resolves them as flat per tier (4/40 at 50K) and marks the tiered scaling article superseded. The engine's LucidLive still uses the tiered 2/3/4. Should that be a separate data fix?
- MFFU Rapid Live: rapid-live.md:41 says the account must close 'at or above $0', but DrawdownStrategy.isBreached uses <=, so a $0 close counts as a bust. Should that boundary be fixed in the R1-48/D4 cluster?