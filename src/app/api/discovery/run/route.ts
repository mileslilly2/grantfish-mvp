export const runtime = "nodejs";

import { ensureArray } from "@/lib/ensure-array";
import { runMockGrantDiscovery } from "@/lib/mock-discovery";
import { getPool } from "@/lib/pg";

type RequestBody = {
  organizationId?: string;
  orgId?: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  mission: string;
  entityType: string;
  geographies: unknown;
  focusAreas: unknown;
  taxStatus: string;
};

function textList(values: Array<string | null | undefined>): string[] {
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function deriveGeographies(
  row: Awaited<ReturnType<typeof runMockGrantDiscovery>>[number]
): string[] {
  const metadata = row.metadata ?? {};
  const locationScope =
    typeof metadata.location_scope === "string" ? metadata.location_scope : null;
  const region = typeof metadata.region === "string" ? metadata.region : null;
  const countryValue = typeof metadata.country === "string" ? metadata.country : null;
  const country =
    countryValue === "US" ? "United States" : countryValue;

  return Array.from(new Set(textList([locationScope, region, country])));
}

function deriveDescription(
  row: Awaited<ReturnType<typeof runMockGrantDiscovery>>[number]
): string {
  const parts = textList([row.summary, row.eligibilityText, row.requirementsText]);
  return parts.join("\n\n");
}

function deriveAmount(
  row: Awaited<ReturnType<typeof runMockGrantDiscovery>>[number]
): number | null {
  const preferred = row.amountMax ?? row.amountMin;
  if (typeof preferred !== "number" || !Number.isFinite(preferred)) {
    return null;
  }

  return Math.round(preferred);
}

function deriveFocusAreas(
  row: Awaited<ReturnType<typeof runMockGrantDiscovery>>[number]
): string[] {
  return ensureArray(row.extractedFields?.mission_areas);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const organizationId = String(body.organizationId ?? body.orgId ?? "").trim();

    if (!organizationId) {
      return Response.json({ error: "Missing organizationId" }, { status: 400 });
    }

    const pool = getPool();
    const orgResult = await pool.query<OrganizationRow>(
      `
      SELECT
        id,
        name,
        mission,
        "entityType",
        geographies,
        "focusAreas",
        "taxStatus"
      FROM "Organization"
      WHERE id = $1
      `,
      [organizationId]
    );

    if (orgResult.rows.length === 0) {
      return Response.json({ error: "Organization not found" }, { status: 404 });
    }

    const organization = orgResult.rows[0];
    console.info(
      `[discovery-route] starting discovery for organizationId=${organizationId}`
    );

    const discovered = await runMockGrantDiscovery({
      mission: organization.mission,
      focusAreas: ensureArray(organization.focusAreas),
      geographies: ensureArray(organization.geographies),
    });

    let savedCount = 0;
    const savedOpportunityIds: string[] = [];

    for (const item of discovered) {
      const title = item.title.trim();
      const agency = String(item.funderName ?? item.sourceName ?? "").trim();
      const description = deriveDescription(item);
      const geographies = deriveGeographies(item);
      const focusAreas = deriveFocusAreas(item);
      const amount = deriveAmount(item);
      const deadline = item.deadlineAt ? new Date(item.deadlineAt) : null;

      const existing = await pool.query<{ id: string }>(
        `
        SELECT id
        FROM "Opportunity"
        WHERE title = $1
          AND agency = $2
          AND (
            (deadline IS NULL AND $3::timestamptz IS NULL)
            OR deadline = $3
          )
        LIMIT 1
        `,
        [title, agency, deadline]
      );

      if (existing.rows.length > 0) {
        const updateResult = await pool.query<{ id: string }>(
          `
          UPDATE "Opportunity"
          SET
            description = $2,
            geographies = $3::text[],
            "focusAreas" = $4::text[],
            amount = $5,
            deadline = $6
          WHERE id = $1
          RETURNING id
          `,
          [
            existing.rows[0].id,
            description,
            geographies,
            focusAreas,
            amount,
            deadline,
          ]
        );

        savedOpportunityIds.push(updateResult.rows[0].id);
        savedCount += 1;
        continue;
      }

      const insertResult = await pool.query<{ id: string }>(
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
        RETURNING id
        `,
        [title, description, agency, geographies, focusAreas, amount, deadline]
      );

      savedOpportunityIds.push(insertResult.rows[0].id);
      savedCount += 1;
    }

    const usedLive = discovered.some(
      (item) => item.metadata?.live_source === true
    );

    console.info(
      `[discovery-route] completed discovery mode=${
        usedLive ? "live" : "mock"
      } discovered=${discovered.length} saved=${savedCount}`
    );

    return Response.json({
      organizationId,
      mode: usedLive ? "live" : "mock",
      discoveredCount: discovered.length,
      savedCount,
      opportunityIds: savedOpportunityIds,
    });
  } catch (err) {
    console.error("DISCOVERY RUN ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
