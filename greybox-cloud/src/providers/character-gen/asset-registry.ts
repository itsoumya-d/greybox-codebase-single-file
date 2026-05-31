// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Asset registration: download a generated .glb, compute sha256, write to
// the configured backing store (local disk or S3-compatible), and return
// a URI the prototype runner can fetch.
//
// We deliberately implement just two backends here:
//
//   - local: write under ${GREYBOX_ASSET_ROOT}/characters/${tenantId}/${characterId}.glb
//   - s3 (optional): when GREYBOX_S3_BUCKET is set, PUT via a thin internal
//     adapter so we don't pull in the aws-sdk for the common single-replica
//     deployment. The S3 path is opt-in via the constructor; the cloud's
//     default config goes to disk.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CharacterGenUpstreamError, type FetchLike } from './types.js';

/** Maximum allowed .glb size (32 MiB). Matches the gltf-normalizer limit. */
const MAX_GLB_BYTES = 32 * 1024 * 1024;

export interface AssetRegistrationInput {
  tenantId: string;
  characterId: string;
  /** URL to download the source .glb from (provider output). */
  sourceUrl: string;
}

export interface AssetRegistrationResult {
  /** Storage URI (file:// or s3://). */
  uri: string;
  /** Public/signed URL the runner can fetch — same as `uri` for s3 when
   *  the configured backend produces signed URLs; otherwise a passthrough. */
  publicUrl?: string;
  /** Raw bytes for downstream gltf validation. */
  bytes: Uint8Array;
  sha256: string;
  sizeBytes: number;
}

export interface AssetStorage {
  store(input: AssetRegistrationInput, bytes: Uint8Array): Promise<{ uri: string; publicUrl?: string }>;
}

/**
 * Local-filesystem storage. Writes to `${root}/characters/${tenantId}/${characterId}.glb`
 * and returns a `file://` URI. Use `publicBaseUrl` to also surface an
 * HTTPS URL the prototype runner can fetch (e.g. a static-file endpoint
 * served by the cloud or a CDN sitting in front of the same root).
 */
export class LocalFilesystemAssetStorage implements AssetStorage {
  constructor(
    private readonly root: string,
    private readonly publicBaseUrl?: string,
  ) {}

  async store(
    input: AssetRegistrationInput,
    bytes: Uint8Array,
  ): Promise<{ uri: string; publicUrl?: string }> {
    const dir = path.join(this.root, 'characters', sanitizePathSegment(input.tenantId));
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${sanitizePathSegment(input.characterId)}.glb`);
    await writeFile(file, bytes);
    return {
      uri: `file://${file}`,
      ...(this.publicBaseUrl
        ? {
          publicUrl: `${stripTrailingSlash(this.publicBaseUrl)}/characters/${encodeURIComponent(input.tenantId)}/${encodeURIComponent(input.characterId)}.glb`,
        }
        : {}),
    };
  }
}

/**
 * S3-compatible storage. Thin PUT-only client that uses fetch directly so
 * we don't pull in the AWS SDK as a dep. Callers wire it from env vars
 * when running on hosted infra; if `GREYBOX_S3_BUCKET` is unset we fall
 * through to the local backend.
 */
export interface S3StorageOptions {
  bucket: string;
  /** Endpoint base URL, e.g. https://s3.us-east-1.amazonaws.com. */
  endpoint: string;
  /** Public CDN/HTTPS base used to construct downloadable URLs. */
  publicBaseUrl?: string;
  fetch?: FetchLike;
  /** Optional auth header — implementations may set a static signed header. */
  authHeader?: string;
}

export class S3AssetStorage implements AssetStorage {
  constructor(private readonly options: S3StorageOptions) {}

  async store(
    input: AssetRegistrationInput,
    bytes: Uint8Array,
  ): Promise<{ uri: string; publicUrl?: string }> {
    const key = `characters/${sanitizePathSegment(input.tenantId)}/${sanitizePathSegment(input.characterId)}.glb`;
    const baseEndpoint = stripTrailingSlash(this.options.endpoint);
    const url = `${baseEndpoint}/${this.options.bucket}/${encodeURI(key)}`;
    const fetchFn = this.options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!fetchFn) {
      throw new CharacterGenUpstreamError('s3 storage: fetch is not available');
    }
    const headers: Record<string, string> = {
      'content-type': 'model/gltf-binary',
      'content-length': String(bytes.byteLength),
    };
    if (this.options.authHeader) headers.authorization = this.options.authHeader;
    const response = await fetchFn(url, {
      method: 'PUT',
      headers,
      // ArrayBuffer-backed; fetch accepts a string body in our minimal
      // adapter shape, but tests can supply a fetch impl that accepts
      // binary directly. For real AWS auth the operator wires a signer.
      body: Buffer.from(bytes).toString('binary'),
    });
    if (!response.ok) {
      throw new CharacterGenUpstreamError(
        `s3 storage PUT failed: HTTP ${response.status} ${response.statusText ?? ''}`.trim(),
        response.status,
      );
    }
    return {
      uri: `s3://${this.options.bucket}/${key}`,
      ...(this.options.publicBaseUrl
        ? { publicUrl: `${stripTrailingSlash(this.options.publicBaseUrl)}/${key}` }
        : {}),
    };
  }
}

