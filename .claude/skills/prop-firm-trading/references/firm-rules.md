# Per-Firm Rules — validated against official help centers

All figures for the **$50K** size unless noted. Re-verify before spending money; these change often.

**Gap, stated plainly:** FTMO Futures, AlphaFutures, and E8 Futures were added to the prop-calculator registry after this file was originally written and have no section here yet — their rules exist in the engine (`cli prop plans --firm ftmo-futures`/`alphafutures`/`e8futures`) but have not been transcribed into this hand-curated reference doc. Do not assume they behave like any firm below; check the engine's own plan output (already validated against a live source per that plan's own devlog notes, visible in `cli prop plans`'s output) or the firm's live help center directly, per the rule immediately below.

## Contents

- [Ranking](#ranking)
- [MyFundedFutures](#myfundedfutures)
- [Take Profit Trader](#take-profit-trader)
- [Tradeify](#tradeify)
- [FundedNext Futures](#fundednext-futures)
- [Apex Trader Funding](#apex-trader-funding)
- [Lucid Trading](#lucid-trading)
- [Topstep](#topstep)
- [Account caps](#account-caps)
- [Live triggers](#live-transition-triggers)

---

## Ranking

Net EV per account, after the real-time-breach correction. Assumes 40% WR / 1:2 / 4 trades-per-day / $250 funded risk / EV-maximizing payout policy.

| # | Firm / Account | Net EV |
| --- | --- | --- |
| 1 | **MFF Rapid EOD** | $12,051 |
| 2 | Take Profit Trader PRO | $8,682 |
| 3 | Tradeify Select+Flex | $6,864 |
| 4 | FundedNext Legacy | $6,781 |
| 5 | Apex Intraday | ~$6,134 |
| 6 | Apex EOD | $5,947 |
| 7 | Tradeify Growth | $5,821 |
| 8 | Lucid Pro | $5,817 |
| 9 | Topstep XFA Consistency | $5,028 |
| 10 | Topstep XFA Standard | $4,806 |
| 11 | Lucid Flex | $4,553 |
| 12 | FundedNext Rapid Pro | $2,783 |
| 13 | Tradeify Select+Daily | $2,415 |

**Adjust for account caps.** Total scalable EV = per-account EV × slots. MFF's 3-slot cap means TPT (5 slots) can beat it on total.

---

## MyFundedFutures

Evaluations became **one-time payment** (no subscription) as of Aug 25 2026. Trade-off: 7-day inactivity rule with no billing to pause.

### Rapid EOD 50K — $104.50 — THE RECOMMENDED PICK

| | Eval | Funded |
| --- | --- | --- |
| Target | $3,000 | — |
| Start balance | — | **$0** |
| MLL | $2,000 **EOD** | $2,000 **EOD** |
| Floor locks | — | at **+$100** (when balance touches $2,100) |
| DLL | None | None |
| Contracts | 3 mini / 30 micro | 3 mini / 30 micro |
| Consistency | **30%** | None |
| Min days | **4** | — |
| T1 news | Yes | **No** |
| Inactivity | 7 days | 7 days |

**Eval execution (derived — see SKILL.md):** risk **$450**, daily cap **$900**, one win ends the day. Passes at ~$3,150 in ~12 days. Uncapped $900 risk instead needs $17,100 of profit over ~22 days.

Payouts: **$2,100 buffer** before first; then **$500 net profit since last payout** unlocks each subsequent. Daily. $500 minimum. **No cap.** 90/10.
**Max funded accounts: Three (3)** — stated in the Sim Funded parameter table.

Only MFF plan with EOD drawdown at **both** stages. This is why it's the pick.

### Rapid 50K — $104.50

Eval identical to Rapid EOD except: 5 mini / 50 micro, **50% consistency**, **2 min days**.
Looser consistency means a higher daily cap: `0.50 × 3,000 = $1,500`, so risk **$750** with a $1,500 cap. Bigger size than Rapid EOD allows — but the funded stage is intraday drawdown.
**Funded drawdown is intraday** — checkout calls it "**RealTime**". Trails equity high-water mark during the session. Otherwise same buffer/payout/split as Rapid EOD.

### Pro 50K — $132.50

Eval: 3 mini, 50% consistency. Optional **$114 "One Day to Pass"** add-on (no consistency, $4,000 target).
Funded: **EOD** drawdown, **5 mini** (steps up from 3).
Payouts: **every 14 days**,**$1,000 min**, **80/20**, $2,100 buffer.
Help center states a **$100,000 lifetime sim payout ceiling**, then forced live. Live review after 3 consecutive payouts or $20,000.

*Pro beats Rapid (EOD drawdown), but Rapid EOD beats both (EOD + 90/10 + daily + $500 min + cheapest).*

### Live

Multiple Rapid accounts **combine into ONE** live account with proportionally raised MLL. Triggers: **$10,000 net profit in one day** (excess forfeited) or discretion. Up to $5,000 moved to Reserve. Cannot trade sim and live simultaneously.

---

## Take Profit Trader

**Test (eval):** $3,000 target. EOD trailing, locks at starting balance (**$0 buffer**, not $100). No DLL. **50% consistency** — if exceeded the target *doubles* rather than failing. 5 min days. Monthly subscription.

**PRO (funded):** **Intraday trailing incl. unrealized gains.** Official worked example: unrealized profit of $1,000 raises the minimum balance immediately; closing for a $500 realized gain leaves the higher minimum in place. Enforced in real time — liquidation on touch. Buffer = drawdown amount. 5 min days. **80/20.** Withdrawals over $250 free; $250-or-less charged a $50 fee.

Rules: no bots/algos (manual only), exit before CME price limits, **≥1 traded day per calendar week**, no counter positions across accounts, news blackouts (FOMC, NFP, CPI; plus crude inventories, bond auctions).

**PRO+ (live):** $0 start, EOD drawdown, **90/10**, no buffer, daily payouts, no limits. Discretionary placement (~60 days of disciplined risk expected). $5,000 of PRO profit frozen as backstop, released on upgrade.

Max 5 PRO/PRO+ combined. 10 activations per 30 days. 3 resets per PRO account.

---

## Tradeify

**Growth eval:** EOD, has a DLL (soft breach), **no consistency**, 1-day pass possible. Funded: 90/10, **35% consistency**.

**Select eval:** $3,000 / $2,000 MLL / **no DLL** / **40% consistency** / **3 min days** / 4 mini. Locks at $50,100.
After passing, choose ONE permanent path:

- **Select Flex:** payouts every 5 winning days, cap **$3,000**, no DLL. *Best Tradeify option.*
- **Select Daily:** daily, cap $1,000, has DLL, buffer required. *Worst option tested overall.*

**Lightning:** instant funding, cannot be reset, escalating consistency 20/25/30%.

**Resets: evaluations ONLY.** Official: "There is no reset option for Lightning Funded or Sim Funded accounts. If you fail these accounts, the failure is permanent." Cycling a funded account = buying a **new eval at full price**, not a discounted reset.

Purchase limits: 15 Select evals / 30 days; 10 resets per eval / 30 days; 5 Growth activations/day.

**Elite Live:** eligible at **3 payouts on one account OR 10 total**. **Mandatory — cannot decline.** Each funded account with ≥1 payout becomes **its own** live account (up to 5). 80/20. Blown live = up to 4-week cooldown, then buy a new eval. Live/sim exclusivity extends to the **entire household**.

---

## FundedNext Futures

Use `helpfutures.fundednext.com` — the **futures** help center, not the forex/CFD side.

**Rapid and Bolt discontinued for new purchase/reset as of July 10 2026.** Current: Flex, Legacy, Rapid Pro, Rapid Daily.

**Legacy:** 40% consistency during challenge, **none when funded**. EOD. **80/20**. Payouts: 50% of accumulated profit, capped **$6,000** (50K), after every 5 benchmark days. **Cap lifted entirely after 30 benchmark days.** Largest cap of any FundedNext product.

**Flex:** $2,500 target, **$1,500 MLL** (25% less cushion than Legacy — this is why it underperforms). 40% challenge consistency. Concludes after 5 withdrawals.

**Rapid Pro:** 1-day pass, EOD, **90%** share, rewards every 3 days, **40% consistency in the funded account only**, flat **$1,200** cap. The small cap is why it ranks near the bottom despite the better split.

**Rapid Daily:** daily rewards, DLL + buffer, no consistency anywhere.

MLL locks at **initial balance + $100**; auto-liquidation if balance touches the locked floor. **"If your floating loss reaches the maximum loss limit during an active trade, your account will be instantly breached."**

**Live triggers:** Legacy = $100,000 Total Active Profit OR **5 withdrawals from a single account**. Flex/Rapid = **15 Performance Rewards**.

**Blown live is NOT the same outcome on both programs** (verified 2026-09-14, both primary sources
read in full): **Flex/Rapid** = 2-week cooldown (4+ if reckless), then normal sim path, purchasing
Challenge Accounts again. **Legacy** = liquidation is terminal — *"The account is permanently closed...
The account cannot be reset."* No cooldown, no documented path back to sim/eval purchasing at all.
Legacy's live failure is meaningfully worse than Flex/Rapid's.

---

## Apex Trader Funding

Full product replacement ("Apex 4.0") March 1 2026. **Metals halted** (GC, SI, QI, QO, MGC, HG, PL, PA) with no announced return.

**EOD Evaluation/PA:** level set once at 4:59:59 PM ET. **Breach enforced in real time** — "may never touch or cross the EOD Threshold level at any time."

**Intraday Evaluation/PA:** real-time incl. unrealized P&L.

**PA locks at start + $100** ($50,100 on a 50K) for BOTH EOD and Intraday.
⚠️ The **$53,000/$55,000** figures in Apex's "Intraday Trailing Drawdown Explained" apply **only to the Evaluation stage on Rithmic/Wealthcharts** — NOT to Performance Accounts. On Tradovate, evals trail indefinitely. This was mis-scoped once and produced a badly wrong result.

**PA payouts:** 5 qualifying days (EOD 50K = $250/day; Intraday 50K = $200/day), **50% consistency**, safety net = drawdown + $100, $500 min, **100% split**, **6-payout maximum** then the PA closes.

**No resets** — a failed eval means buying a new one. **30-calendar-day eval time limit.**

**PA inactivity:** 2 trading days with **$50+ net profit** per rolling 30 days. "Trading alone does not prevent inactivity closure." Dormant at 15 days, permanently closed at 30, no reinstatement.

**Live:** see the Apex section in SKILL.md. Live inactivity is *looser* — just needs to be traded.

Restricted: US-only service; 84 countries blocked. Look-alike domains exist (`apexfundtraders.com`, `apexfundingtrader.com`) — the real one is `apextraderfunding.com`.

---

## Lucid Trading

Types: LucidFlex, LucidPro, LucidDirect, LucidDaily. LucidMaxx is invite-only.

**LucidFlex:** $3,000 / $2,000 EOD. **50% eval consistency**, none funded. No DLL any stage. 90/10, $500 min. **5 payouts max per account**, then live review. Locks at $50,100.

**LucidPro:** no eval consistency; **40% funded consistency** (35% for accounts before Nov 28 2025). DLL present. Buffer $52,100. Payout 1 max $2,000; payouts 2+ max $2,500.

**LucidDirect:** instant funding, **20% consistency** (strictest).

**LucidDaily** (launched July 2026): configurable EOD-or-intraday eval + DLL on/off at checkout, locked after purchase. **Funded is ALWAYS intraday.** No funded consistency. Daily, no per-request cap. **Red-folder US news is a hard breach on funded.**

⚠️ **Lucid's docs do not state whether the EOD breach is enforced intraday or only at close.** Their pages describe only the end-of-day *calculation* and say "If your account balance reached the MLL, your account will be breached" — "reached" undefined. Every other firm has explicit language; Lucid doesn't. Third-party sources contradict each other. **Assume the conservative reading; ask support before relying on it.**

**Live:** each funded account with ≥1 payout becomes its own live account (up to 5, per household). One-time Live Bonus equal to the starting live drawdown. Blown live = 2-week cooldown, then new eval. **If one household member is live, others may not trade sim.**

---

## Topstep

**Trading Combine:** $3,000 target, trailing MLL, **50% consistency**. Pass in as few as 2 days. Unlimited Combines; 2 resets per account per day. Two pricing paths — at his speed the **No-Activation-Fee path is cheaper in expectation** (~$64 vs ~$182), which cuts against how Topstep frames it.

**XFA:** balance starts at **$0**. Choose Standard (5 winning days ≥$150, cap $5,000) or Consistency (3 days + 40%, cap $6,000) — permanent at activation. MLL locks at $0 after first payout. **Both realized AND unrealized P&L count** toward breach, monitored in real time.

Split: **90/10** default for anyone joining on/after Jan 12 2026. Before that, 100% of first $10,000 lifetime (grandfathered).

**Live Funded Account:** **exactly ONE, ever.** Size = average of eligible XFAs rounded up to the next tier. **20% available immediately, 80% held in Reserve**, released in four 25% increments. Uncapped payouts. Blown LFA (balance <$1,000) = must pass a **new Trading Combine** — the cleanest officially-documented recovery of any firm, and confirmed as the *only* recovery — there's no skip-the-eval shortcut even off a full liquidation (*"You must pass a Trading Combine first"*).

**Cannot decline the call-up** — *"Once the Risk Team determines you're ready, your options are to move to Live or close your Express Funded Account."* Same mandatory-transition pattern as Tradeify/FundedNext/MFF.

**Uniquely permissive on eval purchasing while live is active and healthy** (verified 2026-09-14): unlike every other firm here, TopStep explicitly lets you keep buying and passing new Trading Combines the whole time an LFA is open — *"The restriction is only on activation — a passed Trading Combine cannot be activated into an Express Funded Account while your Live Funded Account is active. That option becomes available again if the Live Funded Account is lost."* So a passed Combine just queues, ready to activate the moment Live is lost — see the comparison table above.

**Live inactivity:** closes after 30 days with no trading activity — *"Live Funded Accounts can't be put on hold."*

Disclosed stats: 16.8% of Combines pass; **0.71% of funded traders get called up to Live** — the lowest live-trigger risk of any firm, which is an *advantage* given his stay-on-sim goal.

Back2Funded: up to 2 XFA reactivations if lost **before** first payout.

---

## Account caps

| Firm | Max funded | Scope |
| --- | --- | --- |
| **Apex** | **20 PAs** | combined across Legacy/EOD/Intraday, **per household** |
| MFF | 5 (25K/50K only), **3** if any 100K/150K | global across plans; Rapid EOD table says **3** |
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
- Apex ✅ <https://apextraderfunding.com/help-center/getting-started/apex-live-prop-trading-program-faq/> (confirmed live 2026-09-14, matches the earlier Wayback-sourced quote exactly)
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

**Conversion model matters enormously** — this is what cost him at Apex:

- **Collapse into ONE live account:** Apex, MFF, Topstep
- **Each funded account → its own live account:** Tradeify, Lucid (up to 5)

---

## Minimal-live ranking (2026-09-14) — for a "stay on sim/funded as long as possible" goal

His stated priority: funded accounts can be copy-traded and failed repeatedly at low cost; live
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
