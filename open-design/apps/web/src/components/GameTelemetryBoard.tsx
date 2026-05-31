import { useEffect, useState } from 'react';
import type {
  GameAutonomousIterationResponse,
  GameBalanceLoopAdjustment,
  GameBalanceLoopAdjustmentDecision,
  GameBalanceLoopAdjustmentDecisionResponse,
  GameBalanceLoopResponse,
  GamePlaytestPersonaId,
  GamePlaytestPreset,
  GamePlaytestPresetsResponse,
  GamePlaytestPersonaReport,
  GamePlaytestSimulationMode,
  GamePlaytestSimulationResponse,
  GameTelemetryInsightsResponse,
} from '@ai-game-design-studio/contracts';

import { useT } from '../i18n';

interface GameTelemetryBoardProps {
  projectId: string;
  visible: boolean;
}

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: GameTelemetryInsightsResponse }
  | { status: 'error'; message: string };

type PersonaLabState =
  | { status: 'idle' | 'running' }
  | { status: 'ready'; data: GamePlaytestSimulationResponse }
  | { status: 'error'; message: string };

type IterationHandoffState =
  | { status: 'idle' | 'running' }
  | { status: 'ready'; data: GameAutonomousIterationResponse }
  | { status: 'error'; message: string };

type BalanceHandoffState =
  | { status: 'idle' | 'running' }
  | { status: 'ready'; data: GameBalanceLoopResponse }
  | { status: 'error'; message: string };

type BalanceDecisionState = Record<string, {
  message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'error';
}>;

const PERSONA_OPTIONS: Array<{ id: GamePlaytestPersonaId; label: string; note: string }> = [
  { id: 'speedrunner', label: 'Speedrunner', note: 'route clarity' },
  { id: 'completionist', label: 'Completionist', note: 'optional rewards' },
  { id: 'casual', label: 'Casual Player', note: 'onboarding friction' },
  { id: 'explorer', label: 'Explorer', note: 'world curiosity' },
  { id: 'rage-quitter', label: 'Rage-Quit Risk', note: 'failure spikes' },
];

const PLAYTEST_MODE_OPTIONS: Array<{ id: GamePlaytestSimulationMode; label: string; note: string; path: string }> = [
  { id: 'viewport-artifact', label: 'Scene Simulation', note: '.gameview systems', path: 'playtest-simulation' },
  { id: 'playable-artifact', label: 'Playable Runtime', note: 'HTML loop scan', path: 'runtime-playtest' },
  { id: 'headless-browser', label: 'Browser Bot', note: 'executes controls', path: 'runtime-playtest/browser' },
];

const PERSONA_PLAYTEST_PRESET_STORAGE_PREFIX = 'agds:persona-playtest-presets:';

function getPlaytestModeOption(mode: GamePlaytestSimulationMode) {
  return PLAYTEST_MODE_OPTIONS.find((option) => option.id === mode) ?? PLAYTEST_MODE_OPTIONS[0]!;
}

function personaPlaytestPresetStorageKey(projectId: string) {
  return `${PERSONA_PLAYTEST_PRESET_STORAGE_PREFIX}${projectId}`;
}

function isPlaytestMode(value: unknown): value is GamePlaytestSimulationMode {
  return typeof value === 'string' && PLAYTEST_MODE_OPTIONS.some((option) => option.id === value);
}

function readPersonaPlaytestPresets(projectId: string): GamePlaytestPreset[] {
  try {
    const raw = window.localStorage.getItem(personaPlaytestPresetStorageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): GamePlaytestPreset[] => {
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      const personas = Array.isArray(record.personas)
        ? record.personas.filter((persona): persona is GamePlaytestPersonaId => typeof persona === 'string')
        : [];
      if (
        typeof record.id !== 'string'
        || typeof record.name !== 'string'
        || !isPlaytestMode(record.mode)
        || personas.length === 0
      ) {
        return [];
      }
      return [{
        id: record.id,
        name: record.name.slice(0, 48),
        mode: record.mode,
        fileName: typeof record.fileName === 'string'
          ? record.fileName.slice(0, 240)
          : (typeof record.targetFileName === 'string' ? record.targetFileName.slice(0, 240) : undefined),
        focus: typeof record.focus === 'string' ? record.focus.slice(0, 64) : 'combat',
        runs: typeof record.runs === 'number' ? Math.max(1, Math.min(20, Math.trunc(record.runs))) : 5,
        personas: personas.slice(0, 8),
        updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
      }];
    });
  } catch {
    return [];
  }
}

