// SPDX-License-Identifier: Apache-2.0
/**
 * Design endpoints — canonical {@link GameProject} read/write for the
 * visual page-and-component editor (Stream 1).
 *
 * Layout choice: a `GameProject` is a single JSON document, stored as
 * `project.json` under the project's directory (the standard file location
 * used by every other artifact the studio knows about). This means:
 *
 *   - The file is visible / editable in the existing file panel for power users.
 *   - Existing project listing / archive / export tooling sees it for free.
 *   - We don't add a new on-disk format the daemon has to migrate.
 *
 * Server-side validation goes through `@greybox/schema`'s
 * `safeParseGameProject`, returning `400` with the first issue when the
 * client posts something invalid. We deliberately accept arbitrary nested
 * JSON — discriminated unions are sound only after a `safeParse` pass.
 *
 * Endpoints registered here:
 *   - GET  /api/projects/:id/design
 *   - PUT  /api/projects/:id/design
 *   - POST /api/projects/:id/design/export?engine=unity|unreal|godot
 *
 * The export endpoint builds an in-memory zip of:
 *   - `project.json` (the GameProject document)
 *   - `engine.json` (the per-engine slice of `exportPolicy`)
 *   - `README.txt` (humans land here when they unzip into Unity / Unreal / Godot)
 *
 * Engine-specific plugins (greybox-unity-plugin, etc.) live in sibling
 * repos and consume the same `project.json` directly. The export endpoint
 * just packages the bytes; it does not generate per-engine code.
 */
import path from 'node:path';

import JSZip from 'jszip';

import {
  ensureProject,
  isSafeId,
  readProjectFile,
  resolveProjectDir,
  writeProjectFile,
} from './projects.js';

/** Canonical filename written under the project directory. */
export const DESIGN_FILE = 'project.json';

/** Per-engine README so unzipped folders are self-explaining. */
const ENGINE_README: Record<string, string> = {
  unity:
    'Greybox export for Unity. Drop project.json into Assets/ and run the Greybox Unity Plugin > Import command.',
  unreal:
    'Greybox export for Unreal. Place project.json under Content/Greybox and run the Unreal plugin import.',
  godot:
    'Greybox export for Godot. Copy project.json into res://greybox and run the Godot plugin import.',
};

const SUPPORTED_ENGINES = new Set(['unity', 'unreal', 'godot']);

/**
 * Lazy import of the schema package so the daemon's startup path isn't
 * blocked when @greybox/schema is being rebuilt. Cached after first call.
 */
async function getSchema() {
  return (await import('@greybox/schema')) as typeof import('@greybox/schema');
}

/**
 * Read the saved GameProject document or return null if it doesn't exist.
 *
 * Throws on any error other than ENOENT — callers should propagate.
 */
