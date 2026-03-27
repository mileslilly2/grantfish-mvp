import { ensureArray } from "@/lib/ensure-array";
import { getPool } from "@/lib/pg";

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
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    agency: String(row.agency ?? ""),
    geographies: ensureArray(row.geographies),
    focusAreas: ensureArray(row.focusAreas),
    amount:
      typeof row.amount === "number"
        ? row.amount
        : row.amount != null
        ? Number(row.amount)
        : undefined,
    deadline:
      row.deadline instanceof Date
        ? row.deadline.toISOString()
        : row.deadline
        ? String(row.deadline)
        : undefined,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? ""),
  };
}

export async function GET() {
  try {
    const pool = getPool();

    const result = await pool.query(`
      SELECT
        id,
        title,
        description,
        agency,
        geographies,
        "focusAreas",
        amount,
        deadline,
        "createdAt"
      FROM "Opportunity"
      ORDER BY "createdAt" DESC
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
    const amount =
      typeof body?.amount === "number" && Number.isFinite(body.amount)
        ? body.amount
        : null;
    const deadline = body?.deadline ? new Date(body.deadline) : null;

    const result = await pool.query(
      `
      INSERT INTO "Opportunity" (
        id,
        title,
        description,
        agency,
        geographies,
        "focusAreas",
        amount,
        deadline
      )
      VALUES (
        gen_random_uuid()::text,
        $1,
        $2,
        $3,
        $4::text[],
        $5::text[],
        $6,
        $7
      )
      RETURNING
        id,
        title,
        description,
        agency,
        geographies,
        "focusAreas",
        amount,
        deadline,
        "createdAt"
      `,
      [title, description, agency, geographies, focusAreas, amount, deadline]
    );

    return Response.json(serializeRow(result.rows[0]));
  } catch (err) {
    console.error("CREATE OPPORTUNITY ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
