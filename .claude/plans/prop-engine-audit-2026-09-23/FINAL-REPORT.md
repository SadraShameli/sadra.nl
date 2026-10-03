# Prop engine audit: final report (draft, 2026-09-26; extended 2026-10-02)

Sources: [`PLAN.md`](PLAN.md) (items, decisions, user questions, wave log, checklist), [`packages.md`](packages.md) and [`live-recheck.md`](live-recheck.md). The housekeeping facts in section 6 come from the prop-tools tracker (`.claude/plans/prop-tools-2026-09-25/PLAN.md`), which is where they were recorded. Nothing here is new: every figure is quoted from those files. Sections 1 to 7 keep their 2026-09-26 state, except where a line says it was superseded; sections 4, 5 and 6 were refreshed on 2026-10-02 where they carry something you must act on. Section 8 (added 2026-10-02) covers the items fixed since then (N-77 to N-88 and N-91 to N-94), the two still in progress (N-89, N-90) and what is still running. Section 4 gains U24 to U33 at its end (U24 to U28 are restated from the PT-71 triage because section 8 cites them).

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

**Found after this report (2026-09-26 evening):** N-77 and N-78 were found then, and N-79 to N-94 later, by the prop-tools firm-page triage (PT-71c), the DP gate reruns and investigations, review rounds and the docs reviews. All 18 (N-77 to N-94) are covered in section 8: 15 are fixed and await the close-out review, 1 (N-88) was evaluated and left unchanged, and 2 (N-89, N-90) are in progress. With them the audit tracks 147 items. This summary table and the counts above are the 2026-09-26 state.

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

Added 2026-10-02 (U24 to U33; the engine runs on the default in each item, as before). U24 to U28 come from the PT-71 triage and are cited in section 8; they are recorded in `PLAN.md` and restated here so no id is left undefined.

24. **U24, PT-71: paste requests.**
    - Needed: TPT /pricing or a 50K Test checkout ($170 is derived from offer pages); the MFF Pro 50K and Rapid EOD 50K reset prices (a dashboard); any firm-set MFF Rapid Live DLL (support or a dashboard); the Apex homepage, /pricing/, the fees article, the live FAQ and /legacy-products/ (403); the Lucid home page and checkout (Cloudflare).
    - Default: the modeling defaults stay, disclosed. Option: paste the pages, or confirm the defaults. Section 5 lists them.
25. **U25, N-81: FundedNext Live withdrawal floor.**
    - Evidence: article 16522296 contradicts itself. Section 5's example locks the floor at $2,000, section 6 at $1,000.
    - Default: the engine keeps the $1,000 trading floor and WP49 adds the $2,000 withdrawal floor as section 5 describes, disclosed.
    - Needed: FundedNext's answer on which section is current.
26. **U26, N-84: MFF Rapid 50K scaling.**
    - Default: disclosed only ("start off with 2 contracts", schedule unknown); no tiered cap is built.
    - Needed: a support or dashboard answer, then a tiered cap can be built.
27. **U27, N-85: Tradeify Lightning payout basis.**
    - Evidence: the homepage says "Payout Frequency: 5 Days"; the policy article 10495932 says "No Minimum Trading Day Count".
    - Default: both readings are disclosed and the engine keeps 0 minimum days per the policy article.
    - Option: use the homepage's 5-day cadence.
28. **U28, N-85: Alpha Futures Qualified-stage monthly fee.**
    - Evidence: the help center (article 9492068) and the signed Terms say no recurring fee; the product pages say $139 a month continues.
    - Default: no recurring fee, with the conflict disclosed.
    - Option: model a funded-stage monthly fee over the Qualified horizon.

The items below are U29 to U33.

29. **U29, N-93c (WP61): FundedNext FNL:003 (discontinued) 5-day wait before the first reward.**
    - Default: keep the 5-day gate as the tool's conservative reading, disclosed. The Labs card says "Get Rewards In 5 Days", its tooltip may mean delivery time, and help articles 16847874 and 16847913 list no wait.
    - Option: model no wait (0 days) and record the Labs card as a conflict.
