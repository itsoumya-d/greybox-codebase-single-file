import type { ReactNode } from 'react';

import { useT } from '../i18n';
import type { Dict } from '../i18n/types';

export type StudioMode =
  | 'gameplay'
  | 'level'
  | 'narrative'
  | 'world-map'
  | 'logic-graph'
  | 'production';

export const STUDIO_MODES: Array<{
  id: StudioMode;
  labelKey: keyof Dict;
  descriptionKey: keyof Dict;
}> = [
  {
    id: 'gameplay',
    labelKey: 'studioMode.gameplay',
    descriptionKey: 'studioMode.gameplayDescription',
  },
  {
    id: 'level',
    labelKey: 'studioMode.level',
    descriptionKey: 'studioMode.levelDescription',
  },
  {
    id: 'narrative',
    labelKey: 'studioMode.narrative',
    descriptionKey: 'studioMode.narrativeDescription',
  },
  {
    id: 'world-map',
    labelKey: 'studioMode.worldMap',
    descriptionKey: 'studioMode.worldMapDescription',
  },
  {
    id: 'logic-graph',
    labelKey: 'studioMode.logicGraph',
    descriptionKey: 'studioMode.logicGraphDescription',
  },
  {
    id: 'production',
    labelKey: 'studioMode.production',
    descriptionKey: 'studioMode.productionDescription',
  },
];

interface StudioModeStripProps {
  value: StudioMode;
  onChange: (mode: StudioMode) => void;
  presence?: ReactNode;
}

export function StudioModeStrip({ value, onChange, presence }: StudioModeStripProps) {
  const t = useT();
  const active = STUDIO_MODES.find((mode) => mode.id === value) ?? STUDIO_MODES[0]!;
  return (
    <div
      className={`studio-mode-strip${presence ? ' has-presence' : ''}`}
      data-testid="studio-mode-strip"
    >
      <div className="studio-mode-meta">
        <span className="studio-mode-eyebrow">{t('studioMode.eyebrow')}</span>
        <strong>{t(active.labelKey)}</strong>
        <span>{t(active.descriptionKey)}</span>
      </div>
      <div className="studio-mode-tabs" role="tablist" aria-label={t('studioMode.aria')}>
        {STUDIO_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={value === mode.id}
            className={value === mode.id ? 'active' : ''}
            onClick={() => onChange(mode.id)}
          >
            {t(mode.labelKey)}
          </button>
        ))}
      </div>
      {presence ? <div className="studio-presence-slot">{presence}</div> : null}
    </div>
  );
}
