export type ISODateString = string;

export type OpportunityType = "grant" | "rfp" | "job" | "gig" | "lead";

export type SourceType =
  | "grant_portal"
  | "foundation_site"
  | "government_portal"
  | "job_board"
  | "gig_board"
  | "directory"
  | "custom";

export type OpportunityStatus = "open" | "closed" | "rolling" | "draft" | "unknown";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "partial";

export type PipelineStage =
  | "new"
  | "review"
  | "shortlist"
  | "preparing"
  | "submitted"
  | "won"
  | "lost"
  | "archived";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export interface OrganizationProfile {
  id: string;
  ownerUserId: string | null;
  name: string;
  entityType: string;
  mission: string;
  geographies: string[];
  focusAreas: string[];
  annualBudgetBand: string | null;
  taxStatus: string | null;
  keywordsInclude: string[];
  keywordsExclude: string[];
  docInventory: string[];
  metadata: Record<string, JsonValue>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SourceConfig {
  id: string;
  name: string;
  sourceType: SourceType;
  baseUrl: string;
  startUrl: string;
  active: boolean;
  tags: string[];
  defaultFilters: Record<string, JsonValue>;
  agentInstructions: string;
  metadata: Record<string, JsonValue>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface DiscoveryRun {
  id: string;
  organizationProfileId: string;
  sourceConfigId: string;
  externalRunId: string | null;
  streamingUrl: string | null;
  runStatus: RunStatus;
  triggerType: string;
  startedAt: ISODateString | null;
  finishedAt: ISODateString | null;
  recordsFound: number;
  recordsNew: number;
  recordsUpdated: number;
  errorSummary: string | null;
  rawLog: JsonValue[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Opportunity {
  id: string;
  type: OpportunityType;
  sourceConfigId: string | null;
  sourceName: string;
  sourceType: SourceType;
  sourceUrl: string;
  canonicalUrl: string;
  sourceItemId: string | null;
  title: string;
  summary: string | null;
  status: OpportunityStatus;
  postedAt: ISODateString | null;
  deadlineAt: ISODateString | null;
  locationScope: string | null;
  country: string | null;
  region: string | null;
  funderName: string | null;
  amountMin: string | null; // numeric comes back as string in many pg libs
  amountMax: string | null;
  currency: string;
  eligibilityText: string | null;
  requirementsText: string | null;
  applicationUrl: string | null;
  extractedFields: Record<string, JsonValue>;
  metadata: Record<string, JsonValue>;
  dedupeKey: string;
  firstSeenAt: ISODateString;
  lastSeenAt: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface DiscoveryRunResult {
  id: string;
  discoveryRunId: string;
  opportunityId: string;
  rawPayload: Record<string, JsonValue>;
  createdAt: ISODateString;
}

export interface OpportunityMatch {
  id: string;
  organizationProfileId: string;
  opportunityId: string;
  fitScore: number;
  fitReasons: string[];
  confidenceScore: string; // numeric
  pipelineStage: PipelineStage;
  notes: string | null;
  starred: boolean;
  hidden: boolean;
  lastViewedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface OpportunityWithMatch {
  opportunity: Opportunity;
  match: OpportunityMatch;
}