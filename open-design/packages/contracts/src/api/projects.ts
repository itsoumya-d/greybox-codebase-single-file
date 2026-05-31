import type { ChatMessage } from './chat.js';

export type ProjectKind =
  | 'prototype'
  | 'deck'
  | 'template'
  | 'other'
  | 'image'
  | 'video'
  | 'audio';

export type MediaAspect = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type AudioKind = 'music' | 'speech' | 'sfx';

export type GamePlayerMode =
  | 'single-player'
  | 'co-op'
  | 'pvp'
  | 'pve'
  | 'pvpve'
  | 'mmo'
  | 'asynchronous-multiplayer';

export type GameCamera =
  | 'top-down'
  | 'side-scroller'
  | 'isometric'
  | 'first-person'
  | 'third-person'
  | 'fixed-camera'
  | 'card-board'
  | 'vr';

export type GameEngine =
  | 'unreal'
  | 'unity'
  | 'godot'
  | 'custom'
  | 'webgl'
  | 'html-canvas'
  | 'phaser'
  | 'threejs'
  | 'undecided';

export type GameEditorSurface =
  | 'gameplay-viewport'
  | 'level-viewport'
  | 'world-map'
  | 'narrative-graph'
  | 'logic-graph'
  | 'behavior-tree'
  | 'production-board';

export const PROJECT_STUDIO_PRESENCE_MODES = [
  'viewing',
  'commenting',
  'editing',
  'reviewing',
] as const;

export type ProjectStudioPresenceMode = (typeof PROJECT_STUDIO_PRESENCE_MODES)[number];

export const PROJECT_STUDIO_PRESENCE_SURFACES = [
  'game-files',
  'gameplay-viewport',
  'level-viewport',
  'world-map',
  'narrative-graph',
  'node-graph',
  'behavior-tree',
  'systems',
  'html-preview',
  'game-media',
  'live-artifact',
  'sketch-board',
  'production-board',
] as const;

export type ProjectStudioPresenceSurface = (typeof PROJECT_STUDIO_PRESENCE_SURFACES)[number];

export const PROJECT_STUDIO_PRESENCE_SELECTION_KINDS = [
  'cursor',
  'range',
  'node',
  'region',
] as const;

export type ProjectStudioPresenceSelectionKind =
  (typeof PROJECT_STUDIO_PRESENCE_SELECTION_KINDS)[number];

export interface ProjectStudioPresenceCursor {
  line?: number;
  column?: number;
  selectionKind?: ProjectStudioPresenceSelectionKind;
  selectionLabel?: string;
}

export interface ProjectStudioPresenceRequest {
  clientId: string;
  actorName?: string;
  surface?: ProjectStudioPresenceSurface;
  filePath?: string;
  artifactId?: string;
  mode: ProjectStudioPresenceMode;
  cursor?: ProjectStudioPresenceCursor;
}

export interface ProjectStudioPresenceSsePayload extends ProjectStudioPresenceRequest {
  type: 'studio_presence';
  projectId: string;
  updatedAt: number;
}

export interface ProjectStudioPresenceResponse {
  presence: ProjectStudioPresenceSsePayload;
}

export type ProjectStudioDocumentOperationType =
  | 'json-set'
  | 'json-delete'
  | 'json-array-append'
  | 'text-splice';

export interface ProjectStudioDocumentOperation {
  id: string;
  actorId: string;
  type: ProjectStudioDocumentOperationType;
  path: Array<string | number>;
  value?: unknown;
  lamport?: number;
  createdAt?: number;
}

export interface ProjectStudioDocumentOperationRequest {
  fileName: string;
  baseRevision?: number;
  operations: ProjectStudioDocumentOperation[];
}

export interface ProjectStudioDocumentOperationResult {
  id: string;
  actorId: string;
  type: ProjectStudioDocumentOperationType;
  path: string;
  status: 'applied' | 'duplicate' | 'conflict';
  reason?: string;
}

export interface ProjectStudioDocumentOperationResponse {
  projectId: string;
  fileName: string;
  revision: number;
  content: string;
  appliedOperations: ProjectStudioDocumentOperationResult[];
  skippedOperations: ProjectStudioDocumentOperationResult[];
}

export interface ProjectStudioDocumentOperationSsePayload {
  type: 'studio_document_operations';
  action: 'applied';
  projectId: string;
  fileName: string;
  revision: number;
  appliedCount: number;
  skippedCount: number;
}

export interface ProjectStudioDocumentDraftOperationResponse {
  projectId: string;
  fileName: string;
  revision: number;
  content: string;
  appliedOperations: ProjectStudioDocumentOperationResult[];
  skippedOperations: ProjectStudioDocumentOperationResult[];
}

export interface ProjectStudioDocumentDraftOperationSsePayload {
  type: 'studio_document_draft_operations';
  action: 'applied';
  projectId: string;
  fileName: string;
  revision: number;
  content: string;
  appliedCount: number;
  skippedCount: number;
  actorIds: string[];
}

export type GameTelemetryEventType =
  | 'session_start'
  | 'session_end'
  | 'level_start'
  | 'level_complete'
  | 'death'
  | 'failure'
  | 'checkpoint'
  | 'quest_step'
  | 'combat_event'
  | 'economy_event'
  | 'progression_event'
  | 'retention_event'
  | 'frustration_signal'
  | 'accessibility_event'
  | 'custom'
  | string;

export interface GameTelemetryPosition {
  x: number;
  y: number;
  z?: number;
}

export interface GameTelemetryEventInput {
  eventId?: string;
  type: GameTelemetryEventType;
  timestamp?: number;
  sessionId?: string;
  playerId?: string;
  sceneId?: string;
  encounterId?: string;
  buildId?: string;
  platform?: string;
  position?: GameTelemetryPosition;
  value?: number;
  tags?: string[];
  payload?: Record<string, unknown>;
}

export interface GameTelemetryEventRecord extends GameTelemetryEventInput {
  id: string;
  projectId: string;
  receivedAt: number;
  timestamp: number;
}

