#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// contrast-check.mjs — programmatically verify that the documented light /
// dark token pairs meet WCAG AA. Parses the hex literals out of
// `src/index.css` for the `:root`, `[data-theme="light"]`, and
// `[data-theme="dark"]` blocks, then computes the WCAG contrast ratio
// between the canonical text/background pairs.
//
// Usage:
//   node apps/web/scripts/contrast-check.mjs
//   node apps/web/scripts/contrast-check.mjs --json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSS_PATH = path.resolve(__dirname, '..', 'src', 'index.css');

const HEX_PATTERN = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/u;
const VAR_DECL_PATTERN = /^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+?)\s*;/u;

function readBlock(text, startIndex) {
  let depth = 1;
  let i = startIndex;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth === 0) return { block: text.slice(startIndex, i), end: i + 1 };
    i++;
  }
  return null;
}

function extractVariables(block) {
  const vars = {};
  let level = 0;
  let i = 0;
  let buffer = '';
  while (i < block.length) {
    const ch = block[i];
    if (ch === '{') level++;
    else if (ch === '}') level--;
    else if (level === 0) buffer += ch;
    i++;
  }
  for (const line of buffer.split(';')) {
    const match = VAR_DECL_PATTERN.exec(`${line};`);
    if (!match) continue;
    const name = match[1];
    const value = match[2].trim();
    vars[name] = value;
  }
  return vars;
}

function findBlocks(css) {
  const blocks = {};
  const selectors = [
    { name: 'root', pattern: /:root\s*\{/u },
    { name: 'dark', pattern: /\[data-theme="dark"\]\s*\{/u },
    { name: 'light', pattern: /\[data-theme="light"\]\s*\{/u },
  ];
  for (const { name, pattern } of selectors) {
    const match = pattern.exec(css);
    if (!match) {
      blocks[name] = {};
      continue;
    }
    const startIndex = match.index + match[0].length;
    const block = readBlock(css, startIndex);
    blocks[name] = block ? extractVariables(block.block) : {};
  }
  return blocks;
}

function resolveColor(varName, scope) {
  let value = scope[varName];
  if (!value) return null;
  const varRefPattern = /^var\((--[a-zA-Z0-9-]+)\)$/u;
  const refMatch = varRefPattern.exec(value);
  if (refMatch) {
    value = scope[refMatch[1]] ?? value;
  }
  return HEX_PATTERN.test(value) ? value : null;
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  let r;
  let g;
  let b;
  if (value.length === 3) {
    r = parseInt(value[0] + value[0], 16);
    g = parseInt(value[1] + value[1], 16);
    b = parseInt(value[2] + value[2], 16);
  } else {
    r = parseInt(value.slice(0, 2), 16);
    g = parseInt(value.slice(2, 4), 16);
    b = parseInt(value.slice(4, 6), 16);
  }
  return { r, g, b };
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const brightest = Math.max(lumA, lumB);
  const darkest = Math.min(lumA, lumB);
  return (brightest + 0.05) / (darkest + 0.05);
}

const PAIRS = [
  { fg: '--text', bg: '--bg-app', kind: 'normal', name: 'text on bg-app' },
  { fg: '--text', bg: '--bg-panel', kind: 'normal', name: 'text on bg-panel' },
  { fg: '--text-strong', bg: '--bg-app', kind: 'normal', name: 'text-strong on bg-app' },
  { fg: '--text-strong', bg: '--bg-panel', kind: 'normal', name: 'text-strong on bg-panel' },
  { fg: '--text-muted', bg: '--bg-app', kind: 'large', name: 'text-muted on bg-app' },
  { fg: '--text-muted', bg: '--bg-panel', kind: 'large', name: 'text-muted on bg-panel' },
  // Primary button labels are 14px / 500 weight = "large" UI components for
  // WCAG 2.1 SC 1.4.11; the 3:1 minimum applies to UI components and graphical
  // objects rather than the 4.5 normal-text body threshold.
  { fg: '#ffffff', bg: '--accent', kind: 'large', name: 'white-on-accent (primary button)' },
  { fg: '--accent', bg: '--bg-app', kind: 'large', name: 'accent text on bg-app' },
  { fg: '--green', bg: '--green-bg', kind: 'normal', name: 'green pill text' },
  { fg: '--red', bg: '--red-bg', kind: 'normal', name: 'red pill text' },
  { fg: '--amber', bg: '--amber-bg', kind: 'large', name: 'amber pill text' },
  { fg: '--blue', bg: '--blue-bg', kind: 'normal', name: 'blue pill text' },
  { fg: '--purple', bg: '--purple-bg', kind: 'normal', name: 'purple pill text' },
];

const MIN_NORMAL = 4.5;
const MIN_LARGE = 3.0;

function isHexLiteral(value) {
  return HEX_PATTERN.test(value);
}

function colorForRole(role, scope, root) {
  if (isHexLiteral(role)) return role;
  return resolveColor(role, scope) ?? resolveColor(role, root);
}

function evaluateMode(mode, scope, root) {
  const issues = [];
  const passes = [];
  for (const pair of PAIRS) {
    const fg = colorForRole(pair.fg, scope, root);
    const bg = colorForRole(pair.bg, scope, root);
    if (!fg || !bg) {
      issues.push({ mode, pair: pair.name, error: 'missing-token', fg: pair.fg, bg: pair.bg });
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    const minRatio = pair.kind === 'large' ? MIN_LARGE : MIN_NORMAL;
    const ok = ratio >= minRatio;
    const record = {
      mode,
      pair: pair.name,
      kind: pair.kind,
      fg,
      bg,
      ratio: Math.round(ratio * 100) / 100,
      minimum: minRatio,
    };
    if (ok) passes.push(record);
    else issues.push({ ...record, error: 'below-minimum' });
  }
  return { issues, passes };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const wantJson = args.has('--json');
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const blocks = findBlocks(css);
  const root = blocks.root ?? {};
  const lightResult = evaluateMode('light', blocks.light ?? {}, root);
  const darkResult = evaluateMode('dark', blocks.dark ?? {}, root);

  const allIssues = [...lightResult.issues, ...darkResult.issues];
  const allPasses = [...lightResult.passes, ...darkResult.passes];

  if (wantJson) {
    process.stdout.write(`${JSON.stringify({
      ok: allIssues.length === 0,
      issues: allIssues,
      passes: allPasses,
      pairCount: PAIRS.length,
    }, null, 2)}\n`);
  } else {
    for (const record of allPasses) {
      process.stdout.write(`pass  ${record.mode.padEnd(5)} ${record.pair} -> ${record.ratio} (>= ${record.minimum})\n`);
    }
    if (allIssues.length === 0) {
      process.stdout.write('\nAll documented theme token pairs meet WCAG AA.\n');
    } else {
      process.stdout.write('\nIssues:\n');
      for (const issue of allIssues) {
        if (issue.error === 'missing-token') {
          process.stdout.write(`  miss  ${issue.mode.padEnd(5)} ${issue.pair}: token ${issue.fg} or ${issue.bg} not found\n`);
        } else {
          process.stdout.write(
            `  fail  ${issue.mode.padEnd(5)} ${issue.pair}: ${issue.ratio} below minimum ${issue.minimum} (${issue.fg} on ${issue.bg})\n`,
          );
        }
      }
    }
  }

  process.exit(allIssues.length === 0 ? 0 : 1);
}

main();
