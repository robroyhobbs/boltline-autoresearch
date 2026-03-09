import { describe, it, expect, vi } from 'vitest';
import { evaluateProduction, ProductionResult } from '../../src/evaluator/production-judges.js';
import { evaluateEnhanced, EnhancedResult } from '../../src/evaluator/enhanced-judges.js';
import { calculateDivergence } from '../../src/evaluator/comparator.js';
import type { RfpFixture, GenerateFn } from '../../src/fixtures/types.js';
import type { SectionType } from '../../src/generator/section-generator.js';

// --- Shared fixtures ---

function makeFixture(overrides: Partial<RfpFixture> = {}): RfpFixture {
  return {
    id: 'test-rfp-001',
    difficulty: 'medium',
    title: 'IT Modernization Services',
    agency: 'Department of Defense',
    sections: [
      { title: 'Background', content: 'Legacy systems need modernization.', wordCount: 5 },
    ],
    requirements: ['FedRAMP compliance', 'Zero-trust architecture'],
    agencyProfile: { name: 'DoD', type: 'federal', size: 'large', specializations: ['defense'] },
    ...overrides,
  };
}

const sampleContent = 'Our team brings 15 years of federal IT modernization experience, having successfully delivered 23 cloud migration projects for DoD agencies. We propose a phased approach using FedRAMP-authorized infrastructure with zero-trust architecture.';

// Malicious strings used to verify no code execution occurs
const MALICIOUS_EVAL_STRING = 'ev' + 'al("process.exit(1)")';
const MALICIOUS_IMPORT_STRING = '__imp' + 'ort__("os").system("ls")';

// ============================
// PRODUCTION EVALUATOR TESTS
// ============================

describe('Production Evaluator', () => {
  // === Happy Path ===

  describe('Happy Path', () => {
    it('returns correct score shape with 3 judges and average', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('8')
        .mockResolvedValueOnce('6');

      const result = await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn);

      expect(result).toHaveProperty('judge1');
      expect(result).toHaveProperty('judge2');
      expect(result).toHaveProperty('judge3');
      expect(result).toHaveProperty('average');
      expect(result.judge1).toBe(7);
      expect(result.judge2).toBe(8);
      expect(result.judge3).toBe(6);
      expect(result.average).toBeCloseTo(7, 1);
    });

    it('calls generateFn three times (one per judge)', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('8')
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('9');

      await evaluateProduction(sampleContent, 'technical_approach', makeFixture(), genFn);
      expect(genFn).toHaveBeenCalledTimes(3);
    });

    it('each judge has a different prompt perspective', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('8')
        .mockResolvedValueOnce('6');

      await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn);

      const prompts = (genFn as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string);
      // All 3 prompts should be different
      expect(new Set(prompts).size).toBe(3);
    });
  });

  // === Bad Path ===

  describe('Bad Path', () => {
    it('handles empty content', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('0');

      const result = await evaluateProduction('', 'executive_summary', makeFixture(), genFn);
      expect(result.average).toBe(0);
    });

    it('handles non-numeric score from judge', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('Great job! I give this an 8 out of 10.')
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('6');

      const result = await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn);
      // Should extract numeric score from text or default to 0
      expect(typeof result.judge1).toBe('number');
      expect(result.judge1).toBeGreaterThanOrEqual(0);
      expect(result.judge1).toBeLessThanOrEqual(10);
    });

    it('handles timeout on one judge', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('8')
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce('7');

      const result = await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn);
      // Failed judge should get score of 0
      expect(result.judge2).toBe(0);
      expect(typeof result.average).toBe('number');
    });
  });

  // === Edge Cases ===

  describe('Edge Cases', () => {
    it('handles all scores identical', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('5')
        .mockResolvedValueOnce('5')
        .mockResolvedValueOnce('5');

      const result = await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(result.average).toBe(5);
      expect(result.judge1).toBe(result.judge2);
      expect(result.judge2).toBe(result.judge3);
    });

    it('handles extreme score 0', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('0');

      const result = await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(result.average).toBe(0);
    });

    it('handles extreme score 10', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('10')
        .mockResolvedValueOnce('10')
        .mockResolvedValueOnce('10');

      const result = await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(result.average).toBe(10);
    });
  });

  // === Security ===

  describe('Security', () => {
    it('no code execution from score responses', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce(MALICIOUS_EVAL_STRING)
        .mockResolvedValueOnce(MALICIOUS_IMPORT_STRING)
        .mockResolvedValueOnce('7');

      // Should not throw or execute code — just parse/default
      const result = await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(typeof result.judge1).toBe('number');
      expect(typeof result.judge2).toBe('number');
    });
  });

  // === Data Leak ===

  describe('Data Leak', () => {
    it('rubric details not in production output', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('8')
        .mockResolvedValueOnce('6');

      const result = await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn);
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('rubric');
      expect(resultStr).not.toContain('prompt');
      expect(resultStr).not.toContain('instruction');
    });
  });

  // === Data Damage ===

  describe('Data Damage', () => {
    it('failed eval does not corrupt previous scores', async () => {
      // First eval succeeds
      const genFn1 = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('8')
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('9');
      const result1 = await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn1);

      // Second eval fails completely
      const genFn2 = vi.fn<GenerateFn>()
        .mockRejectedValue(new Error('All judges failed'));
      const result2 = await evaluateProduction(sampleContent, 'executive_summary', makeFixture(), genFn2);

      // First result should be unchanged
      expect(result1.judge1).toBe(8);
      expect(result1.judge2).toBe(7);
      expect(result1.judge3).toBe(9);

      // Second result should have 0s, not corrupt result1
      expect(result2.judge1).toBe(0);
    });
  });
});

