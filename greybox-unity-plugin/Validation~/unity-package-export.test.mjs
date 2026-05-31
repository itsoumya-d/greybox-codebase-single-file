// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_UNITY_PACKAGE_MANIFEST,
  DEFAULT_UNITY_PACKAGE_OUTPUT,
  DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
  EXPORT_METHOD,
  createUnityPackageExportCommand,
  parseUnityPackageExportArgs,
  runUnityPackageExport,
} from './unity-package-export.mjs';

test('Unity package export args default to Asset Store handoff paths', () => {
  assert.deepEqual(parseUnityPackageExportArgs([]), {
    dryRun: false,
    manifest: DEFAULT_UNITY_PACKAGE_MANIFEST,
    output: DEFAULT_UNITY_PACKAGE_OUTPUT,
    projectPath: DEFAULT_UNITY_PACKAGE_PROJECT_PATH,
    root: '',
    skipIfMissing: false,
    unity: '',
    unityVersion: '2022.3.74f1',
  });
  assert.deepEqual(parseUnityPackageExportArgs([
    '--dry-run',
    '--skip-if-missing',
    '--unity',
    '/opt/unity/Editor/Unity',
    '--unity-version',
    '6000.0.58f1',
    '--project-path',
    '.tmp/export',
    '--output',
    'dist/greybox.unitypackage',
    '--manifest',
    'Validation~/artifacts/export.json',
  ]), {
    dryRun: true,
    manifest: 'Validation~/artifacts/export.json',
    output: 'dist/greybox.unitypackage',
    projectPath: '.tmp/export',
    root: '',
    skipIfMissing: true,
    unity: '/opt/unity/Editor/Unity',
    unityVersion: '6000.0.58f1',
  });
});

test('Unity package export command calls the real editor exporter method', () => {
  const command = createUnityPackageExportCommand({
    outputPath: '/tmp/out/com.greybox.studio.unitypackage',
    projectRoot: '/tmp/project',
    unity: '/Applications/Unity/Unity',
  });

  assert.deepEqual(command, [
    '/Applications/Unity/Unity',
    '-batchmode',
    '-quit',
    '-nographics',
    '-projectPath',
    '/tmp/project',
    '-executeMethod',
    EXPORT_METHOD,
    '-greyboxAssetStorePackageOutput',
    '/tmp/out/com.greybox.studio.unitypackage',
  ]);
});

test('Unity package export dry-run creates a package-linked smoke project and manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-package-export-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'com.greybox.studio',
      displayName: 'Greybox Studio',
      version: '1.0.0',
    }));
    const result = runUnityPackageExport({
      dryRun: true,
      now: new Date('2026-05-21T00:00:00.000Z'),
      packageRoot: root,
      projectPath: '.tmp/export',
      output: 'dist/com.greybox.studio.unitypackage',
      manifest: 'Validation~/artifacts/export.json',
      unity: '/opt/unity/Editor/Unity',
      unityVersion: '2022.3.74f1',
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.report.status, 'dry-run');
    assert.match(result.markdown, /Greybox Unity Asset Store Package Export/u);
    assert.match(result.report.commandWithEnvironment, /GREYBOX_ASSET_STORE_PACKAGE_OUTPUT/u);
    assert.match(result.report.commandWithEnvironment, /GreyboxAssetStorePackageExporter\.ExportFromCommandLine/u);
    assert.ok(existsSync(join(root, '.tmp/export/Packages/manifest.json')));
    assert.ok(existsSync(join(root, '.tmp/export/Assets/GreyboxSmoke/Editor/GreyboxImportSmoke.cs')));

    const manifest = JSON.parse(readFileSync(join(root, 'Validation~/artifacts/export.json'), 'utf8'));
    assert.equal(manifest.status, 'dry-run');
    assert.equal(manifest.packageName, 'com.greybox.studio');
    assert.equal(manifest.packageVersion, '1.0.0');
    assert.equal(manifest.outputPath, join(root, 'dist/com.greybox.studio.unitypackage'));
    assert.equal(manifest.packageRoot, root);
    assert.equal(manifest.projectRoot, join(root, '.tmp/export'));
    assert.equal(manifest.unity, '/opt/unity/Editor/Unity');
    assert.deepEqual(manifest.commandArgv, createUnityPackageExportCommand({
      outputPath: join(root, 'dist/com.greybox.studio.unitypackage'),
      projectRoot: join(root, '.tmp/export'),
      unity: '/opt/unity/Editor/Unity',
    }));
    assert.equal(manifest.command, result.report.command);
    assert.ok(manifest.command.includes('-executeMethod'));
    assert.ok(manifest.command.includes('Greybox.Editor.Export.GreyboxAssetStorePackageExporter.ExportFromCommandLine'));
    assert.ok(manifest.commandWithEnvironment.includes(`GREYBOX_ASSET_STORE_PACKAGE_OUTPUT='${join(root, 'dist/com.greybox.studio.unitypackage')}'`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Unity package export reports a blocked status when no editor is available', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-package-export-missing-'));
  try {
    const result = runUnityPackageExport({
      env: { GREYBOX_UNITY_SMOKE_DISABLE_DISCOVERY: '1' },
      manifest: 'Validation~/artifacts/export.json',
      packageRoot: root,
    });

    assert.equal(result.exitCode, 2);
    assert.equal(result.report.status, 'blocked');
    assert.match(result.report.reason, /Unity Editor was not found/u);
    assert.equal(JSON.parse(readFileSync(join(root, 'Validation~/artifacts/export.json'), 'utf8')).status, 'blocked');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
