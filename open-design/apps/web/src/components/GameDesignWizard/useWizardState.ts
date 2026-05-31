import { useCallback, useReducer } from 'react';
import type { Screen } from '@greybox/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GameType = '2D' | '3D' | 'Mobile-2D' | 'Mobile-3D';

export type WizardStep =
  | 'concept'
  | 'screens'
  | 'design'
  | 'characters'
  | 'world'
  | 'prototype'
  | 'export';

export const WIZARD_STEPS: WizardStep[] = [
  'concept',
  'screens',
  'design',
  'characters',
  'world',
  'prototype',
  'export',
];

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  concept: 'Concept',
  screens: 'Screens',
  design: 'Design',
  characters: 'Characters',
  world: 'World',
  prototype: 'Prototype',
  export: 'Export',
};

export interface WizardCharacter {
  id: string;
  name: string;
  description: string;
  type: 'player' | 'enemy' | 'npc' | 'boss';
  style: string;
  stats: {
    hp: number;
    speed: number;
    damage: number;
  };
  // Cloud generation state
  jobId?: string;
  jobStatus?: 'queued' | 'processing' | 'complete' | 'failed';
  jobProgress?: number;
  assetUrl?: string;
  // 2D sprite generation state
  spriteUrl?: string;
  spriteGenerating?: boolean;
  spriteFailed?: boolean;
}

export interface WizardConcept {
  gameType: GameType;
  genre: string;
  platform: string;
  artStyle: string;
  artBibleId: string | null;
  targetAudience: string;
  coreLoop: string;
  name: string;
  aiSummary?: string;
}

export interface WizardScreen {
  id: string;
  name: string;
  kind: Screen['kind'];
  x: number;
  y: number;
  components: Array<{ id: string; kind: string; name: string }>;
  mockupHtml?: string;
}

export interface WizardFlow {
  fromId: string;
  toId: string;
  label?: string;
}

