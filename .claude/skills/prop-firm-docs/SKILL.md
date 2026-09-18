---
name: prop-firm-docs
description: Build or re-verify a .claude/prop-firms/<firm>/ documentation tree from a firm's own primary-source articles (pasted HTML/text, or live-fetched pages), following the fixed structure in .claude/prop-firms/CONVENTIONS.md. Use whenever the user asks to add, extend, or re-verify prop-firm rule documentation for any firm — new or already-documented — and whenever they paste raw help-center source material for a prop firm's plans.
---

# Prop Firm Docs

Produces (or re-verifies) a `.claude/prop-firms/<firm-slug>/` tree that matches
every other firm's tree exactly — same file layout, same section order, same
tables, same unconfirmed-flag format. Read `.claude/prop-firms/CONVENTIONS.md`
in full before doing anything else — it is the actual spec this skill
enforces, not just background reading. CONVENTIONS.md's "Known bug classes"
section names the specific, recurring ways this kind of documentation goes
wrong (drawdown-lock figures, worked-example unit mixing, cross-plan
carryover, README scope inflation, search-only completeness gaps), check
every draft against all of them, every time, not just when something looks
suspicious.

A single drafting pass, however careful, cannot be trusted to self-certify —
this data drives real trading decisions on real money, and a fact that reads
as plausible is not the same as a fact that is sourced. That is why stage 3
below (adversarial verification by a fresh agent) is mandatory rather than
optional, and why it must be a genuinely independent agent rather than the
drafter re-checking its own output.

## Required inputs — never proceed without these

- The firm's **own** primary-source documents: pasted HTML/text from its help
  center, or a live fetch of its own site. Never a third-party review site,
  never a "here's what I recall from an earlier session" summary, never a
  plausible-sounding number. If a fact isn't in a document you can point to,
  it is unconfirmed — see the Unconfirmed-flag format in CONVENTIONS.md.
- If the user references sources from earlier in the conversation (or a prior
  session) rather than pasting them fresh, locate and re-read the actual
  source material before writing anything — never draft from a compacted
  summary of what a source "said," even one from this same conversation's own
  history. A summary is a paraphrase, and a paraphrase is exactly where a
  fabricated or misremembered figure can hide undetected. If the raw source
  text isn't recoverable from the current conversation, check the session
  transcript directly (`~/.claude/projects/<project>/<session-id>.jsonl`) for
  the original pasted `document` content blocks before asking the user to
  re-paste.

## Two modes

**New firm.** No `.claude/prop-firms/<firm-slug>/` directory exists yet.
Build the full tree from scratch using the templates in
`.claude/prop-firms/_template/`.

