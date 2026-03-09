export interface Experiment {
  id: string;
  type: 'temperature' | 'evidence';
  sectionType: string;
  parameters: Record<string, unknown>;
  baseline: Record<string, unknown>;
  createdAt: string;
}

export interface ExperimentResult {
  experimentId: string;
  fixtureId: string;
  fixtureDifficulty: 'easy' | 'medium' | 'hard';
  sectionType: string;
  parameters: Record<string, unknown>;
  generatedContent: string;
  productionScore: { judge1: number; judge2: number; judge3: number; average: number };
  enhancedScore: {
    brandVoice: number;
    clarity: number;
    seoQuality: number;
    conversionStrength: number;
    composite: number;
  };
  divergence: number;
  tokenUsage: number;
  costUsd: number;
  durationMs: number;
  timestamp: string;
}

export interface WinnerCheck {
  isWinner: boolean;
  improvement: number;
  pValue: number;
  config: Record<string, unknown>;
}
