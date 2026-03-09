import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExperimentRow {
  experiment_type: string;
  section_type: string;
  parameters: Record<string, unknown>;
  fixture_id: string;
  fixture_difficulty: string;
  production_score: Record<string, unknown>;
  enhanced_score: Record<string, unknown>;
  divergence: number;
  token_usage: number;
  cost_usd: number;
  duration_ms: number;
}

export interface StagedConfig {
  id: string;
  parameters: Record<string, unknown>;
  createdAt: string;
  promoted?: boolean;
  [key: string]: unknown;
}

export interface ResultFilters {
  experimentId?: string;
  minScore?: number;
  maxScore?: number;
}

/**
 * Supabase-backed storage for experiment results and staged configs.
 * Connection string is read from env vars and never logged.
 */
export class SupabaseStorage {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    if (!client) {
      throw new Error("Supabase client is required");
    }
    this.client = client;
  }

  /**
   * Write an experiment result to the boltline_experiment_results table.
   */
  async writeResult(result: ExperimentRow): Promise<void> {
    const { error } = await this.client
      .from("boltline_experiment_results")
      .insert(result);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Write a staged config with promoted=false.
   */
  async writeConfig(config: StagedConfig): Promise<void> {
    if (!config.id) {
      throw new Error("Config id is required");
    }

    const row = { ...config, promoted: false };

    const { error } = await this.client
      .from("boltline_staged_configs")
      .insert(row);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Read experiment results with optional filters.
   */
  async readResults(
    filters: ResultFilters,
  ): Promise<Record<string, unknown>[]> {
    let query = this.client.from("boltline_experiment_results").select("*");

    if (filters.minScore !== undefined) {
      query = query.gte("enhanced_score->>composite", filters.minScore);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return JSON.parse(JSON.stringify(data ?? []));
  }

  /**
   * Read all staged configs that have not been promoted.
   */
  async readStagedConfigs(): Promise<StagedConfig[]> {
    const { data, error } = await this.client
      .from("boltline_staged_configs")
      .select("*")
      .eq("promoted", false);

    if (error) {
      throw new Error(error.message);
    }

    return JSON.parse(JSON.stringify(data ?? []));
  }
}
