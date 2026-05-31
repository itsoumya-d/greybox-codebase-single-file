import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path, { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import {
  readGameAutonomousIterationLoopConfig,
  writeGameAutonomousIterationLoopConfig,
} from '../src/game-autonomous-iteration.js';
import {
  readGameBalanceLoopConfig,
  writeGameBalanceLoopConfig,
} from '../src/game-balance-loop.js';
import {
  readGameStudioOrchestrationLoopConfig,
  writeGameStudioOrchestrationLoopConfig,
} from '../src/game-studio-orchestration.js';
import { appendGameTelemetryEvents } from '../src/game-telemetry.js';
import { runStudioSchedulerOnce } from '../src/game-studio-scheduler.js';
import {
  readGameWorldSimulationLoopConfig,
  writeGameWorldSimulationLoopConfig,
} from '../src/game-world-simulation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const tempDirs: string[] = [];

afterEach(async () => {
  closeDatabase();
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createSchedulerProject(projectId: string) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'agds-scheduler-'));
  tempDirs.push(dataDir);
  const db = openDatabase(repoRoot, { dataDir });
  const now = Date.now();
  insertProject(db, {
    id: projectId,
    name: 'Scheduler Frontier',
    skillId: 'game-design-document',
    createdAt: now,
    updatedAt: now,
  });
  const projectDir = path.join(dataDir, 'projects', projectId);
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    path.join(projectDir, 'scheduler-frontier.gameview.json'),
    JSON.stringify({
      version: 1,
      kind: 'game-viewport',
      surface: 'world-map',
      title: 'Scheduler Frontier',
      entities: [
        { id: 'spawn', name: 'Player camp', type: 'player-spawn', x: 100, y: 180 },
        { id: 'ash-pact', name: 'Ash Pact border', type: 'faction', x: 340, y: 180, faction: 'Ash Pact' },
        { id: 'ranger-npc', name: 'Ranger outpost', type: 'npc', x: 420, y: 260, faction: 'Rangers' },
        { id: 'ore', name: 'Moon ore cache', type: 'resource-node', x: 520, y: 300 },
        { id: 'toxic-vent', name: 'Toxic vent', type: 'hazard', x: 610, y: 330 },
      ],
      terrainZones: [
        { id: 'flats', name: 'Red salt flats', type: 'biome', x: 250, y: 100, w: 260, h: 160 },
        { id: 'vent-field', name: 'Vent hazard belt', type: 'hazard-field', x: 560, y: 300, w: 180, h: 120 },
      ],
      dynamicEvents: [
        {
          id: 'ash-raid',
          name: 'Ash Pact raid',
          trigger: 'Faction pressure reaches the ranger outpost.',
          impact: 'War pressure raises patrol density and blocks a resource route.',
        },
      ],
      worldSimulation: {
        ecosystem: 'Storm grazers flee toxic vents and pull predators toward safer ridge lines.',
        factionTerritory: ['Ash Pact border', 'Ranger outpost'],
        weather: 'Ion storm reduces long-range visibility and raises traversal risk.',
      },
    }, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(projectDir, 'scheduler-balance.systems.json'),
    JSON.stringify({
      version: 1,
      kind: 'game-system',
      systemType: 'combat',
      title: 'Scheduler Combat Balance',
      tuning: {
        enemyTelegraphMs: 320,
        incomingDamageMultiplier: 1.2,
        currencySinkMultiplier: 1.1,
        objectiveHintDelaySeconds: 10,
      },
      metrics: [
        { id: 'readability', label: 'Combat readability', target: '80% understood deaths', current: '62%', risk: 'high' },
      ],
    }, null, 2),
    'utf8',
  );
  return { dataDir, projectDir };
}

async function withFakeAgent<T>(
  binName: string,
  script: string,
  run: () => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agds-scheduler-agent-bin-'));
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = path.join(dir, `${binName}-test-runner.cjs`);
      await writeFile(runner, script, 'utf8');
      await writeFile(
        path.join(dir, `${binName}.cmd`),
        `@echo off\r\nnode "${runner}" %*\r\n`,
        'utf8',
      );
    } else {
      const bin = path.join(dir, binName);
      await writeFile(bin, `#!/usr/bin/env node\n${script}`, 'utf8');
      await chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
}

