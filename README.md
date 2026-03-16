# GrantFish MVP

## Overview

GrantFish is a Next.js + PostgreSQL MVP for discovering and ranking grant opportunities for nonprofit organizations.

The current system is built around a simple workflow:

1. Load a nonprofit organization profile from Postgres.
2. Run a discovery pass against grant sources.
3. Normalize and deduplicate the returned opportunities.
4. Score each opportunity for organizational fit.
5. Store opportunities and organization-specific matches in Postgres.
6. Display ranked results in a minimal dashboard.

In the default local setup, discovery uses mock fallback data. When live mode is enabled, the app calls TinyFish browser automation agents to search real grant sources such as Grants.gov, West Virginia state grants, and the National Endowment for the Arts.

## Features

- Postgres-backed organization, opportunity, run, and match data model
- Discovery API that runs a grant scan for a specific organization profile
- TinyFish-based live browser automation path with mock fallback
- Opportunity normalization and deduplication
- Simple rules-based scoring with fit reasons and confidence score
- Ranked opportunities API for dashboard consumption
- Minimal Next.js App Router UI for triggering scans and viewing results
- Schema designed to expand beyond grants into RFPs, jobs, gigs, and leads

## Architecture

The repository is a small full-stack Next.js application with the backend implemented as App Router API routes and shared library modules.

- Frontend: Next.js App Router pages in `src/app`
- Backend API: route handlers in `src/app/api`
- Persistence: PostgreSQL accessed through `pg`
- Discovery engine: `src/lib/mock-discovery.ts`
- Scoring engine: `src/lib/scoring.ts`
- Types: database, API, normalization, and scoring contracts in `src/types`
- Schema: SQL bootstrap migration in `sql/001_init.sql`

### Main Modules

- `src/app/page.tsx`
  Landing page with a link to the discovery dashboard.
- `src/app/discover/page.tsx`
  Client-side dashboard for running scans and listing matched opportunities.
- `src/app/api/discovery/run/route.ts`
  POST endpoint that loads an organization profile, runs discovery, upserts opportunities, scores matches, and stores results.
- `src/app/api/opportunities/route.ts`
  GET endpoint that returns ranked opportunities for an organization profile.
- `src/app/api/health/route.ts`
  Basic health check that verifies database connectivity.
- `src/lib/mock-discovery.ts`
  Contains the source registry for live grant sources, TinyFish integration, normalization helpers, deduplication, and mock fallback data.
- `src/lib/scoring.ts`
  Applies lightweight heuristic scoring based on mission areas, nonprofit eligibility, and geography.
- `src/lib/db.ts`
  Shared PostgreSQL connection pool.

### Agent / Provider Integration

There is one implemented agent provider path today: TinyFish.

- Provider API base: `TINYFISH_BASE_URL` or `https://agent.tinyfish.ai`
- Auth: `TINYFISH_API_KEY`
- Mode switch: `GRANTFISH_USE_LIVE_TINYFISH=true`

`src/lib/mock-discovery.ts` starts a TinyFish automation run, polls until completion, extracts `opportunities`, normalizes them into the app’s schema, and deduplicates by a stable SHA-256 key derived from source name, title, deadline, and canonical URL.

## Repository Structure

```text
grantfish-mvp/
├── sql/
│   └── 001_init.sql
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── discovery/run/route.ts
│   │   │   ├── health/route.ts
│   │   │   └── opportunities/route.ts
│   │   ├── discover/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── db.ts
│   │   ├── mock-discovery.ts
│   │   └── scoring.ts
│   └── types/
│       ├── api.ts
│       ├── db.ts
│       ├── normalized.ts
│       └── scoring.ts
├── package.json
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
└── README.md
```

### Directory Guide

- `sql/`
  Database schema bootstrap SQL, including enums, tables, indexes, and update trigger helper.
- `src/app/`
  Next.js application shell, frontend pages, and API routes.
- `src/lib/`
  Runtime logic for database access, discovery, provider calls, normalization, and scoring.
- `src/types/`
  TypeScript contracts describing database records, normalized opportunities, scoring output, and API inputs.

## Data Pipeline

The current discovery pipeline looks like this:

`organization_profiles`
→ `/api/discovery/run`
→ TinyFish live sources or mock fallback
→ normalized opportunity objects
→ deduplication by `dedupe_key`
→ `opportunities` upsert
→ heuristic scoring
→ `opportunity_matches` upsert
→ `/api/opportunities`
→ `/discover` dashboard

### Discovery Flow

1. The dashboard sends `organizationProfileId` to `POST /api/discovery/run`.
2. The API loads the organization profile from `organization_profiles`.
3. `runMockGrantDiscovery()` decides whether to:
   - return hard-coded mock opportunities, or
   - run live TinyFish automations against built-in grant sources.
