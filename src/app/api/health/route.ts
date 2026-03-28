export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { ensureActiveAppSchema, getPool } from "@/lib/pg";

export async function GET() {
  const pool = getPool();
  await ensureActiveAppSchema();
  const result = await pool.query<{ now: Date }>(`SELECT NOW() as now`);

  return NextResponse.json({
    ok: true,
    dbTime: result.rows[0]?.now ?? null,
  });
}
