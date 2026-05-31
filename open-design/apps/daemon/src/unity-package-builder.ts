// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

export interface UnityProEngineTarget {
  id: string;
  moduleId: string;
  moduleName: string;
  moduleVersion: string;
  fileName: string;
  digestSha256: string;
  body: string;
  title?: string;
  description?: string;
  entry?: string;
  mediaType?: string;
}

export interface UnityPackageBuildInput {
  projectId: string;
  projectName: string;
  projectRoot: string;
  proEngineTargets?: UnityProEngineTarget[];
  assetCacheRoot?: string;
  fetchAsset?: UnityRemoteAssetFetcher;
  generatedAt?: string;
  mtimeMs?: number;
}

export interface UnityPackageBuildResult {
  buffer: Buffer;
  fileName: string;
  assetCount: number;
  sha256: string;
}

interface UnityAssetFile {
  relPath: string;
  assetPath: string;
  bytes: Buffer;
  guid: string;
  manifestMetadata?: Record<string, unknown>;
}

interface UnityAssetResolveContext {
  projectRoot: string;
  projectId: string;
  assetCacheRoot: string;
  fetchAsset: UnityRemoteAssetFetcher;
}

export interface UnityRemoteAssetFetchResult {
  bytes: Buffer | Uint8Array | ArrayBuffer;
  contentType?: string;
}

export type UnityRemoteAssetFetcher = (url: string) => Promise<UnityRemoteAssetFetchResult>;

const UNITY_SOURCE_RE = /(?:^|\/)(DESIGN\.md|.+\.(?:gameview|levelboard|design|gbhud)|.+\.(?:gameview|levelboard)\.json|.+\.hud\.html)$/i;
const UNITY_IMPORTABLE_ASSET_RE = /\.(?:fbx|obj|glb|gltf|prefab|mat)$/i;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PACKAGE_FILES = 200;
const DEFAULT_GENERATED_AT = '1970-01-01T00:00:00.000Z';
const DEFAULT_PACKAGE_MTIME_MS = 0;
const UNITY_REMOTE_ASSET_HOST_RE = /^[A-Za-z0-9.-]+$/;
const IGNORED_DIRS = new Set(['node_modules', '.git', '.agds', '.greybox-sync']);
const ASSET_REFERENCE_FIELDS = [
  'assetSource',
  'assetFile',
  'assetUrl',
  'fbxSource',
  'fbxFile',
  'fbxUrl',
  'meshSource',
  'meshFile',
  'meshUrl',
  'prefabSource',
  'prefabFile',
  'prefabUrl',
  'materialSource',
  'materialFile',
  'materialUrl',
  'unityAssetSource',
  'unityAssetUrl',
  'unityAssetFile',
  'unityMaterialSource',
  'unityMaterialUrl',
  'unityMaterialFile',
] as const;

function safeSlug(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'greybox-project';
}

