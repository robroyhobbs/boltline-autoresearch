#!/usr/bin/env node

/**
 * Promotion CLI — manage staged configs and view experiment results.
 *
 * Commands:
 *   promote <id>       — sets promoted=true for a staged config
 *   list-staged        — shows all configs with promoted=false
 *   results [--last N] — shows recent experiment results
 */

import { Command } from 'commander';
import { createClient } from '@supabase/supabase-js';
import { promoteConfig, listStaged, getResults } from './commands.js';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.');
    process.exit(1);
  }

  return createClient(url, key);
}

const program = new Command();

program
  .name('intentbid-cli')
  .description('IntentBid AutoResearch CLI')
  .version('0.1.0');

program
  .command('promote <id>')
  .description('Promote a staged config by ID')
  .action(async (id: string) => {
    const client = getSupabaseClient();
    const result = await promoteConfig(client, id);

    if (result.success) {
      console.log(`Config ${result.id} promoted at ${result.promotedAt}`);
    } else {
      console.error(`Failed to promote: ${result.error}`);
      process.exit(1);
    }
  });

program
  .command('list-staged')
  .description('List all unpromoted staged configs')
  .action(async () => {
    const client = getSupabaseClient();
    const result = await listStaged(client);

    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    if (result.configs.length === 0) {
      console.log(result.message ?? 'No staged configs found.');
      return;
    }

    console.log(`Found ${result.configs.length} staged config(s):\n`);
    for (const cfg of result.configs) {
      console.log(`  ID: ${cfg.id}`);
      console.log(`  Parameters: ${JSON.stringify(cfg.parameters)}`);
      console.log(`  Created: ${cfg.createdAt}`);
      console.log('');
    }
  });

program
  .command('results')
  .description('Show recent experiment results')
  .option('--last <n>', 'Number of results to show', '10')
  .action(async (opts: { last: string }) => {
    const client = getSupabaseClient();
    const result = await getResults(client, { last: parseInt(opts.last, 10) });

    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    if (result.results.length === 0) {
      console.log('No results found.');
      return;
    }

    console.log(`Showing last ${result.results.length} result(s):\n`);
    for (const r of result.results) {
      console.log(`  Experiment: ${r.experimentId}`);
      console.log(`  Score: ${r.score}`);
      console.log(`  Cost: $${r.costUsd}`);
      console.log(`  Time: ${r.timestamp}`);
      console.log('');
    }
  });

program.parse();
