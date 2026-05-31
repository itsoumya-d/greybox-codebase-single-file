import type {
  GameTelemetryEventInput,
  GameTelemetryIngestResponse,
  GameTelemetrySummary,
} from './api/projects';

export interface GameTelemetryFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text?(): Promise<string>;
}

export type GameTelemetryFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<GameTelemetryFetchResponse>;

export interface GameTelemetryClientContext {
  sessionId?: string;
  playerId?: string;
  sceneId?: string;
  encounterId?: string;
  buildId?: string;
  platform?: string;
}

export interface GameTelemetryClientOptions {
  endpoint: string;
  headers?: Record<string, string>;
  context?: GameTelemetryClientContext;
  fetch?: GameTelemetryFetch;
  now?: () => number;
}

export interface GameTelemetryClient {
  track(event: GameTelemetryEventInput): number;
  flush(): Promise<GameTelemetryIngestResponse | null>;
  pendingCount(): number;
  pendingEvents(): GameTelemetryEventInput[];
  clear(): void;
}

function emptySummary(): GameTelemetrySummary {
  return {
    total: 0,
    byType: {},
    byScene: {},
    sessionCount: 0,
  };
}

function defaultFetch(): GameTelemetryFetch {
  const candidate = (globalThis as unknown as { fetch?: GameTelemetryFetch }).fetch;
  if (!candidate) {
    throw new Error('Game telemetry client requires fetch or an injected fetch implementation.');
  }
  return candidate;
}

function cleanEndpoint(endpoint: string): string {
  const clean = endpoint.trim();
  if (!clean) throw new Error('Game telemetry endpoint is required.');
  return clean;
}

function cloneEvent(event: GameTelemetryEventInput): GameTelemetryEventInput {
  return JSON.parse(JSON.stringify(event)) as GameTelemetryEventInput;
}

function normalizeResponse(value: unknown): GameTelemetryIngestResponse {
  if (!value || typeof value !== 'object') {
    return { events: [], stored: 0, summary: emptySummary() };
  }
  const record = value as Partial<GameTelemetryIngestResponse>;
  return {
    events: Array.isArray(record.events) ? record.events : [],
    stored: typeof record.stored === 'number' ? record.stored : 0,
    summary: record.summary ?? emptySummary(),
  };
}

export function createGameTelemetryClient(options: GameTelemetryClientOptions): GameTelemetryClient {
  const endpoint = cleanEndpoint(options.endpoint);
  const fetchImpl = options.fetch ?? defaultFetch();
  const now = options.now ?? Date.now;
  const queue: GameTelemetryEventInput[] = [];

  return {
    track(event: GameTelemetryEventInput): number {
      const telemetryEvent = cloneEvent({
        ...options.context,
        ...event,
        timestamp: event.timestamp ?? now(),
      });
      queue.push(telemetryEvent);
      return queue.length;
    },

    async flush(): Promise<GameTelemetryIngestResponse | null> {
      if (queue.length === 0) return null;
      const batch = queue.map(cloneEvent);
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
        },
        body: JSON.stringify({ events: batch }),
      });
      if (!response.ok) {
        const detail = response.text ? await response.text().catch(() => '') : '';
        const suffix = detail ? `: ${detail}` : '';
        throw new Error(`Game telemetry ingest failed (${response.status})${suffix}`);
      }
      queue.splice(0, batch.length);
      return normalizeResponse(await response.json());
    },

    pendingCount(): number {
      return queue.length;
    },

    pendingEvents(): GameTelemetryEventInput[] {
      return queue.map(cloneEvent);
    },

    clear(): void {
      queue.length = 0;
    },
  };
}
