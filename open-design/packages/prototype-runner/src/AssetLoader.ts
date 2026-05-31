/**
 * AssetLoader: resolves project asset URIs into ArrayBuffers, with
 * IndexedDB-backed caching keyed by the asset's sha256.
 *
 * The runner instantiates one AssetLoader per project; it owns the asset
 * fetch pipeline. Tests can supply a `fetchImpl` to avoid real network
 * traffic.
 *
 * @packageDocumentation
 */

import type { Asset, AssetId } from '@greybox/schema';

import type { LoadProgress } from './types.js';

/** Callback signature used to report incremental load progress. */
export type ProgressCallback = (progress: LoadProgress) => void;

/**
 * Result of a successful asset load. The runtime caches the ArrayBuffer
 * but also keeps the originating Asset metadata for downstream consumers
 * (e.g. so a GLTFFileLoader knows whether to import animations).
 */
export interface LoadedAsset {
  asset: Asset;
  buffer: ArrayBuffer;
  /** Object URL safe to revoke when the asset is unloaded. */
  objectUrl: string;
}

/** Minimal subset of the idb-keyval API we use. Lets tests stub it out. */
export interface KeyValStore {
  get(key: string): Promise<ArrayBuffer | undefined>;
  set(key: string, value: ArrayBuffer): Promise<void>;
}

/**
 * Build a key-value store. In a browser we use idb-keyval; in tests we
 * fall back to an in-memory Map.
 */
export async function defaultKeyValStore(): Promise<KeyValStore> {
  if (typeof indexedDB === 'undefined') {
    return inMemoryKeyValStore();
  }
  // Dynamic import keeps idb-keyval out of the bundle when tests stub it.
  const idb = await import('idb-keyval').catch(() => null);
  if (!idb) return inMemoryKeyValStore();
  const store = idb.createStore('greybox-prototype-runner', 'assets');
  return {
    async get(key: string) {
      return (await idb.get(key, store)) as ArrayBuffer | undefined;
    },
    async set(key: string, value: ArrayBuffer) {
      await idb.set(key, value, store);
    },
  };
}

/** In-memory KV used by tests + as fallback when IndexedDB is unavailable. */
export function inMemoryKeyValStore(): KeyValStore {
  const m = new Map<string, ArrayBuffer>();
  return {
    async get(key: string) {
      return m.get(key);
    },
    async set(key: string, value: ArrayBuffer) {
      m.set(key, value);
    },
  };
}

/** Options accepted by {@link AssetLoader}. */
export interface AssetLoaderOptions {
  /** Base URL prepended to relative asset URIs. */
  assetBaseUrl?: string;
  /** Custom fetch implementation (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Persistent cache. Pass `null` to disable. */
  store?: KeyValStore | null;
}

/**
 * Asset loader. Resolves URIs, fetches bytes, and caches results.
 *
 * Usage:
 * ```ts
 * const loader = new AssetLoader({ assetBaseUrl: '/api/proj/abc/assets' });
 * await loader.preload(project.assets, (progress) => console.log(progress));
 * const goblin = loader.get(goblinAssetId);
 * ```
 */
export class AssetLoader {
  private readonly assetBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly store: KeyValStore | null;
  private readonly cache = new Map<AssetId, LoadedAsset>();
  private readonly registry = new Map<AssetId, Asset>();

