import { createHash } from "node:crypto";
import { ensureArray, safeArray } from "@/lib/ensure-array";
import { addLog } from "@/lib/logStore";
import type { NormalizedOpportunity } from "@/types/normalized";
import type { OpportunityStatus } from "@/types/db";

type OrgLike = {
  mission?: string;
  focus_areas?: string[] | string;
  geographies?: string[] | string;
  focusAreas?: string[] | string;
};

type SourceType = "government_portal" | "foundation_site";

type LiveSource = {
  name: string;
  sourceType: SourceType;
  url: string;
  browserProfile?: "lite" | "stealth";
  maxOpportunities?: number;
  goal: (org: OrgLike) => string;
};

export type DiscoverySourceOutcome = {
  sourceName: string;
  status:
    | "queued"
    | "running"
    | "success"
    | "empty"
    | "timeout"
    | "error"
    | "cancelled";
  opportunityCount: number;
  message: string;
};

export type DiscoveryLogEntry = {
  step: string;
  status: "pending" | "done";
  duration?: number;
};

export type DiscoveryExecutionResult = {
  mode: "live" | "mock";
  opportunities: NormalizedOpportunity[];
  sourceOutcomes: DiscoverySourceOutcome[];
};

export type DiscoverySourceResult = {
  opportunities: NormalizedOpportunity[];
  outcome: DiscoverySourceOutcome;
};

type DiscoveryExecutionCallbacks = {
  onLog?: (entry: DiscoveryLogEntry) => void | Promise<void>;
  onSourceStart?: (sourceName: string) => void | Promise<void>;
  onSourceResult?: (result: DiscoverySourceResult) => void | Promise<void>;
};

type TinyFishRunResponse = {
  result?: unknown;
  resultJson?: unknown;
  result_json?: unknown;
  error?: unknown;
};

type TinyFishAsyncStartResponse = {
  run_id?: unknown;
  error?: unknown;
};

type TinyFishBatchRun = {
  run_id?: unknown;
  status?: unknown;
  result?: unknown;
  error?: unknown;
  started_at?: unknown;
  finished_at?: unknown;
};

type TinyFishBatchRunsResponse = {
  data?: TinyFishBatchRun[];
  not_found?: unknown;
};

type TinyFishStreamEvent = TinyFishRunResponse & {
  type?: unknown;
  purpose?: unknown;
  duration?: unknown;
  message?: unknown;
};

type RawOpportunity = Record<string, unknown>;

const DEFAULT_TINYFISH_SOURCE_TIMEOUT_MS = 120_000;
const MAX_KEYWORD_TERMS = 2;

export type PersistedDiscoverySourceState = {
  sourceName: string;
  localStatus:
    | "pending"
    | "queued"
    | "running"
    | "success"
    | "empty"
    | "timeout"
    | "error"
    | "cancelled";
  upstreamRunId?: string | null;
  upstreamStatus?: string | null;
  opportunityCount: number;
  message: string;
  lastCheckedAt?: string | null;
  finalError?: string | null;
  updatedAt: string;
};

async function emitLog(
  callbacks: DiscoveryExecutionCallbacks | undefined,
  step: string,
  status: "pending" | "done" = "done",
  duration?: number
) {
  addLog(step, status, duration);
  await callbacks?.onLog?.({ step, status, duration });
}

function truncateForError(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "(empty response body)";
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function formatTinyFishHttpError(params: {
  source: LiveSource;
  status: number;
  bodyText: string;
  contentType: string | null;
}): string {
  const { source, status, bodyText, contentType } = params;
  const parsed = tryParseJson(bodyText);
  const normalizedBody = bodyText.toLowerCase();

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const message =
      stableText(record.message) ||
      stableText(record.error) ||
      stableText(record.detail);

    if (message) {
      if (message.toLowerCase().includes("timeout")) {
        return `${source.name} TinyFish upstream timeout (${status}): ${message}`;
      }
      return `${source.name} TinyFish upstream error (${status}): ${message}`;
    }
  }

  if (normalizedBody.includes("timeout")) {
    return `${source.name} TinyFish upstream timeout (${status}): ${truncateForError(bodyText)}`;
  }

  const responseKind =
    contentType && contentType.toLowerCase().includes("json")
      ? "JSON"
      : "non-JSON";

  return `${source.name} TinyFish upstream error (${status}, ${responseKind} response): ${truncateForError(bodyText)}`;
}

