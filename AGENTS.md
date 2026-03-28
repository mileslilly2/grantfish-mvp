# AGENTS.md

## Mission

GrantHunter is trying to become a practical grant discovery, normalization, scoring, and review tool for nonprofits. The repo is not there end-to-end yet; the immediate job is to align the active UI, route handlers, types, and database helpers so the discovery-first path can replace the current demo seeding loop cleanly.

## Current Reality of the Codebase

- Active architecture:
  - Next.js App Router frontend
  - route handlers in `src/app/api`
  - PostgreSQL access through `pg` in the main CRUD/match routes
  - Prisma still present and currently used by `/api/health`
- Transitional:
  - `src/lib/mock-discovery.ts` contains a real TinyFish + mock discovery pipeline
  - `sql/001_init.sql` defines a broader discovery-first schema
  - `/api/discovery/run` exists but is intentionally disabled
- Stale or inactive:
  - `src/lib/postgres.ts` appears to be an extra unused pool helper
  - `src/lib/match.ts` is not the scorer used by the active route
  - parts of `src/types/api.ts` and `src/types/db.ts` describe a broader system than the UI currently runs
- Do not assume:
  - that the SQL discovery schema is the active runtime
  - that persisted matches exist in the current user flow
  - that TinyFish discovery is wired to the visible `/discover` experience

## Source of Truth

Trust these first:

- actual route files in `src/app/api`
- actual UI behavior in `src/app/discover/page.tsx`
- actual shared helpers imported by those routes
- `prisma/schema.prisma` for the current `"Organization"` / `"Opportunity"` tables
- `src/lib/pg.ts` for the current route-level `pg` access path

Treat these as secondary or transitional until verified in the call path:

- `sql/001_init.sql`
- `src/lib/mock-discovery.ts`
- `src/types/api.ts`
- `src/types/db.ts`
- `src/lib/db.ts`

Do not trust:

- older README claims
- dormant helper files that are not imported
- half-migrated types that imply routes or tables the UI does not actually call

## Preferred First Files to Inspect

- `src/app/discover/page.tsx`
  - current user-visible workflow and copy
- `src/lib/api.ts`
  - frontend fetch helpers and flat match contract
- `src/app/api/match/route.ts`
  - current match payload and scoring entrypoint
- `src/app/api/organizations/route.ts`
  - active organization CRUD path
- `src/app/api/opportunities/route.ts`
  - active opportunity CRUD and seed/demo path
- `src/lib/pg.ts`
  - current shared `pg` runtime helper
- `src/lib/scoring.ts`
  - active scoring logic
- `src/app/api/discovery/run/route.ts`
  - current discovery status and quarantine behavior
- `src/lib/mock-discovery.ts`
  - TinyFish/mock discovery implementation that is present but not yet wired through
- `prisma/schema.prisma`
  - current app table model for `"Organization"` and `"Opportunity"`

## Important Files and Responsibilities

- `src/app/discover/page.tsx`
  - primary discovery/match UI
  - currently create/select/seed/review, not discovery-first
- `src/lib/api.ts`
  - frontend fetch helpers and current flat `Match` type
- `src/app/api/organizations/route.ts`
  - active organization CRUD surface against `"Organization"`
- `src/app/api/opportunities/route.ts`
  - active opportunity CRUD surface against `"Opportunity"`
- `src/app/api/match/route.ts`
  - active flat scoring response
- `src/app/api/discovery/run/route.ts`
  - intended discovery entrypoint
  - currently quarantined with `410`
- `src/app/api/opportunity-matches/stage/route.ts`
  - intended richer match pipeline surface
  - currently quarantined with `410`
- `src/lib/pg.ts`
  - canonical `pg` pool for active routes today
- `src/lib/ensure-array.ts`
  - canonical array normalization helper today
- `src/lib/scoring.ts`
  - active scoring logic used by `/api/match`
- `src/lib/mock-discovery.ts`
  - TinyFish integration, mock fallback, normalization, dedupe
  - not currently in the active request path
- `src/lib/db.ts`
  - Prisma client helper
  - active only for `/api/health` right now
- `src/lib/postgres.ts`
  - extra `pg` singleton
  - likely stale unless reactivated intentionally
- `prisma/schema.prisma`
  - current app table model for `"Organization"` and `"Opportunity"`
- `sql/001_init.sql`
  - broader discovery-first schema, not active end-to-end
- `sql/002_seed_organizations.sql`
  - seeds Prisma-style `"Organization"` rows for the current demo flow

## Working Rules for Agents

- Do not rename files unless explicitly requested.
- Prefer modifying existing files in place.
- Do not create new files for small changes unless truly required.
- Avoid splitting small related logic across multiple new files.
- Do not introduce a new helper if one canonical shared helper should be extracted instead.
- Do not silently expand response shapes; update UI, fetch helpers, and routes together.
- Do not treat mock/demo flows as the desired production architecture.
- Do not treat stale Prisma runtime code as the main path unless the task explicitly reactivates it.
- Keep the current flat match shape unless you are doing a coordinated route + type + UI upgrade.
- When changing data flow, update both `src/lib/api.ts` and the consuming UI in `src/app/discover/page.tsx`.
- Keep docs, route outputs, fetch helper types, and UI render logic aligned together.
- Do not propose "next steps" until the current requested step is working.
- When possible, finish the current alignment task before expanding scope.
- When touching DB access, verify which table family you are operating on:
  - Prisma model tables: `"Organization"`, `"Opportunity"`
  - broader SQL tables: `organization_profiles`, `opportunities`, `opportunity_matches`, `discovery_runs`
