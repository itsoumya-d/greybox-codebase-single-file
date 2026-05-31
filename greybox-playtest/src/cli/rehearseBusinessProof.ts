#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  buildPlaytestBusinessProofRehearsal,
  playtestBusinessProofRehearsalMarkdown,
  type PlaytestBusinessProofRehearsalOptions,
} from '../reporter/businessProofRehearsal.js';

interface CliOptions extends PlaytestBusinessProofRehearsalOptions {
  output?: string;
  markdown?: string;
  allowNotReady: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = buildPlaytestBusinessProofRehearsal(options);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = playtestBusinessProofRehearsalMarkdown(report);

  if (options.output) await writeText(options.output, json);
  if (options.markdown) await writeText(options.markdown, markdown);
  if (!options.output && !options.markdown) process.stdout.write(json);

  const status = report.ready ? 'ready' : 'not-ready';
  process.stderr.write(`Greybox playtest business proof rehearsal: ${status}\n`);
  if (!report.ready && !options.allowNotReady) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { allowNotReady: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    switch (arg) {
      case '--help':
      case '-h':
        process.stdout.write(helpText());
        process.exit(0);
        break;
      case '--output':
        options.output = requiredValue(args, index, arg);
        index += 1;
        break;
      case '--markdown':
        options.markdown = requiredValue(args, index, arg);
        index += 1;
        break;
      case '--generated-at':
        options.generatedAt = parseTimestamp(requiredValue(args, index, arg));
        index += 1;
        break;
      case '--record-count':
        options.recordCount = parseInteger(requiredValue(args, index, arg), arg);
        index += 1;
        break;
      case '--paying-studio-count':
        options.payingStudioCount = parseInteger(requiredValue(args, index, arg), arg);
        index += 1;
        break;
      case '--accepted-suggestion-studios':
        options.acceptedSuggestionStudios = parseInteger(requiredValue(args, index, arg), arg);
        index += 1;
        break;
      case '--personas-in-production':
        options.personasInProduction = parseInteger(requiredValue(args, index, arg), arg);
        index += 1;
        break;
      case '--weak-adoption':
        options.recordCount = Math.min(options.recordCount ?? 12, 12);
        options.acceptedSuggestionStudios = Math.min(options.acceptedSuggestionStudios ?? 1, 1);
        break;
      case '--weak-qa':
        options.qaTargets = {
          ...(options.qaTargets ?? {}),
          annualQaBudgetCents: 100_000_000_000,
          targetReplacementBps: 3_000,
        };
        break;
      case '--weak-regression':
        options.regressionReady = false;
        break;
      case '--unsafe-source-record':
        options.unsafeSourceRecord = true;
        break;
      case '--allow-not-ready':
        options.allowNotReady = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parseInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
  return parsed;
}

function parseTimestamp(value: string): number {
  if (/^\d+$/u.test(value)) return Number(value);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('--generated-at must be an epoch millisecond value or ISO date');
  return parsed;
}

async function writeText(path: string, contents: string): Promise<void> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, 'utf8');
}

function helpText(): string {
  return `Greybox Playtest business proof rehearsal

Usage:
  pnpm rehearse:business-proof [options]

Options:
  --output <path>                         Write sanitized JSON report.
  --markdown <path>                       Write phone-readable markdown report.
  --generated-at <epoch-ms|iso>           Override generated timestamp.
  --record-count <n>                      Synthetic paid usage records (default 350).
  --paying-studio-count <n>               Distinct paying studios across records (default 100).
  --accepted-suggestion-studios <n>       Studios with accepted tuner suggestions (default 24).
  --personas-in-production <n>            First-party personas production-ready (default alpha count).
  --weak-adoption                         Rehearse adoption-proof failure.
  --weak-qa                               Rehearse QA-savings failure.
  --weak-regression                       Rehearse before/after regression failure.
  --unsafe-source-record                  Inject unsafe source evidence and verify fail-closed behavior.
  --allow-not-ready                       Exit 0 even when proof is blocked.
  --help                                  Show this message.
`;
}

await main();
