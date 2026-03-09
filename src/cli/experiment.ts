#!/usr/bin/env node

/**
 * Experiment CLI — entry point for running experiments from CLI or GitHub Actions.
 *
 * Usage: pnpm run experiment -- --count 3
 */

import { BudgetTracker } from "../budget/tracker.js";
import { JsonlStorage } from "../storage/jsonl.js";
import { SupabaseStorage } from "../storage/supabase.js";
import {
  runOneExperiment,
  createInitialState,
} from "../runner/experiment-loop.js";
import type { LoopState } from "../runner/experiment-loop.js";
import { generateSection } from "../generator/section-generator.js";
import { evaluateProduction } from "../evaluator/production-judges.js";
import { evaluateEnhanced } from "../evaluator/enhanced-judges.js";
import type { GenerateFn } from "../fixtures/types.js";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

interface ExperimentSummary {
  experimentsRun: number;
  budgetSpent: number;
  winnersFound: number;
  budgetExhausted: boolean;
  errors: number;
}

function parseArgs(argv: string[]): { count: number } {
  let count = 1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count" && argv[i + 1]) {
      const parsed = parseInt(argv[i + 1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        count = parsed;
      }
    }
  }
  return { count };
}

interface GeminiOptions {
  model?: string;
  maxOutputTokens?: number;
}

/**
 * Create a Gemini generateFn with configurable model and output tokens.
 */
function createGeminiFn(options: GeminiOptions = {}): GenerateFn {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const model = options.model ?? "gemini-2.5-flash";
  const maxOutputTokens = options.maxOutputTokens ?? 2048;

  return async (prompt: string): Promise<string> => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini returned empty response");
    }
    return text;
  };
}

/** Export factory for use by experiment loop */
export { createGeminiFn };

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const capUsd = parseFloat(process.env.DAILY_BUDGET_CAP ?? "7.50");

  const generateFn = createGeminiFn();

  const logsDir = join(process.cwd(), "logs");
  const budget = new BudgetTracker({
    stateFile: join(logsDir, "budget-state.jsonl"),
    capUsd,
  });

  const jsonl = new JsonlStorage();
  const resultsFile = join(
    logsDir,
    `experiments-${new Date().toISOString().slice(0, 7)}.jsonl`,
  );

  // Create Supabase storage if credentials are available
  let supabaseStorage: SupabaseStorage | undefined;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (supabaseUrl && supabaseKey) {
    const client = createClient(supabaseUrl, supabaseKey);
    supabaseStorage = new SupabaseStorage(client);
    console.log("Supabase storage enabled.");
  } else {
    console.log(
      "Supabase credentials not set — results will only be logged to JSONL.",
    );
  }

  const summary: ExperimentSummary = {
    experimentsRun: 0,
    budgetSpent: 0,
    winnersFound: 0,
    budgetExhausted: false,
    errors: 0,
  };

  let state: LoopState = createInitialState();

  console.log(
    `Starting ${args.count} experiment(s) with $${capUsd.toFixed(2)} daily cap...`,
  );

  for (let i = 0; i < args.count; i++) {
    try {
      const outcome = await runOneExperiment(
        {
          budgetTracker: budget,
          jsonlStorage: jsonl,
          supabaseStorage,
          generateSection,
          evaluateProduction,
          evaluateEnhanced,
          generateFn,
          createGenerateFn: createGeminiFn,
          resultsFile,
        },
        state,
      );

      if (outcome === null) {
        summary.budgetExhausted = true;
        console.log("Budget exhausted. Stopping experiments.");
        break;
      }

      state = outcome.state;
      const result = outcome.result;

      if (result && result.experimentId) {
        summary.experimentsRun++;
        summary.budgetSpent += result.costUsd;

        console.log(
          `[${i + 1}/${args.count}] ${JSON.stringify(result.parameters)} → prod:${result.productionScore?.average?.toFixed(1) ?? "?"} enh:${result.enhancedScore?.composite?.toFixed(1) ?? "?"} ($${result.costUsd.toFixed(3)})`,
        );
      } else {
        summary.errors++;
        console.log(
          `[${i + 1}/${args.count}] Experiment produced no result (check logs above for error)`,
        );
      }
    } catch (err) {
      summary.errors++;
      console.error(`Experiment ${i + 1} failed:`, (err as Error).message);
      // Continue to next experiment
    }
  }

  // Print summary
  console.log("\n--- Experiment Summary ---");
  console.log(`Experiments run: ${summary.experimentsRun}`);
  console.log(`Errors: ${summary.errors}`);
  console.log(`Budget spent: $${summary.budgetSpent.toFixed(2)}`);
  console.log(`Winners found: ${summary.winnersFound}`);
  if (summary.budgetExhausted) {
    console.log("Status: Budget exhausted (exiting cleanly)");
  } else {
    console.log("Status: Complete");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
