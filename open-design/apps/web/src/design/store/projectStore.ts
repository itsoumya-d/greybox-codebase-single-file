// SPDX-License-Identifier: Apache-2.0
/**
 * ProjectStore — pure reducer over a canonical {@link GameProject}.
 *
 * The visual page-and-component editor never mutates a `GameProject`
 * directly. Every UI action funnels through {@link projectReducer} so that:
 *
 *  - All state transitions are testable in isolation (no React, no fetch).
 *  - The exact post-action shape is round-trippable via `JSON.stringify` and
 *    passes `validateGameProject` from `@greybox/schema`.
 *  - Persistence layers (REST PUT, Yjs mirror) can subscribe to a single
 *    "produce the next project" boundary.
 *
 * The reducer also tracks lightweight UI state (selected screen/component)
 * but those keys are stripped before persistence — see {@link toGameProject}.
 *
 * @packageDocumentation
 */
import type {
  Component,
  ComponentId,
  ComponentKind,
  FlowEdge,
  FlowEdgeId,
  GameProject,
  Screen,
  ScreenId,
  ScreenKind,
} from '@greybox/schema';
import {
  asComponentId,
  asFlowEdgeId,
  asScreenId,
} from '@greybox/schema';

import { defaultComponentFor } from '../lib/componentDefaults.js';
import { generateId } from '../lib/id.js';

/**
 * UI-only state layered on top of the canonical project.
 *
 * - `selectedScreenId` — which screen is open in the canvas.
 * - `selectedComponentId` — which component populates the inspector.
 * - `saveStatus` — last-known persistence state for the top-bar indicator.
 * - `lastError` — for surfacing validation/network failures.
 */
export interface ProjectEditorState {
  project: GameProject;
  selectedScreenId: ScreenId | null;
  selectedComponentId: ComponentId | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastError: string | null;
}

/**
 * Discriminated union of every mutation the editor can perform.
 *
 * Adding a new action: extend the union, add a `case` to
 * {@link projectReducer}, and a typed helper in {@link projectActions}.
 */
export type ProjectAction =
  | { type: 'project/setName'; name: string }
  | { type: 'screen/add'; kind?: ScreenKind; name?: string }
  | { type: 'screen/update'; screenId: ScreenId; patch: Partial<Omit<Screen, 'id'>> }
  | { type: 'screen/delete'; screenId: ScreenId }
  | { type: 'screen/reorder'; from: number; to: number }
  | { type: 'screen/select'; screenId: ScreenId | null }
  | { type: 'component/add'; screenId: ScreenId; kind: ComponentKind; position?: { x: number; y: number } }
  | { type: 'component/update'; screenId: ScreenId; componentId: ComponentId; patch: Record<string, unknown> }
  | { type: 'component/delete'; screenId: ScreenId; componentId: ComponentId }
  | { type: 'component/select'; componentId: ComponentId | null }
  | { type: 'flow/addEdge'; from: ScreenId; to: ScreenId }
  | { type: 'flow/deleteEdge'; edgeId: FlowEdgeId }
  | { type: 'persist/started' }
  | { type: 'persist/succeeded' }
  | { type: 'persist/failed'; error: string }
  | { type: 'project/replace'; project: GameProject };

/**
 * Build a fresh in-memory editor state seeded from a `GameProject`.
 */
export function createEditorState(project: GameProject): ProjectEditorState {
  const firstScreen = project.screens[0];
  return {
    project,
    selectedScreenId: firstScreen ? firstScreen.id : null,
    selectedComponentId: null,
    saveStatus: 'idle',
    lastError: null,
  };
}

/**
 * Pure reducer. Returns a brand-new state object — never mutates input.
 *
 * Unknown / invalid actions short-circuit to the current state so callers
 * can wire up React-style `useReducer` without worrying about throws.
 */
