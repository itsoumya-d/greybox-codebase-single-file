#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { validatePackage } from './asset-store-metadata-check.mjs';

const PACKAGE_ROOT_PREFIX = 'package/';
const BLOCKED_SEGMENTS = new Set([
  '.git',
  '.github',
  '.idea',
  '.vs',
  'Build',
  'Builds',
  'dist',
  'Library',
  'Logs',
  'node_modules',
  'Obj',
  'Temp',
  'UserSettings',
  'Validation~',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.app',
  '.csproj',
  '.db',
  '.dll',
  '.dmg',
  '.env',
  '.exe',
  '.key',
  '.log',
  '.p12',
  '.pem',
  '.pfx',
  '.sln',
  '.sqlite',
  '.sqlite3',
  '.tgz',
  '.unitypackage',
  '.user',
  '.zip',
]);

const BLOCKED_NAME_PATTERNS = [
  /(?:^|[._-])api-?keys?(?:[._-]|$)/iu,
  /(?:^|[._-])credentials?(?:[._-]|$)/iu,
  /(?:^|[._-])customer-?exports?(?:[._-]|$)/iu,
  /(?:^|[._-])license-?keys?(?:[._-]|$)/iu,
  /(?:^|[._-])(?:portal|raw)[._-].*exports?(?:[._-]|$)/iu,
  /(?:^|[._-])portal-?exports?(?:[._-]|$)/iu,
  /(?:^|[._-])private-?keys?(?:[._-]|$)/iu,
  /(?:^|[._-])raw-?exports?(?:[._-]|$)/iu,
  /(?:^|[._-])secrets?(?:[._-]|$)/iu,
];

const REQUIRED_EVIDENCE = [
  {
    label: 'Package manifest',
    paths: ['package.json'],
  },
  {
    label: 'Legal and third-party notices',
    paths: ['LICENSE.md', 'LICENSE.proprietary', 'Third-Party Notices.txt'],
  },
  {
    label: 'Asset Store listing and changelog',
    paths: ['STORE_LISTING.md', 'ASSET_STORE_SUBMISSION.md', 'CHANGELOG.md'],
  },
  {
    label: 'Asset Store Unity package exporter',
    paths: ['Editor/Export/GreyboxAssetStorePackageExporter.cs'],
  },
  {
    label: 'Round-trip sync documentation',
    paths: ['Documentation~/round-trip-sync.md'],
  },
  {
    label: 'Editor/runtime assemblies',
    paths: ['Editor/Greybox.Editor.asmdef', 'Runtime/Greybox.Runtime.asmdef'],
  },
  {
    label: 'Unity Test Runner assemblies',
    paths: ['Tests/EditMode/Greybox.Editor.Tests.asmdef', 'Tests/PlayMode/Greybox.Runtime.Tests.asmdef'],
  },
  {
    label: 'MCP bridge implementation',
    paths: ['Editor/McpBridge/GreyboxMcpServer.cs', 'Editor/McpBridge/McpToolDefinitions.cs'],
  },
  {
    label: 'License and entitlement UI',
    paths: ['Editor/Windows/GreyboxLicenseWindow.cs', 'Editor/Windows/GreyboxLicenseState.cs'],
  },
  {
    label: '2D Platformer sample',
    paths: [
      'Samples~/2D Platformer/README.md',
      'Samples~/2D Platformer/platformer.gameview',
      'Samples~/2D Platformer/platformer.design',
      'Samples~/2D Platformer/platformer.gbhud',
      'Samples~/2D Platformer/platformer.levelboard',
      'Editor/Samples/Greybox2DPlatformerSampleBuilder.cs',
      'Runtime/GreyboxPlatformerSamplePlayer.cs',
      'Runtime/GreyboxPlatformerSampleRunReset.cs',
      'Runtime/GreyboxPlatformerSampleHazard.cs',
      'Runtime/GreyboxPlatformerSampleGoal.cs',
      'Tests/PlayMode/GreyboxPlatformerSamplePlayTests.cs',
    ],
  },
  {
    label: 'Top-Down Roguelike sample',
    paths: [
      'Samples~/Top-Down Roguelike/README.md',
      'Samples~/Top-Down Roguelike/roguelike.gameview',
      'Samples~/Top-Down Roguelike/roguelike.design',
      'Samples~/Top-Down Roguelike/roguelike.gbhud',
      'Samples~/Top-Down Roguelike/roguelike.levelboard',
    ],
  },
  {
    label: 'Mobile Idle sample',
    paths: [
      'Samples~/Mobile Idle/README.md',
      'Samples~/Mobile Idle/mobile-idle.gameview',
      'Samples~/Mobile Idle/mobile-idle.design',
      'Samples~/Mobile Idle/mobile-idle.gbhud',
      'Samples~/Mobile Idle/mobile-idle.levelboard',
    ],
  },
];

