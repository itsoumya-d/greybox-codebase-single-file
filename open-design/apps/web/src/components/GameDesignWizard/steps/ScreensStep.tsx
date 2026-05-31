import { useCallback, useRef, useState } from 'react';
import type { Screen } from '@greybox/schema';
import { defaultScreensForGenre, type WizardFlow, type WizardScreen } from '../useWizardState';

const SCREEN_KINDS: Array<{ value: Screen['kind']; label: string }> = [
  { value: 'main-menu', label: 'Main Menu' },
  { value: 'gameplay', label: 'Gameplay' },
  { value: 'pause', label: 'Pause' },
  { value: 'game-over', label: 'Game Over' },
  { value: 'loading', label: 'Loading' },
  { value: 'settings', label: 'Settings' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'shop', label: 'Shop' },
  { value: 'credits', label: 'Credits' },
  { value: 'cutscene', label: 'Cutscene' },
  { value: 'custom', label: 'Custom' },
];

const NODE_W = 140;
const NODE_H = 56;

interface Props {
  screens: WizardScreen[];
  flows: WizardFlow[];
  genre: string;
  platform: string;
  generating: boolean;
  error: string | null;
  onSetScreens: (screens: WizardScreen[]) => void;
  onAddScreen: (screen: WizardScreen) => void;
  onRemoveScreen: (id: string) => void;
  onUpdateScreen: (id: string, patch: Partial<WizardScreen>) => void;
  onSetFlows: (flows: WizardFlow[]) => void;
  onAddFlow: (flow: WizardFlow) => void;
  onRemoveFlow: (fromId: string, toId: string) => void;
  onGenerate: () => void;
}

