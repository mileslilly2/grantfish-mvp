import type { OpportunityStatus, OpportunityType, SourceType } from "./db";

export interface NormalizedOpportunity {
  type: OpportunityType; // "grant" for MVP
  sourceName: string;
  sourceType: SourceType;
  sourceUrl: string;
  canonicalUrl: string;
  sourceItemId?: string | null;

  title: string;
  summary?: string | null;
  status?: OpportunityStatus;

  postedAt?: string | null;
  deadlineAt?: string | null;

  locationScope?: string | null;
  country?: string | null;
  region?: string | null;

  funderName?: string | null;

  amountMin?: number | null;
  amountMax?: number | null;
  currency?: string;

  eligibilityText?: string | null;
  requirementsText?: string | null;
  applicationUrl?: string | null;

  extractedFields?: Record<string, unknown>;
  metadata?: Record<string, unknown>;

  dedupeKey: string;
}