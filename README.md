# GrantHunter

## 🚀 Demo (Start Here)

1. Go to /discover  
2. Create or select an organization  
3. Click "Run Discovery"  
4. The agent browses real grant websites and returns ranked opportunities  

API option:
POST /api/discovery/run

## 1. Project summary

GrantHunter is a Next.js App Router app for nonprofit grant discovery, persistence, ranking, and review.

This system performs real browser-based tasks using an agent, not just API queries.

The current runtime is discovery-first:

- organizations are stored in `organization_profiles`
- discovery runs are stored in `discovery_runs`
- normalized opportunities are stored in `opportunities`
- org-scoped ranked results are stored in `opportunity_matches`

Discovery is asynchronous. `POST /api/discovery/run` starts a run quickly and returns `202 Accepted` with a `runId`, and the client polls `GET /api/discovery/run?id=...` for status, trace updates, and saved result counts.

When live TinyFish mode is enabled, the app starts upstream TinyFish runs per source, persists those upstream run ids, and later reconciles completed upstream results into saved opportunities and org-specific matches. When live mode is not enabled, the same route falls back to mock discovery and still persists results through the same active SQL path.

This replaces hours of manual grant searching with automated discovery.

## 2. Live demo / app entry

The main app entry is [`/discover`](/home/miles/Documents/grantfish-mvp/src/app/discover/page.tsx).

That page currently supports:

- selecting an organization
- creating a new organization
- starting an async discovery run
- polling and rendering discovery trace/status
- loading saved ranked opportunities for the selected organization
- updating pipeline stage per match
- exporting ranked matches to CSV

No current deployed URL could be verified from active code or non-stale docs. The old Cloud Run URL in the previous README was not treated as current source of truth and is omitted here.

## 3. Current product loop

1. Select an organization on `/discover`.
2. Click `Run Discovery`.
3. The UI calls `POST /api/discovery/run` and receives a `runId`.
4. The UI polls `GET /api/discovery/run?id=...` every ~1.2s for run status and trace updates.
5. As opportunities are saved, the UI reloads ranked matches for that organization.
6. Review saved ranked results, adjust pipeline stage, or export the current result set to CSV.

The visible UI copy and route behavior now match this discovery-first loop. The old seed-first demo path is no longer the primary UX.

## 4. Current architecture

### Frontend

- Next.js 16 App Router
- React 19
- primary workflow page: [`src/app/discover/page.tsx`](/home/miles/Documents/grantfish-mvp/src/app/discover/page.tsx)
- frontend fetch helpers and types: [`src/lib/api.ts`](/home/miles/Documents/grantfish-mvp/src/lib/api.ts)

### API routes

- organizations: [`src/app/api/organizations/route.ts`](/home/miles/Documents/grantfish-mvp/src/app/api/organizations/route.ts)
- opportunities: [`src/app/api/opportunities/route.ts`](/home/miles/Documents/grantfish-mvp/src/app/api/opportunities/route.ts)
- discovery kickoff + polling: [`src/app/api/discovery/run/route.ts`](/home/miles/Documents/grantfish-mvp/src/app/api/discovery/run/route.ts)
- ranked matches: [`src/app/api/match/route.ts`](/home/miles/Documents/grantfish-mvp/src/app/api/match/route.ts)
- match stage updates: [`src/app/api/opportunity-matches/stage/route.ts`](/home/miles/Documents/grantfish-mvp/src/app/api/opportunity-matches/stage/route.ts)
- health: [`src/app/api/health/route.ts`](/home/miles/Documents/grantfish-mvp/src/app/api/health/route.ts)

### Active runtime

- canonical DB helper: [`src/lib/pg.ts`](/home/miles/Documents/grantfish-mvp/src/lib/pg.ts)
- active runtime uses raw `pg` and snake_case SQL tables
- `ensureActiveAppSchema()` auto-creates the active tables on first use
- current matching is persisted and org-scoped through `opportunity_matches`

### Discovery flow

- discovery implementation lives in [`src/lib/mock-discovery.ts`](/home/miles/Documents/grantfish-mvp/src/lib/mock-discovery.ts)
- live mode starts async TinyFish runs with `run-async`
- polling reconciles upstream results with `v1/runs/batch`
- mock mode uses labeled fallback opportunities but still persists them into the active runtime tables

