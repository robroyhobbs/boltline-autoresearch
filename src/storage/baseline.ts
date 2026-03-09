import { JsonlStorage } from './jsonl.js';

export interface BaselineEntry {
  sectionType: string;
  parameterType: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Manages baseline configurations for experiment comparisons.
 * First result for a (sectionType, parameterType) pair becomes baseline.
 */
export class BaselineManager {
  private storage: JsonlStorage;
  private filePath: string;
  private cache: Map<string, BaselineEntry> | null = null;

  constructor(storage: JsonlStorage, filePath: string = 'logs/baselines.jsonl') {
    this.storage = storage;
    this.filePath = filePath;
  }

  private makeKey(sectionType: string, parameterType: string): string {
    return `${sectionType}::${parameterType}`;
  }

  private async loadCache(): Promise<Map<string, BaselineEntry>> {
    if (this.cache) return this.cache;

    const entries = await this.storage.readAll(this.filePath);
    const cache = new Map<string, BaselineEntry>();

    for (const entry of entries) {
      if (entry.sectionType && entry.parameterType) {
        const key = this.makeKey(entry.sectionType, entry.parameterType);
        // Later entries override earlier ones (upsert semantics)
        cache.set(key, entry as BaselineEntry);
      }
    }

    this.cache = cache;
    return cache;
  }

  /**
   * Get the baseline config for a (sectionType, parameterType) pair.
   * Returns null if no baseline has been set.
   */
  async getBaseline(sectionType: string, parameterType: string): Promise<BaselineEntry | null> {
    const cache = await this.loadCache();
    return cache.get(this.makeKey(sectionType, parameterType)) ?? null;
  }

  /**
   * Set or update the baseline config for a (sectionType, parameterType) pair.
   * Uses append-only storage with upsert semantics (last write wins on read).
   */
  async setBaseline(
    sectionType: string,
    parameterType: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const entry: BaselineEntry = {
      sectionType,
      parameterType,
      config: JSON.parse(JSON.stringify(config)), // deep copy, sanitize
      createdAt: now,
      updatedAt: now,
    };

    // Check if one already exists — update the timestamps
    const existing = await this.getBaseline(sectionType, parameterType);
    if (existing) {
      entry.createdAt = existing.createdAt;
    }

    await this.storage.append(this.filePath, entry);

    // Update cache
    const cache = await this.loadCache();
    cache.set(this.makeKey(sectionType, parameterType), entry);
  }
}
