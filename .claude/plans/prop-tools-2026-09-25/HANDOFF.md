# Hand-off to you: prop tools and the prop engine audit

Written 2026-10-02 for PT-50 step 7. Plain language. Everything here is read from the code, the two trackers and their recorded evidence:

- `.claude/plans/prop-tools-2026-09-25/PLAN.md` and `packages.md` (prop tools)
- `.claude/plans/prop-engine-audit-2026-09-23/PLAN.md` and `FINAL-REPORT.md` (engine audit)
- `.claude/prop-firms/REMAINING.md` (firm docs and paste requests)

How to read it:

- Nothing in this file was run in a browser. The UI paths in section 1 come from reading the page files and the tracker's wave log. You confirm them in your own dev server.
- The F-item table in `PLAN.md` still shows old statuses such as `todo` for items that the wave log records as built. PT-50's per-item verification is what flips them, and it is still running (section 5). Where the table and the wave log disagree, this file follows the wave log.
- Tracker numbers collide. The prop-tools tracker has its own `U1` to `U25`, and the audit tracker has `U1` to `U33`. This file writes them as `tools-U7` and `audit-U7`.
- Where the trackers state no default (Q14 to Q16, Q8) the recommendation is mine, and it says so.

## 1. UI paths to check in your dev server

Order: public tool pages first, then the signed-in accounts area. Every tool page under `/prop-calculator/...` is public. Everything under `/prop-calculator/accounts` needs sign-in and is kept out of the sitemap.

### 1.1 Things that apply to every tool page

- One `<h1>` per page, then the toolbar (Share link and Saved scenarios) on pages that share state. Pages with no shared state show no toolbar: Plan rules.
- Pages that use the calculator inputs (everything except Position size, Payout planner and Plan rules) show an inputs summary and an "Edit inputs" dialog. The Simulator page shows the full inputs form.
- Inputs carry over between tool pages. Pinned scenarios and lab results reset when you go back to the hub.
- Old links: `/prop-calculator?firm=...` should redirect to `/prop-calculator/simulator` with the query untouched. An old `#section` hash should land on the right tool page and scroll to that section (`legacyCalculatorLinks.ts`, `proxy.ts`).
- Saved scenarios: signed in, they sync to the database and your local ones are imported once. Anonymous, they stay in the browser. Open question tools-U24 below.

### 1.2 Tool pages

| Path | What to look at | What changed |
|---|---|---|
| `/prop-calculator` (hub) | Tool cards grouped Simulate, Analyse, Size, Compare, Plan, Labs. Recently used tools. A signed-in teaser with spend, payouts received, net and alert count, or a sign-in prompt. | The old 15-section page is now this hub plus child pages. Cards carry your last tool query. A legacy hash is forwarded to the right tool page. |
| `/prop-calculator/simulator` | Inputs and results, then Charts, then a new Value section (value chain card, funded value card). In the results: EV per attempt, "Bust before passing", the attempt economics card when more than one attempt is expected. | Value cards run in the tools worker under the full engine policy. Monthly net stays the first KPI. "Risk of ruin" was renamed "Bust before passing". Funded horizon is now an input. |
| `/prop-calculator/analysis` | Strategy (with Kelly), Tail risk, Drawdown duration, Resilience, Rule stress test. A skeleton shows until the base simulation finishes. | Same panels, moved from the old page. The base simulation runs only here and on the Simulator page. |
| `/prop-calculator/sizing` | Optimal risk table, Sensitivity heatmap, and a take-profit what-if card. | Take-profit what-if is new and ranks by monthly net. The optimal risk table now takes its loss-risk figures from the shared bankroll helper. |
| `/prop-calculator/compare` | Plan comparison, Firm comparison, and the Copy split section. "Open in simulator" per row. | Copy split runs the funded phase on your rulebook funded stop and risk, and names the basis in lines under the result. |
| `/prop-calculator/cash-flow` | The cash-flow panel and the new "P(ends net negative)" KPI. | The KPI and a funnel what-if form are new. Check that the firm cap wiring still shows. |
| `/prop-calculator/bankroll` (new) | Setup, Projection, Two strategies, Batch, Same EV different risk, Levers. | New page. Loss risk for a batch, the budget your own threshold needs, a reinvesting projection with bands and path ruin. Thresholds are empty until you set them in the rulebook. |
| `/prop-calculator/ladder-lab` | Ladder lab. Run a search, leave the page, come back. | The last run, its full inputs and the display instrument survive navigation. A changed input shows "inputs changed since this run" and disables Apply. A run interrupted by navigation says so. |
| `/prop-calculator/strategy-lab` | Scenario table with the live-transfer hazard input, the "E[$/mo] no transfer" and "Sent live" columns and the continuation note. | Hazard input and columns are new. The pooled MFF Pro $100,000 lifetime cap now applies across copies. |
| `/prop-calculator/planner` | The Multi-firm planner (the old Portfolio panel). | Renamed and moved. URL key `pf` unchanged. The pooled per-user cap for MFF Pro applies across accounts. |
| `/prop-calculator/position-size` (new) | Trade (risk, instrument, stop) and Position (contracts, leftover dollars, the stop that lands the risk exactly, minimum stop at the plan cap). | New page with its own share link. MES is not offered yet (blocked, section 4, CME). |
| `/prop-calculator/funded-optimizer` (new) | Funded optimizer table in the CLI order and columns. | New page. Runs under your retained cushion and payout request, with standard errors. |
| `/prop-calculator/live` (new) | Live account simulation, with a note where the model is only a firm-level approximation. | New page. E8 and FTMO say "no live stage modeled". |
| `/prop-calculator/rules` (new) | One section per firm with every modeled plan rule, from the shared describe library. | New page. Shows modeled rules only (question Q47). |
| `/prop-calculator/payout-planner` (new) | Account, Readiness, Path to payout, Payout-size sweep, Assumptions. | New page. Leads with the documented rule, names the blocking gate, shows the rule-capped withdrawable and net after split. Own share link. Signed out it uses the default rulebook. |

### 1.3 Accounts area (sign in first)

