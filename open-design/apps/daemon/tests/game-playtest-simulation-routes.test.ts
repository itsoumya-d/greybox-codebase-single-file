import http from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameEnginePackagePreflightResponse } from '@ai-game-design-studio/contracts/api/projects';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };
type ProjectEvent = { event: string; data: any };

let server: http.Server | undefined;
let baseUrl = '';
const projectIds: string[] = [];

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');
const serverRuntimeDataRoot = process.env.AGDS_DATA_DIR
  ? path.resolve(projectRoot, process.env.AGDS_DATA_DIR)
  : path.join(projectRoot, '.agds');

beforeEach(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  server = started.server;
  baseUrl = started.url;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
  const ids = projectIds.splice(0);
  await Promise.all(
    ids.map((projectId) =>
      rm(path.join(serverRuntimeDataRoot, 'projects', projectId), { recursive: true, force: true }),
    ),
  );
});

function uniqueProjectId(): string {
  const id = `game-playtest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  projectIds.push(id);
  return id;
}

async function createProject(projectId: string) {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'Automated playtest simulation' }),
  });
  expect(response.status).toBe(200);
}

async function writeGameViewport(projectId: string, fileName: string, document: unknown) {
  const dir = path.join(serverRuntimeDataRoot, 'projects', projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), JSON.stringify(document, null, 2), 'utf8');
}

async function writeProjectText(projectId: string, fileName: string, content: string) {
  const dir = path.join(serverRuntimeDataRoot, 'projects', projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), content, 'utf8');
}

async function openProjectEvents(projectId: string) {
  const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/events`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) {
    throw new Error(`failed to open project event stream: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: ProjectEvent[] = [];
  const pump = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
        if (!raw.trim() || raw.startsWith(':')) continue;
        const event: ProjectEvent = { event: 'message', data: '' };
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) event.event = line.slice(7);
          if (line.startsWith('data: ')) event.data += line.slice(6);
        }
        event.data = event.data ? JSON.parse(event.data) : null;
        events.push(event);
      }
    }
  })();

  return {
    async waitFor(predicate: (event: ProjectEvent) => boolean) {
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        const match = events.find(predicate);
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`timed out waiting for project event; seen=${JSON.stringify(events)}`);
    },
    async close() {
      await reader.cancel().catch(() => {});
      await pump.catch(() => {});
    },
  };
}

describe('game playtest simulation routes', () => {
  it('simulates a game viewport artifact, reports deterministic design risks, and broadcasts the result', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeGameViewport(projectId, 'risky-foundry.gameview.json', {
      version: 1,
      kind: 'game-viewport',
      surface: 'gameplay',
      title: 'Risky Foundry Duel',
      entities: [
        { id: 'ranged-squad-a', name: 'Ranged squad A', type: 'enemy-spawn', x: 420, y: 220 },
        { id: 'ranged-squad-b', name: 'Ranged squad B', type: 'enemy-spawn', x: 560, y: 260 },
        { id: 'floor-hazard-a', name: 'Untelegraphed floor hazard', type: 'hazard', x: 490, y: 300 },
        { id: 'ambush-trigger', name: 'Ambush trigger', type: 'trigger', x: 360, y: 200 },
      ],
      terrainZones: [
        {
          id: 'hazard-pocket',
          name: 'Hot foundry spill',
          type: 'hazard-field',
          x: 440,
          y: 260,
          w: 180,
          h: 90,
        },
      ],
      paths: [
        {
          id: 'critical-path',
          name: 'Critical path',
          type: 'objective',
          points: [{ x: 80, y: 180 }],
        },
      ],
    });
    const stream = await openProjectEvents(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/playtest-simulation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'risky-foundry.gameview.json',
        runs: 7,
        focus: 'combat',
        personas: ['speedrunner', 'completionist', 'rage-quitter'],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.fileName).toBe('risky-foundry.gameview.json');
    expect(body.runs).toBe(7);
    expect(body.focus).toBe('combat');
    expect(body.summary).toContain('Risky Foundry Duel');
    expect(body.metrics.map((metric: { id: string }) => metric.id)).toEqual(
      expect.arrayContaining(['route-count', 'pressure-score', 'checkpoint-count', 'accessibility-notes']),
    );
    expect(body.findings.map((finding: { id: string }) => finding.id)).toEqual(
      expect.arrayContaining([
        'missing-player-spawn',
        'missing-objective',
        'missing-playable-route',
        'combat-without-checkpoint',
        'missing-accessibility-notes',
      ]),
    );
    expect(body.findings.some((finding: { severity: string }) => finding.severity === 'high')).toBe(true);
    expect(body.summary).toContain('Persona reports');
    expect(body.personaReports.map((report: { id: string }) => report.id)).toEqual([
      'speedrunner',
      'completionist',
      'rage-quitter',
    ]);
    const rageQuitter = body.personaReports.find((report: { id: string }) => report.id === 'rage-quitter');
    expect(rageQuitter).toMatchObject({
      label: 'Rage-Quit Risk Player',
      risk: 'high',
    });
    expect(rageQuitter.frustrationMoments.length).toBeGreaterThan(0);
    expect(rageQuitter.balanceIssues.join('\n')).toContain('Combat pressure exists without a recovery checkpoint');
    expect(rageQuitter.balanceIssues.length).toBeGreaterThan(0);

    const playtestEvent = await stream.waitFor((event) => event.event === 'game_playtest_simulation');
    expect(playtestEvent.data).toMatchObject({
      type: 'game_playtest_simulation',
      action: 'simulated',
      projectId,
      fileName: 'risky-foundry.gameview.json',
      runs: 7,
      findingCount: body.findings.length,
      highestRisk: 'high',
      personaCount: 3,
    });

    await stream.close();
  });

  it('returns a clear error when a project has no game viewport document to simulate', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/playtest-simulation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runs: 3, focus: 'navigation' }),
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as any;
    expect(String(body.error?.message ?? body.error)).toContain('no .gameview.json viewport document found');
  });

  it('simulates terrain collision samples for sculpted deformation routes', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeGameViewport(projectId, 'terrain-runtime.gameview.json', {
      version: 1,
      kind: 'game-viewport',
      surface: 'level-viewport',
      title: 'Terrain Runtime Ridge',
      objective: 'Cross the raised ridge without collision snags.',
      camera: 'third-person shoulder camera with reduced motion assist',
      entities: [
        { id: 'player-start', name: 'Player Start', type: 'player-spawn', x: 0, y: 0 },
        { id: 'ridge-goal', name: 'Ridge Goal', type: 'objective', x: 100, y: 0 },
        { id: 'ridge-checkpoint', name: 'Ridge Checkpoint', type: 'checkpoint', x: 20, y: 0 },
      ],
      paths: [
        {
          id: 'critical-ridge-route',
          name: 'Critical Ridge Route',
          type: 'critical-path',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      ],
      terrainSculptPatches: [
        {
          id: 'ridge-sculpt',
          name: 'Raised Ridge Sculpt',
          type: 'mesh-deformation',
          x: 50,
          y: 0,
          radius: 70,
          height: 2.1,
          falloff: 'linear',
          samples: [{ x: 50, y: 0, height: 2.1, radius: 70 }],
          traversalImpact: 'Dashable ridge with readable collision assist, but the crest still needs slope tuning.',
        },
      ],
      accessibilityNotes: ['Reduced-motion camera and high-contrast ridge edge cue.'],
    });

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/playtest-simulation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'terrain-runtime.gameview.json', runs: 2, focus: 'navigation' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.metrics.map((metric: { id: string }) => metric.id)).toEqual(
      expect.arrayContaining([
        'terrain-sculpt-patches',
        'terrain-collision-samples',
        'terrain-max-height',
        'terrain-steep-slope-samples',
      ]),
    );
    const steepSlopeMetric = body.metrics.find((metric: { id: string }) => metric.id === 'terrain-steep-slope-samples');
    expect(steepSlopeMetric.value).toBeGreaterThan(0);
    expect(body.findings.map((finding: { id: string }) => finding.id)).toContain('terrain-deformation-slope-risk');
    expect(body.findings.map((finding: { id: string }) => finding.id)).not.toContain('terrain-deformation-missing-collision-intent');
  });

  it('generates a WebGL gameview runtime with terrain collision and world hooks', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeGameViewport(projectId, 'engine-runtime.gameview.json', {
      version: 1,
      kind: 'game-viewport',
      surface: 'gameplay',
      title: 'Engine Runtime Frontier',
      objective: 'Cross a reactive faction ridge while a storm event changes visibility.',
      entities: [
        { id: 'player-start', name: 'Player Start', type: 'player-spawn', x: 40, y: 80 },
        { id: 'storm-boss', name: 'Storm Boss', type: 'enemy-spawn', x: 520, y: 260, faction: 'Storm Court' },
      ],
      paths: [{ id: 'critical-route', name: 'Critical Route', type: 'critical-path', points: [{ x: 40, y: 80 }, { x: 520, y: 260 }] }],
      terrainZones: [
        { id: 'hazard-zone', name: 'Lightning Hazard', type: 'hazard-field', x: 240, y: 160, w: 180, h: 120, notes: 'Readable danger collision volume.' },
      ],
      terrainSculptPatches: [
        { id: 'ridge', name: 'Runtime Ridge', type: 'mesh-deformation', x: 320, y: 210, radius: 92, height: 1.4, samples: [{ x: 320, y: 210, height: 1.4, radius: 92 }] },
      ],
      dynamicEvents: [{ id: 'storm-shift', name: 'Storm Shift', trigger: 'tick-3', impact: 'Visibility drops and faction patrols move.' }],
      worldSimulation: {
        weather: 'Electric storm front',
        factionTerritory: ['Storm Court ridge'],
        reactiveRules: ['Storm Court gains control when the player delays at the ridge.'],
      },
    });
    const stream = await openProjectEvents(projectId);

    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/gameview-runtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'engine-runtime.gameview.json',
          writeFileName: 'engine-runtime-webgl.html',
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body).toMatchObject({
        fileName: 'engine-runtime.gameview.json',
        engine: 'webgl-canvas',
        terrainColliderCount: 2,
        terrainSculptPatchCount: 1,
        dynamicEventCount: 1,
        factionCount: 1,
        writtenFileName: 'engine-runtime-webgl.html',
      });
      expect(body.runtimeHooks).toEqual(
        expect.arrayContaining([
          'window.__AGDS_GAMEVIEW_RUNTIME__.terrainHeightAt(x, y)',
          'window.__AGDS_GAMEVIEW_RUNTIME__.terrainCollisionAt(x, y)',
          'window.__AGDS_GAMEVIEW_RUNTIME__.advanceWorldTick(dt)',
        ]),
      );
      expect(body.html).toContain('data-agds-engine="webgl-canvas"');
      expect(body.html).toContain('window.__AGDS_GAMEVIEW_RUNTIME__');
      expect(body.html).toContain('terrainCollisionAt');

      const written = await readFile(
        path.join(serverRuntimeDataRoot, 'projects', projectId, 'engine-runtime-webgl.html'),
        'utf8',
      );
      expect(written).toContain('AI Game Design Studio WebGL runtime');

      const event = await stream.waitFor((entry) => entry.event === 'game_engine_runtime');
      expect(event.data).toMatchObject({
        type: 'game_engine_runtime',
        action: 'generated',
        projectId,
        engine: 'webgl-canvas',
        writtenFileName: 'engine-runtime-webgl.html',
        terrainColliderCount: 2,
        dynamicEventCount: 1,
      });
    } finally {
      await stream.close();
    }
  });

  it('exports native Unity Godot and Unreal gameview runtime packages', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeGameViewport(projectId, 'native-runtime.gameview.json', {
      version: 1,
      kind: 'game-viewport',
      surface: 'gameplay',
      title: 'Native Runtime Frontier',
      objective: 'Validate engine-side traversal and faction-state hooks.',
      entities: [
        { id: 'player-start', name: 'Player Start', type: 'player-spawn', x: 40, y: 80 },
        { id: 'rival-patrol', name: 'Rival Patrol', type: 'enemy-spawn', x: 460, y: 240, faction: 'Rival House' },
      ],
      terrainZones: [
        { id: 'blocked-bridge', name: 'Blocked Bridge', type: 'blocking-hazard', x: 180, y: 130, w: 160, h: 70 },
      ],
      terrainSculptPatches: [
        { id: 'raised-bridge', name: 'Raised Bridge', type: 'height-sculpt', x: 220, y: 150, radius: 88, height: 1.1 },
      ],
      dynamicEvents: [{ id: 'patrol-shift', name: 'Patrol Shift', trigger: 'tick-2', impact: 'Rival House control rises.' }],
      worldSimulation: {
        weather: 'Cold rain',
        factionTerritory: ['Rival House bridge'],
      },
    });
    const stream = await openProjectEvents(projectId);

    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/gameview-runtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'native-runtime.gameview.json',
          engine: 'native-package',
          writePackage: true,
          packageDirectory: 'engine-exports/native-runtime',
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body).toMatchObject({
        fileName: 'native-runtime.gameview.json',
        engine: 'native-package',
        terrainColliderCount: 2,
        terrainSculptPatchCount: 1,
        dynamicEventCount: 1,
        factionCount: 1,
      });
      expect(body.runtimeHooks).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Unity: AGDSGameViewRuntime.TerrainHeightAt'),
          expect.stringContaining('Godot: AGDSGameViewRuntime.terrain_height_at'),
          expect.stringContaining('Unreal: UAGDSGameViewRuntimeComponent TerrainHeightAt'),
        ]),
      );
      expect(body.files.map((file: { path: string }) => file.path)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/unity\/AGDSGameViewRuntime\.cs$/),
          expect.stringMatching(/godot\/agds_gameview_runtime\.gd$/),
          expect.stringMatching(/unreal\/AGDSGameViewRuntimeComponent\.h$/),
          expect.stringMatching(/unreal\/AGDSGameViewRuntimeComponent\.cpp$/),
          expect.stringMatching(/ENGINE_EXPORT_README\.md$/),
        ]),
      );
      expect(body.writtenFileNames).toHaveLength(5);

      const unityFile = body.writtenFileNames.find((name: string) => name.endsWith('unity/AGDSGameViewRuntime.cs'));
      const godotFile = body.writtenFileNames.find((name: string) => name.endsWith('godot/agds_gameview_runtime.gd'));
      const unrealFile = body.writtenFileNames.find((name: string) => name.endsWith('unreal/AGDSGameViewRuntimeComponent.cpp'));
      expect(unityFile).toBeTruthy();
      expect(godotFile).toBeTruthy();
      expect(unrealFile).toBeTruthy();
      const unitySource = await readFile(path.join(serverRuntimeDataRoot, 'projects', projectId, unityFile), 'utf8');
      const godotSource = await readFile(path.join(serverRuntimeDataRoot, 'projects', projectId, godotFile), 'utf8');
      const unrealSource = await readFile(path.join(serverRuntimeDataRoot, 'projects', projectId, unrealFile), 'utf8');
      expect(unitySource).toContain('public float TerrainHeightAt(Vector2 position)');
      expect(unitySource).toContain('public TerrainCollision TerrainCollisionAt(Vector2 position)');
      expect(godotSource).toContain('func terrain_height_at(position: Vector2)');
      expect(godotSource).toContain('func advance_world_tick(delta: float)');
      expect(unrealSource).toContain('UAGDSGameViewRuntimeComponent::TerrainHeightAt');
      expect(unrealSource).toContain('UAGDSGameViewRuntimeComponent::AdvanceWorldTick');

      const event = await stream.waitFor((entry) => entry.event === 'game_engine_runtime');
      expect(event.data).toMatchObject({
        type: 'game_engine_runtime',
        action: 'generated',
        projectId,
        engine: 'native-package',
        terrainColliderCount: 2,
        dynamicEventCount: 1,
      });
      expect(event.data.writtenFileNames).toHaveLength(5);
    } finally {
      await stream.close();
    }
  });

  it('downloads engine package zips for Unreal and Godot plugin importers', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeGameViewport(projectId, 'package-route.gameview.json', {
      version: 1,
      kind: 'game-viewport',
      surface: 'gameplay',
      title: 'Engine Package Route',
      objective: 'Validate plugin-consumable engine package downloads.',
      entities: [
        { id: 'player-start', name: 'Player Start', type: 'player-spawn', x: 32, y: 64 },
        { id: 'sentinel', name: 'Route Sentinel', type: 'enemy-spawn', x: 420, y: 180 },
      ],
      terrainZones: [
        { id: 'gate-hazard', name: 'Gate Hazard', type: 'blocking-hazard', x: 120, y: 80, w: 96, h: 72 },
      ],
      terrainSculptPatches: [
        { id: 'watch-ridge', name: 'Watch Ridge', type: 'height-sculpt', x: 220, y: 140, radius: 64, height: 1.25 },
      ],
      dynamicEvents: [
        { id: 'gate-alarm', name: 'Gate Alarm', trigger: 'tick-1', impact: 'Enemy pressure rises.' },
      ],
      worldSimulation: {
        weather: 'Red dust',
        factionTerritory: ['Sentinel Gate'],
      },
    });

    const stream = await openProjectEvents(projectId);
    try {
      await stream.waitFor((entry) => entry.event === 'ready' && entry.data.projectId === projectId);

      const preflightResponse = await fetch(`${baseUrl}/api/projects/${projectId}/engine-package/unreal/preflight?fileName=package-route.gameview.json`);
      expect(preflightResponse.status).toBe(200);
      const preflight = (await preflightResponse.json()) as GameEnginePackagePreflightResponse;
      expect(preflight).toMatchObject({
        projectId,
        projectName: 'Automated playtest simulation',
        sourceFileName: 'package-route.gameview.json',
        packageFileName: 'Automated-playtest-simulation-package-route-unreal.zip',
        engine: 'unreal',
      });
      expect(preflight.fileCount).toBeGreaterThanOrEqual(4);
      expect(preflight.sizeBytes).toBeGreaterThan(0);
      expect(preflight.contentRevisionSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(preflight.manifest).toMatchObject({
        projectId,
        engine: 'unreal',
        sourceFileName: 'package-route.gameview.json',
        contentRevisionSha256: preflight.contentRevisionSha256,
        terrainColliderCount: 2,
        dynamicEventCount: 1,
      });
      expect(preflight.manifest.files.length).toBe(preflight.fileCount - 1);

      const unrealResponse = await fetch(`${baseUrl}/api/projects/${projectId}/engine-package/unreal?fileName=package-route.gameview.json`);
      expect(unrealResponse.status).toBe(200);
      expect(unrealResponse.headers.get('content-type')).toContain('application/zip');
      expect(unrealResponse.headers.get('x-greybox-engine-package-content-revision-sha256')).toMatch(/^[0-9a-f]{64}$/u);
      expect(unrealResponse.headers.get('content-disposition')).toMatch(/Automated-playtest-simulation-package-route-unreal\.zip/u);
      expect(unrealResponse.headers.get('x-greybox-engine')).toBe('unreal');
      expect(Number(unrealResponse.headers.get('x-greybox-engine-package-file-count'))).toBeGreaterThanOrEqual(4);

      const unrealZip = await JSZip.loadAsync(Buffer.from(await unrealResponse.arrayBuffer()));
      const unrealManifestText = await unrealZip.file('GreyboxEnginePackageManifest.json')?.async('string');
      expect(unrealManifestText).toBeTruthy();
      const unrealManifest = JSON.parse(unrealManifestText ?? '{}');
      expect(unrealManifest).toMatchObject({
        generator: 'Greybox + human designer',
        projectId,
        projectName: 'Automated playtest simulation',
        sourceFileName: 'package-route.gameview.json',
        engine: 'unreal',
        terrainColliderCount: 2,
        terrainSculptPatchCount: 1,
        dynamicEventCount: 1,
        factionCount: 1,
      });
      expect(unrealManifest.files.map((file: { path: string }) => file.path)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/unreal\/AGDSGameViewRuntimeComponent\.h$/),
          expect.stringMatching(/unreal\/AGDSGameViewRuntimeComponent\.cpp$/),
          expect.stringMatching(/ENGINE_EXPORT_README\.md$/),
        ]),
      );
      const unrealSourcePath = unrealManifest.files.find((file: { path: string }) =>
        file.path.endsWith('unreal/AGDSGameViewRuntimeComponent.cpp'),
      )?.path;
      const unrealSource = await unrealZip.file(unrealSourcePath)?.async('string');
      expect(unrealSource).toContain('UAGDSGameViewRuntimeComponent::TerrainCollisionAt');
      const unrealEvent = await stream.waitFor((entry) =>
        entry.event === 'game_engine_package' && entry.data.engine === 'unreal',
      );
      expect(unrealEvent.data).toMatchObject({
        type: 'game_engine_package',
        action: 'downloaded',
        projectId,
        sourceFileName: 'package-route.gameview.json',
        packageFileName: 'Automated-playtest-simulation-package-route-unreal.zip',
        engine: 'unreal',
        terrainColliderCount: 2,
        dynamicEventCount: 1,
        factionCount: 1,
      });
      expect(unrealEvent.data.fileCount).toBeGreaterThanOrEqual(4);

      const godotResponse = await fetch(`${baseUrl}/api/projects/${projectId}/engine-package/godot?fileName=package-route.gameview.json`);
      expect(godotResponse.status).toBe(200);
      expect(godotResponse.headers.get('x-greybox-engine')).toBe('godot');
      const godotZip = await JSZip.loadAsync(Buffer.from(await godotResponse.arrayBuffer()));
      const godotManifestText = await godotZip.file('GreyboxEnginePackageManifest.json')?.async('string');
      const godotManifest = JSON.parse(godotManifestText ?? '{}');
      expect(godotManifest).toMatchObject({
        projectId,
        sourceFileName: 'package-route.gameview.json',
        engine: 'godot',
      });
      const godotSourcePath = godotManifest.files.find((file: { path: string }) =>
        file.path.endsWith('godot/agds_gameview_runtime.gd'),
      )?.path;
      const godotSource = await godotZip.file(godotSourcePath)?.async('string');
      expect(godotSource).toContain('func terrain_collision_at(position: Vector2)');
      const godotEvent = await stream.waitFor((entry) =>
        entry.event === 'game_engine_package' && entry.data.engine === 'godot',
      );
      expect(godotEvent.data).toMatchObject({
        type: 'game_engine_package',
        action: 'downloaded',
        projectId,
        sourceFileName: 'package-route.gameview.json',
        packageFileName: 'Automated-playtest-simulation-package-route-godot.zip',
        engine: 'godot',
      });
    } finally {
      await stream.close();
    }
  });

  it('runs a runtime player-bot pass against a playable HTML game artifact and broadcasts the result', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeProjectText(projectId, 'ember-runner.html', `<!doctype html>
      <html>
        <head>
          <title>Ember Runner Playable</title>
          <style>
            @media (prefers-reduced-motion: reduce) { * { animation: none; } }
          </style>
        </head>
        <body>
          <main id="hud" aria-label="HUD health stamina ammo objective marker">
            <h1>Ember Runner Playable</h1>
            <p>Objective: reach the extraction checkpoint before the boss health timer expires.</p>
            <button data-player-action="start-run" aria-label="Start run">Start Run</button>
            <button data-player-action="attack" aria-label="Attack enemy">Attack</button>
            <section aria-label="Subtitles and colorblind-safe status">Subtitles on. Health 100. Stamina 80. Ammo 12. Retry at checkpoint.</section>
          </main>
          <canvas id="game" width="960" height="540" aria-label="combat canvas"></canvas>
          <script>
            const state = { health: 100, stamina: 80, objective: 'extract', enemy: 'boss' };
            window.addEventListener('keydown', (event) => {
              if (event.code === 'ArrowUp' || event.code === 'KeyW') state.stamina -= 1;
            });
            window.addEventListener('touchstart', () => { state.objective = 'mobile tap'; });
            function gameLoop() {
              requestAnimationFrame(gameLoop);
            }
            gameLoop();
          </script>
        </body>
      </html>`);
    const stream = await openProjectEvents(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/runtime-playtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'ember-runner.html',
        runs: 4,
        focus: 'mobile',
        personas: ['casual', 'explorer'],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.fileName).toBe('ember-runner.html');
    expect(body.mode).toBe('playable-artifact');
    expect(body.runs).toBe(4);
    expect(body.summary).toContain('runtime player-bot');
    expect(body.summary).toContain('Persona reports');
    expect(body.metrics.map((metric: { id: string }) => metric.id)).toEqual(
      expect.arrayContaining(['interactive-targets', 'input-modalities', 'runtime-loop', 'hud-signals', 'objective-signals']),
    );
    expect(body.botActions.map((action: { id: string }) => action.id)).toEqual(
      expect.arrayContaining(['launch-artifact', 'read-objective', 'drive-input', 'read-hud-state', 'probe-combat-feedback']),
    );
    expect(body.findings.some((finding: { severity: string }) => finding.severity === 'high')).toBe(false);
    expect(body.personaReports.map((report: { id: string }) => report.id)).toEqual(['casual', 'explorer']);
    expect(body.personaReports.every((report: { risk: string }) => report.risk === 'low')).toBe(true);
    expect(body.personaReports[0].acceptedSignals.join('\n')).toContain('Runtime loop is detectable.');

    const playtestEvent = await stream.waitFor((event) => event.event === 'game_playtest_simulation');
    expect(playtestEvent.data).toMatchObject({
      type: 'game_playtest_simulation',
      action: 'simulated',
      projectId,
      fileName: 'ember-runner.html',
      mode: 'playable-artifact',
      runs: 4,
      findingCount: body.findings.length,
      highestRisk: 'low',
      personaCount: 2,
    });

    await stream.close();
  });

  it('executes a daemon headless-browser player-bot pass against a playable HTML game artifact', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    await writeProjectText(projectId, 'headless-ember-runner.html', `<!doctype html>
      <html>
        <head>
          <title>Headless Ember Runner</title>
          <style>
            @media (prefers-reduced-motion: reduce) { * { animation: none; } }
          </style>
        </head>
        <body>
          <main id="hud" aria-label="HUD health stamina ammo objective marker">
            <h1>Headless Ember Runner</h1>
            <p id="objective">Objective: reach the extraction checkpoint and trigger victory.</p>
            <p id="stats" aria-live="polite">Health 100. Stamina 80. Ammo 12. Score 0. Retry at checkpoint.</p>
            <button data-player-action="start-run" aria-label="Start run">Start Run</button>
            <button data-player-action="attack" aria-label="Attack enemy">Attack Enemy</button>
            <button data-player-action="extract" aria-label="Extract">Extract</button>
            <section aria-label="Subtitles and colorblind-safe status">Subtitles enabled. Colorblind-safe boss health and objective markers enabled.</section>
          </main>
          <canvas id="game" width="960" height="540" aria-label="combat canvas"></canvas>
          <script>
            window.__AGDS_PLAYTEST_STATE__ = { health: 100, stamina: 80, ammo: 12, score: 0, objective: 'checkpoint' };
            const stats = document.getElementById('stats');
            const objective = document.getElementById('objective');
            function render() {
              stats.textContent = 'HUD Health ' + window.__AGDS_PLAYTEST_STATE__.health
                + '. Stamina ' + window.__AGDS_PLAYTEST_STATE__.stamina
                + '. Ammo ' + window.__AGDS_PLAYTEST_STATE__.ammo
                + '. Score ' + window.__AGDS_PLAYTEST_STATE__.score
                + '. Retry at checkpoint.';
              objective.textContent = 'Objective: ' + window.__AGDS_PLAYTEST_STATE__.objective + ' victory route active.';
            }
            document.querySelector('[data-player-action="start-run"]').addEventListener('click', () => {
              window.__AGDS_PLAYTEST_STATE__.objective = 'extract';
              window.__AGDS_PLAYTEST_STATE__.score += 1;
              render();
            });
            document.querySelector('[data-player-action="attack"]').addEventListener('click', () => {
              window.__AGDS_PLAYTEST_STATE__.ammo -= 1;
              window.__AGDS_PLAYTEST_STATE__.score += 5;
              render();
            });
            document.querySelector('[data-player-action="extract"]').addEventListener('click', () => {
              window.__AGDS_PLAYTEST_STATE__.objective = 'victory extraction checkpoint';
              render();
            });
            window.addEventListener('keydown', (event) => {
              if (event.code === 'ArrowRight' || event.code === 'KeyD') {
                window.__AGDS_PLAYTEST_STATE__.stamina -= 1;
                render();
              }
            });
            function gameLoop() {
              requestAnimationFrame(gameLoop);
            }
            render();
            gameLoop();
          </script>
        </body>
      </html>`);
    const stream = await openProjectEvents(projectId);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/runtime-playtest/browser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'headless-ember-runner.html',
        runs: 2,
        focus: 'combat',
        personas: ['speedrunner', 'casual'],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.fileName).toBe('headless-ember-runner.html');
    expect(body.mode).toBe('headless-browser');
    expect(body.runs).toBe(2);
    expect(body.summary).toContain('headless-browser player-bot');
    expect(body.summary).toContain('Persona reports');
    expect(body.metrics.map((metric: { id: string }) => metric.id)).toEqual(
      expect.arrayContaining(['dom-interactive-targets', 'browser-clicked-controls', 'console-errors', 'page-errors', 'browser-hud-readable']),
    );
    expect(body.metrics.find((metric: { id: string }) => metric.id === 'page-errors')?.value).toBe(0);
    expect(body.botActions.map((action: { id: string }) => action.id)).toEqual(
      expect.arrayContaining([
        'headless-launch',
        'headless-click-controls',
        'headless-keyboard-drive',
        'headless-pointer-probe',
        'headless-read-hud-state',
      ]),
    );
    expect(body.findings.some((finding: { severity: string }) => finding.severity === 'high')).toBe(false);
    expect(body.personaReports.map((report: { id: string }) => report.id)).toEqual(['speedrunner', 'casual']);
    expect(body.personaReports.every((report: { risk: string }) => report.risk === 'low')).toBe(true);
    expect(body.personaReports[0].acceptedSignals.join('\n')).toContain('Runtime loop is detectable.');

    const playtestEvent = await stream.waitFor((event) => event.event === 'game_playtest_simulation');
    expect(playtestEvent.data).toMatchObject({
      type: 'game_playtest_simulation',
      action: 'simulated',
      projectId,
      fileName: 'headless-ember-runner.html',
      mode: 'headless-browser',
      runs: 2,
      findingCount: body.findings.length,
      highestRisk: 'low',
      personaCount: 2,
    });

    await stream.close();
  }, 120_000);

  it('persists shared persona playtest presets for studio reviews', async () => {
    const projectId = uniqueProjectId();
    await createProject(projectId);
    const stream = await openProjectEvents(projectId);

    const empty = await fetch(`${baseUrl}/api/projects/${projectId}/playtest-presets`);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ projectId, presets: [] });

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/playtest-presets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presets: [
          {
            id: 'browser-smoke',
            name: 'Browser Smoke',
            mode: 'headless-browser',
            fileName: 'runtime-player-bot.html',
            focus: 'combat',
            runs: 99,
            personas: ['casual', 'explorer', 'casual'],
            updatedAt: 1700000000000,
          },
          {
            id: 'invalid-empty-personas',
            name: 'Invalid',
            mode: 'viewport-artifact',
            personas: [],
            updatedAt: 1700000000001,
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.projectId).toBe(projectId);
    expect(body.presets).toEqual([
      {
        id: 'browser-smoke',
        name: 'Browser Smoke',
        mode: 'headless-browser',
        fileName: 'runtime-player-bot.html',
        focus: 'combat',
        runs: 20,
        personas: ['casual', 'explorer'],
        updatedAt: 1700000000000,
      },
    ]);

    const persisted = JSON.parse(
      await readFile(
        path.join(serverRuntimeDataRoot, 'projects', projectId, '.agds', 'playtest-presets', 'presets.json'),
        'utf8',
      ),
    );
    expect(persisted).toEqual(body.presets);

    const reread = await fetch(`${baseUrl}/api/game-deliverables/${projectId}/playtest-presets`);
    expect(reread.status).toBe(200);
    expect(await reread.json()).toEqual(body);

    const event = await stream.waitFor((entry) => entry.event === 'game_playtest_presets');
    expect(event.data).toMatchObject({
      type: 'game_playtest_presets',
      action: 'updated',
      projectId,
      presetCount: 1,
    });

    await stream.close();
  });
});
