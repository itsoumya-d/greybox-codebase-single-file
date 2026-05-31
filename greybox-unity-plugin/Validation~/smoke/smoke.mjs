#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
//
// End-to-end smoke for the Unity package handoff.
//
// Live mode (--daemon http://127.0.0.1:5174):
//   1. Verifies the daemon is reachable.
//   2. Submits Validation~/smoke/fixtures/sample-platformer.* as a GameProject.
//   3. Polls /projects/:id/unity-package until a ZIP is ready.
//   4. Downloads the ZIP, extracts it, and validates contents against
//      Validation~/smoke/expected-manifest.json.
//
// Dry-run mode (--dry-run, the default in CI):
//   Runs the same orchestration against an in-process mock daemon that emits
//   a deterministic ZIP using the fixtures already on disk. This gives CI a
//   passing smoke without an external daemon binary.
//
// Exits 0 on pass, 1 on any validation failure.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, 'fixtures');
const EXPECTED_MANIFEST_PATH = join(HERE, 'expected-manifest.json');
const DEFAULT_TIMEOUT_MS = 30000;
const PROJECT_BASE = '/api/v1/game-projects';

export function parseSmokeArgs(argv) {
  const options = {
    daemon: '',
    dryRun: false,
    fixtures: FIXTURE_DIR,
    keepArtifacts: false,
    manifest: EXPECTED_MANIFEST_PATH,
    output: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    token: process.env.GREYBOX_DAEMON_TOKEN ?? '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--daemon') options.daemon = argv[++index] ?? '';
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--fixtures') options.fixtures = argv[++index] ?? options.fixtures;
    else if (arg === '--keep-artifacts') options.keepArtifacts = true;
    else if (arg === '--manifest') options.manifest = argv[++index] ?? options.manifest;
    else if (arg === '--output') options.output = argv[++index] ?? '';
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index] ?? DEFAULT_TIMEOUT_MS);
    else if (arg === '--token') options.token = argv[++index] ?? '';
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.daemon && !options.dryRun) options.dryRun = true;
  return options;
}

function usage() {
  return [
    'Usage: node Validation~/smoke/smoke.mjs [options]',
    '',
    '  --daemon <base-url>       Live daemon to talk to (default falls back to --dry-run)',
    '  --dry-run                 Use in-process mock daemon (default when --daemon absent)',
    '  --fixtures <dir>          Override fixtures directory',
    '  --manifest <path>         Override expected manifest JSON',
    '  --output <path>           Write JSON smoke report to this path',
    '  --timeout-ms <number>     Poll/connect timeout (default 30000)',
    '  --token <bearer>          Bearer token for daemon (or $GREYBOX_DAEMON_TOKEN)',
    '  --keep-artifacts          Keep extracted zip on disk for inspection',
    '  --help                    Print this help and exit',
    '',
  ].join('\n');
}

