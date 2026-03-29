export const runtime = "nodejs";

import { ensureArray } from "@/lib/ensure-array";
import {
  getLiveDiscoveryConfig,
  pollLiveDiscoverySourceRuns,
  runMockGrantDiscovery,
  startLiveDiscoverySourceRuns,
  type DiscoveryLogEntry,
  type DiscoverySourceResult,
  type PersistedDiscoverySourceState,
} from "@/lib/mock-discovery";
import { ensureActiveAppSchema, getPool } from "@/lib/pg";
import { scoreOpportunity } from "@/lib/scoring";

type RequestBody = {
  organizationId?: string;
  orgId?: string;
};

type DiscoveryRunStatus = "pending" | "running" | "completed" | "failed" | "partial";

type OrganizationRow = {
  id: string;
  name: string;
  mission: string;
  entityType: string;
  geographies: unknown;
  focusAreas: unknown;
  taxStatus: string | null;
};

type OpportunityRow = {
  id: string;
};

type DiscoveryRunRow = {
  id: string;
  organizationId: string;
  status: DiscoveryRunStatus;
  mode: "live" | "mock" | null;
  summary: string | null;
  sourceStates: unknown;
  trace: unknown;
  discoveredCount: number;
  savedCount: number;
  opportunityIds: string[] | null;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const TERMINAL_SOURCE_STATUSES = new Set([
  "success",
  "empty",
  "error",
  "timeout",
  "cancelled",
]);

function normalizeSourceStates(value: unknown): PersistedDiscoverySourceState[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.values(value as Record<string, unknown>)
    .filter((entry): entry is PersistedDiscoverySourceState => Boolean(entry && typeof entry === "object"))
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
}

function normalizeTrace(value: unknown): DiscoveryLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is DiscoveryLogEntry => Boolean(entry && typeof entry === "object"))
    .map((entry) => ({
      step: String(entry.step ?? ""),
      status: entry.status === "pending" ? "pending" : "done",
      duration:
        typeof entry.duration === "number" && Number.isFinite(entry.duration)
          ? entry.duration
          : undefined,
    }));
}

async function loadOrganization(organizationId: string): Promise<OrganizationRow | null> {
  const pool = getPool();
  const result = await pool.query<OrganizationRow>(
    `
    SELECT
      id,
      name,
      mission,
      entity_type AS "entityType",
      geographies,
      focus_areas AS "focusAreas",
      tax_status AS "taxStatus"
    FROM organization_profiles
    WHERE id = $1
    `,
    [organizationId]
  );

  return result.rows[0] ?? null;
}

async function appendRunTrace(runId: string, entry: DiscoveryLogEntry): Promise<void> {
  const pool = getPool();
  await pool.query(
    `
    UPDATE discovery_runs
    SET trace = trace || $2::jsonb
    WHERE id = $1
    `,
    [runId, JSON.stringify([entry])]
  );
}

async function setRunStatus(params: {
  runId: string;
  status: DiscoveryRunStatus;
  summary: string;
  mode?: "live" | "mock";
  error?: string | null;
  started?: boolean;
  completed?: boolean;
  discoveredCount?: number;
  savedCount?: number;
  opportunityIds?: string[];
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `
    UPDATE discovery_runs
    SET
      status = $2,
      summary = $3,
      mode = COALESCE($4, mode),
      error = $5,
      started_at = CASE WHEN $6 THEN COALESCE(started_at, now()) ELSE started_at END,
      completed_at = CASE WHEN $7 THEN now() ELSE completed_at END,
      discovered_count = COALESCE($8, discovered_count),
      saved_count = COALESCE($9, saved_count),
      opportunity_ids = COALESCE($10::uuid[], opportunity_ids)
    WHERE id = $1
    `,
    [
      params.runId,
      params.status,
      params.summary,
      params.mode ?? null,
      params.error ?? null,
      params.started === true,
      params.completed === true,
      params.discoveredCount ?? null,
      params.savedCount ?? null,
      params.opportunityIds ?? null,
    ]
  );
}

async function replaceSourceStates(
  runId: string,
  sourceStates: PersistedDiscoverySourceState[]
): Promise<void> {
  const pool = getPool();
  const sourceStateRecord = Object.fromEntries(
    sourceStates.map((state) => [state.sourceName, state])
  );
  await pool.query(
    `
    UPDATE discovery_runs
    SET source_states = $2::jsonb
    WHERE id = $1
    `,
    [runId, JSON.stringify(sourceStateRecord)]
  );
}