function parseTinyFishStreamEvent(
  rawPayload: string,
  source: LiveSource
): TinyFishStreamEvent {
  try {
    return JSON.parse(rawPayload) as TinyFishStreamEvent;
  } catch {
    throw new Error(
      `${source.name} TinyFish returned a non-JSON stream event: ${truncateForError(rawPayload)}`
    );
  }
}

function findLiveSourceByName(sourceName: string): LiveSource | null {
  return LIVE_SOURCES.find((source) => source.name === sourceName) ?? null;
}

function hasOpportunityArray(
  value: unknown
): value is { opportunities: RawOpportunity[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "opportunities" in value &&
    Array.isArray(value.opportunities)
  );
}

function getFocusAreas(org: OrgLike): string[] {
  return ensureArray(org.focus_areas ?? org.focusAreas);
}

function getGeographies(org: OrgLike): string[] {
  return ensureArray(org.geographies);
}

function buildKeywords(org: OrgLike): string {
  const parts = safeArray([
    ...(getFocusAreas(org) || []),
    ...(getGeographies(org) || []),
  ])
    .map((x) => String(x).trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "arts, youth, education, West Virginia, Appalachia";
}

function buildMissionSnippet(org: OrgLike): string {
  const mission = stableText(org.mission);
  if (!mission) {
    return "Nonprofit seeking mission-aligned grant opportunities.";
  }

  return mission.length > 140 ? `${mission.slice(0, 140).trim()}...` : mission;
}

function getPriorityTerms(org: OrgLike): string[] {
  const focusAreas = getFocusAreas(org)
    .map((value) => stableText(value))
    .filter(Boolean);
  const geographies = getGeographies(org)
    .map((value) => stableText(value))
    .filter(Boolean);

  return safeArray([...focusAreas, ...geographies]).slice(0, MAX_KEYWORD_TERMS);
}

function buildPrimarySearchQuery(org: OrgLike, fallback: string): string {
  const terms = getPriorityTerms(org);
  if (terms.length === 0) {
    return fallback;
  }

  return terms.join(" ");
}

function buildFallbackSearchQuery(
  org: OrgLike,
  fallbackTerms: string[]
): string | null {
  const focusAreas = getFocusAreas(org)
    .map((value) => stableText(value))
    .filter(Boolean);
  const geographies = getGeographies(org)
    .map((value) => stableText(value))
    .filter(Boolean);
  const candidateTerms = safeArray([...focusAreas.slice(0, 1), ...geographies.slice(0, 1)])
    .filter(Boolean);

  if (candidateTerms.length > 0) {
    return candidateTerms.join(" ");
  }

  return fallbackTerms.length > 0 ? fallbackTerms.join(" ") : null;
}

function getSourceTimeoutMs(): number {
  const raw = Number(process.env.GRANTFISH_TINYFISH_SOURCE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 5_000
    ? raw
    : DEFAULT_TINYFISH_SOURCE_TIMEOUT_MS;
}

function buildGoalInstructions(params: {
  org: OrgLike;
  sourceLabel: string;
  sourceSpecificSteps: string[];
  locationHint?: string;
  funderHint?: string;
  primarySearchQuery: string;
  fallbackSearchQuery?: string | null;
  maxOpportunities?: number;
  maxDetailPages?: number;
}) {
  const {
    org,
    sourceLabel,
    sourceSpecificSteps,
    locationHint,
    funderHint,
    primarySearchQuery,
    fallbackSearchQuery,
    maxOpportunities = 2,
    maxDetailPages = 1,
  } = params;

  return `
You are extracting grant opportunities for a nonprofit from ${sourceLabel}.

Organization mission summary: ${buildMissionSnippet(org)}
Primary search query: ${primarySearchQuery}
${fallbackSearchQuery ? `Fallback search query: ${fallbackSearchQuery}` : ""}
Priority keywords: ${buildKeywords(org)}
${locationHint ? `Location priority: ${locationHint}` : ""}
${funderHint ? `Funder/context: ${funderHint}` : ""}

Work efficiently:
1. Use the site's visible search or filter tools immediately with the primary search query.
2. If the first search is clearly irrelevant or empty, try the fallback query once at most.
3. Review only the first results page or the visible grants overview.
4. Open at most ${maxDetailPages} promising detail page${maxDetailPages === 1 ? "" : "s"}.
5. Stop once you have found up to ${maxOpportunities} relevant current opportunit${maxOpportunities === 1 ? "y" : "ies"}.
6. If nothing relevant is visible quickly, return an empty opportunities array instead of continuing to browse.
7. Do not loop through many keywords, agencies, or sections. Do not keep exploring after the first fast pass.

Source-specific steps:
${sourceSpecificSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

Return ONLY valid JSON with this shape:
{
  "opportunities": [
    {
      "title": "string",
      "summary": "string or null",
      "status": "open | closed | rolling | draft | unknown",
      "deadlineAt": "ISO-8601 datetime string or null",
      "funderName": "string or null",
      "amountMin": number or null,
      "amountMax": number or null,
      "currency": "USD",
      "eligibilityText": "string or null",
      "requirementsText": "string or null",
      "applicationUrl": "absolute URL or null",
      "sourceUrl": "absolute URL for the listing or detail page",
      "canonicalUrl": "absolute canonical/detail URL if available, otherwise sourceUrl",
      "missionAreas": ["string"],
      "entityTypes": ["string"],
      "locationScope": "string or null",
      "country": "US",
      "region": "string or null"
    }
  ]
}
`.trim();
}

function stableNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

const LIVE_SOURCES: LiveSource[] = [
  {
    name: "Grants.gov",
    sourceType: "government_portal",
    url: "https://www.grants.gov/search-grants",
    browserProfile: "lite",
    maxOpportunities: 2,
    goal: (org) =>
      buildGoalInstructions({
        org,
        sourceLabel: "Grants.gov",
        sourceSpecificSteps: [
          "Search directly for current grant listings using the query and visible status filters if available.",
          "Prefer open opportunities relevant to nonprofits and skip clearly expired or unrelated federal notices.",
          "Inspect only the top 1 or 2 promising results and return early if relevance is weak.",
        ],
        locationHint: getGeographies(org).join(", ") || "United States",
        primarySearchQuery: buildPrimarySearchQuery(org, "nonprofit grant"),
        fallbackSearchQuery: buildFallbackSearchQuery(org, ["community grant"]),
        maxOpportunities: 2,
        maxDetailPages: 1,
      }),
  },
  {
    name: "WV State Grants",
    sourceType: "government_portal",
    url: "https://grants.wv.gov/grants/Pages/default.aspx",
    browserProfile: "lite",
    maxOpportunities: 1,
    goal: (org) =>
      buildGoalInstructions({
        org,
        sourceLabel: "WV State Grants",
        sourceSpecificSteps: [
          "Review only the main West Virginia funding opportunities listings visible on the landing page.",
          "Do not browse into multiple agency sites or deep navigation trees.",
          "If no clearly relevant statewide opportunity is visible quickly, return empty immediately.",
        ],
        locationHint: "West Virginia",
        funderHint: "West Virginia state funding opportunities",
        primarySearchQuery: buildPrimarySearchQuery(org, "West Virginia nonprofit grant"),
        fallbackSearchQuery: null,
        maxOpportunities: 1,
        maxDetailPages: 1,
      }),
  },
  {
    name: "National Endowment for the Arts",
    sourceType: "government_portal",
    url: "https://www.arts.gov/grants",
    browserProfile: "lite",
    maxOpportunities: 2,
    goal: (org) =>
      buildGoalInstructions({
        org,
        sourceLabel: "National Endowment for the Arts",
        sourceSpecificSteps: [
          "Review only the current NEA grants overview page and the most relevant visible program for organizations.",
          "Prefer organization-focused programs and skip individual artist opportunities.",
          "Do not branch into multiple program families or archive pages.",
        ],
        locationHint: "United States",
        funderHint: "National Endowment for the Arts",
        primarySearchQuery: buildPrimarySearchQuery(org, "arts nonprofit organization"),
        fallbackSearchQuery: buildFallbackSearchQuery(org, ["arts organization"]),
        maxOpportunities: 2,
        maxDetailPages: 1,
      }),
  },
];

function stableText(value: unknown): string {
  return String(value ?? "").trim();
}

function formatTinyFishRunError(sourceName: string, value: unknown): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const message =
      stableText(record.message) ||
      stableText(record.error) ||
      stableText(record.detail);

    if (message) {
      return `${sourceName} failed upstream: ${message}`;
    }
  }

  const message = stableText(value);
  return message ? `${sourceName} failed upstream: ${message}` : `${sourceName} failed upstream`;
}

