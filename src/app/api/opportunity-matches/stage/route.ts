export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json(
    {
      error: "The raw-SQL opportunity-match staging endpoint is quarantined from the active Prisma app path.",
    },
    { status: 410 }
  );
}