async function setSourceState(
  runId: string,
  sourceState: PersistedDiscoverySourceState
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `
    UPDATE discovery_runs
    SET source_states = jsonb_set(source_states, $2::text[], $3::jsonb, true)
    WHERE id = $1
    `,
    [runId, [sourceState.sourceName], JSON.stringify(sourceState)]
  );
}

async function loadDiscoveryRun(runId: string): Promise<DiscoveryRunRow | null> {
  const pool = getPool();
  const result = await pool.query<DiscoveryRunRow>(
    `
    SELECT
      id,
      organization_profile_id AS "organizationId",
      status,
      mode,
      summary,
      source_states AS "sourceStates",
      trace,
      discovered_count AS "discoveredCount",
      saved_count AS "savedCount",
      opportunity_ids AS "opportunityIds",
      error,
      started_at AS "startedAt",
      completed_at AS "completedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM discovery_runs
    WHERE id = $1
    `,
    [runId]
  );

  return result.rows[0] ?? null;
}

async function saveOpportunitiesForRun(params: {
  organizationId: string;
  organization: OrganizationRow;
  opportunities: DiscoverySourceResult["opportunities"];
}): Promise<string[]> {
  const { organizationId, organization, opportunities } = params;
  const pool = getPool();
  const savedOpportunityIds: string[] = [];

  for (const item of opportunities) {
    const upsertResult = await pool.query<OpportunityRow>(
      `
      INSERT INTO opportunities (
        type,
        source_name,
        source_type,
        source_url,
        canonical_url,
        title,
        summary,
        status,
        deadline_at,
        location_scope,
        country,
        region,
        funder_name,
        amount_min,
        amount_max,
        currency,
        eligibility_text,
        requirements_text,
        application_url,
        extracted_fields,
        metadata,
        dedupe_key
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20::jsonb, $21::jsonb, $22
      )
      ON CONFLICT (dedupe_key)
      DO UPDATE SET
        source_name = EXCLUDED.source_name,
        source_type = EXCLUDED.source_type,
        source_url = EXCLUDED.source_url,
        canonical_url = EXCLUDED.canonical_url,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        status = EXCLUDED.status,
        deadline_at = EXCLUDED.deadline_at,
        location_scope = EXCLUDED.location_scope,
        country = EXCLUDED.country,
        region = EXCLUDED.region,
        funder_name = EXCLUDED.funder_name,
        amount_min = EXCLUDED.amount_min,
        amount_max = EXCLUDED.amount_max,
        currency = EXCLUDED.currency,
        eligibility_text = EXCLUDED.eligibility_text,
        requirements_text = EXCLUDED.requirements_text,
        application_url = EXCLUDED.application_url,
        extracted_fields = EXCLUDED.extracted_fields,
        metadata = EXCLUDED.metadata,
        last_seen_at = now(),
        updated_at = now()
      RETURNING id
      `,
      [
        item.type,
        item.sourceName,
        item.sourceType,
        item.sourceUrl,
        item.canonicalUrl,
        item.title.trim(),
        item.summary ?? null,
        item.status ?? "unknown",
        item.deadlineAt ? new Date(item.deadlineAt) : null,
        item.locationScope ?? null,
        item.country ?? null,
        item.region ?? null,
        item.funderName ?? null,
        item.amountMin ?? null,
        item.amountMax ?? null,
        item.currency ?? "USD",
        item.eligibilityText ?? null,
        item.requirementsText ?? null,
        item.applicationUrl ?? null,
        JSON.stringify(item.extractedFields ?? {}),
        JSON.stringify(item.metadata ?? {}),
        item.dedupeKey,
      ]
    );

    const score = scoreOpportunity(
      {
        title: item.title,
        summary: item.summary ?? null,
        eligibility_text: item.eligibilityText ?? null,
        requirements_text: item.requirementsText ?? null,
        source_name: item.sourceName,
        funder_name: item.funderName ?? null,
        location_scope: item.locationScope ?? null,
        country: item.country ?? null,
        region: item.region ?? null,
        status: item.status ?? null,
        deadline_at: item.deadlineAt ?? null,
        extracted_fields: item.extractedFields ?? null,
      },
      {
        mission: organization.mission,
        focus_areas: ensureArray(organization.focusAreas),
        geographies: ensureArray(organization.geographies),
        entity_type: organization.entityType,
        tax_status: organization.taxStatus,
      }
    );

    await pool.query(
      `
      INSERT INTO opportunity_matches (
        organization_profile_id,
        opportunity_id,
        fit_score,
        fit_reasons,
        confidence_score
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT (organization_profile_id, opportunity_id)
      DO UPDATE SET
        fit_score = EXCLUDED.fit_score,
        fit_reasons = EXCLUDED.fit_reasons,
        confidence_score = EXCLUDED.confidence_score,
        updated_at = now()
      `,
      [
        organizationId,
        upsertResult.rows[0].id,
        score.fitScore,
        JSON.stringify(score.fitReasons),
        score.confidenceScore,
      ]
    );

    savedOpportunityIds.push(upsertResult.rows[0].id);
  }

  return savedOpportunityIds;
}

