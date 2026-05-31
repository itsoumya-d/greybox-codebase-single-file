import { useEffect } from 'react';
import type { GameArtBibleSummary, SkillSummary } from '../../../types';
import type { GameType, WizardConcept } from '../useWizardState';

const GAME_TYPES: Array<{ id: GameType; label: string; hint: string }> = [
  { id: 'Mobile-2D', label: 'Mobile 2D', hint: 'Sprite-based mobile game' },
  { id: 'Mobile-3D', label: 'Mobile 3D', hint: '3D mobile game' },
  { id: '2D', label: 'Desktop 2D', hint: 'Sprite-based PC/web game' },
  { id: '3D', label: 'Desktop 3D', hint: '3D PC/web game' },
];

const GENRES = [
  { id: 'rpg', label: 'RPG', icon: '⚔️' },
  { id: 'platformer', label: 'Platformer', icon: '🏃' },
  { id: 'puzzle', label: 'Puzzle', icon: '🧩' },
  { id: 'shooter', label: 'Shooter', icon: '🎯' },
  { id: 'strategy', label: 'Strategy', icon: '♟️' },
  { id: 'casual', label: 'Casual', icon: '🎮' },
  { id: 'mobile', label: 'Mobile', icon: '📱' },
  { id: 'other', label: 'Other', icon: '✨' },
] as const;

const PLATFORMS = [
  { id: 'mobile', label: 'Mobile' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'webgl', label: 'WebGL' },
  { id: 'pc', label: 'PC' },
] as const;

interface Props {
  concept: WizardConcept;
  skills: SkillSummary[];
  gameArtBibles: GameArtBibleSummary[];
  generating: boolean;
  error: string | null;
  onUpdate: (patch: Partial<WizardConcept>) => void;
  onGenerate: () => void;
}

