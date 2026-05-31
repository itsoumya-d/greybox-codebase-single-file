/**
 * CameraController: builds and configures a Babylon Camera for a Screen.
 *
 * The schema doesn't (yet) carry a first-class `cameraSpec` on Screen; the
 * runner reads camera hints from {@link RunnerScreenHints} and falls back
 * to sensible defaults per `Screen.kind`:
 *
 * - `main-menu`, `pause`, `game-over`, `settings`, etc. → `ortho2d`
 * - `gameplay` → `orbit`
 * - `cutscene` → `orbit`
 *
 * @packageDocumentation
 */

import {
  ArcRotateCamera,
  Camera,
  type Scene,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';

import type { Screen } from '@greybox/schema';

import type { CameraKind, RunnerScreenHints } from './types.js';

/**
 * Determine the camera kind to use for a screen, given optional runner hints.
 */
export function resolveCameraKind(
  screen: Screen,
  hints?: RunnerScreenHints,
): CameraKind {
  if (hints?.camera) return hints.camera;
  switch (screen.kind) {
    case 'gameplay':
    case 'cutscene':
      return 'orbit';
    case 'main-menu':
    case 'pause':
    case 'game-over':
    case 'settings':
    case 'inventory':
    case 'shop':
    case 'credits':
    case 'loading':
      return 'ortho2d';
    default:
      return 'orbit';
  }
}

/**
 * Construct the active camera for `scene` based on `screen.kind` and
 * `hints`. Returns the constructed Camera (already attached to the scene).
 *
 * The caller may attach pointer / keyboard controls separately.
 */
export function buildCamera(
  scene: Scene,
  screen: Screen,
  hints?: RunnerScreenHints,
  canvas?: HTMLCanvasElement | null,
): Camera {
  const kind = resolveCameraKind(screen, hints);
  switch (kind) {
    case 'fps':
      return buildFpsCamera(scene, canvas);
    case 'topdown':
      return buildTopdownCamera(scene, canvas);
    case 'ortho2d':
      return buildOrtho2dCamera(scene, canvas);
    case 'orbit':
    default:
      return buildOrbitCamera(scene, canvas);
  }
}

function buildOrbitCamera(
  scene: Scene,
  canvas?: HTMLCanvasElement | null,
): ArcRotateCamera {
  const cam = new ArcRotateCamera(
    'orbit-camera',
    -Math.PI / 2,
    Math.PI / 3,
    8,
    new Vector3(0, 1, 0),
    scene,
  );
  cam.lowerRadiusLimit = 2;
  cam.upperRadiusLimit = 40;
  cam.wheelDeltaPercentage = 0.01;
  cam.minZ = 0.1;
  if (canvas) cam.attachControl(canvas, true);
  return cam;
}

function buildFpsCamera(
  scene: Scene,
  canvas?: HTMLCanvasElement | null,
): UniversalCamera {
  const cam = new UniversalCamera('fps-camera', new Vector3(0, 1.7, -5), scene);
  cam.speed = 0.2;
  cam.angularSensibility = 4000;
  cam.minZ = 0.05;
  cam.setTarget(new Vector3(0, 1.5, 0));
  if (canvas) cam.attachControl(canvas, true);
  return cam;
}

function buildTopdownCamera(
  scene: Scene,
  canvas?: HTMLCanvasElement | null,
): ArcRotateCamera {
  const cam = new ArcRotateCamera(
    'topdown-camera',
    -Math.PI / 2,
    0.01,
    20,
    Vector3.Zero(),
    scene,
  );
  cam.lowerBetaLimit = 0.0;
  cam.upperBetaLimit = Math.PI / 6;
  cam.lowerRadiusLimit = 5;
  cam.upperRadiusLimit = 60;
  if (canvas) cam.attachControl(canvas, true);
  return cam;
}

function buildOrtho2dCamera(
  scene: Scene,
  _canvas?: HTMLCanvasElement | null,
): UniversalCamera {
  const cam = new UniversalCamera('ortho2d-camera', new Vector3(0, 0, -10), scene);
  cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
  cam.setTarget(Vector3.Zero());
  cam.orthoLeft = -5;
  cam.orthoRight = 5;
  cam.orthoTop = 5;
  cam.orthoBottom = -5;
  cam.minZ = -100;
  // Intentionally no `attachControl` for ortho2d screens — they're UI only.
  return cam;
}
