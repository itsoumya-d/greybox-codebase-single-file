import { useState } from 'react';
import { UpgradeCTA } from '../UpgradeCTA';
import { downloadGDDMarkdown } from '../export-gdd';
import type { WizardState } from '../useWizardState';

type ExportEngine = 'unity' | 'godot' | 'unreal' | 'webgl';

const ENGINES: Array<{
  id: ExportEngine;
  label: string;
  description: string;
  instructions: string[];
  comingSoon?: boolean;
  waitlistEmail?: string;
}> = [
  {
    id: 'unity',
    label: 'Unity',
    description: 'Import into Unity 2022+ with the Greybox Unity Plugin.',
    instructions: [
      'Open Unity (2022.3 LTS or newer)',
      'Go to Window → Package Manager → Add package from disk',
      'Select the greybox-plugin.unitypackage from the downloaded ZIP',
      'Open the Greybox panel: Window → Greybox Studio',
      'Click "Import Project" and select the extracted folder',
    ],
  },
  {
    id: 'webgl',
    label: 'WebGL',
    description: 'Deploy as a standalone HTML5 game in any browser.',
    instructions: [
      'Extract the downloaded ZIP file',
      'Serve the index.html file from any static web host',
      'For local testing: run a simple HTTP server in the extracted folder',
      'Optionally deploy to itch.io, Netlify, or Vercel for public access',
    ],
  },
  {
    id: 'godot',
    label: 'Godot 4',
    description: 'Export your full game design as scenes and assets for Godot 4.2+.',
    instructions: [
      'Install the Greybox Studio plugin from the Godot Asset Library or copy the addons/ folder into your project',
      'Enable the plugin under Project → Project Settings → Plugins',
      'Open the Greybox Studio panel and import the downloaded ZIP',
      'Scenes, characters, and level boards are imported as .tscn resources',
    ],
  },
  {
    id: 'unreal',
    label: 'Unreal Engine 5',
    description: 'Export your full game design as actors, scenes, and assets for UE 5.3+.',
    instructions: [
      'Install the Greybox Studio plugin from the Fab Marketplace or copy the plugin folder into your project\'s Plugins/ directory',
      'Enable the plugin under Edit → Plugins → Greybox Studio',
      'Open the Greybox Studio panel and import the downloaded ZIP',
      'Actors, levels, HUDs, and characters are imported as UASSET resources',
    ],
  },
];

interface ExportSummary {
  fileCount: number;
  assetList: string[];
  sizeBytes: number;
}

interface Props {
  projectId?: string;
  exportEngine: ExportEngine | null;
  exporting: boolean;
  error: string | null;
  subscriptionTier: 'free' | 'indie' | 'studio' | 'enterprise' | null;
  gddState?: WizardState;
  onSetEngine: (engine: ExportEngine) => void;
  onExport: () => void;
  onExportDone?: () => void;
  onBackToDashboard: () => void;
}

function isEngineAvailable(engine: ExportEngine, tier: Props['subscriptionTier']): boolean {
  if (engine === 'webgl') return true;
  if (engine === 'unity') return tier === 'indie' || tier === 'studio' || tier === 'enterprise';
  // godot, unreal
  return tier === 'studio' || tier === 'enterprise';
}

