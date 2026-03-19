import type {
  Opportunity as PrismaOpportunity,
  Organization as PrismaOrganization,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { scoreMatch } from "@/lib/match";
import type { Opportunity } from "@/types/opportunity";
import type { Organization } from "@/types/organization";

export const runtime = "nodejs";

type MatchResult = {
  opportunity: Opportunity;
  score: number;
};

function serializeOrganization(record: PrismaOrganization): Organization {
  return {
    id: record.id,
    name: record.name,
    entityType: record.entityType,
    mission: record.mission,
    geographies: record.geographies,
    focusAreas: record.focusAreas,
    taxStatus: record.taxStatus,
    createdAt: record.createdAt.toISOString(),
  };
}

function serializeOpportunity(record: PrismaOpportunity): Opportunity {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    agency: record.agency,
    geographies: record.geographies,
    focusAreas: record.focusAreas,
    amount: record.amount ?? undefined,
    deadline: record.deadline?.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
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
