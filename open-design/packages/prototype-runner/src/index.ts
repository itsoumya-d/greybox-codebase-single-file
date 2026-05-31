/**
 * `@greybox/prototype-runner` — Babylon.js runtime for canonical
 * Greybox Studio `GameProject` documents.
 *
 * The runner accepts a validated `GameProject` (from `@greybox/schema`)
 * and turns it into a playable browser experience: 3D screens with
 * characters, UI overlays, screen-to-screen flow transitions, and
 * mobile-responsive controls.
 *
 * Three layers of API:
 *
 * 1. **Headless / framework-agnostic** — {@link PrototypeRunner} class
 *    plus the building blocks ({@link SceneBuilder}, {@link FlowDispatcher},
 *    {@link AssetLoader}, etc.). Use this from any host environment.
 *
 * 2. **React** — see the `./react` subpath: `PrototypeRunnerView`,
 *    `useProjectLoader`, `PrototypeControls`. Importing this barrel does
 *    not pull in React.
 *
 * 3. **Types** — runtime-specific types ({@link RunnerEvent},
 *    {@link LoadProgress}, ...).
 *
 * @packageDocumentation
 */

export { AssetLoader, inMemoryKeyValStore, defaultKeyValStore } from './AssetLoader.js';
export type {
  KeyValStore,
  LoadedAsset,
  AssetLoaderOptions,
  ProgressCallback,
} from './AssetLoader.js';

export {
  buildCamera,
  resolveCameraKind,
} from './CameraController.js';

export {
  applyTransform,
  buildAnimationPlayer,
  loadCharacterInstance,
} from './CharacterLoader.js';
export type {
  AnimationPlayer,
  CharacterInstance,
} from './CharacterLoader.js';

export {
  renderComponent,
  loadAssetTexture,
} from './ComponentRenderer.js';
export type { RenderedComponent, ComponentRendererOptions } from './ComponentRenderer.js';

export {
  FlowDispatcher,
} from './FlowDispatcher.js';
export type { FlowSignal, FlowDecision } from './FlowDispatcher.js';

export {
  buildSceneForScreen,
  indexCharacters,
  screenHas3D,
} from './SceneBuilder.js';
export type { BuiltScene, SceneBuilderOptions } from './SceneBuilder.js';

export {
  renderUI,
} from './UIRenderer.js';
export type {
  ButtonClickHandler,
  MenuItemClickHandler,
  UIRendererOptions,
  RenderedGuiNode,
} from './UIRenderer.js';

export { PrototypeRunner } from './PrototypeRunner.js';

export type {
  CameraKind,
  ControlsKind,
  LoadProgress,
  PlayAnimationOptions,
  PrototypeRunnerOptions,
  RunnerEvent,
  RunnerEventMap,
  RunnerListener,
  RunnerScreenHints,
  RunnerStatus,
} from './types.js';
