# Prop Firm Docs: Remaining Work

Open work across `.claude/prop-firms/`, as of **2026-10-03**, after the DOCS-R7
pass, its DOCS-R7e rounds, the per-firm DOCS-R7e deep pass and its fix pass, and
the DOCS-R7e close-out round (2026-10-02 and 2026-10-03). The workflow's per-firm
verdict after the deep pass was FAIL for all ten firms (tradeify, lucid, mffu,
tpt, topstep, alphafutures, apex, e8futures, fundednext, ftmo-futures); the
findings behind those verdicts are not recorded in this file. The close-out
round's verdict is PASS for all ten firms with 0 unresolved findings each (status
table below). A PASS is the verifiers' reading of the files after that round, not
a statement that nothing is wrong: a fresh full deep read has found new
judgment-level MEDIUM items in every previous round, so more may remain. The
verifiers also named problems outside the close-out round's scope (listed per
firm under the status table); the round did not fix them. The earlier
DOCS-R7e rounds were (round 3 was a script-backed sweep of all ten firm
trees for archived-only facts, derived or inferred table values, dated
verification text in the metadata slot, and Overview or README summaries that
contradict their own tables; round 4 fixed what an independent check of round 3
found: Growth payout fields the live Tradeify homepage does state, a README cell
that contradicted its plan file, derived lock and fee values shown as confirmed,
reasoned readings written up as resolved, and Unconfirmed cells with no Not
Confirmed bullet). Read [CONVENTIONS.md](CONVENTIONS.md) first: it is the spec this tree is
held to, and every item below is phrased in its terms.

This file tracks what is *not* done. When an item is finished, delete it here
and record the result in that firm's own `SOURCES.md`, not in this file.
Finished work from earlier passes (the legal-document sweep, the 2026-09-20
two-direction line-by-line audit, the Tradeify and e8futures cache repairs,
Tradeify completeness, Apex's Not Confirmed closers and src-to-doc audit, the
PT-71/PT-71c catalog recheck and its doc-vs-engine mismatches N-79 to N-85, the
19-file `src/` lint residue) has been deleted from this file on that rule; each
firm's `SOURCES.md` holds the record, and the engine tracker
`.claude/plans/prop-engine-audit-2026-09-23/PLAN.md` holds the engine side.

## Status per firm

Source counts are the latest sitemap or API count each firm's own `SOURCES.md`
records. A firm whose help center answered HTTP 403 on 2026-10-02 or 2026-10-03
keeps its earlier count and was not re-read on those days.

