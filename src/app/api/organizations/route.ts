import { Pool } from "pg";

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

const globalForPg = globalThis as unknown as {
  pool?: Pool;
};

function getPool(): Pool {
  if (!globalForPg.pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }

    globalForPg.pool = new Pool({ connectionString });
  }

  return globalForPg.pool;
}

function ensureArray(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    if (value.startsWith("{") && value.endsWith("}")) {
      return value
        .slice(1, -1)
        .split(",")
        .map((v) => v.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim())
        .filter(Boolean);
    }

    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [String(value).trim()].filter(Boolean);
}

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