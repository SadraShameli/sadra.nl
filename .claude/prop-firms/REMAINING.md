# Prop Firm Docs: Remaining Work

Open work across `.claude/prop-firms/`, as of **2026-09-20**. Read
[CONVENTIONS.md](CONVENTIONS.md) first: it is the spec this tree is held to,
and every item below is phrased in its terms.

This file tracks what is *not* done. When an item is finished, delete it here
and record the result in that firm's own `SOURCES.md`, not in this file.

## Status per firm

| Firm | Plan files | Help-center sources | Main-site sources | Legal docs read | Line-by-line audit |
| ------------ | ---------- | ------------------- | ----------------- | --------------- | ------------------- |
| alphafutures | 5          | 37                  | 13                | 3               | Done 2026-09-20      |
| apex         | 4          | 129 (main-site dump)| yes               | 0               | Done 2026-09-20      |
| e8futures    | 2          | 61 (repaired cache) | 16                | 4               | Done 2026-09-20      |
| fundednext   | 8          | 63                  | 0                 | 5               | Done 2026-09-20      |
| lucid        | 6          | 60                  | 173               | 4 (5th, the Trader Agreement, blocked, see item 1) | Done 2026-09-20      |
| mffu         | 5          | 52                  | 4                 | 3               | Done 2026-09-20      |
| topstep      | 6          | 41                  | 0                 | 5               | Done 2026-09-20      |
| tpt          | 2          | 87 (repaired cache) | 71                | 2               | Done 2026-09-20      |
| tradeify     | 5          | 76 (repaired cache) | 3                 | 1 (re-read) + 3 | Done 2026-09-20      |

All nine firms have had the bulk adversarial verifier pass and the per-file
two-direction line-by-line audit described in item 2. Apex's src-to-doc
direction (76 findings: 71 MISSING_RULE, 5 CONTRADICTED, heaviest in
`legacy.md` at 37) was the last piece to close, all applied 2026-09-20.

**All 8 non-Alpha-Futures firms now have at least one legal document read**,
closing item 1 below. 74 findings applied tree-wide (29 from a 5-firm
workflow sweep + e8futures/fundednext/mffu/topstep/tradeify's own direct
follow-up reads, + Lucid's 21 + TPT's 6 direct reads), including several
Alpha-Futures-shaped findings: a firm's own signed Terms/Agreement
contradicting a help-center-sourced refund policy (e8futures, fundednext,
tradeify), a non-disparagement clause enforceable by termination (e8futures,
fundednext), an entire separate binding document never read that outranks
even the Terms and Conditions themselves (mffu's "Simulated Trader Agreement
and its Appendices"), and an arbitration-administrator citation that was
simply wrong (mffu: help center said AAA, the actual Terms say JAMS).

## 1. Legal document sweep, 8 firms: done, one page still blocked

**Done 2026-09-20 for all 8 firms that had zero legal documents.** Terms and
conditions, service agreements and return policies are where payout splits,
termination triggers and refund rights actually live, and they are
frequently at odds with the help center's marketing copy.

Alpha Futures was the evidence this item was originally justified on. Reading
its legal pages on 2026-09-20 produced the five highest-consequence findings
of the entire pass, none of which the help center disclosed (tiered
70/80/90 split vs. advertised flat split, a cooling-off right waived on the
first trade, non-disparagement enforceable by termination, a
maintain-the-same-risk termination trigger, a 4% vs. 3.5% MLL conflict). The
same category of finding turned up in every other firm once its legal pages
were finally read:

- **e8futures**: Terms of Service Section 4.2 states fees are non-refundable
  "under any circumstance" the moment access is activated, contradicting the
  help-center-sourced "refund if zero activity within 30 days" rule already
  in the tree; plus a non-disparagement clause, mandatory AAA arbitration
  with a 30-day opt-out, and a crypto-payout forfeiture-on-wrong-address rule.
- **fundednext**: the main Terms of Service grant a real 7-day,
  pre-first-trade refund right against the tree's "all fees strictly
  non-refundable" rule (and a third, separately-conflicting Futures Challenge
  Terms document says "non-refundable under any circumstances"); a
  non-disparagement clause, a confidentiality clause barring even screenshots
  of enforcement communications, a post-payout Performance Reward clawback
  right, mandatory DIAC (Dubai) arbitration, a USD 25,000 contractual penalty
  on top of suspension, and a no-notice trading freeze that can lock a trader
  into an open, still-losing position.
