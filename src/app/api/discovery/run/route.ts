import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { addLog, clearLogs } from "@/lib/logStore";
import { runMockGrantDiscovery } from "@/lib/mock-discovery";
import { scoreOpportunity } from "@/lib/scoring";

export async function POST(req: NextRequest) {
  try {
    clearLogs();
    addLog("Starting discovery run");

    const body = await req.json();
    const { organizationProfileId } = body;

    if (!organizationProfileId) {
      return NextResponse.json(
        { error: "organizationProfileId is required" },
        { status: 400 }
      );
    }

    // Load organization profile
    const orgResult = await pool.query(
      `SELECT * FROM organization_profiles WHERE id = $1`,
      [organizationProfileId]
    );

    if (orgResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Organization profile not found" },
        { status: 404 }
      );
    }

    const org = orgResult.rows[0];
    addLog("Loaded organization profile");

    // Run discovery (mock for now)
    addLog("Running grant discovery");
    const discovered = await runMockGrantDiscovery(org);
    addLog(`Discovered ${discovered.length} opportunities`);
    addLog("Scoring matches");
    addLog("Saving opportunities");

    let inserted = 0;
    let updated = 0;

    for (const opp of discovered) {
      // Upsert opportunity
      const oppInsert = await pool.query(
        `
        INSERT INTO opportunities (
          type,
          source_name,
          source_type,
          source_url,
          canonical_url,
          title,
          summary,
          status,
          deadline_at,
          funder_name,
          amount_min,
          amount_max,
          currency,
          eligibility_text,
          requirements_text,
          application_url,
          extracted_fields,
          metadata,
          dedupe_key
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        )
        ON CONFLICT (dedupe_key)
        DO UPDATE SET
          last_seen_at = now(),
          updated_at = now()
        RETURNING *
        `,
        [
          opp.type,
          opp.sourceName,
          opp.sourceType,
          opp.sourceUrl,
          opp.canonicalUrl,
          opp.title,
          opp.summary,
          opp.status || "open",
          opp.deadlineAt,
          opp.funderName,
          opp.amountMin,
          opp.amountMax,
          opp.currency || "USD",
          opp.eligibilityText,
          opp.requirementsText,
          opp.applicationUrl,
          JSON.stringify(opp.extractedFields || {}),
          JSON.stringify(opp.metadata || {}),
          opp.dedupeKey
        ]
      );

      const opportunity = oppInsert.rows[0];

      // Score opportunity
      const score = scoreOpportunity(opportunity, org);

      // Upsert match
      const matchResult = await pool.query(
        `
        INSERT INTO opportunity_matches (
          organization_profile_id,
          opportunity_id,
          fit_score,
          fit_reasons,
          confidence_score
        )
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (organization_profile_id, opportunity_id)
        DO UPDATE SET
          fit_score = EXCLUDED.fit_score,
          fit_reasons = EXCLUDED.fit_reasons,
          confidence_score = EXCLUDED.confidence_score,
          updated_at = now()
        RETURNING *
        `,
        [
          organizationProfileId,
          opportunity.id,
          score.fitScore,
          JSON.stringify(score.fitReasons),
          score.confidenceScore
        ]
      );

      if (matchResult.rowCount === 1) {
        inserted++;
      } else {
        updated++;
      }
    }

    addLog("Discovery complete");

    return NextResponse.json({
      success: true,
      discovered: discovered.length,
      matchesInserted: inserted,
      matchesUpdated: updated
    });
  } catch (err) {
    console.error("Discovery run error:", err);

    return NextResponse.json(
      { error: "Discovery run failed" },
      { status: 500 }
    );
  }
}
