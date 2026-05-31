import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  GamePlaytestPersonaId,
  GamePlaytestPreset,
  GamePlaytestSimulationMode,
} from '@ai-game-design-studio/contracts/api/projects';

const PRESETS_DIR = '.agds/playtest-presets';
const PRESETS_FILE = 'presets.json';
const MAX_PRESETS = 16;
const MAX_PERSONAS = 8;
const DEFAULT_RUNS = 5;
const MAX_RUNS = 20;

const PLAYTEST_MODES: GamePlaytestSimulationMode[] = [
  'viewport-artifact',
  'playable-artifact',
  'headless-browser',
];

type NormalizePresetsResult =
  | { ok: true; presets: GamePlaytestPreset[] }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\0/g, '').trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function cleanRuns(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RUNS;
  return Math.max(1, Math.min(MAX_RUNS, Math.trunc(n)));
}

function cleanTimestamp(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return Math.trunc(n);
}

function cleanMode(value: unknown): GamePlaytestSimulationMode {
  return PLAYTEST_MODES.includes(value as GamePlaytestSimulationMode)
    ? (value as GamePlaytestSimulationMode)
    : 'viewport-artifact';
}

function cleanPersonas(value: unknown): GamePlaytestPersonaId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const personas: GamePlaytestPersonaId[] = [];
  for (const item of value) {
    const persona = cleanString(item, 48);
    if (!persona || seen.has(persona)) continue;
    seen.add(persona);
    personas.push(persona);
    if (personas.length >= MAX_PERSONAS) break;
  }
  return personas;
}

function normalizePreset(input: unknown, index: number): GamePlaytestPreset | undefined {
  if (!isRecord(input)) return undefined;
  const id = cleanString(input.id, 80) ?? `preset-${index + 1}`;
  const name = cleanString(input.name, 48);
  const personas = cleanPersonas(input.personas);
  if (!name || personas.length === 0) return undefined;
  const fileName = cleanString(input.fileName, 240);
  const focus = cleanString(input.focus, 64);
  return {
    id,
    name,
    mode: cleanMode(input.mode),
    runs: cleanRuns(input.runs),
    personas,
    updatedAt: cleanTimestamp(input.updatedAt),
    ...(fileName ? { fileName } : {}),
    ...(focus ? { focus } : {}),
  };
}

export function normalizeGamePlaytestPresetsUpdate(input: unknown): NormalizePresetsResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  if (!Array.isArray(source.presets)) return { ok: false, error: 'presets must be an array' };
  const presets = source.presets
    .map((item, index) => normalizePreset(item, index))
    .filter((item): item is GamePlaytestPreset => Boolean(item))
    .slice(0, MAX_PRESETS);
  return { ok: true, presets };
}

function presetsFile(projectDir: string): string {
  return path.join(projectDir, PRESETS_DIR, PRESETS_FILE);
}

export async function readGamePlaytestPresets(projectDir: string): Promise<GamePlaytestPreset[]> {
  let raw = '';
  try {
    raw = await readFile(presetsFile(projectDir), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeGamePlaytestPresetsUpdate({ presets: parsed });
    return normalized.ok ? normalized.presets : [];
  } catch {
    return [];
  }
}

export async function writeGamePlaytestPresets(
  projectDir: string,
  presets: GamePlaytestPreset[],
): Promise<GamePlaytestPreset[]> {
  const normalized = normalizeGamePlaytestPresetsUpdate({ presets });
  const next = normalized.ok ? normalized.presets : [];
  const file = presetsFile(projectDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}
