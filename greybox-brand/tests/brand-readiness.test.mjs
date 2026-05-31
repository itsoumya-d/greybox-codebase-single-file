import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  BRAND_NAMES,
  OFFICIAL_TRADEMARK_SOURCES,
  REQUIRED_REPOS,
  REQUIRED_TLDS,
  TRADEMARK_HYGIENE_FILES,
  formatBrandReadinessMarkdown,
  validateBrandReadiness,
} from '../scripts/validate-brand-readiness.mjs';
import {
  DISTRIBUTION_DOCS,
  OFFICIAL_DISTRIBUTION_SOURCES,
  formatDistributionReadinessMarkdown,
  validateDistributionReadiness,
} from '../scripts/validate-distribution-readiness.mjs';

const VALID_MARK_SVG = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Greybox">
  <rect x="0"  y="0"  width="8" height="8" fill="#D8D8DC"/>
  <rect x="8"  y="0"  width="8" height="8" fill="#BFBFC4"/>
  <rect x="16" y="0"  width="8" height="8" fill="#A6A6AC"/>
  <rect x="0"  y="8"  width="8" height="8" fill="#BFBFC4"/>
  <rect x="8"  y="8"  width="8" height="8" fill="#8C8C92"/>
  <rect x="16" y="8"  width="8" height="8" fill="#5C5C62"/>
  <rect x="0"  y="16" width="8" height="8" fill="#A6A6AC"/>
  <rect x="8"  y="16" width="8" height="8" fill="#5C5C62"/>
  <rect x="16" y="16" width="8" height="8" fill="#2F2F35"/>
  <polygon points="24,24 32,28 24,32" fill="#FF6B35"/>
