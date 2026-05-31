import type { OkResponse } from '../common.js';
import type { ArtifactKind, ArtifactManifest } from './artifacts.js';
import type { GameEditorSurface } from './projects.js';

export type ProjectFileKind =
  | 'html'
  | 'image'
  | 'video'
  | 'audio'
  | 'sketch'
  | 'game-viewport'
  | 'node-graph'
  | 'behavior-tree'
  | 'game-system'
  | 'text'
  | 'code'
  | 'pdf'
  | 'document'
  | 'presentation'
  | 'spreadsheet'
  | 'binary';

export interface ProjectFile {
  name: string;
  path?: string;
  type?: 'file' | 'dir';
  size: number;
  mtime: number;
  kind: ProjectFileKind;
  mime: string;
  artifactKind?: ArtifactKind;
  artifactManifest?: ArtifactManifest;
}

export type GameViewportSurface = 'gameplay' | 'level' | 'narrative' | 'world-map';

export interface GameViewportPoint {
  x: number;
  y: number;
}

export interface GameViewportLayer {
  id: string;
  name: string;
  type?:
    | 'terrain'
    | 'objective'
    | 'combat'
    | 'stealth'
    | 'narrative'
    | 'economy'
    | 'biome'
    | 'faction-territory'
    | 'weather'
    | 'camera'
    | 'cinematic'
    | 'simulation'
    | string;
  visible?: boolean;
  description?: string;
}

export interface GameViewportEntity {
  id: string;
  name: string;
  type:
    | 'player-spawn'
    | 'enemy-spawn'
    | 'npc'
    | 'objective'
    | 'hazard'
    | 'cover'
    | 'checkpoint'
    | 'reward'
    | 'trigger'
    | 'interaction-zone'
    | 'hidden-area'
    | 'dynamic-event'
    | 'scripted-sequence'
    | 'cinematic-trigger'
    | 'resource-node'
    | 'camera'
    | 'biome'
    | 'faction'
    | 'weather-volume'
    | 'destructible'
    | string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  layerId?: string;
  faction?: string;
  danger?: number;
  objective?: string;
  spawnRule?: string;
  interaction?: string;
  reward?: string;
  counterplay?: string;
  notes?: string;
}

export interface GameViewportTerrainZone {
  id: string;
  name: string;
  shape?: 'rect' | 'polygon' | string;
  type?:
    | 'arena'
    | 'cover-field'
    | 'high-ground'
    | 'hazard-field'
    | 'water'
    | 'safe-zone'
    | 'biome'
    | string;
  x: number;
  y: number;
  w: number;
  h: number;
  points?: GameViewportPoint[];
  layerId?: string;
  traversal?: string;
  cover?: string;
  mood?: string;
  notes?: string;
}

export interface GameViewportTerrainPaintStroke {
  id: string;
  name: string;
  type?: 'material' | 'hazard' | 'traversal' | 'cover' | 'biome' | string;
  material?: string;
  brushSize?: number;
  opacity?: number;
  layerId?: string;
  points: GameViewportPoint[];
  notes?: string;
}

export interface GameViewportTerrainSculptSample extends GameViewportPoint {
  height: number;
  radius?: number;
}

export interface GameViewportTerrainSculptPatch {
  id: string;
  name: string;
  type?: 'heightfield' | 'ridge' | 'valley' | 'ramp' | 'crater' | 'mesh-deformation' | string;
  x: number;
  y: number;
  radius?: number;
  height: number;
  falloff?: 'smooth' | 'linear' | 'terraced' | string;
  layerId?: string;
  samples?: GameViewportTerrainSculptSample[];
  meshIntent?: string;
  traversalImpact?: string;
  notes?: string;
}

export interface GameViewportPath {
  id: string;
  name: string;
  type?: 'objective' | 'traversal' | 'stealth' | 'combat' | 'reward' | 'camera' | string;
  points: GameViewportPoint[];
  notes?: string;
}

