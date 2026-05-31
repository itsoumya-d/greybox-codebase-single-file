// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import {
  mergeRoundTripContent,
  normalizeRoundTripMergeRequest,
} from '../src/round-trip-merge.js';

function deepObject(depth: number): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (let index = 0; index < depth; index += 1) {
    const next: Record<string, unknown> = {};
    cursor[`node${index}`] = next;
    cursor = next;
  }
  return root;
}

function wideObject(count: number): Record<string, number> {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`key${index}`, index]));
}

function conflictingObject(count: number, value: number): Record<string, number> {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`key${index}`, value]));
}

describe('round-trip merge', () => {
  it('normalizes engine-specific HTTP merge payloads for Unreal and Godot', () => {
    expect(normalizeRoundTripMergeRequest({
      engine: 'unreal',
      fileName: 'levels/arena.gameview.json',
      unrealDiff: [{ path: '$.actors[id=boss].health', value: 2 }],
      force: true,
    })).toEqual({
      engine: 'unreal',
      fileName: 'levels/arena.gameview.json',
      engineDiff: [{ path: '$.actors[id=boss].health', value: 2 }],
      force: true,
    });

    expect(normalizeRoundTripMergeRequest({
      fileName: 'levels/arena.levelboard.json',
      godotContent: '{"rooms":[]}',
      baseContent: '{"rooms":[{"name":"Entry"}]}',
    })).toEqual({
      engine: 'godot',
      fileName: 'levels/arena.levelboard.json',
      baseContent: '{"rooms":[{"name":"Entry"}]}',
      engineContent: '{"rooms":[]}',
      force: false,
    });
  });

  it('keeps Unity merge payloads backwards compatible while accepting engine aliases', () => {
    expect(normalizeRoundTripMergeRequest({
      fileName: 'DESIGN.md',
      unityContent: '# Design\n\nUnity note\n',
    })).toEqual({
      engine: 'unity',
      fileName: 'DESIGN.md',
      engineContent: '# Design\n\nUnity note\n',
      force: false,
    });

    expect(normalizeRoundTripMergeRequest({
      engine: 'godot',
      fileName: 'levels/arena.levelboard.json',
      engineDiff: [{ path: '$.rooms[name=Boss Door].position', value: { x: 4, y: 2 } }],
    })).toEqual({
      engine: 'godot',
      fileName: 'levels/arena.levelboard.json',
      engineDiff: [{ path: '$.rooms[name=Boss Door].position', value: { x: 4, y: 2 } }],
      force: false,
    });
  });

  it('applies Unity-only scalar edits without conflicts', () => {
    const result = mergeRoundTripContent({
      baseContent: '{"boss":{"health":1}}',
      webContent: '{"boss":{"health":1}}',
      unityDiff: [{ path: 'boss.health', value: 2 }],
    });

    expect(result.conflicts).toHaveLength(0);
    expect(JSON.parse(result.content).boss.health).toBe(2);
  });

  it('applies Unity-only typed game fields without conflicts', () => {
    const base = {
      actors: [
        {
          id: 'boss',
          health: 1,
          speed: 1.5,
          displayName: 'Old Boss',
          tint: { r: 1, g: 0.1, b: 0.1, a: 1 },
          position: { x: 1, y: 2, z: 3 },
        },
      ],
    };
    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(base),
      unityDiff: [
        { path: ['actors', '0', 'health'], value: 2 },
        { path: ['actors', '0', 'speed'], value: 2.25 },
        { path: ['actors', '0', 'displayName'], value: 'Arena Boss' },
        { path: ['actors', '0', 'tint'], value: { r: 0.25, g: 0.5, b: 1, a: 1 } },
        { path: ['actors', '0', 'position'], value: { x: 4, y: 5, z: 6 } },
      ],
    });

    const actor = JSON.parse(result.content).actors[0];
    expect(result.conflicts).toHaveLength(0);
    expect(actor).toMatchObject({
      health: 2,
      speed: 2.25,
      displayName: 'Arena Boss',
      tint: { r: 0.25, g: 0.5, b: 1, a: 1 },
      position: { x: 4, y: 5, z: 6 },
    });
  });

  it('merges independent web and Unity edits inside stable-id arrays', () => {
    const base = {
      actors: [
        { id: 'boss', health: 1, displayName: 'Old Boss', position: { x: 1, y: 2, z: 3 } },
        { id: 'minion', health: 1, displayName: 'Minion', position: { x: 8, y: 2, z: 0 } },
      ],
    };
    const web = {
      actors: [
        { id: 'boss', health: 1, displayName: 'Readable Boss', position: { x: 1, y: 2, z: 3 } },
        { id: 'minion', health: 1, displayName: 'Minion', position: { x: 8, y: 2, z: 0 } },
      ],
    };

    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(web),
      unityDiff: [{ path: ['actors', '1', 'position'], value: { x: 9, y: 3, z: 0 } }],
    });

    const merged = JSON.parse(result.content);
    expect(result.conflicts).toHaveLength(0);
    expect(merged.actors).toEqual([
      { id: 'boss', health: 1, displayName: 'Readable Boss', position: { x: 1, y: 2, z: 3 } },
      { id: 'minion', health: 1, displayName: 'Minion', position: { x: 9, y: 3, z: 0 } },
    ]);
  });

  it('merges independent web and Unity edits inside game-domain stable-key arrays', () => {
    const base = {
      rooms: [
        { roomId: 'start', difficulty: 1, position: { x: 0, y: 0, z: 0 } },
        { roomId: 'boss', difficulty: 3, position: { x: 10, y: 0, z: 0 } },
      ],
    };
    const web = {
      rooms: [
        { roomId: 'start', difficulty: 1, position: { x: 0, y: 0, z: 0 } },
        { roomId: 'boss', difficulty: 4, position: { x: 10, y: 0, z: 0 } },
      ],
    };

    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(web),
      unityDiff: [{ path: '$.rooms[roomId=start].position', value: { x: 1, y: 0, z: 0 } }],
    });

    expect(result.conflicts).toHaveLength(0);
    expect(JSON.parse(result.content).rooms).toEqual([
      { roomId: 'start', difficulty: 1, position: { x: 1, y: 0, z: 0 } },
      { roomId: 'boss', difficulty: 4, position: { x: 10, y: 0, z: 0 } },
    ]);
  });

  it('applies Unity stable-id selector paths without depending on array indices', () => {
    const base = {
      spawnPoints: [
        { id: 'start', name: 'Start Spawn', position: { x: 0, y: 0, z: 0 } },
        { id: 'checkpoint', name: 'Checkpoint Spawn', position: { x: 4, y: 1, z: 0 } },
      ],
    };

    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(base),
      unityDiff: [{ path: '$.spawnPoints[id=checkpoint].position', value: { x: 8, y: 2, z: 0 } }],
    });

    const merged = JSON.parse(result.content);
    expect(result.conflicts).toHaveLength(0);
    expect(merged.spawnPoints).toEqual([
      { id: 'start', name: 'Start Spawn', position: { x: 0, y: 0, z: 0 } },
      { id: 'checkpoint', name: 'Checkpoint Spawn', position: { x: 8, y: 2, z: 0 } },
    ]);
  });

  it('applies Unity stable-name selector paths when ids are absent', () => {
    const base = {
      rooms: [
        { name: 'Entry Room', position: { x: 0, y: 0, z: 0 } },
        { name: 'Boss Door', position: { x: 5, y: 0, z: 0 } },
      ],
    };

    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(base),
      unityDiff: [{ path: '$.rooms[name=Boss Door].position', value: { x: 7, y: 1, z: 0 } }],
    });

    expect(result.conflicts).toHaveLength(0);
    expect(JSON.parse(result.content).rooms[1].position).toEqual({ x: 7, y: 1, z: 0 });
  });

  it('applies Unity game-domain selector paths without depending on array indices', () => {
    const base = {
      objectives: [
        { objectiveId: 'intro', label: 'Open the gate', position: { x: 0, y: 0, z: 0 } },
        { objectiveId: 'boss', label: 'Defeat the captain', position: { x: 12, y: 0, z: 0 } },
      ],
    };

    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(base),
      unityDiff: [{ path: '$.objectives[objectiveId=boss].position', value: { x: 16, y: 2, z: 0 } }],
    });

    expect(result.conflicts).toHaveLength(0);
    expect(JSON.parse(result.content).objectives[1].position).toEqual({ x: 16, y: 2, z: 0 });
  });

  it('applies compact engine array paths through stable ids', () => {
    const base = {
      actors: [
        { id: 'boss', health: 1, name: 'Gate Boss' },
        { id: 'minion', health: 1, name: 'Minion' },
      ],
    };

    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(base),
      unityDiff: [{ path: ['actors', 'boss', 'health'], value: 5 }],
    });

    const merged = JSON.parse(result.content);
    expect(result.conflicts).toHaveLength(0);
    expect(merged.actors).toEqual([
      { id: 'boss', health: 5, name: 'Gate Boss' },
      { id: 'minion', health: 1, name: 'Minion' },
    ]);
  });

  it('applies compact engine array paths through stable names', () => {
    const base = {
      rooms: [
        { name: 'Entry Room', difficulty: 1 },
        { name: 'Boss Door', difficulty: 3 },
      ],
    };

    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(base),
      unityDiff: [{ path: ['rooms', 'Boss Door', 'difficulty'], value: 5 }],
    });

    expect(result.conflicts).toHaveLength(0);
    expect(JSON.parse(result.content).rooms[1].difficulty).toBe(5);
  });

  it('detects same-field web and Unity conflicts', () => {
    const result = mergeRoundTripContent({
      baseContent: '{"boss":{"health":1}}',
      webContent: '{"boss":{"health":3}}',
      unityContent: '{"boss":{"health":2}}',
    });

    expect(result.conflicts).toEqual([
      expect.objectContaining({ path: '$.boss.health', webValue: 3, unityValue: 2 }),
    ]);
    expect(JSON.parse(result.content).boss.health).toBe(2);
  });

  it('detects same typed field conflicts inside stable-id arrays', () => {
    const base = { actors: [{ id: 'boss', health: 1, position: { x: 1, y: 2, z: 3 } }] };
    const web = { actors: [{ id: 'boss', health: 3, position: { x: 1, y: 2, z: 3 } }] };
    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(web),
      unityDiff: [{ path: ['actors', '0', 'health'], value: 2 }],
    });

    expect(result.conflicts).toEqual([
      expect.objectContaining({ path: '$.actors[id=boss].health', webValue: 3, unityValue: 2 }),
    ]);
    expect(JSON.parse(result.content).actors[0].health).toBe(2);
  });

  it('reports game-domain stable-key conflict paths', () => {
    const base = { rooms: [{ roomId: 'boss', difficulty: 3 }] };
    const web = { rooms: [{ roomId: 'boss', difficulty: 5 }] };
    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(web),
      unityDiff: [{ path: '$.rooms[roomId=boss].difficulty', value: 4 }],
    });

    expect(result.conflicts).toEqual([
      expect.objectContaining({ path: '$.rooms[roomId=boss].difficulty', webValue: 5, unityValue: 4 }),
    ]);
    expect(JSON.parse(result.content).rooms[0].difficulty).toBe(4);
  });

  it('falls back to index conflict paths for unsafe stable selector values', () => {
    const base = { actors: [{ id: 'boss]escape', health: 1 }] };
    const web = { actors: [{ id: 'boss]escape', health: 3 }] };
    const result = mergeRoundTripContent({
      baseContent: JSON.stringify(base),
      webContent: JSON.stringify(web),
      unityContent: JSON.stringify({ actors: [{ id: 'boss]escape', health: 2 }] }),
    });

    expect(result.conflicts).toEqual([
      expect.objectContaining({ path: '$.actors[0].health', webValue: 3, unityValue: 2 }),
    ]);
    expect(JSON.parse(result.content).actors[0].health).toBe(2);
  });

  it('merges independent JSON string edits without conflicts', () => {
    const result = mergeRoundTripContent({
      baseContent: JSON.stringify({ designNotes: 'Boss starts left.\nReward is 10 coins.\n' }),
      webContent: JSON.stringify({ designNotes: 'Boss starts near gate.\nReward is 10 coins.\n' }),
      unityContent: JSON.stringify({ designNotes: 'Boss starts left.\nReward is 20 coins.\n' }),
    });

    expect(result.strategy).toBe('json-three-way');
    expect(result.conflicts).toHaveLength(0);
    expect(JSON.parse(result.content).designNotes).toBe('Boss starts near gate.\nReward is 20 coins.\n');
  });

  it('rejects unsafe Unity diff paths', () => {
    expect(() => mergeRoundTripContent({
      baseContent: '{"boss":{"health":1}}',
      webContent: '{"boss":{"health":1}}',
      unityDiff: [{ path: '__proto__.polluted', value: true }],
    })).toThrow(/unsafe unityDiff path segment/);
  });

  it('rejects malformed Unity stable selector paths', () => {
    expect(() => mergeRoundTripContent({
      baseContent: '{"actors":[]}',
      webContent: '{"actors":[]}',
      unityDiff: [{ path: '$.actors[prototype=boss].position', value: { x: 1, y: 0, z: 0 } }],
    })).toThrow(/unsafe unityDiff path segment/);
  });

  it('rejects unsafe Unity stable selector values before applying diffs', () => {
    for (const selector of [
      'boss/escape',
      'boss\\escape',
      '../boss',
      'https://boss.example',
      'boss]escape',
    ]) {
      expect(() => mergeRoundTripContent({
        baseContent: '{"rooms":[]}',
        webContent: '{"rooms":[]}',
        unityDiff: [{ path: `$.rooms[roomId=${selector}].position`, value: { x: 1, y: 0, z: 0 } }],
      })).toThrow(/unsafe unityDiff path segment/);
    }
  });

  it('rejects excessive Unity diff entries before applying edit batches', () => {
    expect(() => mergeRoundTripContent({
      baseContent: '{"actors":[]}',
      webContent: '{"actors":[]}',
      unityDiff: Array.from({ length: 257 }, (_, index) => ({
        path: `actors.${index}.health`,
        value: index,
      })),
    })).toThrow(/too many unityDiff entries/);
  });

  it('rejects unsafe Unity diff values before applying direct merge payloads', () => {
    for (const value of [
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      'x'.repeat(4097),
      JSON.parse('{"__proto__":{"polluted":true}}'),
      JSON.parse('{"constructor":{"polluted":true}}'),
      JSON.parse('{"prototype":{"polluted":true}}'),
      JSON.parse('{"../escape":true}'),
      JSON.parse('{"phase.name":true}'),
      JSON.parse('{"phase[0]":true}'),
      JSON.parse('{"phase key":true}'),
      new Date('2026-05-24T00:00:00.000Z'),
    ]) {
      expect(() => mergeRoundTripContent({
        baseContent: '{"boss":{"health":1}}',
        webContent: '{"boss":{"health":1}}',
        unityDiff: [{ path: 'boss.metadata', value }],
      })).toThrow(/unsafe unityDiff value/);
    }
  });

  it('rejects unsafe JSON object keys inside round-trip artifact content', () => {
    for (const webContent of [
      '{"__proto__":{"polluted":true},"boss":{"health":1}}',
      '{"constructor":{"polluted":true},"boss":{"health":1}}',
      '{"prototype":{"polluted":true},"boss":{"health":1}}',
      '{"../escape":true,"boss":{"health":1}}',
      '{"phase.name":1,"boss":{"health":1}}',
      '{"phase[0]":1,"boss":{"health":1}}',
      '{"phase key":1,"boss":{"health":1}}',
    ]) {
      expect(() => mergeRoundTripContent({
        baseContent: '{"boss":{"health":1}}',
        webContent,
        unityContent: '{"boss":{"health":2}}',
      })).toThrow(/unsafe round-trip object key/);
    }
  });

  it('rejects unsafe artifact keys before early-returning equal JSON branches', () => {
    expect(() => mergeRoundTripContent({
      baseContent: '{"boss":{"health":1}}',
      webContent: '{"__proto__":{"polluted":true},"boss":{"health":1}}',
      unityContent: '{"__proto__":{"polluted":true},"boss":{"health":1}}',
    })).toThrow(/unsafe round-trip object key/);

    expect(() => mergeRoundTripContent({
      baseContent: '{"constructor":{"polluted":true},"boss":{"health":1}}',
      webContent: '{"constructor":{"polluted":true},"boss":{"health":1}}',
      unityContent: '{"boss":{"health":2}}',
    })).toThrow(/unsafe round-trip object key/);

    expect(() => mergeRoundTripContent({
      baseContent: '{"boss":{"phases":[{"health":1}]}}',
      webContent: '{"boss":{"phases":[{"__proto__":{"polluted":true},"health":1}]}}',
      unityContent: '{"boss":{"phases":[{"__proto__":{"polluted":true},"health":1}]}}',
    })).toThrow(/unsafe round-trip object key/);
  });

  it('rejects oversized JSON merge trees before early-returning equal JSON branches', () => {
    for (const webContent of [
      JSON.stringify({ boss: deepObject(34) }),
      JSON.stringify({ boss: wideObject(2049) }),
      JSON.stringify({ boss: Array.from({ length: 8193 }, (_, index) => index) }),
      JSON.stringify({ boss: { note: 'x'.repeat((1024 * 1024) + 1) } }),
      JSON.stringify({ ['a'.repeat(511)]: 1 }),
    ]) {
      expect(() => mergeRoundTripContent({
        baseContent: '{"boss":{"health":1}}',
        webContent,
        unityContent: webContent,
      })).toThrow(/unsafe round-trip/);
    }
  });

  it('rejects excessive JSON merge conflicts before returning payloads', () => {
    expect(() => mergeRoundTripContent({
      baseContent: JSON.stringify(conflictingObject(101, 0)),
      webContent: JSON.stringify(conflictingObject(101, 1)),
      unityContent: JSON.stringify(conflictingObject(101, 2)),
    })).toThrow(/too many round-trip merge conflicts/);
  });

  it('rejects oversized text merge payloads before returning conflict content', () => {
    const oversized = `# Design\n\n${'x'.repeat((1024 * 1024) + 1)}`;

    expect(() => mergeRoundTripContent({
      baseContent: '# Design\n\nReward is 10 coins.\n',
      webContent: oversized,
      unityContent: '# Design\n\nReward is 20 coins.\n',
    })).toThrow(/unsafe round-trip text length/);
  });

  it('falls back to text three-way merge for DESIGN.md content', () => {
    const result = mergeRoundTripContent({
      baseContent: '# Design\n',
      webContent: '# Design\n',
      unityContent: '# Design\n\nUnity note\n',
    });

    expect(result.strategy).toBe('text-three-way');
    expect(result.conflicts).toHaveLength(0);
    expect(result.content).toContain('Unity note');
  });

  it('merges independent DESIGN.md text edits without conflicts', () => {
    const result = mergeRoundTripContent({
      baseContent: '# Design\n\nBoss starts left.\nReward is 10 coins.\n',
      webContent: '# Design\n\nBoss starts near gate.\nReward is 10 coins.\n',
      unityContent: '# Design\n\nBoss starts left.\nReward is 20 coins.\n',
    });

    expect(result.strategy).toBe('text-three-way');
    expect(result.conflicts).toHaveLength(0);
    expect(result.content).toBe('# Design\n\nBoss starts near gate.\nReward is 20 coins.\n');
  });

  it('keeps overlapping DESIGN.md text edits as conflicts', () => {
    const result = mergeRoundTripContent({
      baseContent: '# Design\n\nReward is 10 coins.\n',
      webContent: '# Design\n\nReward is 15 coins.\n',
      unityContent: '# Design\n\nReward is 20 coins.\n',
    });

    expect(result.strategy).toBe('text-three-way');
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        path: '$',
        webValue: '# Design\n\nReward is 15 coins.\n',
        unityValue: '# Design\n\nReward is 20 coins.\n',
      }),
    ]);
    expect(result.content).toBe('# Design\n\nReward is 20 coins.\n');
  });
});
