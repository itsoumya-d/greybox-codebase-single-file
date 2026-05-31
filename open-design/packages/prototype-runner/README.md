# @greybox/prototype-runner

Babylon.js-based playable prototype runtime for canonical Greybox Studio
`GameProject` documents. Consumes the schema from
[`@greybox/schema`](../schema) and renders the project as a real-time,
browser-playable experience with 3D characters, UI, and screen-to-screen
flow.

## Why this exists

Greybox Studio's "playable prototype" surface currently only supports
plain HTML iframes. This package adds a true 3D runtime so designers can
test their canonical projects without ever leaving the browser.

## Public surface

### Headless / framework-agnostic

Import from `@greybox/prototype-runner`:

```ts
import { PrototypeRunner } from '@greybox/prototype-runner';

const runner = new PrototypeRunner(project, {
  assetBaseUrl: '/api/projects/abc123/assets',
});
runner.on('screen-change', (e) => console.log('on', e.to));
await runner.preload();
runner.attach(canvas);
await runner.goToScreen('screen-main-menu');
```

### React component

Import from `@greybox/prototype-runner/react`:

```tsx
import { PrototypeRunnerView } from '@greybox/prototype-runner/react';

<PrototypeRunnerView
  projectUrl="/api/projects/abc123/design"
  assetBaseUrl="/api/projects/abc123/assets"
  onScreenChange={(screenId) => console.log(screenId)}
  showControls
/>
```

## Component coverage

| Kind             | Renderer       | Notes                                       |
| ---------------- | -------------- | ------------------------------------------- |
| `Button`         | Babylon.GUI    | Click handler routed through FlowDispatcher |
| `Image`          | Babylon.GUI    | Resolved via AssetLoader                    |
| `Text`           | Babylon.GUI    | TextBlock with font / colour                |
| `TextInput`      | Babylon.GUI    | InputText                                   |
| `ProgressBar`    | Babylon.GUI    | Rectangle with fill child                   |
| `HUDBar`         | Babylon.GUI    | HP-coloured fill bar                        |
| `MenuList`       | Babylon.GUI    | StackPanel of buttons                       |
| `Container`      | Babylon.GUI    | Rectangle as layout parent                  |
| `Character3DRef` | glTF + rig     | AnimationPlayer auto-plays `idle`           |
| `GameObject`     | Placeholder    | Stubbed; glTF prefab follow-up              |
| `Spawner`        | Placeholder    | Yellow wireframe sphere                     |
| `Trigger`        | Placeholder    | Cyan wireframe per `shape`                  |
| `Pickup`         | Placeholder    | Green emissive sphere                       |
| `Hazard`         | Placeholder    | Red translucent cube                        |
| `Checkpoint`     | Placeholder    | Yellow cylinder                             |
| `Camera`         | Anchor node    | Real active camera selected by SceneBuilder |
| `Light`          | Real light     | Directional / Point / Spot / Hemispheric    |
| `Particle`       | ParticleSystem | Default emitter; effect asset deferred      |
| `AudioSource`    | Babylon Sound  | Spatial / autoplay flags honoured           |

## Flow triggers

The `FlowDispatcher` resolves the following runtime signals against the
project's `FlowEdge` graph:

- `tap` — button click on a UI component
- `longPress` — held button or menu item
- `swipe` — gesture direction
- `time` — auto-transition after N seconds
- `scriptEvent` — fired by `runner.fireEvent(eventName)` or a button's
  `onClickEvent`
- `collision` — tag-matched collider touches
- `custom` — escape hatch (not wired automatically)

## Performance budget

- Target 60fps on desktop / 30fps on mid-tier mobile.
- Asset cache: IndexedDB via `idb-keyval`, keyed by asset `sha256`.
- Heavy meshes lazy-load on first reference; UI screens never pay for
  unused glTF.

## Tests

```bash
pnpm --filter @greybox/prototype-runner test
```

Tests use Babylon's `NullEngine` for headless rendering. The
`tests/fixtures/minimal-3d-project.json` fixture exercises every renderer.

## Known follow-ups

- glTF prefab consumption for `GameObject` (renders placeholder cube today).
- Effect-asset deserialisation for `Particle` (uses a hard-coded default emitter).
- Touch joystick + virtual-pad rendering when `controls === 'virtualPad'`.
- Skybox / image background rendering (currently falls back to neutral colour).
- Animation crossfade smoothing — current code starts/stops; blending is best-effort.