export interface GameViewportBeat {
  id: string;
  name: string;
  timing?: string;
  objective?: string;
  tension?: string;
  notes?: string;
}

export interface GameViewportDocument {
  version: 1;
  kind: 'game-viewport';
  surface: GameViewportSurface | string;
  title: string;
  objective?: string;
  camera?: string;
  scale?: string;
  editorSurface?: GameEditorSurface;
  layers?: GameViewportLayer[];
  entities?: GameViewportEntity[];
  terrainZones?: GameViewportTerrainZone[];
  terrainPaintStrokes?: GameViewportTerrainPaintStroke[];
  terrainSculptPatches?: GameViewportTerrainSculptPatch[];
  paths?: GameViewportPath[];
  beats?: GameViewportBeat[];
  dynamicEvents?: Array<{ id: string; name: string; trigger?: string; impact?: string }>;
  spatialReads?: Array<{
    id: string;
    name: string;
    sightline?: string;
    cover?: string;
    chokepoint?: string;
    stealthRoute?: string;
    traversalRhythm?: string;
    tensionSpacing?: string;
  }>;
  worldSimulation?: {
    ecosystem?: string;
    npcSchedules?: string[];
    factionTerritory?: string[];
    weather?: string;
    persistence?: string;
    destruction?: string;
    reactiveRules?: string[];
  };
  cameraPlan?: Array<{
    id: string;
    mode: string;
    framing: string;
    x?: number;
    y?: number;
    targetX?: number;
    targetY?: number;
    comfort?: string;
    readability?: string;
  }>;
  accessibilityNotes?: string[];
}

export type GameNodeGraphType =
  | 'gameplay-logic'
  | 'ai-behavior'
  | 'combat-reaction'
  | 'enemy-state'
  | 'quest-logic'
  | 'dialogue-logic'
  | 'economy-logic'
  | 'event-system'
  | 'dynamic-event'
  | 'environmental-trigger'
  | 'cutscene-sequencing'
  | 'procedural-generation'
  | 'progression-system'
  | 'faction-simulation';

export interface GameNodeGraphPort {
  id: string;
  label: string;
  dataType?: string;
}

export interface GameNodeGraphNode {
  id: string;
  title: string;
  category:
    | 'input'
    | 'state'
    | 'condition'
    | 'action'
    | 'event'
    | 'reward'
    | 'spawn'
    | 'ai-behavior'
    | 'camera'
    | 'cutscene'
    | 'dynamic-event'
    | 'accessibility'
    | 'economy'
    | 'procedural'
    | 'output'
    | string;
  x: number;
  y: number;
  description?: string;
  inputs?: GameNodeGraphPort[];
  outputs?: GameNodeGraphPort[];
  tuning?: Record<string, string | number | boolean>;
}

export interface GameNodeGraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

export interface GameNodeGraphDocument {
  version: 1;
  kind: 'node-graph';
  graphType: GameNodeGraphType | string;
  title: string;
  owner?: string;
  nodes: GameNodeGraphNode[];
  edges: GameNodeGraphEdge[];
  variables?: Array<{ id: string; name: string; value: string | number | boolean; notes?: string }>;
  collaborationNotes?: Array<{
    agent: 'game-director' | 'gameplay' | 'level' | 'narrative' | 'economy' | 'multiplayer' | 'hud' | 'art' | 'audio' | 'live-ops' | 'technical' | string;
    concern: string;
    decision?: string;
  }>;
  critiqueNotes?: string[];
}

export type BehaviorTreeNodeType =
  | 'root'
  | 'selector'
  | 'sequence'
  | 'condition'
  | 'action'
  | 'decorator'
  | 'parallel'
  | 'cooldown'
  | string;

export interface BehaviorTreeNode {
  id: string;
  parentId?: string;
  name: string;
  type: BehaviorTreeNodeType;
  priority?: number;
  condition?: string;
  action?: string;
  counterplay?: string;
  readability?: string;
  notes?: string;
}

