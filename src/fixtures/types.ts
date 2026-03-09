export interface FixtureSection {
  title: string;
  content: string;
  wordCount: number;
}

export interface QualityCriterion {
  name: string;
  weight: number;
  description: string;
}

export interface BrandProfile {
  name: string;
  industry: string;
  audience: string;
  tone: string[];
  keywords: string[];
}

export interface PageFixture {
  id: string;
  difficulty: 'easy' | 'medium' | 'hard';
  title: string;
  pageUrl: string;
  sections: FixtureSection[];
  objectives: string[];
  qualityCriteria?: QualityCriterion[];
  brandProfile: BrandProfile;
}

// Compatibility alias so runner/evaluator code doesn't need changes
export type RfpFixture = PageFixture;
// Alias fields used by shared code
export type EvaluationCriterion = QualityCriterion;
export type AgencyProfile = BrandProfile;

export type GenerateFn = (prompt: string) => Promise<string>;
