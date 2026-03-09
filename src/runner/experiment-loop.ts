import type { BudgetTracker } from "../budget/tracker.js";
import type { JsonlStorage } from "../storage/jsonl.js";
import type { SupabaseStorage } from "../storage/supabase.js";
import type {
  SectionType,
  SectionConfig,
  SectionResult,
} from "../generator/types.js";
import type { RfpFixture, GenerateFn } from "../fixtures/types.js";
import type { ProductionResult, EnhancedResult } from "../evaluator/types.js";
import type { ExperimentResult } from "./types.js";
import { getStaticFixtures } from "../fixtures/static-fixtures.js";
import { SECTION_TYPES } from "../generator/prompt-templates.js";
import {
  PROMPT_STYLES,
  buildStyledPrompt,
} from "./experiments/prompt-style.js";

export interface RunnerDeps {
  budgetTracker: BudgetTracker;
  jsonlStorage: JsonlStorage;
  supabaseStorage?: SupabaseStorage;
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
  createGenerateFn?: (options: {
    model?: string;
    maxOutputTokens?: number;
  }) => GenerateFn;
  resultsFile?: string;
}

const EXPERIMENT_TYPES = [
  "temperature",
  "evidence",
  "prompt_style",
  "output_length",
  "model",
] as const;

export interface LoopState {
  experimentTypeIndex: number;
  fixtureIndex: number;
  sectionTypeIndex: number;
  runCount: number;
}

export function createInitialState(): LoopState {
  return {
    experimentTypeIndex: 0,
    fixtureIndex: 0,
    sectionTypeIndex: 0,
    runCount: 0,
  };
}

function advanceState(
  state: LoopState,
  fixtureCount: number,
  sectionTypeCount: number,
): LoopState {
  let { experimentTypeIndex, fixtureIndex, sectionTypeIndex, runCount } = state;

  sectionTypeIndex = (sectionTypeIndex + 1) % sectionTypeCount;
  if (sectionTypeIndex === 0) {
    fixtureIndex = (fixtureIndex + 1) % fixtureCount;
    if (fixtureIndex === 0) {
      experimentTypeIndex = (experimentTypeIndex + 1) % EXPERIMENT_TYPES.length;
    }
  }

  return {
    experimentTypeIndex,
    fixtureIndex,
    sectionTypeIndex,
    runCount: runCount + 1,
  };
}

/**
 * Sanitize an experiment result for logging: strip full generated content
 * and any judge prompt information to prevent data leaks.
 */
function sanitizeForLog(result: ExperimentResult): Record<string, unknown> {
  const { generatedContent, ...safe } = result;
  return {
    ...safe,
    contentLength: generatedContent?.length ?? 0,
  };
}

/**
 * Run a single experiment cycle.
 * Returns the result and updated state, or null if budget exhausted.
 */
