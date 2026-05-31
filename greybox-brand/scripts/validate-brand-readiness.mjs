#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BRAND_NAMES = ['Greybox', 'Pillar', 'Preplay', 'Loopforge', 'Mechanic'];
export const REQUIRED_TLDS = ['.studio', '.gg', '.ai', '.com'];
export const REQUIRED_REPOS = [
  'greybox-pro',
  'greybox-unity-plugin',
  'greybox-unreal-plugin',
  'greybox-godot-plugin',
  'greybox-cloud',
  'greybox-marketplace',
  'greybox-brand',
  'greybox-playtest',
];
export const OFFICIAL_TRADEMARK_SOURCES = [
  'https://www.uspto.gov/trademarks/search',
  'https://www.euipo.europa.eu/en/search-ip',
  'https://www.ipindia.gov.in/Trademarks/trademarks',
];

const REQUIRED_DOCS = [
  'docs/brand/naming-memo.md',
  'docs/brand/trademark-filing-packet.md',
  'docs/brand/domain-github-readiness.md',
  'BRAND.md',
];

const REQUIRED_LOGOS = [
  'logo/mark.svg',
  'logo/wordmark.svg',
  'logo/lockup-horizontal.svg',
  'logo/lockup-vertical.svg',
  'logo/mark-mono.svg',
  'logo/mark-inverse.svg',
  'logo/favicon.ico',
  'logo/apple-touch-icon.png',
  'logo/og-image.png',
  'logo/social-square.png',
];

const REQUIRED_TOKEN_OUTPUTS = [
  'dist/css/tokens.css',
  'dist/tailwind/tokens.js',
  'dist/figma/tokens.json',
  'dist/unity/GreyboxTokens.cs',
  'dist/unreal/GreyboxTokens.uasset',
];

const EXPECTED_MARK_RECTS = [
  { x: '0', y: '0', width: '8', height: '8', fill: '#D8D8DC' },
  { x: '8', y: '0', width: '8', height: '8', fill: '#BFBFC4' },
  { x: '16', y: '0', width: '8', height: '8', fill: '#A6A6AC' },
  { x: '0', y: '8', width: '8', height: '8', fill: '#BFBFC4' },
  { x: '8', y: '8', width: '8', height: '8', fill: '#8C8C92' },
  { x: '16', y: '8', width: '8', height: '8', fill: '#5C5C62' },
  { x: '0', y: '16', width: '8', height: '8', fill: '#A6A6AC' },
  { x: '8', y: '16', width: '8', height: '8', fill: '#5C5C62' },
  { x: '16', y: '16', width: '8', height: '8', fill: '#2F2F35' },
];

const EXPECTED_MARK_POLYGON = { points: '24,24 32,28 24,32', fill: '#FF6B35' };

export const TRADEMARK_HYGIENE_FILES = [
  'README.md',
  'BRAND.md',
  'docs/brand/naming-memo.md',
  'docs/brand/trademark-filing-packet.md',
  'docs/brand/domain-github-readiness.md',
  'docs/distribution/marketplace-submission-packet.md',
  'docs/distribution/partner-readiness-packet.md',
];

const GENERICIDE_PATTERNS = [
  {
    pattern: /\bgreybox(?:es|ed|ing)?\b\s+(?:a|an|the|this|that|your|their|our)\b/iu,
    guidance: 'Use "block out ... with Greybox" instead of using Greybox as a verb.',
  },
  {
    pattern: /\b(?:greyboxed|greyboxing)\b/iu,
    guidance: 'Use "blockout" or "AI-assisted blockout" for the generic game-dev activity.',
  },
  {
    pattern: /\bAI[-\s]?generated\b/iu,
    guidance: 'Use "AI-assisted" and credit the human designer unless reviewed copy explicitly explains generation context.',
  },
];

export function validateBrandReadiness(root) {
  const errors = [];
  const warnings = [];
  for (const file of [...REQUIRED_DOCS, ...REQUIRED_LOGOS, ...REQUIRED_TOKEN_OUTPUTS]) {
    if (!existsSync(join(root, file))) errors.push(`missing required brand artifact: ${file}`);
  }

  const namingMemo = readText(root, 'docs/brand/naming-memo.md', errors);
  const filingPacket = readText(root, 'docs/brand/trademark-filing-packet.md', errors);
  const domainPacket = readText(root, 'docs/brand/domain-github-readiness.md', errors);
  const brandGuide = readText(root, 'BRAND.md', errors);

  validateNamingMemo(namingMemo, errors);
  validateFilingPacket(filingPacket, errors);
  validateDomainPacket(domainPacket, errors);
  validateBrandGuide(brandGuide, errors);
  validateMarkSvg(root, errors);
  validateTrademarkHygiene(root, errors);

  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    warnings,
    externalBlockers: [
      'trademark counsel clearance',
      'US/EU/India trademark filings',
      'domain purchase',
      'GitHub organization creation',
    ],
  };
}

export function formatBrandReadinessMarkdown(report) {
  const lines = [
    '# Greybox Brand Readiness Gate',
    '',
    `Status: ${report.status}`,
    '',
    '## External Blockers',
    '',
    ...report.externalBlockers.map((blocker) => `- ${blocker}`),
  ];
  if (report.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...report.warnings.map((warning) => `- ${warning}`));
  }
  if (report.errors.length > 0) {
    lines.push('', '## Errors', '', ...report.errors.map((error) => `- ${error}`));
  }
  return `${lines.join('\n')}\n`;
}

