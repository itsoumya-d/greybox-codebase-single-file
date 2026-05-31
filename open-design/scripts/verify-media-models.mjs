#!/usr/bin/env node
// Drift check for the shared media-generation model registry.
//
// The registry now lives in packages/contracts/src/media/models.ts. The web
// and daemon files are compatibility shims that must re-export that contract
// instead of carrying copied model arrays.
//
// Usage:
//   node scripts/verify-media-models.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'packages', 'contracts', 'src', 'media', 'models.ts');
const WEB_SHIM_PATH = path.join(ROOT, 'apps', 'web', 'src', 'media', 'models.ts');
const DAEMON_SHIM_PATH = path.join(ROOT, 'apps', 'daemon', 'src', 'media-models.ts');
const SHARED_EXPORT = '@ai-game-design-studio/contracts/media/models';

function fail(msg) {
  process.stderr.write(`verify-media-models: ${msg}\n`);
  process.exit(1);
}

function parseError(msg) {
  process.stderr.write(`verify-media-models: ${msg}\n`);
  process.exit(2);
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (err) {
    parseError(`could not read ${filePath}: ${err.message}`);
  }
}

function extractIds(source, name) {
  const re = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`, 'm');
  const match = source.match(re);
  if (!match) return null;
  const ids = [];
  const idRe = /\bid:\s*['"]([^'"]+)['"]/g;
  let id;
  while ((id = idRe.exec(match[1])) != null) ids.push(id[1]);
  return ids;
}

function extractAudioIds(source) {
  const match = source.match(/export const AUDIO_MODELS_BY_KIND[^=]*=\s*\{([\s\S]*?)\n\};/m);
  if (!match) return null;
  const out = {};
  for (const kind of ['music', 'speech', 'sfx']) {
    const kindMatch = match[1].match(new RegExp(`${kind}\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'm'));
    if (!kindMatch) return null;
    const ids = [];
    const idRe = /\bid:\s*['"]([^'"]+)['"]/g;
    let id;
    while ((id = idRe.exec(kindMatch[1])) != null) ids.push(id[1]);
    out[kind] = ids;
  }
  return out;
}

function extractNumberArray(source, name) {
  const match = source.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`, 'm'));
  if (!match) return null;
  return match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(Number)
    .filter((item) => Number.isFinite(item));
}

function dedupCheck(label, ids) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(`duplicate id "${id}" in ${label}`);
    seen.add(id);
  }
  if (ids.length === 0) fail(`${label} is empty`);
}

function requireShim(filePath) {
  const source = readText(filePath);
  if (!source.includes(SHARED_EXPORT)) {
    fail(`${path.relative(ROOT, filePath)} must re-export ${SHARED_EXPORT}`);
  }
  if (/export const (IMAGE_MODELS|VIDEO_MODELS|AUDIO_MODELS_BY_KIND)/.test(source)) {
    fail(`${path.relative(ROOT, filePath)} must not carry copied media model arrays`);
  }
}

const source = readText(CONTRACT_PATH);
const imageIds = extractIds(source, 'IMAGE_MODELS');
const videoIds = extractIds(source, 'VIDEO_MODELS');
const audioIds = extractAudioIds(source);
const lengths = extractNumberArray(source, 'VIDEO_LENGTHS_SEC');
const durations = extractNumberArray(source, 'AUDIO_DURATIONS_SEC');

if (!imageIds || !videoIds || !audioIds || !lengths || !durations) {
  parseError('failed to parse shared contracts media registry');
}

dedupCheck('IMAGE_MODELS', imageIds);
dedupCheck('VIDEO_MODELS', videoIds);
for (const kind of ['music', 'speech', 'sfx']) {
  dedupCheck(`AUDIO_MODELS_BY_KIND.${kind}`, audioIds[kind]);
}
if (lengths.length === 0) fail('VIDEO_LENGTHS_SEC is empty');
if (durations.length === 0) fail('AUDIO_DURATIONS_SEC is empty');

requireShim(WEB_SHIM_PATH);
requireShim(DAEMON_SHIM_PATH);

process.stdout.write('verify-media-models: OK (shared contracts registry + web/daemon shims)\n');
