import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const orgs = await prisma.organization.findMany();
    return Response.json(orgs);
  } catch (err) {
    console.error("GET ORGS ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const org = await prisma.organization.create({
      data: body,
    });

    return Response.json(org);
  } catch (err) {
    console.error("CREATE ORG ERROR:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
