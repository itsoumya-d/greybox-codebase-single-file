// SPDX-License-Identifier: Apache-2.0

import type { ProjectProModulesResponse } from '../types';

interface ProjectProModulesStatusProps {
  response: ProjectProModulesResponse | null;
  onActivate?: () => void;
}

function moduleNames(response: ProjectProModulesResponse, status: 'licensed' | 'license-required'): string {
  return response.modules
    .filter((module) => module.status === status)
    .map((module) => module.manifest.name || module.manifest.id)
    .join(', ');
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function engineTargetNames(response: ProjectProModulesResponse): string {
  return response.registries.engineTargets
    .map((target) => target.title || `${target.moduleName}: ${target.id}`)
    .join(', ');
}

export function ProjectProModulesStatus({ response, onActivate }: ProjectProModulesStatusProps) {
  const licensedCount = response?.modules.filter((module) => module.status === 'licensed').length ?? 0;
  const licenseRequiredCount = response?.modules.filter((module) => module.status === 'license-required').length ?? 0;
  const rejectedCount = response?.rejected.length ?? 0;
  const engineTargetCount = response?.registries.engineTargets.length ?? 0;
  const licenseRequiredNames = response ? moduleNames(response, 'license-required') : '';
  if (!response) return null;
  if (licensedCount + licenseRequiredCount + rejectedCount + engineTargetCount === 0) return null;

  return (
    <div
      className="project-pro-modules-status"
      data-testid="project-pro-modules-status"
      aria-label="Project Pro modules"
    >
      <span className="project-pro-modules-label">Pro</span>
      {licensedCount > 0 ? (
        <span
          className="project-pro-modules-chip licensed"
          title={moduleNames(response, 'licensed')}
        >
          {countLabel(licensedCount, 'licensed', 'licensed')}
        </span>
      ) : null}
      {licenseRequiredCount > 0 ? (
        <span
          className="project-pro-modules-chip license-required"
          title={moduleNames(response, 'license-required')}
        >
          {`${licenseRequiredCount} ${licenseRequiredCount === 1 ? 'needs' : 'need'} license`}
        </span>
      ) : null}
      {licenseRequiredCount > 0 && onActivate ? (
        <button
          type="button"
          className="project-pro-modules-chip license-action"
          title={licenseRequiredNames ? `Activate ${licenseRequiredNames}` : 'Activate Pro modules'}
          aria-label="Activate Pro module licenses"
          onClick={onActivate}
        >
          Activate
        </button>
      ) : null}
      {engineTargetCount > 0 ? (
        <span
          className="project-pro-modules-chip engine-targets"
          title={engineTargetNames(response)}
        >
          {countLabel(engineTargetCount, 'engine target', 'engine targets')}
        </span>
      ) : null}
      {rejectedCount > 0 ? (
        <span
          className="project-pro-modules-chip blocked"
          title={response?.rejected.map((rejection) => `${rejection.fileName}: ${rejection.code}`).join(', ')}
        >
          {countLabel(rejectedCount, 'blocked', 'blocked')}
        </span>
      ) : null}
    </div>
  );
}
