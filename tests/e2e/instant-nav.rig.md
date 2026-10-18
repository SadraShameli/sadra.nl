# instant-nav rig: sadra.nl

- BUILD: `EXPOSE_TESTING_API=1 bun run build`, then `bunx next start -p 3000`. The testing API is compiled in only when `EXPOSE_TESTING_API=1` is set during the build.
- URL: `http://localhost:3000`. It must match `NEXT_PUBLIC_SERVER_URL`, the only origin better-auth trusts, or the API sign-in returns 403 `INVALID_ORIGIN`. Stop `next dev` first; it holds the same port.
- TEST: `PLAYWRIGHT_NO_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 E2E_ROOT_EMAIL=... E2E_ROOT_PASSWORD=... bunx playwright test tests/e2e/instant`
- CONTEXT: root routes sign in through `tests/e2e/support/rootSession.ts`, a POST to `/api/auth/sign-in/email` on the page's request context, so no session file is written. Use a root account on the database the server runs against; locally that is the docker-compose Postgres with `DATABASE_URL` pointing at `localhost:5432`.
- DRIFT: an empty local database still renders the accounting dashboard's Run controls card, so the markers do not depend on seeded data.
- LIMITS: better-auth limits email sign-in to a few attempts per 10 seconds in production builds; back-to-back reruns fail the sign-in with 429. Wait 10 seconds between runs.
- KNOWN: after an initial-load `instant()` releases, this app keeps the Suspense fallback until the next navigation, on every route checked. The specs reload before asserting the completed UI.
- LIVENESS: n/a; local build and start.
