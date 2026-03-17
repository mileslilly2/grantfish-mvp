const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "to",
  "with",
]);

const TERM_SYNONYMS: Record<string, string[]> = {
  food: ["food", "nutrition", "meal", "meals", "hunger", "feeding"],
  nutrition: ["nutrition", "food", "meal", "meals", "hunger"],
  seniors: ["senior", "seniors", "older adult", "older adults", "aging", "elderly"],
  disability: ["disability", "disabled", "special needs", "accessible", "accessibility"],
  health: ["health", "healthcare", "wellness", "medical", "care"],
  youth: ["youth", "young people", "adolescent", "adolescents", "teen", "teens", "children"],
  children: ["child", "children", "youth", "kid", "kids", "family", "families", "foster"],
  family: ["family", "families", "children", "youth", "foster"],
  foster: ["foster", "adoption", "child welfare", "family support"],
  environment: ["environment", "environmental", "climate", "conservation", "ecology"],
  conservation: ["conservation", "watershed", "habitat", "stewardship", "preservation"],
  watershed: ["watershed", "water quality", "river", "stream", "conservation"],
  trail: ["trail", "trails", "greenway", "outdoor recreation", "park"],
  community: ["community", "local", "neighborhood", "neighbourhood"],
  education: ["education", "school", "schools", "learning", "literacy"],
};

const GEOGRAPHY_ALIASES: Record<string, string[]> = {
  "west virginia": ["west virginia", "wv"],
  wv: ["wv", "west virginia"],
  "new york": ["new york", "ny"],
  ny: ["ny", "new york"],
  california: ["california", "ca"],
  ca: ["ca", "california"],
  appalachia: ["appalachia", "appalachian"],
  nationwide: ["nationwide", "national", "united states", "us", "usa"],
};

type ScorableOpportunity = {
  title?: string | null;
  summary?: string | null;
  eligibility_text?: string | null;
  requirements_text?: string | null;
  source_name?: string | null;
  funder_name?: string | null;
  location_scope?: string | null;
  country?: string | null;
  region?: string | null;
  status?: string | null;
  deadline_at?: string | Date | null;
  extracted_fields?: Record<string, unknown> | null;
};

type ScorableOrganization = {
  mission?: string | null;
  focus_areas?: string[] | null;
  geographies?: string[] | null;
  entity_type?: string | null;
  tax_status?: string | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9()#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function toTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function getSynonyms(term: string): string[] {
  const normalized = normalizeText(term);
  const direct = TERM_SYNONYMS[normalized] ?? [];
  const reverse = Object.entries(TERM_SYNONYMS)
    .filter(([, synonyms]) => synonyms.includes(normalized))
    .map(([key]) => key);

  return unique([normalized, ...direct.map(normalizeText), ...reverse.map(normalizeText)]);
}

function textIncludesAny(text: string, phrases: string[]): string | null {
  for (const phrase of phrases) {
    if (!phrase) {
      continue;
    }

    if (text.includes(phrase)) {
      return phrase;
    }
  }

  return null;
}

function getMissionKeywords(mission: string): string[] {
  const normalized = normalizeText(mission);
  const words = normalized
    .split(" ")
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));

  const bigrams: string[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    bigrams.push(`${words[index]} ${words[index + 1]}`);
  }

  const synonyms = Object.keys(TERM_SYNONYMS).filter((term) => normalized.includes(term));

  return unique([...synonyms, ...bigrams, ...words]).slice(0, 8);
}

function getGeographyTerms(geography: string): string[] {
  const normalized = normalizeText(geography);
  const direct = GEOGRAPHY_ALIASES[normalized] ?? [];

  return unique([normalized, ...direct.map(normalizeText)]);
}

function isNonprofitLike(org: ScorableOrganization): boolean {
  const entityType = normalizeText(org.entity_type);
  const taxStatus = normalizeText(org.tax_status);

  return (
    entityType.includes("nonprofit") ||
    entityType.includes("non profit") ||
    taxStatus.includes("501(c)(3)") ||
    taxStatus.includes("501c3") ||
    taxStatus.includes("tax exempt")
  );
}

function getOpportunityText(opportunity: ScorableOpportunity): string {
  const extracted = opportunity.extracted_fields ?? {};

  return normalizeText(
    [
      opportunity.title,
      opportunity.summary,
      opportunity.eligibility_text,
      opportunity.requirements_text,
      opportunity.source_name,
      opportunity.funder_name,
      opportunity.location_scope,
      opportunity.country,
      opportunity.region,
      opportunity.status,
      ...toTextArray(extracted["mission_areas"]),
      ...toTextArray(extracted["entity_types"]),
    ].join(" ")
  );
}

