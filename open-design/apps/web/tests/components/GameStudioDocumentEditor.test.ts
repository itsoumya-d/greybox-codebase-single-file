import { describe, expect, it } from 'vitest';

import {
  isGameStudioDocumentKind,
  normalizeGameStudioDocumentForKind,
  validateGameStudioDocumentForKind,
} from '../../src/components/GameStudioDocumentEditor';

describe('GameStudioDocumentEditor document model', () => {
  it('recognizes first-class game studio file kinds', () => {
    expect(isGameStudioDocumentKind('game-viewport')).toBe(true);
    expect(isGameStudioDocumentKind('node-graph')).toBe(true);
    expect(isGameStudioDocumentKind('behavior-tree')).toBe(true);
    expect(isGameStudioDocumentKind('game-system')).toBe(true);
    expect(isGameStudioDocumentKind('html')).toBe(false);
  });

  it('normalizes viewport, graph, behavior, and system documents from partial JSON', () => {
    expect(
      normalizeGameStudioDocumentForKind('game-viewport', { title: 'Arena', entities: [] }, 'arena.gameview.json'),
    ).toMatchObject({ kind: 'game-viewport', title: 'Arena', surface: 'gameplay' });

    expect(
      normalizeGameStudioDocumentForKind('node-graph', { graphType: 'quest-logic', nodes: [] }, 'quest.nodegraph.json'),
    ).toMatchObject({ kind: 'node-graph', graphType: 'quest-logic' });

    expect(
      normalizeGameStudioDocumentForKind('behavior-tree', { owner: 'Boss', nodes: [{ id: 'root', name: 'Root', type: 'root' }] }, 'boss.btree.json'),
    ).toMatchObject({ kind: 'behavior-tree', owner: 'Boss', rootId: 'root' });

    expect(
      normalizeGameStudioDocumentForKind('game-system', { systemType: 'camera', pillars: ['comfort'] }, 'camera.systems.json'),
    ).toMatchObject({ kind: 'game-system', systemType: 'camera', pillars: ['comfort'] });
  });

  it('validates normalized studio documents against shared game schemas', () => {
    const valid = normalizeGameStudioDocumentForKind(
      'game-viewport',
      { title: 'Arena', entities: [{ id: 'enemy-wave-a', name: 'Enemy Wave A', type: 'enemy-spawn', x: 420, y: 160 }] },
      'arena.gameview.json',
    );
    expect(validateGameStudioDocumentForKind('game-viewport', valid)).toMatchObject({ ok: true });

    const invalid = normalizeGameStudioDocumentForKind(
      'game-viewport',
      { title: 'Arena', entities: [{ id: 'bad id', name: 'Enemy Wave A', type: 'enemy-spawn', x: 420, y: 160 }] },
      'arena.gameview.json',
    );
    const result = validateGameStudioDocumentForKind('game-viewport', invalid);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain('entities.0.id');
  });
});