export interface WizardState {
  step: WizardStep;
  projectId?: string;
  concept: WizardConcept;
  screens: WizardScreen[];
  flows: WizardFlow[];
  activeScreenId: string | null;
  characters: WizardCharacter[];
  worldNotes: string;
  worldBoardHtml?: string;
  prototypeHtml: string | null;
  exportEngine: 'unity' | 'godot' | 'unreal' | 'webgl' | null;
  // Loading / generation tracking
  generatingConcept: boolean;
  generatingScreens: boolean;
  generatingDesign: boolean;
  generatingWorld: boolean;
  generatingPrototype: boolean;
  exporting: boolean;
  error: string | null;
  // Quota / upgrade flags (session-only, not persisted)
  worldUpgradeRequired: boolean;
  prototypeUpgradeRequired: boolean;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type WizardAction =
  | { type: 'GO_TO_STEP'; step: WizardStep }
  | { type: 'SET_PROJECT_ID'; projectId: string }
  | { type: 'UPDATE_CONCEPT'; patch: Partial<WizardConcept> }
  | { type: 'SET_CONCEPT_SUMMARY'; summary: string }
  | { type: 'SET_SCREENS'; screens: WizardScreen[] }
  | { type: 'ADD_SCREEN'; screen: WizardScreen }
  | { type: 'REMOVE_SCREEN'; screenId: string }
  | { type: 'UPDATE_SCREEN'; screenId: string; patch: Partial<WizardScreen> }
  | { type: 'SET_ACTIVE_SCREEN'; screenId: string | null }
  | { type: 'SET_FLOWS'; flows: WizardFlow[] }
  | { type: 'ADD_FLOW'; flow: WizardFlow }
  | { type: 'REMOVE_FLOW'; fromId: string; toId: string }
  | { type: 'ADD_CHARACTER'; character: WizardCharacter }
  | { type: 'UPDATE_CHARACTER'; id: string; patch: Partial<WizardCharacter> }
  | { type: 'REMOVE_CHARACTER'; id: string }
  | { type: 'SET_WORLD_NOTES'; notes: string }
  | { type: 'SET_WORLD_BOARD_HTML'; html: string }
  | { type: 'SET_PROTOTYPE_HTML'; html: string }
  | { type: 'SET_EXPORT_ENGINE'; engine: WizardState['exportEngine'] }
  | { type: 'SET_GENERATING'; field: 'concept' | 'screens' | 'design' | 'world' | 'prototype'; value: boolean }
  | { type: 'SET_EXPORTING'; value: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_WORLD_UPGRADE_REQUIRED'; value: boolean }
  | { type: 'SET_PROTOTYPE_UPGRADE_REQUIRED'; value: boolean };

// ---------------------------------------------------------------------------
// Default screens per genre
// ---------------------------------------------------------------------------

export function defaultScreensForGenre(genre: string, platform: string): WizardScreen[] {
  const isMobile = platform === 'mobile';
  const base: Array<{ name: string; kind: Screen['kind'] }> = isMobile
    ? [
        { name: 'Splash', kind: 'loading' },
        { name: 'Home', kind: 'main-menu' },
        { name: 'Gameplay', kind: 'gameplay' },
        { name: 'Results', kind: 'game-over' },
        { name: 'Shop', kind: 'shop' },
      ]
    : [
        { name: 'Main Menu', kind: 'main-menu' },
        { name: 'Gameplay', kind: 'gameplay' },
        { name: 'Pause', kind: 'pause' },
        { name: 'Game Over', kind: 'game-over' },
        { name: 'Settings', kind: 'settings' },
      ];

  if (genre.toLowerCase().includes('rpg') || genre.toLowerCase().includes('adventure')) {
    base.push({ name: 'Inventory', kind: 'inventory' });
  }
  if (genre.toLowerCase().includes('puzzle') || genre.toLowerCase().includes('casual')) {
    // replace game-over with results
  }

  const colCount = Math.ceil(Math.sqrt(base.length));
  return base.map((s, i) => ({
    id: `screen-${i}-${s.kind}`,
    name: s.name,
    kind: s.kind,
    x: (i % colCount) * 180 + 40,
    y: Math.floor(i / colCount) * 140 + 40,
    components: [],
  }));
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'GO_TO_STEP':
      return { ...state, step: action.step, error: null };
    case 'SET_PROJECT_ID':
      return { ...state, projectId: action.projectId };
    case 'UPDATE_CONCEPT':
      return { ...state, concept: { ...state.concept, ...action.patch } };
    case 'SET_CONCEPT_SUMMARY':
      return { ...state, concept: { ...state.concept, aiSummary: action.summary } };
    case 'SET_SCREENS':
      return {
        ...state,
        screens: action.screens,
        activeScreenId: action.screens[0]?.id ?? null,
      };
    case 'ADD_SCREEN':
      return { ...state, screens: [...state.screens, action.screen] };
    case 'REMOVE_SCREEN':
      return {
        ...state,
        screens: state.screens.filter((s) => s.id !== action.screenId),
        activeScreenId: state.activeScreenId === action.screenId
          ? (state.screens.find((s) => s.id !== action.screenId)?.id ?? null)
          : state.activeScreenId,
      };
    case 'UPDATE_SCREEN':
      return {
        ...state,
        screens: state.screens.map((s) =>
          s.id === action.screenId ? { ...s, ...action.patch } : s,
        ),
      };
    case 'SET_ACTIVE_SCREEN':
      return { ...state, activeScreenId: action.screenId };
    case 'SET_FLOWS':
      return { ...state, flows: action.flows };
    case 'ADD_FLOW':
      return { ...state, flows: [...state.flows, action.flow] };
    case 'REMOVE_FLOW':
      return {
        ...state,
        flows: state.flows.filter(
          (f) => !(f.fromId === action.fromId && f.toId === action.toId),
        ),
      };
    case 'ADD_CHARACTER':
      return { ...state, characters: [...state.characters, action.character] };
    case 'UPDATE_CHARACTER':
      return {
        ...state,
        characters: state.characters.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c,
        ),
      };
    case 'REMOVE_CHARACTER':
      return { ...state, characters: state.characters.filter((c) => c.id !== action.id) };
    case 'SET_WORLD_NOTES':
      return { ...state, worldNotes: action.notes };
    case 'SET_WORLD_BOARD_HTML':
      return { ...state, worldBoardHtml: action.html };
    case 'SET_PROTOTYPE_HTML':
      return { ...state, prototypeHtml: action.html };
    case 'SET_EXPORT_ENGINE':
      return { ...state, exportEngine: action.engine };
    case 'SET_GENERATING':
      switch (action.field) {
        case 'concept': return { ...state, generatingConcept: action.value, error: null };
        case 'screens': return { ...state, generatingScreens: action.value, error: null };
        case 'design': return { ...state, generatingDesign: action.value, error: null };
        case 'world': return { ...state, generatingWorld: action.value, error: null };
        case 'prototype': return { ...state, generatingPrototype: action.value, error: null };
        default: return state;
      }
    case 'SET_EXPORTING':
      return { ...state, exporting: action.value };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'SET_WORLD_UPGRADE_REQUIRED':
      return { ...state, worldUpgradeRequired: action.value };
    case 'SET_PROTOTYPE_UPGRADE_REQUIRED':
      return { ...state, prototypeUpgradeRequired: action.value };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function initialState(): WizardState {
  return {
    step: 'concept',
    concept: {
      gameType: 'Mobile-2D',
      genre: '',
      platform: 'mobile',
      artStyle: '',
      artBibleId: null,
      targetAudience: '',
      coreLoop: '',
      name: '',
    },
    screens: [],
    flows: [],
    activeScreenId: null,
    characters: [],
    worldNotes: '',
    prototypeHtml: null,
    exportEngine: null,
    generatingConcept: false,
    generatingScreens: false,
    generatingDesign: false,
    generatingWorld: false,
    generatingPrototype: false,
    exporting: false,
    error: null,
    worldUpgradeRequired: false,
    prototypeUpgradeRequired: false,
  };
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'greybox_wizard_';

export function loadWizardState(projectId: string): Partial<WizardState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + projectId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const safe: Partial<WizardState> = { ...(parsed as Record<string, unknown>) } as Partial<WizardState>;
    // Coerce array fields
    if (!Array.isArray(safe.screens)) safe.screens = undefined;
    if (!Array.isArray(safe.flows)) safe.flows = undefined;
    if (!Array.isArray(safe.characters)) safe.characters = undefined;
    // Reject invalid step values
    if (safe.step !== undefined && !(WIZARD_STEPS as readonly string[]).includes(safe.step)) {
      safe.step = undefined;
    }
    return safe;
  } catch {
    return null;
  }
}

export function saveWizardState(projectId: string, state: WizardState): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + projectId, JSON.stringify(state));
  } catch {
    // Ignore quota or serialisation errors silently
  }
}

