# GrantHunter

GrantHunter is a Next.js App Router MVP for helping nonprofits find and rank grant opportunities. The repo currently supports a basic local workflow around creating organizations, inserting opportunity records, and scoring simple matches in PostgreSQL-backed API routes. The longer-term direction in this codebase is still grant discovery first, but the active end-to-end runtime is not yet the agent-first discovery pipeline.

## Current Status

- What works now:
  - `GET`/`POST /api/organizations` reads and writes organizations in the Prisma-backed `"Organization"` table.
  - `GET`/`POST /api/opportunities` reads and writes opportunities in the Prisma-backed `"Opportunity"` table.
  - `GET /api/match?orgId=...` computes flat scored matches on demand from `"Organization"` and `"Opportunity"` rows.
  - `/discover` lets you select an organization, create an organization, seed three sample opportunities, and view ranked matches.
  - `/api/health` verifies DB connectivity through Prisma.
- What is in transition:
  - The repo includes a newer SQL schema for `organization_profiles`, `opportunities`, `opportunity_matches`, `discovery_runs`, and related tables.
  - The repo also includes a live/mock TinyFish discovery library in `src/lib/mock-discovery.ts`.
  - Those newer discovery pieces are not the active runtime path today.
- What is not yet complete:
  - `POST /api/discovery/run` is present but returns `410 Gone`.
  - The UI still promotes `"Seed 3 Opportunities"` instead of `"Run Discovery"`.
  - The richer SQL schema and the current app routes are not aligned to the same tables or response shapes.

## Current User-Visible Workflow

This is the current real flow in the repo today, not the intended future discovery-first loop:

1. Select an organization in `/discover`.
2. Create an organization if needed.
3. Click the current seed/demo action to insert sample opportunities.
4. Fetch flat matches from `/api/match`.
5. Review ranked results in the table.

## Core Product Loop

Implemented now:

1. Select an organization in `/discover`.
2. Create an organization if needed.
3. Insert sample opportunities through the UI seed button.
4. Fetch flat scored matches from `/api/match`.
5. Review ranked results in the table.

Partially implemented / intended next loop:

1. Select organization.
2. Run discovery.
3. Normalize and save opportunities.
4. Score matches.
5. Review ranked results.

That second loop is the target direction reflected in `src/lib/mock-discovery.ts` and `sql/001_init.sql`, but it is not wired through the active UI/API flow yet.

## Near-Term Canonical Direction

The repo currently has two competing data-model directions:

- the active runtime path built around Prisma-style `"Organization"` / `"Opportunity"` tables plus `pg` route handlers
- the broader discovery-first SQL schema built around `organization_profiles`, `opportunities`, `opportunity_matches`, and `discovery_runs`

Near-term contributors should not try to advance both at once.

The practical near-term goal is to keep one clearly named runtime path stable long enough to restore `POST /api/discovery/run` and make discovery work end-to-end again. After that, the repo can either:

- fully commit to the current runtime table family, or
- perform an explicit migration to the broader discovery-first schema

Until that decision is made, avoid half-mixing Prisma-style `"Organization"` / `"Opportunity"` work with `organization_profiles` / `opportunity_matches` work in the same feature unless the migration itself is the task.

## Current Architecture

### Frontend

- `src/app/page.tsx`
  - marketing-style landing page
- `src/app/discover/page.tsx`
  - primary workflow page
  - loads organizations with `fetchOrganizations()`
  - loads matches with `fetchMatches()`
  - creates organizations directly via `POST /api/organizations`
  - seeds demo opportunities directly via `POST /api/opportunities`

### API routes

- `src/app/api/organizations/route.ts`
  - active `pg` route against Prisma table `"Organization"`
- `src/app/api/opportunities/route.ts`
  - active `pg` route against Prisma table `"Opportunity"`
- `src/app/api/match/route.ts`
  - active scoring route
  - reads `"Organization"` and `"Opportunity"`
  - returns a flat array of `{ opportunityId, title, score, reasons }`
- `src/app/api/health/route.ts`
  - active Prisma connectivity check
- `src/app/api/logs/route.ts`
  - exposes in-memory log entries from `src/lib/logStore.ts`
- `src/app/api/discovery/run/route.ts`
  - explicitly quarantined
  - returns `410`
