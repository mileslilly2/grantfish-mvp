import type { Organization } from "@/types/organization";

function tryParseJsonResponseBody(
  bodyText: string,
  contentType: string | null
): unknown {
  const trimmed = bodyText.trim();
  const looksJson =
    (contentType && contentType.toLowerCase().includes("application/json")) ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!looksJson || !trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

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
  funderName?: string | null;
  deadlineAt?: string | null;
  amountMin?: number | null;
  amountMax?: number | null;
  currency?: string | null;
  status?: string | null;
  applicationUrl?: string | null;
  sourceName?: string | null;
  pipelineStage?: string | null;
  notes?: string | null;
};

export const MATCH_STAGE_OPTIONS = [
  "new",
  "review",
  "shortlist",
  "archived",
] as const;

export type MatchStage = (typeof MATCH_STAGE_OPTIONS)[number];

export type DiscoveryRunResult = {
  organizationId: string;
  mode: "live" | "mock";
  discoveredCount: number;
  savedCount: number;
  opportunityIds: string[];
  sourceOutcomes?: Array<{
    sourceName: string;
    status: "success" | "timeout" | "error";
    opportunityCount: number;
    message: string;
  }>;
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

export async function updateMatchStage(params: {
  orgId: string;
  opportunityId: string;
  pipelineStage: MatchStage;
}): Promise<{ opportunityId: string; pipelineStage: MatchStage }> {
  const res = await fetch("/api/opportunity-matches/stage", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const bodyText = await res.text();
  const parsed = tryParseJsonResponseBody(
    bodyText,
    res.headers.get("content-type")
  ) as
    | {
        error?: string;
        opportunityId?: string;
        pipelineStage?: MatchStage;
      }
    | undefined;

  if (!res.ok) {
    if (parsed && typeof parsed.error === "string" && parsed.error.trim()) {
      throw new Error(parsed.error);
    }

    throw new Error(bodyText.trim() || "Failed to update opportunity stage");
  }

  if (!parsed?.opportunityId || !parsed.pipelineStage) {
    throw new Error("Stage update returned an invalid response");
  }

  return {
    opportunityId: parsed.opportunityId,
    pipelineStage: parsed.pipelineStage,
  };
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

  const bodyText = await res.text();
  const parsed = tryParseJsonResponseBody(
    bodyText,
    res.headers.get("content-type")
  ) as (DiscoveryRunResult & { error?: string }) | undefined;

  if (!res.ok) {
    if (parsed && typeof parsed.error === "string" && parsed.error.trim()) {
      throw new Error(parsed.error);
    }

    const message = bodyText.trim();
    throw new Error(message || "Failed to run discovery");
  }

  if (!parsed) {
    throw new Error("Discovery returned a non-JSON success response");
  }

  return parsed;
}

export async function fetchDiscoveryLogs(): Promise<DiscoveryLogEntry[]> {
  const res = await fetch("/api/logs", { cache: "no-store" });

  if (!res.ok) {
    throw new Error("Failed to fetch discovery logs");
  }

  return res.json();
}
