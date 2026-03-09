import { readFile, writeFile, rename, mkdir, stat, readdir } from 'node:fs/promises';
import { dirname, join, basename, extname } from 'node:path';

/**
 * JSONL (JSON Lines) storage with atomic writes and rotation support.
 */
export class JsonlStorage {
  private writeQueues = new Map<string, Promise<void>>();

  /**
   * Atomically append a JSON entry to a JSONL file.
   * Uses write-temp-then-rename to prevent partial writes.
   */
  async append(filePath: string, entry: unknown): Promise<void> {
    if (entry === undefined || entry === null) {
      throw new Error('Cannot append undefined or null entry');
    }

    // Validate serialization before doing any I/O
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch (err) {
      throw new Error(`Cannot serialize entry: ${(err as Error).message}`);
    }

    // Serialize writes to the same file
    const queue = this.writeQueues.get(filePath) ?? Promise.resolve();
    const next = queue.then(() => this.doAppend(filePath, line + '\n'));
    this.writeQueues.set(filePath, next);
    await next;
  }

  /**
   * Read all entries from a JSONL file. Skips corrupt lines.
   * Returns deep copies of parsed objects.
   */
  async readAll(filePath: string): Promise<any[]> {
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      return [];
    }

    const lines = content.split('\n');
    const entries: any[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        // Skip corrupt lines
      }
    }

    // Return deep copies so mutations don't affect storage
    return JSON.parse(JSON.stringify(entries));
  }

  /**
   * Rotate the file if it exceeds maxBytes.
   * Creates a backup with timestamp suffix and empties the original.
   * @returns true if rotation occurred, false otherwise.
   */
  async rotateIfNeeded(filePath: string, maxBytes: number = 10 * 1024 * 1024): Promise<boolean> {
    let fileStats;
    try {
      fileStats = await stat(filePath);
    } catch {
      return false;
    }

    if (fileStats.size <= maxBytes) {
      return false;
    }

    const dir = dirname(filePath);
    const ext = extname(filePath);
    const base = basename(filePath, ext);
    const timestamp = Date.now();
    const rotatedPath = join(dir, `${base}.rotated.${timestamp}${ext}`);

    // Rename existing file to rotated path
    await rename(filePath, rotatedPath);

    // Create empty new file
    await writeFile(filePath, '', { mode: 0o600 });

    return true;
  }

  private async doAppend(filePath: string, line: string): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });

    // Read existing content
    let existing = '';
    try {
      existing = await readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist yet
    }

    // Atomic write: write to temp file, then rename
    const tmpFile = join(dir, `.jsonl-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    await writeFile(tmpFile, existing + line, { mode: 0o600 });
    await rename(tmpFile, filePath);
  }
}
