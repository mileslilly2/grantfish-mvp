import { ensureArray } from "@/lib/ensure-array";
import { getPool } from "@/lib/pg";
import { scoreOpportunity } from "@/lib/scoring";

export const runtime = "nodejs";

function normalizeOrg(row: any) {
  return {
    id: String(row.id),
    mission: String(row.mission ?? ""),
    entity_type: String(row.entityType ?? ""),
    tax_status: String(row.taxStatus ?? ""),
    focus_areas: ensureArray(row.focusAreas),
    geographies: ensureArray(row.geographies),
  };
}

function normalizeOpp(row: any) {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    summary: String(row.description ?? ""),
    source_name: String(row.agency ?? ""),
    funder_name: String(row.agency ?? ""),
    location_scope: ensureArray(row.geographies).join(", "),
    deadline_at: row.deadline ?? null,
    extracted_fields: {
      mission_areas: ensureArray(row.focusAreas),
    },
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get("orgId");

    if (!orgId) {
      return Response.json({ error: "Missing orgId" }, { status: 400 });
    }

    const pool = getPool();

    const orgResult = await pool.query(
      `
      SELECT
        id,
        mission,
        "entityType",
        "taxStatus",
        geographies,
        "focusAreas"
      FROM "Organization"
      WHERE id = $1
      `,
      [orgId]
    );

    if (orgResult.rows.length === 0) {
      return Response.json({ error: "Org not found" }, { status: 404 });
    }

    const org = normalizeOrg(orgResult.rows[0]);

    const oppResult = await pool.query(`
      SELECT
        id,
        title,
        description,
        agency,
        geographies,
        "focusAreas",
        deadline
      FROM "Opportunity"
    `);

    const opportunities = oppResult.rows.map(normalizeOpp);

    const matches = opportunities.map((opp) => {
      const result = scoreOpportunity(opp, org);

      return {
        opportunityId: opp.id,
        title: opp.title,
        score: result.fitScore,
        reasons: result.fitReasons,
      };
    });

    matches.sort((a, b) => b.score - a.score);

    return Response.json(matches);
  } catch (err) {
    console.error("MATCH ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
