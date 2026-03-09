import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getResults, listStaged, promoteConfig } from "./cli/commands.js";

const app = new Hono();

const startedAt = new Date().toISOString();

// Supabase client (lazy — only created when API routes are hit)
let _supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }

  _supabaseClient = createClient(url, key);
  return _supabaseClient;
}

// Read dashboard HTML at startup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dashboardPath = resolve(__dirname, "..", "src", "dashboard.html");
let dashboardHtml: string;
try {
  dashboardHtml = readFileSync(dashboardPath, "utf-8");
} catch {
  // Fallback: try relative to compiled dist/
  try {
    dashboardHtml = readFileSync(
      resolve(__dirname, "..", "src", "dashboard.html"),
      "utf-8",
    );
  } catch {
    dashboardHtml =
      "<html><body><h1>Dashboard HTML not found</h1></body></html>";
  }
}

// --- Routes ---

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    uptime: process.uptime(),
    startedAt,
  });
});

// Dashboard
app.get("/", (c) => {
  return c.html(dashboardHtml);
});

// API: recent experiment results
app.get("/api/results", async (c) => {
  try {
    const client = getSupabaseClient();
    const last = Number(c.req.query("last")) || 50;
    const result = await getResults(client, { last });
    return c.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ results: [], error: message }, 500);
  }
});

// API: staged configs
app.get("/api/staged", async (c) => {
  try {
    const client = getSupabaseClient();
    const result = await listStaged(client);
    return c.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ configs: [], error: message }, 500);
  }
});

// API: optimal config for a section type
// Called by IntentBid to get the best-known parameters for generating a section.
// GET /api/v1/optimal-config?section=executive_summary
app.get("/api/v1/optimal-config", async (c) => {
  try {
    const section = c.req.query("section");
    if (!section) {
      return c.json({ error: "section query parameter is required" }, 400);
    }

    const client = getSupabaseClient();

    // Fetch promoted configs for this section type, most recent first
    const { data, error } = await client
      .from("boltline_staged_configs")
      .select("*")
      .eq("promoted", true)
      .eq("section_type", section)
      .order("promoted_at", { ascending: false })
      .returns<Record<string, unknown>[]>();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    // Defaults
    const defaults = {
      temperature: 0.7,
      evidenceCount: 3,
      promptStyle: "baseline",
    };

    if (!data || data.length === 0) {
      return c.json({
        section,
        config: defaults,
        source: "defaults",
        message: "No promoted configs found — using defaults",
      });
    }

    // Merge promoted configs by experiment type (most recent wins)
    const merged = { ...defaults };
    for (const row of data) {
      const cfg = row.config as Record<string, unknown>;
      if (cfg.temperature !== undefined)
        merged.temperature = cfg.temperature as number;
      if (cfg.evidenceCount !== undefined)
        merged.evidenceCount = cfg.evidenceCount as number;
      if (cfg.promptStyle !== undefined)
        merged.promptStyle = cfg.promptStyle as string;
    }

    return c.json({
      section,
      config: merged,
      source: "promoted",
      promotedConfigs: data.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// API: all optimal configs (bulk fetch for all section types)
// GET /api/v1/optimal-configs
app.get("/api/v1/optimal-configs", async (c) => {
  try {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("boltline_staged_configs")
      .select("*")
      .eq("promoted", true)
      .order("promoted_at", { ascending: false })
      .returns<Record<string, unknown>[]>();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    const defaults = {
      temperature: 0.7,
      evidenceCount: 3,
      promptStyle: "baseline",
    };

    // Group by section type
    const bySection: Record<string, typeof defaults> = {};
    for (const row of data ?? []) {
      const section = row.section_type as string;
      if (!bySection[section]) {
        bySection[section] = { ...defaults };
      }
      const cfg = row.config as Record<string, unknown>;
      if (cfg.temperature !== undefined)
        bySection[section].temperature = cfg.temperature as number;
      if (cfg.evidenceCount !== undefined)
        bySection[section].evidenceCount = cfg.evidenceCount as number;
      if (cfg.promptStyle !== undefined)
        bySection[section].promptStyle = cfg.promptStyle as string;
    }

    return c.json({
      configs: bySection,
      defaults,
      source: data && data.length > 0 ? "promoted" : "defaults",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// API: promote a staged config
app.post("/api/promote/:id", async (c) => {
  try {
    const client = getSupabaseClient();
    const id = c.req.param("id");
    const result = await promoteConfig(client, id);
    return c.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

const port = Number(process.env.PORT) || 3838;

serve({ fetch: app.fetch, port }, () => {
  console.log(`Boltline AutoResearch running on http://localhost:${port}`);
});

export { app };