function normalizeOpportunityStatus(value: unknown): OpportunityStatus {
  switch (stableText(value).toLowerCase()) {
    case "open":
    case "closed":
    case "rolling":
    case "draft":
    case "unknown":
      return stableText(value).toLowerCase() as OpportunityStatus;
    default:
      return "open";
  }
}

function makeDedupeKey(sourceName: string, title: string, deadlineAt?: string | null, canonicalUrl?: string | null) {
  const raw = [sourceName, title, deadlineAt ?? "", canonicalUrl ?? ""].join("|").toLowerCase();
  return createHash("sha256").update(raw).digest("hex");
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeOpportunity(
  rawItem: RawOpportunity,
  source: LiveSource
): NormalizedOpportunity | null {
  const title = stableText(rawItem.title);
  if (!title) return null;

  const sourceUrl = stableText(rawItem.sourceUrl) || source.url;
  const canonicalUrl = stableText(rawItem.canonicalUrl) || sourceUrl;
  const deadlineAt = toIsoOrNull(rawItem.deadlineAt);

  return {
    type: "grant" as const,
    sourceName: source.name,
    sourceType: source.sourceType,
    sourceUrl,
    canonicalUrl,
    title,
    summary: stableText(rawItem.summary) || null,
    status: normalizeOpportunityStatus(rawItem.status),
    deadlineAt,
    funderName: stableText(rawItem.funderName) || source.name,
    amountMin: toNumberOrNull(rawItem.amountMin),
    amountMax: toNumberOrNull(rawItem.amountMax),
    currency: stableText(rawItem.currency) || "USD",
    eligibilityText: stableText(rawItem.eligibilityText) || null,
    requirementsText: stableText(rawItem.requirementsText) || null,
    applicationUrl: stableText(rawItem.applicationUrl) || canonicalUrl,
    extractedFields: {
      mission_areas: Array.isArray(rawItem.missionAreas) ? rawItem.missionAreas : [],
      entity_types: Array.isArray(rawItem.entityTypes) ? rawItem.entityTypes : [],
    },
    metadata: {
      live_source: true,
      location_scope: rawItem.locationScope ?? null,
      country: rawItem.country ?? "US",
      region: rawItem.region ?? null,
    },
    dedupeKey: makeDedupeKey(source.name, title, deadlineAt, canonicalUrl),
  };
}

function normalizeResultPayload(
  payload: unknown,
  source: LiveSource
): NormalizedOpportunity[] {
  const normalizedPayload =
    typeof payload === "string" ? tryParseJson(payload) ?? payload : payload;

  const items: RawOpportunity[] = Array.isArray(normalizedPayload)
    ? (normalizedPayload as RawOpportunity[])
    : hasOpportunityArray(normalizedPayload)
    ? normalizedPayload.opportunities
    : [];

  if (items.length === 0) {
    return [];
  }

  return safeArray<RawOpportunity>(items)
    .map((item) => normalizeOpportunity(item, source))
    .filter(isNormalizedOpportunity)
    .slice(0, source.maxOpportunities ?? 2);
}

function isNormalizedOpportunity(
  item: NormalizedOpportunity | null
): item is NormalizedOpportunity {
  return item !== null;
}

async function runTinyFishSource(
  source: LiveSource,
  org: OrgLike
): Promise<NormalizedOpportunity[]> {
  const apiKey = process.env.TINYFISH_API_KEY;
  const baseUrl = process.env.TINYFISH_BASE_URL || "https://agent.tinyfish.ai";

  if (!apiKey) {
    throw new Error("TINYFISH_API_KEY is missing");
  }

  const controller = new AbortController();
  const timeoutMs = getSourceTimeoutMs();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const start = await fetch(`${baseUrl}/v1/automation/run-sse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        url: source.url,
        goal: source.goal(org),
        browser_profile: source.browserProfile ?? "lite",
      }),
      signal: controller.signal,
    });

    if (!start.ok) {
      const bodyText = await start.text();
      throw new Error(
        formatTinyFishHttpError({
          source,
          status: start.status,
          bodyText,
          contentType: start.headers.get("content-type"),
        })
      );
    }

    const contentType = start.headers.get("content-type");
    if (
      contentType &&
      !contentType.toLowerCase().includes("text/event-stream")
    ) {
      const bodyText = await start.text();
      throw new Error(
        `${source.name} TinyFish returned a non-stream response (${
          start.status
        }, ${contentType}): ${truncateForError(bodyText)}`
      );
    }

    if (!start.body) {
      throw new Error(`${source.name} TinyFish run did not return a stream`);
    }

    const reader = start.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: unknown = null;

    const handleEvent = (rawEvent: string) => {
      const dataLines = safeArray<string>(rawEvent.split(/\r?\n/))
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

      if (dataLines.length === 0) {
        return false;
      }

      const event = parseTinyFishStreamEvent(dataLines.join("\n"), source);
      const eventType = stableText(event.type);

      if (eventType === "PROGRESS") {
        const purpose = stableText(event.purpose);
        if (purpose) {
          addLog(`${source.name}: ${purpose}`, "done", stableNumber(event.duration));
        }
        return false;
      }

      if (eventType === "COMPLETE") {
        result = event.resultJson ?? event.result_json ?? event.result;
        return true;
      }

      if (eventType === "ERROR") {
        const message =
          stableText(event.message) ||
          stableText(event.error) ||
          `${source.name} agent failed`;
        throw new Error(message);
      }

      return false;
    };

    let done = false;

    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), {
        stream: !done,
      });

      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (handleEvent(part)) {
          done = true;
          break;
        }
      }
    }

    if (!result && buffer.trim()) {
      handleEvent(buffer);
    }

    if (!result) {
      throw new Error(
        `${source.name} TinyFish stream ended without a COMPLETE event`
      );
    }

    return normalizeResultPayload(result, source);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" ||
        error.message.toLowerCase().includes("timeout"))
    ) {
      throw new Error(
        `${source.name} timed out after ${Math.round(timeoutMs / 1000)}s`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getTinyFishApiKey(): string {
  const apiKey = String(process.env.TINYFISH_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("TINYFISH_API_KEY is missing");
  }

  return apiKey;
}

function getTinyFishBaseUrl(): string {
  return String(process.env.TINYFISH_BASE_URL || "https://agent.tinyfish.ai").trim();
}

export function getLiveDiscoveryConfig() {
  const rawFlag = String(process.env.GRANTFISH_USE_LIVE_TINYFISH ?? "").trim();
  const normalizedFlag = rawFlag.toLowerCase();
  const useLive =
    normalizedFlag === "true" ||
    normalizedFlag === "1" ||
    normalizedFlag === "yes" ||
    normalizedFlag === "on";
  const apiKey = String(process.env.TINYFISH_API_KEY ?? "").trim();
  const hasKey = apiKey.length > 0;
  const baseUrl = getTinyFishBaseUrl();

  return {
    rawFlag,
    useLive,
    hasKey,
    hasBaseUrl: baseUrl.length > 0,
    baseUrl,
  };
}

export async function startLiveDiscoverySourceRuns(
  org: OrgLike = {}
): Promise<PersistedDiscoverySourceState[]> {
  const apiKey = getTinyFishApiKey();
  const baseUrl = getTinyFishBaseUrl();

  const states = await Promise.all(
    LIVE_SOURCES.map(async (source) => {
      try {
        const response = await fetch(`${baseUrl}/v1/automation/run-async`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
          },
          body: JSON.stringify({
            url: source.url,
            goal: source.goal(org),
            browser_profile: source.browserProfile ?? "lite",
          }),
        });

        const bodyText = await response.text();
        const parsed = tryParseJson(bodyText) as TinyFishAsyncStartResponse | undefined;

        if (!response.ok) {
          throw new Error(
            formatTinyFishHttpError({
              source,
              status: response.status,
              bodyText,
              contentType: response.headers.get("content-type"),
            })
          );
        }

        const runId = stableText(parsed?.run_id);
        if (!runId) {
          throw new Error(`${source.name} did not return a TinyFish run id`);
        }

        return {
          sourceName: source.name,
          localStatus: "queued" as const,
          upstreamRunId: runId,
          upstreamStatus: "PENDING",
          opportunityCount: 0,
          message: `${source.name} queued upstream`,
          lastCheckedAt: null,
          finalError: null,
          updatedAt: new Date().toISOString(),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          sourceName: source.name,
          localStatus: "error" as const,
          upstreamRunId: null,
          upstreamStatus: null,
          opportunityCount: 0,
          message,
          lastCheckedAt: new Date().toISOString(),
          finalError: message,
          updatedAt: new Date().toISOString(),
        };
      }
    })
  );

  return states;
}

export async function pollLiveDiscoverySourceRuns(
  sourceStates: PersistedDiscoverySourceState[]
): Promise<DiscoverySourceResult[]> {
  const apiKey = getTinyFishApiKey();
  const baseUrl = getTinyFishBaseUrl();
  const activeStates = sourceStates.filter(
    (state) =>
      state.upstreamRunId &&
      !["success", "empty", "error", "timeout", "cancelled"].includes(state.localStatus)
  );

  if (activeStates.length === 0) {
    return [];
  }

  const response = await fetch(`${baseUrl}/v1/runs/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      run_ids: activeStates.map((state) => state.upstreamRunId),
    }),
  });

  const bodyText = await response.text();
  const parsed = tryParseJson(bodyText) as TinyFishBatchRunsResponse | undefined;

  if (!response.ok) {
    throw new Error(
      `TinyFish run polling failed: ${truncateForError(bodyText)}`
    );
  }

  const records = Array.isArray(parsed?.data) ? parsed?.data : [];
  const recordByRunId = new Map(
    records.map((record) => [stableText(record.run_id), record] as const)
  );

  return activeStates.map<DiscoverySourceResult>((state) => {
    const source = findLiveSourceByName(state.sourceName);
    if (!source) {
      return {
        opportunities: [],
        outcome: {
          sourceName: state.sourceName,
          status: "error",
          opportunityCount: 0,
          message: `${state.sourceName} is no longer configured`,
        },
      };
    }

    const record = recordByRunId.get(stableText(state.upstreamRunId));
    const upstreamStatus = stableText(record?.status).toUpperCase();

    if (!record) {
      return {
        opportunities: [],
        outcome: {
          sourceName: state.sourceName,
          status: "error",
          opportunityCount: 0,
          message: `${state.sourceName} upstream run was not found`,
        },
      };
    }

    if (upstreamStatus === "PENDING") {
      return {
        opportunities: [],
        outcome: {
          sourceName: state.sourceName,
          status: "queued",
          opportunityCount: 0,
          message: `${state.sourceName} queued upstream`,
        },
      };
    }

    if (upstreamStatus === "RUNNING") {
      return {
        opportunities: [],
        outcome: {
          sourceName: state.sourceName,
          status: "running",
          opportunityCount: 0,
          message: `${state.sourceName} still running upstream`,
        },
      };
    }

    if (upstreamStatus === "CANCELLED") {
      return {
        opportunities: [],
        outcome: {
          sourceName: state.sourceName,
          status: "cancelled",
          opportunityCount: 0,
          message: `${state.sourceName} was cancelled upstream`,
        },
      };
    }

    if (upstreamStatus === "FAILED") {
      return {
        opportunities: [],
        outcome: {
          sourceName: state.sourceName,
          status: "error",
          opportunityCount: 0,
          message: formatTinyFishRunError(state.sourceName, record.error),
        },
      };
    }

    if (upstreamStatus === "COMPLETED") {
      const opportunities = normalizeResultPayload(record.result, source);
      return {
        opportunities,
        outcome: {
          sourceName: state.sourceName,
          status: opportunities.length > 0 ? "success" : "empty",
          opportunityCount: opportunities.length,
          message:
            opportunities.length > 0
              ? `${state.sourceName} completed; ${opportunities.length} opportunit${
                  opportunities.length === 1 ? "y" : "ies"
                } ready`
              : `${state.sourceName} completed with no matching opportunities`,
        },
      };
    }

    return {
      opportunities: [],
      outcome: {
        sourceName: state.sourceName,
        status: "running",
        opportunityCount: 0,
        message: `${state.sourceName} upstream status: ${upstreamStatus || "unknown"}`,
      },
    };
  });
}