| Path | What to look at | What changed |
|---|---|---|
| `/prop-calculator/accounts` (overview) | KPI row led by spend, payouts received and net. Alerts. Cushion board. Payout readiness board. Profit concentration. Exposure. Expected net. Where EV comes from. Fresh-start projection. Next payout. Plan cap usage, Pooled caps, Live proximity. Stage funnel. Tilt vs variance. Diversification. Costs. Firm returns. Realized outcomes. Payout sizes. Funded payouts. Attempt economics. Replacement. Monthly statement. Attempt throughput. Repeatability. Timeline. Then the account list. | The whole overview is new. The account list leads with Expected payouts, Next payout, At risk if busted, EV per attempt, the basis and a Next action, and sorts by expected value by default. Retire is never suggested (question QV-19). Engine cards stream in through a worker, so they fill after the page loads. |
| `/prop-calculator/accounts/new` and `/accounts/[id]/edit` | Add or edit an account, including the ledger-only toggle (tracking), the external firm picker, round picker, personal rules, live start balance and the initial snapshot. | Plausibility errors on balance fields. Ledger-only accounts for firms or sizes the engine does not model. Prefill from the simulator ("Save as account"). The discontinued FundedNext FNL:003 plan is tagged in the plan picker. |
| `/prop-calculator/accounts/[id]` (detail) | Header figures, Plan rules, Account state, Alerts, Snapshot history, Payouts, Fees, Events, Violations (with the bust diagnosis), Replacement chain. Plus the advice panel: headline documented rule, daily plan card, engine optima, payout advice, proposed-risk check, decision log, the value sections. Also the next payout section, live transition preview and the "simulate this account" link. | Advice panel, state card, performance card, live rules card, violations and bust diagnosis, payout approval date and lag are new. Advice built on a stale snapshot says "enter today's balance" and shows no rung amounts. |
| `/prop-calculator/accounts/review` | Weekly review: one form for every active account, last decision per row (Followed, NotFollowed, NotRecorded), this week's violations, the log-violation form. | New. Decision "followed" uses one rounding step of tolerance (question QP-2). |
| `/prop-calculator/accounts/ledger` | Payouts and fees with filters and CSV export, bankroll deposits and withdrawals, firm statements and reconciliation, payout request-to-approval-to-paid lag table. | New. Needs migration 0008 applied. |
| `/prop-calculator/accounts/import` | CSV import of accounts or snapshots, per-row checks, nothing saved while any row has an issue. | New. Plausibility per row, tracking column, round column. |
| `/prop-calculator/accounts/rulebook` | Alerts, Bankroll and scaling, Deviations from the skill, Display, Eval sizing, Funded sizing, import from your trade checklist, Live sizing, Live transfer (your assumption), Payouts, Plausibility, Review, Samples, Strategy, Targets. | Rulebook v2 fields (bankroll, samples, plausibility, display unit, per-firm live-transfer hazard with "Use X%" from your measured rate). Every new field is empty or off by default. |
| `/prop-calculator/accounts/copy-groups` | Groups with one documented size for every copy, the binding member named, combined exposure, and the copy-group simulation card (run on request). | Cross-plan funded group simulation is new. Eval groups are refused with a typed reason. |
| `/prop-calculator/accounts/next-slot` | Ranked plans to buy next, then Listed not ranked, Not rankable, Still computing, Excluded, Assumptions. | New. Ranks by modeled monthly net per slot within verified cap headroom. No firm has verified caps yet (PT-35b is blocked, section 3), so firms appear as unverified. |
| `/prop-calculator/accounts/edge` | Journal win rate and expectancy next to the rulebook assumptions, drift flag, display only. | New. Never feeds the rulebook or the advice. |
| `/prop-calculator/accounts/rounds` | Rounds table, Next round, New round. | New. Budget enforcement and the override checkbox. |
| `/prop-calculator/accounts/firms` | Firm roster with status, first purchase, last activity, measured live-transfer rate, scale readiness. | New. |

If a link in the accounts subnav 404s, tell me which one. The tracker lists every accounts entry as `hasPage: true`, and a guard test is supposed to catch a missing page.

## 2. Database migrations not yet applied

Per the trackers (U3 and the FINAL-REPORT housekeeping section), none of these was applied by any agent. I did not query your database, so the tracker is the only evidence. All seven were generated with drizzle-kit and inspected. None drops a table or deletes data. Run in this order:

```
bun run db:migrate
```

| Order | File | What it adds |
|---|---|---|
| 1 | `drizzle/0007_careless_miss_america.sql` | Nine tables: `sadranl_prop_account`, `_account_event`, `_account_snapshot`, `_copy_group`, `_fee`, `_payout`, `_rulebook`, `_saved_scenario`, `_sizing_decision`. Money as integer cents, date format checks, same-owner composite foreign keys, user-scoped indexes. |
| 2 | `drizzle/0008_square_tombstone.sql` | Six tables: `_bankroll_transfer`, `_external_firm`, `_firm_engagement`, `_firm_statement`, `_round`, `_rule_violation`. Columns `round_id` on accounts and `approved_on` on payouts. A unique key on sizing decisions that migration 0009 needs. |
| 3 | `drizzle/0009_small_shadowcat.sql` | One foreign key: a rule violation can only point at a sizing decision of its own account and user. Split out because drizzle-kit orders it after the unique key in 0008. |
| 4 | `drizzle/0010_outgoing_hitman.sql` | Ledger-only accounts: `firm_id` and `plan_serial` become nullable, new `external_firm_id`, `plan_label` and `tracking` (default `modeled`), a foreign key, an index and a shape check that keeps modeled accounts complete. |
| 5 | `drizzle/0011_overrated_mastermind.sql` | Rebuilds one index (sizing decisions by user, account, decided date descending) so the latest decision per account is not a sort of every row. |
| 6 | `drizzle/0012_stormy_silverclaw.sql` | One index on rule violations by user and date, for the weekly review. |
| 7 | `drizzle/0013_tough_pandemic.sql` | One unique partial index on rule violations (user, sizing decision, kind) where a decision is set, so the same violation is never recorded twice for one decision (PT-85). Created before any row exists if you run it with the others. If the violations table already holds rows (0008 applied earlier), first run the read-only check `SELECT user_id, decision_id, kind, count(*) FROM sadranl_prop_rule_violation WHERE decision_id IS NOT NULL GROUP BY 1, 2, 3 HAVING count(*) > 1`: any row it returns would make the index fail, so resolve those duplicates in the app first (the catch-up database review, SEC-1). |

