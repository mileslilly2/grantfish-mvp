import { ensureActiveAppSchema, getPool } from "@/lib/pg";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");

    if (!orgId) {
      return Response.json({ error: "Missing orgId" }, { status: 400 });
    }

    const pool = getPool();
    await ensureActiveAppSchema();

    const orgResult = await pool.query(
      `
      SELECT id
      FROM organization_profiles
      WHERE id = $1
      `,
      [orgId]
    );

    if (orgResult.rows.length === 0) {
      return Response.json({ error: "Org not found" }, { status: 404 });
    }

    const oppResult = await pool.query(
      `
      SELECT
        o.id AS "opportunityId",
        o.title,
        o.funder_name AS "funderName",
        o.deadline_at AS "deadlineAt",
        o.amount_min AS "amountMin",
        o.amount_max AS "amountMax",
        o.currency,
        o.status,
        o.application_url AS "applicationUrl",
        o.source_name AS "sourceName",
        m.fit_score AS score,
        m.fit_reasons AS reasons,
        m.pipeline_stage AS "pipelineStage",
        m.notes
      FROM opportunity_matches m
      JOIN opportunities o ON o.id = m.opportunity_id
      WHERE m.organization_profile_id = $1
        AND m.hidden = false
      ORDER BY m.fit_score DESC, o.created_at DESC
      `,
      [orgId]
    );

    return Response.json(
      oppResult.rows.map((row) => ({
        opportunityId: String(row.opportunityId ?? ""),
        title: String(row.title ?? ""),
        score: Number(row.score ?? 0),
        reasons: ensureReasonArray(row.reasons),
        funderName: nullableString(row.funderName),
        deadlineAt:
          row.deadlineAt instanceof Date
            ? row.deadlineAt.toISOString()
            : nullableString(row.deadlineAt),
        amountMin: nullableNumber(row.amountMin),
        amountMax: nullableNumber(row.amountMax),
        currency: nullableString(row.currency),
        status: nullableString(row.status),
        applicationUrl: nullableString(row.applicationUrl),
        sourceName: nullableString(row.sourceName),
        pipelineStage: nullableString(row.pipelineStage),
        notes: nullableString(row.notes),
      }))
    );
  } catch (err) {
    console.error("MATCH ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

function ensureReasonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map((entry) => String(entry)).filter(Boolean)
        : [];
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }

  return [];
}

function nullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
