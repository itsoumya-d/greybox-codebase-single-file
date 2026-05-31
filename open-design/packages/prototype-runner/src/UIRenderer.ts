/**
 * UIRenderer: renders the UI-family components (`Button`, `Image`, `Text`,
 * `TextInput`, `ProgressBar`, `HUDBar`, `MenuList`, `Container`) onto a
 * Babylon.GUI {@link AdvancedDynamicTexture}.
 *
 * Pure rendering only — click wiring is the FlowDispatcher's job. We
 * expose `onButtonClick` callbacks so the SceneBuilder can hook them up.
 *
 * @packageDocumentation
 */

import {
  AdvancedDynamicTexture,
  Button as GuiButton,
  Control,
  Image as GuiImage,
  InputText,
  Rectangle,
  StackPanel,
  TextBlock,
} from '@babylonjs/gui';

import type { Scene } from '@babylonjs/core';
import type {
  ButtonComponent,
  Component,
  ContainerComponent,
  HUDBarComponent,
  ImageComponent,
  MenuListComponent,
  ProgressBarComponent,
  TextComponent,
  TextInputComponent,
} from '@greybox/schema';

import type { AssetLoader } from './AssetLoader.js';

/** Listener invoked when a Button-component's GUI control is clicked. */
export type ButtonClickHandler = (componentId: string, button: ButtonComponent) => void;

/** Listener invoked when a MenuList item is selected. */
export type MenuItemClickHandler = (
  componentId: string,
  itemId: string,
  event: string | undefined,
) => void;

/**
 * Per-component rendered GUI node. Used by SceneBuilder for click wiring
 * and disposal.
 */
export interface RenderedGuiNode {
  componentId: string;
  control: Control;
}

export interface UIRendererOptions {
  /** Asset loader used to resolve Image / icon URIs. */
  assetLoader: AssetLoader;
  /** Click handler invoked when a Button control fires. */
  onButtonClick?: ButtonClickHandler;
  /** Menu-item click handler. */
  onMenuItemClick?: MenuItemClickHandler;
}

/**
 * Build a fullscreen UI overlay and render the given UI components.
 *
 * Returns the AdvancedDynamicTexture (so the caller can dispose it later)
 * and a `nodes` map keyed by component id for downstream lookup.
 */
export function renderUI(
  scene: Scene,
  components: readonly Component[],
  options: UIRendererOptions,
): { texture: AdvancedDynamicTexture; nodes: Map<string, Control> } {
  const texture = AdvancedDynamicTexture.CreateFullscreenUI(
    'prototype-ui',
    true,
    scene,
  );
  const nodes = new Map<string, Control>();

  // Two-pass build: first build all controls into the nodes map, then
  // attach parents. This sidesteps ordering concerns when children appear
  // in the components list before their containers.
  const uiComponents = components.filter(isUIKind);
  for (const c of uiComponents) {
    const control = buildControl(c, options);
    if (!control) continue;
    nodes.set(c.id, control);
  }

  for (const c of uiComponents) {
    const node = nodes.get(c.id);
    if (!node) continue;
    const parentId = (c as { parent?: string | null }).parent ?? null;
    if (parentId && nodes.has(parentId)) {
      const parent = nodes.get(parentId);
      if (parent instanceof Rectangle || parent instanceof StackPanel) {
        parent.addControl(node);
        continue;
      }
    }
    texture.addControl(node);
  }

  return { texture, nodes };
}

function isUIKind(c: Component): boolean {
  switch (c.kind) {
    case 'Button':
    case 'Image':
    case 'Text':
    case 'TextInput':
    case 'ProgressBar':
    case 'HUDBar':
    case 'MenuList':
    case 'Container':
      return true;
    default:
      return false;
  }
}

function buildControl(
  c: Component,
  options: UIRendererOptions,
): Control | null {
  switch (c.kind) {
    case 'Button':
      return buildButton(c, options);
    case 'Image':
      return buildImage(c, options);
    case 'Text':
      return buildText(c);
    case 'TextInput':
      return buildTextInput(c);
    case 'ProgressBar':
      return buildProgressBar(c);
    case 'HUDBar':
      return buildHUDBar(c);
    case 'MenuList':
      return buildMenuList(c, options);
    case 'Container':
      return buildContainer(c);
    default:
      return null;
  }
}

function applyBaseGeometry(control: Control, c: Component): void {
  const t = c.transform;
  // Schema transforms are 3D world; for UI we map XY position to pixel offsets
  // and scale to width/height multipliers. We treat 1 unit ~= 64 px.
  control.left = `${t.position.x * 64}px`;
  control.top = `${-t.position.y * 64}px`;
  if (control instanceof Rectangle || control instanceof GuiImage) {
    const w = Math.max(t.scale.x, 0.01);
    const h = Math.max(t.scale.y, 0.01);
    control.width = `${w * 128}px`;
    control.height = `${h * 64}px`;
  }
  control.isVisible = c.visible ?? true;
  control.name = c.name;
}

