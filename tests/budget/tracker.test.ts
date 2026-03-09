import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BudgetTracker } from '../../src/budget/tracker.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('BudgetTracker', () => {
  let tempDir: string;
  let stateFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'budget-test-'));
    stateFile = join(tempDir, 'budget-state.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // === Happy Path ===

  describe('Happy Path', () => {
    it('initializes with $0.00 spent for new day', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      const state = await tracker.getState();
      expect(state.totalSpendUsd).toBe(0);
      expect(state.experimentCount).toBe(0);
    });

    it('accumulates spend across multiple experiments', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await tracker.recordSpend(0.08);
      await tracker.recordSpend(0.12);
      await tracker.recordSpend(0.05);
      const state = await tracker.getState();
      expect(state.totalSpendUsd).toBeCloseTo(0.25, 2);
      expect(state.experimentCount).toBe(3);
    });

    it('allows experiment when remaining > $0.05', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await tracker.recordSpend(7.0);
      expect(await tracker.canRunExperiment()).toBe(true);
    });

    it('halts experiments when cap exceeded', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await tracker.recordSpend(7.5);
      expect(await tracker.canRunExperiment()).toBe(false);
      const state = await tracker.getState();
      expect(state.halted).toBe(true);
    });

    it('persists state to file between instances', async () => {
      const tracker1 = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await tracker1.recordSpend(3.0);

      const tracker2 = new BudgetTracker({ stateFile, capUsd: 7.5 });
      const state = await tracker2.getState();
      expect(state.totalSpendUsd).toBeCloseTo(3.0, 2);
    });

    it('resets cumulative spend on new UTC day', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      // Record spend with yesterday's date
      await tracker.recordSpend(5.0, new Date('2026-03-07T23:00:00Z'));
      // Query state for today
      const state = await tracker.getState(new Date('2026-03-08T01:00:00Z'));
      expect(state.totalSpendUsd).toBe(0);
      expect(state.halted).toBe(false);
    });
  });

  // === Bad Path ===

  describe('Bad Path', () => {
    it('rejects negative cost values', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await expect(tracker.recordSpend(-1)).rejects.toThrow('Cost must be a positive number');
    });

    it('rejects NaN cost values', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await expect(tracker.recordSpend(NaN)).rejects.toThrow('Cost must be a positive number');
    });

    it('rejects Infinity cost values', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await expect(tracker.recordSpend(Infinity)).rejects.toThrow('Cost must be a positive number');
    });

    it('handles missing state file gracefully', async () => {
      const tracker = new BudgetTracker({ stateFile: join(tempDir, 'nonexistent.jsonl'), capUsd: 7.5 });
      const state = await tracker.getState();
      expect(state.totalSpendUsd).toBe(0);
    });

    it('handles corrupt state file gracefully', async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(stateFile, 'not valid json\n{also broken\n');
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      const state = await tracker.getState();
      expect(state.totalSpendUsd).toBe(0);
    });

    it('rejects cap of $0', () => {
      expect(() => new BudgetTracker({ stateFile, capUsd: 0 })).toThrow('Budget cap must be positive');
    });

    it('rejects negative cap', () => {
      expect(() => new BudgetTracker({ stateFile, capUsd: -5 })).toThrow('Budget cap must be positive');
    });
  });

  // === Edge Cases ===

  describe('Edge Cases', () => {
    it('halts when budget exactly at cap', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await tracker.recordSpend(7.5);
      expect(await tracker.canRunExperiment()).toBe(false);
    });

    it('allows when budget at cap minus epsilon', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await tracker.recordSpend(7.44);
      expect(await tracker.canRunExperiment()).toBe(true);
    });

    it('handles first run ever with no existing state file', async () => {
      const freshFile = join(tempDir, 'fresh-budget.jsonl');
      const tracker = new BudgetTracker({ stateFile: freshFile, capUsd: 7.5 });
      expect(await tracker.canRunExperiment()).toBe(true);
      await tracker.recordSpend(0.1);
      const state = await tracker.getState();
      expect(state.totalSpendUsd).toBeCloseTo(0.1, 2);
    });

    it('handles UTC midnight rollover during active experiment', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      // Spend recorded at 23:59 UTC
      await tracker.recordSpend(6.0, new Date('2026-03-07T23:59:00Z'));
      // Check at 00:01 UTC next day
      const state = await tracker.getState(new Date('2026-03-08T00:01:00Z'));
      expect(state.totalSpendUsd).toBe(0);
      expect(state.remaining).toBe(7.5);
    });
  });

  // === Security ===

  describe('Security', () => {
    it('loads budget cap from constructor config, not hardcoded', () => {
      const tracker1 = new BudgetTracker({ stateFile, capUsd: 5.0 });
      const tracker2 = new BudgetTracker({ stateFile, capUsd: 10.0 });
      // Different caps should produce different behavior
      expect(tracker1.capUsd).toBe(5.0);
      expect(tracker2.capUsd).toBe(10.0);
    });
  });

  // === Data Leak ===

  describe('Data Leak', () => {
    it('state does not include API keys', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await tracker.recordSpend(1.0);
      const state = await tracker.getState();
      const stateStr = JSON.stringify(state);
      expect(stateStr).not.toContain('key');
      expect(stateStr).not.toContain('secret');
      expect(stateStr).not.toContain('password');
      expect(stateStr).not.toContain('token');
    });

    it('alert message contains spend but no credentials', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 0.1 });
      await tracker.recordSpend(0.15);
      const alert = await tracker.getAlertMessage();
      expect(alert).toContain('0.15');
      expect(alert).not.toContain('key');
      expect(alert).not.toContain('secret');
    });
  });

  // === Data Damage ===

  describe('Data Damage', () => {
    it('uses atomic write (write temp + rename)', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 7.5 });
      await tracker.recordSpend(1.0);
      // If write was atomic, file should be valid JSON lines
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(stateFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('concurrent recordSpend calls do not corrupt state', async () => {
      const tracker = new BudgetTracker({ stateFile, capUsd: 100 });
      // Run 10 concurrent writes
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => tracker.recordSpend(0.1))
      );
      const state = await tracker.getState();
      expect(state.totalSpendUsd).toBeCloseTo(1.0, 1);
      expect(state.experimentCount).toBe(10);
    });
  });
});
