import type { Organization as PrismaOrganization } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { Organization } from "@/types/organization";

export const runtime = "nodejs";

export async function GET() {
  try {
    const records: PrismaOrganization[] = await prisma.organization.findMany();
    const orgs: Organization[] = records.map((org) => ({
      id: org.id,
      name: org.name,
      entityType: org.entityType,
      mission: org.mission,
      geographies: org.geographies,
      focusAreas: org.focusAreas,
      taxStatus: org.taxStatus,
      createdAt: org.createdAt.toISOString(),
    }));
    return Response.json(orgs);
  } catch (err) {
    console.error("GET ORGS ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const record: PrismaOrganization = await prisma.organization.create({
      data: body,
    });
    const org: Organization = {
      id: record.id,
      name: record.name,
      entityType: record.entityType,
      mission: record.mission,
      geographies: record.geographies,
      focusAreas: record.focusAreas,
      taxStatus: record.taxStatus,
      createdAt: record.createdAt.toISOString(),
    };

    return Response.json(org);
  } catch (err) {
    console.error("CREATE ORG ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