- `src/app/api/opportunity-matches/stage/route.ts`
  - explicitly quarantined
  - returns `410`

### DB access layer

- `src/lib/pg.ts`
  - active shared `pg` pool helper for current app routes
- `src/lib/db.ts`
  - Prisma client helper
  - currently used by `/api/health`
- `src/lib/postgres.ts`
  - extra `pg` pool singleton
  - appears stale/inactive

### Scoring / matching

- `src/lib/scoring.ts`
  - active heuristic scorer used by `/api/match`
  - supports a richer scorable shape than the current route supplies
- `src/lib/api.ts`
  - frontend fetch helpers
  - `Match` type is the current UI contract
- `src/lib/match.ts`
  - older simpler scoring helper
  - not used by the active routes

### Discovery / agent integration

- `src/lib/mock-discovery.ts`
  - contains the current TinyFish integration and mock fallback logic
  - can run live TinyFish source scans when env vars are set
  - returns normalized opportunities
  - is not called by the active API flow because `/api/discovery/run` is quarantined

### Seed / demo path

- The real user-visible workflow today is still demo-oriented:
  - create organization
  - click `Seed 3 Opportunities`
  - view computed matches

### Important repo structure

```text
src/
  app/
    api/
      discovery/run/route.ts
      health/route.ts
      logs/route.ts
      match/route.ts
      opportunity-matches/stage/route.ts
      opportunities/route.ts
      organizations/route.ts
    discover/page.tsx
    page.tsx
  lib/
    api.ts
    db.ts
    ensure-array.ts
    logStore.ts
    match.ts
    mock-discovery.ts
    pg.ts
    postgres.ts
    scoring.ts
  types/
    api.ts
    db.ts
    normalized.ts
    opportunity.ts
    organization.ts
prisma/
  schema.prisma
sql/
  001_init.sql
  002_seed_organizations.sql
```

## Key Routes / Endpoints

### App routes

- `/`
  - landing page
  - stable
- `/discover`
  - main working UI for current MVP
  - transitional
  - stable enough for create/select/seed/match review, but not aligned to the intended discovery loop

### API routes

- `GET /api/organizations`
  - list organizations from `"Organization"`
  - stable
- `POST /api/organizations`
  - create organization in `"Organization"`
  - stable
- `GET /api/opportunities`
  - list opportunities from `"Opportunity"`
  - stable
- `POST /api/opportunities`
  - insert opportunity rows used by the current seed/demo flow
  - transitional
- `GET /api/match?orgId=...`
  - score all current `"Opportunity"` rows against one organization and return a flat match array
  - transitional
- `GET /api/health`
  - Prisma DB health check
  - stable
- `GET /api/logs`
  - read in-memory TinyFish/discovery logs
  - transitional
- `DELETE /api/logs`
  - clear in-memory logs
  - transitional
- `POST /api/discovery/run`
  - intended discovery entrypoint
  - currently returns `410`
  - planned/incomplete
- `PATCH /api/opportunity-matches/stage`
  - intended richer match pipeline endpoint
  - currently returns `410`
  - planned/incomplete

## Data Model Overview

The repo is currently in a hybrid state with two competing models.

### Active runtime model

Defined by `prisma/schema.prisma` and the active routes:

- `"Organization"`
  - `id`
  - `name`
  - `entityType`
  - `mission`
  - `geographies`
  - `focusAreas`
  - `taxStatus`
- `"Opportunity"`
  - `id`
  - `title`
  - `description`
  - `agency`
  - `geographies`
  - `focusAreas`
  - `amount`
  - `deadline`
  - `createdAt`

The current `/api/match` route does not persist match rows. It computes them on request.

### Broader SQL model present in repo but not active end-to-end

Defined by `sql/001_init.sql` and related types:

- `organization_profiles`
- `source_configs`
- `discovery_runs`
- `opportunities`
- `discovery_run_results`
- `opportunity_matches`

This broader schema is closer to the intended discovery-first architecture, but the active UI and routes are not currently using it.

## Match/Scoring Shape

The UI should currently target the flat match response returned by `GET /api/match`:

```ts
type Match = {
  opportunityId: string;
  title: string;
  score: number;
  reasons?: string[];
};
```

Current reality:

