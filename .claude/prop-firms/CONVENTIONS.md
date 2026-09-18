# Prop-Firm Documentation Conventions

This file is the single source of truth for how every `.claude/prop-firms/<firm>/`
tree is structured. Every firm must follow it exactly — do not invent a new
heading style, table shape, or unconfirmed-flag convention per firm. The
`prop-firm-docs` skill (`.claude/skills/prop-firm-docs/SKILL.md`) enforces this
automatically; this file is what it enforces against.

Read the "Known bug classes" section before writing anything — it names the
specific, recurring ways this kind of documentation goes wrong, not
hypothetical edge cases.

## Directory layout

```text
.claude/prop-firms/<firm-slug>/
    README.md              -- firm overview, rules, plan index, comparison table
    SOURCES.md              -- ledger of every primary source used, by file
    <plan-slug>.md          -- one file per named plan (e.g. rapid.md, pro.md)
    <plan-slug>-live.md     -- live-account file, only if that plan has one
```

- `<firm-slug>` and `<plan-slug>` are lowercase-kebab, matching the engine's own
  naming where one exists (`src/lib/prop-calculator/firms/<firm-slug>/`).
- A live-account stage shared by multiple plans gets ONE file
  (`<shared-name>-live.md`), linked from every plan that transitions into it —
  do not duplicate live-account content per plan (MFF's `rapid-live.md` is the
  precedent: shared by `rapid.md` and `rapid-eod.md`).
- Discontinued/legacy plans are not documented unless the user asks — note
  their existence in `README.md`'s scope note only.

## Required sections, in this exact order, per `<plan-slug>.md`

1. `# <Plan Name> (<Size>)` — title.
2. Metadata block, three lines:
    - `**Source:**` (or `**Sources:**` if more than one) — exact URL(s).
    - `**Last Verified:**` — the date this file was last checked against a live
      or pasted primary source (not the date it was merely edited).
    - `**Last Updated:**` — the date this file's content last changed.
3. `## Overview` — 1–2 paragraphs, no numbers that aren't repeated (and
   sourced) elsewhere in the file.
