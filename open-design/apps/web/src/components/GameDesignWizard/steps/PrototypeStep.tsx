import { useState } from 'react';
import type { GameProject } from '@greybox/schema';
import { PrototypeRunnerView } from '@greybox/prototype-runner/react';
import type { GameType } from '../useWizardState';
import { UpgradeCTA } from '../UpgradeCTA';

type DeviceFrame = 'iphone' | 'ipad' | 'desktop';

const DEVICE_FRAMES: Array<{ id: DeviceFrame; label: string; width: number; height: number }> = [
  { id: 'iphone', label: 'iPhone', width: 390, height: 844 },
  { id: 'ipad', label: 'iPad', width: 768, height: 1024 },
  { id: 'desktop', label: 'Desktop', width: 1280, height: 720 },
];

interface Props {
  prototypeHtml: string | null;
  gameProject?: GameProject | null;
  generating: boolean;
  error: string | null;
  projectId?: string;
  gameType: GameType;
  upgradeRequired?: boolean;
  onGenerate: () => void;
}

export function PrototypeStep({
  prototypeHtml,
  gameProject,
  generating,
  error,
  projectId,
  gameType,
  upgradeRequired,
  onGenerate,
}: Props) {
  const defaultDevice: DeviceFrame =
    gameType === '3D' || gameType === '2D' ? 'desktop' : 'iphone';
  const [device, setDevice] = useState<DeviceFrame>(defaultDevice);
  const [copied, setCopied] = useState(false);

  const activeDevice = DEVICE_FRAMES.find((d) => d.id === device)!;

  async function handleSharePrototype() {
    try {
      const url = projectId
        ? `${window.location.origin}/?projectId=${encodeURIComponent(projectId)}&tab=prototype`
        : window.location.href;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard not available
    }
  }

  return (
    <div className="wizard-step prototype-step">
      <div className="wizard-step-header">
        <h2 className="wizard-step-title">Play your prototype</h2>
        <p className="wizard-step-hint">
          Generate a playable HTML prototype of your game. Preview it across device sizes.
        </p>
      </div>

      <div className="wizard-step-body">
        {/* Controls */}
        <div className="prototype-controls">
          <div className="prototype-device-picker">
            {DEVICE_FRAMES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`wizard-chip${device === d.id ? ' selected' : ''}`}
                onClick={() => setDevice(d.id)}
                aria-pressed={device === d.id}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="prototype-actions">
            {upgradeRequired ? (
              <UpgradeCTA requiredTier="indie" featureName="Prototype Generation" />
            ) : (
              <button
                type="button"
                className="primary wizard-generate-btn"
                onClick={onGenerate}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <span className="wizard-spinner" aria-hidden /> Generating prototype...
                  </>
                ) : gameProject ?? prototypeHtml ? (
                  'Regenerate Prototype'
                ) : (
                  'Generate Playable Prototype'
                )}
              </button>
            )}

            {(gameProject ?? prototypeHtml) && !upgradeRequired && (
              <button
                type="button"
                className="wizard-btn-secondary"
                onClick={() => void handleSharePrototype()}
              >
                {copied ? 'Copied!' : 'Share Prototype'}
              </button>
            )}
          </div>
        </div>

        {error && !upgradeRequired && (
          <div className="wizard-error" role="alert">
            <span>{error}</span>
            <button type="button" className="wizard-error-retry" onClick={onGenerate}>
              Retry
            </button>
          </div>
        )}

        {/* Prototype viewport */}
        {generating && !prototypeHtml && (
          <div className="prototype-loading">
            <span className="wizard-spinner prototype-spinner" aria-hidden />
            <p>Generating your playable prototype... this may take a moment.</p>
          </div>
        )}

        {gameProject ? (
          <div className="prototype-frame-shell prototype-frame-shell--runner" data-device={device}>
            <div
              className="prototype-device-frame"
              style={{
                width: activeDevice.width,
                height: activeDevice.height,
                maxWidth: '100%',
              }}
            >
              <PrototypeRunnerView
                project={gameProject}
                assetBaseUrl={projectId ? `/api/projects/${encodeURIComponent(projectId)}/assets` : undefined}
                showControls
                style={{ width: activeDevice.width, height: activeDevice.height }}
              />
            </div>
            <p className="prototype-frame-hint">
              {activeDevice.width} × {activeDevice.height}
            </p>
          </div>
        ) : prototypeHtml ? (
          <div className="prototype-frame-shell" data-device={device}>
            <div
              className="prototype-device-frame"
              style={{
                width: activeDevice.width,
                height: activeDevice.height,
                maxWidth: '100%',
              }}
            >
              <iframe
                className="prototype-iframe"
                srcDoc={prototypeHtml}
                title="Playable prototype"
                sandbox="allow-scripts"
                style={{ width: activeDevice.width, height: activeDevice.height }}
              />
            </div>
            <p className="prototype-frame-hint">
              {activeDevice.width} × {activeDevice.height}
            </p>
          </div>
        ) : !generating ? (
          <div className="prototype-empty">
            <p>
              No prototype yet. Click "Generate Playable Prototype" to create a playable
              HTML game based on your concept, screens, and characters.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