export interface BehaviorTreeTransition {
  id: string;
  from: string;
  to: string;
  trigger: string;
  cooldown?: string;
}

export interface BehaviorTreeDocument {
  version: 1;
  kind: 'behavior-tree';
  title: string;
  owner: string;
  behaviorType?:
    | 'enemy-ai'
    | 'npc-schedule'
    | 'boss-logic'
    | 'companion'
    | 'stealth'
    | 'faction'
    | 'adaptive-difficulty'
    | 'survival'
    | 'tactical-coordination'
    | string;
  rootId: string;
  nodes: BehaviorTreeNode[];
  transitions?: BehaviorTreeTransition[];
  readableTells?: string[];
  counterplayRules?: string[];
  dynamicDifficultyRules?: string[];
  difficultyNotes?: string[];
  accessibilityNotes?: string[];
}

export type GameSystemSpecType =
  | 'combat'
  | 'camera'
  | 'animation'
  | 'vfx'
  | 'lighting'
  | 'audio'
  | 'progression'
  | 'economy'
  | 'multiplayer'
  | 'live-ops'
  | 'retention'
  | 'ethical-monetization'
  | 'procedural-generation'
  | 'encounter'
  | 'boss'
  | 'dungeon-raid'
  | 'difficulty-director'
  | 'quest'
  | 'narrative'
  | 'worldbuilding'
  | 'faction'
  | 'companion-party'
  | 'traversal'
  | 'telemetry'
  | 'production-feasibility'
  | 'playtest-simulation'
  | 'accessibility'
  | 'weapon-equipment'
  | 'open-world'
  | 'survival'
  | 'stealth'
  | 'vehicle'
  | 'community-modding'
  | 'cross-platform';

export interface GameSystemMetric {
  id: string;
  label: string;
  target: string | number;
  current?: string | number;
  risk?: 'low' | 'medium' | 'high';
}

export interface GameSystemLoop {
  id: string;
  name: string;
  cadence?: string;
  steps: string[];
  reward?: string;
}

export interface GameSystemRisk {
  id: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface GameSystemSpecDocument {
  version: 1;
  kind: 'game-system';
  systemType: GameSystemSpecType | string;
  title: string;
  pillars?: string[];
  metrics?: GameSystemMetric[];
  loops?: GameSystemLoop[];
  tuning?: Record<string, string | number | boolean>;
  designTokens?: {
    rarityColors?: Record<string, string>;
    factionPalettes?: Record<string, string>;
    biomePalettes?: Record<string, string>;
    statusEffectColors?: Record<string, string>;
    motionProfiles?: Record<string, string | number>;
    audioCues?: Record<string, string>;
  };
  risks?: GameSystemRisk[];
  benchmarks?: Array<{ id: string; game: string; lesson: string; caution?: string }>;
  feasibility?: {
    teamSize?: string;
    timeline?: string;
    complexity?: 'solo' | 'indie' | 'aa' | 'aaa' | string;
    constraints?: string[];
  };
  production?: {
    milestone?: string;
    assetBudget?: string;
    qaFocus?: string[];
    engineNotes?: string[];
    scalingVariants?: Array<{ scale: 'solo' | 'indie' | 'aa' | 'aaa' | string; tradeoff: string }>;
  };
  telemetry?: Array<{ id: string; signal: string; designQuestion: string; action?: string }>;
  iterationGoals?: string[];
  ethics?: string[];
  platformAdaptation?: Array<{ platform: string; input?: string; performance?: string; readability?: string }>;
  accessibility?: string[];
  playtestQuestions?: string[];
}

export interface ProjectFilesResponse {
  files: ProjectFile[];
}

export interface ProjectFileResponse {
  file: ProjectFile;
}

export interface UploadProjectFilesResponse extends ProjectFilesResponse {}

export interface DeleteProjectFileResponse extends OkResponse {}

export interface RenameProjectFileRequest {
  from: string;
  to: string;
}

export interface RenameProjectFileResponse {
  file: ProjectFile;
  oldName: string;
  newName: string;
}
