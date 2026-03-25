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
  try {
    const prisma = getPrisma();

    const raw = await prisma.organization.findMany();

    console.log("RAW FROM PRISMA:", raw);

    const records = Array.isArray(raw) ? raw : [];

    const orgs = records.map((record) => {
      return {
        id: record.id,
        name: record.name,
        entityType: record.entityType,
        mission: record.mission,

        // 🔥 FORCE normalization HERE (not in serialize fn)
        geographies: Array.isArray(record.geographies)
          ? record.geographies
          : record.geographies
          ? [record.geographies]
          : [],

        focusAreas: Array.isArray(record.focusAreas)
          ? record.focusAreas
          : record.focusAreas
          ? [record.focusAreas]
          : [],

        taxStatus: record.taxStatus,
      };
    });

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