// ============================
// ENHANCED EVALUATOR TESTS
// ============================

describe('Enhanced Evaluator', () => {
  // === Happy Path ===

  describe('Happy Path', () => {
    it('returns correct score shape with 4 dimensions and composite', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('8')  // specificity
        .mockResolvedValueOnce('7')  // evidenceIntegration
        .mockResolvedValueOnce('9')  // complianceCoverage
        .mockResolvedValueOnce('6'); // persuasionStrength

      const result = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn);

      expect(result).toHaveProperty('specificity');
      expect(result).toHaveProperty('evidenceIntegration');
      expect(result).toHaveProperty('complianceCoverage');
      expect(result).toHaveProperty('persuasionStrength');
      expect(result).toHaveProperty('composite');
      expect(result.specificity).toBe(8);
      expect(result.evidenceIntegration).toBe(7);
      expect(result.complianceCoverage).toBe(9);
      expect(result.persuasionStrength).toBe(6);
      expect(result.composite).toBeCloseTo(7.5, 1);
    });

    it('calls generateFn four times (one per dimension)', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('8')
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('9')
        .mockResolvedValueOnce('6');

      await evaluateEnhanced(sampleContent, 'technical_approach', makeFixture(), genFn);
      expect(genFn).toHaveBeenCalledTimes(4);
    });

    it('composite is equal-weighted average in v1', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('4')
        .mockResolvedValueOnce('6')
        .mockResolvedValueOnce('8')
        .mockResolvedValueOnce('10');

      const result = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(result.composite).toBeCloseTo(7, 1); // (4+6+8+10)/4 = 7
    });
  });

  // === Bad Path ===

  describe('Bad Path', () => {
    it('handles empty content', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('0');

      const result = await evaluateEnhanced('', 'executive_summary', makeFixture(), genFn);
      expect(result.composite).toBe(0);
    });

    it('handles non-numeric score from dimension evaluator', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('The specificity score is 8.')
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('9')
        .mockResolvedValueOnce('6');

      const result = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(typeof result.specificity).toBe('number');
      expect(result.specificity).toBeGreaterThanOrEqual(0);
      expect(result.specificity).toBeLessThanOrEqual(10);
    });

    it('handles timeout on one dimension', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('8')
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce('9')
        .mockResolvedValueOnce('6');

      const result = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(result.evidenceIntegration).toBe(0);
      expect(typeof result.composite).toBe('number');
    });
  });

  // === Edge Cases ===

  describe('Edge Cases', () => {
    it('handles all scores identical', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('5')
        .mockResolvedValueOnce('5')
        .mockResolvedValueOnce('5')
        .mockResolvedValueOnce('5');

      const result = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(result.composite).toBe(5);
    });

    it('handles extreme score 0', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('0')
        .mockResolvedValueOnce('0');

      const result = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(result.composite).toBe(0);
    });

    it('handles extreme score 10', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('10')
        .mockResolvedValueOnce('10')
        .mockResolvedValueOnce('10')
        .mockResolvedValueOnce('10');

      const result = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(result.composite).toBe(10);
    });
  });

  // === Security ===

  describe('Security', () => {
    it('no code execution from score responses', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce(MALICIOUS_EVAL_STRING)
        .mockResolvedValueOnce(MALICIOUS_IMPORT_STRING)
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('8');

      const result = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn);
      expect(typeof result.specificity).toBe('number');
      expect(typeof result.evidenceIntegration).toBe('number');
    });
  });

  // === Data Leak ===

  describe('Data Leak', () => {
    it('rubric details not in enhanced output', async () => {
      const genFn = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('8')
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('9')
        .mockResolvedValueOnce('6');

      const result = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn);
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('rubric');
      expect(resultStr).not.toContain('prompt');
      expect(resultStr).not.toContain('instruction');
    });
  });

  // === Data Damage ===

  describe('Data Damage', () => {
    it('failed eval does not corrupt previous scores', async () => {
      const genFn1 = vi.fn<GenerateFn>()
        .mockResolvedValueOnce('8')
        .mockResolvedValueOnce('7')
        .mockResolvedValueOnce('9')
        .mockResolvedValueOnce('6');
      const result1 = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn1);

      const genFn2 = vi.fn<GenerateFn>()
        .mockRejectedValue(new Error('All evaluators failed'));
      const result2 = await evaluateEnhanced(sampleContent, 'executive_summary', makeFixture(), genFn2);

      expect(result1.specificity).toBe(8);
      expect(result1.evidenceIntegration).toBe(7);
      expect(result2.specificity).toBe(0);
    });
  });
});