Notes:

- Never `db:push` for these (project rule). The journal (`drizzle/meta/_journal.json`) lists 0000 to 0013.
- Migrations 0001 to 0005 do not replay on an empty database. This is old and recorded in the FINAL-REPORT. A fresh setup would fail. A database that already has them is fine.
- A later migration is still expected: PT-30b adds a DP-advice table (`prop_dp_advice`, with `value_samples_cents`). It has not been generated yet, because PT-30a to PT-30d have not started (section 5). Question Q42 asks whether the agent should only generate it.
- Pages that read these tables fail until the migrations run: every accounts page, the hub teaser, saved-scenario sync.

## 3. Open questions

Nothing below has a recorded answer. The plan and the engine run on the stated default until you answer. Your decisions P1 to P4 in `DECISIONS.md` are the only answered ones.

### 3.1 Needs your answer first

| ID | Question | Options | Recommended |
|---|---|---|---|
| Q14 (PT-35) | The firms disagree with themselves on live-transfer payout counts: Tradeify (3 per account and 10 total, versus "4-5", versus "5", versus "4"), MFF Pro, MFF Builder, Alpha, Lucid Pro and Direct ("after Payout 5" versus "No simulated payout caps"), FundedNext Flex (15, 5 or $100,000). What should the engine do with a conflict? | (a) Treat conflicts as "not checked". (b) Cap at the lowest stated count and mark it Conflict. Today (b) changes only Tradeify, to 3. | (a). Mine, not the tracker's. Tradeify's own article calls its 3 and 10 "minimum requirements for consideration, not automatic qualification", and PT-35 says never to emit a count cap for a discretionary trigger. Without an answer, every firm stays "live triggers not checked". |
| Q15 (PT-35) | MFF Rapid 50K: the firm says accounts bought on or after 2026-08-25 close after 7 calendar days without a trade (article 16596524). The engine's Rapid 50K sets no inactivity closure and its note calls Rapid exempt. | (a) Fix the plan after a same-day re-fetch. (b) Park it with the audit's parked firm-data steps. | (a). Mine. The firm states it in writing and the engine currently errs in the optimistic direction. |
| Q16 (PT-35) | Count the 2026-09-23 Apex Live FAQ paste (page dateModified 2026-06-30) as verified for live exclusivity and the discretionary trigger? Apex answers 403 to every fetch. | (a) Count it as verified from a user paste, with its dates shown. (b) Keep Apex unverified. | (a), and send the fresh paste in section 4 so the date can be refreshed. Mine. PT-35's model has a "UserPaste" source kind for this case. The `MAX_FUNDED_ACCOUNTS = 20` cap stays unverified either way. |
| Q14 companions | Decisions PT-35 step 0 left before encoding: does `intercom.help/E8futures` count as E8's own help center (the canonical host answers 403); is Lucid Daily's $8,000 trigger automatic or discretionary (two Lucid pages disagree); E8 Signature inactivity 7 or 60 days; Tradeify Elite Live inactivity 30 days or a calendar week (the agreement's precedence clause favours 30); TPT PRO while PRO+ exclusivity (the signed terms would settle it); Alpha Standard and Advanced cap trigger (ask Alpha support). | Per item, pick a reading or send the page. | Accept the E8 host. Leave the others unverified until the firm answers. |
| Q8 (PT-13b) | May a pasted copy of CME's Micro E-mini S&P 500 contract-spec page, with its URL and date, count as the live source for adding MES? CME answers 403 to automated fetches. | Yes, or MES stays blocked. | Yes. Mine. It is the same handling the audit used for Apex pastes. |
| QP-1 (PD-44) | Personal caps on the eval ladder. With a personal max risk per trade or a personal daily profit cap set, every eval rung is capped by it and the rungs can sum to less than the cushion. | Confirm, or say the last rung should still take the remaining cushion above your personal cap. | Confirm (the tracker's default). The advice never sizes above your own limit. |
| QP-2 (PT-27c) | Two "followed" rules by design. The weekly review and the overview count a decision as followed when actual risk is within one rounding step of the accepted risk. The bust diagnosis keeps a strict "actual above accepted" test. One decision can read "followed" in the review and "risk above accepted" on the bust card. | Keep both, or let the bust diagnosis tolerate one step too. | Keep both (the tracker's default). |
| Q42 (U3, PT-30b) | Migrations: should an agent ever apply them? | Generate and inspect only (default), or also apply. | Keep it as is. You run `bun run db:migrate` yourself. |
| Q43 | Run the full Vitest suite once at the end? | Once at the end, or per-folder runs only. | Already answered in effect: your 2026-10-01 instruction is full lint and suite once at the very end, tests on the PC, none over 5 minutes. Say so if you want different. |
| Q40 | CPU budget for the DP gate run and may it run beside other CLI jobs? | A budget, or no limit. | Answered in effect: on 2026-10-02 you asked to keep the PC fully used. Three solves at once left the PC with 3 GB free, so the PC queue now starts at most three at once, memory permitting. |

### 3.2 Video $550K items (QV)

All open. Source: `video-550k-packages.md` section 4. "Default" is what the plan does now.

| ID | Question | Default in use |
|---|---|---|
| QV-1 | Ledger-only accounts: only modeled firms at unmodeled sizes, also firms the engine does not model (Hola Prime, Funded Seat, others), or none. | Also unmodeled firms, no engine value for them. |
| QV-2 | Which firms and sizes to research from live pages first (the video author trades mainly 150K; same as tools-U18). | Nothing new. Research of modeled firms runs read-only. |
| QV-3 | Link journal trades to prop accounts so conduct detectors can run (reverses tools-U11)? | No. Violations are logged by hand. PT-70 waits. |
| QV-4 | Win rate that depends on the reward multiple for take-profit choice: none, a drift model fitted to your 40% at 1:2 (what-if only), or a table you enter. | Drift model, what-if rows only. A separate funded win rate inside one run (PT-64b) waits for an explicit answer. |
| QV-5 | Bankroll-dependent objective: monthly net always, rank plans to buy by lower loss risk below a bankroll threshold, or show all three. | Monthly net always. The threshold field exists and is empty. It never changes your rungs or risk. |
| QV-6 | Let realized figures feed engine rankings as an opt-in calibration. | Display only. |
| QV-7 | Your own thresholds: loss risk for a budget, minimum samples before a rate counts as adequate. The video's 0.5% and 50/50 are the author's, not yours. | Empty. Figures show n, intervals and loss risk with no badge, gate or alert. |
| QV-8 | Keep the flat $250 funded headline (same as tools-U5) or change it when the state-dependent optimum differs beyond noise. | Keep it and show the "flat risk ignores state" reason. |
| QV-9 | Record a separate net-worth figure. | No. |
| QV-10 | Under a small bankroll may loss risk change the payout request, or only show smaller requests as what-if rows. | What-if rows only. |
| QV-11 | Live-transfer hazard per firm: enter your own, or leave transfers unpriced. | Enter per firm, empty by default. Once set, it prices every value run of that firm's accounts, with per-surface disclosure. |
| QV-12 | Add an "account fixation" flag to the journal. | No. ChasedLoss and ForcedRecovery cover it. |
| QV-13 | Firm-reported totals: do your dashboards show gross or net? | Required per statement, no default. |
| QV-14 | Capacity unit: accounts you can trade per day, a copy group counting once. | Yes. |
| QV-15 | A spent round budget: block the purchase with an override flag, or warn only. | Block with an override flag. |
| QV-16 | Round suggestions from purchase gaps: gap length. | 14 days, editable. |
| QV-17 | Plausibility of expectancy per trade: typical up to 0.30R, strong up to 0.35R, implausible above. | These values, editable. |
| QV-18 | Reduce funded risk while an account is payout-eligible. | No. Request the payout at the documented rung. A reduced-risk row appears only as an engine what-if. |
| QV-19 | May the app suggest retiring an active funded account whose expected cash rate is below a fresh slot's (Hard Rule 7)? | No. Shown as information, the Retire action is never emitted. |
| QV-20 | Which expectancy is authoritative: 0.20R (40% at 1:2) or +0.26R (the skill's "his numbers")? | Show both with sources. SKILL.md is not changed. |
| QV-21 | Should EV per attempt ever replace expected monthly net as the simulator headline? | No (Hard Rule 8). EV per attempt sits beside it. |

### 3.3 Engine audit questions (audit-U1 to audit-U33)

All open per `audit PLAN.md` and `FINAL-REPORT.md`. The engine uses the default today. U1 to U23 are in the FINAL-REPORT with full options; U24 to U33 were added after it.

| ID | Question | Default in use | Alternative |
|---|---|---|---|
| U1 | Funded DP cycle-baseline grid (`cycleBaselineFineRangeMultiple`). | 1 (FTMO Growth coarse config $15,312.21). | 0 ($15,348.41, not a safe lower bound) or 6 (exact, $15,801.07, about +$489, about 2x slower). |
| U2 | Alpha Qualified payout split. | 70/80/90 by payout number (General Service Agreement). | Flat 90% (Terms Schedule 2, help center, product page). |
| U3 | Alpha 40% consistency boundary and the net-losing-cycle block. | Inclusive (fails at exactly 40%), losing cycle blocked. | Exclusive. Confirm the block, which no source states. |
| U4 | MFF Pro one-time early withdrawal. | Off by default. When taken it counts as the first payout and the loss limit moves to start + $100. | On by default. Confirm the assumption and whether "every 14 days" counts from the previous payout. |
| U5 | Alpha Qualified Reset. | Off. Reset fees divided by eval passes. | On by default. Divide by passes plus resets. |
| U6 | MFF Pro evaluation lock at start + $100. | Kept. | Remove it (FAQ prose names only the first payout as the trigger). |
| U7 | TopStep Live Funded readings (micros 1:1 against the 5-lot cap, tier timing, Friday safeguard, $50,000 default XFA balance, default cushion leaving exactly $10,000). | As listed. | Confirm each, add an `--xfa-balance` input, or keep one cent more cushion. |
| U8 | E8 Zero scaling: does an unlocked trigger survive a losing day? | A trigger can drop. | Needs an E8 page or support answer. |
| U9 | TopStep Standard-path activation discount with a DLL. | $149 kept. | Needs the checkout amount. |
| U10 | FundedNext basket discount on the Rapid Pro DLL Add-On. | 15% off $259.98. | 15% off $299.98. Needs the basket checkout. |
| U11 | Lucid 25K Evaluation DLL. | 50K only modeled. | Needs the 25K checkout. |
| U12 | Unconfirmed cart prices: Tradeify Select reset $109, Lucid DLL-ON promo on resets, MFF Rapid Live $250 minimum. | As modeled. | A cart or dashboard screenshot. Optional. |
| U13 | Apex Live Bonus Vault and 90-day safety net. | Not modeled, disclosed. | An optional input. |
| U14 | Funded DP best-day grid on consistency plans. | Exact grid (MFF Builder 663.8 s per rate solve, about 1.5 h at full defaults). | Conservative 6-bucket ceiling grid with a disclosure, or coarsen the whole grid. My suggestion: answer after the DP speed work (WP66) lands, since it targets these solve times. |
| U15 | FundedNext Flex reset price basis. | $77.99. | Your dashboard's 50K Flex and Rapid reset price. |
| U16 | Bundle discount on lockstep renewals. | DP and `simulate()` re-buy together with the bundle discount, the timeline discounts only each slot's first card. | Treat re-purchases as single orders. Also whether copies 6 and 7 of a Tradeify bundle are discounted. |
| U17 | Horizon credit and default ranking. | One capped request, ranking credit-inclusive, credit-free shown beside. | Bounded continuation value, or zero. Rank credit-free. Honour terminal caps such as Lucid Daily's $15,000. |
| U18 | Percent-of-cushion sizing. | Needs `--stop-points`, whole contracts, one contract when it busts, flat risk rounded. | Refuse without a stop, or default to a documented instrument and stop. |
| U19 | Hard Rule 2 on daily-payout plans: retain exactly $2,000 or at least $2,000? | Request everything above $2,000. A $500 request still leads on TPT ($2,192 vs $1,947) and MFF Rapid EOD ($2,420 vs $1,999). | Capped request as the base policy. |
| U20 | DP convergence precision. | Rate search stops at $0.05 a day, finer than the value iteration certifies. | Tie the tolerance to the error bound, or tighten it. |
| U21 | Lockout DLL room below one contract. | Skip the trade, day ends. | Trade a fractional contract symmetrically. |
| U22 | MFF Pro sim-funded limit: 5 micros at 50K or a publishing error for 50. | 5. | Needs MFF support or your dashboard. If 50, MNQ rows are re-run. |
| U23 | Percent rows at wide stops (FundedNext Legacy 50% cushion: $3,744 at 10 points, $14,284 at 40). | Shown with a disclosure. | Leave 20-point and wider percent rows out of ranked comparisons. |
| U24 | Paste requests from PT-71. | See section 4. | Paste, or confirm the modeling defaults. |
| U25 | FundedNext Live withdrawal floor: article 16522296 says $2,000 in section 5 and $1,000 in section 6. | $1,000 trading floor plus $2,000 withdrawal floor, disclosed. | Ask FundedNext which section is current. |
| U26 | MFF Rapid 50K scaling ("start off with 2 contracts"). | Disclosed only. | Support answer, then a tiered cap. |
| U27 | Tradeify Lightning payout basis. | 0 minimum days (policy article). | Use the homepage's 5-day cadence. |
| U28 | Alpha Qualified-stage monthly fee. | None (help center and Terms). | Model $139 a month as the product pages say. |
| U29 | FundedNext FNL:003 (discontinued) 5-day wait before the first reward. | Keep the 5-day gate. | No wait, record the Labs card as a conflict. |
| U30 | Alpha live "Scaling Daily Loss Limit (30% of account)": what is it measured on? | Unmodeled, disclosed. | Model it from your reading. |
| U31 | Alpha Advanced Qualified maximum loss: $2,000 (signed Terms) or $1,750 (product card, article). | $2,000. | $1,750 (stricter). |
| U32 | TopStep Combine 55% consistency at exactly 55%. | Exactly 55% passes. | Stricter reading, as Alpha and TPT use. |
| U33 | TopStep Pro Account "up to 50% of the account and up to $5,000": a share of what? | $2,000 dollar cap at 50K, 50% unconfirmed. | 50% of profit above the $10,000 start (roughly halves early payouts). |

### 3.4 Remaining prop-tools questions (the default is in use)

Source: `PLAN.md` ("Decisions and inputs waiting for the user") and `packages.md` ("Open user questions"). Q-numbers are the tracker's.

| ID | Question | Default in use |
|---|---|---|
| tools-U1 | Who may use the accounts manager. | Any signed-in user plus abuse limits. Alternative: root-only like accounting. |
| tools-U2 | Money storage. | Integer cents. Alternative: a dinero.js USD type. |
| tools-U4 | Default eval mode. | The general-derivation ladder. MFF fractions and the max-risk mode are opt-in. |
| tools-U5 | Funded headline. | Flat $250 risk, $500 take-profit. Same as QV-8. |
| tools-U6 | Retained cushion. | $2,000 on eval and funded, live uses the larger of $2,000 and one live drawdown. |
| tools-U7 | Copy trading. | Independent unless grouped, groups share a stage. |
| tools-U8 | Payout request default. | $500, raised to the plan minimum. Alternative: withdraw everything above the cushion (labelled the danger zone). |
| tools-U9 | DP advice persistence. | CLI `--store`, user-scoped row. |
| tools-U11 | Journal trades linked to accounts. | Aggregate, display only. Same as QV-3. |
| tools-U12 | EUR view and accounting link. | Out of scope. |
| tools-U13 | Anonymous landing. | The hub. |
| tools-U15 | Engine commit in provenance. | Omitted. |
| tools-U16 | Alert thresholds. | Funded snapshot stale after 7 days, near floor under 2 x funded risk, eval days left 5 or fewer. |
| tools-U17 | Firm questions feeding pooled caps. | "Unverified" badges. Alpha cap trigger still open. |
| tools-U18 | Account sizes other than 50K. | Blocked. Needs your list of firms and sizes first. |
| tools-U19 | Rulebook edits below the hard rules. | Override flag, headline relabelled custom. Alternative: hard block. |
| tools-U20 | Quotas. | 60 mutations a minute per router. |
| tools-U22 | $500 payout default against the engine output. | Keep $500, show the optimum beside it with "payout-policy sensitive" marks. |
| tools-U23 | TopStep live reserve state. | Not stored. |
| tools-U24 | Local saved scenarios after the first import. | One-shot import, local panel hidden. Alternatives: track by content, or keep showing both. |
| tools-U25 | Which trading plan is "active". | New loader picks active, then sort order, then newest. Alternative: one shared function. |
| Q1 | Rank funded results credit-inclusive or credit-free. | Credit-inclusive, credit-free beside it. |
| Q2 | Documented-policy runs have no instrument or stop. | Unsized and labelled optimistic. |
| Q3 | Hard Rule 2 as a capped $500 request or everything above $2,000. | Capped request. |
| Q4 | End-of-horizon credit under FullRequestOnly. | Unchanged one capped credit. |
| Q5 | Profit-share cap below the request. | Wait until the full request fits. |
| Q7 | Off-tick exact stop ($455 on 2 NQ is 11.375 points). | Round down to the tick, exact figure as a note. |
| Q9 | Mid-eval ladder horizon. | Counted from the attempt start. |
| Q10 | TopStep live reserve on reconstruction. | $0. Alternatives: $40,000 or a new field. |
| Q11 | From-state objective definition. | As built, credit-inclusive and credit-free. |
| Q12 | MFF Pro retained cushion measured from the $50,100 floor. | Engine's floor. |
| Q13 | TopStep ReleaseFloor engine fix. | Keep the engine, the advice path is correct. |
| Q17 | Eval rule once the target is reached but days or consistency are unmet. | Trade the smallest placeable risk. |
| Q18 | Personal caps in simulated documented numbers. | Rulebook only. |
| Q19 | Cushion board units per stage. | Funded in documented dollar risk, eval as a share of the eval drawdown, live against the live cushion. |
| Q20 | Alert thresholds with no rulebook field. | Proposed defaults. |
| Q21 | One inactivity rule. | Calendar days against the engine limit, with disclosure. |
| Q22 | PayoutEligible alert. | Only when the documented rule allows it. |
| Q23 | Deduct requested payouts after the snapshot date only. | Yes. |
| Q24 | Personal payout override "safe band". | Within 2 combined SE of the optimum. |
| Q25 | `prop advise` flag names. | Reuse `--retain-cushion` and `--request-size`. |
| Q26 | Realized funded survival. | Open accounts counted as survivors, disclosed. |
| Q27 | Does the copier place the same contracts on every account. | Not stated in the tracker. Needs your answer. |
| Q28 and Q29 | Server-side plausibility rejection. | Yes. Hard block for impossible states, override only for the "far from account size" heuristic. |
| Q30 | Funded optimizer policy source. | Calculator values, else the rulebook, never the plan default. |
| Q31 | `@noble/hashes` for browser sha256. | No new dependency, server flag. |
| Q32 | Firms with open paste items. | Show last full verification date with open items listed. |
| Q33 | Verified count trigger the firm calls a benchmark. | Still blocks the payout, quote shown. |
| Q34 | Conduct alerts with app-chosen thresholds. | Same-day multi-bust, rebuy within 7 days. |
| Q35 | Margin below MFF Rapid's $10,000 single-session trigger. | $50. |
| Q36 | Household members holding accounts at the same firms. | Disclose, never count. |
| Q37 | Eval copy groups in v1. | Funded only. |
| Q38 and Q39 | DP gate: at least the best flat at a matched cushion, and whether one passing row validates eval rows. | As stated. |
| Q41 | Exact best-day grid on consistency plans (audit-U14). | Exact, skip over-budget plans with a reason. |
| Q44 | Copy-group stage check counts ended members. | Yes, today's behaviour. |
| Q45 | Ladder rule at an observed pass chance of 1. | Stays scorable, cost SE shows 0. |
| Q46 | Horizon credit below a plan's minimum request. | Credit still paid. |
| Q47 | Firm notes on the rules page. | Modeled rules only. |
| Q48 | Saved scenarios the stricter lab schema refuses. | Rest of the record loads, notice shows the reason. |
| Q49 | What MFF Pro's "$100,000 Maximum Payout (per user)" covers. | Lifetime total per user across Pro accounts of every size, Pro only. Ask MFF support. |
| Q50 | Intervals gating the breakeven margin. | Pass-rate interval only. |
| Q51 | Execution deviation to violation map. | Pinned: only sized-up counts as Oversize. |

Moot: Q6 (lane E waited for G2, and G2 was met 2026-09-26 17:50) and tools-U10, tools-U21 (coordination rules that no longer bind).

### 3.5 Final verification questions (QF)

Source: `packages.md` ("Final verification fix packages (PT-97 to PT-118)", register "New questions proposed"). Each default is in use and the plan proceeds on it; a different answer changes only the package named.

| ID | Question | Default in use |
|---|---|---|
| QF-1 | On a funded consistency plan the first day of a cycle has no cycle profit, so the consistency ceiling is 0 and the daily plan card says "No trade is placeable today". What should the card say (PT-105, F-146, F-154)? | The card keeps the documented rungs and says the rule is checked at the request (a violation only pushes the payout out). |
| QF-2 | Does a personal max risk per trade apply on Live accounts (PT-103, PT-108, F-62)? | Yes, as a tighter cap. Alternative: disclosed and ignored. |
| QF-3 | Does the rulebook's live cushion percent (5% before the lock, 10% after) build every modeled live plan, replacing the firm builders' constants (TopStep's builder says 5% after the lock) (PT-114, F-104)? | Yes, the rulebook is your own rule. |
| QF-4 | Does eval advice list "live triggers not checked" like funded and live advice (PT-104, F-125)? | Yes, as the acceptance text says, although it is arguably not applicable to eval rungs. |
| QF-5 | In the weekly review, is a row you did not touch left unrecorded (no snapshot, no decision) unless you tick it (PT-100, F-63)? | Yes. |
| QF-6 | Is the solver version left null on Monte Carlo rows (trials and seed carry their provenance), with only DP rows (PT-30) carrying one (PT-104, F-126)? | Yes. |
| QF-7 | A ledger-only account you record directly at the Live stage: does it count as a funded-to-live transfer in the firm's live transfer rate? That rate becomes the suggested live hazard on the rulebook, which affects sizing (PT-87b, F-V26). | Yes, as the funnel counts it today, and the hazard text says how many such accounts it includes. Alternative: count only accounts that moved from funded to live. |
| QF-8 | If an account's stored tags are corrupt (tags are cosmetic), should editing the account still work and repair them, or should every change to that account be blocked until the data is repaired, as for personal rules and opt-ins (PT-110b, F-44)? | Editing works and repairs them; the account list marks the row as having corrupt tags until then. |

## 4. Paste requests

All open pages answered 403, a login wall, a geo-redirect or an empty script shell on 2026-10-02. None was worked around. Open each in your logged-in browser, paste the whole page unless a note says otherwise. The master list is `.claude/prop-firms/REMAINING.md` section 5. Extra rows below come from the trackers. If you can only do a few, my pick is the first three: they unblock the one blocked live-transfer note, the one open fee-basis question you can read yourself, and MES.

1. Apex Live FAQ, with its `dateModified` from the page source. Only page behind the Apex live-transfer note.
2. FundedNext dashboard reset price for a 50K Flex and a 50K Rapid account.
3. CME Micro E-mini S&P 500 contract specs (unblocks MES, Q8).

### Apex (every apextraderfunding.com URL is 403)

| URL | What it settles |
|---|---|
| `https://apextraderfunding.com/help-center/getting-started/apex-live-prop-trading-program-faq/` | The only page behind the `ApexUserPasteOnly` note (R-V6). Refreshes the 2026-09-23 paste (dateModified 2026-06-30) that 8 PT-35 Apex rows rest on. Bears on Q16. |
| `https://apextraderfunding.com/` | Homepage product picker (`window.productPickerConfig`): current prices. |
| `https://apextraderfunding.com/pricing/` | Current prices (T4 fee sweep). |
| `https://apextraderfunding.com/legacy-products/` | Whether the Legacy $167 to $697 promotion is still sold. |
| `https://apextraderfunding.com/help-center/billing/evaluation-plan-fees-and-access-explained/` | Activation and reset fees, eval cap and throttle, the eval access window (PT-07 handoff). |
| `https://apextraderfunding.com/help-center/performance-accounts-pa/how-many-paid-funded-accounts-am-i-allowed-to-have/` | The PA cap. The engine uses 20 with no source (Q16). |
| `https://apextraderfunding.com/help-center/billing/inactivity-policy-on-performance-accounts-pa/` | Apex inactivity rule (PT-35). |
| `https://apextraderfunding.com/help-center/getting-started/code-of-conduct/` and `.../prohibited-activities/` | Conduct patterns (PT-35). |
| `https://apextraderfunding.com/terms-and-conditions/` and the User Agreement, Privacy and Refund pages (URLs unknown) | No Apex legal document has ever been read. Payout splits and termination triggers live there. |
| `https://support.apextraderfunding.com/` | Older Zendesk host, never read. |
| `https://apextraderfunding.com/sitemap_index.xml` | Re-diff the 129-page list. |

### Lucid (Cloudflare 403)

| URL | What it settles |
|---|---|
| `https://lucidtrading.com/` | `LucidPricingConfig`: reset products, DLL-ON promo, whether LucidDirect has a reset. |
| `https://lucidtrading.com/checkout/` | A real LucidDirect re-buy or reset price, and whether 25K LucidPro has a DLL toggle (audit-U11). |
| `https://lucidtrading.com/pricing/` | Public list prices, including the one-time LucidDirect fee at 25K, 100K and 150K. |
| `https://lucidtrading.com/lucidpro/` | Plan page. |
| `https://lucidtrading.com/terms-of-use/` | Arbitration, eligibility and subscription quotes. The one PT-35 Lucid needs-paste row. |
| `https://lucidtrading.com/lucid-trader-agreement/` | Never read. May say whether a breached LucidDirect funded account can be reset and at what price. |
| `https://dash.lucidtrading.com/` (login) | A screenshot of one funded and one live account dashboard settles the dashboard fields. |

### MFFU

| What | What it settles |
|---|---|
| The Simulated Trader Agreement and its Appendices, from your own MFFU account or checkout | The binding sim-funded terms. No public URL exists. |
| `https://myfundedfutures.com/challenge?id=84` (Builder checkout) and `?id=70` | Whether a Default/Add-On (MLL) toggle or second price appears at Builder 25K, 100K and 150K. |
| Dashboard reset prices for Pro 50K and Rapid EOD 50K; any firm-set Rapid Live daily loss limit | Audit-U24 and U12. Support answers also settle U4, U6, U22 and U26. |

### E8 Futures (help centers 403)

| URL | What it settles |
|---|---|
| `https://helpfutures.e8markets.com/en/articles/11640147-account-reset` | Reset fee source, 10% restart discount, any absolute reset price. |
| `https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures` | The $150K drawdown conflict (2.6666% in the site config against $4,500), minimum payout, inter-payout gate. |
| `https://helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes` | Audit-U8 (Zero scaling). |
| `https://helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max` | Zero rules. |
| `https://helpfutures.e8markets.com/en/articles/15936479-40-best-day-rule-challenge` | The $6,100 against $6,250 summary-line conflict. |
| `https://e8x.e8markets.com/orders/purchase?a=HV&b=100&dr=3&p=80&d=E8` | Signature checkout: what a $50K Signature costs, whether code E8 is pre-applied, any reset price. |
| `https://e8x.e8markets.com/orders/purchase?a=ZM&b=100&dr=3&p=80&d=E8` | Zero MAX checkout. |
| `https://e8x.e8markets.com/`, `/trading-symbols`, `/claim-free-trial` | Product pages. |
| `https://e8markets.com/` and `https://e8markets.com/__sitemap__/en.xml` | Main site and its sitemap. |
| `https://help.e8markets.com/en/`, `https://helpfutures.e8markets.com/en/`, `https://helpfutures.e8markets.com/sitemap.xml` | Help center index and sitemap. |

PT-35 step 0 read E8 articles through `intercom.help/E8futures` instead, pending your acceptance of that host (Q14 companions). The E8 engine notes cite two pages that are now 404 (10253631 and 11864618).

### FTMO Futures configurator

| URL | What it settles |
|---|---|
| `https://futures.ftmo.com/en/configure-account/` (also `https://futures.ftmo.com/configure-account/`, the target of every "Start now" button) | Login wall. Open it signed in and paste any price, fee or reset text. |
| The Sim-Funded Account Terms and Conditions sample, if you have one (FTMO sends a sample on request through support) | Every Sim-Funded and Live Funded rule rests on it and it is not published. |

### TPT and NinjaTrader

| URL | What it settles |
|---|---|
| `https://takeprofittrader.com/pricing` | Monthly Test list price per size. $170 at 50K is only derived from promo FAQs. |
| `https://takeprofittrader.com/api/subscriptions/products` | Plan-card daily loss limit and max position size per size for Test, PRO and PRO+. |
| `https://ninjatrader.com/pricing/commissions/` (redirects to the Europe page) | The US commissions page that "Commissions for PRO+" links, for PRO+ commission figures. |
| `https://takeprofittrader.com/terms/` and `/privacy-policy/` | Re-verifies the README quotes. The terms would also settle the PRO-while-PRO+ exclusivity conflict. |
| Also listed in the tracker: `/faq`, `/rules`, `/pro-plus`, and the PRO contract sent to traders | Not public. Optional. |
| HTML of the Zendesk articles 15172012844957 (Commissions for PRO) and 22447557656477 (Restricted Countries) | Optional. Their text was read through the Help Center API. Say if you want the API route dropped. |

### Tradeify (Cloudflare 403)

| URL | What it settles |
|---|---|
| `https://help.tradeify.co/en/articles/14369021-tradeify-pricing-reference` | Prices. |
| `https://help.tradeify.co/en/articles/12969284-tradeify-elite-program` | Elite rules, live cooldown. |
| `https://help.tradeify.co/en/articles/10495932-lightning-funded-account-payout-policy` | Lightning payout basis (audit-U27). |
| `https://help.tradeify.co/en/articles/12853966-select-flex-and-select-daily-payout-policies` | Select payout rules. |
| `https://help.tradeify.co/en/articles/12268167-essential-trading-rules-overview`, `.../10468258-welcome-to-tradeify`, `.../10495915-growth-evaluation-accounts`, `.../11083796-growth-funded-account-payout-policy` | These rest on archived copies only. |
| `https://help.tradeify.co/sitemap.xml` | Article list. |
| Logged-in Select 300K V2 checkout from `https://tradeify.co/select-plan` | Whether the $349 V2 eval is purchasable, and whether the stale reset-fee figures show at checkout. |

PT-35 step 0 read the Tradeify articles through `intercom.help/tradeify` on 2026-09-26, so the tracker says this list can likely be dropped.

### FundedNext and Alpha Futures

| What | What it settles |
|---|---|
| Your FundedNext dashboard reset checkout for a 50K Flex and a 50K Rapid account (login only) | Audit-U15 and the reset fee basis. |
| `https://helpfutures.fundednext.com/en/articles/14283903-road-to-live-trading-legacy-challenge-rapid-challenge-former`: the four images of Scenario 1 and 2 | The per-withdrawal figures exist only in images. Closes `legacy-live.md`. |
| The FundedNext basket checkout for five Rapid Pro DLL Add-On accounts | Audit-U10. |
| `https://app.alpha-futures.com/signup`: the code field and the rendered promo behaviour | Whether DIRECT35 or ALPHA40 applies (first month or every rebill, resets, Qualified-stage price). Bears on audit-U28. |
| A question to Alpha support: the Standard and Advanced cap trigger, and whether evals count toward "up to 5" | Alpha's Qualified cap trigger. |

### TopStep

No page is needed. Audit-U9 needs one checkout screen showing the Responsible Trading Discount amount on an XFA activation with a DLL.

### CME MES

| What | What it settles |
|---|---|
| CME's Micro E-mini S&P 500 contract-specifications page | Adds MES (point value 5, tick 0.25, tick value 1.25 are what the planned test expects, so they must be confirmed on the page). CME answered 403 to an automated fetch on 2026-09-26. The trackers do not record the exact URL, so it is not given here. Cite the URL and the date with the paste (Q8). |

## 5. What is still running or pending

The trackers record no expected finish time for any of these. I did not check running processes. "Running" below means the tracker still says running at the time of writing. Nothing here is done.

| Item | What it is | Tracker status | Depends on, and what the trackers record about timing |
|---|---|---|---|
| WP60 | Funded replay builds its policy tree from the exact day-start cushion (audit N-89, the DP predicting more than its own replay earns). | Running (wave 69). | Probe (a) E3 finished on the Mac: predicted-against-replay gap -$777 against -$1,040 before it. One default-grid TopStep solve (the E3 probe) took 8,248 s on the Mac. A coarser-grid solve took 11,339 s on the PC under agent test load. A 5-hour runner cap already killed one run (G1), since raised to 12 hours. Probe (b): bmin was moved to the PC, bexact is queued behind it. |
| WP66a | DP speed part A: eval fast path, `--workers` flag, fewer rate-search solves, watchdog fix, N-90c measurement. | Running (wave 70). | Beside WP60. The N-90c Alpha run threw after 121.6 s on the old fixed watchdog and waits for this. |
| WP66b | DP speed part B: allocation-free inner loop, one payout regime, policy-cached sweeps. Target: a default-grid TopStep solve in about 5 minutes on the PC. | Todo, after WP60. | The 5 minutes is a target, not a measurement. |
| PT-36s | One CLI wording for a priced live trigger, projection disclosure, personal limit in the floor-rung reason. | Running (EJ8-p). | Recent waves of this kind took 25 to 72 minutes. Item F-145 waits for it. |
| PT-30a to PT-30d | DP advice: gate re-run (a), table, migration and router (b), `prop advise --dp --store` (c), web row (d). | Not started. | PT-30a waits for the N-89 funded-side fix (WP60) and the DP speed work. Then b, then c and d. The DP-advice migration comes with b. |
| DP figure reruns | Re-measured DP rows and the gate result recorded in `engine-results`. | Pending. | After WP60 and WP66. Until then no DP number or "validated" flag from before the fixes should be trusted, and the skill says so. |
| CLOSE-1 | Close-out review of 13 audit items (N-77 to N-85, N-91 to N-94) plus five prop-tools engine edits. N-86 to N-90 wait for WP60 and WP66. | Running. | Two independent reviewers per item. |
| CLOSE-2 | Skill update for the new tools and `prop advise`, FINAL-REPORT extension and an audit-side hand-off. | Running. | This file is the prop-tools side only. If both hand-offs exist, check that they agree. |
| PT50-a and PT50-b | PT-50 per-item verification: 144 F items, then F-V1 to F-V32. Two independent reviewers per batch. | Running. | Items F-91 to F-94, F-97, F-111 to F-113, F-134, F-142, F-147, F-153 wait for PT-35b, PT-13b or PT-30. F-145 waits for PT-36s. F-V21 waits for PT-70. |
| PT-50 rest | Repo-wide eslint, stylelint, knip, `prettier` and the full Vitest suite once at the very end, security and database sweeps, the docs update. | Not started. | After everything above. 16 changed files were not prettier-formatted at the last record. A repo-wide format is part of this step. |
| DOCS-R7e-sweep | Script-backed sweep of the ten firm doc trees, `REMAINING.md` recount. | Running. | The last checker round still found failures. |
| PT-T1d timing | Full suite measured under 5 minutes on the Mac and about 1 minute on the PC. | Done except the timing measurement. | Part of the final suite run. |

Blocked on you, not running: PT-35b (Q14 to Q16), PT-13b (Q8 and the CME paste), PT-64b (QV-4), PT-72 (QV-2 and firm research), PT-70 (QV-3 must be yes).

Latest recorded engine checks (2026-09-26, before the later waves): `bunx eslint .`, `bun run stylelint`, `bun run typecheck` and `bun run knip` all exit 0; the suite had 367 files and 8,558 passed, 1 skipped, 1 failed on a load timeout that passes alone. The later waves ran only the tests they touched, on the PC. No full repo check has been run since, so treat the repo as not fully checked until PT-50 reports.
