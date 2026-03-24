import type {
  Opportunity as PrismaOpportunity,
  Organization as PrismaOrganization,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/db";
import type { Opportunity } from "@/types/opportunity";
import type { Organization } from "@/types/organization";

export const runtime = "nodejs";

type MatchResult = {
  opportunity: Opportunity;
  score: number;
};

type NormalizedOrganization = Omit<Organization, "focusAreas" | "geographies"> & {
  focusAreas: string[];
  geographies: string[];
};

type NormalizedOpportunity = Omit<Opportunity, "focusAreas" | "geographies"> & {
  focusAreas: string[];
  geographies: string[];
};

export async function GET(req: NextRequest) {
  try {
    const [{ ensureArray }, { scoreMatch }] = await Promise.all([
      import("@/lib/ensure-array"),
      import("@/lib/match"),
    ]);
    const prisma = await getPrisma();
    const orgId = req.nextUrl.searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    const orgRecord = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!orgRecord) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const opportunityRecords = await prisma.opportunity.findMany({
      orderBy: { createdAt: "desc" },
    });

    const serializeOrganization = (record: PrismaOrganization): NormalizedOrganization => ({
      id: record.id,
      name: record.name,
      entityType: record.entityType,
      mission: record.mission,
      geographies: ensureArray(record.geographies),
      focusAreas: ensureArray(record.focusAreas),
      taxStatus: record.taxStatus,
    });

    const serializeOpportunity = (record: PrismaOpportunity): NormalizedOpportunity => ({
      id: record.id,
      title: record.title,
      description: record.description,
      agency: record.agency,
      geographies: ensureArray(record.geographies),
      focusAreas: ensureArray(record.focusAreas),
      amount: record.amount ?? undefined,
      deadline: record.deadline?.toISOString(),
      createdAt: record.createdAt.toISOString(),
    });

    const org = serializeOrganization(orgRecord);
    const matches: MatchResult[] = opportunityRecords
      .map((record) => {
        const opportunity = serializeOpportunity(record);

        return {
          opportunity,
          score: scoreMatch(org, opportunity),
        };
      })
      .sort((left, right) => right.score - left.score);

    return NextResponse.json(matches);
  } catch (err) {
    console.error("MATCH ERROR:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
