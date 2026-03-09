# IntentBid AutoResearch Intent

> Anchor: Autonomous experiment runner that iteratively optimizes IntentBid proposal quality through prompt/parameter sweeps, evaluated by dual judge systems, with results auto-staged for promotion.

## Responsibilities

- Generate synthetic RFP fixtures across a difficulty gradient
- Execute 2 experiment types: temperature gradient by section type, evidence injection density
- Track divergence between production and enhanced judges as passive signal (judge optimization deferred to v2 with human-in-the-loop)
- Maximize experiment throughput within daily budget constraint
- Evaluate each experiment with both production judges and enhanced 4-dimension rubric judges
- Log results to append-only JSONL and mirror to Supabase for querying
- Enforce hard daily budget cap with alerting
- Auto-stage winning configurations to Supabase config table (requires promotion before consumption)

## Non-Goals

- Judge prompt optimization (v2, needs human ground truth)
- Intelligence/pricing/export optimization (v2+)
- Multi-model arbitrage or agency tone matching (v2+)
- Dashboard UI for viewing results
- Modifying IntentBid production code directly
- Real-time experiment execution during live proposal generation

## Components

- **Experiment Runner** — Core loop: pick experiment → generate section → evaluate → log → check for winners
- **Section Generator** — Mirrors IntentBid's generation pipeline with variable parameters
- **Dual Evaluator** — Production 3-judge council + enhanced rubric (specificity, evidence integration, compliance coverage, persuasion strength). Tracks divergence between systems.
- **Fixture Generator** — Creates synthetic RFPs across easy/medium/hard difficulty
- **Storage** — JSONL append-only logs (source of truth) + Supabase mirror (queryable)
- **Config Stager** — Writes winning configs to Supabase. Configs inactive until `promoted = true` set via manual action.
- **Budget Guard** — Tracks cumulative daily spend, hard-stops experiments at cap, logs alert

## Constraints

- Daily budget hard cap: configurable via env var (default: $7.50)
- Minimum 10 results per configuration before considering for staging
- Statistical significance: >5% improvement with t-test (p<0.05) before auto-staging
- Staged configs require `promoted = true` before IntentBid reads them
- Test across representative RFP complexity (easy, medium, hard difficulty)
- Gemini API: respect rate limits, use exponential backoff
- GitHub Actions: use concurrency to prevent overlapping runs
- JSONL files: rotate monthly to prevent unbounded growth

## Example Flow

```
1. Cron triggers experiment run
2. Budget guard checks remaining daily budget → continue if sufficient
3. Pick next experiment type and fixture (round-robin)
4. Generate section with experimental parameters
5. Evaluate with production judges → score
6. Evaluate with enhanced judges → 4-dimension score + divergence
7. Log result to JSONL + Supabase
8. If 5+ results for this config and >5% improvement (p<0.05):
   → auto-stage to config table (promoted = false)
9. Update budget tracker
```
