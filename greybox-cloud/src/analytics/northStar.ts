// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type AnalyticsEventName =
  | 'signup'
  | 'project-created'
  | 'artifact-created'
  | 'artifact-saved'
  | 'engine-export';

export type EngineTarget = 'unity' | 'unreal' | 'godot';

export interface ProductAnalyticsEvent {
  id: string;
  name: AnalyticsEventName;
  designerId: string;
  occurredAt: number;
  telemetryOptIn: boolean;
  projectId?: string;
  artifactId?: string;
  engine?: EngineTarget;
}

export interface NorthStarTargets {
  weeklyActiveDesignersShippingToEngines: number;
  minActivationToExportRateBps: number;
  minUnityExportingDesigners: number;
  minUnrealExportingDesigners: number;
  minGodotExportingDesigners: number;
  minTelemetryOptInEventRateBps: number;
}

export interface ActivationFunnelStep {
  id: AnalyticsEventName;
  label: string;
  designers: number;
  conversionFromPreviousBps: number;
}

export interface NorthStarShortfall {
  code:
    | 'north_star_shortfall'
    | 'activation_export_shortfall'
    | 'unity_export_shortfall'
    | 'unreal_export_shortfall'
    | 'godot_export_shortfall'
    | 'telemetry_opt_in_shortfall';
  severity: 'warning' | 'error';
  detail: string;
  remediation?: string;
}

export interface NorthStarReport {
  ready: boolean;
  generatedAt: string;
  period: {
    from: number;
    to: number;
    label: string;
  };
  disclaimer: string;
  targets: NorthStarTargets;
  summary: {
    scopedEvents: number;
    optedInEvents: number;
    ignoredNoConsentEvents: number;
    ignoredDuplicateEvents: number;
    telemetryOptInEventRateBps: number;
    weeklyActiveDesignersShippingToEngines: number;
    activationToExportRateBps: number;
    projectsWithEngineExports: number;
    artifactsExportedToEngines: number;
  };
  engines: Record<EngineTarget, {
    exportingDesigners: number;
    exportedArtifacts: number;
    exportedProjects: number;
  }>;
  activationFunnel: ActivationFunnelStep[];
  shortfalls: NorthStarShortfall[];
}

const DEFAULT_TARGETS: NorthStarTargets = {
  weeklyActiveDesignersShippingToEngines: 30_000,
  minActivationToExportRateBps: 2_500,
  minUnityExportingDesigners: 1,
  minUnrealExportingDesigners: 1,
  minGodotExportingDesigners: 1,
  minTelemetryOptInEventRateBps: 0,
};

const EVENT_NAMES = new Set<AnalyticsEventName>([
  'signup',
  'project-created',
  'artifact-created',
  'artifact-saved',
  'engine-export',
]);
const ENGINE_TARGETS = new Set<EngineTarget>(['unity', 'unreal', 'godot']);
const FUNNEL_STEPS: Array<{ id: AnalyticsEventName; label: string }> = [
  { id: 'signup', label: 'Signup' },
  { id: 'project-created', label: 'First project' },
  { id: 'artifact-created', label: 'First artifact' },
  { id: 'artifact-saved', label: 'First save' },
  { id: 'engine-export', label: 'First engine export' },
];