function getLocationText(opportunity: ScorableOpportunity): string {
  return normalizeText(
    [
      opportunity.location_scope,
      opportunity.country,
      opportunity.region,
      opportunity.eligibility_text,
      opportunity.summary,
      opportunity.title,
      opportunity.source_name,
      opportunity.funder_name,
    ].join(" ")
  );
}

function isClosedStatus(status: unknown): boolean {
  const normalized = normalizeText(status);
  return normalized.includes("closed") || normalized.includes("draft") || normalized.includes("archived");
}

function isPastDeadline(deadlineAt: unknown): boolean {
  if (!deadlineAt) {
    return false;
  }

  const deadline = new Date(String(deadlineAt));
  return !Number.isNaN(deadline.valueOf()) && deadline.getTime() < Date.now();
}

export function scoreOpportunity(opportunity: ScorableOpportunity, org: ScorableOrganization) {
  let score = 0;
  const reasons: string[] = [];

  const opportunityText = getOpportunityText(opportunity);
  const locationText = getLocationText(opportunity);
  const titleSummaryText = normalizeText([opportunity.title, opportunity.summary].join(" "));

  const focusAreas = unique((org.focus_areas ?? []).map((value) => String(value).trim()).filter(Boolean));
  for (const focusArea of focusAreas) {
    const matched = textIncludesAny(opportunityText, getSynonyms(focusArea));
    if (!matched) {
      continue;
    }

    score += 25;
    reasons.push(`Focus area match: ${focusArea}`);
  }

  const missionKeywords = getMissionKeywords(String(org.mission ?? ""));
  let missionMatches = 0;
  for (const keyword of missionKeywords) {
    if (missionMatches >= 2) {
      break;
    }

    const matched = textIncludesAny(opportunityText, getSynonyms(keyword));
    if (!matched) {
      continue;
    }

    missionMatches += 1;
    score += 15;
    reasons.push(`Mission overlap: ${keyword}`);
  }

  const geographies = unique((org.geographies ?? []).map((value) => String(value).trim()).filter(Boolean));
  for (const geography of geographies) {
    const normalizedGeography = normalizeText(geography);
    if (!normalizedGeography || !textIncludesAny(locationText, getGeographyTerms(geography))) {
      continue;
    }

    score += 20;
    reasons.push(`Geography match: ${geography}`);
  }

  if (
    isNonprofitLike(org) &&
    textIncludesAny(opportunityText, [
      "501(c)(3)",
      "501c3",
      "nonprofit",
      "non profit",
      "charitable organization",
      "tax exempt",
    ])
  ) {
    score += 15;
    reasons.push("Nonprofit eligibility signal detected");
  }

  const titleSummaryMatches = unique(
    [...focusAreas, ...missionKeywords]
      .filter((term) => term.length >= 4)
      .filter((term) => textIncludesAny(titleSummaryText, getSynonyms(term)))
  ).slice(0, 2);

  if (titleSummaryMatches.length >= 2) {
    score += 20;
    reasons.push(`Title/summary relevance: ${titleSummaryMatches.join(", ")}`);
  } else if (titleSummaryMatches.length === 1) {
    score += 10;
    reasons.push(`Title/summary relevance: ${titleSummaryMatches[0]}`);
  }

  const sourceText = normalizeText([opportunity.source_name, opportunity.funder_name].join(" "));
  const sourceGeography = geographies.find((geography) =>
    sourceText.includes(normalizeText(geography))
  );
  if (sourceGeography) {
    score += 5;
    reasons.push(`Source relevance: ${sourceGeography}`);
  }

  const expirationReasons: string[] = [];
  if (isPastDeadline(opportunity.deadline_at)) {
    expirationReasons.push("Deadline has passed");
  }

  if (isClosedStatus(opportunity.status)) {
    expirationReasons.push("Status indicates closed");
  }

  if (expirationReasons.length > 0) {
    const finalReasons = unique([...expirationReasons, "Opportunity appears expired"]);

    return {
      fitScore: 0,
      fitReasons: finalReasons,
      confidenceScore: 0.95,
    };
  }

  return {
    fitScore: Math.min(score, 100),
    fitReasons: unique(reasons),
    confidenceScore: Math.max(0.35, Math.min(0.95, 0.45 + unique(reasons).length * 0.1)),
  };
}
