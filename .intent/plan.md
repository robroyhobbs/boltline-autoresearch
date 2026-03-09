# Execution Plan: IntentBid AutoResearch

## Overview

Build an autonomous experiment runner that optimizes IntentBid proposal quality through iterative parameter sweeps. Two experiment types (temperature gradient, evidence injection density), dual evaluation (production + enhanced judges), JSONL+Supabase storage, budget guard, and auto-staging of winning configs.

## Prerequisites

- Node.js 20+, TypeScript 5
- Gemini API key (same as IntentBid production)
- Supabase project (can reuse Intelligence project or create new)
- GitHub **public** repo created for `intentbid-autoresearch` (unlimited Actions minutes)
- Access to IntentBid's current prompt templates and judge prompts (for forking)

## Section Types (Experiment Targets)

The following IntentBid section types are swept by experiments:

- `executive_summary`, `technical_approach`, `management_approach`, `past_performance`, `staffing_plan`, `quality_control`, `transition_plan`

## Baseline Definition

The first experiment result for each (section_type, parameter) pair becomes the baseline. Baselines are stored in `logs/baselines.jsonl` and versioned. When a config is promoted, the promoted config becomes the new baseline.

## Supabase Schema

```sql
-- Experiment results mirror
CREATE TABLE experiment_results (
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

-- Staged winning configs
CREATE TABLE staged_configs (
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
```

## Phase 0: Project Scaffold + Budget Guard

### Description

Initialize the repo, configure TypeScript/Hono/Vitest, and build the budget guard — the safety system that prevents runaway costs. This ships first because nothing else should run without it.

### Tests

#### Happy Path

- [ ] Budget tracker initializes with $0.00 spent for new day
- [ ] Budget tracker accumulates spend across multiple experiments
- [ ] Budget guard allows experiment when remaining > $0.05
- [ ] Budget guard halts experiments when cap exceeded
- [ ] Budget state persists to JSONL between runs
- [ ] Daily reset: new UTC day resets cumulative spend to $0.00

#### Bad Path

- [ ] Budget tracker rejects negative cost values
- [ ] Budget tracker rejects NaN/Infinity cost values
- [ ] Budget guard handles missing/corrupt state file gracefully (starts fresh)
- [ ] Budget guard rejects cap of $0 or negative

#### Edge Cases

- [ ] Budget exactly at cap ($7.50 of $7.50) — halts
- [ ] Budget at cap minus epsilon ($7.49 of $7.50) — allows one more if cost < $0.01
- [ ] UTC midnight rollover during active experiment
- [ ] First run ever with no existing state file

#### Security

- [ ] Budget cap loaded from env var, not hardcoded
- [ ] State file not world-readable (0600 permissions)

#### Data Leak

- [ ] Budget state log does not include API keys
- [ ] Alert messages contain spend amount but no credentials

#### Data Damage

- [ ] Atomic write to state file (write temp + rename)
- [ ] Concurrent budget updates don't corrupt state (write-tmp-then-rename pattern)

### E2E Gate

```bash
pnpm test -- --grep "budget"
# Verify: create tracker → add 3 costs → check remaining → exceed cap → verify halt
```

### Acceptance Criteria

- [ ] L1: All 6 test categories pass
- [ ] Project builds with `pnpm build`
- [ ] Hono health endpoint returns 200
- [ ] Budget guard correctly halts at cap in integration test

---

## Phase 1: Fixture Generator + Storage Layer

### Description

Build the synthetic RFP fixture generator (easy/medium/hard difficulty gradient) and the dual storage layer (JSONL append-only + Supabase mirror). Fixtures are the experiment inputs; storage captures all outputs.

### Tests

#### Happy Path

- [ ] Generates easy fixture: simple SOW, 2-3 sections, minimal compliance
- [ ] Generates medium fixture: multi-section RFP, evaluation criteria, 5-7 requirements
- [ ] Generates hard fixture: complex compliance-heavy, 10+ requirements, multiple evaluation factors
- [ ] Each fixture has consistent schema: id, difficulty, sections[], requirements[], agencyProfile
- [ ] JSONL writer appends single line per result
- [ ] JSONL reader parses all entries correctly
- [ ] Supabase writer mirrors result to experiment_results table
- [ ] Supabase writer mirrors to staged_configs table with promoted=false

#### Bad Path

- [ ] Fixture generator handles Gemini API timeout gracefully
- [ ] Fixture generator handles Gemini rate limit (429) with backoff
- [ ] JSONL writer handles disk full error
- [ ] Supabase writer handles connection failure (retries then logs locally)
- [ ] Supabase writer rejects result missing required fields

#### Edge Cases

- [ ] JSONL file rotation when > 10MB
- [ ] Empty JSONL file reads as empty array
- [ ] Supabase upsert on duplicate experiment ID
- [ ] Fixture with zero requirements (degenerate easy case)

