// SPDX-License-Identifier: Apache-2.0
/**
 * Sensible defaults for every {@link ComponentKind}.
 *
 * The editor calls this when the user drops a kind onto the canvas from the
 * palette. Each branch returns a value that passes the corresponding Zod
 * schema in `@greybox/schema` without further mutation, so the caller can
 * round-trip the new component through {@link validateGameProject}
 * immediately.
 *
 * Stub asset/character refs use `placeholder_*` strings — non-empty so the
 * branded id schemas accept them, and visibly bogus so reviewers spot them
 * before export.
 *
 * @packageDocumentation
 */
import type { Component, ComponentId, ComponentKind, Transform } from '@greybox/schema';
import {
  asAssetId,
  asCharacterId,
} from '@greybox/schema';

function transformAt(x: number, y: number): Transform {
  return {
    position: { x, y, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

/**
 * Build a default Component for the given kind, slotted at `position`.
 *
 * Throws on an unknown kind — callers should always pass a value drawn from
 * `COMPONENT_KINDS`.
 */
export function defaultComponentFor(
  kind: ComponentKind,
  id: ComponentId,
  position: { x: number; y: number },
): Component {
  const t = transformAt(position.x, position.y);
  switch (kind) {
    case 'Button':
      return {
        id,
        name: 'Button',
        kind: 'Button',
        transform: t,
        visible: true,
        label: 'Click me',
      };
    case 'Image':
      return {
        id,
        name: 'Image',
        kind: 'Image',
        transform: t,
        visible: true,
        assetRef: asAssetId('placeholder_image'),
      };
    case 'Text':
      return {
        id,
        name: 'Text',
        kind: 'Text',
        transform: t,
        visible: true,
        content: 'Lorem ipsum',
      };
    case 'TextInput':
      return {
        id,
        name: 'Text Input',
        kind: 'TextInput',
        transform: t,
        visible: true,
        inputType: 'text',
      };
    case 'ProgressBar':
      return {
        id,
        name: 'Progress',
        kind: 'ProgressBar',
        transform: t,
        visible: true,
        min: 0,
        max: 100,
        value: 50,
      };
    case 'HUDBar':
      return {
        id,
        name: 'HUD Bar',
        kind: 'HUDBar',
        transform: t,
        visible: true,
        statKey: 'hp',
        style: 'bar',
      };
    case 'MenuList':
      return {
        id,
        name: 'Menu',
        kind: 'MenuList',
        transform: t,
        visible: true,
        items: [{ id: 'start', label: 'Start' }],
      };
    case 'Container':
      return {
        id,
        name: 'Container',
        kind: 'Container',
        transform: t,
        visible: true,
        layout: 'absolute',
      };
    case 'Character3DRef':
      return {
        id,
        name: 'Character',
        kind: 'Character3DRef',
        transform: t,
        visible: true,
        characterRef: asCharacterId('placeholder_character'),
      };
    case 'GameObject':
      return {
        id,
        name: 'Game Object',
        kind: 'GameObject',
        transform: t,
        visible: true,
        prefabRef: asAssetId('placeholder_prefab'),
      };
    case 'Spawner':
      return {
        id,
        name: 'Spawner',
        kind: 'Spawner',
        transform: t,
        visible: true,
        prefabRef: asAssetId('placeholder_prefab'),
        intervalSeconds: 2,
      };
    case 'Trigger':
      return {
        id,
        name: 'Trigger',
        kind: 'Trigger',
        transform: t,
        visible: true,
        shape: 'box',
        eventId: 'on_trigger',
        oneShot: false,
      };
    case 'Pickup':
      return {
        id,
        name: 'Pickup',
        kind: 'Pickup',
        transform: t,
        visible: true,
        grantStat: 'score',
        amount: 1,
        respawn: false,
      };
    case 'Hazard':
      return {
        id,
        name: 'Hazard',
        kind: 'Hazard',
        transform: t,
        visible: true,
        damagePerSecond: 10,
        instakill: false,
      };
    case 'Checkpoint':
      return {
        id,
        name: 'Checkpoint',
        kind: 'Checkpoint',
        transform: t,
        visible: true,
        checkpointId: id,
        heals: true,
      };
    case 'Camera':
      return {
        id,
        name: 'Camera',
        kind: 'Camera',
        transform: t,
        visible: true,
        projection: 'perspective',
        isMain: false,
      };
    case 'Light':
      return {
        id,
        name: 'Light',
        kind: 'Light',
        transform: t,
        visible: true,
        lightType: 'point',
        color: '#ffffff',
        intensity: 1,
        castsShadows: true,
      };
    case 'Particle':
      return {
        id,
        name: 'Particle',
        kind: 'Particle',
        transform: t,
        visible: true,
        effectRef: asAssetId('placeholder_particle'),
        autoPlay: true,
        loop: true,
      };
    case 'AudioSource':
      return {
        id,
        name: 'Audio',
        kind: 'AudioSource',
        transform: t,
        visible: true,
        clipRef: asAssetId('placeholder_audio'),
        volume: 1,
        loop: false,
        spatial: true,
        autoPlay: false,
      };
    default: {
      // Exhaustive guard: TypeScript narrows `kind` to `never` here when the
      // ComponentKind union is exhausted. If a new kind lands in the schema
      // and this switch isn't updated, this line becomes a type error.
      const _exhaustive: never = kind;
      throw new Error(`Unhandled component kind: ${String(_exhaustive)}`);
    }
  }
}
