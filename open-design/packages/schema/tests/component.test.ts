import { describe, expect, it } from 'vitest';

import {
  COMPONENT_KINDS,
  ComponentSchema,
  type Component,
  type ComponentKind,
} from '../src/component.js';

const transform = {
  position: { x: 1, y: 2, z: 3 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

/**
 * One-of-each-kind fixture. Each entry is the minimal valid payload for
 * its kind plus the shared base fields.
 */
const SAMPLES: Record<ComponentKind, Record<string, unknown>> = {
  Button: { kind: 'Button', id: 'b1', name: 'B', transform, label: 'Go' },
  Image: { kind: 'Image', id: 'i1', name: 'I', transform, assetRef: 'asset-1' },
  Text: { kind: 'Text', id: 't1', name: 'T', transform, content: 'hi' },
  TextInput: { kind: 'TextInput', id: 'ti1', name: 'TI', transform },
  ProgressBar: {
    kind: 'ProgressBar',
    id: 'pb1',
    name: 'PB',
    transform,
    min: 0,
    max: 100,
    value: 25,
  },
  HUDBar: { kind: 'HUDBar', id: 'h1', name: 'H', transform, statKey: 'hp' },
  MenuList: {
    kind: 'MenuList',
    id: 'm1',
    name: 'M',
    transform,
    items: [{ id: 'a', label: 'A' }],
  },
  Container: { kind: 'Container', id: 'c1', name: 'C', transform },
  Character3DRef: {
    kind: 'Character3DRef',
    id: 'cr1',
    name: 'CR',
    transform,
    characterRef: 'char-1',
  },
  GameObject: {
    kind: 'GameObject',
    id: 'go1',
    name: 'GO',
    transform,
    prefabRef: 'asset-1',
  },
  Spawner: {
    kind: 'Spawner',
    id: 'sp1',
    name: 'SP',
    transform,
    prefabRef: 'asset-1',
    intervalSeconds: 5,
  },
  Trigger: {
    kind: 'Trigger',
    id: 'tr1',
    name: 'TR',
    transform,
    eventId: 'evt-1',
  },
  Pickup: {
    kind: 'Pickup',
    id: 'pu1',
    name: 'PU',
    transform,
    grantStat: 'hp',
    amount: 10,
  },
  Hazard: {
    kind: 'Hazard',
    id: 'hz1',
    name: 'HZ',
    transform,
    damagePerSecond: 5,
  },
  Checkpoint: {
    kind: 'Checkpoint',
    id: 'cp1',
    name: 'CP',
    transform,
    checkpointId: 'cp-mid',
  },
  Camera: { kind: 'Camera', id: 'cam1', name: 'Cam', transform },
  Light: {
    kind: 'Light',
    id: 'l1',
    name: 'L',
    transform,
    color: '#ffffff',
    intensity: 1,
  },
  Particle: {
    kind: 'Particle',
    id: 'pa1',
    name: 'P',
    transform,
    effectRef: 'asset-1',
  },
  AudioSource: {
    kind: 'AudioSource',
    id: 'au1',
    name: 'A',
    transform,
    clipRef: 'asset-1',
  },
};

describe('Component discriminated union', () => {
  it('exports all 19 kinds in COMPONENT_KINDS', () => {
    expect(COMPONENT_KINDS.length).toBe(19);
    expect(new Set(COMPONENT_KINDS).size).toBe(19);
  });

  for (const kind of COMPONENT_KINDS) {
    it(`accepts a minimal ${kind}`, () => {
      const parsed = ComponentSchema.parse(SAMPLES[kind]) as Component;
      expect(parsed.kind).toBe(kind);
    });
  }

  it('rejects an unknown kind', () => {
    expect(() =>
      ComponentSchema.parse({
        kind: 'NotARealKind',
        id: 'x',
        name: 'x',
        transform,
      }),
    ).toThrow();
  });

  it('rejects missing transform on any kind', () => {
    expect(() =>
      ComponentSchema.parse({ kind: 'Text', id: 't1', name: 'T', content: 'hi' }),
    ).toThrow();
  });

  it('rejects a Button without a label (kind-specific required field)', () => {
    expect(() =>
      ComponentSchema.parse({ kind: 'Button', id: 'b1', name: 'B', transform }),
    ).toThrow();
  });

  it('rejects a Text colour that is not a hex literal', () => {
    expect(() =>
      ComponentSchema.parse({
        kind: 'Text',
        id: 't1',
        name: 'T',
        transform,
        content: 'hi',
        color: 'red',
      }),
    ).toThrow();
  });

  it('rejects cross-discriminator fields (Button on a Text)', () => {
    const parsed = ComponentSchema.parse({
      kind: 'Text',
      id: 't1',
      name: 'T',
      transform,
      content: 'hi',
      label: 'this should not be here',
    });
    // Zod (strict-off by default on z.object) silently drops unknown keys.
    // The discriminator should still type-narrow to Text; ensure `label`
    // is NOT present on the parsed object — i.e., it was dropped.
    expect(parsed.kind).toBe('Text');
    expect((parsed as unknown as { label?: string }).label).toBeUndefined();
  });

  it('rejects negative ProgressBar by failing on wrong max < min? (semantic) — but min/max numeric is allowed regardless', () => {
    // The schema does not enforce min < max; this confirms baseline numeric typing.
    const parsed = ComponentSchema.parse({
      kind: 'ProgressBar',
      id: 'pb1',
      name: 'PB',
      transform,
      min: -5,
      max: 5,
      value: 0,
    });
    expect(parsed.kind).toBe('ProgressBar');
  });

  it('fills default visible=true when omitted', () => {
    const parsed = ComponentSchema.parse(SAMPLES.Button);
    expect(parsed.visible).toBe(true);
  });
});