export async function runOneExperiment(
  deps: RunnerDeps,
  state: LoopState,
): Promise<{ result: ExperimentResult; state: LoopState } | null> {
  // Budget check before starting
  const canRun = await deps.budgetTracker.canRunExperiment();
  if (!canRun) {
    return null;
  }

  const fixtures = getStaticFixtures();
  const sectionTypes = SECTION_TYPES;

  const experimentType = EXPERIMENT_TYPES[state.experimentTypeIndex];
  const fixture = fixtures[state.fixtureIndex];
  const sectionType = sectionTypes[state.sectionTypeIndex];

  const experimentId = `exp-${experimentType}-${sectionType}-${fixture.id}-${Date.now()}`;

  const startTime = Date.now();

  // Determine parameters based on experiment type
  let parameters: Record<string, unknown>;
  let promptTemplate: string | undefined;
  let experimentGenerateFn = deps.generateFn;

  const OUTPUT_LENGTHS = [512, 1024, 2048, 4096];
  const MODELS = [
    { id: "gemini-2.5-flash", label: "flash" },
    { id: "gemini-2.5-pro", label: "pro" },
  ];

  if (experimentType === "temperature") {
    parameters = {
      temperature: [0.1, 0.3, 0.5, 0.7, 0.9][state.runCount % 5],
    };
  } else if (experimentType === "evidence") {
    parameters = {
      evidenceCount: [1, 2, 3, 5, 7, 10][state.runCount % 6],
    };
  } else if (experimentType === "prompt_style") {
    const styleIndex = state.runCount % PROMPT_STYLES.length;
    const style = PROMPT_STYLES[styleIndex];
    const sectionLabel = sectionType.replace(/_/g, " ");
    promptTemplate = buildStyledPrompt(style.name, sectionLabel);
    parameters = { promptStyle: style.name };
  } else if (experimentType === "output_length") {
    const maxTokens = OUTPUT_LENGTHS[state.runCount % OUTPUT_LENGTHS.length];
    parameters = { maxOutputTokens: maxTokens };
    if (deps.createGenerateFn) {
      experimentGenerateFn = deps.createGenerateFn({
        maxOutputTokens: maxTokens,
      });
    }
  } else {
    // model
    const modelConfig = MODELS[state.runCount % MODELS.length];
    parameters = { model: modelConfig.label };
    if (deps.createGenerateFn) {
      experimentGenerateFn = deps.createGenerateFn({ model: modelConfig.id });
    }
  }

  try {
    const sectionResult = await deps.generateSection({
      sectionType,
      fixture,
      temperature: parameters["temperature"] as number | undefined,
      evidenceCount: parameters["evidenceCount"] as number | undefined,
      promptTemplate,
      generateFn: experimentGenerateFn,
    });

    const [productionScore, enhancedScore] = await Promise.all([
      deps.evaluateProduction(
        sectionResult.content,
        sectionType,
        fixture,
        deps.generateFn,
      ),
      deps.evaluateEnhanced(
        sectionResult.content,
        sectionType,
        fixture,
        deps.generateFn,
      ),
    ]);

    const divergence = Math.abs(
      productionScore.average - enhancedScore.composite,
    );
    const durationMs = Date.now() - startTime;

    const result: ExperimentResult = {
      experimentId,
      fixtureId: fixture.id,
      fixtureDifficulty: fixture.difficulty,
      sectionType,
      parameters,
      generatedContent: sectionResult.content,
      productionScore,
      enhancedScore,
      divergence,
      tokenUsage: sectionResult.tokenUsage,
      costUsd: sectionResult.costUsd,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    // Record budget spend BEFORE logging result (fail-safe)
    await deps.budgetTracker.recordSpend(sectionResult.costUsd);

    // Log sanitized result to JSONL (no full content)
    const logEntry = sanitizeForLog(result);
    const resultsFile = deps.resultsFile ?? "logs/experiment-results.jsonl";
    await deps.jsonlStorage.append(resultsFile, logEntry);

    // Optionally write to Supabase (failure doesn't halt)
    if (deps.supabaseStorage) {
      try {
        await deps.supabaseStorage.writeResult({
          experiment_type: experimentType,
          section_type: sectionType,
          parameters: result.parameters,
          fixture_id: result.fixtureId,
          fixture_difficulty: result.fixtureDifficulty,
          production_score: result.productionScore,
          enhanced_score: result.enhancedScore,
          divergence: result.divergence,
          token_usage: result.tokenUsage,
          cost_usd: result.costUsd,
          duration_ms: result.durationMs,
        });
      } catch (err) {
        console.error(
          `[runner] Supabase write failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const newState = advanceState(state, fixtures.length, sectionTypes.length);
    return { result, state: newState };
  } catch (error) {
    // Generator or evaluator failure: log and advance state
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[runner] Experiment ${experimentId} failed: ${errorMessage}`,
    );
    const newState = advanceState(state, fixtures.length, sectionTypes.length);
    return { result: null as unknown as ExperimentResult, state: newState };
  }
}
