export interface OrganizationSummary {
  id: string;
  name: string;
  entity_type: string;
  mission: string;
  geographies: string[];
  focus_areas: string[];
  tax_status: string | null;
}
