/**
 * PrototypeRunner: the core class that loads a GameProject and plays it
 * inside a Babylon Scene graph.
 *
 * Lifecycle:
 *   1. `new PrototypeRunner(project, options)` — validate and prepare.
 *   2. `attach(canvas)` — bind to a `<canvas>` and start the render loop.
 *      For headless tests, skip this and use `setEngine(NullEngine)`.
 *   3. `goToScreen(id)` — transition between screens.
 *   4. `dispose()` — stop the loop and release everything.
 *
 * The runner is event-driven: subscribe via `on(eventName, listener)`.
 *
 * @packageDocumentation
 */

import {
  type Engine,
  type EngineOptions,
  Engine as BabylonEngine,
  NullEngine,
} from '@babylonjs/core';

import {
  type GameProject,
  type ScreenId,
  validateGameProject,
} from '@greybox/schema';

import {
  AssetLoader,
  type KeyValStore,
} from './AssetLoader.js';
import { FlowDispatcher, type FlowSignal } from './FlowDispatcher.js';
import {
  type BuiltScene,
  buildSceneForScreen,
  indexCharacters,
} from './SceneBuilder.js';
import type {
  LoadProgress,
  PlayAnimationOptions,
  PrototypeRunnerOptions,
  RunnerEvent,
  RunnerEventMap,
  RunnerListener,
  RunnerScreenHints,
  RunnerStatus,
} from './types.js';

/**
 * The runner. One instance per loaded project.
 *
 * @example
 * ```ts
 * const runner = new PrototypeRunner(project, { assetBaseUrl });
 * runner.on('screen-change', (e) => console.log('now on', e.to));
 * await runner.preload();
 * runner.attach(canvas);
 * ```
 */
export class PrototypeRunner {
  readonly project: GameProject;
  readonly options: PrototypeRunnerOptions;
  readonly assetLoader: AssetLoader;
  readonly dispatcher: FlowDispatcher;
  readonly characters: ReturnType<typeof indexCharacters>;

  private engine: Engine | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private active: BuiltScene | null = null;
  private currentScreenId: ScreenId | null = null;
  private readonly history: ScreenId[] = [];
  private readonly screenHints = new Map<string, RunnerScreenHints>();
  private readonly listeners: {
    [K in keyof RunnerEventMap]: Set<RunnerListener<K>>;
  } = {
    'load-progress': new Set(),
    'load-complete': new Set(),
    'screen-change': new Set(),
    'component-rendered': new Set(),
    'flow-trigger': new Set(),
    error: new Set(),
    'animation-play': new Set(),
    paused: new Set(),
    resumed: new Set(),
  };

