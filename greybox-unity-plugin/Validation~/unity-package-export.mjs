#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSmokeProject, discoverUnityEditors } from './unity-import-smoke.mjs';

export const DEFAULT_UNITY_PACKAGE_PROJECT_PATH = '.tmp/asset-store-export';
export const DEFAULT_UNITY_PACKAGE_OUTPUT = 'dist/com.greybox.studio.unitypackage';
export const DEFAULT_UNITY_PACKAGE_MANIFEST = 'Validation~/artifacts/unitypackage-export.json';
export const DEFAULT_UNITY_VERSION = '2022.3.74f1';
export const EXPORT_METHOD = 'Greybox.Editor.Export.GreyboxAssetStorePackageExporter.ExportFromCommandLine';

export function parseUnityPackageExportArgs(argv) {
  const options = {
    dryRun: false,
    manifest: DEFAULT_UNITY_PACKAGE_MANIFEST,
    output: DEFAULT_UNITY_PACKAGE_OUTPUT,
    projectPath: DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
    root: '',
    skipIfMissing: false,
    unity: '',
    unityVersion: DEFAULT_UNITY_VERSION,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--manifest') options.manifest = argv[++index] ?? '';
    else if (arg === '--output') options.output = argv[++index] ?? '';
    else if (arg === '--project-path') options.projectPath = argv[++index] ?? '';
    else if (arg === '--root') options.root = argv[++index] ?? '';
    else if (arg === '--skip-if-missing') options.skipIfMissing = true;
    else if (arg === '--unity') options.unity = argv[++index] ?? '';
    else if (arg === '--unity-version') options.unityVersion = argv[++index] ?? options.unityVersion;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function createUnityPackageExportCommand({ outputPath, projectRoot, unity }) {
  return [
    unity,
    '-batchmode',
    '-quit',
    '-nographics',
    '-projectPath',
    projectRoot,
    '-executeMethod',
    EXPORT_METHOD,
    '-greyboxAssetStorePackageOutput',
    outputPath,
  ];
}

export function runUnityPackageExport({
  dryRun = false,
  env = process.env,
  manifest = DEFAULT_UNITY_PACKAGE_MANIFEST,
  now = new Date(),
  output = DEFAULT_UNITY_PACKAGE_OUTPUT,
  packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  projectPath = DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
  skipIfMissing = false,
  unity = '',
  unityVersion = DEFAULT_UNITY_VERSION,
} = {}) {
  const root = resolve(packageRoot);
  const editors = unity ? [unity] : discoverUnityEditors({ env });
  const unityPath = unity || editors[0] || '';
  const projectRoot = resolve(root, projectPath);
  const outputPath = resolve(root, output);
  const manifestPath = manifest ? resolve(root, manifest) : '';

  const report = {
    generatedAt: now.toISOString(),
    packageRoot: root,
    ...readPackageMetadata(root),
    projectRoot,
    outputPath,
    unityVersion,
    unity: unityPath,
    status: 'pending',
  };

  if (!unityPath) {
    report.status = skipIfMissing ? 'skipped' : 'blocked';
    report.reason = 'Unity Editor was not found. Install Unity 2022.3 LTS or pass --unity /path/to/Unity.';
    writeManifest(manifestPath, report);
    return {
      exitCode: skipIfMissing ? 0 : 2,
      report,
      markdown: formatUnityPackageExportMarkdown(report),
    };
  }

  createSmokeProject({
    root: projectRoot,
    packageRoot: root,
    unityVersion,
  });
  mkdirSync(dirname(outputPath), { recursive: true });

  const command = createUnityPackageExportCommand({
    outputPath,
    projectRoot,
    unity: unityPath,
  });
  report.commandArgv = command;
  report.command = command.map(shellQuote).join(' ');
  report.commandWithEnvironment = `GREYBOX_ASSET_STORE_PACKAGE_OUTPUT=${shellQuote(outputPath)} ${report.command}`;

  if (dryRun) {
    report.status = 'dry-run';
    writeManifest(manifestPath, report);
    return {
      exitCode: 0,
      report,
      markdown: formatUnityPackageExportMarkdown(report),
    };
  }

  const started = Date.now();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...env,
      GREYBOX_ASSET_STORE_PACKAGE_OUTPUT: outputPath,
    },
  });
  report.durationMs = Date.now() - started;
  report.exitCode = result.status ?? 1;
  report.stdout = trimOutput(result.stdout);
  report.stderr = trimOutput(result.stderr);

  if (report.exitCode !== 0) {
    report.status = 'fail';
    report.reason = `Unity exporter exited with ${report.exitCode}.`;
    writeManifest(manifestPath, report);
    return {
      exitCode: 1,
      report,
      markdown: formatUnityPackageExportMarkdown(report),
    };
  }

  if (!existsSync(outputPath)) {
    report.status = 'fail';
    report.reason = `Unity exporter did not write ${outputPath}.`;
    writeManifest(manifestPath, report);
    return {
      exitCode: 1,
      report,
      markdown: formatUnityPackageExportMarkdown(report),
    };
  }

  const bytes = statSync(outputPath).size;
  if (bytes <= 0) {
    report.status = 'fail';
    report.reason = `Unity exporter wrote an empty package: ${outputPath}.`;
    writeManifest(manifestPath, report);
    return {
      exitCode: 1,
      report,
      markdown: formatUnityPackageExportMarkdown(report),
    };
  }

  report.status = 'pass';
  report.package = {
    bytes,
    sha256: createHash('sha256').update(readFileSync(outputPath)).digest('hex'),
  };
  writeManifest(manifestPath, report);
  return {
    exitCode: 0,
    report,
    markdown: formatUnityPackageExportMarkdown(report),
  };
}

export function formatUnityPackageExportMarkdown(report) {
  const lines = [
    '# Greybox Unity Asset Store Package Export',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Unity: ${report.unity || '-'}`,
    `Project: ${report.projectRoot}`,
    `Output: ${report.outputPath}`,
  ];
  if (report.package) {
    lines.push(`Package: ${report.package.bytes} bytes, SHA-256 \`${report.package.sha256}\``);
  }
  if (report.reason) lines.push(`Reason: ${report.reason}`);
  if (report.commandWithEnvironment) {
    lines.push('', 'Command:', '', '```bash', report.commandWithEnvironment, '```');
  }
  return `${lines.join('\n')}\n`;
}

function writeManifest(manifestPath, report) {
  if (!manifestPath) return;
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(report, null, 2)}\n`);
}

function readPackageMetadata(root) {
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return {
      packageName: typeof manifest.name === 'string' ? manifest.name : '',
      packageVersion: typeof manifest.version === 'string' ? manifest.version : '',
      packageDisplayName: typeof manifest.displayName === 'string' ? manifest.displayName : '',
    };
  } catch {
    return {
      packageName: '',
      packageVersion: '',
      packageDisplayName: '',
    };
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function trimOutput(value) {
  const text = String(value ?? '').trim();
  if (text.length <= 4000) return text;
  return `${text.slice(0, 3800)}\n...[truncated ${text.length - 3800} chars]`;
}

function main() {
  try {
    const options = parseUnityPackageExportArgs(process.argv.slice(2));
    const result = runUnityPackageExport({
      ...options,
      packageRoot: options.root || undefined,
    });
    process.stdout.write(result.markdown);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
