import type { PageFixture, GenerateFn } from './types.js';

const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

/**
 * Validates a PageFixture object. Returns true if valid, false otherwise.
 */
export function validateFixture(fixture: PageFixture): boolean {
  if (!fixture || typeof fixture !== 'object') return false;
  if (!fixture.id || typeof fixture.id !== 'string') return false;
  if (!fixture.title || typeof fixture.title !== 'string') return false;
  if (!fixture.pageUrl || typeof fixture.pageUrl !== 'string') return false;
  if (!VALID_DIFFICULTIES.has(fixture.difficulty)) return false;
  if (!Array.isArray(fixture.sections)) return false;
  if (!Array.isArray(fixture.objectives)) return false;
  if (!fixture.brandProfile || typeof fixture.brandProfile !== 'object') return false;
  if (!fixture.brandProfile.name || !fixture.brandProfile.industry) return false;
  return true;
}

/**
 * Generates synthetic page fixtures using an injectable AI generation function.
 */
export class FixtureGenerator {
  private generateFn: GenerateFn;

  constructor(generateFn: GenerateFn) {
    this.generateFn = generateFn;
  }

  async generate(difficulty: 'easy' | 'medium' | 'hard'): Promise<PageFixture> {
    const prompt = this.buildPrompt(difficulty);
    const response = await this.generateFn(prompt);

    let parsed: PageFixture;
    try {
      parsed = JSON.parse(response);
    } catch {
      throw new Error(`Failed to parse generated fixture: invalid JSON`);
    }

    parsed.difficulty = difficulty;

    if (!validateFixture(parsed)) {
      throw new Error('Generated fixture failed validation: missing required fields');
    }

    return parsed;
  }

  private buildPrompt(difficulty: 'easy' | 'medium' | 'hard'): string {
    const difficultySpec = {
      easy: '2-3 sections, simple landing page, general audience',
      medium: '5-7 sections, product or use-case page, specific industry audience',
      hard: '8+ sections, full product page with multiple feature areas, technical audience',
    };

    return `You are a synthetic web page content generator for marketing testing.

Generate a realistic but fictional hardware/engineering company web page fixture at "${difficulty}" difficulty level.

Difficulty specification: ${difficultySpec[difficulty]}

Return a JSON object with this exact structure:
{
  "id": "unique-string-id",
  "difficulty": "${difficulty}",
  "title": "Page title",
  "pageUrl": "https://example.com/page",
  "sections": [{"title": "string", "content": "string", "wordCount": number}],
  "objectives": ["objective strings"],
  "qualityCriteria": [{"name": "string", "weight": number, "description": "string"}],
  "brandProfile": {"name": "string", "industry": "string", "audience": "string", "tone": ["strings"], "keywords": ["strings"]}
}

Return ONLY valid JSON, no markdown or explanations.`;
  }
}