export interface GameTelemetryIngestRequest {
  events: GameTelemetryEventInput[];
}

export interface GameTelemetrySummary {
  total: number;
  byType: Record<string, number>;
  byScene: Record<string, number>;
  sessionCount: number;
  latestTimestamp?: number;
}

export type GameTelemetryInsightSeverity = 'low' | 'medium' | 'high';

export type GameTelemetryInsightCategory =
  | 'frustration'
  | 'progression'
  | 'retention'
  | 'accessibility'
  | 'combat-balance'
  | 'economy'
  | 'heatmap'
  | string;

export interface GameTelemetryInsight {
  id: string;
  severity: GameTelemetryInsightSeverity;
  category: GameTelemetryInsightCategory;
  title: string;
  evidence: string;
  recommendation: string;
}

export interface GameTelemetryHeatmapCell {
  sceneId?: string;
  x: number;
  y: number;
  z?: number;
  count: number;
}

export interface GameTelemetryResponse {
  events: GameTelemetryEventRecord[];
  summary: GameTelemetrySummary;
}

export interface GameTelemetryIngestResponse extends GameTelemetryResponse {
  stored: number;
}

export interface GameTelemetryInsightsResponse {
  summary: GameTelemetrySummary;
  insights: GameTelemetryInsight[];
  heatmap: GameTelemetryHeatmapCell[];
  generatedAt: number;
}

export interface GameTelemetrySsePayload {
  type: 'game_telemetry';
  action: 'ingested';
  projectId: string;
  count: number;
  summary: GameTelemetrySummary;
  latestEvent?: GameTelemetryEventRecord;
}

export type GamePlaytestSimulationFocus =
  | 'onboarding'
  | 'combat'
  | 'navigation'
  | 'accessibility'
  | 'retention'
  | 'pacing'
  | 'readability'
  | string;

export type GamePlaytestSimulationRisk = 'low' | 'medium' | 'high';

export type GamePlaytestSimulationFindingCategory =
  | 'onboarding'
  | 'combat'
  | 'navigation'
  | 'readability'
  | 'pacing'
  | 'accessibility'
  | 'retention'
  | 'production'
  | string;

export interface GamePlaytestSimulationRequest {
  fileName?: string;
  runs?: number;
  focus?: GamePlaytestSimulationFocus;
  persona?: GamePlaytestPersonaId;
  personas?: GamePlaytestPersonaId[];
}

export type GamePlaytestSimulationMode = 'viewport-artifact' | 'playable-artifact' | 'headless-browser';

export type GamePlaytestPersonaId =
  | 'speedrunner'
  | 'completionist'
  | 'casual'
  | 'explorer'
  | 'rage-quitter'
  | string;

export interface GamePlaytestSimulationMetric {
  id: string;
  label: string;
  value: number | string;
  target?: number | string;
  risk?: GamePlaytestSimulationRisk;
}

export interface GamePlaytestSimulationFinding {
  id: string;
  severity: GamePlaytestSimulationRisk;
  category: GamePlaytestSimulationFindingCategory;
  message: string;
  evidence: string;
  recommendation: string;
}

export interface GamePlaytestBotAction {
  id: string;
  label: string;
  target: string;
  status: 'passed' | 'warning' | 'blocked';
  evidence: string;
}

export interface GamePlaytestPersonaReport {
  id: string;
  label: string;
  motivation: string;
  completionTimeSec: number;
  deaths: number;
  frustrationMoments: string[];
  unusedContent: string[];
  balanceIssues: string[];
  acceptedSignals: string[];
  risk: GamePlaytestSimulationRisk;
}

export interface GamePlaytestSimulationResponse {
  fileName: string;
  mode?: GamePlaytestSimulationMode;
  runs: number;
  focus?: GamePlaytestSimulationFocus;
  summary: string;
  metrics: GamePlaytestSimulationMetric[];
  findings: GamePlaytestSimulationFinding[];
  botActions?: GamePlaytestBotAction[];
  personaReports?: GamePlaytestPersonaReport[];
}

export interface GamePlaytestPreset {
  id: string;
  name: string;
  mode: GamePlaytestSimulationMode;
  fileName?: string;
  focus?: GamePlaytestSimulationFocus;
  runs: number;
  personas: GamePlaytestPersonaId[];
  updatedAt: number;
}

export interface GamePlaytestPresetsResponse {
  projectId: string;
  presets: GamePlaytestPreset[];
}

export interface GamePlaytestPresetsUpdateRequest {
  presets: GamePlaytestPreset[];
}

export interface GamePlaytestPresetsSsePayload {
  type: 'game_playtest_presets';
  action: 'updated';
  projectId: string;
  presetCount: number;
  updatedAt: number;
}

export type GameEngineRuntimeRequestEngine = 'webgl' | 'unity' | 'godot' | 'unreal' | 'native-package';
export type GameEngineRuntimeEngine = 'webgl-canvas' | 'unity' | 'godot' | 'unreal' | 'native-package';

export interface GameEngineRuntimeRequest {
  fileName?: string;
  engine?: GameEngineRuntimeRequestEngine;
  writeFileName?: string;
  writePackage?: boolean;
  packageDirectory?: string;
}

export interface GameEngineRuntimeGeneratedFile {
  path: string;
  language: 'csharp' | 'gdscript' | 'cpp' | 'markdown' | 'json';
  purpose: string;
  content: string;
}

export interface GameEngineRuntimeResponse {
  fileName: string;
  engine: GameEngineRuntimeEngine;
  html?: string;
  files?: GameEngineRuntimeGeneratedFile[];
  runtimeHooks: string[];
  terrainColliderCount: number;
  terrainSculptPatchCount: number;
  dynamicEventCount: number;
  factionCount: number;
  writtenFileName?: string;
  writtenFileNames?: string[];
  generatedAt: number;
}

export interface GameEnginePackageManifestFile {
  path: string;
  language: GameEngineRuntimeGeneratedFile['language'];
  purpose: string;
  sha256: string;
  bytes: number;
}

