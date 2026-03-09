import type { PageFixture, GenerateFn } from '../fixtures/types.js';
import type { SectionType } from '../generator/types.js';
import type { ProductionResult } from './types.js';

export type { ProductionResult };

function parseScore(response: string): number {
  if (!response || typeof response !== 'string') return 0;
  const match = response.match(/\b(\d+(?:\.\d+)?)\b/);
  if (!match) return 0;
  const score = parseFloat(match[1]);
  if (!Number.isFinite(score)) return 0;
  return Math.min(10, Math.max(0, Math.round(score)));
}

function buildJudgePrompts(
  content: string,
  sectionType: string,
  fixture: PageFixture,
): string[] {
  const base = `Content type: ${sectionType}\nPage: ${fixture.title} (${fixture.pageUrl})\nBrand: ${fixture.brandProfile.name} — ${fixture.brandProfile.tone.join(', ')}\nAudience: ${fixture.brandProfile.audience}\nObjectives: ${fixture.objectives.join('; ')}\n\nContent to evaluate:\n${content}\n\n`;

  return [
    // Judge 1: Brand voice
    `${base}You are a brand strategist evaluating marketing copy for Boltline, a modern hardware engineering platform. Rate how well this ${sectionType} content matches the brand voice: professional yet accessible, confident not arrogant, modern not trendy. Score 0-10. Respond with ONLY a single number.`,

    // Judge 2: Clarity & readability
    `${base}You are a UX writer evaluating marketing copy. Rate the clarity and readability of this ${sectionType} content on a scale of 0-10. Is the value proposition immediately clear? Is it free of jargon? Would a busy engineer understand it in 5 seconds? Respond with ONLY a single number.`,

    // Judge 3: Conversion strength
    `${base}You are a conversion rate optimizer. Rate how effectively this ${sectionType} content drives action on a scale of 0-10. Does it create desire? Does it address pain points? Would it make someone want to try Boltline? Respond with ONLY a single number.`,
  ];
}

export async function evaluateProduction(
  content: string,
  sectionType: SectionType,
  fixture: PageFixture,
  generateFn: GenerateFn,
): Promise<ProductionResult> {
  const prompts = buildJudgePrompts(content, sectionType, fixture);

  const scores = await Promise.all(
    prompts.map(async (prompt) => {
      try {
        const response = await generateFn(prompt);
        return parseScore(response);
      } catch {
        return 0;
      }
    }),
  );

  const [judge1, judge2, judge3] = scores;
  const average = (judge1 + judge2 + judge3) / 3;

  return { judge1, judge2, judge3, average };
}