#### Security

- [ ] Supabase connection uses service key from env, never logged
- [ ] Fixture content does not contain real company/agency names
- [ ] JSONL path validated (no path traversal)

#### Data Leak

- [ ] JSONL entries don't contain API keys or connection strings
- [ ] Supabase errors don't expose connection details in logs

#### Data Damage

- [ ] JSONL append is atomic (full line or nothing)
- [ ] Supabase write failure doesn't corrupt JSONL
- [ ] Partial fixture generation doesn't save incomplete fixture

### E2E Gate

```bash
pnpm test -- --grep "fixture|storage"
# Generate 1 fixture per difficulty → write to JSONL → read back → verify schema
# Write to Supabase → query back → verify match
```

### Acceptance Criteria

- [ ] L1: All 6 test categories pass
- [ ] 3 fixture files generated (1 per difficulty)
- [ ] JSONL round-trip verified
- [ ] Supabase write+read verified

---

## Phase 2: Section Generator + Dual Evaluator

### Description

Build the section generator (mirrors IntentBid's prompt pipeline with variable parameters) and the dual evaluator (production 3-judge council + enhanced 4-dimension rubric). This is the core measurement infrastructure.

### Tests

#### Happy Path

- [ ] Section generator produces content for technical_approach section type
- [ ] Section generator produces content for past_performance section type
- [ ] Section generator accepts temperature parameter override
- [ ] Section generator accepts evidence count parameter override
- [ ] Production evaluator returns 3 judge scores + average
- [ ] Enhanced evaluator returns 4 dimension scores (specificity, evidence, compliance, persuasion) + composite
- [ ] Divergence comparator calculates |production.avg - enhanced.composite|
- [ ] All scores normalized to 0-10 range

#### Bad Path

- [ ] Section generator handles Gemini API error (returns structured error, not crash)
- [ ] Section generator handles empty prompt template
- [ ] Evaluator handles empty/null generated content (scores 0, doesn't crash)
- [ ] Evaluator handles Gemini returning non-numeric scores (retries with stricter prompt)
- [ ] Evaluator handles timeout on one judge (returns partial scores + flag)

#### Edge Cases

- [ ] Temperature 0.0 (deterministic) produces consistent scores across runs
- [ ] Temperature 1.0+ produces valid but varied content
- [ ] Evidence count 0 (no evidence injected)
- [ ] Evidence count 20 (way beyond expected range)
- [ ] Very short fixture (50 words) vs very long fixture (5000 words)

#### Security

- [ ] Prompt templates sanitized — no injection from fixture content into system prompt
- [ ] Generated content not executed or eval'd
- [ ] Gemini API key used via env var only

#### Data Leak

- [ ] Judge prompts don't leak scoring rubric details in generated content
- [ ] Error responses don't include full prompt text

#### Data Damage

- [ ] Failed generation doesn't save partial results
- [ ] Failed evaluation doesn't overwrite previous valid scores

### E2E Gate

```bash
pnpm test -- --grep "generator|evaluator"
# Generate 1 section with default params → evaluate with both judge systems → verify score shapes
```

### Acceptance Criteria

- [ ] L1: All 6 test categories pass
- [ ] L5: Prompt injection test (fixture content attempting to override system prompt) blocked
- [ ] Section generation produces coherent content
- [ ] Both evaluators return valid score objects
- [ ] Divergence calculation verified

---

## Phase 3: Experiment Runner + Config Stager

### Description

Build the experiment loop (pick experiment → generate → evaluate → log → check for winners) and the config stager (auto-stages winning configs to Supabase with promoted=false). Wire all components together.

### Tests

#### Happy Path

- [ ] Temperature experiment sweeps 5 values for one section type against one fixture
- [ ] Evidence experiment sweeps 5 counts for one section type against one fixture
- [ ] Runner logs each result to JSONL and Supabase
- [ ] Runner round-robins between experiment types
- [ ] Runner round-robins across fixtures
- [ ] Config stager writes winning config when 10+ results show >5% improvement
- [ ] Staged config has promoted=false
- [ ] Runner respects budget guard (stops when cap hit)

#### Bad Path

- [ ] Runner handles generator failure (logs error, moves to next experiment)
- [ ] Runner handles evaluator failure (logs error, doesn't count toward sample size)
- [ ] Runner handles Supabase stager failure (logs locally, continues)
- [ ] Runner handles all fixtures exhausted (cycles back to first)
- [ ] Config stager rejects improvement < 5%
- [ ] Config stager rejects sample size < 10

#### Edge Cases

- [ ] Statistical significance: borderline p-value (0.049 vs 0.051)
- [ ] All temperatures produce identical scores (no winner staged)
- [ ] Budget exhausted mid-experiment (completes current, halts next)
- [ ] First run with no baseline data (first config becomes baseline)
- [ ] Two configs tied at identical improvement percentage

#### Security

- [ ] Runner validates experiment parameters are within safe bounds
- [ ] No arbitrary code execution from experiment configs
- [ ] Config stager sanitizes config values before Supabase write

#### Data Leak

- [ ] Experiment logs don't include full generated content (just scores + params)
- [ ] Config stager doesn't expose judge prompts

#### Data Damage

- [ ] Incomplete experiment run doesn't corrupt running averages
- [ ] Config stager uses upsert (idempotent, not duplicate)
- [ ] Budget tracker updated before result logged (fail-safe: overcount spend, not undercount)

### E2E Gate

```bash
pnpm test -- --grep "runner|stager"
# Run 3 experiments end-to-end → verify JSONL has 3 entries → verify budget updated
# Simulate 11 winning results → verify config staged in Supabase with promoted=false
```

### Acceptance Criteria

- [ ] L1: All 6 test categories pass
- [ ] L3: Runner handles 10 rapid sequential experiments without race conditions
- [ ] Full experiment cycle verified: generate → evaluate → log → stage
- [ ] Budget guard integration verified

---

## Phase 4: GitHub Actions + Promotion CLI

### Description

Create the GitHub Actions cron workflow and the promotion CLI. The cron workflow triggers one experiment per run. The CLI lets humans review staged configs and promote winners.

### Tests

#### Happy Path

- [ ] GitHub Actions workflow YAML is valid (act --dryrun)
- [ ] Workflow sets concurrency to prevent overlapping runs
- [ ] Workflow passes required env vars (GEMINI_API_KEY, SUPABASE_URL, etc.)
- [ ] CLI `promote <id>` sets promoted=true in Supabase
- [ ] CLI `list-staged` shows all configs with promoted=false
- [ ] CLI `results` shows recent experiment results with scores

#### Bad Path

- [ ] CLI `promote` with invalid ID returns clear error
- [ ] CLI `promote` on already-promoted config is idempotent
- [ ] CLI handles Supabase connection failure gracefully
- [ ] Workflow handles runner script crash (exits non-zero, GitHub logs it)

#### Edge Cases

- [ ] Two workflow runs triggered simultaneously (concurrency group blocks second)
- [ ] Workflow runs when budget already exhausted (exits cleanly with log message)
- [ ] CLI with no staged configs shows empty message, not error

#### Security

- [ ] Secrets stored in GitHub Actions secrets, not in workflow YAML
- [ ] CLI authenticates with Supabase service key from env
- [ ] Promotion action logged with timestamp and operator

#### Data Leak

- [ ] Workflow logs don't print API keys (masked in Actions)
- [ ] CLI output doesn't show Supabase connection string

#### Data Damage

- [ ] Promote is idempotent (re-running is safe)
- [ ] CLI doesn't allow bulk promote without confirmation flag

### E2E Gate

```bash
pnpm test -- --grep "cli"
# Validate workflow YAML syntax
npx yaml-lint .github/workflows/experiment.yml
# Test CLI commands against test Supabase instance
```

### Acceptance Criteria

- [ ] L1: All 6 test categories pass
- [ ] GitHub Actions workflow lint passes
- [ ] CLI promote/list-staged/results commands verified
- [ ] Concurrency guard verified

---

## Final E2E Verification

```bash
# Full integration test: run 5 experiments end-to-end
DAILY_BUDGET_CAP=1.00 pnpm run experiment -- --count 5

# Verify outputs
cat logs/experiments-$(date +%Y-%m).jsonl | wc -l  # should be 5
pnpm run cli -- list-staged  # check if any winners staged
pnpm run cli -- results --last 5  # verify all 5 logged

# Verify budget guard
DAILY_BUDGET_CAP=0.01 pnpm run experiment -- --count 1  # should halt immediately if prior spend > $0.01

# Full test suite
pnpm test
```

## Risk Mitigation

| Risk                              | Mitigation                                                                | Contingency                                                |
| --------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Gemini API cost spike             | Hard budget cap + per-experiment cost tracking                            | Cap kills runner; alert logged                             |
| Synthetic RFPs not representative | Difficulty gradient covers range; can swap for real anonymized data later | Add real RFP fixtures in v1.1                              |
| Statistical false positives       | Require 10+ samples + p<0.05 + >5% improvement                            | Human reviews all staged configs before promotion          |
| GitHub Actions rate limits        | 5-min cron with concurrency guard                                         | Degrade to 15-min interval                                 |
| Supabase downtime                 | JSONL is source of truth; Supabase is mirror                              | Continue logging to JSONL; backfill Supabase when restored |

## References

- [Intent](./intent.md)
- [Decisions](./decisions.md)
