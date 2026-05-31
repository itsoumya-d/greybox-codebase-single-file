// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  findPassingUnityResult,
  parseResultArtifactArgs,
  projectVersionFilesContainUnityVersion,
  rootsContainUnityVersion,
} from './unity-result-artifact-check.mjs';
import {
  requiredPackageTestAssemblies,
  requiredSmokeResultTests,
} from './unity-import-smoke.mjs';

test('Unity result artifact args collect EditMode and PlayMode roots', () => {
  assert.deepEqual(parseResultArtifactArgs([
    '--editmode-root',
    '/tmp/edit',
    '--playmode-root',
    '/tmp/play',
    '--editmode-root',
    '/tmp/edit-extra',
    '--project-version-file',
    '/tmp/project/ProjectSettings/ProjectVersion.txt',
    '--unity-version',
    '2022.3.74f1',
  ]), {
    editModeRoots: ['/tmp/edit', '/tmp/edit-extra'],
    playModeRoots: ['/tmp/play'],
    projectVersionFiles: ['/tmp/project/ProjectSettings/ProjectVersion.txt'],
    unityVersion: '2022.3.74f1',
  });
  assert.throws(() => parseResultArtifactArgs(['--unknown']), /Unknown argument/);
});

test('Unity result artifact scanner finds nested passing result XML', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-result-artifacts-'));
  const editRoot = join(root, 'edit');
  const playRoot = join(root, 'play', 'nested');
  mkdirSync(editRoot, { recursive: true });
  mkdirSync(playRoot, { recursive: true });
  writeFileSync(join(editRoot, 'failed.xml'), resultXml({
    assembly: 'Greybox.Editor.Tests',
    tests: ['EditorVersionMatchesReleaseTarget'],
    failed: true,
  }));
  writeFileSync(join(editRoot, 'passed.xml'), resultXml({
    assembly: 'Greybox.Editor.Tests',
    tests: requiredSmokeResultTests('Unity EditMode import smoke'),
  }));
  writeFileSync(join(playRoot, 'results.xml'), resultXml({
    assembly: 'Greybox.Runtime.Tests',
    tests: requiredSmokeResultTests('Unity PlayMode gameplay smoke'),
  }));

  const edit = findPassingUnityResult({
    roots: [editRoot],
    label: 'Unity EditMode import smoke',
  });
  const play = findPassingUnityResult({
    roots: [join(root, 'play')],
    label: 'Unity PlayMode gameplay smoke',
  });

  assert.equal(edit.ok, true);
  assert.equal(edit.scanned, 2);
  assert.match(edit.file, /passed\.xml$/u);
  assert.equal(play.ok, true);
  assert.equal(play.scanned, 1);
  assert.match(play.file, /results\.xml$/u);
});

test('Unity result artifact version guard requires a target-specific artifact root', () => {
  assert.equal(rootsContainUnityVersion({
    roots: ['/tmp/unity-smoke-artifacts-2022.3.74f1-editmode'],
    unityVersion: '2022.3.74f1',
  }), true);
  assert.equal(rootsContainUnityVersion({
    roots: ['/tmp/unity-smoke-artifacts-2023.2.20f1-editmode'],
    unityVersion: '2022.3.74f1',
  }), false);
  assert.equal(rootsContainUnityVersion({
    roots: ['/tmp/unity-smoke-artifacts-unpinned-editmode'],
    unityVersion: '',
  }), true);
});

test('Unity result artifact version guard checks generated ProjectVersion files', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-project-version-'));
  const projectVersion = join(root, 'ProjectSettings', 'ProjectVersion.txt');
  mkdirSync(dirname(projectVersion), { recursive: true });
  writeFileSync(projectVersion, 'm_EditorVersion: 2022.3.74f1\n');

  assert.equal(projectVersionFilesContainUnityVersion({
    files: [projectVersion],
    unityVersion: '2022.3.74f1',
  }), true);
  assert.equal(projectVersionFilesContainUnityVersion({
    files: [projectVersion],
    unityVersion: '2023.2.20f1',
  }), false);
  assert.equal(projectVersionFilesContainUnityVersion({
    files: [],
    unityVersion: '',
  }), true);
});