| Firm | Plan files | Help-center articles (latest count) | Legal docs read | Last line-by-line audit | 2026-10-02 DOCS-R7 pass | DOCS-R7e close-out verdict (2026-10-03) |
| ------------ | ---------- | ----------------------------------- | --------------- | ----------------------- | ----------------------- | ---------------------------------------------- |
| alphafutures | 5 | 36 (sitemap, all re-read 2026-10-02 and 2026-10-03); 117 main-site pages in `alpha-futures.com/sitemap.xml` (all fetched 2026-10-03) | 3 | 2026-09-20 (two-direction; sitemap diff 36 of 36 help articles, 104 of 104 main-site pages) | Deep pass 2026-10-02/03: all 36 articles, Terms, General Service Agreement, Return Policy, product pages and posts re-read against the plan files; round 6 searched the 117 main-site pages for six specific topics, not line by line; not a line-by-line audit | PASS, 0 unresolved |
| apex | 4 | none; the ledger names 126 help-center URLs (69 cited, 57 excluded) and 3 site rows from the 2026-09-19 dump, against a capture record of 129 that it does not reconcile (sitemap 403) | 0 (see item 1) | 2026-09-20 (two-direction, 76 src-to-doc findings applied); later passes partial | No re-fetch possible: every apextraderfunding.com URL answered HTTP 403 on 2026-10-02 and 2026-10-03; the deep pass re-read the 2026-09-23 user pastes only against statements already in the tree | PASS, 0 unresolved |
| e8futures | 2 | 61 (last read 2026-09-20; every help domain 403 on 2026-10-02 and 2026-10-03) | 4 | 2026-09-20; e8futures.com re-check 2026-09-23 | Partial: e8futures.com only (2026-10-02 and 2026-10-03, Terms Section 14.2 read live 2026-10-03), help center 403 | PASS, 0 unresolved |
| fundednext | 8 | 139 in 15 collections (R6 catalogue; R7 re-walk 140), plus 15 of 15 marketing futures pages | 6 | 2026-09-20 (two-direction); R6/R6b/R6c 2026-10-02: 139 of 139 fetched, 39 read in full, 15 compared line by line against old-ID twins | R7 re-walk of 140 articles; deep pass 2026-10-03: the help-center articles, marketing, Labs and legal pages and checkout-API plans listed in `fundednext/SOURCES.md` fetched (HTTP 200), and a fix pass re-fetched 21 articles; `/usa/*` pages and several general-rules pages not re-fetched | PASS, 0 unresolved; 1 problem outside the round (below) |
| ftmo-futures | 3 | 73 English sitemap pages, all read, plus 24 further pages and both T&C PDFs | 2 | 2026-10-02 (R7-1 source-to-doc, and the R7 doc-to-source recheck); the Sim-Funded T&C is not public | Full | PASS, 0 unresolved |
| lucid | 6 | 59 articles (69-URL sitemap at `support.lucidtrading.com`, re-fetched 2026-10-02) | 4 (5th, the Trader Agreement, never read, see item 1) | 2026-09-20 (two-direction) | Deep pass 2026-10-02: all 59 articles re-fetched (HTTP 200) and read against every plan file, `live.md`, `lucidmaxx.md` and the README's help-center claims; lucidtrading.com 403 (the homepage-config statements rest on the user's saved export, re-parsed in full in the fix pass) | PASS, 0 unresolved |
| mffu | 5 | 74 (sitemap, re-fetched 2026-10-02) | 3 (the binding Simulated Trader Agreement never read, see item 1) | 2026-09-20 (two-direction) | Deep pass second sweep 2026-10-02: all 74 articles re-fetched, plus the four plan pages and `/terms` read as raw HTML; third sweep re-read 29 named articles in full and 6 more by phrase search | PASS, 0 unresolved |
| topstep | 6 | 57 (sitemap, all re-fetched 2026-10-02) | 5 | 2026-09-20 (two-direction) | Deep pass 2026-10-02: all 57 articles, the Terms of Use and three other legal pages re-fetched live and every file read end to end; fix pass re-fetched 13 articles; round 1 documented Labs Drop #006 from the live article | PASS, 0 unresolved |
| tpt | 2 | 88 (Zendesk API; HTML pages are 403) | 2 (2026-09-20 browser dump) | 2026-09-20 (two-direction) | Deep pass 2026-10-02 (rounds 5 and 6): all 88 articles re-queried through the API (HTTP 200) and every figure and quotation in the three files read against them; Terms, privacy policy and `/pricing` 403 | PASS, 0 unresolved |
| tradeify | 5 | 76 (all 76 in the user's 2026-09-18 browser dump, HTTP 200 for every URL; help.tradeify.co answered 403 to a direct fetch on 2026-10-02 and 2026-10-03) | 4 | 2026-09-20 (two-direction) | Structural edits and Funded Trader Agreement quote search; no help-center article re-read; round 1 moved the archived-copy-only statements (item 2) into Not Confirmed; round 3 also removed the archived-only current Growth payout figures from the tables; round 4 re-fetched the live homepage (HTTP 200) and cited its Growth funded Payout Frequency and Consistency fields, and stopped relying on the `intercom.help/tradeify` mirror reads; deep pass rounds 5 and 6 (2026-10-02) re-fetched `tradeify.co`, `/select-plan`, `/funded-trader-agreement` and the MyFundedFutures comparison page (HTTP 200) and moved the Growth Starting Balance, daily activation limit and reset-credit sentences, the `10468320` consistency quotes and the archived-only values in the Growth Payouts and Sim Funded cells out of the tables; DOCS-R7e close-out (2026-10-03) read the seven articles earlier passes had only as Wayback snapshots from the live text in the user's 2026-09-18 browser dump (recorded in `tradeify/SOURCES.md`), restored the figures set aside for them, and re-fetched `tradeify.co` and `/funded-trader-agreement` (HTTP 200); `help.tradeify.co` still 403 | PASS, 0 unresolved; 1 problem outside the round (below) |

Problems the verifiers saw outside the DOCS-R7e close-out round (reported, not
fixed by that round; both are MEDIUM). The other eight firms reported none:
alphafutures, apex, e8futures, ftmo-futures, lucid, mffu, topstep, tpt.

- **tradeify** (`tradeify/lightning.md`:61 and :94, present before the round):
  the Consistency Rule and Consistency on Payouts cells state the 20/25/30% ladder
  as confirmed. That ladder is supported by articles 10495932 and 10468320 (for
  accounts purchased after 2026-09-12, flat 20% before). The live homepage
  `LightningData` has `Consistency` `20%` in every Lightning block, and article
  12268167 ("Consistency Rule Quick Guide", "Lightning Funded: 20% limit") also
  gives a single 20% figure. Neither is recorded in `lightning.md`. They may be
  abbreviations of the first tier, but the file should record the difference as a
  live conflict or an explicit note, not stay silent. The editor touched the file
  and read 12268167 but did not record it.
  **Resolved 2026-10-03 (DOCS-R7e mini round):** the live homepage (fetched
  2026-10-03, HTTP 200) states the ladder itself in every Lightning block (tooltip
  "Consistency requirement moves to 25% for Payout 2 and 30% for Payout 3+" beside
  `Consistency` `20%`), now cited in both cells. The 12268167 single "Lightning
  Funded: 20% limit" has no ladder or cutoff wording and no source says whether it
  abbreviates the first tier, so `lightning.md` records it as a live difference in
  a Not Confirmed bullet naming every source (`README.md` and `elite-live.md` point
  to it). Remaining: nothing for tradeify; the difference stays open by design
  until Tradeify clarifies the Quick Guide.
- **fundednext** (`fundednext/README.md`, class B, not edited in the round): the
  `/futures` card `discountedPrice` ($159.99, $169.99, $279.99) is stated as fact to
  be the after-code or typed RAPID coupon price. `README.md`:84 says the
  `coupon:null` checkout call found this, and `SOURCES.md`:155 says the same, but a
  `coupon:null` call can only show that the card is not the no-code price, and no
  coupon-applied checkout call is recorded in the tree. The real support is the
  package `promoCode` RAPID plus the price match with offer article 16295692. The
  figure is also stated flatly at `README.md`:85 and :87, `SOURCES.md`:155,
  `rapid-pro.md`:3 and :149, and `rapid-daily.md`:3 and :150. It should be reworded
  to the evidence, or given a Not Confirmed bullet; `rapid-pro.md`:115 and
  `rapid-daily.md`:119 already word it correctly. Resolved 2026-10-03 (DOCS-R7e
  mini round): a coupon-applied call to the checkout API (`coupon_code` "RAPID",
  `plan_id` 89 to 94) returns payable $79.99 / $159.99 / $279.99 for Rapid Pro
  and $79.99 / $169.99 / $279.99 for Rapid Daily, so the after-code basis is now
  confirmed; `README.md`:84, `SOURCES.md`:155 and the checkout API row, and both
  plan files' source lines, footer entries and discounted-price bullets name the
  real evidence (promoCode, offer article, coupon-applied call). What remains:
  the call is anonymous, so the new-user versus existing-user basis is only the
  offer article's label.

`ftmo-futures` is no longer the exception: its two-direction audit ran on
2026-10-02, so all ten firms have had one. The per-firm audit history above is
what ran, not a claim that any firm is finished: a firm is not done while its
`## Not Confirmed By This Source` sections are non-empty, and every firm's are.

Last Verified dates that are deliberately not 2026-10-02, because the source
could not be re-read or only part of the file was re-checked (each is now a bare
date, and the dated history is in that firm's `SOURCES.md` under "Per-file
verification history, round 3"): alphafutures README (2026-09-26) and its five
plan and live files (2026-09-26, the date their table figures were last
re-sourced; the 2026-10-02/03 deep passes re-read them against the live pages and
left the Last Verified lines unchanged), apex
README and `apex/eod.md`, `apex/intraday.md`, `apex/live.md` (2026-09-23) and
`apex/legacy.md` (2026-09-19), e8futures `signature.md` and `zero.md`
(2026-09-20, the oldest help-center-only figure) and e8futures README
(2026-09-19), lucid README, `pro.md`, `flex.md`, `daily.md`, `direct.md`
(2026-09-24; they also rest on the user-pasted homepage config, which cannot be
re-read), and tradeify (2026-09-26,
every file), tpt README (2026-09-20 for the Terms of Service quotes). Do not
advance them without a re-read or a paste.

## 1. Legal documents still unread

Terms, service agreements and refund policies are where payout splits,
termination triggers and refund rights live, and they have repeatedly
contradicted help-center copy. Nine of ten firms have read at least one; the
gaps are:

- **Apex: no legal document has been read, and that is unresolved, not done.**
  `apextraderfunding.com` answered HTTP 403 to every direct fetch on
  2026-10-02 (homepage, `/pricing/`, `/legacy-products/`, the help center, the
  sitemap). Apex's Terms and Conditions, User Agreement, Privacy and Refund
  pages have never been read, and their URLs are not known. `apex/live.md`
  only mentions the "Apex User Agreement" by name. This is a user paste
  request (item 5), not a decision.
- **Lucid Trader Agreement** (`https://lucidtrading.com/lucid-trader-agreement/`):
  client-rendered and empty on 2026-09-20, HTTP 403 on 2026-10-02. It may state
  whether a breached LucidDirect funded account can be reset and at what price.
- **MFFU Simulated Trader Agreement and its Appendices**: the binding "Sim
  Funded Documents" named in `https://myfundedfutures.com/terms` Section 29,
  which the Terms outrank themselves under. No public URL exists (not on
  `/terms`, `/disclaimer`, `/cancellation`, `/privacy-policy`, `/why-us`,
  `/plans`, the sitemap or 7 guessed paths).
- **FTMO Futures Sim-Funded Account Terms and Conditions**: not published; FTMO
  says "If you are interested in a sample of the contract, please contact us".
  Every Sim-Funded and Live Funded rule rests on it.

Marketing pages go stale. The help center and the product pages outrank them.
Where they conflict, record the conflict and keep the higher-authority figure.
Every finding from a legal document is verified against the page text before
it is applied.

## 2. Wayback and mirror dependencies still in the tree

The Wayback Machine is not an accepted source. Remaining uses, each needing a
user decision or a paste:

- **Tradeify, statements that rested only on an archived copy: closed in the
  DOCS-R7e close-out (2026-10-03), except three collection index pages.** The
  user's own logged-in browser fetched all 85 `help.tradeify.co` sitemap URLs on
  2026-09-18 (HTTP 200 each; `/Users/sadrashameli/Downloads/response.json`,
  recorded in `tradeify/SOURCES.md`). That dump holds the live text of seven
  articles that earlier passes read only as Wayback snapshots and set aside:
  `10495915-growth-evaluation-accounts`, `11083796-growth-funded-account-payout-policy`,
  `12268167-essential-trading-rules-overview`, `10468320-rules-consistency-rule`,
  `10495917-how-do-i-get-funded-after-passing-an-evaluation`,
  `10468258-welcome-to-tradeify` and `10468265-which-plan-is-right-for-you`.
  `growth.md`, `lightning.md`, `select-daily.md`, `select-flex.md` and
  `README.md` now cite the dump for the figures that had been set aside, and the
  recount script's archived-copy category is now 0 for the whole tree (it was
  11 for Tradeify, plus two more `growth.md` bullets the script counted as
  unresolvable). `help.tradeify.co` still answered HTTP 403 to a direct fetch on
  2026-10-03 and no workaround was used. This recount did not re-read the
  articles; what the files now cite is what `tradeify/SOURCES.md` records.
    - Two statements the old snapshots carried are not in those live texts and
      stay unstated: the legacy Advanced Challenge's real-time intraday drawdown
      and $45-84/month subscription, and the "liquidation-only mode" wording that
      had been attributed to the Essential article (it appears in the live text
      of "Platform Connection Troubleshooting" and "Common FAQs", which conflict
      with "Rules: Trailing Max Drawdowns"; `growth.md` Not Confirmed).
    - `growth.md` now records the Sim Funded and payout Consistency Rule as a live
      conflict naming every source: the homepage hero "No consistency once
      funded" and "Select Evaluation Accounts" against 35% in six sources.
    - Collection index pages `15250314-account-types`, `15250444-payout-policies`
      and `15250449-fees-billing` are not in the dump or the sitemap list and were
      seen only as Wayback snapshots (2026-06-10 through 2026-08-22). They were
      used only to discover article URLs later obtained live, and nothing in the
      tree relies on them.
- **`tradeify/SOURCES.md`** records the `intercom.help/tradeify` mirror host
  (used on 2026-09-26 for articles 14369021 and 10495932, and for the 300K
  Select Account article). In DOCS-R7e round 4 that route was treated as a
  workaround of the 403 and not accepted: the 25K, 100K and 150K Growth, Select
  and Lightning prices were re-sourced to the live homepage fetched 2026-10-02,
  and what was read only at the mirror (the pricing reference's Growth 100K and
  150K reset fees, the Select Consistency Add-on prices, the 300K Select Account
  article) is Unconfirmed. The user may overrule that and accept the route.
- **`lucid/SOURCES.md`** history rows still describe the 2026-09-05 Wayback
  homepage fetch, annotated as not accepted. The homepage-only statements were
  removed from `lucid/README.md` on 2026-10-02, and in round 3 the homepage row's
  Used In column, which listed seven files that no longer cite it, was reduced to
  the `README.md` Documentation Scope note.

## 3. Open Not Confirmed bullets

**700 tree-wide as of 2026-10-03 (after the DOCS-R7e close-out round)**,
counted by script from the `## Not Confirmed By This Source` sections of the 46
plan, live and overlay files. The figure after the deep pass and its fix pass was
689, the DOCS-R7e round 4 figure was 535 (round 1: 509; a script recount at the
start of round 3 gave 510). The deep pass and its fix pass net-added 154, by firm:
apex 32, topstep 26, lucid 17, mffu 17, alphafutures 16, tradeify 12, tpt 12,
fundednext 11, e8futures 9, ftmo-futures 2. The close-out round net-added 11, by
firm: alphafutures 4 (84 to 88), lucid 4 (71 to 75), fundednext 3 (123 to 126),
mffu 3 (69 to 72), apex 1 (79 to 80), tpt 1 (43 to 44), tradeify minus 5 (58 to
53), and topstep, ftmo-futures and e8futures unchanged. The figure is a recount of
what the files contain, not a list of added bullets, so a bullet removed or merged
during those passes is inside the net; Tradeify's drop matches the removal of the
archived-copy bullets that `tradeify/SOURCES.md` records for the close-out (item
2), but this recount did not check bullet by bullet. The firms' `SOURCES.md`
entries for the passes describe the changes as values moved out of a table,
Overview or README cell because they were derived, inferred, archived-only or in
conflict between the firm's own sources, and as cells that had no bullet; this
recount did not check each added bullet against those entries. Every one of the
700 contains a "do not" clause (the script finds 0 without one): 635 end with "Do
not assume", and 65 use other wording (alphafutures 11, apex 24, e8futures 2,
ftmo-futures 5, fundednext 10, mffu 3, topstep 2, tpt 1, tradeify 7; the script
counts a capitalised "Do not" with another verb and a lowercase "do not"
mid-sentence together, so the earlier split of those two is not recomputed).
CONVENTIONS.md specifies "Do not assume", so the other 65 are a wording gap, not a
missing clause.

