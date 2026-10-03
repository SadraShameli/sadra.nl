---
name: prop-firm-trading
description: Sadra's futures prop-firm trading context: his tested edge, his hard rules, position sizing math, payout policy, per-firm rule tables, and a log of mistakes not to repeat. Use this skill whenever Sadra asks about prop firms (Apex, MyFundedFutures/MFF, Take Profit Trader/TPT, Tradeify, FundedNext, Lucid, Topstep, FTMO Futures, AlphaFutures, E8 Futures), evaluations, funded/PA/sim-funded accounts, live account transitions, drawdown mechanics, payout sizing, risk per trade, position sizing, expected value of an account, which firm or account type to buy, or anything involving NQ/ES futures trading with a prop firm, including the prop-calculator tools in this repo (hub and child pages, the signed-in accounts manager, per-account sizing advice, value views, next slot, rounds and bankroll) and the `bun run cli prop advise` command. Trigger it even when he doesn't name a firm; questions about "how much should I risk", "how much should I take as payout", "is this account worth it", or "should I scale up" all belong here.
---

# Prop Firm Trading — Sadra

## RULE #0 — ENGINE CLI ONLY. NEVER A CUSTOM SCRIPT.

**All prop-firm analysis goes through this repo's own CLI (`bun run cli prop ...` in `sadra.nl`), never a one-off script that imports `~/lib/prop-calculator` internals directly and reimplements or re-wires sweep/scoring logic by hand.**

- **Why:** a custom script is untested and unreviewed, unlike the CLI commands, which are part of the actual, exercised product. Ad hoc glue code is exactly the kind of place silent, unverified assumptions creep in — wrong parameter defaults, a subtly different metric definition, a wrong grid bound — the same class of mistake this project has spent real engineering time hunting down *inside* the engine itself. This was a direct, explicit correction from Sadra after a custom script was written mid-session to sweep every plan instead of driving the real CLI commands.
- **The real commands, current as of this writing:** `cli prop plans` (inspect a plan's validated rules: check `consistency eval`/`funded` here before reaching for the DP, see below; tags a call-up-only plan, e.g. TopStep's Pro Account or LucidMaxx, with `[call-up only]`), `cli prop compare` (rank many plans on one fixed policy; `--sort cost` ranks by cost per funded account, `--sort pass` by eval pass, `--sort net` (the default) by monthly net, `--sort spend` by expected spend per trial, `--sort days` by median days to pass the eval; drops call-up-only plans from the ranking unless `--include-callup`), `cli prop ladder` (grid-search the eval-phase rung ladder for one plan, `--firm`/`--variant`), `cli prop sim` (one plan, one policy, full detail), `cli prop optimize funded` (sweep flat-$, percent-of-cushion (only with `--stop-points`: percent risk is placed in whole contracts since T33, and without a stop the default percent candidates are left out with a note, while an explicit `--percent` without `--stop-points` is refused), and, with `--funded-ladder` (comma-separated), a funded-phase ladder too, for one plan; `--sort monthly` (default) for steady-state net cash per month per account slot, the only sort key valid for ranking plans against each other, `--sort cycle` for "how much do I expect from ONE bounded run"; the `lifetime` sort and its "lifetime net" column were removed from the engine, see `references/engine-results.md` for why), `cli prop optimize dp` (solve the average-reward eval+funded value-iteration DP for one plan, a state-dependent risk *function* rather than a fixed ladder, that maximizes expected net cash per month per account slot with replacement priced in via `--rebuy-lag-days`; see the performance caveat below before reaching for this on a consistency-tracking plan), `cli prop live` (live-account variants; needs `--stop-points` (with `--instrument`, default NQ): live risk is a percent of the drawdown cushion placed in whole contracts, at least one contract and at most the live contract limit, and without a stop it exits 1 and says why (audit N-76); keeps one full drawdown of retained cushion by default, `--request-size all` drains to the floor instead; reports capital returned and liquidation payouts as their own lines, always marked "not annualized"). `sim`, `compare` and both `optimize` commands also take `--early-withdrawal` and `--funded-reset`, two opt-ins that default off; see "ENGINE SEMANTICS" below before using either. `cli prop advise` gives sizing advice for one account from a snapshot, and `cli prop bankroll` (subcommands `batch`, `compare`, `levers`, `project`, `risk`) prices a budget of attempts; both are described under "THE PROP TOOLS" below. `sim`, `optimize funded` and `optimize dp` also take `--live-transfer-hazard` (an assumption you set, never a firm rule; `optimize dp` only prints that it does not model it, and the eval-only `ladder` rejects it as a funded-phase input).
- **For a many-plan sweep**, fan out multiple real CLI invocations as separate OS processes (e.g. `xargs -P <core count>` over `--firm`/`--variant` pairs from `cli prop plans --variants`), and read their real printed output. That is legitimate orchestration, not a custom script — the distinction is whether you're re-deriving scores/formulas yourself (forbidden) or just running the real tool many times and reading what it prints (fine).
- **If the CLI genuinely can't answer a question yet** (no command exposes some real engine capability), that's a signal to add a real, permanent flag or subcommand to the CLI itself — matching how `--sort cycle`, `--funded-ladder`, and `optimize dp` were all added this way — not to work around the gap with a private script.
- **Check the engine results ledger before running any sweep.** `references/engine-results.md` indexes every large CLI sweep, one markdown file per run under `references/engine-results/` (inputs, objective, seeds, trials, exact commands, every variant's results, sensitivities, verification, engine commit). If a non-stale row already answers the question (staleness check is in the index), cite it instead of recomputing. After any new large sweep, add a run file and an index row.

## ENGINE SEMANTICS AFTER THE PROP-ENGINE AUDIT (landed 2026-09-25, `.claude/plans/prop-engine-audit-2026-09-23/PLAN.md`)

45 confirmed findings plus 8 test gaps were fixed across the eval simulator, the funded and eval DPs, the ladder search and every firm file. What follows is what the CLI actually computes today, checked against the current code, not against memory of an earlier design. Read this before citing any cost, pass-rate or DP number.

- **Cost per funded account is the full expected spend (D1).** One shared formula, `replacementEconomics` in `core/Replacement.ts`: the initial eval fee (any bundle discount applied), plus `(1/p − 1)` retries, where `p` is the per-attempt eval pass rate (`reachedFundedCount / attemptsSum`, not the same figure as the printed "eval pass" percentage below, see D2), each retry priced at whichever of reset or re-buy is cheaper for that plan and discount combination (T9), the subscription months actually billed over that renewal chain, and activation paid once on the pass. `simulator/engine.ts` (`sim`, `compare`), `core/LadderSearch.ts` (`ladder`) and `optimize dp`'s `RenewalCycleObjective.ts` all call the same retry-fee/retry-path primitives (`RetryKind`, `retryPath`, `retryFee`), so a plan's reset-vs-re-buy economics never diverge between commands. A funded-reset plan (T31 below) adds its own reset fees on top, divided by the accounts that actually passed the eval.
- **A re-buy is a new account, a reset is not (T10, amended by Sadra on 2026-09-24).** A re-buy's first subscription month is inside the re-buy price and billing restarts with the new account (`FeeSchedule.rebuyFee`); a reset keeps continuous monthly billing across attempts on the same account. Some plans have no reset option at all (MFF Builder, Apex EOD/Intraday) and are pinned to `RetryKind.Rebuy`.
- **A timed-out eval attempt is retried exactly like a bust (T29).** `runEvalWithRetries` (`simulator/evalPhase.ts`) charges the retry fee and starts a new attempt on both a bust and a day-cap timeout; only the trial's final label (`bust-eval` vs `timeout-eval`) differs, and only once `maxAttempts` is used up.
- **Eval pass and funded survive are always shown as two separate numbers (D2), never blended.** `evalPassProbability` is the share of trials (one trial can hold several eval attempts under `--max-attempts`) that reached the funded phase at all, whether or not it later busted; `fundedSurvivalProbability` is the share that reached the funded phase AND finished the horizon unbusted. `compare --sort pass` sorts by eval pass. Both figures print on `sim`, `compare`, `ladder`, `optimize dp` and the web.
- **Call-up-only plans are a first-class, tagged plan attribute (D3).** `Plan.availability` (`core/PlanAvailability.ts`) marks a plan that cannot be bought directly, such as TopStep's Pro Account or LucidMaxx. `prop plans` tags it `[call-up only]`; only `compare` drops it from the ranking unless `--include-callup` is passed. Neither `optimize funded` nor `optimize dp` ranks plans or takes `--include-callup`; each resolves a single plan (`planResolver.resolveOne`).
- **`compare --sort cost` ranks by cost per funded account (T6).** It is a different sort key from `--sort spend` (expected spend per trial, `expectedTotalCost`); the two answer different questions and are never the same column.
- **`prop live` keeps a retained cushion by default (D4).** With no `--request-size`, the retained cushion defaults to one full funded drawdown (`Plan.defaultRetainedCushion` in `core/Plan.ts`); only `--request-size all` drains down to one cent above the breach floor. Capital returned (a withdrawn seed or Reserve) and a liquidation payout are their own reported lines, always labelled "not annualized", and are never folded into the expected annual withdrawal rate (`liveSummaryRows` in `cli/commands/prop/live/command.ts`).
- **Two opt-ins exist, both off by default, on `sim`, `compare`, `optimize funded` and `optimize dp`** (the eval-only `ladder` command rejects both flags with an error, `--<flag> is not supported by prop ladder`, since they are both funded-phase mechanics):
  - `--early-withdrawal` (T30): models MFF Pro's one-time withdrawal of up to 60% of profit (minimum $1,000) taken before the buffer clears. Counts as the first payout, so the MLL locks at start + $100.
  - `--funded-reset` (T31): models Alpha Futures' Qualified Reset ($499 Zero / $599 Standard at 50K, at most 2 uses, only before any payout request, within 7 days of a breach). The funded DP now values this exactly, as its own pre-first-payout reset layers, not as an approximation; `optimize dp` prints the plan's own reset terms (`fundedResetModelNote`), generated from the plan data, never a hard-coded description.

**Read `optimize dp`'s empirical replay line, never its predicted rate (audit N-86 fixed 2026-09-27; residual N-89: eval half fixed 2026-10-02, funded half open).** N-86's cause was the funded DP's cushion grid top (6 drawdowns above the locked floor): TopStep resets the drawdown floor to breakeven after every payout (`PayoutFloorEffect.ReleaseFloor`), so its balances climbed past the top, where the DP clamped them. Since audit WP58c the grid runs fine to 6 drawdowns and then coarse, one drawdown per cell, to 30. Gate D11 at the default grid (2026-09-27, frozen snapshot, `--eval-days 15 --trials 20000 --funded-days 252 --rebuy-lag-days 0 --seed 42 --winrate 0.4 --rr 2`): TopStep No-fee Standard replays at $4,140 a month per slot (was $2,392) against the best flat row's $3,065 (flat $1000), 1.35x; FTMO Growth replays at $5,134 against $2,924 (flat $800), 1.76x; the gate passes. The predicted rate still overstates the replay: $5,200 against $4,140 on TopStep (20%) and $5,403 against $5,134 on FTMO (5%), while the fast grid agrees within $54 (N-89). Audit WP59 (2026-10-02) removed the eval half of that gap (the eval DP had credited partial passes by interpolating across cushion nodes): re-measured on a frozen snapshot with the same flags, the eval DP's own pass estimate now matches the simulator (47.4% against 47.7% on TopStep, 45.4% against 45.9% on FTMO), and the cushion 0.25 / action 0.05 grid on TopStep agrees within $2 ($4,476 predicted, $4,474 replayed). At the default grid the predicted rate still overstates the replay by about the same amount, all of it on the funded side (open, audit WP58e and WP60): TopStep $5,205 against $4,164 (20%), FTMO $5,404 against $5,129 (5%). Gate D11 still passes on the replays: 1.36x the best flat row on TopStep and 1.75x on FTMO. The DP policy also busts far more funded accounts than the flat rows (92.2% on TopStep and 83.0% on FTMO at gate D11, 92.0% and 83.2% after WP59, against 37.8% and 39.1% flat): its edge is a monthly average across many replacement accounts, and Hard Rule 5 keeps funded risk at the documented fixed amount regardless. So use `optimize dp` only as the engine optimum beside the documented rule, and treat any row whose replay trails the best `optimize funded` flat row as a model mismatch, not an edge. Only No-fee Standard was measured among the four TopStep XFA paths, and the Pro Account (modeled without the floor reset) is unvalidated.

**Every funded-DP value and ADOPT/KEEP verdict measured before 2026-09-25 is stale, including the tables further down this document and the average-reward DP validation run in `references/engine-results.md`.** Two real defects in `FundedStateValue.ts`, the module the funded DP shares with `optimize dp`, were found and fixed after those numbers were measured: N-65 (the carried best-day state was floor-rounded and optimistic, which could trap the policy on the wrong action) and N-66 (the old stopping rule could halt up to about $165 short of the converged value at a 252-day horizon). The numbers below are kept, not deleted or replaced with a guess, because no rerun on the fixed solver exists yet. Treat every funded-DP number and ADOPT/KEEP verdict in this document as directional only until it is re-measured.

**The eval-only DP (`EvalStateValue.ts`) is a different module: N-65/N-66 do not apply to it, but its own numbers (Part L1 and the "Full-DP eval sweep" below) are stale too, for unrelated reasons.** The audit fixed a real defect inside `EvalStateValue.ts` itself (N-9, no risk cap at the remaining DLL headroom, fixed wave 8) and moved the eval DP onto an intraday-reach tier basis (WP22a, wave 15), and the static-ladder baseline those verdicts compare against also changed underneath them (WP15, wave 6: trade-granular drawdown via `TradingDayLedger`, contract limits, D1 cost). Treat every eval-DP table below as directional only until it is re-measured on the current engine, same as the funded-DP tables.

## THE PROP TOOLS (built 2026-09-25 to 2026-10-02; tracker `.claude/plans/prop-tools-2026-09-25/PLAN.md` and `packages.md`)

**Evidence basis.** Everything below comes from the tracker's recorded status rows, the recorded research files in that folder, and reading the code on 2026-10-02. The web pages were not driven in a browser (the project forbids it), so a web statement means "the code does this", not "seen on screen". The `bun run cli prop advise` examples in this section were executed once on 2026-10-02 and ran without error at small trial counts; their figures are not cited.

**Status, never to be cited as done.** The packages are recorded as implemented or done with their reviews; the tracker's final per-item verification is running (PT50-a and PT50-b) and the repo-wide `bun run check` is still todo. Pending today: WP60 (funded replay builds its policy from the exact day-start cushion, running), WP66a (DP speed part A, running), WP66b (DP speed part B, todo after WP60), PT-36s (one CLI wording for a priced trigger, running), PT-30a to PT-30d (DP advice: no `--dp` or `--store` flag on `prop advise` and no DP row in the advice panel yet), the DP figure reruns, and the close-out fixes (CLOSE-1 verified 13 items and sent four back as WP67a and WP67b, running; the N-86 to N-90 items wait for WP60 and WP66). Blocked: PT-35b (verified per-firm account policies, waits for the user's answers), PT-13b (MES, the CME page returns 403 to automated fetch), B-1 (account sizes other than 50K). The tables behind the accounts area come from migrations 0007 to 0012; the tracker records them as generated and not applied, and I did not check whether the user has applied them since, so confirm that before relying on the accounts area against a given database. Every open question and paste request is listed in `.claude/plans/prop-tools-2026-09-25/HANDOFF.md`.

