// "Finalize game package" toolbar action — #451. Triggers the
// daemon's POST /api/game-deliverables/:id/finalize/anthropic, which
// synchronously synthesizes DESIGN.md from the project transcript +
// active game art bible + current artifact (route owned by PR #832,
// merged 2026-05-08 by lefarcen).
//
// Renders three label states based on whether DESIGN.md exists and
// whether it's stale; clicks during a pending request show a spinner
// + cancel link instead. Error toasts are rendered by ProjectView
// (the toolbar wires them through useFinalizeGamePackage's `error`
// surface), so this button module intentionally has no toast of its own.

import type { GameDesignDocState } from '../hooks/useGameDesignDocState';
import type { FinalizeStatus } from '../hooks/useFinalizeGamePackage';
import { useT } from '../i18n';

export interface FinalizeGamePackageButtonProps {
  gameDesignDocState: Pick<GameDesignDocState, 'exists' | 'isStale'>;
  status: FinalizeStatus;
  onFinalize: () => void;
  onCancel: () => void;
}

export function FinalizeGamePackageButton({
  gameDesignDocState,
  status,
  onFinalize,
  onCancel,
}: FinalizeGamePackageButtonProps) {
  const t = useT();

  if (status === 'pending') {
    return (
      <div className="project-actions-button project-actions-button-pending" role="group">
        <span className="project-actions-spinner" aria-hidden="true" />
        <span className="project-actions-label">{t('projectActions.finalizing')}</span>
        <button
          type="button"
          className="project-actions-link"
          onClick={onCancel}
          aria-label={t('projectActions.cancelFinalize')}
        >
          {t('common.cancel')}
        </button>
      </div>
    );
  }

  let label: string;
  let variantClass: string;
  if (!gameDesignDocState.exists) {
    label = t('projectActions.finalizePackage');
    variantClass = 'project-actions-button-primary';
  } else if (gameDesignDocState.isStale) {
    label = t('projectActions.refinalizeStale');
    variantClass = 'project-actions-button-warning';
  } else {
    label = t('projectActions.refinalize');
    variantClass = 'project-actions-button-secondary';
  }

  return (
    <button
      type="button"
      className={`project-actions-button ${variantClass}`}
      onClick={onFinalize}
    >
      {label}
    </button>
  );
}