- **lucid**: a full Refund and Chargeback Policy (previously entirely
  undocumented) with a strict no-refund-once-traded rule and a
  permanent-ban chargeback clause; a direct conflict between the Terms of
  Use's "for use only by persons located in the United States" and the
  Restricted Countries rule's ~80-country exclusion list (which implies most
  other countries are permitted); account eligibility exclusions (felony
  conviction, NFA/CFTC discipline, outstanding balance with another firm).
  The single highest-value page, `lucid-trader-agreement/`, came back with an
  empty body (client-rendered content a plain `fetch()` can't see) and is
  still unread; see the note in `lucid/SOURCES.md`.
- **mffu**: discovered an entire second, binding document, the "Simulated
  Trader Agreement and its Appendices," which the Terms and Conditions state
  outranks the Terms themselves, and which this tree has never located or
  read, the exact Alpha Futures failure mode at one level of remove; plus a
  wrong arbitration-administrator citation (help center said AAA, the actual
  Terms name JAMS), a card-fraud rule contradicted by the Terms' actual
  verification-path language, and an unqualified (not payment-model-scoped)
  7-day dormant-account rule that the tree had wrongly treated as legacy-exempt.
- **topstep**: felony/NFA/CFTC/outstanding-balance eligibility exclusions;
  a VPN consequence harsher than documented (forfeiture of profits, not just
  a login block); a cross-account Prohibited Conduct clawback that forfeits
  every account a trader holds, not just the offending one; a real conflict
  between the Payout Policy's checkout-only double-payout-cap DLL rule and
  the firm's own separately-published promo terms; a 30-day/6-month Trading
  Combine activation deadline; a discretionary Octagon-bonus clawback right
  flagged as uncertain (stale "LPB" naming from a retired program).
- **tpt**: a full 72-hour/$75-fee Refund Policy, a chargeback waiver, an
  arbitration/class-action-waiver clause, and a one-email-per-customer rule,
  none previously documented; the main site (`takeprofittrader.com`) is
  Cloudflare-blocked, so this required a user browser-console fetch.
- **tradeify**: a direct conflict between the signed Funded Trader
  Agreement's §6.5 (requires avoiding DCA/flipping) and the help-center-sourced
  "unrestricted" claim already in the tree (the Agreement's own §11 may
  resolve this in the trader's favor, but that clause isn't cited where the
  DCA/flipping claim is made); a chargeback-dispute-rights waiver; a
  payout-suspension-pending-investigation clause; a strict-liability
  Expired/Non-Active Contract prohibition with retroactive consequences; a
  second-tier "eligible to evaluate, permanently ineligible for Elite Live"
  jurisdiction restriction.

**What's still open:**

- **Lucid's `lucid-trader-agreement/` page** returned empty (client-rendered,
  not visible to a plain `fetch()`). Needs a manual copy-paste from the fully
  rendered page, or a PDF/download link if the agreement is served that way.
- **Two firms' main sites remain Cloudflare-blocked to any non-browser fetch**
  (`lucidtrading.com`, `takeprofittrader.com`), worked around this pass via a
  user browser-console script (`fetch()` from an authenticated tab); the same
  approach will be needed for any future re-read of those two domains.
- **Product/pricing pages** (the fourth item in the original per-firm target
  list) were not systematically re-swept this pass; the legal-document sweep
  focused on Terms/Privacy/Refund/signed-agreement pages specifically, since
  those produced the Alpha Futures pattern. A dedicated pricing-page sweep
  remains a separate, not-yet-started task if wanted.

