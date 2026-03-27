import type { Organization } from "@/types/organization";

export async function fetchOrganizations(): Promise<Organization[]> {
  const res = await fetch("/api/organizations");

  if (!res.ok) {
    throw new Error("Failed to fetch organizations");
  }

  const data: Organization[] = await res.json();
  return data;
}

export type Match = {
  opportunityId: string;
  title: string;
  score: number;
  reasons?: string[];
};

export type DiscoveryRunResult = {
  organizationId: string;
  mode: "live" | "mock";
  discoveredCount: number;
  savedCount: number;
  opportunityIds: string[];
};

export type DiscoveryLogEntry = {
  step: string;
  status: "pending" | "done";
  duration?: number;
};

export async function fetchMatches(orgId: string): Promise<Match[]> {
  const res = await fetch(`/api/match?orgId=${orgId}`);

  if (!res.ok) {
    throw new Error("Failed to fetch matches");
  }

  return res.json();
}

export async function runDiscovery(
  organizationId: string
): Promise<DiscoveryRunResult> {
  const res = await fetch("/api/discovery/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ organizationId }),
  });

  const data = (await res.json()) as DiscoveryRunResult & { error?: string };

  if (!res.ok) {
    throw new Error(data.error || "Failed to run discovery");
  }

  return data;
}

export async function fetchDiscoveryLogs(): Promise<DiscoveryLogEntry[]> {
  const res = await fetch("/api/logs", { cache: "no-store" });

  if (!res.ok) {
    throw new Error("Failed to fetch discovery logs");
  }

  return res.json();
}
