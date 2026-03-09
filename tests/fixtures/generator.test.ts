import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FixtureGenerator, validateFixture } from '../../src/fixtures/generator.js';
import { getStaticFixtures } from '../../src/fixtures/static-fixtures.js';
import type { RfpFixture, GenerateFn } from '../../src/fixtures/types.js';

describe('FixtureGenerator', () => {
  let mockGenerateFn: GenerateFn;

  beforeEach(() => {
    mockGenerateFn = vi.fn().mockResolvedValue(JSON.stringify({
      id: 'gen-1',
      difficulty: 'easy',
      title: 'Generated RFP',
      agency: 'Test Agency',
      sections: [{ title: 'SOW', content: 'Do the work.', wordCount: 3 }],
      requirements: ['Requirement 1'],
      agencyProfile: {
        name: 'Test Agency',
        type: 'federal',
        size: 'small',
        specializations: ['IT'],
      },
    }));
  });

  // === Happy Path ===

  describe('Happy Path', () => {
    it('generates a fixture using the provided generateFn', async () => {
      const generator = new FixtureGenerator(mockGenerateFn);
      const fixture = await generator.generate('easy');
      expect(fixture.difficulty).toBe('easy');
      expect(fixture.title).toBeTruthy();
      expect(mockGenerateFn).toHaveBeenCalledOnce();
    });

    it('static fixtures include all three difficulty levels', () => {
      const fixtures = getStaticFixtures();
      const difficulties = fixtures.map((f) => f.difficulty);
      expect(difficulties).toContain('easy');
      expect(difficulties).toContain('medium');
      expect(difficulties).toContain('hard');
    });

    it('static easy fixture has 2-3 sections and minimal requirements', () => {
      const fixtures = getStaticFixtures();
      const easy = fixtures.find((f) => f.difficulty === 'easy')!;
      expect(easy.sections.length).toBeGreaterThanOrEqual(2);
      expect(easy.sections.length).toBeLessThanOrEqual(3);
      expect(easy.requirements.length).toBeGreaterThanOrEqual(1);
    });

    it('static medium fixture has 5-7 requirements and evaluation criteria', () => {
      const fixtures = getStaticFixtures();
      const medium = fixtures.find((f) => f.difficulty === 'medium')!;
      expect(medium.requirements.length).toBeGreaterThanOrEqual(5);
      expect(medium.requirements.length).toBeLessThanOrEqual(7);
      expect(medium.evaluationCriteria).toBeDefined();
      expect(medium.evaluationCriteria!.length).toBeGreaterThan(0);
    });

    it('static hard fixture has 10+ requirements and multiple evaluation factors', () => {
      const fixtures = getStaticFixtures();
      const hard = fixtures.find((f) => f.difficulty === 'hard')!;
      expect(hard.requirements.length).toBeGreaterThanOrEqual(10);
      expect(hard.evaluationCriteria).toBeDefined();
      expect(hard.evaluationCriteria!.length).toBeGreaterThanOrEqual(3);
    });

    it('all static fixtures pass validation', () => {
      const fixtures = getStaticFixtures();
      for (const fixture of fixtures) {
        expect(validateFixture(fixture)).toBe(true);
      }
    });
  });

  // === Bad Path ===

  describe('Bad Path', () => {
    it('rejects when generateFn returns invalid JSON', async () => {
      const badFn: GenerateFn = vi.fn().mockResolvedValue('not json');
      const generator = new FixtureGenerator(badFn);
      await expect(generator.generate('easy')).rejects.toThrow();
    });

    it('rejects when generateFn returns fixture missing required fields', async () => {
      const badFn: GenerateFn = vi.fn().mockResolvedValue(JSON.stringify({ id: 'x' }));
      const generator = new FixtureGenerator(badFn);
      await expect(generator.generate('easy')).rejects.toThrow();
    });

    it('rejects invalid difficulty level in validation', () => {
      const fixture = {
        id: 'bad-1',
        difficulty: 'impossible' as any,
        title: 'Bad',
        agency: 'Agency',
        sections: [],
        requirements: [],
        agencyProfile: { name: 'A', type: 'b', size: 'small' as const, specializations: [] },
      };
      expect(validateFixture(fixture)).toBe(false);
    });

    it('rejects fixture with empty id', () => {
      const fixture: RfpFixture = {
        id: '',
        difficulty: 'easy',
        title: 'Test',
        agency: 'Agency',
        sections: [{ title: 'S', content: 'C', wordCount: 1 }],
        requirements: ['R'],
        agencyProfile: { name: 'A', type: 'b', size: 'small', specializations: [] },
      };
      expect(validateFixture(fixture)).toBe(false);
    });

    it('rejects fixture with empty title', () => {
      const fixture: RfpFixture = {
        id: 'test-1',
        difficulty: 'easy',
        title: '',
        agency: 'Agency',
        sections: [{ title: 'S', content: 'C', wordCount: 1 }],
        requirements: ['R'],
        agencyProfile: { name: 'A', type: 'b', size: 'small', specializations: [] },
      };
      expect(validateFixture(fixture)).toBe(false);
    });

    it('handles generateFn that throws', async () => {
      const errorFn: GenerateFn = vi.fn().mockRejectedValue(new Error('AI unavailable'));
      const generator = new FixtureGenerator(errorFn);
      await expect(generator.generate('easy')).rejects.toThrow('AI unavailable');
    });
  });

  // === Edge Cases ===

  describe('Edge Cases', () => {
    it('generates fixture with all difficulty levels', async () => {
      const levels: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];
      for (const level of levels) {
        (mockGenerateFn as any).mockResolvedValue(JSON.stringify({
          id: `gen-${level}`,
          difficulty: level,
          title: `${level} RFP`,
          agency: 'Agency',
          sections: [{ title: 'S', content: 'C', wordCount: 1 }],
          requirements: ['R'],
          agencyProfile: { name: 'A', type: 'b', size: 'small', specializations: [] },
        }));
        const generator = new FixtureGenerator(mockGenerateFn);
        const fixture = await generator.generate(level);
        expect(fixture.difficulty).toBe(level);
      }
    });

    it('static fixtures have unique ids', () => {
      const fixtures = getStaticFixtures();
      const ids = fixtures.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('static fixtures all have non-empty agency profiles', () => {
      const fixtures = getStaticFixtures();
      for (const f of fixtures) {
        expect(f.agencyProfile.name).toBeTruthy();
        expect(f.agencyProfile.type).toBeTruthy();
        expect(['small', 'medium', 'large']).toContain(f.agencyProfile.size);
      }
    });

    it('validation handles null/undefined input gracefully', () => {
      expect(validateFixture(null as any)).toBe(false);
      expect(validateFixture(undefined as any)).toBe(false);
    });
  });

  // === Security ===

  describe('Security', () => {
    it('generateFn prompt does not include secrets', async () => {
      const spy: GenerateFn = vi.fn().mockResolvedValue(JSON.stringify({
        id: 'sec-1',
        difficulty: 'easy',
        title: 'Sec RFP',
        agency: 'Agency',
        sections: [{ title: 'S', content: 'C', wordCount: 1 }],
        requirements: ['R'],
        agencyProfile: { name: 'A', type: 'b', size: 'small', specializations: [] },
      }));
      const generator = new FixtureGenerator(spy);
      await generator.generate('easy');
      const prompt = (spy as any).mock.calls[0][0] as string;
      expect(prompt).not.toContain('password');
      expect(prompt).not.toContain('secret');
      expect(prompt).not.toContain('api_key');
    });

    it('fixture data does not contain script injection', () => {
      const fixtures = getStaticFixtures();
      for (const f of fixtures) {
        const str = JSON.stringify(f);
        expect(str).not.toContain('<script');
        expect(str).not.toContain('javascript:');
      }
    });
  });

  // === Data Leak ===

  describe('Data Leak', () => {
    it('fixtures do not contain real company names or PII', () => {
      const fixtures = getStaticFixtures();
      for (const f of fixtures) {
        const str = JSON.stringify(f);
        // Should not contain obvious real-company indicators
        expect(str).not.toContain('Accenture');
        expect(str).not.toContain('Deloitte');
        expect(str).not.toContain('social security');
      }
    });

    it('generated fixture does not leak generateFn internals', async () => {
      const generator = new FixtureGenerator(mockGenerateFn);
      const fixture = await generator.generate('easy');
      const str = JSON.stringify(fixture);
      expect(str).not.toContain('function');
      expect(str).not.toContain('mock');
    });
  });

  // === Data Damage ===

  describe('Data Damage', () => {
    it('validateFixture does not mutate input', () => {
      const fixture: RfpFixture = {
        id: 'immut-1',
        difficulty: 'easy',
        title: 'Immutable',
        agency: 'Agency',
        sections: [{ title: 'S', content: 'C', wordCount: 1 }],
        requirements: ['R'],
        agencyProfile: { name: 'A', type: 'b', size: 'small', specializations: [] },
      };
      const copy = JSON.parse(JSON.stringify(fixture));
      validateFixture(fixture);
      expect(fixture).toEqual(copy);
    });

    it('static fixtures return new array each time (not shared reference)', () => {
      const a = getStaticFixtures();
      const b = getStaticFixtures();
      expect(a).not.toBe(b);
      a[0].title = 'MUTATED';
      expect(b[0].title).not.toBe('MUTATED');
    });
  });
});