export async function runSmoke(options) {
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.dryRun ? 'dry-run' : 'live',
    daemon: options.dryRun ? 'in-process mock' : options.daemon,
    fixtures: options.fixtures,
    expectedManifest: options.manifest,
    steps: [],
    status: 'pending',
  };

  const fixtures = loadFixtures(options.fixtures);
  report.steps.push({ id: 'load-fixtures', status: 'pass', detail: `loaded ${Object.keys(fixtures).length} fixture(s)` });

  const expected = JSON.parse(readFileSync(options.manifest, 'utf8'));
  report.steps.push({ id: 'load-expected-manifest', status: 'pass', detail: `${expected.entries.length} expected entries` });

  let server = null;
  let baseUrl = options.daemon;
  if (options.dryRun) {
    server = await startMockDaemon(fixtures, expected);
    baseUrl = server.url;
    report.steps.push({ id: 'start-mock-daemon', status: 'pass', detail: `listening on ${baseUrl}` });
  }

  try {
    await verifyDaemonReachable(baseUrl, options);
    report.steps.push({ id: 'verify-daemon-reachable', status: 'pass', detail: baseUrl });

    const projectId = await submitFixture(baseUrl, fixtures, options);
    report.steps.push({ id: 'submit-fixture', status: 'pass', detail: `projectId=${projectId}` });

    const zipUrl = await pollForPackage(baseUrl, projectId, options);
    report.steps.push({ id: 'poll-engine-package', status: 'pass', detail: zipUrl });

    const zipPath = await downloadZip(baseUrl, zipUrl, options);
    report.steps.push({ id: 'download-zip', status: 'pass', detail: zipPath });

    const extractRoot = mkdtempSync(join(tmpdir(), 'greybox-smoke-extract-'));
    const extracted = extractZip(zipPath, extractRoot);
    report.steps.push({ id: 'extract-zip', status: 'pass', detail: `extracted ${extracted.length} entries to ${extractRoot}` });

    const validation = validateAgainstExpected(extracted, extractRoot, expected);
    report.steps.push({
      id: 'validate-expected-manifest',
      status: validation.errors.length === 0 ? 'pass' : 'fail',
      detail: validation.errors.length === 0
        ? `${expected.entries.filter((entry) => entry.required).length} required entries verified`
        : validation.errors.join('; '),
    });

    if (!options.keepArtifacts) {
      try { rmrf(extractRoot); } catch { /* ignore */ }
    }

    report.status = validation.errors.length === 0 ? 'pass' : 'fail';
    report.errors = validation.errors;
  } catch (error) {
    report.status = 'fail';
    report.errors = [error instanceof Error ? error.message : String(error)];
    report.steps.push({ id: 'smoke', status: 'fail', detail: report.errors[0] });
  } finally {
    if (server) await server.close();
  }

  if (options.output) {
    mkdirSync(dirname(resolve(options.output)), { recursive: true });
    writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

function loadFixtures(dir) {
  const required = [
    'sample-platformer.gameview.json',
    'sample-platformer.design.md',
    'sample-platformer.gbhud.html',
    'sample-platformer.levelboard.json',
  ];
  const out = {};
  for (const name of required) {
    const path = join(dir, name);
    if (!existsSync(path)) throw new Error(`fixture missing: ${path}`);
    out[name] = readFileSync(path);
  }
  return out;
}

async function verifyDaemonReachable(baseUrl, options) {
  const response = await fetchWithTimeout(`${baseUrl}/health`, {
    headers: bearerHeaders(options),
  }, options.timeoutMs);
  if (!response.ok) throw new Error(`daemon /health returned ${response.status}`);
}

async function submitFixture(baseUrl, fixtures, options) {
  const body = {
    name: 'sample-platformer',
    engineTarget: 'Unity 2D',
    artifacts: {
      'sample-platformer.gameview': fixtures['sample-platformer.gameview.json'].toString('utf8'),
      'sample-platformer.design': fixtures['sample-platformer.design.md'].toString('utf8'),
      'sample-platformer.gbhud': fixtures['sample-platformer.gbhud.html'].toString('utf8'),
      'sample-platformer.levelboard': fixtures['sample-platformer.levelboard.json'].toString('utf8'),
    },
  };
  const response = await fetchWithTimeout(`${baseUrl}${PROJECT_BASE}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...bearerHeaders(options),
    },
    body: JSON.stringify(body),
  }, options.timeoutMs);
  if (!response.ok) throw new Error(`POST ${PROJECT_BASE} returned ${response.status}`);
  const payload = await response.json();
  if (!payload?.id) throw new Error('daemon did not return a project id');
  return payload.id;
}

async function pollForPackage(baseUrl, projectId, options) {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetchWithTimeout(
      `${baseUrl}${PROJECT_BASE}/${projectId}/unity-package`,
      { headers: bearerHeaders(options) },
      options.timeoutMs,
    );
    if (response.status === 200) {
      const payload = await response.json();
      if (payload?.zipUrl) return payload.zipUrl;
    }
    if (response.status >= 500) throw new Error(`unity-package endpoint returned ${response.status}`);
    await sleep(150);
  }
  throw new Error('timeout waiting for unity-package endpoint');
}

async function downloadZip(baseUrl, zipUrl, options) {
  const url = zipUrl.startsWith('http') ? zipUrl : `${baseUrl}${zipUrl}`;
  const response = await fetchWithTimeout(url, { headers: bearerHeaders(options) }, options.timeoutMs);
  if (!response.ok) throw new Error(`GET zip returned ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const path = join(mkdtempSync(join(tmpdir(), 'greybox-smoke-zip-')), 'unity-package.zip');
  writeFileSync(path, buffer);
  return path;
}

function extractZip(zipPath, destination) {
  const buffer = readFileSync(zipPath);
  const entries = parseZip(buffer);
  const written = [];
  for (const entry of entries) {
    if (entry.name.endsWith('/')) {
      mkdirSync(join(destination, entry.name), { recursive: true });
      continue;
    }
    if (entry.name.includes('..')) throw new Error(`unsafe zip entry: ${entry.name}`);
    const target = join(destination, entry.name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.data);
    written.push({ name: entry.name, bytes: entry.data.length });
  }
  return written;
}

function validateAgainstExpected(extracted, root, expected) {
  const errors = [];
  const paths = new Set(extracted.map((entry) => entry.name));

  for (const entry of expected.entries) {
    if (!paths.has(entry.path) && entry.required !== false) {
      errors.push(`missing required entry: ${entry.path}`);
    }
  }

  for (const banned of expected.expectedNoEntries ?? []) {
    for (const name of paths) {
      if (name.includes(banned)) errors.push(`zip leaked disallowed path '${banned}': ${name}`);
    }
  }

  const totalBytes = extracted.reduce((sum, entry) => sum + entry.bytes, 0);
  if (typeof expected.minSizeBytes === 'number' && totalBytes < expected.minSizeBytes) {
    errors.push(`extracted zip ${totalBytes} bytes is below minSizeBytes ${expected.minSizeBytes}`);
  }

  const manifestEntry = extracted.find((entry) => entry.name === 'manifest.json');
  if (manifestEntry) {
    try {
      const manifestJson = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
      const required = expected.manifestJsonAssertions ?? {};
      if (required.packageName && manifestJson.packageName !== required.packageName) {
        errors.push(`manifest.packageName ${manifestJson.packageName} !== ${required.packageName}`);
      }
      if (required.fixtureName && manifestJson.fixtureName !== required.fixtureName) {
        errors.push(`manifest.fixtureName ${manifestJson.fixtureName} !== ${required.fixtureName}`);
      }
      if (required.engineTarget && manifestJson.engineTarget !== required.engineTarget) {
        errors.push(`manifest.engineTarget ${manifestJson.engineTarget} !== ${required.engineTarget}`);
      }
      if (Array.isArray(required.actorIds)) {
        for (const actorId of required.actorIds) {
          if (!Array.isArray(manifestJson.actorIds) || !manifestJson.actorIds.includes(actorId)) {
            errors.push(`manifest.actorIds missing ${actorId}`);
          }
        }
      }
      if (Array.isArray(required.paletteTokens)) {
        for (const token of required.paletteTokens) {
          if (!Array.isArray(manifestJson.paletteTokens) || !manifestJson.paletteTokens.includes(token)) {
            errors.push(`manifest.paletteTokens missing ${token}`);
          }
        }
      }
    } catch (error) {
      errors.push(`manifest.json invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { errors };
}

// ---------- Mock daemon ----------

async function startMockDaemon(fixtures, expected) {
  const zip = buildDeterministicZip(fixtures, expected);
  let projectIdCounter = 0;
  const projects = new Map();

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      respond(res, 200, { ok: true, mode: 'mock' });
      return;
    }
    if (req.method === 'POST' && url.pathname === PROJECT_BASE) {
      collectBody(req).then((body) => {
        projectIdCounter += 1;
        const id = `mock-${projectIdCounter}`;
        try {
          JSON.parse(body || '{}');
        } catch {
          respond(res, 400, { error: 'invalid json body' });
          return;
        }
        projects.set(id, { ready: true });
        respond(res, 201, { id });
      });
      return;
    }
    const packageMatch = /^\/api\/v1\/game-projects\/([^/]+)\/unity-package$/.exec(url.pathname);
    if (req.method === 'GET' && packageMatch) {
      const id = packageMatch[1];
      if (!projects.has(id)) {
        respond(res, 404, { error: 'unknown project' });
        return;
      }
      respond(res, 200, { id, zipUrl: `/api/v1/game-projects/${id}/unity-package.zip` });
      return;
    }
    const zipMatch = /^\/api\/v1\/game-projects\/([^/]+)\/unity-package\.zip$/.exec(url.pathname);
    if (req.method === 'GET' && zipMatch) {
      const id = zipMatch[1];
      if (!projects.has(id)) {
        respond(res, 404, { error: 'unknown project' });
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': zip.length,
      });
      res.end(zip);
      return;
    }
    respond(res, 404, { error: 'not found' });
  });

  return await new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const url = `http://127.0.0.1:${address.port}`;
      resolveServer({
        url,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
      });
    });
  });
}

function respond(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(json),
  });
  res.end(json);
}

function collectBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- Deterministic ZIP builder ----------

function buildDeterministicZip(fixtures, expected) {
  const files = [];
  files.push(['package.json', Buffer.from(JSON.stringify({
    name: 'com.greybox.studio',
    version: '1.0.0',
    fixture: 'sample-platformer',
  }, null, 2))]);

  const manifestJson = {
    packageName: 'com.greybox.studio',
    fixtureName: 'sample-platformer',
    engineTarget: 'Unity 2D',
    actorIds: ['player_runner', 'slime_patrol'],
    paletteTokens: [
      'sky-night',
      'platform-stone',
      'coin-gold',
      'spike-warning',
      'player-suit',
      'slime-mint',
    ],
    importedAssets: expected.entries.filter((entry) => entry.required).map((entry) => ({
      path: entry.path,
      kind: entry.kind,
    })),
  };
  files.push(['manifest.json', Buffer.from(JSON.stringify(manifestJson, null, 2))]);

  const importRoot = 'Assets/Greybox/Imported/sample-platformer';
  files.push([`${importRoot}/sample-platformer.gameview`, fixtures['sample-platformer.gameview.json']]);
  files.push([`${importRoot}/sample-platformer.design`, fixtures['sample-platformer.design.md']]);
  files.push([`${importRoot}/sample-platformer.gbhud`, fixtures['sample-platformer.gbhud.html']]);
  files.push([`${importRoot}/sample-platformer.levelboard`, fixtures['sample-platformer.levelboard.json']]);

  for (const actorId of manifestJson.actorIds) {
    files.push([
      `${importRoot}/Prefabs/${actorId}.prefab`,
      Buffer.from(`%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!1 &1\nGameObject:\n  m_Name: ${actorId}\n  greybox-marker: ${actorId}\n`),
    ]);
  }

  for (const token of manifestJson.paletteTokens) {
    files.push([
      `${importRoot}/Palette/${token}.mat`,
      Buffer.from(`%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!21 &2100000\nMaterial:\n  m_Name: ${token}\n`),
    ]);
  }

  files.push([
    `${importRoot}/Palette/GreyboxPalette.asset`,
    Buffer.from(`%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!114 &11400000\nMonoBehaviour:\n  greybox-palette: sample-platformer\n`),
  ]);

  files.push([
    `${importRoot}/HUD/GreyboxHud.prefab`,
    Buffer.from(`%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!1 &1\nGameObject:\n  m_Name: GreyboxHud\n`),
  ]);

  return packZip(files);
}

