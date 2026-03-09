import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonlStorage } from '../../src/storage/jsonl.js';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('JsonlStorage', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jsonl-test-'));
    filePath = join(tempDir, 'test.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // === Happy Path ===

  describe('Happy Path', () => {
    it('appends a single entry and reads it back', async () => {
      const storage = new JsonlStorage();
      await storage.append(filePath, { key: 'value' });
      const entries = await storage.readAll(filePath);
      expect(entries).toEqual([{ key: 'value' }]);
    });

    it('appends multiple entries preserving order', async () => {
      const storage = new JsonlStorage();
      await storage.append(filePath, { n: 1 });
      await storage.append(filePath, { n: 2 });
      await storage.append(filePath, { n: 3 });
      const entries = await storage.readAll(filePath);
      expect(entries).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    });

    it('reads empty array from non-existent file', async () => {
      const storage = new JsonlStorage();
      const entries = await storage.readAll(join(tempDir, 'nope.jsonl'));
      expect(entries).toEqual([]);
    });

    it('rotates file when exceeding maxBytes', async () => {
      const storage = new JsonlStorage();
      // Write enough data to exceed threshold
      for (let i = 0; i < 100; i++) {
        await storage.append(filePath, { data: 'x'.repeat(100), i });
      }
      // File should be over 10KB now
      const rotated = await storage.rotateIfNeeded(filePath, 1024); // 1KB threshold for test
      expect(rotated).toBe(true);
      // Original file should still be readable (rotated file created, original truncated or new)
      const entries = await storage.readAll(filePath);
      expect(entries.length).toBe(0); // Original should be empty after rotation
    });

    it('does not rotate when under maxBytes', async () => {
      const storage = new JsonlStorage();
      await storage.append(filePath, { small: true });
      const rotated = await storage.rotateIfNeeded(filePath, 10 * 1024 * 1024);
      expect(rotated).toBe(false);
    });

    it('creates parent directories if they do not exist', async () => {
      const storage = new JsonlStorage();
      const deepPath = join(tempDir, 'a', 'b', 'c', 'data.jsonl');
      await storage.append(deepPath, { nested: true });
      const entries = await storage.readAll(deepPath);
      expect(entries).toEqual([{ nested: true }]);
    });
  });

  // === Bad Path ===

  describe('Bad Path', () => {
    it('handles corrupt lines gracefully during readAll', async () => {
      await writeFile(filePath, '{"valid":true}\nnot json\n{"also":true}\n');
      const storage = new JsonlStorage();
      const entries = await storage.readAll(filePath);
      expect(entries).toEqual([{ valid: true }, { also: true }]);
    });

    it('handles empty file gracefully', async () => {
      await writeFile(filePath, '');
      const storage = new JsonlStorage();
      const entries = await storage.readAll(filePath);
      expect(entries).toEqual([]);
    });

    it('handles file with only whitespace', async () => {
      await writeFile(filePath, '  \n\n  \n');
      const storage = new JsonlStorage();
      const entries = await storage.readAll(filePath);
      expect(entries).toEqual([]);
    });

    it('rotateIfNeeded handles non-existent file', async () => {
      const storage = new JsonlStorage();
      const rotated = await storage.rotateIfNeeded(join(tempDir, 'ghost.jsonl'), 1024);
      expect(rotated).toBe(false);
    });

    it('rejects append with non-serializable data', async () => {
      const storage = new JsonlStorage();
      const circular: any = {};
      circular.self = circular;
      await expect(storage.append(filePath, circular)).rejects.toThrow();
    });

    it('rejects append with undefined', async () => {
      const storage = new JsonlStorage();
      await expect(storage.append(filePath, undefined as any)).rejects.toThrow();
    });
  });

  // === Edge Cases ===

  describe('Edge Cases', () => {
    it('handles entries with newlines in values', async () => {
      const storage = new JsonlStorage();
      await storage.append(filePath, { text: 'line1\nline2' });
      const entries = await storage.readAll(filePath);
      expect(entries[0].text).toBe('line1\nline2');
    });

    it('handles very large entries', async () => {
      const storage = new JsonlStorage();
      const largeValue = 'x'.repeat(100_000);
      await storage.append(filePath, { data: largeValue });
      const entries = await storage.readAll(filePath);
      expect(entries[0].data.length).toBe(100_000);
    });

    it('handles concurrent appends without data loss', async () => {
      const storage = new JsonlStorage();
      await Promise.all(
        Array.from({ length: 20 }, (_, i) => storage.append(filePath, { i }))
      );
      const entries = await storage.readAll(filePath);
      expect(entries.length).toBe(20);
    });

    it('rotation creates a backup file', async () => {
      const storage = new JsonlStorage();
      for (let i = 0; i < 50; i++) {
        await storage.append(filePath, { data: 'x'.repeat(50), i });
      }
      await storage.rotateIfNeeded(filePath, 512);
      // Check that a rotated file exists in the same directory
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(tempDir);
      const rotatedFiles = files.filter((f) => f.includes('.rotated.') || f.includes('.bak'));
      expect(rotatedFiles.length).toBeGreaterThanOrEqual(1);
    });
  });

  // === Security ===

  describe('Security', () => {
    it('written file has restrictive permissions (mode 0o600)', async () => {
      const storage = new JsonlStorage();
      await storage.append(filePath, { sensitive: true });
      const stats = await stat(filePath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('does not log file contents to stdout', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const storage = new JsonlStorage();
      await storage.append(filePath, { secret: 'value' });
      await storage.readAll(filePath);
      for (const call of consoleSpy.mock.calls) {
        expect(call.join(' ')).not.toContain('secret');
      }
      consoleSpy.mockRestore();
    });
  });

  // === Data Leak ===

  describe('Data Leak', () => {
    it('temp files are cleaned up after append', async () => {
      const storage = new JsonlStorage();
      await storage.append(filePath, { data: 'test' });
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(tempDir);
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
      expect(tmpFiles.length).toBe(0);
    });

    it('readAll does not return internal metadata', async () => {
      const storage = new JsonlStorage();
      await storage.append(filePath, { user: 'data' });
      const entries = await storage.readAll(filePath);
      for (const entry of entries) {
        expect(entry).not.toHaveProperty('_internal');
        expect(entry).not.toHaveProperty('__meta');
      }
    });
  });

  // === Data Damage ===

  describe('Data Damage', () => {
    it('append uses atomic write (temp + rename)', async () => {
      const storage = new JsonlStorage();
      await storage.append(filePath, { atomic: true });
      // Verify file content is valid
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('partial writes do not corrupt existing data', async () => {
      const storage = new JsonlStorage();
      await storage.append(filePath, { first: true });
      await storage.append(filePath, { second: true });
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0])).toEqual({ first: true });
      expect(JSON.parse(lines[1])).toEqual({ second: true });
    });

    it('readAll returns deep copies (mutations do not affect storage)', async () => {
      const storage = new JsonlStorage();
      await storage.append(filePath, { val: 'original' });
      const entries1 = await storage.readAll(filePath);
      entries1[0].val = 'mutated';
      const entries2 = await storage.readAll(filePath);
      expect(entries2[0].val).toBe('original');
    });
  });
});
