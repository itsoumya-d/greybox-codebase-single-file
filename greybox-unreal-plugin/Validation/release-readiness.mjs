#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORTED_UNREAL_TARGETS = [
  { stream: 'Unreal Engine 5.3', version: '5.3' },
  { stream: 'Unreal Engine 5.4', version: '5.4' },
  { stream: 'Unreal Engine 5.5', version: '5.5' },
];

export function parseReleaseArgs(argv) {
  const options = {
    output: '',
    requireEditor: false,
    unreal: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') options.output = argv[++index] ?? '';
    else if (arg === '--require-editor') options.requireEditor = true;
    else if (arg === '--unreal') options.unreal = argv[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function discoverUnrealEditors(env = process.env) {
  if (env.GREYBOX_UNREAL_DISABLE_DISCOVERY === '1') return [];
  const candidates = [];
  if (env.UNREAL_EDITOR) candidates.push(env.UNREAL_EDITOR);
  for (const version of SUPPORTED_UNREAL_TARGETS.map((target) => target.version)) {
    candidates.push(`/Applications/Epic Games/UE_${version}/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor`);
    candidates.push(`/Applications/Epic Games/UE_${version}/Engine/Binaries/Mac/UnrealEditor`);
  }
  return Array.from(new Set(candidates)).filter((candidate) => existsSync(candidate));
}

export function createUnrealTargetMatrix({
  discoveredEditors = [],
  unreal = '',
  targets = SUPPORTED_UNREAL_TARGETS,
} = {}) {
  const editors = Array.from(new Set([unreal, ...discoveredEditors].filter(Boolean)));
  return targets.map((target) => {
    const editor = editors.find((candidate) => editorMatchesTarget(candidate, target)) || '';
    return {
      stream: target.stream,
      version: target.version,
      status: editor ? 'ready' : 'missing-editor',
      editor,
    };
  });
}

export function createReleaseSteps({
  nodePath = process.execPath,
} = {}) {
  return [
    {
      id: 'static-plugin-validation',
      label: 'Static Unreal plugin validation',
      command: [nodePath, 'Validation/validate-unreal-plugin.mjs'],
    },
  ];
}

export function summarizeResults(results, targetMatrix) {
  const sourceReady = results.some((result) => result.id === 'static-plugin-validation' && result.status === 'pass');
  const summary = {
    passed: results.filter((result) => result.status === 'pass').length,
    failed: results.filter((result) => result.status === 'fail').length,
    readyEditors: targetMatrix.filter((target) => target.status === 'ready').length,
    missingEditors: targetMatrix.filter((target) => target.status === 'missing-editor').length,
    sourceReady,
  };
  return {
    ...summary,
    status: summary.failed > 0 ? 'fail' : 'pass',
  };
}

export function createCloudMetrics(summary, targetMatrix) {
  return {
    unrealSourceReady: summary.sourceReady === true,
    unrealPluginStaticValidation: summary.sourceReady === true,
    unrealEditorSmokeVersions: targetMatrix
      .filter((target) => target.status === 'ready')
      .map((target) => target.version),
  };
}

export function classifyExitCode(report, { requireEditor = false } = {}) {
  if (report.summary.failed > 0) return 1;
  if (requireEditor && report.summary.missingEditors > 0) return 2;
  return 0;
}

export function formatMarkdownReport(report) {
  const lines = [
    '# Greybox Unreal Release Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Source proof: ${report.summary.sourceReady === true ? 'ready' : 'blocked'}`,
    `Cloud metric: unrealSourceReady=${report.cloudMetrics?.unrealSourceReady === true ? 'true' : 'false'}`,
    '',
    '| Unreal stream | Version | Status | Editor |',
    '| --- | --- | --- | --- |',
    ...report.targetMatrix.map((target) => `| ${escapeTableCell(target.stream)} | ${escapeTableCell(target.version)} | ${escapeTableCell(target.status)} | ${escapeTableCell(target.editor || '-')} |`),
    '',
    '| Step | Status | Detail |',
    '| --- | --- | --- |',
    ...report.steps.map((step) => {
      const detail = step.reason || step.command || `exit ${step.exitCode}`;
      return `| ${escapeTableCell(step.label)} | ${step.status} | ${escapeTableCell(detail)} |`;
    }),
  ];
  return `${lines.join('\n')}\n`;
}

export function runReleaseReadiness({
  discoveredEditors,
  env = process.env,
  now = new Date(),
  output = '',
  packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  requireEditor = false,
  unreal = '',
} = {}) {
  const editors = discoveredEditors ?? discoverUnrealEditors(env);
  const targetMatrix = createUnrealTargetMatrix({ discoveredEditors: editors, unreal });
  const steps = createReleaseSteps().map((step) => runStep(step, packageRoot, env));
  const summary = summarizeResults(steps, targetMatrix);
  const report = {
    generatedAt: now.toISOString(),
    packageRoot,
    targetMatrix,
    summary,
    cloudMetrics: createCloudMetrics(summary, targetMatrix),
    steps,
  };
  if (output) {
    const outputPath = resolve(packageRoot, output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return {
    exitCode: classifyExitCode(report, { requireEditor }),
    markdown: formatMarkdownReport(report),
    report,
  };
}

function runStep(step, cwd, env) {
  const result = spawnSync(step.command[0], step.command.slice(1), {
    cwd,
    encoding: 'utf8',
    env,
  });
  const exitCode = result.status ?? 1;
  return {
    id: step.id,
    label: step.label,
    status: exitCode === 0 ? 'pass' : 'fail',
    command: step.command.map(shellQuote).join(' '),
    exitCode,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr),
  };
}

function editorMatchesTarget(editor, target) {
  const value = String(editor ?? '');
  return value.includes(`UE_${target.version}`) || value.includes(`/${target.version}/`) || value.includes(`\\${target.version}\\`);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function trimOutput(value) {
  const text = String(value ?? '').trim();
  return text.length <= 2000 ? text : `${text.slice(0, 1800)}\n...[truncated ${text.length - 1800} chars]`;
}

function escapeTableCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function main() {
  try {
    const options = parseReleaseArgs(process.argv.slice(2));
    const result = runReleaseReadiness(options);
    process.stdout.write(result.markdown);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
