// "Continue in CLI" toolbar action — #451. Three states:
//
//   - DESIGN.md missing → disabled with a tooltip pointing at the
//     Finalize action so the creator learns the workflow rather than
//     having the prerequisite hidden.
//   - DESIGN.md present + fresh → enabled, plain label.
//   - DESIGN.md present + stale → enabled with a warning chip; the
//     chip text is canonical per spec §4.6 ("Spec is stale —
//     regenerate?"). A "regenerate?" affordance can land in a
//     follow-up; v1 keeps the chip text-only so the creator can still
//     proceed with Continue in CLI from a stale spec if they
//     intentionally want the captured intent.
//
// The actual click handler lives in ProjectView (it owns the
// resolvedDir + clipboard + terminal-launch + toast wiring) and is
// passed in as `onClick`. Disabled state short-circuits in the
// button module itself.

import type { GameDesignDocState, GameDesignDocStaleReason } from '../hooks/useGameDesignDocState';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';

// Round 7 (mrcfps @ useGameDesignDocState.ts:160): malformed provenance
// timestamps used to silently report fresh; they now surface as a
// distinct chip so the creator knows the freshness signal is degraded
// rather than green.
function chipTextForReason(
  reason: GameDesignDocStaleReason,
  t: (key: keyof Dict) => string,
): string {
  return reason === 'unknown-provenance'
    ? t('projectActions.specFreshnessUnknown')
    : t('projectActions.specStale');
}

export interface ContinueInCliButtonProps {
  gameDesignDocState: Pick<GameDesignDocState, 'exists' | 'isStale' | 'staleReason'>;
  onClick: () => void | Promise<void>;
}

export function ContinueInCliButton({ gameDesignDocState, onClick }: ContinueInCliButtonProps) {
  const t = useT();

  if (!gameDesignDocState.exists) {
    // Native `<button disabled>` does not fire hover or focus events
    // in the browsers we ship against, so a `title` tooltip on the
    // disabled button never surfaces — that hides the prerequisite
    // guidance that the spec explicitly wanted discoverable. Render
    // the help text as a visible sibling instead, plus an
    // aria-describedby link so assistive tech announces the same
    // explanation when the disabled button gets focused.
    return (
      <span className="project-actions-button-group">
        <button
          type="button"
          className="project-actions-button project-actions-button-secondary"
          disabled
          aria-describedby="continue-in-cli-disabled-hint"
        >
          {t('projectActions.continueInCli')}
        </button>
        <span
          id="continue-in-cli-disabled-hint"
          className="project-actions-disabled-hint"
          role="note"
        >
          {t('projectActions.finalizeFirst')}
        </span>
      </span>
    );
  }

  return (
    <span className="project-actions-button-group">
      <button
        type="button"
        className="project-actions-button project-actions-button-secondary"
        onClick={() => {
          void onClick();
        }}
      >
        {t('projectActions.continueInCli')}
      </button>
      {gameDesignDocState.isStale ? (
        <span className="project-actions-chip" role="note" aria-label={t('projectActions.specStalenessAria')}>
          {chipTextForReason(gameDesignDocState.staleReason, t)}
        </span>
      ) : null}
    </span>
  );
}
