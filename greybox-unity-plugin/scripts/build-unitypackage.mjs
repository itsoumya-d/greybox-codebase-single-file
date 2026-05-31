#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
//
// Cross-platform .unitypackage build wrapper for com.greybox.studio.
//
// Resolves the Unity editor (UNITY_PATH env var, --unity flag, or Unity Hub
// discovery), creates a smoke project that installs the package via UPM, then
// invokes
// Greybox.Editor.Export.GreyboxAssetStorePackageExporter.ExportFromCommandLine
// through the existing Validation~/unity-package-export.mjs helper.
//
// Usage:
//   node scripts/build-unitypackage.mjs [--unity <path>] [--unity-version 2022.3.74f1]
//                                       [--output <path>] [--project-path <path>]
//                                       [--manifest <path>]
//
// Environment variables (all override-able by flags above):
//   UNITY_PATH                 absolute path to the Unity executable
//   UNITY_VERSION              Unity stream tag (default 2022.3.74f1)
//   GREYBOX_OUTPUT             output .unitypackage path
//   GREYBOX_PROJECT_PATH       staging project path
//   GREYBOX_MANIFEST           output manifest JSON path
//
// Exit codes:
//   0 - Unity wrote a non-empty .unitypackage; size + sha256 printed.
//   1 - any failure (no editor, exporter crashed, missing output, etc.).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_UNITY_PACKAGE_MANIFEST,
  DEFAULT_UNITY_PACKAGE_OUTPUT,
  DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
  DEFAULT_UNITY_VERSION,
  runUnityPackageExport,
} from '../Validation~/unity-package-export.mjs';
import { discoverUnityEditors } from '../Validation~/unity-import-smoke.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readPackageVersion() {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version ?? '';
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const env = process.env;
  const version = readPackageVersion();
  const options = {
    unity: env.UNITY_PATH ?? '',
    unityVersion: env.UNITY_VERSION ?? DEFAULT_UNITY_VERSION,
    output: env.GREYBOX_OUTPUT ?? `dist/greybox-studio-${version || 'dev'}.unitypackage`,
    projectPath: env.GREYBOX_PROJECT_PATH ?? DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
    manifest: env.GREYBOX_MANIFEST ?? DEFAULT_UNITY_PACKAGE_MANIFEST,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--unity') options.unity = argv[++index] ?? '';
    else if (arg === '--unity-version') options.unityVersion = argv[++index] ?? options.unityVersion;
    else if (arg === '--output') options.output = argv[++index] ?? options.output;
    else if (arg === '--project-path') options.projectPath = argv[++index] ?? options.projectPath;
    else if (arg === '--manifest') options.manifest = argv[++index] ?? options.manifest;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage());
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n${usage()}`);
      process.exit(1);
    }
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/build-unitypackage.mjs [options]',
    '',
    'Options:',
    '  --unity <path>            Unity editor binary (overrides $UNITY_PATH)',
    '  --unity-version <tag>     Unity stream tag (default 2022.3.74f1)',
    '  --output <path>           Output .unitypackage path',
    '  --project-path <path>     Staging project path',
    '  --manifest <path>         Export manifest JSON path',
    '  --dry-run                 Stage project + print command, do not run Unity',
    '  --help                    Print this help and exit',
    '',
  ].join('\n');
}

function resolveUnity(unity, { allowMissing = false } = {}) {
  if (unity && existsSync(unity)) return unity;
  if (unity) {
    if (allowMissing) return unity;
    process.stderr.write(`ERROR: Unity not found at '${unity}'.\n`);
    return '';
  }
  const found = discoverUnityEditors({ env: process.env });
  if (found.length === 0) return '';
  return found[0];
}

function shaOf(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function summarize(report) {
  const outputPath = report.outputPath;
  process.stdout.write([
    '',
    'Greybox Asset Store .unitypackage build',
    `  package: ${report.packageName}@${report.packageVersion}`,
    `  unity:   ${report.unity || '-'}`,
    `  output:  ${outputPath}`,
  ].join('\n') + '\n');

  if (report.status === 'pass' && report.package) {
    process.stdout.write([
      `  bytes:   ${report.package.bytes}`,
      `  sha256:  ${report.package.sha256}`,
      `PASS ${report.packageName}@${report.packageVersion}`,
      '',
    ].join('\n'));
    return;
  }

  if (report.status === 'dry-run') {
    process.stdout.write([
      '  status:  dry-run (Unity not invoked)',
      `  command: ${report.commandWithEnvironment || report.command || ''}`,
      'DRY_RUN exporter command printed; rerun without --dry-run to produce the .unitypackage.',
      '',
    ].join('\n'));
    return;
  }

  if (report.status === 'pass' && !report.package && existsSync(outputPath)) {
    const bytes = statSync(outputPath).size;
    const sha = shaOf(outputPath);
    process.stdout.write([
      `  bytes:   ${bytes}`,
      `  sha256:  ${sha}`,
      `PASS ${report.packageName}@${report.packageVersion}`,
      '',
    ].join('\n'));
    return;
  }

  process.stdout.write([
    `  status:  ${report.status}`,
    `  reason:  ${report.reason || '(unspecified)'}`,
    'FAIL .unitypackage build did not complete.',
    '',
  ].join('\n'));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const unity = resolveUnity(options.unity, { allowMissing: options.dryRun });
  if (!unity && !options.dryRun) {
    process.stderr.write([
      'ERROR: Unity Editor binary not found.',
      'Set $UNITY_PATH=/path/to/Unity (e.g. /Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity)',
      'or pass --unity /path/to/Unity.',
      '',
    ].join('\n'));
    process.exit(1);
  }

  const outputPath = isAbsolute(options.output) ? options.output : join(PACKAGE_ROOT, options.output);
  const projectPath = isAbsolute(options.projectPath) ? options.projectPath : join(PACKAGE_ROOT, options.projectPath);
  const manifestPath = isAbsolute(options.manifest) ? options.manifest : join(PACKAGE_ROOT, options.manifest);

  const result = runUnityPackageExport({
    dryRun: options.dryRun,
    manifest: manifestPath,
    output: outputPath,
    packageRoot: PACKAGE_ROOT,
    projectPath,
    unity,
    unityVersion: options.unityVersion,
  });

  summarize(result.report);
  process.exitCode = result.exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
