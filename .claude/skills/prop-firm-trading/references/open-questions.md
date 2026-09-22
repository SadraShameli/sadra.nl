# Open Questions — NOT verified. Do not state these as fact

Sadra is spending real capital on these decisions. If one of these comes up, say it's unresolved and offer to check — do not fill the gap with a plausible-sounding answer.

## 1. MFF Rapid EOD — is "Three (3)" per-plan or global?

**Status: unresolved, re-checked 2026-09-22 against the current primary source — still unresolved.** The Sim Funded parameter table states "Max # of Funded Accounts | Three (3)". The page does not say whether that means three Rapid EOD accounts specifically, or three MFF funded accounts total while holding any Rapid EOD. Fetched `help.myfundedfutures.com/en/articles/16158363-rapid-eod-50k-a-comprehensive-look` directly (primary source, not a third-party summary) 2026-09-22: it states the "3" figure and nothing else — no scope clarification of any kind.

MFF's global rule allows 5 funded when holding only 25K/50K sizes, and Rapid EOD is 50K-only — so the global rule alone would give 5. MFF does use plan-specific sub-caps elsewhere (Flex 50K = 3, Builder 25K = 2, Builder 50K = 1), so a tighter per-plan cap is plausible. Unresolved either way.

**Why it matters:** 3 slots × $12,051 = $36,153 vs 5 slots = $60,255. That's the difference between MFF and TPT on total scalable EV.

**Ask support:** "If I hold 3 Rapid EOD funded accounts, can I also hold Pro or other plan funded accounts at the same time, or is 3 my total funded limit?"

⚠️ **I previously talked myself out of the correct "3" answer** by letting a research summary override the page. Sadra caught it. The page says Three (3); the only genuine ambiguity is scope.

## 2. Lucid — EOD breach enforcement timing

**Status: unresolved, re-checked 2026-09-22 — still the biggest documentation gap across all firms.** See the Lucid section in `firm-rules.md`. Every other firm publishes explicit real-time language; Lucid describes only the end-of-day calculation. Third-party sources directly contradict each other. Lucid's *own* LucidDaily page uses "real-time P&L" language for its intraday products, which makes the silence on the EOD products more conspicuous, not less. Fetched `support.lucidtrading.com/en/articles/12945815-lucidflex-drawdown` directly 2026-09-22: it states only "At the end of each trading session, the system calculates the account's highest closing balance" — describes *when the floor level updates*, says nothing about whether a mid-day touch (on an open, unrealized position) triggers a breach. Genuinely silent, not just previously unchecked.

## 3. Tradeify Elite and TPT PRO+ — cost of a blown live account

