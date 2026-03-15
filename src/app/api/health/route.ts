import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const result = await pool.query("SELECT NOW() as now");
  return NextResponse.json({
    ok: true,
    dbTime: result.rows[0].now,
  });
}