function dedupeByKey<T extends { dedupeKey: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.dedupeKey, item);
  }
  return Array.from(map.values());
}

function getMockFallback(): NormalizedOpportunity[] {
  return [
    {
      type: "grant",
      sourceName: "Demo Foundation",
      sourceType: "foundation_site",
      sourceUrl: "https://example.org/grants/1",
      canonicalUrl: "https://example.org/grants/1",
      title: "Rural Youth Arts Grant",
      summary: "Supports arts access for rural youth organizations.",
      status: "open",
      deadlineAt: "2026-04-15T23:59:00Z",
      funderName: "Demo Foundation",
      amountMin: 10000,
      amountMax: 25000,
      currency: "USD",
      eligibilityText: "501(c)(3) nonprofits in Appalachia.",
      requirementsText: "Budget, narrative, board list.",
      applicationUrl: "https://example.org/apply/1",
      extractedFields: {
        mission_areas: ["arts", "youth", "rural"],
        entity_types: ["nonprofit"],
      },
      metadata: {},
      dedupeKey: "demo-foundation-rural-youth-arts-2026-04-15",
    },
    {
      type: "grant",
      sourceName: "Demo State Arts Office",
      sourceType: "government_portal",
      sourceUrl: "https://example.org/grants/2",
      canonicalUrl: "https://example.org/grants/2",
      title: "Community Arts Mini-Grant",
      summary: "Supports local public arts programming.",
      status: "open",
      deadlineAt: "2026-05-20T23:59:00Z",
      funderName: "Demo State Arts Office",
      amountMin: 2000,
      amountMax: 5000,
      currency: "USD",
      eligibilityText: "Open to nonprofits and local governments.",
      requirementsText: "Short narrative and budget.",
      applicationUrl: "https://example.org/apply/2",
      extractedFields: {
        mission_areas: ["arts", "community"],
        entity_types: ["nonprofit", "local government"],
      },
      metadata: {},
      dedupeKey: "demo-state-arts-mini-grant-2026-05-20",
    },
  ];
}

