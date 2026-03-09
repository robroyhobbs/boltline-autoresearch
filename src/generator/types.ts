import type { PageFixture, GenerateFn } from '../fixtures/types.js';

export type SectionType =
  | 'hero_headline'
  | 'feature_description'
  | 'use_case_vertical'
  | 'value_proposition'
  | 'social_proof'
  | 'cta_block'
  | 'process_step';

export interface SectionConfig {
  sectionType: SectionType;
  fixture: PageFixture;
  temperature?: number;
  evidenceCount?: number;
  promptTemplate?: string;
  generateFn: GenerateFn;
}

export interface SectionResult {
  content: string;
  tokenUsage: number;
  costUsd: number;
  durationMs: number;
}