function packZip(files) {
  // Minimal store-only (method 0) ZIP. Each file is uncompressed; this keeps
  // the implementation tiny and removes any dependency on Node's gzip
  // permutations. The CRC and offsets are computed exactly per the ZIP spec.
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);                       // version needed
    local.writeUInt16LE(0, 6);                        // flags
    local.writeUInt16LE(0, 8);                        // method (0 = store)
    local.writeUInt16LE(0, 10);                       // mod time
    local.writeUInt16LE(0x21, 12);                    // mod date (deterministic)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);                       // extra length
    nameBytes.copy(local, 30);

    localChunks.push(local, data);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);                     // version made by
    central.writeUInt16LE(20, 6);                     // version needed
    central.writeUInt16LE(0, 8);                      // flags
    central.writeUInt16LE(0, 10);                     // method
    central.writeUInt16LE(0, 12);                     // mod time
    central.writeUInt16LE(0x21, 14);                  // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);                     // extra
    central.writeUInt16LE(0, 32);                     // comment
    central.writeUInt16LE(0, 34);                     // disk
    central.writeUInt16LE(0, 36);                     // internal attrs
    central.writeUInt32LE(0, 38);                     // external attrs
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centralChunks.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const centralStart = offset;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...centralChunks, end]);
}

// ---------- ZIP reader for the extract step ----------

function parseZip(buffer) {
  // Locate end-of-central-directory record.
  let endOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      endOffset = i;
      break;
    }
  }
  if (endOffset < 0) throw new Error('not a zip file: missing EOCD');

  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralStart = buffer.readUInt32LE(endOffset + 16);

  const entries = [];
  let cursor = centralStart;
  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`corrupt central directory entry ${index}`);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.slice(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`corrupt local header for ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const rawData = buffer.slice(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) {
      data = Buffer.from(rawData);
      if (data.length !== uncompressedSize) throw new Error(`size mismatch on ${name}`);
    } else if (method === 8) {
      // Reserved for future daemon use; current mock daemon stores entries
      // uncompressed so this branch is only exercised by external daemons.
      throw new Error(`deflate method not supported in smoke mock for ${name}`);
    } else {
      throw new Error(`unsupported zip method ${method} on ${name}`);
    }
    entries.push({ name, data });
  }

  // Sanity assertion - the central directory size should match the cursor we
  // advanced past it.
  if (cursor !== centralStart + centralSize) {
    throw new Error('central directory size mismatch');
  }

  return entries;
}

// ---------- Utilities ----------

function bearerHeaders(options) {
  return options.token ? { authorization: `Bearer ${options.token}` } : {};
}

async function fetchWithTimeout(url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function crc32(buffer) {
  if (!crc32.table) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = crc32.table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function rmrf(target) {
  const stat = statSync(target);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(target)) rmrf(join(target, entry));
    rmdirSync(target);
  } else {
    unlinkSync(target);
  }
}

async function main() {
  try {
    const options = parseSmokeArgs(process.argv.slice(2));
    const report = await runSmoke(options);
    process.stdout.write(`SMOKE ${report.status.toUpperCase()} mode=${report.mode} daemon=${report.daemon}\n`);
    for (const step of report.steps) {
      process.stdout.write(`  ${step.status === 'pass' ? '+' : 'x'} ${step.id}: ${step.detail}\n`);
    }
    if (Array.isArray(report.errors) && report.errors.length > 0) {
      for (const error of report.errors) process.stderr.write(`ERROR ${error}\n`);
    }
    process.exitCode = report.status === 'pass' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