4. Each result is normalized into a `NormalizedOpportunity`-shaped object.
5. Opportunities are inserted into `opportunities`, or touched via `ON CONFLICT (dedupe_key)`.
6. Each opportunity is scored against the organization profile.
7. Matches are inserted or updated in `opportunity_matches`.
8. The UI loads ranked rows through `GET /api/opportunities`.

### Current Live Source Registry

The MVP keeps the source registry inline in `src/lib/mock-discovery.ts`.

- `Grants.gov`
- `WV State Grants`
- `National Endowment for the Arts`

Each source defines:

- `name`
- `sourceType`
- `url`
- optional `browserProfile`
- `goal(org)` prompt builder for the TinyFish agent

## Database Schema

The schema in `sql/001_init.sql` already models a broader opportunity platform than the current UI exposes.

### Enums

- `opportunity_type`: `grant`, `rfp`, `job`, `gig`, `lead`
- `source_type`: `grant_portal`, `foundation_site`, `government_portal`, `job_board`, `gig_board`, `directory`, `custom`
- `opportunity_status`: `open`, `closed`, `rolling`, `draft`, `unknown`
- `run_status`: `queued`, `running`, `completed`, `failed`, `partial`
- `pipeline_stage`: `new`, `review`, `shortlist`, `preparing`, `submitted`, `won`, `lost`, `archived`

### Tables

- `organization_profiles`
  Stores the target organization’s mission, geographies, focus areas, keywords, and document inventory.
- `source_configs`
  Stores configurable source metadata and agent instructions. Present in schema, but not yet wired into the current discovery route.
- `discovery_runs`
  Intended to track discovery executions, external run IDs, run logs, and counts. Present in schema, but not yet populated by the current route.
- `opportunities`
  Canonical opportunity records with source metadata, funding fields, eligibility text, and dedupe key.
- `discovery_run_results`
  Join table for raw payloads linked to discovery runs and opportunities. Present in schema, but not yet used in the MVP route.
- `opportunity_matches`
  Organization-specific fit scores, reasons, confidence, pipeline stage, notes, and flags such as `starred` and `hidden`.

## Installation

### Quick Start

```bash
git clone <your-repo-url>
cd grantfish-mvp
npm install
```

Create a local environment file:

```bash
cp .env.local .env.local.backup 2>/dev/null || true
```

Then set these values in `.env.local`:

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
TINYFISH_API_KEY=
TINYFISH_BASE_URL=https://agent.tinyfish.ai
GRANTFISH_USE_LIVE_TINYFISH=false
```

Initialize the database schema:

```bash
psql "$DATABASE_URL" -f sql/001_init.sql
```

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000` and navigate to `/discover`.

### Prerequisites

- Node.js compatible with Next.js 16
- npm
- PostgreSQL
- Optional TinyFish API access for live discovery

## Configuration

### Environment Variables

- `DATABASE_URL`
  PostgreSQL connection string used by `src/lib/db.ts`.
- `TINYFISH_API_KEY`
  Required only for live TinyFish discovery.
- `TINYFISH_BASE_URL`
  Optional override for the TinyFish API base URL. Defaults to `https://agent.tinyfish.ai`.
- `GRANTFISH_USE_LIVE_TINYFISH`
  Set to `true` to use TinyFish. Any other value keeps the app on mock fallback data.

### Seed Data Requirement

The discovery route requires an existing organization profile:

```json
{
  "organizationProfileId": "..."
}
```

The `/discover` page currently defaults to a hard-coded UUID:

`fdb54db0-6de7-4974-8705-1562bb3c7447`

You need to insert a matching row into `organization_profiles` before scans will succeed.

Example seed:

```sql
INSERT INTO organization_profiles (
  id,
  name,
  entity_type,
  mission,
  geographies,
  focus_areas,
  tax_status
) VALUES (
  'fdb54db0-6de7-4974-8705-1562bb3c7447',
  'Example Nonprofit',
  'nonprofit',
  'Supports arts and youth programs in Appalachia.',
  ARRAY['West Virginia', 'Appalachia'],
  ARRAY['arts', 'youth', 'education'],
  '501(c)(3)'
);
```

## Running the Project

### Application Commands

Defined in `package.json`:

- `npm run dev`
  Starts the Next.js development server.
- `npm run build`
  Builds the production bundle.
- `npm run start`
  Starts the production server from the built app.
- `npm run lint`
  Runs ESLint.

### API Routes

- `GET /api/health`
  Returns `{ ok: true, dbTime }` if the database is reachable.
- `POST /api/discovery/run`
  Runs discovery for a supplied `organizationProfileId`.
- `GET /api/opportunities?organizationProfileId=<uuid>`
  Returns up to 100 visible opportunities ordered by starred status, fit score, and deadline.

### UI Flow

1. Visit `/discover`.
2. Enter an organization profile UUID.
3. Click `Scan for Grants` to run discovery and scoring.
4. Click `Load Saved Opportunities` to fetch stored matches without re-running discovery.

