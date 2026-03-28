export const runtime = "nodejs";

import { ensureArray } from "@/lib/ensure-array";
import { addLog, clearLogs } from "@/lib/logStore";
import { runMockGrantDiscovery } from "@/lib/mock-discovery";
import { ensureActiveAppSchema, getPool } from "@/lib/pg";
import { scoreOpportunity } from "@/lib/scoring";

type RequestBody = {
  organizationId?: string;
  orgId?: string;
};

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

export async function POST(req: Request) {
  try {
    clearLogs();
    addLog("Starting discovery run");

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const organizationId = String(body.organizationId ?? body.orgId ?? "").trim();

    if (!organizationId) {
      return Response.json({ error: "Missing organizationId" }, { status: 400 });
    }

    const pool = getPool();
    await ensureActiveAppSchema();
    const orgResult = await pool.query<OrganizationRow>(
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

    if (orgResult.rows.length === 0) {
      return Response.json({ error: "Organization not found" }, { status: 404 });
    }

    const organization = orgResult.rows[0];
    addLog("Loaded organization");
    console.info(
      `[discovery-route] starting discovery for organizationId=${organizationId}`
    );

    addLog("Running discovery");
    const discovered = await runMockGrantDiscovery({
      mission: organization.mission,
      focusAreas: ensureArray(organization.focusAreas),
      geographies: ensureArray(organization.geographies),
    });
    addLog(`Discovered ${discovered.length} opportunities`);
    addLog("Saving opportunities");

    let savedCount = 0;
    const savedOpportunityIds: string[] = [];

    for (const item of discovered) {
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
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20::jsonb,
          $21::jsonb,
          $22
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
      savedCount += 1;
    }

    const usedLive = discovered.some(
      (item) => item.metadata?.live_source === true
    );

    console.info(
      `[discovery-route] completed discovery mode=${
        usedLive ? "live" : "mock"
      } discovered=${discovered.length} saved=${savedCount}`
    );
    addLog(
      `Completed ${usedLive ? "live TinyFish" : "mock fallback"} discovery`
    );
    addLog(`Saved ${savedCount} opportunities`);

    return Response.json({
      organizationId,
      mode: usedLive ? "live" : "mock",
      discoveredCount: discovered.length,
      savedCount,
      opportunityIds: savedOpportunityIds,
    });
  } catch (err) {
    console.error("DISCOVERY RUN ERROR:", err);
    addLog("Discovery failed");
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