function unityGuid(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

function unityImporterRelPath(relPath: string): string {
  const normalized = relPath.split(path.sep).join('/');
  if (/\/?DESIGN\.md$/iu.test(normalized)) {
    const dir = path.posix.dirname(normalized);
    const stem = dir === '.' ? 'art-bible' : safeSlug(path.posix.basename(dir));
    return dir === '.' ? `${stem}.design` : `${dir}/${stem}.design`;
  }
  if (/\.gameview\.json$/iu.test(normalized)) return normalized.replace(/\.gameview\.json$/iu, '.gameview');
  if (/\.levelboard\.json$/iu.test(normalized)) return normalized.replace(/\.levelboard\.json$/iu, '.levelboard');
  if (/\.hud\.html$/iu.test(normalized)) return normalized.replace(/\.hud\.html$/iu, '.gbhud');
  return normalized;
}

async function withGreyboxSourceMetadata(
  context: UnityAssetResolveContext,
  relPath: string,
  importerRelPath: string,
  bytes: Buffer,
  importedAssets: Map<string, UnityAssetFile>,
): Promise<Buffer> {
  const normalizedRelPath = relPath.split(path.sep).join('/');
  if (/\.gameview\.json$/iu.test(normalizedRelPath) || /\.levelboard\.json$/iu.test(normalizedRelPath)) {
    try {
      const document = JSON.parse(bytes.toString('utf8')) as unknown;
      if (document && typeof document === 'object' && !Array.isArray(document)) {
        const rewritten = await rewriteUnityAssetReferences(context, normalizedRelPath, document, importedAssets);
        const rewrittenDocument = rewritten && typeof rewritten === 'object' && !Array.isArray(rewritten)
          ? rewritten as Record<string, unknown>
          : document as Record<string, unknown>;
        return Buffer.from(JSON.stringify({
          ...rewrittenDocument,
          __greyboxSourceFileName: normalizedRelPath,
        }, null, 2), 'utf8');
      }
    } catch {
      return bytes;
    }
  }

  if (/\.hud\.html$/iu.test(normalizedRelPath) && importerRelPath.endsWith('.gbhud')) {
    const html = bytes.toString('utf8');
    const meta = `<meta name="greybox-source-file" content="${escapeHtmlAttribute(normalizedRelPath)}">`;
    if (/<meta\b[^>]*\bname=["']greybox-source-file["']/iu.test(html)) return bytes;
    if (/<head\b[^>]*>/iu.test(html)) {
      return Buffer.from(html.replace(/<head\b[^>]*>/iu, (match) => `${match}\n${meta}`), 'utf8');
    }
    return Buffer.from(`${meta}\n${html}`, 'utf8');
  }

  return bytes;
}

async function rewriteUnityAssetReferences(
  context: UnityAssetResolveContext,
  sourceRelPath: string,
  value: unknown,
  importedAssets: Map<string, UnityAssetFile>,
): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => rewriteUnityAssetReferences(context, sourceRelPath, item, importedAssets)));
  }
  if (!value || typeof value !== 'object') return value;

  const record: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    record[key] = await rewriteUnityAssetReferences(context, sourceRelPath, child, importedAssets);
  }

  for (const field of ASSET_REFERENCE_FIELDS) {
    const source = record[field];
    if (typeof source !== 'string') continue;
    const imported = await resolveUnityImportedAsset(context, sourceRelPath, source, importedAssets);
    if (!imported) continue;
    const fieldName = field.toLowerCase();
    const outputField = imported.assetPath.endsWith('.prefab') || fieldName.includes('prefab')
      ? 'prefabAssetPath'
      : imported.assetPath.endsWith('.mat') || fieldName.includes('material')
        ? 'materialAssetPath'
        : 'meshAssetPath';
    const outputGuidField = outputField === 'materialAssetPath' ? 'materialAssetGuid' : 'unityAssetGuid';
    if (typeof record[outputField] !== 'string' || !record[outputField]) {
      record[outputField] = imported.assetPath;
    }
    if (typeof record[outputGuidField] !== 'string' || !record[outputGuidField]) {
      record[outputGuidField] = imported.guid;
    }
    const importedAssetRecord = {
      source,
      assetPath: imported.assetPath,
      guid: imported.guid,
      sha256: imported.manifestMetadata?.sha256,
    };
    const existingImportedAssets = Array.isArray(record.greyboxImportedAssets)
      ? record.greyboxImportedAssets.filter((item) => item && typeof item === 'object')
      : [];
    existingImportedAssets.push(importedAssetRecord);
    record.greyboxImportedAssets = existingImportedAssets;
    if (!record.greyboxImportedAsset) record.greyboxImportedAsset = importedAssetRecord;
  }

  return record;
}

