import { createHash } from "node:crypto";

type OrgLike = {
  mission?: string;
  focus_areas?: string[];
  geographies?: string[];
  focusAreas?: string[];
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

function getFocusAreas(org: OrgLike): string[] {
  return Array.isArray(org.focus_areas)
    ? org.focus_areas
    : Array.isArray(org.focusAreas)
    ? org.focusAreas
    : [];
}

function getGeographies(org: OrgLike): string[] {
  return Array.isArray(org.geographies) ? org.geographies : [];
}

function buildKeywords(org: OrgLike): string {
  const parts = [
    ...(getFocusAreas(org) || []),
    ...(getGeographies(org) || []),
  ]
    .map((x) => String(x).trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "arts, youth, education, West Virginia, Appalachia";
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

function normalizeOpportunity(rawItem: any, source: LiveSource) {
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
    status: stableText(rawItem.status) || "open",
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

async function runTinyFishSource(source: LiveSource, org: OrgLike) {
  const apiKey = process.env.TINYFISH_API_KEY;
  const baseUrl = process.env.TINYFISH_BASE_URL || "https://agent.tinyfish.ai";

  if (!apiKey) {
    throw new Error("TINYFISH_API_KEY is missing");
  }

  // 1️⃣ Start the agent run
  const start = await fetch(`${baseUrl}/v1/automation/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey
    },
    body: JSON.stringify({
      url: source.url,
      goal: source.goal(org),
      browser_profile: source.browserProfile ?? "lite"
    })
  });

  if (!start.ok) {
    const text = await start.text();
    throw new Error(`${source.name} TinyFish run failed: ${start.status} ${text}`);
  }

  const run = await start.json();
  const runId = run.id;

  if (!runId) {
    throw new Error("TinyFish did not return a run ID");
  }

  // 2️⃣ Poll for completion
  let result = null;

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const check = await fetch(`${baseUrl}/v1/automation/run/${runId}`, {
      headers: {
        "X-API-Key": apiKey
      }
    });

    if (!check.ok) {
      continue;
    }

    const status = await check.json();

    if (status.status === "completed") {
      result = status.result;
      break;
    }

    if (status.status === "failed") {
      throw new Error(`${source.name} agent failed`);
    }
  }

  if (!result) {
    throw new Error(`${source.name} timed out`);
  }

  // 3️⃣ Extract opportunities
  const payload = result;

  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.opportunities)
    ? payload.opportunities
    : [];

  return items
    .map((item: any) => normalizeOpportunity(item, source))
    .filter(Boolean);
}

function dedupeByKey(items: any[]) {
  const map = new Map<string, any>();
  for (const item of items) {
    map.set(item.dedupeKey, item);
  }
  return Array.from(map.values());
}

function getMockFallback() {
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

export async function runMockGrantDiscovery(org: OrgLike = {}) {
  const useLive = process.env.GRANTFISH_USE_LIVE_TINYFISH === "true";
  const hasKey = Boolean(process.env.TINYFISH_API_KEY);

  if (!useLive || !hasKey) {
    return getMockFallback();
  }

  const settled = await Promise.allSettled(
    LIVE_SOURCES.map((source) => runTinyFishSource(source, org))
  );

  const liveResults = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );

  if (liveResults.length > 0) {
    return dedupeByKey(liveResults);
  }

  const errors = settled
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason instanceof Error ? r.reason.message : String(r.reason));

  throw new Error(
    errors.length > 0
      ? `All live sources failed: ${errors.join(" | ")}`
      : "No live opportunities returned from TinyFish"
  );
}