import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  GameTelemetryEventInput,
  GameTelemetryEventRecord,
  GameTelemetryHeatmapCell,
  GameTelemetryInsight,
  GameTelemetryInsightsResponse,
  GameTelemetrySummary,
} from '@ai-game-design-studio/contracts/api/projects';

const TELEMETRY_DIR = '.agds/game-telemetry';
const TELEMETRY_FILE = 'events.jsonl';
const MAX_INGEST_EVENTS = 500;
const MAX_LIST_EVENTS = 1000;

type NormalizeResult =
  | { ok: true; events: GameTelemetryEventRecord[] }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\0/g, '').trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((item) => cleanString(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
  return out.length > 0 ? out : undefined;
}

function cleanPayload(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  try {
    const json = JSON.stringify(value);
    if (json.length > 32_000) return { truncated: true };
    const parsed = JSON.parse(json);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function cleanPosition(value: unknown): GameTelemetryEventInput['position'] | undefined {
  if (!isRecord(value)) return undefined;
  const x = cleanNumber(value.x);
  const y = cleanNumber(value.y);
  if (x === undefined || y === undefined) return undefined;
  const z = cleanNumber(value.z);
  return z === undefined ? { x, y } : { x, y, z };
}

export function normalizeGameTelemetryIngest(
  input: unknown,
  projectId: string,
  receivedAt = Date.now(),
): NormalizeResult {
  const source = isRecord(input) && Array.isArray(input.events) ? input.events : undefined;
  if (!source || source.length === 0) {
    return { ok: false, error: 'events array is required' };
  }
  if (source.length > MAX_INGEST_EVENTS) {
    return { ok: false, error: `too many telemetry events; max ${MAX_INGEST_EVENTS}` };
  }

  const events: GameTelemetryEventRecord[] = [];
  for (const [index, raw] of source.entries()) {
    if (!isRecord(raw)) return { ok: false, error: `events.${index} must be an object` };
    const type = cleanString(raw.type, 64);
    if (!type) return { ok: false, error: `events.${index}.type is required` };
    const timestamp = cleanNumber(raw.timestamp) ?? receivedAt;
    const eventId = cleanString(raw.eventId, 128);
    const sessionId = cleanString(raw.sessionId, 128);
    const playerId = cleanString(raw.playerId, 128);
    const sceneId = cleanString(raw.sceneId, 128);
    const encounterId = cleanString(raw.encounterId, 128);
    const buildId = cleanString(raw.buildId, 128);
    const platform = cleanString(raw.platform, 64);
    const value = cleanNumber(raw.value);
    const position = cleanPosition(raw.position);
    const tags = cleanStringArray(raw.tags, 24, 48);
    const payload = cleanPayload(raw.payload);
    const record: GameTelemetryEventRecord = {
      id: randomUUID(),
      projectId,
      type,
      timestamp,
      receivedAt,
      ...(eventId ? { eventId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(playerId ? { playerId } : {}),
      ...(sceneId ? { sceneId } : {}),
      ...(encounterId ? { encounterId } : {}),
      ...(buildId ? { buildId } : {}),
      ...(platform ? { platform } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(position ? { position } : {}),
      ...(tags ? { tags } : {}),
      ...(payload ? { payload } : {}),
    };
    events.push(record);
  }
  return { ok: true, events };
}

function telemetryFile(projectDir: string): string {
  return path.join(projectDir, TELEMETRY_DIR, TELEMETRY_FILE);
}

export async function appendGameTelemetryEvents(
  projectDir: string,
  events: GameTelemetryEventRecord[],
): Promise<void> {
  if (events.length === 0) return;
  await mkdir(path.dirname(telemetryFile(projectDir)), { recursive: true });
  const body = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  await appendFile(telemetryFile(projectDir), body, 'utf8');
}

export async function readGameTelemetryEvents(projectDir: string, limit = 200): Promise<GameTelemetryEventRecord[]> {
  const safeLimit = Math.max(1, Math.min(MAX_LIST_EVENTS, Math.trunc(limit || 200)));
  let body = '';
  try {
    body = await readFile(telemetryFile(projectDir), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const events = body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as GameTelemetryEventRecord;
      } catch {
        return null;
      }
    })
    .filter((event): event is GameTelemetryEventRecord => Boolean(event));
  return events.slice(-safeLimit);
}

export function summarizeGameTelemetryEvents(events: GameTelemetryEventRecord[]): GameTelemetrySummary {
  const byType: Record<string, number> = {};
  const byScene: Record<string, number> = {};
  const sessions = new Set<string>();
  let latestTimestamp: number | undefined;
  for (const event of events) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
    if (event.sceneId) byScene[event.sceneId] = (byScene[event.sceneId] ?? 0) + 1;
    if (event.sessionId) sessions.add(event.sessionId);
    latestTimestamp = latestTimestamp === undefined
      ? event.timestamp
      : Math.max(latestTimestamp, event.timestamp);
  }
  return {
    total: events.length,
    byType,
    byScene,
    sessionCount: sessions.size,
    ...(latestTimestamp === undefined ? {} : { latestTimestamp }),
  };
}

function eventTypeMatches(event: GameTelemetryEventRecord, pattern: RegExp): boolean {
  return pattern.test(event.type);
}

function sceneKey(event: GameTelemetryEventRecord): string {
  return event.sceneId || 'unknown-scene';
}

function countByScene(events: GameTelemetryEventRecord[], pattern: RegExp): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    if (!eventTypeMatches(event, pattern)) continue;
    const scene = sceneKey(event);
    counts[scene] = (counts[scene] ?? 0) + 1;
  }
  return counts;
}

function topScene(counts: Record<string, number>): { sceneId: string; count: number } | undefined {
  let best: { sceneId: string; count: number } | undefined;
  for (const [sceneId, count] of Object.entries(counts)) {
    if (!best || count > best.count) best = { sceneId, count };
  }
  return best;
}

function pushInsight(insights: GameTelemetryInsight[], insight: GameTelemetryInsight): void {
  insights.push(insight);
}

function buildHeatmap(events: GameTelemetryEventRecord[]): GameTelemetryHeatmapCell[] {
  const cells = new Map<string, GameTelemetryHeatmapCell>();
  for (const event of events) {
    if (!event.position) continue;
    const x = Math.round(event.position.x / 50) * 50;
    const y = Math.round(event.position.y / 50) * 50;
    const z = event.position.z === undefined ? undefined : Math.round(event.position.z / 5) * 5;
    const sceneId = event.sceneId;
    const key = `${sceneId ?? ''}:${x}:${y}:${z ?? ''}`;
    const existing = cells.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    cells.set(key, {
      ...(sceneId ? { sceneId } : {}),
      x,
      y,
      ...(z === undefined ? {} : { z }),
      count: 1,
    });
  }
  return [...cells.values()].sort((a, b) => b.count - a.count).slice(0, 25);
}

export function buildGameTelemetryInsights(
  events: GameTelemetryEventRecord[],
  generatedAt = Date.now(),
): GameTelemetryInsightsResponse {
  const summary = summarizeGameTelemetryEvents(events);
  const insights: GameTelemetryInsight[] = [];
  const deathFailureCounts = countByScene(events, /\b(death|failure|frustration_signal)\b/i);
  const topFailureScene = topScene(deathFailureCounts);
  if (topFailureScene) {
    pushInsight(insights, {
      id: 'frustration-hotspot',
      severity: topFailureScene.count >= 5 ? 'high' : 'medium',
      category: 'frustration',
      title: 'Player frustration hotspot detected',
      evidence: `${topFailureScene.count} death, failure, or frustration events in ${topFailureScene.sceneId}.`,
      recommendation: 'Review encounter telegraphs, checkpoint spacing, hazard readability, and recovery resources around this scene.',
    });
  }

  const startsByScene = countByScene(events, /\blevel_start\b/i);
  const completesByScene = countByScene(events, /\blevel_complete\b/i);
  for (const [sceneId, starts] of Object.entries(startsByScene)) {
    const completes = completesByScene[sceneId] ?? 0;
    if (starts > completes) {
      pushInsight(insights, {
        id: `progression-bottleneck-${sceneId}`,
        severity: starts - completes >= 5 ? 'high' : 'medium',
        category: 'progression',
        title: 'Progression bottleneck likely',
        evidence: `${starts} level starts but ${completes} completions in ${sceneId}.`,
        recommendation: 'Inspect objective clarity, route readability, encounter difficulty, and tutorial prompts before this completion point.',
      });
    }
  }

  const accessibilityEvents = events.filter((event) => eventTypeMatches(event, /\baccessibility_event\b/i));
  if (accessibilityEvents.length > 0) {
    pushInsight(insights, {
      id: 'accessibility-signal',
      severity: accessibilityEvents.length >= 5 ? 'high' : 'medium',
      category: 'accessibility',
      title: 'Accessibility tuning signal detected',
      evidence: `${accessibilityEvents.length} accessibility event${accessibilityEvents.length === 1 ? '' : 's'} captured.`,
      recommendation: 'Review subtitle scale, contrast modes, motion reduction, remappable inputs, and assist toggles for this playtest segment.',
    });
  }

  const combatEvents = events.filter((event) => eventTypeMatches(event, /\bcombat_event\b/i));
  const failedCombatEvents = combatEvents.filter((event) => {
    const payload = event.payload ?? {};
    return payload.result === 'failed' || payload.readable === false || (typeof event.value === 'number' && event.value < 0);
  });
  if (failedCombatEvents.length > 0) {
    pushInsight(insights, {
      id: 'combat-readability-balance-risk',
      severity: failedCombatEvents.length >= 5 ? 'high' : 'medium',
      category: 'combat-balance',
      title: 'Combat readability or balance risk',
      evidence: `${failedCombatEvents.length} combat event${failedCombatEvents.length === 1 ? '' : 's'} flagged failed or unreadable.`,
      recommendation: 'Tune enemy telegraphs, hit feedback, dodge/parry windows, damage spikes, and camera framing before the next playtest.',
    });
  }

  const economyEvents = events.filter((event) => eventTypeMatches(event, /\beconomy_event\b/i));
  const negativeEconomy = economyEvents.filter((event) => typeof event.value === 'number' && event.value < 0);
  if (negativeEconomy.length > 0) {
    pushInsight(insights, {
      id: 'economy-sink-pressure',
      severity: negativeEconomy.length >= 5 ? 'high' : 'low',
      category: 'economy',
      title: 'Economy sink pressure deserves review',
      evidence: `${negativeEconomy.length} economy event${negativeEconomy.length === 1 ? '' : 's'} recorded negative value changes.`,
      recommendation: 'Compare currency sinks with reward cadence so upgrades, crafting, and live-service goals do not become punitive.',
    });
  }

  const heatmap = buildHeatmap(events);
  if (heatmap.length > 0) {
    const hottest = heatmap[0]!;
    pushInsight(insights, {
      id: 'telemetry-heatmap-ready',
      severity: hottest.count >= 5 ? 'medium' : 'low',
      category: 'heatmap',
      title: 'Spatial heatmap data is ready for level review',
      evidence: `Hottest cell has ${hottest.count} event${hottest.count === 1 ? '' : 's'} near (${hottest.x}, ${hottest.y})${hottest.sceneId ? ` in ${hottest.sceneId}` : ''}.`,
      recommendation: 'Overlay the heatmap on the level viewport to inspect chokepoints, unclear routes, death clusters, and reward dead zones.',
    });
  }

  return {
    summary,
    insights,
    heatmap,
    generatedAt,
  };
}