**Re-verify / extend existing firm.** The directory exists. Either add a new
plan file to it (same template, same conventions, cross-check the new file's
claims against the existing `README.md`'s firm-wide rules before assuming
they carry over — see CONVENTIONS.md's bug class #3), or re-verify existing
files against freshly-provided source material (re-run the full pipeline
below against the specific files the new sources cover; do not silently trust
old, unverified content in files the new sources don't touch — leave those
files' own `Last Verified` date as-is and untouched, so it stays honest about
what was actually re-checked this pass).

## Pipeline

Use the `Workflow` tool for stages 2–3 (a pipeline: draft, then adversarially
verify). Do not skip stage 3 and do not fold it into stage 2 as "the same
agent double-checking its own work" — it must be a fresh agent with no memory
of drafting the file, per CONVENTIONS.md §Verification protocol step 5.

1. **Discover & Extract.** Do this yourself, directly, before spawning any
   subagent: it's mechanical, not a judgment call.
    - **Discover the full source set first, not just what the user pasted or
      what search turns up.** See CONVENTIONS.md bug class #5. Targeted
      search (WebSearch, or links noticed inside an article already open)
      finds what you already suspect exists; it cannot confirm nothing else
      does. Fetch the firm's help-center sitemap directly: try
      `<help-center-domain>/sitemap.xml` first, then `/sitemap_index.xml`,
      then check `/robots.txt` for a `Sitemap:` directive if neither
      resolves. A working sitemap returns a flat list of every collection
      and article URL on the site. Diff that list against every source
      already fetched or pasted this pass, and fetch/read whatever's
      missing before moving to stage 2. If no sitemap can be found at all
      for that firm, say so explicitly in `SOURCES.md` rather than silently
      treating search results as if they were complete.
    - **Only skip an article for being genuinely out of scope, never for
      being inconvenient or unlikely.** Legitimate skips: a collection
      explicitly marked legacy/discontinued, or an invite-only/unreleased
      product the user hasn't asked to document, named with its specific
      reason in the final report (stage 8). "It didn't come up in search"
      or "the title sounds like marketing" are not reasons to skip on their
      own; fetch and read it, then exclude it based on its actual content if
      it turns out to have nothing rule-relevant, rather than assuming that
      from the title.
    - **For each source document** (pasted, sitemap-discovered, or
      search-discovered), extract plain text preserving every number
      verbatim (strip HTML tags/scripts/styles; do not summarize or
      paraphrase at this stage).
    - **If a URL fails to fetch** (blocked, 403, persistent error) after one
      retry and a Wayback Machine fallback attempt, do not silently mark it
      Unconfirmed and move on. Collect every failed URL into a single list
      and give it to the user, asking them to open each one in their own
      logged-in browser and paste the content back, the same "give me links
      to dump" pattern already established in this repo's prop-firm
      research. Never reach for a browser automation tool (Chrome DevTools
      MCP or similar) to work around the block yourself: when a user says
      "browser" in this context they mean their own logged-in browser, not
      an automated one, and an automated browser doesn't get past a
      Cloudflare-style block anyway.

2. **Draft** (one agent per plan file, in parallel where there's more than
   one plan). Spawn `ecc:doc-updater` with a prompt that:
    - Points it at `.claude/prop-firms/CONVENTIONS.md` and the matching
      template in `.claude/prop-firms/_template/` and instructs it to follow
      both exactly — same section order, same table rows, no invented
      headings.
    - Gives it the extracted plain-text source(s) for that specific plan only
      (not the whole firm's source bundle — an agent drafting Plan A's file
      should not have Plan B's numbers available to accidentally cross-
      contaminate; see CONVENTIONS.md bug class #3).
    - States explicitly: "Do not invent or guess any number that isn't
      verbatim in the provided source text. Anything not stated goes in the
      '## Not Confirmed By This Source' section with a reason, not into a
      table as if it were fact."
    - Names the known bug classes from CONVENTIONS.md that apply to a single
      plan file's own accuracy, explicitly in the prompt
      (lock-trigger-vs-locked-value, mixed worked-example conventions,
      assumed cross-plan carryover) and requires the draft to self-check
      against each before returning. (Bug classes #4 and #5, README scope
      inflation and search-only completeness gaps, are firm-wide concerns
      handled in stage 1 and stage 6, not per-plan-file drafting concerns, so
      they aren't part of this per-file prompt.)
    - If the firm/plan already has an engine implementation under
      `src/lib/prop-calculator/firms/<firm-slug>/`, instructs it to read that
      file too and flag (not silently resolve) any place the doc and the code
      disagree.

3. **Adversarially verify** (mandatory, one fresh agent per drafted file,
   with the draft and the raw source text but NOT the drafting agent's own
   reasoning/prompt). Instruct this agent: "For every dollar figure,
   percentage, day-count, and contract-count in this draft, find the exact
   phrase in the raw source text that supports it. If you cannot find
   one, list it as unsupported — do not assume the drafter checked, and do
   not try to justify a number by inference; either it's quotably in the
   source or it isn't." Also instruct it to specifically hunt for the three
   per-file bug classes (a lock table row that conflates trigger and locked
   value; a worked example that changes its balance convention partway
   through; a claim that reads like it was borrowed from a sibling plan file
   rather than this plan's own source), name them explicitly, don't rely on
   the agent inferring what to look for. Return a structured list of
   unsupported/incorrect items, each anchored to the exact draft line.

4. **Apply.** Fix every item stage 3 surfaced, directly (you do this, not a
   subagent) — either correct the figure with the right source-backed value,
   or move it into `## Not Confirmed By This Source` with a reason. Do not
   mark the file done while any stage-3 finding is unresolved.

5. **Self-consistency pass** (you, not delegated — this is fast and the
   stakes don't justify skipping a direct read). Re-read the finished file
   end to end once. Specifically re-check every `Drawdown Lock` table row for
   the trigger/locked-value split, and re-derive every worked example's final
   number from its first stated number by hand.

6. **Cross-plan / firm-wide check.** Before writing or editing `README.md`'s
   `## Firm-Wide Rules`, confirm each rule against every individual plan
   file's own content — not against assumption. Any cell in the
   `## Key Cross-Plan Differences` table that a plan file marks
   "Unconfirmed" must say "Unconfirmed" in the README too.

7. **Update `SOURCES.md`** using `.claude/prop-firms/_template/SOURCES.template.md`'s
   format — one row per source document, which file(s) it feeds, and the
   date it was fetched/pasted (not today's date if it was pasted earlier in
   the conversation — use the actual paste/fetch date).

8. **Report.** State plainly which files were created or changed, and give an
   explicit confirmed-vs-unconfirmed summary — do not say a firm's docs are
   "done" if any `## Not Confirmed By This Source` section is non-empty.
   State the sitemap-diff completeness result too, per CONVENTIONS.md bug
   class #5: how many articles the sitemap listed, how many were read, and
   the specific named reason for every one that wasn't (out-of-scope
   collection, or still on the stage-1 user-dump list). "I searched for the
   relevant articles" is not a completeness claim; "N of M sitemap articles
   read, here's what's excluded and why" is. Fail loud on what's still open,
   per this repo's standing rules.

## What this skill does not do

- It does not decide firm/plan _simulator_ behavior — if a doc/engine mismatch
  is found in stage 2 or 3, report it; do not edit
  `src/lib/prop-calculator/**` as a side effect of a documentation pass
  without being asked.
- It does not retrofit already-existing, already-correct firm docs to match a
  later revision of this convention just because the convention changed —
  that's a separate, explicit task (re-verify existing firm, above), not an
  automatic consequence of running this skill for a different firm.
