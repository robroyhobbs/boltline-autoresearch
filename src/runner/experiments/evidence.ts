import type { SectionType, SectionConfig, SectionResult } from '../../generator/types.js';
import type { RfpFixture, GenerateFn } from '../../fixtures/types.js';
import type { ProductionResult } from '../../evaluator/types.js';
import type { EnhancedResult } from '../../evaluator/types.js';
import type { ExperimentResult } from '../types.js';

export const EVIDENCE_COUNTS = [1, 2, 3, 5, 7, 10] as const;

const SAFE_EVIDENCE_MIN = 0;
const SAFE_EVIDENCE_MAX = 50;

export interface EvidenceDeps {
  generateSection: (config: SectionConfig) => Promise<SectionResult>;
  evaluateProduction: (
    content: string,
    sectionType: SectionType,
    fixture: RfpFixture,
    generateFn: GenerateFn,
  ) => Promise<ProductionResult>;
  evaluateEnhanced: (
    content: string,
    sectionType: SectionType,
    fixture: RfpFixture,
    generateFn: GenerateFn,
  ) => Promise<EnhancedResult>;
  generateFn: GenerateFn;
}

export function validateEvidenceCount(count: number): boolean {
  return (
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= SAFE_EVIDENCE_MIN &&
    count <= SAFE_EVIDENCE_MAX
  );
}

/**
 * Run evidence count sweep experiment for a given section type and fixture.
 * Returns results for each evidence count tested.
 */
export async function runEvidenceExperiment(
  experimentId: string,
  sectionType: SectionType,
  fixture: RfpFixture,
  deps: EvidenceDeps,
): Promise<ExperimentResult[]> {
  const results: ExperimentResult[] = [];

  for (const evidenceCount of EVIDENCE_COUNTS) {
    if (!validateEvidenceCount(evidenceCount)) {
      continue;
    }

    const startTime = Date.now();

    try {
      const sectionResult = await deps.generateSection({
        sectionType,
        fixture,
        evidenceCount,
        generateFn: deps.generateFn,
      });

      const [productionScore, enhancedScore] = await Promise.all([
        deps.evaluateProduction(sectionResult.content, sectionType, fixture, deps.generateFn),
        deps.evaluateEnhanced(sectionResult.content, sectionType, fixture, deps.generateFn),
      ]);

      const divergence = Math.abs(productionScore.average - enhancedScore.composite);
      const durationMs = Date.now() - startTime;

      results.push({
        experimentId,
        fixtureId: fixture.id,
        fixtureDifficulty: fixture.difficulty,
        sectionType,
        parameters: { evidenceCount },
        generatedContent: sectionResult.content,
        productionScore,
        enhancedScore,
        divergence,
        tokenUsage: sectionResult.tokenUsage,
        costUsd: sectionResult.costUsd,
        durationMs,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Log error, skip this count, continue to next
      continue;
    }
  }

  return results;
}

/**
 * Find the best evidence count from a set of experiment results.
 * Returns the evidence count with the highest average enhanced composite score.
 */
export function findBestEvidenceCount(results: ExperimentResult[]): number | null {
  if (results.length === 0) return null;

  let bestCount: number | null = null;
  let bestScore = -Infinity;

  for (const result of results) {
    const count = result.parameters['evidenceCount'] as number;
    if (result.enhancedScore.composite > bestScore) {
      bestScore = result.enhancedScore.composite;
      bestCount = count;
    }
  }

  return bestCount;
}
