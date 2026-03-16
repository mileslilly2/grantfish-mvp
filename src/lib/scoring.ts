export function scoreOpportunity(opportunity: any, org: any) {
  let score = 0;
  const reasons: string[] = [];

  const mission = (org.focus_areas || []).map((x: string) => x.toLowerCase());
  const oppAreas = (opportunity.extractedFields?.mission_areas || []).map((x: string) =>
    String(x).toLowerCase()
  );

  for (const area of oppAreas) {
    if (mission.includes(area)) {
      score += 20;
      reasons.push(`Matches focus area: ${area}`);
    }
  }

  if ((opportunity.eligibilityText || "").toLowerCase().includes("501(c)(3)")) {
    score += 20;
    reasons.push("Eligible nonprofit type mentioned");
  }

  if ((org.geographies || []).some((g: string) =>
    (opportunity.eligibilityText || "").toLowerCase().includes(g.toLowerCase())
  )) {
    score += 20;
    reasons.push("Geographic fit");
  }

  if (score > 100) score = 100;

  return {
    fitScore: score,
    fitReasons: reasons,
    confidenceScore: 0.8
  };
}