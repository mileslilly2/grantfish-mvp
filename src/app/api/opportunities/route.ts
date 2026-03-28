import { ensureArray } from "@/lib/ensure-array";
import { ensureActiveAppSchema, getPool } from "@/lib/pg";

export const runtime = "nodejs";

type OpportunityResponse = {
  id: string;
  title: string;
  description: string;
  agency: string;
  geographies: string[];
  focusAreas: string[];
  amount?: number;
  deadline?: string;
  createdAt: string;
};

function serializeRow(row: Record<string, unknown>): OpportunityResponse {
  const deadlineValue = row.deadline ?? row.deadline_at;
  const createdAtValue = row.createdAt ?? row.created_at;

  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? row.summary ?? ""),
    agency: String(row.agency ?? row.funder_name ?? row.source_name ?? ""),
    geographies: ensureArray(
      row.geographies ??
        [row.location_scope, row.region, row.country].filter(Boolean)
    ),
    focusAreas: ensureArray(
      row.focusAreas ?? row.focus_areas ?? row.extracted_mission_areas
    ),
    amount:
      typeof row.amount === "number" || typeof row.amount_max === "number"
        ? Number(row.amount ?? row.amount_max)
        : row.amount != null || row.amount_max != null
        ? Number(row.amount ?? row.amount_max)
        : undefined,
    deadline:
      deadlineValue instanceof Date
        ? deadlineValue.toISOString()
        : deadlineValue
        ? String(deadlineValue)
        : undefined,
    createdAt:
      createdAtValue instanceof Date
        ? createdAtValue.toISOString()
        : String(createdAtValue ?? ""),
  };
}

export async function GET(req: Request) {
  try {
    const pool = getPool();
    await ensureActiveAppSchema();
    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId")?.trim();

    const result = orgId
      ? await pool.query(
          `
          SELECT
            o.id,
            o.title,
            o.summary,
            o.source_name,
            o.funder_name,
            o.location_scope,
            o.country,
            o.region,
            o.amount_max,
            o.deadline_at,
            o.created_at,
            o.extracted_fields -> 'mission_areas' AS extracted_mission_areas
          FROM opportunity_matches m
          JOIN opportunities o ON o.id = m.opportunity_id
          WHERE m.organization_profile_id = $1
            AND m.hidden = false
          ORDER BY m.fit_score DESC, o.created_at DESC
          `,
          [orgId]
        )
      : await pool.query(`
          SELECT
            id,
            title,
            summary,
            source_name,
            funder_name,
            location_scope,
            country,
            region,
            amount_max,
            deadline_at,
            created_at,
            extracted_fields -> 'mission_areas' AS extracted_mission_areas
          FROM opportunities
          ORDER BY created_at DESC
        `);

    return Response.json(result.rows.map(serializeRow));
  } catch (err) {
    console.error("GET OPPORTUNITIES ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const pool = getPool();
    await ensureActiveAppSchema();

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    }

    const title = String(body?.title ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const agency = String(body?.agency ?? "").trim();
    const geographies = ensureArray(body?.geographies);
    const focusAreas = ensureArray(body?.focusAreas);
    const organizationId = String(body?.organizationId ?? body?.orgId ?? "").trim();
    const sourceType = String(body?.sourceType ?? "custom").trim() || "custom";
    const sourceUrl =
      String(body?.sourceUrl ?? body?.canonicalUrl ?? "https://example.org/manual").trim() ||
      "https://example.org/manual";
    const canonicalUrl =
      String(body?.canonicalUrl ?? sourceUrl).trim() || sourceUrl;
    const locationScope = geographies[0] ?? null;
    const amount =
      typeof body?.amount === "number" && Number.isFinite(body.amount)
        ? body.amount
        : null;
    const deadline = body?.deadline ? new Date(body.deadline) : null;

    const result = await pool.query(
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
        funder_name,
        amount_max,
        currency,
        extracted_fields,
        metadata,
        dedupe_key
      )
      VALUES (
        'grant',
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'open',
        $7,
        $8,
        $9,
        $10,
        'USD',
        $11::jsonb,
        '{}'::jsonb,
        encode(digest(lower($1 || '|' || $5 || '|' || COALESCE($9, '')), 'sha256'), 'hex')
      )
      RETURNING
        id,
        title,
        summary,
        source_name,
        funder_name,
        location_scope,
        amount_max,
        deadline_at,
        created_at,
        extracted_fields -> 'mission_areas' AS extracted_mission_areas
      `,
      [
        agency,
        sourceType,
        sourceUrl,
        canonicalUrl,
        title,
        description,
        deadline,
        locationScope,
        agency,
        amount,
        JSON.stringify({ mission_areas: focusAreas }),
      ]
    );

    if (organizationId) {
      await pool.query(
        `
        INSERT INTO opportunity_matches (
          organization_profile_id,
          opportunity_id,
          fit_score,
          fit_reasons,
          confidence_score
        )
        VALUES ($1, $2, 0, '[]'::jsonb, 0.500)
        ON CONFLICT (organization_profile_id, opportunity_id)
        DO NOTHING
        `,
        [organizationId, result.rows[0].id]
      );
    }

    return Response.json(serializeRow(result.rows[0]));
  } catch (err) {
    console.error("CREATE OPPORTUNITY ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
