'use client';
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'greybox_cloud_api_key';

export function getCloudApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setApiKey(localStorage.getItem(STORAGE_KEY) ?? '');
  }, []);

  function handleSave() {
    if (apiKey.trim()) {
      localStorage.setItem(STORAGE_KEY, apiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="settings-panel-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          <h3 className="settings-panel-title">Cloud Settings</h3>
          <button type="button" className="ghost settings-panel-close" onClick={onClose} aria-label="Close settings">×</button>
        </div>
        <div className="settings-panel-body">
          <label className="wizard-label">
            Greybox Cloud API Key
            <input
              className="wizard-input"
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
              placeholder="gbx_live_..."
              autoComplete="off"
            />
          </label>
          <p className="settings-panel-hint">
            Get your API key from{' '}
            <span className="settings-link">greybox.studio/dashboard</span>.
            Leave blank to use local dev mode.
          </p>
          <button
            type="button"
            className="primary"
            onClick={handleSave}
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