describe('game studio scheduler', () => {
  it('runs due world-simulation and autonomous-iteration loops without the HTTP daemon', async () => {
    const projectId = `scheduler-game-${Date.now()}`;
    const { dataDir, projectDir } = await createSchedulerProject(projectId);
    const now = Date.now();
    await writeGameWorldSimulationLoopConfig(projectDir, {
      enabled: true,
      intervalMinutes: 15,
      fileName: 'scheduler-frontier.gameview.json',
      ticks: 4,
      scenario: 'external timer pass',
      nextRunAt: now - 1_000,
    });
    await writeGameAutonomousIterationLoopConfig(projectDir, {
      enabled: true,
      intervalMinutes: 60,
      fileName: 'scheduler-frontier.gameview.json',
      focus: 'external timer pass',
      maxActions: 6,
      includeTelemetry: true,
      includePlaytest: true,
      includeWorldSimulation: true,
      nextRunAt: now - 1_000,
    });
    await appendGameTelemetryEvents(projectDir, [
      {
        id: 'scheduler-combat-event',
        projectId,
        type: 'combat_event',
        timestamp: now,
        receivedAt: now,
        sessionId: 'scheduler-session',
        sceneId: 'scheduler-frontier',
        payload: { readable: false },
      },
    ]);
    await writeGameBalanceLoopConfig(projectDir, {
      enabled: true,
      intervalMinutes: 30,
      fileName: 'scheduler-frontier.gameview.json',
      systemFileName: 'scheduler-balance.systems.json',
      focus: 'external balance pass',
      maxAdjustments: 5,
      includeTelemetry: true,
      includePlaytest: true,
      apply: true,
      nextRunAt: now - 1_000,
    });
    await writeGameStudioOrchestrationLoopConfig(projectDir, {
      enabled: true,
      intervalMinutes: 45,
      focus: 'external studio work-order pass',
      maxWorkOrders: 7,
      includeDebates: true,
      targetFiles: ['scheduler-frontier.gameview.json', 'scheduler-balance.systems.json'],
      nextRunAt: now - 1_000,
    });

    const result = await runStudioSchedulerOnce({
      projectId,
      projectRoot: repoRoot,
      dataDir,
      now,
    });

    expect(result.results.map((entry) => [entry.task, entry.status])).toEqual([
      ['world-simulation', 'run'],
      ['autonomous-iteration', 'run'],
      ['balance-loop', 'run'],
      ['studio-orchestration', 'run'],
    ]);
    expect(result.results[0]).toMatchObject({
      task: 'world-simulation',
      eventCount: expect.any(Number),
      findingCount: expect.any(Number),
      summary: expect.stringContaining('Simulated 4 world ticks'),
    });
    expect(result.results[1]).toMatchObject({
      task: 'autonomous-iteration',
      actionCount: expect.any(Number),
      summary: expect.stringContaining('prioritized game-studio iteration action'),
    });
    expect(result.results[2]).toMatchObject({
      task: 'balance-loop',
      adjustmentCount: expect.any(Number),
      appliedCount: expect.any(Number),
      summary: expect.stringContaining('automatic balance adjustment'),
    });
    expect(result.results[3]).toMatchObject({
      task: 'studio-orchestration',
      workOrderCount: expect.any(Number),
      handoffCount: expect.any(Number),
      summary: expect.stringContaining('studio-agent work order'),
    });

    const worldConfig = await readGameWorldSimulationLoopConfig(projectDir);
    expect(worldConfig.lastRunAt).toBe(now);
    expect(worldConfig.lastState).toMatchObject({
      tick: 4,
      activeWeather: 'Ion storm reduces long-range visibility and raises traversal risk.',
      factionControl: expect.objectContaining({ 'Ash Pact border': expect.any(Number) }),
    });
    expect(worldConfig.nextRunAt).toBe(now + 15 * 60_000);

    const iterationConfig = await readGameAutonomousIterationLoopConfig(projectDir);
    expect(iterationConfig.lastRunAt).toBe(now);
    expect(iterationConfig.lastActionCount).toBeGreaterThan(0);
    expect(iterationConfig.nextRunAt).toBe(now + 60 * 60_000);

    const balanceConfig = await readGameBalanceLoopConfig(projectDir);
    expect(balanceConfig.lastRunAt).toBe(now);
    expect(balanceConfig.lastAdjustmentCount).toBeGreaterThan(0);
    expect(balanceConfig.lastAppliedCount).toBeGreaterThan(0);
    expect(balanceConfig.nextRunAt).toBe(now + 30 * 60_000);

    const orchestrationConfig = await readGameStudioOrchestrationLoopConfig(projectDir);
    expect(orchestrationConfig.lastRunAt).toBe(now);
    expect(orchestrationConfig.lastWorkOrderCount).toBeGreaterThan(0);
    expect(orchestrationConfig.lastHandoffCount).toBeGreaterThan(0);
    expect(orchestrationConfig.nextRunAt).toBe(now + 45 * 60_000);
  });

  it('auto-executes configured studio-agent work orders without the HTTP daemon', async () => {
    const projectId = `scheduler-agent-${Date.now()}`;
    const { dataDir, projectDir } = await createSchedulerProject(projectId);
    const now = Date.now();
    const captureDir = await mkdtemp(path.join(tmpdir(), 'agds-scheduler-agent-capture-'));
    tempDirs.push(captureDir);
    const captureFile = path.join(captureDir, 'prompts.txt');
    const previousCapture = process.env.AGDS_STUDIO_CAPTURE_PROMPTS;

    try {
      process.env.AGDS_STUDIO_CAPTURE_PROMPTS = captureFile;
      await writeGameStudioOrchestrationLoopConfig(projectDir, {
        enabled: true,
        intervalMinutes: 45,
        focus: 'offline scheduler child-agent execution',
        maxWorkOrders: 8,
        includeDebates: true,
        targetFiles: ['scheduler-frontier.gameview.json', 'scheduler-balance.systems.json'],
        autoExecute: true,
        agentId: 'opencode',
        maxExecutions: 2,
        waitForCompletion: true,
        nextRunAt: now - 1_000,
      });

      await withFakeAgent(
        'opencode-cli',
        `
const fs = require('fs');
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.AGDS_STUDIO_CAPTURE_PROMPTS, prompt + '\\n---AGDS-SCHEDULER-RUN---\\n');
  console.log(JSON.stringify({ type: 'text', part: { text: 'offline scheduler studio work order executed' } }));
});
`,
        async () => {
          const result = await runStudioSchedulerOnce({
            projectId,
            projectRoot: repoRoot,
            dataDir,
            tasks: ['studio-orchestration'],
            now,
          });

          expect(result.results).toEqual([
            expect.objectContaining({
              task: 'studio-orchestration',
              status: 'run',
              executionCount: 2,
              runIds: expect.arrayContaining([
                expect.stringContaining('scheduler-'),
              ]),
              reconciliationSummary: expect.stringContaining('Reconciled 2 child-agent execution runs'),
            }),
          ]);
        },
      );

      const orchestrationConfig = await readGameStudioOrchestrationLoopConfig(projectDir);
      expect(orchestrationConfig).toMatchObject({
        lastExecutionCount: 2,
        lastRunIds: expect.arrayContaining([expect.stringContaining('scheduler-')]),
        lastReconciliationSummary: expect.stringContaining('Reconciled 2 child-agent execution runs'),
      });
      const capturedPrompt = await readFile(captureFile, 'utf8');
      expect(capturedPrompt).toContain('Execute this AI Game Design Studio work order as the Game Director.');
      expect(capturedPrompt).toContain('Relevant debate checkpoints:');
    } finally {
      if (previousCapture == null) {
        delete process.env.AGDS_STUDIO_CAPTURE_PROMPTS;
      } else {
        process.env.AGDS_STUDIO_CAPTURE_PROMPTS = previousCapture;
      }
    }
  });

  it('skips enabled loops that are not due unless forced by an external timer', async () => {
    const projectId = `scheduler-skip-${Date.now()}`;
    const { dataDir, projectDir } = await createSchedulerProject(projectId);
    const now = Date.now();
    await writeGameWorldSimulationLoopConfig(projectDir, {
      enabled: true,
      intervalMinutes: 15,
      fileName: 'scheduler-frontier.gameview.json',
      ticks: 4,
      nextRunAt: now + 60_000,
    });

    const skipped = await runStudioSchedulerOnce({
      projectId,
      projectRoot: repoRoot,
      dataDir,
      tasks: ['world-simulation'],
      now,
    });
    expect(skipped.results).toEqual([
      expect.objectContaining({
        task: 'world-simulation',
        status: 'skipped',
        reason: expect.stringContaining('not due until'),
      }),
    ]);

    const forced = await runStudioSchedulerOnce({
      projectId,
      projectRoot: repoRoot,
      dataDir,
      tasks: ['world-simulation'],
      force: true,
      now,
    });
    expect(forced.results).toEqual([
      expect.objectContaining({
        task: 'world-simulation',
        status: 'run',
      }),
    ]);
  });
});