export interface GameEnginePackageManifest {
  generator: string;
  projectId: string;
  projectName: string;
  sourceFileName: string;
  engine: Exclude<GameEngineRuntimeEngine, 'webgl-canvas'>;
  contentRevisionSha256: string;
  runtimeHooks: string[];
  terrainColliderCount: number;
  terrainSculptPatchCount: number;
  dynamicEventCount: number;
  factionCount: number;
  files: GameEnginePackageManifestFile[];
  generatedAt: string;
}

export interface GameEnginePackagePreflightResponse {
  projectId: string;
  projectName: string;
  engine: Exclude<GameEngineRuntimeEngine, 'webgl-canvas'>;
  sourceFileName: string;
  packageFileName: string;
  fileCount: number;
  sizeBytes: number;
  contentRevisionSha256: string;
  manifest: GameEnginePackageManifest;
  generatedAt: number;
}

export interface GameEngineRuntimeSsePayload {
  type: 'game_engine_runtime';
  action: 'generated';
  projectId: string;
  fileName: string;
  engine: GameEngineRuntimeEngine;
  writtenFileName?: string;
  writtenFileNames?: string[];
  terrainColliderCount: number;
  dynamicEventCount: number;
}

export interface GameEnginePackageSsePayload {
  type: 'game_engine_package';
  action: 'downloaded';
  projectId: string;
  sourceFileName: string;
  packageFileName: string;
  engine: Exclude<GameEngineRuntimeEngine, 'webgl-canvas'>;
  fileCount: number;
  terrainColliderCount: number;
  dynamicEventCount: number;
  factionCount: number;
  generatedAt: number;
}

export interface GamePlaytestSimulationSsePayload {
  type: 'game_playtest_simulation';
  action: 'simulated';
  projectId: string;
  fileName: string;
  mode?: GamePlaytestSimulationMode;
  runs: number;
  summary: string;
  findingCount: number;
  highestRisk: GamePlaytestSimulationRisk;
  personaCount?: number;
}

export type GameWorldSimulationRisk = 'low' | 'medium' | 'high';

export type GameWorldSimulationEventType =
  | 'faction-pressure'
  | 'weather-shift'
  | 'resource-shift'
  | 'dynamic-event'
  | 'hazard-escalation'
  | 'ecosystem-response'
  | string;

export interface GameWorldSimulationRequest {
  fileName?: string;
  ticks?: number;
  scenario?: string;
}

export interface GameWorldSimulationEvent {
  id: string;
  tick: number;
  type: GameWorldSimulationEventType;
  title: string;
  impact: string;
  risk: GameWorldSimulationRisk;
}

export interface GameWorldSimulationMetric {
  id: string;
  label: string;
  value: number | string;
  target?: number | string;
  risk?: GameWorldSimulationRisk;
}

export interface GameWorldSimulationFinding {
  id: string;
  severity: GameWorldSimulationRisk;
  title: string;
  evidence: string;
  recommendation: string;
}

export interface GameWorldSimulationState {
  tick: number;
  activeWeather?: string;
  factionControl: Record<string, number>;
  resourcePressure: number;
  hazardPressure: number;
  ecosystemPressure: number;
  dynamicEventPressure: number;
  persistenceKeys: string[];
}

export interface GameWorldSimulationResponse {
  fileName: string;
  ticks: number;
  scenario?: string;
  summary: string;
  metrics: GameWorldSimulationMetric[];
  events: GameWorldSimulationEvent[];
  findings: GameWorldSimulationFinding[];
  state: GameWorldSimulationState;
}

export interface GameWorldSimulationSsePayload {
  type: 'game_world_simulation';
  action: 'simulated';
  projectId: string;
  fileName: string;
  ticks: number;
  summary: string;
  eventCount: number;
  findingCount: number;
  highestRisk: GameWorldSimulationRisk;
}

export interface GameWorldSimulationLoopConfig extends GameWorldSimulationRequest {
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt?: number;
  lastRunAt?: number;
  lastSummary?: string;
  lastEventCount?: number;
  lastFindingCount?: number;
  lastState?: GameWorldSimulationState;
}

export interface GameWorldSimulationLoopResponse {
  projectId: string;
  config: GameWorldSimulationLoopConfig;
}

export interface GameWorldSimulationLoopRunResponse {
  projectId: string;
  config: GameWorldSimulationLoopConfig;
  simulation: GameWorldSimulationResponse;
}

export interface GameWorldSimulationLoopSsePayload {
  type: 'game_world_simulation_loop';
  action: 'configured' | 'run';
  projectId: string;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt?: number;
  lastRunAt?: number;
  eventCount?: number;
  findingCount?: number;
  summary?: string;
}

export type GameAutonomousIterationPriority = 'p0' | 'p1' | 'p2';

export type GameAutonomousIterationSource =
  | 'telemetry'
  | 'playtest-simulation'
  | 'world-simulation'
  | 'studio-synthesis'
  | string;

export interface GameAutonomousIterationRequest {
  fileName?: string;
  focus?: string;
  maxActions?: number;
  includeTelemetry?: boolean;
  includePlaytest?: boolean;
  includeWorldSimulation?: boolean;
  persona?: GamePlaytestPersonaId;
  personas?: GamePlaytestPersonaId[];
}

export interface GameAutonomousIterationLoopConfig extends GameAutonomousIterationRequest {
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt?: number;
  lastRunAt?: number;
  lastSummary?: string;
  lastActionCount?: number;
}

export interface GameAutonomousIterationAction {
  id: string;
  priority: GameAutonomousIterationPriority;
  owner:
    | 'game-director'
    | 'gameplay-mechanics'
    | 'level-design'
    | 'narrative-design'
    | 'economy-progression'
    | 'multiplayer-systems'
    | 'game-ui-hud'
    | 'art-direction'
    | 'audio-direction'
    | 'live-ops'
    | 'technical-game-systems'
    | 'accessibility-design'
    | 'production-planning'
    | string;
  source: GameAutonomousIterationSource;
  title: string;
  evidence: string;
  rationale: string;
  recommendation: string;
}