- `src/lib/api.ts` defines this flat `Match` type.
- `src/app/discover/page.tsx` renders this flat shape directly.
- `src/app/api/match/route.ts` returns exactly this flat shape.

Possible future direction:

- The SQL schema and `src/types/db.ts` imply a richer nested model with canonical `opportunity` records plus persisted `opportunity_matches`.
- That richer shape is not the current UI contract.

Contributor rule: keep the UI aligned to the flat response unless you intentionally update the route, fetch helper types, and consuming components together.

## Discovery / Agent Integration

Current state:

- TinyFish is integrated in `src/lib/mock-discovery.ts`.
- The library supports:
  - live TinyFish runs against Grants.gov, WV State Grants, and NEA
  - mock fallback opportunities when live mode is off or unavailable
  - normalization into `NormalizedOpportunity`
  - deduping by `dedupeKey`
- The active app does not currently call this library in the main user flow.

What is real today:

- The discovery/agent code exists.
- The route that should expose it, `POST /api/discovery/run`, is deliberately disabled with `410`.
- The visible UX still uses manual demo inserts through `POST /api/opportunities`.

Intended production path:

- Restore a working `/api/discovery/run`.
- Use agent-driven discovery as the main ingestion path.
- Normalize and persist discovered opportunities.
- Score and return matches against saved opportunity data.

How this differs from the old seed-based flow:

- Old/current UI flow: insert three hard-coded sample opportunities.
- Intended flow: run source discovery, normalize/save, then score.

## Local Development

### Install

```bash
npm install
```

### Required env vars

There is no `.env.example` in the repo right now. The code references these variables:

```env
DATABASE_URL=...
GRANTFISH_USE_LIVE_TINYFISH=false
TINYFISH_API_KEY=
TINYFISH_BASE_URL=https://agent.tinyfish.ai
```

Notes:

- `DATABASE_URL` is required.
- `TINYFISH_API_KEY` is only needed if you intentionally re-enable live TinyFish discovery.
- `GRANTFISH_USE_LIVE_TINYFISH` is only meaningful for `src/lib/mock-discovery.ts`, which is not in the active request path today.
- Creating a `.env.example` is a high-value cleanup task.
- That file should document only the env vars actually needed by the active runtime and the intended discovery path, not every historical or stale configuration possibility.

### Database setup

For the active runtime path, the app expects the Prisma table names in `prisma/schema.prisma`:

- `"Organization"`
- `"Opportunity"`

The repo does not include a Prisma migration history. It does include `prisma/schema.prisma` and SQL seed data for those Prisma table names in `sql/002_seed_organizations.sql`.

For the broader discovery-first schema, the repo also includes:

```bash
psql "$DATABASE_URL" -f sql/001_init.sql
```

That SQL schema is currently not aligned to the active `/discover` workflow.

### Seed/setup

If you want the current `/discover` page to be immediately usable:

1. Ensure the `"Organization"` and `"Opportunity"` tables exist per `prisma/schema.prisma`.
2. Optionally seed organizations with:

```bash
psql "$DATABASE_URL" -f sql/002_seed_organizations.sql
```

3. Use the UI button to insert three sample opportunities.

### Run the app

```bash
npm run dev
```

Then open `http://localhost:3000` and use `/discover`.

## Known Cleanup / Technical Debt

- Mixed DB architecture:
  - active routes use `pg` against Prisma-model tables
  - `/api/health` uses Prisma
  - broader SQL discovery schema exists separately
- Discovery route is quarantined:
  - `src/app/api/discovery/run/route.ts` returns `410`
  - agent-first discovery is not the active runtime
- UI/backend product-loop mismatch:
  - `/discover` still says `Seed 3 Opportunities`
  - current UX does not reflect the intended discovery-first flow
- Response-shape coordination risk:
  - UI, `src/lib/api.ts`, and `/api/match` currently depend on a flat match payload
  - richer persisted-match types exist elsewhere
- Duplicate DB utilities:
  - `src/lib/pg.ts` and `src/lib/postgres.ts`
- Stale or partially active helper surface:
  - `src/lib/match.ts` is not the active scorer
  - `src/types/api.ts` and `src/types/db.ts` model a broader system than the runtime currently exposes
