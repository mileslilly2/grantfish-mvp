import type { Opportunity } from "@/types/opportunity";
import type { Organization } from "@/types/organization";
import { ensureArray } from "@/lib/ensure-array";

type NormalizedOrganization = Omit<Organization, "focusAreas" | "geographies"> & {
  focusAreas: string[];
  geographies: string[];
};

type NormalizedOpportunity = Omit<Opportunity, "focusAreas" | "geographies"> & {
  focusAreas: string[];
  geographies: string[];
};

function toNormalizedStringArray(value: string | string[] | null | undefined): string[] {
  return ensureArray(value)
    .map((entry) => String(entry).trim().toLowerCase())
    .filter(Boolean);
}

export function scoreMatch(org: NormalizedOrganization, opp: NormalizedOpportunity): number {
  let score = 0;
  const organizationFocusAreas = toNormalizedStringArray(org.focusAreas);
  const opportunityFocusAreas = toNormalizedStringArray(opp.focusAreas);
  const organizationGeographies = toNormalizedStringArray(org.geographies);
  const opportunityGeographies = toNormalizedStringArray(opp.geographies);

  if (organizationFocusAreas.length > 0 && opportunityFocusAreas.length > 0) {
    const hasFocusMatch = organizationFocusAreas.some((focusArea) =>
      opportunityFocusAreas.some(
        (opportunityFocusArea) =>
          opportunityFocusArea.includes(focusArea) || focusArea.includes(opportunityFocusArea)
      )
    );

    if (hasFocusMatch) {
      score += 5;
    }
  }

  if (organizationGeographies.length > 0 && opportunityGeographies.length > 0) {
    const hasGeographyMatch = organizationGeographies.some((geography) =>
      opportunityGeographies.some(
        (opportunityGeography) =>
          opportunityGeography.includes(geography) || geography.includes(opportunityGeography)
      )
    );

    if (hasGeographyMatch) {
      score += 3;
    }
  }

  return score;
}
