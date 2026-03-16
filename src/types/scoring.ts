export interface ScoringResult {
  fitScore: number;          // 0-100
  fitReasons: string[];      // human-readable explanations
  confidenceScore: number;   // 0-1
}