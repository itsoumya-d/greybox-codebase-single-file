import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';

interface Props {
  actions?: ReactNode;
  children?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}

export const STUDIO_CHROME_FILE_ACTIONS_ID = 'studio-chrome-file-actions';

export function StudioChromeHeader({ actions, children, onBack, backLabel }: Props) {
  const t = useT();
  const resolvedBackLabel = backLabel ?? t('project.backToProjects');

  return (
    <header className="studio-chrome-header">
      <div className="studio-chrome-traffic-space" aria-hidden />
      <div className="studio-chrome-identity" aria-label={t('studio.identityName')}>
        <span className="studio-chrome-mark" aria-hidden>
          <img src="/studio-icon.svg" alt="" className="studio-mark-img" draggable={false} />
        </span>
        <span className="studio-chrome-name">{t('studio.identityName')}</span>
      </div>
      {onBack ? (
        <button
          type="button"
          className="studio-chrome-back"
          onClick={onBack}
          title={resolvedBackLabel}
          aria-label={resolvedBackLabel}
        >
          <Icon name="arrow-left" size={15} />
        </button>
      ) : null}
      {children ? <div className="studio-chrome-content">{children}</div> : null}
      <div className="studio-chrome-drag" aria-hidden />
      <div id={STUDIO_CHROME_FILE_ACTIONS_ID} className="studio-chrome-file-actions" />
      {actions ? <div className="studio-chrome-actions">{actions}</div> : null}
    </header>
  );
}

export function SettingsIconButton({
  onClick,
  title,
  ariaLabel,
}: {
  onClick: () => void;
  title: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className="settings-icon-btn"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      <Icon name="settings" size={17} />
    </button>
  );
}
