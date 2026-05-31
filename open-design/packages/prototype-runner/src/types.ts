/**
 * Runtime-specific types used by the Prototype Runner.
 *
 * These types are layered on top of the canonical `@greybox/schema` types
 * to describe runner state, asset loading, and event emission. They are
 * intentionally NOT in the schema because they are runtime-only — they
 * never get serialised back into a saved GameProject.
 *
 * @packageDocumentation
 */

import type {
  ComponentKind,
  ScreenId,
} from '@greybox/schema';

/**
 * Runtime camera spec, derived from a Screen's optional camera config.
 *
 * The schema doesn't yet formalise camera kinds; runtime defaults are:
 * - `orbit` — ArcRotateCamera (default for 3D gameplay screens).
 * - `fps` — UniversalCamera (default for first-person screens).
 * - `topdown` — ArcRotateCamera locked to looking straight down.
 * - `ortho2d` — orthographic camera (default for UI-only screens).
 */
export type CameraKind = 'orbit' | 'fps' | 'topdown' | 'ortho2d';

/**
 * On-screen control overlay style for touch devices.
 */
export type ControlsKind = 'none' | 'virtualPad';

/**
 * Per-screen runtime metadata that lives in the schema's open
 * `Screen.notes` or `Screen.properties` until formalised. The runtime
 * accepts an optional `RunnerScreenHints` overlay so editors can drive
 * camera/control choices without polluting the canonical schema.
 */
export interface RunnerScreenHints {
  camera?: CameraKind;
  controls?: ControlsKind;
  /** Optional ground plane size (square, in world units). Default 50. */
  groundSize?: number;
  /** Whether to spawn an ambient hemispheric light. Default true for 3D screens. */
  ambientLight?: boolean;
}

/**
 * Progress event fired while assets are downloading.
 */
export interface LoadProgress {
  /** Bytes downloaded across all assets. */
  loadedBytes: number;
  /** Total bytes across all referenced assets. May be 0 if unknown. */
  totalBytes: number;
  /** Number of assets downloaded so far. */
  loadedAssets: number;
  /** Total assets to download. */
  totalAssets: number;
  /** The id of the asset that just finished, if any. */
  currentAssetId?: string;
  /** Optional human label for the current step. */
  message?: string;
}

/**
 * Discriminated union of events the runner fires. Consumers subscribe via
 * `runner.on(eventName, handler)` and receive the matching payload.
 */
export type RunnerEvent =
  | { type: 'load-progress'; progress: LoadProgress }
  | { type: 'load-complete' }
  | { type: 'screen-change'; from: ScreenId | null; to: ScreenId }
  | { type: 'component-rendered'; componentId: string; kind: ComponentKind }
  | { type: 'flow-trigger'; eventName: string; payload?: unknown }
  | { type: 'error'; error: Error }
  | { type: 'animation-play'; characterId: string; clipName: string }
  | { type: 'paused' }
  | { type: 'resumed' };

/**
 * Map of event name -> payload, useful for typed event emitters.
 */
export type RunnerEventMap = {
  'load-progress': Extract<RunnerEvent, { type: 'load-progress' }>;
  'load-complete': Extract<RunnerEvent, { type: 'load-complete' }>;
  'screen-change': Extract<RunnerEvent, { type: 'screen-change' }>;
  'component-rendered': Extract<RunnerEvent, { type: 'component-rendered' }>;
  'flow-trigger': Extract<RunnerEvent, { type: 'flow-trigger' }>;
  error: Extract<RunnerEvent, { type: 'error' }>;
  'animation-play': Extract<RunnerEvent, { type: 'animation-play' }>;
  paused: Extract<RunnerEvent, { type: 'paused' }>;
  resumed: Extract<RunnerEvent, { type: 'resumed' }>;
};

/**
 * Listener handler signature. Generic over the event name.
 */
export type RunnerListener<K extends keyof RunnerEventMap> = (
  event: RunnerEventMap[K],
) => void;

/**
 * Options accepted by {@link PrototypeRunner} at construction time.
 */
export interface PrototypeRunnerOptions {
  /**
   * Base URL used to resolve project-relative asset URIs. Either a
   * daemon-served `/api/projects/<id>/assets` prefix or a CDN host.
   */
  assetBaseUrl?: string;
  /** Optional initial screen id (overrides project's flow root). */
  initialScreenId?: ScreenId | string;
  /** Whether to integrate browser history (default true in browser). */
  enableHistory?: boolean;
  /** Whether to enable the asset disk cache via IndexedDB (default true). */
  enableAssetCache?: boolean;
  /**
   * Optional `fetch` implementation. Defaults to `globalThis.fetch`.
   * Tests can inject a mock here.
   */
  fetchImpl?: typeof fetch;
  /** Whether to autoplay AudioSource components (default true). */
  enableAudio?: boolean;
  /**
   * Optional override for the engine used at construction time. If absent,
   * the runner will build a browser Engine when `attach()` is called, and
   * a NullEngine for headless tests when called from a non-DOM environment.
   */
  // We deliberately type as `unknown` to avoid coupling the public type
  // surface to a specific Babylon import in headless tests.
  engineFactory?: (canvas: HTMLCanvasElement | null) => unknown;
}

/**
 * Options for `runner.playAnimation()`.
 */
export interface PlayAnimationOptions {
  /** Loop the clip (default = clip.loop from schema). */
  loop?: boolean;
  /** Transition (crossfade) time in seconds. Default 0.3s. */
  transitionSeconds?: number;
  /** Playback speed multiplier. Default 1.0. */
  speed?: number;
}

/**
 * Status snapshot of the runner. Useful for React state or debug overlays.
 */
export interface RunnerStatus {
  ready: boolean;
  paused: boolean;
  currentScreenId: ScreenId | null;
  screenHistory: ScreenId[];
  loadProgress: LoadProgress;
}
