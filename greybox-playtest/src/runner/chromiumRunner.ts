// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  PersonaInputAction,
  PersonaRunTrace,
  PlaytestEvent,
  PlaytestMetrics,
  PlaytestRunRequest,
  PlaytestRunner,
  PlaytestPersona,
} from '../types.js';

export interface ChromiumRunnerOptions {
  headless?: boolean;
  maxRuntimeMs?: number;
  actionIntervalMs?: number;
  instrumentationTimeScale?: number;
}

const ACTION_KEYS = {
  right: 'ArrowRight',
  left: 'ArrowLeft',
  jump: 'Space',
  attack: 'KeyJ',
  interact: 'KeyE',
  crouch: 'ArrowDown',
  dash: 'ShiftLeft',
} as const;

function actionBudget(durationMs: number, intervalMs: number): number {
  return Math.max(1, Math.min(180, Math.floor(durationMs / intervalMs)));
}

function actionKeyFor(persona: PlaytestPersona, index: number): string {
  if (persona.id === 'speedrunner') return [ACTION_KEYS.right, ACTION_KEYS.dash, ACTION_KEYS.jump, ACTION_KEYS.attack][index % 4]!;
  if (persona.inputStyle === 'completionist') return [ACTION_KEYS.right, ACTION_KEYS.interact, ACTION_KEYS.left, ACTION_KEYS.jump, ACTION_KEYS.attack][index % 5]!;
  if (persona.inputStyle === 'exploratory') return [ACTION_KEYS.right, ACTION_KEYS.interact, ACTION_KEYS.left, ACTION_KEYS.right, ACTION_KEYS.jump][index % 5]!;
  if (persona.inputStyle === 'stealth') return [ACTION_KEYS.crouch, ACTION_KEYS.right, ACTION_KEYS.interact, ACTION_KEYS.left][index % 4]!;
  if (persona.inputStyle === 'optimization') return [ACTION_KEYS.attack, ACTION_KEYS.right, ACTION_KEYS.interact, ACTION_KEYS.attack, ACTION_KEYS.jump][index % 5]!;
  if (persona.inputStyle === 'chaotic') return [ACTION_KEYS.attack, ACTION_KEYS.jump, ACTION_KEYS.left, ACTION_KEYS.right, ACTION_KEYS.dash, ACTION_KEYS.interact][index % 6]!;
  return [ACTION_KEYS.right, ACTION_KEYS.jump, ACTION_KEYS.interact, ACTION_KEYS.attack][index % 4]!;
}

export function createPersonaInputPlan(
  persona: PlaytestPersona,
  durationMs: number,
  intervalMs = 850,
): PersonaInputAction[] {
  const count = actionBudget(durationMs, intervalMs);
  const actions: PersonaInputAction[] = [];
  for (let index = 0; index < count; index += 1) {
    const atMs = Math.min(durationMs - 1, index * intervalMs);
    actions.push({
      atMs,
      type: 'key',
      key: actionKeyFor(persona, index),
      durationMs: persona.inputStyle === 'precision' ? 42 : persona.inputStyle === 'chaotic' ? 22 : 60,
      label: `${persona.id}:key:${index}`,
    });
    if (index % 9 === 4) {
      actions.push({
        atMs: Math.min(durationMs - 1, atMs + Math.floor(intervalMs / 2)),
        type: 'click',
        x: persona.inputStyle === 'casual' ? 420 : 860,
        y: persona.inputStyle === 'stealth' ? 520 : 360,
        label: `${persona.id}:click:${index}`,
      });
    }
  }
  return actions.sort((a, b) => a.atMs - b.atMs);
}

function eventCount(event: PlaytestEvent): number {
  const count = event.metadata?.count;
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return 1;
  return Math.floor(count);
}

function countEvents(events: PlaytestEvent[], type: PlaytestEvent['type']): number {
  return events
    .filter((event) => event.type === type)
    .reduce((total, event) => total + eventCount(event), 0);
}

export function metricsFromPlaytestEvents(events: PlaytestEvent[]): PlaytestMetrics {
  const completionTimeMs = events
    .filter((event) => event.type === 'completion' && Number.isFinite(event.atMs))
    .reduce<number | undefined>((earliest, event) => (
      earliest === undefined ? event.atMs : Math.min(earliest, event.atMs)
    ), undefined);
  return {
    inputs: events.filter((event) => event.type === 'input').length,
    deaths: countEvents(events, 'death'),
    frustrationMoments: countEvents(events, 'frustration'),
    ...(completionTimeMs !== undefined ? { completionTimeMs } : {}),
    unusedContentIds: events
      .filter((event) => event.type === 'unused-content' && event.targetId)
      .map((event) => event.targetId!),
    bugsObserved: events
      .filter((event) => event.type === 'bug-signal')
      .map((event) => String(event.metadata?.bugId ?? event.id)),
  };
}

export class ChromiumPlaytestRunner implements PlaytestRunner {
  constructor(private readonly options: ChromiumRunnerOptions = {}) {}

  async run({ artifact, persona, durationMs }: PlaytestRunRequest): Promise<PersonaRunTrace> {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: this.options.headless ?? true });
    const events: PlaytestEvent[] = [];
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('console', (message) => {
        const text = message.text();
        if (!text.startsWith('greybox:playtest:event ')) return;
        const payload = JSON.parse(text.slice('greybox:playtest:event '.length)) as PlaytestEvent;
        events.push(payload);
      });

      if (artifact.url) {
        await page.goto(artifact.url, { waitUntil: 'domcontentloaded' });
      } else if (artifact.html) {
        await page.setContent(artifact.html, { waitUntil: 'domcontentloaded' });
      } else {
        throw new Error('Chromium runner requires artifact.url or artifact.html');
      }

      await page.evaluate(({ personaId, runDurationMs, timeScale }) => {
        window.dispatchEvent(new CustomEvent('greybox:playtest:start', {
          detail: { personaId, runDurationMs, timeScale },
        }));
      }, {
        personaId: persona.id,
        runDurationMs: durationMs,
        timeScale: this.options.instrumentationTimeScale ?? 1,
      });

      const runtimeMs = Math.min(durationMs, this.options.maxRuntimeMs ?? 30_000);
      const inputPlan = createPersonaInputPlan(persona, runtimeMs, this.options.actionIntervalMs);
      let elapsedMs = 0;
      for (const action of inputPlan) {
        if (action.atMs > elapsedMs) {
          await page.waitForTimeout(action.atMs - elapsedMs);
          elapsedMs = action.atMs;
        }
        if (action.type === 'key' && action.key) {
          await page.keyboard.down(action.key);
          if (action.durationMs && action.durationMs > 0) await page.waitForTimeout(action.durationMs);
          await page.keyboard.up(action.key);
          elapsedMs += action.durationMs ?? 0;
        } else if (action.type === 'click') {
          await page.mouse.click(action.x ?? 640, action.y ?? 360);
        }
        events.push({
          id: `${persona.id}:input:${events.length}`,
          atMs: elapsedMs,
          type: 'input',
          message: `${persona.name} replayed ${action.label}.`,
          metadata: {
            actionType: action.type,
            key: action.key,
            x: action.x,
            y: action.y,
          },
        });
      }
      if (elapsedMs < runtimeMs) await page.waitForTimeout(runtimeMs - elapsedMs);
    } finally {
      await browser.close();
    }

    const completed = events.some((event) => event.type === 'completion');
    const metrics = metricsFromPlaytestEvents(events);

    return {
      artifactId: artifact.id,
      persona,
      durationMs,
      completed,
      events,
      metrics,
    };
  }
}
