import type { Opportunity } from "@/types/opportunity";
import type { Organization } from "@/types/organization";

export function scoreMatch(org: Organization, opp: Opportunity): number {
  let score = 0;

  if (org.focusAreas.length > 0 && opp.focusAreas) {
    const opportunityFocus = opp.focusAreas.toLowerCase();
    const hasFocusMatch = org.focusAreas.some((focusArea) =>
      opportunityFocus.includes(focusArea.toLowerCase())
    );

    if (hasFocusMatch) {
      score += 5;
    }
  }

  if (org.geographies.length > 0 && opp.geographies) {
    const opportunityGeography = opp.geographies.toLowerCase();
    const hasGeographyMatch = org.geographies.some((geography) =>
      opportunityGeography.includes(geography.toLowerCase())
    );

    if (hasGeographyMatch) {
      score += 3;
    }
  }

  return score;
}
