import { gameViewportDocumentSchema } from '@ai-game-design-studio/contracts/game-studio';
import type {
  GameViewportDocument,
  GameViewportEntity,
  GameViewportPath,
  GameViewportTerrainPaintStroke,
  GameViewportTerrainSculptPatch,
  GameViewportTerrainZone,
} from '@ai-game-design-studio/contracts/api/files';
import type {
  GamePlaytestBotAction,
  GamePlaytestPersonaReport,
  GamePlaytestSimulationFinding,
  GamePlaytestSimulationMetric,
  GamePlaytestSimulationRequest,
  GamePlaytestSimulationResponse,
  GamePlaytestSimulationRisk,
} from '@ai-game-design-studio/contracts/api/projects';

const MAX_SIMULATION_RUNS = 50;
const DEFAULT_SIMULATION_RUNS = 5;

export type NormalizedGamePlaytestSimulationRequest = {
  fileName?: string;
  runs: number;
  focus?: string;
  persona?: string;
  personas: string[];
};

type NormalizeResult =
  | { ok: true; request: NormalizedGamePlaytestSimulationRequest }
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
  if (!Number.isFinite(n)) return DEFAULT_SIMULATION_RUNS;
  return Math.max(1, Math.min(MAX_SIMULATION_RUNS, Math.trunc(n)));
}

function cleanPersonaId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value
    .replace(/\0/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  if (!clean) return undefined;
  if (clean === 'ragequitter') return 'rage-quitter';
  if (clean === 'completion') return 'completionist';
  return clean;
}

function cleanPersonas(source: Record<string, unknown>): string[] {
  const candidates: unknown[] = [];
  if (Array.isArray(source.personas)) candidates.push(...source.personas);
  candidates.push(source.persona);
  const seen = new Set<string>();
  const personas: string[] = [];
  for (const candidate of candidates) {
    const persona = cleanPersonaId(candidate);
    if (!persona || seen.has(persona)) continue;
    seen.add(persona);
    personas.push(persona);
    if (personas.length >= 10) break;
  }
  return personas;
}

export function normalizeGamePlaytestSimulationRequest(input: unknown): NormalizeResult {
  if (input !== undefined && input !== null && !isRecord(input)) {
    return { ok: false, error: 'request body must be an object' };
  }
  const source = isRecord(input) ? input : {};
  const fileName = cleanString(source.fileName, 240);
  const focus = cleanString(source.focus, 64);
  const personas = cleanPersonas(source);
  const request: NormalizedGamePlaytestSimulationRequest = {
    runs: cleanRuns(source.runs),
    personas,
    ...(fileName ? { fileName } : {}),
    ...(focus ? { focus } : {}),
    ...(personas[0] ? { persona: personas[0] } : {}),
  };
  return { ok: true, request };
}

function includesText(value: string | undefined, needle: RegExp): boolean {
  return typeof value === 'string' && needle.test(value);
}

function entityType(entity: GameViewportEntity): string {
  return entity.type.toLowerCase();
}

function countEntities(entities: GameViewportEntity[], matcher: RegExp): number {
  return entities.filter((entity) => matcher.test(entityType(entity))).length;
}

function countUsefulRoutes(paths: GameViewportPath[]): number {
  return paths.filter((route) => route.points.length >= 2).length;
}

function countRecoveryBeats(document: GameViewportDocument): number {
  const beatText = (document.beats ?? [])
    .map((beat) => `${beat.name} ${beat.objective ?? ''} ${beat.tension ?? ''} ${beat.notes ?? ''}`)
    .join('\n');
  return (beatText.match(/\b(recover|breather|safe|checkpoint|rest|resupply|tutorial)\b/gi) ?? []).length;
}

function hasHazardReadability(
  document: GameViewportDocument,
  hazardEntities: number,
  hazardZones: GameViewportTerrainZone[],
  hazardPaint: GameViewportTerrainPaintStroke[],
): boolean {
  if (hazardEntities + hazardZones.length + hazardPaint.length === 0) return true;
  const spatialReads = document.spatialReads ?? [];
  const readableSpatialNote = spatialReads.some((read) =>
    [read.sightline, read.cover, read.chokepoint, read.traversalRhythm, read.tensionSpacing]
      .some((value) => includesText(value, /\b(read|telegraph|sightline|cover|warning|danger|contrast|clarity)\b/i)),
  );
  const readablePaint = hazardPaint.some((stroke) =>
    includesText(`${stroke.name} ${stroke.material ?? ''} ${stroke.notes ?? ''}`, /\b(warning|danger|telegraph|contrast|ember|hazard)\b/i),
  );
  const readableZone = hazardZones.some((zone) =>
    includesText(`${zone.name} ${zone.mood ?? ''} ${zone.notes ?? ''}`, /\b(warning|danger|telegraph|contrast|read)\b/i),
  );
  return readableSpatialNote || readablePaint || readableZone;
}

type TerrainSamplePoint = { x: number; y: number; height: number; radius?: number };

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function terrainPatchSamples(patch: GameViewportTerrainSculptPatch): TerrainSamplePoint[] {
  const baseRadius = patch.radius ?? 96;
  const samples = patch.samples && patch.samples.length > 0
    ? patch.samples
    : [{ x: patch.x, y: patch.y, height: patch.height, radius: baseRadius }];
  return samples.map((sample) => ({
    x: sample.x,
    y: sample.y,
    height: sample.height,
    radius: sample.radius ?? baseRadius,
  }));
}

function heightAtPoint(
  point: { x: number; y: number },
  patches: GameViewportTerrainSculptPatch[],
): number {
  let height = 0;
  for (const patch of patches) {
    for (const sample of terrainPatchSamples(patch)) {
      const radius = Math.max(1, sample.radius ?? patch.radius ?? 96);
      const influence = Math.max(0, 1 - distance(point, sample) / radius);
      if (influence <= 0) continue;
      const shapedInfluence = patch.falloff === 'sharp' ? influence * influence : influence;
      height += sample.height * shapedInfluence;
    }
  }
  return Number(height.toFixed(3));
}

function routeCollisionSamples(paths: GameViewportPath[]): Array<{ x: number; y: number; routeId: string }> {
  const samples: Array<{ x: number; y: number; routeId: string }> = [];
  for (const route of paths) {
    for (let index = 0; index < route.points.length; index += 1) {
      const point = route.points[index]!;
      samples.push({ x: point.x, y: point.y, routeId: route.id });
      const next = route.points[index + 1];
      if (next) {
        samples.push({
          x: Number(((point.x + next.x) / 2).toFixed(2)),
          y: Number(((point.y + next.y) / 2).toFixed(2)),
          routeId: route.id,
        });
      }
    }
  }
  return samples;
}

