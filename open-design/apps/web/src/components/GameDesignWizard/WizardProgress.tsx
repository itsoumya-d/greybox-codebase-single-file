import { WIZARD_STEPS, WIZARD_STEP_LABELS, type WizardStep } from './useWizardState';

interface Props {
  currentStep: WizardStep;
  onGoToStep?: (step: WizardStep) => void;
  completedSteps?: Set<WizardStep>;
}

export function WizardProgress({ currentStep, onGoToStep, completedSteps = new Set() }: Props) {
  const currentIndex = WIZARD_STEPS.indexOf(currentStep);

  return (
    <nav className="wizard-progress" aria-label="Wizard steps">
      <ol className="wizard-progress-list">
        {WIZARD_STEPS.map((step, i) => {
          const isActive = step === currentStep;
          const isDone = completedSteps.has(step) || i < currentIndex;
          const isClickable = isDone && onGoToStep;

          return (
            <li
              key={step}
              className={[
                'wizard-progress-item',
                isActive ? 'active' : '',
                isDone ? 'done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {isClickable ? (
                <button
                  type="button"
                  className="wizard-progress-btn"
                  onClick={() => onGoToStep(step)}
                  aria-current={isActive ? 'step' : undefined}
                  title={`Go to ${WIZARD_STEP_LABELS[step]}`}
                >
                  <span className="wizard-progress-dot" aria-hidden>
                    {isDone ? <CheckIcon /> : i + 1}
                  </span>
                  <span className="wizard-progress-label">{WIZARD_STEP_LABELS[step]}</span>
                </button>
              ) : isActive ? (
                <button
                  type="button"
                  className="wizard-progress-btn"
                  aria-current="step"
                  aria-disabled
                >
                  <span className="wizard-progress-dot" aria-hidden>
                    {isDone ? <CheckIcon /> : i + 1}
                  </span>
                  <span className="wizard-progress-label">{WIZARD_STEP_LABELS[step]}</span>
                </button>
              ) : (
                <span className="wizard-progress-btn">
                  <span className="wizard-progress-dot" aria-hidden>
                    {isDone ? <CheckIcon /> : i + 1}
                  </span>
                  <span className="wizard-progress-label">{WIZARD_STEP_LABELS[step]}</span>
                </span>
              )}
              {i < WIZARD_STEPS.length - 1 && (
                <span className="wizard-progress-line" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
      <path
        d="M1 4l3 3 5-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