### Prisma status

Prisma still exists in the repo as generated client/schema baggage, but it is not the active runtime path. The current health route also uses raw `pg`, not Prisma. [`prisma/schema.prisma`](/home/miles/Documents/grantfish-mvp/prisma/schema.prisma) still describes older `"Organization"` and `"Opportunity"` models and should be treated as stale relative to the live app path.

## 5. Discovery flow details

### POST kickoff

`POST /api/discovery/run`

- requires `organizationId` or `orgId`
- inserts a row into `discovery_runs`
- appends initial trace entries
- returns `202 Accepted` with:

```json
{
  "runId": "uuid",
  "organizationId": "uuid",
  "status": "running",
  "summary": "Running live discovery"
}
```

Possible returned statuses from kickoff are `running`, `partial`, or `failed`, depending on whether live source starts succeed.

### GET polling

`GET /api/discovery/run?id=<runId>`

- loads the persisted `discovery_runs` row
- for live runs, polls upstream TinyFish run ids when the run is still non-terminal
- updates persisted source state, trace, discovered counts, saved counts, and summary
- returns the serialized run state, including:
  - `status`
  - `mode`
  - `summary`
  - `sourceOutcomes`
  - `trace`
  - `discoveredCount`
  - `savedCount`
  - `opportunityIds`
  - timestamps
  - `isTerminal`

### Persisted run state

The active route persists:

- run status and summary in `discovery_runs`
- per-source state in `discovery_runs.source_states`
- trace entries in `discovery_runs.trace`
- counts in `discovery_runs.discovered_count` and `discovery_runs.saved_count`
- saved opportunity ids in `discovery_runs.opportunity_ids`

### Persisted upstream TinyFish run ids

In live mode, each source start stores:

- `sourceName`
- local status
- `upstreamRunId`
- `upstreamStatus`
- message
- last checked time

Those source states are later re-polled and reconciled during `GET /api/discovery/run?id=...`.

### Partial result saving

The route saves opportunities as sources complete. Live runs do not wait for every upstream source to finish before persisting successful results. A run can end as:

- `completed`
- `partial`
- `failed`

### Org-scoped matching

Each saved opportunity is immediately scored against the selected organization and inserted or updated in `opportunity_matches`. `GET /api/match?orgId=...` then reads those persisted org-specific match rows ordered by score.

## 6. Key routes / endpoints

- `GET /discover`
  - primary UI for org selection, discovery polling, ranked review, stage updates, and CSV export
- `GET /api/organizations`
  - list `organization_profiles`
- `POST /api/organizations`
  - create an `organization_profiles` row
- `GET /api/opportunities`
  - list saved opportunities
- `GET /api/opportunities?orgId=...`
  - list saved opportunities already matched to one organization
- `POST /api/opportunities`
  - manually create one saved opportunity and optionally attach it to an org in `opportunity_matches`
- `POST /api/discovery/run`
  - start an async discovery run and return `202 Accepted` with a run id
- `GET /api/discovery/run?id=...`
  - poll persisted run status and reconcile live upstream results
- `GET /api/match?orgId=...`
  - return ranked persisted matches for one organization
- `PATCH /api/opportunity-matches/stage`
  - update `pipeline_stage` for one org/opportunity match
- `GET /api/health`
  - verify DB connectivity through raw `pg`
- `GET /api/logs`
  - return process-local in-memory logs from `src/lib/logStore.ts`
- `DELETE /api/logs`
  - clear process-local in-memory logs

Outdated `410` documentation has been removed because the current discovery and stage-update routes are implemented and active.

## 7. Data model overview

### Active runtime tables

These are the tables created by [`src/lib/pg.ts`](/home/miles/Documents/grantfish-mvp/src/lib/pg.ts) and used by the live app path:

- `organization_profiles`
  - nonprofit org records used for discovery and scoring
- `opportunities`
  - normalized discovered or manually entered opportunities
- `opportunity_matches`
  - persisted org-scoped scoring, reasons, pipeline stage, notes, and hidden/starred state
