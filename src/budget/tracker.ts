import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface BudgetConfig {
  stateFile: string;
  capUsd: number;
}

export interface BudgetState {
  date: string;
  totalSpendUsd: number;
  experimentCount: number;
  capUsd: number;
  remaining: number;
  halted: boolean;
}

interface SpendEntry {
  costUsd: number;
  timestamp: string;
  date: string;
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class BudgetTracker {
  readonly capUsd: number;
  private stateFile: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(config: BudgetConfig) {
    if (!config.capUsd || config.capUsd <= 0 || !Number.isFinite(config.capUsd)) {
      throw new Error('Budget cap must be positive');
    }
    this.capUsd = config.capUsd;
    this.stateFile = config.stateFile;
  }

  async getState(now?: Date): Promise<BudgetState> {
    const date = utcDateString(now ?? new Date());
    const entries = await this.readEntries();
    const todayEntries = entries.filter((e) => e.date === date);
    const totalSpendUsd = todayEntries.reduce((sum, e) => sum + e.costUsd, 0);
    const experimentCount = todayEntries.length;
    const remaining = Math.max(0, this.capUsd - totalSpendUsd);
    const halted = totalSpendUsd >= this.capUsd;

    return {
      date,
      totalSpendUsd,
      experimentCount,
      capUsd: this.capUsd,
      remaining,
      halted,
    };
  }

  async recordSpend(costUsd: number, timestamp?: Date): Promise<void> {
    if (!Number.isFinite(costUsd) || costUsd <= 0) {
      throw new Error('Cost must be a positive number');
    }
    const ts = timestamp ?? new Date();
    const entry: SpendEntry = {
      costUsd,
      timestamp: ts.toISOString(),
      date: utcDateString(ts),
    };

    // Serialize writes to prevent corruption
    this.writeQueue = this.writeQueue.then(() => this.appendEntry(entry));
    await this.writeQueue;
  }

  async canRunExperiment(now?: Date): Promise<boolean> {
    const state = await this.getState(now);
    return state.remaining > 0.05;
  }

  async getAlertMessage(): Promise<string> {
    const state = await this.getState();
    return `Budget alert: spent $${state.totalSpendUsd.toFixed(2)} of $${state.capUsd.toFixed(2)} cap. ${state.experimentCount} experiments today. ${state.halted ? 'HALTED.' : `$${state.remaining.toFixed(2)} remaining.`}`;
  }

  private async readEntries(): Promise<SpendEntry[]> {
    try {
      const content = await readFile(this.stateFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const entries: SpendEntry[] = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip corrupt lines
        }
      }
      return entries;
    } catch {
      // File doesn't exist or can't be read — start fresh
      return [];
    }
  }

  private async appendEntry(entry: SpendEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    const dir = dirname(this.stateFile);
    await mkdir(dir, { recursive: true });

    // Atomic write: read existing, append, write to temp, rename
    let existing = '';
    try {
      existing = await readFile(this.stateFile, 'utf-8');
    } catch {
      // File doesn't exist yet
    }

    const tmpFile = join(dir, `.budget-state-${Date.now()}.tmp`);
    await writeFile(tmpFile, existing + line, { mode: 0o600 });
    await rename(tmpFile, this.stateFile);
  }
}
