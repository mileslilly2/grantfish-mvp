import { clearLogs, getLogs } from "@/lib/logStore";

export async function GET() {
  return Response.json(getLogs());
}

export async function DELETE() {
  clearLogs();
  return Response.json({ ok: true });
}
