import type { PageFixture, GenerateFn } from '../fixtures/types.js';
import type { SectionType } from '../generator/types.js';
import type { EnhancedResult } from './types.js';

export type { EnhancedResult };

function parseScore(response: string): number {
  if (!response || typeof response !== 'string') return 0;
  const match = response.match(/\b(\d+(?:\.\d+)?)\b/);
  if (!match) return 0;
  const score = parseFloat(match[1]);
  if (!Number.isFinite(score)) return 0;
  return Math.min(10, Math.max(0, Math.round(score)));
}

const DIMENSIONS = [
  {
    key: 'brandVoice' as const,
    prompt: (content: string, sectionType: string, fixture: PageFixture) =>
      `Content type: ${sectionType}\nPage: ${fixture.title} (${fixture.pageUrl})\nBrand: ${fixture.brandProfile.name}\nTone: ${fixture.brandProfile.tone.join(', ')}\nKeywords: ${fixture.brandProfile.keywords.join(', ')}\n\nContent:\n${content}\n\nRate the BRAND VOICE consistency on a scale of 0-10. Does it match the ${fixture.brandProfile.tone.join('/')} tone? Is it distinctly Boltline or generic SaaS? Respond with ONLY a single number.`,
  },
  {
    key: 'clarity' as const,
    prompt: (content: string, sectionType: string, fixture: PageFixture) =>
      `Content type: ${sectionType}\nPage: ${fixture.title} (${fixture.pageUrl})\nAudience: ${fixture.brandProfile.audience}\n\nContent:\n${content}\n\nRate the CLARITY on a scale of 0-10. Is the message instantly understandable? No unnecessary jargon? Could a busy hardware engineer grasp the value in under 5 seconds? Respond with ONLY a single number.`,
  },
  {
    key: 'seoQuality' as const,
    prompt: (content: string, sectionType: string, fixture: PageFixture) =>
      `Content type: ${sectionType}\nPage: ${fixture.title} (${fixture.pageUrl})\nTarget keywords: ${fixture.brandProfile.keywords.join(', ')}\n\nContent:\n${content}\n\nRate the SEO QUALITY on a scale of 0-10. Does it naturally incorporate target keywords? Logical heading structure? Would search engines understand the topic? Appropriate keyword density (not stuffed)? Respond with ONLY a single number.`,
  },
  {
    key: 'conversionStrength' as const,
    prompt: (content: string, sectionType: string, fixture: PageFixture) =>
      `Content type: ${sectionType}\nPage: ${fixture.title} (${fixture.pageUrl})\nObjectives: ${fixture.objectives.join('; ')}\n\nContent:\n${content}\n\nRate the CONVERSION STRENGTH on a scale of 0-10. Does it address specific pain points? Create urgency or desire? Differentiate from competitors? Motivate a hardware engineering manager to request a demo? Respond with ONLY a single number.`,
  },
];

export async function evaluateEnhanced(
  content: string,
  sectionType: SectionType,
  fixture: PageFixture,
  generateFn: GenerateFn,
): Promise<EnhancedResult> {
  const scores = await Promise.all(
    DIMENSIONS.map(async (dim) => {
      try {
        const promptText = dim.prompt(content, sectionType, fixture);
        const response = await generateFn(promptText);
        return { key: dim.key, score: parseScore(response) };
      } catch {
        return { key: dim.key, score: 0 };
      }
    }),
  );

  const result: Record<string, number> = {};
  for (const { key, score } of scores) {
    result[key] = score;
  }

  const composite = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;

  return {
    brandVoice: result['brandVoice'],
    clarity: result['clarity'],
    seoQuality: result['seoQuality'],
    conversionStrength: result['conversionStrength'],
    composite,
  };
}