### Hub and child pages (`/prop-calculator`)

The hub is public and lists the tools; every tool has its own page. Tools that read the shared calculator inputs (firm, plan, risk, win rate, trials) keep one state while you move between them and mirror it in the URL, so a copied link reproduces the inputs. An old `/prop-calculator?firm=...` link redirects to `/prop-calculator/simulator` with the query unchanged.

| Page | What it answers |
|---|---|
| `simulator` | Monte Carlo of one plan against its real drawdown, daily loss and consistency rules: pass odds, cost, payouts, charts, plus the value chain and funded value cards (see "Value views") |
| `analysis`, `sizing` | Strategy edge and Kelly, tail risk, drawdown duration, loss streaks, rule stress test; risk-per-trade sweep and the win rate by reward-to-risk heatmap, take-profit what-if rows |
| `compare`, `cash-flow`, `planner` | Every plan ranked by expected monthly net; rules-aware cash flow with retries, re-buys and the firm cap; the multi-firm what-if planner |
| `ladder-lab`, `strategy-lab` | Eval rung-ladder grid search; copy-traded, grouped and independent multi-account strategies side by side |
| `bankroll` | P(batch net below 0), the budget your own loss threshold needs, a reinvesting projection with bands and path ruin (CLI twin: `cli prop bankroll`) |
| `position-size` | Contracts, leftover dollars, the stop that lands a risk exactly and the minimum stop at the plan cap; NQ, MNQ and ES only (MES is blocked); $450 on 3 NQ gives 7.5 points |
| `funded-optimizer` | The CLI's funded candidates under your retained cushion and payout request (one candidate list shared with `cli prop optimize funded`) |
| `live`, `rules`, `payout-planner` | Live-stage simulation where a live plan is modeled; browse every plan's modeled rules; payout readiness, blocking gate, rule-capped withdrawable and net after the split |

Anonymous visitors get the skill's default rulebook (the numbers in "HIS NUMBERS" and "HIS HARD RULES"); only the accounts area reads a stored rulebook.

### Accounts manager (`/prop-calculator/accounts/**`, sign-in required, data in the database under your user)

Pages: Overview, Add account, Weekly review, Ledger, Import (CSV), Rulebook, Copy groups, Next slot, Edge, Rounds, Firms, plus a detail and edit page per account. Every query is scoped to your user; money is stored as integer cents.

- **Account:** firm, plan (a serial plus the opt-ins the plan actually offers), size (50K only is modeled), stage (eval, funded, live), status (active, busted, closed, concluded, suspended), purchase and funded dates, label, copy group, the account it replaces, round, personal stricter limits, and the dashboard convention. Instant-funded plans cannot be created at stage eval. A firm or plan the engine does not model can be kept as a ledger-only account: it feeds spend and payout totals but never gets advice.
- **Snapshots (append only):** balance, highest end-of-day or intraday balance (or the dashboard floor), payouts taken, cumulative payout received after the split, trading days, qualifying days, cycle best day, last payout date and balance, floor at last payout, last traded date. Which fields are required depends on the plan's drawdown kind and the stage. Enter the balance in the account's dashboard convention: nominal (starts at the account size, the default) or zero-based; an impossible state such as a nominal balance below the starting floor is rejected with a hint about the convention. The form passes the live start, and create, update and import reject out-of-range input on the server (PT-49b to PT-49d).
- **Ledgers:** payouts (requested, paid, denied, cancelled; net received versus gross), fees (eval purchase, rebuy, reset, activation, subscription, funded reset, refund, other; refunds subtract from spend), lifecycle events (purchased, eval passed, funded reset, moved live, suspended, busted, closed and more; every account edit and snapshot removal writes an Edited event), sizing decisions (what was suggested versus the risk you actually took), rule violations, bankroll deposits and withdrawals.
- **Overview:** leads with spend, payouts received and realized net, then ROI, cost per funded account against the engine's `replacementEconomics`, stage funnel, realized pass rate and survival against the model, measured rebuy lag, plan cap usage, a cushion board, a payout readiness board, exposure, and projections. Statistics carry their sample size and a sample-adequacy badge; the rulebook's sample thresholds start unset, so the scale gate reads "Sample thresholds not set" until you set them.
- **Alerts** (thresholds live in the rulebook): stale snapshot, weekly review due, near the floor, payout eligible, consistency near breach, eval day cap near, lifetime payout count or dollar cap near, live trigger near, payout count or dollar mismatch against the ledger, dashboard floor mismatch, DLL or contract tier change, subscription renewal due, plan rules changed, pooled cap reached, mixed-stage copy group, round budget reached, bankroll loss risk above your threshold, and more.
- **Copy groups:** accounts are independent unless grouped (this keeps the "NOT copy-traded" assumption in "HIS NUMBERS"). A group's members must share one stage. Eval groups are sized rung by rung with each member's cumulative DLL; funded groups at the minimum flat risk; a cross-plan simulation card runs one shared trade stream over members on different plans and shows P(all bust the same day) and group payouts.
- **Rounds, bankroll, scale gate:** a round is a purchase batch with an open date, an optional close date and an optional budget; closed rounds give the measured days to 50% and 90% of the round's payouts. The scale gate says Ready, Not enough sample, Not positive after cost, or Thresholds not set, and lists which condition is unmet. The Firms page records your engagement status per firm (paused, retired) and feeds Next slot.
- **Edge page:** your journal win rate and expectancy against the rulebook's 40% and 1:2, with a drift flag. Display only: it never changes the rulebook or any advice.
- **Next slot:** ranks plans for the next purchase by expected monthly net per slot under your documented policy, with the engine payout-size optimum as a second number and a "payout-policy sensitive" mark when the two orders differ. Call-up-only plans, firms you paused or retired, firms in a verified live exclusivity or cooldown, plans with no free slot, plans you cannot afford and plans with non-positive expected value are excluded with the reason. **Today every real firm carries the unverified default account policy (no firm file overrides it, grep on 2026-10-02), and the listing rule puts any plan with an unverified cap scope or live trigger under "unverified" instead of ranking it, so expect plans to be listed with their figures but not ranked until PT-35b lands.** This is traced from `NextSlotAllocation.ts`, not run.

### Rulebook (the documented rule, as parameters)

The rulebook stores only numbers that exist in this skill: eval sizing mode (ladder by default, or max-risk), the ladder fraction source (general derivation by default), first rung 20% and escalation 1.5, rounding step $50; funded risk $250, TP $500, at most 4 trades a day, no stop rule; live cushion percent 5% before the lock and 10% after; payout request $500 and retained cushion $2,000; max one trade per window; win rate 40%, rr 2; review weekday Monday and funded staleness 7 days; alert thresholds; sample thresholds; bankroll parameters; display unit (account dollars by default, or EV at stake, or fee equivalent); the per-firm live-transfer hazard. Eval risk is deliberately not stored: Hard Rule 3 defines it as the maximum the constraints allow. A retained cushion below $2,000 needs the explicit `allowBelowHardRule2` flag. The page shows how the rulebook deviates from these defaults, and every headline relabels itself "your custom rule (differs from Hard Rule N)" once it does. Personal limits (max risk per trade, daily loss limit, daily profit cap, retained cushion) only tighten; a personal cap on max risk can make the eval rungs sum to less than the cushion (decision PD-44, still open for Sadra to overrule).

### Sizing advice: documented rule first, engine optimum beside it, the reasons they differ

The headline is always your documented rule; the engine optima sit under it, each labelled with its source, objective, start basis (fresh or from the reconstructed state), trials, seed and, where the engine provides it, a standard error. Differences are explained by typed reasons whose text is built only from the numbers of the advice itself.

| Stage | Documented rule | Engine optima shown beside it |
|---|---|---|
| Eval | Default is the "General derivation for any plan" ladder: rung 1 is 20% of the day-start cushion, each next rung 1.5x, last rung is what remains, at most 4 rungs, daily cap from the consistency rule. A $2,000 cushion gives 400/600/900/100 and $1,500 gives 300/450/650/100 (pinned in the unit tests, not run for this edit). Opt-in modes: the MFF Rapid EOD 50K search fractions (400/600/800/200 on $2,000) and the Hard Rules 3 and 4 max-risk rule (daily cap = 2 x risk) | Ladder search from a fresh start and from the current state, ranked fastest to funded (an eval-stage proxy, so the reason "ranks by speed to funded, not monthly net" appears), plus a recorded ladder from the engine-results ledger |
| Funded | Hard Rule 5: $250 risk, $500 TP, each trade capped by the cushion and cumulative DLL room, by the consistency ceiling on funded consistency plans, and by your personal caps; the contract limit is reported as a minimum stop in points, never converted to dollars | Funded sweep fresh and from state, payout-size sweep, next-payout projection (expected days to the next payout and P(bust before it)) |
| Live | 5% of cushion before the lock, 10% after, through the applicable live plan; retained cushion is the larger of the rulebook's and one full live drawdown; a live account sitting on its floor is offered the smallest placeable trade as a tool convention, not a firm rule | None. The live day policy is not documented by this skill and is approximated |

