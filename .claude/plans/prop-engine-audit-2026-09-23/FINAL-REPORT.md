# Prop engine audit: final report (draft, 2026-09-26)

Sources: [`PLAN.md`](PLAN.md) (items, decisions, user questions, wave log, checklist), [`packages.md`](packages.md) and [`live-recheck.md`](live-recheck.md). The housekeeping facts in section 6 come from the prop-tools tracker (`.claude/plans/prop-tools-2026-09-25/PLAN.md`), which is where they were recorded. Nothing here is new: every figure is quoted from those files.

## 1. Summary

The 2026-09-23 audit of the prop-calculator engine and CLI raised 45 in-scope findings (41 confirmed, 4 disputed) and 8 test gaps. Design work and verification then raised 76 more findings (N-1 to N-76). That makes 129 tracked items. Nine more audit items (R1-5, R1-12, R1-16, R1-17, R1-20, R1-35, R1-38, R1-47, R1-52) were rejected by both reviewers and are out of scope.

Final status of the 129 items:

| Status | Count | Items |
|---|---|---|
| done (fixed, regression test seen RED then GREEN, reviewed, confirmed by the santa pass) | 120 | every R1 and TG item, and every N item not listed below |
| decision (disclosed, closed by the santa pass) | 1 | N-47 (T9: a discount flag also discounts re-buys) |
| not a bug | 0 | N-6 was closed as not a bug on the MFF plan config and is now counted as done; U6 asks you to confirm it |
| blocked (waiting on a firm page) | 2 | N-40 (E8 Zero scaling), N-53 (TopStep activation discount) |
| fixed and verified after the reruns | 5 | N-71, N-72, N-73 (found by the post-audit rerun; fixed in WP39, WP39b to WP39d, WP40 and WP41, text in WP43 and WP43b to WP43h; confirmed by the follow-up rerun, gate D11 passed), N-74 (found by the follow-up rerun; fixed in WP39e, leftovers in WP39f and WP39g; confirmed by the stop-point rerun) and N-76 (found by the last santa: `prop live` without a stop sized percent risk fractionally; fixed in WP44 and WP44b). All five verified 2 of 2 by independent santa pairs |
| explained, not a defect | 1 | N-75 (MFF Pro's published 5-micro funded cap makes every MNQ flat of $100 or more at 10 points one policy; WP42 made the `optimize funded` labels show the capped placement; U22 asks whether 5 micros is right) |

**Found after this report (2026-09-26 evening), being fixed:**
- **N-77.** The funded DP rounds post-trade cushions down onto its grid, so a win smaller than one grid step vanishes while a loss costs a full step. It is latent for whole-contract sizing, since no production caller sets it: on TopStep with ES at a 2-point stop the DP sits out and values the account at 0. A milder bias applies whenever a trade is not a whole number of grid steps. Fix WP45, with gate D11 re-checked.
- **N-78.** The CLI silently ignores unknown flags: `optimize dp --stop-points ... --instrument ...` prints unsized results. Fix WP46.

What the audit fixed, in short:

- Cost figures. One formula now prices cost per funded account everywhere (D1). Retries use the cheaper of reset and re-buy. The bundle discount reaches every figure. Firm fees follow the no-code checkout price (T4).
- Pass rates. Every surface shows two figures, "eval pass" and "funded survive" (D2).
- Drawdown and tier rules. Apex, Tradeify, TopStep, Lucid, MFF Pro and Alpha tier timing now follow the firms' own pages. The funded DP now models the daily loss limit within the day.
- CLI safety. Flags are bounded and fail loud. The ladder grid is capped. `prop live` works as documented, and since N-76 it needs `--stop-points` so live risk is placed in whole contracts.
- End-of-horizon credit and percent sizing (N-71, N-72). Percent rows had printed monthly nets in the billions (N-71); the uncapped credit also inflated `--request-size` runs on daily-payout plans about threefold (N-72: Lucid Daily EOD $7,459 then, $2,456 now).
- Whole-contract sizing into a day-locking loss limit (N-74). A daily-loss room below one contract took a full contract whose win paid in full while the loss was capped, which inflated every lockout-DLL plan at wide stops.
- Solver budget (N-73). `optimize dp` stopped one solve short of convergence.

How it was verified:

- Every fix followed ECC `orch-fix-defect`: a failing regression test first, then the fix, then `code-reviewer` and `typescript-reviewer` review.
- Santa passes: two independent reviewers per item. The final pass wf_51ca4094-588 covered 117 items with 159 agents. After the follow-up waves, wf_61c1740a-45e re-checked 111 items (108 confirmed). wf_081e249d-6b4 cleared 74 of 75 items with a diff-scoped check and ran all 94 of their regression test files (2,708 tests, 0 failed). wf_f24ef614-054 closed the last four (N-47, R1-29, N-33, N-63).
- Fingerprints: a sha256 of each item's files was recorded when the item was verified, for 120 items (scratchpad `verify_hashes_final.json`). An item was re-verified only if its files changed later.
- Read-only repo check, 2026-09-26, in a quiet window. `bun run check` itself was not used, because it runs `prettier --write` and `eslint . --fix`. The read-only equivalents gave:
  - `bunx eslint .` exit 0
  - `bun run stylelint` exit 0
  - `bun run typecheck` exit 0
  - `bun run knip` exit 0
  - `bun run test`: 275 files, 5,923 tests passed, 0 failed
  - `bun run format` flagged 8 files. They were formatted with `bunx prettier --write` on exactly those files (whitespace only), and then passed.
- A second read-only repo check ran after every engine fix (WP39 to WP43d), on 2026-09-26 afternoon:
  - `bunx eslint .`, `bun run stylelint`, `bun run typecheck` and `bun run knip` all exited 0.
  - `bun run test`: 367 files, 8,558 passed, 1 skipped, 1 failed. The failure was a load timeout at 5.3 s in `positionSizeModel.test.ts`. Run alone, the file passes 32 of 32, and that test takes 1.9 s. It gets an explicit timeout in prop-tools PT-25c.
  - `bun run format` flagged 2 test files, formatted with `bunx prettier --write` on exactly those files (whitespace only).
- Targeted santa after the late fixes (wf_145246f7-a47, wf_75ca05b1-887, wf_e016248f-435, wf_59f5a051-cbf):
  - Every verified item whose files changed later was re-checked against the diff and its regression tests, with 0 escalations. The last round covered 81 items (202 test files, 9,549 tests, 0 failed).
  - N-71 to N-76 were each verified 2 of 2 by independent pairs (N-75 as explained, not a defect). Earlier rounds held N-71 and N-72 back only on stale text, which WP43 and WP43b to WP43h and the doc edits fixed.
  - Fingerprints: 127 items, none stale.

## 2. What changed for your numbers

These engine changes move results. Rankings and dollar figures recorded before the audit are stale where they depend on them.

| Change | What the engine does now | Practical effect |
|---|---|---|
| D1 cost per funded account | Eval fee, plus (1/p - 1) retries at the cheaper of reset and re-buy, plus subscription months over the renewal chain, plus activation once, divided by the eval pass probability. One formula for sim, ladder, compare, the web timeline and the renewal DP. Discounts and the bundle apply consistently. | Cost per funded account drops sharply for plans with high funded bust, because the denominator is now eval pass. `compare --sort cost` ranks by it; spend per trial is its own `spend` column and sort key (T6). Call-up-only plans (TopStep Pro Account, LucidMaxx) drop out of rankings unless `--include-callup` (D3). |
| T10 subscription re-buys | A re-buy is a new account: its first month is inside the re-buy price, and billing restarts per attempt. A reset keeps continuous billing. | Re-buy plans with a subscription are no longer billed a month twice (N-60). |
| T29 eval timeouts | An attempt that times out (a firm day cap such as Apex's, or `--eval-days`) is a failed attempt. It is retried at the retry fee while attempts remain. | Before, a timeout ended the trial. The simulator, D1 and the DP now agree. A trial counts as a timeout only when its last attempt times out. |
| T32 end-of-horizon credit | A surviving account is credited one payout request the plan would allow next, capped by the ladder step, request size, profit share, request cap and balance-share cap, and by the payout profit pool only when the plan has no payout ladder and no profit share; net of the split and the payout method fee. | Before, the credit (from pre-audit commit 27f1c66) booked the whole balance above the floor. That inflated monthly nets on ladder and profit-share plans, and percent rows printed billions. Flat rows move on every ladder plan (Lucid Pro, Pro no-DLL, Direct; Tradeify Growth, Lightning; MFF Builder; Apex EOD, Intraday), every profit-share plan (Lucid Flex, Tradeify Select Daily, FTMO) and every `--request-size` run. On Lucid Daily EOD flat $1,000 the $500-request credit is now $0, and the base run ranks above it again ($2,700 vs $2,356 monthly in a 2,000-trial check; $2,661 vs $2,456 in the 100,000-trial follow-up rerun). `optimize funded` also prints the credit and a "monthly ex-credit" column (WP40). |
| T33 whole-contract sizing | Percent-of-cushion risk needs `--stop-points` (instrument default NQ). It is placed in whole contracts of `--instrument` (a micro or a mini): at least one contract, at most the plan's funded contract limit. A flat dollar risk is also rounded down to whole contracts when `--stop-points` is given, and is refused below one contract. | Percent rows now show a bust rate above zero, and the 49%/50% cliff is gone. The engine (`simulate()`, used by the web and the CLI) refuses a percent policy without a stop, and so does the live engine (`simulateLiveAccount`, used by `prop live`, which reports it as a missing `--stop-points`; N-76, WP44). `optimize funded` leaves percent candidates out and says why. Example at an NQ 10-point stop: $150 is refused, $200 is one contract, $450 places two. The `prop sim` header prints the placed risk. The funded DP values its candidates in whole contracts too. Narrowed by WP39e (N-74): when the room left is below one contract, the engine takes one contract only if losing that room ends the account (the drawdown cushion, or a terminating DLL such as FTMO Pro's); a lockout DLL room below one contract ends the day with no trade (U21). Before this, NQ at a 20-point stop printed far above MNQ on every lockout-DLL plan (TopStep standard-standard-dll flat $800: $4,518 vs $2,817 monthly); after it, NQ is at or below MNQ ($2,263 vs $2,859 on a 2,000-trial check). |
| N-67 TopStep 50K LFA tiers | The 50K Live Funded Account DLL tiers are $2,500 / $3,000 / $3,500 (article 11748475, revised 2026-09-24). Before, the engine used $5,000 / $5,500 / $6,000. | The LFA daily loss limit on the 50K is lower at every tier. The D4 default cushion leaves exactly $10,000, which keeps the Friday Safeguard's $2,000 DLL. That costs $500 of DLL at the first tier, $1,000 at the second and $1,500 at the third, not $3,000 (see U7). |
| N-68 Lucid live tiers | Lucid Live contract caps move at the end of the trading day (article 15245873). | A mid-day cross of the $2,000 or $4,000 tier no longer raises the cap until the next session, and a mid-day drop no longer lowers it. |
| N-69 DLL rounding | Lockout and breach checks compare in whole cents. | Before, float drift left about 9% of capped losing trades a hair above the limit, so the day did not lock out. A terminating DLL plan such as FTMO Pro now terminates where it should. |
| N-70 DP worker race | A late `Atomics.notify` could wake the next dispatch early, and the main thread then read stale worker results. It is fixed in `workerSignal.ts` (30/30 parity runs under 16 CPU burners, 10/10 under 14). | Funded DP results no longer depend on machine load. The observed drift was small (614.42147 vs 614.43764 in a test) but nondeterministic. |
| T34 DP solve budget | The default `optimize dp --iterations` is 12, up from 8. The search algorithm, tolerance and exit code on the cap are unchanged. | FTMO Futures Growth needs 9 solves after the audit reshaped the rate function. At 8 it exited 1 with `solve-cap-reached`; it was confirmed converged at 9 with `--iterations` 10 and 12. The TopStep No-fee Standard result at the new default comes from the post-fix rerun (section 7). |

## 3. Disclosures owed to you

These are choices the engine makes that you should know about. Most were picked as the conservative default.

- **T9 (N-47): discount flags apply to re-buys.** `--eval-discount` and the other flags discount every purchase, re-buys included. A single percentage cannot express a code with different first and repeat prices. Example: FundedNext RAPID at 46% prices a retry about $13 low ($162 vs the real $174.99 repeat price). The FNFLEX and RAPID first-purchase gaps are pinned in the FundedNext note. The CLI help says so. Accepted gaps:
  - The web "Eval fee discount" input has no T9 note (handed to prop-tools PT-11).
  - The FundedNext note attributes the $69.99 / $79.99 Flex tiers to "the code", although article 14878751 names no code.
  - The note does not say that an existing user's first purchase is under-priced by the same gaps.
  - The SAVENOW post-expiry gap is stated only in words, with no figure.
- **T17 (N-19): a balance exactly on the floor is a breach.** The engine keeps `<=`, because MFF's article says "Reaching the Maximum Loss Limit results in immediate Live account closure" and TPT's says the balance "must not reach" the limit. The "at or above $0" wording was the local docs' own paraphrase, now corrected.
- **T25 (N-31, U13): Apex Live gaps.** The Apex Live Bonus Vault (20% of monthly withdrawals) and the 90-day safety-net exception are not modeled. Live payouts are therefore understated.
- **T28 (N-49, U15): FundedNext resets may be offer prices.** The engine keeps the published reset figures from article 14260538, re-fetched 2026-09-26 and unchanged. They appear to be offer-basis prices, and the no-code reset checkout needs a login. The Flex worked example frames $77.99 as the offer price plus $8, so a reset without a promo code may cost more.
- **T29 (N-61): timeouts are failed attempts.** An eval timeout is retried like a bust, as described in section 2.
- **T31 (N-34, U5): Alpha Qualified Reset is opt-in.** It is off by default (`--funded-reset`, a web toggle, URL `qr`).
  - When on, every breach that allows a reset is reset the same day. An inactivity closure is never reset.
  - The price is the list fee times the reset discount flag. The CLI has no reset-discount flag, so it pays list.
  - D1 adds the reset fees divided by the accounts that passed the eval (you may prefer passes plus resets).
  - D2 counts a reset account that then survives as surviving.
  - The funded DP now models the reset exactly (WP17d).
- **T32 (U17): the horizon credit is one request.** A surviving account's end-of-horizon credit is one capped request, not its whole balance. Timing gates stay ignored (day gate, funded consistency, minimum payout profit, minimum request). `optimize funded` and `prop compare --sort net` (and the web's comparison tables) still rank on the credit-inclusive monthly net; `prop sim` shows it for one policy.
- **T33 (U18, U21): whole contracts, minimum one contract.** When one contract of `--instrument` (a micro or a mini) exceeds an affordable room whose loss ends the account (the drawdown cushion, or a terminating DLL such as FTMO Pro's), the account still takes one contract: liquidation caps the loss at that room, and a win pays rr on one contract's risk (unless `--unaffordable skipIfUnaffordable` is set, which skips such a funded trade and ends the day; a live trade always takes it). When the room is a lockout DLL below one contract, the trade is skipped and the day ends (WP39e, N-74).
- **T34 (N-73): the budget changed, the search did not.** The default solve budget rose to 12. The precision question is U20.
- **T26 (N-43, U3): Alpha 40% boundary.** Picked by me under your "ur pick" rule. It is inclusive (`>=`, fails at exactly 40%), per rule, so other firms' "exceeds" rules are unaffected.
- **T30 (N-64, U4): MFF Pro early withdrawal is opt-in.** The one-time early withdrawal is off by default (`--early-withdrawal`, a web toggle). When taken, it counts as the first payout, so the MLL moves to start + $100. That is an assumption.
- Other recorded gaps:
  - T10: FTMO's free replacement on the next billing date is not modeled.
  - T16: TopStep LFA's $1,000 auto-liquidation floor is not modeled; the LFA keeps a $0 retained cushion.
  - T27: the sim bills E[max(1, ceil(D/21))] subscription months; the ladder uses ceil on the mean attempt days.
- U16 (N-12): `optimize dp` and `simulate()` bundle-discount every renewal cycle, while the cash-flow timeline discounts only each slot's first card. Both surfaces say so.
- N-40: E8 Zero Performance scaling keeps `TierBasis.SessionOpenProfit`, so a Scaling Trigger can drop after a losing close. The E8 note says so.
- N-51: MFF Pro's in-buffer withdrawal conflicts inside MFF's own sources. The engine requires the buffer, as two of three statements do.

## 4. Open questions for you

The engine runs today on the default in each item. The plan stays open until you answer each one.

1. **U1, T11: DP cycle-baseline grid (`cycleBaselineFineRangeMultiple`).**
   - Default: 1 (FTMO Futures Growth coarse config $15,312.21; fixed point $15,311.85).
   - Options: 0 ($15,348.41, not a safe lower bound), 1, or 6 (exact, $15,801.07, about +$489 and about 2x slower).
   - When the grid rounds, `optimize dp` prints a gap line naming the conservative bias.
2. **U2, T24: Alpha Futures Qualified payout split.**
   - Default: 70/80/90 by payout number, per the signed General Service Agreement (the conservative reading).
   - Option: a flat 90%, per the signed Terms and Conditions Schedule 2, the product page and the help center. Signed document against signed document.
3. **U3, T26 and N-45: Alpha 40% consistency rule.**
   - Default: inclusive, and a request after a net-losing or flat cycle is blocked.
   - Options: keep inclusive or switch to exclusive. Also confirm the net-losing-cycle block, which is an interpretation that no source states.
4. **U4, T30: MFF Pro one-time early withdrawal.**
   - Default: off. When taken, the MLL moves to start + $100 and locks.
   - Options: default on or off. Also confirm the MLL assumption, and whether "every 14 calendar days" counts from the previous payout (the engine) or runs on a fixed cadence.
5. **U5, T31: Alpha Qualified Reset.**
   - Default: off. Reset fees in D1 are divided by eval passes.
   - Options: default on or off. D1 denominator: passes, or passes plus resets.
6. **U6, N-6: MFF Pro evaluation lock.**
   - Default: the eval MLL stops trailing at start + $100, from the plan config's `maxDrawdownLimit` 50,100.
   - Options: confirm, or remove the eval lock (the FAQ prose names only the first payout as the lock trigger).
7. **U7: TopStep Live Funded Account readings.**
   - Defaults:
     - Micros count 1:1 against the 5-lot cap.
     - Tier timing: (a) the first close in a new tier is day 1; (b) a jump across several tiers counts only toward the next one; (c) a lost tier needs 10 new Active Trading Days.
     - The Friday Safeguard reads the balance after a same-day Reserve deposit.
     - The XFA transfer defaults to $50,000 (a $40,000 Reserve).
     - The D4 cushion leaves exactly $10,000, which costs $500 / $1,000 / $1,500 of DLL at the three tiers (N-67).
   - Options: confirm each reading; add an `--xfa-balance` input; keep one cent more cushion to stay on the higher tier.
8. **U8, N-40: E8 Zero Performance scaling.**
   - Default: a Scaling Trigger can drop after a losing close.
   - Needed: an E8 page or support answer saying whether an unlocked trigger survives a losing day.
9. **U9, N-53: TopStep Standard-path DLL XFA activation.**
   - Default: $149.
   - Needed: the Responsible Trading Discount amount on that activation (a real checkout would show it).
10. **U10: FundedNext basket discount on the Rapid Pro DLL Add-On.**
    - Default: the 15% comes off the $259.98 Add-On price.
    - Needed: whether it comes off $259.98 or the $299.98 plan price.
11. **U11: Lucid 25K Evaluation DLL.**
    - Default: only 50K is modeled; the docs record the conflict.
    - Needed: the live Lucid checkout for 25K.
12. **U12: unconfirmed at a real cart (optional).**
    - Defaults: Tradeify Select reset $109; Lucid's automatic DLL-ON promo on resets; MFF Rapid Live $250 minimum.
    - Needed: a dashboard or checkout screenshot would close each one.
13. **U13, T25: Apex Live Bonus Vault and 90-day safety net.**
    - Default: not modeled, disclosed.
    - Option: add an optional input for them.
14. **U14: funded DP best-day grid for plans with a consistency rule.**
    - Default: the exact grid. MFF Builder takes 663.8 s per rate solve (5,718,498 states, peak 4.09 GB), about 1.5 h at full defaults (an estimate). Tradeify Growth was not measured.
    - Options:
      - Keep the exact grid.
      - Use `cycleBestDayBucketCount` 6 for consistency plans. This is a conservative ceiling grid with a disclosure line: Builder 511,812 states, 3.6 s per sweep.
      - Coarsen the whole `optimize dp` funded grid.
15. **U15, T28: FundedNext Flex reset price basis.**
    - Default: $77.99.
    - Needed: the reset price your FundedNext dashboard shows for a 50K Flex (and Rapid) account. If it differs, the fee is corrected from it.
16. **U16, N-12: bundle discount on lockstep renewals.**
    - Default: the DP and `simulate()` re-buy all copy-traded accounts together and bundle-discount every renewal. The timeline discounts only each slot's first card.
    - Options: is a re-purchase after a bundle another bundle checkout, or single-account orders? If single-account, one coordinated package changes the DP objective, the simulator and `optimize dp` together. Also: are copies 6 and 7 of a Tradeify bundle discounted?
17. **U17, T32: horizon credit value and default ranking.**
    - Default: one capped request, and ranking on the credit-inclusive monthly net.
    - Options: one capped request, a bounded continuation value (the requests possible over one more cadence window, with survival risk), or zero. Also: rank by default on credit-inclusive or credit-free monthly? Should the credit honour terminal caps such as LucidDaily's $15,000 live-transition cap (to be re-verified live) and the timing gates?
18. **U18, T33: percent-of-cushion sizing.**
    - Defaults: percent needs `--stop-points`; one contract (a micro or a mini, per `--instrument`) when it exceeds a room that busts the account (the drawdown cushion or a terminating DLL such as FTMO Pro's); flat risk rounded to whole contracts. A lockout DLL room is U21.
    - Options: refuse without a stop, or default to a documented instrument and stop. For a bust-bound room below one contract: take one contract (loss capped at the room, win paid on the full contract), make it symmetric (win pays rr x the room), or skip the trade (skipping can run into Lucid's 30-day inactivity closure). No effect was measured on flat rows (no-DLL TopStep NQ 20 points equals MNQ 20 points exactly at commission 0); any effect would be in percent rows. Round flat risk too, or not.
19. **U19, N-72: Hard Rule 2 on daily-payout plans.**
    - Default: the base funded policy requests everything above the $2,000 retained cushion. On Lucid Daily, TPT and MFF Rapid that drains the account back to the retained-cushion barrier ($2,000 above the floor) after every green day (0 of 100,000 survivors at flat $800 to $1,000). A capped request (for example $500) lets the cushion grow, and more accounts survive.
    - What the fixed engine says now (post-fix rerun, Result 8, seed 42, credit $0 on both): on Lucid Daily (all four variants) and MFF Rapid the base policy ranks first again, but on TPT and MFF Rapid EOD a $500 capped request still earns more per slot, TPT $2,192 vs $1,947 and MFF Rapid EOD $2,420 vs $1,999 monthly. That lead is credit-free: it comes from the balance left in the account, not the horizon credit.
    - Question: does "payouts always leaving $2,000 cushion" mean retain exactly $2,000, or retain at least $2,000 with a capped request? This decides how the skill ranks daily-payout plans, and whether it keeps citing "$500 requests: mostly a model artifact".
20. **U20, N-73: DP convergence precision.**
    - Default: the rate search stops at $0.05/day, finer than the value iteration certifies (about $0.6 to $0.8/day).
    - Options: tie the tolerance to `valueErrorBound`, tighten the funded tolerance near the root, or accept as is. Optionally, a separate algorithm package (a Dinkelbach/Newton step, a right-side probe) and a solve-cap warning that prints the last step and the safe range. TopStep's DP-vs-empirical gap (-$1,636/month) will be investigated once the solve converges.
21. **U21, N-74: a lockout daily-loss room below one contract.**
    - Default (WP39e): skip the trade. One whole contract at the given stop cannot fit, so the day ends as the lockout would. In the stop-point rerun every changed Stage D row fell in monthly net; a few MNQ companion rows rose by up to $34 a month, because a skipped trade can shorten the slot.
    - Option: trade symmetrically at the room (a fractional contract), which is how the eval contract-capped path and the pre-audit engine behave.
    - Why it matters: before WP39e the engine placed one contract, capped the loss at the room and paid the win on the full contract. That inflated every lockout-DLL plan at wide stops (FTMO Growth flat $800 at NQ 20 points: $4,237 monthly vs $2,927 without a stop).
22. **U22, N-75: MFF Pro Sim-Funded contract limit.**
    - Default: 5 mini / 5 micro at $50K (10/10 and 15/15 at larger sizes), as both live MFF sources say (the plans/pro page and help article 11802674). MNQ at a 10-point stop is capped at $100 per trade, so every larger flat size is one policy.
    - Question: is 5 micros right, or a publishing error for 50? It breaks MFF's usual 10:1 micro ratio, and the Pro eval allows 30 micros. Only MFF support or your live account dashboard can settle it. If it is 50, the plan data changes through the prop-firm-docs flow and the MFF Pro MNQ rows are re-run.
23. **U23: percent-of-cushion rows at wider stops.**
    - Default: reported next to flat rows with a disclosure. Win rate and rr are held fixed whatever the stop, while the dollar contract cap scales with the stop, so FundedNext Legacy 50% cushion goes MNQ 10 points $3,744, 20 points $7,968, 40 points $14,284 monthly.
    - Option: leave 20-point and wider percent rows out of ranked comparisons.

## 5. Pages to paste

Received on 2026-09-23 (nothing more needed for these):

- Apex: "Scaling Levels (PA) Explained", "Daily Loss Limit Explained", "EOD Performance Accounts (PA)", "Live Prop Trading Program FAQ", the homepage product picker and "Evaluation Plan Fees and Access Explained". The Intraday PA page was not pasted and is not needed, because the Scaling article's FAQ covers Intraday PAs.
- Tradeify: 12853966 "Select Flex and Select Daily Payout Policies", 14369021 "Tradeify Pricing Reference", 10468321 "Rules: Daily Loss Limit".
- E8: 11864618 "E8 Signature Futures", 10155917 "Max. available Contract Sizes".
- Lucid: the homepage plan and price selector.

Still needed. Each item is also a question in section 4.

| Item | Firm | What to paste | Why |
|---|---|---|---|
| N-40 (U8) | E8 | An E8 help page or support answer on Zero Performance scaling: does an unlocked Scaling Trigger survive a losing day? | The E8 help center returns HTTP 403, and article 10155917 does not say. |
| N-53 (U9) | TopStep | The Responsible Trading Discount amount on an Express Funded Account activation with a DLL (a checkout screen) | Article 14289835 names the discount but gives no amount. |
| U10 | FundedNext | The basket checkout for five Rapid Pro DLL Add-On accounts | To see whether the 15% applies to $259.98 or $299.98 |
| U11 | Lucid | The live checkout for a 25K Evaluation, DLL on and off | The help articles say "None", while the homepage config shows $600 with a priced toggle. The checkout is Cloudflare-blocked. |
| U12 | Tradeify, Lucid, MFF | A dashboard or cart showing the Tradeify Select 50K reset ($109?), Lucid's DLL-ON promo on a reset, and MFF Rapid Live's $250 minimum (gross or net) | Optional: each figure comes from one source only |
| U15 | FundedNext | The reset price in your dashboard for a 50K Flex account (and Rapid) | The reset checkout needs a login |

Also, from the Lucid docs review (open, low priority): LucidFlex and LucidDirect non-50K prices are not transcribed.

## 6. Housekeeping for you

- **Unapplied migration.** `drizzle/0007_careless_miss_america.sql` (prop-tools PT-01d) was generated and inspected, but never applied to your database. Only `sadranl_prop_*` DDL, and every FK follows its target constraint. It is in git. Run `bun run db:migrate` when you are ready (prop-tools U3).
- **Git index notes.** Agents made no commits; the tree holds both workstreams' changes, many of them staged.
  - Prop-tools wave 1c: the index staged the superseded `0007_quick_satana.sql` set, which I unstaged (`git restore --staged` on those three drizzle paths only; the working tree was not touched).
  - Audit wave 25c: I unstaged a deleted temporary derivation test file that was staged but gone from disk.
  - The Alpha test directory `tests/unit/lib/prop-calculator/firms/alphafutures/`, flagged as untracked in santa batch 2, is now tracked.
- **Pre-existing `~/app` import.** `src/lib/site/content.ts` has a type import from `~/app`. The prop-tools guard (no `src/server` or `src/lib` file imports from `~/app`, PT-05g) allow-lists it. It predates both workstreams and is still there.
- **Migration history.** Migrations 0001 to 0005 do not replay on an empty database. This is pre-existing, found during prop-tools wave 1c. Existing databases are not affected, but a fresh setup would fail.
- **Lint commands.** `bun run lint` is `eslint . --fix`, and `bun run check` also runs `prettier --write`. Both rewrite files. The audit used read-only equivalents.
- **Stale checklist row.** "Run the parked firm-data steps once the pages above are pasted" still reads `todo`. The pages it waited for arrived on 2026-09-23, and the tracker says every item blocked on them was unblocked. Only N-40 and N-53 remain.
- **Later reviews.** Accepted low findings went to prop-tools PT-11, PT-17 and PT-19. The web changes (CashFlowPanel, ResultsPanel, the comparison tables, LadderLab, PlanStatsBadges, RuleStressTestPanel, StrategyLab and Analysis) were checked by reading the code only. They need your own check in the dev server.

## 7. Engine results after the fixes

Two CLI-only reruns on the fixed engine, both independently verified cell by cell against the raw output. Figures are monthly net per account slot, seed 42, 1-year funded horizon, 100,000 trials, unless stated.

- **`2026-09-26-post-fix-rerun.md`** (1,318 jobs; every stage of the post-audit run except Stage A). Its base rows (no `--stop-points`) and DP rows are current.
- **`2026-09-26-stop-point-rerun.md`** (583 jobs; every `--stop-points` job of the post-fix run, re-run after the N-74 fix). It supersedes the post-fix run's Stage D and MNQ companion rows.

What they show:

- **N-71 gone.** None of the 16,651 printed policy rows reaches $20,000 a month. The Lucid Pro / Pro no-DLL / Direct percent rows that printed hundreds of millions to billions ($624,388,543 / $1,743,617,717 / $973,964,343) now print at most $3,222 / $3,336 / $1,903 (50% cushion, MNQ at 10 points, B seed 42, current figures from the stop-point rerun). Percent rows bust like other sizes.
- **N-72 explained.** The horizon credit is one capped request, and $0 on a daily-payout plan whose last payout emptied the pool. The base policy ranks first again on Lucid Daily (all four variants) and MFF Rapid. On TPT ($2,192 vs $1,947) and MFF Rapid EOD ($2,420 vs $1,999) a $500 request still leads with a $0 credit, which is the credit-free effect behind U19.
- **N-73 fixed, gate D11 passed.** Both DP solves converge in 9 of 12 solves. The DP beats the best flat on both plans: FTMO Futures Growth $4,851 vs flat $800 $2,924; TopStep No-fee Standard $3,181 vs flat $1,000 $3,065. TopStep's DP-predicted rate is still well above what its policy earns when simulated (gap -$1,624 a month), which U20 covers.
- **N-74 fixed.** At a 20-point NQ stop every lockout-DLL plan fell back:
  - FTMO Growth flat $800 went from $4,237 to $2,301, against $2,927 with no stop.
  - The four TopStep DLL variants went from $4,500 to $5,371 down to $2,175 to $2,319, against $2,824 to $2,972 with no stop.
  - All 564 changed Stage D rows fell. Every no-DLL output and every FTMO Pro (terminating DLL) output is bit-identical to before.
  - A few plans sit $4 to $45 above the no-stop figure. That is the same small lift whole-contract sizing gives plans with no DLL at all (it grows with contract size and lowers bust), not the defect.
- **N-75.** On MFF Pro, every MNQ flat of $100 or more is one policy: 5 MNQ = $100 at 10 points, $585 a month. The labels now say so (U22).
- **Ranking changes against the post-audit run.** Per-cycle net, bust and survivors in the base sweep are unchanged. Only monthly net moved, through the capped credit. Best flat fell back on the plans whose lead came from the old credit:
  - Lucid Direct $8,375 to $2,127.
  - Lucid Pro no-DLL $7,296 to $3,681.
  - Lucid Pro $6,903 to $3,505.
  - Tradeify Lightning $5,872 to $2,946.
  - Tradeify Growth $5,159 to $3,324.
- **Leading best flats now.** FundedNext Legacy $1,000 $4,730, TopStep No-fee Consistency $1,000 $4,326, TopStep Standard Consistency $1,000 $4,293.
- **Realistic $250 view (buyable plans).** TopStep No-fee Consistency $1,924, No-fee Standard $1,920, FTMO Growth $1,918, then the TopStep Standard path.
- **Win rate 43%.** The best flat is TopStep No-fee Consistency $1,000 $6,211. The post-audit leader, Lucid Direct $11,740, was the credit artifact.
- **Percent vs flat.** With whole contracts, the best percent row beats the best flat only on a few buyable plans:
  - E8 Zero MAX, in the base and commission companions.
  - Apex EOD and E8 Zero, under a request size.
  - Three live-capped jobs.
  
  At a 20-point NQ stop, 70 of 176 Stage D files rank a percent row first. Many of those percent rows are the same trade as flat $400 (one NQ).
- **Do not rank on.** FundedNext Legacy's 50% cushion row at 20 points ($8,953 at seed 42, $8,997 at seed 1337, the largest in any stage) is the U23 modelling limit: win rate and rr are held fixed while the dollar contract cap scales with the stop.

The prop-firm-trading skill's own historical tables that used percent rows (the "Fixed $250 vs percentage sizing" sweep and Hard Rule 5's evidence sentence) now carry an N-71 caveat; they predate these reruns.