**Status: undocumented at both firms, re-checked 2026-09-22 against each firm's own primary source — still undocumented.** Tradeify's older Legacy program said only "a risk manager will reach out with next steps." Current Elite is silent. TPT publishes nothing. Fetched Tradeify's own `tradeify.co/post/blown-account-recovery` directly 2026-09-22: it covers eval/Sim Funded reset options only ("evaluation resets may be available for Growth and Select Evaluations, while Lightning Funded and Sim Funded account failures do not have reset options") and never mentions a blown Elite LIVE account at all. Fetched TPT's own cited FAQ (`try.takeprofittrader.com/TPT-FAQs-nf40-4-0725`) directly 2026-09-22: confirmed it does not address a blown PRO+ account anywhere. (Third-party sites claim specific PRO+ reset dollar figures and even contradict themselves on whether PRO+ can be reset at all — per this project's own hard rule, third-party review sites are not a valid source for this; do not cite them.)

For comparison, what IS documented (re-verified 2026-09-14 against primary sources — see
`firm-rules.md`'s "Can you still buy/hold evals once moved to live?" table for the full picture and
quotes): **FundedNext** = fixed 2-week cooldown (4wk if reckless), then automatic normal purchasing.
**Tradeify** = fixed 4-week cooldown, then automatic normal purchasing. **Apex** = NOT a clean $199
Second Chance-and-you're-back — that product requalifies you for LIVE again directly; returning to
plain sim/eval purchasing is a separate, discretionary risk-manager exception, capped (e.g. max 3
PAs), and self-terminates (auto-reverts you to live) on your first payout. **Lucid** = 2-week
cooldown documented, but only framed as "return to live," not explicitly "resume normal eval
purchasing" — treat as still partially open. **Topstep** = ✅ RESOLVED 2026-09-14, TopStep's own
"Live Funded Account Parameters" FAQ: you CAN keep buying and passing new Trading Combines the whole
time an LFA is active and healthy ("The restriction is only on activation — a passed Trading Combine
cannot be activated into an Express Funded Account while your Live Funded Account is active. That
option becomes available again if the Live Funded Account is lost.") — the second-most-permissive
firm in this whole comparison, after TPT. Separately confirmed: a full LFA liquidation does NOT let
you skip to a fresh XFA directly — "You must pass a Trading Combine first" either way, same as a
normal Combine failure; the Shoulder Tap is a softer, discretionary call-down distinct from full
liquidation. See `firm-rules.md`'s Topstep section and its "Can you still buy/hold evals" table for
the full detail and quotes. **MFF** = ✅ RESOLVED 2026-09-18. The "21-day cooldown" figure does NOT appear on the two generic
pages checked 2026-09-14 ("Comprehensive FAQ - Live Accounts", "Understanding Live Funded Account"),
nor on the Rapid-specific "Understanding Rapid Live" article — that absence was correctly observed.
But it IS explicitly documented, verified against raw page HTML, on "Rapid Plan - Reserve Program &
Performance Bonus Structure" (`help.myfundedfutures.com/en/articles/13286746`), under a section
literally titled "Post-Breach Cooldown Period Protocol": a Maximum Loss breach on a Live account
triggers a 21-calendar-day cooldown (no sim trading, no new eval/reset/account purchases), after
which "you can continue from your active Sim Funded account (if applicable) and/or purchase new
Evaluations or accounts, unless communicated otherwise by the team." Identical wording is also on
Builder Plan 50k and Flex Plan $50,000's comprehensive-guide pages. No permanent-ban language found
anywhere. See firm-rules.md's "Can you still buy/hold evals" table and its correction note for full
quotes/URLs.

**Get this in writing before relying on either firm's live stage.**

## 4. Apex Live inactivity — calendar month or rolling 30 days?

**Status: ambiguous in Apex's own wording, could not re-check 2026-09-22** — the Apex Live FAQ page (`apextraderfunding.com/help-center/getting-started/apex-live-prop-trading-program-faq/`) returned HTTP 403 to an automated fetch, matching `firm-rules.md`'s own note that Apex's help center is aggressively Cloudflare-gated. The last confirmed reading (2026-09-14, via Sadra's own logged-in browser session) says the FAQ reads *"not actively traded for the month **or** for the past 30 days"* — two different tests joined by "or", with no statement of which governs. Their PA policy is explicitly rolling; the Live page has no equivalent clarification. Needs another logged-in-browser check to move past "last confirmed 2026-09-14," not a plain automated fetch.

Practically moot: trading once every two weeks satisfies both readings.

## RESOLVED 2026-09-22 (answered directly, no longer open)

- **Trades per day: 0 to 4, decided day-to-day, no fixed count or rule.** Matches the existing model almost exactly (`SKILL.md` said "variable, 1-4" — corrected to 0-4, since a day can have zero trades too). No further action needed; this was a confirmation, not a change in approach.
- **Stop distance: confirmed no fixed stop distance exists — matches and extends the existing model.** He sizes to a fixed dollar risk and adjusts contract count to fit; when contract-count granularity alone can't hit the target risk exactly, he shifts/offsets the trade entry itself so the resulting stop distance lands on the exact dollar risk, rather than accept an approximate size. The second lever (entry offset) is new information — added to `SKILL.md`'s "HIS NUMBERS" section.
- **Whether 1:2 is his optimal R:R: answered as far as it can be — there is no other data to compare against.** His own words: "1:2 RR with 40% winrate, nothing else." He has not traded other R:R setups and has no by-R-multiple win-rate breakdown. The comparison to 1:1.5-at-48%+ or the JJ material's claimed 1:1.44-at-67% remains permanently hypothetical, not because it's unexamined but because there is no alternative real data point of his own to test it against. Stop flagging this as "needs his data" — the data doesn't exist yet, and won't until he actually trades a different R:R and tracks it.
- **Replacement lag and failed-attempt duration: he has never measured this ("I don't know, I have never measured").** The ~22-day estimate and the `eval price ÷ pass rate` cost formula remain a stated approximation, not something checkable against his real history, because that history was never tracked. Not unresolved due to a bad question this time — the data simply doesn't exist yet. Stop asking him to recall it; if a real number is ever wanted, it would need him to start logging blow-to-refunded calendar days going forward, not a memory he can produce on request.
