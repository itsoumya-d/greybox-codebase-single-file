// SPDX-License-Identifier: Apache-2.0
/**
 * Build a *valid* {@link GameProject} from minimal inputs.
 *
 * The schema's `emptyGameProjectScaffold` is intentionally invalid (no screens,
 * no project id) so callers know what fields they own. This helper completes
 * that scaffold for the editor's first-launch flow.
 *
 * @packageDocumentation
 */
import type { GameProject, ProjectId, Screen, ScreenId } from '@greybox/schema';
import { SCHEMA_VERSION, asProjectId, asScreenId } from '@greybox/schema';

import { generateId } from './id.js';

export interface ScaffoldOptions {
  projectId: string;
  name?: string;
}

/** Produce a fresh project with one empty main-menu screen. */
export function scaffoldGameProject({ projectId, name }: ScaffoldOptions): GameProject {
  const screenId: ScreenId = asScreenId(`screen_${generateId()}`);
  const screen: Screen = {
    id: screenId,
    name: 'Main Menu',
    kind: 'main-menu',
    background: { type: 'color', color: '#0F0F12' },
    components: [],
  };

  const id: ProjectId = asProjectId(projectId);
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      id,
      name: name ?? 'Untitled Project',
      version: '0.1.0',
      genre: 'other',
      targetEngines: ['unity'],
      platforms: ['windows'],
    },
    art: {
      palette: { name: 'default', colors: [{ role: 'primary', hex: '#7C5CFF' }] },
      typography: {
        styles: [{ role: 'body', family: 'Inter', size: 16, weight: 400, lineHeight: 1.4 }],
      },
      materials: [],
    },
    exportPolicy: {
      unity: { renderPipeline: 'urp', inputSystem: 'new', scriptingBackend: 'il2cpp' },
      unreal: { engineVersion: '5.5', inputSystem: 'enhanced' },
      godot: { engineVersion: '4.4', renderer: 'forward+' },
    },
    assets: [],
    characters: [],
    screens: [screen],
    flow: [],
  };
}