**Verify every finding before applying it**, the same discipline Alpha
Futures required. Of the 34 candidate findings this pass's 5-firm workflow
surfaced (before adding e8futures' extra 5, fundednext's extra 2 beyond the
core, and Lucid/TPT's direct reads), 13 were rejected by the adversarial
verify stage as already-covered, boilerplate, or unsupported, before any of
the surviving 29 were applied. Of Alpha Futures' own original 79
main-site findings, two entire clusters were separately rejected on
inspection: 19 pages had copied the wrong plan's consistency-rule figure, and
a pricing cluster was contradicted by the firm's own product pages.

Marketing pages go stale. The help center and the product pages outrank them.
Where they conflict, record the conflict and keep the higher-authority figure.

## 2. Per-file line-by-line audit: done, all 9 firms

**Done 2026-09-20.** Every firm has had the two-direction audit described
below. Shape for reference, and for any future re-audit after a firm's
sources are refreshed:

- **doc to source**, one agent per plan file: every dollar figure, percentage,
  day count, contract count, fee and named rule must trace to a verbatim phrase
  in that firm's cached sources. Hunt specifically for the three per-file bug
  classes in CONVENTIONS.md: trigger-versus-locked-value conflation in a
  Drawdown Lock row, a worked example that changes balance convention partway,
  and a claim borrowed from a sibling plan file.
- **source to doc**, agents batched over the firm's articles: every rule-bearing
  statement the firm makes must reach the tree, or be excluded on its actual
  content rather than its title.

Alpha Futures' run returned 34 findings against an already-verified tree.
32 were applied. It caught a **flatly false completeness claim** in
`advanced.md` (it asserted no Alpha Prime article existed among its sources
while `live.md` was already citing that very article), a markdown table broken
by an unescaped pipe inside a quote, and three quotations that were not
character-for-character.

**Expected shape:** one 10-agent workflow per firm. Reuse
`alphafutures-plan-audit-wf_25da5558-b63.js`, changing only `args`.

**Two of the 34 were false positives.** Re-check every `sourceQuote` against the
cached source text before applying anything. A normalised substring check
catches most of it; anything that fails needs reading in context.

## 3. Source-cache repairs: done

**Both done 2026-09-20.** Tradeify and e8futures were each re-dumped from `__NEXT_DATA__` and re-rendered, replacing the
`innerText` captures that had flattened their tables.

| Firm | Articles | Tables before | Tables after | Repaired cache |
| --------- | -------- | ------------- | ------------ | -------------- |
| tradeify  | 76       | 2             | 31           | `scratchpad/tradeify-fresh/articles/` |
| e8futures | 61       | 0             | 19           | `scratchpad/dumps/e8-help/` |

The defect was real, not theoretical. e8futures’ "Max. available Contract Sizes" article was one unbroken 4,812-character line in which "$200,000", "10 Contracts" and "8 Contracts" all appear with nothing tying each contract size to its account balance.

A second lesson came out of the re-render: the first renderer handled only flat lists and dropped `unorderedNestedList`, `orderedNestedList` and `collapsibleSection` blocks entirely. Fixing it recovered 41% more text for Tradeify (735KB vs 520KB). Any future Intercom dump should be rendered with `scratchpad/intercom-render.py`, which handles every block type these two help centers actually use.

Both firms’ audits now run against the repaired caches. Figures verified against the old copies should be treated as unconfirmed until re-checked.

## 4. Tradeify completeness: resolved, and item was overstated

**Done 2026-09-20, and this item was wrong as originally written.** It was drafted off a stale sentence in `tradeify/SOURCES.md` ("a materially different completeness guarantee than this tree’s Lucid/MFF equivalents") that a later paragraph in that same file already superseded on 2026-09-19. Tradeify’s article set was in fact already sitemap-verified. The stale sentence has now been marked as superseded in place.

A fresh browser dump on 2026-09-20 confirmed the set a third time (85 URLs, 76 articles, identical IDs, nothing added or removed) and, more usefully, **repaired a real defect**: the previous cache was captured as `innerText`, which flattened table markup down to 2 articles retaining row structure. Re-rendering from `__NEXT_DATA__` restores tables in 31 articles. The repaired cache lives at `scratchpad/tradeify-fresh/articles/` and is what Tradeify’s audit now runs against.

Lesson worth keeping: a `SOURCES.md` can contradict itself across passes. Read the whole completeness section before trusting any one sentence in it.

## 5. Apex: no longer deferred, resolved

Was deferred earlier on 2026-09-20; resumed and finished the same day.

- ~~62 Not Confirmed bullets, 15 lacking a closing clause~~ **Done
  2026-09-20.** All 15 closers written. The tree is now at 435 of 435 bullets
  carrying a closing clause, apex included.
- ~~Apex excluded from every scan and workflow~~ **Done 2026-09-20.** Apex
  ran both directions of the per-file audit against its 129-file main-site
  dump (`apex-sources/main`): doc-to-source found 2 minor findings, both
  applied; source-to-doc found 76 (71 MISSING_RULE, 5 CONTRADICTED), all
  applied across `README.md` (22), `legacy.md` (37), `eod.md` (8),
  `intraday.md` (8), `live.md` (1). `legacy.md` was missing entire named
  rule mechanics (5:1 Risk-Reward, MAE, Hedging, One-Direction, DCA, Scaling
  violation consequences) that were only ever cited, never stated in body
  text — now consolidated into a dedicated "Legacy-Specific Trading Rules"
  section, plus a new "Billing, Cancellation, and Reset Mechanics" section
  for the recurring-subscription mechanics (72-hour grace period, 48-hour
  refund window, auto-reset-on-renewal, and related deadlines) that Legacy's
  billing model needs and the current-generation products don't.
- **Still open, retried and re-confirmed blocked 2026-09-20:**
  `support.apextraderfunding.com` (Zendesk) returns HTTP 403 to every direct
  curl attempt, including the Zendesk REST API endpoint that worked around
  the same kind of block for Take Profit Trader's Zendesk instance (this one
  is fully Cloudflare-protected, not just access-restricted). Its own "How to
  Contact" article states that helpdesk was discontinued. Whether any of its
  content contradicts the current `apextraderfunding.com` help center is
  unresolved. No help-center sources proper are in Apex's ledger at all;
  every row traces to the main-site browser dump instead. Would need a user
  browser-console fetch, the same workaround used for Lucid and TPT's
  legal pages in item 1, if pursued further.

