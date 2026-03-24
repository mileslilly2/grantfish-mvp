export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";

export async function GET() {
  const prisma = await getPrisma();
  const result = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;

  return NextResponse.json({
    ok: true,
    dbTime: result[0]?.now ?? null,
  });
}