function summarizeLiveRun(params: {
  sourceStates: PersistedDiscoverySourceState[];
  savedCount: number;
}): { status: DiscoveryRunStatus; summary: string; isTerminal: boolean } {
  const { sourceStates, savedCount } = params;
  const activeCount = sourceStates.filter(
    (state) => !TERMINAL_SOURCE_STATUSES.has(state.localStatus)
  ).length;
  const timedOutNames = sourceStates
    .filter((state) => state.localStatus === "timeout")
    .map((state) => state.sourceName);
  const failedNames = sourceStates
    .filter((state) => state.localStatus === "error")
    .map((state) => state.sourceName);
  const cancelledNames = sourceStates
    .filter((state) => state.localStatus === "cancelled")
    .map((state) => state.sourceName);
  const emptyNames = sourceStates
    .filter((state) => state.localStatus === "empty")
    .map((state) => state.sourceName);

  if (activeCount > 0) {
    return {
      status: "running",
      summary:
        savedCount > 0
          ? `Partial results saved. Saved ${savedCount} opportunit${
              savedCount === 1 ? "y" : "ies"
            }. ${activeCount} source${activeCount === 1 ? "" : "s"} still running upstream.`
          : "Running live discovery",
      isTerminal: false,
    };
  }

  if (savedCount > 0) {
    const summaryParts = [
      timedOutNames.length > 0 || failedNames.length > 0 || cancelledNames.length > 0
        ? "Run completed with partial results."
        : "Completed live discovery.",
      `Saved ${savedCount} opportunit${savedCount === 1 ? "y" : "ies"}.`,
    ];

    if (timedOutNames.length > 0) {
      summaryParts.push(`${timedOutNames.join(", ")} timed out.`);
    }

    if (failedNames.length > 0) {
      summaryParts.push(`${failedNames.join(", ")} failed upstream.`);
    }

    if (cancelledNames.length > 0) {
      summaryParts.push(`${cancelledNames.join(", ")} cancelled upstream.`);
    }

    return {
      status:
        timedOutNames.length > 0 || failedNames.length > 0 || cancelledNames.length > 0
          ? "partial"
          : "completed",
      summary: summaryParts.join(" "),
      isTerminal: true,
    };
  }

  if (emptyNames.length > 0) {
    const summaryParts = ["Completed live discovery. No matching opportunities found."];

    if (failedNames.length > 0) {
      summaryParts.push(`${failedNames.join(", ")} failed upstream.`);
    }

    if (cancelledNames.length > 0) {
      summaryParts.push(`${cancelledNames.join(", ")} cancelled upstream.`);
    }

    return {
      status:
        failedNames.length > 0 || cancelledNames.length > 0 ? "partial" : "completed",
      summary: summaryParts.join(" "),
      isTerminal: true,
    };
  }

  return {
    status: "failed",
    summary: `All live sources failed: ${sourceStates
      .map((state) => state.message)
      .join(" | ")}`,
    isTerminal: true,
  };
}

function serializeRun(row: DiscoveryRunRow) {
  const sourceOutcomes = normalizeSourceStates(row.sourceStates).map((state) => ({
    sourceName: state.sourceName,
    status: state.localStatus,
    opportunityCount: state.opportunityCount,
    message: state.message,
    upstreamRunId: state.upstreamRunId ?? null,
    upstreamStatus: state.upstreamStatus ?? null,
    lastCheckedAt: state.lastCheckedAt ?? null,
  }));
  const isTerminal =
    row.status === "completed" || row.status === "failed" || row.status === "partial";

  return {
    runId: row.id,
    organizationId: row.organizationId,
    status: row.status,
    mode: row.mode,
    summary: row.summary ?? "",
    sourceOutcomes,
    trace: normalizeTrace(row.trace),
    discoveredCount: Number(row.discoveredCount ?? 0),
    savedCount: Number(row.savedCount ?? 0),
    opportunityIds: Array.isArray(row.opportunityIds) ? row.opportunityIds : [],
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isTerminal,
  };
}

