/**
 * GameDesignWizard — multi-step AI-guided game design flow.
 *
 * Steps:
 *   1. concept    — genre/platform/art style/core loop
 *   2. screens    — SVG node-graph of game screens + flows
 *   3. design     — per-screen component design
 *   4. characters — character creator + 3D cloud generation
 *   5. world      — world/level design board
 *   6. prototype  — playable HTML prototype
 *   7. export     — engine package download
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameArtBibleSummary, SkillSummary } from '../../types';
import { WIZARD_STEPS, type WizardStep, useWizardState, saveWizardState, initialStateWithProject, defaultScreensForGenre } from './useWizardState';
import { navigate } from '../../router';
import { SettingsPanel } from './SettingsPanel';
import { WizardProgress } from './WizardProgress';
import { ConceptStep } from './steps/ConceptStep';
import { ScreensStep } from './steps/ScreensStep';
import { DesignStep } from './steps/DesignStep';
import { CharacterStep } from './steps/CharacterStep';
import { WorldStep } from './steps/WorldStep';
import { PrototypeStep } from './steps/PrototypeStep';
import { ExportStep } from './steps/ExportStep';
import './wizard.css';

// ---------------------------------------------------------------------------
// Extract the first ```html ... ``` block from LLM output, or return full text
function extractHtml(text: string): string {
  const m = text.match(/```html\s*([\s\S]*?)```/i);
  if (m?.[1]) return m[1].trim();
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    return text.trim();
  }
  return text;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function createProjectApi(input: {
  name: string;
  skillId: string | null;
  genre: string;
  platform: string;
}): Promise<{ projectId: string } | null> {
  try {
    const resp = await fetch('/api/game-deliverables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `wizard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: input.name || `My ${input.genre} Game`,
        skillId: input.skillId,
        deliverableKind: 'prototype',
        metadata: {
          kind: 'prototype',
          gameDesign: {
            genre: input.genre,
            platforms: [input.platform],
          },
        },
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { project?: { id: string } };
    return data.project ? { projectId: data.project.id } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GameDesignWizardProps {
  skills: SkillSummary[];
  gameArtBibles: GameArtBibleSummary[];
  onClose?: () => void;
  onProjectCreated?: (projectId: string) => void;
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GameDesignWizard({
  skills,
  gameArtBibles,
  onClose,
  onProjectCreated,
  projectId: initialProjectId,
}: GameDesignWizardProps) {
  const [showSettings, setShowSettings] = useState(false);

  const [seedState] = useState(() =>
    initialProjectId ? initialStateWithProject(initialProjectId) : undefined
  );

  const {
    state,
    goToStep: dispatchGoToStep,
    setProjectId,
    updateConcept,
    setConceptSummary,
    setScreens,
    addScreen,
    removeScreen,
    updateScreen,
    setActiveScreen,
    setFlows,
    addFlow,
    removeFlow,
    addCharacter,
    updateCharacter,
    removeCharacter,
    setWorldNotes,
    setWorldBoardHtml,
    setPrototypeHtml,
    setExportEngine,
    setGenerating,
    setExporting,
    setError,
    setWorldUpgradeRequired,
    setPrototypeUpgradeRequired,
  } = useWizardState(seedState);

  const abortRef = useRef<AbortController | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [subscriptionTier, setSubscriptionTier] = useState<'free' | 'indie' | 'studio' | 'enterprise' | null>('free');

  // Fetch subscription tier on mount
  useEffect(() => {
    fetch('/api/billing/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (data && typeof data === 'object' && 'tier' in data) {
          const tier = (data as { tier: unknown }).tier;
          if (tier === 'indie' || tier === 'studio' || tier === 'enterprise' || tier === 'free') {
            setSubscriptionTier(tier);
          }
        }
      })
      .catch(() => {/* leave as 'free' */});
  }, []);

  // Cancel any in-flight generation when unmounting
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // goToStep: dispatch state update + sync URL when projectId is available
  const goToStep = useCallback(
    (step: WizardStep) => {
      dispatchGoToStep(step);
      if (state.projectId) {
        navigate({ kind: 'wizard', projectId: state.projectId, step });
      }
    },
    [dispatchGoToStep, state.projectId],
  );

  // Debounced localStorage persistence (300 ms)
  useEffect(() => {
    if (!state.projectId) return;
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      if (state.projectId) {
        saveWizardState(state.projectId, state);
      }
    }, 300);
    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [state]);

  // Notify parent when project is first created
  useEffect(() => {
    if (state.projectId) {
      onProjectCreated?.(state.projectId);
    }
  }, [state.projectId, onProjectCreated]);

  // -------------------------------------------------------------------------
  // Navigation helpers
  // -------------------------------------------------------------------------

  const currentIndex = WIZARD_STEPS.indexOf(state.step);

  const goNext = useCallback(() => {
    const next = WIZARD_STEPS[currentIndex + 1];
    if (next) goToStep(next);
  }, [currentIndex, goToStep]);

  function goPrev() {
    const prev = WIZARD_STEPS[currentIndex - 1];
    if (prev) goToStep(prev);
  }

  const completedSteps = new Set<WizardStep>(
    WIZARD_STEPS.slice(0, currentIndex) as WizardStep[],
  );

  // -------------------------------------------------------------------------
  // Step 1 — Concept generation
  // -------------------------------------------------------------------------

  const handleGenerateConcept = useCallback(async () => {
    setGenerating('concept', true);
    setError(null);

    // Create project if we don't have one yet
    let projectId = state.projectId;
    if (!projectId) {
      const directorSkill = skills.find((s) => s.id === 'playable-game-prototype' || s.id.includes('director'));
      const result = await createProjectApi({
        name: state.concept.name || `My ${state.concept.genre} Game`,
        skillId: directorSkill?.id ?? null,
        genre: state.concept.genre,
        platform: state.concept.platform,
      });
      if (!result) {
        setError('Failed to create project. Make sure the daemon is running.');
        setGenerating('concept', false);
        return;
      }
      projectId = result.projectId;
      setProjectId(projectId);
    }

    // Pick the "Game Director" skill — fall back to playable-game-prototype
    const skillId =
      skills.find((s) => s.id.includes('game-design-document') || s.id.includes('director'))?.id
      ?? skills.find((s) => s.id === 'playable-game-prototype')?.id
      ?? null;

    const message = [
      `Game name: ${state.concept.name || '(unnamed)'}`,
      `Genre: ${state.concept.genre}`,
      `Platform: ${state.concept.platform}`,
      `Art style: ${state.concept.artStyle}`,
      `Target audience: ${state.concept.targetAudience}`,
      `Core loop: ${state.concept.coreLoop}`,
      'Write a 3-paragraph game concept summary covering the vision, core mechanics, and target experience.',
    ]
      .filter((l) => !l.endsWith(': '))
      .join('\n');

    try {
      const resp = await fetch('/api/wizard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          skillId,
          message,
        }),
      });
      if (!resp.ok) {
        setError('Failed to generate concept. Please try again.');
        setGenerating('concept', false);
        return;
      }
      const data = (await resp.json()) as { text?: string; content?: string };
      const summary = data.text ?? data.content ?? '';
      if (summary) {
        setConceptSummary(summary.slice(0, 800));
      }
    } catch {
      setError('Failed to generate concept. Please try again.');
      setGenerating('concept', false);
      return;
    }

    // Move to screens step and load defaults
    const defaults = defaultScreensForGenre(state.concept.genre, state.concept.platform);
    if (state.screens.length === 0) {
      setScreens(defaults);
      const defaultFlows = defaults.slice(0, -1).map((s, i) => ({
        fromId: s.id,
        toId: defaults[i + 1]!.id,
      }));
      setFlows(defaultFlows);
    }

    setGenerating('concept', false);
    // Navigate explicitly with the local `projectId` variable (which is
    // guaranteed to be set at this point) before calling goNext(), because the
    // goToStep closure may still hold the old undefined state.projectId when
    // the project was just created above.
    navigate({ kind: 'wizard', projectId, step: WIZARD_STEPS[currentIndex + 1] ?? 'screens' });
    goNext();
  }, [state, skills, setGenerating, setError, setProjectId, setConceptSummary, setScreens, setFlows, goNext, currentIndex]);

  // -------------------------------------------------------------------------
  // Step 2 — AI Design Screens
  // -------------------------------------------------------------------------

  const handleGenerateScreens = useCallback(async () => {
    if (!state.projectId) {
      setError('Create a project in the Concept step first.');
      return;
    }
    setGenerating('screens', true);
    setError(null);

    const skillId =
      state.concept.platform === 'mobile'
        ? skills.find((s) => s.id === 'mobile-game-flow')?.id
        : skills.find((s) => s.id === 'desktop-game-ui')?.id;

    const message = [
      `Design the screen flow for a ${state.concept.genre} game called "${state.concept.name}".`,
      `Platform: ${state.concept.platform}`,
      `Current screens: ${state.screens.map((s) => s.name).join(', ')}`,
      'Describe the UI layout and key components for each screen.',
    ].join('\n');

    try {
      const resp = await fetch('/api/wizard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: state.projectId,
          skillId: skillId ?? null,
          message,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { text?: string };
        // Parse any screen suggestions from the response
        if (data.text) {
          const lines = data.text.split('\n');
          lines.forEach((line, i) => {
            if (line.match(/screen\s*\d+[:]/i) || line.match(/^#+\s*\w+\s*screen/i)) {
              const name = line.replace(/^#+\s*/, '').replace(/screen\s*\d+:\s*/i, '').trim();
              if (name && i < state.screens.length) {
                updateScreen(state.screens[i]!.id, { name });
              }
            }
          });
        }
      }
    } catch {
      // non-fatal: just advance with what we have
    } finally {
      setGenerating('screens', false);
    }
  }, [state, skills, setGenerating, setError, updateScreen]);

  // -------------------------------------------------------------------------
  // Step 3 — Design active screen
  // -------------------------------------------------------------------------

  const handleDesignScreen = useCallback(async () => {
    if (!state.projectId || !state.activeScreenId) return;
    setGenerating('design', true);
    setError(null);

    const screen = state.screens.find((s) => s.id === state.activeScreenId);
    if (!screen) {
      setGenerating('design', false);
      return;
    }

    const skillId =
      screen.kind === 'gameplay'
        ? skills.find((s) => s.id === 'game-hud-system' || s.id === 'game-viewport-scene')?.id
        : skills.find((s) => s.id === 'mobile-game-ui' || s.id === 'desktop-game-ui')?.id;

    const message = [
      `Design the "${screen.name}" screen (${screen.kind}) for a ${state.concept.genre} game.`,
      `Art style: ${state.concept.artStyle}`,
      `Platform: ${state.concept.platform}`,
      'Return a self-contained HTML+CSS mockup (no external dependencies) that fits in a 390x844 viewport.',
    ].join('\n');

    try {
      const resp = await fetch('/api/wizard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: state.projectId,
          skillId: skillId ?? null,
          message,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { text?: string; html?: string };
        const rawText = data.html ?? data.text ?? '';
        const html = extractHtml(rawText);
        if (html) {
          updateScreen(screen.id, { mockupHtml: html });
        }
      }
    } catch (err) {
      setError(`Design generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating('design', false);
    }
  }, [state, skills, setGenerating, setError, updateScreen]);

  // -------------------------------------------------------------------------
  // Step 5 — World generation
  // -------------------------------------------------------------------------

  const handleGenerateWorld = useCallback(async () => {
    if (!state.projectId) return;
    setGenerating('world', true);
    setError(null);

    const skillId = skills.find((s) => s.id === 'level-design-board')?.id;

    const message = [
      `Generate a level design board for a ${state.concept.genre} game.`,
      state.worldNotes ? `World description: ${state.worldNotes}` : '',
      'Return a self-contained HTML visualization (no external deps) with the level layout.',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const resp = await fetch('/api/wizard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: state.projectId,
          skillId: skillId ?? null,
          message,
        }),
      });
      if (!resp.ok) {
        if (resp.status === 402 || resp.status === 429) {
          setWorldUpgradeRequired(true);
        } else {
          setError('World generation failed. Please retry.');
        }
        setGenerating('world', false);
        return;
      }
      const data = (await resp.json()) as { text?: string; html?: string };
      const rawText = data.html ?? data.text ?? '';
      const html = extractHtml(rawText);
      if (html) setWorldBoardHtml(html);
    } catch (err) {
      setError(`World generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating('world', false);
    }
  }, [state, skills, setGenerating, setError, setWorldBoardHtml, setWorldUpgradeRequired]);

  // -------------------------------------------------------------------------
  // Step 6 — Prototype generation
  // -------------------------------------------------------------------------

  const handleGeneratePrototype = useCallback(async () => {
    if (!state.projectId) return;
    setGenerating('prototype', true);
    setError(null);

    const skillId =
      skills.find((s) => s.id === 'playable-game-prototype')?.id ??
      skills.find((s) => s.id.includes('prototype'))?.id;

    const message = [
      `Build a playable HTML5 prototype for a ${state.concept.genre} game called "${state.concept.name}".`,
      `Platform: ${state.concept.platform}`,
      `Art style: ${state.concept.artStyle}`,
      `Core loop: ${state.concept.coreLoop}`,
      state.characters.length > 0
        ? `Characters: ${state.characters.map((c) => `${c.name} (${c.type})`).join(', ')}`
        : '',
      `Screens: ${state.screens.map((s) => s.name).join(', ')}`,
      'Return a single, self-contained HTML file with vanilla JS. No external dependencies.',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const resp = await fetch('/api/wizard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: state.projectId,
          skillId: skillId ?? null,
          message,
        }),
      });
      if (!resp.ok) {
        if (resp.status === 402 || resp.status === 429) {
          setPrototypeUpgradeRequired(true);
        } else {
          setError('Prototype generation failed. Please retry.');
        }
        setGenerating('prototype', false);
        return;
      }
      const data = (await resp.json()) as { text?: string; html?: string };
      const rawText = data.html ?? data.text ?? '';
      const html = extractHtml(rawText);
      if (html) setPrototypeHtml(html);
    } catch (err) {
      setError(`Prototype generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating('prototype', false);
    }
  }, [state, skills, setGenerating, setError, setPrototypeHtml, setPrototypeUpgradeRequired]);

  // -------------------------------------------------------------------------
  // Step 7 — Export
  // -------------------------------------------------------------------------

  const handleExport = useCallback(() => {
    setExporting(true);
  }, [setExporting]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderStep() {
    switch (state.step) {
      case 'concept':
        return (
          <ConceptStep
            concept={state.concept}
            skills={skills}
            gameArtBibles={gameArtBibles}
            generating={state.generatingConcept}
            error={state.error}
            onUpdate={updateConcept}
            onGenerate={() => void handleGenerateConcept()}
          />
        );
      case 'screens':
        return (
          <ScreensStep
            screens={state.screens}
            flows={state.flows}
            genre={state.concept.genre}
            platform={state.concept.platform}
            generating={state.generatingScreens}
            error={state.error}
            onSetScreens={setScreens}
            onAddScreen={addScreen}
            onRemoveScreen={removeScreen}
            onUpdateScreen={updateScreen}
            onSetFlows={setFlows}
            onAddFlow={addFlow}
            onRemoveFlow={removeFlow}
            onGenerate={() => void handleGenerateScreens()}
          />
        );
      case 'design':
        return (
          <DesignStep
            screens={state.screens}
            activeScreenId={state.activeScreenId}
            generating={state.generatingDesign}
            error={state.error}
            onSetActiveScreen={setActiveScreen}
            onGenerate={() => void handleDesignScreen()}
          />
        );
      case 'characters':
        return (
          <CharacterStep
            characters={state.characters}
            artStyle={state.concept.artStyle}
            gameType={state.concept.gameType}
            error={state.error}
            onAdd={addCharacter}
            onUpdate={updateCharacter}
            onRemove={removeCharacter}
          />
        );
      case 'world':
        return (
          <WorldStep
            worldNotes={state.worldNotes}
            worldBoardHtml={state.worldBoardHtml}
            generating={state.generatingWorld}
            error={state.error}
            upgradeRequired={state.worldUpgradeRequired}
            onSetWorldNotes={setWorldNotes}
            onGenerate={() => void handleGenerateWorld()}
          />
        );
      case 'prototype':
        return (
          <PrototypeStep
            prototypeHtml={state.prototypeHtml}
            generating={state.generatingPrototype}
            error={state.error}
            projectId={state.projectId}
            gameType={state.concept.gameType}
            upgradeRequired={state.prototypeUpgradeRequired}
            onGenerate={() => void handleGeneratePrototype()}
          />
        );
      case 'export':
        return (
          <ExportStep
            projectId={state.projectId}
            exportEngine={state.exportEngine}
            exporting={state.exporting}
            error={state.error}
            subscriptionTier={subscriptionTier}
            gddState={state}
            onSetEngine={(engine) => setExportEngine(engine)}
            onExport={handleExport}
            onExportDone={() => setExporting(false)}
            onBackToDashboard={() => onClose?.()}
          />
        );
      default:
        return null;
    }
  }

  const isLastStep = currentIndex === WIZARD_STEPS.length - 1;
  const isGeneratingThisStep =
    (state.step === 'concept' && state.generatingConcept) ||
    (state.step === 'screens' && state.generatingScreens) ||
    (state.step === 'design' && state.generatingDesign) ||
    (state.step === 'world' && state.generatingWorld) ||
    (state.step === 'prototype' && state.generatingPrototype) ||
    (state.step === 'export' && state.exporting);

  return (
    <div className="game-design-wizard" data-testid="game-design-wizard">
      {/* Header */}
      <div className="wizard-header">
        <div className="wizard-header-title">
          <span className="wizard-header-label">AI Game Design Wizard</span>
          {state.concept.name && (
            <span className="wizard-header-project">{state.concept.name}</span>
          )}
        </div>
        <button
          type="button"
          className="ghost wizard-settings-btn"
          onClick={() => setShowSettings(true)}
          aria-label="Cloud settings"
        >
          ⚙
        </button>
        {onClose && (
          <button
            type="button"
            className="ghost wizard-close-btn"
            onClick={onClose}
            aria-label="Close wizard"
          >
            ×
          </button>
        )}
      </div>

      {/* Progress */}
      <WizardProgress
        currentStep={state.step}
        onGoToStep={goToStep}
        completedSteps={completedSteps}
      />

      {/* Step content */}
      <div className="wizard-content">
        {renderStep()}
      </div>

      {/* Navigation footer */}
      <div className="wizard-footer">
        <button
          type="button"
          className="ghost wizard-nav-btn"
          onClick={goPrev}
          disabled={currentIndex === 0 || isGeneratingThisStep}
        >
          ← Back
        </button>

        <span className="wizard-step-counter">
          {currentIndex + 1} of {WIZARD_STEPS.length}
        </span>

        {isLastStep ? null : (
          <button
            type="button"
            className="wizard-nav-btn wizard-nav-next"
            onClick={goNext}
            disabled={isGeneratingThisStep}
          >
            Next →
          </button>
        )}
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// Named re-export so consumers can import from the directory
export { useWizardState } from './useWizardState';
export type { WizardStep } from './useWizardState';