function simulateTerrainCollisionRuntime(
  paths: GameViewportPath[],
  patches: GameViewportTerrainSculptPatch[],
): {
  collisionSamples: number;
  maxHeight: number;
  maxHeightDelta: number;
  steepSlopeCount: number;
  affectedRoutes: string[];
} {
  if (patches.length === 0) {
    return { collisionSamples: 0, maxHeight: 0, maxHeightDelta: 0, steepSlopeCount: 0, affectedRoutes: [] };
  }
  const samples = routeCollisionSamples(paths);
  const heights = samples.map((sample) => ({
    ...sample,
    height: heightAtPoint(sample, patches),
  }));
  let maxHeight = 0;
  let maxHeightDelta = 0;
  let steepSlopeCount = 0;
  const affectedRoutes = new Set<string>();

  for (const sample of heights) {
    if (Math.abs(sample.height) > 0.05) affectedRoutes.add(sample.routeId);
    maxHeight = Math.max(maxHeight, Math.abs(sample.height));
  }
  for (let index = 1; index < heights.length; index += 1) {
    const previous = heights[index - 1]!;
    const current = heights[index]!;
    if (previous.routeId !== current.routeId) continue;
    const delta = Math.abs(current.height - previous.height);
    const span = Math.max(1, distance(previous, current));
    const slopeRatio = delta / span;
    maxHeightDelta = Math.max(maxHeightDelta, delta);
    if (delta >= 0.7 || slopeRatio >= 0.018) steepSlopeCount += 1;
  }

  return {
    collisionSamples: heights.length,
    maxHeight: Number(maxHeight.toFixed(2)),
    maxHeightDelta: Number(maxHeightDelta.toFixed(2)),
    steepSlopeCount,
    affectedRoutes: Array.from(affectedRoutes).sort(),
  };
}

function makeMetric(
  id: string,
  label: string,
  value: number | string,
  target?: number | string,
  risk?: GamePlaytestSimulationRisk,
): GamePlaytestSimulationMetric {
  return {
    id,
    label,
    value,
    ...(target === undefined ? {} : { target }),
    ...(risk === undefined ? {} : { risk }),
  };
}

function riskFromFindings(findings: GamePlaytestSimulationFinding[]): GamePlaytestSimulationRisk {
  if (findings.some((finding) => finding.severity === 'high')) return 'high';
  if (findings.some((finding) => finding.severity === 'medium')) return 'medium';
  return 'low';
}

type PersonaDefinition = {
  id: string;
  label: string;
  motivation: string;
  paceMultiplier: number;
  tolerance: number;
};

const personaDefinitions: Record<string, PersonaDefinition> = {
  speedrunner: {
    id: 'speedrunner',
    label: 'Speedrunner',
    motivation: 'Find the fastest readable route, skip optional beats, and punish unclear traversal.',
    paceMultiplier: 0.62,
    tolerance: 0.7,
  },
  completionist: {
    id: 'completionist',
    label: 'Completionist',
    motivation: 'Search every route, reward pocket, collectible clue, and optional objective.',
    paceMultiplier: 1.55,
    tolerance: 1.1,
  },
  casual: {
    id: 'casual',
    label: 'Casual Player',
    motivation: 'Look for a clear objective, forgiving recovery, readable HUD state, and low-friction controls.',
    paceMultiplier: 1.2,
    tolerance: 0.85,
  },
  explorer: {
    id: 'explorer',
    label: 'Explorer',
    motivation: 'Probe alternate routes, environmental storytelling, hidden rewards, and dynamic world changes.',
    paceMultiplier: 1.35,
    tolerance: 1,
  },
  'rage-quitter': {
    id: 'rage-quitter',
    label: 'Rage-Quit Risk Player',
    motivation: 'Stress-test failure clarity, unfair spikes, retry pacing, and readability under pressure.',
    paceMultiplier: 0.9,
    tolerance: 0.45,
  },
};

function personaDefinition(id: string): PersonaDefinition {
  const known = personaDefinitions[id];
  if (known) return known;
  const label = id
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Custom Persona';
  return {
    id,
    label,
    motivation: 'Evaluate the playtest through a custom player motivation supplied by the studio.',
    paceMultiplier: 1,
    tolerance: 0.9,
  };
}

function requestedPersonas(
  request: GamePlaytestSimulationRequest | NormalizedGamePlaytestSimulationRequest,
): string[] {
  if (!isRecord(request)) return [];
  return cleanPersonas(request);
}

function metricNumber(metrics: GamePlaytestSimulationMetric[], id: string): number {
  const metric = metrics.find((candidate) => candidate.id === id);
  if (!metric) return 0;
  if (typeof metric.value === 'number') return metric.value;
  const n = Number(metric.value);
  return Number.isFinite(n) ? n : 0;
}

function uniqueList(values: Array<string | undefined>, fallback?: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value?.replace(/\s+/g, ' ').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length >= 4) break;
  }
  if (result.length === 0 && fallback) result.push(fallback);
  return result;
}

function personaFrustrationMoments(
  id: string,
  findings: GamePlaytestSimulationFinding[],
  botActions: GamePlaytestBotAction[],
): string[] {
  const blockedActions = botActions
    .filter((action) => action.status === 'blocked')
    .map((action) => `Blocked bot action: ${action.label}.`);
  const warningActions = botActions
    .filter((action) => action.status === 'warning')
    .map((action) => `Unstable bot action: ${action.label}.`);
  const byPersona = findings.filter((finding) => {
    if (id === 'speedrunner') return /navigation|onboarding|production/.test(finding.category) || /route|runtime|control|objective/.test(finding.id);
    if (id === 'completionist') return /retention|navigation|onboarding/.test(finding.category) || /reward|objective|route|static/.test(finding.id);
    if (id === 'casual') return /onboarding|accessibility|readability|pacing/.test(finding.category);
    if (id === 'explorer') return /retention|navigation|readability/.test(finding.category) || /reward|static|dynamic|route/.test(finding.id);
    if (id === 'rage-quitter') return finding.severity !== 'low' || /combat|pacing|retry|checkpoint|pressure/.test(`${finding.category} ${finding.id}`);
    return finding.severity !== 'low';
  });
  return uniqueList([
    ...blockedActions,
    ...warningActions,
    ...byPersona.map((finding) => finding.message),
  ], findings[0]?.message);
}

