import type { SectionType, SectionConfig, SectionResult } from '../../generator/types.js';
import type { RfpFixture, GenerateFn } from '../../fixtures/types.js';
import type { ProductionResult } from '../../evaluator/types.js';
import type { EnhancedResult } from '../../evaluator/types.js';
import type { ExperimentResult } from '../types.js';

export const TEMPERATURE_VALUES = [0.1, 0.3, 0.5, 0.7, 0.9] as const;

const SAFE_TEMPERATURE_MIN = 0.0;
const SAFE_TEMPERATURE_MAX = 2.0;

export interface TemperatureDeps {
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

export function validateTemperature(temp: number): boolean {
  return (
    typeof temp === 'number' &&
    Number.isFinite(temp) &&
    temp >= SAFE_TEMPERATURE_MIN &&
    temp <= SAFE_TEMPERATURE_MAX
  );
}

/**
 * Run temperature sweep experiment for a given section type and fixture.
 * Returns results for each temperature value tested.
 */
export async function runTemperatureExperiment(
  experimentId: string,
  sectionType: SectionType,
  fixture: RfpFixture,
  deps: TemperatureDeps,
): Promise<ExperimentResult[]> {
  const results: ExperimentResult[] = [];

  for (const temperature of TEMPERATURE_VALUES) {
    if (!validateTemperature(temperature)) {
      continue;
    }

    const startTime = Date.now();

    try {
      const sectionResult = await deps.generateSection({
        sectionType,
        fixture,
        temperature,
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
        parameters: { temperature },
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
      // Log error, skip this temperature, continue to next
      continue;
    }
  }

  return results;
}

/**
 * Find the best temperature from a set of experiment results.
 * Returns the temperature with the highest average enhanced composite score.
 */
export function findBestTemperature(results: ExperimentResult[]): number | null {
  if (results.length === 0) return null;

  let bestTemp: number | null = null;
  let bestScore = -Infinity;

  for (const result of results) {
    const temp = result.parameters['temperature'] as number;
    if (result.enhancedScore.composite > bestScore) {
      bestScore = result.enhancedScore.composite;
      bestTemp = temp;
    }
  }

  return bestTemp;
}
