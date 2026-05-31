// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  extractChangelogSection,
  formatReleaseNotes,
  parseReleaseTag,
  validateReleaseWorkflowPolicy,
  verifyPackageVersionMatchesTag,
} from './release-workflow-policy.mjs';

test('parseReleaseTag accepts stable and prerelease v-prefixed semver tags', () => {
  assert.deepEqual(parseReleaseTag('v1.2.3'), {
    ref: 'v1.2.3',
    version: '1.2.3',
    prerelease: false,
  });
  assert.deepEqual(parseReleaseTag('v1.2.3-alpha.4'), {
    ref: 'v1.2.3-alpha.4',
    version: '1.2.3-alpha.4',
    prerelease: true,
  });
  assert.throws(() => parseReleaseTag('1.2.3'), /vMAJOR/);
  assert.throws(() => parseReleaseTag('v1.2'), /vMAJOR/);
});

test('verifyPackageVersionMatchesTag fails closed on mismatched package version', () => {
  assert.equal(
    verifyPackageVersionMatchesTag('{"version":"0.1.0-alpha.1"}', 'v0.1.0-alpha.1').version,
    '0.1.0-alpha.1',
  );
  assert.throws(
    () => verifyPackageVersionMatchesTag('{"version":"0.1.0-alpha.1"}', 'v0.1.0'),
    /does not match package\.json version/,
  );
});

test('extractChangelogSection supports plain and bracketed version headings', () => {
  assert.equal(
    extractChangelogSection('# Changelog\n\n## 1.0.0\n\n- Stable\n\n## 0.9.0\n\n- Old\n', '1.0.0'),
    '- Stable',
  );
  assert.equal(
    extractChangelogSection('# Changelog\n\n## [1.1.0]\n\n- Bracketed\n', '1.1.0'),
    '- Bracketed',
  );
  assert.throws(
    () => extractChangelogSection('# Changelog\n\n## 0.9.0\n\n- Old\n', '1.0.0'),
    /non-empty release notes/,
  );
});

test('formatReleaseNotes includes changelog body and deterministic artifact list', () => {
  const notes = formatReleaseNotes({
    ref: 'v0.1.0-alpha.1',
    version: '0.1.0-alpha.1',
    changelogText: '# Changelog\n\n## 0.1.0-alpha.1\n\n- Alpha package\n',
  });

  assert.match(notes, /- Alpha package/);
  assert.match(notes, /com\.greybox\.studio-v0\.1\.0-alpha\.1\.tgz/);
  assert.match(notes, /com\.greybox\.studio\.unitypackage/);
  assert.match(notes, /unitypackage-export\.json/);
  assert.match(notes, /stable-release-candidate\.json/);
  assert.match(notes, /SHA256SUMS-v0\.1\.0-alpha\.1\.txt/);
  assert.match(notes, /stable-candidate gates pass/);
});

test('CLI writes GitHub outputs and release notes', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-release-policy-'));
  const script = join(dirname(fileURLToPath(import.meta.url)), 'release-workflow-policy.mjs');
  const workflowPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows', 'release.yml');
  const outputPath = join(root, 'github-output.txt');
  const notesPath = join(root, 'notes.md');
  writeFileSync(join(root, 'package.json'), '{"version":"0.1.0-alpha.1"}\n');
  writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## 0.1.0-alpha.1\n\n- CLI notes\n');

  execFileSync(process.execPath, [
    script,
    'version',
    '--tag',
    'v0.1.0-alpha.1',
    '--package',
    join(root, 'package.json'),
    '--github-output',
    outputPath,
  ]);
  execFileSync(process.execPath, [
    script,
    'notes',
    '--tag',
    'v0.1.0-alpha.1',
    '--changelog',
    join(root, 'CHANGELOG.md'),
    '--output',
    notesPath,
  ]);
  const workflow = execFileSync(process.execPath, [
    script,
    'workflow',
    '--workflow',
    workflowPath,
  ], { encoding: 'utf8' });

  assert.match(readFileSync(outputPath, 'utf8'), /version=0\.1\.0-alpha\.1/);
  assert.match(readFileSync(outputPath, 'utf8'), /prerelease=true/);
  assert.match(readFileSync(notesPath, 'utf8'), /CLI notes/);
  assert.match(workflow, /PASS release workflow policy/);

  const mismatch = spawnSync(process.execPath, [
    script,
    'version',
    '--tag',
    'v0.1.0',
    '--package',
    join(root, 'package.json'),
  ], { encoding: 'utf8' });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /does not match package\.json version/);
});

test('validateReleaseWorkflowPolicy accepts the checked-in stable release workflow', () => {
  const workflowPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows', 'release.yml');
  const report = validateReleaseWorkflowPolicy(readFileSync(workflowPath, 'utf8'));

  assert.equal(report.status, 'pass');
  assert.deepEqual(report.errors, []);
});

test('validateReleaseWorkflowPolicy fails closed when stable release gates are weakened', () => {
  const workflowPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows', 'release.yml');
  const workflow = readFileSync(workflowPath, 'utf8')
    .replace('--require-unity', '--skip-unity')
    .replace('dist/com.greybox.studio.unitypackage', 'dist/forged-upm-renamed.unitypackage');
  const report = validateReleaseWorkflowPolicy(workflow);

  assert.equal(report.status, 'fail');
  assert.ok(report.errors.includes('stable release readiness must require Unity editor smoke/export evidence'));
  assert.ok(report.errors.includes('stable release must upload the Asset Store .unitypackage'));
});
