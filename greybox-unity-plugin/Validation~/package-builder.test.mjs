// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  buildPackageManifest,
  buildPackageSummary,
  buildUnityPackage,
  createUnityPackageTarGz,
  formatPackageSummaryMarkdown,
  listPackageFiles,
  parsePackageArgs,
  shouldDescendDirectory,
  shouldPackFile,
} from './package-builder.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('package builder args capture dry-run, manifest, output, and submission flags', () => {
  assert.deepEqual(parsePackageArgs([
    '--dry-run',
    '--submission',
    '--root',
    '/tmp/greybox-unity-plugin',
    '--output',
    'dist/package.tgz',
    '--manifest',
    'dist/package.manifest.json',
    '--summary',
    'dist/package.summary.md',
  ]), {
    dryRun: true,
    manifest: 'dist/package.manifest.json',
    output: 'dist/package.tgz',
    root: '/tmp/greybox-unity-plugin',
    submission: true,
    summary: 'dist/package.summary.md',
  });
});

test('package file filter excludes CI, validation, generated archives, and Unity build noise', () => {
  assert.equal(shouldPackFile('Editor/Importers/GameViewportImporter.cs'), true);
  assert.equal(shouldPackFile('Samples~/2D Platformer/platformer.gameview'), true);
  assert.equal(shouldPackFile('.github/workflows/unity-validation.yml'), false);
  assert.equal(shouldPackFile('Validation~/package-builder.mjs'), false);
  assert.equal(shouldPackFile('dist/com.greybox.studio.tgz'), false);
  assert.equal(shouldPackFile('Library/PackageCache/cache.bin'), false);
  assert.equal(shouldPackFile('Greybox.sln'), false);
  assert.equal(shouldPackFile('support/customer-export.json'), false);
  assert.equal(shouldPackFile('support/raw_portal_export.csv'), false);
  assert.equal(shouldPackFile('support/prod.env'), false);
  assert.equal(shouldPackFile('support/cloud-credentials.json'), false);
  assert.equal(shouldPackFile('support/signing-private-key.pem'), false);
  assert.equal(shouldPackFile('Editor/Windows/GreyboxLicenseState.cs'), true);
  assert.equal(shouldPackFile('Tests/EditMode/GreyboxLicenseStateTests.cs'), true);
  assert.equal(shouldDescendDirectory('Editor/Importers'), true);
  assert.equal(shouldDescendDirectory('.github/workflows'), false);
  assert.equal(shouldDescendDirectory('support/customer-export'), false);
  assert.equal(shouldDescendDirectory('support/secrets'), false);
});

test('package manifest for the real package includes shipping surfaces only', () => {
  const files = listPackageFiles(root);
  assert.ok(files.includes('package.json'));
  assert.ok(files.includes('Editor/Importers/GameViewportImporter.cs'));
  assert.ok(files.includes('Runtime/GreyboxArtifact.cs'));
  assert.ok(files.includes('Samples~/2D Platformer/platformer.gameview'));
  assert.ok(files.includes('Documentation~/round-trip-sync.md'));
  assert.ok(!files.some((file) => file.startsWith('Validation~/')));
  assert.ok(!files.some((file) => file.startsWith('.github/')));
  assert.ok(!files.some((file) => file.startsWith('dist/')));

  const manifest = buildPackageManifest(root, files);
  assert.equal(manifest.packageName, 'com.greybox.studio');
  assert.match(manifest.version, /^\d+\.\d+\.\d+/u);
  assert.equal(manifest.generatedAt, '1970-01-01T00:00:00.000Z');
  assert.ok(manifest.files.every((file) => /^[0-9a-f]{64}$/u.test(file.sha256)));
  assert.equal(manifest.totalBytes, manifest.files.reduce((sum, file) => sum + file.bytes, 0));
});

