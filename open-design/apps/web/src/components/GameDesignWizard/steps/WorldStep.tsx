import { UpgradeCTA } from '../UpgradeCTA';

interface Props {
  worldNotes: string;
  worldBoardHtml?: string;
  generating: boolean;
  error: string | null;
  upgradeRequired?: boolean;
  onSetWorldNotes: (notes: string) => void;
  onGenerate: () => void;
}

export function WorldStep({
  worldNotes,
  worldBoardHtml,
  generating,
  error,
  upgradeRequired,
  onSetWorldNotes,
  onGenerate,
}: Props) {
  return (
    <div className="wizard-step world-step">
      <div className="wizard-step-header">
        <h2 className="wizard-step-title">Design your world</h2>
        <p className="wizard-step-hint">
          Describe the game world — its environments, atmosphere, hazards, and layout.
          The AI will generate a visual level design board.
        </p>
      </div>

      <div className="wizard-step-body">
        <section className="wizard-section">
          <label className="wizard-label" htmlFor="wizard-world-notes">
            World description
          </label>
          <textarea
            id="wizard-world-notes"
            className="wizard-textarea wizard-textarea-lg"
            placeholder={`Describe the game world. For example:
- Setting: Dark fantasy kingdom under eternal twilight
- Environments: Haunted forest, crumbling castle, underground ruins
- Atmosphere: Gloomy and tense with occasional moments of beauty
- Hazards: Traps, enemies, falling platforms
- Player path: Starts in forest, progresses to castle, descends into ruins`}
            value={worldNotes}
            onChange={(e) => onSetWorldNotes(e.target.value)}
            rows={8}
            disabled={generating}
          />
        </section>

        {error && !upgradeRequired && (
          <div className="wizard-error" role="alert">
            <span>{error}</span>
            <button type="button" className="wizard-error-retry" onClick={onGenerate}>
              Retry
            </button>
          </div>
        )}

        <div className="wizard-actions">
          {upgradeRequired ? (
            <UpgradeCTA requiredTier="indie" featureName="World Generation" />
          ) : (
            <button
              type="button"
              className="primary wizard-generate-btn"
              onClick={onGenerate}
              disabled={generating || !worldNotes.trim()}
            >
              {generating ? (
                <>
                  <span className="wizard-spinner" aria-hidden /> Generating level board...
                </>
              ) : (
                'Generate Level Board'
              )}
            </button>
          )}
        </div>

        {worldBoardHtml && (
          <div className="world-board-preview">
            <div className="wizard-label">Generated level design board</div>
            <iframe
              className="world-board-frame"
              srcDoc={worldBoardHtml}
              title="Level design board"
              sandbox="allow-scripts"
            />
          </div>
        )}

        {!worldBoardHtml && !generating && (
          <div className="world-board-placeholder">
            <p>Your level design board will appear here after generation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