</svg>
`;

test('brand readiness gate passes the real Greybox packet with external blockers explicit', () => {
  const report = validateBrandReadiness(process.cwd());

  assert.equal(report.status, 'pass');
  assert.equal(report.errors.length, 0);
  assert.deepEqual(report.externalBlockers, [
    'trademark counsel clearance',
    'US/EU/India trademark filings',
    'domain purchase',
    'GitHub organization creation',
  ]);
});

test('brand readiness markdown is founder-readable', () => {
  const markdown = formatBrandReadinessMarkdown(validateBrandReadiness(process.cwd()));

  assert.match(markdown, /# Greybox Brand Readiness Gate/u);
  assert.match(markdown, /Status: pass/u);
  assert.match(markdown, /trademark counsel clearance/u);
  assert.doesNotMatch(markdown, /API_KEY|SECRET|TOKEN/u);
});

test('brand readiness constants cover the brief requirements', () => {
  assert.deepEqual(BRAND_NAMES, ['Greybox', 'Pillar', 'Preplay', 'Loopforge', 'Mechanic']);
  assert.deepEqual(REQUIRED_TLDS, ['.studio', '.gg', '.ai', '.com']);
  assert.ok(OFFICIAL_TRADEMARK_SOURCES.some((source) => source.includes('uspto.gov')));
  assert.ok(OFFICIAL_TRADEMARK_SOURCES.some((source) => source.includes('euipo.europa.eu')));
  assert.ok(OFFICIAL_TRADEMARK_SOURCES.some((source) => source.includes('ipindia.gov.in')));
  assert.deepEqual(REQUIRED_REPOS, [
    'greybox-pro',
    'greybox-unity-plugin',
    'greybox-unreal-plugin',
    'greybox-godot-plugin',
    'greybox-cloud',
    'greybox-marketplace',
    'greybox-brand',
    'greybox-playtest',
  ]);
  assert.ok(TRADEMARK_HYGIENE_FILES.includes('docs/distribution/partner-readiness-packet.md'));
  assert.ok(TRADEMARK_HYGIENE_FILES.includes('docs/distribution/marketplace-submission-packet.md'));
});

test('brand readiness gate catches missing filings, repos, domains, and logo outputs', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-brand-readiness-'));
  mkdirSync(join(temp, 'docs/brand'), { recursive: true });
  mkdirSync(join(temp, 'logo'), { recursive: true });
  mkdirSync(join(temp, 'dist/css'), { recursive: true });
  writeFileSync(join(temp, 'BRAND.md'), 'AI-assisted but incomplete.');
  writeFileSync(join(temp, 'docs/brand/naming-memo.md'), 'Chosen name: Greybox');
  writeFileSync(join(temp, 'docs/brand/trademark-filing-packet.md'), 'not filed');
  writeFileSync(join(temp, 'docs/brand/domain-github-readiness.md'), 'founder credentials');

  const report = validateBrandReadiness(temp);

  assert.equal(report.status, 'fail');
  assert.ok(report.errors.some((error) => error.includes('logo/mark.svg')));
  assert.ok(report.errors.some((error) => error.includes('dist/figma/tokens.json')));
  assert.ok(report.errors.some((error) => error.includes('Nice Class 9')));
  assert.ok(report.errors.some((error) => error.includes('greybox-pro')));
  assert.ok(report.errors.some((error) => error.includes('.studio')));
  assert.ok(report.errors.some((error) => error.includes('uspto.gov')));
});

test('brand readiness gate rejects mark geometry drift', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-brand-mark-'));
  writePassingBrandPacket(temp, VALID_MARK_SVG.replace('#FF6B35', '#FF6B36'));

  const report = validateBrandReadiness(temp);

  assert.equal(report.status, 'fail');
  assert.ok(report.errors.some((error) => error.includes('Spark Orange play triangle')));
  assert.ok(report.errors.every((error) => !error.includes('brand hygiene violation')));
});

test('brand readiness gate rejects genericide, verb use, and unqualified AI-generated copy', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-brand-hygiene-'));
  writePassingBrandPacket(temp);
  writeFileSync(
    join(temp, 'docs/distribution/partner-readiness-packet.md'),
    '90-minute lesson: greybox a boss arena.\nAI-generated game design for shipped games.',
  );

  const report = validateBrandReadiness(temp);

  assert.equal(report.status, 'fail');
  assert.ok(report.errors.some((error) => error.includes('brand hygiene violation')));
  assert.ok(report.errors.some((error) => error.includes('partner-readiness-packet.md:1')));
  assert.ok(report.errors.some((error) => error.includes('AI-assisted')));
});

function writePassingBrandPacket(root, markSvg = VALID_MARK_SVG) {
  mkdirSync(join(root, 'docs/brand'), { recursive: true });
  mkdirSync(join(root, 'docs/distribution'), { recursive: true });
  mkdirSync(join(root, 'logo'), { recursive: true });
  mkdirSync(join(root, 'dist/css'), { recursive: true });
  mkdirSync(join(root, 'dist/tailwind'), { recursive: true });
  mkdirSync(join(root, 'dist/figma'), { recursive: true });
  mkdirSync(join(root, 'dist/unity'), { recursive: true });
  mkdirSync(join(root, 'dist/unreal'), { recursive: true });
  for (const file of [
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
    'dist/css/tokens.css',
    'dist/tailwind/tokens.js',
    'dist/figma/tokens.json',
    'dist/unity/GreyboxTokens.cs',
    'dist/unreal/GreyboxTokens.uasset',
  ]) {
    writeFileSync(join(root, file), file === 'logo/mark.svg' ? markSvg : '');
  }
  writeFileSync(join(root, 'README.md'), 'Greybox brand packet.');
  writeFileSync(
    join(root, 'BRAND.md'),
    [
      'AI-assisted',
      'Use Greybox as a product name or adjective, never as a verb or generic noun.',
      '<meta name="generator" content="Greybox + <designer-name>">',
      'Minimum mark size: 16px',
      'Never recolor the Spark Orange play triangle',
      'Never separate the mark from the wordmark',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'docs/brand/naming-memo.md'),
    [
      'Chosen name: Greybox',
      'provisionally selected',
      'fallback',
      'not legal advice',
      'Nice Class 9',
      'Nice Class 42',
      'Nice Class 41',
      'greybox-studio',
      ...OFFICIAL_TRADEMARK_SOURCES,
      ...BRAND_NAMES,
      ...REQUIRED_TLDS,
      ...REQUIRED_REPOS,
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'docs/brand/trademark-filing-packet.md'),
    [
      ...OFFICIAL_TRADEMARK_SOURCES,
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
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'docs/brand/domain-github-readiness.md'),
    [
      'founder credentials',
      'DNS checked locally on 2026-05-18',
      'not registrar availability or ownership proof',
      'ICANN Lookup',
      'GitHub Organization',
      '@greybox-studio',
      'Naming Consistency Rule',
      ...BRAND_NAMES,
      ...REQUIRED_TLDS,
      ...REQUIRED_REPOS,
    ].join('\n'),
  );
  writeFileSync(join(root, 'docs/distribution/marketplace-submission-packet.md'), 'Marketplace copy uses Greybox correctly.');
  writeFileSync(join(root, 'docs/distribution/partner-readiness-packet.md'), 'Partner copy uses Greybox correctly.');
}

test('distribution readiness gate passes the real partner packet with external blockers explicit', () => {
  const report = validateDistributionReadiness(process.cwd());

  assert.equal(report.status, 'pass');
  assert.equal(report.errors.length, 0);
  assert.ok(report.externalBlockers.some((blocker) => blocker.includes('Unity Verified Solutions')));
  assert.ok(report.externalBlockers.some((blocker) => blocker.includes('Epic MegaGrant Cycle 2')));
  assert.ok(report.externalBlockers.some((blocker) => blocker.includes('Anthropic/OpenAI')));
});

test('distribution readiness markdown is founder-readable and avoids false claims', () => {
  const markdown = formatDistributionReadinessMarkdown(validateDistributionReadiness(process.cwd()));

  assert.match(markdown, /# Greybox Distribution Readiness Gate/u);
  assert.match(markdown, /Status: pass/u);
  assert.match(markdown, /Unity publisher credentials/u);
  assert.doesNotMatch(markdown, /API_KEY|SECRET|TOKEN/u);
});

test('distribution readiness constants cover official source-backed channels', () => {
  assert.deepEqual(DISTRIBUTION_DOCS, [
    'docs/distribution/marketplace-submission-packet.md',
    'docs/distribution/partner-readiness-packet.md',
  ]);
  for (const expected of [
    'assetstore.unity.com/publishing/submission-guidelines',
    'unity.com/partners/verified-solutions',
    'fab.com/en-US/become-a-publisher',
    'unrealengine.com/megagrants',
    'godotengine.org/asset-library/asset/submit',
    'fund.godotengine.org/corporate-sponsorship',
  ]) {
    assert.ok(OFFICIAL_DISTRIBUTION_SOURCES.some((source) => source.includes(expected)));
  }
});

test('distribution readiness gate catches missing official sources and no-claim language', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-distribution-readiness-'));
  mkdirSync(join(temp, 'docs/distribution'), { recursive: true });
  writeFileSync(join(temp, 'docs/distribution/marketplace-submission-packet.md'), 'Unity Asset Store');
  writeFileSync(join(temp, 'docs/distribution/partner-readiness-packet.md'), 'Epic MegaGrant');

  const report = validateDistributionReadiness(temp);

  assert.equal(report.status, 'fail');
  assert.ok(report.errors.some((error) => error.includes('assetstore.unity.com')));
  assert.ok(report.errors.some((error) => error.includes('No-Claim Rule')));
  assert.ok(report.errors.some((error) => error.includes('June 29, 2026')));
});