- **The default eval ladder is not the MFF-searched ladder.** Sadra's 400/600/800/200 above came from an exhaustive search on one plan; the advisor's default is the skill's general derivation extrapolated to every plan. Pick the MFF fractions explicitly (`--ladder-fractions mff-rapid-eod-search`) to get the searched ladder, and read the engine row for the plan-specific optimum.
- **Payout advice.** A request is allowed only if the balance after the request still clears the plan's post-payout floor by the retained cushion and every firm gate passes. When it is not allowed the answer is "wait: $X more profit or N qualifying days", never a smaller request. The effective request is the larger of your rulebook size and the plan minimum; when the plan minimum raises it, the advice says "firm minimum $M is above your $R". A personal request override shows a warning because payout size is non-monotonic (see "PAYOUT SIZING").
- **Engine runs follow your policy, not the CLI defaults.** Every engine optimum runs with your retained cushion, the effective request paid only in full (`PayoutRequestPolicy.FullRequestOnly`), the rebuy lag (measured when you have attempts, otherwise 0 and marked optimistic) and the lifetime payout cap at a verified count trigger (none verified yet, see below). `cli prop sim` and `cli prop optimize funded` keep the engine default (pay up to the request), so a number from one is not interchangeable with the other; the advice names this as the reason `PayoutPolicyDiffers`. The payout-size sweep can pick a request far above $500; that is a sweep result under the stated policy, and the rulebook default stays $500 until Sadra changes it.
- **Staleness.** Eval and live advice goes stale after 2 or more weekday sessions since the snapshot (weekends skipped, no holiday calendar, disclosed); funded advice after the rulebook's staleness days (default 7). Stale advice withholds the rung amounts and says to enter today's balance. Advice also goes stale when the plan's rules changed since it was computed (plan-rule fingerprint), and a suspended account is never sized.
- **Difference reasons you will see.** Caps (cushion, daily loss, consistency, profit ceiling, remaining target, personal cap, whole-contract placement); basis (fresh-start approximation, flat risk ignores state, horizon credit counts one request, payout policy differs, retained cushion basis, firm minimum above request); data quality (assumed inputs, live triggers not checked, live model approximation, live not modeled, within noise, stale advice, suspended); and DP reasons that are declared in the code but unused until PT-30 lands. "Within noise" means the gap is smaller than the combined standard errors: treat the two rows as the same.
- **Kelly is never shown in per-account advice** (full Kelly at 40% and 1:2 is about 0.10 of the account, 2.5x the whole cushion on a 50K).
- **The one-step risk candidates are not an optimum.** They compare each candidate for the next trade with the documented sizing afterwards, at the fixed 1:2, and are labelled that way.
- **Payout-ready accounts keep the documented rung.** The headline becomes "Request payout" and the rungs do not shrink (Hard Rules 2, 5, 8). A proposed or recorded risk above the documented rung is flagged, and the next-trade risk check returns within plan or above documented with the excess.

### Value views (what an account or a decision is worth)

All values come from the engine with common random numbers and standard errors, and each carries two bases: credit-free, and credit-inclusive (an account still alive at the horizon is credited one more payout request, audit T32). Quote the credit-free number when comparing; the credit basis is always labelled.

