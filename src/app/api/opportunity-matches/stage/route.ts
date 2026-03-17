import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

const ALLOWED_STAGES = new Set(["new", "review", "shortlist", "archived"]);

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const organizationProfileId = String(
      body?.organizationProfileId ?? ""
    ).trim();
    const opportunityId = String(body?.opportunityId ?? "").trim();
    const pipelineStage = String(body?.pipelineStage ?? "").trim();

    if (!organizationProfileId || !opportunityId || !pipelineStage) {
      return NextResponse.json(
        {
          error:
            "organizationProfileId, opportunityId, and pipelineStage are required",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_STAGES.has(pipelineStage)) {
      return NextResponse.json(
        { error: "Invalid pipeline stage" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
      UPDATE opportunity_matches
      SET pipeline_stage = $3
      WHERE organization_profile_id = $1
        AND opportunity_id = $2
      RETURNING *
      `,
      [organizationProfileId, opportunityId, pipelineStage]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Opportunity match not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Update opportunity match stage error:", error);

    return NextResponse.json(
      { error: "Failed to update opportunity match stage" },
      { status: 500 }
    );
  }
}
