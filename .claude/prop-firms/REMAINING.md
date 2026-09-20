# Prop Firm Docs: Remaining Work

Open work across `.claude/prop-firms/`, as of **2026-09-20**. Read
[CONVENTIONS.md](CONVENTIONS.md) first: it is the spec this tree is held to,
and every item below is phrased in its terms.

This file tracks what is *not* done. When an item is finished, delete it here
and record the result in that firm's own `SOURCES.md`, not in this file.

## Status per firm

| Firm | Plan files | Help-center sources | Main-site sources | Legal docs read | Not Confirmed bullets | Line-by-line audit |
| ------------ | ---------- | ------------------- | ----------------- | --------------- | --------------------- | ------------------ |
| alphafutures | 5          | 37                  | 13                | 3               | 71                    | Done 2026-09-20    |
| apex         | 4          | 0 (main-site dump)  | yes               | 0               | 62                    | Not run            |
| e8futures    | 2          | 62                  | 0                 | 0               | 18                    | Not run            |
| fundednext   | 8          | 63                  | 0                 | 0               | 79                    | Not run            |
| lucid        | 6          | 60                  | 0                 | 0               | 44                    | Not run            |
| mffu         | 5          | 52                  | 4                 | 0               | 39                    | Not run            |
| topstep      | 6          | 41                  | 0                 | 0               | 48                    | Not run            |
| tpt          | 2          | 43                  | 0                 | 0               | 32                    | Not run            |
| tradeify     | 5          | 58                  | 3                 | 1               | 41                    | Not run            |

All eight non-apex firms have had the bulk adversarial verifier pass (853
findings raised, 847 applied). Only Alpha Futures has had the per-file
two-direction audit described in item 2.

## 1. Legal and main-site sweep, 6 firms

**Highest value per unit of effort. Do this first.**

`e8futures`, `fundednext`, `lucid`, `mffu`, `topstep`, `tpt` have **zero**
legal documents in their ledgers. `tradeify` has one. Terms and conditions,
service agreements and return policies are where payout splits, termination
triggers and refund rights actually live, and they are frequently at odds with
the help center's marketing copy.

Alpha Futures is the evidence. Reading its legal pages on 2026-09-20 produced
the five highest-consequence findings of the entire pass, none of which the
help center disclosed:

- the signed General Service Agreement defines a **tiered 70%/80%/90%** split
  while every plan overview advertises "90% profit split from the start, no
  tiered system"
- a **14-day cooling-off right that is waived on the first trade**, against a
  Return Policy page stating "All sales are final, no refunds will be issued."
- **non-disparagement, enforceable by account termination**
- a **maintain-the-same-risk requirement** whose breach is instant termination
- Schedule 2 gives Advanced Qualified a **4% Maximum Loss Limit** against the
  tree's 3.5%

Per firm, the minimum target set:

- `/terms-and-conditions` or `/terms-of-use`
- `/general-service-agreement`, or whatever the signed trader agreement is
  called
- `/return-policy` or `/refund-policy`
- `/privacy-policy` (only if it carries account or data rules with
  consequences)
- the product and pricing pages, which settle price conflicts the blog pages
  create

**Method.** Fetch the main-site `sitemap.xml`, diff it against what the firm's
`SOURCES.md` already lists, and read every page line by line. Do not sample and
do not skip a page because its title reads like marketing: Alpha Futures'
worst contradictions were on blog and comparison pages.

**Expected shape:** one 10-agent workflow per firm, batching pages by byte size,
`ecc:code-explorer`, Sonnet 5 only, effort high. Model it on
`alphafutures-mainsite-linread-wf_ed419f30-50c.js`.

**Verify every finding before applying it.** Of Alpha Futures' 79 main-site
findings, two entire clusters were rejected on inspection:

- 19 distinct pages claimed a 50% Advanced consistency rule; the help center,
  the Advanced overview and the Terms all say 40%, and the Terms assign 50% to
  Standard. The blog pages had copied the wrong plan's figure.
- a cluster quoted Zero at $119/month and Advanced at $139/month; the firm's
  own product pages confirmed the tree's $139 and $209.

Marketing pages go stale. The help center and the product pages outrank them.
Where they conflict, record the conflict and keep the higher-authority figure.

## 2. Per-file line-by-line audit, 7 firms

Every firm except Alpha Futures still needs the two-direction audit:

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

## 5. Apex, deferred by request

Deferred on 2026-09-20, not cancelled. Outstanding:

- ~~62 Not Confirmed bullets, 15 lacking a closing clause~~ **Done
  2026-09-20.** All 15 closers written. The tree is now at 435 of 435 bullets
  carrying a closing clause, apex included.
- **No help-center sources in the ledger at all.** Apex's rows come from a
  main-site browser dump. `apex-sources/fetch-script-1-support.js` was written
  for `support.apextraderfunding.com` and has never been run. It needs a
  logged-in browser.
- Apex was excluded from every scan and workflow in the 2026-09-20 pass, so it
  has had neither the main-site line read nor the per-file audit.

## 6. Open Not Confirmed bullets

**372 outside apex, 435 tree-wide.** Largest first: fundednext 79,
alphafutures 71, topstep 48, lucid 44, tradeify 41, mffu 39, tpt 32,
e8futures 18.

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