- Do not mix those two table families in one feature without making the migration path explicit.
- If a route returns `410`, do not document it as working.

## Documentation Rules

- Keep `README.md` and `AGENTS.md` in sync with the actual route files and current UI.
- Mark planned work as planned.
- Mark quarantined code as quarantined.
- Do not describe the agent-first architecture as already shipping if the route is still disabled.
- If the repo stays hybrid, say that plainly.

## Recommended Work Order

### 1. UI/API alignment

- Goal:
  - make the visible `/discover` flow accurately reflect the current API contract
- Files likely touched:
  - `src/app/discover/page.tsx`
  - `src/lib/api.ts`
  - `src/app/api/match/route.ts`
- Anti-patterns to avoid:
  - adding nested match objects without updating the table render
  - leaving UI copy that promises discovery when the button still seeds demo rows
- Completion criteria:
  - the UI labels, actions, and rendered types match the actual route outputs

### 2. Shared DB / normalization extraction

- Goal:
  - collapse duplicate DB and normalization utilities into one obvious shared path
- Files likely touched:
  - `src/lib/pg.ts`
  - `src/lib/postgres.ts`
  - `src/lib/ensure-array.ts`
  - active route handlers
- Anti-patterns to avoid:
  - adding a third pool helper
  - duplicating local array parsing in routes
- Completion criteria:
  - one canonical `pg` helper remains for active routes
  - routes consistently import the same normalization utilities

### 3. Discovery route stabilization

- Goal:
  - replace the `410` placeholder in `/api/discovery/run` with a real discovery execution path
- Files likely touched:
  - `src/app/api/discovery/run/route.ts`
  - `src/lib/mock-discovery.ts`
  - `src/lib/pg.ts`
  - one chosen schema surface
- Anti-patterns to avoid:
  - documenting discovery as live before the route actually runs
  - bolting discovery onto the app while leaving table ownership ambiguous
- Completion criteria:
  - a user action can hit `/api/discovery/run`
  - the route loads an organization, runs discovery, and returns a coherent response

### 4. End-to-end save + score loop

- Goal:
  - make discovery results persist and feed scoring in the same runtime path
- Files likely touched:
  - `src/app/api/discovery/run/route.ts`
  - `src/app/api/match/route.ts`
  - `src/lib/scoring.ts`
  - whichever schema is chosen as canonical
- Anti-patterns to avoid:
  - computing one shape in discovery and a different undocumented shape in match retrieval
  - saving data into a table family the UI never reads
- Completion criteria:
  - select org
  - run discovery
  - normalized results are saved
  - matches can be fetched and rendered coherently

### 5. Removal / quarantine of stale code

- Goal:
  - reduce ambiguity about what is active versus merely present
- Files likely touched:
  - `src/lib/postgres.ts`
  - `src/lib/match.ts`
  - `src/lib/db.ts`
  - `src/types/api.ts`
  - routes returning `410`
- Anti-patterns to avoid:
  - leaving inactive code looking production-ready
  - keeping multiple competing implementations with no ownership
- Completion criteria:
  - stale code is either deleted or explicitly marked inactive
  - active runtime paths are easy to identify

### 6. Only then richer metadata and UI improvements

- Goal:
  - expand opportunity detail and match-review UX after the runtime path is coherent
- Files likely touched:
  - `src/types/normalized.ts`
  - `src/lib/mock-discovery.ts`
  - `src/app/discover/page.tsx`
- Anti-patterns to avoid:
  - adding metadata fields that no route persists or renders
  - building richer UI on top of unstable route contracts
- Completion criteria:
  - new metadata improves real filtering, ranking, or review behavior without creating another schema split

## Safe Change Patterns

- Replace direct component fetch logic with shared helpers in `src/lib/api.ts`.
- Move repeated parsing or normalization into `src/lib/ensure-array.ts` rather than copying it into routes.
- Update route types and render logic together when changing payloads.
- Change labels and workflow copy so the UI describes the actual product loop.
- Use `src/lib/scoring.ts` as the scoring source when adjusting match behavior for the active route.

## Dangerous Change Patterns

- Adding another DB helper without removing or consolidating the old ones.
- Mixing Prisma and raw `pg` runtime paths silently in the same feature.
- Expanding the match payload without updating `src/lib/api.ts` and `/discover`.
- Reintroducing seed/demo terminology into the primary UX after switching to discovery.
- Writing docs that treat quarantined routes as working.
- Writing new code against `organization_profiles` while the UI still reads `"Organization"` unless the migration path is part of the task.

## Definition of Done for the MVP Direction

The next good state for this repo is:

- a user can select or create an organization
- the user can run discovery instead of seeding fake opportunities
- discovery results are normalized and saved through one clear DB path
- matches are fetched and rendered coherently from that same path
- fetch helpers, UI types, route outputs, and docs agree
- stale helpers and stale table paths are clearly quarantined or removed
