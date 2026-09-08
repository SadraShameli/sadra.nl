# CLAUDE.md

Mandatory conventions for Claude Code and contributors in this repo. Match them
exactly — they override default behavior. Bias to caution and correctness:
`accounting` handles real financial/tax data behind real provider credentials,
and `prop-calculator` informs real trading decisions with real money on the
line.

## Code style (hard rules)

- **No comments or docstrings.** Ever. Code must read self-explanatory; match
  the style of the file you're in.
- **Domain/class-shaped files use PascalCase** (`AccountState.ts`,
  `TradingFirm.ts`, `FirmComparisonTable.tsx`), even when they export
  functions rather than a class (e.g. `core/DailyLossLimit.ts`,
  `core/PayoutTiers.ts`) — the name describes the concept, not the export
  shape. Utilities, hooks, and route files use camelCase (`useCalculator.ts`,
  `rng.ts`, `stats.ts`).
- **Barrel `index.ts` files re-export a module's public surface** (see
  `lib/prop-calculator/core/index.ts`, `lib/prop-calculator/index.ts`) — add
  new exports there; don't make callers reach into internal files directly.
- **Import via the `~/` alias** (`~/lib/...`, `~/components/...`,
  `~/server/...`), never a relative `../../..` chain across a top-level
  boundary.
- **Never log or return a raw secret/credential value.** Accounting
  credentials only ever exist as ciphertext (`sealSecret`/`openSecret`) or
  inside a `'server-only'` module.

## Typesafety & OOP

- **Enums for fixed sets of identifiers** (`FirmId`, `PlanId`'s per-firm
  `variant` unions) — never bare string literals repeated across files.
  `@typescript-eslint/switch-exhaustiveness-check` is enforced, so adding a
  new enum/union member is safe: the compiler points at every switch that
  needs a new case.
- **Zod schemas at every boundary** — tRPC procedure input/output, form
  validation (`@hookform/resolvers`). Drizzle-inferred row types
  (`typeof table.$inferSelect`) are the source of truth for DB shape; don't
  hand-write a parallel interface for a table row.
- **Prop-calculator's domain model is a real class hierarchy** (`Plan`,
  `TradingFirm`, `DrawdownStrategy` and its subclasses) — new firms/behaviors
  extend it; they don't special-case around it with conditionals.
- **Money is never raw floating-point arithmetic** in the accounting
  subsystem — go through `~/lib/accounting/core/money.ts`'s
  `Eur`/`dinero.js`-backed helpers.

## Working discipline

- **Surgical changes.** Touch only what the task needs; match existing
  patterns even where you'd choose differently.
- **DRY across the whole repo, not just TypeScript** — a duplicated constant
  or duplicated business-logic block (e.g. `TRADING_DAYS_PER_MONTH`, the
  funded-payout-cycle gating logic) gets extracted to one shared location the
  first time you touch the second copy, not after a third makes it obvious.
- When two patterns conflict, pick the more recent/tested one and flag the
  other for cleanup — don't blend them.
- **Fail loud:** never report "done" or "tests pass" if anything was skipped,
  unverified, or assumed. Say what's confirmed vs. not.

## Verification

- `bun run typecheck`, `bun run lint`, `bun run stylelint`, `bun run test`
  (Vitest) are backend-side checks — safe to run freely. `bun run check` /
  `bun run verify` chain all of them plus `knip`.
- **Never run `bun run dev` / `bun run build` / `next dev` / `next build`
  yourself, and never drive the app with a browser automation tool** — the
  user runs their own dev server and verifies UI changes themselves. Verify
  frontend changes by reading and tracing the code.
- **When verifying by tracing (not running) code:** check that any
  library/API call you're relying on actually exists and does what its name
  implies — don't assume from the name.
- **Prop-calculator firm/plan data** (drawdown rules, consistency %, payout
  structure, fees) must be checked against the firm's own live help center
  before being trusted or changed — never against memory, a cached skill doc,
  or a third-party review site. These rules change often (MFF's Aug 2026
  pricing-model switch, Jan 2026 payout-split change) and drive real trading
  decisions.

## Database & accounting invariants (do not weaken)

- **Every credential-keyed query is scoped by `userId` too**, not just the
  credential id — see `loadRuleSet`'s `and(eq(credentialId), eq(userId))` in
  `lib/accounting/rules/load.ts`. A query keyed only on credential id can leak
  another user's data.
- **Deletes and updates always carry a `where` clause** — ESLint enforces
  this (`drizzle/enforce-delete-with-where`, `drizzle/enforce-update-with-where`)
  for `db`/`ctx.db`. Don't work around it.
- **New accounting rules/booking logic are DB-editable seed data**, added to
  `src/server/db/seeds/accounting/rules.ts` and applied via `bun run db:seed`
  — never a one-off raw SQL/DB script.
- **Schema changes go through `drizzle-kit`**: `bun run db:generate` then
  `bun run db:migrate` / `db:push`, never a hand-edited migration or a direct
  `ALTER` outside that flow.