export function projectReducer(
  state: ProjectEditorState,
  action: ProjectAction,
): ProjectEditorState {
  switch (action.type) {
    case 'project/setName':
      return {
        ...state,
        project: {
          ...state.project,
          meta: { ...state.project.meta, name: action.name },
        },
      };

    case 'project/replace':
      return createEditorState(action.project);

    case 'screen/add': {
      const id = asScreenId(`screen_${generateId()}`);
      const screen: Screen = {
        id,
        name: action.name ?? `Screen ${state.project.screens.length + 1}`,
        kind: action.kind ?? 'custom',
        background: { type: 'color', color: '#0F0F12' },
        components: [],
      };
      return {
        ...state,
        project: { ...state.project, screens: [...state.project.screens, screen] },
        selectedScreenId: id,
        selectedComponentId: null,
      };
    }

    case 'screen/update': {
      return {
        ...state,
        project: {
          ...state.project,
          screens: state.project.screens.map((s) =>
            s.id === action.screenId ? ({ ...s, ...action.patch } as Screen) : s,
          ),
        },
      };
    }

    case 'screen/delete': {
      const screens = state.project.screens.filter((s) => s.id !== action.screenId);
      // Keep flow consistent — drop edges that reference the gone screen.
      const flow = state.project.flow.filter(
        (e) => e.from !== action.screenId && e.to !== action.screenId,
      );
      const nextSelected =
        state.selectedScreenId === action.screenId
          ? screens[0]?.id ?? null
          : state.selectedScreenId;
      return {
        ...state,
        project: { ...state.project, screens, flow },
        selectedScreenId: nextSelected,
        selectedComponentId: null,
      };
    }

    case 'screen/reorder': {
      const list = [...state.project.screens];
      const [moved] = list.splice(action.from, 1);
      if (!moved) return state;
      list.splice(action.to, 0, moved);
      return { ...state, project: { ...state.project, screens: list } };
    }

    case 'screen/select':
      return {
        ...state,
        selectedScreenId: action.screenId,
        selectedComponentId: null,
      };

    case 'component/add': {
      const screenIdx = state.project.screens.findIndex((s) => s.id === action.screenId);
      if (screenIdx === -1) return state;
      const screen = state.project.screens[screenIdx]!;
      const newId = asComponentId(`cmp_${generateId()}`);
      const x = action.position?.x ?? 40;
      const y = action.position?.y ?? 40;
      const component = defaultComponentFor(action.kind, newId, { x, y });
      const updatedScreen: Screen = {
        ...screen,
        components: [...screen.components, component],
      };
      const screens = [...state.project.screens];
      screens[screenIdx] = updatedScreen;
      return {
        ...state,
        project: { ...state.project, screens },
        selectedComponentId: newId,
      };
    }

    case 'component/update': {
      const screenIdx = state.project.screens.findIndex((s) => s.id === action.screenId);
      if (screenIdx === -1) return state;
      const screen = state.project.screens[screenIdx]!;
      const components = screen.components.map((c) => {
        if (c.id !== action.componentId) return c;
        // Merge top-level keys; do NOT replace transform/properties wholesale.
        const next = { ...c, ...action.patch } as Component;
        return next;
      });
      const screens = [...state.project.screens];
      screens[screenIdx] = { ...screen, components };
      return { ...state, project: { ...state.project, screens } };
    }

    case 'component/delete': {
      const screenIdx = state.project.screens.findIndex((s) => s.id === action.screenId);
      if (screenIdx === -1) return state;
      const screen = state.project.screens[screenIdx]!;
      const components = screen.components.filter((c) => c.id !== action.componentId);
      const screens = [...state.project.screens];
      screens[screenIdx] = { ...screen, components };
      return {
        ...state,
        project: { ...state.project, screens },
        selectedComponentId:
          state.selectedComponentId === action.componentId ? null : state.selectedComponentId,
      };
    }

    case 'component/select':
      return { ...state, selectedComponentId: action.componentId };

    case 'flow/addEdge': {
      const id = asFlowEdgeId(`edge_${generateId()}`);
      const edge: FlowEdge = {
        id,
        from: action.from,
        to: action.to,
        trigger: { type: 'tap' },
      };
      return {
        ...state,
        project: { ...state.project, flow: [...state.project.flow, edge] },
      };
    }

    case 'flow/deleteEdge': {
      return {
        ...state,
        project: {
          ...state.project,
          flow: state.project.flow.filter((e) => e.id !== action.edgeId),
        },
      };
    }

    case 'persist/started':
      return { ...state, saveStatus: 'saving', lastError: null };
    case 'persist/succeeded':
      return { ...state, saveStatus: 'saved', lastError: null };
    case 'persist/failed':
      return { ...state, saveStatus: 'error', lastError: action.error };

    default:
      return state;
  }
}

/**
 * Strip editor-only state and return the persistable GameProject.
 */
export function toGameProject(state: ProjectEditorState): GameProject {
  return state.project;
}

/**
 * Find a screen by id without scanning twice.
 */
export function getScreen(state: ProjectEditorState, id: ScreenId | null): Screen | null {
  if (!id) return null;
  return state.project.screens.find((s) => s.id === id) ?? null;
}

/**
 * Find a component within the currently selected screen.
 */
export function getSelectedComponent(state: ProjectEditorState): Component | null {
  if (!state.selectedScreenId || !state.selectedComponentId) return null;
  const screen = getScreen(state, state.selectedScreenId);
  if (!screen) return null;
  return screen.components.find((c) => c.id === state.selectedComponentId) ?? null;
}
