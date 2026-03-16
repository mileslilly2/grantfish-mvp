import { getLogs } from "@/lib/logStore";

export async function GET() {
  return Response.json(getLogs());
}