  constructor(options: AssetLoaderOptions = {}) {
    this.assetBaseUrl = options.assetBaseUrl ?? '';
    this.fetchImpl =
      options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (async () => {
        throw new Error('no fetch implementation available');
      }) as unknown as typeof fetch);
    this.store = options.store === undefined ? null : options.store;
  }

  /** Register the project's asset list so {@link get} can resolve by id. */
  register(assets: readonly Asset[]): void {
    for (const a of assets) this.registry.set(a.id, a);
  }

  /**
   * Eagerly fetch every asset in the project, reporting progress.
   *
   * Returns once all bytes are resolved. Errors propagate; callers can
   * choose to swallow them and let lazy loads retry per asset.
   */
  async preload(
    assets: readonly Asset[],
    onProgress?: ProgressCallback,
  ): Promise<void> {
    this.register(assets);

    const total = assets.length;
    const totalBytes = assets.reduce((sum, a) => sum + a.sizeBytes, 0);
    let loadedBytes = 0;
    let loadedAssets = 0;

    for (const a of assets) {
      const loaded = await this.fetchAsset(a);
      this.cache.set(a.id, loaded);
      loadedBytes += a.sizeBytes;
      loadedAssets += 1;
      onProgress?.({
        loadedBytes,
        totalBytes,
        loadedAssets,
        totalAssets: total,
        currentAssetId: a.id,
        message: `Loaded ${a.name ?? a.id}`,
      });
    }
  }

  /** Get the loaded asset by id, or `undefined` if not yet preloaded. */
  get(id: AssetId | string): LoadedAsset | undefined {
    return this.cache.get(id as AssetId);
  }

  /** Get the registered Asset metadata (without bytes). */
  getMetadata(id: AssetId | string): Asset | undefined {
    return this.registry.get(id as AssetId);
  }

  /**
   * Lazily fetch an asset by id. Returns a cached entry if previously
   * loaded; otherwise downloads + caches. Throws if the id is unknown.
   */
  async load(id: AssetId | string): Promise<LoadedAsset> {
    const cached = this.cache.get(id as AssetId);
    if (cached) return cached;
    const asset = this.registry.get(id as AssetId);
    if (!asset) throw new Error(`Unknown asset id: ${id}`);
    const loaded = await this.fetchAsset(asset);
    this.cache.set(asset.id, loaded);
    return loaded;
  }

  /** Resolve a project-relative URI to an absolute URL. */
  resolveUrl(uri: string): string {
    if (/^[a-z]+:\/\//i.test(uri) || uri.startsWith('data:') || uri.startsWith('blob:')) {
      return uri;
    }
    if (!this.assetBaseUrl) return uri;
    const base = this.assetBaseUrl.endsWith('/')
      ? this.assetBaseUrl.slice(0, -1)
      : this.assetBaseUrl;
    const path = uri.startsWith('/') ? uri.slice(1) : uri;
    return `${base}/${path}`;
  }

  /** Revoke all object URLs and drop cache entries. Call on teardown. */
  dispose(): void {
    if (typeof URL !== 'undefined' && URL.revokeObjectURL) {
      for (const entry of this.cache.values()) {
        try {
          URL.revokeObjectURL(entry.objectUrl);
        } catch {
          /* noop */
        }
      }
    }
    this.cache.clear();
  }

  // --- internals ---------------------------------------------------------

  private async fetchAsset(asset: Asset): Promise<LoadedAsset> {
    // 1. Check persistent cache by sha256.
    if (this.store) {
      const cached = await this.store.get(asset.sha256);
      if (cached) {
        return this.wrap(asset, cached);
      }
    }
    // 2. Fetch from network.
    const url = this.resolveUrl(asset.uri);
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch asset "${asset.id}" from ${url}: ${response.status} ${response.statusText}`,
      );
    }
    const buffer = await response.arrayBuffer();
    // 3. Write through to cache (best-effort).
    if (this.store) {
      this.store.set(asset.sha256, buffer).catch(() => {
        /* ignore cache failures */
      });
    }
    return this.wrap(asset, buffer);
  }

  private wrap(asset: Asset, buffer: ArrayBuffer): LoadedAsset {
    const blobCtor =
      typeof Blob !== 'undefined' ? Blob : (null as unknown as typeof Blob);
    if (!blobCtor || typeof URL === 'undefined' || !URL.createObjectURL) {
      return { asset, buffer, objectUrl: asset.uri };
    }
    const blob = new blobCtor([buffer], { type: mimeFor(asset.type) });
    const objectUrl = URL.createObjectURL(blob);
    return { asset, buffer, objectUrl };
  }
}

function mimeFor(type: Asset['type']): string {
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
      return 'application/json';
    case 'prefab':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}
