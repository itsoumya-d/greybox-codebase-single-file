#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DISTRIBUTION_DOCS = [
  'docs/distribution/marketplace-submission-packet.md',
  'docs/distribution/partner-readiness-packet.md',
];

export const OFFICIAL_DISTRIBUTION_SOURCES = [
  'https://assetstore.unity.com/publishing/publish-and-sell-assets',
  'https://assetstore.unity.com/publishing/submission-guidelines',
  'https://unity.com/partners/verified-solutions',
  'https://www.fab.com/en-US/become-a-publisher',
  'https://www.unrealengine.com/megagrants',
  'https://godotengine.org/asset-library/asset/submit',
  'https://docs.godotengine.org/en/stable/community/asset_library/submitting_to_assetlib.html',
  'https://godot.foundation/',
  'https://fund.godotengine.org/corporate-sponsorship',
];

const MARKETPLACE_REQUIRED_PHRASES = [
  'Status: submission packet ready; external submissions are not complete.',
  'Unity Asset Store',
  'Unity Verified Solutions',
  'Fab',
  'Godot Asset Library',
  'itch.io creator tools',
  'Steamworks partner',
  'Transparent AI-aided disclosure',
  'No bundled API keys or secrets',
  'No automatic redirects outside the Editor',
  'Godot License Risk',
  'No-Claim Rule',
  'not "approved", "verified"',
];

const PARTNER_REQUIRED_PHRASES = [
  'Status: partner packet ready; no external partnership is claimed.',
  'Unity Verified Solutions',
  'Epic MegaGrant',
  'Godot Foundation sponsorship',
  'Anthropic co-marketing',
  'OpenAI co-marketing',
  'Education',
  '2026 Cycle 2',
  'June 29, 2026',
  'September 4, 2026',
  'No model training on student work without a separate explicit opt-in checkbox',
  'Partner Demo Spine',
  'No-Claim Rule',
  'Never claim "official partner"',
];

export function validateDistributionReadiness(root) {
  const errors = [];
  for (const file of DISTRIBUTION_DOCS) {
    if (!existsSync(join(root, file))) errors.push(`missing distribution artifact: ${file}`);
  }

  const marketplace = readText(root, 'docs/distribution/marketplace-submission-packet.md', errors);
  const partner = readText(root, 'docs/distribution/partner-readiness-packet.md', errors);

  for (const source of OFFICIAL_DISTRIBUTION_SOURCES) {
    const inMarketplace = marketplace.includes(source);
    const inPartner = partner.includes(source);
    if (!inMarketplace && !inPartner) errors.push(`distribution packet missing official source: ${source}`);
  }
  for (const phrase of MARKETPLACE_REQUIRED_PHRASES) {
    if (!marketplace.includes(phrase)) errors.push(`marketplace submission packet missing: ${phrase}`);
  }
  for (const phrase of PARTNER_REQUIRED_PHRASES) {
    if (!partner.includes(phrase)) errors.push(`partner readiness packet missing: ${phrase}`);
  }

  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    externalBlockers: [
      'Unity publisher credentials and Asset Store review',
      'Unity Verified Solutions application and technical review',
      'Fab publisher account and Epic review',
      'Godot Asset Library account, compliant license, and review',
      'Epic MegaGrant Cycle 2 submission window',
      'Godot Foundation sponsorship payment approval',
      'Anthropic/OpenAI partner introductions',
      'first five education pilots',
    ],
  };
}

export function formatDistributionReadinessMarkdown(report) {
  const lines = [
    '# Greybox Distribution Readiness Gate',
    '',
    `Status: ${report.status}`,
    '',
    '## External Blockers',
    '',
    ...report.externalBlockers.map((blocker) => `- ${blocker}`),
  ];
  if (report.errors.length > 0) {
    lines.push('', '## Errors', '', ...report.errors.map((error) => `- ${error}`));
  }
  return `${lines.join('\n')}\n`;
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
  const report = validateDistributionReadiness(root);
  process.stdout.write(formatDistributionReadinessMarkdown(report));
  if (report.errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