export function parsePackageArgs(argv) {
  const options = {
    dryRun: false,
    manifest: '',
    output: '',
    root: '',
    submission: false,
    summary: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--manifest') options.manifest = argv[++index] ?? '';
    else if (arg === '--output') options.output = argv[++index] ?? '';
    else if (arg === '--root') options.root = argv[++index] ?? '';
    else if (arg === '--submission') options.submission = true;
    else if (arg === '--summary') options.summary = argv[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function shouldPackFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('../') || normalized.startsWith('/')) return false;
  const parts = normalized.split('/');
  if (parts.some((part) => BLOCKED_SEGMENTS.has(part))) return false;
  if (parts.some((part) => part.startsWith('.') && part !== '.npmignore')) return false;
  if (parts.some((part) => isBlockedPackageName(part))) return false;
  if (BLOCKED_EXTENSIONS.has(extname(normalized).toLowerCase())) return false;
  return true;
}

export function shouldDescendDirectory(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('../') || normalized.startsWith('/')) return false;
  const parts = normalized.split('/');
  if (parts.some((part) => BLOCKED_SEGMENTS.has(part))) return false;
  if (parts.some((part) => part.startsWith('.'))) return false;
  if (parts.some((part) => isBlockedPackageName(part))) return false;
  return true;
}

export function listPackageFiles(root) {
  const files = [];
  function visit(dir) {
    for (const entry of sortedDirEntries(dir)) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (shouldDescendDirectory(rel)) visit(abs);
      } else if (entry.isFile() && shouldPackFile(rel)) {
        files.push(rel);
      }
    }
  }
  visit(root);
  return files.sort();
}

