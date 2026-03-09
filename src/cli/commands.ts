import type { SupabaseClient } from "@supabase/supabase-js";

export interface PromoteResult {
  success: boolean;
  id: string;
  promotedAt?: string;
  error?: string;
}

export interface ListStagedResult {
  configs: Array<Record<string, unknown>>;
  message?: string;
  error?: string;
}

export interface GetResultsOptions {
  last?: number;
}

export interface GetResultsResult {
  results: Array<Record<string, unknown>>;
  error?: string;
}

/**
 * Promote a staged config by setting promoted=true.
 * Idempotent: promoting an already-promoted config succeeds.
 */
export async function promoteConfig(
  client: SupabaseClient,
  id: string,
): Promise<PromoteResult> {
  if (!client) {
    throw new Error("Supabase client is required");
  }

  const promotedAt = new Date().toISOString();

  const { error } = await client
    .from("boltline_staged_configs")
    .update({ promoted: true, promoted_at: promotedAt })
    .eq("id", id);

  if (error) {
    return {
      success: false,
      id,
      error: error.message,
    };
  }

  return {
    success: true,
    id,
    promotedAt,
  };
}

/**
 * List all staged configs that have not been promoted.
 */
export async function listStaged(
  client: SupabaseClient,
): Promise<ListStagedResult> {
  if (!client) {
    throw new Error("Supabase client is required");
  }

  const { data, error } = await client
    .from("boltline_staged_configs")
    .select("*")
    .eq("promoted", false);

  if (error) {
    return {
      configs: [],
      error: error.message,
    };
  }

  const configs = data ?? [];

  return {
    configs,
    message: configs.length === 0 ? "No staged configs found." : undefined,
  };
}

/**
 * Get recent experiment results.
 */
export async function getResults(
  client: SupabaseClient,
  options: GetResultsOptions = {},
): Promise<GetResultsResult> {
  if (!client) {
    throw new Error("Supabase client is required");
  }

  const limit = options.last ?? 10;

  if (limit <= 0) {
    return { results: [] };
  }

  let query = client
    .from("boltline_experiment_results")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } = await query;

  if (error) {
    return {
      results: [],
      error: error.message,
    };
  }

  return {
    results: data ?? [],
  };
}