- **Value at a state.** The expected cash of an account from its reconstructed state; a state the engine does not model (for example a live account whose plan has no live builder) returns a typed "not modeled", never a number.
- **Value chain and funded value (simulator page).** Four canonical states per plan: eval start, fresh funded, funded at the first payout-eligible balance, and the first state after a payout with the post-payout floor. The funded value card shows the engine's mean payouts per funded account with its SE, P(0 payouts), the distribution, and the range a sample of n of your own accounts could show by chance (n from the rulebook's funded-accounts threshold or typed on the card; empty until then).
- **Trade value swing (advice card, and `cli prop advise --risk`).** For a proposed risk: value now, after a win and after a loss, valued at the next session start "as if you stop after this trade"; a loss that busts is valued at the refill value after the rebuy lag, with the replacement fee netted off. A `--rr` different from the documented reward multiple prints a what-if label, never the headline.
- **Request now versus continue (payout stake).** For a payout-eligible account: requesting now (net of the split, plus the post-payout continuation from the post-payout floor) against continuing under today's documented sizing, both with SEs and the credit basis named. A reduced-risk-while-eligible row exists only as a labelled what-if that keeps the documented reward multiple. If a live-transfer hazard is set, the request-now figure prices that payout's own transfer draw.
- **Retire comparison (information only).** Keep = the account's expected cash per day over its expected remaining life; switch = a fresh slot's steady-state rate over the same days minus the switch cost (the replacement plan's retry fee plus the rebuy lag at the slot rate). The verdict is "switch beats keep" only when the gap is beyond noise and the slot is capacity-bound (plan cap or your daily account capacity reached), otherwise keep, with a typed reason. The app's next-action logic is wired with retiring switched off (`retireOnSwitchBeatsKeep: false`), so it never tells you to retire an account, consistent with Hard Rule 7. Live accounts are not modeled here.

### Live-transfer hazard and live triggers

- **The hazard is your assumption, not a firm rule.** It is the probability per paid payout that the firm sends the account live. It is set per firm in the rulebook, on the calculator inputs, or with `--live-transfer-hazard` on `cli prop sim`, `optimize funded` and `optimize dp`. Unset means unpriced, exactly as before. A transfer ends the simulated payouts. Where the plan has a modeled live plan and an instrument and `--stop-points` are set, the account continues through it and only its recurring withdrawals count in net and monthly net; a transition credit, capital returned and a liquidation payout are separate and not counted. Otherwise the rest of the account is valued at $0, and the output says so. The continuation ignores your funded day stop and rung sizing and trades the live plan's own sizing. The payout that concludes an account is also a transfer chance at that hazard, a modeling choice. Copy-traded accounts share one draw per group. The DP does not model the hazard, and the retire comparison marks a DP-basis slot rate as hazard-free.
- **Which plans continue through a live plan** (per-plan table in `firms/LivePlanApplicability.ts`): Alpha Futures (Advanced, Standard, Zero: the 80% Live Program only, Alpha Prime not modeled, the Scaling Daily Loss Limit of 30% omitted); Apex EOD and Intraday (rests on a pasted copy of the firm page, never re-fetched live because Apex returns 403); FundedNext Rapid Pro, Rapid Pro DLL add-on and Rapid Daily (inferred from two separate firm quotes, no single stated rule); Lucid Daily variants (the transition credit is capped at $15,000 and treated as profit already earned; the net-of-90/10 treatment is an inference and the firm says it may be paid only after KYC) and Lucid Pro, Pro no DLL, Direct, Flex, Flex DLL; MFFU Rapid and Rapid EOD (the Rapid EOD live contract limit is disputed between firm pages, 3 mini versus 4 mini, so it may be wrong); Topstep XFA variants into the Live Funded Account (jurisdiction eligibility assumed, reserve and LFA progress defaulted, the $200,000 XFA-only-country cap not modeled); TPT 50K only (standard PRO+, not PRO+ Development); Tradeify Growth, Lightning, Select Daily and Select Flex into Elite live. **Not modeled, so the remainder is valued at $0:** FundedNext Flex (the firm's own pages give four different live criteria, so it is marked unverified), FundedNext Legacy and FNL:003, MFFU Pro and Builder (separate live programs), Lucid Maxx (already live), Topstep Pro Account (terminal), E8 Futures (no live program) and FTMO Futures (live terms unpublished).
- **The notes above were rechecked against the firms' own live pages on 2026-10-02** (`live-transfer-notes-recheck.md`): 7 confirmed, 0 contradicted, Apex blocked by HTTP 403 and still waiting for Sadra to paste the Apex Live FAQ. The recheck also found that the FundedNext Flex note was never shown (a not-modeled plan carried no continuation note); that is fixed, and the note now follows the $0 continuation line (`LiveTransferSurfaceDisclosure.test.ts`). It also found that FundedNext re-created its help articles under new IDs on 2026-10-01.
- **Live triggers: what is enforced and what is only researched.** The engine has a trigger model (payout count per account, payout count across the firm, cumulative payout amount, single-day profit, discretionary, not checked) and consumers for it: the `WouldTriggerLive` block on payout advice, a lifetime payout cap at a verified count trigger, a daily profit ceiling below a verified single-day trigger, firm-wide counting of pending payouts, near-live alerts, exclusivity and cooldown on Next slot. **No real firm has a verified trigger entered yet** (PT-35b is blocked on Sadra's answers and a same-day re-fetch), so every real firm reports "live triggers not checked", every engine number is marked optimistic, and a `--firm-payouts-since-live` count has no verified firm rule to be checked against yet. The consumers were tested on synthetic verified fixtures only. Do not tell Sadra a payout is safe from a live transfer on the strength of these tools.
- **Recorded research on triggers (PT-04, `firm-policy-recheck.md`; research, not engine data; re-verify before relying):** Tradeify's agreement reads 3 payouts on one account or 10 in total, for consideration only, while two other first-party pages say 4 to 5 payouts is typical, so the conflict is open; FundedNext Flex has four conflicting criteria; Topstep moves accounts by discretionary Risk Team call-up; Alpha is discretionary with one page saying +$40,000 payable balance or 5 payout cycles; MFFU Builder promotes after the 5th approved sim payout; MFFU Pro has a 3-consecutive-payouts and a $100,000-cap trigger plus discretionary review, with open questions; Apex needs a paste.

### `bun run cli prop advise` (DB-free; real flags from `src/cli/commands/prop/advise/command.ts`)

```bash
bun run cli prop advise --firm mffu --variant rapid-eod --stage funded --balance 52600 --highest-eod 52600 --payouts 0 --trading-days 12
bun run cli prop advise --firm mffu --variant rapid-eod --stage eval --balance 50400 --highest-eod 50400 --trading-days 1 --proposed-risk 800 --losses-today 1
```

- **Identity:** `--firm`, `--variant`, `--stage` (required: `eval`, `funded`, `live`). An instant-funded plan rejects `eval`; `--funded-reset` and `--early-withdrawal` are rejected on plans that do not offer them.
- **Snapshot:** `--snapshot-date` (default today), `--balance`, `--highest-eod`, `--highest-intraday`, `--dashboard-floor`, `--dashboard-convention` (`nominal` default or `zero-based`), `--floor-at-last-payout`, `--last-payout-balance`, `--last-payout-date`, `--last-traded-date`, `--first-funded-trade-date`, `--payouts`, `--cumulative-payout` (after the split), `--trading-days`, `--qualifying-days`, `--cycle-best-day`, `--eval-best-day`, `--funded-resets-used`, `--live-start-balance`, `--firm-payouts-since-live`. Missing fields are named in the error and depend on plan and stage; an implausible snapshot fails loud with a convention hint (the MFF funded account opens at $0, so use `--dashboard-convention zero-based` if the dashboard shows profit from $0, otherwise pass the nominal $50,000-based balance).
- **Rulebook overrides (the command never reads your stored rulebook, it starts from the skill defaults):** `--eval-mode` (`ladder`, `max-risk`), `--ladder-fractions` (`general-derivation`, `mff-rapid-eod-search`), `--request-size`, `--retain-cushion`, `--allow-below-hard-rule-2`, `--winrate` (0.4), `--rr` (2), `--tpd` (4).
- **Engine inputs:** `--trials` (4000), `--seed` (42), `--stop-points` with `--instrument` (NQ, MNQ, ES) to place rungs in whole contracts, `--commission`, `--rebuy-lag-days` (omit and 0 is assumed and marked), `--suspended`.
- **Actions:** `--risk` prints the EV swing of one trade (not with `--json` or `--suspended`); `--proposed-risk` with `--wins-today` and `--losses-today` checks the next trade against the documented rung (an above-documented verdict prints the excess); `--matrix` prints the coverage of every rankable plan at every stage and substate and ignores the snapshot flags; `--json` prints only the advice JSON, plus the risk check when one was asked for.
- **Output order:** the documented rule and its provenance, rungs, daily profit ceiling and assumptions, payout advice, the engine optima, the difference reasons, the assumption list and the provenance line (source, objective, start basis, snapshot date, computed date, firm-data verification date).
- **What it does not do yet:** no `--dp` (pending PT-30), no pending-payout counts (a request in flight is never added to the payout counts), and every firm is checked against the unverified account policy, so the live-trigger line always reads "not checked".

### What the tools disclose, and what to say out loud when quoting them

- Never quote an engine optimum without its source, start basis and standard error; a fresh-start optimum is not the optimum for the account's current state.
- "Live triggers not checked" means every payout-stream number may stop earlier than modeled. Say so.
- 50K sizes only; other sizes and unmodeled firms are ledger-only.
- Defaulted inputs are listed as assumptions: rebuy lag 0, cycle best day at the worst case, peak order for plans whose floor moves on payout, contract-cap instrument at the plan default, gross-only payouts where net was not entered, no holiday calendar, the dashboard convention.
- The DP is not part of the advice yet. Treat any DP figure in this skill as stale until the WP60 and WP66 reruns land, and never present a DP number as the account's advice.

## THE THREE-OBJECTIVE FRAMEWORK (validated against two outside prop-trading videos, not just Sadra's own claims)

Two YouTube videos by a prop-trading creator going by "JJ" ("How I Scaled To $1.8M In Prop Firm Payouts", "Why I Can't Show You My Risk Management") were transcribed and read in full 2026-09-22. Their core methodology matches — and independently validates — what this engine already does, not something new to bolt on. Worth stating explicitly since it reframes several sections below:

1. **Beat the prop firm, not the market.** An eval is a rule set, not a profit contest — the only thing that matters is the probability of hitting the profit target before the drawdown, given the exact constraints (contract caps, consistency rule, DLL) you're actually handed. Win rate, equity-curve quality, and balance reached are irrelevant on their own; they only matter through how they move that one probability.
2. **There are three genuinely different objective functions, one per environment — never blend them:**
   - **Eval:** maximize probability of reaching the target before the drawdown. Once you're already reliably profitable at a firm, the video makes a sharper point worth adopting: **optimize for TIME to funded, not profit or pass rate** — this is exactly what `cli prop ladder`'s "FASTEST TO FUNDED" ranking already computes, as distinct from its "CHEAPEST PER FUNDED ACCOUNT" ranking.
   - **Funded:** maximize **expected cash withdrawal**. Nothing else matters — not balance reached, not how long the account survives, not win rate. Track only: current balance, distance to the max loss, top balance (since the drawdown trails), and payout eligibility. This is exactly Hard Rule 8 below, independently reached by an outside source.
   - **Live:** maximize net trading return — ordinary trading, once real capital risk actually starts.
3. **Cost is not value.** An eval costs `eval price ÷ pass rate` to acquire (this skill's own "replacement cost" formula below) — but the account's *value* is the expected future payout stream, not what was spent to get it. Never charge historical fees against future decisions; they're sunk.
4. **Risk sizing is genuinely state-dependent, not one fixed number for a whole account type.** The same dollar loss destroys a different *fraction* of an account's value depending on how close it is to a payout: losing $1,000 on a fresh funded account (worth roughly its acquisition cost) is a much smaller relative hit than losing $1,000 on an account $2,000 into profit (worth close to a full payout). This isn't a new idea to add here — it's precisely what `computeEvalStateValue`/`computeFundedStateValue` (`core/EvalStateValue.ts`/`core/FundedStateValue.ts`, exposed via `cli prop optimize dp`) already solve for: a risk *function* of current balance/profit/day, re-derived as the state changes, not a static ladder or a single flat number. The flat-$250 and percent-of-cushion sizing discussed throughout this document are simpler approximations to that same state-dependent optimum — reach for the real DP when its performance allows (see the caveat under "Full-DP challenger" below), and treat flat/percent as a good, fast fallback otherwise (percent-of-cushion needs `--stop-points` and is placed in whole contracts, T33).
5. **Track exactly two numbers**: eval spend, and payout dollars received. Everything else (win rate, pass rate, balance, equity curve) is a secondary diagnostic for *why* those two numbers move, never the objective itself.
6. **Scale horizontally, not vertically** — spread the same modest, proven policy across many accounts rather than pushing one account to a large balance, because payouts are capped per account/per cycle and a single big balance can't realize proportionally more. This skill's own "SPEED COMES FROM ACCOUNTS, NOT AGGRESSION" section below — cross-referenced, not new.
7. **Diversify across firms** so a rule change, ban, payout delay, or firm collapse only costs part of the total stack, never all of it. This skill's own per-firm account-cap and live-trigger tables in `references/firm-rules.md` exist for exactly this reason.
8. **Boring, consistent execution beats hero trades.** A smooth equity curve with no oversized single days is itself the edge, not a side effect of one. Already Hard Rule 1 (only exit at TP/SL) below — independently reached by an outside source, not new.

Nothing above changes any number already in this document. It's cited because it independently confirms the engine's own DP work is the *right* direction (not a speculative research detour), and because it gives a crisper name to a distinction ("lifetime/renewal" vs "one bounded run", i.e. the now-removed `--sort lifetime` vs `--sort cycle`) that caused real confusion this session before it was made explicit. `--sort lifetime` and `lifetimeExpectedNet` were since removed from the engine; see Hard Rule 8 and `references/engine-results.md`.

## HIS NUMBERS (do not substitute defaults)

| Input | Value |
|---|---|
| Win rate | **40%** — this is what he states. Use it. |
| Risk:reward | **Fixed 1:2**, never varies |
| Expectancy | **+0.26R per trade** |
| Instruments | NQ / ES futures |
| Base | Netherlands |
| Funded risk | **$250/trade, TP $500, fixed** |

**Eval pass rate is DERIVED, never assumed.** He has quoted ~33%, but that is the *output* of his max-risk approach, not an independent input. Simulating a $900/trade eval under the 30% consistency rule reproduces 31.5% — his number falls out of the math. **Never plug in 33% as a given; compute the pass rate from win rate + R:R + the risk his rules dictate.** Treating it as a separate assumption double-counts it and was a repeated error.

**Trades per day: variable, 0–4, rule-driven — NOT a fixed count.** Confirmed directly 2026-09-22: "0 to 4. I don't know. Differs per day." He continues if there's reason to, stops if there's reason to (daily cap hit, etc.), and some days have no setup at all. Model as: up to 4 per day, stopping when the day's cap is reached, allowing 0. He has confirmed he WILL stop at the cap — the daily-cap results depend on that discipline and he has committed to it.

**Confirmed assumptions (he accepted these — don't re-ask):** 40% win rate holds across months of data and across all risk sizes with no variance concern; trades treated as independent; wins at exactly 2R, losses at 1R, no slippage or commissions modeled; perfect execution; accounts traded independently, NOT copy-traded; replacement lag estimated, no history needed.

**Stop distance is NOT fixed** — NQ volatility varies daily. He sizes to a fixed dollar loss (or a %, whichever sims favor), adjusting contracts to that day's stop. **Confirmed directly 2026-09-22, and this is a real, two-lever mechanism, not an approximation:** "I don't use fix stops. I just change contract sizes. Or that doesn't fit the risk, I will change the entry, offset it, to make it fit a risk dollar." Lever 1 is contract count (the usual case). When contract-count granularity alone can't land exactly on the target dollar risk, lever 2 is shifting the entry price itself so the resulting stop distance hits the target risk precisely — he does not accept an approximate size. Never convert a contract cap to dollars via an assumed point stop. The real constraint: `min_stop_points = risk$ ÷ (contracts_allowed × point_value)`. At $450 on 3 NQ minis that's 7.5 points — rarely binding.

## HIS HARD RULES (non-negotiable — never model or advise against these)

1. **Only exit at TP or SL.** No break-evens, no partials, never move TP or SL. (This is in his own written trade plan and the math backs it: at 40%/1:2, only **31% of winning trades** need to be pulled-back-to-entry for a BE-stop policy to zero out his entire edge.)
2. **Never withdraw below $2,000 remaining cushion.** Applies to every firm, every model, always. `cushion = balance − current floor`.
3. **On EVALS: risk the max allowed by the constraints, but pair it with a DAILY PROFIT CAP and stop trading once the cap is hit.** His objective is **speed to funded**, not pass rate. Never propose conservative eval sizing — he has stated this repeatedly and the math supports him.
4. **Set the daily cap = 2 × risk, so ONE winning trade ends the day exactly at the cap.** Risking more than half the cap is incoherent: you either overshoot on a single win or claw back through losses to land at the same place with more exposure. He identified this; it was a real design error in an earlier model.
5. **On FUNDED: fixed $250 risk, $500 TP.** Not a percentage of cushion. This is his stated method. Re-swept for real (see "Fixed $250 vs percentage sizing" below): fixed $250 only wins outright at the 3-month horizon — by 6 months flat $200 leads, and by 1 year percentage-of-cushion sizing (15%/10%) overtakes every flat candidate including $250. The crossover is under 6 months, not the ~18 months this rule previously claimed. (Caveat: that sweep predates the audit's N-71 fix. Its percent rows showed 0.0% bust because percent risk was then sized fractionally with no one-contract minimum; on the fixed engine percent risk is placed in whole contracts and busts, and in the 2026-09-26 reruns the best percent row beats the best flat only on a few plans, see `references/engine-results/2026-09-26-post-fix-rerun.md` Result 4 and `2026-09-26-stop-point-rerun.md`. The percent half of this comparison is therefore not valid evidence until re-swept.) **This is exactly a case where the objective (horizon) determines the answer, not a fixed universal winner** — see "HOW HE WANTS ME TO WORK" below: state which horizon/objective is in play before citing a winner from this rule.
6. **Max one trade per trading window per account.**
7. **Goal is to stay on evals/PAs as long as possible.** Live transition is something to *avoid*, not optimize toward. Firms move traders live to cap their own liability.
8. **Funded-stage goal: maximize expected net cash per month per account slot, replacement priced in.** A bust just ends the current cycle: the slot is refilled after `--rebuy-lag-days`, the next eval's fee and days are already inside the number, and an account still alive at the horizon is credited one more payout request too (at most the next capped request the plan allows, net of the split and the payout method fee, T32; not its whole withdrawable balance). Survival is not a second, separately-weighted goal, it's priced *inside* that one number. Measured by `cli prop optimize funded` (default `--sort monthly`) or `cli prop optimize dp`. A riskier policy that busts more often only loses if those extra busts cost more in forgone expected cash than they buy in extraction speed; that trade-off is computed, never assumed or weighted as its own thing. (`lifetimeExpectedNet`/`core/LifetimeExtraction.ts` was removed from the engine because it diverged as bust probability rose and double-counted renewal fees; see `references/engine-results.md`.)

## A BLOWN FUNDED ACCOUNT IS NOT A DISASTER — IT IS A PURCHASE

**This is the single most important framing correction he has made.** A funded account is a commodity with a known repurchase price:

```
replacement cost = eval price ÷ pass rate
```

At $900 eval risk (31.5% pass) that is ~$332 and ~22 days. **Never describe losing a funded account as "the fee plus every future payout it would have produced."** That framing is wrong, inflates the loss, and biases every recommendation toward over-conservative funded sizing. He corrected this explicitly and it invalidated a whole round of prior analysis.

**Any model of funded-account performance MUST include replacement**: on a blow-up, deduct the replacement cost, wait the replacement lag, restart at $0, keep counting. A sim that stops at the blow-up understates results massively — modeling it correctly moved a one-year median from $3,600 to $18,266 on identical sizing.

## POSITION SIZING — THE CORE FORMULA

```
risk$ = f × cushion
cushion = current balance − current floor
TP$    = 2 × risk$
```

**Floor, general case (works for every firm):**
```
lock_trigger = start_balance + MLL + buffer
locked       = has peak balance ever reached lock_trigger?
floor        = locked ? (start_balance + buffer)
                      : min(peak_balance, lock_trigger) − MLL
```
`buffer` = $100 at MFF / Tradeify / FundedNext / Topstep / Lucid / Apex-PA. $0 at TPT.

### When percentage sizing applies — AND WHEN IT DOESN'T

⚠️ **For SADRA's accounts, use his fixed $250/$500. Percentage sizing is context for reasoning, not a recommendation to give him.** The percentage framework only wins where an account is genuinely irreplaceable.

| Problem | Correct approach |
|---|---|
| **Eval** | **Max allowed risk.** Downside is capped at the fee and it's repeatable. Speed wins. |
| **Funded (replaceable)** | **Fixed $250.** Blow-ups cost ~$332 and ~22 days, not the account's future. |
| **Live account (NOT replaceable)** | Percentage of cushion, small. Bounded-target 5% pre-lock, 10% once compounding. This is the ONLY place conservative sizing is right, because there is no repurchase. |
| **Multi-account cascade** (Apex's 5-account ladder) | Bounded-target figure — P(all N) = P(one)^N compounds against you. |

### Reassessment cadence — tested, not assumed
- **Continuous (every trade): 2.5% blown over 3 years**
- Weekly: ~11% — acceptable practical compromise when contract granularity makes continuous impractical
- **Monthly: ~25% — never do this.** Size lags actual cushion through a bad stretch. Nearly 10× worse than continuous.

Practical: recompute each Monday off Friday's close, round to a placeable contract size, hold it all week.

### Fixed $250 vs percentage sizing — the corrected comparison

**Historical, not valid for ranking today: this table was measured on `lifetimeExpectedNet`, the lifetime-net metric removed from the engine. Numbers below are unchanged; see `references/engine-results.md` for current measurements.**

Re-swept for real with `bun run cli prop optimize funded` (`core/LifetimeExtraction.ts`'s renewal fixed-point, not a naive geometric series) on MFF Rapid EOD $50K, eval sized via the documented 400/600/800/200 ladder. 100,000 trials per candidate, averaged across two seeds (42, 1337) to check stability. Candidates: flat $150/$200/$250/$300/$400/$500 and 5%/7.5%/10%/15% of cushion.

| Horizon | Winner | Lifetime net | Runner-up | Lifetime net |
|---|---|---|---|---|
| 3 months | flat $250 | $1,683 | flat $300 | $1,634 |
| 6 months | flat $200 | $2,802 | 15% cushion | $2,566 |
| 1 year | 15% cushion | $4,908 | 10% cushion | $4,841 |
| 2 years | 10% cushion | $10,087 | 15% cushion | $9,231 |

Genuine near-ties, stated numerically rather than resolved by appeal to simplicity or survival: at 3 months, flat $250 and flat $300 are only ~$50 (3%) apart, a real but modest, seed-stable gap. At 1 year, flat $150 ($4,791), 10% cushion ($4,841) and 15% cushion ($4,908) form a genuine three-way cluster spanning only ~$120 (2.4%), close to indistinguishable at this trial count, even though both seeds tested rank them 15% > 10% > flat $150 in that order.

Fixed $250 (his current hard-coded funded sizing) only wins outright at the 3-month horizon in this sweep. By 6 months flat $200, not $250, leads; by 1 year percentage-of-cushion sizing (15%/10%) overtakes every flat candidate including $250; the 7.5% cushion previously compared against $250 is not competitive at any horizon tested here, beaten by both 10% and 15%. Every percent-of-cushion candidate in this historical sweep showed 0.0% bust-when-funded across all four horizons. That was an engine defect (audit N-71), not real behaviour: percent risk was sized fractionally with no one-contract minimum, so it shrank toward the floor and never busted. Since T33 percent risk is placed in whole contracts (at least one) and busts like any other size (Lucid Pro no-DLL at MNQ 10 points in a 400-trial CLI check: about 3% bust at 10% of cushion and about 55% at 50%), so the percent rows of this table, and the horizon trend drawn from them, are not valid evidence.

Tiered step-ups ($250 → $500 above $4k cushion) barely help — they only scale *up*, never down.

### Full-DP challenger (Part L2) — measured, MFF Rapid EOD 50K only: DP wins, supersedes flat/percent for this plan

**Historical, not valid for ranking today: this section was measured on `lifetimeExpectedNet`, the lifetime-net metric removed from the engine, using the old joint fixed-point DP that the average-reward DP has since superseded. Numbers below are unchanged; see `references/engine-results.md` for current measurements.** It is also stale for a second, independent reason: it was computed through `FundedStateValue.ts` before the N-65 and N-66 fixes (see "ENGINE SEMANTICS" above), so even a fresh run on the current metric would not reproduce these numbers. Kept, not deleted, pending a rerun.

**Flat-policy-sweep tier** is the table directly above (K1/K2's `LifetimeExtraction` renewal sweep, eval sized via the documented ladder, 100,000 trials/2 seeds). **Full-DP tier** (`FundedStateValue.ts`'s value iteration over a scale-invariant cushion-multiple state, joined to L1's eval DP via `V(bust_funded) = −feePerAttempt + V_eval(initial)`, per Part K's pure-cash-extraction objective) is new this session, and for MFF Rapid EOD 50K it **wins outright, by a wide margin**:

- A **fresh, self-consistent flat/percent baseline** was re-swept inside the DP's own validation harness at matched conditions (seed 42, 8,000 trials, 250-day funded horizon) so the comparison is apples-to-apples with the DP run — **best candidate: 15% of cushion, lifetime net $12,238**.
- **The joint DP's own predicted value: $27,796** (+127% over that baseline) — this is the DP's internal math, not yet cross-checked against `simulate()`.
- **Empirically validated** by a real `simulate()` run driven end-to-end by the DP's own computed eval + funded day policies (seed 42, 12,000 trials, 3,000-day horizon): **lifetime net $19,013** — still **+55% over the $12,238 baseline**, decisively past the plan's 5%-relative adopt threshold. (The DP's predicted $27,796 vs. simulate()'s $19,013 gap is expected Monte Carlo/discretization slack, not a discrepancy to paper over — both are reported as measured.)
- **Verdict for MFF Rapid EOD 50K: ADOPT the joint DP policy**, superseding both flat-$250 and every percentage-of-cushion candidate in the table above for this plan specifically.

**Explicitly do not blend this $12,238 baseline into the flat-policy-sweep table above.** It reuses the flat/percent-of-cushion *idea* but is a smaller, differently-configured re-sweep purpose-built to matched-condition-test the DP (flat $250 eval sizing, no day-stop rule, 8,000 trials) — it is not a re-measurement of the table's own $4,908 (15% cushion, 1-year) cell, which used the documented ladder for eval and 100,000 trials over two seeds. Both numbers are real and correctly tagged to their own tier/config; they are not comparable to each other and neither supersedes the other.

**Scope, stated plainly:** only MFF Rapid EOD 50K's funded phase has a measured adopt/keep number. MFF's own plain "Rapid" (non-EOD) funded phase, Apex Intraday, and TPT PRO's funded phase are all intraday-trailing drawdown and therefore DP-*ineligible* in v1 (same `IntradayTrailingDrawdown` scope cut as the eval side) — they keep flat/percentage funded sizing with no DP comparison possible yet. TopStep's funded phase is DP-*eligible* and its tiered-`ContractLimits` interaction with the DP is unit-tested (the DP never sizes past what a profit tier allows), but no lifetime-net adopt/keep number has been run for it — none is claimed here.

**DP performance reality (resolved 2026-09-22 — read before running `cli prop optimize dp`):** the joint eval+funded DP is mathematically real and exposed as a permanent CLI command. Two rounds of algorithmic optimization (below) gave a real, verified ~30-45% cumulative speedup applying to every plan regardless of consistency tracking. A third round then added genuine multi-core parallelism to `FundedStateValue.ts`'s funded-side day-grid solve via `worker_threads`, which **closes the gap for every funded-consistency-tracking plan**: confirmed >4.6x real wall-clock speedup on Tradeify Growth (`consistency funded` non-"none") at `--eval-days 20 --iterations 1` — 354.6s with the worker pool vs. a sequential run that hadn't finished past 27 minutes at identical settings. All 19 tests in `FundedStateValue.test.ts` pass (17 original DP-correctness tests plus 2 new regression tests guarding the parallel path's registry lookup), `typecheck`/`lint` are clean, and this is committed to main.

**What remains genuinely slow: eval-side consistency only.** `EvalStateValue.ts` was **not** parallelized — its memoization is sparse/reachability-driven, not a dense per-day sweep like the funded side, so there is no equivalent safe worker boundary; closing this would mean restructuring the algorithm itself, not just distributing existing work. A plan with a non-"none" `consistency eval` field is still slow-to-impractical through `cli prop optimize dp`. **A non-"none" `consistency funded` field alone is no longer a reason to avoid the DP** — the worker pool activates automatically when the plan qualifies (no flag needed) and falls back to the original, identical-output sequential solve whenever it can't.

The cause of the (now-fixed) funded-side slowness, confirmed via profiling: consistency tracking adds a whole extra bucketed "best day profit" dimension (`bestDay` in `EvalStateValue.ts`, `cycleBestDay` in `FundedStateValue.ts`) to every memoized state. For `FundedStateValue.ts` specifically, tracking funded consistency doesn't just add that one dimension's own bucket count as a multiplier — it forces a full day-tree re-solve once per possible day-start cushion bucket too (since a day's `todayPnL`, hence its best-day-profit contribution, depends on where the day started), so the real multiplier was `bestDayBuckets × cushionBuckets`, not just `bestDayBuckets`. This is exactly the dimension the worker pool now parallelizes across.

**What was fixed (safe, applied, verified) — algorithmic, applies to every plan:** redundant recomputation of the fixed per-cushion candidate-risk grid (was rebuilt from scratch on every call despite depending only on its inputs — now cached/precomputed), string-keyed `Map`s replaced with numeric mixed-radix keys (verified collision-free by construction, not just plausibility), and the "stop trading for the day" leaf value being redundantly recomputed on every trade-index round of the same day-solve despite being identical across all of them except the true idle-day case (now computed once per day-solve and reused).

**What was added on top — worker-thread parallelism for `FundedStateValue.ts`'s funded-side day-grid solve:** within one sweep level, the per-`(idleDays, cycleBestDay)` solves only read the shared value table and only write to it afterward (a Jacobi update, not Gauss-Seidel), and every cross-level reference is to a level already fully solved by the strictly sequential outer regime/offset loops — this makes the sweep safe to distribute across `worker_threads`, synchronized via `SharedArrayBuffer`/`Atomics` to keep the outer API synchronous. Gated conservatively: `findRegistryPlanId` (a lazily-warmed cache backed by a real `import('../firms')`, chosen specifically because it shares the correct module instance under both Bun and vitest/Node — a CJS `require`-based lookup was tried first and silently returned wrong results by matching against a separate, non-reference-equal copy of the registry) only allows the parallel path for registry-resident, non-`.withOverrides()` plans; everything else — and any registry-lookup failure at all — falls back to the exact original sequential `solveDayTree` loop, inside a try/catch that had to be widened after an earlier version let a resolution failure crash the whole computation instead of falling back. The worker thread itself needs `tsx`'s scoped `require` (`tsx` is now a real dependency) plus `execArgv: ['--import', 'tsx']` on the `Worker` constructor, because this codebase's extensionless relative imports resolve natively under Bun but not under a bare Node.js `worker_threads.Worker` (which is what actually executes even when the outer process was launched via `bunx`/vitest). A regression test (`findRegistryPlanId (worker-thread pool safety gate)` in `FundedStateValue.test.ts`) asserts this resolves every real registry plan, specifically to catch a future silent regression (e.g. the `firms` module moving or being renamed) that would otherwise just quietly stop parallelizing forever without failing any test.

**Before invoking `cli prop optimize dp` on a plan, run `cli prop plans --firm X --variant Y` first and check its `consistency eval` field specifically** — a non-"none" value there is the only remaining reason the DP will be slow; `consistency funded` no longer factors into this decision. If `consistency eval` is non-"none", use `cli prop optimize funded`'s flat/percent/ladder sweep instead.

**Update 2026-09-23: `cli prop optimize dp` now solves an average-reward DP (`AverageRewardSolver.ts`/`RenewalCycleObjective.ts`), not the joint fixed-point DP described above.** It maximizes expected net cash per day per account slot (reported x21 as a monthly rate), prices replacement in via `--rebuy-lag-days`, and models the funded horizon as a geometric hazard of 1/`--funded-days` per day. Two defects were fixed after its first validation run: the flat 200-sweep-per-level cap became a hazard-scaled cap derived per level (needed for convergence under a small hazard), and a bounded "qualifying days since last payout" DP state was added so payout qualifying-day gates (TopStep's 5 days of $150+, FTMO's 4) are modeled instead of always open. It refuses FundedNext Legacy (its cumulative qualifying-day milestone cap cannot be represented by that bounded state) and warns when it ignores a lifetime payout-dollar cap (e.g. MFF Pro's $100,000, optimistic). Measured wall time: about 16 minutes for FTMO Growth and about 70 minutes for TopStep No-fee Standard at `--eval-days 15 --funded-days 252 --iterations 8`, the old default. The default `--iterations` is now 12 (FTMO Growth needs 9 rate-search solves from rate 0 after the audit), and each solve is one eval plus one funded solve, so a run that uses more solves takes proportionally longer. Validation and the gate result: `references/engine-results/2026-09-23-average-reward-dp-validation-2.md`. The joint fixed-point DP above, and every `lifetime net` number measured with it in this section and the next, are superseded and not valid for ranking today. **That validation run is itself now stale**: it also ran through the pre-N-65/N-66 `FundedStateValue.ts` (see "ENGINE SEMANTICS" above), so its FTMO ($4,350/mo) and TopStep ($3,101/mo) DP figures and the gate D11 verdict need a rerun before being cited as current; see `references/engine-results.md`'s Runs table for the same note.

### Full-DP funded sweep — every other DP-eligible plan (measured 2026-09-17)

**Historical, not valid for ranking today: this section was measured on `lifetimeExpectedNet`, the lifetime-net metric removed from the engine, using the old joint fixed-point DP that the average-reward DP has since superseded. Numbers below are unchanged; see `references/engine-results.md` for current measurements.** It is also stale for a second, independent reason: it was computed through `FundedStateValue.ts` before the N-65 and N-66 fixes (see "ENGINE SEMANTICS" above), so even a fresh run on the current metric would not reproduce these numbers. Kept, not deleted, pending a rerun.

Every remaining funded-DP-eligible plan (27 of the registry's 28 total funded-DP-eligible plans, MFF Rapid EOD already covered above) was run through the identical harness: a fresh K1 baseline re-swept at matched conditions (flat $200/250/300/400 and 5%/7.5%/10%/15% cushion, seed 42, 8,000 trials, 250-day horizon), the joint eval+funded DP fixed point (12 iterations, `evalInitialValue` self-consistent between `computeEvalStateValue`/`computeFundedStateValue`, `feePerAttempt = plan.fees.reset`), and — the number the adopt/keep verdict actually uses — an empirical `simulate()` run driven end-to-end by the DP's own exported policy (seed 42, 12,000 trials, 3,000-day horizon).

| Plan | Best K1 (candidate) | DP predicted | DP empirical | Δ vs K1 | Verdict |
|---|---|---|---|---|---|
| Apex EOD | $7,089 (5% cushion) | $21,030 | $7,674 | +8.3% | **ADOPT** — smaller margin than most (Apex's own consistency rule is `funded`-scoped, so it's one of the plans hit by the blind-spot below, per Apex's own dedicated measurement) |
| E8 Signature | $4,128 (flat $200) | $11,160 | $5,012 | +21.4% | **ADOPT** |
| E8 Zero Max 80 | $1,155 (15% cushion) | $5,565 | $1,759 | +52.3% | **ADOPT** |
| E8 Zero Max 100 | $1,432 (15% cushion) | $6,948 | $2,180 | +52.2% | **ADOPT** |
| E8 Zero Starter 80 | $1,078 (15% cushion) | $4,006 | $1,098 | +1.9% | KEEP (below the 5% bar) |
| E8 Zero Starter 100 | $1,343 (15% cushion) | $5,009 | $1,363 | +1.5% | KEEP (below the 5% bar) |
| Tradeify Growth | $13,440 (flat $200) | $40,005 | $14,477 | +7.7% | **ADOPT** |
| Tradeify Select Flex | $18,818 (7.5% cushion) | $43,722 | $9,486 | −49.6% | KEEP |
| Tradeify Select Daily | $12,810 (10% cushion) | $46,795 | **$248,612** | **+1,841%** | **ADOPT — see caution below, do not trust this number without independent re-verification** |
| Tradeify Lightning | $16,464 (flat $300) | $249,230 | $13,485 | −18.1% | KEEP |
| Lucid Daily (EOD) | $3,818 (15% cushion) | $16,303 | $9,791 | +156.4% | **ADOPT** |
| Lucid Daily (EOD, DLL) | $3,838 (15% cushion) | $16,278 | $9,863 | +157.0% | **ADOPT** |
| Lucid Flex | $3,873 (15% cushion) | $10,816 | $4,296 | +10.9% | **ADOPT** |
| Lucid Flex (DLL) | $3,848 (15% cushion) | $10,800 | $4,297 | +11.7% | **ADOPT** |
| MFF Pro | $35,499 (15% cushion) | $33,987 | $35,859 | +1.0% | KEEP (below the 5% bar) |
| MFF Builder | $4,150 (7.5% cushion) | $14,079 | $5,074 | +22.2% | **ADOPT** |
| TopStep Standard·Standard | $15,137 (7.5% cushion) | $30,284 | $15,364 | +1.5% | KEEP |
| TopStep Standard·Consistency | $15,217 (flat $200) | $28,870 | $4,704 | **−69.1%** | KEEP |
| TopStep No-fee·Standard | $15,182 (7.5% cushion) | $30,120 | $15,449 | +1.8% | KEEP |
| TopStep No-fee·Consistency | $15,265 (flat $200) | $28,706 | $4,774 | **−68.7%** | KEEP |
| FundedNext Flex | $10,121 (7.5% cushion) | $14,988 | $6,768 | −33.1% | KEEP |
| FundedNext Legacy | **$393,029** (15% cushion) | $29,600 | $72,431 | −81.6% | KEEP — **K1 benchmark itself looks like an outlier here, see caution below** |
| FundedNext Rapid Pro | $2,924 (7.5% cushion) | $9,772 | $3,179 | +8.7% | **ADOPT** |
| FundedNext Rapid Daily | $2,592 (15% cushion) | $9,872 | $3,479 | +34.2% | **ADOPT** |
| AlphaFutures Zero | $8,235 (flat $200) | $41,198 | $712 | **−91.3%** | KEEP |
| AlphaFutures Standard | $11,981 (flat $300) | $36,709 | $1,575 | **−86.9%** | KEEP |
| AlphaFutures Advanced | $61,548 (10% cushion) | $20,158 | $1,736 | **−97.2%** | KEEP |

**FTMO Futures, AlphaFutures, and E8 Futures were added to the registry after this sweep was run and are not all reflected here** — AlphaFutures and E8 Futures do appear in the table below (added in a later pass), but **FTMO Futures has no measured funded-DP verdict at all as of this writing** — it is not an oversight to skip, it genuinely postdates this sweep. Do not assume FTMO Futures behaves like any other row here; run it fresh.

**Net result: 13 ADOPT, 14 KEEP** across these 27 newly-measured plans. Combined with MFF Rapid EOD (ADOPT), **all 28 of the 28 funded-DP-eligible plans in the whole registry *at the time of this sweep* now have a measured verdict** (FTMO Futures excluded, see above) — full coverage, nothing left unmeasured on the funded side. Unlike the eval side (24/31 adopt), the funded DP is a close-to-even split — **do not assume the funded DP is a universal win the way the eval DP mostly is.** Three things worth flagging explicitly rather than letting the raw table speak for itself:

1. **The DP's own "predicted" value is optimistic across almost every plan** (often 2-10× the eventual empirical number) — this is the same, already-disclosed modeling limitation Apex's own measurement found: `FundedStateValue.ts`'s `dayCloseValue` unconditionally resets `cycleBestDayProfit = 0` before every payout check, so the funded DP has no bucketed state for a plan's actual best-day profit and cannot correctly enforce a *funded-scoped* consistency rule internally. Every plan above with a `funded`-scoped consistency rule (Apex, Tradeify Growth/Lightning, Lucid Pro/Pro-no-DLL/Direct, MFF Builder, TopStep's two Consistency variants, FundedNext Rapid Pro, AlphaFutures Zero/Standard) inherits this blind spot to some degree — the **empirical** number (from a real `simulate()` run, which does enforce the rule correctly) is the one the verdict is based on, so the verdict itself is trustworthy even where the DP's self-report is not.
2. **TopStep's two "Consistency" variants and all three AlphaFutures plans show the largest gaps between K1 and the DP's real-world result** (−69% to −97%) — consistently and severely worse than K1's simple flat/percentage sizing once actually run. This is a stronger, more specific pattern than the general consistency-blind-spot note above (TopStep's own non-Consistency variants land near break-even, not catastrophically negative) and was not fully root-caused in this pass — treat the funded DP as **actively unsuitable, not just "not better,"** for these 5 plans specifically until investigated further.
3. **Two individual numbers are flagged as outliers requiring independent re-verification before being trusted, not just reported as measured facts:**
   - **Tradeify Select Daily's empirical $248,612** is ~18.4× its own K1 benchmark and ~5.3× the DP's own predicted value — every other plan's empirical number is *lower* than the DP's optimistic self-report, never dramatically higher. Select Daily has a distinct "2x fresh profit, hard-capped" payout mechanic built earlier this session; a plausible explanation is a small number of extreme compounding paths dominating the 12,000-trial mean under that specific mechanic, but this was not isolated or confirmed — re-run independently before relying on it.
   - **FundedNext Legacy's K1 benchmark of $393,029** is 6-40× every other plan's K1 benchmark in this entire sweep (which otherwise range $2,600-$61,500) — the benchmark itself looks like the anomaly here, not the DP. Re-sweep Legacy's K1 candidates independently before trusting either number for this plan. (Later found: these K1 percent-of-cushion benchmarks predate the audit's N-71 fix, when percent risk was sized fractionally and never busted, which inflates percent rows; that is a likely cause.)

**Note the standing conflict this creates with Hard Rule 5** ("fixed $250 risk... beats percentage sizing over any horizon under ~18 months") **and Hard Rule 3** ("eval objective is speed, not pass rate"): both predate this DP work and were themselves derived from the flat-policy-sweep tier. This full-DP result is more recent and more rigorously validated (per-plan, matched-condition, `simulate()`-cross-checked) for the one plan it covers. Flagging for Sadra to reconcile explicitly rather than silently overriding his own stated hard rules from inside a skill-doc edit.

## PAYOUT SIZING

Withdrawal size interacts with the $2,000-cushion rule in a **non-monotonic** way. This is real, verified with common random numbers and a zero-violation audit — not a bug:

- **Small ($500):** the $500 unlock gate binds before the cushion constraint, so profits accumulate faster than you withdraw. Balance **ratchets upward** away from the floor. Safest.
- **Mid ($1,000–$2,000):** cushion constraint binds. You withdraw almost exactly what you earn and stay **pinned in the danger zone** just above $2,000 cushion. **Worst of both — 98%+ blow-up.**
- **Large ($6,000):** long climbs to high cushion, few payouts, most time spent far above the floor. Recovers somewhat.

**Default: $500 per request.** Best survival, within ~$3.8k of the highest mean, and the mean-maximizing option carries an 82% chance of losing the account.

## SPEED COMES FROM ACCOUNTS, NOT AGGRESSION

He does not want to wait a year. The correct lever:

**Per-account aggression fails.** At 3 months, one account: 7.5% → $2,700 median; 10% → $3,150; 15% → $2,700; 25% → $450. A $2,000 cushion cannot produce large sums quickly at *any* risk level — the ruin barrier is too close.

**Parallel accounts scale linearly.** At 7.5%, $500 withdrawals:

| Accounts | Eval cost | 3-month median | 6-month median |
|---|---|---|---|
| 3 | ~$950 | $8,100 | $25,650 |
| 8 | ~$2,533 | $21,600 | $68,400 |
| 30 | ~$9,499 | $81,000 | $256,500 |

This is what he had at Apex (20 PAs) and what the live transition took from him.

## EVAL EXECUTION — THE DAILY CAP IS THE WHOLE GAME

**The 30% consistency rule is best-day ÷ TOTAL PROFIT** — confirmed on MFF's own consistency article: *"no single day's profit should exceed 50% of your total evaluation profits made"* (30% on Rapid EOD). Breaching does **not** fail the account: *"Traders who achieve more than 50% of their total profit target in one day simply need to trade additional days until consistency is met."*

**Consequence: your required total profit is `best_day ÷ 0.30`, not the $3,000 target.** Uncapped max risk is self-defeating — every dollar of size makes your best day bigger and pushes the finish line away faster than it pulls you toward it:

| Risk, NO cap | Best day | Profit needed to pass | Days to funded |
|---|---|---|---|
| $450 | $2,250 | $8,550 | 23 |
| $900 | $4,500 | **$17,100** | 22 |

At $900 uncapped you hit $3,000 on **day 2**, then grind nine more days doing nothing but diluting one runaway day.

### THE OPTIMAL EVAL LADDER — from an exhaustive 168k-ladder grid search

**Stale as of 2026-09-25, kept for the method, not for its numbers:** this grid search (47.0% pass, 8.2 expected days, $222 per funded account, and the $/funded frontier below) predates the audit's ladder fixes (WP15: trade-granular drawdown, contract limits, the D1 cost formula) and D1 itself. The ladder's shape and the reasoning still hold; the pass rates and costs must be re-run before they are cited (see `references/engine-results.md`).

**Risk a DIFFERENT amount on each trade of the day, escalating after each loss, sized so the four rungs consume exactly the cushion.** On MFF Rapid EOD 50K ($2,000 cushion):

| Trade | Risk | TP | Take it only if |
|---|---|---|---|
| 1 | **$400** | $800 | always |
| 2 | **$600** | $1,200 | trade 1 lost |
| 3 | **$800** | $1,600 | trades 1-2 lost |
| 4 | **$200** | $400 | trades 1-3 lost (this is all the cushion left) |

`400 + 600 + 800 + 200 = $2,000` — exactly the max loss limit.
**Stop the moment the day closes green.** Max 4 trades.

**Result: 47.0% pass, 8.2 expected days to funded, $222 per funded account.**

Frontier if speed is worth less to him than money:

| Ladder | Pass | Days | $/funded | 3 slots |
|---|---|---|---|---|
| **400/600/800/200** | 47.0% | **8.2** | $222 | $666 |
| 400/600/500 | 53.3% | 11.0 | $196 | $588 |
| 300/300/200/300 | 60.4% | 19.2 | $173 | $519 |
| 200/100/100/200 | 75.9% | 33.7 | $138 | $414 |
| 100/100/100/100 | 90.8% | 64.5 | $115 | $345 |

$321 extra across 3 slots buys being funded 8 weeks sooner. He wants speed — take the top row.

**Failure timing: 100% of blow-ups happen within 4 days**, 13% on day one (that's 0.6⁴ — four straight losses). Median blow day is 2. Survive day 4 and you pass with near-certainty. So an eval is decided almost immediately; budget ~6 evals to fill 3 slots.

### Full-DP challenger (Part L1) — measured, MFF Rapid EOD 50K only, not yet the default

**Stale as of 2026-09-25 (prop-engine audit).** These numbers were measured 2026-09-17, before the audit fixed a real defect in the eval DP itself (N-9: `EvalStateValue.ts` had no risk cap at the remaining DLL headroom, fixed wave 8) and moved the eval DP onto an intraday-reach tier basis (WP22a, wave 15); the static-ladder baseline these numbers compare against also changed underneath them (WP15, wave 6: trade-granular drawdown via `TradingDayLedger`, contract limits, D1 cost). Kept, not deleted, pending a rerun on the current engine; see "ENGINE SEMANTICS" above.

Three tiers of analysis now exist for eval sizing, and each number below is tagged with which one produced it — do not blend them:

- **Static-ladder tier** (`LadderSearch.ts`'s exhaustive grid search, exact within-day enumeration + Monte-Carlo-over-days, up to a 150-day horizon): the 400/600/800/200 ladder above, **47.0% pass / 8.2 days / $222 per funded account**.
- **Full-DP tier** (`EvalStateValue.ts`'s backward-induction value iteration — a genuinely state-conditioned policy, not a fixed sequence): built and validated this session. It **beats the static ladder decisively at matched conditions** (same plan, same 40% WR / 1:2 R:R / ≤4 trades/day, seed 42, 20,000-trial `simulate()` runs each, 30-day eval cap): static ladder **42.9% pass** vs full-DP **58.8% pass** — a **+15.8 percentage-point** gain, ~5× past the plan's own 3pp adopt threshold. (Note the static-ladder number under this same 30-day cap is 42.9%, not the 47.0% above — that 47.0% figure came from `LadderSearch`'s own scorer at up to a 150-day horizon; both are correct, static-ladder-tier numbers, just under different day-cap assumptions. Don't cite one as if it were the other.)

**This is a pass-probability-maximizing DP, not yet a cash-maximizing one** (`terminalValueAtPass` defaulted to 1 in this comparison) — and the trade-off is real: expected days-to-pass rose from **4.7 to 18.0 days**, while cost-per-funded-account fell from **$487 to $356**. That directly cuts against his stated eval objective (Hard Rule 3: "speed to funded, not pass rate") — **flagging this tension explicitly rather than silently picking a side.** Part L2's joint eval+funded fixed-point (below) resolves it by pricing the funded upside into the eval decision instead of optimizing pass rate in isolation, and that joint policy is the one the funded-sizing section below actually recommends adopting.

**Scope, stated plainly:** only MFF Rapid EOD 50K has an actual measured adopt/keep number. Every other EOD-trailing, non-peak-share eval plan is DP-*eligible* (`isEvalDpEligible`) but has not been run against its static ladder yet — no number exists for it, so none is claimed. Apex Intraday and both Lucid Daily-Intraday variants are DP-*ineligible* by design (`IntradayTrailingDrawdown`, out of v1 scope per the plan) and keep the static ladder with no DP comparison possible until the intrabar path model is added.

### Full-DP eval sweep — every other DP-eligible plan (measured 2026-09-17)

**Stale as of 2026-09-25, same reason as Part L1 above:** N-9's DLL-headroom fix and WP22a's intraday-reach basis changed `EvalStateValue.ts` itself, and WP15 changed the static-ladder baseline every row below compares against. Every ADOPT/KEEP verdict in the table below is kept, not deleted, pending a rerun.

Every remaining eval-DP-eligible plan (31 of the registry's 32 total eval-DP-eligible plans, MFF Rapid EOD already covered above) was run through the identical harness: same construction (`computeEvalStateValue`, `actionStepDollars:100/cushionStepDollars:200/profitStepDollars:600`), same `simulate()` comparison (seed 42, 20,000 trials, 30-day eval cap, day-green stop, 40% WR / 1:2 R:R / 4 trades/day). Since most of these plans have no documented static ladder anywhere in this file, one was freshly derived per plan via `runLadderSearch`'s fastest-to-funded (`bySpeed[0]`) result at the same 0.4×-cushion grid convention MFF's own documented ladder uses — a legitimate, freshly-computed baseline, not a previously-published "official" ladder, flagged here so it isn't mistaken for one.

| Plan | Static ladder pass% | DP pass% | Δ | Verdict |
|---|---|---|---|---|
| Apex EOD (no documented ladder — flat $250/day-green taken as baseline, matching its $1,000/day DLL exactly) | 51.4% | 58.9% | +7.5pp | **ADOPT** (smaller margin than most, but past the 3pp bar) |
| TPT (freshly-derived ladder [700,800,700,700] — no previously-published TPT ladder existed) | 39.9% | 65.5% | +25.7pp | **ADOPT**, with a caveat: `expectedNet` moved the *wrong* direction (−30.8% relative) under this pass-rate-maximizing harness — the DP buys the pass-rate gain by trading ~4× longer (3.4 → 14.8 days), which costs more in accrued subscription/reset fees at this L1 stage. Same tension already flagged for MFF Rapid EOD's own L1 result and Hard Rule 3; not resolved here. |
| E8 Signature | 42.5% | 65.6% | +23.1pp | **ADOPT** |
| E8 Zero Max 80 | 35.7% | 31.4% | **−4.3pp** | **KEEP — DP worse, not tied (root cause found, see below)** |
| E8 Zero Max 100 | 35.7% | 31.4% | **−4.3pp** | **KEEP — DP worse, not tied (root cause found, see below)** |
| E8 Zero Starter 80 | 35.7% | 31.4% | **−4.3pp** | **KEEP — DP worse, not tied (root cause found, see below)** |
| E8 Zero Starter 100 | 35.7% | 31.4% | **−4.3pp** | **KEEP — DP worse, not tied (root cause found, see below)** |
| Tradeify Growth | 42.0% | 61.4% | +19.3pp | **ADOPT** |
| Tradeify Select Flex | 41.4% | 61.2% | +19.8pp | **ADOPT** |
| Tradeify Select Daily | 41.4% | 61.2% | +19.8pp | **ADOPT** |
| Tradeify Lightning Funded | 100.0% | 100.0% | 0.0pp | KEEP (degenerate — this plan passes at 100% either way at these parameters; no eval to optimize) |
| Lucid Daily (EOD) | 41.9% | 63.5% | +21.6pp | **ADOPT** |
| Lucid Daily (EOD, DLL) | 42.0% | 63.4% | +21.4pp | **ADOPT** |
| Lucid Flex | 41.9% | 63.5% | +21.6pp | **ADOPT** |
| Lucid Flex (DLL) | 42.0% | 63.4% | +21.4pp | **ADOPT** |
| Lucid Pro | 42.5% | 63.4% | +20.9pp | **ADOPT** |
| Lucid Pro (no DLL) | 42.4% | 63.5% | +21.1pp | **ADOPT** |
| Lucid Direct | 100.0% | 100.0% | 0.0pp | KEEP (degenerate, same as Lightning) |
| MFF Rapid | 41.9% | 63.5% | +21.6pp | **ADOPT** |
| MFF Pro | 41.9% | 63.5% | +21.6pp | **ADOPT** |
| MFF Builder | 42.5% | 63.3% | +20.8pp | **ADOPT** |
| TopStep, all 4 variants (Standard/Consistency × Standard/No-fee) | 42.5% | 65.5% | +23.0pp | **ADOPT** (identical across all 4 — the eval side doesn't distinguish TopStep's funded-side path/fee variants) |
| FundedNext Flex | 39.8% | 31.2% | **−8.6pp** | **KEEP — the DP is worse, not just tied** (root cause found, see below) |
| FundedNext Legacy | 42.2% | 65.4% | +23.2pp | **ADOPT** |
| FundedNext Rapid Pro | 42.4% | 63.5% | +21.1pp | **ADOPT** |
| FundedNext Rapid Daily | 42.5% | 63.3% | +20.8pp | **ADOPT** |
| AlphaFutures Zero | 42.6% | 65.3% | +22.8pp | **ADOPT** |
| AlphaFutures Standard | 42.1% | 65.5% | +23.5pp | **ADOPT** |
| AlphaFutures Advanced | 33.2% | 40.1% | +6.8pp | **ADOPT** (smallest margin of any non-degenerate plan, but still clears the 3pp bar by more than double) |

**Net result: 24 of 31 newly-measured plans adopt the DP eval policy** (nearly all comfortably past the 3pp threshold, most by 19-26pp — this is a consistent, structural gain across firms, not a fluke of MFF Rapid EOD specifically). 2 are degenerate ties (already-100%-pass plans at these test parameters, nothing to optimize). **5 plans are genuine exceptions where the DP is measurably worse, not just tied: FundedNext Flex and all four E8 Zero variants** (E8 Signature, E8's other plan, adopts fine). Root-caused 2026-09-17 (see below) — a genuine structural limitation of the DP's fixed-step grid, confirmed to have no safe surgical fix; the KEEP verdict for these 5 is final, not provisional. **Total coverage as of 2026-09-17: all 32 of the registry's 32 eval-DP-eligible plans *at the time of this sweep* now have a measured verdict** (MFF Rapid EOD + these 31) — full coverage of the then-current registry, nothing DP-eligible left unmeasured *at that time*. Apex Intraday and the two Lucid Daily-Intraday variants remain the only eval plans with no DP number by design (they're `IntradayTrailingDrawdown`, DP-ineligible in v1, not an oversight). **FTMO Futures postdates this sweep entirely and has no eval-DP verdict of any kind** — run it fresh, don't assume it behaves like a comparable firm above. Also see the DP performance-reality caveat under "Full-DP challenger (Part L2)" above — it applies equally here: a plan with an eval consistency rule (most of them) may simply be too slow to run this comparison for right now.

### Root cause of the FundedNext Flex / E8 Zero exception (investigated 2026-09-17) — genuine structural limitation, no fix applied

**Stale as of 2026-09-25, same reason as Part L1/the Full-DP eval sweep above** (N-9's DLL-headroom fix, WP22a's intraday-reach basis): this investigation analyzed `EvalStateValue.ts` as it existed before those fixes. Kept as a record of the investigation, not re-verified against the current module.

Both exceptions share a real, structural cause, directly traced in `EvalStateValue.ts`, not a copy-paste bug and not fixable by a parameter tweak without breaking other, already-correct plans — verified empirically, not just argued.

**Mechanism.** `EodTrailingDrawdown.onDayClose` (`DrawdownStrategy.ts:79-86`) ratchets `threshold` up to `balance − drawdown.amount` on every new-equity-high day, before the profit-triggered lock fires. That means `cushion` (`balance − threshold`) resets to **exactly `drawdown.amount`** on every such day — a single, extremely high-traffic state throughout the whole pre-lock phase (which, for these plans, is most of the trajectory: the lock trigger sits at 50-64% of `profitTarget` for FundedNext Flex/E8 Zero, vs. 70% for MFF Rapid EOD). `bucketOuterState`'s cushion bucketing (`floorStep`, `EvalStateValue.ts:246,253`) and the mid-day continuation lookup's `cushionBucketIndex` (`Math.floor(cushion / cushionStepDollars)`, `EvalStateValue.ts:206`) always round this value **down** to the nearest grid line. Both FundedNext Flex and all four E8 Zero variants have a **$1,500 eval drawdown** (`E8Futures.ts`'s `ZERO_DRAWDOWN`, `FundedNext.ts`'s `FLEX_SIZES.maxDrawdown`) — confirmed directly in both firm files, not assumed — which the sweep's hardcoded `cushionStepDollars: 200` does not evenly divide (1500 / 200 = 7.5), so this single, extremely common state is permanently mis-bucketed to $100 less cushion than the trader actually has, every time it recurs.

**Why this isn't "the grid is coarse, that's inherent" and needed an actual test:** a coarser-is-monotonically-worse story would predict a smooth degradation and a safe fix ("use a finer or evenly-dividing step"). Direct measurement (`computeEvalStateValue` + `simulate()`, same seed 42 / 20,000 trials / 40% WR / 1:2 R:R / 4 trades/day / 30-day cap as the sweep above) instead shows **chaotic, non-monotonic sensitivity to the exact step value, for every plan tested, not only the 5 flagged ones**:

| Plan (eval drawdown) | `cushionStepDollars` | Divides drawdown evenly? | DP vs static | Verdict at that step |
|---|---|---|---|---|
| E8 Zero Max 80 ($1,500) | $100 | yes (15 buckets) | **+26.9pp** | would ADOPT |
| E8 Zero Max 80 ($1,500) | $125 | yes (12) | +1.9pp | marginal |
| E8 Zero Max 80 ($1,500) | $140 | no | **−24.8pp** | catastrophic |
| E8 Zero Max 80 ($1,500) | $150 (= drawdown/10) | yes (10) | **+9.8pp** | would ADOPT |
| E8 Zero Max 80 ($1,500) | $160 | no | **−25.2pp** | catastrophic |
| E8 Zero Max 80 ($1,500) | $175 | no | **−26.1pp** | catastrophic |
| E8 Zero Max 80 ($1,500) | $187.50 | yes (8) | +1.5pp | marginal |
| E8 Zero Max 80 ($1,500) | **$200 (the sweep's actual value)** | **no** | **−4.3pp** | **KEEP (measured)** |
| E8 Zero Max 80 ($1,500) | $214.29 | no | **−21.1pp** | catastrophic |
| E8 Zero Max 80 ($1,500) | $250 | yes (6) | +0.6pp | marginal |
| E8 Zero Max 80 ($1,500) | $300 | yes (5) | +9.6pp | would ADOPT |
| E8 Zero Max 80 ($1,500) | $375 | yes (4) | −5.1pp | still negative |
| FundedNext Flex ($1,500) | $150 | yes | +4.1pp | would ADOPT |
| FundedNext Flex ($1,500) | $187.50 | yes | −1.6pp | marginal |
| FundedNext Flex ($1,500) | **$200 (actual)** | **no** | **−8.6pp** | **KEEP (measured)** |
| **MFF Rapid EOD ($2,000, control)** | **$200 (actual, documented)** | **yes** | **+15.8pp** | ADOPT (measured, unchanged) |
| MFF Rapid EOD ($2,000, control) | $194.44 | no | **−19.9pp** | would flip to KEEP |
| MFF Rapid EOD ($2,000, control) | $175 | no | **−13.2pp** | would flip to KEEP |
| **AlphaFutures Advanced ($1,750, control)** | **$200 (actual, documented)** | no | **+6.8pp** | ADOPT (measured, unchanged) |
| AlphaFutures Advanced ($1,750, control) | $194.44 (snap-to-nearest-divisor-count of 200) | no | −0.8pp | would flip to KEEP |
| AlphaFutures Advanced ($1,750, control) | $175 (= drawdown × 0.1, `FundedStateValue.ts`'s own `DEFAULT_CUSHION_STEP_MULTIPLE` convention) | yes | −0.1pp | would flip to KEEP |

Three conclusions follow directly from this table, not from speculation:

1. **"Evenly divides the drawdown" is necessary-looking but not sufficient.** For E8 Zero Max 80 itself, several *other* evenly-dividing steps ($187.50, $250, $375) still land at a marginal-to-negative result — only some divisor steps ($100, $150, $300) actually flip the plan to a strong ADOPT. There is no simple sub-rule ("smallest divisor," "N=10," "N=15") that is uniformly best even for one single plan.
2. **The reference plan itself (MFF Rapid EOD) is the most fragile one measured**, not the most robust: its well-established +15.8pp swings to −19.9pp / −13.2pp at two nearby, non-dividing step values. `$200` is not a specially "good" constant — it merely happens to be an exact divisor for the large majority of the registry's `$2,000`-drawdown plans, and an unlucky non-divisor specifically for the four `$1,500`-drawdown plans.
3. **Every uniform, plan-relative reformulation tested breaks a currently-correct plan.** Both a snap-to-nearest-divisor-count formula and adopting `FundedStateValue.ts`'s own existing plan-relative convention (`cushionStepDollars = 0.1 × drawdown.amount` — the funded-phase DP already does this; the eval-phase DP never adopted the same convention) are exact no-ops for MFF Rapid EOD (`$2,000 × 0.1 = $200`, unchanged) and do fix FundedNext Flex/E8 Zero (`$1,500 × 0.1 = $150`, ADOPT). But applied uniformly (the only non-overfit way to apply it — hardcoding a fifth, plan-specific magic number for AlphaFutures Advanced alone would be curve-fitting to this one seed/trial-count, not a real fix), the same formula changes AlphaFutures Advanced's step from `$200` to `$175` and flips its measured, currently-working **+6.8pp ADOPT down to −0.1pp** — i.e., it repairs the 5 broken plans by breaking one of the 26 plans that already work correctly, which is exactly the outcome this investigation was told not to accept.

**Why the sensitivity is chaotic rather than smooth:** `EvalStateValue.ts`'s backward induction memoizes a value table and picks the argmax action via a strict `<=` tie-break (`bestActionAt`, `EvalStateValue.ts:388-421`). A misaligned grid doesn't add small numerical noise to that argmax — because the mis-bucketed, extremely-common "cushion reset to exactly `drawdown.amount`" state is looked up identically by every earlier day in the recursion, a grid shift that changes which action wins at that one state cascades through the whole ≤30-day backward induction, changing the realized policy at many linked states at once. That is why neighboring step sizes can differ by 20-30 percentage points in real (`simulate()`) outcome even though the DP's own self-reported `V(initial)` moves much more smoothly (compare the `dpPredicted` column, not shown here, which never swings anywhere near as violently as the empirical `simulate()` column) — the DP's internal estimate is not the thing that actually executes; the concrete, discretization-sensitive policy it hands to `simulate()` is.

**Conclusion — no code change made.** This is a genuine structural limitation of the fixed-step-grid backward induction as currently designed (state-space discretization interacting with the EOD-trailing ratchet's exact-cushion-reset mechanic and with policy tie-breaking), not a fixable parameterization bug: no single `cushionStepDollars` value or formula was found that repairs FundedNext Flex/E8 Zero without altering — and in AlphaFutures Advanced's case, breaking — at least one already-correctly-behaving plan. `EvalStateValue.ts` was left unmodified. A real fix would need either a genuinely finer/adaptive grid specifically around `drawdown.amount` (e.g., forcing that one boundary onto a grid line regardless of step size, independent of every other bucket) or a non-grid representation of the ratchet-reset state — both are a redesign of the DP's discretization, not a surgical patch, and out of scope here. Keep the static ladder for these 5 plans; do not re-attempt a quick fix without redesigning the grid.

### TWO MODELLING RULES THAT MUST BE ENFORCED (both were bugs he caught)

1. **Position size is capped by remaining cushion.** You cannot "risk $1,400" with $100 of cushion — you get liquidated $100 in. Actual risk = `min(intended, cushion_remaining)`, and reward scales with the ACTUAL risk. Without this the search selects ladders that exploit un-placeable trades: the pre-fix winner (400/600/900/1400) showed 57.3%/5.7 days but is really 41.9%/8.2 days.
2. **Bound the grid search sensibly.** With size capped to cushion, any trade-3 value above the remaining cushion collapses to the same strategy, so unbounded searches fill the top-25 with identical "all-in" variants. Search `--max 800` on a $2,000 cushion.

**General derivation for any plan:**
```
daily_cap = consistency_pct × profit_target    # keeps best-day under the rule
rung_1    = ~20% of cushion
escalate  ~1.5x per rung, final rung = whatever cushion remains
sum(rungs) = cushion exactly
```

**Note on his ~33% figure:** that is what *uncapped* $900 risk produces (31.5% simulated). It is the output of a method he has since improved on, not a fixed personal constant. Always derive.

## DRAWDOWN ENFORCEMENT — THE TRAP

**"EOD" describes when the floor's LEVEL updates. It does NOT mean the breach is only checked at the close.** Confirmed with explicit official language at Apex ("may never touch or cross the EOD Threshold level at any time"), Tradeify ("at ANY point... fails immediately"), FundedNext ("instantly breached"), and Topstep (monitors unrealized P&L in real time).

**Breach timing is settled: the floor LEVEL updates at the close, but a touch at ANY point during the day kills the account.** Apex, Tradeify, FundedNext and Topstep all publish explicit language to this effect; Sadra confirms MFF behaves the same. All models check the breach after every trade against the fixed floor — never only at the close.

**But the cushion is NOT a rolling $2,000.** Once the floor locks (at start + $100), profit adds directly to cushion: at $4,000 profit you must lose $3,900 to breach, not $2,000. The $2,000 figure only describes the pre-lock phase. Sadra raised this and he is right — the floor formula above already handles it.

**Intraday/real-time drawdown** (TPT PRO, MFF standard Rapid funded, Apex Intraday) is materially worse: the floor locks onto **peak unrealized profit reached mid-trade**. A trade that runs favorably then reverses raises the floor permanently on money never banked. His fixed-TP style partially protects him — winners close exactly at the 2R limit and can't overshoot — so the risk lives entirely in losers that show favorable excursion before reversing.

Read `references/firm-rules.md` for account-policy rules the engine doesn't model (account caps, reset/purchase limits, live-transition triggers) — for a plan's actual trading parameters (drawdown, consistency, DLL, payout structure, fees), use `cli prop plans --firm X --variant Y` directly, per RULE #0. See `references/open-questions.md` for what is still unverified, and `references/engine-results.md` for recorded engine output (firm ranking, ladders, funded-sizing sweeps, sensitivities) before recomputing any of it.

## HIS APEX SITUATION (as of this writing)

- Had **20 funded PAs at 50K**; was moved to **Apex Live**, which collapsed them into **1 live account**.
- **$30,000 in the Bonus Vault** — pays 20% on top of live withdrawals (40% in the first calendar month only). Draining it fully needs ~$130k–150k of cumulative live withdrawals.
- Live: $0 start, $3,000 EOD drawdown, locks at +$100 once profit hits $3,100, 90/10, 10 mini contracts at Level 1.
- **Eligible for up to 5 live accounts** — one more unlocks per $4,500 of live profit.
- **Cannot run Apex sim accounts while live.** Corrected 2026-09-16: this is NOT Apex-only. This session's own live-account research (plan `dapper-snacking-horizon.md`, Part M4) confirms Tradeify, Lucid, MFF, and FundedNext all impose the same no-sim-while-live restriction (Tradeify and Lucid confirmed household-wide, not just per-account); only TPT confirmedly allows sim and live to run simultaneously (PRO+: "no buffer... sim accounts explicitly not restricted while holding PRO+"). Apex is not the outlier here, TPT is.
- Live inactivity: must be *traded* every 30 days (no profit requirement, unlike PAs which need 2 days of $50+). Extensions available if requested **before** the lapse. Safety-net distribution requires **90 days of executed trading**.

## HOW HE WANTS ME TO WORK

- **Validate against the firm's own help center.** Never third-party review sites, never a research summary, never memory. If a primary source and a synthesized report disagree, **the primary source wins** — this exact failure has happened.
- **Run the simulation, through the real engine CLI (`bun run cli prop ...`), never a custom script.** See RULE #0 above. This project used to say "he wants Python, not assertions" — the engine is TypeScript/Bun now, not Python; the actual principle underneath ("show real, run numbers, not assertions") is unchanged, just route it through `cli prop ...`.
- **Say what's unverified.** He would rather see "not confirmed" than a smoothed-over guess.
- **Be concise.** He has asked repeatedly for shorter answers. Lead with the conclusion.
- **Don't declare work finished on my own judgment** — report what was checked and what wasn't, then ask.
- **Hold the objective constant across a comparison.** Before comparing candidates (firms, plans, sizing policies), state which objective you're optimizing for (monthly, steady-state per account slot, vs. one bounded run; most money vs. fastest; low-bust vs. high-EV) and use the SAME one for every candidate in that comparison. Switching objectives between rows of the same table, or between messages without saying so, is exactly what caused a real, confusing back-and-forth this session.

## MISTAKES ALREADY MADE — DO NOT REPEAT

1. **Reasoning around a primary source instead of from it.** Every significant error traces here. Re-fetch the page.
2. **Letting a research report override a page already read directly.** Cost the correct MFF "3 funded accounts" answer, which he then had to correct.
3. **Applying bounded-target sizing to unbounded compounding and vice versa** — happened at least twice.
4. **Conflating eval logic with funded logic.** Different downside structures, different optimal aggression.
5. **Assuming funded accounts can be reset.** They cannot at Tradeify (evals only). Verify per firm.
6. **Modeling a withdrawal policy that violates his own buffer rule** — produced a false "$2,000 payouts are catastrophic" result.
7. **Using a $50,000 base for an account that actually starts at $0** — the MFF funded account opens at $0 with the floor at −$2,000.
8. **Not modeling account replacement.** Treated blow-ups as terminal, which made conservative sizing look 6.5× better than it is and produced a wrong recommendation against his own method. **Always model replacement.**
9. **Plugging in 33% as a pass-rate input** when it is the derived output of his max-risk approach. Double-counts the same fact and produced pessimistic numbers.
10. **Recommending conservative eval sizing** after he had stated the opposite rule several times. His reasoning was correct; my analysis was optimizing the wrong variable (cost per funded account instead of time to funded).
11. **Missing the daily-cap solution entirely.** Presented "max risk forces a $17,100 grind" as an unavoidable trade-off. It isn't — capping the day fixes it, and he had to point that out. **When a rule creates a bad outcome, look for the execution change that neutralises it before declaring a trade-off.**
12. **Proposing risk larger than half the daily cap** ($900 risk against a $900 cap). Incoherent: one win overshoots to $1,800, or you claw back through losses to the same place with double the exposure. He caught it.
13. **Making him repeat himself.** Several rules had to be stated three or four times. When he states a method, adopt it and model *within* it rather than re-litigating it.
14. **Writing a custom analysis script instead of using the real engine CLI.** He caught this directly and it is now RULE #0 above, not a suggestion. Everything must go through `bun run cli prop ...`.
15. **Comparing a "lifetime/renewal" answer against a "one bounded run" answer as if they were the same question**, and re-deriving a different "best firm/plan" answer each time the underlying objective silently changed between messages. The fix isn't more caveats bolted onto each answer — it's stating the objective once, up front, and holding it fixed for every candidate in that comparison (see "HOW HE WANTS ME TO WORK" above).
16. **Assuming the joint DP would be fast without checking `cli prop plans`'s consistency fields first.** It solved in ~100s for a plan with no consistency rule, and ran past 10+ minutes without converging for one that tracks a consistency rule — a firm/plan-dependent, not universal, cost. Check before running.
17. **Applying a subagent's verified fix to the main tree by copying files instead of committing it.** A second, later subagent given a fresh isolated worktree branched from the last real commit — which never saw the first fix, since it only existed as uncommitted changes in the main working tree — and had to independently re-derive overlapping ground. Not wrong to copy rather than commit (nothing should be committed without being asked), but the two fixes then had to be manually reconciled by hand afterward. If a fix from one agent needs a second agent to build on top of it in the same session, commit it (or otherwise make sure the second agent's isolated environment can actually see it) before launching the second agent, not after.
18. **Letting `firm-rules.md` carry the same trading-parameter numbers already encoded in the engine.** A firm's drawdown/consistency/DLL/payout figures live in `src/lib/prop-calculator/firms/*.ts` and are what actually gets fixed when a firm changes its rules — a hand-copied number in a markdown reference file has no way to stay in sync with that fix. Trimmed 2026-09-22 to only the account-policy content the engine genuinely doesn't model (account caps, reset/purchase limits, live-transition rules) — see `references/firm-rules.md`'s own new scope note. Don't add plan trading-parameter numbers back into that file; point at `cli prop plans` instead.