  private loadProgress: LoadProgress = {
    loadedBytes: 0,
    totalBytes: 0,
    loadedAssets: 0,
    totalAssets: 0,
  };
  private paused = false;
  private ready = false;
  private preloadStarted = false;
  private historyListener: ((e: PopStateEvent) => void) | null = null;
  private pendingTimeEdges: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    projectInput: GameProject | unknown,
    options: PrototypeRunnerOptions = {},
    keyValStore?: KeyValStore | null,
  ) {
    // Accept either an already-validated GameProject or arbitrary input.
    // When the input is suspect, validate via the schema.
    const project = looksValidated(projectInput)
      ? (projectInput as GameProject)
      : validateGameProject(projectInput);
    this.project = project;
    this.options = options;
    this.dispatcher = new FlowDispatcher(project);
    this.characters = indexCharacters(project);
    const assetLoaderOptions: ConstructorParameters<typeof AssetLoader>[0] = {
      assetBaseUrl: options.assetBaseUrl ?? '',
    };
    if (options.fetchImpl) assetLoaderOptions.fetchImpl = options.fetchImpl;
    if (keyValStore !== undefined) assetLoaderOptions.store = keyValStore;
    else if (options.enableAssetCache === false) assetLoaderOptions.store = null;
    this.assetLoader = new AssetLoader(assetLoaderOptions);
    this.assetLoader.register(project.assets);
  }

  // -----------------------------------------------------------------------
  // Engine / canvas attachment
  // -----------------------------------------------------------------------

  /** Inject an engine directly (useful for tests with NullEngine). */
  setEngine(engine: Engine): void {
    this.engine = engine;
  }

  /**
   * Attach the runner to a canvas and start the render loop. Throws if
   * called twice without an intervening `dispose()`.
   */
  attach(canvas: HTMLCanvasElement, engineOptions?: EngineOptions): void {
    if (this.engine && this.canvas) {
      throw new Error('PrototypeRunner already attached');
    }
    this.canvas = canvas;
    if (!this.engine) {
      if (this.options.engineFactory) {
        const built = this.options.engineFactory(canvas);
        this.engine = built as Engine;
      } else {
        this.engine = new BabylonEngine(canvas, true, engineOptions ?? {
          preserveDrawingBuffer: true,
          stencil: true,
          antialias: true,
        });
      }
    }
    this.startRenderLoop();
    this.attachHistory();
  }

  /**
   * Attach a headless NullEngine. The runner can build scenes and react to
   * flow signals, but produces no rendering. Used by unit tests.
   */
  attachHeadless(): void {
    if (this.engine) return;
    this.engine = new NullEngine({
      renderWidth: 256,
      renderHeight: 256,
      textureSize: 256,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    });
  }

  // -----------------------------------------------------------------------
  // Asset preload
  // -----------------------------------------------------------------------

  /**
   * Preload all assets referenced by the project, emitting load-progress
   * events as bytes come in. Safe to call multiple times — second call is
   * a no-op.
   */
  async preload(): Promise<void> {
    if (this.preloadStarted) return;
    this.preloadStarted = true;
    try {
      await this.assetLoader.preload(this.project.assets, (progress) => {
        this.loadProgress = progress;
        this.emit({ type: 'load-progress', progress });
      });
      this.ready = true;
      this.emit({ type: 'load-complete' });
    } catch (err) {
      this.emit({ type: 'error', error: toError(err) });
      throw err;
    }
  }

  /** Mark a screen with runtime hints (camera, controls, ground size). */
  setScreenHints(screenId: string, hints: RunnerScreenHints): void {
    this.screenHints.set(screenId, hints);
  }

  // -----------------------------------------------------------------------
  // Screen transitions
  // -----------------------------------------------------------------------

  /**
   * Build (or rebuild) the target screen. Validates the screen exists,
   * disposes the current scene, builds the new one, schedules any time-
   * triggered flow edges, pushes browser history, and emits.
   */
  async goToScreen(screenId: ScreenId | string): Promise<void> {
    const screen = this.project.screens.find((s) => s.id === screenId);
    if (!screen) {
      throw new Error(`Screen not found: ${screenId}`);
    }
    if (!this.engine) {
      // Lazy: if attached only by setEngine without canvas (rare), keep going.
      this.attachHeadless();
    }
    const from = this.currentScreenId;
    // Dispose previous scene.
    if (this.active) {
      this.active.dispose();
      this.active = null;
    }
    // Clear pending timers.
    for (const t of this.pendingTimeEdges) clearTimeout(t);
    this.pendingTimeEdges = [];

    const built = await buildSceneForScreen(screen, {
      engine: this.engine!,
      project: this.project,
      assetLoader: this.assetLoader,
      characters: this.characters,
      onButtonClick: (componentId, button) => {
        this.handleSignal({ type: 'button-click', componentId, button });
      },
      onMenuItemClick: (componentId, itemId, event) => {
        this.handleSignal({
          type: 'menu-item-click',
          componentId,
          itemId,
          event,
        });
      },
      screenHints: this.screenHints,
      canvas: this.canvas,
    });
    this.active = built;
    this.currentScreenId = screen.id;
    if (from !== screen.id) this.history.push(screen.id);

    // Schedule time-trigger edges out of this screen.
    for (const edge of this.dispatcher.timedEdgesFor(screen.id)) {
      const delay = FlowDispatcher.timeDelay(edge.trigger);
      if (delay == null) continue;
      const timer = setTimeout(() => {
        this.handleSignal({ type: 'time-elapsed', elapsedSeconds: delay });
      }, delay * 1000);
      this.pendingTimeEdges.push(timer);
    }

    // Emit component-rendered events.
    for (const c of screen.components) {
      this.emit({
        type: 'component-rendered',
        componentId: c.id,
        kind: c.kind,
      });
    }

    this.emit({ type: 'screen-change', from, to: screen.id });
    if (this.options.enableHistory !== false) this.pushHistory(screen.id);
  }

  /**
   * Programmatic signal entry point. Resolves the signal against the flow
   * dispatcher and either transitions or emits a runtime event.
   */
  handleSignal(signal: FlowSignal): void {
    if (!this.currentScreenId) return;
    const decision = this.dispatcher.dispatch(signal, this.currentScreenId);
    switch (decision.kind) {
      case 'goto-screen': {
        // Fire-and-forget; errors bubble through the error event.
        void this.goToScreen(decision.to).catch((err) =>
          this.emit({ type: 'error', error: toError(err) }),
        );
        return;
      }
      case 'emit-event':
        this.emit({
          type: 'flow-trigger',
          eventName: decision.eventName,
          payload: decision.payload,
        });
        return;
      case 'none':
      default:
        return;
    }
  }

  /**
   * Convenience: fire a named script event. Useful for gameplay code that
   * wants to drive transitions without constructing a FlowSignal manually.
   */
  fireEvent(eventId: string, payload?: unknown): void {
    this.handleSignal({ type: 'script-event', eventId, payload });
  }

  // -----------------------------------------------------------------------
  // Animations
  // -----------------------------------------------------------------------

  /**
   * Play an animation clip on a character placed in the current scene.
   * Returns true when the clip was found and started.
   */
  playAnimation(
    characterId: string,
    clipName: string,
    options?: PlayAnimationOptions,
  ): boolean {
    if (!this.active) return false;
    for (const handle of this.active.components.values()) {
      if (handle.kind !== 'Character3DRef' || !handle.character) continue;
      if (handle.character.characterId !== characterId) continue;
      const group = handle.character.player.play(clipName, options);
      if (group) {
        this.emit({ type: 'animation-play', characterId, clipName });
        return true;
      }
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Lifecycle / events
  // -----------------------------------------------------------------------

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    if (this.engine) this.engine.stopRenderLoop();
    this.emit({ type: 'paused' });
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.startRenderLoop();
    this.emit({ type: 'resumed' });
  }

  /** Tear down everything: scenes, engine, assets, history listener. */
  dispose(): void {
    for (const t of this.pendingTimeEdges) clearTimeout(t);
    this.pendingTimeEdges = [];
    if (this.active) {
      this.active.dispose();
      this.active = null;
    }
    if (this.engine) {
      try { this.engine.stopRenderLoop(); } catch { /* noop */ }
      try { this.engine.dispose(); } catch { /* noop */ }
      this.engine = null;
    }
    this.assetLoader.dispose();
    this.detachHistory();
    for (const k of Object.keys(this.listeners) as Array<keyof RunnerEventMap>) {
      (this.listeners[k] as Set<unknown>).clear();
    }
  }

  status(): RunnerStatus {
    return {
      ready: this.ready,
      paused: this.paused,
      currentScreenId: this.currentScreenId,
      screenHistory: [...this.history],
      loadProgress: this.loadProgress,
    };
  }

  /** Subscribe to a runner event. Returns an unsubscribe function. */
  on<K extends keyof RunnerEventMap>(
    eventName: K,
    listener: RunnerListener<K>,
  ): () => void {
    const set = this.listeners[eventName] as Set<RunnerListener<K>>;
    set.add(listener);
    return () => set.delete(listener);
  }

  /** Unsubscribe a previously registered listener. */
  off<K extends keyof RunnerEventMap>(
    eventName: K,
    listener: RunnerListener<K>,
  ): void {
    (this.listeners[eventName] as Set<RunnerListener<K>>).delete(listener);
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Type-erased internal emitter. */
  private emit(event: RunnerEvent): void {
    const set = this.listeners[event.type] as Set<(e: RunnerEvent) => void>;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        /* noop — listener errors must not break the runner */
      }
    }
  }

  private startRenderLoop(): void {
    if (!this.engine) return;
    this.engine.runRenderLoop(() => {
      if (this.paused) return;
      if (this.active) this.active.scene.render();
    });
  }

  private attachHistory(): void {
    if (this.options.enableHistory === false) return;
    if (typeof window === 'undefined') return;
    const handler = (e: PopStateEvent): void => {
      const state = e.state as { screenId?: string } | null;
      if (state && typeof state.screenId === 'string') {
        void this.goToScreen(state.screenId);
      }
    };
    window.addEventListener('popstate', handler);
    this.historyListener = handler;
  }

  private detachHistory(): void {
    if (typeof window === 'undefined' || !this.historyListener) return;
    window.removeEventListener('popstate', this.historyListener);
    this.historyListener = null;
  }

  private pushHistory(screenId: string): void {
    if (this.options.enableHistory === false) return;
    if (typeof window === 'undefined' || !window.history) return;
    try {
      window.history.pushState({ screenId }, '', `#${screenId}`);
    } catch {
      /* noop — history may be restricted in iframe sandboxes */
    }
  }
}

function looksValidated(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    'screens' in value &&
    Array.isArray((value as { screens: unknown }).screens)
  );
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === 'string' ? err : 'unknown error');
}
