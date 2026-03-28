import { ensureArray, safeArray } from "@/lib/ensure-array";

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

const GENERIC_LOW_SIGNAL_TERMS = new Set([
  "community",
  "communities",
  "support",
  "service",
  "services",
  "program",
  "programs",
  "health",
  "care",
  "local",
  "public",
  "recreation",
  "place",
  "design",
]);

const ENVIRONMENT_HIGH_SPECIFICITY_TERMS = [
  "watershed",
  "stream",
  "river",
  "creek",
  "restoration",
  "water quality",
  "habitat",
  "conservation",
  "stewardship",
  "trail",
  "trails",
  "greenway",
  "stormwater",
  "cleanup",
  "environmental",
  "ecosystem",
] as const;

const ARTS_FOCUSED_TERMS = [
  "national endowment for the arts",
  "nea",
  "arts",
  "design",
  "museums",
  "museum",
  "visual arts",
  "folk",
  "traditional arts",
  "presenting",
  "multidisciplinary works",
  "local arts agencies",
  "placemaking",
  "our town",
] as const;

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

const DOMAIN_KEYWORDS = {
  environment: [
    "environment",
    "environmental",
    "conservation",
    "watershed",
    "restoration",
    "habitat",
    "river",
    "stream",
    "water quality",
    "ecology",
    "trail",
    "trails",
    "greenway",
    "land stewardship",
  ],
  arts: [
    "arts",
    "culture",
    "cultural",
    "museum",
    "museums",
    "design",
    "folk",
    "visual arts",
    "performing arts",
    "placemaking",
    "artist",
    "artists",
    "heritage",
  ],
  health: [
    "healthcare",
    "public health",
    "wellness",
    "medical",
    "behavioral health",
    "mental health",
    "clinical",
    "health equity",
  ],
  seniors: [
    "senior",
    "seniors",
    "older adult",
    "older adults",
    "aging",
    "elderly",
    "elder",
  ],
  youth: [
    "youth",
    "children",
    "child",
    "teen",
    "teens",
    "adolescent",
    "adolescents",
    "education",
    "school",
    "schools",
    "literacy",
    "after school",
  ],
  research: [
    "research",
    "laboratory",
    "lab",
    "academic",
    "university",
    "college",
    "science",
    "scientific",
    "faculty",
    "principal investigator",
    "study",
    "studies",
    "clinical trial",
  ],
  transportation: [
    "transportation",
    "transit",
    "mobility",
    "pedestrian",
    "bike lane",
    "traffic",
    "infrastructure",
    "accessible transportation",
  ],
  food: [
    "food",
    "nutrition",
    "meal",
    "meals",
    "hunger",
    "feeding",
    "food insecurity",
    "meal delivery",
    "pantry",
  ],
} as const satisfies Record<string, string[]>;

type DomainName = keyof typeof DOMAIN_KEYWORDS;

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
  return safeArray(ensureArray(value))
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function getSynonyms(term: string): string[] {
  const normalized = normalizeText(term);
  const direct = safeArray<string>(TERM_SYNONYMS[normalized] ?? []);
  const reverse = safeArray<[string, string[]]>(Object.entries(TERM_SYNONYMS))
    .filter(([, synonyms]) =>
      Array.isArray(synonyms) && synonyms.includes(normalized)
    )
    .map(([key]) => key);

  return unique([
    normalized,
    ...((Array.isArray(direct) ? direct : []).map(normalizeText)),
    ...((Array.isArray(reverse) ? reverse : []).map(normalizeText)),
  ]);
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
    .filter(
      (word) =>
        word.length >= 4 &&
        !STOPWORDS.has(word) &&
        !GENERIC_LOW_SIGNAL_TERMS.has(word)
    );

  const bigrams: string[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    bigrams.push(`${words[index]} ${words[index + 1]}`);
  }

  const synonyms = Object.keys(TERM_SYNONYMS).filter(
    (term) => normalized.includes(term) && !GENERIC_LOW_SIGNAL_TERMS.has(term)
  );

  return unique([...synonyms, ...bigrams, ...words]).slice(0, 8);
}

function countPhraseMatches(text: string, phrases: string[]): number {
  return phrases.reduce(
    (count, phrase) => (phrase && text.includes(phrase) ? count + 1 : count),
    0
  );
}