export function ExportStep({
  projectId,
  exportEngine,
  exporting,
  error,
  subscriptionTier,
  gddState,
  onSetEngine,
  onExport,
  onExportDone,
  onBackToDashboard,
}: Props) {
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const selectedEngine = ENGINES.find((e) => e.id === exportEngine) ?? ENGINES[0]!;

  async function handleExport() {
    if (!projectId || !exportEngine) return;
    setExportError(null);
    onExport();

    try {
      let blob: Blob;
      let fileName: string;

      if (exportEngine === 'unity') {
        const resp = await fetch(
          `/api/game-deliverables/${encodeURIComponent(projectId)}/unity-package`,
        );
        if (!resp.ok) {
          setExportError('Export failed. Please try again.');
          return;
        }
        const contentDisposition = resp.headers.get('content-disposition') ?? '';
        const m = contentDisposition.match(/filename="?([^"]+)"?/);
        fileName = m?.[1] ?? 'greybox-unity.unitypackage';
        blob = await resp.blob();
      } else if (exportEngine === 'webgl') {
        const resp = await fetch(
          `/api/game-deliverables/${encodeURIComponent(projectId)}/gameview-runtime`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ engine: 'webgl' }),
          },
        );
        if (!resp.ok) {
          setExportError('Export failed. Please try again.');
          return;
        }
        const data = (await resp.json()) as { html: string; fileName?: string };
        fileName = data.fileName ?? 'game.html';
        blob = new Blob([data.html], { type: 'text/html' });
      } else {
        // unreal, godot, native-package
        const resp = await fetch(
          `/api/game-deliverables/${encodeURIComponent(projectId)}/engine-package/${encodeURIComponent(exportEngine)}`,
        );
        if (!resp.ok) {
          setExportError('Export failed. Please try again.');
          return;
        }
        const contentDisposition = resp.headers.get('content-disposition') ?? '';
        const m = contentDisposition.match(/filename="?([^"]+)"?/);
        fileName = m?.[1] ?? `${exportEngine}-package.zip`;
        blob = await resp.blob();
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportSummary({
        fileCount: 1,
        assetList: [fileName],
        sizeBytes: blob.size,
      });
    } catch {
      setExportError('Export failed. Please try again.');
    } finally {
      onExportDone?.();
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="wizard-step export-step">
      <div className="wizard-step-header">
        <h2 className="wizard-step-title">Export to engine</h2>
        <p className="wizard-step-hint">
          Download your game project package for your preferred engine.
        </p>
      </div>

      <div className="wizard-step-body">
        {/* GDD Export — always free */}
        <section className="wizard-section gdd-export-section">
          <div className="wizard-label">Export design document</div>
          <p className="wizard-hint">
            Download a full Game Design Document (GDD) with all your concept, screens, characters, and world data. Always free.
          </p>
          <div className="gdd-export-actions">
            <button
              type="button"
              className="wizard-btn-secondary"
              disabled={!gddState}
              onClick={() => gddState && downloadGDDMarkdown(gddState)}
            >
              Download GDD (Markdown)
            </button>
            <button
              type="button"
              className="wizard-btn-secondary"
              onClick={() => window.print()}
            >
              Print / Save as PDF
            </button>
          </div>
        </section>

        {/* Engine selector */}
        <section className="wizard-section">
          <div className="wizard-label">Target engine</div>
          <div className="export-engine-grid">
            {ENGINES.map((engine) => (
              <button
                key={engine.id}
                type="button"
                className={`export-engine-card${exportEngine === engine.id ? ' selected' : ''}${engine.comingSoon ? ' coming-soon' : ''}`}
                onClick={() => !engine.comingSoon && onSetEngine(engine.id)}
                aria-pressed={!engine.comingSoon && exportEngine === engine.id}
                disabled={exporting || engine.comingSoon}
              >
                <span className="export-engine-label">
                  {engine.label}
                  {engine.comingSoon && <span className="export-engine-badge">Coming Soon</span>}
                </span>
                <span className="export-engine-desc">{engine.description}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Instructions */}
        <section className="wizard-section">
          <div className="wizard-label">
            {selectedEngine.comingSoon ? `About ${selectedEngine.label} export` : `Setup guide — ${selectedEngine.label}`}
          </div>
          <ol className="export-instructions">
            {selectedEngine.instructions.map((step, i) => (
              <li key={i} className="export-instruction-item">
                {step}
              </li>
            ))}
          </ol>
        </section>

        {/* Coming Soon - What's next */}
        <section className="wizard-section whats-coming-section">
          <div className="wizard-label">What's coming</div>
          <ul className="whats-coming-list">
            <li>Unreal Engine 5.3+ — export as actors, scenes, and asset packs</li>
            <li>Godot 4.2+ — export as scenes and resources</li>
            <li>Full character, world, and prototype data wired directly into your engine project</li>
          </ul>
        </section>

        {error && (
          <div className="wizard-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {exportError && (
          <div className="wizard-error" role="alert">
            <span>{exportError}</span>
            <button type="button" className="wizard-error-retry" onClick={() => void handleExport()}>
              Retry
            </button>
          </div>
        )}

        {/* Export summary */}
        {exportSummary && (
          <div className="export-summary">
            <div className="wizard-label">Export complete</div>
            <ul className="export-summary-list">
              <li>Files: {exportSummary.fileCount}</li>
              <li>Size: {formatBytes(exportSummary.sizeBytes)}</li>
              {exportSummary.assetList.map((a) => (
                <li key={a} className="export-summary-asset">{a}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="wizard-actions export-actions">
          {selectedEngine.comingSoon ? (
            <a
              className="wizard-btn-secondary export-waitlist-btn"
              href={`mailto:${selectedEngine.waitlistEmail}?subject=${encodeURIComponent(`${selectedEngine.label} Plugin Waitlist`)}&body=${encodeURIComponent(`Hi,\n\nI'd like to join the waitlist for the Greybox ${selectedEngine.label} plugin.\n`)}`}
              onClick={() => {
                try {
                  const telemetryUrl = `/api/telemetry`;
                  void fetch(telemetryUrl, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ event: 'waitlist_join', engine: selectedEngine.id }),
                  }).catch(() => {});
                } catch { /* telemetry is best-effort */ }
              }}
            >
              Join Waitlist — {selectedEngine.label}
            </a>
          ) : !isEngineAvailable(selectedEngine.id, subscriptionTier) ? (
            <UpgradeCTA
              requiredTier={selectedEngine.id === 'unity' ? 'indie' : 'studio'}
              featureName={`${selectedEngine.label} Engine Export`}
            />
          ) : (
            <button
              type="button"
              className="primary wizard-generate-btn"
              onClick={() => void handleExport()}
              disabled={exporting || !projectId}
              title={!projectId ? 'Create a project first (go back to Concept step)' : undefined}
            >
              {exporting ? (
                <>
                  <span className="wizard-spinner" aria-hidden /> Exporting...
                </>
              ) : (
                `Download ${selectedEngine.label} Package`
              )}
            </button>
          )}

          <button
            type="button"
            className="wizard-btn-secondary"
            onClick={onBackToDashboard}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