export interface GameAutonomousIterationResponse {
  fileName?: string;
  focus?: string;
  summary: string;
  actions: GameAutonomousIterationAction[];
  sources: {
    telemetryInsights: number;
    playtestFindings: number;
    personaReports?: number;
    worldFindings: number;
  };
  generatedAt: number;
}

export interface GameAutonomousIterationLoopResponse {
  projectId: string;
  config: GameAutonomousIterationLoopConfig;
}

export interface GameAutonomousIterationLoopRunResponse {
  projectId: string;
  config: GameAutonomousIterationLoopConfig;
  iteration: GameAutonomousIterationResponse;
}

export interface GameAutonomousIterationSsePayload {
  type: 'game_autonomous_iteration';
  action: 'synthesized';
  projectId: string;
  fileName?: string;
  actionCount: number;
  topPriority?: GameAutonomousIterationPriority;
  summary: string;
}

export interface GameAutonomousIterationLoopSsePayload {
  type: 'game_autonomous_iteration_loop';
  action: 'configured' | 'run';
  projectId: string;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt?: number;
  lastRunAt?: number;
  actionCount?: number;
  summary?: string;
}

export type GameBalanceLoopPriority = 'p0' | 'p1' | 'p2';

export type GameBalanceLoopSource =
  | 'telemetry'
  | 'playtest-simulation'
  | 'game-system'
  | 'studio-synthesis'
  | string;

export interface GameBalanceLoopRequest {
  fileName?: string;
  systemFileName?: string;
  focus?: string;
  maxAdjustments?: number;
  includeTelemetry?: boolean;
  includePlaytest?: boolean;
  apply?: boolean;
  persona?: GamePlaytestPersonaId;
  personas?: GamePlaytestPersonaId[];
}

export interface GameBalanceLoopConfig extends GameBalanceLoopRequest {
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt?: number;
  lastRunAt?: number;
  lastSummary?: string;
  lastAdjustmentCount?: number;
  lastAppliedCount?: number;
}

export interface GameBalanceLoopAdjustment {
  id: string;
  priority: GameBalanceLoopPriority;
  owner:
    | 'gameplay-mechanics'
    | 'level-design'
    | 'economy-progression'
    | 'live-ops'
    | 'game-ui-hud'
    | 'accessibility-design'
    | 'production-planning'
    | string;
  source: GameBalanceLoopSource;
  category: string;
  title: string;
  evidence: string;
  rationale: string;
  recommendation: string;
  targetFileName?: string;
  targetPath?: Array<string | number>;
  currentValue?: string | number | boolean;
  suggestedValue?: string | number | boolean;
  applyStatus?: 'suggested' | 'applied' | 'not-applicable';
}

export interface GameBalanceLoopResponse {
  fileName?: string;
  systemFileName?: string;
  focus?: string;
  summary: string;
  adjustments: GameBalanceLoopAdjustment[];
  appliedCount: number;
  sources: {
    telemetryInsights: number;
    playtestFindings: number;
    personaReports?: number;
    systemTuningKeys: number;
  };
  generatedAt: number;
}

export interface GameBalanceLoopResponseEnvelope {
  projectId: string;
  balance: GameBalanceLoopResponse;
}

export type GameBalanceLoopAdjustmentDecision = 'accepted' | 'rejected';

export interface GameBalanceLoopAdjustmentDecisionRequest {
  decision: GameBalanceLoopAdjustmentDecision;
  adjustment: GameBalanceLoopAdjustment;
  note?: string;
}

export interface GameBalanceLoopAdjustmentDecisionResponse {
  projectId: string;
  decision: GameBalanceLoopAdjustmentDecision;
  adjustment: GameBalanceLoopAdjustment;
  appliedCount: number;
  systemFileName?: string;
  updatedAt: number;
}

export interface GameBalanceLoopConfigResponse {
  projectId: string;
  config: GameBalanceLoopConfig;
}

export interface GameBalanceLoopRunResponse {
  projectId: string;
  config: GameBalanceLoopConfig;
  balance: GameBalanceLoopResponse;
}

export interface GameBalanceLoopSsePayload {
  type: 'game_balance_loop';
  action: 'balanced';
  projectId: string;
  fileName?: string;
  systemFileName?: string;
  adjustmentCount: number;
  appliedCount: number;
  summary: string;
}

export interface GameBalanceLoopConfigSsePayload {
  type: 'game_balance_loop_config';
  action: 'configured' | 'run';
  projectId: string;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt?: number;
  lastRunAt?: number;
  adjustmentCount?: number;
  appliedCount?: number;
  summary?: string;
}

export interface GameBalanceLoopAdjustmentDecisionSsePayload {
  type: 'game_balance_loop_adjustment_decision';
  action: GameBalanceLoopAdjustmentDecision;
  projectId: string;
  adjustmentId: string;
  systemFileName?: string;
  appliedCount: number;
}

export type GameStudioOrchestrationPriority = 'p0' | 'p1' | 'p2';

export interface GameStudioOrchestrationRequest {
  focus?: string;
  maxWorkOrders?: number;
  includeDebates?: boolean;
  targetFiles?: string[];
}

export interface GameStudioOrchestrationExecutionRequest extends GameStudioOrchestrationRequest {
  agentId?: string;
  workOrderIds?: string[];
  maxExecutions?: number;
  waitForCompletion?: boolean;
  model?: string;
  reasoning?: string;
}

export interface GameStudioOrchestrationLoopConfig extends GameStudioOrchestrationRequest {
  enabled: boolean;
  intervalMinutes: number;
  autoExecute?: boolean;
  agentId?: string;
  maxExecutions?: number;
  waitForCompletion?: boolean;
  model?: string;
  reasoning?: string;
  nextRunAt?: number;
  lastRunAt?: number;
  lastSummary?: string;
  lastWorkOrderCount?: number;
  lastHandoffCount?: number;
  lastExecutionCount?: number;
  lastRunIds?: string[];
  lastExecutedWorkOrderIds?: string[];
  lastReconciliationSummary?: string;
}

