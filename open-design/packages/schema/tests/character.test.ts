import { describe, expect, it } from 'vitest';

import {
  CharacterSchema,
  MIXAMO_STANDARD_JOINTS,
  findNonStandardJoints,
  type Character,
  type Rig,
} from '../src/character.js';

function makeCharacter(overrides: Partial<Character> = {}): unknown {
  return {
    id: 'char-1',
    name: 'Hero',
    meshRef: 'asset-mesh',
    rig: {
      joints: [
        { name: 'mixamorig:Hips', parent: null },
        { name: 'mixamorig:Spine', parent: 'mixamorig:Hips' },
      ],
    },
    animations: [
      { id: 'a-1', name: 'idle', clipRef: 'asset-clip', duration: 2, loop: true },
    ],
    gameStats: { hp: 100, speed: 5, damage: 10, defense: 2 },
    provenance: { license: 'CC-BY-4.0' },
    ...overrides,
  };
}

describe('Character', () => {
  it('accepts a character with Mixamo-standard joint names', () => {
    const parsed = CharacterSchema.parse(makeCharacter());
    expect(parsed.rig.joints.length).toBe(2);
    expect(parsed.rig.joints[0]?.name).toBe('mixamorig:Hips');
    expect(findNonStandardJoints(parsed.rig)).toEqual([]);
  });

  it('accepts a non-Mixamo joint but findNonStandardJoints flags it', () => {
    const parsed = CharacterSchema.parse(
      makeCharacter({
        rig: {
          joints: [
            { name: 'mixamorig:Hips', parent: null },
            { name: 'custom:Tail', parent: 'mixamorig:Hips' },
          ],
        } as Rig,
      }),
    );
    const nonStandard = findNonStandardJoints(parsed.rig);
    expect(nonStandard).toEqual(['custom:Tail']);
  });

  it('exports a list of standard joints including head, hands, feet', () => {
    expect(MIXAMO_STANDARD_JOINTS).toContain('mixamorig:Head');
    expect(MIXAMO_STANDARD_JOINTS).toContain('mixamorig:LeftHand');
    expect(MIXAMO_STANDARD_JOINTS).toContain('mixamorig:RightFoot');
  });

  it('rejects a rig with zero joints', () => {
    expect(() =>
      CharacterSchema.parse(
        makeCharacter({ rig: { joints: [] } as Rig }),
      ),
    ).toThrow();
  });

  it('rejects gameStats missing required keys (e.g. hp)', () => {
    expect(() =>
      CharacterSchema.parse(
        makeCharacter({
          gameStats: { speed: 5, damage: 10, defense: 2 } as never,
        }),
      ),
    ).toThrow();
  });

  it('accepts gameStats with extra (genre-specific) keys', () => {
    const parsed = CharacterSchema.parse(
      makeCharacter({
        gameStats: {
          hp: 100,
          speed: 5,
          damage: 10,
          defense: 2,
          critChance: 0.15,
          mana: 50,
        } as never,
      }),
    );
    expect(parsed.gameStats.critChance).toBe(0.15);
    expect(parsed.gameStats.mana).toBe(50);
  });

  it('rejects an animation clip with non-positive duration', () => {
    expect(() =>
      CharacterSchema.parse(
        makeCharacter({
          animations: [
            { id: 'a-1', name: 'broken', clipRef: 'asset-clip', duration: 0, loop: true },
          ] as never,
        }),
      ),
    ).toThrow();
  });

  it('rejects a rig joint with an empty name', () => {
    expect(() =>
      CharacterSchema.parse(
        makeCharacter({
          rig: {
            joints: [{ name: '', parent: null }],
          } as Rig,
        }),
      ),
    ).toThrow();
  });

  it('accepts a character with empty animations array', () => {
    const parsed = CharacterSchema.parse(
      makeCharacter({ animations: [] }),
    );
    expect(parsed.animations).toEqual([]);
  });

  it('preserves provenance fields when parsing', () => {
    const parsed = CharacterSchema.parse(
      makeCharacter({
        provenance: {
          genProvider: 'tripo3d',
          prompt: 'goblin',
          seed: 99,
          license: 'CC-BY-4.0',
        },
      }),
    );
    expect(parsed.provenance.genProvider).toBe('tripo3d');
    expect(parsed.provenance.seed).toBe(99);
  });
});
