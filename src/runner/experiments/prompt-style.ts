export const PROMPT_STYLES = [
  {
    name: 'baseline',
    description: 'Standard marketing copywriter',
    wrapper: (sectionName: string) =>
      `You are a marketing copywriter for a hardware engineering platform. Write content for the ${sectionName} section.`,
  },
  {
    name: 'brand_strategist',
    description: 'Senior brand strategist with hardware industry knowledge',
    wrapper: (sectionName: string) =>
      `You are a senior brand strategist with 15 years of experience in B2B hardware and manufacturing marketing. You understand PLM, MES, and ERP. Write copy that resonates with engineers. Write content for the ${sectionName} section.`,
  },
  {
    name: 'conversion_expert',
    description: 'Conversion rate optimization specialist',
    wrapper: (sectionName: string) =>
      `You are a conversion rate optimization specialist. Every word exists to move the reader toward action. Write benefit-first copy with clear CTAs. Eliminate friction and address objections proactively. Write content for the ${sectionName} section.`,
  },
  {
    name: 'technical_storyteller',
    description: 'Engineer-turned-marketer with deep technical credibility',
    wrapper: (sectionName: string) =>
      `You are a former hardware engineer who became a technical marketer. You write copy that engineers trust because it is specific, accurate, and never oversells. Use concrete examples, real workflows, and quantifiable outcomes. Write content for the ${sectionName} section.`,
  },
  {
    name: 'minimalist',
    description: 'Apple/Stripe-inspired minimal copy',
    wrapper: (sectionName: string) =>
      `You are a minimalist copywriter inspired by Apple, Stripe, and Linear. Every word earns its place. Favor short sentences, active verbs, and whitespace. Communicate maximum value in minimum words. Write content for the ${sectionName} section.`,
  },
] as const;

export type PromptStyleName = (typeof PROMPT_STYLES)[number]['name'];

export function buildStyledPrompt(styleName: string, sectionLabel: string): string {
  const style = PROMPT_STYLES.find((s) => s.name === styleName);
  if (!style) {
    throw new Error(`Unknown prompt style: ${styleName}`);
  }

  const intro = style.wrapper(sectionLabel);

  return `${intro}

Page: {title}
URL: {pageUrl}
Brand tone: {brandTone}
Target audience: {audience}
Current content:
{sections}

Objectives: {objectives}
Evidence Count: {evidenceCount}

Temperature guidance: {temperature}`;
}
