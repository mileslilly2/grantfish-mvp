import type { PipelineStage, SourceType } from "./db";

export interface UpsertOrganizationProfileInput {
  id?: string;
  name: string;
  entityType?: string;
  mission: string;
  geographies: string[];
  focusAreas: string[];
  annualBudgetBand?: string | null;
  taxStatus?: string | null;
  keywordsInclude?: string[];
  keywordsExclude?: string[];
  docInventory?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateSourceConfigInput {
  name: string;
  sourceType: SourceType;
  baseUrl: string;
  startUrl: string;
  active?: boolean;
  tags?: string[];
  defaultFilters?: Record<string, unknown>;
  agentInstructions?: string;
  metadata?: Record<string, unknown>;
}

export interface StartDiscoveryRunInput {
  organizationProfileId: string;
  sourceConfigIds?: string[];
}

export interface StartDiscoveryRunResponse {
  runIds: string[];
}

export interface OpportunityListQuery {
  organizationProfileId: string;
  pipelineStage?: PipelineStage;
  minFitScore?: number;
  q?: string;
  starred?: boolean;
  hidden?: boolean;
  deadlineBefore?: string;
  limit?: number;
  offset?: number;
}

export interface PatchOpportunityMatchInput {
  pipelineStage?: PipelineStage;
  notes?: string | null;
  starred?: boolean;
  hidden?: boolean;
}