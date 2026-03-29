import { Pool } from "pg";

const globalForPg = globalThis as unknown as {
  pool?: Pool;
};

export function getPool(): Pool {
  if (!globalForPg.pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }

    globalForPg.pool = new Pool({ connectionString });
  }

  return globalForPg.pool;
}

let ensureActiveAppSchemaPromise: Promise<void> | null = null;

export async function ensureActiveAppSchema(): Promise<void> {
  if (!ensureActiveAppSchemaPromise) {
    const pool = getPool();
    ensureActiveAppSchemaPromise = pool
      .query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TABLE IF NOT EXISTS organization_profiles (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name text NOT NULL,
          entity_type text NOT NULL DEFAULT 'nonprofit',
          mission text NOT NULL DEFAULT '',
          geographies text[] NOT NULL DEFAULT '{}'::text[],
          focus_areas text[] NOT NULL DEFAULT '{}'::text[],
          tax_status text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS opportunities (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          type text NOT NULL DEFAULT 'grant',
          source_name text NOT NULL,
          source_type text NOT NULL DEFAULT 'foundation_site',
          source_url text NOT NULL,
          canonical_url text NOT NULL,
          title text NOT NULL,
          summary text,
          status text NOT NULL DEFAULT 'unknown',
          deadline_at timestamptz,
          location_scope text,
          country text,
          region text,
          funder_name text,
          amount_min numeric(14,2),
          amount_max numeric(14,2),
          currency char(3) NOT NULL DEFAULT 'USD',
          eligibility_text text,
          requirements_text text,
          application_url text,
          extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          dedupe_key text NOT NULL UNIQUE,
          first_seen_at timestamptz NOT NULL DEFAULT now(),
          last_seen_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS opportunity_matches (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_profile_id uuid NOT NULL REFERENCES organization_profiles(id) ON DELETE CASCADE,
          opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
          fit_score integer NOT NULL DEFAULT 0,
          fit_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
          confidence_score numeric(4,3) NOT NULL DEFAULT 0.500,
          pipeline_stage text NOT NULL DEFAULT 'new',
          notes text,
          starred boolean NOT NULL DEFAULT false,
          hidden boolean NOT NULL DEFAULT false,
          last_viewed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (organization_profile_id, opportunity_id)
        );

        CREATE TABLE IF NOT EXISTS discovery_runs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_profile_id uuid NOT NULL REFERENCES organization_profiles(id) ON DELETE CASCADE,
          status text NOT NULL DEFAULT 'pending',
          mode text,
          summary text,
          source_states jsonb NOT NULL DEFAULT '{}'::jsonb,
          trace jsonb NOT NULL DEFAULT '[]'::jsonb,
          discovered_count integer NOT NULL DEFAULT 0,
          saved_count integer NOT NULL DEFAULT 0,
          opportunity_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
          error text,
          started_at timestamptz,
          completed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        DROP TRIGGER IF EXISTS trg_organization_profiles_updated_at ON organization_profiles;
        CREATE TRIGGER trg_organization_profiles_updated_at
        BEFORE UPDATE ON organization_profiles
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();

        DROP TRIGGER IF EXISTS trg_opportunities_updated_at ON opportunities;
        CREATE TRIGGER trg_opportunities_updated_at
        BEFORE UPDATE ON opportunities
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();

        DROP TRIGGER IF EXISTS trg_opportunity_matches_updated_at ON opportunity_matches;
        CREATE TRIGGER trg_opportunity_matches_updated_at
        BEFORE UPDATE ON opportunity_matches
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();

        DROP TRIGGER IF EXISTS trg_discovery_runs_updated_at ON discovery_runs;
        CREATE TRIGGER trg_discovery_runs_updated_at
        BEFORE UPDATE ON discovery_runs
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
      `)
      .then(() => undefined)
      .catch((error) => {
        ensureActiveAppSchemaPromise = null;
        throw error;
      });
  }

  await ensureActiveAppSchemaPromise;
}