test('package summary is reviewer-readable and lists excluded policy surfaces', () => {
  const files = listPackageFiles(root);
  const manifest = buildPackageManifest(root, files);
  const summary = buildPackageSummary(manifest, {
    warnings: ['version is prerelease'],
  });
  const markdown = formatPackageSummaryMarkdown(summary);

  assert.equal(summary.packageName, 'com.greybox.studio');
  assert.ok(summary.groups.some((group) => group.name === 'Editor' && group.files > 0));
  assert.ok(summary.groups.some((group) => group.name === 'Runtime' && group.files > 0));
  assert.ok(summary.evidence.every((item) => item.status === 'pass'));
  assert.ok(summary.evidence.some((item) => item.label === 'MCP bridge implementation'));
  assert.ok(summary.evidence.some((item) => item.label === 'Unity Test Runner assemblies'));
  assert.ok(summary.excludedByPolicy.includes('Validation~/'));
  assert.ok(summary.excludedByPolicy.includes('.github/'));
  assert.ok(summary.excludedByPolicy.includes('*.pem'));
  assert.ok(summary.excludedByPolicy.some((item) => item.includes('secret-like names')));
  assert.match(markdown, /Greybox Unity Package Summary/u);
  assert.match(markdown, /\| `Editor` \|/u);
  assert.match(markdown, /Submission Evidence/u);
  assert.match(markdown, /\| MCP bridge implementation \| pass \| 2 \| - \|/u);
  assert.match(markdown, /version is prerelease/u);
  assert.doesNotMatch(markdown, /node_modules\/.*package\.json/u);
});

test('package summary marks missing submission evidence as failed', () => {
  const summary = buildPackageSummary({
    packageName: 'com.greybox.studio',
    version: '1.0.0',
    rootPrefix: 'package/',
    files: [
      { path: 'package.json', bytes: 10, sha256: 'a'.repeat(64) },
      { path: 'README.md', bytes: 10, sha256: 'b'.repeat(64) },
    ],
    totalBytes: 20,
    sha256: 'c'.repeat(64),
  });
  const legal = summary.evidence.find((item) => item.label === 'Legal and third-party notices');

  assert.equal(legal.status, 'fail');
  assert.deepEqual(legal.missing, ['LICENSE.md', 'LICENSE.proprietary', 'Third-Party Notices.txt']);
  assert.match(formatPackageSummaryMarkdown(summary), /\| Legal and third-party notices \| fail \| 3 \| `LICENSE\.md`, `LICENSE\.proprietary`, `Third-Party Notices\.txt` \|/u);
});

test('package archive generation is deterministic and rooted at package/', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-unity-pack-'));
  writeFileSync(join(temp, 'package.json'), '{"name":"com.greybox.studio","version":"0.0.0"}\n');
  mkdirSync(join(temp, 'Runtime'), { recursive: true });
  writeFileSync(join(temp, 'Runtime/GreyboxArtifact.cs'), 'namespace Greybox.Runtime {}\n');

  const files = listPackageFiles(temp);
  const first = createUnityPackageTarGz(temp, files);
  const second = createUnityPackageTarGz(temp, files);
  assert.equal(createHash('sha256').update(first).digest('hex'), createHash('sha256').update(second).digest('hex'));
  assert.match(gunzipSync(first).toString('utf8'), /package\/Runtime\/GreyboxArtifact\.cs/u);
});

test('dry-run package build validates the real package and writes a manifest', () => {
  const temp = mkdtempSync(join(tmpdir(), 'greybox-unity-pack-manifest-'));
  const manifestPath = join(temp, 'package.manifest.json');
  const summaryPath = join(temp, 'package.summary.md');
  const result = buildUnityPackage({
    dryRun: true,
    manifest: manifestPath,
    root,
    summary: summaryPath,
  });
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const summary = readFileSync(summaryPath, 'utf8');

  assert.equal(result.dryRun, true);
  assert.equal(result.validation.errors.length, 0);
  assert.equal(result.summaryPath, summaryPath);
  assert.equal(manifest.packageName, 'com.greybox.studio');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.archive, null);
  assert.ok(manifest.files.length > 20);
  assert.match(summary, /Archive: dry run, archive not written/u);
});
