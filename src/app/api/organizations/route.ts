import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import type { OrganizationSummary } from "@/types/organization";

type OrganizationRow = OrganizationSummary;

function toTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry).trim())
    .filter(Boolean);
}

function mapOrganizationRow(row: Record<string, unknown>): OrganizationRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    entity_type: String(row.entity_type ?? ""),
    mission: String(row.mission ?? ""),
    geographies: toTextArray(row.geographies),
    focus_areas: toTextArray(row.focus_areas),
    tax_status:
      row.tax_status === null || row.tax_status === undefined
        ? null
        : String(row.tax_status),
  };
}

export async function GET() {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        entity_type,
        mission,
        geographies,
        focus_areas,
        tax_status
      FROM organization_profiles
      ORDER BY name ASC
      `
    );

    return NextResponse.json(result.rows.map(mapOrganizationRow));
  } catch (error) {
    console.error("List organizations error:", error);

    return NextResponse.json(
      { error: "Failed to load organizations" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const entityType = String(body?.entity_type ?? "").trim() || "nonprofit";
    const mission = String(body?.mission ?? "").trim();
    const geographies = toTextArray(body?.geographies);
    const focusAreas = toTextArray(body?.focus_areas);
    const taxStatus = String(body?.tax_status ?? "").trim() || null;

    const result = await pool.query(
      `
      INSERT INTO organization_profiles (
        name,
        entity_type,
        mission,
        geographies,
        focus_areas,
        tax_status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        name,
        entity_type,
        mission,
        geographies,
        focus_areas,
        tax_status
      `,
      [name, entityType, mission, geographies, focusAreas, taxStatus]
    );

    return NextResponse.json(mapOrganizationRow(result.rows[0]), {
      status: 201,
    });
  } catch (error) {
    console.error("Create organization error:", error);

    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}