export async function runMockGrantDiscovery(
  org: OrgLike = {},
  callbacks?: DiscoveryExecutionCallbacks
): Promise<DiscoveryExecutionResult> {
  const config = getLiveDiscoveryConfig();

  console.info(
    `[discovery] config liveFlag=${config.rawFlag || "<unset>"} resolvedLive=${config.useLive} hasKey=${config.hasKey} hasBaseUrl=${config.hasBaseUrl}`
  );

  if (!config.useLive) {
    await emitLog(callbacks, "Live TinyFish disabled; using mock fallback");
    console.warn(
      `[discovery] using mock fallback because live discovery is disabled by GRANTFISH_USE_LIVE_TINYFISH=${config.rawFlag || "<unset>"}`
    );
    const opportunities = getMockFallback();
    await callbacks?.onSourceResult?.({
      opportunities,
      outcome: {
        sourceName: "Mock fallback",
        status: "success",
        opportunityCount: opportunities.length,
        message: `Mock fallback returned ${opportunities.length} opportunities`,
      },
    });
    return {
      mode: "mock",
      opportunities,
      sourceOutcomes: [
        {
          sourceName: "Mock fallback",
          status: "success",
          opportunityCount: opportunities.length,
          message: `Mock fallback returned ${opportunities.length} opportunities`,
        },
      ],
    };
  }

  if (!config.hasKey) {
    await emitLog(callbacks, "TinyFish API key missing; using mock fallback");
    console.warn(
      "[discovery] using mock fallback because TINYFISH_API_KEY is missing"
    );
    const opportunities = getMockFallback();
    await callbacks?.onSourceResult?.({
      opportunities,
      outcome: {
        sourceName: "Mock fallback",
        status: "success",
        opportunityCount: opportunities.length,
        message: `Mock fallback returned ${opportunities.length} opportunities`,
      },
    });
    return {
      mode: "mock",
      opportunities,
      sourceOutcomes: [
        {
          sourceName: "Mock fallback",
          status: "success",
          opportunityCount: opportunities.length,
          message: `Mock fallback returned ${opportunities.length} opportunities`,
        },
      ],
    };
  }

  await emitLog(callbacks, "Attempting live TinyFish discovery");
  console.info(
    `[discovery] attempting live TinyFish discovery via ${config.baseUrl}`
  );

  const sources = safeArray<LiveSource>(LIVE_SOURCES);
  const results = await Promise.all(
    sources.map(async (source) => {
      await emitLog(callbacks, `Starting ${source.name}`);
      await callbacks?.onSourceStart?.(source.name);

      try {
        const opportunities = await runTinyFishSource(source, org);
        const opportunityCount = opportunities.length;
        const outcome: DiscoverySourceOutcome = {
          sourceName: source.name,
          status: opportunityCount === 0 ? "empty" : "success",
          opportunityCount,
          message:
            opportunityCount === 0
              ? `${source.name} returned empty quickly`
              : `${source.name} returned ${opportunityCount} opportunit${
                  opportunityCount === 1 ? "y" : "ies"
                }`,
        };
        await emitLog(callbacks, outcome.message);
        await callbacks?.onSourceResult?.({ opportunities, outcome });
        return { opportunities, outcome };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const outcome: DiscoverySourceOutcome = {
          sourceName: source.name,
          status: errorMessage.toLowerCase().includes("timeout")
            ? "timeout"
            : "error",
          opportunityCount: 0,
          message: errorMessage,
        };
        await emitLog(callbacks, errorMessage);
        await callbacks?.onSourceResult?.({ opportunities: [], outcome });
        return { opportunities: [], outcome };
      }
    })
  );

  const sourceOutcomes = results.map((result) => result.outcome);

  const liveResults = results.flatMap((result) => result.opportunities);
  const emptyOutcomes = sourceOutcomes.filter(
    (outcome) => outcome.status === "empty"
  );

  if (liveResults.length > 0) {
    await emitLog(
      callbacks,
      `Live TinyFish returned ${liveResults.length} results before dedupe`
    );
    console.info(
      `[discovery] live TinyFish discovery succeeded with ${liveResults.length} normalized opportunities before dedupe`
    );
    return {
      mode: "live",
      opportunities: dedupeByKey(liveResults),
      sourceOutcomes,
    };
  }

  if (emptyOutcomes.length > 0) {
    await emitLog(callbacks, "Live TinyFish completed with no matching opportunities");
    console.info(
      `[discovery] live TinyFish completed with zero opportunities; emptySources=${emptyOutcomes.length}`
    );
    return {
      mode: "live",
      opportunities: [],
      sourceOutcomes,
    };
  }

  const errors = sourceOutcomes
    .filter((outcome) => outcome.status === "timeout" || outcome.status === "error")
    .map((outcome) => outcome.message);

  console.error(
    `[discovery] live TinyFish discovery failed across all sources: ${
      errors.length > 0 ? errors.join(" | ") : "No live opportunities returned"
    }`
  );
  await emitLog(callbacks, "All live TinyFish sources failed");

  throw new Error(
    errors.length > 0
      ? `All live sources failed: ${errors.join(" | ")}`
      : "No live opportunities returned from TinyFish"
  );
}