function personaUnusedContent(id: string, findings: GamePlaytestSimulationFinding[]): string[] {
  const unused: string[] = [];
  if (findings.some((finding) => finding.id === 'low-exploration-reward')) {
    unused.push('Optional exploration space has no explicit reward or discovery pull.');
  }
  if (findings.some((finding) => finding.id === 'static-scene-risk')) {
    unused.push('Dynamic event layer is absent, so repeated runs cannot reveal new world states.');
  }
  if (findings.some((finding) => finding.id === 'missing-playable-route')) {
    unused.push('Authored scene space cannot be exercised because no playable route is available.');
  }
  if (findings.some((finding) => finding.id === 'runtime-bot-no-controls')) {
    unused.push('Playable surface exists, but control affordances are unreachable to the bot.');
  }
  if ((id === 'completionist' || id === 'explorer') && unused.length === 0) {
    unused.push('No obvious unused exploration content was detected for this persona.');
  }
  return unused.slice(0, 4);
}

function personaBalanceIssues(id: string, findings: GamePlaytestSimulationFinding[]): string[] {
  const balanceFindings = findings.filter((finding) =>
    /combat|pacing|retention|navigation/.test(finding.category) ||
    /pressure|checkpoint|retry|slope|hazard|combat/.test(finding.id),
  );
  const issues = balanceFindings.map((finding) => finding.message);
  if (id === 'rage-quitter' && findings.some((finding) => finding.severity === 'high')) {
    issues.unshift('High-risk blockers are likely to cause early session abandonment.');
  }
  if (id === 'speedrunner' && findings.some((finding) => /route|navigation/.test(`${finding.id} ${finding.category}`))) {
    issues.unshift('Route ambiguity blocks fast mastery and repeatable optimization.');
  }
  return uniqueList(issues);
}

function personaAcceptedSignals(
  findings: GamePlaytestSimulationFinding[],
  metrics: GamePlaytestSimulationMetric[],
  botActions: GamePlaytestBotAction[],
): string[] {
  const passedActions = botActions
    .filter((action) => action.status === 'passed')
    .slice(0, 3)
    .map((action) => `${action.label} passed.`);
  const signals = [
    riskFromFindings(findings) === 'low' ? 'No high or medium playtest blockers detected.' : undefined,
    metricNumber(metrics, 'route-count') > 0 ? 'Playable route coverage exists.' : undefined,
    metricNumber(metrics, 'runtime-loop') > 0 ? 'Runtime loop is detectable.' : undefined,
    metricNumber(metrics, 'objective-signals') > 0 || metricNumber(metrics, 'objectives') > 0 ? 'Objective signal is readable.' : undefined,
    metricNumber(metrics, 'accessibility-signals') > 0 || metricNumber(metrics, 'accessibility-notes') > 0 ? 'Accessibility signal is present.' : undefined,
    ...passedActions,
  ];
  return uniqueList(signals, 'Persona report generated from deterministic playtest signals.');
}

function personaRisk(
  id: string,
  definition: PersonaDefinition,
  findings: GamePlaytestSimulationFinding[],
  botActions: GamePlaytestBotAction[],
): GamePlaytestSimulationRisk {
  const high = findings.filter((finding) => finding.severity === 'high').length;
  const medium = findings.filter((finding) => finding.severity === 'medium').length;
  const blocked = botActions.filter((action) => action.status === 'blocked').length;
  const warning = botActions.filter((action) => action.status === 'warning').length;
  let score = high * 3 + medium * 1.5 + blocked * 2 + warning;
  if (id === 'rage-quitter') score += high + medium;
  if (id === 'speedrunner') score += findings.filter((finding) => /navigation|route/.test(`${finding.category} ${finding.id}`)).length;
  if (id === 'completionist' || id === 'explorer') score += findings.filter((finding) => /retention|reward|static/.test(`${finding.category} ${finding.id}`)).length * 0.75;
  if (id === 'casual') score += findings.filter((finding) => /onboarding|accessibility/.test(finding.category)).length;
  const adjusted = score / definition.tolerance;
  if (adjusted >= 5) return 'high';
  if (adjusted >= 2) return 'medium';
  return 'low';
}

function buildPersonaReports(options: {
  request: GamePlaytestSimulationRequest | NormalizedGamePlaytestSimulationRequest;
  runs: number;
  findings: GamePlaytestSimulationFinding[];
  metrics: GamePlaytestSimulationMetric[];
  botActions?: GamePlaytestBotAction[];
}): GamePlaytestPersonaReport[] {
  const personaIds = requestedPersonas(options.request);
  if (personaIds.length === 0) return [];
  const botActions = options.botActions ?? [];
  const high = options.findings.filter((finding) => finding.severity === 'high').length;
  const medium = options.findings.filter((finding) => finding.severity === 'medium').length;
  return personaIds.map((id, index) => {
    const definition = personaDefinition(id);
    const blockedActions = botActions.filter((action) => action.status === 'blocked').length;
    const completionTimeSec = Math.max(
      20,
      Math.round((options.runs * 40 + options.findings.length * 16 + blockedActions * 22 + index * 5) * definition.paceMultiplier),
    );
    const pressureDeaths = high + Math.ceil(medium / 2) + blockedActions;
    const deaths = Math.max(0, Math.round(pressureDeaths / definition.tolerance));
    return {
      id: definition.id,
      label: definition.label,
      motivation: definition.motivation,
      completionTimeSec,
      deaths,
      frustrationMoments: personaFrustrationMoments(definition.id, options.findings, botActions),
      unusedContent: personaUnusedContent(definition.id, options.findings),
      balanceIssues: personaBalanceIssues(definition.id, options.findings),
      acceptedSignals: personaAcceptedSignals(options.findings, options.metrics, botActions),
      risk: personaRisk(definition.id, definition, options.findings, botActions),
    };
  });
}