async function resolveUnityImportedAsset(
  context: UnityAssetResolveContext,
  sourceRelPath: string,
  source: string,
  importedAssets: Map<string, UnityAssetFile>,
): Promise<UnityAssetFile | undefined> {
  const cleanSource = source.trim().replace(/\\/g, '/');
  if (isRemoteAssetUrl(cleanSource)) {
    return resolveRemoteUnityImportedAsset(context, cleanSource, importedAssets);
  }
  if (
    !cleanSource
    || cleanSource.includes('\0')
    || /^[a-z][a-z0-9+.-]*:/iu.test(cleanSource)
    || cleanSource.startsWith('/')
    || !UNITY_IMPORTABLE_ASSET_RE.test(cleanSource)
  ) {
    return undefined;
  }

  const candidates = [
    path.posix.normalize(path.posix.join(path.posix.dirname(sourceRelPath), cleanSource)),
    path.posix.normalize(cleanSource),
  ];
  for (const candidate of candidates) {
    if (!isSafeProjectRelPath(candidate)) continue;
    const fullPath = path.resolve(context.projectRoot, candidate);
    if (!isPathInside(context.projectRoot, fullPath)) continue;
    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch {
      continue;
    }
    if (!fileStat.isFile() || fileStat.size > MAX_FILE_BYTES) continue;
    const bytes = await readFile(fullPath);
    const fileName = safeSlug(path.posix.basename(candidate));
    return registerImportedAsset(context, candidate, bytes, fileName, importedAssets, 'project-file');
  }

  return undefined;
}

async function resolveRemoteUnityImportedAsset(
  context: UnityAssetResolveContext,
  sourceUrl: string,
  importedAssets: Map<string, UnityAssetFile>,
): Promise<UnityAssetFile | undefined> {
  const parsed = parseRemoteAssetUrl(sourceUrl);
  if (!parsed) return undefined;
  const fileName = safeSlug(path.posix.basename(parsed.pathname));
  const cached = await readCachedRemoteAsset(context, sourceUrl, fileName);
  if (cached) return registerImportedAsset(context, sourceUrl, cached.bytes, cached.fileName, importedAssets, 'remote-url');

  let fetched: UnityRemoteAssetFetchResult;
  try {
    fetched = await context.fetchAsset(sourceUrl);
  } catch {
    return undefined;
  }
  const bytes = Buffer.from(fetched.bytes instanceof ArrayBuffer ? new Uint8Array(fetched.bytes) : fetched.bytes);
  if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) return undefined;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeCachedRemoteAsset(context, sourceUrl, fileName, sha256, bytes);
  return registerImportedAsset(context, sourceUrl, bytes, fileName, importedAssets, 'remote-url');
}

function registerImportedAsset(
  context: UnityAssetResolveContext,
  source: string,
  bytes: Buffer,
  fileName: string,
  importedAssets: Map<string, UnityAssetFile>,
  sourceType: 'project-file' | 'remote-url',
): UnityAssetFile {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const assetPath = `Assets/Greybox/Imported/${sha256.slice(0, 12)}/${safeSlug(fileName)}`;
  const existing = importedAssets.get(assetPath);
  if (existing) return existing;
  const imported: UnityAssetFile = {
    relPath: source,
    assetPath,
    bytes,
    guid: unityGuid(`${context.projectId}:imported-asset:${sha256}:${source}`),
    manifestMetadata: {
      kind: 'unity-imported-asset',
      source,
      sourceType,
      sha256,
      bytes: bytes.length,
    },
  };
  importedAssets.set(assetPath, imported);
  return imported;
}

async function readCachedRemoteAsset(
  context: UnityAssetResolveContext,
  sourceUrl: string,
  fallbackFileName: string,
): Promise<{ bytes: Buffer; fileName: string } | undefined> {
  try {
    const indexPath = remoteAssetIndexPath(context.assetCacheRoot, sourceUrl);
    const index = JSON.parse(await readFile(indexPath, 'utf8')) as { sha256?: unknown; fileName?: unknown };
    if (typeof index.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(index.sha256)) return undefined;
    const fileName = typeof index.fileName === 'string' ? safeSlug(index.fileName) : fallbackFileName;
    const cachePath = remoteAssetCachePath(context.assetCacheRoot, index.sha256, fileName);
    const bytes = await readFile(cachePath);
    if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) return undefined;
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (actualSha256 !== index.sha256) return undefined;
    return { bytes, fileName };
  } catch {
    return undefined;
  }
}

