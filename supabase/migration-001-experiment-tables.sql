-- Migration 001: Create Boltline experiment tables
-- Run this in the Supabase SQL Editor for project: twsivarjhpdrldewmoid (intentbid-intelligence)
-- URL: https://supabase.com/dashboard/project/twsivarjhpdrldewmoid/sql/new

-- Boltline experiment results
CREATE TABLE IF NOT EXISTS boltline_experiment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_type TEXT NOT NULL,
  section_type TEXT NOT NULL,
  parameters JSONB NOT NULL,
  fixture_id TEXT NOT NULL,
  fixture_difficulty TEXT NOT NULL,
  production_score JSONB NOT NULL,
  enhanced_score JSONB NOT NULL,
  divergence NUMERIC NOT NULL,
  token_usage INTEGER NOT NULL,
  cost_usd NUMERIC NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Boltline staged winning configs
CREATE TABLE IF NOT EXISTS boltline_staged_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_type TEXT NOT NULL,
  section_type TEXT NOT NULL,
  config JSONB NOT NULL,
  improvement NUMERIC NOT NULL,
  sample_size INTEGER NOT NULL,
  promoted BOOLEAN DEFAULT FALSE,
  staged_at TIMESTAMPTZ DEFAULT NOW(),
  promoted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_boltline_results_type ON boltline_experiment_results(experiment_type);
CREATE INDEX IF NOT EXISTS idx_boltline_results_section ON boltline_experiment_results(section_type);
CREATE INDEX IF NOT EXISTS idx_boltline_results_created ON boltline_experiment_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_boltline_staged_promoted ON boltline_staged_configs(promoted);
CREATE INDEX IF NOT EXISTS idx_boltline_staged_section ON boltline_staged_configs(section_type);