async function executeMockFallbackRun(params: {
  runId: string;
  organizationId: string;
  organization: OrganizationRow;
}): Promise<void> {
  const { runId, organizationId, organization } = params;
  const savedOpportunityIds = new Set<string>();
  let discoveredCount = 0;

  await setRunStatus({
    runId,
    status: "running",
    summary: "Running mock discovery",
    mode: "mock",
    started: true,
  });

  try {
    const result = await runMockGrantDiscovery(
      {
        mission: organization.mission,
        focusAreas: ensureArray(organization.focusAreas),
        geographies: ensureArray(organization.geographies),
      },
      {
        onLog: async (entry) => appendRunTrace(runId, entry),
        onSourceResult: async (sourceResult) => {
          if (sourceResult.opportunities.length > 0) {
            const ids = await saveOpportunitiesForRun({
              organizationId,
              organization,
              opportunities: sourceResult.opportunities,
            });
            discoveredCount += sourceResult.opportunities.length;
            ids.forEach((id) => savedOpportunityIds.add(id));
          }
        },
      }
    );

    const summary =
      result.opportunities.length > 0
        ? `Completed mock discovery. Saved ${savedOpportunityIds.size} opportunit${
            savedOpportunityIds.size === 1 ? "y" : "ies"
          }.`
        : "Completed mock discovery. No matching opportunities found.";

    await replaceSourceStates(runId, [
      {
        sourceName: "Mock fallback",
        localStatus: result.opportunities.length > 0 ? "success" : "empty",
        upstreamRunId: null,
        upstreamStatus: null,
        opportunityCount: result.opportunities.length,
        message: summary,
        lastCheckedAt: new Date().toISOString(),
        finalError: null,
        updatedAt: new Date().toISOString(),
      },
    ]);

    await setRunStatus({
      runId,
      status: "completed",
      summary,
      mode: "mock",
      started: true,
      completed: true,
      discoveredCount,
      savedCount: savedOpportunityIds.size,
      opportunityIds: Array.from(savedOpportunityIds),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setRunStatus({
      runId,
      status: "failed",
      summary: message,
      mode: "mock",
      error: message,
      started: true,
      completed: true,
      discoveredCount,
      savedCount: savedOpportunityIds.size,
      opportunityIds: Array.from(savedOpportunityIds),
    });
    await appendRunTrace(runId, { step: message, status: "done" });
  }
}

async function synchronizeLiveRun(run: DiscoveryRunRow): Promise<DiscoveryRunRow | null> {
  const sourceStates = normalizeSourceStates(run.sourceStates);
  const organization = await loadOrganization(run.organizationId);

  if (!organization) {
    await setRunStatus({
      runId: run.id,
      status: "failed",
      summary: "Organization not found",
      error: "Organization not found",
      completed: true,
    });
    return loadDiscoveryRun(run.id);
  }

  const results = await pollLiveDiscoverySourceRuns(sourceStates);
  if (results.length === 0) {
    return run;
  }

  const currentStateMap = new Map(sourceStates.map((state) => [state.sourceName, state]));
  const savedOpportunityIds = new Set(run.opportunityIds ?? []);
  let discoveredCount = Number(run.discoveredCount ?? 0);

  for (const result of results) {
    const current = currentStateMap.get(result.outcome.sourceName);
    if (!current) {
      continue;
    }

    const nextState: PersistedDiscoverySourceState = {
      ...current,
      localStatus:
        result.outcome.status === "queued" || result.outcome.status === "running"
          ? result.outcome.status
          : result.outcome.status,
      upstreamStatus:
        result.outcome.status === "queued"
          ? "PENDING"
          : result.outcome.status === "running"
          ? "RUNNING"
          : result.outcome.status === "success" || result.outcome.status === "empty"
          ? "COMPLETED"
          : result.outcome.status === "cancelled"
          ? "CANCELLED"
          : "FAILED",
      opportunityCount: result.outcome.opportunityCount,
      message: result.outcome.message,
      lastCheckedAt: new Date().toISOString(),
      finalError:
        result.outcome.status === "error" || result.outcome.status === "cancelled"
          ? result.outcome.message
          : null,
      updatedAt: new Date().toISOString(),
    };

    const stateChanged =
      current.localStatus !== nextState.localStatus ||
      current.message !== nextState.message ||
      current.opportunityCount !== nextState.opportunityCount ||
      current.upstreamStatus !== nextState.upstreamStatus;

    if (
      result.outcome.status === "success" &&
      !TERMINAL_SOURCE_STATUSES.has(current.localStatus)
    ) {
      const ids = await saveOpportunitiesForRun({
        organizationId: run.organizationId,
        organization,
        opportunities: result.opportunities,
      });
      discoveredCount += result.opportunities.length;
      ids.forEach((id) => savedOpportunityIds.add(id));
      nextState.message = `${result.outcome.sourceName} completed; ${ids.length} opportunit${
        ids.length === 1 ? "y" : "ies"
      } saved`;
    }

    if (stateChanged || result.outcome.status === "success") {
      await setSourceState(run.id, nextState);
      await appendRunTrace(run.id, { step: nextState.message, status: "done" });
    }

    currentStateMap.set(nextState.sourceName, nextState);
  }

  const nextStates = Array.from(currentStateMap.values()).sort((left, right) =>
    left.sourceName.localeCompare(right.sourceName)
  );
  const summary = summarizeLiveRun({
    sourceStates: nextStates,
    savedCount: savedOpportunityIds.size,
  });

  await setRunStatus({
    runId: run.id,
    status: summary.status,
    summary: summary.summary,
    mode: "live",
    started: true,
    completed: summary.isTerminal,
    discoveredCount,
    savedCount: savedOpportunityIds.size,
    opportunityIds: Array.from(savedOpportunityIds),
    error: summary.status === "failed" ? summary.summary : null,
  });

  return loadDiscoveryRun(run.id);
}

export async function POST(req: Request) {
  const pool = getPool();
  await ensureActiveAppSchema();

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const organizationId = String(body.organizationId ?? body.orgId ?? "").trim();

  if (!organizationId) {
    return Response.json({ error: "Missing organizationId" }, { status: 400 });
  }

  const organization = await loadOrganization(organizationId);
  if (!organization) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  const runInsert = await pool.query<{ id: string }>(
    `
    INSERT INTO discovery_runs (
      organization_profile_id,
      status,
      summary
    )
    VALUES ($1, 'pending', 'Discovery started')
    RETURNING id
    `,
    [organizationId]
  );

  const runId = runInsert.rows[0].id;
  const liveConfig = getLiveDiscoveryConfig();

  await appendRunTrace(runId, { step: "Discovery started", status: "done" });

  if (liveConfig.useLive && liveConfig.hasKey) {
    const sourceStates = await startLiveDiscoverySourceRuns({
      mission: organization.mission,
      focusAreas: ensureArray(organization.focusAreas),
      geographies: ensureArray(organization.geographies),
    });

    await replaceSourceStates(runId, sourceStates);
    for (const sourceState of sourceStates) {
      await appendRunTrace(runId, { step: sourceState.message, status: "done" });
    }

    const startedCount = sourceStates.filter(
      (state) => state.localStatus === "queued"
    ).length;
    const failedStarts = sourceStates.filter(
      (state) => state.localStatus === "error"
    );

    const status: DiscoveryRunStatus =
      startedCount === 0 ? "failed" : failedStarts.length > 0 ? "partial" : "running";
    const summary =
      startedCount === 0
        ? `All live sources failed: ${failedStarts.map((state) => state.message).join(" | ")}`
        : failedStarts.length > 0
        ? `Running live discovery. ${failedStarts
            .map((state) => state.sourceName)
            .join(", ")} failed to start.`
        : "Running live discovery";

    await setRunStatus({
      runId,
      status,
      summary,
      mode: "live",
      started: true,
      completed: startedCount === 0,
      error: startedCount === 0 ? summary : null,
    });

    return Response.json(
      {
        runId,
        organizationId,
        status,
        summary,
      },
      { status: 202 }
    );
  }

  void executeMockFallbackRun({ runId, organizationId, organization });
  await setRunStatus({
    runId,
    status: "running",
    summary: "Running mock discovery",
    mode: "mock",
    started: true,
  });

  return Response.json(
    {
      runId,
      organizationId,
      status: "running",
      summary: "Running mock discovery",
    },
    { status: 202 }
  );
}

export async function GET(req: Request) {
  await ensureActiveAppSchema();

  const url = new URL(req.url);
  const runId = String(url.searchParams.get("id") ?? "").trim();

  if (!runId) {
    return Response.json({ error: "Missing run id" }, { status: 400 });
  }

  let run = await loadDiscoveryRun(runId);
  if (!run) {
    return Response.json({ error: "Discovery run not found" }, { status: 404 });
  }

  if (run.mode === "live" && !["completed", "failed", "partial"].includes(run.status)) {
    run = (await synchronizeLiveRun(run)) ?? run;
  }

  return Response.json(serializeRun(run));
}