- Incomplete config/docs surface:
  - no `.env.example`
  - no root `AGENTS.md` existed before this cleanup pass

## Recommended Path Forward

### 1. Align the discover UI to the current flat match contract

- Why it matters:
  - the active route returns a flat match array, and the UI should treat that as the source of truth until the API changes
- Likely files:
  - `src/app/discover/page.tsx`
  - `src/lib/api.ts`
- Done looks like:
  - the UI copy and actions reflect the actual current flow
  - no component assumes richer persisted match records that do not exist yet

### 2. Replace the visible seed-first workflow with a real discovery entry action

- Why it matters:
  - the repo direction is agent-first discovery, but the UI still trains contributors toward demo-only data insertion
- Likely files:
  - `src/app/discover/page.tsx`
  - `src/app/api/discovery/run/route.ts`
  - `src/lib/api.ts`
  - `src/lib/mock-discovery.ts`
- Done looks like:
  - the main button is `Run Discovery`
  - the button calls a working `/api/discovery/run`
  - users can complete the discovery flow without manually seeding sample opportunities

### 3. Stabilize `/api/discovery/run` around one active DB path

- Why it matters:
  - the route currently returns `410`, which blocks the intended product loop
  - continuing with mixed table models will slow every subsequent change
- Likely files:
  - `src/app/api/discovery/run/route.ts`
  - `src/lib/pg.ts`
  - `src/lib/mock-discovery.ts`
  - `prisma/schema.prisma`
  - `sql/001_init.sql`
- Done looks like:
  - the route performs a real request cycle instead of returning `410`
  - the chosen runtime tables are explicit
  - the route reads an org, runs discovery, persists normalized opportunities, and returns a coherent result

### 4. Consolidate shared DB and normalization helpers

- Why it matters:
  - there are duplicate `pg` helpers and a widening gap between route behavior and shared libraries
- Likely files:
  - `src/lib/pg.ts`
  - `src/lib/postgres.ts`
  - `src/lib/ensure-array.ts`
  - any routes still doing local normalization
- Done looks like:
  - one canonical `pg` helper
  - one canonical array normalization helper
  - routes and shared libs import the same helper surface

### 5. Decide how persisted matches fit the runtime and then implement end-to-end

- Why it matters:
  - the current app computes matches on demand, while the broader SQL model expects persisted `opportunity_matches`
- Likely files:
  - `src/app/api/match/route.ts`
  - `src/lib/scoring.ts`
  - `sql/001_init.sql`
  - `src/types/db.ts`
- Done looks like:
  - either on-demand scoring remains the explicit MVP contract, or persisted matches become the active path
  - docs, types, routes, and UI all agree on that choice

### 6. Quarantine or remove stale Prisma-era and half-migrated code

- Why it matters:
  - contributors can currently mistake inactive code for the runtime architecture
- Likely files:
  - `src/lib/db.ts`
  - `src/lib/postgres.ts`
  - `src/lib/match.ts`
  - `src/types/api.ts`
  - any route returning `410`
- Done looks like:
  - stale pieces are either deleted or explicitly marked inactive
  - active runtime paths are obvious from the repo layout

### 7. Only then expand richer opportunity metadata and workflow features

- Why it matters:
  - richer metadata is useful, but it should not land before the discovery/save/score path is coherent
- Likely files:
  - `src/types/normalized.ts`
  - `src/lib/mock-discovery.ts`
  - future route/UI surfaces
- Done looks like:
  - extra metadata improves real ranking/review behavior without introducing another response-shape split

## Product Direction

Future direction, not current implementation:

- Keep the MVP focused on grant discovery, normalization, scoring, and review for nonprofits.
- If the grant workflow becomes stable, the broader opportunity model in `sql/001_init.sql` could later expand into RFPs, jobs, gigs, or other funding/opportunity types.

## Guardrails for Contributors

- Do not invent response shapes that are not returned by the active route files.
- Keep README and AGENTS aligned with the code, not with older plans.
- Prefer the agent-first discovery direction over manual fake seeding when moving the product forward.
- Do not add another DB helper if an existing shared helper can be consolidated instead.
- Do not treat stale Prisma- or SQL-model code as active runtime without verifying the route call path.
- Do not assume the broader SQL discovery schema is already wired just because the tables and types exist.