export function buildNorthStarReport(options: {
  events: readonly ProductAnalyticsEvent[];
  generatedAt?: Date;
  period?: NorthStarReport['period'];
  targets?: Partial<NorthStarTargets>;
}): NorthStarReport {
  const generatedAt = options.generatedAt ?? new Date();
  const period = options.period ?? currentUtcWeekPeriod(generatedAt);
  const targets = normalizeTargets(options.targets ?? {});
  validateEvents(options.events);
  const scopedEvents = options.events
    .filter((event) => event.occurredAt >= period.from && event.occurredAt < period.to)
    .sort((left, right) => left.occurredAt - right.occurredAt || left.id.localeCompare(right.id));
  const deduped = dedupeEventsById(scopedEvents);

  const optedInEvents = deduped.events.filter((event) => event.telemetryOptIn);
  const engineExportEvents = optedInEvents.filter((event) => event.name === 'engine-export' && event.engine);
  const engineShippers = new Set(engineExportEvents.map((event) => event.designerId));
  const exportedProjects = new Set(engineExportEvents.flatMap((event) => event.projectId ? [event.projectId] : []));
  const exportedArtifacts = new Set(engineExportEvents.flatMap((event) => event.artifactId ? [event.artifactId] : []));
  const activationFunnel = buildActivationFunnel(optedInEvents);
  const activationToExportRateBps = rateBps(
    activationFunnel.find((step) => step.id === 'engine-export')?.designers ?? 0,
    activationFunnel.find((step) => step.id === 'signup')?.designers ?? 0,
  );
  const engines = engineSummaries(engineExportEvents);
  const summary = {
    scopedEvents: deduped.events.length,
    optedInEvents: optedInEvents.length,
    ignoredNoConsentEvents: deduped.events.length - optedInEvents.length,
    ignoredDuplicateEvents: deduped.ignoredDuplicates,
    telemetryOptInEventRateBps: rateBps(optedInEvents.length, deduped.events.length),
    weeklyActiveDesignersShippingToEngines: engineShippers.size,
    activationToExportRateBps,
    projectsWithEngineExports: exportedProjects.size,
    artifactsExportedToEngines: exportedArtifacts.size,
  };
  const shortfalls = northStarShortfalls(summary, engines, targets);
  return {
    ready: shortfalls.length === 0,
    generatedAt: generatedAt.toISOString(),
    period,
    disclaimer: 'North Star reporting uses opt-in product analytics only. Raw designer, project, and artifact identifiers are accepted for deduplication but are never returned in reports.',
    targets,
    summary,
    engines,
    activationFunnel,
    shortfalls,
  };
}

export function northStarEventsFromEnv(
  env: Record<string, string | undefined> = process.env,
): ProductAnalyticsEvent[] {
  const raw = env.GREYBOX_NORTH_STAR_EVENTS_JSON;
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (!isRecord(value)) return [];
      const event = eventFromRecord(value);
      return event ? [event] : [];
    });
  } catch {
    return [];
  }
}

export function formatNorthStarMarkdown(report: NorthStarReport): string {
  const lines = [
    '# Greybox North Star',
    '',
    `Generated: ${report.generatedAt}`,
    `Period: ${report.period.label}`,
    `Ready: ${report.ready ? 'yes' : 'no'}`,
    `Disclaimer: ${report.disclaimer}`,
    '',
    '## Summary',
    '',
    `- Weekly active designers shipping to engines: ${report.summary.weeklyActiveDesignersShippingToEngines}/${report.targets.weeklyActiveDesignersShippingToEngines}`,
    `- Activation to engine export: ${basisPointsPercent(report.summary.activationToExportRateBps)}/${basisPointsPercent(report.targets.minActivationToExportRateBps)}`,
    `- Telemetry opt-in event rate: ${basisPointsPercent(report.summary.telemetryOptInEventRateBps)}/${basisPointsPercent(report.targets.minTelemetryOptInEventRateBps)}`,
    `- Ignored duplicate event replays: ${report.summary.ignoredDuplicateEvents}`,
    `- Projects with engine exports: ${report.summary.projectsWithEngineExports}`,
    `- Artifacts exported to engines: ${report.summary.artifactsExportedToEngines}`,
    '',
    '## Engines',
    '',
    `- Unity: ${report.engines.unity.exportingDesigners} designer(s), ${report.engines.unity.exportedArtifacts} artifact(s)`,
    `- Unreal: ${report.engines.unreal.exportingDesigners} designer(s), ${report.engines.unreal.exportedArtifacts} artifact(s)`,
    `- Godot: ${report.engines.godot.exportingDesigners} designer(s), ${report.engines.godot.exportedArtifacts} artifact(s)`,
    '',
    '## Shortfalls',
    ...(
      report.shortfalls.length > 0
        ? report.shortfalls.map((shortfall) => `- [${shortfall.severity}] ${shortfall.code}: ${shortfall.detail}`)
        : ['- none']
    ),
    '',
  ];
  return lines.join('\n');
}

function eventFromRecord(record: Record<string, unknown>): ProductAnalyticsEvent | undefined {
  const id = optionalString(record.id);
  const name = optionalEventName(record.name);
  const designerId = optionalString(record.designerId);
  const occurredAt = optionalInteger(record.occurredAt);
  if (!id || !name || !designerId || occurredAt === undefined) return undefined;
  const telemetryOptIn = record.telemetryOptIn === true;
  const engine = optionalEngineTarget(record.engine);
  const projectId = optionalString(record.projectId);
  const artifactId = optionalString(record.artifactId);
  if (name === 'engine-export' && (!engine || !projectId || !artifactId)) return undefined;
  return {
    id,
    name,
    designerId,
    occurredAt,
    telemetryOptIn,
    ...(engine ? { engine } : {}),
    ...(projectId ? { projectId } : {}),
    ...(artifactId ? { artifactId } : {}),
  };
}

