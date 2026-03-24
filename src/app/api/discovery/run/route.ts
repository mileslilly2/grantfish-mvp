export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "The raw-SQL discovery pipeline is quarantined from the active Prisma app path.",
    },
    { status: 410 }
  );
}
