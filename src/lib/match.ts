import type { Opportunity } from "@/types/opportunity";
import type { Organization } from "@/types/organization";

export function scoreMatch(org: Organization, opp: Opportunity): number {
  let score = 0;

  if (org.focusAreas && opp.focusAreas) {
    if (opp.focusAreas.toLowerCase().includes(org.focusAreas.toLowerCase())) {
      score += 5;
    }
  }

  if (org.geographies && opp.geographies) {
    if (opp.geographies.toLowerCase().includes(org.geographies.toLowerCase())) {
      score += 3;
    }
  }

  return score;
}