function isDirectServiceOrganization(org: ScorableOrganization): boolean {
  const orgText = normalizeText(
    [org.entity_type, org.tax_status, org.mission, ...ensureArray(org.focus_areas)].join(" ")
  );

  return (
    countPhraseMatches(orgText, [
      "meal",
      "meals",
      "nutrition",
      "hunger",
      "food pantry",
      "home delivery",
      "older adult",
      "seniors",
      "elderly",
      "disability",
      "disabled",
      "caregiver",
      "family support",
      "case management",
      "direct service",
      "community care",
    ]) >= 2
  );
}

function isEnvironmentalOrganization(orgText: string): boolean {
  return countPhraseMatches(orgText, Array.from(ENVIRONMENT_HIGH_SPECIFICITY_TERMS)) >= 2;
}

function getDomainSignals(text: string) {
  const scores = safeArray<[string, string[]]>(Object.entries(DOMAIN_KEYWORDS)).map(
    ([domain, keywords]) => ({
      domain: domain as DomainName,
      score: countPhraseMatches(text, Array.isArray(keywords) ? keywords : []),
    })
  );

  const strongDomains = scores.filter((entry) => entry.score >= 2);
  const topDomain = scores.reduce<{ domain: DomainName | null; score: number }>(
    (best, current) => (current.score > best.score ? current : best),
    { domain: null, score: 0 }
  );

  return {
    scores,
    strongDomains,
    topDomain,
  };
}

function getMismatchPenalty(params: {
  orgText: string;
  opportunityText: string;
  titleSummaryText: string;
  sourceText: string;
  orgStrongDomains: DomainName[];
  opportunityStrongDomains: DomainName[];
  opportunityTopDomain: { domain: DomainName | null; score: number };
  positiveSignalCount: number;
  isDirectServiceOrg: boolean;
}) {
  const {
    orgText,
    opportunityText,
    titleSummaryText,
    sourceText,
    orgStrongDomains,
    opportunityStrongDomains,
    opportunityTopDomain,
    positiveSignalCount,
    isDirectServiceOrg,
  } = params;

  let penalty = 0;
  let reason: string | null = null;
  const isEnvironmentalOrg = isEnvironmentalOrganization(orgText);
  const environmentalSpecificity = countPhraseMatches(
    opportunityText,
    Array.from(ENVIRONMENT_HIGH_SPECIFICITY_TERMS)
  );
  const artsSpecificity =
    countPhraseMatches(titleSummaryText, Array.from(ARTS_FOCUSED_TERMS)) +
    countPhraseMatches(sourceText, Array.from(ARTS_FOCUSED_TERMS));

  const hasSharedStrongDomain = opportunityStrongDomains.some((domain) =>
    orgStrongDomains.includes(domain)
  );

  if (
    orgStrongDomains.length > 0 &&
    !hasSharedStrongDomain &&
    opportunityTopDomain.domain &&
    opportunityTopDomain.score >= 2
  ) {
    penalty += opportunityTopDomain.score >= 4 && positiveSignalCount <= 2 ? 30 : 18;
    reason = "Strong thematic mismatch reduced score";
  }

  if (
    orgStrongDomains.includes("environment") &&
    opportunityTopDomain.domain === "arts" &&
    opportunityTopDomain.score >= 2
  ) {
    penalty = Math.max(penalty, 24);
    reason = "Opportunity appears more arts-focused than mission-aligned";
  }

  if (
    isDirectServiceOrg &&
    opportunityTopDomain.domain === "research" &&
    opportunityTopDomain.score >= 2 &&
    positiveSignalCount < 3
  ) {
    penalty = Math.max(penalty, opportunityTopDomain.score >= 4 ? 32 : 20);
    reason =
      "Opportunity appears research-oriented for a direct-service nonprofit";
  }

  if (
    isEnvironmentalOrg &&
    artsSpecificity >= 2 &&
    environmentalSpecificity === 0
  ) {
    penalty = Math.max(penalty, 35);
    reason = "Opportunity appears arts-focused relative to mission";
  } else if (
    isEnvironmentalOrg &&
    artsSpecificity >= 2 &&
    environmentalSpecificity <= 1
  ) {
    penalty = Math.max(penalty, 22);
    reason = "Limited environmental specificity reduced score";
  }

  if (
    positiveSignalCount > 0 &&
    positiveSignalCount <= 2 &&
    countPhraseMatches(orgText, Array.from(GENERIC_LOW_SIGNAL_TERMS)) > 0 &&
    countPhraseMatches(opportunityText, Array.from(GENERIC_LOW_SIGNAL_TERMS)) > 0 &&
    opportunityTopDomain.domain &&
    !orgStrongDomains.includes(opportunityTopDomain.domain)
  ) {
    penalty = Math.max(penalty, 12);
    reason ??= "Opportunity appears loosely related rather than strongly aligned";
  }

  return {
    penalty,
    reason,
  };
}