function normalizeTargets(overrides: Partial<NorthStarTargets>): NorthStarTargets {
  const targets = { ...DEFAULT_TARGETS, ...overrides };
  for (const [key, value] of Object.entries(targets)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  for (const key of ['minActivationToExportRateBps', 'minTelemetryOptInEventRateBps'] as const) {
    if (targets[key] > 10_000) throw new Error(`${key} cannot exceed 10000`);
  }
  return targets;
}

function validateEvents(events: readonly ProductAnalyticsEvent[]): void {
  for (const event of events) {
    if (!event.id.trim()) throw new Error('analytics event id is required');
    if (!EVENT_NAMES.has(event.name)) throw new Error(`analytics event name is invalid: ${event.name}`);
    if (!event.designerId.trim()) throw new Error('analytics event designerId is required');
    if (!Number.isInteger(event.occurredAt) || event.occurredAt < 0) {
      throw new Error('analytics event occurredAt must be a non-negative integer');
    }
    if (typeof event.telemetryOptIn !== 'boolean') {
      throw new Error('analytics event telemetryOptIn must be boolean');
    }
    if (event.name === 'engine-export') {
      if (!event.engine || !ENGINE_TARGETS.has(event.engine)) {
        throw new Error('engine-export events require a valid engine');
      }
      if (!event.projectId?.trim()) throw new Error('engine-export events require projectId');
      if (!event.artifactId?.trim()) throw new Error('engine-export events require artifactId');
    }
  }
}

function dedupeEventsById(events: readonly ProductAnalyticsEvent[]): {
  events: ProductAnalyticsEvent[];
  ignoredDuplicates: number;
} {
  const seen = new Set<string>();
  const deduped: ProductAnalyticsEvent[] = [];
  let ignoredDuplicates = 0;
  for (const event of events) {
    if (seen.has(event.id)) {
      ignoredDuplicates++;
      continue;
    }
    seen.add(event.id);
    deduped.push(event);
  }
  return { events: deduped, ignoredDuplicates };
}

function buildActivationFunnel(events: readonly ProductAnalyticsEvent[]): ActivationFunnelStep[] {
  const firstOccurrenceByDesigner = new Map<string, Map<AnalyticsEventName, number>>();
  for (const event of events) {
    let designerSteps = firstOccurrenceByDesigner.get(event.designerId);
    if (!designerSteps) {
      designerSteps = new Map();
      firstOccurrenceByDesigner.set(event.designerId, designerSteps);
    }
    const current = designerSteps.get(event.name);
    if (current === undefined || event.occurredAt < current) designerSteps.set(event.name, event.occurredAt);
  }

  let eligible = new Map<string, number>();
  return FUNNEL_STEPS.map((step, index) => {
    const nextEligible = new Map<string, number>();
    if (index === 0) {
      for (const [designerId, designerSteps] of firstOccurrenceByDesigner) {
        const occurredAt = designerSteps.get(step.id);
        if (occurredAt !== undefined) nextEligible.set(designerId, occurredAt);
      }
    } else {
      for (const [designerId, priorOccurredAt] of eligible) {
        const occurredAt = firstOccurrenceByDesigner.get(designerId)?.get(step.id);
        if (occurredAt !== undefined && occurredAt >= priorOccurredAt) {
          nextEligible.set(designerId, occurredAt);
        }
      }
    }
    const previousDesigners = eligible.size;
    const designers = nextEligible.size;
    const conversionFromPreviousBps = index === 0
      ? 10_000
      : rateBps(designers, previousDesigners);
    eligible = nextEligible;
    return {
      id: step.id,
      label: step.label,
      designers,
      conversionFromPreviousBps,
    };
  });
}

function engineSummaries(
  engineExportEvents: readonly ProductAnalyticsEvent[],
): NorthStarReport['engines'] {
  return {
    unity: engineSummary(engineExportEvents, 'unity'),
    unreal: engineSummary(engineExportEvents, 'unreal'),
    godot: engineSummary(engineExportEvents, 'godot'),
  };
}

function engineSummary(
  events: readonly ProductAnalyticsEvent[],
  engine: EngineTarget,
): NorthStarReport['engines'][EngineTarget] {
  const engineEvents = events.filter((event) => event.engine === engine);
  return {
    exportingDesigners: new Set(engineEvents.map((event) => event.designerId)).size,
    exportedArtifacts: new Set(engineEvents.flatMap((event) => event.artifactId ? [event.artifactId] : [])).size,
    exportedProjects: new Set(engineEvents.flatMap((event) => event.projectId ? [event.projectId] : [])).size,
  };
}

function northStarShortfalls(
  summary: NorthStarReport['summary'],
  engines: NorthStarReport['engines'],
  targets: NorthStarTargets,
): NorthStarShortfall[] {
  const shortfalls: NorthStarShortfall[] = [];
  if (summary.weeklyActiveDesignersShippingToEngines < targets.weeklyActiveDesignersShippingToEngines) {
    shortfalls.push({
      code: 'north_star_shortfall',
      severity: 'error',
      detail: `Need ${targets.weeklyActiveDesignersShippingToEngines - summary.weeklyActiveDesignersShippingToEngines} more weekly active designer(s) shipping to engines.`,
      remediation: 'Remove activation friction and route every export path into the opt-in product analytics event contract.',
    });
  }
  if (summary.activationToExportRateBps < targets.minActivationToExportRateBps) {
    shortfalls.push({
      code: 'activation_export_shortfall',
      severity: 'warning',
      detail: `Activation-to-export conversion is ${basisPointsPercent(summary.activationToExportRateBps)}, below ${basisPointsPercent(targets.minActivationToExportRateBps)}.`,
      remediation: 'Tighten the signup to first project to first export path before increasing paid acquisition.',
    });
  }
  if (engines.unity.exportingDesigners < targets.minUnityExportingDesigners) {
    shortfalls.push(engineShortfall('unity_export_shortfall', 'Unity', engines.unity.exportingDesigners, targets.minUnityExportingDesigners));
  }
  if (engines.unreal.exportingDesigners < targets.minUnrealExportingDesigners) {
    shortfalls.push(engineShortfall('unreal_export_shortfall', 'Unreal', engines.unreal.exportingDesigners, targets.minUnrealExportingDesigners));
  }
  if (engines.godot.exportingDesigners < targets.minGodotExportingDesigners) {
    shortfalls.push(engineShortfall('godot_export_shortfall', 'Godot', engines.godot.exportingDesigners, targets.minGodotExportingDesigners));
  }
  if (summary.telemetryOptInEventRateBps < targets.minTelemetryOptInEventRateBps) {
    shortfalls.push({
      code: 'telemetry_opt_in_shortfall',
      severity: 'warning',
      detail: `Telemetry opt-in event rate is ${basisPointsPercent(summary.telemetryOptInEventRateBps)}, below ${basisPointsPercent(targets.minTelemetryOptInEventRateBps)}.`,
      remediation: 'Improve transparent consent copy and keep product analytics disabled until the user opts in.',
    });
  }
  return shortfalls;
}

function engineShortfall(
  code: Extract<NorthStarShortfall['code'], 'unity_export_shortfall' | 'unreal_export_shortfall' | 'godot_export_shortfall'>,
  engine: string,
  current: number,
  target: number,
): NorthStarShortfall {
  return {
    code,
    severity: 'warning',
    detail: `${engine} has ${current} exporting designer(s), below ${target}.`,
    remediation: `Drive ${engine} sample imports, plugin onboarding, and round-trip success before claiming tri-engine pull.`,
  };
}

function currentUtcWeekPeriod(date: Date): NorthStarReport['period'] {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(midnight).getUTCDay();
  const mondayOffset = (day + 6) % 7;
  const from = midnight - mondayOffset * 86_400_000;
  const to = from + 7 * 86_400_000;
  return {
    from,
    to,
    label: `${new Date(from).toISOString().slice(0, 10)}..${new Date(to - 1).toISOString().slice(0, 10)}`,
  };
}

function rateBps(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.floor((numerator * 10_000) / denominator) : 0;
}

function basisPointsPercent(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function optionalEventName(value: unknown): AnalyticsEventName | undefined {
  return typeof value === 'string' && EVENT_NAMES.has(value as AnalyticsEventName)
    ? value as AnalyticsEventName
    : undefined;
}

function optionalEngineTarget(value: unknown): EngineTarget | undefined {
  return typeof value === 'string' && ENGINE_TARGETS.has(value as EngineTarget)
    ? value as EngineTarget
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