function buildButton(c: ButtonComponent, options: UIRendererOptions): GuiButton {
  const btn = GuiButton.CreateSimpleButton(`btn-${c.id}`, c.label);
  btn.width = `${Math.max(c.transform.scale.x, 0.5) * 160}px`;
  btn.height = `${Math.max(c.transform.scale.y, 0.5) * 48}px`;
  btn.color = '#ffffff';
  btn.background = '#3b82f6';
  btn.cornerRadius = 8;
  btn.thickness = 0;
  btn.fontSize = 16;
  btn.onPointerClickObservable.add(() => {
    options.onButtonClick?.(c.id, c);
  });
  applyBaseGeometry(btn, c);
  return btn;
}

function buildImage(
  c: ImageComponent,
  options: UIRendererOptions,
): GuiImage {
  const loaded = options.assetLoader.get(c.assetRef);
  const src = loaded ? loaded.objectUrl : options.assetLoader.resolveUrl(`${c.assetRef}`);
  const img = new GuiImage(`img-${c.id}`, src);
  img.stretch = GuiImage.STRETCH_UNIFORM;
  applyBaseGeometry(img, c);
  return img;
}

function buildText(c: TextComponent): TextBlock {
  const tb = new TextBlock(`txt-${c.id}`, c.content);
  tb.color = c.color ?? '#ffffff';
  tb.fontSize = c.fontSize ?? 18;
  if (c.font) tb.fontFamily = c.font;
  tb.resizeToFit = true;
  tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  tb.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  applyBaseGeometry(tb, c);
  return tb;
}

function buildTextInput(c: TextInputComponent): InputText {
  const ti = new InputText(`input-${c.id}`);
  ti.placeholderText = c.placeholder ?? '';
  ti.width = `${Math.max(c.transform.scale.x, 1) * 200}px`;
  ti.height = '36px';
  ti.color = '#ffffff';
  ti.background = '#111827';
  ti.thickness = 1;
  if (typeof c.maxLength === 'number') ti.maxWidth = `${c.maxLength * 12}px`;
  applyBaseGeometry(ti, c);
  return ti;
}

function buildProgressBar(c: ProgressBarComponent): Rectangle {
  const root = new Rectangle(`pbar-${c.id}`);
  root.width = '300px';
  root.height = '24px';
  root.color = '#ffffff';
  root.background = '#1f2937';
  root.cornerRadius = 6;
  root.thickness = 1;

  const range = Math.max(c.max - c.min, 1);
  const ratio = Math.min(Math.max((c.value - c.min) / range, 0), 1);
  const fill = new Rectangle(`pbar-fill-${c.id}`);
  fill.width = `${ratio * 100}%`;
  fill.height = '100%';
  fill.background = '#22c55e';
  fill.thickness = 0;
  fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  root.addControl(fill);
  applyBaseGeometry(root, c);
  return root;
}

function buildHUDBar(c: HUDBarComponent): Rectangle {
  const root = new Rectangle(`hud-${c.id}`);
  root.width = '200px';
  root.height = '18px';
  root.color = '#000000';
  root.background = '#1f2937';
  root.thickness = 1;
  root.cornerRadius = 4;

  const fill = new Rectangle(`hud-fill-${c.id}`);
  fill.width = '100%';
  fill.height = '100%';
  fill.background = c.statKey === 'hp' ? '#ef4444' : '#3b82f6';
  fill.thickness = 0;
  fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  root.addControl(fill);
  applyBaseGeometry(root, c);
  return root;
}

function buildMenuList(
  c: MenuListComponent,
  options: UIRendererOptions,
): StackPanel {
  const sp = new StackPanel(`menu-${c.id}`);
  sp.isVertical = true;
  sp.spacing = 8;
  sp.width = '240px';
  for (const item of c.items) {
    const itemBtn = GuiButton.CreateSimpleButton(`menu-${c.id}-${item.id}`, item.label);
    itemBtn.height = '40px';
    itemBtn.color = '#ffffff';
    itemBtn.background = '#1f2937';
    itemBtn.cornerRadius = 6;
    itemBtn.thickness = 0;
    itemBtn.onPointerClickObservable.add(() => {
      options.onMenuItemClick?.(c.id, item.id, item.event);
    });
    sp.addControl(itemBtn);
  }
  applyBaseGeometry(sp, c);
  return sp;
}

function buildContainer(c: ContainerComponent): Rectangle {
  const r = new Rectangle(`container-${c.id}`);
  r.thickness = 0;
  r.background = 'transparent';
  if (c.layout === 'stack-vertical' || c.layout === 'stack-horizontal') {
    r.width = '100%';
    r.height = '100%';
  }
  applyBaseGeometry(r, c);
  return r;
}