export interface GameStudioOrchestrationFileSignal {
  name: string;
  kind: string;
}

export interface GameStudioAgentWorkOrder {
  id: string;
  agentId: string;
  roleTitle: string;
  priority: GameStudioOrchestrationPriority;
  title: string;
  objective: string;
  inputs: string[];
  expectedOutputs: string[];
  handoffIds: string[];
  dependsOn: string[];
  status: 'queued' | 'blocked' | 'ready';
}

export interface GameStudioOrchestrationHandoffPlan {
  id: string;
  from: string;
  to: string;
  coordinates: string[];
  resolves: string;
  requiredForAgents: string[];
}

export interface GameStudioOrchestrationDebatePlan {
  id: string;
  chair: string;
  challengers: string[];
  question: string;
  decisionRule: string;
  evidence: string[];
}

export interface GameStudioOrchestrationResponse {
  focus?: string;
  summary: string;
  workOrders: GameStudioAgentWorkOrder[];
  handoffs: GameStudioOrchestrationHandoffPlan[];
  debates: GameStudioOrchestrationDebatePlan[];
  fileSignals: GameStudioOrchestrationFileSignal[];
  generatedAt: number;
}

export interface GameStudioOrchestrationResponseEnvelope {
  projectId: string;
  orchestration: GameStudioOrchestrationResponse;
}

export interface GameStudioOrchestrationLoopResponse {
  projectId: string;
  config: GameStudioOrchestrationLoopConfig;
}

export interface GameStudioOrchestrationLoopRunResponse {
  projectId: string;
  config: GameStudioOrchestrationLoopConfig;
  orchestration: GameStudioOrchestrationResponse;
  executions?: GameStudioAgentExecution[];
  reconciliation?: GameStudioOrchestrationReconciliation;
}

export interface GameStudioAgentExecution {
  workOrderId: string;
  studioAgentId: string;
  roleTitle: string;
  priority: GameStudioOrchestrationPriority;
  title: string;
  adapterAgentId: string;
  runId: string;
  status: string;
}

export interface GameStudioOrchestrationReconciliation {
  executionCount: number;
  runIds: string[];
  executedWorkOrderIds: string[];
  resolvedDependencyCount: number;
  readyForFollowUpWorkOrderIds: string[];
  blockedWorkOrderIds: string[];
  summary: string;
}

export interface GameStudioOrchestrationExecutionResponse {
  projectId: string;
  orchestration: GameStudioOrchestrationResponse;
  executions: GameStudioAgentExecution[];
  reconciliation?: GameStudioOrchestrationReconciliation;
}

export interface GameStudioOrchestrationSsePayload {
  type: 'game_studio_orchestration';
  action: 'planned';
  projectId: string;
  workOrderCount: number;
  handoffCount: number;
  debateCount: number;
  summary: string;
}

export interface GameStudioOrchestrationExecutionSsePayload {
  type: 'game_studio_orchestration_execution';
  action: 'started';
  projectId: string;
  adapterAgentId: string;
  executionCount: number;
  runIds: string[];
  summary: string;
  reconciliationSummary?: string;
}

export interface GameStudioOrchestrationLoopSsePayload {
  type: 'game_studio_orchestration_loop';
  action: 'configured' | 'run';
  projectId: string;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt?: number;
  lastRunAt?: number;
  workOrderCount?: number;
  handoffCount?: number;
  executionCount?: number;
  runIds?: string[];
  summary?: string;
  reconciliationSummary?: string;
}

export interface GameDesignEntity {
  id?: string;
  name: string;
  role?: string;
  notes?: string;
}

export interface GameDesignMetadata {
  genre?: string;
  subgenres?: string[];
  platforms?: string[];
  playerMode?: GamePlayerMode | string;
  camera?: GameCamera | string;
  inputModel?: string[];
  engine?: GameEngine | string;
  artStyle?: string;
  sessionLength?: string;
  audienceAge?: string;
  emotionalGoal?: string;
  monetization?: string;
  editorSurfaces?: GameEditorSurface[];
  dimensionality?: string;
  designEmphasis?: string;
  enginePreference?: string;
  deliveryTarget?: string;
  inspirations?: string[];
  pillars?: string[];
  engineConstraints?: string[];
  targetDevices?: string[];
  deliverableTypes?: string[];
  gameplayLoops?: GameDesignEntity[];
  gameWorlds?: GameDesignEntity[];
  factions?: GameDesignEntity[];
  enemyTypes?: GameDesignEntity[];
  itemRarities?: GameDesignEntity[];
  skillTrees?: GameDesignEntity[];
  progressionCurves?: GameDesignEntity[];
  questArcs?: GameDesignEntity[];
  biomes?: GameDesignEntity[];
  combatStyles?: GameDesignEntity[];
  characterClasses?: GameDesignEntity[];
  craftingRecipes?: GameDesignEntity[];
  lootTables?: GameDesignEntity[];
  weaponSystems?: GameDesignEntity[];
  missionFlows?: GameDesignEntity[];
  dungeonLayouts?: GameDesignEntity[];
  dialogueBranches?: GameDesignEntity[];
  bossPhases?: GameDesignEntity[];
  economySystems?: GameDesignEntity[];
  multiplayerModes?: GameDesignEntity[];
  liveOpsPlans?: GameDesignEntity[];
  encounterSpecs?: GameDesignEntity[];
  proceduralRules?: GameDesignEntity[];
  dynamicEvents?: GameDesignEntity[];
  behaviorTrees?: GameDesignEntity[];
  animationSystems?: GameDesignEntity[];
  vfxSystems?: GameDesignEntity[];
  lightingSystems?: GameDesignEntity[];
  audioSystems?: GameDesignEntity[];
  assetPipelines?: GameDesignEntity[];
  characterSystems?: GameDesignEntity[];
  questSystems?: GameDesignEntity[];
  openWorldRegions?: GameDesignEntity[];
  survivalSystems?: GameDesignEntity[];
  stealthSystems?: GameDesignEntity[];
  vehicleSystems?: GameDesignEntity[];
  telemetryModels?: GameDesignEntity[];
  feasibilityEstimates?: GameDesignEntity[];
  genreBenchmarks?: GameDesignEntity[];
  scalingVariants?: GameDesignEntity[];
  playtestSimulations?: GameDesignEntity[];
  nodeLogicGraphs?: GameDesignEntity[];
  viewportDocuments?: GameDesignEntity[];
  accessibilityProfiles?: GameDesignEntity[];
  engineConstraintProfiles?: GameDesignEntity[];
  bossDesigns?: GameDesignEntity[];
  economyBalanceSheets?: GameDesignEntity[];
  narrativeTrees?: GameDesignEntity[];
  factionMaps?: GameDesignEntity[];
  levelDesignDocs?: GameDesignEntity[];
  cameraSystems?: GameDesignEntity[];
  communitySystems?: GameDesignEntity[];
  moddingPipelines?: GameDesignEntity[];
  difficultyDirectors?: GameDesignEntity[];
  companionSystems?: GameDesignEntity[];
  accessibilityRequirements?: string[];
  technicalConstraints?: string[];
}

