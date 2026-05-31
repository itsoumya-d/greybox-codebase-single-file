// SPDX-License-Identifier: Apache-2.0

import { useId } from 'react';

export type EnginePackageExportEngine = 'unity' | 'unreal' | 'godot';

export type EnginePackageExportStatus = EnginePackageExportEngine | null;

export type EnginePackageExportPreflight =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      fileCount: number;
      packageFileName: string;
      sizeBytes: number;
    }
  | { status: 'error'; message: string };

const ENGINE_PACKAGE_EXPORT_TARGETS: Array<{
  value: EnginePackageExportEngine;
  label: string;
}> = [
  { value: 'unity', label: 'Unity' },
  { value: 'unreal', label: 'Unreal' },
  { value: 'godot', label: 'Godot' },
];

export function enginePackageExportLabel(engine: EnginePackageExportEngine): string {
  return (
    ENGINE_PACKAGE_EXPORT_TARGETS.find((target) => target.value === engine)?.label ?? engine
  );
}

interface EnginePackageExportButtonProps {
  selectedEngine: EnginePackageExportEngine;
  status: EnginePackageExportStatus;
  disabledReason?: string | null;
  preflight?: EnginePackageExportPreflight;
  onSelectedEngineChange: (engine: EnginePackageExportEngine) => void;
  onExport: (engine: EnginePackageExportEngine) => void | Promise<void>;
}

export function EnginePackageExportButton({
  selectedEngine,
  status,
  disabledReason,
  preflight = { status: 'idle' },
  onSelectedEngineChange,
  onExport,
}: EnginePackageExportButtonProps) {
  const selectId = useId();
  const busy = status !== null;
  const awaitingPreflight = preflight.status === 'loading';
  const preflightBlocked = preflight.status === 'error';
  const disabled = busy || Boolean(disabledReason) || awaitingPreflight || preflightBlocked;
  const selectedLabel = enginePackageExportLabel(selectedEngine);
  const pendingLabel = status ? enginePackageExportLabel(status) : null;
  const meta = disabledReason
    || preflightMeta(preflight);

  return (
    <div
      className="engine-package-export"
      role="group"
      aria-label="Engine package export"
      aria-busy={busy ? true : undefined}
    >
      <label className="engine-package-export-label" htmlFor={selectId}>
        Engine
      </label>
      <select
        id={selectId}
        className="project-actions-select"
        aria-label="Engine package target"
        value={selectedEngine}
        disabled={busy}
        title={disabledReason || undefined}
        onChange={(event) => {
          onSelectedEngineChange(
            event.currentTarget.value as EnginePackageExportEngine,
          );
        }}
      >
        {ENGINE_PACKAGE_EXPORT_TARGETS.map((target) => (
          <option key={target.value} value={target.value}>
            {target.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="project-actions-button project-actions-button-secondary"
        disabled={disabled}
        title={disabledReason || undefined}
        aria-label={
          pendingLabel
            ? `Exporting ${pendingLabel} engine package`
            : `Export ${selectedLabel} engine package`
        }
        onClick={() => {
          void onExport(selectedEngine);
        }}
      >
        {pendingLabel
          ? `Exporting ${pendingLabel}...`
          : awaitingPreflight
            ? 'Checking...'
            : 'Export'}
      </button>
      {meta && !busy ? (
        <span
          className={[
            preflight.status === 'ready'
              ? 'engine-package-export-meta'
              : 'project-actions-disabled-hint',
          ].join(' ')}
          title={preflight.status === 'error' ? preflight.message : undefined}
        >
          {meta}
        </span>
      ) : null}
    </div>
  );
}

function preflightMeta(preflight: EnginePackageExportPreflight): string | null {
  if (preflight.status === 'loading') return 'Checking...';
  if (preflight.status === 'error') return 'Package unavailable';
  if (preflight.status !== 'ready') return null;
  return `${preflight.fileCount} files - ${formatBytes(preflight.sizeBytes)}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(kib >= 10 ? 0 : 1)} KB`;
  const mib = kib / 1024;
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MB`;
}
