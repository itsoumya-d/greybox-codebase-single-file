// SPDX-License-Identifier: Apache-2.0
/**
 * Declarative field metadata for the property inspector.
 *
 * For each {@link ComponentKind} we list the editable fields. The inspector
 * iterates this list, picks an input control based on `kind`, and dispatches
 * `component/update` actions with the new value. Keeping field metadata
 * out of the inspector component itself makes new kinds trivial to add and
 * keeps the inspector body free of `switch` statements.
 *
 * @packageDocumentation
 */
import type { ComponentKind } from '@greybox/schema';

export type FieldKind = 'string' | 'number' | 'boolean' | 'color' | 'enum' | 'text';

export interface FieldSpec {
  /** Key on the Component object. */
  key: string;
  /** Label shown in the inspector. */
  label: string;
  /** Renderer hint. */
  kind: FieldKind;
  /** Allowed values when `kind === 'enum'`. */
  options?: readonly string[];
  /** Optional help text. */
  hint?: string;
}

/**
 * Mapping from component kind to its editable fields.
 *
 * The `transform` and `parent`/`visible` fields are inspected by a separate
 * "common" panel, so we only list kind-specific fields here.
 */
export const COMPONENT_FIELDS: Record<ComponentKind, readonly FieldSpec[]> = {
  Button: [
    { key: 'label', label: 'Label', kind: 'string' },
    { key: 'onClickEvent', label: 'On-click event id', kind: 'string', hint: 'Used by FlowEdge.trigger.scriptEvent' },
  ],
  Image: [
    { key: 'assetRef', label: 'Image asset id', kind: 'string' },
    { key: 'altText', label: 'Alt text', kind: 'string' },
  ],
  Text: [
    { key: 'content', label: 'Text', kind: 'text' },
    { key: 'font', label: 'Font family', kind: 'string' },
    { key: 'fontSize', label: 'Font size', kind: 'number' },
    { key: 'color', label: 'Color', kind: 'color' },
  ],
  TextInput: [
    { key: 'placeholder', label: 'Placeholder', kind: 'string' },
    { key: 'maxLength', label: 'Max length', kind: 'number' },
    {
      key: 'inputType',
      label: 'Type',
      kind: 'enum',
      options: ['text', 'password', 'email', 'number'] as const,
    },
  ],
  ProgressBar: [
    { key: 'min', label: 'Min', kind: 'number' },
    { key: 'max', label: 'Max', kind: 'number' },
    { key: 'value', label: 'Value', kind: 'number' },
  ],
  HUDBar: [
    { key: 'statKey', label: 'Stat key', kind: 'string' },
    {
      key: 'style',
      label: 'Style',
      kind: 'enum',
      options: ['bar', 'radial', 'segmented'] as const,
    },
  ],
  MenuList: [],
  Container: [
    {
      key: 'layout',
      label: 'Layout',
      kind: 'enum',
      options: ['stack-vertical', 'stack-horizontal', 'grid', 'absolute'] as const,
    },
    { key: 'gap', label: 'Gap (px)', kind: 'number' },
  ],
  Character3DRef: [
    { key: 'characterRef', label: 'Character id', kind: 'string' },
    { key: 'initialAnimation', label: 'Initial animation', kind: 'string' },
  ],
  GameObject: [{ key: 'prefabRef', label: 'Prefab id', kind: 'string' }],
  Spawner: [
    { key: 'prefabRef', label: 'Prefab id', kind: 'string' },
    { key: 'intervalSeconds', label: 'Interval (s)', kind: 'number' },
    { key: 'maxAlive', label: 'Max alive', kind: 'number' },
  ],
  Trigger: [
    {
      key: 'shape',
      label: 'Shape',
      kind: 'enum',
      options: ['box', 'sphere', 'capsule'] as const,
    },
    { key: 'eventId', label: 'Event id', kind: 'string' },
    { key: 'oneShot', label: 'One-shot', kind: 'boolean' },
  ],
  Pickup: [
    { key: 'grantStat', label: 'Grant stat', kind: 'string' },
    { key: 'amount', label: 'Amount', kind: 'number' },
    { key: 'respawn', label: 'Respawn', kind: 'boolean' },
    { key: 'respawnSeconds', label: 'Respawn seconds', kind: 'number' },
  ],
  Hazard: [
    { key: 'damagePerSecond', label: 'Damage per second', kind: 'number' },
    { key: 'instakill', label: 'Instakill', kind: 'boolean' },
  ],
  Checkpoint: [
    { key: 'checkpointId', label: 'Checkpoint id', kind: 'string' },
    { key: 'heals', label: 'Heals', kind: 'boolean' },
  ],
  Camera: [
    {
      key: 'projection',
      label: 'Projection',
      kind: 'enum',
      options: ['perspective', 'orthographic'] as const,
    },
    { key: 'fov', label: 'Field of view', kind: 'number' },
    { key: 'isMain', label: 'Is main', kind: 'boolean' },
  ],
  Light: [
    {
      key: 'lightType',
      label: 'Light type',
      kind: 'enum',
      options: ['directional', 'point', 'spot', 'area'] as const,
    },
    { key: 'color', label: 'Color', kind: 'color' },
    { key: 'intensity', label: 'Intensity', kind: 'number' },
    { key: 'castsShadows', label: 'Casts shadows', kind: 'boolean' },
  ],
  Particle: [
    { key: 'effectRef', label: 'Effect asset id', kind: 'string' },
    { key: 'autoPlay', label: 'Auto play', kind: 'boolean' },
    { key: 'loop', label: 'Loop', kind: 'boolean' },
  ],
  AudioSource: [
    { key: 'clipRef', label: 'Clip asset id', kind: 'string' },
    { key: 'volume', label: 'Volume', kind: 'number' },
    { key: 'loop', label: 'Loop', kind: 'boolean' },
    { key: 'spatial', label: 'Spatial', kind: 'boolean' },
    { key: 'autoPlay', label: 'Auto play', kind: 'boolean' },
  ],
};

/**
 * Which kinds are "fully" editable in the inspector right now.
 *
 * `MenuList.items` is a nested array we haven't wired a rich editor for
 * yet, so users can add a MenuList from the palette but the panel will
 * surface a "future work" note. This list keeps tests honest about coverage.
 */
export const FULL_INSPECTOR_KINDS: readonly ComponentKind[] = [
  'Button',
  'Image',
  'Text',
  'TextInput',
  'ProgressBar',
  'HUDBar',
  'Container',
  'Character3DRef',
  'GameObject',
  'Spawner',
  'Trigger',
  'Pickup',
  'Hazard',
  'Checkpoint',
  'Camera',
  'Light',
  'Particle',
  'AudioSource',
];

/** Kinds whose inspector is a stub awaiting Stream 2 / future work. */
export const PARTIAL_INSPECTOR_KINDS: readonly ComponentKind[] = ['MenuList'];
