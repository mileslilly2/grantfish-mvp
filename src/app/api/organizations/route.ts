import { ensureArray } from "@/lib/ensure-array";
import { getPool } from "@/lib/pg";

export const runtime = "nodejs";

type OrganizationResponse = {
  id: string;
  name: string;
  entityType: string;
  mission: string;
  geographies: string[];
  focusAreas: string[];
  taxStatus: string;
};

function serializeRow(row: Record<string, unknown>): OrganizationResponse {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    entityType: String(row.entityType ?? ""),
    mission: String(row.mission ?? ""),
    geographies: ensureArray(row.geographies),
    focusAreas: ensureArray(row.focusAreas),
    taxStatus: String(row.taxStatus ?? ""),
  };
}

export async function GET() {
  try {
    const pool = getPool();

    const result = await pool.query(`
      SELECT
        id,
        name,
        "entityType",
        mission,
        geographies,
        "focusAreas",
        "taxStatus"
      FROM "Organization"
      ORDER BY name ASC
    `);

    return Response.json(result.rows.map(serializeRow));
  } catch (err) {
    console.error("GET ORGS ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const pool = getPool();
    const body = await req.json();

    const name = String(body?.name ?? "").trim();
    const entityType = String(body?.entityType ?? "").trim();
    const mission = String(body?.mission ?? "").trim();
    const geographies = ensureArray(body?.geographies);
    const focusAreas = ensureArray(body?.focusAreas);
    const taxStatus = String(body?.taxStatus ?? "").trim();

    const result = await pool.query(
      `
      INSERT INTO "Organization" (
        id,
        name,
        "entityType",
        mission,
        geographies,
        "focusAreas",
        "taxStatus"
      )
      VALUES (
        gen_random_uuid()::text,
        $1,
        $2,
        $3,
        $4::text[],
        $5::text[],
        $6
      )
      RETURNING
        id,
        name,
        "entityType",
        mission,
        geographies,
        "focusAreas",
        "taxStatus"
      `,
      [name, entityType, mission, geographies, focusAreas, taxStatus]
    );

    return Response.json(serializeRow(result.rows[0]));
  } catch (err) {
    console.error("CREATE ORG ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