export function ScreensStep({
  screens,
  flows,
  genre,
  platform,
  generating,
  error,
  onSetScreens,
  onAddScreen,
  onRemoveScreen,
  onUpdateScreen,
  onSetFlows,
  onAddFlow,
  onRemoveFlow: _onRemoveFlow,
  onGenerate,
}: Props) {
  const [editingScreenId, setEditingScreenId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [drawFrom, setDrawFrom] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Calculate SVG bounding box
  const svgWidth = Math.max(600, ...screens.map((s) => s.x + NODE_W + 40));
  const svgHeight = Math.max(300, ...screens.map((s) => s.y + NODE_H + 40));

  function getNodeCenter(screen: WizardScreen) {
    return { x: screen.x + NODE_W / 2, y: screen.y + NODE_H / 2 };
  }

  function getEdgePoints(from: WizardScreen, to: WizardScreen) {
    const fc = getNodeCenter(from);
    const tc = getNodeCenter(to);
    return { x1: fc.x, y1: fc.y, x2: tc.x, y2: tc.y };
  }

  function handleNodeClick(screenId: string) {
    if (drawFrom === null) {
      setDrawFrom(screenId);
    } else if (drawFrom === screenId) {
      setDrawFrom(null);
    } else {
      // Add flow
      const exists = flows.some((f) => f.fromId === drawFrom && f.toId === screenId);
      if (!exists) {
        onAddFlow({ fromId: drawFrom, toId: screenId });
      }
      setDrawFrom(null);
    }
  }

  function handleNodeDrag(
    screenId: string,
    e: React.MouseEvent<SVGRectElement>,
  ) {
    e.preventDefault();
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const screen = screens.find((s) => s.id === screenId);
    if (!screen) return;
    const origX = screen.x;
    const origY = screen.y;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      // Re-query rect each move so resize/scroll doesn't cause drift.
      const currentRect = svgEl!.getBoundingClientRect();
      const scaleX = svgWidth / currentRect.width;
      const scaleY = svgHeight / currentRect.height;
      onUpdateScreen(screenId, {
        x: Math.max(0, origX + dx * scaleX),
        y: Math.max(0, origY + dy * scaleY),
      });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleAddScreen() {
    const count = screens.length;
    const newScreen: WizardScreen = {
      id: `screen-custom-${Date.now()}`,
      name: 'New Screen',
      kind: 'custom',
      x: (count % 3) * 180 + 40,
      y: Math.floor(count / 3) * 140 + 40,
      components: [],
    };
    onAddScreen(newScreen);
    setEditingScreenId(newScreen.id);
    setEditingName(newScreen.name);
  }

  function handleResetToDefaults() {
    const defaults = defaultScreensForGenre(genre, platform);
    onSetScreens(defaults);
    // Reset flows to a simple linear chain
    const newFlows: WizardFlow[] = defaults.slice(0, -1).map((s, i) => ({
      fromId: s.id,
      toId: defaults[i + 1]!.id,
    }));
    onSetFlows(newFlows);
  }

  function commitRename() {
    if (editingScreenId && editingName.trim()) {
      onUpdateScreen(editingScreenId, { name: editingName.trim() });
    }
    setEditingScreenId(null);
  }

  const startEditing = useCallback((screenId: string, name: string) => {
    setEditingScreenId(screenId);
    setEditingName(name);
  }, []);

  return (
    <div className="wizard-step screens-step">
      <div className="wizard-step-header">
        <h2 className="wizard-step-title">Design your screen flow</h2>
        <p className="wizard-step-hint">
          Visualize the screens in your game and how players navigate between them.
          Click a node to start drawing a connection, then click the target.
        </p>
      </div>

      <div className="wizard-step-body">
        <div className="screens-toolbar">
          <button
            type="button"
            className="wizard-btn-secondary"
            onClick={handleResetToDefaults}
            disabled={generating}
          >
            Reset to defaults
          </button>
          <button
            type="button"
            className="wizard-btn-secondary"
            onClick={handleAddScreen}
            disabled={generating}
          >
            + Add screen
          </button>
          <button
            type="button"
            className="primary wizard-generate-btn"
            onClick={onGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <span className="wizard-spinner" aria-hidden /> Generating screens...
              </>
            ) : (
              'AI Design Screens'
            )}
          </button>
          {drawFrom && (
            <span className="screens-draw-hint">
              Click a target screen to connect from <strong>{screens.find((s) => s.id === drawFrom)?.name}</strong>
              <button
                type="button"
                className="ghost"
                onClick={() => setDrawFrom(null)}
              >
                Cancel
              </button>
            </span>
          )}
        </div>

        {error && (
          <div className="wizard-error" role="alert">
            <span>{error}</span>
            <button type="button" className="wizard-error-retry" onClick={onGenerate}>
              Retry
            </button>
          </div>
        )}

        {screens.length === 0 ? (
          <div className="screens-empty">
            <p>No screens yet. Click "Reset to defaults" to get started with genre defaults, or add a screen manually.</p>
          </div>
        ) : (
          <div className="screens-graph-container">
            <svg
              ref={svgRef}
              className="screens-graph"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              width="100%"
              role="img"
              aria-label="Screen flow diagram"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="6"
                  refX="8"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="var(--text-3, #888)" />
                </marker>
              </defs>

              {/* Flow edges */}
              {flows.map((flow) => {
                const from = screens.find((s) => s.id === flow.fromId);
                const to = screens.find((s) => s.id === flow.toId);
                if (!from || !to) return null;
                const pts = getEdgePoints(from, to);
                return (
                  <line
                    key={`${flow.fromId}-${flow.toId}`}
                    x1={pts.x1}
                    y1={pts.y1}
                    x2={pts.x2}
                    y2={pts.y2}
                    stroke="var(--text-3, #888)"
                    strokeWidth="1.5"
                    markerEnd="url(#arrowhead)"
                    strokeDasharray="none"
                  />
                );
              })}

              {/* Screen nodes */}
              {screens.map((screen) => {
                const isSource = drawFrom === screen.id;
                return (
                  <g
                    key={screen.id}
                    transform={`translate(${screen.x}, ${screen.y})`}
                    role="button"
                    aria-label={screen.name}
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx="8"
                      className={`screen-node-rect${isSource ? ' screen-node-source' : ''}`}
                      onMouseDown={(e) => {
                        // Only start drag if not clicking for flow draw
                        if (!drawFrom) {
                          e.stopPropagation();
                          handleNodeDrag(screen.id, e);
                        }
                      }}
                      onClick={() => handleNodeClick(screen.id)}
                      cursor={drawFrom ? 'crosshair' : 'grab'}
                    />
                    <text
                      x={NODE_W / 2}
                      y={NODE_H / 2 - 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="screen-node-name"
                      pointerEvents="none"
                    >
                      {screen.name}
                    </text>
                    <text
                      x={NODE_W / 2}
                      y={NODE_H / 2 + 12}
                      textAnchor="middle"
                      className="screen-node-kind"
                      pointerEvents="none"
                    >
                      {screen.kind}
                    </text>
                    {/* Edit button */}
                    <g
                      transform={`translate(${NODE_W - 20}, 4)`}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(screen.id, screen.name);
                      }}
                      cursor="pointer"
                      aria-label={`Rename ${screen.name}`}
                    >
                      <rect width="16" height="16" rx="3" fill="transparent" />
                      <text x="8" y="12" textAnchor="middle" className="screen-node-edit-icon">
                        ✎
                      </text>
                    </g>
                    {/* Remove button */}
                    <g
                      transform={`translate(${NODE_W - 20}, 22)`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveScreen(screen.id);
                      }}
                      cursor="pointer"
                      aria-label={`Remove ${screen.name}`}
                    >
                      <rect width="16" height="16" rx="3" fill="transparent" />
                      <text x="8" y="12" textAnchor="middle" className="screen-node-delete-icon">
                        ×
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* Inline rename popover */}
        {editingScreenId && (
          <div className="screen-rename-overlay">
            <div className="screen-rename-popup">
              <label className="wizard-label">Rename screen</label>
              <input
                className="wizard-input"
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingScreenId(null);
                }}
              />
              <div className="screen-rename-actions">
                <label className="wizard-label" style={{ marginBottom: 4 }}>Screen kind</label>
                <select
                  className="wizard-select"
                  value={screens.find((s) => s.id === editingScreenId)?.kind ?? 'custom'}
                  onChange={(e) =>
                    onUpdateScreen(editingScreenId, { kind: e.target.value as Screen['kind'] })
                  }
                >
                  {SCREEN_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
                <div className="screen-rename-btns">
                  <button type="button" className="primary" onClick={commitRename}>
                    Save
                  </button>
                  <button type="button" className="ghost" onClick={() => setEditingScreenId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Screen list summary */}
        {screens.length > 0 && (
          <div className="screens-list-summary">
            <div className="wizard-label">{screens.length} screen{screens.length !== 1 ? 's' : ''}</div>
            <ul className="screens-summary-list">
              {screens.map((s) => (
                <li key={s.id} className="screens-summary-item">
                  <span className="screens-summary-name">{s.name}</span>
                  <span className="screens-summary-kind">{s.kind}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
