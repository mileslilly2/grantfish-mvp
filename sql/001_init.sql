-- 001_init.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- helpers ----------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- enums ----------

DO $$ BEGIN
  CREATE TYPE opportunity_type AS ENUM ('grant', 'rfp', 'job', 'gig', 'lead');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM (
    'grant_portal',
    'foundation_site',
    'government_portal',
    'job_board',
    'gig_board',
    'directory',
    'custom'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE opportunity_status AS ENUM ('open', 'closed', 'rolling', 'draft', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE run_status AS ENUM ('queued', 'running', 'completed', 'failed', 'partial');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE pipeline_stage AS ENUM (
    'new',
    'review',
    'shortlist',
    'preparing',
    'submitted',
    'won',
    'lost',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ---------- tables ----------

CREATE TABLE IF NOT EXISTS organization_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text, -- nullable for hackathon MVP
  name text NOT NULL,
  entity_type text NOT NULL DEFAULT 'nonprofit',
  mission text NOT NULL,
  geographies text[] NOT NULL DEFAULT '{}'::text[],
  focus_areas text[] NOT NULL DEFAULT '{}'::text[],
  annual_budget_band text,
  tax_status text,
  keywords_include text[] NOT NULL DEFAULT '{}'::text[],
  keywords_exclude text[] NOT NULL DEFAULT '{}'::text[],
  doc_inventory text[] NOT NULL DEFAULT '{}'::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_type source_type NOT NULL,
  base_url text NOT NULL,
  start_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  default_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  agent_instructions text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_profile_id uuid NOT NULL REFERENCES organization_profiles(id) ON DELETE CASCADE,
  source_config_id uuid NOT NULL REFERENCES source_configs(id) ON DELETE CASCADE,
  external_run_id text,      -- TinyFish run/session id if available
  streaming_url text,        -- TinyFish streaming URL if available
  run_status run_status NOT NULL DEFAULT 'queued',
  trigger_type text NOT NULL DEFAULT 'manual',
  started_at timestamptz,
  finished_at timestamptz,
  records_found integer NOT NULL DEFAULT 0,
  records_new integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  error_summary text,
  raw_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type opportunity_type NOT NULL DEFAULT 'grant',

  source_config_id uuid REFERENCES source_configs(id) ON DELETE SET NULL,
  source_name text NOT NULL,
  source_type source_type NOT NULL,
  source_url text NOT NULL,
  canonical_url text NOT NULL,
  source_item_id text,

  title text NOT NULL,
  summary text,
  status opportunity_status NOT NULL DEFAULT 'unknown',

  posted_at timestamptz,
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

  dedupe_key text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT amount_range_check
    CHECK (
      amount_min IS NULL
      OR amount_max IS NULL
      OR amount_max >= amount_min
    ),

  UNIQUE (dedupe_key)
);

CREATE TABLE IF NOT EXISTS discovery_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_run_id uuid NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discovery_run_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS opportunity_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_profile_id uuid NOT NULL REFERENCES organization_profiles(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,

  fit_score integer NOT NULL DEFAULT 0 CHECK (fit_score >= 0 AND fit_score <= 100),
  fit_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.500
    CHECK (confidence_score >= 0 AND confidence_score <= 1),

  pipeline_stage pipeline_stage NOT NULL DEFAULT 'new',
  notes text,
  starred boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  last_viewed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_profile_id, opportunity_id)
);

-- ---------- indexes ----------

CREATE INDEX IF NOT EXISTS idx_source_configs_active
  ON source_configs (active);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_org_created
  ON discovery_runs (organization_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_status
  ON discovery_runs (run_status);

CREATE INDEX IF NOT EXISTS idx_opportunities_type_status_deadline
  ON opportunities (type, status, deadline_at);

CREATE INDEX IF NOT EXISTS idx_opportunities_funder_name
  ON opportunities (funder_name);

CREATE INDEX IF NOT EXISTS idx_opportunities_last_seen
  ON opportunities (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunities_source_item
  ON opportunities (source_config_id, source_item_id)
  WHERE source_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matches_org_stage
  ON opportunity_matches (organization_profile_id, pipeline_stage);

CREATE INDEX IF NOT EXISTS idx_matches_org_fit
  ON opportunity_matches (organization_profile_id, fit_score DESC);

CREATE INDEX IF NOT EXISTS idx_matches_starred
  ON opportunity_matches (organization_profile_id, starred)
  WHERE starred = true;

-- ---------- triggers ----------

DROP TRIGGER IF EXISTS trg_organization_profiles_updated_at ON organization_profiles;
CREATE TRIGGER trg_organization_profiles_updated_at
BEFORE UPDATE ON organization_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_source_configs_updated_at ON source_configs;
CREATE TRIGGER trg_source_configs_updated_at
BEFORE UPDATE ON source_configs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_discovery_runs_updated_at ON discovery_runs;
CREATE TRIGGER trg_discovery_runs_updated_at
BEFORE UPDATE ON discovery_runs
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