export const GAME_ENTITY_TYPES = [
  'game_world',
  'faction',
  'enemy_type',
  'item_rarity',
  'skill_tree',
  'progression_curve',
  'quest_arc',
  'gameplay_loop',
  'biome',
  'combat_style',
  'character_class',
  'crafting_recipe',
  'loot_table',
  'weapon_system',
  'mission_flow',
  'dungeon_layout',
  'dialogue_branch',
  'boss_phase',
  'economy_system',
  'multiplayer_mode',
  'live_ops_plan',
  'encounter_spec',
  'procedural_rule',
  'behavior_tree',
  'dynamic_event',
  'camera_system',
  'animation_system',
  'vfx_system',
  'lighting_system',
  'audio_system',
  'asset_pipeline',
  'character_system',
  'quest_system',
  'open_world_region',
  'survival_system',
  'stealth_system',
  'vehicle_system',
  'telemetry_model',
  'feasibility_estimate',
  'genre_benchmark',
  'scaling_variant',
  'playtest_simulation',
  'node_logic_graph',
  'viewport_document',
  'accessibility_profile',
  'engine_constraint_profile',
  'boss_design',
  'economy_balance_sheet',
  'narrative_tree',
  'faction_map',
  'level_design_doc',
  'community_system',
  'modding_pipeline',
  'difficulty_director',
  'companion_system',
] as const;

export type GameEntityType = (typeof GAME_ENTITY_TYPES)[number];

export type GameDesignMetadataEntityCollectionKey = {
  [K in keyof GameDesignMetadata]-?: NonNullable<GameDesignMetadata[K]> extends GameDesignEntity[]
    ? K
    : never;
}[keyof GameDesignMetadata];

export const GAME_DESIGN_METADATA_ENTITY_TYPE_MAP = {
  gameplayLoops: 'gameplay_loop',
  gameWorlds: 'game_world',
  factions: 'faction',
  enemyTypes: 'enemy_type',
  itemRarities: 'item_rarity',
  skillTrees: 'skill_tree',
  progressionCurves: 'progression_curve',
  questArcs: 'quest_arc',
  biomes: 'biome',
  combatStyles: 'combat_style',
  characterClasses: 'character_class',
  craftingRecipes: 'crafting_recipe',
  lootTables: 'loot_table',
  weaponSystems: 'weapon_system',
  missionFlows: 'mission_flow',
  dungeonLayouts: 'dungeon_layout',
  dialogueBranches: 'dialogue_branch',
  bossPhases: 'boss_phase',
  economySystems: 'economy_system',
  multiplayerModes: 'multiplayer_mode',
  liveOpsPlans: 'live_ops_plan',
  encounterSpecs: 'encounter_spec',
  proceduralRules: 'procedural_rule',
  dynamicEvents: 'dynamic_event',
  behaviorTrees: 'behavior_tree',
  animationSystems: 'animation_system',
  vfxSystems: 'vfx_system',
  lightingSystems: 'lighting_system',
  audioSystems: 'audio_system',
  assetPipelines: 'asset_pipeline',
  characterSystems: 'character_system',
  questSystems: 'quest_system',
  openWorldRegions: 'open_world_region',
  survivalSystems: 'survival_system',
  stealthSystems: 'stealth_system',
  vehicleSystems: 'vehicle_system',
  telemetryModels: 'telemetry_model',
  feasibilityEstimates: 'feasibility_estimate',
  genreBenchmarks: 'genre_benchmark',
  scalingVariants: 'scaling_variant',
  playtestSimulations: 'playtest_simulation',
  nodeLogicGraphs: 'node_logic_graph',
  viewportDocuments: 'viewport_document',
  accessibilityProfiles: 'accessibility_profile',
  engineConstraintProfiles: 'engine_constraint_profile',
  bossDesigns: 'boss_design',
  economyBalanceSheets: 'economy_balance_sheet',
  narrativeTrees: 'narrative_tree',
  factionMaps: 'faction_map',
  levelDesignDocs: 'level_design_doc',
  cameraSystems: 'camera_system',
  communitySystems: 'community_system',
  moddingPipelines: 'modding_pipeline',
  difficultyDirectors: 'difficulty_director',
  companionSystems: 'companion_system',
} as const satisfies Record<GameDesignMetadataEntityCollectionKey, GameEntityType>;

export interface GameMemoryPayload {
  [key: string]: unknown;
}

export interface GameEntityRecord {
  id: string;
  projectId: string;
  type: GameEntityType;
  name: string;
  summary: string;
  payload: GameMemoryPayload;
  createdAt: number;
  updatedAt: number;
}

