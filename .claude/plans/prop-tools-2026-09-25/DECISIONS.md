# Prop tools: page split, portfolio manager, sizing suggester (decisions)

Requested 2026-09-25. The user asked for the work to run without stopping overnight; questions were asked up front and answered here.

## The request (verbatim, two messages)

1. "add prop firm portfolio overview, manager and risk or rung size suggestor per firm and account size. so i can add many accounts, chose prop firm, plan, what account size, if there are any other rules like less dll and everything (based on the already existing prop rules). then the tool shows many overview and important details. like what my total funding it. what ever you can think of and is in ur imagination. i can also add balances per account. then the tool will tell me the most optimal rung size or risk per trade etc. according to the youtube captiions i havbe been giving you. ... this is a lot of work. plan this accordingly and properly. read claude.md rules. use /ecc skills and agents"
2. "the current prop firm calculator tool page has become so massive. i think we have tosplit it apart and make it more children paged inside that. so we can add these new tools there too. so plan that too. again using the rules i gave. no stopping."

## Decisions (user, 2026-09-25)

| # | Topic | Decision |
|---|---|---|
| P1 | Storage of accounts and balances | In the database under the user's account: sign-in required for the portfolio pages, synced across devices, built like the accounting subsystem (userId-scoped tRPC + Drizzle, schema via drizzle-kit generate/migrate). The calculator tools stay public. |
| P2 | What the sizing suggester shows | Both, the user's documented rule first: the rule from the captions (prop-firm-trading skill) as the headline, with the engine optimum (DP / ladder search) alongside and the reason they differ. |
| P3 | Page structure | Hub + child pages: `/prop-calculator` becomes a hub; each tool gets its own child page (for example simulator, compare, ladder lab, strategy lab, cash flow, and the new portfolio manager), sharing inputs through URL or shared state; old share links keep working through redirects. |
| P4 | Per-account inputs | Balance plus key extras: current balance, highest end-of-day balance (trailing drawdowns), stage (eval / funded / live), payouts taken and trading days; missing values default and are shown as assumptions. |

## Standing rules

The repo `.claude/CLAUDE.md`, the user's memory rules (no commits by Claude, no em dashes, no code comments, never bun dev/build, no browser automation, Sonnet for doc-updater, Vitest from the repo root), and the ECC pipeline (research, plan, TDD with RED first, review, fix loop). This work must not collide with the prop-engine audit still in flight (`.claude/plans/prop-engine-audit-2026-09-23/PLAN.md`, wave 18 and its wrap-up).

## Scope and tracking directive (user, 2026-09-25)

"and i dont want to be lazy. so build as much features and plan this properly. do track it properly so we dont lose count since it is a lot lot lot lot of work"

So: build every valuable feature that can be grounded in the code and the rules; defer only what is genuinely blocked (missing data or a decision that is the user's). Track every feature as a numbered item with a status in `PLAN.md`, and every work package with its steps in `packages.md`, the same way as the prop-engine audit tracker.
