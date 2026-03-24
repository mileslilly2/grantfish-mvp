import type { Organization as PrismaOrganization } from "@prisma/client";

import { getPrisma } from "@/lib/db";
import { ensureArray } from "@/lib/ensure-array";

export const runtime = "nodejs";

type OrganizationResponse = {
  id: string;
  name: string;
  entityType: string;
  mission: string;
  geographies: string[];
  focusAreas: string[];
  taxStatus: string;
};

function serializeOrganization(record: PrismaOrganization): OrganizationResponse {
  return {
    id: record.id,
    name: record.name,
    entityType: record.entityType,
    mission: record.mission,
    geographies: ensureArray(record.geographies),
    focusAreas: ensureArray(record.focusAreas),
    taxStatus: record.taxStatus,
  };
}

export async function GET() {
  console.log("ORGS_ROUTE_V3"); // 👈 ADD THIS LINE
  try {
    const prisma = getPrisma();
    const records = await prisma.organization.findMany();

    console.log("RECORDS RAW:", records);
    console.log("IS ARRAY:", Array.isArray(records));


    const orgs = records.map(serializeOrganization);
    return Response.json(orgs);
  } catch (err) {
    console.error("GET ORGS ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const prisma = getPrisma();
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
    return Response.json(serializeOrganization(record));
  } catch (err) {
    console.error("CREATE ORG ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