export async function readDesignProject(
  projectsRoot: string,
  projectId: string,
  metadata?: Record<string, unknown>,
): Promise<unknown | null> {
  try {
    const file = await readProjectFile(
      projectsRoot,
      projectId,
      DESIGN_FILE,
      metadata,
    );
    const text = file.buffer.toString('utf8');
    return JSON.parse(text);
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Validate + write a GameProject document. Returns the schema-version of the
 * saved payload so callers can confirm the round-trip.
 */
export async function writeDesignProject(
  projectsRoot: string,
  projectId: string,
  body: unknown,
  metadata?: Record<string, unknown>,
): Promise<{ ok: true; schemaVersion: string } | { ok: false; error: string }> {
  const schema = await getSchema();
  const parsed = schema.safeParseGameProject(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const at = first?.path?.length ? first.path.join('.') : 'document';
    return { ok: false, error: `${at}: ${first?.message ?? 'invalid'}` };
  }
  await ensureProject(projectsRoot, projectId, metadata);
  const json = JSON.stringify(parsed.data, null, 2);
  await writeProjectFile(
    projectsRoot,
    projectId,
    DESIGN_FILE,
    Buffer.from(json, 'utf8'),
    {},
    metadata,
  );
  return { ok: true, schemaVersion: parsed.data.schemaVersion };
}

/**
 * Build an engine-specific package zip. Returns the buffer + a stable
 * filename consumers can stamp into a `Content-Disposition` header.
 *
 * The zip is intentionally minimal: it ships the canonical `project.json`
 * plus the per-engine slice of `exportPolicy`. Engine-side plugins do the
 * heavy lifting of importing prefabs / scenes from this JSON.
 */
export async function buildEnginePackage(
  projectsRoot: string,
  projectId: string,
  engine: string,
  metadata?: Record<string, unknown>,
): Promise<
  | { ok: true; buffer: Buffer; filename: string }
  | { ok: false; status: number; error: string }
> {
  if (!SUPPORTED_ENGINES.has(engine)) {
    return { ok: false, status: 400, error: `unsupported engine: ${engine}` };
  }
  const doc = await readDesignProject(projectsRoot, projectId, metadata);
  if (doc === null) {
    return { ok: false, status: 404, error: 'no design document for this project' };
  }
  const schema = await getSchema();
  const parsed = schema.safeParseGameProject(doc);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      error: `stored project failed validation: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
    };
  }
  const project = parsed.data;

  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(project, null, 2));
  const engineSlice = (project.exportPolicy as Record<string, unknown>)[engine];
  if (engineSlice !== undefined) {
    zip.file(`engine.${engine}.json`, JSON.stringify(engineSlice, null, 2));
  }
  zip.file('README.txt', ENGINE_README[engine] ?? 'Greybox engine export.');

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const safeId = isSafeId(projectId) ? projectId : 'project';
  return { ok: true, buffer, filename: `${safeId}-${engine}.zip` };
}

/**
 * Convenience: resolve the absolute path to a project's `project.json`,
 * for logging / debugging.
 */
export function designFilePath(
  projectsRoot: string,
  projectId: string,
  metadata?: Record<string, unknown>,
): string {
  return path.join(resolveProjectDir(projectsRoot, projectId, metadata), DESIGN_FILE);
}

/**
 * Resolve an asset id to its on-disk bytes by looking it up inside the
 * saved GameProject document.
 *
 * Used by `GET /api/projects/:id/assets/:assetId` so the Babylon-based
 * prototype runner can stream asset bytes without each consumer
 * re-implementing the asset-uri → file lookup. Returns the file bytes,
 * the resolved content-type, and the asset's sha256 (for ETag/cache).
 *
 * For now we resolve project-relative URIs against the project root. HTTP
 * URIs are passed through unchanged — callers should `307`-redirect.
 */
export async function readDesignAsset(
  projectsRoot: string,
  projectId: string,
  assetId: string,
  metadata?: Record<string, unknown>,
): Promise<
  | { ok: true; kind: 'redirect'; url: string }
  | {
      ok: true;
      kind: 'bytes';
      buffer: Buffer;
      contentType: string;
      sha256: string;
      sizeBytes: number;
    }
  | { ok: false; status: number; error: string }
> {
  const doc = await readDesignProject(projectsRoot, projectId, metadata);
  if (doc === null) {
    return { ok: false, status: 404, error: 'no design document for this project' };
  }
  const assets = (doc as { assets?: unknown[] }).assets;
  if (!Array.isArray(assets)) {
    return { ok: false, status: 404, error: 'no assets in project' };
  }
  const asset = assets.find(
    (a): a is { id: string; uri: string; type?: string; sha256: string; sizeBytes: number } =>
      !!a &&
      typeof a === 'object' &&
      (a as { id?: unknown }).id === assetId,
  );
  if (!asset) {
    return { ok: false, status: 404, error: `asset not found: ${assetId}` };
  }
  // Absolute URLs are redirected; the runner follows the redirect.
  if (/^https?:\/\//i.test(asset.uri)) {
    return { ok: true, kind: 'redirect', url: asset.uri };
  }
  // Strip any leading slash so the safe project-file lookup gets a
  // POSIX-style relative path.
  const relPath = asset.uri.replace(/^\/+/, '');
  try {
    const file = await readProjectFile(projectsRoot, projectId, relPath, metadata);
    const contentType = mimeFor(asset.type);
    return {
      ok: true,
      kind: 'bytes',
      buffer: file.buffer,
      contentType,
      sha256: asset.sha256,
      sizeBytes: asset.sizeBytes,
    };
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      return { ok: false, status: 404, error: `asset bytes not found: ${relPath}` };
    }
    return {
      ok: false,
      status: 500,
      error: (err as { message?: string }).message ?? 'unknown',
    };
  }
}

function mimeFor(type: string | undefined): string {
  switch (type) {
    case 'gltf':
      return 'model/gltf-binary';
    case 'fbx':
      return 'application/octet-stream';
    case 'png':
      return 'image/png';
    case 'jpg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'json':
    case 'prefab':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}