test('Unity result artifact CLI fails closed without passing XML', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-result-artifacts-cli-'));
  const script = join(dirname(fileURLToPath(import.meta.url)), 'unity-result-artifact-check.mjs');
  const editRoot = join(root, 'unity-smoke-artifacts-2022.3.74f1-editmode');
  const playRoot = join(root, 'unity-smoke-artifacts-2022.3.74f1-playmode');
  const projectVersion = join(root, 'project', 'ProjectSettings', 'ProjectVersion.txt');
  mkdirSync(editRoot, { recursive: true });
  mkdirSync(playRoot, { recursive: true });
  mkdirSync(dirname(projectVersion), { recursive: true });
  writeFileSync(projectVersion, 'm_EditorVersion: 2022.3.74f1\n');

  const missing = spawnSync(process.execPath, [
    script,
    '--editmode-root',
    editRoot,
    '--playmode-root',
    playRoot,
    '--project-version-file',
    projectVersion,
    '--unity-version',
    '2022.3.74f1',
  ], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /FAIL Unity EditMode artifact result XML/u);

  writeFileSync(join(editRoot, 'results.xml'), resultXml({
    assembly: 'Greybox.Editor.Tests',
    tests: requiredSmokeResultTests('Unity EditMode import smoke'),
  }));
  writeFileSync(join(playRoot, 'results.xml'), resultXml({
    assembly: 'Greybox.Runtime.Tests',
    tests: requiredSmokeResultTests('Unity PlayMode gameplay smoke'),
  }));
  const passing = execFileSync(process.execPath, [
    script,
    '--editmode-root',
    editRoot,
    '--playmode-root',
    playRoot,
    '--project-version-file',
    projectVersion,
    '--unity-version',
    '2022.3.74f1',
  ], { encoding: 'utf8' });
  assert.match(passing, /PASS Unity EditMode artifact result XML/u);
  assert.match(passing, /PASS Unity PlayMode artifact result XML/u);
  assert.match(passing, /PASS Unity EditMode artifact roots are pinned to 2022\.3\.74f1/u);
  assert.match(passing, /PASS Unity smoke ProjectVersion\.txt is pinned to 2022\.3\.74f1/u);
});

test('Unity result artifact CLI rejects cross-version result roots', () => {
  const root = mkdtempSync(join(tmpdir(), 'greybox-unity-result-artifacts-version-cli-'));
  const script = join(dirname(fileURLToPath(import.meta.url)), 'unity-result-artifact-check.mjs');
  const editRoot = join(root, 'unity-smoke-artifacts-2023.2.20f1-editmode');
  const playRoot = join(root, 'unity-smoke-artifacts-2023.2.20f1-playmode');
  const projectVersion = join(root, 'project', 'ProjectSettings', 'ProjectVersion.txt');
  mkdirSync(editRoot, { recursive: true });
  mkdirSync(playRoot, { recursive: true });
  mkdirSync(dirname(projectVersion), { recursive: true });
  writeFileSync(projectVersion, 'm_EditorVersion: 2023.2.20f1\n');
  writeFileSync(join(editRoot, 'results.xml'), resultXml({
    assembly: 'Greybox.Editor.Tests',
    tests: requiredSmokeResultTests('Unity EditMode import smoke'),
  }));
  writeFileSync(join(playRoot, 'results.xml'), resultXml({
    assembly: 'Greybox.Runtime.Tests',
    tests: requiredSmokeResultTests('Unity PlayMode gameplay smoke'),
  }));

  const result = spawnSync(process.execPath, [
    script,
    '--editmode-root',
    editRoot,
    '--playmode-root',
    playRoot,
    '--project-version-file',
    projectVersion,
    '--unity-version',
    '2022.3.74f1',
  ], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FAIL Unity EditMode artifact roots must include expected Unity version 2022\.3\.74f1/u);
  assert.match(result.stderr, /FAIL Unity smoke ProjectVersion\.txt must include expected Unity version 2022\.3\.74f1/u);
});

function resultXml({ assembly, failed = false, tests }) {
  const assemblyName = requiredPackageTestAssemblies(assembly.includes('Runtime') ? 'Unity PlayMode gameplay smoke' : 'Unity EditMode import smoke')[0];
  const suiteResult = failed ? 'Failed' : 'Passed';
  const testCases = tests.map((name) => `<test-case name="${name}" result="Passed" />`).join('');
  return `<test-run failed="${failed ? 1 : 0}" errors="0"><test-suite type="Assembly" name="${assemblyName}.dll" result="${suiteResult}" />${testCases}</test-run>`;
}
