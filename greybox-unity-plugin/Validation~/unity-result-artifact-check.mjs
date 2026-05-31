#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPassingResults } from './unity-import-smoke.mjs';

export function parseResultArtifactArgs(argv) {
  const options = {
    editModeRoots: [],
    playModeRoots: [],
    projectVersionFiles: [],
    unityVersion: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--editmode-root') options.editModeRoots.push(argv[++index] ?? '');
    else if (arg === '--playmode-root') options.playModeRoots.push(argv[++index] ?? '');
    else if (arg === '--project-version-file') options.projectVersionFiles.push(argv[++index] ?? '');
    else if (arg === '--unity-version') options.unityVersion = argv[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function findPassingUnityResult({ roots, label }) {
  const candidates = findXmlFiles(roots);
  for (const candidate of candidates) {
    if (withSilencedValidationErrors(() => assertPassingResults(candidate, label))) {
      return {
        ok: true,
        file: candidate,
        scanned: candidates.length,
      };
    }
  }
  return {
    ok: false,
    file: '',
    scanned: candidates.length,
  };
}

export function rootsContainUnityVersion({ roots, unityVersion }) {
  const expected = String(unityVersion ?? '').trim();
  if (!expected) return true;
  return roots
    .map((root) => String(root ?? '').trim())
    .filter(Boolean)
    .some((root) => root.includes(expected));
}

export function projectVersionFilesContainUnityVersion({ files, unityVersion }) {
  const expected = String(unityVersion ?? '').trim();
  if (!expected) return true;
  for (const file of files.map((value) => String(value ?? '').trim()).filter(Boolean)) {
    try {
      const text = readFileSync(resolve(file), 'utf8');
      if (text.includes(`m_EditorVersion: ${expected}`)) return true;
    } catch {
      // Try every supplied file before failing closed.
    }
  }
  return false;
}

function findXmlFiles(roots) {
  const files = [];
  const seen = new Set();
  for (const root of roots.map((value) => String(value ?? '').trim()).filter(Boolean)) {
    const absoluteRoot = resolve(root);
    if (!existsSync(absoluteRoot) || seen.has(absoluteRoot)) continue;
    seen.add(absoluteRoot);
    collectXmlFiles(absoluteRoot, files, 0);
  }
  return files.sort();
}

function withSilencedValidationErrors(callback) {
  const originalError = console.error;
  console.error = () => {};
  try {
    return callback();
  } finally {
    console.error = originalError;
  }
}

function collectXmlFiles(path, files, depth) {
  if (depth > 8) return;
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return;
  }
  if (stat.isFile()) {
    if (extname(path).toLowerCase() === '.xml') files.push(path);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(path)) {
    collectXmlFiles(join(path, entry), files, depth + 1);
  }
}

function main() {
  const options = parseResultArtifactArgs(process.argv.slice(2));
  const editModeVersionPinned = rootsContainUnityVersion({
    roots: options.editModeRoots,
    unityVersion: options.unityVersion,
  });
  const playModeVersionPinned = rootsContainUnityVersion({
    roots: options.playModeRoots,
    unityVersion: options.unityVersion,
  });
  const projectVersionPinned = projectVersionFilesContainUnityVersion({
    files: options.projectVersionFiles,
    unityVersion: options.unityVersion,
  });
  const editMode = findPassingUnityResult({
    roots: options.editModeRoots,
    label: 'Unity EditMode import smoke',
  });
  const playMode = findPassingUnityResult({
    roots: options.playModeRoots,
    label: 'Unity PlayMode gameplay smoke',
  });
  if (editMode.ok) {
    console.log(`PASS Unity EditMode artifact result XML: ${editMode.file} (${editMode.scanned} scanned)`);
  } else {
    console.error(`FAIL Unity EditMode artifact result XML was not found or did not satisfy Greybox smoke evidence (${editMode.scanned} scanned).`);
  }
  if (playMode.ok) {
    console.log(`PASS Unity PlayMode artifact result XML: ${playMode.file} (${playMode.scanned} scanned)`);
  } else {
    console.error(`FAIL Unity PlayMode artifact result XML was not found or did not satisfy Greybox smoke evidence (${playMode.scanned} scanned).`);
  }
  if (options.unityVersion) {
    if (editModeVersionPinned) {
      console.log(`PASS Unity EditMode artifact roots are pinned to ${options.unityVersion}`);
    } else {
      console.error(`FAIL Unity EditMode artifact roots must include expected Unity version ${options.unityVersion}.`);
    }
    if (playModeVersionPinned) {
      console.log(`PASS Unity PlayMode artifact roots are pinned to ${options.unityVersion}`);
    } else {
      console.error(`FAIL Unity PlayMode artifact roots must include expected Unity version ${options.unityVersion}.`);
    }
    if (projectVersionPinned) {
      console.log(`PASS Unity smoke ProjectVersion.txt is pinned to ${options.unityVersion}`);
    } else {
      console.error(`FAIL Unity smoke ProjectVersion.txt must include expected Unity version ${options.unityVersion}.`);
    }
  }
  if (!editMode.ok || !playMode.ok || !editModeVersionPinned || !playModeVersionPinned || !projectVersionPinned) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
