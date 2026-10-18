# UX and Next 16 plan (2026-10-15)

Rules: every writer works in its own git worktree under `/tmp/wt-<name>` with a disjoint file set, merges back as a patch (`git diff --binary` plus untracked files, `git apply --3way`), and the main session commits each package once its gates pass. No writer edits the main checkout.

## Step 0: land what is in the tree

- Wait for the Next 16 agent's build to finish.
- In the main checkout: `bun run fix`, `bun run check`, full suite on the PC (`pcvitest`) plus `OverviewView.dom.test.tsx` on the Mac; fix every failure.
- Commit in logical commits (setup checklist table, layout shift and loading, shimmer, profile tabs and panels, filter toolbars, clear filters, resume privacy, skillsource rule, docker naming done, Next 16 features, dashes guard done) and push.

## Step 1: parallel packages (worktrees, disjoint files)

- P1 correctness (audit items): catch-to-notFound only on NOT_FOUND with `unstable_rethrow` (accounting runs/[id], lifting workouts/[id], programs/[slug], exercises/[slug]); `ensureUserHasPlan` split into a read and an action; JSON-LD escaping; instrumentation files into `src/`; `global-error.tsx`; typecheck script runs `next typegen` first; sign-out reload (done).
- P2 caching and routing: official lifting catalog (programs, exercises) cached with `'use cache'` + `cacheLife` + `cacheTag` and `generateStaticParams`, so the program and exercise detail headers (category, days per week, weeks, name, description) render in the static shell with no loading state; trading actions call `refresh()`; public IoT reads cached with tags; `'use cache: private'` for the navbar session read; `instant` on tool and section layouts; `ensureStatic` on public pages; per-link prefetch on account and run rows; `proxy` export rename; `PageProps`/`LayoutProps`/`RouteContext` types.
- P3 components and tooling: hero image `preload`; `catchError` per panel (accounting dashboard, statement card, lifting analytics); `useLinkStatus` pending state in subnav links; `useOptimistic` for plan reorder and active toggle; pause videos and terminate workers on hidden routes (Activity); unsaved-changes guard with Link `onNavigate` (AccountForm, PlanEditor); Open Graph image and app icons; dev `logging.browserToTerminal`; video `preload="none"` + poster; Rust React Compiler trial.
- P4 cleanups: rename ResultTables `FilterField` (form field helper) to what it is; one duration bucket definition for HistoryView and WorkoutsManager; one PR filter state hook for TodayHero and ExerciseDetail.

## Step 2: visual design pass (after Step 1 is merged)

- Worktree with all changes, dev server on port 3100 against the local compose database, a temporary local account with sample data (prop accounts, lifting workouts and goals, journal entries), headless screenshots of every page at 1440 and 390 px.
- Redesign every page that falls below the program-detail standard (week segmented control, day cards with aligned rows), split by area across worktree agents with disjoint files; then re-screenshot and fix.
- Delete the temporary local account afterwards.

## Step 3: close

- Full gates and suite, commit per package, push, preview check.
