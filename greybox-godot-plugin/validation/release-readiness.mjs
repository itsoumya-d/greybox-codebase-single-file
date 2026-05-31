#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORTED_GODOT_TARGETS = [
  { stream: 'Godot 4.2', version: '4.2' },
  { stream: 'Godot 4.3', version: '4.3' },
  { stream: 'Godot 4.4', version: '4.4' },
];

export function parseReleaseArgs(argv) {
  const options = {
    godot: '',
    output: '',
    requireEditor: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--godot') options.godot = argv[++index] ?? '';
    else if (arg === '--output') options.output = argv[++index] ?? '';
    else if (arg === '--require-editor') options.requireEditor = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function discoverGodotEditors(env = process.env) {
  if (env.GREYBOX_GODOT_DISABLE_DISCOVERY === '1') return [];
  const candidates = [];
  if (env.GODOT_EDITOR) candidates.push(env.GODOT_EDITOR);
  for (const version of SUPPORTED_GODOT_TARGETS.map((target) => target.version)) {
    candidates.push(`/Applications/Godot_${version}.app/Contents/MacOS/Godot`);
    candidates.push(`/Applications/Godot_v${version}.app/Contents/MacOS/Godot`);
    candidates.push(`/Applications/Godot.app/Contents/MacOS/Godot`);
  }
  return Array.from(new Set(candidates)).filter((candidate) => existsSync(candidate));
}

export function createGodotTargetMatrix({
  discoveredEditors = [],
  godot = '',
  targets = SUPPORTED_GODOT_TARGETS,
} = {}) {
  const editors = Array.from(new Set([godot, ...discoveredEditors].filter(Boolean)));
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
      id: 'static-addon-validation',
      label: 'Static Godot addon validation',
      command: [nodePath, 'validation/validate-godot-plugin.mjs'],
    },
  ];
}

export function summarizeResults(results, targetMatrix) {
  const sourceReady = results.some((result) => result.id === 'static-addon-validation' && result.status === 'pass');
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
    godotSourceReady: summary.sourceReady === true,
    godotAddonStaticValidation: summary.sourceReady === true,
    godotEditorSmokeVersions: targetMatrix
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
    '# Greybox Godot Release Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.summary.status}`,
    `Source proof: ${report.summary.sourceReady === true ? 'ready' : 'blocked'}`,
    `Cloud metric: godotSourceReady=${report.cloudMetrics?.godotSourceReady === true ? 'true' : 'false'}`,
    '',
    '| Godot stream | Version | Status | Editor |',
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
  godot = '',
  now = new Date(),
  output = '',
  packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  requireEditor = false,
} = {}) {
  const editors = discoveredEditors ?? discoverGodotEditors(env);
  const targetMatrix = createGodotTargetMatrix({ discoveredEditors: editors, godot });
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
  return value.includes(`Godot_${target.version}`) || value.includes(`Godot_v${target.version}`) || value.includes(`/${target.version}/`);
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
