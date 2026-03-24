import type { Organization as PrismaOrganization } from "@prisma/client";

import { getPrisma } from "@/lib/db";
import { ensureArray } from "@/lib/ensure-array";
import type { Organization } from "@/types/organization";

export const runtime = "nodejs";

export async function GET() {
  try {
    const prisma = await getPrisma();
    const records: PrismaOrganization[] = await prisma.organization.findMany();
    const orgs: Organization[] = records.map((org) => ({
      id: org.id,
      name: org.name,
      entityType: org.entityType,
      mission: org.mission,
      geographies: org.geographies,
      focusAreas: org.focusAreas,
      taxStatus: org.taxStatus,
    }));
    return Response.json(orgs);
  } catch (err) {
    console.error("GET ORGS ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const prisma = await getPrisma();
    const body = await req.json();

    console.log("POST /api/organizations body:", body);
    console.log("POST /api/organizations body.geographies:", body?.geographies);
    console.log("POST /api/organizations body.focusAreas:", body?.focusAreas);

    const geographies = ensureArray(body?.geographies);
    const focusAreas = ensureArray(body?.focusAreas);

    const data = {
      name: String(body.name ?? "").trim(),
      entityType: String(body.entityType ?? "").trim(),
      mission: String(body.mission ?? "").trim(),
      geographies,
      focusAreas,
      taxStatus: String(body.taxStatus ?? "").trim(),
    };

    console.log("POST /api/organizations prisma.organization.create data:", data);

    const record: PrismaOrganization = await prisma.organization.create({ data });

    const org: Organization = {
      id: record.id,
      name: record.name,
      entityType: record.entityType,
      mission: record.mission,
      geographies: record.geographies,
      focusAreas: record.focusAreas,
      taxStatus: record.taxStatus,
    };

    return Response.json(org);
  } catch (err) {
    console.error("CREATE ORG ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
