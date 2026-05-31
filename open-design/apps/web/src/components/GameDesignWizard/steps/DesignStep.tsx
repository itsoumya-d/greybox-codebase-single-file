import type { WizardScreen } from '../useWizardState';

interface Props {
  screens: WizardScreen[];
  activeScreenId: string | null;
  generating: boolean;
  error: string | null;
  onSetActiveScreen: (id: string) => void;
  onGenerate: () => void;
}

export function DesignStep({
  screens,
  activeScreenId,
  generating,
  error,
  onSetActiveScreen,
  onGenerate,
}: Props) {
  const activeScreen = screens.find((s) => s.id === activeScreenId) ?? screens[0] ?? null;
  const activeIndex = activeScreen ? screens.indexOf(activeScreen) : -1;

  function goPrev() {
    if (activeIndex > 0) {
      onSetActiveScreen(screens[activeIndex - 1]!.id);
    }
  }

  function goNext() {
    if (activeIndex < screens.length - 1) {
      onSetActiveScreen(screens[activeIndex + 1]!.id);
    }
  }

  return (
    <div className="wizard-step design-step">
      <div className="wizard-step-header">
        <h2 className="wizard-step-title">Design each screen</h2>
        <p className="wizard-step-hint">
          Navigate between screens and let the AI design the UI components for each one.
        </p>
      </div>

      <div className="wizard-step-body">
        {screens.length === 0 ? (
          <div className="design-empty">
            <p>No screens defined yet. Go back to the Screens step to add screens first.</p>
          </div>
        ) : (
          <>
            {/* Screen navigator */}
            <nav className="design-nav" aria-label="Screen navigation">
              <button
                type="button"
                className="design-nav-btn"
                onClick={goPrev}
                disabled={activeIndex <= 0}
                aria-label="Previous screen"
              >
                &#8592;
              </button>
              <div className="design-nav-pills">
                {screens.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`design-nav-pill${s.id === activeScreen?.id ? ' active' : ''}`}
                    onClick={() => onSetActiveScreen(s.id)}
                    aria-current={s.id === activeScreen?.id ? 'true' : undefined}
                    title={s.name}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="design-nav-btn"
                onClick={goNext}
                disabled={activeIndex >= screens.length - 1}
                aria-label="Next screen"
              >
                &#8594;
              </button>
            </nav>

            {activeScreen && (
              <div className="design-screen-panel">
                <div className="design-screen-header">
                  <div className="design-screen-meta">
                    <h3 className="design-screen-name">{activeScreen.name}</h3>
                    <span className="design-screen-kind">{activeScreen.kind}</span>
                  </div>
                  <button
                    type="button"
                    className="primary wizard-generate-btn"
                    onClick={onGenerate}
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <span className="wizard-spinner" aria-hidden /> Designing screen...
                      </>
                    ) : (
                      'Design This Screen'
                    )}
                  </button>
                </div>

                {error && (
                  <div className="wizard-error" role="alert">
                    <span>{error}</span>
                    <button type="button" className="wizard-error-retry" onClick={onGenerate}>
                      Retry
                    </button>
                  </div>
                )}

                {/* Mockup preview */}
                {activeScreen.mockupHtml ? (
                  <div className="design-mockup-container">
                    <div className="wizard-label">Generated mockup</div>
                    <iframe
                      className="design-mockup-frame"
                      srcDoc={activeScreen.mockupHtml}
                      title={`Mockup for ${activeScreen.name}`}
                      sandbox="allow-scripts"
                    />
                  </div>
                ) : (
                  <div className="design-mockup-empty">
                    <p>No mockup yet. Click "Design This Screen" to generate a UI design.</p>
                  </div>
                )}

                {/* Component list */}
                {activeScreen.components.length > 0 && (
                  <div className="design-components">
                    <div className="wizard-label">
                      Components ({activeScreen.components.length})
                    </div>
                    <ul className="design-component-list">
                      {activeScreen.components.map((c) => (
                        <li key={c.id} className="design-component-item">
                          <span className="design-component-kind">{c.kind}</span>
                          <span className="design-component-name">{c.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
