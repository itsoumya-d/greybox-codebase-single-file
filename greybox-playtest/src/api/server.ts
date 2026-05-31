// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

import { buildPlaytestBenchmarkReport } from '../reporter/benchmark.js';
import { buildPlaytestRegressionReport } from '../reporter/regression.js';
import { buildUserStudyAcceptanceReport, recordUserStudyDecision } from '../reporter/userStudy.js';
import { createSeededPlatformerSample } from '../runner/samples.js';
import { runPlaytestLoop } from '../orchestrator/orchestrator.js';
import { personasForAlpha } from '../personas/index.js';
import { redactPlaytestJson } from '../privacy/redaction.js';
import type {
  ObservedIssue,
  PlayableArtifact,
  PlaytestBenchmarkReport,
  PlaytestLoopRequest,
  PlaytestPersona,
  PlaytestRegressionReport,
  PlaytestRegressionTargets,
  PlaytestReport,
  SeededBug,
  TuningSuggestion,
  UserStudyParticipantRole,
} from '../types.js';

const DEFAULT_MAX_BODY_BYTES = 512 * 1024;
const MAX_DURATION_MS = 30 * 60 * 1_000;
const MAX_CONCURRENCY = 8;
const MAX_CONTENT_IDS = 200;
const MAX_SEEDED_BUGS = 50;
const MAX_DETECTOR_HINTS = 8;
const ENGINES = new Set<PlayableArtifact['engine']>(['html-canvas', 'phaser', 'threejs', 'unity-webgl', 'custom']);
const SEEDED_BUG_KINDS = new Set<SeededBug['kind']>(['collision', 'softlock', 'readability', 'balance', 'progression', 'layout']);
const SEVERITIES = new Set<SeededBug['severity']>(['low', 'medium', 'high', 'critical']);
const PARTICIPANT_ROLES = new Set<UserStudyParticipantRole>(['human-playtester', 'designer', 'qa', 'producer']);

export interface PlaytestApiOptions {
  authToken?: string;
  clock?: { now: () => number };
  maxBodyBytes?: number;
}

export interface StartedPlaytestServer {
  server: Server;
  url: string;
}

interface PlaytestRunBody {
  sample?: '2d-platformer';
  artifact?: PlayableArtifact;
  personas?: 'alpha' | string[];
  durationMs?: number;
  concurrency?: number;
}

interface HumanAcceptanceBody {
  studyId?: string;
  suggestionId?: string;
  participantExternalId?: string;
  participantRole?: UserStudyParticipantRole;
  decision?: 'accepted' | 'rejected';
  decidedAt?: number;
  consentConfirmed?: boolean;
  notes?: string;
}

interface PlaytestBenchmarkBody extends PlaytestRunBody {
  humanAcceptance?: HumanAcceptanceBody;
}

interface PlaytestRegressionBody {
  before?: PlaytestRunBody;
  after?: PlaytestRunBody;
  acceptedSuggestionIds?: string[];
  targets?: Partial<PlaytestRegressionTargets>;
}

export interface SafePlaytestRunSummary {
  personaId: string;
  personaName: string;
  completed: boolean;
  deaths: number;
  frustrationMoments: number;
  completionTimeMs?: number;
  unusedContentIds: string[];
  bugsObserved: string[];
}

