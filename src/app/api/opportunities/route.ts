import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  const organizationProfileId = req.nextUrl.searchParams.get("organizationProfileId");

  if (!organizationProfileId) {
    return NextResponse.json(
      { error: "organizationProfileId is required" },
      { status: 400 }
    );
  }

  const result = await pool.query(
    `
    SELECT
      o.id,
      o.title,
      o.funder_name,
      o.deadline_at,
      o.amount_min,
      o.amount_max,
      o.currency,
      o.status,
      o.application_url,
      o.source_name,
      m.fit_score,
      m.fit_reasons,
      m.pipeline_stage,
      m.starred,
      m.notes
    FROM opportunities o
    JOIN opportunity_matches m
      ON m.opportunity_id = o.id
    WHERE m.organization_profile_id = $1
      AND m.hidden = false
      AND m.fit_score > 0
      AND o.status <> 'closed'
      AND (o.deadline_at IS NULL OR o.deadline_at >= now())
    ORDER BY
      m.starred DESC,
      CASE
        WHEN o.status = 'closed'
          OR (o.deadline_at IS NOT NULL AND o.deadline_at < now())
        THEN 1
        ELSE 0
      END ASC,
      m.fit_score DESC,
      o.deadline_at ASC NULLS LAST
    LIMIT 100
    `,
    [organizationProfileId]
  );

  return NextResponse.json(result.rows);
}