## Adding Sources

The current MVP does not yet load sources dynamically from `source_configs`; instead, live sources are defined inline in `src/lib/mock-discovery.ts`.

To add a new source today:

1. Add a new entry to `LIVE_SOURCES` in `src/lib/mock-discovery.ts`.
2. Define:
   - `name`
   - `sourceType`
   - `url`
   - optional `browserProfile`
   - `goal(org)` returning strict JSON extraction instructions
3. Ensure the returned agent payload matches the expected `opportunities` array shape.
4. Let `normalizeOpportunity()` map the raw agent result into the normalized app schema.
5. Confirm the source yields a stable `canonicalUrl` and title so deduplication stays reliable.

Example shape:

```ts
{
  name: "Example Grants Portal",
  sourceType: "government_portal",
  url: "https://example.org/grants",
  browserProfile: "lite",
  goal: (org) => `...return JSON with opportunities...`
}
```

### How Sources Plug Into the Pipeline

- A source definition provides the target URL and extraction prompt.
- TinyFish executes the browser automation run.
- The response is normalized into internal opportunity objects.
- Opportunities are deduplicated, scored, and persisted.

### Future Refactor Path

The schema suggests the intended next step:

- move source definitions into `source_configs`
- persist `discovery_runs`
- store raw records in `discovery_run_results`
- support source selection per run

## Agent Providers

### Current Provider Abstraction

There is not yet a formal pluggable provider interface in a separate `providers/` directory. The current abstraction is implicit inside `src/lib/mock-discovery.ts`, where TinyFish is the live provider and mock data is the local fallback.

The effective provider switch is:

- mock mode: default, no external calls
- TinyFish mode: enabled with `GRANTFISH_USE_LIVE_TINYFISH=true` and `TINYFISH_API_KEY`

### How to Add Another Provider

To introduce a second provider cleanly:

1. Extract TinyFish logic from `runTinyFishSource()` into a provider module.
2. Define a common interface such as:
   - `runSource(source, org): Promise<NormalizedOpportunity[]>`
3. Create one implementation per provider.
4. Choose the provider through environment variables or source configuration.
5. Keep normalization and deduplication provider-agnostic.

### Switching Providers

Today, switching is environment-driven:

- keep `GRANTFISH_USE_LIVE_TINYFISH=false` for mock-only local development
- set `GRANTFISH_USE_LIVE_TINYFISH=true` and provide a valid TinyFish key for live crawling

## Extensibility

Although the current UI and discovery prompts are grant-focused, the schema is intentionally broader.

### Supported Future Domains

The following domains are already represented in the enum design:

- grants
- RFPs / procurement
- jobs
- gigs
- leads

### Why the Architecture Supports Expansion

- `opportunity_type` is not grant-specific.
- `source_type` supports boards, portals, directories, and custom sources.
- `opportunities` stores generic metadata plus structured fields for dates, amounts, location, requirements, and source provenance.
- `opportunity_matches` is organization-centric rather than domain-centric.
- `pipeline_stage` supports a pursuit workflow that can apply to funding, hiring, procurement, or lead qualification.

To extend beyond grants, the main work would be:

- adding domain-specific source definitions
- adjusting extraction prompts
- extending scoring heuristics
- optionally tuning the frontend labels and filters

## Development

### Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- PostgreSQL via `pg`

### Notes on Current MVP State

- The app is functional as a narrow MVP, not a fully generalized platform yet.
- Some schema objects are forward-looking and not wired into the current request path.
- The dashboard is intentionally minimal and optimized for manual testing of discovery and ranking.
- There are no background workers, cron jobs, workflow files, or separate CLI utilities in the repository at this time.

### Suggested Development Workflow

1. Install dependencies with `npm install`.
2. Configure `.env.local`.
3. Apply `sql/001_init.sql` to your Postgres instance.
4. Seed at least one `organization_profiles` row.
5. Run `npm run dev`.
6. Iterate on discovery prompts, normalization, scoring, and UI.
7. Run `npm run lint` before committing changes.

## Contributing

Contributions should preserve the current design principle: infer conservatively from external sources, normalize aggressively, and avoid inventing data.

Recommended contribution flow:

1. Create a branch for your work.
2. Make focused changes with tests or manual verification notes where appropriate.
3. If you add a new source, document its extraction behavior and any assumptions.
4. If you extend the schema, include a new SQL migration instead of editing historical migrations in place.
5. Run `npm run lint` and verify the `/discover` flow against a real or seeded profile.
6. Open a pull request with a concise summary of behavior changes.

Areas that are especially good candidates for contribution:

- source configuration management
- persisted discovery run tracking
- better opportunity scoring
- improved dashboard filtering and editing
- formal provider abstraction
- test coverage

## License

No license is currently defined in this repository.

Add your preferred license here, for example:

- MIT
- Apache-2.0
- Proprietary
