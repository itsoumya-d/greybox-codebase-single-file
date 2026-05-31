// SPDX-License-Identifier: Apache-2.0
'use client';
/**
 * Tiny SVG mini-graph of screens + flow edges.
 *
 * We render this in-house instead of pulling in `reactflow` because:
 *  - We only need a read-mostly overview, not pan/zoom/animation.
 *  - Keeps the web app dep tree thin (the editor is already heavy).
 *  - Editing edges happens via a `+ Add edge` form so accessibility (keyboard)
 *    is straightforward without re-implementing it on top of canvas nodes.
 *
 * Layout: a deterministic grid based on `screens[]` order. Screens flow
 * left-to-right, wrapping every 3 nodes — good enough for the typical
 * 4-12 screen project.
 */
import { useState } from 'react';

import type { ScreenId } from '@greybox/schema';

import { useProjectEditor } from './ProjectContext.js';

const NODE_W = 96;
const NODE_H = 36;
const COL_GAP = 28;
const ROW_GAP = 24;
const COLS = 3;
const PADDING = 12;

interface NodePos {
  id: ScreenId;
  name: string;
  x: number;
  y: number;
}

function layoutNodes(screens: { id: ScreenId; name: string }[]): NodePos[] {
  return screens.map((s, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    return {
      id: s.id,
      name: s.name,
      x: PADDING + col * (NODE_W + COL_GAP),
      y: PADDING + row * (NODE_H + ROW_GAP),
    };
  });
}

export function FlowGraph() {
  const { state, dispatch } = useProjectEditor();
  const nodes = layoutNodes(
    state.project.screens.map((s) => ({ id: s.id, name: s.name })),
  );
  const indexById = new Map(nodes.map((n) => [n.id, n]));
  const rows = Math.max(1, Math.ceil(nodes.length / COLS));
  const width = PADDING * 2 + COLS * NODE_W + (COLS - 1) * COL_GAP;
  const height = PADDING * 2 + rows * NODE_H + (rows - 1) * ROW_GAP;

  const [edgeFrom, setEdgeFrom] = useState<ScreenId | ''>('');
  const [edgeTo, setEdgeTo] = useState<ScreenId | ''>('');

  return (
    <div data-testid='design-flow-graph' className='design-flow-graph'>
      <h3 className='design-h3'>Flow</h3>
      <svg
        className='design-flow-graph__svg'
        role='img'
        aria-label='Screen flow graph'
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {/* Edges */}
        {state.project.flow.map((edge) => {
          const from = indexById.get(edge.from);
          const to = indexById.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          return (
            <g key={edge.id} data-testid={`flow-edge-${edge.id}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke='currentColor'
                strokeOpacity={0.6}
                strokeWidth={1.5}
                markerEnd='url(#design-arrow)'
              />
            </g>
          );
        })}
        {/* Nodes */}
        {nodes.map((n) => {
          const selected = n.id === state.selectedScreenId;
          return (
            <g
              key={n.id}
              data-testid={`flow-node-${n.id}`}
              onClick={() => dispatch({ type: 'screen/select', screenId: n.id })}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                ry={6}
                fill={selected ? 'var(--accent-soft)' : 'var(--bg-panel)'}
                stroke={selected ? 'var(--accent)' : 'currentColor'}
                strokeOpacity={selected ? 1 : 0.4}
              />
              <text
                x={n.x + NODE_W / 2}
                y={n.y + NODE_H / 2 + 4}
                textAnchor='middle'
                fontSize={12}
                fill='currentColor'
              >
                {n.name.length > 14 ? `${n.name.slice(0, 13)}…` : n.name}
              </text>
            </g>
          );
        })}
        <defs>
          <marker
            id='design-arrow'
            viewBox='0 0 10 10'
            refX='8'
            refY='5'
            markerWidth='6'
            markerHeight='6'
            orient='auto-start-reverse'
          >
            <path d='M 0 0 L 10 5 L 0 10 z' fill='currentColor' />
          </marker>
        </defs>
      </svg>
      <form
        className='design-flow-graph__edge-form'
        onSubmit={(e) => {
          e.preventDefault();
          if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) return;
          dispatch({ type: 'flow/addEdge', from: edgeFrom, to: edgeTo });
          setEdgeFrom('');
          setEdgeTo('');
        }}
      >
        <label className='design-label'>
          From
          <select
            data-testid='flow-edge-from'
            value={edgeFrom}
            onChange={(e) => setEdgeFrom(e.target.value as ScreenId | '')}
          >
            <option value=''>—</option>
            {state.project.screens.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className='design-label'>
          To
          <select
            data-testid='flow-edge-to'
            value={edgeTo}
            onChange={(e) => setEdgeTo(e.target.value as ScreenId | '')}
          >
            <option value=''>—</option>
            {state.project.screens.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type='submit'
          className='design-btn'
          data-testid='flow-edge-add'
          disabled={!edgeFrom || !edgeTo || edgeFrom === edgeTo}
        >
          + Link
        </button>
      </form>
      {state.project.flow.length > 0 && (
        <ul className='design-flow-graph__edge-list'>
          {state.project.flow.map((edge) => (
            <li key={edge.id}>
              <span>
                {state.project.screens.find((s) => s.id === edge.from)?.name ?? edge.from}
                {' → '}
                {state.project.screens.find((s) => s.id === edge.to)?.name ?? edge.to}
              </span>
              <button
                type='button'
                className='design-btn design-btn--ghost'
                onClick={() => dispatch({ type: 'flow/deleteEdge', edgeId: edge.id })}
                aria-label={`Delete edge ${edge.id}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