function validateNamingMemo(text, errors) {
  for (const phrase of [
    'Chosen name: Greybox',
    'provisionally selected',
    'fallback',
    'not legal advice',
    'Nice Class 9',
    'Nice Class 42',
    'Nice Class 41',
    'greybox-studio',
  ]) {
    if (!text.includes(phrase)) errors.push(`naming memo missing: ${phrase}`);
  }
  for (const source of OFFICIAL_TRADEMARK_SOURCES) {
    if (!text.includes(source)) errors.push(`naming memo missing official trademark source: ${source}`);
  }
  for (const name of BRAND_NAMES) {
    if (!text.includes(name)) errors.push(`naming memo missing brand/fallback name: ${name}`);
  }
  for (const tld of REQUIRED_TLDS) {
    if (!text.includes(tld)) errors.push(`naming memo missing domain TLD: ${tld}`);
  }
  for (const repo of REQUIRED_REPOS) {
    if (!text.includes(repo)) errors.push(`naming memo missing required repo: ${repo}`);
  }
}

function validateFilingPacket(text, errors) {
  for (const source of OFFICIAL_TRADEMARK_SOURCES) {
    if (!text.includes(source)) errors.push(`filing packet missing official trademark source: ${source}`);
  }
  for (const phrase of [
    'not filed',
    'not legal advice',
    'Word mark: Greybox',
    'Stylized mark',
    'Nice Class 9',
    'Nice Class 42',
    'Nice Class 41',
    'Grey Box',
    'Graybox',
    'File word-mark applications first',
    'File stylized mark',
  ]) {
    if (!text.includes(phrase)) errors.push(`filing packet missing: ${phrase}`);
  }
}

function validateDomainPacket(text, errors) {
  for (const phrase of [
    'founder credentials',
    'DNS checked locally on 2026-05-18',
    'not registrar availability or ownership proof',
    'ICANN Lookup',
    'GitHub Organization',
    '@greybox-studio',
    'Naming Consistency Rule',
  ]) {
    if (!text.includes(phrase)) errors.push(`domain/GitHub packet missing: ${phrase}`);
  }
  for (const name of BRAND_NAMES) {
    if (!text.includes(name)) errors.push(`domain/GitHub packet missing brand/fallback name: ${name}`);
  }
  for (const tld of REQUIRED_TLDS) {
    if (!text.includes(tld)) errors.push(`domain/GitHub packet missing TLD: ${tld}`);
  }
  for (const repo of REQUIRED_REPOS) {
    if (!text.includes(repo)) errors.push(`domain/GitHub packet missing required repo: ${repo}`);
  }
}

function validateBrandGuide(text, errors) {
  for (const phrase of [
    'AI-assisted',
    'Use Greybox as a product name or adjective, never as a verb or generic noun.',
    '<meta name="generator" content="Greybox + <designer-name>">',
    'Minimum mark size: 16px',
    'Never recolor the Spark Orange play triangle',
    'Never separate the mark from the wordmark',
  ]) {
    if (!text.includes(phrase)) errors.push(`brand guide missing: ${phrase}`);
  }
}

function validateMarkSvg(root, errors) {
  const file = 'logo/mark.svg';
  if (!existsSync(join(root, file))) return;

  const text = readText(root, file, errors);
  const svgAttributes = parseAttributes(text.match(/<svg\b([^>]*)>/iu)?.[1] ?? '');
  if (svgAttributes.viewBox !== '0 0 32 32') errors.push('logo/mark.svg must use viewBox="0 0 32 32"');
  if (svgAttributes.role !== 'img') errors.push('logo/mark.svg must expose role="img"');
  if (svgAttributes['aria-label'] !== 'Greybox') errors.push('logo/mark.svg must use aria-label="Greybox"');

  const rects = [...text.matchAll(/<rect\b([^>]*)\/?>/giu)].map((match) => parseAttributes(match[1]));
  if (rects.length !== EXPECTED_MARK_RECTS.length) {
    errors.push(`logo/mark.svg must contain exactly ${EXPECTED_MARK_RECTS.length} grid squares`);
  }
  for (const expected of EXPECTED_MARK_RECTS) {
    const hasRect = rects.some((rect) =>
      Object.entries(expected).every(([attribute, value]) => rect[attribute] === value),
    );
    if (!hasRect) {
      errors.push(
        `logo/mark.svg missing ${expected.width}x${expected.height} square at ${expected.x},${expected.y} with fill ${expected.fill}`,
      );
    }
  }

  const polygons = [...text.matchAll(/<polygon\b([^>]*)\/?>/giu)].map((match) => parseAttributes(match[1]));
  const hasPlayTriangle = polygons.some((polygon) =>
    Object.entries(EXPECTED_MARK_POLYGON).every(([attribute, value]) => polygon[attribute] === value),
  );
  if (!hasPlayTriangle) {
    errors.push('logo/mark.svg missing Spark Orange play triangle at points="24,24 32,28 24,32"');
  }
}

function parseAttributes(text) {
  return Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/gu)].map((match) => [match[1], match[2]]));
}

function validateTrademarkHygiene(root, errors) {
  for (const file of TRADEMARK_HYGIENE_FILES) {
    const text = readText(root, file, errors);
    const lines = text.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const { pattern, guidance } of GENERICIDE_PATTERNS) {
        if (pattern.test(line)) {
          errors.push(`brand hygiene violation in ${file}:${index + 1}: ${guidance}`);
        }
      }
    }
  }
}

function readText(root, file, errors) {
  try {
    return readFileSync(join(root, file), 'utf8');
  } catch (error) {
    errors.push(`could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

function runCli() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const report = validateBrandReadiness(root);
  process.stdout.write(formatBrandReadinessMarkdown(report));
  if (report.errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