The counts below are produced by one script (the "Not Confirmed recount and
categories" command under Verification commands), not by reading. Each bullet takes
the first rule that matches: **record** (heading names an engine cross-check,
simplification, row-label mapping or country-list pointer, and the first 400
characters do not state a conflict); **archived copy only** (the first 260 characters
say the only copy read is an archive); **out of scope** (heading names other account
sizes, a legacy or discontinued product, an invite-only product or Labs);
**needs paste** (the bullet says a paste is needed); **live conflict** (the bullet
records two of the firm's own pages or articles disagreeing); **unresolvable**
(everything else: the firm does not publish the figure). Needs fetch is 0 by
definition: the script has no rule that tests whether a bullet could be closed by a
direct fetch, so that column is not evidence that none could. The categories are
mutually exclusive and sum to the total. The archived-copy column is 0 for every firm after the close-out round.
The scripted rules classify few bullets as
needs paste because the paste requests live in item 5 and in the ledgers, not in
the bullet text. The live-conflict column grew from 55 to 112 in the deep pass and
fix pass and to 121 in the close-out round; the firms'
`SOURCES.md` entries for the deep pass record many recency, "resolved in favor of"
and authority picks between the firm's own pages replaced by recorded conflicts,
but the script's live-conflict rule matches conflict wording, so the column is a
wording count, not an audit of each conflict.

| Firm | Total | Unresolvable | Live conflict | Needs fetch | Needs paste | Out of scope | Archived copy only | Resolved or engine record |
| ---- | ----- | ------------ | ------------- | ----------- | ----------- | ------------ | ------------------ | ------------------------- |
| fundednext | 126 | 86 | 27 | 0 | 0 | 5 | 0 | 8 |
| alphafutures | 88 | 52 | 29 | 0 | 0 | 5 | 0 | 2 |
| topstep | 88 | 72 | 7 | 0 | 0 | 5 | 0 | 4 |
| apex | 80 | 47 | 15 | 0 | 1 | 9 | 0 | 8 |
| lucid | 75 | 69 | 3 | 0 | 1 | 1 | 0 | 1 |
| mffu | 72 | 49 | 20 | 0 | 1 | 2 | 0 | 0 |
| tradeify | 53 | 29 | 10 | 0 | 2 | 9 | 0 | 3 |
| tpt | 44 | 36 | 2 | 0 | 3 | 0 | 0 | 3 |
| ftmo-futures | 39 | 29 | 2 | 0 | 0 | 3 | 0 | 5 |
| e8futures | 35 | 25 | 6 | 0 | 1 | 0 | 0 | 3 |
| Tree | 700 | 494 | 121 | 0 | 9 | 39 | 0 | 37 |

Do not resolve one of these by inference. If the firm does not state it, it
stays flagged. Topstep Labs Drop #006, which an earlier tally of this table
missed although the article was fetchable, was fetched and documented in
`topstep/labs.md` in DOCS-R7e round 1; its open questions are the five Drop #006
bullets there, four counted as unresolvable and one ("Drop #006 LFA parameters
beyond the Labs table") as out of scope by the script's heading match.

## 4. Open user questions

Numbered questions live in the audit tracker
(`.claude/plans/prop-engine-audit-2026-09-23/PLAN.md`, rows U24 to U33 and
earlier). The engine keeps its current behavior on each until the answer
arrives.

| ID | Firm | Question | Referenced in |
| -- | ---- | -------- | ------------- |
| U29 | fundednext | FNL:003 (discontinued) 5-day wait before the first reward. The Labs card says "Get Rewards In 5 Days" but its tooltip may mean delivery time, and help articles 16847874 and 16847913 list no wait. The engine keeps the 5-day gate as the tool's conservative reading; the alternative is no wait and the Labs card recorded as a conflict. | `fnl003-instant.md`, `README.md` |
| U30 | alphafutures | Live "Scaling Daily Loss Limit (30% of account)" (article 10743344): base, scaling, dollar floor and breach consequence. The engine models no live daily loss limit. | `live.md`, `README.md`, `SOURCES.md` |
| U31 | alphafutures | Advanced Qualified maximum loss limit: $2,000 (Terms Schedule 2, 4%) or $1,750 (product card and article 11634907). The engine keeps $2,000. | `advanced.md`, `README.md`, `SOURCES.md` |
| U32 | topstep | Combine 55% consistency at exactly 55% (8284208 "at or below 55%" and its worked tie against 8284197 and 8284099 "below 55%"). The engine keeps exactly 55% passing. A Trader Support answer, or a Combine dashboard reading at a best day of $1,650 and profit of $3,000 on day 2, would settle it. | `consistency.md`, `standard.md`, `README.md` |
| U33 | topstep | Pro Account "Payout up to 50% of the account and up to $5,000" (14645398): what the 50% is a share of. The engine sets no share cap. | `pro-account.md` |
| U28 | alphafutures | Whether a Qualified account pays a recurring monthly fee (help center and Terms against product pages). | flagged in `zero.md`, `standard.md`, `advanced.md` without the ID |
| U2 | alphafutures | Qualified payout split: tiered 70/80/90 (General Service Agreement) or flat 90% (Terms Schedule 2, help center). | flagged without the ID |
| U3 | alphafutures | 40% consistency boundary (inclusive or exclusive) and the net-losing-cycle block. | flagged without the ID |
| U25 | fundednext | Live withdrawal floor: article 16522296 Section 5 and Section 6 disagree. | `live.md` |
| U15 | fundednext | Flex and Rapid reset price basis (dashboard reset price at 50K); article 14260538 frames the reset as the offer price plus a fixed amount, so a no-promo reset may exceed the modeled $77.99. | `flex.md`, `SOURCES.md` |
| U8 (N-40) | e8futures | Zero Performance scaling tiers: whether an unlocked Scaling Trigger survives a losing day (engine keeps `TierBasis.SessionOpenProfit`). | `zero.md` |
| U9 (N-53) | topstep | Responsible Trading Discount amount on an XFA activation with a DLL (article 14289835 names it, publishes no amount); the engine keeps $149. | `standard.md`, `consistency.md` |
| U7 | topstep | LFA tier-timing, micro and default-XFA-balance readings. | `live.md` |
| U4, U6, U12, U22, U26 | mffu | U4: Pro one-time early withdrawal (60%, $1,000 minimum) as the first payout for the MLL lock, and whether "every 14 calendar days" runs from the previous payout. U6: Pro evaluation-stage MLL lock at start + $100. U12: Rapid Live $250 minimum withdrawal, gross or net. U22: Pro Sim-Funded 5 mini / 5 micro limit. U26: Rapid 50K scaling ("start off with 2 contracts"). | `pro.md`, `rapid-live.md`, `rapid.md` |
| U12 (Tradeify) | tradeify | Select reset $109 unconfirmed at a real cart; the docs record the `/select-plan` $65/$155/$215 (25K/100K/150K) against the homepage's $75/$169/$239 as two live pages that differ. The tracker's own U12 row should be checked before relying on this number. | `select-daily.md`, `select-flex.md` |
| U27 | tradeify | Lightning payout basis: the policy article's "No Minimum Trading Day Count" against the homepage's "Payout Frequency: 5 Days"; the engine keeps 0 minimum days. | `lightning.md` |
| U13 | apex | Live Bonus Vault and the 90-day safety-net exception, not modeled (`live.md` cites decision T25, not the U number). | `live.md` |
| U11 | lucid | Lucid 25K LucidPro Evaluation daily loss limit: help articles say "None", the homepage config shows $600 with a priced toggle. Needs the live 25K checkout. | `pro.md` |
| U24 | apex, tpt, lucid, mffu | The needs-paste pages in item 5. | `pro.md`, `test-pro.md`, `direct.md`, `flex.md`, `daily.md` |

Open conflicts only the firm can settle, recorded in the docs without a number:
Lucid LucidDaily's Maximum Daily Profit live transition (automatic or
discretionary) and whether the 0-payout evaluation-cost refund is conditional on
retaining at least 50% of drawdown; FTMO Futures Cl. 6.3 against Cl. 20.1 on who
can be offered a Live Funded Account, the W-9 scope and the Forbidden Trading
Practices scope for Live; the E8 code-discount conflict (5% first order, 25%
Signature, 35% Zero, 40% promo) and the reset price; TPT's PRO 50-executions
rule and the minimum withdrawal implied by "Withdrawal amount is below the
minimum allowed." (engine models $0.01).

## 5. User paste requests

The DOCS-R7e close-out round raised no new paste request: every firm's result
lists none.

Every URL below answered HTTP 403, a login wall, a geo-redirect or an empty
client-rendered shell on 2026-10-02, and the Apex and e8futures help-center URLs
again on 2026-10-03. None was worked around. Open each in your
own logged-in browser and paste the content; paste the whole page unless a
note names what is wanted.

**Alpha Futures**

- `https://app.alpha-futures.com/signup` (checkout app; HTTP 200 with only "You
  need to enable JavaScript to run this app"). Paste the code field and the
  rendered promo behavior: whether DIRECT35 or ALPHA40 applies (first month or
  every rebill, resets, Qualified-stage price). Settles the DIRECT35 bullet in
  `direct.md` and bears on U28.

**Apex** (all 403; the $590/$90 EOD and $249/$59 Intraday prices, the 5-Pack and
No Activation Fee prices, the $199 Second Chance price and the live FAQ rest on
the 2026-09-23 paste)

- `https://apextraderfunding.com/` (homepage product picker,
  `window.productPickerConfig`)
- `https://apextraderfunding.com/pricing/`
- `https://apextraderfunding.com/legacy-products/` (the Legacy Accounts product
  page: its own statement on whether the Legacy
  $167/$197/$297/$497/$597/$697 tiers are purchasable today, against the Legacy
  Products Overview's "no longer available for purchase", the live conflict in
  `legacy.md`; also the "One-Time PA Fee" tooltip, $125 against the $140 in the
  Legacy PA activation article)
- `https://apextraderfunding.com/help-center/billing/evaluation-plan-fees-and-access-explained/`
- `https://apextraderfunding.com/help-center/getting-started/apex-live-prop-trading-program-faq/`
- `https://support.apextraderfunding.com/` (older Zendesk host, never read)
- `https://apextraderfunding.com/sitemap_index.xml` (the 129-page list cannot
  be re-diffed; `apex/SOURCES.md` does not reconcile it: the capture record says
  129 pages, the ledger names 126 help-center URLs (69 cited, 57 excluded) and 3
  site rows, and which captured pages it omits is unresolved)
- Apex Terms and Conditions, User Agreement, Privacy and Refund legal pages
  (URLs not known; none has ever been read)

**e8futures** (all 403)

- `https://helpfutures.e8markets.com/en/articles/11640147-account-reset`
  (Reset Fee source, 10% restart discount, any absolute reset price)
- `https://helpfutures.e8markets.com/en/articles/11864618-e8-signature-futures`
  (settles the $150K drawdown conflict, 2.6666% in the site config against
  $4,500 in the article, plus minimum payout and inter-payout gate)
- `https://helpfutures.e8markets.com/en/articles/10155917-max-available-contract-sizes`
  (U8)
- `https://helpfutures.e8markets.com/en/articles/13001922-instrument-list-and-trading-hours`
  and `https://helpfutures.e8markets.com/en/articles/13004287-tick-size-and-profit-per-tick-calculation`
  (the Natural Gas symbol: the first prints "NQ" on its Natural Gas row, the
  `e8futures.com` homepage fetched 2026-10-03 prints "NG · NYMEX"; paste whether
  the second prints "NG")
- `https://helpfutures.e8markets.com/en/articles/15935817-e8-zero-starter-and-max`
- `https://helpfutures.e8markets.com/en/articles/15936479-40-best-day-rule-challenge`
  (the $6,100 against $6,250 summary-line conflict)
- `https://e8x.e8markets.com/orders/purchase?a=HV&b=100&dr=3&p=80&d=E8`
  (Signature checkout: what is charged for a $50K Signature, whether code E8
  is pre-applied, any reset price)
- `https://e8x.e8markets.com/orders/purchase?a=ZM&b=100&dr=3&p=80&d=E8` (Zero
  MAX checkout)
- `https://e8x.e8markets.com/`, `/trading-symbols` and `/claim-free-trial`
- `https://e8markets.com/` and `https://e8markets.com/__sitemap__/en.xml` (the
  only entry in `e8futures.com/sitemap_index.xml`)
- `https://help.e8markets.com/en/`, `https://helpfutures.e8markets.com/en/` and
  `https://helpfutures.e8markets.com/sitemap.xml`

**FTMO Futures**

- `https://futures.ftmo.com/en/configure-account/` (also
  `https://futures.ftmo.com/configure-account/`, the target of every "Start
  now" button): login wall, 302 to the SSO sign-in form. Open it logged in and
  paste any price, fee or reset text.
- The Sim-Funded Account Terms and Conditions sample, if you have one (see item 1).

**FundedNext**

- FundedNext dashboard reset checkout (login-only, no public URL) for a 50K Flex
  and a 50K Rapid account: settles U15 and the Reset Fee basis bullets in
  `flex.md`, `rapid-pro.md` and `rapid-daily.md`.
- `https://helpfutures.fundednext.com/en/articles/14283903-road-to-live-trading-legacy-challenge-rapid-challenge-former`:
  the page loads, but the per-withdrawal figures of Scenario 1 and Scenario 2
  exist only in four images with empty alt text. Paste or transcribe them to
  close `legacy-live.md`'s per-withdrawal bullet.

**Lucid** (all 403, Cloudflare challenge)

- `https://lucidtrading.com/` (embeds `LucidPricingConfig`: reset SKUs, DLL-ON
  promo, whether LucidDirect has a reset product, plus its own FAQ and
  activation-timing statements; replaces the Wayback-sourced content removed
  from `lucid/README.md`)
- `https://lucidtrading.com/checkout/` (a real LucidDirect re-buy or reset price,
  whether the $25K LucidPro tier has a purchasable DLL toggle; settles U11)
- `https://lucidtrading.com/pricing/` (public list prices for every plan family
  and size, including the one-time LucidDirect fee at 25K, 100K and 150K)
- `https://lucidtrading.com/lucidpro/`
- `https://lucidtrading.com/terms-of-use/` (re-confirms the arbitration,
  geographic-eligibility and "subscription based services" quotes in
  `lucid/README.md`)
- `https://lucidtrading.com/lucid-trader-agreement/` (never read)

**MFFU**

- The Simulated Trader Agreement and its Appendices (item 1): open it from your
  own MFFU account or checkout flow.
- `https://myfundedfutures.com/challenge?id=84` (Builder checkout) and
  `https://myfundedfutures.com/challenge?id=70`: client-rendered empty shells
  titled "Challenge | MyFundedFutures". Paste whether a Default/Add-On (MLL)
  toggle or second price appears at Builder 25K, 100K and 150K.

**TPT**

- `https://takeprofittrader.com/pricing` (HTTP 403): the monthly Test list price
  per size; $170 at 50K is only derived from promo FAQs.
- `https://takeprofittrader.com/api/subscriptions/products` (HTTP 403): the
  plan-card Daily Loss Limit and Max Position Size per size for Test, PRO and
  PRO+.
- `https://ninjatrader.com/pricing/commissions/` (redirects to the NinjaTrader
  Europe page): the US commissions page that "Commissions for PRO+" links, for
  PRO+ commission figures.
- `https://takeprofittrader.com/terms/` and
  `https://takeprofittrader.com/privacy-policy/` (HTTP 403): optional, to
  re-verify the `tpt/README.md` quotes taken from the Terms of Service on
  2026-09-20.
- Optional: the HTML of `https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15172012844957-Commissions-for-PRO`
  and `https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/22447557656477-Restricted-Countries`
  (403; their bodies were read through the Help Center API). Say if you want the
  API route dropped for TPT.

**Tradeify** (Cloudflare 403)

- `https://help.tradeify.co/sitemap.xml` and every `help.tradeify.co` article
  in `tradeify/SOURCES.md`; priority:
  `https://help.tradeify.co/en/articles/14369021-tradeify-pricing-reference`,
  `https://help.tradeify.co/en/articles/12969284-tradeify-elite-program`,
  `https://help.tradeify.co/en/articles/10495932-lightning-funded-account-payout-policy`,
  `https://help.tradeify.co/en/articles/12853966-select-flex-and-select-daily-payout-policies`.
  The six articles that earlier appeared here as archived copy only (`12268167`,
  `10468320`, `10495917`, `10468258`, `10495915`, `11083796`) are no longer
  requested: their live text is in the user's 2026-09-18 browser dump (item 2).
- The logged-in Select 300K V2 checkout reached from
  `https://tradeify.co/select-plan` (login-only): whether the $349 V2 evaluation
  is purchasable and what price it shows, and whether the stale `/select-plan`
  reset-fee figures are shown at checkout.

**Topstep**: none. Every page was fetched (HTTP 200) on 2026-10-02.

## 6. Structural violations left open

CONVENTIONS.md-level gaps the 2026-10-02 pass chose not to fix because fixing
them is a content decision or needs a source it could not read:

- **Live-file titles without a size**: `alphafutures/live.md`,
  `ftmo-futures/live.md`, `fundednext/legacy-live.md`, `lucid/live.md`
  (`# LucidLive`) and `apex/live.md`. CONVENTIONS.md records this as a known gap for live files.
- **Long Sources lines**: 28 plan files have a single-line `**Sources**` line over
  650 characters, counted by script on 2026-10-03: alphafutures 5 (1,651 to 5,607),
  apex 4 (2,613 to 9,745), fundednext 6 (984 to 4,806), lucid 5 (678 to 1,499),
  ftmo-futures 3 (663 to 825), e8futures 2 (808, 1,809), topstep 2 (1,451,
  2,588), mffu 1 (716); topstep `consistency.md` also has a second Sources block
  at its footer. The Last Verified lines are bare dates everywhere as of
  DOCS-R7e round 3.
- **Overview and Not Confirmed prose** longer than the 1-2 paragraph rule:
  11 plan files have an Overview of more than two paragraphs (apex `eod.md` and
  `legacy.md`, ftmo-futures `growth.md` and `pro.md`, fundednext `live.md`,
  lucid `daily.md` and `lucidmaxx.md`, topstep `pro-account.md`, tpt
  `pro-plus-live.md`, tradeify `lightning.md` and `select-flex.md`), and 45
  Not Confirmed bullets run past 1,500 characters (fundednext 13, alphafutures
  12, mffu 8, e8futures 5, lucid 4, tradeify 2, topstep 1; the longest is 3,847).
- **`lucid/README.md`** Key Cross-Plan Differences uses descriptive row names
  rather than the canonical parameter names, and Firm-Wide Rules mixes
  plan-family rules with firm-wide policy.
- **`e8futures/README.md`** keeps its `###` subsections inside Firm-Wide Rules.
- **`topstep/standard.md`** keeps a verbatim blockquote with the source's own
  em dash cells, on purpose.
- **`apex/legacy.md`** uses " -- " as a dash substitute (not an em dash).
- **Resolved and engine-note records** inside Not Confirmed (37 bullets, item 3)
  are history, not open questions; moving them is a content change.
- **`fundednext/SOURCES.md`** keeps older dated sections (2026-09-18 to
  2026-09-26) marked as history, superseded by the 2026-10-02 section.

## Cache-integrity traps found the hard way

Three separate times on 2026-09-20, a source cache silently lost the very content the docs depend on. Each was found
only by checking the extraction output, never by the pipeline noticing. Check for all of these before trusting any
audit that runs against a cache.

1. **`innerText` capture flattens tables.** Affected tradeify (2 of 76 articles kept rows), e8futures (0 of 73) and
   tpt (0 of 87). e8's "Max. available Contract Sizes" became one 4,812-character line where "$200,000",
   "10 Contracts" and "8 Contracts" all appear with nothing tying a size to a balance. Fix: capture
   `__NEXT_DATA__` (Intercom) or the Zendesk REST API, then render with `scratchpad/intercom-render.py` or
   `scratchpad/zendesk-render.py`.
2. **A renderer that handles only flat lists drops nested content.** The first Intercom renderer discarded
   `unorderedNestedList`, `orderedNestedList` and `collapsibleSection` entirely, losing 41% of Tradeify's text
   (735KB vs 520KB). Symptom: implausibly low bytes-per-article. Always check that number.
3. **Stripping `<script>` deletes embedded page data, which then reads as a fabricated citation.** Tradeify's
   homepage keeps its real per-tier pricing in `GrowthData` / `LightningData` / `SelectData` JSON inside a script
   tag; the rendered text holds only unrendered placeholders ("Lorem ipsum dolor."). An audit against the stripped
   text produced UNSUPPORTED findings against citations that were in fact correct. Fix: extract script blocks
   matching `const <Name>Data =`, `__NEXT_DATA__` or `window.<Name>Config` and append them to the page text.

**The general rule:** when an audit reports that a cited figure is missing from a source, check whether the
extraction dropped it before concluding the documentation is wrong. A false UNSUPPORTED finding is as damaging as a
missed real one, because acting on it deletes a correct citation.

A fourth trap from 2026-10-02: a sitemap can lag the page it lists. Topstep's
`help.topstep.com/sitemap.xml` `lastmod` trailed the page's own schema.org
`dateModified` for at least four articles, and article 13613539 was edited
again the same day. Read each page's own date, not the sitemap's.

## Standing constraints

These held throughout the 2026-09-20 and 2026-10-02 passes and still apply:

- Workflows: **Sonnet 5 only**, **max ~10 agents per run**, `ecc:` agent types.
- **Never use the Wayback Machine** (see item 2 for what still depends on it).
  Never work around a 403, a login wall or a client-rendered page: list it as a
  user paste request in item 5 and wait for the paste.
- Firm facts only from the firm's own live pages or a user paste; never memory,
  a cached copy or a third-party site. Engine facts only from the current source
  under `src/lib/prop-calculator/firms/`, read only.
- Never run `bun run dev` or `bun run build`, and never drive the app with a
  browser automation tool.
- Do not edit `src/lib/prop-calculator/**` as a side effect of a docs pass.
  Flag engine and doc mismatches in the docs only.
- No em dashes in authored prose. The only exceptions are the
  `- **Field** — reason` separator in Not Confirmed bullets and text inside a
  verbatim quotation.
- Fail loud. Never report a firm as done while its
  `## Not Confirmed By This Source` section is non-empty.
- `bun run lint` is `eslint . --fix` and rewrites source files; during a docs
  pass prefer `bun run typecheck` and `bun run test`, and run `lint` only when
  source changes are intended.

## Verification commands

Safe to run at any point:

```bash
bun run typecheck
bun run test
```

Structural checks over the tree, from `.claude/prop-firms/`:

```bash
# Not Confirmed bullets missing the required closing clause
python3 - <<'EOF'
import glob,re,os
for p in sorted(glob.glob('*/*.md')):
    if os.path.basename(p) in ('README.md','SOURCES.md'): continue
    m=re.search(r'^## Not Confirmed By This Source\s*$(.*?)(?=\n---|\Z)',open(p).read(),re.M|re.S)
    if not m: continue
    bad=[l for l in m.group(1).split('\n')
         if l.startswith('- **') and not re.search(r'\bdo not\b',l,re.I)]
    if bad: print(p,len(bad))
EOF

# unbalanced quotation marks, and table rows whose column count breaks
python3 - <<'EOF'
import glob,re
for p in sorted(glob.glob('*/*.md')):
    s=open(p).read()
    unb=[n for n,l in enumerate(s.split('\n'),1) if l.count('"')%2]
    w={}
    for l in s.split('\n'):
        if l.strip().startswith('|'):
            n=len(re.findall(r'(?<!\\)\|',l)); w[n]=w.get(n,0)+1
    if unb: print(p,'unbalanced quotes on lines',unb)
EOF

# Not Confirmed bullets per firm (the item 3 totals; the _template row is not a firm)
python3 - <<'EOF'
import glob,re,os
t={}
for p in sorted(glob.glob('*/*.md')):
    if os.path.basename(p) in ('README.md','SOURCES.md'): continue
    m=re.search(r'^## Not Confirmed By This Source\s*$(.*?)(?=\n---|\Z)',open(p).read(),re.M|re.S)
    if m: t[p.split('/')[0]]=t.get(p.split('/')[0],0)+len([l for l in m.group(1).split('\n') if l.startswith('- **')])
print(t)
EOF

# Not Confirmed recount and categories (the item 3 table; rules are described in item 3)
python3 - <<'EOF'
import glob,re,os,collections
ROOT='.'
FIRMS=['fundednext','alphafutures','topstep','lucid','mffu','apex','tradeify','ftmo-futures','tpt','e8futures']
REC=re.compile(r'^- \*\*[^*]*(engine|Engine|cross-check|simplification|row label|label \(|mapping|country list)[^*]*\*\*',re.I)
OOS=re.compile(r'^- \*\*[^*]*(Account sizes other than|sizes other than|other sizes|100K and 150K|\$100K and \$150K|25K, 100K|Legacy|discontinued|invite|out of scope|LucidBlack|Premium|Bolt|Rapid Challenge|Labs)[^*]*\*\*',re.I)
CONF=re.compile(r'live conflict|real conflict|genuine conflict|conflict between|conflicts with|conflicting|contradict|disagree|inconsisten|in tension|irreconcilable|conflict,? not',re.I)
PASTE=re.compile(r'\bpaste\b|login wall|client-rendered shell|logged-in checkout|needs? the live checkout',re.I)
cats=collections.OrderedDict((f,collections.Counter()) for f in FIRMS)
bul=collections.defaultdict(list)
for p in sorted(glob.glob(f'{ROOT}/*/*.md')):
    rel=p[len(ROOT)+1:]
    f=rel.split('/')[0]
    if f not in FIRMS or rel.endswith('README.md') or rel.endswith('SOURCES.md'): continue
    s=open(p).read()
    m=re.search(r'^## Not Confirmed By This Source\s*$(.*?)(?=\n---|\Z)',s,re.M|re.S)
    if not m: continue
    for l in m.group(1).split('\n'):
        if not l.startswith('- **'): continue
        cats[f]['total']+=1
        body=l
        if re.search(r'\bdo not\b',l,re.I) is None: cats[f]['no_do_not']+=1
        verbs=re.findall(r'\bDo not (\w+)',l)
        cats[f]['do_not_assume' if verbs and verbs[-1]=='assume' else 'do_not_other']+=1
        if REC.search(l[:260]) and not CONF.search(l[:400]): c='record'
        elif re.search(r'only an archived copy|Wayback Machine snapshot|archived copy',l[:260]): c='archived'
        elif OOS.search(l[:200]): c='out_of_scope'
        elif PASTE.search(l): c='needs_paste'
        elif CONF.search(l): c='live_conflict'
        else: c='unresolvable'
        cats[f][c]+=1
        bul[f].append((rel,c,l[:90]))
tot=collections.Counter()
for f in FIRMS:
    for k,v in cats[f].items(): tot[k]+=v
print('| Firm | Total | Unresolvable | Live conflict | Needs fetch | Needs paste | Out of scope | Archived copy only | Resolved or engine record |')
for f in FIRMS:
    c=cats[f]; print(f"| {f} | {c['total']} | {c['unresolvable']} | {c['live_conflict']} | 0 | {c['needs_paste']} | {c['out_of_scope']} | {c['archived']} | {c['record']} |")
print(f"| Tree | {tot['total']} | {tot['unresolvable']} | {tot['live_conflict']} | 0 | {tot['needs_paste']} | {tot['out_of_scope']} | {tot['archived']} | {tot['record']} |")
print('no do-not:',tot['no_do_not'],'| closing Do not assume:',tot['do_not_assume'],'| other Do not verb:',tot['do_not_other'])
print({f:(cats[f]['do_not_assume'],cats[f]['do_not_other']) for f in FIRMS})
EOF
```

Every citation must have a ledger row. After adding any source, re-check that
each `SOURCES.md` row's `Used In` column matches which files actually cite it.
Three rows were missing from `alphafutures/SOURCES.md` on 2026-09-20 precisely
because that check was not re-run after the legal documents were cited; on
2026-10-02 the same check caught `live.md` missing from the article 11634907
row and `signature.md` and `zero.md` missing from three e8futures rows.