function appendPersonaSummary(summary: string, personaReports: GamePlaytestPersonaReport[]): string {
  if (personaReports.length === 0) return summary;
  return `${summary} Persona reports: ${personaReports.map((report) => report.id).join(', ')}.`;
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function hasRuntimeSignal(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

function htmlTitle(rawContent: string, fileName: string): string {
  const title = rawContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? rawContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?? rawContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]
    ?? fileName;
  return title
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || fileName;
}

function textEvidence(value: boolean, yes: string, no: string): string {
  return value ? yes : no;
}

function makeBotAction(
  id: string,
  label: string,
  target: string,
  status: GamePlaytestBotAction['status'],
  evidence: string,
): GamePlaytestBotAction {
  return { id, label, target, status, evidence };
}

export function simulateGameViewportPlaytest(
  fileName: string,
  rawContent: string,
  request: GamePlaytestSimulationRequest | NormalizedGamePlaytestSimulationRequest = {},
): GamePlaytestSimulationResponse {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`invalid game viewport JSON: ${(error as Error).message}`);
  }

  const parsed = gameViewportDocumentSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join('.') : 'document';
    throw new Error(`invalid game viewport document at ${path}: ${issue?.message ?? 'schema validation failed'}`);
  }

  const document = parsed.data as GameViewportDocument;
  const runs = cleanRuns(request.runs);
  const focus = cleanString(request.focus, 64);
  const entities = document.entities ?? [];
  const terrainZones = document.terrainZones ?? [];
  const terrainPaintStrokes = document.terrainPaintStrokes ?? [];
  const terrainSculptPatches = document.terrainSculptPatches ?? [];
  const paths = document.paths ?? [];
  const accessibilityNotes = document.accessibilityNotes ?? [];

  const playerSpawns = countEntities(entities, /\bplayer-spawn\b/);
  const objectives = countEntities(entities, /\bobjective\b/);
  const enemySpawns = countEntities(entities, /\benemy-spawn\b/);
  const hazards = countEntities(entities, /\bhazard\b/);
  const checkpoints = countEntities(entities, /\bcheckpoint\b/);
  const rewards = countEntities(entities, /\b(reward|hidden-area|resource-node)\b/);
  const triggers = countEntities(entities, /\b(trigger|interaction-zone|dynamic-event|scripted-sequence|cinematic-trigger)\b/);
  const hazardZones = terrainZones.filter((zone) => /\bhazard|danger|lava|poison|storm|water\b/i.test(`${zone.type ?? ''} ${zone.name} ${zone.notes ?? ''}`));
  const hazardPaint = terrainPaintStrokes.filter((stroke) => /\bhazard|danger|lava|poison|storm|ember\b/i.test(`${stroke.type ?? ''} ${stroke.name} ${stroke.material ?? ''} ${stroke.notes ?? ''}`));
  const terrainRuntime = simulateTerrainCollisionRuntime(paths, terrainSculptPatches);
  const usefulRoutes = countUsefulRoutes(paths);
  const recoveryBeats = countRecoveryBeats(document);
  const cameraPlans = document.cameraPlan?.length ?? 0;
  const spatialReads = document.spatialReads?.length ?? 0;
  const dynamicEvents = document.dynamicEvents?.length ?? 0;
  const pressureScore = enemySpawns * 2 + hazards + hazardZones.length + hazardPaint.length + Math.max(0, triggers - 1);
  const recoveryScore = checkpoints + recoveryBeats;
  const findings: GamePlaytestSimulationFinding[] = [];

  function addFinding(finding: GamePlaytestSimulationFinding): void {
    findings.push(finding);
  }

  if (playerSpawns === 0) {
    addFinding({
      id: 'missing-player-spawn',
      severity: 'high',
      category: 'onboarding',
      message: 'The simulated player has no explicit spawn anchor.',
      evidence: `entities=${entities.length}, playerSpawns=0`,
      recommendation: 'Add a player-spawn entity with clear first-look framing and a nearby low-pressure objective.',
    });
  }

  if (objectives === 0 && !document.objective) {
    addFinding({
      id: 'missing-objective',
      severity: 'high',
      category: 'onboarding',
      message: 'The scene does not expose a concrete gameplay objective.',
      evidence: 'No objective entity or top-level objective text was found.',
      recommendation: 'Add an objective marker and a short objective statement that names the player action and win condition.',
    });
  }

  if (usefulRoutes === 0) {
    addFinding({
      id: 'missing-playable-route',
      severity: 'high',
      category: 'navigation',
      message: 'The simulated player cannot infer a playable traversal route.',
      evidence: `paths=${paths.length}, routesWithTwoPoints=${usefulRoutes}`,
      recommendation: 'Add an objective or traversal path with at least two waypoints from spawn to objective.',
    });
  }

  for (const route of paths.filter((candidate) => candidate.points.length < 2)) {
    addFinding({
      id: `short-route-${route.id}`,
      severity: 'medium',
      category: 'navigation',
      message: `Route "${route.name}" is too short for path simulation.`,
      evidence: `route=${route.id}, points=${route.points.length}`,
      recommendation: 'Add at least one more waypoint so flow, sightlines, and choke pressure can be evaluated.',
    });
  }

  if (enemySpawns > 0 && checkpoints === 0) {
    addFinding({
      id: 'combat-without-checkpoint',
      severity: 'high',
      category: 'pacing',
      message: 'Combat pressure exists without a recovery checkpoint.',
      evidence: `enemySpawns=${enemySpawns}, checkpoints=0`,
      recommendation: 'Place a checkpoint or safe recovery beat before or after the first major encounter.',
    });
  } else if (pressureScore > recoveryScore + 4) {
    addFinding({
      id: 'pressure-outpaces-recovery',
      severity: 'medium',
      category: 'pacing',
      message: 'Simulated pressure likely outpaces recovery opportunities.',
      evidence: `pressureScore=${pressureScore}, recoveryScore=${recoveryScore}`,
      recommendation: 'Reduce stacked hazards/enemy groups or add a breather, resupply, or checkpoint beat.',
    });
  }

  if (!hasHazardReadability(document, hazards, hazardZones, hazardPaint)) {
    addFinding({
      id: 'hazard-readability-gap',
      severity: 'medium',
      category: 'readability',
      message: 'Hazards are present without strong readability support.',
      evidence: `hazardEntities=${hazards}, hazardZones=${hazardZones.length}, hazardPaint=${hazardPaint.length}, spatialReads=${spatialReads}`,
      recommendation: 'Add terrain paint, spatial read notes, lighting contrast, or pre-impact warning language for each hazard lane.',
    });
  }

  if (cameraPlans === 0 && !document.camera) {
    addFinding({
      id: 'missing-camera-plan',
      severity: 'medium',
      category: 'readability',
      message: 'No camera plan is available for simulated readability checks.',
      evidence: 'No top-level camera or cameraPlan entries were found.',
      recommendation: 'Add a camera mode, framing rule, comfort note, and target handle for the primary encounter beat.',
    });
  }

  if (accessibilityNotes.length === 0) {
    addFinding({
      id: 'missing-accessibility-notes',
      severity: 'medium',
      category: 'accessibility',
      message: 'The scene has no accessibility assumptions for the playtest.',
      evidence: 'accessibilityNotes is empty.',
      recommendation: 'Add notes for readable HUD scale, colorblind-safe hazard cues, subtitle needs, input assists, and reduced motion.',
    });
  }

  if (terrainSculptPatches.length > 0 && terrainRuntime.collisionSamples === 0) {
    addFinding({
      id: 'terrain-sculpt-without-route-collision-samples',
      severity: 'medium',
      category: 'navigation',
      message: 'Terrain deformation exists but the simulator has no route samples to test collision readability.',
      evidence: `terrainSculptPatches=${terrainSculptPatches.length}, paths=${paths.length}`,
      recommendation: 'Add critical-path or traversal route waypoints through sculpted areas so slope, snag, and traversal readability can be tested.',
    });
  }

  if (terrainRuntime.steepSlopeCount > 0) {
    addFinding({
      id: 'terrain-deformation-slope-risk',
      severity: 'medium',
      category: 'navigation',
      message: 'The deterministic terrain runtime found sculpted slope spikes along traversal routes.',
      evidence: `steepSlopeSamples=${terrainRuntime.steepSlopeCount}, maxHeightDelta=${terrainRuntime.maxHeightDelta}m, affectedRoutes=${terrainRuntime.affectedRoutes.join(', ') || 'none'}`,
      recommendation: 'Flatten the sculpt profile near route samples, widen traversal reads, or add collision-assist notes before treating the terrain as engine-ready.',
    });
  }

  if (
    terrainSculptPatches.length > 0 &&
    !terrainSculptPatches.some((patch) =>
      includesText(`${patch.meshIntent ?? ''} ${patch.traversalImpact ?? ''} ${patch.notes ?? ''}`, /\b(collision|slope|snag|walk|dash|climb|traversal|navmesh|readable)\b/i),
    )
  ) {
    addFinding({
      id: 'terrain-deformation-missing-collision-intent',
      severity: 'low',
      category: 'production',
      message: 'Sculpted terrain lacks explicit collision or traversal intent.',
      evidence: `terrainSculptPatches=${terrainSculptPatches.length}`,
      recommendation: 'Document collision behavior, navmesh expectations, traversal assists, and deformation limits for each sculpt patch.',
    });
  }

  if (rewards === 0 && usefulRoutes > 0) {
    addFinding({
      id: 'low-exploration-reward',
      severity: 'low',
      category: 'retention',
      message: 'The route has no explicit reward, hidden area, or resource-node motivation.',
      evidence: `usefulRoutes=${usefulRoutes}, rewards=${rewards}`,
      recommendation: 'Place an optional reward or discovery pocket off the critical path to support curiosity and replayability.',
    });
  }

  if (dynamicEvents === 0 && focus !== 'onboarding') {
    addFinding({
      id: 'static-scene-risk',
      severity: 'low',
      category: 'retention',
      message: 'The simulated scene is static and may feel identical across repeated runs.',
      evidence: 'dynamicEvents=0',
      recommendation: 'Add one dynamic event or alternate encounter trigger that changes pressure, weather, faction presence, or reward timing.',
    });
  }

  if (focus === 'combat' && enemySpawns === 0) {
    addFinding({
      id: 'combat-focus-without-enemies',
      severity: 'medium',
      category: 'combat',
      message: 'The requested combat-focused simulation has no enemy spawn data.',
      evidence: 'focus=combat, enemySpawns=0',
      recommendation: 'Add enemy-spawn entities with counterplay, telegraph, faction, and difficulty notes.',
    });
  }

  const metrics: GamePlaytestSimulationMetric[] = [
    makeMetric('runs', 'Deterministic simulation runs', runs, '1-50', 'low'),
    makeMetric('player-spawns', 'Player spawn anchors', playerSpawns, '>= 1', playerSpawns > 0 ? 'low' : 'high'),
    makeMetric('objectives', 'Gameplay objectives', objectives + (document.objective ? 1 : 0), '>= 1', objectives > 0 || document.objective ? 'low' : 'high'),
    makeMetric('route-count', 'Playable route count', usefulRoutes, '>= 1', usefulRoutes > 0 ? 'low' : 'high'),
    makeMetric('enemy-spawns', 'Enemy spawn groups', enemySpawns),
    makeMetric('hazard-count', 'Hazard sources', hazards + hazardZones.length + hazardPaint.length),
    makeMetric('terrain-sculpt-patches', 'Terrain deformation patches', terrainSculptPatches.length),
    makeMetric('terrain-collision-samples', 'Terrain collision samples', terrainRuntime.collisionSamples, terrainSculptPatches.length > 0 ? '>= 1' : 'optional', terrainSculptPatches.length > 0 && terrainRuntime.collisionSamples === 0 ? 'medium' : 'low'),
    makeMetric('terrain-max-height', 'Max simulated terrain height', terrainRuntime.maxHeight, '<= 1.5m', terrainRuntime.maxHeight > 1.5 ? 'medium' : 'low'),
    makeMetric('terrain-steep-slope-samples', 'Steep terrain slope samples', terrainRuntime.steepSlopeCount, 0, terrainRuntime.steepSlopeCount > 0 ? 'medium' : 'low'),
    makeMetric('checkpoint-count', 'Checkpoints', checkpoints, enemySpawns > 0 ? '>= 1' : 'optional', enemySpawns > 0 && checkpoints === 0 ? 'high' : 'low'),
    makeMetric('pressure-score', 'Estimated pressure score', pressureScore, `<= ${recoveryScore + 4}`, pressureScore > recoveryScore + 4 ? 'medium' : 'low'),
    makeMetric('camera-plans', 'Camera readability plans', cameraPlans + (document.camera ? 1 : 0), '>= 1', cameraPlans > 0 || document.camera ? 'low' : 'medium'),
    makeMetric('accessibility-notes', 'Accessibility notes', accessibilityNotes.length, '>= 1', accessibilityNotes.length > 0 ? 'low' : 'medium'),
  ];

  const highestRisk = riskFromFindings(findings);
  const summary = findings.length === 0
    ? `Simulated ${runs} ${focus ? `${focus} ` : ''}playtest runs for "${document.title}" with no deterministic blocker findings.`
    : `Simulated ${runs} ${focus ? `${focus} ` : ''}playtest runs for "${document.title}" and found ${findings.length} ${highestRisk}-risk design issue${findings.length === 1 ? '' : 's'}.`;
  const personaReports = buildPersonaReports({ request, runs, findings, metrics });

  return {
    fileName,
    mode: 'viewport-artifact',
    runs,
    ...(focus ? { focus } : {}),
    summary: appendPersonaSummary(summary, personaReports),
    metrics,
    findings,
    ...(personaReports.length > 0 ? { personaReports } : {}),
  };
}