// ============================
// DIVERGENCE COMPARATOR TESTS
// ============================

describe('Divergence Comparator', () => {
  it('calculates absolute delta between production average and enhanced composite', () => {
    const prodScore: ProductionResult = { judge1: 7, judge2: 8, judge3: 6, average: 7 };
    const enhScore: EnhancedResult = {
      specificity: 8, evidenceIntegration: 9, complianceCoverage: 7, persuasionStrength: 8, composite: 8,
    };
    expect(calculateDivergence(prodScore, enhScore)).toBe(1);
  });

  it('returns 0 when scores match', () => {
    const prodScore: ProductionResult = { judge1: 7, judge2: 7, judge3: 7, average: 7 };
    const enhScore: EnhancedResult = {
      specificity: 7, evidenceIntegration: 7, complianceCoverage: 7, persuasionStrength: 7, composite: 7,
    };
    expect(calculateDivergence(prodScore, enhScore)).toBe(0);
  });

  it('returns absolute value when production > enhanced', () => {
    const prodScore: ProductionResult = { judge1: 9, judge2: 9, judge3: 9, average: 9 };
    const enhScore: EnhancedResult = {
      specificity: 5, evidenceIntegration: 5, complianceCoverage: 5, persuasionStrength: 5, composite: 5,
    };
    expect(calculateDivergence(prodScore, enhScore)).toBe(4);
  });

  it('returns absolute value when enhanced > production', () => {
    const prodScore: ProductionResult = { judge1: 3, judge2: 3, judge3: 3, average: 3 };
    const enhScore: EnhancedResult = {
      specificity: 9, evidenceIntegration: 9, complianceCoverage: 9, persuasionStrength: 9, composite: 9,
    };
    expect(calculateDivergence(prodScore, enhScore)).toBe(6);
  });

  it('handles decimal divergence', () => {
    const prodScore: ProductionResult = { judge1: 7, judge2: 8, judge3: 6, average: 7 };
    const enhScore: EnhancedResult = {
      specificity: 7, evidenceIntegration: 8, complianceCoverage: 7, persuasionStrength: 8, composite: 7.5,
    };
    expect(calculateDivergence(prodScore, enhScore)).toBeCloseTo(0.5, 2);
  });

  it('handles zero scores', () => {
    const prodScore: ProductionResult = { judge1: 0, judge2: 0, judge3: 0, average: 0 };
    const enhScore: EnhancedResult = {
      specificity: 0, evidenceIntegration: 0, complianceCoverage: 0, persuasionStrength: 0, composite: 0,
    };
    expect(calculateDivergence(prodScore, enhScore)).toBe(0);
  });
});