function writePersonaPlaytestPresets(projectId: string, presets: GamePlaytestPreset[]) {
  try {
    window.localStorage.setItem(personaPlaytestPresetStorageKey(projectId), JSON.stringify(presets));
  } catch {
    // Presets are a convenience only; hardened storage should not block playtesting.
  }
}

export function GameTelemetryBoard({ projectId, visible }: GameTelemetryBoardProps) {
  const t = useT();
  const [state, setState] = useState<LoadState>({ status: visible ? 'loading' : 'idle' });
  const [selectedPersonas, setSelectedPersonas] = useState<GamePlaytestPersonaId[]>(['casual', 'explorer']);
  const [playtestMode, setPlaytestMode] = useState<GamePlaytestSimulationMode>('viewport-artifact');
  const [targetFileName, setTargetFileName] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<GamePlaytestPreset[]>([]);
  const [personaLabState, setPersonaLabState] = useState<PersonaLabState>({ status: 'idle' });
  const [iterationHandoffState, setIterationHandoffState] = useState<IterationHandoffState>({ status: 'idle' });
  const [balanceHandoffState, setBalanceHandoffState] = useState<BalanceHandoffState>({ status: 'idle' });
  const [balanceDecisionState, setBalanceDecisionState] = useState<BalanceDecisionState>({});

  useEffect(() => {
    if (!visible) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    void (async () => {
      try {
        const response = await fetch(
          `/api/game-deliverables/${encodeURIComponent(projectId)}/game-telemetry/insights?limit=500`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`telemetry board request failed (${response.status})`);
        }
        const data = (await response.json()) as GameTelemetryInsightsResponse;
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => controller.abort();
  }, [projectId, visible]);

  useEffect(() => {
    setPersonaLabState({ status: 'idle' });
    setIterationHandoffState({ status: 'idle' });
    setBalanceHandoffState({ status: 'idle' });
    setBalanceDecisionState({});
    setPresetName('');
    const localPresets = readPersonaPlaytestPresets(projectId);
    setPresets(localPresets);
    if (!visible) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/game-deliverables/${encodeURIComponent(projectId)}/playtest-presets`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as GamePlaytestPresetsResponse;
        if (controller.signal.aborted) return;
        setPresets(data.presets);
        writePersonaPlaytestPresets(projectId, data.presets);
      } catch {
        // Local presets remain available when the daemon is offline or older.
      }
    })();

    return () => controller.abort();
  }, [projectId, visible]);

  const togglePersona = (persona: GamePlaytestPersonaId) => {
    setSelectedPersonas((current) => {
      if (current.includes(persona)) return current.filter((id) => id !== persona);
      return [...current, persona];
    });
  };

  const applyPersonaPlaytestPreset = (preset: GamePlaytestPreset) => {
    setPlaytestMode(preset.mode);
    setTargetFileName(preset.fileName ?? '');
    setSelectedPersonas(preset.personas);
    setPersonaLabState({ status: 'idle' });
    setIterationHandoffState({ status: 'idle' });
    setBalanceHandoffState({ status: 'idle' });
  };

  const persistPersonaPlaytestPresets = (next: GamePlaytestPreset[]) => {
    writePersonaPlaytestPresets(projectId, next);
    void fetch(`/api/game-deliverables/${encodeURIComponent(projectId)}/playtest-presets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presets: next }),
    }).catch(() => {
      // Local persistence is still enough for an offline solo review.
    });
  };

  const savePersonaPlaytestPreset = () => {
    if (selectedPersonas.length === 0) return;
    const modeOption = getPlaytestModeOption(playtestMode);
    const trimmedTarget = targetFileName.trim();
    const fallbackName = `${modeOption.label}${trimmedTarget ? ` / ${trimmedTarget}` : ''}`;
    const name = (presetName.trim() || fallbackName).slice(0, 48);
    const preset: GamePlaytestPreset = {
      id: `preset-${Date.now().toString(36)}`,
      name,
      mode: playtestMode,
      ...(trimmedTarget ? { fileName: trimmedTarget } : {}),
      focus: 'combat',
      runs: 5,
      personas: selectedPersonas,
      updatedAt: Date.now(),
    };
    setPresets((current) => {
      const withoutSameName = current.filter((item) => item.name.toLocaleLowerCase() !== name.toLocaleLowerCase());
      const next = [preset, ...withoutSameName].slice(0, 8);
      persistPersonaPlaytestPresets(next);
      return next;
    });
    setPresetName('');
  };

  const removePersonaPlaytestPreset = (presetId: string) => {
    setPresets((current) => {
      const next = current.filter((preset) => preset.id !== presetId);
      persistPersonaPlaytestPresets(next);
      return next;
    });
  };

  const runPersonaPlaytest = async () => {
    if (selectedPersonas.length === 0 || personaLabState.status === 'running') return;
    setPersonaLabState({ status: 'running' });
    try {
      const modeOption = getPlaytestModeOption(playtestMode);
      const trimmedTarget = targetFileName.trim();
      const response = await fetch(
        `/api/game-deliverables/${encodeURIComponent(projectId)}/${modeOption.path}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runs: 5,
            focus: 'combat',
            personas: selectedPersonas,
            ...(trimmedTarget ? { fileName: trimmedTarget } : {}),
          }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error?.message ?? body?.error ?? `persona playtest failed (${response.status})`;
        throw new Error(String(message));
      }
      const data = (await response.json()) as GamePlaytestSimulationResponse;
      setPersonaLabState({ status: 'ready', data });
    } catch (error) {
      setPersonaLabState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const sendPersonaSetupToIteration = async () => {
    if (selectedPersonas.length === 0 || iterationHandoffState.status === 'running') return;
    setIterationHandoffState({ status: 'running' });
    try {
      const trimmedTarget = targetFileName.trim();
      const response = await fetch(
        `/api/game-deliverables/${encodeURIComponent(projectId)}/autonomous-iteration`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            focus: 'combat',
            maxActions: 10,
            includeTelemetry: true,
            includePlaytest: true,
            includeWorldSimulation: true,
            personas: selectedPersonas,
            ...(playtestMode === 'viewport-artifact' && trimmedTarget ? { fileName: trimmedTarget } : {}),
          }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error?.message ?? body?.error ?? `autonomous iteration failed (${response.status})`;
        throw new Error(String(message));
      }
      const data = (await response.json()) as GameAutonomousIterationResponse;
      setIterationHandoffState({ status: 'ready', data });
    } catch (error) {
      setIterationHandoffState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const sendPersonaSetupToBalanceLoop = async () => {
    if (selectedPersonas.length === 0 || balanceHandoffState.status === 'running') return;
    setBalanceHandoffState({ status: 'running' });
    setBalanceDecisionState({});
    try {
      const trimmedTarget = targetFileName.trim();
      const response = await fetch(
        `/api/game-deliverables/${encodeURIComponent(projectId)}/balance-loop`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            focus: 'combat',
            maxAdjustments: 8,
            includeTelemetry: true,
            includePlaytest: true,
            apply: false,
            personas: selectedPersonas,
            ...(playtestMode === 'viewport-artifact' && trimmedTarget ? { fileName: trimmedTarget } : {}),
          }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error?.message ?? body?.error ?? `balance loop failed (${response.status})`;
        throw new Error(String(message));
      }
      const data = (await response.json()) as GameBalanceLoopResponse;
      setBalanceHandoffState({ status: 'ready', data });
    } catch (error) {
      setBalanceHandoffState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const decideBalanceAdjustment = async (
    adjustment: GameBalanceLoopAdjustment,
    decision: GameBalanceLoopAdjustmentDecision,
  ) => {
    setBalanceDecisionState((current) => ({
      ...current,
      [adjustment.id]: {
        status: 'pending',
        message: decision === 'accepted' ? 'Accepting adjustment...' : 'Rejecting adjustment...',
      },
    }));
    try {
      const response = await fetch(
        `/api/game-deliverables/${encodeURIComponent(projectId)}/balance-loop/adjustments/${encodeURIComponent(adjustment.id)}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adjustment, decision }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error?.message ?? body?.error ?? `balance adjustment decision failed (${response.status})`;
        throw new Error(String(message));
      }
      const body = (await response.json()) as GameBalanceLoopAdjustmentDecisionResponse;
      setBalanceDecisionState((current) => ({
        ...current,
        [adjustment.id]: {
          status: decision,
          message: decision === 'accepted'
            ? (body.appliedCount > 0 ? `Applied to ${body.systemFileName ?? 'game system'}` : 'Accepted for review')
            : 'Rejected',
        },
      }));
    } catch (error) {
      setBalanceDecisionState((current) => ({
        ...current,
        [adjustment.id]: {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  };

  if (!visible) return null;

  return (
    <section className="game-telemetry-board project-game-telemetry-board" aria-label={t('gameTelemetry.aria')}>
      <div className="game-telemetry-board-header">
        <div>
          <span className="game-telemetry-board-eyebrow">{t('gameTelemetry.eyebrow')}</span>
          <h2>{t('gameTelemetry.title')}</h2>
        </div>
        {state.status === 'ready' ? (
          <span className="game-telemetry-board-pill">
            {t(state.data.summary.total === 1 ? 'gameTelemetry.eventCountOne' : 'gameTelemetry.eventCountMany', {
              count: state.data.summary.total,
            })}
          </span>
        ) : null}
      </div>

      <PersonaPlaytestLab
        balanceState={balanceHandoffState}
        balanceDecisionState={balanceDecisionState}
        mode={playtestMode}
        iterationState={iterationHandoffState}
        presetName={presetName}
        presets={presets}
        selectedPersonas={selectedPersonas}
        state={personaLabState}
        targetFileName={targetFileName}
        onApplyPreset={applyPersonaPlaytestPreset}
        onModeChange={setPlaytestMode}
        onPresetNameChange={setPresetName}
        onRemovePreset={removePersonaPlaytestPreset}
        onRun={runPersonaPlaytest}
        onSavePreset={savePersonaPlaytestPreset}
        onSendToBalance={sendPersonaSetupToBalanceLoop}
        onSendToIteration={sendPersonaSetupToIteration}
        onBalanceAdjustmentDecision={decideBalanceAdjustment}
        onTargetFileNameChange={setTargetFileName}
        onTogglePersona={togglePersona}
      />

      {state.status === 'loading' ? (
        <p className="game-telemetry-board-empty">{t('gameTelemetry.loading')}</p>
      ) : null}
      {state.status === 'error' ? (
        <p className="game-telemetry-board-error">{state.message}</p>
      ) : null}
      {state.status === 'ready' ? <TelemetryBoardContent data={state.data} /> : null}
    </section>
  );
}

function PersonaPlaytestLab({
  balanceState,
  balanceDecisionState,
  mode,
  iterationState,
  presetName,
  presets,
  selectedPersonas,
  state,
  targetFileName,
  onApplyPreset,
  onModeChange,
  onPresetNameChange,
  onRemovePreset,
  onRun,
  onSavePreset,
  onBalanceAdjustmentDecision,
  onSendToBalance,
  onSendToIteration,
  onTargetFileNameChange,
  onTogglePersona,
}: {
  balanceState: BalanceHandoffState;
  balanceDecisionState: BalanceDecisionState;
  mode: GamePlaytestSimulationMode;
  iterationState: IterationHandoffState;
  presetName: string;
  presets: GamePlaytestPreset[];
  selectedPersonas: GamePlaytestPersonaId[];
  state: PersonaLabState;
  targetFileName: string;
  onApplyPreset: (preset: GamePlaytestPreset) => void;
  onModeChange: (mode: GamePlaytestSimulationMode) => void;
  onPresetNameChange: (name: string) => void;
  onRemovePreset: (presetId: string) => void;
  onRun: () => void;
  onSavePreset: () => void;
  onBalanceAdjustmentDecision: (
    adjustment: GameBalanceLoopAdjustment,
    decision: GameBalanceLoopAdjustmentDecision,
  ) => void;
  onSendToBalance: () => void;
  onSendToIteration: () => void;
  onTargetFileNameChange: (fileName: string) => void;
  onTogglePersona: (persona: GamePlaytestPersonaId) => void;
}) {
  const personaReports = state.status === 'ready' ? state.data.personaReports ?? [] : [];
  const returnedMode = state.status === 'ready' ? state.data.mode ?? mode : mode;
  const returnedModeLabel = getPlaytestModeOption(returnedMode).label;
  return (
    <section className="persona-playtest-lab" aria-label="Persona playtest lab">
      <div className="persona-playtest-copy">
        <h3>Persona Playtest</h3>
        <p>Run a synthetic player pass and turn motivation-specific friction into production evidence.</p>
      </div>
      <div className="persona-playtest-controls">
        <div className="persona-playtest-modes" role="radiogroup" aria-label="Playtest mode">
          {PLAYTEST_MODE_OPTIONS.map((option) => (
            <label key={option.id} className={`persona-playtest-mode${mode === option.id ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="persona-playtest-mode"
                checked={mode === option.id}
                onChange={() => onModeChange(option.id)}
              />
              <span>{option.label}</span>
              <small>{option.note}</small>
            </label>
          ))}
        </div>
        <label className="persona-playtest-target">
          <span>Target Artifact</span>
          <input
            type="text"
            value={targetFileName}
            placeholder="Auto-select best artifact"
            onChange={(event) => onTargetFileNameChange(event.currentTarget.value)}
          />
        </label>
        <div className="persona-playtest-presets" aria-label="Saved persona playtest presets">
          <label className="persona-playtest-preset-name">
            <span>Preset Name</span>
            <input
              type="text"
              value={presetName}
              placeholder="Name this review pass"
              onChange={(event) => onPresetNameChange(event.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            className="persona-playtest-save"
            disabled={selectedPersonas.length === 0}
            onClick={onSavePreset}
          >
            Save Preset
          </button>
          {presets.length > 0 ? (
            <div className="persona-playtest-preset-list">
              {presets.map((preset) => (
                <span key={preset.id} className="persona-playtest-preset-chip">
                  <button type="button" onClick={() => onApplyPreset(preset)}>
                    {preset.name}
                  </button>
                  <button type="button" aria-label={`Remove ${preset.name}`} onClick={() => onRemovePreset(preset.id)}>
                    x
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="persona-playtest-options" role="group" aria-label="Synthetic playtest personas">
          {PERSONA_OPTIONS.map((option) => {
            const selected = selectedPersonas.includes(option.id);
            return (
              <label key={option.id} className={`persona-playtest-chip${selected ? ' is-selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onTogglePersona(option.id)}
                />
                <span>{option.label}</span>
                <small>{option.note}</small>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          className="persona-playtest-run"
          disabled={selectedPersonas.length === 0 || state.status === 'running'}
          onClick={onRun}
        >
          {state.status === 'running' ? 'Running persona playtest' : 'Run persona playtest'}
        </button>
        <button
          type="button"
          className="persona-playtest-iterate"
          disabled={selectedPersonas.length === 0 || iterationState.status === 'running'}
          onClick={onSendToIteration}
        >
          {iterationState.status === 'running' ? 'Sending to iteration' : 'Send to iteration'}
        </button>
        <button
          type="button"
          className="persona-playtest-balance"
          disabled={selectedPersonas.length === 0 || balanceState.status === 'running'}
          onClick={onSendToBalance}
        >
          {balanceState.status === 'running' ? 'Sending to balance' : 'Send to balance'}
        </button>
      </div>
      {state.status === 'error' ? (
        <p className="persona-playtest-error">{state.message}</p>
      ) : null}
      {iterationState.status === 'error' ? (
        <p className="persona-playtest-error">{iterationState.message}</p>
      ) : null}
      {balanceState.status === 'error' ? (
        <p className="persona-playtest-error">{balanceState.message}</p>
      ) : null}
      {state.status === 'ready' ? (
        <div className="persona-playtest-results">
          <p>
            {returnedModeLabel} on {state.data.fileName}: {state.data.summary}
          </p>
          {personaReports.length > 0 ? (
            <ul>
              {personaReports.map((report) => (
                <PersonaReportRow key={report.id} report={report} />
              ))}
            </ul>
          ) : (
            <p>No persona reports returned. Add personas to the playtest request and run again.</p>
          )}
        </div>
      ) : null}
      {iterationState.status === 'ready' ? (
        <div className="persona-iteration-result">
          <p>{iterationState.data.summary}</p>
          {iterationState.data.actions.length > 0 ? (
            <ul>
              {iterationState.data.actions.slice(0, 3).map((action) => (
                <li key={action.id}>
                  <span className={`game-telemetry-risk ${action.priority === 'p0' ? 'high' : action.priority === 'p1' ? 'medium' : 'low'}`}>
                    {action.priority}
                  </span>
                  <strong>{action.owner}</strong>
                  <span>{action.recommendation}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {balanceState.status === 'ready' ? (
        <div className="persona-balance-result">
          <p>{balanceState.data.summary}</p>
          {balanceState.data.adjustments.length > 0 ? (
            <ul>
              {balanceState.data.adjustments.slice(0, 3).map((adjustment) => {
                const decision = balanceDecisionState[adjustment.id];
                return (
                  <li key={adjustment.id}>
                    <span className={`game-telemetry-risk ${adjustment.priority === 'p0' ? 'high' : adjustment.priority === 'p1' ? 'medium' : 'low'}`}>
                      {adjustment.priority}
                    </span>
                    <strong>{adjustment.owner}</strong>
                    <span>{adjustment.recommendation}</span>
                    <BalanceAdjustmentReview adjustment={adjustment} />
                    <span className="persona-balance-decision-actions">
                      <button
                        type="button"
                        onClick={() => onBalanceAdjustmentDecision(adjustment, 'accepted')}
                        disabled={decision?.status === 'pending'}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => onBalanceAdjustmentDecision(adjustment, 'rejected')}
                        disabled={decision?.status === 'pending'}
                      >
                        Reject
                      </button>
                    </span>
                    {decision ? (
                      <em className={`persona-balance-decision-state ${decision.status}`}>
                        {decision.message}
                      </em>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function BalanceAdjustmentReview({ adjustment }: { adjustment: GameBalanceLoopAdjustment }) {
  const targetPath = adjustment.targetPath?.map((part) => String(part)).join('.');
  const hasTarget = Boolean(adjustment.targetFileName || targetPath);
  const hasValueDiff = adjustment.currentValue !== undefined || adjustment.suggestedValue !== undefined;
  if (!hasTarget && !hasValueDiff && !adjustment.applyStatus) return null;
  return (
    <dl className="persona-balance-review" aria-label={`${adjustment.title} tuning diff`}>
      {hasTarget ? (
        <>
          <dt>Target</dt>
          <dd>{[adjustment.targetFileName, targetPath].filter(Boolean).join(' / ')}</dd>
        </>
      ) : null}
      {hasValueDiff ? (
        <>
          <dt>Change</dt>
          <dd>{formatBalanceValue(adjustment.currentValue)} -&gt; {formatBalanceValue(adjustment.suggestedValue)}</dd>
        </>
      ) : null}
      {adjustment.applyStatus ? (
        <>
          <dt>Status</dt>
          <dd>{adjustment.applyStatus}</dd>
        </>
      ) : null}
    </dl>
  );
}

function formatBalanceValue(value: string | number | boolean | undefined): string {
  if (value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function PersonaReportRow({ report }: { report: GamePlaytestPersonaReport }) {
  const recommendation =
    report.balanceIssues[0]
    ?? report.frustrationMoments[0]
    ?? report.unusedContent[0]
    ?? report.acceptedSignals[0]
    ?? 'No persona-specific adjustment needed yet.';
  return (
    <li>
      <span className={`game-telemetry-risk ${report.risk}`}>{report.risk}</span>
      <strong>{report.label}</strong>
      <span>
        {report.deaths} deaths / {report.completionTimeSec}s. {recommendation}
      </span>
    </li>
  );
}

function TelemetryBoardContent({ data }: { data: GameTelemetryInsightsResponse }) {
  const t = useT();
  const latest = data.summary.latestTimestamp
    ? new Date(data.summary.latestTimestamp).toLocaleString()
    : t('gameTelemetry.noTimestamp');
  return (
    <div className="game-telemetry-board-grid">
      <div className="game-telemetry-board-stat">
        <span>{t('gameTelemetry.sessions')}</span>
        <strong>{data.summary.sessionCount}</strong>
      </div>
      <div className="game-telemetry-board-stat">
        <span>{t('gameTelemetry.scenes')}</span>
        <strong>{Object.keys(data.summary.byScene).length}</strong>
      </div>
      <div className="game-telemetry-board-stat">
        <span>{t('gameTelemetry.latestSignal')}</span>
        <strong>{latest}</strong>
      </div>

      <div className="game-telemetry-board-panel">
        <h3>{t('gameTelemetry.designRisks')}</h3>
        {data.insights.length > 0 ? (
          <ul>
            {data.insights.slice(0, 5).map((insight) => (
              <li key={insight.id}>
                <span className={`game-telemetry-risk ${insight.severity}`}>{insight.severity}</span>
                <strong>{insight.title}</strong>
                <span>{insight.recommendation}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('gameTelemetry.noRisks')}</p>
        )}
      </div>

      <div className="game-telemetry-board-panel">
        <h3>{t('gameTelemetry.heatmapCells')}</h3>
        {data.heatmap.length > 0 ? (
          <ul>
            {data.heatmap.slice(0, 5).map((cell, index) => (
              <li key={`${cell.sceneId ?? 'scene'}-${cell.x}-${cell.y}-${cell.z ?? 0}-${index}`}>
                <strong>{cell.sceneId ?? t('gameTelemetry.unknownScene')}</strong>
                <span>
                  {t(cell.count === 1 ? 'gameTelemetry.heatmapSignalOne' : 'gameTelemetry.heatmapSignalMany', {
                    count: cell.count,
                    x: cell.x,
                    y: cell.y,
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('gameTelemetry.noHeatmap')}</p>
        )}
      </div>
    </div>
  );
}
