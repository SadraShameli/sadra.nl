# Engine Results Ledger

Large `bun run cli prop ...` sweeps are expensive (the 2026-09-22 sweep was about 5.6 billion simulated eval attempts and funded accounts, roughly 75 minutes on all 14 cores). Every one gets recorded here as markdown, so a question the engine already answered is looked up instead of recomputed.

Everything recorded is **engine output, per RULE #0**: produced only by the real CLI (fanned out with `xargs`) and read back from what the CLI printed. Nothing here comes from a script that imports `~/lib/prop-calculator`.

## Runs

| Run file | Date | Engine commit | Question | Status |
|---|---|---|---|---|
| [`engine-results/2026-09-22-full-sweep.md`](engine-results/2026-09-22-full-sweep.md) | 2026-09-22 | `4e398aa` | best firms and plans for his rules; per-plan eval ladders; funded sizing; sensitivities (contract caps, intraday path-walk, commission, payout size, live-trigger caps, idle days, win rate); DP; full doc-tree read; adversarial verification | current as of 2026-09-22 |

## How to use a run file

1. **Find the row** for the plan, objective and inputs you need. Every table states its horizon, seeds, trials and policy set.
2. **Check it is not stale** before citing it. A run is only valid for the engine and firm data it was computed on, and both live in git:
   ```
   git log --oneline <engine_commit>..HEAD -- src/lib/prop-calculator src/cli/commands/prop
   git status --short -- src/lib/prop-calculator src/cli/commands/prop
   ```
   Any commit that touches `src/lib/prop-calculator/firms/<firm>/` makes that firm's rows stale; any commit that changes simulation behavior, CLI defaults (`src/cli/commands/prop/shared.ts`) or a printed metric makes the whole run stale. Say which rows are stale when citing them, and re-run only those.
3. **Hold the objective fixed.** Read the metric definitions below before comparing two numbers; mixing `monthly net` with `lifetime net` or with `per-cycle net` is the mistake this ledger exists to prevent (SKILL.md mistake 15).
4. **Re-running**: each run file lists the exact CLI command template and plan list for every stage. Fan the jobs out with `xargs -L1 -P<cores>` over one-job-per-line lists, run the eval ladder stage first (the funded stages read each plan's fastest ladder from it), and use a fresh output directory per run.
5. **Recording a new run**: add a new `engine-results/<date>-<name>.md` with the same sections (inputs, stages with command templates, result tables, adjustments, verification, artifacts), then add a row to the Runs table above. Never edit an old run's numbers; if a later run supersedes one, say so in its Status cell.

## Metric definitions (shared by every run)

| Metric | Engine source | Meaning | Valid for ranking plans against each other? |
|---|---|---|---|
| **monthly net** | `expectedMonthlyNet` = `expectedNet x 21 / expectedDaysPerTrial` (`simulator/engine.ts`); printed by `optimize funded` (`--sort monthly`) and `optimize dp` | steady-state net cash per month for ONE account slot, refilled instantly after every failed eval, funded bust or horizon end | **Yes.** Caveats: assumes instant, unlimited repurchase (no purchase caps, activation or review delay, payout lag); throws away whatever balance a still-alive account holds at the horizon, so it undercounts slow-busting policies at short horizons |
| lifetime net | `lifetimeExpectedNet` = `(expectedNet - pBust x feesUntilPass) / (1 - pBust)` (`core/LifetimeExtraction.ts`) | "repeat until one funded account survives the horizon" | **No.** No time cost, so it diverges as pBust approaches 1 (Tradeify Lightning flat $300 scores $1.53M); it renews only after a funded bust, never after a failed eval; the `- pBust x fee` term charges each renewal's fee twice, because each cycle's `expectedNet` already contains it. This conflicts with SKILL.md Hard Rule 8, which names lifetime net as the funded objective; flagged for Sadra to reconcile |
| per-cycle net | `expectedNet` | net of one attempt: eval fees plus funded payouts inside the horizon | only for one bounded run; never across plans with different attempt lengths |
| bust when funded | `counts['bust-funded'] / trials` | UNCONDITIONAL share of all attempts, so it can never exceed the eval pass rate | read as "share of all attempts", not "share of funded accounts" |
| survivors | `passProbability x trials` | attempts that passed the eval AND finished the funded horizon unbusted | small counts mean a noisy row |
| pass / days / $ per funded | `prop ladder` | eval pass probability, expected days to funded, eval spend per funded account | eval phase only |
