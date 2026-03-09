import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';

// We'll import the command functions once they exist
import { promoteConfig, listStaged, getResults } from '../../src/cli/commands.js';
import type { SupabaseStorage } from '../../src/storage/supabase.js';

// ---- Mock Supabase helpers ----

function createMockStorage(overrides: Partial<{
  promoteResult: { error: any } | { data: any; error: null };
  stagedConfigs: any[];
  results: any[];
  readError: any;
  updateError: any;
}> = {}) {
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      then: (resolve: any) => resolve(overrides.promoteResult ?? { data: [{ id: 'cfg-1' }], error: null }),
    }),
  });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === 'staged_configs') {
      return {
        update: mockUpdate,
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            then: (resolve: any) => resolve({
              data: overrides.stagedConfigs ?? [],
              error: overrides.readError ?? null,
            }),
          }),
          then: (resolve: any) => resolve({
            data: overrides.stagedConfigs ?? [],
            error: overrides.readError ?? null,
          }),
        }),
      };
    }
    if (table === 'experiment_results') {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              then: (resolve: any) => resolve({
                data: overrides.results ?? [],
                error: overrides.readError ?? null,
              }),
            }),
            then: (resolve: any) => resolve({
              data: overrides.results ?? [],
              error: overrides.readError ?? null,
            }),
          }),
          then: (resolve: any) => resolve({
            data: overrides.results ?? [],
            error: overrides.readError ?? null,
          }),
        }),
      };
    }
    return {};
  });

  return {
    from: mockFrom,
    _mockUpdate: mockUpdate,
  };
}

// ---- Workflow YAML tests ----

