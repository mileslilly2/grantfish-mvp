export const runtime = "nodejs";

import type { Opportunity as PrismaOpportunity } from "@prisma/client";

import { getPrisma } from "@/lib/db";
import { ensureArray, safeArray } from "@/lib/ensure-array";

type OpportunityResponse = {
  id: string;
  title: string;
  description: string;
  agency: string;
  geographies: string[];
  focusAreas: string[];
  amount?: number;
  deadline?: string;
  createdAt: string;
};

function serializeOpportunity(record: PrismaOpportunity): OpportunityResponse {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    agency: record.agency,
    geographies: ensureArray(record.geographies),
    focusAreas: ensureArray(record.focusAreas),
    amount: record.amount ?? undefined,
    deadline: record.deadline?.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const prisma = getPrisma();
    const records: PrismaOpportunity[] = await prisma.opportunity.findMany({
      orderBy: { createdAt: "desc" },
    });
    const opportunities: OpportunityResponse[] = safeArray<PrismaOpportunity>(records).map(
      serializeOpportunity
    );

    return Response.json(opportunities);
  } catch (err) {
    console.error("GET OPPORTUNITIES ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const prisma = getPrisma();
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      agency?: string;
      geographies?: string | string[];
      focusAreas?: string | string[];
      amount?: number;
      deadline?: string;
    };

    const record: PrismaOpportunity = await prisma.opportunity.create({
      data: {
        title: String(body.title ?? "").trim(),
        description: String(body.description ?? "").trim(),
        agency: String(body.agency ?? "").trim(),
        geographies: ensureArray(body.geographies),
        focusAreas: ensureArray(body.focusAreas),
        amount:
          typeof body.amount === "number" && Number.isFinite(body.amount)
            ? body.amount
            : null,
        deadline: body.deadline ? new Date(body.deadline) : null,
      },
    });

    return Response.json(serializeOpportunity(record));
  } catch (err) {
    console.error("CREATE OPPORTUNITY ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
