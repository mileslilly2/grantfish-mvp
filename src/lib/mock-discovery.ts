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
  goal: (org: OrgLike) => string;
};

type TinyFishRunResponse = {
  result?: unknown;
  resultJson?: unknown;
  result_json?: unknown;
  error?: unknown;
};

type TinyFishStreamEvent = TinyFishRunResponse & {
  type?: unknown;
  purpose?: unknown;
  duration?: unknown;
  message?: unknown;
};

type RawOpportunity = Record<string, unknown>;

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

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const message =
      stableText(record.message) ||
      stableText(record.error) ||
      stableText(record.detail);

    if (message) {
      return `${source.name} TinyFish upstream error (${status}): ${message}`;
    }
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
    goal: (org) => `
You are extracting grant opportunities for a nonprofit.

Target keywords: ${buildKeywords(org)}

Tasks:
1. Use the page's visible search/filter tools if available.
2. Look for opportunities relevant to the target keywords.
3. Open promising result pages when needed to capture details.
4. Return up to 8 currently relevant opportunities.

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
`.trim(),
  },
  {
    name: "WV State Grants",
    sourceType: "government_portal",
    url: "https://grants.wv.gov/grants/Pages/default.aspx",
    browserProfile: "lite",
    goal: (org) => `
You are extracting West Virginia grant opportunities for a nonprofit.

Target keywords: ${buildKeywords(org)}

Tasks:
1. Review the WV funding opportunities page.
2. If there are visible filters or agency sections, use them to find relevant opportunities.
3. Open detail pages when useful.
4. Return up to 8 relevant opportunities.

Return ONLY valid JSON with this shape:
{
  "opportunities": [
    {
      "title": "string",
      "summary": "string or null",
      "status": "open | closed | rolling | draft | unknown",
      "deadlineAt": "ISO-8601 datetime string or null",
      "funderName": "West Virginia State Grants",
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
      "locationScope": "West Virginia",
      "country": "US",
      "region": "WV"
    }
  ]
}
`.trim(),
  },
  {
    name: "National Endowment for the Arts",
    sourceType: "government_portal",
    url: "https://www.arts.gov/grants",
    browserProfile: "lite",
    goal: (org) => `
You are extracting NEA grant opportunities for a nonprofit.

Target keywords: ${buildKeywords(org)}

Tasks:
1. Review the current NEA grants page.
2. Focus on current grant opportunities and deadlines relevant to organizations.
3. Open detail pages if necessary.
4. Return up to 8 relevant opportunities.

Return ONLY valid JSON with this shape:
{
  "opportunities": [
    {
      "title": "string",
      "summary": "string or null",
      "status": "open | closed | rolling | draft | unknown",
      "deadlineAt": "ISO-8601 datetime string or null",
      "funderName": "National Endowment for the Arts",
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
      "locationScope": "United States",
      "country": "US",
      "region": null
    }
  ]
}
`.trim(),
  },
];

function stableText(value: unknown): string {
  return String(value ?? "").trim();
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
        addLog(purpose, "done", stableNumber(event.duration));
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
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !done });

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
    throw new Error(`${source.name} TinyFish stream ended without a COMPLETE event`);
  }

  const payload =
    typeof result === "string" ? tryParseJson(result) ?? result : result;

  const items: RawOpportunity[] = Array.isArray(payload)
    ? payload as RawOpportunity[]
    : hasOpportunityArray(payload)
    ? payload.opportunities
    : [];

  if (items.length === 0) {
    throw new Error(
      `${source.name} TinyFish returned a malformed success payload: ${truncateForError(
        typeof result === "string" ? result : JSON.stringify(result)
      )}`
    );
  }

  return safeArray<RawOpportunity>(items)
    .map((item) => normalizeOpportunity(item, source))
    .filter(isNormalizedOpportunity);
}

function dedupeByKey<T extends { dedupeKey: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.dedupeKey, item);
  }
  return Array.from(map.values());
}

function getLiveDiscoveryConfig() {
  const rawFlag = String(process.env.GRANTFISH_USE_LIVE_TINYFISH ?? "").trim();
  const normalizedFlag = rawFlag.toLowerCase();
  const useLive =
    normalizedFlag === "true" ||
    normalizedFlag === "1" ||
    normalizedFlag === "yes" ||
    normalizedFlag === "on";
  const apiKey = String(process.env.TINYFISH_API_KEY ?? "").trim();
  const hasKey = apiKey.length > 0;
  const baseUrl = String(
    process.env.TINYFISH_BASE_URL || "https://agent.tinyfish.ai"
  ).trim();

  return {
    rawFlag,
    useLive,
    hasKey,
    hasBaseUrl: baseUrl.length > 0,
    baseUrl,
  };
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
  org: OrgLike = {}
): Promise<NormalizedOpportunity[]> {
  const config = getLiveDiscoveryConfig();

  console.info(
    `[discovery] config liveFlag=${config.rawFlag || "<unset>"} resolvedLive=${config.useLive} hasKey=${config.hasKey} hasBaseUrl=${config.hasBaseUrl}`
  );

  if (!config.useLive) {
    addLog("Live TinyFish disabled; using mock fallback");
    console.warn(
      `[discovery] using mock fallback because live discovery is disabled by GRANTFISH_USE_LIVE_TINYFISH=${config.rawFlag || "<unset>"}`
    );
    return getMockFallback();
  }

  if (!config.hasKey) {
    addLog("TinyFish API key missing; using mock fallback");
    console.warn(
      "[discovery] using mock fallback because TINYFISH_API_KEY is missing"
    );
    return getMockFallback();
  }

  addLog("Attempting live TinyFish discovery");
  console.info(
    `[discovery] attempting live TinyFish discovery via ${config.baseUrl}`
  );

  const settled = await Promise.allSettled(
    safeArray<LiveSource>(LIVE_SOURCES).map((source) => runTinyFishSource(source, org))
  );

  const liveResults = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );

  if (liveResults.length > 0) {
    addLog(`Live TinyFish returned ${liveResults.length} results before dedupe`);
    console.info(
      `[discovery] live TinyFish discovery succeeded with ${liveResults.length} normalized opportunities before dedupe`
    );
    return dedupeByKey(liveResults);
  }

  const errors = safeArray<PromiseSettledResult<NormalizedOpportunity[]>>(settled)
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason instanceof Error ? r.reason.message : String(r.reason));

  console.error(
    `[discovery] live TinyFish discovery failed across all sources: ${
      errors.length > 0 ? errors.join(" | ") : "No live opportunities returned"
    }`
  );
  addLog("All live TinyFish sources failed");

  throw new Error(
    errors.length > 0
      ? `All live sources failed: ${errors.join(" | ")}`
      : "No live opportunities returned from TinyFish"
  );
}
