/**
 * FlowDispatcher unit tests + a PrototypeRunner-level transition test.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  asComponentId,
  asScreenId,
  type ButtonComponent,
  validateGameProject,
} from '@greybox/schema';

import { FlowDispatcher } from '../src/FlowDispatcher.js';
import { PrototypeRunner } from '../src/PrototypeRunner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, 'fixtures/minimal-3d-project.json');

function loadFixture(): ReturnType<typeof validateGameProject> {
  const raw = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  return validateGameProject(raw);
}

function stubFetch(): typeof fetch {
  return (async () => new Response(new ArrayBuffer(8), { status: 200 })) as unknown as typeof fetch;
}

describe('FlowDispatcher', () => {
  it('resolves a scriptEvent edge from a button click with onClickEvent', () => {
    const project = loadFixture();
    const dispatcher = new FlowDispatcher(project);
    const button: ButtonComponent = {
      kind: 'Button',
      id: asComponentId('cmp-play-btn'),
      name: 'Play',
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      visible: true,
      label: 'Play',
      onClickEvent: 'evt-start',
    };
    const result = dispatcher.dispatch(
      { type: 'button-click', componentId: 'cmp-play-btn', button },
      asScreenId('screen-main-menu'),
    );
    expect(result.kind).toBe('goto-screen');
    if (result.kind === 'goto-screen') {
      expect(result.to).toBe('screen-level-1');
    }
  });

  it('emits a flow event when scriptEvent has no matching edge', () => {
    const project = loadFixture();
    const dispatcher = new FlowDispatcher(project);
    const result = dispatcher.dispatch(
      { type: 'script-event', eventId: 'evt-unknown' },
      asScreenId('screen-main-menu'),
    );
    expect(result.kind).toBe('emit-event');
  });

  it('returns none for a tap on a screen with no outgoing tap edges', () => {
    const project = loadFixture();
    const dispatcher = new FlowDispatcher(project);
    const button: ButtonComponent = {
      kind: 'Button',
      id: asComponentId('irrelevant'),
      name: 'X',
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      visible: true,
      label: 'X',
    };
    const result = dispatcher.dispatch(
      { type: 'button-click', componentId: 'irrelevant', button },
      asScreenId('screen-main-menu'),
    );
    expect(result.kind).toBe('none');
  });

  it('PrototypeRunner: button click transitions to target screen', async () => {
    const project = loadFixture();
    const runner = new PrototypeRunner(project, {
      enableHistory: false,
      enableAssetCache: false,
      fetchImpl: stubFetch(),
    });
    runner.attachHeadless();

    const screenEvents: Array<{ from: string | null; to: string }> = [];
    runner.on('screen-change', (e) => {
      screenEvents.push({ from: e.from, to: e.to });
    });

    await runner.goToScreen('screen-main-menu');
    expect(runner.status().currentScreenId).toBe('screen-main-menu');

    // Simulate a Play button click.
    const playBtn = project.screens
      .find((s) => s.id === 'screen-main-menu')!
      .components.find((c) => c.id === 'cmp-play-btn') as ButtonComponent;
    runner.handleSignal({
      type: 'button-click',
      componentId: 'cmp-play-btn',
      button: playBtn,
    });

    // The transition is fire-and-forget; wait a microtask.
    await new Promise((r) => setTimeout(r, 10));

    expect(runner.status().currentScreenId).toBe('screen-level-1');
    expect(screenEvents.map((e) => e.to)).toEqual([
      'screen-main-menu',
      'screen-level-1',
    ]);

    runner.dispose();
  });

  it('PrototypeRunner: fireEvent transitions when an edge matches', async () => {
    const project = loadFixture();
    const runner = new PrototypeRunner(project, {
      enableHistory: false,
      enableAssetCache: false,
      fetchImpl: stubFetch(),
    });
    runner.attachHeadless();
    await runner.goToScreen('screen-main-menu');

    let lastFlow: string | null = null;
    runner.on('flow-trigger', (e) => {
      lastFlow = e.eventName;
    });

    runner.fireEvent('evt-start');
    await new Promise((r) => setTimeout(r, 10));
    expect(runner.status().currentScreenId).toBe('screen-level-1');

    // An unknown event should emit a flow-trigger (not transition).
    runner.fireEvent('evt-bogus');
    await new Promise((r) => setTimeout(r, 10));
    expect(lastFlow).toBe('evt-bogus');

    runner.dispose();
  });

  it('PrototypeRunner: emits component-rendered for each component on screen', async () => {
    const project = loadFixture();
    const runner = new PrototypeRunner(project, {
      enableHistory: false,
      enableAssetCache: false,
      fetchImpl: stubFetch(),
    });
    runner.attachHeadless();

    const rendered: string[] = [];
    runner.on('component-rendered', (e) => rendered.push(e.componentId));
    await runner.goToScreen('screen-main-menu');
    expect(rendered).toContain('cmp-title');
    expect(rendered).toContain('cmp-play-btn');
    runner.dispose();
  });

  it('PrototypeRunner: status() returns the loaded history', async () => {
    const project = loadFixture();
    const runner = new PrototypeRunner(project, {
      enableHistory: false,
      enableAssetCache: false,
      fetchImpl: stubFetch(),
    });
    runner.attachHeadless();
    await runner.goToScreen('screen-main-menu');
    await runner.goToScreen('screen-level-1');
    const status = runner.status();
    expect(status.screenHistory.length).toBe(2);
    expect(status.screenHistory[0]).toBe('screen-main-menu');
    expect(status.screenHistory[1]).toBe('screen-level-1');
    runner.dispose();
  });

  it('PrototypeRunner: pause/resume emits paired events', async () => {
    const project = loadFixture();
    const runner = new PrototypeRunner(project, {
      enableHistory: false,
      enableAssetCache: false,
      fetchImpl: stubFetch(),
    });
    runner.attachHeadless();
    await runner.goToScreen('screen-main-menu');

    let paused = 0;
    let resumed = 0;
    runner.on('paused', () => paused++);
    runner.on('resumed', () => resumed++);

    runner.pause();
    runner.pause(); // idempotent
    runner.resume();
    runner.resume(); // idempotent

    expect(paused).toBe(1);
    expect(resumed).toBe(1);
    runner.dispose();
  });
});
