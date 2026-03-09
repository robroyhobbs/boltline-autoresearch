# Interview Decisions: IntentBid AutoResearch

> Anchor: Autonomous overnight experiments that find optimal prompt templates, parameters, and scoring weights to maximize IntentBid proposal quality.

## Decisions

### 1. Scope
- **Question**: What is this module's reason to exist?
- **Decision**: Optimize proposal quality — autonomous overnight experiments that find best prompt templates, parameters, and scoring weights
- **Rationale**: Focused scope delivers clear ROI. Broader optimization (intelligence, pricing) can be added later.

### 2. Architecture
- **Question**: Where should this live?
- **Decision**: New standalone repo — `intentbid-autoresearch`
- **Rationale**: Keeps experimentation fully decoupled from production proposal generation and intelligence services. Clean boundary.

### 3. Execution Mode
- **Question**: How should experiments execute?
- **Decision**: Shadow production — runs alongside real proposal generation, comparing experimental vs. current prompts on same inputs
- **Rationale**: Most realistic signal. Synthetic inputs still used (see #6) but the generation pipeline mirrors production behavior.

### 4. Budget
- **Question**: Budget tolerance for overnight runs?
- **Decision**: $5-10/night
- **Rationale**: Sufficient for ~50-100 section generations. Hard cap enforced (see #12).

### 5. Evaluation Strategy
- **Question**: Use same judges or independent evaluation?
- **Decision**: Both — run production 3-judge council AND enhanced judges with 4 additional rubric dimensions. Compare divergence.
- **Rationale**: Detects when production judges are suboptimal. Enhanced judges score: specificity, evidence integration, compliance coverage, persuasion strength.

### 6. Result Promotion
- **Question**: What happens when a winning config is found?
- **Decision**: Auto-stage to Supabase config table. IntentBid reads configs at generation time. No deploy needed.
- **Rationale**: Fastest feedback loop. Human reviews staged configs in Supabase before IntentBid reads them (can add approval flag).

### 7. V1 Experiments
- **Question**: Which 3 experiments ship in v1?
- **Decision**: Temperature gradient by section type, evidence injection density, judge prompt optimization
- **Rationale**: Highest ROI, lowest effort, all data ready. No new data ingestion needed.

### 8. Input Data
- **Question**: How to source experiment inputs?
- **Decision**: Synthetic RFPs with difficulty gradient — 3 easy (simple SOW), 3 medium (multi-section RFP), 3 hard (complex compliance-heavy)
- **Rationale**: Generate fresh — no existing fixtures to reuse. Difficulty gradient tests robustness across complexity levels.

### 9. Schedule
- **Question**: Experiment run schedule?
- **Decision**: Continuous low-rate — 1 experiment every ~5 minutes, 24/7
- **Rationale**: More granular data, steady progress. Budget cap prevents overspend.

### 10. Tech Stack
- **Question**: Runtime and framework?
- **Decision**: Node + Hono (match Intelligence service patterns). Vitest tests.
- **Rationale**: Shared conventions with intentbid-intelligence. Easy to copy patterns.

### 11. Storage
- **Question**: Where to store experiment results?
- **Decision**: Both — JSONL (append-only source of truth, git-tracked) + Supabase table (queryable, dashboard-ready)
- **Rationale**: JSONL for simplicity and portability. Supabase for querying and future dashboard.

### 12. Compute
- **Question**: Where does continuous execution run?
- **Decision**: GitHub Actions cron — scheduled workflow every 5 minutes
- **Rationale**: Free tier sufficient for this rate. No infrastructure to manage. Stops naturally if repo is archived.

### 13. Cost Control
- **Question**: How to enforce budget cap?
- **Decision**: Hard cap + alert — track cumulative API spend per day, stop experiments when cap hit, log notification
- **Rationale**: Prevents runaway costs. Clear signal when budget exhausted.

### 14. Enhanced Judge Rubrics
- **Question**: What dimensions should enhanced judges score?
- **Decision**: All four — specificity, evidence integration, compliance coverage, persuasion strength
- **Rationale**: Richer signal justifies 2x evaluation cost. Each dimension catches different failure modes.

## Open Items
- None — all decisions resolved.

## Out of Scope
- Intelligence accuracy optimization (agency profiles, win probability model)
- Pricing strategy optimization
- Export/formatting experiments
- Multi-model arbitrage (deferred to v2)
- Agency tone matching (deferred to v2)
- Dashboard UI for viewing results (future — Supabase table enables this later)