export interface AssetRegistrarOptions {
  storage: AssetStorage;
  /** Optional fetch override for downloading the source URL (testable). */
  fetch?: FetchLike;
  /** Allow file:// sources (off by default; on in tests). */
  allowFileUrls?: boolean;
  /**
   * Function returning bytes for `file://` URLs. Defaults to reading from
   * disk via `node:fs/promises`. Tests use this hook to avoid touching the
   * filesystem.
   */
  readFile?: (filePath: string) => Promise<Uint8Array>;
  /** Optional raw bytes for the special "in-process mock fixture" URI. */
  mockFixtureBytes?: Uint8Array;
}

const MOCK_FIXTURE_SCHEME = 'greybox-mock:';

/**
 * Download a source URL, validate it's a plausible glb (size, content type
 * if available), and write it to the configured storage. Idempotent on
 * the storage side (overwrites existing keys); the caller picks the
 * characterId so repeated import calls produce the same key.
 */
export class AssetRegistrar {
  private readonly fetchFn: FetchLike;
  private readonly allowFileUrls: boolean;
  private readonly readFile?: (filePath: string) => Promise<Uint8Array>;
  private readonly mockFixtureBytes?: Uint8Array;

  constructor(private readonly options: AssetRegistrarOptions) {
    const candidate = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!candidate) {
      throw new Error('AssetRegistrar needs fetch (no global fetch found)');
    }
    this.fetchFn = candidate;
    this.allowFileUrls = options.allowFileUrls === true;
    if (options.readFile) this.readFile = options.readFile;
    if (options.mockFixtureBytes) this.mockFixtureBytes = options.mockFixtureBytes;
  }

  async register(
    input: AssetRegistrationInput,
  ): Promise<AssetRegistrationResult> {
    const bytes = await this.readBytes(input.sourceUrl);
    if (bytes.byteLength === 0) {
      throw new CharacterGenUpstreamError(`source ${input.sourceUrl} returned empty body`);
    }
    if (bytes.byteLength > MAX_GLB_BYTES) {
      throw new CharacterGenUpstreamError(
        `source ${input.sourceUrl} returned ${bytes.byteLength} bytes; max is ${MAX_GLB_BYTES}`,
      );
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const { uri, publicUrl } = await this.options.storage.store(input, bytes);
    return {
      uri,
      ...(publicUrl ? { publicUrl } : {}),
      bytes,
      sha256,
      sizeBytes: bytes.byteLength,
    };
  }

  private async readBytes(sourceUrl: string): Promise<Uint8Array> {
    if (sourceUrl.startsWith(MOCK_FIXTURE_SCHEME)) {
      if (!this.mockFixtureBytes) {
        throw new CharacterGenUpstreamError(
          `${MOCK_FIXTURE_SCHEME} source requested but no mockFixtureBytes configured`,
        );
      }
      return this.mockFixtureBytes;
    }
    if (sourceUrl.startsWith('file://')) {
      if (!this.allowFileUrls) {
        throw new CharacterGenUpstreamError('file:// sources are not allowed in this environment');
      }
      const filePath = sourceUrl.replace(/^file:\/\//u, '');
      const readFile = this.readFile ?? defaultReadFile;
      return await readFile(filePath);
    }
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      throw new CharacterGenUpstreamError(`invalid source URL: ${sourceUrl}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new CharacterGenUpstreamError(`unsupported source protocol: ${parsed.protocol}`);
    }
    const response = await this.fetchFn(sourceUrl, { method: 'GET' });
    if (!response.ok) {
      throw new CharacterGenUpstreamError(
        `source download failed: HTTP ${response.status} ${response.statusText ?? ''}`.trim(),
        response.status,
      );
    }
    const text = await response.text();
    // The mock fixture is base64 — accept either binary text via latin-1
    // or a base64 string with the "data:application/octet-stream;base64,"
    // prefix.
    if (text.startsWith('data:') && text.includes(';base64,')) {
      const base64 = text.split(';base64,', 2)[1] ?? '';
      return Buffer.from(base64, 'base64');
    }
    // Fall back to latin-1 to round-trip raw binary through the text
    // path (fetch's text() method preserves bytes when the body is
    // encoded as latin-1).
    return Buffer.from(text, 'binary');
  }
}

async function defaultReadFile(filePath: string): Promise<Uint8Array> {
  const fs = await import('node:fs/promises');
  return await fs.readFile(filePath);
}

function sanitizePathSegment(value: string): string {
  // POSIX-safe segment (drop slashes/control chars) capped at 128 chars.
  return value.replace(/[^A-Za-z0-9_.\-]/gu, '_').slice(0, 128) || 'unknown';
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function assetStorageFromEnv(
  env: Record<string, string | undefined> = process.env,
): { storage: AssetStorage; backend: 'local' | 's3' } {
  const bucket = env.GREYBOX_S3_BUCKET?.trim();
  const endpoint = env.GREYBOX_S3_ENDPOINT?.trim();
  if (bucket && endpoint) {
    return {
      storage: new S3AssetStorage({
        bucket,
        endpoint,
        ...(env.GREYBOX_S3_PUBLIC_BASE_URL ? { publicBaseUrl: env.GREYBOX_S3_PUBLIC_BASE_URL } : {}),
        ...(env.GREYBOX_S3_AUTH_HEADER ? { authHeader: env.GREYBOX_S3_AUTH_HEADER } : {}),
      }),
      backend: 's3',
    };
  }
  const root = env.GREYBOX_ASSET_ROOT?.trim() || path.join(process.cwd(), '.greybox-assets');
  return {
    storage: new LocalFilesystemAssetStorage(
      root,
      env.GREYBOX_ASSET_PUBLIC_BASE_URL?.trim(),
    ),
    backend: 'local',
  };
}