export function buildPackageManifest(root, files = listPackageFiles(root)) {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const entries = files.map((file) => {
    const bytes = readFileSync(join(root, file));
    return {
      path: file,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });
  return {
    packageName: packageJson.name,
    version: packageJson.version,
    generatedAt: new Date(0).toISOString(),
    rootPrefix: PACKAGE_ROOT_PREFIX,
    files: entries,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    sha256: createHash('sha256')
      .update(entries.map((entry) => `${entry.sha256}  ${entry.path}`).join('\n'))
      .digest('hex'),
  };
}

export function buildPackageSummary(manifest, {
  archive = null,
  warnings = [],
} = {}) {
  const paths = new Set(manifest.files.map((file) => file.path));
  const groups = new Map();
  for (const file of manifest.files) {
    const group = file.path.split('/')[0] || '.';
    const current = groups.get(group) ?? { files: 0, bytes: 0 };
    current.files += 1;
    current.bytes += file.bytes;
    groups.set(group, current);
  }
  return {
    packageName: manifest.packageName,
    version: manifest.version,
    rootPrefix: manifest.rootPrefix,
    totalFiles: manifest.files.length,
    totalBytes: manifest.totalBytes,
    sha256: manifest.sha256,
    archive,
    warnings: [...warnings],
    groups: [...groups.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    evidence: REQUIRED_EVIDENCE.map((item) => {
      const missing = item.paths.filter((path) => !paths.has(path));
      return {
        label: item.label,
        status: missing.length === 0 ? 'pass' : 'fail',
        files: item.paths.length,
        missing,
      };
    }),
    excludedByPolicy: [
      ...[...BLOCKED_SEGMENTS].sort().map((segment) => `${segment}/`),
      ...[...BLOCKED_EXTENSIONS].sort().map((extension) => `*${extension}`),
      'secret-like names: api-key, credentials, customer-export, license-key, portal-export, private-key, raw-export, secret',
    ],
  };
}

function isBlockedPackageName(name) {
  return BLOCKED_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export function formatPackageSummaryMarkdown(summary) {
  const lines = [
    '# Greybox Unity Package Summary',
    '',
    `Package: \`${summary.packageName}\``,
    `Version: \`${summary.version}\``,
    `Files: ${summary.totalFiles}`,
    `Bytes: ${summary.totalBytes}`,
    `Root prefix: \`${summary.rootPrefix}\``,
    `Manifest SHA-256: \`${summary.sha256}\``,
    `Archive: ${summary.archive ? `\`${summary.archive.path}\` (${summary.archive.bytes} bytes, SHA-256 \`${summary.archive.sha256}\`)` : 'dry run, archive not written'}`,
    '',
    '## Shipping Surface',
    '',
    '| Path group | Files | Bytes |',
    '| --- | ---: | ---: |',
  ];
  for (const group of summary.groups) {
    lines.push(`| \`${group.name}\` | ${group.files} | ${group.bytes} |`);
  }
  lines.push(
    '',
    '## Submission Evidence',
    '',
    '| Evidence | Status | Files | Missing |',
    '| --- | --- | ---: | --- |',
  );
  for (const item of summary.evidence) {
    const missing = item.missing.length === 0 ? '-' : item.missing.map((path) => `\`${path}\``).join(', ');
    lines.push(`| ${escapeTableCell(item.label)} | ${item.status} | ${item.files} | ${missing} |`);
  }
  lines.push(
    '',
    '## Excluded By Policy',
    '',
    summary.excludedByPolicy.map((item) => `\`${item}\``).join(', '),
    '',
    '## Validation Warnings',
    '',
  );
  if (summary.warnings.length === 0) {
    lines.push('- None.');
  } else {
    for (const warning of summary.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

export function createUnityPackageTarGz(root, files = listPackageFiles(root)) {
  const chunks = [];
  for (const file of files) {
    const data = readFileSync(join(root, file));
    chunks.push(createTarHeader(`${PACKAGE_ROOT_PREFIX}${file}`, data.length));
    chunks.push(data);
    const padding = data.length % 512 === 0 ? 0 : 512 - (data.length % 512);
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
}

export function buildUnityPackage(options = {}) {
  const packageRoot = resolve(options.root || join(dirname(fileURLToPath(import.meta.url)), '..'));
  const validation = validatePackage(packageRoot, { submission: Boolean(options.submission) });
  if (validation.errors.length > 0) {
    const error = new Error(`Package validation failed:\n${validation.errors.join('\n')}`);
    error.validation = validation;
    throw error;
  }

  const files = listPackageFiles(packageRoot);
  const manifest = buildPackageManifest(packageRoot, files);
  const output = resolve(packageRoot, options.output || `dist/${manifest.packageName}-${manifest.version}.tgz`);
  const manifestPath = resolve(packageRoot, options.manifest || `dist/${manifest.packageName}-${manifest.version}.manifest.json`);
  const summaryPath = options.summary ? resolve(packageRoot, options.summary) : '';
  const result = {
    dryRun: Boolean(options.dryRun),
    manifest,
    manifestPath,
    output,
    validation,
  };

  if (!options.dryRun) {
    mkdirSync(dirname(output), { recursive: true });
    const archive = createUnityPackageTarGz(packageRoot, files);
    writeFileSync(output, archive);
    result.archiveBytes = archive.length;
    result.archiveSha256 = createHash('sha256').update(archive).digest('hex');
  }
  mkdirSync(dirname(manifestPath), { recursive: true });
  const archive = options.dryRun ? null : {
    path: relative(packageRoot, output).replaceAll('\\', '/'),
    bytes: result.archiveBytes,
    sha256: result.archiveSha256,
  };
  writeFileSync(manifestPath, `${JSON.stringify({
    ...manifest,
    archive,
    warnings: validation.warnings,
  }, null, 2)}\n`);
  if (summaryPath) {
    const summary = buildPackageSummary(manifest, {
      archive,
      warnings: validation.warnings,
    });
    mkdirSync(dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath, formatPackageSummaryMarkdown(summary));
    result.summaryPath = summaryPath;
  }

  return result;
}

function createTarHeader(path, size) {
  const normalized = path.replaceAll('\\', '/');
  const buffer = Buffer.alloc(512, 0);
  const { name, prefix } = splitTarPath(normalized);
  writeString(buffer, name, 0, 100);
  writeOctal(buffer, 0o644, 100, 8);
  writeOctal(buffer, 0, 108, 8);
  writeOctal(buffer, 0, 116, 8);
  writeOctal(buffer, size, 124, 12);
  writeOctal(buffer, 0, 136, 12);
  buffer.fill(0x20, 148, 156);
  buffer[156] = '0'.charCodeAt(0);
  writeString(buffer, 'ustar', 257, 6);
  writeString(buffer, '00', 263, 2);
  writeString(buffer, 'greybox', 265, 32);
  writeString(buffer, 'greybox', 297, 32);
  writeString(buffer, prefix, 345, 155);

  let checksum = 0;
  for (const byte of buffer) checksum += byte;
  writeOctal(buffer, checksum, 148, 8);
  buffer[155] = 0x20;
  return buffer;
}

function splitTarPath(path) {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
  const parts = path.split('/');
  for (let index = 1; index < parts.length; index += 1) {
    const prefix = parts.slice(0, index).join('/');
    const name = parts.slice(index).join('/');
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  throw new Error(`Package path is too long for ustar: ${path}`);
}

function writeString(buffer, value, offset, length) {
  const bytes = Buffer.from(String(value), 'utf8');
  if (bytes.length > length) throw new Error(`tar field too long: ${value}`);
  bytes.copy(buffer, offset, 0, bytes.length);
}

function writeOctal(buffer, value, offset, length) {
  const text = Math.trunc(value).toString(8).padStart(length - 1, '0');
  writeString(buffer, text.slice(-(length - 1)), offset, length - 1);
  buffer[offset + length - 1] = 0;
}

function sortedDirEntries(dir) {
  if (!existsSync(dir)) return [];
  return [...readdirSync(dir, { withFileTypes: true })].sort((a, b) => a.name.localeCompare(b.name));
}

function escapeTableCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function main() {
  try {
    const options = parsePackageArgs(process.argv.slice(2));
    const result = buildUnityPackage(options);
    for (const warning of result.validation.warnings) process.stderr.write(`WARN ${warning}\n`);
    process.stdout.write(`${result.dryRun ? 'DRY_RUN' : 'PASS'} ${result.manifest.packageName}@${result.manifest.version} ${result.manifest.files.length} files ${result.manifest.totalBytes} bytes\n`);
    process.stdout.write(`MANIFEST ${result.manifestPath}\n`);
    if (result.summaryPath) process.stdout.write(`SUMMARY ${result.summaryPath}\n`);
    if (!result.dryRun) process.stdout.write(`ARCHIVE ${result.output} ${result.archiveSha256}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
