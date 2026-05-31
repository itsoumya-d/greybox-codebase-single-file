// Project-level action bar mounted between the StudioChromeHeader and
// the chat-and-workspace split (#451). Hosts the new project-scoped
// actions ("Finalize game package", "Continue in CLI"); per-file
// actions (Export PDF/PPTX/ZIP, Deploy) stay in the FileViewer share
// menu where they already live.
//
// The bar is intentionally thin: presentation, layout, and a couple
// of conditional flags. Behavior lives in ProjectView (handlers,
// hooks) and the per-button modules.

import { ContinueInCliButton } from './ContinueInCliButton';
import {
  EnginePackageExportButton,
  type EnginePackageExportEngine,
  type EnginePackageExportPreflight,
  type EnginePackageExportStatus,
} from './EnginePackageExportButton';
import { FinalizeGamePackageButton } from './FinalizeGamePackageButton';
import { ProjectProModulesStatus } from './ProjectProModulesStatus';
import type { GameDesignDocState } from '../hooks/useGameDesignDocState';
import type { FinalizeStatus } from '../hooks/useFinalizeGamePackage';
import { useT } from '../i18n';
import type { ProjectProModulesResponse } from '../types';

export interface ProjectActionsToolbarProps {
  gameDesignDocState: Pick<GameDesignDocState, 'exists' | 'isStale' | 'staleReason'>;
  finalizeStatus: FinalizeStatus;
  onFinalize: () => void;
  onCancelFinalize: () => void;
  onContinueInCli: () => void | Promise<void>;
  enginePackageExportEngine: EnginePackageExportEngine;
  enginePackageExportStatus: EnginePackageExportStatus;
  enginePackageExportDisabledReason?: string | null;
  enginePackageExportPreflight?: EnginePackageExportPreflight;
  onEnginePackageExportEngineChange: (engine: EnginePackageExportEngine) => void;
  onExportEnginePackage: (engine: EnginePackageExportEngine) => void | Promise<void>;
  proModules: ProjectProModulesResponse | null;
  onActivateProModules?: () => void;
  hidden?: boolean;
}

export function ProjectActionsToolbar({
  gameDesignDocState,
  finalizeStatus,
  onFinalize,
  onCancelFinalize,
  onContinueInCli,
  enginePackageExportEngine,
  enginePackageExportStatus,
  enginePackageExportDisabledReason,
  enginePackageExportPreflight,
  onEnginePackageExportEngineChange,
  onExportEnginePackage,
  proModules,
  onActivateProModules,
  hidden,
}: ProjectActionsToolbarProps) {
  const t = useT();

  if (hidden) return null;
  return (
    <div
      className="project-actions-toolbar"
      role="toolbar"
      aria-label={t('projectActions.toolbarAria')}
    >
      <FinalizeGamePackageButton
        gameDesignDocState={gameDesignDocState}
        status={finalizeStatus}
        onFinalize={onFinalize}
        onCancel={onCancelFinalize}
      />
      <ContinueInCliButton gameDesignDocState={gameDesignDocState} onClick={onContinueInCli} />
      <EnginePackageExportButton
        selectedEngine={enginePackageExportEngine}
        status={enginePackageExportStatus}
        disabledReason={enginePackageExportDisabledReason}
        preflight={enginePackageExportPreflight}
        onSelectedEngineChange={onEnginePackageExportEngineChange}
        onExport={onExportEnginePackage}
      />
      <ProjectProModulesStatus response={proModules} onActivate={onActivateProModules} />
    </div>
  );
}