4. `## Evaluation` — a table. Use this fixed row set, in this order, omitting
   only rows that are genuinely inapplicable (never omit a row because the
   value is unconfirmed — write "Unconfirmed" as the value instead, and repeat
   it in the Unconfirmed section):
   `Starting Balance, Profit Target, Drawdown Type, Drawdown Amount, Minimum
Balance at Start, Daily Loss Limit, Max Contracts, Consistency Rule,
Minimum Trading Days, News Trading, Inactivity Rule, One-Time Eval Fee,
Reset Fee`.
5. `## Sim Funded` (or `## Funded`, matching the firm's own terminology) — a
   table with this fixed row set:
   `Starting Balance, Drawdown Type, Drawdown Amount, Drawdown Lock (see
below), Minimum Balance (ongoing), Daily Loss Limit, Max Contracts,
Consistency Rule, News Trading, Inactivity Rule, Max Active/Concurrent
Accounts, Profit Split`.
6. `## How the Drawdown Works` — mechanical prose, plus exactly one
   `### Worked Example`. Both must follow the Drawdown Lock Rule and the
   Worked-Example Rule below, without exception.
7. `## Payouts` — a table with this fixed row set:
   `Profit Split, Payout Frequency, Buffer Requirement, Minimum Payout
Request, Max Payout per Cycle, Consistency on Payouts, Maximum Total
Payouts / Lifetime Cap`.
8. `## Live Transition` — triggers, and a link to the shared live file if one
   exists. Omit only if the plan has no live stage at all (state that
   explicitly, don't just leave the section out silently).
9. `## Not Confirmed By This Source` — mandatory, even when empty. If
   empty, write literally "None — every figure in this file traces to the
   cited source(s)." Otherwise, one bullet per unconfirmed item: the field
   name, why it's unconfirmed (not in the cited source / contradicts it /
   sourced from a different, uncited page), and what NOT to assume.
10. Footer: `**Sources:**` bullet list — exact URL, and the update-date the
    source article itself states (not today's date).

`README.md` follows the same metadata block, then: `## Overview`, `## Plans`
(one bullet per plan, linking to its file), `## Live Accounts` (if
applicable), `## Firm-Wide Rules` (only rules confirmed for _every_ documented
plan — if a rule holds for some plans and not others, it belongs in each
plan's own file, not here), `## Key Cross-Plan Differences` (one comparison
table, columns = plans, rows = the same canonical parameter names used across
plan files so a reader can trace a row back to its source table), and a
closing `## Documentation Scope` note listing anything deliberately not
covered and why.

## Known bug classes — check for these explicitly, every time

These are not hypothetical edge cases — each is a specific, recurring failure
mode of this kind of documentation task, not a generic "be careful" reminder.
Check every draft against all of them, every time.

### 1. Lock-trigger / locked-value conflation

A drawdown floor that trails and then locks has **two distinct numbers**: the
profit level that makes it stop trailing (the trigger), and the absolute
dollar value it locks at (the locked value). These are almost never the same
number, and a source article may state either one, or both, using ambiguous
language ("locks at $X" can mean either one depending on context).

**Rule:** never write a single "locks at $X" value without stating BOTH
pieces explicitly:

```text
| Drawdown Lock | Trigger: <stop-trailing point, in source language>
                  Locked value: <absolute locked floor, in source language> |
```

If the source states the locked value as a literal dollar figure (e.g. "the
MLL locks at $100"), and the plan's own account starts at a non-zero nominal
balance, do not silently convert one to the other — quote what the source
says, and if two of the firm's own articles express the *same underlying
mechanic* in different units (one in $0-based profit terms, one in
full-nominal-balance terms), say so explicitly rather than picking one and
treating the other as wrong.

### 2. Mixed starting-balance conventions inside one worked example

A worked example either (a) tracks the account's real, literal balance
(usually starting at $0 for a sim-funded stage), or (b) tracks a
nominal-balance-plus-profit convention (e.g., "$50,000 + profit"). Both are
legitimate choices, but a single worked example must declare which one it
uses, as its first sentence, and never switch mid-example. The failure shape
to watch for: an example silently switches from a nominal-plus-profit framing
in early steps to a literal-$0-based figure in a later "locks at $X" step (or
vice versa), producing an internally-inconsistent number that looks plausible
at a glance.

**Rule:** every `### Worked Example` opens with one sentence stating the
convention, e.g. "Starting Rapid EOD Sim Funded at $0 (matching the source's
own 'Initial Balance: $0')." — and every subsequent number in that example is
computed under that same convention, checked by re-deriving the final number
from the first, by hand, before the example is considered done.

### 3. Assumed cross-plan / cross-firm carryover

A fact that is true for Plan A (e.g., Builder's "only one sim-funded account
at a time") must never be written into Plan B's file without its own
citation, even if the two plans look similar. Check every claim against
_that specific plan's own cited source_ — not against a sibling plan's
already-written file, and not against what "seems consistent." (The failure
shape to watch for: Plan B's file states Plan A's restriction as if it were
Plan B's own rule, just because the two plans look similar.)

### 4. Silent scope inflation in the README's firm-wide section

A rule belongs in `README.md`'s `## Firm-Wide Rules` only if it is confirmed,
independently, for every plan documented in that firm's tree. If it's
confirmed for some and merely assumed for others, it is a per-plan fact, not
a firm-wide one — move it to each plan's own file (with its own confirmed/
unconfirmed status) instead of asserting it once at the firm level.

## The Unconfirmed-flag format

Always the same three-part shape, inside the `## Not Confirmed By This
Source` section — never an inline bolded aside buried in a table cell. A mix
of inline caveats in some files and a dedicated section in others is exactly
the kind of inconsistency this convention exists to prevent.

```text
- **<Field name>** — <why unconfirmed: not stated in the cited source(s) /
  stated only in a different, uncited source / contradicts another cited
  source>. Do not assume <the specific wrong inference to avoid>.
```

## Verification protocol (mandatory, every firm, every plan file)

1. Extract the primary source(s) to plain text first (strip markup, keep
   every number verbatim). Never work from a paraphrase, a prior summary, or
   memory of what a source "probably" says — always the literal text.
2. Every dollar figure, percentage, day-count, or contract-count in the draft
   must trace to an exact phrase in that plain text. If it doesn't, it goes
   in `## Not Confirmed By This Source` — it does not get written as fact and
   it does not get silently dropped.
3. Cross-check against the simulator engine, if the firm/plan is already
   modeled (`src/lib/prop-calculator/firms/<firm-slug>/*.ts`). A mismatch
   between the doc and the engine is not automatically a doc error or an
   engine error — check which one has a live-source citation backing it, and
   flag the other side if it's the one without one. Never silently make the
   doc match the engine or vice versa without knowing which is actually
   correct.
4. Run every "Known bug classes" check explicitly on every drawdown-lock
   table row, every worked example, and the README's firm-wide section,
   before considering a file done.
5. A second, independent pass (a fresh agent with no memory of drafting the
   file) re-reads the finished draft against the raw source text and tries to
   find one figure that isn't literally supported. This step is mandatory,
   not optional — a single drafting pass cannot be trusted to self-certify
   its own accuracy on data this consequential. See
   `.claude/skills/prop-firm-docs/SKILL.md` for how this is wired as an
   adversarial verification stage.
