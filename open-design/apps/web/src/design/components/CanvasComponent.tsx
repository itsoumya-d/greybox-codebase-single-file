// SPDX-License-Identifier: Apache-2.0
'use client';
/**
 * A single positioned + draggable component box on the canvas.
 *
 * - Selection on pointer-down (before drag) so a click also selects.
 * - Drag uses pointer-move/up listeners on `window` so the box keeps tracking
 *   when the cursor strays outside the box bounds.
 * - Final position is committed once on pointer-up — we don't dispatch on every
 *   pointer-move because that'd flood the reducer and the debounced REST PUT.
 */
import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import type { Component, ScreenId } from '@greybox/schema';

import { useProjectEditor } from './ProjectContext.js';

interface CanvasComponentProps {
  component: Component;
  screenId: ScreenId;
  selected: boolean;
}

/** Compact 2-line summary inside the box for kinds the canvas can't visualise yet. */
function summaryFor(c: Component): string {
  switch (c.kind) {
    case 'Button':
      return c.label;
    case 'Text':
      return c.content;
    case 'Image':
      return `image: ${c.assetRef}`;
    case 'HUDBar':
      return `hud: ${c.statKey}`;
    case 'TextInput':
      return c.placeholder ?? '(text input)';
    case 'ProgressBar':
      return `${c.value} / ${c.max}`;
    case 'Character3DRef':
      return `3D: ${c.characterRef}`;
    case 'MenuList':
      return `${c.items.length} item${c.items.length === 1 ? '' : 's'}`;
    case 'Container':
      return c.layout;
    case 'Light':
      return `light: ${c.lightType}`;
    case 'Camera':
      return c.projection;
    default:
      return c.kind;
  }
}

export function CanvasComponent({ component, screenId, selected }: CanvasComponentProps) {
  const { dispatch } = useProjectEditor();
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [overrideXY, setOverrideXY] = useState<{ x: number; y: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const x = overrideXY?.x ?? component.transform.position.x;
  const y = overrideXY?.y ?? component.transform.position.y;

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    dispatch({ type: 'component/select', componentId: component.id });

    startRef.current = { x: e.clientX, y: e.clientY };
    setDragOffset({ x: component.transform.position.x, y: component.transform.position.y });

    function onMove(ev: PointerEvent) {
      if (!startRef.current) return;
      const dx = ev.clientX - startRef.current.x;
      const dy = ev.clientY - startRef.current.y;
      setOverrideXY((prev) => ({
        x: (dragOffset?.x ?? component.transform.position.x) + dx - (prev ? 0 : 0),
        y: (dragOffset?.y ?? component.transform.position.y) + dy - (prev ? 0 : 0),
      }));
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!startRef.current) return;
      const dx = ev.clientX - startRef.current.x;
      const dy = ev.clientY - startRef.current.y;
      const newX = (dragOffset?.x ?? component.transform.position.x) + dx;
      const newY = (dragOffset?.y ?? component.transform.position.y) + dy;
      startRef.current = null;
      setOverrideXY(null);
      setDragOffset(null);
      if (dx === 0 && dy === 0) return;
      dispatch({
        type: 'component/update',
        screenId,
        componentId: component.id,
        patch: {
          transform: {
            ...component.transform,
            position: { ...component.transform.position, x: newX, y: newY },
          },
        },
      });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const style: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    minWidth: 120,
    maxWidth: 220,
    padding: '6px 10px',
    border: selected ? '2px solid var(--accent)' : '1px solid currentColor',
    borderRadius: 6,
    background: 'var(--bg-panel)',
    cursor: 'grab',
    userSelect: 'none',
    fontSize: 12,
  };

  return (
    <div
      data-testid={`canvas-component-${component.id}`}
      data-component-kind={component.kind}
      style={style}
      onPointerDown={onPointerDown}
    >
      <div className='design-canvas__comp-kind'>{component.kind}</div>
      <div className='design-canvas__comp-summary'>{summaryFor(component)}</div>
    </div>
  );
}