async function writeCachedRemoteAsset(
  context: UnityAssetResolveContext,
  sourceUrl: string,
  fileName: string,
  sha256: string,
  bytes: Buffer,
): Promise<void> {
  const cachePath = remoteAssetCachePath(context.assetCacheRoot, sha256, fileName);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, bytes);
  const indexPath = remoteAssetIndexPath(context.assetCacheRoot, sourceUrl);
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify({ url: sourceUrl, sha256, fileName }, null, 2), 'utf8');
}

function remoteAssetIndexPath(cacheRoot: string, sourceUrl: string): string {
  return path.join(cacheRoot, 'url-index', `${createHash('sha256').update(sourceUrl).digest('hex')}.json`);
}

function remoteAssetCachePath(cacheRoot: string, sha256: string, fileName: string): string {
  return path.join(cacheRoot, 'content', sha256.slice(0, 2), sha256, safeSlug(fileName));
}

function isRemoteAssetUrl(value: string): boolean {
  return /^https:\/\//iu.test(value);
}

function parseRemoteAssetUrl(value: string): URL | undefined {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:') return undefined;
  if (!UNITY_REMOTE_ASSET_HOST_RE.test(parsed.hostname)) return undefined;
  if (isBlockedRemoteHost(parsed.hostname)) return undefined;
  if (!UNITY_IMPORTABLE_ASSET_RE.test(parsed.pathname)) return undefined;
  return parsed;
}

function isBlockedRemoteHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'metadata.google.internal') return true;
  if (/^(10|127|0)\./u.test(host)) return true;
  if (/^169\.254\./u.test(host)) return true;
  if (/^192\.168\./u.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./u);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

async function defaultFetchRemoteAsset(url: string): Promise<UnityRemoteAssetFetchResult> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Greybox remote Unity asset fetch failed with HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    throw new Error('Greybox remote Unity asset is larger than the 5MB package limit');
  }
  const contentType = response.headers.get('content-type') ?? undefined;
  return {
    bytes: await response.arrayBuffer(),
    ...(contentType ? { contentType } : {}),
  };
}