export function ConceptStep({
  concept,
  skills: _skills,
  gameArtBibles,
  generating,
  error,
  onUpdate,
  onGenerate,
}: Props) {
  // Auto-select first art bible if none chosen
  useEffect(() => {
    if (!concept.artBibleId && gameArtBibles.length > 0) {
      onUpdate({ artBibleId: gameArtBibles[0]!.id, artStyle: gameArtBibles[0]!.title });
    }
  }, [gameArtBibles, concept.artBibleId, onUpdate]);

  const canGenerate =
    concept.genre.trim().length > 0 &&
    concept.name.trim().length > 0 &&
    !generating;

  return (
    <div className="wizard-step concept-step">
      <div className="wizard-step-header">
        <h2 className="wizard-step-title">Define your game concept</h2>
        <p className="wizard-step-hint">
          Pick a genre, platform, and art style. Then describe your core loop and name your game.
        </p>
      </div>

      <div className="wizard-step-body">
        {/* Game type */}
        <section className="wizard-section">
          <div className="wizard-label">Game type</div>
          <div className="wizard-chips">
            {GAME_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`wizard-chip${concept.gameType === t.id ? ' selected' : ''}`}
                onClick={() => onUpdate({ gameType: t.id })}
                disabled={generating}
                aria-pressed={concept.gameType === t.id}
                title={t.hint}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        {/* Genre */}
        <section className="wizard-section">
          <div className="wizard-label">Genre</div>
          <div className="wizard-card-grid">
            {GENRES.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`wizard-card${concept.genre === g.id ? ' selected' : ''}`}
                onClick={() => onUpdate({ genre: g.id })}
                disabled={generating}
                aria-pressed={concept.genre === g.id}
              >
                <span className="wizard-card-icon" aria-hidden>
                  {g.icon}
                </span>
                <span className="wizard-card-label">{g.label}</span>
              </button>
            ))}
          </div>
          {/* Free-form override */}
          <input
            className="wizard-input wizard-input-sm"
            type="text"
            placeholder="Or type a genre..."
            value={GENRES.some((g) => g.id === concept.genre) ? '' : concept.genre}
            onChange={(e) => {
              if (e.target.value) onUpdate({ genre: e.target.value });
            }}
            disabled={generating}
          />
        </section>

        {/* Game name */}
        <section className="wizard-section">
          <label className="wizard-label" htmlFor="wizard-game-name">
            Game name
          </label>
          <input
            id="wizard-game-name"
            className="wizard-input"
            type="text"
            placeholder="My Awesome Game"
            value={concept.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            disabled={generating}
          />
        </section>

        {/* Platform */}
        <section className="wizard-section">
          <div className="wizard-label">Platform</div>
          <div className="wizard-chips">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`wizard-chip${concept.platform === p.id ? ' selected' : ''}`}
                onClick={() => onUpdate({ platform: p.id })}
                disabled={generating}
                aria-pressed={concept.platform === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* Art style — from game art bibles */}
        <section className="wizard-section">
          <div className="wizard-label">Art style</div>
          {gameArtBibles.length > 0 ? (
            <div className="wizard-art-bibles">
              {gameArtBibles.map((bible) => {
                const swatches = bible.swatches?.slice(0, 4) ?? [];
                const selected = concept.artBibleId === bible.id;
                return (
                  <button
                    key={bible.id}
                    type="button"
                    className={`wizard-art-bible-card${selected ? ' selected' : ''}`}
                    onClick={() => onUpdate({ artBibleId: bible.id, artStyle: bible.title })}
                    disabled={generating}
                    aria-pressed={selected}
                  >
                    <div className="wizard-art-bible-swatches">
                      {swatches.length > 0
                        ? swatches.map((hex, i) => (
                            <span
                              key={i}
                              className="wizard-art-bible-swatch"
                              style={{ background: hex }}
                            />
                          ))
                        : <span className="wizard-art-bible-swatch wizard-art-bible-swatch-empty" />}
                    </div>
                    <span className="wizard-art-bible-title">{bible.title}</span>
                    {bible.category && (
                      <span className="wizard-art-bible-cat">{bible.category}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              className="wizard-input"
              type="text"
              placeholder="e.g. pixel art, cel-shaded, realistic..."
              value={concept.artStyle}
              onChange={(e) => onUpdate({ artStyle: e.target.value })}
              disabled={generating}
            />
          )}
        </section>

        {/* Target audience */}
        <section className="wizard-section">
          <label className="wizard-label" htmlFor="wizard-audience">
            Target audience
          </label>
          <input
            id="wizard-audience"
            className="wizard-input"
            type="text"
            placeholder="e.g. teens and up, casual players, core gamers..."
            value={concept.targetAudience}
            onChange={(e) => onUpdate({ targetAudience: e.target.value })}
            disabled={generating}
          />
        </section>

        {/* Core loop */}
        <section className="wizard-section">
          <label className="wizard-label" htmlFor="wizard-core-loop">
            Core loop
          </label>
          <textarea
            id="wizard-core-loop"
            className="wizard-textarea"
            placeholder="Describe the main gameplay loop in 1-3 sentences. e.g. 'The player collects resources, builds structures, and defends against waves.'"
            value={concept.coreLoop}
            onChange={(e) => onUpdate({ coreLoop: e.target.value })}
            rows={3}
            disabled={generating}
          />
        </section>

        {/* AI concept summary preview */}
        {concept.aiSummary && (
          <section className="wizard-section">
            <div className="wizard-label">AI concept summary</div>
            <div className="wizard-ai-preview">
              <div className="wizard-ai-preview-badge">AI Generated</div>
              <p className="wizard-ai-preview-text">{concept.aiSummary}</p>
            </div>
          </section>
        )}

        {error && (
          <div className="wizard-error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="wizard-error-retry"
              onClick={onGenerate}
            >
              Retry
            </button>
          </div>
        )}

        <div className="wizard-actions">
          <button
            type="button"
            className="primary wizard-generate-btn"
            onClick={onGenerate}
            disabled={!canGenerate}
          >
            {generating ? (
              <>
                <span className="wizard-spinner" aria-hidden /> Generating concept...
              </>
            ) : (
              'Generate Game Concept'
            )}
          </button>
          <p className="wizard-actions-hint">
            This creates your project and asks the AI Game Director to flesh out your concept.
          </p>
        </div>
      </div>
    </div>
  );
}