- `discovery_runs`
  - persisted async run state, source states, trace, counts, and saved opportunity ids

### Broader SQL schema also present in repo

[`sql/001_init.sql`](/home/miles/Documents/grantfish-mvp/sql/001_init.sql) defines a broader schema that includes:

- `source_configs`
- `discovery_run_results`
- enum types such as `run_status`, `pipeline_stage`, and `source_type`

That file is useful reference, but it is not the exact schema the active runtime bootstraps today. The live app path currently relies on `ensureActiveAppSchema()` in `src/lib/pg.ts`, not on `sql/001_init.sql`.

### Stale Prisma models

[`prisma/schema.prisma`](/home/miles/Documents/grantfish-mvp/prisma/schema.prisma) still defines:

- `"Organization"`
- `"Opportunity"`

Those models do not match the active runtime path and should not be treated as current source of truth for the live app.

[`sql/002_seed_organizations.sql`](/home/miles/Documents/grantfish-mvp/sql/002_seed_organizations.sql) also targets the stale `"Organization"` table family rather than the active `organization_profiles` table.

## 8. Local development

### Install

```bash
npm install
```

### Required environment variables

Confirmed env vars referenced by the current code:

```env
DATABASE_URL=postgres://...
GRANTFISH_USE_LIVE_TINYFISH=false
TINYFISH_API_KEY=
TINYFISH_BASE_URL=https://agent.tinyfish.ai
GRANTFISH_TINYFISH_SOURCE_TIMEOUT_MS=120000
```

Notes:

- `DATABASE_URL` is required.
- live TinyFish mode only turns on when `GRANTFISH_USE_LIVE_TINYFISH` is truthy and `TINYFISH_API_KEY` is present.
- if live mode is off or no API key is present, discovery falls back to mock opportunities.
- `TINYFISH_BASE_URL` defaults to `https://agent.tinyfish.ai`.

### DB / bootstrap setup

For the current app path, you do not need Prisma migrations to get the live tables created. The app bootstraps its active schema through `ensureActiveAppSchema()` on first route use.

That active bootstrap currently creates:

- `organization_profiles`
- `opportunities`
- `opportunity_matches`
- `discovery_runs`

`sql/001_init.sql` is not required to run the current app locally.

`sql/002_seed_organizations.sql` is not aligned with the active runtime and should not be used as the default local bootstrap path unless you are intentionally working on the stale Prisma-era table family.

### Run locally

```bash
npm run dev
```

Then open `http://localhost:3000/discover`.

### Enable live TinyFish mode

Set:

```env
GRANTFISH_USE_LIVE_TINYFISH=true
TINYFISH_API_KEY=...
```

With those set, `POST /api/discovery/run` will attempt live async TinyFish source runs and persist upstream run ids for later polling/reconciliation. Without them, the same route uses mock fallback discovery.

## 9. Known limitations

Only limitations confirmed in code are listed here.

- polling is required for live upstream runs to reconcile delayed TinyFish completions into local saved results
- live run progress is advanced during `GET /api/discovery/run?id=...`, not by a separate worker
- mock fallback execution is launched in-process after kickoff, so it is process-local background work
- `GET /api/logs` exposes process-local in-memory logs from `src/lib/logStore.ts`, not durable shared logging
- the broader SQL reference schema in `sql/001_init.sql` and the stale Prisma schema do not exactly match the active bootstrapped runtime schema

## 10. Contributor guardrails

- do not reintroduce the Prisma-first `"Organization"` / `"Opportunity"` runtime into the live path
- treat `src/app/api/*` routes and `src/lib/pg.ts` as the source of truth for current runtime behavior
- do not treat an upstream long-running TinyFish job as terminal failure just because the local kickoff returned before it finished
- preserve the async discovery contract: `POST` starts quickly, `GET` polls and reconciles
- keep org-scoped persisted matching as the primary ranking path
- update `src/lib/api.ts`, route outputs, and `/discover` together when changing payloads
- keep README and AGENTS instructions aligned with the actual code
- keep the discovery-first path primary; do not reintroduce seed/demo terminology as the main workflow
