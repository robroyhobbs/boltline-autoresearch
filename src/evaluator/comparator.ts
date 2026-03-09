import type { ProductionResult } from './types.js';
import type { EnhancedResult } from './types.js';

/**
 * Calculate the divergence between production and enhanced evaluation scores.
 * Returns the absolute delta: |productionScore.average - enhancedScore.composite|
 */
export function calculateDivergence(
  productionScore: ProductionResult,
  enhancedScore: EnhancedResult,
): number {
  return Math.abs(productionScore.average - enhancedScore.composite);
}