export interface GameEntityLinkRecord {
  id: string;
  projectId: string;
  fromEntityId: string;
  toEntityId: string;
  relationship: string;
  payload: GameMemoryPayload;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertGameEntityRequest {
  id?: string;
  type: GameEntityType;
  name: string;
  summary?: string;
  payload?: GameMemoryPayload;
}

export interface UpsertGameEntityLinkRequest {
  id?: string;
  fromEntityId: string;
  toEntityId: string;
  relationship: string;
  payload?: GameMemoryPayload;
}

export interface GameMemoryResponse {
  entities: GameEntityRecord[];
  links: GameEntityLinkRecord[];
}

export interface GameEntityResponse {
  entity: GameEntityRecord;
}

export interface GameMemoryMergeRequest {
  entities?: UpsertGameEntityRequest[];
  links?: UpsertGameEntityLinkRequest[];
}

export interface GameMemoryMergeResponse extends GameMemoryResponse {
  upsertedEntityIds: string[];
  upsertedLinkIds: string[];
}

export type ProjectDisplayStatus =
  | 'not_started'
  | 'queued'
  | 'running'
  | 'awaiting_input'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface ProjectStatusInfo {
  value: ProjectDisplayStatus;
  updatedAt?: number;
  runId?: string;
}

export interface PromptTemplateMetadataSource {
  repo: string;
  license: string;
  author?: string;
  url?: string;
}

// Subset of a curated PromptTemplate kept on the project so the agent can
// reference it on every turn without re-reading the gallery file. The
// `prompt` field is the (possibly creator-edited) body — when the creator tunes
// it in the New Project panel before clicking Create, those edits land
// here and become authoritative for the system prompt.
export interface PromptTemplateMetadata {
  id: string;
  surface: 'image' | 'video';
  title: string;
  prompt: string;
  summary?: string;
  category?: string;
  tags?: string[];
  model?: string;
  aspect?: MediaAspect;
  source?: PromptTemplateMetadataSource;
}

export interface ProjectMetadata {
  kind: ProjectKind;
  // Canonical game-studio term for `kind`. Kept alongside the legacy field so
  // newer clients can speak game deliverables while older clients continue to
  // load the same rows without migration.
  deliverableKind?: ProjectKind;
  intent?: 'live-artifact';
  fidelity?: 'wireframe' | 'high-fidelity';
  speakerNotes?: boolean;
  animations?: boolean;
  templateId?: string;
  templateLabel?: string;
  inspirationGameArtBibleIds?: string[];
  importedFrom?: 'game-studio-zip' | 'folder' | string;
  entryFile?: string;
  sourceFileName?: string;
  // Folder-import (#597): when set, the project's files live under this
  // absolute path instead of .agds/projects/<id>/. The daemon reads and writes
  // directly inside the creator's folder. Stored as the realpath() result so
  // symlinks can't redirect writes after import time.
  baseDir?: string;
  // PR #974: marker stamped by the daemon's HMAC-gated import handler
  // when a folder import passed the desktop-main-process trust gate.
  // Only set on folder-imported projects (`baseDir` set) and only when
  // the import request carried a valid `X-AGDS-Desktop-Import-Token`
  // signed with the secret the desktop main process registered with the
  // daemon at startup. The desktop `shell.openPath` IPC refuses to
  // forward folder-imported projects whose metadata lacks this marker,
  // so a renderer cannot launder an attacker-chosen baseDir into a
  // file-manager reveal even if a future codepath inadvertently lets
  // it set `baseDir` outside the trusted flow. Privileged: rejected
  // by `POST /api/projects` and `PATCH /api/projects/:id`.
  fromTrustedPicker?: true;
  imageModel?: string;
  imageAspect?: MediaAspect;
  imageStyle?: string;
  videoModel?: string;
  videoLength?: number;
  videoAspect?: MediaAspect;
  audioKind?: AudioKind;
  audioModel?: string;
  audioDuration?: number;
  voice?: string;
  // Curated prompt template the creator picked in the image/video tab of the
  // New Project panel. Treated by the system-prompt composer as a stylistic
  // and structural reference for the generation request.
  promptTemplate?: PromptTemplateMetadata;
  // Game-domain memory captured by onboarding, future schema editors, or
  // the agent itself. This is intentionally project metadata rather than a
  // separate generic experience schema so every turn can preserve lore, systems,
  // progression, economy, world rules, and production constraints.
  gameDesign?: GameDesignMetadata;
  // Absolute paths to local code folders the agent can read via --add-dir.
  linkedDirs?: string[];
}

export interface Project {
  id: string;
  name: string;
  // Canonical game-studio ids. `skillId` remains as the persisted skill
  // storage field while public art-bible responses use `gameArtBibleId`.
  gameSkillId?: string | null;
  gameArtBibleId?: string | null;
  skillId: string | null;
  createdAt: number;
  updatedAt: number;
  status?: ProjectStatusInfo;
  pendingPrompt?: string;
  metadata?: ProjectMetadata;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  sourceProjectId?: string;
  files: Array<{ name: string; content: string }>;
  description?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  projectId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProjectRequest {
  name: string;
  gameSkillId?: string | null;
  gameArtBibleId?: string | null;
  deliverableKind?: ProjectKind;
  gameDesign?: GameDesignMetadata;
  skillId?: string | null;
  pendingPrompt?: string;
  metadata?: ProjectMetadata;
}

export interface UpdateProjectRequest {
  name?: string;
  gameSkillId?: string | null;
  gameArtBibleId?: string | null;
  deliverableKind?: ProjectKind;
  gameDesign?: GameDesignMetadata | null;
  skillId?: string | null;
  pendingPrompt?: string | null;
  metadata?: ProjectMetadata | null;
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface ProjectResponse {
  project: Project;
}

// Response body for `GET /api/projects/:id`. Carries the same `project`
// payload as `ProjectResponse` plus a derived `resolvedDir` so the web
// client can address the on-disk working directory directly (e.g. for
// `shell.openPath` from the desktop bridge). For folder-imported projects
// `resolvedDir === metadata.baseDir`; for native projects it is
// `path.join(<daemon projects root>, project.id)`. Computed server-side via
// `resolveProjectDir(...)` so the web client never reconstructs the path.
export interface ProjectDetailResponse extends ProjectResponse {
  resolvedDir: string;
}

export interface CreateProjectResponse extends ProjectResponse {
  conversationId?: string;
}

// POST /api/import/folder — create a project rooted at an existing local
// folder. The submitted baseDir is stored as the project's metadata.baseDir
// (after realpath canonicalization) and the daemon reads/writes directly inside it.
// The creator owns version control; AI Game Design Studio does not snapshot or copy.
export interface ImportFolderRequest {
  baseDir: string;
  name?: string;
  gameSkillId?: string | null;
  gameArtBibleId?: string | null;
  skillId?: string | null;
}

export interface ImportFolderResponse {
  project: Project;
  conversationId: string;
  entryFile: string | null;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

export interface ConversationResponse {
  conversation: Conversation;
}

export interface CreateConversationRequest {
  title?: string | null;
}

export interface UpdateConversationRequest {
  title?: string | null;
}

export interface MessagesResponse {
  messages: ChatMessage[];
}

export type DeployProviderId = 'vercel-self' | 'cloudflare-pages';
export type DeploymentStatus =
  | 'deploying'
  | 'preparing-link'
  | 'ready'
  | 'link-delayed'
  | 'protected'
  | 'failed';

export interface CloudflarePagesConfigHints {
  lastZoneId?: string;
  lastZoneName?: string;
  lastDomainPrefix?: string;
}

export interface CloudflarePagesZoneInfo {
  id: string;
  name: string;
  status?: string;
  type?: string;
}

export interface CloudflarePagesZonesResponse {
  zones: CloudflarePagesZoneInfo[];
  cloudflarePages?: CloudflarePagesConfigHints;
}

export interface CloudflarePagesDeploySelection {
  zoneId: string;
  zoneName: string;
  domainPrefix: string;
}

export type DeploymentLinkStatus =
  | 'ready'
  | 'link-delayed'
  | 'protected'
  | 'failed';

export interface DeploymentLinkInfo {
  url: string;
  status: DeploymentLinkStatus;
  statusMessage?: string;
  reachableAt?: number;
}

export type CloudflarePagesDnsStatus =
  | 'skipped'
  | 'created'
  | 'reused'
  | 'unmarked'
  | 'patched'
  | 'conflict'
  | 'failed';

export type CloudflarePagesDomainStatus =
  | 'skipped'
  | 'pending'
  | 'active'
  | 'conflict'
  | 'failed';

export type CloudflarePagesCustomDomainStatus =
  | 'pending'
  | 'ready'
  | 'conflict'
  | 'failed';

export type CloudflarePagesDnsOwnership = 'marked' | 'unmarked' | 'external';

export interface CloudflarePagesCustomDomainInfo {
  hostname: string;
  url: string;
  zoneId: string;
  zoneName: string;
  domainPrefix: string;
  status: CloudflarePagesCustomDomainStatus;
  statusMessage?: string;
  errorCode?: string;
  errorMessage?: string;
  dnsStatus?: CloudflarePagesDnsStatus;
  dnsRecordId?: string;
  dnsOwnership?: CloudflarePagesDnsOwnership;
  domainStatus?: CloudflarePagesDomainStatus;
  pagesDomainStatus?: string;
  validationData?: unknown;
  verificationData?: unknown;
}

export interface CloudflarePagesDeploymentInfo {
  projectName: string;
  pagesDev: DeploymentLinkInfo;
  customDomain?: CloudflarePagesCustomDomainInfo;
}

export interface DeployConfigResponse {
  providerId: DeployProviderId;
  configured: boolean;
  tokenMask: string;
  teamId: string;
  teamSlug: string;
  accountId?: string;
  projectName?: string;
  cloudflarePages?: CloudflarePagesConfigHints;
  target: 'preview';
}

export interface UpdateDeployConfigRequest {
  providerId?: DeployProviderId;
  token?: string;
  teamId?: string;
  teamSlug?: string;
  accountId?: string;
  projectName?: string;
  cloudflarePages?: CloudflarePagesConfigHints;
}

export interface DeploymentInfo {
  id: string;
  projectId: string;
  fileName: string;
  providerId: DeployProviderId;
  url: string;
  deploymentId?: string;
  deploymentCount: number;
  target: 'preview';
  status: DeploymentStatus;
  statusMessage?: string;
  reachableAt?: number;
  cloudflarePages?: CloudflarePagesDeploymentInfo;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectDeploymentsResponse {
  deployments: DeploymentInfo[];
}

export interface DeployProjectFileRequest {
  fileName: string;
  providerId?: DeployProviderId;
  cloudflarePages?: CloudflarePagesDeploySelection;
}

export interface DeployProjectFileResponse extends DeploymentInfo {}

export interface CheckDeploymentLinkResponse extends DeploymentInfo {}

// Preflight inspects the file set that would be uploaded for a deploy
// without sending anything to the provider. Lets the UI show file count,
// total size, and warnings before the creator pays the network round-trip.

export type DeployPreflightWarningCode =
  | 'broken-reference'
  | 'invalid-reference'
  | 'large-asset'
  | 'large-bundle'
  | 'large-html'
  | 'external-script'
  | 'external-stylesheet'
  | 'no-doctype'
  | 'no-viewport';

export interface DeployPreflightWarning {
  code: DeployPreflightWarningCode;
  message: string;
  path?: string;
  url?: string;
  size?: number;
}

export interface DeployPreflightFile {
  path: string;
  size: number;
  mime: string;
  sourcePath: string;
}

export interface DeployPreflightRequest {
  fileName: string;
  providerId?: DeployProviderId;
}

export interface DeployPreflightResponse {
  providerId: DeployProviderId;
  entry: string;
  files: DeployPreflightFile[];
  totalFiles: number;
  totalBytes: number;
  warnings: DeployPreflightWarning[];
}