function getGeographyTerms(geography: string): string[] {
  const normalized = normalizeText(geography);
  const direct = safeArray<string>(GEOGRAPHY_ALIASES[normalized] ?? []);

  return unique([normalized, ...((Array.isArray(direct) ? direct : []).map(normalizeText))]);
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
  const orgText = normalizeText(
    [org.mission, org.entity_type, org.tax_status, ...ensureArray(org.focus_areas)].join(" ")
  );
  const sourceText = normalizeText([opportunity.source_name, opportunity.funder_name].join(" "));

  const focusAreas = unique(
    safeArray<unknown>(ensureArray(org.focus_areas))
      .map((value) => String(value).trim())
      .filter(Boolean)
  );
  let positiveSignalCount = 0;
  for (const focusArea of focusAreas) {
    const matched = textIncludesAny(opportunityText, getSynonyms(focusArea));
    if (!matched) {
      continue;
    }

    score += 25;
    positiveSignalCount += 1;
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
    positiveSignalCount += 1;
    reasons.push(`Mission overlap: ${keyword}`);
  }

  const geographies = unique(
    safeArray<unknown>(ensureArray(org.geographies))
      .map((value) => String(value).trim())
      .filter(Boolean)
  );
  for (const geography of geographies) {
    const normalizedGeography = normalizeText(geography);
    if (!normalizedGeography || !textIncludesAny(locationText, getGeographyTerms(geography))) {
      continue;
    }

    score += 20;
    positiveSignalCount += 1;
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
    positiveSignalCount += 1;
    reasons.push("Nonprofit eligibility signal detected");
  }

  const titleSummaryMatches = unique(
    [...focusAreas, ...missionKeywords]
      .filter((term) => term.length >= 4)
      .filter((term) => textIncludesAny(titleSummaryText, getSynonyms(term)))
  ).slice(0, 2);

  if (titleSummaryMatches.length >= 2) {
    score += 20;
    positiveSignalCount += 2;
    reasons.push(`Title/summary relevance: ${titleSummaryMatches.join(", ")}`);
  } else if (titleSummaryMatches.length === 1) {
    score += 10;
    positiveSignalCount += 1;
    reasons.push(`Title/summary relevance: ${titleSummaryMatches[0]}`);
  }

  const sourceGeography = geographies.find((geography) =>
    sourceText.includes(normalizeText(geography))
  );
  if (sourceGeography) {
    score += 5;
    positiveSignalCount += 1;
    reasons.push(`Source relevance: ${sourceGeography}`);
  }

  const orgDomains = getDomainSignals(orgText);
  const opportunityDomains = getDomainSignals(opportunityText);
  const mismatch = getMismatchPenalty({
    orgText,
    opportunityText,
    titleSummaryText,
    sourceText,
    orgStrongDomains: safeArray<{ domain: DomainName; score: number }>(
      orgDomains.strongDomains
    ).map((entry) => entry.domain),
    opportunityStrongDomains: safeArray<{ domain: DomainName; score: number }>(
      opportunityDomains.strongDomains
    ).map(
      (entry) => entry.domain
    ),
    opportunityTopDomain: opportunityDomains.topDomain,
    positiveSignalCount,
    isDirectServiceOrg: isDirectServiceOrganization(org),
  });

  if (mismatch.penalty > 0) {
    score = Math.max(0, score - mismatch.penalty);
    if (mismatch.reason) {
      reasons.push(mismatch.reason);
    }
  }

  if (isEnvironmentalOrganization(orgText) && score > 80) {
    const environmentalSpecificity = countPhraseMatches(
      opportunityText,
      Array.from(ENVIRONMENT_HIGH_SPECIFICITY_TERMS)
    );

    if (environmentalSpecificity === 0) {
      score = Math.min(score, 65);
      reasons.push("Limited environmental specificity reduced score");
    } else if (environmentalSpecificity === 1) {
      score = Math.min(score, 78);
      reasons.push("Generic thematic overlap reduced score");
    }
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
