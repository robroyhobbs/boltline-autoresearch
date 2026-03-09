import type { PageFixture, GenerateFn } from '../fixtures/types.js';
import { getPromptTemplate } from './prompt-templates.js';
import type { SectionType, SectionConfig, SectionResult } from './types.js';

export type { SectionType, SectionConfig, SectionResult };

/**
 * Interpolate template placeholders with fixture data.
 */
function interpolateTemplate(template: string, fixture: PageFixture, config: SectionConfig): string {
  const sectionsText = fixture.sections
    .map((s) => `- ${s.title}: ${s.content}`)
    .join('\n');

  const objectivesText = fixture.objectives.join('; ');
  const brandTone = fixture.brandProfile.tone.join(', ');
  const audience = fixture.brandProfile.audience;

  return template
    .replace(/\{title\}/g, fixture.title)
    .replace(/\{pageUrl\}/g, fixture.pageUrl)
    .replace(/\{brandTone\}/g, brandTone)
    .replace(/\{audience\}/g, audience)
    .replace(/\{sections\}/g, sectionsText)
    .replace(/\{objectives\}/g, objectivesText)
    .replace(/\{evidenceCount\}/g, String(config.evidenceCount ?? 3))
    .replace(/\{temperature\}/g, String(config.temperature ?? 0.7));
}

/**
 * Generate marketing content using the provided generate function.
 */
export async function generateSection(config: SectionConfig): Promise<SectionResult> {
  const { sectionType, fixture, generateFn } = config;

  let template = config.promptTemplate;
  if (!template || template.trim() === '') {
    template = getPromptTemplate(sectionType);
  }

  const prompt = interpolateTemplate(template, fixture, config);

  const startTime = Date.now();

  let content: string;
  try {
    const response = await generateFn(prompt);
    if (!response || typeof response !== 'string' || response.trim() === '') {
      throw new Error('Empty response from generator');
    }
    content = response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Generation failed: ${message}`);
  }

  const durationMs = Date.now() - startTime;

  const promptTokens = Math.ceil(prompt.length / 4);
  const completionTokens = Math.ceil(content.length / 4);
  const tokenUsage = promptTokens + completionTokens;
  const costUsd = (tokenUsage / 1000) * 0.00025;

  return {
    content,
    tokenUsage,
    costUsd,
    durationMs,
  };
}
