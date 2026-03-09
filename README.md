# Boltline AutoResearch

Autonomous experiment runner that finds the optimal AI settings for generating marketing content for [boltline.com](https://boltline.com).

**Live Dashboard:** [robroyhobbs.github.io/boltline-autoresearch](https://robroyhobbs.github.io/boltline-autoresearch/)

## What This Does

When you use AI to write marketing copy, the quality depends on how you prompt it — creativity level, writing persona, how much context you provide. Instead of guessing, AutoResearch tests every combination automatically and finds what works best.

For each content type (hero headlines, feature descriptions, value propositions, etc.), the system:

1. **Generates** marketing copy using different parameter settings
2. **Scores** each version with 7 AI judges across 4 dimensions
3. **Compares** results to find the winning configuration

The output: optimized "recipes" for generating each type of content — so first drafts are consistently higher quality and need less human editing.

## What Gets Tested

| Experiment | What It Varies | Values Tested |
|---|---|---|
| Temperature | AI creativity/randomness | 0.1, 0.3, 0.5, 0.7, 0.9 |
| Evidence Count | Supporting details included | 1, 2, 3, 5, 7, 10 |
| Prompt Style | Writing persona | baseline, brand_strategist, conversion_expert, technical_storyteller, minimalist |
| Output Length | Max token budget | 512, 1024, 2048, 4096 |
| Model | Which AI model | Gemini Flash vs Pro |

## How Quality Is Measured

Each piece of generated content is scored by two judge panels:

**Quick Score** (3 judges, surface review):
- Brand voice — does it sound like Boltline?
- Clarity — is the value prop immediately clear?
- Conversion — would it make someone want to try Boltline?

**Deep Score** (4 dimensions, thorough review):
- **Brand Voice** — tone consistency with professional/accessible/confident
- **Clarity** — understandable in 5 seconds by a busy engineer?
- **SEO Quality** — natural keyword incorporation, heading structure
- **Conversion Strength** — pain points addressed, differentiation, urgency

**Agreement** score shows how much the two panels align. High agreement = the content is solid across the board. Low agreement = it looks good on the surface but has a weakness (usually SEO).

## Pages Under Test

Content is generated against fixtures built from real Boltline pages:

- **Homepage** (boltline.com) — hero headline, process steps, scalability, social proof
- **Use Cases** (boltline.com/use-cases) — headline + 6 industry verticals
- **Product** (boltline.com/product) — headline + 7 feature descriptions

## How to Read Results

On the [dashboard](https://robroyhobbs.github.io/boltline-autoresearch/):

- **Winning Configs** tab shows the best parameter for each content type, how much it beats the default, and which dimensions are weakest
- **All Results** tab shows individual experiment runs — click any row to see dimension breakdowns
- A green **BEST** tag marks the highest-scoring experiment for each section type

Example insight: *"For hero headlines, temperature 0.1 scored 9.0/10 — that's +12% better than the default 0.7. Low creativity wins because hardware engineers prefer precise, direct copy over clever wordplay."*

## Running Experiments

Experiments run automatically via GitHub Actions. To run manually:

```bash
# Run 10 experiments locally
pnpm experiment:local -- --count 10

# Start the dashboard server (localhost:3838)
pnpm dev
```

### Environment Variables

```
GEMINI_API_KEY=        # Google Gemini API key
SUPABASE_URL=          # Supabase project URL
SUPABASE_SERVICE_KEY=  # Supabase service role key (write access)
```

## Architecture

```
src/
  fixtures/         # Boltline page definitions (homepage, use-cases, product)
  generator/        # Prompt templates + content generation
  evaluator/        # 7 AI judges (3 quick + 4 deep)
  runner/           # Experiment loop + 5 experiment types
  storage/          # Supabase + JSONL logging
  budget/           # Daily spend tracking
  cli/              # CLI commands
  index.ts          # Hono server + API routes
docs/
  index.html        # Static dashboard (GitHub Pages)
```

## Using Winning Configs

After experiments find winners, promote them and fetch via API:

```
GET /api/v1/optimal-config?section=hero_headline
```

Returns the promoted configuration (temperature, evidence count, prompt style) to use when generating content for that section type.

## Stack

TypeScript, Hono, Supabase, Gemini API, GitHub Actions, GitHub Pages