export interface SafePlaytestReport {
  id: string;
  artifactId: string;
  artifactTitle: string;
  generatedAt: number;
  durationMs: number;
  personasRun: number;
  completedRuns: number;
  totalDeaths: number;
  frustrationMoments: number;
  unusedContentIds: string[];
  issues: ObservedIssue[];
  suggestions: TuningSuggestion[];
  runSummaries: SafePlaytestRunSummary[];
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(redactPlaytestJson(body));
  res.writeHead(status, {
    'Access-Control-Allow-Headers': 'authorization, content-type, x-greybox-playtest-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(encoded).toString(),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(encoded);
}

function noContent(res: ServerResponse): void {
  res.writeHead(204, {
    'Access-Control-Allow-Headers': 'authorization, content-type, x-greybox-playtest-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
  });
  res.end();
}

function errorResponse(res: ServerResponse, status: number, code: string, message: string): void {
  jsonResponse(res, status, { error: { code, message } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
  return value;
}

function optionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
  return value;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${key} is required`);
  return trimmed;
}

function normalizeStringList(value: unknown, key: string, maxItems: number): string[] {
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  if (value.length > maxItems) throw new Error(`${key} exceeds the ${maxItems}-item API limit`);
  const normalized = value
    .map((item, index) => {
      if (typeof item !== 'string') throw new Error(`${key}[${index}] must be a string`);
      return item.trim();
    })
    .filter((item) => item.length > 0);
  return [...new Set(normalized)];
}

function normalizeSeededBugs(value: unknown, durationTargetMs: number): SeededBug[] {
  if (!Array.isArray(value)) throw new Error('artifact.seededBugs must be an array');
  if (value.length > MAX_SEEDED_BUGS) throw new Error(`artifact.seededBugs exceeds the ${MAX_SEEDED_BUGS}-item API limit`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`artifact.seededBugs[${index}] must be an object`);
    const kind = requiredString(item, 'kind');
    if (!SEEDED_BUG_KINDS.has(kind as SeededBug['kind'])) throw new Error(`artifact.seededBugs[${index}].kind is not supported`);
    const severity = requiredString(item, 'severity');
    if (!SEVERITIES.has(severity as SeededBug['severity'])) throw new Error(`artifact.seededBugs[${index}].severity is not supported`);
    const triggerAtMsValue = item.triggerAtMs;
    if (typeof triggerAtMsValue !== 'number'
      || !Number.isInteger(triggerAtMsValue)
      || triggerAtMsValue < 0
      || triggerAtMsValue > durationTargetMs) {
      throw new Error(`artifact.seededBugs[${index}].triggerAtMs must be an integer within durationTargetMs`);
    }
    const triggerAtMs = triggerAtMsValue;
    return {
      id: requiredString(item, 'id'),
      label: requiredString(item, 'label'),
      kind: kind as SeededBug['kind'],
      severity: severity as SeededBug['severity'],
      targetId: requiredString(item, 'targetId'),
      triggerAtMs,
      detectorHints: normalizeStringList(item.detectorHints, `artifact.seededBugs[${index}].detectorHints`, MAX_DETECTOR_HINTS),
      suggestedFix: requiredString(item, 'suggestedFix'),
    };
  });
}

async function readJson(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      const error = new Error('request body too large');
      Object.assign(error, { status: 413, code: 'PAYLOAD_TOO_LARGE' });
      throw error;
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function tokenFromHeaders(req: IncomingMessage): string | undefined {
  const explicit = req.headers['x-greybox-playtest-token'];
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return undefined;
  const token = auth.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

function tokenDigest(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function playtestTokenMatches(candidate: string | undefined, expected: string): boolean {
  if (!candidate) return false;
  return timingSafeEqual(tokenDigest(candidate), tokenDigest(expected));
}

function requireAuth(req: IncomingMessage, authToken: string | undefined): void {
  if (!authToken) {
    const error = new Error('playtest auth token is not configured');
    Object.assign(error, { status: 503, code: 'PLAYTEST_AUTH_TOKEN_MISSING' });
    throw error;
  }
  if (!playtestTokenMatches(tokenFromHeaders(req), authToken)) {
    const error = new Error('valid playtest bearer token required');
    Object.assign(error, { status: 401, code: 'UNAUTHORIZED' });
    throw error;
  }
}

function normalizeArtifact(body: PlaytestRunBody): PlayableArtifact {
  if (body.sample === '2d-platformer' || body.artifact === undefined) return createSeededPlatformerSample();
  const artifact = body.artifact;
  if (!isRecord(artifact)) throw new Error('artifact must be an object');
  if (typeof artifact.id !== 'string' || artifact.id.trim().length === 0) throw new Error('artifact.id is required');
  if (typeof artifact.title !== 'string' || artifact.title.trim().length === 0) throw new Error('artifact.title is required');
  if (!ENGINES.has(artifact.engine)) throw new Error('artifact.engine is not supported');
  if (!Number.isInteger(artifact.durationTargetMs) || artifact.durationTargetMs <= 0) {
    throw new Error('artifact.durationTargetMs must be a positive integer');
  }
  const contentIds = normalizeStringList(artifact.contentIds, 'artifact.contentIds', MAX_CONTENT_IDS);
  const seededBugs = normalizeSeededBugs(artifact.seededBugs, artifact.durationTargetMs);
  return {
    id: artifact.id.trim(),
    title: artifact.title.trim(),
    engine: artifact.engine,
    ...(typeof artifact.url === 'string' && artifact.url.trim() ? { url: artifact.url.trim() } : {}),
    ...(typeof artifact.html === 'string' && artifact.html ? { html: artifact.html } : {}),
    durationTargetMs: artifact.durationTargetMs,
    contentIds,
    seededBugs,
  };
}

function normalizePersonas(input: PlaytestRunBody): PlaytestPersona[] {
  const alpha = personasForAlpha();
  if (input.personas === undefined || input.personas === 'alpha') return alpha;
  if (!Array.isArray(input.personas)) throw new Error('personas must be "alpha" or an array of persona ids');
  const ids = new Set(input.personas);
  const selected = alpha.filter((persona) => ids.has(persona.id));
  if (selected.length !== ids.size) throw new Error('personas contains an unknown persona id');
  return selected;
}

function normalizeDurationMs(input: PlaytestRunBody, artifact: PlayableArtifact): number {
  const durationMs = input.durationMs ?? artifact.durationTargetMs;
  if (!Number.isInteger(durationMs) || durationMs <= 0) throw new Error('durationMs must be a positive integer');
  if (durationMs > MAX_DURATION_MS) throw new Error('durationMs exceeds the 30-minute API limit');
  return durationMs;
}

function normalizeConcurrency(input: PlaytestRunBody): number | undefined {
  if (input.concurrency === undefined) return undefined;
  if (!Number.isInteger(input.concurrency) || input.concurrency <= 0) {
    throw new Error('concurrency must be a positive integer');
  }
  return Math.min(input.concurrency, MAX_CONCURRENCY);
}

function normalizeRegressionTargets(value: unknown): Partial<PlaytestRegressionTargets> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error('targets must be an object');
  const out: Partial<PlaytestRegressionTargets> = {};
  for (const key of [
    'minResolvedSeededBugs',
    'maxNewCriticalIssues',
    'maxCompletionRegressionBps',
    'minAcceptedSuggestionsApplied',
  ] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      throw new Error(`targets.${key} must be a non-negative integer`);
    }
    out[key] = raw;
  }
  return out;
}

async function runFromBody(body: unknown, options: PlaytestApiOptions): Promise<PlaytestReport> {
  if (!isRecord(body)) throw new Error('playtest request body must be an object');
  const requestBody = body as PlaytestRunBody;
  const artifact = normalizeArtifact(requestBody);
  const concurrency = normalizeConcurrency(requestBody);
  const request: PlaytestLoopRequest = {
    artifact,
    personas: normalizePersonas(requestBody),
    durationMs: normalizeDurationMs(requestBody, artifact),
    ...(options.clock ? { now: options.clock.now } : {}),
    ...(concurrency !== undefined ? { concurrency } : {}),
  };
  return runPlaytestLoop(request);
}

function optionsAt(options: PlaytestApiOptions, now: number): PlaytestApiOptions {
  return {
    ...options,
    clock: { now: () => now },
  };
}

function safeReport(report: PlaytestReport): SafePlaytestReport {
  return {
    id: report.id,
    artifactId: report.artifactId,
    artifactTitle: report.artifactTitle,
    generatedAt: report.generatedAt,
    durationMs: report.durationMs,
    personasRun: report.personasRun,
    completedRuns: report.completedRuns,
    totalDeaths: report.totalDeaths,
    frustrationMoments: report.frustrationMoments,
    unusedContentIds: report.unusedContentIds,
    issues: report.issues,
    suggestions: report.suggestions,
    runSummaries: report.runs.map((run) => ({
      personaId: run.persona.id,
      personaName: run.persona.name,
      completed: run.completed,
      deaths: run.metrics.deaths,
      frustrationMoments: run.metrics.frustrationMoments,
      ...(run.metrics.completionTimeMs !== undefined ? { completionTimeMs: run.metrics.completionTimeMs } : {}),
      unusedContentIds: run.metrics.unusedContentIds,
      bugsObserved: run.metrics.bugsObserved,
    })),
  };
}

function normalizeHumanAcceptance(
  body: PlaytestBenchmarkBody,
  report: PlaytestReport,
  now: number,
): HumanAcceptanceBody | undefined {
  const input = body.humanAcceptance;
  if (input === undefined) return undefined;
  if (!isRecord(input)) throw new Error('humanAcceptance must be an object');
  const suggestionId = optionalString(input, 'suggestionId') ?? report.suggestions[0]?.id;
  if (!suggestionId) throw new Error('humanAcceptance requires a suggestionId when the report has no suggestions');
  const participantRole = optionalString(input, 'participantRole') ?? 'human-playtester';
  if (!PARTICIPANT_ROLES.has(participantRole as UserStudyParticipantRole)) {
    throw new Error('humanAcceptance.participantRole is not supported');
  }
  const decision = optionalString(input, 'decision') ?? 'accepted';
  if (decision !== 'accepted' && decision !== 'rejected') {
    throw new Error('humanAcceptance.decision must be accepted or rejected');
  }
  const notes = optionalString(input, 'notes');
  return {
    studyId: optionalString(input, 'studyId') ?? `${report.artifactId}-api-study`,
    suggestionId,
    participantExternalId: optionalString(input, 'participantExternalId') ?? 'anonymous-human-playtester',
    participantRole: participantRole as UserStudyParticipantRole,
    decision,
    decidedAt: optionalNumber(input, 'decidedAt') ?? now,
    consentConfirmed: optionalBoolean(input, 'consentConfirmed') ?? false,
    ...(notes ? { notes } : {}),
  };
}

function benchmarkForBody(
  body: unknown,
  report: PlaytestReport,
  options: PlaytestApiOptions,
): PlaytestBenchmarkReport {
  if (!isRecord(body)) throw new Error('playtest benchmark body must be an object');
  const now = options.clock?.now() ?? Date.now();
  const requestBody = body as PlaytestBenchmarkBody;
  const acceptance = normalizeHumanAcceptance(requestBody, report, now);
  if (!acceptance) {
    return buildPlaytestBenchmarkReport({ report, generatedAt: now });
  }
  const decision = recordUserStudyDecision(report, {
    studyId: acceptance.studyId ?? `${report.artifactId}-api-study`,
    suggestionId: acceptance.suggestionId ?? report.suggestions[0]?.id ?? '',
    participantExternalId: acceptance.participantExternalId ?? 'anonymous-human-playtester',
    participantRole: acceptance.participantRole ?? 'human-playtester',
    decision: acceptance.decision ?? 'accepted',
    decidedAt: acceptance.decidedAt ?? now,
    consentConfirmed: acceptance.consentConfirmed === true,
    ...(acceptance.notes ? { notes: acceptance.notes } : {}),
  });
  const acceptanceReport = buildUserStudyAcceptanceReport({
    report,
    studyId: decision.studyId,
    decisions: [decision],
    generatedAt: now,
  });
  return buildPlaytestBenchmarkReport({ report, acceptanceReport, generatedAt: now });
}

async function regressionForBody(
  body: unknown,
  options: PlaytestApiOptions,
): Promise<{
  before: PlaytestReport;
  after: PlaytestReport;
  regression: PlaytestRegressionReport;
}> {
  if (!isRecord(body)) throw new Error('playtest regression body must be an object');
  const requestBody = body as PlaytestRegressionBody;
  if (!isRecord(requestBody.before)) throw new Error('before must be a playtest request object');
  if (!isRecord(requestBody.after)) throw new Error('after must be a playtest request object');
  const acceptedSuggestionIds = requestBody.acceptedSuggestionIds === undefined
    ? undefined
    : normalizeStringList(requestBody.acceptedSuggestionIds, 'acceptedSuggestionIds', 100);
  const targets = normalizeRegressionTargets(requestBody.targets);
  const generatedAt = options.clock?.now() ?? Date.now();
  const before = await runFromBody(requestBody.before, optionsAt(options, generatedAt));
  const after = await runFromBody(requestBody.after, optionsAt(options, generatedAt + 1));
  const regression = buildPlaytestRegressionReport({
    before,
    after,
    ...(acceptedSuggestionIds ? { acceptedSuggestionIds } : {}),
    generatedAt: generatedAt + 2,
    ...(targets ? { targets } : {}),
  });
  return { before, after, regression };
}

export function createPlaytestApi(options: PlaytestApiOptions = {}) {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      noContent(res);
      return;
    }
    const url = new URL(req.url ?? '/', 'http://greybox-playtest.local');
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        jsonResponse(res, 200, { ok: true, service: 'greybox-playtest' });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/playtest/run') {
        requireAuth(req, options.authToken);
        const report = await runFromBody(await readJson(req, maxBodyBytes), options);
        jsonResponse(res, 201, { report: safeReport(report) });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/playtest/benchmark') {
        requireAuth(req, options.authToken);
        const body = await readJson(req, maxBodyBytes);
        const report = await runFromBody(body, options);
        const benchmark = benchmarkForBody(body, report, options);
        jsonResponse(res, 201, { report: safeReport(report), benchmark });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/playtest/regression') {
        requireAuth(req, options.authToken);
        const result = await regressionForBody(await readJson(req, maxBodyBytes), options);
        jsonResponse(res, 201, {
          before: safeReport(result.before),
          after: safeReport(result.after),
          regression: result.regression,
        });
        return;
      }
      errorResponse(res, 404, 'NOT_FOUND', 'playtest route not found');
    } catch (error) {
      const status = typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : 400;
      const code = typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : 'BAD_REQUEST';
      errorResponse(res, status, code, error instanceof Error ? error.message : String(error));
    }
  };
}

export async function startPlaytestServer(options: PlaytestApiOptions & {
  host?: string;
  port?: number;
} = {}): Promise<StartedPlaytestServer> {
  const host = options.host ?? '127.0.0.1';
  const server = createServer(createPlaytestApi(options));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('playtest server did not bind to a TCP port');
  return {
    server,
    url: `http://${host}:${address.port}`,
  };
}
