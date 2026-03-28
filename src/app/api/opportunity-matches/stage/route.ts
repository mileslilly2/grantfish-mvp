export const runtime = "nodejs";

import { ensureActiveAppSchema, getPool } from "@/lib/pg";

const ALLOWED_STAGES = new Set(["new", "review", "shortlist", "archived"]);

type RequestBody = {
  organizationId?: string;
  orgId?: string;
  organizationProfileId?: string;
  opportunityId?: string;
  pipelineStage?: string;
};

export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const organizationId = String(
      body.organizationId ?? body.orgId ?? body.organizationProfileId ?? ""
    ).trim();
    const opportunityId = String(body.opportunityId ?? "").trim();
    const pipelineStage = String(body.pipelineStage ?? "").trim();

    if (!organizationId || !opportunityId || !pipelineStage) {
      return Response.json(
        {
          error: "organizationId, opportunityId, and pipelineStage are required",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_STAGES.has(pipelineStage)) {
      return Response.json(
        {
          error:
            "Invalid pipelineStage. Use one of: new, review, shortlist, archived",
        },
        { status: 400 }
      );
    }

    const pool = getPool();
    await ensureActiveAppSchema();

    const result = await pool.query<{
      opportunityId: string;
      pipelineStage: string;
    }>(
      `
      UPDATE opportunity_matches
      SET pipeline_stage = $3
      WHERE organization_profile_id = $1
        AND opportunity_id = $2
      RETURNING
        opportunity_id AS "opportunityId",
        pipeline_stage AS "pipelineStage"
      `,
      [organizationId, opportunityId, pipelineStage]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: "Opportunity match not found" }, { status: 404 });
    }

    return Response.json(result.rows[0]);
  } catch (error) {
    console.error("Update opportunity match stage error:", error);
    return Response.json(
      { error: "Failed to update opportunity match stage" },
      { status: 500 }
    );
  }
}