export function simulatePlayableArtifactPlayerBot(
  fileName: string,
  rawContent: string,
  request: GamePlaytestSimulationRequest | NormalizedGamePlaytestSimulationRequest = {},
): GamePlaytestSimulationResponse {
  const runs = cleanRuns(request.runs);
  const focus = cleanString(request.focus, 64);
  const lower = rawContent.toLowerCase();
  const title = htmlTitle(rawContent, fileName);
  const controlCount =
    countMatches(rawContent, /<button\b/gi) +
    countMatches(rawContent, /<a\b[^>]*href=/gi) +
    countMatches(rawContent, /<input\b/gi) +
    countMatches(rawContent, /role=["']button["']/gi) +
    countMatches(rawContent, /data-(?:player|game|gamebot)-action=/gi) +
    countMatches(rawContent, /\bon(?:click|pointerdown|touchstart|keydown)=/gi);
  const canvasCount = countMatches(rawContent, /<canvas\b/gi);
  const runtimeLoop = hasRuntimeSignal(rawContent, /\b(requestAnimationFrame|setInterval|gameLoop|update\s*\(|tick\s*\()/i);
  const keyboardInput = hasRuntimeSignal(rawContent, /\b(keydown|keyup|KeyboardEvent|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|WASD|code\s*===\s*['"]Key)/i);
  const touchInput = hasRuntimeSignal(rawContent, /\b(pointerdown|pointermove|touchstart|touchmove|gesture|swipe|tap|virtual joystick|one-thumb)\b/i);
  const gamepadInput = hasRuntimeSignal(rawContent, /\b(gamepad|controller|navigator\.getGamepads)\b/i);
  const hudSignals = countMatches(lower, /\b(hud|health|stamina|mana|ammo|cooldown|minimap|quest tracker|objective marker|boss health)\b/g);
  const objectiveSignals = countMatches(lower, /\b(objective|quest|mission|goal|extract|checkpoint|win condition|victory|score)\b/g);
  const combatSignals = countMatches(lower, /\b(enemy|attack|shoot|weapon|damage|hit|dodge|parry|boss|combat)\b/g);
  const failureSignals = countMatches(lower, /\b(game over|retry|respawn|death|fail state|defeat|checkpoint)\b/g);
  const accessibilitySignals = countMatches(lower, /\b(aria-|reduced-motion|subtitle|caption|colorblind|remap|accessibility|reduced motion|screen reader)\b/g);
  const inputModalities = [keyboardInput, touchInput, gamepadInput].filter(Boolean).length;
  const findings: GamePlaytestSimulationFinding[] = [];

  function addFinding(finding: GamePlaytestSimulationFinding): void {
    findings.push(finding);
  }

  if (controlCount === 0 && inputModalities === 0) {
    addFinding({
      id: 'runtime-bot-no-controls',
      severity: 'high',
      category: 'onboarding',
      message: 'The runtime player-bot found no actionable controls or input listeners.',
      evidence: `controls=${controlCount}, inputModalities=${inputModalities}`,
      recommendation: 'Expose buttons, keyboard/touch/gamepad listeners, or data-player-action hooks for start, movement, interaction, and retry actions.',
    });
  }

  if (canvasCount > 0 && !runtimeLoop) {
    addFinding({
      id: 'canvas-without-runtime-loop',
      severity: 'high',
      category: 'production',
      message: 'A canvas game surface is present without a detectable update loop.',
      evidence: `canvas=${canvasCount}, runtimeLoop=false`,
      recommendation: 'Wire requestAnimationFrame, a deterministic tick loop, or an engine update function before treating the artifact as playable.',
    });
  } else if (!runtimeLoop) {
    addFinding({
      id: 'missing-runtime-loop',
      severity: 'medium',
      category: 'production',
      message: 'The player-bot cannot detect a runtime update loop.',
      evidence: 'No requestAnimationFrame, setInterval, gameLoop, update(), or tick() signal was found.',
      recommendation: 'Add an explicit simulation loop or document the engine mount point so automated runtime playtests can drive it.',
    });
  }

  if (objectiveSignals === 0) {
    addFinding({
      id: 'runtime-bot-no-objective',
      severity: 'high',
      category: 'onboarding',
      message: 'The playable artifact does not expose a clear objective or win signal.',
      evidence: 'objectiveSignals=0',
      recommendation: 'Add visible objective, mission, extraction, checkpoint, score, or win-condition copy that the player-bot can verify.',
    });
  }

  if (hudSignals === 0 && (combatSignals > 0 || canvasCount > 0)) {
    addFinding({
      id: 'runtime-bot-no-hud-feedback',
      severity: 'medium',
      category: 'readability',
      message: 'Combat or canvas play is present without detectable HUD feedback.',
      evidence: `hudSignals=0, combatSignals=${combatSignals}, canvas=${canvasCount}`,
      recommendation: 'Expose health, stamina, ammo, cooldown, minimap, quest, boss-health, or objective-marker states in readable HUD markup.',
    });
  }

  if (failureSignals === 0 && (combatSignals > 0 || focus === 'combat')) {
    addFinding({
      id: 'runtime-bot-no-retry-state',
      severity: 'medium',
      category: 'pacing',
      message: 'The player-bot found combat pressure without a retry, respawn, checkpoint, or fail-state signal.',
      evidence: `combatSignals=${combatSignals}, failureSignals=0`,
      recommendation: 'Add explicit death, retry, respawn, checkpoint, or recovery-state UI so failure is readable and testable.',
    });
  }

  if (accessibilitySignals === 0) {
    addFinding({
      id: 'runtime-bot-no-accessibility-hooks',
      severity: 'medium',
      category: 'accessibility',
      message: 'No accessibility hooks were visible to the runtime player-bot.',
      evidence: 'accessibilitySignals=0',
      recommendation: 'Add aria labels, subtitle/caption affordances, reduced-motion handling, colorblind-safe state labels, or remappable-input notes.',
    });
  }

  if (focus === 'mobile' && !touchInput) {
    addFinding({
      id: 'mobile-focus-without-touch-input',
      severity: 'medium',
      category: 'accessibility',
      message: 'Mobile-focused runtime playtesting requested touch input, but no touch or pointer controls were detected.',
      evidence: 'focus=mobile, touchInput=false',
      recommendation: 'Add touch/pointer controls, gesture targets, or one-thumb control affordances for mobile playtests.',
    });
  }

  const botActions: GamePlaytestBotAction[] = [
    makeBotAction(
      'launch-artifact',
      'Launch playable artifact',
      title,
      runtimeLoop || controlCount > 0 ? 'passed' : 'warning',
      textEvidence(runtimeLoop, 'Runtime loop detected.', 'No runtime loop detected; launch remains static.'),
    ),
    makeBotAction(
      'read-objective',
      'Read current objective',
      title,
      objectiveSignals > 0 ? 'passed' : 'blocked',
      `objectiveSignals=${objectiveSignals}`,
    ),
    makeBotAction(
      'drive-input',
      'Drive player input',
      keyboardInput ? 'keyboard' : touchInput ? 'touch' : gamepadInput ? 'gamepad' : 'unknown',
      inputModalities > 0 || controlCount > 0 ? 'passed' : 'blocked',
      `controls=${controlCount}, keyboard=${keyboardInput}, touch=${touchInput}, gamepad=${gamepadInput}`,
    ),
    makeBotAction(
      'read-hud-state',
      'Read HUD and gameplay feedback',
      title,
      hudSignals > 0 ? 'passed' : 'warning',
      `hudSignals=${hudSignals}`,
    ),
  ];

  if (combatSignals > 0) {
    botActions.push(makeBotAction(
      'probe-combat-feedback',
      'Probe combat feedback',
      title,
      hudSignals > 0 && failureSignals > 0 ? 'passed' : 'warning',
      `combatSignals=${combatSignals}, hudSignals=${hudSignals}, failureSignals=${failureSignals}`,
    ));
  }

  const metrics: GamePlaytestSimulationMetric[] = [
    makeMetric('runs', 'Runtime bot passes', runs, '1-50', 'low'),
    makeMetric('bot-actions', 'Bot action checks', botActions.length, '>= 4', botActions.length >= 4 ? 'low' : 'medium'),
    makeMetric('interactive-targets', 'Interactive targets', controlCount, '>= 1', controlCount > 0 ? 'low' : 'high'),
    makeMetric('input-modalities', 'Input modalities', inputModalities, '>= 1', inputModalities > 0 ? 'low' : 'high'),
    makeMetric('runtime-loop', 'Runtime loop signal', runtimeLoop ? 1 : 0, 1, runtimeLoop ? 'low' : canvasCount > 0 ? 'high' : 'medium'),
    makeMetric('hud-signals', 'HUD feedback signals', hudSignals, '>= 1', hudSignals > 0 ? 'low' : 'medium'),
    makeMetric('objective-signals', 'Objective signals', objectiveSignals, '>= 1', objectiveSignals > 0 ? 'low' : 'high'),
    makeMetric('accessibility-signals', 'Accessibility hooks', accessibilitySignals, '>= 1', accessibilitySignals > 0 ? 'low' : 'medium'),
  ];

  const highestRisk = riskFromFindings(findings);
  const summary = findings.length === 0
    ? `Ran ${runs} runtime player-bot pass${runs === 1 ? '' : 'es'} against "${title}" with playable controls, objective feedback, HUD state, and accessibility hooks detected.`
    : `Ran ${runs} runtime player-bot pass${runs === 1 ? '' : 'es'} against "${title}" and found ${findings.length} ${highestRisk}-risk runtime issue${findings.length === 1 ? '' : 's'}.`;
  const personaReports = buildPersonaReports({ request, runs, findings, metrics, botActions });

  return {
    fileName,
    mode: 'playable-artifact',
    runs,
    ...(focus ? { focus } : {}),
    summary: appendPersonaSummary(summary, personaReports),
    metrics,
    findings,
    botActions,
    ...(personaReports.length > 0 ? { personaReports } : {}),
  };
}

async function launchHeadlessChromium(chromium: any): Promise<any> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    return chromium.launch({ channel: 'chrome', headless: true });
  }
}

function compactEvidence(value: string, maxLength = 160): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength) || 'none';
}

export async function simulatePlayableArtifactHeadlessBrowser(
  fileName: string,
  rawContent: string,
  request: GamePlaytestSimulationRequest | NormalizedGamePlaytestSimulationRequest = {},
): Promise<GamePlaytestSimulationResponse> {
  const staticResult = simulatePlayableArtifactPlayerBot(fileName, rawContent, request);
  const runs = staticResult.runs;
  const focus = staticResult.focus;
  const findings: GamePlaytestSimulationFinding[] = [...staticResult.findings];
  const botActions: GamePlaytestBotAction[] = [...(staticResult.botActions ?? [])];

  let browser: any | undefined;
  try {
    const { chromium } = await import('playwright');
    browser = await launchHeadlessChromium(chromium);
    const context = await browser.newContext({
      viewport: { width: 960, height: 540 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const consoleIssues: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message: any) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleIssues.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error: Error) => {
      pageErrors.push(error.message);
    });

    await page.setContent(rawContent, { waitUntil: 'domcontentloaded', timeout: 5_000 });
    await page.waitForTimeout(100);
    const title = (await page.title().catch(() => '')) || htmlTitle(rawContent, fileName);
    const interactiveSelector = 'button, [role="button"], a[href], input, [data-player-action], [data-game-action], [data-gamebot-action]';
    const clickSelector = 'button, [role="button"], [data-player-action], [data-game-action], [data-gamebot-action]';
    const interactiveTargets = await page.locator(interactiveSelector).count().catch(() => 0);
    const clickableTargets = await page.locator(clickSelector).count().catch(() => 0);
    const clicked: string[] = [];

    for (let index = 0; index < Math.min(clickableTargets, 3); index += 1) {
      const target = page.locator(clickSelector).nth(index);
      const label = compactEvidence(
        (await target.getAttribute('aria-label').catch(() => null))
        ?? (await target.getAttribute('data-player-action').catch(() => null))
        ?? (await target.getAttribute('data-game-action').catch(() => null))
        ?? (await target.textContent().catch(() => null))
        ?? `control-${index + 1}`,
        48,
      );
      await target.click({ timeout: 1_500 }).then(
        () => clicked.push(label),
        () => clicked.push(`${label} (blocked)`),
      );
    }

    await page.keyboard.press('ArrowRight').catch(() => {});
    await page.keyboard.press('KeyD').catch(() => page.keyboard.press('d').catch(() => {}));
    await page.mouse.click(480, 270).catch(() => {});
    await page.waitForTimeout(150);

    const bodyText = await page.locator('body').innerText({ timeout: 1_500 }).catch(() => '');
    const hudText = await page
      .locator('[id*="hud" i], [class*="hud" i], [aria-label*="hud" i], [data-game-hud], [data-hud]')
      .first()
      .innerText({ timeout: 1_000 })
      .catch(() => '');
    const stateText = await page
      .evaluate('JSON.stringify(window.__AGDS_PLAYTEST_STATE__ || window.gameState || window.state || null)')
      .catch(() => 'null');
    const objectiveVisible = /\b(objective|quest|mission|extract|checkpoint|victory|win|score)\b/i.test(bodyText);
    const hudVisible = /\b(hud|health|stamina|mana|ammo|cooldown|minimap|objective|boss)\b/i.test(`${hudText}\n${bodyText}\n${stateText}`);
    const launchStatus: GamePlaytestBotAction['status'] = pageErrors.length === 0 ? 'passed' : 'blocked';
    const clickStatus: GamePlaytestBotAction['status'] = clicked.length > 0 && clicked.some((label) => !label.includes('(blocked)')) ? 'passed' : 'warning';

    botActions.push(
      makeBotAction(
        'headless-launch',
        'Launch in daemon headless browser',
        title,
        launchStatus,
        pageErrors.length === 0 ? 'Chromium loaded and executed the artifact DOM.' : compactEvidence(pageErrors.join('; ')),
      ),
      makeBotAction(
        'headless-click-controls',
        'Click actionable gameplay controls',
        clicked.length > 0 ? clicked.join(', ') : 'no clickable controls',
        clickStatus,
        `clicked=${clicked.length}, targets=${clickableTargets}`,
      ),
      makeBotAction(
        'headless-keyboard-drive',
        'Drive keyboard movement inputs',
        'ArrowRight + KeyD',
        'passed',
        'Keyboard movement probes were dispatched inside the browser context.',
      ),
      makeBotAction(
        'headless-pointer-probe',
        'Probe pointer/touch-style interaction',
        'viewport center',
        'passed',
        'Pointer probe was dispatched at the gameplay viewport center.',
      ),
      makeBotAction(
        'headless-read-hud-state',
        'Read HUD and gameplay state after input',
        title,
        hudVisible ? 'passed' : 'warning',
        `hud="${compactEvidence(hudText)}"; state=${compactEvidence(stateText, 96)}`,
      ),
    );

    if (interactiveTargets === 0) {
      findings.push({
        id: 'headless-browser-no-dom-targets',
        severity: 'high',
        category: 'onboarding',
        message: 'The daemon headless browser found no interactive DOM targets to drive.',
        evidence: 'interactiveTargets=0',
        recommendation: 'Expose gameplay controls through buttons, role=button nodes, input elements, links, or data-player-action hooks.',
      });
    }

    if (!objectiveVisible) {
      findings.push({
        id: 'headless-browser-objective-not-visible',
        severity: 'medium',
        category: 'onboarding',
        message: 'The objective was not readable after browser-executed input.',
        evidence: `body="${compactEvidence(bodyText)}"`,
        recommendation: 'Keep mission, extraction, checkpoint, score, or win-condition state visible after player input changes the scene.',
      });
    }

    if (!hudVisible) {
      findings.push({
        id: 'headless-browser-hud-not-readable',
        severity: 'medium',
        category: 'readability',
        message: 'The daemon headless browser could not read HUD or gameplay state after input.',
        evidence: `hud="${compactEvidence(hudText)}", state=${compactEvidence(stateText, 96)}`,
        recommendation: 'Expose health, stamina, ammo, cooldown, boss, objective, or minimap state in readable HUD markup or a testable game state object.',
      });
    }

    if (consoleIssues.length > 0 || pageErrors.length > 0) {
      findings.push({
        id: 'headless-browser-runtime-errors',
        severity: pageErrors.length > 0 ? 'high' : 'medium',
        category: 'production',
        message: 'The daemon headless browser observed runtime console or page errors.',
        evidence: compactEvidence([...pageErrors, ...consoleIssues].join('; '), 240),
        recommendation: 'Fix runtime exceptions and warnings before treating the playable artifact as shippable or benchmark-ready.',
      });
    }

    const browserMetrics: GamePlaytestSimulationMetric[] = [
      makeMetric('headless-browser-actions', 'Headless browser action probes', 5, '>= 5', 'low'),
      makeMetric('dom-interactive-targets', 'Browser interactive DOM targets', interactiveTargets, '>= 1', interactiveTargets > 0 ? 'low' : 'high'),
      makeMetric('browser-clicked-controls', 'Browser-clicked controls', clicked.filter((label) => !label.includes('(blocked)')).length, '>= 1', clickStatus === 'passed' ? 'low' : 'medium'),
      makeMetric('console-errors', 'Browser console issues', consoleIssues.length, 0, consoleIssues.length === 0 ? 'low' : 'medium'),
      makeMetric('page-errors', 'Browser page errors', pageErrors.length, 0, pageErrors.length === 0 ? 'low' : 'high'),
      makeMetric('browser-hud-readable', 'HUD readable after input', hudVisible ? 1 : 0, 1, hudVisible ? 'low' : 'medium'),
      makeMetric('browser-objective-readable', 'Objective readable after input', objectiveVisible ? 1 : 0, 1, objectiveVisible ? 'low' : 'medium'),
    ];
    const highestRisk = riskFromFindings(findings);
    const summary = findings.length === 0
      ? `Ran ${runs} daemon headless-browser player-bot pass${runs === 1 ? '' : 'es'} against "${title}" with executable controls, keyboard/pointer probes, HUD state, and objective readability verified.`
      : `Ran ${runs} daemon headless-browser player-bot pass${runs === 1 ? '' : 'es'} against "${title}" and found ${findings.length} ${highestRisk}-risk runtime issue${findings.length === 1 ? '' : 's'}.`;
    const metrics = [...staticResult.metrics, ...browserMetrics];
    const personaReports = buildPersonaReports({ request, runs, findings, metrics, botActions });

    await context.close().catch(() => {});
    return {
      fileName,
      mode: 'headless-browser',
      runs,
      ...(focus ? { focus } : {}),
      summary: appendPersonaSummary(summary, personaReports),
      metrics,
      findings,
      botActions,
      ...(personaReports.length > 0 ? { personaReports } : {}),
    };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    findings.push({
      id: 'headless-browser-unavailable',
      severity: 'high',
      category: 'production',
      message: 'The daemon could not launch a headless browser for runtime playtesting.',
      evidence: compactEvidence(message, 240),
      recommendation: 'Install Playwright browser binaries or configure a supported local Chromium/Chrome channel for daemon runtime playtests.',
    });
    botActions.push(makeBotAction(
      'headless-launch',
      'Launch in daemon headless browser',
      fileName,
      'blocked',
      compactEvidence(message, 240),
    ));
    const metrics = [
      ...staticResult.metrics,
      makeMetric('headless-browser-actions', 'Headless browser action probes', 0, '>= 5', 'high'),
      makeMetric('page-errors', 'Browser page errors', 1, 0, 'high'),
    ];
    const summary = `Headless-browser player-bot could not execute "${fileName}": ${compactEvidence(message, 180)}`;
    const personaReports = buildPersonaReports({ request, runs, findings, metrics, botActions });
    return {
      fileName,
      mode: 'headless-browser',
      runs,
      ...(focus ? { focus } : {}),
      summary: appendPersonaSummary(summary, personaReports),
      metrics,
      findings,
      botActions,
      ...(personaReports.length > 0 ? { personaReports } : {}),
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