const VALID_GAME_TYPES = new Set<string>(['2D', '3D', 'Mobile-2D', 'Mobile-3D']);

function isValidGameType(v: unknown): v is GameType {
  return typeof v === 'string' && VALID_GAME_TYPES.has(v);
}

export function initialStateWithProject(projectId: string): WizardState {
  const base = initialState();
  const saved = loadWizardState(projectId);
  if (!saved) return { ...base, projectId };

  // Deep-merge concept so required fields always have valid defaults
  const savedConcept = (saved.concept ?? {}) as Partial<WizardConcept>;
  return {
    ...base,
    ...saved,
    projectId,
    concept: {
      ...base.concept,
      ...savedConcept,
      gameType: isValidGameType(savedConcept.gameType)
        ? savedConcept.gameType
        : base.concept.gameType,
    },
    // Always reset transient fields
    generatingConcept: false,
    generatingScreens: false,
    generatingDesign: false,
    generatingWorld: false,
    generatingPrototype: false,
    exporting: false,
    error: null,
    worldUpgradeRequired: false,
    prototypeUpgradeRequired: false,
  };
}

export function useWizardState(seedState?: WizardState) {
  const [state, dispatch] = useReducer(reducer, undefined, () => seedState ?? initialState());

  const goToStep = useCallback((step: WizardStep) => dispatch({ type: 'GO_TO_STEP', step }), []);
  const setProjectId = useCallback((id: string) => dispatch({ type: 'SET_PROJECT_ID', projectId: id }), []);
  const updateConcept = useCallback((patch: Partial<WizardConcept>) => dispatch({ type: 'UPDATE_CONCEPT', patch }), []);
  const setConceptSummary = useCallback((summary: string) => dispatch({ type: 'SET_CONCEPT_SUMMARY', summary }), []);
  const setScreens = useCallback((screens: WizardScreen[]) => dispatch({ type: 'SET_SCREENS', screens }), []);
  const addScreen = useCallback((screen: WizardScreen) => dispatch({ type: 'ADD_SCREEN', screen }), []);
  const removeScreen = useCallback((id: string) => dispatch({ type: 'REMOVE_SCREEN', screenId: id }), []);
  const updateScreen = useCallback((id: string, patch: Partial<WizardScreen>) => dispatch({ type: 'UPDATE_SCREEN', screenId: id, patch }), []);
  const setActiveScreen = useCallback((id: string | null) => dispatch({ type: 'SET_ACTIVE_SCREEN', screenId: id }), []);
  const setFlows = useCallback((flows: WizardFlow[]) => dispatch({ type: 'SET_FLOWS', flows }), []);
  const addFlow = useCallback((flow: WizardFlow) => dispatch({ type: 'ADD_FLOW', flow }), []);
  const removeFlow = useCallback((fromId: string, toId: string) => dispatch({ type: 'REMOVE_FLOW', fromId, toId }), []);
  const addCharacter = useCallback((char: WizardCharacter) => dispatch({ type: 'ADD_CHARACTER', character: char }), []);
  const updateCharacter = useCallback((id: string, patch: Partial<WizardCharacter>) => dispatch({ type: 'UPDATE_CHARACTER', id, patch }), []);
  const removeCharacter = useCallback((id: string) => dispatch({ type: 'REMOVE_CHARACTER', id }), []);
  const setWorldNotes = useCallback((notes: string) => dispatch({ type: 'SET_WORLD_NOTES', notes }), []);
  const setWorldBoardHtml = useCallback((html: string) => dispatch({ type: 'SET_WORLD_BOARD_HTML', html }), []);
  const setPrototypeHtml = useCallback((html: string) => dispatch({ type: 'SET_PROTOTYPE_HTML', html }), []);
  const setExportEngine = useCallback((engine: WizardState['exportEngine']) => dispatch({ type: 'SET_EXPORT_ENGINE', engine }), []);
  const setGenerating = useCallback((field: 'concept' | 'screens' | 'design' | 'world' | 'prototype', value: boolean) => dispatch({ type: 'SET_GENERATING', field, value }), []);
  const setExporting = useCallback((value: boolean) => dispatch({ type: 'SET_EXPORTING', value }), []);
  const setError = useCallback((error: string | null) => dispatch({ type: 'SET_ERROR', error }), []);
  const setWorldUpgradeRequired = useCallback((value: boolean) => dispatch({ type: 'SET_WORLD_UPGRADE_REQUIRED', value }), []);
  const setPrototypeUpgradeRequired = useCallback((value: boolean) => dispatch({ type: 'SET_PROTOTYPE_UPGRADE_REQUIRED', value }), []);

  return {
    state,
    goToStep,
    setProjectId,
    updateConcept,
    setConceptSummary,
    setScreens,
    addScreen,
    removeScreen,
    updateScreen,
    setActiveScreen,
    setFlows,
    addFlow,
    removeFlow,
    addCharacter,
    updateCharacter,
    removeCharacter,
    setWorldNotes,
    setWorldBoardHtml,
    setPrototypeHtml,
    setExportEngine,
    setGenerating,
    setExporting,
    setError,
    setWorldUpgradeRequired,
    setPrototypeUpgradeRequired,
  };
}