30. **U30, N-91 (WP63): Alpha Futures live "Scaling Daily Loss Limit (30% of account)".**
    - Question: what is the 30% measured on, when does it scale, and is a hit a breach or a pause?
    - Default: keep it unmodeled and disclosed. Every Alpha live figure ignores it today.
    - Option: model it from your reading: 30% of the live drawdown, of cumulative live profit, or a $3,000 start that scales (the Legacy article's example), as a pause until the next day.
31. **U31, DOCS-R7 triage T-10: Alpha Futures Advanced Qualified maximum loss limit.**
    - Evidence: the signed Terms (effective 2026-07-27, Schedule 2) say 4% ($2,000 at 50K). The Advanced product page's Qualified card and help article 11634907 (2026-07-22) say $1,750.
    - Default: keep $2,000 (the signed Terms outrank the help center and product pages) and disclose the conflict in the engine note.
    - Option: model $1,750, the stricter figure the platform may enforce, so every Advanced funded figure is conservative.
32. **U32, DOCS-R7 triage T-36: Topstep Combine 55% consistency at exactly 55%.**
    - Evidence: article 8284208 says "at or below 55%" and gives a worked tie example; 8284197 and 8284099 say "below 55%".
    - Default: keep the engine's reading (exactly 55% passes; above it the profit target rises to Best Day / 0.55, as the firm says) and disclose the conflict.
    - Option: switch to the stricter reading (exactly 55% raises the target), as Alpha and TPT already use.
33. **U33, DOCS-R7 triage T-38: Topstep Pro Account "Payout up to 50% of the account and up to $5,000" (article 14645398).**
    - Question: what is the 50% a share of?
    - Default: keep the $2,000 dollar cap at 50K only and disclose the 50% as unconfirmed (on the balance reading it never binds).
    - Option: model 50% of the profit above the $10,000 start, which roughly halves early payouts.

## 5. Pages to paste

Received on 2026-09-23 (nothing more needed for these, except the Apex Live FAQ, which was requested again on 2026-10-02):

- Apex: "Scaling Levels (PA) Explained", "Daily Loss Limit Explained", "EOD Performance Accounts (PA)", "Live Prop Trading Program FAQ" (requested again, see below), the homepage product picker and "Evaluation Plan Fees and Access Explained". The Intraday PA page was not pasted and is not needed, because the Scaling article's FAQ covers Intraday PAs.
- Tradeify: 12853966 "Select Flex and Select Daily Payout Policies", 14369021 "Tradeify Pricing Reference", 10468321 "Rules: Daily Loss Limit".
- E8: 11864618 "E8 Signature Futures", 10155917 "Max. available Contract Sizes".
- Lucid: the homepage plan and price selector.

Requested again 2026-10-02 (prop-tools R-V6): the Apex Live Prop Trading Program FAQ, with its schema.org `dateModified` from the page source if possible (the 2026-09-23 paste read 2026-06-30). It is the only page left behind the Apex live-transfer note (`ApexUserPasteOnly`); WebFetch got HTTP 403 on it and on the Apex homepage.

Still needed. The rows marked with a U id are also questions in section 4; the rows marked U24 and DOCS-R7 follow from the 2026-10-02 passes.

| Item | Firm | What to paste | Why |
|---|---|---|---|
| N-40 (U8) | E8 | An E8 help page or support answer on Zero Performance scaling: does an unlocked Scaling Trigger survive a losing day? | The E8 help center returns HTTP 403, and article 10155917 does not say. |
| N-53 (U9) | TopStep | The Responsible Trading Discount amount on an Express Funded Account activation with a DLL (a checkout screen) | Article 14289835 names the discount but gives no amount. |
| U10 | FundedNext | The basket checkout for five Rapid Pro DLL Add-On accounts | To see whether the 15% applies to $259.98 or $299.98 |
| U11 | Lucid | The live checkout for a 25K Evaluation, DLL on and off | The help articles say "None", while the homepage config shows $600 with a priced toggle. The checkout is Cloudflare-blocked. |
| U12 | Tradeify, Lucid, MFF | A dashboard or cart showing the Tradeify Select 50K reset ($109?), Lucid's DLL-ON promo on a reset, and MFF Rapid Live's $250 minimum (gross or net) | Optional: each figure comes from one source only |
| U15 | FundedNext | The reset price in your dashboard for a 50K Flex account (and Rapid) | The reset checkout needs a login |
| R-V6 | Apex | The Live Prop Trading Program FAQ with its `dateModified` | The only page left behind the Apex live-transfer note; HTTP 403 to fetches |
| U24 | TPT | /pricing, or a 50K Test checkout | $170 is derived from offer pages |
| U24 | MFF | The Pro 50K and Rapid EOD 50K reset prices (a dashboard); any firm-set Rapid Live DLL (support or a dashboard) | Modeling defaults today (N-84) |
| U24 | Apex | The homepage, /pricing/, the fees article and /legacy-products/ | All 403 |
| U24 | Lucid | The home page and the checkout | Cloudflare |
| DOCS-R7 | Apex | The legal documents and the 63 keyword-scanned help pages | HTTP 403; never read |
| DOCS-R7 | Lucid | The pricing pages | 403 |
| DOCS-R7 | MFF | The Simulated Trader Agreement and its Appendices | Not published; open it from your account or checkout |
| DOCS-R7 | FTMO Futures | The configurator (futures.ftmo.com/en/configure-account/), logged in: any price, fee or reset text | Login wall |
| DOCS-R7 | TPT | The NinjaTrader PRO+ commissions page (ninjatrader.com/pricing/commissions/) | Redirects to the NinjaTrader Europe page |
| DOCS-R7 | E8 | The Signature reset fee (the checkout or the account-reset article 11640147) | No readable page states it as its own figure; the engine prices it at the $170 list price (WP64) |

REMAINING.md in `.claude/prop-firms/` holds the full list: its first run consolidated 39 paste requests, a count that is not final because the DOCS-R7e sweep is still running (section 8.5).

Also, from the Lucid docs review (open, low priority): LucidFlex and LucidDirect non-50K prices are not transcribed.

## 6. Housekeeping for you

- **Unapplied migrations.** `drizzle/` holds six migrations that were generated and inspected but never applied to your database: `0007_careless_miss_america.sql` (prop-tools PT-01d; only `sadranl_prop_*` DDL, and every FK follows its target constraint), `0008_square_tombstone.sql` and `0009_small_shadowcat.sql` (PT-51a), `0010_outgoing_hitman.sql` (PT-52), `0011_overrated_mastermind.sql` (PT-27b) and `0012_stormy_silverclaw.sql` (PT-27c). Run `bun run db:migrate` when you are ready, so they apply in order, and never `db:push` (prop-tools U3). Applying only 0007 would leave 0008 to 0012 pending.
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

## 8. Fixed since 2026-09-26 (N-77 to N-94), added 2026-10-02

Sources: the item rows, package rows and wave log in `PLAN.md`, the package texts in `packages.md`, and the measurement rows D11-r to D11-r4, N89-r, N89-m and N89-f. Every figure below is quoted from them. Nothing here has been re-run for this section.

How to read the verification lines:

- "Reviewed" means the code and TypeScript reviewers' verdict is recorded in the package or wave row (APPROVE, or APPROVE with the caveat named). "RED seen" appears only where the wave record says a regression test failed against the old code; where the record does not say so, the line says "not separately recorded".
- None of these items has been through a santa pass yet. The close-out review of N-77 to N-85 and N-91 to N-94 (CLOSE-1, wf_936f6dae-9ac) is running, and N-86 to N-90 wait for WP60 and WP66 because those packages change the DP code in flight. Until it reports, every item below stands at "reviewed", never "verified".
- The item status cells in `PLAN.md` for N-77 to N-80, N-85, N-93 and N-94 still read as they did before their packages landed. This section follows the package and wave rows.

Status of the 18 items:

| Status | Count | Items |
|---|---|---|
| fixed, reviewed, close-out review pending | 15 | N-77, N-78, N-79, N-80, N-81, N-82, N-83, N-84, N-85, N-86, N-87, N-91, N-92, N-93, N-94 |
| evaluated, no change (kept as a documented approximation) | 1 | N-88 |
| in progress | 2 | N-89, N-90 |

### 8.1 Funded and eval DP

**N-77: the funded DP floored every post-trade cushion onto its grid (WP45, wave 45).**
- Finding: a win smaller than one cushion step rounded to no gain while a loss rounded down a whole step, so positive-EV trades looked like pure losses and the policy sat out. Reproduced by trace on TopStep with ES at a 2-point stop (the 2-contract start tier caps every trade at $200; the DP valued the account at exactly 0). A milder bias applied whenever a trade was not a whole number of steps. Found by prop-tools PT-47c.
- Cause: `bucketIndex` floored the outcome in `tradeOutcome`; the eval DP had the same floor bucketing of the cushion.
- Fix: off-grid outcomes are split between the floor and ceiling cells in proportion (`splitOntoCushionGrid`, `valueOnCushionGrid` in `EvalStateValue.ts`, shared by both DPs). Bust and lockout outcomes stay exact. No refusal guard was needed. Two pins were re-pinned with traced reasons: the MFF Rapid EOD risk row [200,0,0,0] to [200,200,200,200], and the ladder-versus-DP eval pass 0.588 to 0.662.
- Regression test: RED seen against the old code (TopStep ES at a 2-point stop valued exactly 0; a sure $150 win valued 140; a fair eval bet valued 0 instead of 0.5). 17 DP-adjacent files, 393 tests, green.
- Verification: reviewed, APPROVE from both reviewers (wf_b69adb09-7b1); two LOWs (the helpers are not in the core barrel; they take plain numbers, not branded dollars). The implementer's gate D11 recheck was not valid, because it ran on the live tree while prop-tools edited the simulator; the clean rerun is D11-r (see N-86). Close-out review pending.

**N-86: after N-77, `optimize dp` on TopStep No-fee Standard failed gate D11 (WP54, WP56, WP57, WP58, WP58b, WP58c, WP58d; waves 48 to 54r).**
- Finding: the unbiased grid made the DP's TopStep policy more aggressive. Its `simulate()` replay earned $2,197 a month per slot (81.5% funded bust) against a DP prediction of $4,930 and the best flat $3,065, so gate D11 failed at 0.72x (floor 0.8x). The gap was already -$1,624 before N-77. FTMO Growth was unaffected. Found by the clean D11 recheck (D11-r).
- Cause, in three layers:
  - Two more floors in the funded value sweep: the day-close cushion (`continuationKey()`) and the pre-lock threshold offset. Fixing them moved the replay and pins but not the TopStep gap (D11-r2: 0.78x; D11-r3 ladder: the gap did not converge as the grid refined).
  - The root cause (orchestrator ablation 50d, fast grid, 20,000 trials): the grid top was too low. TopStep balances routinely pass 15 drawdowns above the floor, but the default top was 6 drawdowns ($12,000 above the locked floor). With the top at 6 the gap was -$1,283; with 30 it was -$51 (predicted $5,153, replay $5,102, 4,539,759 states, 796 s). FTMO Growth went from $4,781 / $4,488 to $4,996 / $4,929.
  - A ruled-out line: N-88 and the retained-cushion rule were refuted as drivers (see N-88).
- Fix:
  - WP54: `continuationKey()` returns a cushion split and `dayCloseValue()` blends the two cells. `optimize dp` gained `--cushion-step-multiple`, `--max-cushion-multiple`, `--action-step-multiple` and `--max-action-multiple`, and a `CalendarWeekInactivityIgnored` gap line (N-80).
  - WP56: the pre-lock threshold offset is split too (up to four cells blended).
  - WP57: `optimize dp` says its policy is not validated on plans whose payout snaps the threshold to breakeven (ReleaseFloor, every TopStep plan).
  - WP58: a saturation diagnostic (`isGridSaturated`, `FundedGridSaturationHigh`, warning above a 1% share), printed by `optimize dp`.
  - WP58b: `core/FundedCushionGrid.ts`, a pure refactor with the tail off (byte-identical at the fast grid).
  - WP58c: the tail is on by default. The locked cushion grid is fine up to 6 drawdowns and then one drawdown per cell up to 30 drawdowns above the locked floor; the cycle-baseline grid top follows the tail top.
  - WP58d: `--max-tail-cushion-multiple` and `--tail-cushion-step-multiple` (validated), the tail-step guard inside `FundedCushionGrid`, the grid the solver really built reported back (`FundedStateValueResult.cushionGrid`), defaults in `core/FundedGridDefaults.ts`, and MFF Builder 50K's best-day bound (4,640,328 to 1,406,160 states, value +0.0027).
- Regression tests: WP54 RED seen (a cushion just below a $200 cell valued like a breach; a $500 cliff at the boundary). WP56 RED reproduced by the reviewer against an archived copy of the last commit (1,746.34 against more than 1,900; 253.66 against less than 200 at two resolutions). WP58 added two run-level end-to-end CLI cases (111 DP CLI tests). WP58b added 22 tests (`FundedCushionGrid.test.ts`). WP58c moved 12 pins with traced reasons (the coarse TopStep pin $5,081.89 to $7,113.53). Not separately recorded as RED: WP57, WP58c's tail behaviour beyond those pins.
- Measured (D11-r4, frozen snapshot `engine-snap-2026-09-27c`, default grid, post-fix rerun flags): gate D11 passes.

  | Plan | Predicted | Replay | Best flat | Replay / flat | Funded bust | States | Time |
  |---|---|---|---|---|---|---|---|
  | TopStep No-fee Standard | $5,200 | $4,140 | $3,065 | 1.35x | 92.2% | 5,554,270 | 7,348 s |
  | FTMO Growth | $5,403 | $5,134 | $2,924 | 1.76x | 83.0% | 4,034,295 | 2,491 s |

  At the fast grid (cushion 0.25, action 0.125) the TopStep gap fell from about -$1,283 to -$54 (predicted $4,585, replay $4,530, saturation 4.2% against 68.7%). The residual at the default grid is N-89.
- Verification: each package reviewed. WP54, WP56, WP57, WP58 (stage 1) and WP58b were APPROVE; WP58c was APPROVE from the code reviewer and WARNING on re-review (one MEDIUM wording leftover, closed in WP58d); WP58d was APPROVE with caveats (the Builder cost, the best-day cap and default-grid convergence went to WP58e, N-90). D11-r4 is an orchestrator CLI run on a frozen snapshot; no independent cell-by-cell check of it is recorded. Close-out review pending, after WP60 and WP66.

**N-87: the eval DP's day-close cushion was floored (WP55, wave 49).**
- Finding: `EvalStateValue.ts` `bucketOuterState()` floored the day-close cushion with no interpolation weight. It is reachable only when a day ends early on a DLL lockout or a P&L stop rule.
- Fix: `onDayComplete` splits an off-grid day-close cushion between two cells and blends `dayCloseValue`.
- Regression test: on a toy the value moved from 0.332 (floored) to 0.479, with the on-grid boundary case unchanged at 0.5. No characterization pin moved, since no firm test reaches an early off-grid close. The record does not say the toy was run RED first.
- Verification: reviewed, APPROVE on re-review (wf_b936a7d3-c7b). The re-reviewer isolated each fix against the pre-fix code (the item row records it as fixed and verified). Close-out review pending.

**N-88: both DPs floor the cushion when they look up the risk for a real day start (no change).**
- Finding: `computeRisk` and the eval `dayStartKey` floor an off-grid cushion onto the solved grid, so the replay and the printed advice follow the action solved for a lower cushion. Raised by a WP55 reviewer.
- Cause evaluated: round 2 of the N-86 investigation. A floor-to-round swap left the prediction byte-identical ($4,243 at a coarse grid) and moved the replay by -$22 (the item row records the replay moved 1.7% the wrong way). The value sweep never calls `computeRisk`. A later read-only analysis (N-89) agreed that the cushion floor as stated was not the driver.
- Decision: kept as a documented approximation, no code change. One related piece stays open under N-89: the replay builds its policy tree from a floored day-start reference (experiment E3), which WP60 addresses.
- Verification: no code changed, so there is no regression test and nothing for the santa pass to check except the decision.

### 8.2 CLI

**N-78: the CLI accepted unknown flags silently (WP46, WP46b, WP46c; waves 47d, 48, 49).**
- Finding: `optimize dp --stop-points 4 --instrument ES --totally-bogus-flag 7` ran and printed unsized results, because `optimize dp` declared neither flag; a typo in any command was ignored the same way. Found by PT-47c. A zsh run on 2026-09-26 showed the hazard: an unsplit `$FLAGS` reached the CLI as one argument and `optimize dp` quietly ran with its defaults.
- Cause: citty accepts undeclared flags.
- Fix: one shared guard, `src/cli/unknownFlagGuard.ts`, wired once in `src/cli/index.ts` before `runMain`. It walks the command tree and exits 1 on any flag the leaf command does not declare, naming the closest declared flag; aliases, camel and kebab case and `--no-` negations of declared flags still work. `optimize dp` now declares `--stop-points` and `--instrument` and wires them into both DP grids through `resolvePositionSizing` (smoke test: ES at a 4-point stop places $400 = 2 contracts). WP46b: `prop ladder` declares its 16 funded-only flags so its own specific reason reaches the user. WP46c: a command can mark flags as known but unsupported (`KnownUnsupportedFlag`), so `prop ladder --help` lists only what works.
- Regression test: `tests/unit/cli/unknownFlagGuard.test.ts` and the CLI suite (13 files, 755 tests for WP46). The package text specifies RED first; the RED run itself is not separately recorded. Review HIGHs fixed: a negative numeric value such as `--x -5` was taken for a flag (in WP46 and again in WP46c), and relative imports instead of `~/`.
- Verification: reviewed, APPROVE on re-review for WP46 (wf_bbdb1046-72e), WP46b and WP46c. Close-out review pending.

### 8.3 Plan rules and firm data

**N-79: TPT's violated eval passed at twice the profit target (WP47, wave 46b).**
- Finding: TPT Rule 5 (Zendesk article 15170316538013, edited 2026-09-22): a violated eval passes only once net P/L exceeds 2 x the best day. The engine passed it at 2 x the profit target.
- Cause: the DoubleTarget branch of `Plan.isPassed`, the eval DP grid and the TPT notes.
- Fix: `isPassed` passes a violated eval only when profit is greater than 2 x the best day; TPT's rule is `ConsistencyBoundary.Inclusive` (a 50% share is a violation); a `Plan` constructor invariant refuses DoubleTarget without the inclusive boundary; the eval DP ceiling doubles the whole untracked ceiling (disclosed as a bucketing approximation when the best day fills the ceiling).
- Regression test: RED seen against the old code. TPT characterization re-pinned with a pre and post block (eval pass 0.83 to 0.825; expected monthly net $5,056 to $4,956); the ladder test that pinned the old behaviour now expects a pass rate of 0. 683 related tests green. The orchestrator also fixed `AlphaConsistency.test.ts`, which assumed every other firm passes at exactly its share (154 tests green).
- Verification: reviewed, APPROVE on re-review (wf_b13d8c4d-0ad). One LOW (the rule description did not name the doubled goal) was closed in WP48b. Close-out review pending.

**N-80: TPT's weekly trading requirement is a calendar week (WP48, WP48b; waves 46b-2, 46c, 47d).**
- Finding: the engine modeled a rolling 7-session idle counter with no disclosure (TPT PRO and both PRO+ builders).
- Cause: `maxConsecutiveIdleDays` used for a rule the firm states per calendar week (Zendesk 15171769361053 and 15172006753821).
- Fix: `core/InactivityRule.ts` with `CalendarWeekInactivityRule`; `Plan.calendarWeekInactivityFor(phase)` (funded only); `LivePlan.calendarWeekInactivity`; week counters on the account states. `TradingDayLedger.closeTradingDay`, `simulator/day.ts` and `livePhase.ts` close the account at the end of any 5-session week with no traded session. A plan cannot set both rules. Disclosed approximation: "Sunday to Friday" is modeled as 5 sessions from the funded start. WP48b: the rule is exported through the core barrel and the TPT rule line names the doubled goal. Disclosed gap: the exact DP has no calendar-week concept, so `optimize dp` with a nonzero idle-day probability models no inactivity closure for TPT (inert at the default 0); WP54 prints it as the `CalendarWeekInactivityIgnored` gap line.
- Regression test: RED seen for the funded and live paths (the old rule closed a two-week gap with a trade in each week at session 8 and missed a zero-trade week until session 7). Tests in `tests/unit/lib/prop-calculator/core/InactivityRule.test.ts`, `FundedStateValueCalendarWeekGap.test.ts` and `describe/PlanRuleDescriptions.test.ts`. 17 files, 1,717 tests green for WP48.
- Verification: reviewed, APPROVE from both reviewers for WP48 (LOWs only) and WP48b. Close-out review pending.

**N-81: FundedNext Live lock-keyed contract cap and withdrawal floor (WP49, WP49b; waves 46, 47b).**
- Finding: the firm's lock-keyed cap (3 minis / 30 micros before the threshold locks, 6 / 60 after, at +$2,000 profit or a payout request) was not modeled. Article 16522296 contradicts itself on the withdrawal auto-liquidation floor ($2,000 in section 5, $1,000 in section 6).
- Fix: FundedNext Live caps 3/30 then 6/60 keyed on the lock; the withdrawal floor is $2,000.01 and the trading floor stays $1,000; the contradiction is disclosed (U25). WP49b (the WP49 review's HIGH): one shared `core/LockKeyedContractCapLivePlan.ts` used by FundedNext and Alpha Futures instead of two copies.
- Regression test: RED seen (WP49). `LockKeyedContractCapLivePlan.test.ts` and `firms/fundednext/FundedNextLive.test.ts`. WP49b: both firms' `prop live` outputs byte-identical before and after in 6 runs; 106 files, 3,384 tests, 0 failed; typecheck and knip clean.
- Verification: reviewed, WP49 with a HIGH (the duplicated class) fixed in WP49b, which was APPROVE from both reviewers. Close-out review pending.

**N-82: FundedNext Rapid Daily funded contract cap (WP49, wave 46).**
- Finding: fundednext.com/futures now publishes a 4 / 40 funded cap for Rapid Daily; the engine had none.
- Fix: Rapid Daily's funded phase uses a 4 mini / 40 micro cap.
- Regression test: RED seen. A 400-trial check gave funded survive 4.5% to 10.0%, as recorded.
- Verification: reviewed (WP49). Close-out review pending.

**N-83: Lucid Pro and Pro no-DLL waited 3 days after passing (WP51, wave 46).**
- Finding: `minDaysAfterPassForPayout` 3; payout article 12890092 gives 0, as the engine already had for Lucid Direct.
- Fix: Lucid Pro and Pro no-DLL may request a first payout any day after eligibility (article 12890092 re-fetched 2026-09-26).
- Regression test: not separately recorded as RED; 13 files, 681 tests, 0 failed (`lucidTrading.test.ts` and the Lucid live tests are the package's named tests).
- Open point: the New Live Structure article's "Earn a live account after Payout 5" is a discretionary review pool, not a count trigger, so the live move was left to prop-tools Q14, which gates PT-35.
- Verification: reviewed, APPROVE. Close-out review pending.

**N-84: MFF Rapid is a re-buy, not a reset (WP52, WP52b; waves 46, 47a).**
- Finding: the engine modeled Rapid with a reset; the Rapid FAQ says "There is no reset".
- Fix: Rapid's retry is `RetryKind.Rebuy`; list prices unchanged; the Rapid 50K "start off with 2 contracts" scaling (schedule unknown, U26), the Pro and Rapid EOD reset prices (modeling defaults, U24) and the missing Rapid Live DLL (U24) are disclosed. A reset coupon of 50% bills the re-buy path twice, pinned. WP52b: the cost and cash-flow tooltips no longer name re-buy firms by hand.
- Regression test: not separately recorded as RED. WP52b has a pin built from `ALL_FIRMS` and the re-buy plans' names (`tests/unit/app/prop-calculator/kpiDescriptions.test.ts`).
- Verification: reviewed, APPROVE for WP52 on its own files and WP52b. LOWs went to prop-tools PT-50 (the pin misses the short name "MFF"; a describe title in `cashFlowRetryDisclosure.test.ts` still says the copy names plans). Close-out review pending.

**N-85: notes-only corrections (WP53, wave 46c).**
- Finding: TPT notes cited a 403 caveat and a third-party site; Tradeify Lightning's payout basis conflicts (U27); Tradeify Select's 50% consistency add-on is $205 eval and $135 reset at 50K, not "+$200"; Alpha Futures' Qualified-stage monthly fee conflicts (U28).
- Fix: notes only, no engine value changed. TPT cites Zendesk 15171769361053, 15169066911133, 15172006753821 and 15171978600349; both Lightning readings are disclosed (the engine keeps 0 minimum days); the Select add-on prices come from 14369021 with the 2026-09-17 "+$200" reading kept as a conflicting observation; the Alpha monthly-fee conflict is disclosed.
- Regression test: none new for values (notes only); existing note-pin guards apply. The orchestrator re-fetched all six pages on 2026-09-26 23:23 UTC (HTTP 200 each; TPT through the Zendesk API) and confirmed every quoted phrase and price.
- Verification: reviewed, APPROVE (LOWs only). Close-out review pending.

**N-91: Alpha Futures live accounts ignore the firm's scaling daily loss limit (WP63, wave 61; fixed by disclosure).**
- Finding: article 10743344 (dateModified 2026-08-21) lists "Scaling Daily Loss Limit (30% of account)" for both live programs; `buildAlphaFuturesLivePlan` sets `liveDailyLossLimit: null`.
- Cause: the article gives no base, scaling trigger, floor or breach consequence. The $3,000 start and "a pause until next trading day" appear only in the Legacy-scoped article 11023753.
- Fix: the open-wording branch. `liveDailyLossLimit` stays null; the Alpha live note says what the firm leaves open and that every Alpha live figure ignores the limit. Modelling waits on U30.
- Regression test: `tests/unit/lib/prop-calculator/firms/alphafutures/AlphaFuturesLiveDailyLossLimit.test.ts` (new). The engine figure is unchanged, so there is no RED on a number; the RED run itself is not separately recorded.
- Verification: reviewed, APPROVE from all three reviewers (wf_a3eef103-22c). Close-out review pending.

**N-92: the Lucid Daily live transition payout's split (WP63, wave 61).**
- Finding: the Lucid Daily Live page caps the sim profit paid on the move to live at $15,000 but states no split and says the payout "may" be paid after KYC; `buildLucidDailyLivePlan` pays it net of the 90/10 split, an inference.
- Fix: the note says the 90/10 split is the tool's reading from the Payouts article (15997266) and that the payout waits on KYC and sub-account approval (16010520, dateModified 2026-07-27). The CLI-shown live-transfer notes already carried both. Engine behaviour unchanged.
- Regression test: `tests/unit/lib/prop-calculator/firms/lucid/LucidDailyTransitionNote.test.ts` (new, a note guard); the RED run itself is not separately recorded.
- Verification: reviewed, APPROVE from all three reviewers (wf_a3eef103-22c). Close-out review pending.

**N-93: FundedNext payout gates and FNL:003 rules against today's articles (WP61, wave 59).**
- Finding (DOCS-R6, confirmed by its independent check; FundedNext re-created its help articles on 2026-10-01):
  - (a) Legacy gated only later withdrawals on $500 of cycle profit; 17229581 requires $500 of current-cycle profit before each withdrawal.
  - (b) Rapid Daily required $500 above the buffer (old article 15878210); 17229779 requires an EOD balance at or above the buffer and $500 of current-cycle profit.
  - (c) FNL:003 (discontinued): the Labs card states a $1,000 daily loss limit and "Get Rewards In 5 Days"; the engine modeled neither.
  - (d) the FundedNext Live and Flex notes were stale.
- Fix: the Legacy $500 gate applies to every withdrawal; Rapid Daily uses the buffer-plus-$500-cycle-profit rule; FNL:003 gets the $1,000 DLL and the 5-day wait (the tool's conservative reading of the Labs card, disclosed, question U29); the Live and Flex notes are re-cited. The guards `PlanRuleDescriptions` and `dailyLossLimitLabel` were updated, and the orchestrator fixed the "$500 buffer" web label (`describeFirstPayoutGate` now says profit).
- Regression test: the package specifies RED first (a Legacy funded account with its 5 Benchmark Days and $400 of cycle profit cannot take its first payout; Rapid Daily allowed at the buffer with $500 of cycle profit, denied just under it). The wave row does not state the RED run explicitly.
- Verification: reviewed, APPROVE on re-review (wf_101afdfd-aab). Close-out review pending.

**N-94: Topstep Live Funded Account breach, inactivity, start and note (WP62, WP62b, WP62c, WP62d, WP62e; waves 59 to 65).**
- Finding (DOCS-R6, confirmed):
  - (a) the LFA busted at exactly $1,000.00, the firm says "drops below $1,000";
  - (b) the engine closed the LFA and XFA after 30 idle days as certain, the firm says accounts with no activity for more than 30 days "may be closed";
  - (c) every LFA started at $10,000 even when the capped XFA balance was lower, while 13747178 says Topstep "supplements from that same capped amount to meet the $10,000 minimum";
  - (d) the `TopStep.ts` note cited the pre-2026-10-01 date of 10657969.
- Fix:
  - WP62: inactivity closes on the 31st idle session on the XFA and LFA and is disclosed as the tool's reading of "may be closed"; `buildTopStepLivePlan` follows 13747178 and throws at or under the $1,000 floor; the note cites the 2026-10-01 revision. The orchestrator fixed three guards WP62 missed (FundedPayoutCycle 30 to 31, the FromStateViews live-start note, the lockoutRoom TopStep pin 771.62 to 755.77, traced by re-running the old pin with the closure at 30).
  - WP62b: the LFA is `StrictlyBelowStaticDrawdown` ($1,000.00 alive, $999.99 busted), and a live account at cushion 0 that is still alive places its one-contract minimum (`resolveLiveFloorTradeRisk`, generic). The Trading Combine carries no inactivity rule (no Topstep page states one; 8284121 and 8284197 checked), so the lockoutRoom TopStep pin moved 755.77 to 312.82 (idle Combine accounts are kept and billed instead of closed; a test with the 31-session limit restored reproduces 755.77).
  - WP62c: the live sizing advice offers the one-contract minimum at a still-alive strict floor; a DLL-only live plan keeps its cushion-capped loss; `LivePlan.withdrawableAmount` drains a strictly-below floor to exactly the floor (T23 re-pinned for that class only: $10,999.99 to $11,000). The LFA note cites 8284233's "Requesting a full 100% Payout closes your LFA" as a conflict the engine does not model.
  - WP62d: the documented live ladder at a still-alive strict floor offers the rung the simulator places ([450] on a Topstep LFA at $1,000.00); one `LivePlan.isFloorAlive`; one sizing-cushion lift in `LiveSizing.ts`; the `prop live` help and withdraw wording say the drain stops at the lowest balance that stays alive.
  - WP62e: one `isPlacementChecked(stage)` gates the live daily plan card's whole-contract placement at the entered stop; one named `liftLiveSizingCushion` (core barrel).
- Regression tests: RED runs are not separately recorded in the wave rows. They record the traced re-pins above and these checks: `caps().affordable` equals `resolveLiveRiskAt`'s 450 on a Topstep LFA at $1,000.00; and `prop live --firm topstep --winrate 0.36 --commission 30 --stop-points 22.5` shows inactivity closures 0.0% (5.25% before WP62b). A zero-cushion live account used to size to risk 0 and idle into a false closure.
- Verification: reviewed. WP62, WP62b and WP62c were WARNING on re-review with no HIGH (their open points were closed by the next package); WP62d and WP62e were APPROVE. Handoffs to prop-tools PT-73c addendum B: the web options builder and `prop advise` still pass the stop only for funded accounts, and the gate helper moves to `PlaceableMinimum.ts`. Still running in prop-tools: PT-36s (the floor-rung reason's personal daily loss limit, and one CLI wording for a priced trigger). Close-out review pending.

### 8.4 In progress: N-89 and N-90

These two are not fixed. This section is finished after WP60 and WP66 (the DP speed packages) land and their reviews run; until then the figures below are the current measurements, not results of a fix.

**N-89: the default-grid prediction overstates the replay on the funded side (WP59 done; WP60 running).**
- Finding: after WP58c the fast grid (cushion step 0.25, action step 0.125) predicts TopStep No-fee Standard within $54 of its replay, but the default grid (cushion 0.1, action 0.05) predicted $5,200 against a replay of $4,140 (-$1,059, 20%) with only 3.6% saturation.
- Eval half, fixed (WP59, wave 56, reviewed APPROVE on re-review, wf_9c94c510-155):
  - The eval DP no longer reads any value through an interpolated table: the whole within-day tree is an exact memoised recursion over the exact cushion; the replay solves from the exact day-start state; a cushion-0 cell that was never solved (so 58% of replay day starts on a 12-day TopStep eval had no key and idled; old DP 0.569 against a simulated 0.2395, new 0.6235 against 0.6155) is now solved on demand; `optimize dp` prints `evalPassCrossCheckLine`.
  - Regression test: `tests/unit/lib/prop-calculator/core/EvalStateValuePassSmear.test.ts`, which compares the DP value with the exact pass probability of its own policy (960 one-day toy configs now match). Pins moved with traced reasons (the Rapid EOD pass pin 0.662 to 0.681, a hand-derived $25-win exact pass). MFF Rapid EOD 50K, 30-day eval: old 110 s and 254,800 states, DP 0.6744 against sim 0.6643; new 2.8 s and 62,214 states, 0.6806 against 0.6811.
  - Open (LOW): default-grid memory and time unmeasured (string memo keys, a replay cache of up to 4,096 day recursions); a weak cache-contamination guard test.
- Measurements, TopStep No-fee Standard with the gate flags (predicted / replay / gap):

  | Run | Grid (cushion / action) | Predicted | Replay | Gap |
  |---|---|---|---|---|
  | C (before WP59) | 0.25 / 0.125 | $4,585 | $4,526 | -$59 |
  | A (before WP59) | 0.1 / 0.125 | $4,572 | $4,756 | +$184 |
  | B (before WP59) | 0.25 / 0.05 | $4,475 | $3,700 | -$775 |
  | D11-r4 (before WP59) | 0.1 / 0.05 | $5,200 | $4,140 | -$1,059 |
  | M1 (after WP59) | 0.25 / 0.05 | $4,476 | $4,474 | -$2 |
  | M2b (after WP59) | 0.1 / 0.05 | $5,205 | $4,164 | -$1,040 (20%) |
  | G2 (after WP58e, row N89-f) | 0.1 / 0.125 | $4,665 | $4,842 | +$177 |
  | (a) E3, exact day-start tree, default grid (row N89-f) | 0.1 / 0.05 | $5,205 | $4,427 | -$777 |

  M2b used 6,596,797 states, 7,495 s and peak 7.4 GB. FTMO Growth at the default grid (M3, after WP59): predicted $5,404, replay $5,129, gap -$275 (5.1%; D11-r4 before WP59: $5,403 / $5,134, -$269). Eval pass per attempt, DP against simulator: TopStep 47.4% against 47.7% (M2b), 47.1% against 47.2% (M1); FTMO 45.4% against 45.9%. Gate D11 after WP59: TopStep 4,164 / 3,065 = 1.36x, FTMO 5,129 / 2,924 = 1.75x, both pass.
- Reading so far (the tracker's own): WP59 removed the eval half everywhere (M1 -$775 to -$2). The default-grid gap is unchanged, so it sits on the funded side, and it needs both fine grids: -$2 at 0.25 / 0.05, +$177 at 0.1 / 0.125, -$1,040 at 0.1 / 0.05. Ablations that did not close it: neutralising TopStep's $150 winning-day gate (E1, run at the 0.25 / 0.05 grid, not the default grid: predicted $5,892, replay $4,786, -$1,107). Ruled out without an N-89 ablation: the horizon hazard and the cycle-baseline round-up (by code reading, wf_ae8baf96-d47). Evidence carried over from the N-86 round 3 investigation (wave 50c, wf_87b5fe3e-4a8, at the fast grid, before the tail): turning ReleaseFloor off in the solver changed nothing to the cent, and the geometric horizon hazard was refuted because a replay under the DP's own hazard was further off, not by turning it off. E3 (the replay's policy tree built from the exact day-start cushion) recovers $263, about a quarter of the default-grid gap (E3 on the 0.25 / 0.05 grid recovered about a fifth), so three quarters sit in the prediction itself.
- Still running or not yet run (pending, no result recorded):
  - (b) `bmin` (minimum of the two neighbouring cushion nodes for payout-bearing outcomes) and `bexact` (the funded day close at the exact cushion, the funded analog of WP59) at the default grid on the build PC; `bexact` is an unreviewed prototype of about 1,173 diff lines.
  - WP60 (running, wave 69): the funded replay and day close from the exact cushion, with a toy RED by exact enumeration. Its acceptance is the prediction within about 5% of the replay on TopStep and FTMO, with the replay not below $4,164 and $5,129. Its package text notes that if no ablation closes the gap, the finding goes back to you with the measurements and no grid is tuned to the test.
  - G1 (the post-WP58e default-grid baseline) was killed by the runner's own 5-hour cap after 18,002 s with no result and was not re-run; M2b stays the baseline, because WP58e changes nothing on TopStep No-fee Standard.
  - The DP figure reruns and PT-30a to PT-30d (the DP library and gate run for the advice rows, its table and migration, `advise --dp --store`, the web row) wait for these.

**N-90: leftovers in the funded DP grid (WP58d found them; WP58e fixed one part; WP66a pending).**
- Finding: (a) MFF Builder 50K costs far more states than before the tail because `cycleBaselineMax` follows the cushion tail top; (b) the best-day bucket cap `maxDailySwingDollars + slots * cushionStepDollars` was not a proven bound, so a lock-transition day could pass it and the DP could allow a payout the real consistency rule denies (the optimistic direction); (c) two Alpha consistency toys stop at the 200-sweep cap on the default tail, and a real Alpha Qualified 50K at the default tail on the fast grid did not finish in about 30 minutes.
- (b) fixed (WP58e, wave 57r, reviewed APPROVE on re-review, wf_58e5bc33-9d9): a new `FundedCycleBestDayGrid` with an overflow bucket for a best day past the last real bucket, so the cap can only fail closed. Tests in `tests/unit/lib/prop-calculator/core/FundedCycleBestDayGrid.test.ts`. Values are unchanged to the cent on Tradeify Lightning and Growth, TopStep Standard Consistency XFA, Alpha Zero and Alpha Standard (one more best-day bucket per level); MFF Builder moves -0.003; the constructed over-cap toy moves 5,914.05 to 5,477.47, below the never-clamped 300-bucket grid's 6,132.41.
- (a) not met: capping `cycleBaselineMax` at the cushion fine top cuts Builder to 1.94x states but moves its value from 11,541.09 to 21,217.62 (a post-payout balance above a clamped baseline is credited as extra cycle profit and farmed), so the grid stays. The cost is recorded as 8.4x on Builder and 13.7x on Alpha Standard (a pinned trade-off). The item row quotes 6.2x for Builder (1,406,160 against 226,800 states) from WP58d's review; the tracker does not reconcile the two figures.
- (c) not met: `optimize dp` always passes a funded horizon, so its sweeps converge by construction. Alpha Standard 50K at the fast grid and default tail converged (2,716,038 states, 2,519 s for one funded solve, value 76,874.27 against 76,610.74 at tail 6), but a complete default-flag CLI run was never seen to finish (killed at 3,300 s). The measurement on the build PC then threw after 121.6 s: "FundedStateValue: worker 0 did not finish within 120000 ms (it may have failed to load)", peak 5.65 GB, on a loaded machine. `optimize dp` throwing at its defaults breaks WP58e's acceptance; the fix (a liveness check instead of the fixed watchdog, WP58f) is folded into WP66a.
- Follow-ups named by the reviewers: a pessimistic cycle-baseline design (a geometric far-tail step or an absorbing top cell) measured before relying on the default tail for consistency plans; a library caller with no horizon can get an unconverged funded solve with no flag; the default-tail values of the other consistency plans are unmeasured against the new cap.
- Pending: WP66a (DP speed part A: the eval DP fast path, the worker cap lifted with a `--workers` flag, fewer rate-search solves, the liveness check; running, wave 70) and WP66b (DP speed part B: the allocation-free inner loop, one payout regime, policy-cached sweeps; todo, after WP60).

### 8.5 Docs remediation

**DOCS-R6 (FundedNext and Topstep help-article re-check, 2026-10-02): docs done, engine follow-ups WP61 and WP62 fixed (N-93, N-94 above).**
- Round 1 (wf_b8e109eb-c90): FundedNext 139 of 139 help articles enumerated (no sitemap; enumerated from the help center's own page data), 10 files updated, products sold today recorded (Legacy, Flex, Rapid Pro with the optional DLL Add-On, Rapid Daily; plain Rapid, Bolt and FNL:003 not sold, matching the engine's availability); Topstep 57 of 57 sitemap articles fetched, `live.md` updated. Both independent checks failed on doc details.
- Round 2 (DOCS-R6b, wf_d1b2737c-3dd): Topstep PASS; FundedNext failed on one MEDIUM (the package-comparison pages' futures block unread; its Drawdown Mode tooltip gives the +$100 lock only for Bolt and Flex).
- Round 3 (DOCS-R6c, wf_b2cd7c75-c7e, FundedNext): PASS. The comparison pages agree with the plan files in every figure; the +$100 lock wording is recorded as a conflict (the help center and the Challenge Terms keep +$100 for Rapid Pro and Daily, as the engine does); three LOW ledger notes were fixed by the orchestrator.

**DOCS-R7 (docs remediation, phases 2 to 6, 2026-10-02): not finished.**
- Done: batches R7-1 to R7-4 (ftmo-futures and alphafutures, lucid and mffu, tpt and e8futures and fundednext, topstep), each with a fresh checker. Three triage passes (22 + 13 + 6 items, every quoted fragment re-checked verbatim) produced the notes fixes that went into WP64 and WP64b below and the questions U31 to U33.
- Blocked on you: `apextraderfunding.com` answered HTTP 403 to every direct fetch (the Apex legal documents and the 63 keyword-scanned help pages stay unread; a paste request), and the Lucid pricing pages (403) and MFF's Simulated Trader Agreement (not published) were handed to you. The E8 Signature reset fee is still not stated as its own figure on any page the firm lets us read (the help center and checkout return 403); WP64 below prices it at the list price.
- R7e (tree-wide re-audit, REMAINING.md at the end state): the first run (wf_083d4d93-eb1) rewrote REMAINING.md to 499 Not Confirmed bullets in 46 files (308 unresolvable, 74 live conflicts, 22 needs paste, 56 out of scope) and 39 consolidated paste requests, and its recheck FAILED on four MEDIUM classes. The fix run (wf_e0e3b409-732) took two rounds and its recheck still failed (the same four classes in more files). The script-backed sweep (wf_09a026a2-e30) is running. The counts above are therefore not final.
- WP65 (provenance records: verified-on dates, open items per firm) is todo after R7e.

**WP64: the E8 Signature list price and stale firm notes (wave 63, wf_89180acf-2e4).**
- Finding (DOCS-R7 triage T-1, T-4, T-10, T-14, T-23, T-25, T-29, T-30, T-33, T-35): the E8 Signature $50K evaluation fee was $160 and is $170 on the live configurator (`products.e8signature_v_fu.balances.50000.price`, read 2026-10-02; the old `e8signature_fx` product still shows 160 but is not sold). Several notes were stale.
- Fix: the E8 Signature fee and reset are $170 (pins re-pinned with the reason); the E8 code notes give the configurator's 5% first-order code, the codes page's 25% and 35% and the 40% homepage promo, and say no typed code lowers the modeled fee. FTMO: "sooner", not "immediately", and Sim-Funded acceptance is not guaranteed and the offer may be time-limited (T&C cl. 5.10, 6.2, 6.5). Alpha: the Advanced Qualified MLL conflict is recorded pending U31; ALPHA40 is the only listed code; DIRECT35 is a launch offer for all four Direct sizes, not modeled. TPT: the dashboard's minimum-withdrawal text (the engine's $0.01 is the tool's reading) and the PRO 50-executions request (not modeled). FundedNext: no page states minimum trading days, and Legacy's Reserve and Auto Liquidation live program is not modeled (R1-47).
- Regression test: new guard file `tests/unit/lib/prop-calculator/core/FirmNotesLiveRecheck.test.ts`; the E8 fee pins moved with the reason.
- Verification: reviewed, APPROVE on re-review. Close-out review pending.

**WP64b: Topstep notes (wave 66, wf_cf4c75ce-836).** The Combine note states the engine's tie reading (exactly 55% passes; above it the pass waits for Best Day / 0.55) and the conflict between 8284208 ("at or below") and 8284197 and 8284099 ("below"), U32. The Pro note quotes 14645398, places the $5,000 on the 150K row, says no page gives the base of the 50% so no share cap is modeled, and that the $125 minimum reaches Pro only by cross-reference (U33). A Pro fee pin was added. Notes only; reviewed, APPROVE.

### 8.6 What is still pending

Nothing in this list has finished, and none of it is claimed as done above.

- WP60 (funded replay and day close from the exact cushion; N-89), running.
- WP66a (DP speed part A, including the liveness check and N-90c) running; WP66b (DP speed part B) todo, after WP60.
- PT-36s (one CLI wording for a priced trigger; the floor-rung reason's personal daily loss limit), running in prop-tools.
- PT-30a to PT-30d (the DP advice rows), waiting for the N-89 work.
- The DP figure reruns: every DP figure measured at the old grid top or before WP59 (engine results, the skill's tables, the figures in sections 2 and 7 for `optimize dp`) needs a rerun on the final engine; none has been done.
- The close-out reviews: CLOSE-1 (wf_936f6dae-9ac), the santa review of N-77 to N-85 and N-91 to N-94 and five prop-tools engine-edit handoffs, running; N-86 to N-90 wait for WP60 and WP66. CLOSE-2 (wf_5c92f165-a67, the skill update, this report and the user handoff) is running.
- DOCS-R7e (sweep running) and WP65 (todo).
- A repo-wide read-only check (eslint, stylelint, typecheck, knip, the test suite) covering the work in this section is not recorded in the trackers. The last recorded one is the G2 check of 2026-09-26 (scratchpad `repo-check-2026-09-26c`, section 1), which predates every package here. Individual packages record their own typecheck, lint and targeted test runs only where quoted above.

When WP60 and WP66 land and CLOSE-1 covers N-86 to N-90, this section is finished and N-89 and N-90 get a final status.