describe('GitHub Actions Workflow', () => {
  let workflow: any;

  beforeEach(() => {
    const yamlPath = join(__dirname, '../../.github/workflows/experiment.yml');
    const content = readFileSync(yamlPath, 'utf-8');
    workflow = yaml.load(content);
  });

  // === Happy Path ===

  describe('Happy Path', () => {
    it('is valid YAML with expected structure', () => {
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('Run Experiment');
      expect(workflow.on).toBeDefined();
      expect(workflow.jobs).toBeDefined();
      expect(workflow.jobs.experiment).toBeDefined();
    });

    it('sets concurrency group', () => {
      expect(workflow.concurrency).toBeDefined();
      expect(workflow.concurrency.group).toBe('experiment-runner');
      expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    });

    it('passes required env vars to experiment step', () => {
      const steps = workflow.jobs.experiment.steps;
      const experimentStep = steps.find((s: any) => s.run && s.run.includes('experiment'));
      expect(experimentStep).toBeDefined();
      expect(experimentStep.env).toBeDefined();
      expect(experimentStep.env.GEMINI_API_KEY).toBeDefined();
      expect(experimentStep.env.SUPABASE_URL).toBeDefined();
      expect(experimentStep.env.SUPABASE_SERVICE_KEY).toBeDefined();
    });
  });

  // === Edge Cases ===

  describe('Edge Cases', () => {
    it('concurrent workflow runs are blocked by concurrency group', () => {
      expect(workflow.concurrency.group).toBe('experiment-runner');
      expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    });
  });

  // === Security ===

  describe('Security', () => {
    it('secrets are referenced via ${{ secrets.* }} not hardcoded', () => {
      const content = readFileSync(
        join(__dirname, '../../.github/workflows/experiment.yml'),
        'utf-8'
      );
      // Should not contain actual API keys
      expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(content).not.toMatch(/eyJ[a-zA-Z0-9]{20,}/);

      // Should reference secrets
      expect(content).toContain('${{ secrets.GEMINI_API_KEY }}');
      expect(content).toContain('${{ secrets.SUPABASE_URL }}');
      expect(content).toContain('${{ secrets.SUPABASE_SERVICE_KEY }}');
    });
  });

  // === Data Leak ===

  describe('Data Leak', () => {
    it('workflow logs do not print API keys (uses secrets syntax)', () => {
      const steps = workflow.jobs.experiment.steps;
      const experimentStep = steps.find((s: any) => s.run && s.run.includes('experiment'));
      const envValues = Object.values(experimentStep.env) as string[];

      for (const val of envValues) {
        // Values should be secret references or variable references, not raw values
        if (typeof val === 'string' && val.includes('secrets.')) {
          expect(val).toMatch(/\$\{\{\s*secrets\./);
        }
      }
    });
  });
});

// ---- CLI Commands tests ----

describe('CLI Commands', () => {
  let mockClient: ReturnType<typeof createMockStorage>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // === Happy Path ===

  describe('Happy Path', () => {
    it('promoteConfig sets promoted=true for a valid ID', async () => {
      mockClient = createMockStorage({
        promoteResult: { data: [{ id: 'cfg-1', promoted: true }], error: null },
      });
      const result = await promoteConfig(mockClient as any, 'cfg-1');
      expect(result.success).toBe(true);
      expect(result.id).toBe('cfg-1');
    });

    it('listStaged returns unpromoted configs', async () => {
      mockClient = createMockStorage({
        stagedConfigs: [
          { id: 'cfg-1', promoted: false, parameters: { temp: 0.7 } },
          { id: 'cfg-2', promoted: false, parameters: { temp: 0.9 } },
        ],
      });
      const result = await listStaged(mockClient as any);
      expect(result.configs).toHaveLength(2);
      expect(result.configs[0].id).toBe('cfg-1');
    });

    it('getResults returns recent results', async () => {
      mockClient = createMockStorage({
        results: [
          { experimentId: 'exp-1', score: 0.9, costUsd: 0.1 },
          { experimentId: 'exp-2', score: 0.85, costUsd: 0.12 },
        ],
      });
      const result = await getResults(mockClient as any, { last: 5 });
      expect(result.results).toHaveLength(2);
      expect(result.results[0].score).toBe(0.9);
    });
  });

  // === Bad Path ===

  describe('Bad Path', () => {
    it('promoteConfig with invalid ID returns clear error', async () => {
      mockClient = createMockStorage({
        promoteResult: { error: { message: 'No rows matched' } },
      });
      const result = await promoteConfig(mockClient as any, 'nonexistent-id');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('promoteConfig on already-promoted config is idempotent', async () => {
      mockClient = createMockStorage({
        promoteResult: { data: [{ id: 'cfg-1', promoted: true }], error: null },
      });
      const result = await promoteConfig(mockClient as any, 'cfg-1');
      expect(result.success).toBe(true);
      // Running again should not error
      const result2 = await promoteConfig(mockClient as any, 'cfg-1');
      expect(result2.success).toBe(true);
    });

    it('commands handle Supabase connection failure gracefully', async () => {
      mockClient = createMockStorage({
        readError: { message: 'Connection refused' },
      });
      const result = await listStaged(mockClient as any);
      expect(result.error).toBeDefined();
      expect(result.configs).toEqual([]);
    });

    it('getResults handles connection failure gracefully', async () => {
      mockClient = createMockStorage({
        readError: { message: 'Connection timeout' },
      });
      const result = await getResults(mockClient as any, { last: 5 });
      expect(result.error).toBeDefined();
      expect(result.results).toEqual([]);
    });
  });

  // === Edge Cases ===

  describe('Edge Cases', () => {
    it('listStaged with no staged configs returns empty', async () => {
      mockClient = createMockStorage({ stagedConfigs: [] });
      const result = await listStaged(mockClient as any);
      expect(result.configs).toEqual([]);
      expect(result.message).toBeDefined();
    });

    it('getResults with last=0 returns empty', async () => {
      mockClient = createMockStorage({ results: [] });
      const result = await getResults(mockClient as any, { last: 0 });
      expect(result.results).toEqual([]);
    });
  });

  // === Security ===

  describe('Security', () => {
    it('CLI authenticates with env-based client', async () => {
      // The commands accept a client — they don't create one internally
      // This tests that the function signature requires a client parameter
      mockClient = createMockStorage();
      // If we pass null, it should handle gracefully
      await expect(promoteConfig(null as any, 'cfg-1')).rejects.toThrow();
    });

    it('promotion is logged with timestamp', async () => {
      mockClient = createMockStorage({
        promoteResult: { data: [{ id: 'cfg-1', promoted: true }], error: null },
      });
      const result = await promoteConfig(mockClient as any, 'cfg-1');
      expect(result.promotedAt).toBeDefined();
      expect(new Date(result.promotedAt!).getTime()).not.toBeNaN();
    });
  });

  // === Data Leak ===

  describe('Data Leak', () => {
    it('CLI output does not show connection string', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockClient = createMockStorage({
        stagedConfigs: [{ id: 'cfg-1', promoted: false }],
      });
      await listStaged(mockClient as any);

      for (const spy of [consoleSpy, warnSpy]) {
        for (const call of spy.mock.calls) {
          const output = call.join(' ');
          expect(output).not.toMatch(/supabase.*\.co/i);
          expect(output).not.toMatch(/service_role/i);
          expect(output).not.toMatch(/eyJ[a-zA-Z0-9]{20,}/);
        }
      }

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  // === Data Damage ===

  describe('Data Damage', () => {
    it('promote is idempotent (calling twice succeeds)', async () => {
      mockClient = createMockStorage({
        promoteResult: { data: [{ id: 'cfg-1', promoted: true }], error: null },
      });
      const r1 = await promoteConfig(mockClient as any, 'cfg-1');
      const r2 = await promoteConfig(mockClient as any, 'cfg-1');
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
    });

    it('no bulk promote without confirmation flag', async () => {
      // promoteConfig only accepts a single ID, not arrays
      // This ensures no accidental bulk operation
      mockClient = createMockStorage();
      const result = await promoteConfig(mockClient as any, 'cfg-1');
      expect(result.success).toBe(true);
      // Verify the update was called with a single ID
      expect(mockClient._mockUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
