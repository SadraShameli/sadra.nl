# Per-Firm Account Policy — validated against official help centers

**Scope, deliberately narrowed 2026-09-22.** This file used to also carry per-plan trading parameters (drawdown amounts, consistency %, DLL, contract limits, payout structure, fees) — that was a real, unmanaged duplicate of the same facts already encoded in the actual engine (`src/lib/prop-calculator/firms/*.ts`), which drives real simulations and is the thing that actually gets fixed when a firm changes its rules. A hand-copied number here had no way to stay in sync with that. **For any plan's trading parameters, use `cli prop plans --firm <firm> --variant <variant>` directly** (per RULE #0 in `SKILL.md`) — its output already includes the live-source devlog notes behind each figure, which this file never had room for anyway.

What's left here is account-level policy the engine genuinely does not model at all: how many accounts you can hold, reset/purchase limits, what happens when you're moved to live, and firm-identification/safety notes. None of that is a `simulate()` input, so there's no engine copy to go stale against — it only goes stale if the firm's own policy changes, which is exactly what re-verification is for.

Re-verify before spending money; these change often.

## Contents

- [MyFundedFutures](#myfundedfutures)
- [Take Profit Trader](#take-profit-trader)
- [Tradeify](#tradeify)
- [FundedNext Futures](#fundednext-futures)
- [Apex Trader Funding](#apex-trader-funding)
- [Lucid Trading](#lucid-trading)
- [Topstep](#topstep)
- [FTMO Futures, AlphaFutures, E8 Futures](#ftmo-futures-alphafutures-e8-futures)
- [Account caps](#account-caps)
- [Live transition triggers](#live-transition-triggers)
- [Can you still buy/hold evals once moved to live?](#can-you-still-buyhold-evals-once-moved-to-live-verified-2026-09-14-primary-sources)
- [Minimal-live ranking](#minimal-live-ranking-2026-09-14--for-a-stay-on-simfunded-as-long-as-possible-goal)

For a live, current ranking of firms/plans by any real objective (fastest, most money, lowest bust), use `cli prop compare`, `cli prop optimize funded`, or `cli prop optimize dp` directly — see `SKILL.md`'s RULE #0. A static ranking table here would be exactly the kind of thing that silently drifts stale.

---

## MyFundedFutures

Evaluations became **one-time payment** (no subscription) as of Aug 25 2026 — a pricing-model shift, trade-off is a 7-day inactivity rule with no billing to pause it against.

**Max funded accounts: Three (3)**, per the Sim Funded parameter table — see [Account caps](#account-caps) below. Whether that's per-plan or global across MFF's other plans is genuinely unresolved; see `references/open-questions.md`.

### Live

Multiple Rapid accounts **combine into ONE** live account with proportionally raised MLL. Triggers: **$10,000 net profit in one day** (excess forfeited) or discretion. Up to $5,000 moved to Reserve. Cannot trade sim and live simultaneously.

---

## Take Profit Trader

**Execution rules** (not simulated by the engine at all): no bots/algos (manual only), exit before CME price limits, **≥1 traded day per calendar week**, no counter positions across accounts, news blackouts (FOMC, NFP, CPI; plus crude inventories, bond auctions).

**Purchase/reset limits:** max 5 PRO/PRO+ combined. 10 activations per 30 days. 3 resets per PRO account.

**PRO+ (live):** discretionary placement (~60 days of disciplined risk expected). $5,000 of PRO profit frozen as backstop, released on upgrade.

---

## Tradeify

**Resets: evaluations ONLY.** Official: "There is no reset option for Lightning Funded or Sim Funded accounts. If you fail these accounts, the failure is permanent." Cycling a funded account = buying a **new eval at full price**, not a discounted reset.

**Purchase limits:** 15 Select evals / 30 days; 10 resets per eval / 30 days; 5 Growth activations/day.

**Elite Live:** eligible at **3 payouts on one account OR 10 total**. **Mandatory — cannot decline.** Each funded account with ≥1 payout becomes **its own** live account (up to 5). Blown live = up to 4-week cooldown, then buy a new eval. Live/sim exclusivity extends to the **entire household**.

---

## FundedNext Futures

Use `helpfutures.fundednext.com` — the **futures** help center, not the forex/CFD side.

**Rapid and Bolt discontinued for new purchase/reset as of July 10 2026.** Current: Flex, Legacy, Rapid Pro, Rapid Daily.

**Live triggers:** Legacy = $100,000 Total Active Profit OR **5 withdrawals from a single account**. Flex/Rapid = **15 Performance Rewards**.

**Blown live is NOT the same outcome on both programs** (verified 2026-09-14, both primary sources
read in full): **Flex/Rapid** = 2-week cooldown (4+ if reckless), then normal sim path, purchasing
Challenge Accounts again. **Legacy** = liquidation is terminal — *"The account is permanently closed...
The account cannot be reset."* No cooldown, no documented path back to sim/eval purchasing at all.
Legacy's live failure is meaningfully worse than Flex/Rapid's.

---

## Apex Trader Funding

Full product replacement ("Apex 4.0") March 1 2026. **Metals halted** (GC, SI, QI, QO, MGC, HG, PL, PA) with no announced return.

⚠️ **Historical gotcha, worth keeping:** the **$53,000/$55,000** figures in Apex's "Intraday Trailing Drawdown Explained" apply **only to the Evaluation stage on Rithmic/Wealthcharts** — NOT to Performance Accounts. On Tradovate, evals trail indefinitely. This was mis-scoped once and produced a badly wrong result — a reminder to re-read which account TYPE a given Apex article is actually describing, not just trust the number.

**No resets** — a failed eval means buying a new one. **30-calendar-day eval time limit.**

**Live:** see the Apex section in `SKILL.md`. Live inactivity is *looser* than PA inactivity — just needs to be traded.

**Restricted:** US-only service; 84 countries blocked. Look-alike domains exist (`apexfundtraders.com`, `apexfundingtrader.com`) — the real one is `apextraderfunding.com`.

---

## Lucid Trading

Types: LucidFlex, LucidPro, LucidDirect, LucidDaily. LucidMaxx is invite-only.

⚠️ **Lucid's docs do not state whether the EOD breach is enforced intraday or only at close** — see `references/open-questions.md` for the full, re-verified-2026-09-22 status. Every other firm publishes explicit real-time language; Lucid doesn't. **Assume the conservative reading; ask support before relying on it.**

**Live:** each funded account with ≥1 payout becomes its own live account (up to 5, per household). One-time Live Bonus equal to the starting live drawdown. Blown live = 2-week cooldown, then new eval. **If one household member is live, others may not trade sim.**

---

## Topstep

**Reset policy:** Trading Combine has 2 resets per account per day, unlimited Combines. Two pricing paths exist at purchase — check `cli prop plans` for which is currently modeled as cheaper in expectation at your own sizing, rather than trusting a stale comparison here.

**Live Funded Account:** **exactly ONE, ever.** Size = average of eligible XFAs rounded up to the next tier. **20% available immediately, 80% held in Reserve**, released in four 25% increments. Uncapped payouts. Blown LFA (balance <$1,000) = must pass a **new Trading Combine** — the cleanest officially-documented recovery of any firm, and confirmed as the *only* recovery — there's no skip-the-eval shortcut even off a full liquidation (*"You must pass a Trading Combine first"*).

**Cannot decline the call-up** — *"Once the Risk Team determines you're ready, your options are to move to Live or close your Express Funded Account."* Same mandatory-transition pattern as Tradeify/FundedNext/MFF.

**Uniquely permissive on eval purchasing while live is active and healthy** (verified 2026-09-14): unlike every other firm here, TopStep explicitly lets you keep buying and passing new Trading Combines the whole time an LFA is open — *"The restriction is only on activation — a passed Trading Combine cannot be activated into an Express Funded Account while your Live Funded Account is active. That option becomes available again if the Live Funded Account is lost."* So a passed Combine just queues, ready to activate the moment Live is lost — see the comparison table below.

**Live inactivity:** closes after 30 days with no trading activity — *"Live Funded Accounts can't be put on hold."*

Disclosed stats: 16.8% of Combines pass; **0.71% of funded traders get called up to Live** — the lowest live-trigger risk of any firm, which is an *advantage* given a stay-on-sim goal.

**Back2Funded:** up to 2 XFA reactivations if lost **before** first payout.

---

## FTMO Futures, AlphaFutures, E8 Futures

**No account-policy section exists here yet for any of these three** — they were added to the prop-calculator registry after this file's account-policy sections were originally written, and (unlike the trading-parameter tables this file used to carry) account-policy facts like reset limits and live-transition triggers were never transcribed for them at all, not even a stale copy. AlphaFutures and E8 Futures each have a row in the [Can you still buy/hold evals](#can-you-still-buyhold-evals-once-moved-to-live-verified-2026-09-14-primary-sources) table below; FTMO Futures has none. Check each firm's own live help center directly before relying on anything about their account limits, reset policy, or live transition.

---

## Account caps

| Firm | Max funded | Scope |
| --- | --- | --- |
| **Apex** | **20 PAs** | combined across Legacy/EOD/Intraday, **per household** |
| MFF | 5 (25K/50K only), **3** if any 100K/150K | global across plans; Rapid EOD table says **3** — scope vs. global unresolved, see `references/open-questions.md` |
| TPT | 5 | PRO + PRO+ combined |
| Tradeify | 5 | any combination, **per individual AND household** |
| FundedNext | 5 | **per household/IP** |
| Lucid | 5 | combined across types, **per household**; 10 total incl. evals |
| Topstep | 5 XFAs | but only **1** live account ever |

**Caps are per-firm — running several firms in parallel is the way past any single cap.** Apex's sim ban applies only to Apex.

---

## Can you still buy/hold evals once moved to live? (verified 2026-09-14, primary sources)

Every firm bans **actively trading sim and live at the same time**. Where they differ hugely is
(a) what happens to the sim/eval accounts you already had, and (b) whether and how you get back
to buying new ones. Ranked most-to-least permissive:

| Firm | Existing sim/evals at transition | New eval purchases while live | Path back after failing live |
| --- | --- | --- | --- |
| **TPT** | Untouched — keep trading them | **Explicitly unlimited**, no restriction at all | N/A, was never blocked |
| **TopStep** | XFAs closed; Combines untouched | **Explicitly allowed** — *"You can have Trading Combines while actively trading a Live Funded Account."* Only *activating* a passed one into a funded XFA is blocked while live | Must pass a Trading Combine first either way (no skip-the-eval shortcut) — but per the line above, you're free to have already passed one queued up the moment Live fails |
| **Tradeify** | Closed | **Explicitly banned** ("cannot purchase or activate") | Automatic after a fixed 4-week cooldown |
| **FundedNext** | **Permanently closed, zero refund** (Flex/Rapid); Legacy's is the same but with **no reset path at all**, see below | Implied banned (silent, but "return to normal sim trading" language implies it was off) | Flex/Rapid: automatic after a fixed 2-week cooldown (4wk if reckless). **Legacy: none — liquidation is terminal, "the account cannot be reset."** |
| **MFF** | **Dormant** (not closed), refund if never funded | **Explicitly suspended** ("purchases are suspended during Live account operation") | **21-calendar-day cooldown, then normal purchasing resumes** — confirmed 2026-09-18, see correction note below |
| **Lucid** | Closed (refund if never funded) | **Undocumented** either way | 2-week cooldown documented, but framed as "return to live," not explicitly "resume normal eval purchasing" |
| **Apex** | Closed | **Explicitly banned**, no exception while live is healthy | Discretionary risk-manager exception ONLY after losing live — capped (e.g. max 3 PAs) and auto-reverts you to live on your first payout |
| **AlphaFutures** | Closed | **Undocumented** either way | Not found — declining live entirely "sacrifices all relations with any branch of the Alpha Group" |
| **E8 Futures** | N/A | N/A | **No live stage exists at all** — SimFi stays simulated forever, by E8's own design |

**Quotes, for the record:**

- Tradeify: *"If you have an ACTIVE Live account (Legacy or Elite): You cannot purchase or activate new evaluations... You cannot open new Sim Funded accounts... After your Live account has FAILED or CLOSED: You can purchase new evaluations or funded accounts after the cool-off period."* (Tradeify Elite Program article)
- FundedNext: *"All active Challenge Accounts are permanently closed at the time of transition. These accounts are not eligible for any refunds."* ... *"After completing the cooldown period, traders return to normal sim trading, purchasing Challenge Accounts and following the standard path back to live."* (Road To Live Trading articles, identical wording across Flex/Rapid/Legacy)
- MFF: *"All simulated trading accounts and additional purchases are suspended during Live account operation."* (Understanding Rapid Live) / *"Simulated Evaluations remain dormant after you transition to the Live Environment."* (Comprehensive FAQ)
- Apex: *"Can I return to the normal simulated Evaluation and Performance Account process? Only with a special exception from a risk manager... a trader may be limited to a maximum of three Performance Accounts in simulation. Once the trader achieves the first payout from those accounts, the trader may then be automatically moved back into live trading."* (Apex Live Prop Trading Program FAQ)
- TopStep: *"Can I have Trading Combines while I have a Live Funded Account? Yes. You can have Trading Combines while actively trading a Live Funded Account. The restriction is only on activation — a passed Trading Combine cannot be activated into an Express Funded Account while your Live Funded Account is active. That option becomes available again if the Live Funded Account is lost."* (Live Funded Account Parameters FAQ) — genuinely the second-most-permissive firm after TPT: you can buy and pass new Combines the whole time Live is active, you just can't turn a pass into a competing funded account until Live is gone. Separately, if Live *is* lost: *"If I lose my LFA, can I go straight back to an XFA without a Trading Combine? No. You must pass a Trading Combine first."* — no eval-skip shortcut either way. The Shoulder Tap (*"A Shoulder Tap XFA is a simulated funded account created after a call down from Live... You are limited to 1 Shoulder Tap XFA — no multiple accounts"*) is the softer, discretionary call-down that happens *without* losing the account outright — a separate mechanism from a full LFA liquidation.
- Lucid: *"All simulated prop accounts are closed when a trader is moved live... If you are not comfortable with evaluations being closed, do not keep evaluations in reserve."* / *"Traders who have been moved live may return to purchase a new evaluation after blowing a live account."* Nothing found on buying while live is healthy and unblown.

**✅ RESOLVED 2026-09-18 — the "21-day cooldown" figure is CONFIRMED, on a different page than previously checked.** The two generic pages checked in the prior pass ("Comprehensive FAQ - Live Accounts" and "Understanding Live Funded Account") genuinely don't mention it, and neither does the Rapid-specific "Understanding Rapid Live" article — that part of the prior finding was correct. But the companion article **"Rapid Plan - Reserve Program & Performance Bonus Structure"** (`https://help.myfundedfutures.com/en/articles/13286746-rapid-plan-reserve-program-performance-bonus-structure`, verified against raw page HTML, not a summarizer) has a section literally titled **"Post-Breach Cooldown Period Protocol"**:

> *"Following Live account closure due to Maximum Loss breach: **21-Day Cooldown Period initiation:** All Sim Funded account trading is prohibited. New Evaluation purchases, account resets, or additional account acquisitions are prohibited. **Post-Cooldown (21 calendar days):** Cooldown restrictions are lifted. You can continue from your active Sim Funded account (if applicable) and/or purchase new Evaluations or accounts, unless communicated otherwise by the team."*

Identical wording (headed "Live Post-Breach Cooldown Protocol" / "Live Post-Breach Cooldown Period Protocol") is also confirmed, via raw HTML, on **Builder Plan 50k** (`.../articles/14290805`) and **Flex Plan $50,000** (`.../articles/15072271`) comprehensive-guide pages, plus a condensed FAQ-style restatement on Builder Plan 50k: *"Q: What happens if my live account is breached? A: A live account breach triggers a 21-day cooldown period. During the cooldown, all sim funded account trading is prohibited and no new evaluations or account resets may be purchased. Once the 21 days have elapsed, all restrictions are lifted."* Checked and confirmed **absent** (raw HTML, zero matches) from Rapid Plan 25k/50k/100k/150k and Rapid EOD 50k comprehensive pages and from "Understanding Rapid Live" itself (both current page and a 2026-09-03 Wayback snapshot) — those pages are just silent on it, not contradicting it. No permanent-ban language found anywhere in any of these pages for a drawdown-breach bust; the only "permanent" language present is the MLL lock mechanic itself and the dormant shell Sim account's own permanent closure once its buffer is fully withdrawn — neither is a ban on the trader. The "unless communicated otherwise by the team" clause is a discretionary carve-out, not a stated ban policy.

**Update 2026-09-14, second pass:** Sadra opened all 16 sources below directly in his own logged-in
Chrome and pasted the rendered page content back. This let the two previously Wayback-only sources
(Tradeify, Apex) be checked against the live page — both came back **byte-identical in substance**
to what the Wayback snapshot already said (the exact same "cannot purchase or activate" / "special
exception from a risk manager... maximum of three Performance Accounts" quotes), so the table and
quotes above stand confirmed, not just Wayback-plausible. Both are upgraded to ✅ below. One genuine
new finding surfaced doing this — FundedNext runs two *different* live programs with two different
failure outcomes, not one:

- **Flex / Rapid Pro / Rapid Daily** ("Road To Live Trading", the newer structure): 2-week cooldown
  (4wk if reckless), then *"traders return to normal sim trading, purchasing Challenge Accounts."*
- **Legacy** (the older, separate "Road To Live Trading - Legacy Challenge & Rapid Challenge (Former)"
  article, still governing accounts that were on it before the July 10 2026 cutover): liquidation is
  explicitly terminal — *"The account is permanently closed. You lose access to the Live account
  along with all reserve and leftover balance. The account cannot be reset."* No cooldown, no stated
  path back to sim/eval purchasing at all. This is a materially worse outcome than Flex/Rapid's
  documented 2-week cooldown, and the table row above (which was written from the Flex/Rapid articles)
  should be read as **Flex/Rapid only** — Legacy is worse and undocumented on recovery, full stop.

**Update, same day, TopStep's collapsed FAQ expanded:** the one remaining unresolved question in
this whole comparison — whether TopStep lets you buy/pass new Combines while a Live Funded Account
is active and healthy — is answered directly on TopStep's own "Live Funded Account Parameters" page:
*"Yes. You can have Trading Combines while actively trading a Live Funded Account. The restriction is
only on activation — a passed Trading Combine cannot be activated into an Express Funded Account
while your Live Funded Account is active."* This moves TopStep from "undocumented" to the
**second-most-permissive firm after TPT** — see the updated table and quote above. Also resolved from
the same page: a full LFA liquidation does **not** let you skip straight to a fresh XFA — *"You must
pass a Trading Combine first"* either way, same as a normal Combine failure. Nothing in this
comparison is left undocumented at the level of "we never checked" — AlphaFutures, Lucid's
purchase-while-live, and MFF's post-suspension resume condition remain genuinely silent in their own
firms' docs, not unchecked by us.

**Sources (some require a browser to load — help-center domains here are aggressively Cloudflare-gated and blocked most automated fetch attempts; ✅ = loaded directly without issue or confirmed via a real logged-in browser session):**

- TPT ✅ <https://try.takeprofittrader.com/TPT-FAQs-nf40-4-0725>
- Tradeify ✅ <https://help.tradeify.co/en/articles/12969284-tradeify-elite-program> (confirmed live 2026-09-14, matches the earlier Wayback-sourced quote exactly)
- Lucid ✅ <https://support.lucidtrading.com/en/articles/13425130-new-live-structure>
- Lucid ✅ <https://support.lucidtrading.com/en/articles/11404617-maximum-number-of-accounts>
- Apex ✅ <https://apextraderfunding.com/help-center/getting-started/apex-live-prop-trading-program-faq/> (confirmed live 2026-09-14, matches the earlier Wayback-sourced quote exactly; returns HTTP 403 to plain automated fetches as of 2026-09-22, needs a logged-in browser session)
- Apex ⚠️ <https://support.apextraderfunding.com/hc/en-us/articles/31519788944411-Performance-Account-PA-and-Live-Account-Rules> (renamed to "...-Performance-Account-PA-and-Compliance" at some point — current version no longer covers this topic; may have moved elsewhere — superseded by the confirmed-live URL above anyway)
- MFF ✅ <https://help.myfundedfutures.com/en/articles/12109396-comprehensive-faq-live-accounts-at-myfunded-futures>
- MFF ✅ <https://help.myfundedfutures.com/en/articles/10101257-understanding-live-funded-account-at-myfunded-futures>
- MFF ✅ <https://help.myfundedfutures.com/en/articles/13134718-understanding-rapid-live>
- FundedNext ✅ <https://helpfutures.fundednext.com/en/articles/15430139-road-to-live-trading-flex-challenge>
- FundedNext ✅ <https://helpfutures.fundednext.com/en/articles/15900277-road-to-live-trading-rapid-challenge>
- FundedNext ✅ <https://helpfutures.fundednext.com/en/articles/14283903-road-to-live-trading-legacy-challenge-rapid-challenge-former> (the terminal-liquidation, no-reset-path Legacy article — see the 2026-09-14 update above)
- TopStep ✅ <https://help.topstep.com/en/articles/13747178-live-funded-account-call-up-and-call-down-process>
- TopStep ✅ <https://help.topstep.com/en/articles/10657969-live-funded-account-parameters>
- AlphaFutures ✅ <https://help.alpha-futures.com/en/articles/10743344-path-to-live>
- E8 Futures ✅ <https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures> (confirms no live stage exists)

Every source above is now either directly loaded or confirmed against a real logged-in browser session — nothing left resting on a Wayback snapshot alone.

---

## Live transition triggers

Ranked by how avoidable (best first, given the stay-on-sim goal):

| Firm | Trigger |
| --- | --- |
| **TPT** | No count at all — discretionary, or a $10k single day |
| **MyFundedFutures** | No count — $10,000 single-day, or discretion |
| **Apex** | Soft signal (3 consecutive withdrawals is one input among several) |
| **Topstep** | Discretionary, typically 3rd–5th payout — but only 0.71% ever called |
| **Lucid** | 5 payouts |
| **FundedNext** | 15 rewards (Flex/Rapid), or $100k / 5 single-account withdrawals (Legacy) |
| **Tradeify** | **3 on one account OR 10 total — hardest, and mandatory once selected** |

**Conversion model matters enormously** — this is what cost Sadra at Apex:

- **Collapse into ONE live account:** Apex, MFF, Topstep
- **Each funded account → its own live account:** Tradeify, Lucid (up to 5)

---

## Minimal-live ranking (2026-09-14) — for a "stay on sim/funded as long as possible" goal

Sadra's stated priority: funded accounts can be copy-traded and failed repeatedly at low cost; live
accounts are restrictive and often collapse/close everything else. So "best" here means hardest to
get pushed into live, and least disruptive to the funded/copy-trading pipeline if it happens anyway
— combining the trigger-difficulty table above with the eval-purchase-while-live table further up.

| Rank | Firm | Trigger (harder = better) | Disruption if triggered |
| --- | --- | --- | --- |
| 1 | **E8 Futures** | None — **no live stage exists at all.** SimFi stays sim forever. | Zero. The only firm with genuinely zero live risk. |
| 2 | **TopStep** | Discretionary, no hard count — and only **0.71% of funded traders ever get called up**, the lowest real-world odds of any count-having firm. | Softest by far: you keep buying/passing new Combines the whole time Live is active — only *activating* a pass into a funded XFA is blocked, and that unlocks the instant Live ends. The funded/copy-trading pipeline barely skips a beat. |
| 3 | **Tradeify** | Hardest *known number*: 3 payouts on one account OR 10 total. | Harsh once hit — mandatory, full sim/eval ban, 4-week cooldown to get back. But it's a visible, manageable number (spread payouts thin across accounts to delay it). |
| 4 | **FundedNext (Flex/Rapid)** | 15 Performance Rewards — the highest hard count of any firm. | Existing challenges permanently closed, no refund. 2-week cooldown (4wk if reckless), then back to normal. **Avoid Legacy specifically** — same trigger idea, but a blown Legacy live account is terminal, no reset, ever. |
| 5 | **MFF** | No count — $10k single-day auto-trigger, or discretionary. | Accounts go dormant (not closed, refundable if unfunded), new purchases suspended during a confirmed 21-calendar-day cooldown after a live bust, then normal purchasing resumes. No permanent-ban language found. |
| 6 | **Apex** | Soft/discretionary (3 consecutive withdrawals is one input among several). | Full ban, no exception while live is healthy. Getting back to sim needs a risk-manager exception, capped, and auto-reverts you to live on your first payout — a trap, not a real escape. |
| 7 | **Lucid** | Hard count: 5 payouts. | Closed accounts, 2-week cooldown — but that cooldown is only confirmed to route back to *live*, not confirmed as unrestricted eval purchasing again. |
| 8 | **AlphaFutures** | Undocumented threshold. | Can decline, but doing so "sacrifices all relations with any branch of the Alpha Group" — burns the whole relationship. Worst discretionary risk of the group. |

**Bottom line:** E8 for a hard guarantee of never touching live. TopStep for real firm capital
eventually with the best odds of never actually getting there, and the softest landing if you do.
Tradeify is the best of the "mandatory once triggered" group because the number is known and
controllable. Everything below that has either a vague trigger or a genuinely punishing consequence
once you're in live.