function isSafeProjectRelPath(value: string): boolean {
  if (!value || value.startsWith('../') || value === '..' || value.startsWith('/') || /^[A-Za-z]:/u.test(value)) return false;
  return value.split('/').every((part) => part && part !== '.' && part !== '..');
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function uniquifyImporterRelPath(relPath: string, sourceRelPath: string, used: Set<string>): string {
  if (!used.has(relPath)) {
    used.add(relPath);
    return relPath;
  }
  const extension = path.posix.extname(relPath);
  const stem = relPath.slice(0, relPath.length - extension.length);
  const suffix = unityGuid(sourceRelPath).slice(0, 8);
  const unique = `${stem}-${suffix}${extension}`;
  used.add(unique);
  return unique;
}

function safeProEngineTargets(input: UnityProEngineTarget[] | undefined): UnityProEngineTarget[] {
  if (!Array.isArray(input)) return [];
  return input.filter((target) => (
    typeof target.id === 'string' &&
    typeof target.moduleId === 'string' &&
    typeof target.moduleName === 'string' &&
    typeof target.moduleVersion === 'string' &&
    typeof target.fileName === 'string' &&
    typeof target.digestSha256 === 'string' &&
    typeof target.body === 'string' &&
    target.body.length <= MAX_FILE_BYTES
  ));
}

function normalizedGeneratedAt(value: string | undefined): string {
  if (!value) return DEFAULT_GENERATED_AT;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : DEFAULT_GENERATED_AT;
}

function assetContentRevision(assets: UnityAssetFile[]): string {
  const hash = createHash('sha256');
  for (const asset of [...assets].sort((a, b) => a.assetPath.localeCompare(b.assetPath))) {
    hash.update(asset.assetPath);
    hash.update('\0');
    hash.update(asset.guid);
    hash.update('\0');
    hash.update(createHash('sha256').update(asset.bytes).digest('hex'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function collectUnitySourceFiles(root: string, rel = '', out: string[] = []): Promise<string[]> {
  if (out.length >= MAX_PACKAGE_FILES) return out;
  const dir = path.join(root, rel);
  const entries = (await readdir(dir, { withFileTypes: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length >= MAX_PACKAGE_FILES) break;
    if (IGNORED_DIRS.has(entry.name)) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await collectUnitySourceFiles(root, childRel, out);
      continue;
    }
    if (entry.isFile() && UNITY_SOURCE_RE.test(childRel)) out.push(childRel);
  }
  return out;
}

async function buildAssetFiles(input: UnityPackageBuildInput): Promise<UnityAssetFile[]> {
  const projectSlug = safeSlug(input.projectName || input.projectId);
  const relFiles = await collectUnitySourceFiles(input.projectRoot);
  const assets: UnityAssetFile[] = [];
  const importedAssets = new Map<string, UnityAssetFile>();
  const usedImporterRelPaths = new Set<string>();
  const context: UnityAssetResolveContext = {
    projectRoot: input.projectRoot,
    projectId: input.projectId,
    assetCacheRoot: input.assetCacheRoot ?? path.join(input.projectRoot, '.greybox-sync', 'unity-asset-cache'),
    fetchAsset: input.fetchAsset ?? defaultFetchRemoteAsset,
  };
  for (const relPath of relFiles) {
    const fullPath = path.join(input.projectRoot, relPath);
    const fileStat = await stat(fullPath);
    if (fileStat.size > MAX_FILE_BYTES) continue;
    const bytes = await readFile(fullPath);
    const importerRelPath = uniquifyImporterRelPath(
      unityImporterRelPath(relPath),
      relPath,
      usedImporterRelPaths,
    );
    const assetBytes = await withGreyboxSourceMetadata(context, relPath, importerRelPath, bytes, importedAssets);
    const assetPath = `Assets/Greybox/Generated/${projectSlug}/${importerRelPath}`;
    assets.push({
      relPath,
      assetPath,
      bytes: assetBytes,
      guid: unityGuid(`${input.projectId}:${relPath}`),
    });
  }
  for (const asset of importedAssets.values()) assets.push(asset);
  for (const target of safeProEngineTargets(input.proEngineTargets)) {
    const moduleSlug = safeSlug(target.moduleId);
    const targetSlug = safeSlug(target.id);
    const relPath = `pro-modules/${moduleSlug}/${targetSlug}.engine-target.json`;
    const assetPath = `Assets/Greybox/Generated/${projectSlug}/ProModules/${moduleSlug}/${targetSlug}.engine-target.json`;
    const metadata = {
      kind: 'pro-engine-target',
      id: target.id,
      moduleId: target.moduleId,
      moduleName: target.moduleName,
      moduleVersion: target.moduleVersion,
      fileName: target.fileName,
      digestSha256: target.digestSha256,
      ...(target.title ? { title: target.title } : {}),
      ...(target.description ? { description: target.description } : {}),
      ...(target.entry ? { entry: target.entry } : {}),
      ...(target.mediaType ? { mediaType: target.mediaType } : {}),
    };
    assets.push({
      relPath,
      assetPath,
      bytes: Buffer.from(JSON.stringify({
        generator: 'Greybox',
        ...metadata,
        payload: target.body,
      }, null, 2), 'utf8'),
      guid: unityGuid(`${input.projectId}:${relPath}`),
      manifestMetadata: metadata,
    });
  }
  const contentRevisionSha256 = assetContentRevision(assets);
  const manifest = Buffer.from(JSON.stringify({
    generator: 'Greybox',
    projectId: input.projectId,
    projectName: input.projectName,
    generatedAt: normalizedGeneratedAt(input.generatedAt),
    contentRevisionSha256,
    assets: assets.map((asset) => ({ path: asset.assetPath, source: asset.relPath, guid: asset.guid })),
    importedAssets: assets
      .filter((asset) => asset.manifestMetadata?.kind === 'unity-imported-asset')
      .map((asset) => ({
        ...asset.manifestMetadata,
        path: asset.assetPath,
        guid: asset.guid,
      })),
    proEngineTargets: assets
      .filter((asset) => asset.manifestMetadata?.kind === 'pro-engine-target')
      .map((asset) => ({
        ...asset.manifestMetadata,
        path: asset.assetPath,
        guid: asset.guid,
      })),
  }, null, 2), 'utf8');
  assets.push({
    relPath: 'GreyboxProjectManifest.json',
    assetPath: `Assets/Greybox/Generated/${projectSlug}/GreyboxProjectManifest.json`,
    bytes: manifest,
    guid: unityGuid(`${input.projectId}:GreyboxProjectManifest.json`),
  });
  return assets;
}

function octal(value: number, width: number): Buffer {
  const text = value.toString(8).padStart(width - 1, '0') + '\0';
  return Buffer.from(text.slice(-width), 'ascii');
}

function splitTarName(name: string): { name: string; prefix: string } {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' };
  const parts = name.split('/');
  const file = parts.pop() ?? name;
  const prefix = parts.join('/');
  if (Buffer.byteLength(file) <= 100 && Buffer.byteLength(prefix) <= 155) return { name: file, prefix };
  throw new Error(`tar path too long: ${name}`);
}

function tarEntry(name: string, body: Buffer, mtime: number): Buffer {
  const header = Buffer.alloc(512, 0);
  const split = splitTarName(name);
  header.write(split.name, 0, 100, 'utf8');
  octal(0o100644, 8).copy(header, 100);
  octal(0, 8).copy(header, 108);
  octal(0, 8).copy(header, 116);
  octal(body.length, 12).copy(header, 124);
  octal(Math.floor(mtime / 1000), 12).copy(header, 136);
  Buffer.from('        ', 'ascii').copy(header, 148);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  if (split.prefix) header.write(split.prefix, 345, 155, 'utf8');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumText = checksum.toString(8).padStart(6, '0');
  header.write(checksumText, 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512, 0);
  return Buffer.concat([header, body, padding]);
}

function unityMeta(asset: UnityAssetFile): Buffer {
  const extension = path.extname(asset.assetPath).toLowerCase();
  if (extension === '.fbx' || extension === '.obj' || extension === '.glb' || extension === '.gltf') {
    return Buffer.from(`fileFormatVersion: 2
guid: ${asset.guid}
ModelImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`, 'utf8');
  }
  if (extension === '.prefab') {
    return Buffer.from(`fileFormatVersion: 2
guid: ${asset.guid}
PrefabImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`, 'utf8');
  }
  if (extension === '.mat') {
    return Buffer.from(`fileFormatVersion: 2
guid: ${asset.guid}
NativeFormatImporter:
  externalObjects: {}
  mainObjectFileID: 2100000
  userData:
  assetBundleName:
  assetBundleVariant:
`, 'utf8');
  }
  const importer = extension === '.cs' ? 'MonoImporter' : 'TextScriptImporter';
  return Buffer.from(`fileFormatVersion: 2
guid: ${asset.guid}
${importer}:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`, 'utf8');
}

function buildUnityTar(assets: UnityAssetFile[], mtimeMs: number): Buffer {
  const now = Number.isFinite(mtimeMs) ? mtimeMs : DEFAULT_PACKAGE_MTIME_MS;
  const entries: Buffer[] = [];
  for (const asset of assets) {
    const root = asset.guid;
    entries.push(tarEntry(`${root}/asset`, asset.bytes, now));
    entries.push(tarEntry(`${root}/asset.meta`, unityMeta(asset), now));
    entries.push(tarEntry(`${root}/pathname`, Buffer.from(asset.assetPath, 'utf8'), now));
  }
  entries.push(Buffer.alloc(1024, 0));
  return Buffer.concat(entries);
}

export async function buildUnityPackageFromProject(input: UnityPackageBuildInput): Promise<UnityPackageBuildResult> {
  const assets = await buildAssetFiles(input);
  const tar = buildUnityTar(assets, input.mtimeMs ?? DEFAULT_PACKAGE_MTIME_MS);
  const buffer = gzipSync(tar);
  return {
    buffer,
    fileName: `${safeSlug(input.projectName || input.projectId)}.unitypackage`,
    assetCount: assets.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}