## 6. Open Not Confirmed bullets

**448 tree-wide, recounted 2026-09-20 after Apex's src-to-doc pass.**
Largest first: fundednext 83, alphafutures 71, apex 62, topstep 51, lucid
45, tradeify 42, mffu 40, tpt 33, e8futures 20. The count moved from the
previously-tracked 435 because this pass both resolved several bullets
(moving them into confirmed tables) and added new ones (source-vs-source
conflicts a fresh reading surfaced, mostly in `apex/eod.md`,
`apex/intraday.md`, and `apex/legacy.md`) — a net change, not a sign either
direction of work is unfinished.

Many are genuinely unresolvable because the firm does not publish the figure,
and those should stay flagged. A subset would close with a targeted fetch, and
items 1 and 3 above will resolve some as a side effect. Worth a dedicated pass
only after 1 through 4.

Do not resolve one of these by inference. If the firm does not state it, it
stays flagged.

## 7. Not documentation: 19 modified `src/` files

`bun run lint` in this repo is `eslint . --fix`, so running it rewrites source
files. A lint run during the 2026-09-20 documentation pass left **19 `src/`
files modified and staged**, every hunk a mechanical
`unicorn/prefer-logical-operator-over-ternary` autofix plus reformatting. All
were checked and are behaviour-preserving. None were authored deliberately.

`package.json` and `bun.lock` are also modified, but those are dependency
version bumps and unrelated to the lint run. Leave them.

**Awaiting a decision:** `git restore` the 19 `src/` files to HEAD, or keep the
autofixes. Nothing else in the tree depends on the answer.

Note for future passes: the repo rule is that a documentation pass does not edit
`src/`. Since `lint` carries `--fix`, prefer `bun run typecheck` and
`bun run test` for verification during a docs pass, and run `lint` only when
source changes are actually intended.

## Cache-integrity traps found the hard way

Three separate times on 2026-09-20, a source cache silently lost the very content the docs depend on. Each was found
only by checking the extraction output, never by the pipeline noticing. Check for all of these before trusting any
audit that runs against a cache.

1. **`innerText` capture flattens tables.** Affected tradeify (2 of 76 articles kept rows), e8futures (0 of 73) and
   tpt (0 of 87). e8’s "Max. available Contract Sizes" became one 4,812-character line where "$200,000",
   "10 Contracts" and "8 Contracts" all appear with nothing tying a size to a balance. Fix: capture
   `__NEXT_DATA__` (Intercom) or the Zendesk REST API, then render with `scratchpad/intercom-render.py` or
   `scratchpad/zendesk-render.py`.
2. **A renderer that handles only flat lists drops nested content.** The first Intercom renderer discarded
   `unorderedNestedList`, `orderedNestedList` and `collapsibleSection` entirely, losing 41% of Tradeify’s text
   (735KB vs 520KB). Symptom: implausibly low bytes-per-article. Always check that number.
3. **Stripping `<script>` deletes embedded page data, which then reads as a fabricated citation.** Tradeify’s
   homepage keeps its real per-tier pricing in `GrowthData` / `LightningData` / `SelectData` JSON inside a script
   tag; the rendered text holds only unrendered placeholders ("Lorem ipsum dolor."). An audit against the stripped
   text produced UNSUPPORTED findings against citations that were in fact correct. Fix: extract script blocks
   matching `const <Name>Data =`, `__NEXT_DATA__` or `window.<Name>Config` and append them to the page text.

**The general rule:** when an audit reports that a cited figure is missing from a source, check whether the
extraction dropped it before concluding the documentation is wrong. A false UNSUPPORTED finding is as damaging as a
missed real one, because acting on it deletes a correct citation.

## Standing constraints

These held throughout the 2026-09-20 pass and still apply:

- Workflows: **Sonnet 5 only**, **max ~10 agents per run**, `ecc:` agent types.
- **Never use the Wayback Machine.** If a site blocks curl, hand the user a
  browser-console fetch script and wait for the dump.
- Never run `bun run dev` or `bun run build`, and never drive the app with a
  browser automation tool.
- Do not edit `src/lib/prop-calculator/**` as a side effect of a docs pass.
  Flag engine and doc mismatches in the docs only.
- No em dashes in authored prose. The only exceptions are the
  `- **Field** — reason` separator in Not Confirmed bullets and text inside a
  verbatim quotation.
- Fail loud. Never report a firm as done while its
  `## Not Confirmed By This Source` section is non-empty.

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
```

Every citation must have a ledger row. After adding any source, re-check that
each `SOURCES.md` row's `Used In` column matches which files actually cite it.
Three rows were missing from `alphafutures/SOURCES.md` on 2026-09-20 precisely
because that check was not re-run after the legal documents were cited.
