import type { SectionType } from './types.js';

export const SECTION_TYPES: SectionType[] = [
  'hero_headline',
  'feature_description',
  'use_case_vertical',
  'value_proposition',
  'social_proof',
  'cta_block',
  'process_step',
];

const templates: Record<SectionType, string> = {
  hero_headline: `You are a marketing copywriter for Boltline, a modern hardware engineering platform. Write a hero headline and subheadline.

Page: {title}
URL: {pageUrl}
Brand tone: {brandTone}
Target audience: {audience}
Current content:
{sections}

Objectives: {objectives}

Write a compelling hero headline (under 10 words) and subheadline (under 30 words) that instantly communicates what Boltline does. Avoid jargon. Make it memorable and action-oriented. Include {evidenceCount} specific proof points if possible. Temperature guidance: {temperature}`,

  feature_description: `You are a marketing copywriter for Boltline, a modern hardware engineering platform. Write a feature description.

Page: {title}
URL: {pageUrl}
Brand tone: {brandTone}
Target audience: {audience}
Current content:
{sections}

Objectives: {objectives}

Write a concise feature description (40-80 words) that leads with the benefit, then explains the capability. Use active voice. Avoid enterprise-speak. Include {evidenceCount} concrete examples. Temperature guidance: {temperature}`,

  use_case_vertical: `You are a marketing copywriter for Boltline, a modern hardware engineering platform. Write copy for a specific industry vertical.

Page: {title}
URL: {pageUrl}
Brand tone: {brandTone}
Target audience: {audience}
Current content:
{sections}

Objectives: {objectives}

Write industry-specific copy (50-100 words) that demonstrates deep understanding of the vertical. Use correct terminology and reference specific standards or regulations. Include {evidenceCount} industry-specific pain points. Temperature guidance: {temperature}`,

  value_proposition: `You are a marketing copywriter for Boltline, a modern hardware engineering platform. Write a value proposition.

Page: {title}
URL: {pageUrl}
Brand tone: {brandTone}
Target audience: {audience}
Current content:
{sections}

Objectives: {objectives}

Write a clear value proposition (40-80 words) that differentiates Boltline from legacy tools (Arena, Teamcenter, SAP). Include {evidenceCount} specific differentiators. Temperature guidance: {temperature}`,

  social_proof: `You are a marketing copywriter for Boltline, a modern hardware engineering platform. Write a social proof section.

Page: {title}
URL: {pageUrl}
Brand tone: {brandTone}
Target audience: {audience}
Current content:
{sections}

Objectives: {objectives}

Write social proof copy (30-60 words) that builds trust and credibility. Be specific but avoid fake statistics. Include {evidenceCount} trust signals. Temperature guidance: {temperature}`,

  cta_block: `You are a marketing copywriter for Boltline, a modern hardware engineering platform. Write a call-to-action block.

Page: {title}
URL: {pageUrl}
Brand tone: {brandTone}
Target audience: {audience}
Current content:
{sections}

Objectives: {objectives}

Write a CTA block (20-50 words) with a headline, supporting text, and button text. Make it compelling without being pushy. Include {evidenceCount} value angles. Temperature guidance: {temperature}`,

  process_step: `You are a marketing copywriter for Boltline, a modern hardware engineering platform. Write copy for one step in a process flow.

Page: {title}
URL: {pageUrl}
Brand tone: {brandTone}
Target audience: {audience}
Current content:
{sections}

Objectives: {objectives}

Write a process step description (20-40 words) that is concise and action-oriented. Use active verbs. Include {evidenceCount} specific details. Temperature guidance: {temperature}`,
};

export function getPromptTemplate(sectionType: SectionType): string {
  const template = templates[sectionType];
  if (!template) {
    throw new Error(`Unknown section type: ${sectionType}`);
  }
  return template;
}
