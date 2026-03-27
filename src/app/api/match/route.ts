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
        m.fit_score AS score,
        m.fit_reasons AS reasons
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
